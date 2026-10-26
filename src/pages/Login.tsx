import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Download, Share, PlusSquare, MoreVertical, Smartphone, X, CheckCircle2 } from 'lucide-react';
import { entrar, useSessao } from '../lib/useSessao';
import { inicioDoPerfil } from '../lib/menu';
import { ErroApi } from '../lib/api';
import { entrarComBiometria, temBiometriaNoAparelho } from '../lib/webauthn';
import { ehAppNativo } from '../lib/nativo';
import type { Usuario } from '../lib/sessao';

// Paridade visual e funcional 1:1 com src/views/login.php do sistema cond.vps.seg.br:
// - Split layout em tela cheia (side-brand escuro com foto de edifícios + escudo Sectrum e 4 features à esquerda;
//   side-form branco de 460px à direita com "Bem-vindo de volta 👋");
// - Login por CPF ou E-mail (lembrado em localStorage 'sectrum_cpf'), mostrar/ocultar senha, WebAuthn (Face ID / Digital),
//   opção de instalação do PWA sempre visível no celular (Android com prompt nativo + iOS/Android com guia passo a passo) e rodapé com suporte via WhatsApp.
const LINK_SUPORTE =
  'https://api.whatsapp.com/send?phone=5598985983566&text=Ol%C3%A1%2C%20preciso%20de%20ajuda%20para%20acessar%20o%20aplicativo.';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    __deferredPwaPrompt?: BeforeInstallPromptEvent | null;
  }
}

function verificarAppInstalado(): boolean {
  if (typeof window === 'undefined') return false;
  if (ehAppNativo()) return true;
  const standaloneMedia = window.matchMedia?.('(display-mode: standalone)').matches;
  const standaloneIos = Boolean((window.navigator as { standalone?: boolean }).standalone);
  return Boolean(standaloneMedia || standaloneIos);
}

function verificarCelular(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent || '';
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua) ||
    window.innerWidth <= 900
  );
}

function verificarIos(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent || '';
  return (
    /iPhone|iPad|iPod/i.test(ua) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
  );
}

