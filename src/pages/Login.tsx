import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { entrar, useSessao } from '../lib/useSessao';
import { inicioDoPerfil } from '../lib/menu';
import { ErroApi } from '../lib/api';
import { entrarComBiometria, temBiometriaNoAparelho } from '../lib/webauthn';
import { ehAppNativo } from '../lib/nativo';
import type { Usuario } from '../lib/sessao';

// Paridade visual e funcional com o sistema cond.vps.seg.br:
// - Split layout em tela cheia (side-brand escuro com foto de edifícios + escudo Sectrum e 4 features à esquerda;
//   side-form branco de 460px à direita com "Bem-vindo de volta 👋");
// - Login por CPF ou E-mail (lembrado em localStorage 'sectrum_cpf'), mostrar/ocultar senha, WebAuthn (Face ID / Digital),
//   links diretos para os aplicativos nativos oficiais (Google Play Android e App Store iOS) e rodapé com suporte via WhatsApp.
const LINK_SUPORTE =
  'https://api.whatsapp.com/send?phone=5598985983566&text=Ol%C3%A1%2C%20preciso%20de%20ajuda%20para%20acessar%20o%20aplicativo.';

const LINK_GOOGLE_PLAY = 'https://play.google.com/store/apps/details?id=br.seg.vps.cond.sectrum';
const LINK_APP_STORE_IOS = 'https://apps.apple.com/app/sectrum-condominio/id6826756502';

function verificarAppInstalado(): boolean {
  if (typeof window === 'undefined') return false;
  if (ehAppNativo()) return true;
  const standaloneMedia = window.matchMedia?.('(display-mode: standalone)').matches;
  const standaloneIos = Boolean((window.navigator as { standalone?: boolean }).standalone);
  return Boolean(standaloneMedia || standaloneIos);
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
  const [jaInstalado, setJaInstalado] = useState<boolean>(() => verificarAppInstalado());
  const [ehIos] = useState<boolean>(() => verificarIos());
  const navigate = useNavigate();
  const local = useLocation();

  useEffect(() => {
    temBiometriaNoAparelho().then(setBioDisponivel);

    const onResize = () => {
      setJaInstalado(verificarAppInstalado());
    };

    window.addEventListener('resize', onResize);
    return () => {
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

  const anoAtual = new Date().getFullYear();

  return (
    <div className="min-h-screen min-h-dvh bg-[#0f172a] flex flex-col md:flex-row items-stretch font-['Inter',sans-serif] overflow-x-hidden">
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
              <span>Aplicativo oficial para Android e iPhone (iOS)</span>
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

            {/* Botões oficiais das lojas (Google Play & App Store — ocultos dentro do app já instalado) */}
            {!jaInstalado && (
              <div className="mt-4 pt-1 flex flex-col gap-2.5">
                <a
                  href={LINK_GOOGLE_PLAY}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`w-full p-3.5 rounded-[12px] bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-900 hover:from-emerald-900 hover:to-emerald-800 text-white border border-emerald-400/40 shadow-md transition-all cursor-pointer flex items-center gap-3 text-left no-underline ${
                    ehIos ? 'order-2' : 'order-1'
                  }`}
                >
                  <div className="w-10 h-10 rounded-[10px] bg-white/10 border border-white/15 flex items-center justify-center shrink-0 shadow-inner">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-5 h-5">
                      <path fill="#34A853" d="M3.61 1.814L13.793 12 3.61 22.186a1.98 1.98 0 0 1-.61-1.43V3.244c0-.55.224-1.05.61-1.43z" />
                      <path fill="#FBBC04" d="M17.26 8.533L5.055 1.49A1.74 1.74 0 0 0 3.61 1.814L13.793 12l3.467-3.467z" />
                      <path fill="#EA4335" d="M3.61 22.186c.42.345 1.003.428 1.445.324l12.205-7.043L13.793 12 3.61 22.186z" />
                      <path fill="#4285F4" d="M20.992 10.684l-3.732-2.151L13.793 12l3.467 3.467 3.732-2.151c.864-.498.864-2.134 0-2.632z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-[0.92em] leading-tight flex items-center gap-1.5 flex-wrap">
                      <span>Baixar no Google Play (Android)</span>
                      <span className="text-[0.68em] uppercase bg-emerald-500/30 text-emerald-200 px-1.5 py-0.5 rounded font-bold">
                        Google Play
                      </span>
                    </div>
                    <div className="text-[0.75em] text-slate-300 mt-0.5 truncate">
                      Versão oficial para Android na Google Play Store
                    </div>
                  </div>
                </a>

                <a
                  href={LINK_APP_STORE_IOS}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`w-full p-3.5 rounded-[12px] bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 hover:from-slate-900 hover:to-blue-900 text-white border border-blue-400/40 shadow-md transition-all cursor-pointer flex items-center gap-3 text-left no-underline ${
                    ehIos ? 'order-1' : 'order-2'
                  }`}
                >
                  <div className="w-10 h-10 rounded-[10px] bg-white/10 border border-white/15 flex items-center justify-center shrink-0 shadow-inner">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.33c.64-.78 1.08-1.86.96-2.94-.93.04-2.06.62-2.72 1.4-.58.68-1.1 1.79-.96 2.84 1.04.08 2.08-.52 2.72-1.3z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-[0.92em] leading-tight flex items-center gap-1.5 flex-wrap">
                      <span>Baixar na App Store (iPhone)</span>
                      <span className="text-[0.68em] uppercase bg-blue-500/30 text-blue-200 px-1.5 py-0.5 rounded font-bold">
                        App Store
                      </span>
                    </div>
                    <div className="text-[0.75em] text-slate-300 mt-0.5 truncate">
                      Versão oficial para iPhone e iPad na App Store
                    </div>
                  </div>
                </a>
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
          &copy; {anoAtual} Sectrum Tecnologia · CNPJ 17.241.131/0001-63 (J.V DE C SABINO)
          <br />
          <a href="/politica-de-privacidade.html" className="text-[#64748b] underline">
            Política de Privacidade
          </a>
        </div>
      </div>
    </div>
  );
}
