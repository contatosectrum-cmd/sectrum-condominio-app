import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  LogOut, Menu, Building2, Bell, Download, LayoutDashboard,
  PanelLeftClose, PanelLeftOpen, Maximize2, Minimize2, X,
} from 'lucide-react';
import { menuDoUsuario, itemDoCaminho } from '../lib/menu';
import { sair, selecionarCondominio, useSessao } from '../lib/useSessao';
import { atualizarUsuario, type Usuario } from '../lib/sessao';
import { api } from '../lib/api';
import LimiteErro from './LimiteErro';
import MonitorTransbordoPortaria from './MonitorTransbordoPortaria';
import ModalExcluirConta from './ModalExcluirConta';

// Espelho fiel de src/views/layout.php do sistema em producao + suporte a Modo Operacional (recolher menu no desktop e Tela Cheia):
// - Logo da Sectrum (escudo azul + "Sectrum / Gestão Condominial")
// - Card do usuario logado (.sidebar-user) logo abaixo da logo com avatar colorido (mesmo CRC32 do PHP), nome e perfil
// - Botao de recolher/expandir menu lateral no desktop e mobile + botao de Tela Cheia na topbar

const AVATAR_CORES = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4'];

const LINK_SUPORTE =
  'https://api.whatsapp.com/send?phone=5598985983566&text=Ol%C3%A1%2C%20preciso%20de%20suporte%20no%20aplicativo.';

function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? 'U') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

/** Calcula o mesmo CRC32 do PHP (crc32($nome)) para gerar exatamente a mesma cor de avatar da producao. */
function corAvatar(nome: string): string {
  const bytes = new TextEncoder().encode(nome);
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  const signed = (crc ^ 0xffffffff) | 0;
  return AVATAR_CORES[Math.abs(signed) % AVATAR_CORES.length];
}