export default function Login() {
  const { usuario } = useSessao();
  const [login, setLogin] = useState(() => localStorage.getItem('sectrum_cpf') ?? '');
  const [senha, setSenha] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [focoCampo, setFocoCampo] = useState<'email' | 'senha' | null>(null);
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);
  const [bioDisponivel, setBioDisponivel] = useState(false);
  const [bioAguardando, setBioAguardando] = useState(false);
  const [pwaPrompt, setPwaPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => (typeof window !== 'undefined' ? window.__deferredPwaPrompt ?? null : null),
  );
  const [jaInstalado, setJaInstalado] = useState<boolean>(() => verificarAppInstalado());
  const [ehMobile, setEhMobile] = useState<boolean>(() => verificarCelular());
  const [ehIos] = useState<boolean>(() => verificarIos());
  const [bannerFechado, setBannerFechado] = useState(false);
  const [modalGuiaPwa, setModalGuiaPwa] = useState(false);
  const navigate = useNavigate();
  const local = useLocation();

  useEffect(() => {
    temBiometriaNoAparelho().then(setBioDisponivel);

    const sincronizarPrompt = () => {
      if (window.__deferredPwaPrompt) {
        setPwaPrompt(window.__deferredPwaPrompt);
      }
    };

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      const ev = e as BeforeInstallPromptEvent;
      window.__deferredPwaPrompt = ev;
      setPwaPrompt(ev);
    };

    const onInstalled = () => {
      window.__deferredPwaPrompt = null;
      setPwaPrompt(null);
      setJaInstalado(true);
      setModalGuiaPwa(false);
    };

    const onResize = () => {
      setEhMobile(verificarCelular());
      setJaInstalado(verificarAppInstalado());
    };

    sincronizarPrompt();
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('sectrum:pwa-prompt-ready', sincronizarPrompt);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('sectrum:pwa-installed', onInstalled);
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('sectrum:pwa-prompt-ready', sincronizarPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('sectrum:pwa-installed', onInstalled);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // Já logado: vai direto para a página inicial do perfil
  if (usuario) return <Navigate to={inicioDoPerfil(usuario)} replace />;

  const irParaInicio = (u: Usuario) => {
    const de = (local.state as { de?: string } | null)?.de;
    navigate(u.primeiro_acesso === 1 ? '/trocar-senha' : de && de !== '/login' ? de : inicioDoPerfil(u), { replace: true });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    setLoading(true);
    localStorage.setItem('sectrum_cpf', login.trim());
    try {
      const r = await entrar(login.trim(), senha);
      irParaInicio(r.usuario);
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : 'Erro de conexão.');
    } finally {
      setLoading(false);
    }
  };

  const entrarBiometria = async () => {
    const cpfOuEmail = login.trim();
    if (!cpfOuEmail) {
      alert('Preencha o CPF ou e-mail primeiro.');
      return;
    }
    localStorage.setItem('sectrum_cpf', cpfOuEmail);
    setErro('');
    setBioAguardando(true);
    try {
      const r = await entrarComBiometria(cpfOuEmail);
      irParaInicio(r.usuario);
    } catch (err) {
      if (err instanceof ErroApi) alert(err.message);
      else if ((err as Error)?.name !== 'NotAllowedError') {
        alert('Erro ao autenticar com biometria. Tente usar sua senha.');
      }
    } finally {
      setBioAguardando(false);
    }
  };

  const instalarPwa = async () => {
    const promptAtivo = pwaPrompt ?? window.__deferredPwaPrompt ?? null;
    if (promptAtivo) {
      try {
        await promptAtivo.prompt();
        const escolha = await promptAtivo.userChoice;
        if (escolha.outcome === 'accepted') {
          window.__deferredPwaPrompt = null;
          setPwaPrompt(null);
          setJaInstalado(true);
        }
        return;
      } catch {
        // Caso o navegador recuse disparar novamente o prompt, exibe o guia passo a passo
      }
    }
    setModalGuiaPwa(true);
  };

  const podeMostrarOpcaoPwa = !jaInstalado && (ehMobile || Boolean(pwaPrompt));
  const mostrarBannerRodape = podeMostrarOpcaoPwa && !bannerFechado;
  const anoAtual = new Date().getFullYear();

  return (
    <div
      className={`min-h-screen min-h-dvh bg-[#0f172a] flex flex-col md:flex-row items-stretch font-['Inter',sans-serif] overflow-x-hidden ${
        mostrarBannerRodape ? 'pb-[76px] md:pb-0' : ''
      }`}
    >
      {/* LADO ESQUERDO: Marca Sectrum (idêntico ao .side-brand do legado) */}
      <div
        className="flex-none md:flex-1 flex flex-col items-center justify-center px-6 pt-7 pb-6 md:p-10 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)' }}
      >
        <div
          className="absolute inset-0 bg-center bg-cover bg-no-repeat opacity-12 pointer-events-none"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=60&w=1200&auto=format&fit=crop')",
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(37,99,235,0.25))' }}
        />

        <div className="relative z-10 text-center text-white">
          <div
            className="w-[80px] h-[80px] bg-[#2563eb] rounded-[22px] flex items-center justify-center mx-auto mb-6"
            style={{ boxShadow: '0 20px 40px rgba(37,99,235,0.5)' }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-[44px] h-[44px] text-white"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>

          <div className="text-[1.8em] sm:text-[2.4em] font-extrabold tracking-[-1px] mb-2 leading-tight">
            Sec<span className="text-[#60a5fa]">trum</span>
          </div>
          <div className="text-[0.95em] text-white/50 font-medium md:mb-12">
            Gestão Inteligente de Condomínios
          </div>

          <div className="hidden md:flex flex-col gap-3.5 text-left max-w-[280px] mx-auto">
            <div className="flex items-center gap-3 text-white/70 text-[0.88em]">
              <div className="w-8 h-8 bg-[#2563eb]/30 rounded-lg flex items-center justify-center shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-[#60a5fa]">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                </svg>
              </div>
              <span>Controle de acesso de moradores e visitantes</span>
            </div>

            <div className="flex items-center gap-3 text-white/70 text-[0.88em]">
              <div className="w-8 h-8 bg-[#2563eb]/30 rounded-lg flex items-center justify-center shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-[#60a5fa]">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </div>
              <span>Terminal de portaria e pré-cadastros online</span>
            </div>

            <div className="flex items-center gap-3 text-white/70 text-[0.88em]">
              <div className="w-8 h-8 bg-[#2563eb]/30 rounded-lg flex items-center justify-center shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-[#60a5fa]">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <span>Integração com reconhecimento facial Hikvision</span>
            </div>

            <div className="flex items-center gap-3 text-white/70 text-[0.88em]">
              <div className="w-8 h-8 bg-[#2563eb]/30 rounded-lg flex items-center justify-center shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-[#60a5fa]">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                  <line x1="12" y1="18" x2="12.01" y2="18" />
                </svg>
              </div>
              <span>App instalável no celular — funciona como nativo</span>
            </div>
          </div>
        </div>
      </div>

      {/* LADO DIREITO: Formulário (idêntico ao .side-form de 460px do legado) */}
      <div className="w-full md:w-[460px] shrink-0 bg-white flex flex-col flex-1 md:flex-initial overflow-y-auto">
        <div className="flex-1 flex flex-col justify-start md:justify-center px-6 py-7 sm:px-11 md:py-12">
          <div className="mb-7">
            <div className="text-[1.6em] font-extrabold text-[#0f172a] mb-1.5">Bem-vindo de volta 👋</div>
            <div className="text-[0.9em] text-[#64748b] font-medium">Faça login para acessar o painel de gestão</div>
          </div>

          {erro && (
            <div className="bg-[#fef2f2] text-[#dc2626] border border-[#fecaca] border-l-4 border-l-[#dc2626] px-4 py-3 rounded-[10px] mb-5 text-[0.88em] font-semibold">
              <div>⚠ {erro}</div>
            </div>
          )}

          <form onSubmit={handleLogin} autoComplete="on">
            <div className="flex flex-col gap-[7px] mb-[18px]">
              <label htmlFor="email" className="text-[0.75em] font-bold text-[#475569] uppercase tracking-[0.6px]">
                CPF ou E-mail
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="email"
                  name="email"
                  required
                  placeholder="Digite seu CPF ou e-mail"
                  autoComplete="username"
                  inputMode="text"
                  autoFocus
                  value={login}
                  onFocus={() => setFocoCampo('email')}
                  onBlur={() => setFocoCampo((f) => (f === 'email' ? null : f))}
                  onChange={(e) => setLogin(e.target.value)}
                  className="w-full py-[14px] pl-[44px] pr-[16px] border-2 border-[#e2e8f0] rounded-[12px] text-[1em] bg-[#f8fafc] text-[#0f172a] transition-all duration-200 outline-none focus:border-[#2563eb] focus:bg-white focus:shadow-[0_0_0_4px_rgba(37,99,235,0.1)]"
                />
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`absolute left-[14px] top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-200 ${
                    focoCampo === 'email' ? 'text-[#2563eb]' : 'text-[#94a3b8]'
                  }`}
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
            </div>

            <div className="flex flex-col gap-[7px] mb-[18px]">
              <label htmlFor="senha" className="text-[0.75em] font-bold text-[#475569] uppercase tracking-[0.6px]">
                Senha
              </label>
              <div className="relative">
                <input
                  type={verSenha ? 'text' : 'password'}
                  id="senha"
                  name="senha"
                  required
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={senha}
                  onFocus={() => setFocoCampo('senha')}
                  onBlur={() => setFocoCampo((f) => (f === 'senha' ? null : f))}
                  onChange={(e) => setSenha(e.target.value)}
                  className="w-full py-[14px] pl-[44px] pr-[48px] border-2 border-[#e2e8f0] rounded-[12px] text-[1em] bg-[#f8fafc] text-[#0f172a] transition-all duration-200 outline-none focus:border-[#2563eb] focus:bg-white focus:shadow-[0_0_0_4px_rgba(37,99,235,0.1)]"
                />
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`absolute left-[14px] top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-200 ${
                    focoCampo === 'senha' ? 'text-[#2563eb]' : 'text-[#94a3b8]'
                  }`}
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <button
                  type="button"
                  onClick={() => setVerSenha((v) => !v)}
                  tabIndex={-1}
                  aria-label="Mostrar senha"
                  className="absolute right-[12px] top-1/2 -translate-y-1/2 bg-transparent border-0 cursor-pointer text-[#94a3b8] hover:text-[#334155] p-1 flex items-center"
                >
                  {!verSenha ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full p-[16px] border-0 rounded-[12px] bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-[1em] font-bold cursor-pointer transition-all duration-200 mt-1 flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(37,99,235,0.35)] hover:shadow-[0_6px_20px_rgba(37,99,235,0.45)] hover:-translate-y-px active:translate-y-0 disabled:opacity-60 disabled:cursor-default disabled:translate-y-0"
            >
              {loading ? (
                'Entrando...'
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                  </svg>
                  Entrar no Sistema
                </>
              )}
            </button>

            {bioDisponivel && (
              <div>
                <div className="flex items-center text-center text-[#94a3b8] text-[0.8em] font-semibold my-4 before:content-[''] before:flex-1 before:border-b before:border-[#e2e8f0] before:mr-2 after:content-[''] after:flex-1 after:border-b after:border-[#e2e8f0] after:ml-2">
                  OU
                </div>
                <button
                  type="button"
                  onClick={entrarBiometria}
                  disabled={bioAguardando}
                  className="w-full p-[16px] border-2 border-[#e2e8f0] hover:border-[#cbd5e1] rounded-[12px] bg-white hover:bg-[#f8fafc] text-[#0f172a] text-[1em] font-bold cursor-pointer transition-all duration-200 mt-3 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-default"
                >
                  {bioAguardando ? (
                    'Aguardando biometria…'
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-[20px] h-[20px] text-[#2563eb]">
                        <path d="M12 2a10 10 0 0 0-10 10v2a10 10 0 0 0 10 10 10 10 0 0 0 10-10v-2A10 10 0 0 0 12 2z" />
                        <path d="M8 12a4 4 0 0 1 8 0" />
                        <path d="M9.5 15.5a2.5 2.5 0 0 1 5 0" />
                        <path d="M12 18v.01" />
                      </svg>
                      Entrar com Face ID / Digital
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Botão sempre visível na tela inicial ao acessar via celular (ou quando instalável) */}
            {podeMostrarOpcaoPwa && (
              <div className="mt-4 pt-1 space-y-2.5">
                {!ehIos && (
                  <a
                    href="/sectrum-condominio.apk"
                    download="Sectrum-Condominio.apk"
                    className="w-full p-3.5 rounded-[12px] bg-gradient-to-r from-emerald-900 to-emerald-700 hover:from-emerald-800 hover:to-emerald-600 text-white border border-emerald-400/40 shadow-md transition-all cursor-pointer flex items-center gap-3 text-left no-underline"
                  >
                    <div className="w-10 h-10 rounded-[10px] bg-emerald-500 flex items-center justify-center shrink-0 shadow-inner">
                      <Download size={20} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-extrabold text-[0.92em] leading-tight flex items-center gap-1.5">
                        <span>Baixar App Nativo Android</span>
                        <span className="text-[0.68em] uppercase bg-emerald-400/30 text-emerald-100 px-1.5 py-0.5 rounded font-bold">
                          APK Nativo
                        </span>
                      </div>
                      <div className="text-[0.75em] text-emerald-100/90 mt-0.5 truncate">
                        Interfone e Sirene funcionam com o app fechado
                      </div>
                    </div>
                  </a>
                )}

                <button
                  type="button"
                  onClick={instalarPwa}
                  className="w-full p-3.5 rounded-[12px] bg-gradient-to-r from-[#0f172a] to-[#1e3a5f] hover:from-[#1e293b] hover:to-[#2563eb] text-white border border-blue-500/30 shadow-md transition-all cursor-pointer flex items-center gap-3 text-left"
                >
                  <div className="w-10 h-10 rounded-[10px] bg-[#2563eb] flex items-center justify-center shrink-0 shadow-inner">
                    <Download size={20} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-[0.92em] leading-tight flex items-center gap-1.5">
                      <span>Instalar Aplicativo no Celular</span>
                      <span className="text-[0.68em] uppercase bg-blue-500/30 text-blue-200 px-1.5 py-0.5 rounded font-bold">
                        PWA
                      </span>
                    </div>
                    <div className="text-[0.75em] text-slate-300 mt-0.5 truncate">
                      Adicione à tela inicial para acesso rápido
                    </div>
                  </div>
                </button>
              </div>
            )}
          </form>
        </div>

        <div className="mt-auto px-6 pt-4 pb-5 sm:px-11 md:pt-5 md:pb-6 border-t border-[#f1f5f9] text-center text-[0.78em] text-[#94a3b8]">
          <a
            href={LINK_SUPORTE}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[#10b981] no-underline font-semibold mb-3 text-[1.1em] hover:underline"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            Suporte: (98) 98598-3566
          </a>
          <br />
          &copy; {anoAtual} Sectrum Tecnologia · Todos os direitos reservados
          <br />
          <a href="/politica-de-privacidade.html" className="text-[#64748b] underline">
            Política de Privacidade
          </a>
        </div>
      </div>

      {/* Banner de instalação PWA fixo no rodapé (sempre exibido ao abrir no celular fora do app instalado) */}
      {mostrarBannerRodape && (
        <div className="fixed bottom-0 left-0 right-0 z-[9990] bg-[#0f172a] text-white px-4 sm:px-5 py-3.5 flex items-center gap-3 shadow-[0_-4px_24px_rgba(0,0,0,0.4)] border-t border-white/10">
          <div className="w-[42px] h-[42px] rounded-[11px] bg-[#2563eb] flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-white">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[0.88em]">Instalar app Sectrum</div>
            <div className="text-[0.75em] text-white/60 mt-px truncate">
              Acesse direto da tela inicial, sem abrir o navegador
            </div>
          </div>
          <button
            type="button"
            onClick={instalarPwa}
            className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white border-0 px-[16px] py-[9px] rounded-[9px] font-bold text-[0.83em] cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <Download size={15} />
            Instalar
          </button>
          <button
            type="button"
            onClick={() => setBannerFechado(true)}
            aria-label="Fechar"
            className="bg-white/10 text-white border-0 w-8 h-8 rounded-lg cursor-pointer text-[1.2em] shrink-0 flex items-center justify-center"
          >
            ×
          </button>
        </div>
      )}

      {/* Modal de Instruções de Instalação PWA (iOS / Android quando o navegador requer ação manual) */}
      {modalGuiaPwa && (
        <div
          className="fixed inset-0 z-[9999] bg-slate-900/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalGuiaPwa(false);
          }}
        >
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border-t-[5px] border-t-[#2563eb] animate-[fadeIn_0.15s_ease-out]">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                  <Smartphone size={22} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Instalar App Sectrum</h3>
                  <p className="text-xs text-slate-500">
                    {ehIos ? 'Para iPhone / iPad (iOS)' : 'Adicionar à tela inicial do celular'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalGuiaPwa(false)}
                aria-label="Fechar"
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-sm text-slate-700">
              {ehIos ? (
                <>
                  <p className="text-xs font-medium text-slate-500">
                    No iPhone/iPad, siga estes 3 passos rápidos para instalar o aplicativo na sua tela inicial:
                  </p>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 font-extrabold">
                        1
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                          <span>Toque no botão Compartilhar</span>
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-blue-600 text-white">
                            <Share size={14} />
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Fica na barra inferior (Safari) ou no canto superior direito da barra de endereço (Chrome).
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 font-extrabold">
                        2
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                          <span>Escolha &ldquo;Adicionar à Tela de Início&rdquo;</span>
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-slate-200 text-slate-700">
                            <PlusSquare size={14} />
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Role o menu de opções para baixo até encontrar esta opção.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 font-extrabold">
                        3
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>Toque em &ldquo;Adicionar&rdquo;</span>
                          <CheckCircle2 size={15} className="text-emerald-600" />
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Pronto! O ícone do Sectrum ficará salvo junto aos seus aplicativos.
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs font-medium text-slate-500">
                    Para instalar o aplicativo Sectrum na tela inicial do seu celular:
                  </p>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 font-extrabold">
                        1
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                          <span>Abra o menu do navegador</span>
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-slate-200 text-slate-700">
                            <MoreVertical size={14} />
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Toque nos três pontinhos no canto superior ou inferior do navegador.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 font-extrabold">
                        2
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                          <span>Toque em &ldquo;Instalar aplicativo&rdquo;</span>
                          <Download size={14} className="text-blue-600" />
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Ou selecione &ldquo;Adicionar à tela inicial&rdquo; e confirme.
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <button
                type="button"
                onClick={() => setModalGuiaPwa(false)}
                className="w-full py-3 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold text-sm cursor-pointer transition"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