function dataHojeFormatada(): string {
  return new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Seletor de condominio do superadmin (melhoria: no legado ele nao conseguia trocar). */
function SeletorCondominio() {
  const { usuario } = useSessao();
  const [lista, setLista] = useState<{ id: number; nome: string; ativo: boolean }[]>([]);
  const [trocando, setTrocando] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api<{ condominios: { id: number; nome: string; ativo: boolean }[] }>('condominios_disponiveis')
      .then((r) => setLista(r.condominios))
      .catch(() => setLista([]));
  }, []);

  const trocar = async (valor: string) => {
    setTrocando(true);
    try {
      await selecionarCondominio(valor === '' ? null : Number(valor));
      navigate('/', { replace: true });
    } finally {
      setTrocando(false);
    }
  };

  return (
    <label className="flex items-center gap-1.5 text-xs">
      <Building2 size={16} className="text-slate-400 shrink-0" />
      <select
        value={usuario?.condominio_id ?? ''}
        disabled={trocando}
        onChange={(e) => trocar(e.target.value)}
        className="max-w-[210px] bg-slate-50 border border-slate-200 rounded-full px-3 py-1 font-semibold text-slate-700 outline-none focus:border-blue-500 text-xs"
        title="Condomínio em uso"
      >
        <option value="">— Visão geral (todos) —</option>
        {lista.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}{c.ativo ? '' : ' (inativo)'}
          </option>
        ))}
      </select>
    </label>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function Layout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [emTelaCheia, setEmTelaCheia] = useState(false);
  const { usuario } = useSessao();
  const [notif, setNotif] = useState<{ visitas: number; precadastros: number; total: number }>({
    visitas: 0,
    precadastros: 0,
    total: 0,
  });
  const [pwaPrompt, setPwaPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [menuUsuarioAberto, setMenuUsuarioAberto] = useState(false);
  const [excluirContaAberto, setExcluirContaAberto] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setPwaPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      const ativo = Boolean(document.fullscreenElement);
      setEmTelaCheia(ativo);
      window.dispatchEvent(new CustomEvent('sectrum:fullscreen-status', { detail: { ativo } }));
    };
    const onModoOperacional = (e: Event) => {
      const ev = e as CustomEvent<{ recolherMenu?: boolean; telaCheia?: boolean }>;
      const recolher = ev.detail?.recolherMenu ?? true;
      setDesktopCollapsed(recolher);
      if (ev.detail?.telaCheia) {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } else if (ev.detail?.telaCheia === false && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    window.addEventListener('sectrum:modo-operacional', onModoOperacional);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      window.removeEventListener('sectrum:modo-operacional', onModoOperacional);
    };
  }, []);

  useEffect(() => {
    if (!usuario) return;

    const sincronizarModulosSessao = () => {
      api<{ usuario: Usuario }>('auth_eu')
        .then((r) => {
          const uNovo = r?.usuario;
          if (!uNovo) return;
          const mudou =
            uNovo.permite_temporada !== usuario.permite_temporada ||
            uNovo.modulo_airbnb !== usuario.modulo_airbnb ||
            uNovo.modulo_interfone !== usuario.modulo_interfone ||
            uNovo.modulo_reservas !== usuario.modulo_reservas ||
            uNovo.modulo_ocorrencias !== usuario.modulo_ocorrencias ||
            uNovo.modulo_enquetes !== usuario.modulo_enquetes ||
            uNovo.modulo_avisos !== usuario.modulo_avisos ||
            uNovo.modulo_encomendas !== usuario.modulo_encomendas ||
            uNovo.modulo_emergencia !== usuario.modulo_emergencia ||
            uNovo.emergencia_furar_nao_perturbe !== usuario.emergencia_furar_nao_perturbe ||
            uNovo.cameras_morador_ativo !== usuario.cameras_morador_ativo ||
            uNovo.condominio_nome !== usuario.condominio_nome;
          if (mudou) {
            atualizarUsuario(uNovo);
          }
        })
        .catch(() => {});
    };

    sincronizarModulosSessao();

    if (usuario.perfil === 'morador') {
      setNotif({ visitas: 0, precadastros: 0, total: 0 });
      return;
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.update().catch(() => {}));
      }).catch(() => {});
    }
    if (!usuario.condominio_id) {
      setNotif({ visitas: 0, precadastros: 0, total: 0 });
      return;
    }
    api<{ visitas: number; precadastros: number; total: number }>('notificacoes_layout', { query: { v: 3 } })
      .then(setNotif)
      .catch(() => {});
  }, [usuario, location.pathname]);

  if (!usuario) return null; // ProtegerRota ja redireciona

  const grupos = menuDoUsuario(usuario);
  const itemAtual = itemDoCaminho(location.pathname);
  const precisaCondominio = itemAtual?.exigeCondominio && usuario.condominio_id === null;
  const IconePagina = itemAtual?.icone ?? LayoutDashboard;
  const tituloPagina = itemAtual?.titulo || itemAtual?.nome || 'Sectrum';
  const avCor = corAvatar(usuario.nome);
  const avIni = iniciais(usuario.nome);

  const badgeDoItem = (caminho: string): number => {
    if (caminho === '/portaria') return notif.visitas;
    if (caminho === '/precadastros') return notif.precadastros;
    return 0;
  };

  const alternarMenu = () => {
    if (window.innerWidth <= 900) {
      setSidebarOpen((v) => !v);
    } else {
      setDesktopCollapsed((v) => !v);
    }
  };

  const ehIos =
    typeof navigator !== 'undefined' &&
    (/iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
      (typeof document !== 'undefined' && document.documentElement.classList.contains('sectrum-ios-native')));
  // App Android nativo (Capacitor 8 / Android 15+): a tela é desenhada por baixo da barra de status e da barra de
  // gestos. O Capacitor informa as alturas em env(safe-area-inset-*) e em --safe-area-inset-* (WebView antigos);
  // sem esse espaço o menu fica sob a barra de status e o toque vai para o sistema (abre a cortina de notificações).
  const ehAndroidNativo =
    !ehIos && typeof window !== 'undefined' && Boolean(window.SectrumAndroid?.ehAppNativo?.());
  const safeTopCss = ehIos
    ? 'max(env(safe-area-inset-top, 0px), 56px)'
    : ehAndroidNativo
      ? 'max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px))'
      : 'env(safe-area-inset-top, 0px)';
  const safeBottomCss = ehIos
    ? 'max(env(safe-area-inset-bottom, 0px), 24px)'
    : ehAndroidNativo
      ? 'max(env(safe-area-inset-bottom, 0px), var(--safe-area-inset-bottom, 0px))'
      : 'env(safe-area-inset-bottom, 0px)';
  const appNativoComBarras = ehIos || ehAndroidNativo;

  const alternarTelaCheia = () => {
    if (!document.fullscreenElement) {
      setDesktopCollapsed(true);
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      setDesktopCollapsed(false);
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <div className="flex min-h-screen bg-[#f1f5f9] text-[#334155] font-sans text-[15px] leading-[1.5]">
      {/* Overlay mobile (legado: .overlay) */}
      {sidebarOpen && (
        <div
          className="min-[901px]:hidden fixed inset-0 bg-black/45 z-[190] backdrop-blur-[2px]"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR (largura ampliada e itens maiores para facilitar leitura e toque no celular e desktop) */}
      <aside
        style={{ paddingTop: safeTopCss, paddingBottom: safeBottomCss }}
        className={`w-[284px] max-[900px]:w-[308px] bg-[#0f172a] h-screen h-[100dvh] max-h-[100dvh] fixed top-0 left-0 flex flex-col z-[200] transition-transform duration-250 ease-[cubic-bezier(0.4,0,0.2,1)] shadow-[4px_0_24px_rgba(0,0,0,0.22)] ${
          sidebarOpen ? 'max-[900px]:translate-x-0' : 'max-[900px]:-translate-x-full'
        } ${desktopCollapsed ? 'min-[901px]:-translate-x-full' : 'min-[901px]:translate-x-0'}`}
      >
        {/* Marca (.sidebar-brand) */}
        <div className="px-5 h-[66px] flex items-center justify-between gap-3 border-b border-white/[0.08] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-[40px] h-[40px] bg-[#2563eb] rounded-[11px] flex items-center justify-center shrink-0 shadow-md shadow-blue-600/30">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-white w-[21px] h-[21px]"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="text-[1.08rem] font-extrabold text-white tracking-[-0.3px] leading-[1.15]">
              Sectrum
              <small className="block text-[0.76rem] font-medium text-white/45 tracking-normal">
                Gestão Condominial
              </small>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="min-[901px]:hidden p-2 rounded-xl bg-white/[0.08] text-white/80 hover:text-white active:bg-white/[0.18] transition-colors cursor-pointer touch-manipulation"
            aria-label="Fechar Menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* User card (.sidebar-user) */}
        <div className="mx-3 mt-3 px-3.5 py-3 rounded-xl bg-white/[0.06] border border-white/[0.06] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-[40px] h-[40px] rounded-full flex items-center justify-center font-extrabold text-[0.85rem] text-white shrink-0 tracking-[0.5px] shadow-xs"
              style={{ background: avCor }}
            >
              {avIni}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[0.95rem] font-bold text-white truncate">{usuario.nome}</div>
              <div className="text-[0.78rem] text-white/45 capitalize mt-[1px]">{usuario.perfil}</div>
            </div>
          </div>
          <button
            onClick={sair}
            className="p-2 rounded-lg text-red-400 hover:text-red-300 hover:bg-white/[0.08] active:bg-white/[0.15] transition-colors shrink-0 cursor-pointer"
            title="Sair do Sistema"
            aria-label="Sair do Sistema"
          >
            <LogOut size={18} />
          </button>
        </div>

        {/* Navegação (.sidebar-nav) — opções amplas e legíveis */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 sidebar-scroll">
          {grupos.map((group, idx) => (
            <div key={group.titulo}>
              <div
                className={`text-[0.74rem] font-extrabold text-white/40 uppercase tracking-[1.3px] px-3 pb-2 ${
                  idx === 0 ? 'pt-1' : 'pt-4 mt-1 border-t border-white/[0.06]'
                }`}
              >
                {group.titulo}
              </div>
              {group.itens.map((item) => {
                const Icon = item.icone;
                const isActive = location.pathname === item.caminho;
                const badge = badgeDoItem(item.caminho);
                return (
                  <Link
                    key={item.caminho}
                    to={item.caminho}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl text-[1rem] transition-all duration-200 mb-1.5 relative ${
                      isActive
                        ? 'bg-[#2563eb] text-white font-bold shadow-[0_4px_14px_rgba(37,99,235,0.45)]'
                        : 'text-white/80 font-semibold hover:bg-white/[0.09] hover:text-white active:bg-white/[0.14]'
                    }`}
                  >
                    <span
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        isActive ? 'bg-white/20 text-white' : 'bg-white/[0.06] text-blue-300'
                      }`}
                    >
                      <Icon size={20} className="shrink-0" />
                    </span>
                    <span className="leading-snug">{item.nome}</span>
                    {badge > 0 && (
                      <span
                        className={`ml-auto text-white text-[0.75rem] font-extrabold px-2 py-0.5 rounded-full leading-[1.4] ${
                          isActive ? 'bg-white/25' : 'bg-red-500'
                        }`}
                      >
                        {badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer sidebar (.sidebar-footer) */}
        <div className="p-3 border-t border-white/[0.08] shrink-0 space-y-2">
          <a
            href={LINK_SUPORTE}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-start gap-0.5 px-3.5 py-2.5 rounded-xl bg-emerald-500/[0.14] hover:bg-emerald-500/[0.24] text-[#34d399] text-[0.92rem] font-bold transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-[18px] h-[18px] shrink-0"
              >
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              <span>Falar com Suporte</span>
            </div>
            <span className="text-[0.82rem] opacity-90 ml-[26px]">(98) 98598-3566</span>
          </a>
          <button
            onClick={sair}
            className="w-full flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-red-500/[0.14] hover:bg-red-500/[0.24] text-[#fca5a5] text-[0.95rem] font-bold transition-colors cursor-pointer"
          >
            <LogOut size={18} className="shrink-0" />
            <span>Sair do Sistema</span>
          </button>
        </div>
      </aside>

      {/* MAIN (.main) */}
      <div
        style={{ paddingBottom: ehAndroidNativo ? safeBottomCss : undefined }}
        className={`flex-1 flex flex-col min-h-screen min-w-0 transition-[margin] duration-250 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          desktopCollapsed ? 'min-[901px]:ml-0' : 'min-[901px]:ml-[284px]'
        }`}
      >
        {/* Topbar (.topbar) */}
        <header
          style={{
            paddingTop: appNativoComBarras ? `calc(${safeTopCss} + 8px)` : undefined,
            paddingBottom: appNativoComBarras ? '10px' : undefined,
          }}
          className="min-h-[62px] bg-white/95 backdrop-blur-md px-6 max-[900px]:px-3.5 flex items-center justify-between border-b border-slate-200/80 sticky top-0 z-[100] gap-3"
        >
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <button
              type="button"
              onClick={alternarMenu}
              className="px-3.5 py-2.5 min-h-[42px] rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300/80 text-slate-800 border border-slate-200/90 transition-colors shrink-0 cursor-pointer flex items-center gap-1.5 shadow-2xs touch-manipulation select-none"
              aria-label="Alternar Menu Lateral"
              title={desktopCollapsed ? 'Mostrar menu lateral' : 'Recolher menu lateral'}
            >
              <span className="min-[901px]:hidden flex items-center gap-1.5">
                <Menu size={22} className="text-blue-600" />
                <span className="text-xs font-extrabold text-slate-800">Menu</span>
              </span>
              <span className="max-[900px]:hidden">
                {desktopCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
              </span>
            </button>
            <div className="flex items-center gap-[8px] text-[1rem] font-extrabold text-[#0f172a] truncate min-w-0">
              <IconePagina size={19} className="text-[#2563eb] shrink-0" />
              <span className="truncate">{tituloPagina}</span>
            </div>
          </div>

          <div className="flex items-center gap-[6px] shrink-0">
            {usuario.superadmin && <SeletorCondominio />}

            <button
              onClick={alternarTelaCheia}
              className="max-[640px]:hidden w-[36px] h-[36px] rounded-[8px] flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
              title={emTelaCheia ? 'Sair da Tela Cheia (ESC)' : 'Modo Operacional em Tela Cheia'}
            >
              {emTelaCheia ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>

            {pwaPrompt && (
              <button
                onClick={() => {
                  pwaPrompt.prompt();
                  pwaPrompt.userChoice.finally(() => setPwaPrompt(null));
                }}
                className="w-[36px] h-[36px] rounded-[8px] flex items-center justify-center text-[#2563eb] hover:bg-slate-100 transition-colors"
                title="Instalar app na tela inicial"
              >
                <Download size={18} />
              </button>
            )}

            {notif.total > 0 && (
              <Link
                to={notif.precadastros > 0 ? '/precadastros' : '/visitas'}
                className="w-[36px] h-[36px] rounded-[8px] flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors relative"
                title={`${notif.total} notificação(ões)`}
              >
                <Bell size={18} />
                <span className="absolute top-[2px] right-[2px] bg-[#ef4444] text-white text-[0.55em] font-extrabold px-[4px] py-[2px] rounded-[20px] min-w-[16px] text-center leading-[1.3]">
                  {notif.total}
                </span>
              </Link>
            )}

            <div className="max-[640px]:hidden text-[0.82em] text-[#64748b] bg-[#f8fafc] px-[12px] py-[5px] rounded-[20px] border border-[#e2e8f0] font-medium">
              {dataHojeFormatada()}
            </div>

            {/* Botão Sair visível direto na barra superior */}
            <button
              onClick={sair}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100/80 active:bg-rose-100 border border-rose-200/80 transition-colors text-xs font-bold cursor-pointer shrink-0"
              title="Sair do sistema (Logout)"
              aria-label="Sair do sistema"
            >
              <LogOut size={16} className="shrink-0 text-rose-600" />
              <span className="max-[480px]:hidden">Sair</span>
            </button>

            {/* Avatar do usuário com menu dropdown ao clicar */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setMenuUsuarioAberto((v) => !v)}
                className="w-[34px] h-[34px] rounded-full flex items-center justify-center font-bold text-[0.75em] text-white shrink-0 tracking-[0.5px] cursor-pointer hover:ring-2 hover:ring-blue-400 hover:ring-offset-1 transition-all"
                style={{ background: avCor }}
                title={`Usuário: ${usuario.nome} (toque para ver perfil/sair)`}
                aria-label="Opções do usuário"
              >
                {avIni}
              </button>

              {menuUsuarioAberto && (
                <>
                  <div
                    className="fixed inset-0 z-[210]"
                    onClick={() => setMenuUsuarioAberto(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-2xl border border-slate-200 z-[220] py-2">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0 tracking-[0.5px] shadow-sm"
                        style={{ background: avCor }}
                      >
                        {avIni}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-800 text-sm truncate">{usuario.nome}</div>
                        <div className="text-xs text-slate-500 capitalize">{usuario.perfil}</div>
                        {usuario.condominio_nome && (
                          <div className="text-[11px] text-blue-600 truncate font-medium mt-0.5">
                            {usuario.condominio_nome}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="py-1">
                      <a
                        href={LINK_SUPORTE}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setMenuUsuarioAberto(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 transition-colors"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-4 h-4 shrink-0"
                        >
                          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                        </svg>
                        <span>Suporte WhatsApp</span>
                      </a>

                      <a
                        href="/politica-de-privacidade.html"
                        onClick={() => setMenuUsuarioAberto(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-4 h-4 shrink-0"
                        >
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                        <span>Política de Privacidade</span>
                      </a>

                      {usuario.perfil !== 'superadmin' && (
                        <button
                          onClick={() => {
                            setMenuUsuarioAberto(false);
                            setExcluirContaAberto(true);
                          }}
                          className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-rose-500 hover:bg-rose-50 transition-colors text-left cursor-pointer"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-4 h-4 shrink-0"
                          >
                            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                          </svg>
                          <span>Excluir minha conta</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setMenuUsuarioAberto(false);
                          sair();
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors text-left cursor-pointer border-t border-slate-100"
                      >
                        <LogOut size={16} className="text-rose-500 shrink-0" />
                        <span>Sair da Conta (Logout)</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {excluirContaAberto && (
          <ModalExcluirConta perfil={usuario.perfil} onFechar={() => setExcluirContaAberto(false)} />
        )}

        {/* Monitor global de Transbordo Automático de Interfone + Registro de Push do Watchdog para Portaria/Síndico/Admin */}
        {usuario.perfil !== 'morador' && (
          <MonitorTransbordoPortaria condominioId={usuario.condominio_id ?? null} />
        )}

        {/* Área de conteúdo */}
        <div className="flex-1 min-w-0">
          {precisaCondominio ? (
            <div className="m-8 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-8 text-center">
              <Building2 size={36} className="mx-auto mb-3 text-amber-500" />
              <h3 className="text-lg font-bold">Selecione um condomínio primeiro</h3>
              <p className="text-sm mt-1">
                Use o seletor no topo da tela para escolher em qual condomínio deseja trabalhar.
              </p>
            </div>
          ) : (
            <LimiteErro chave={location.pathname}>
              <Outlet />
            </LimiteErro>
          )}
        </div>
      </div>

      <style>{`
        .sidebar-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,.1) transparent;
        }
        .sidebar-scroll::-webkit-scrollbar { width: 4px; }
        .sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
        .sidebar-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 4px; }
      `}</style>
    </div>
  );
}
