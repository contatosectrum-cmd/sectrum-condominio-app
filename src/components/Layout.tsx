import { Outlet, Link, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import {
  LogOut, Menu, Building2, Bell, LayoutDashboard,
  PanelLeftClose, PanelLeftOpen, Maximize2, Minimize2, X,
  Search, ChevronDown, ChevronRight, ChevronsUpDown,
} from 'lucide-react';
import { menuDoUsuario, itemDoCaminho, grupoDoCaminho, normalizarTextoBusca } from '../lib/menu';
import { sair, selecionarCondominio, useSessao } from '../lib/useSessao';
import { atualizarUsuario, type Usuario } from '../lib/sessao';
import { api } from '../lib/api';
import LimiteErro from './LimiteErro';
import MonitorTransbordoPortaria from './MonitorTransbordoPortaria';
import MonitorAlarmesRestricao from './MonitorAlarmesRestricao';
import ModalExcluirConta from './ModalExcluirConta';
import ModalPesquisaInteligente from './ModalPesquisaInteligente';
import ModalFichaUnidade360 from './ModalFichaUnidade360';

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

/** Seletor de condominio do superadmin (com contagem de pessoas por condomínio e total geral). */
function SeletorCondominio() {
  const { usuario } = useSessao();
  const location = useLocation();
  const [lista, setLista] = useState<{ id: number; nome: string; ativo: boolean; total_pessoas?: number }[]>([]);
  const [totalSistema, setTotalSistema] = useState<number | null>(null);
  const [trocando, setTrocando] = useState(false);

  const carregarLista = () => {
    api<{ condominios: { id: number; nome: string; ativo: boolean; total_pessoas?: number }[]; total_pessoas_sistema?: number }>('condominios_disponiveis')
      .then((r) => {
        setLista(r.condominios);
        if (typeof r.total_pessoas_sistema === 'number') {
          setTotalSistema(r.total_pessoas_sistema);
        }
      })
      .catch(() => setLista([]));
  };

  useEffect(() => {
    carregarLista();
  }, [location.pathname, usuario?.condominio_id]);

  useEffect(() => {
    const onAtualizar = () => carregarLista();
    window.addEventListener('sectrum:atualizar-contadores', onAtualizar);
    return () => window.removeEventListener('sectrum:atualizar-contadores', onAtualizar);
  }, []);

  const trocar = async (valor: string) => {
    setTrocando(true);
    try {
      await selecionarCondominio(valor === '' ? null : Number(valor));
    } finally {
      setTrocando(false);
    }
  };

  return (
    <label className="flex items-center gap-1.5 text-xs">
      <Building2 size={15} className="text-slate-400 shrink-0 hidden sm:inline" />
      <select
        value={usuario?.condominio_id ?? ''}
        disabled={trocando}
        onChange={(e) => trocar(e.target.value)}
        className="max-w-[235px] max-[480px]:max-w-[145px] bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1.5 font-semibold text-slate-700 outline-none focus:border-blue-500 text-xs"
        title="Condomínio em uso (quantidade de pessoas ativas entre parênteses)"
      >
        <option value="">
          — Visão geral (todos{totalSistema !== null ? `: ${totalSistema.toLocaleString('pt-BR')}` : ''}) —
        </option>
        {lista.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome} ({(c.total_pessoas ?? 0).toLocaleString('pt-BR')}){c.ativo ? '' : ' [inativo]'}
          </option>
        ))}
      </select>
    </label>
  );
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
  const [menuUsuarioAberto, setMenuUsuarioAberto] = useState(false);
  const [excluirContaAberto, setExcluirContaAberto] = useState(false);

  // Navegabilidade Inteligente: Filtro Rápido da Sidebar + Pesquisa Global (Ctrl+K) + Ficha 360º Direta
  const [filtroMenu, setFiltroMenu] = useState('');
  const [pesquisaAberta, setPesquisaAberta] = useState(false);
  const [ficha360GlobalId, setFicha360GlobalId] = useState<number | null>(null);
  const [gruposAbertos, setGruposAbertos] = useState<Record<string, boolean>>({});

  // Atalho global Ctrl+K / Cmd+K para abrir a Pesquisa Inteligente de qualquer tela
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPesquisaAberta((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
    let cancelado = false;
    const cidEsperado = usuario.condominio_id ?? null;

    const sincronizarModulosSessao = () => {
      api<{ usuario: Usuario }>('auth_eu')
        .then((r) => {
          if (cancelado) return;
          const uNovo = r?.usuario;
          if (!uNovo) return;
          if ((uNovo.condominio_id ?? null) !== cidEsperado) return;
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
            uNovo.whatsapp_chat_condominio !== usuario.whatsapp_chat_condominio ||
            uNovo.modulo_seguranca_facial !== usuario.modulo_seguranca_facial ||
            uNovo.modulo_financeiro !== usuario.modulo_financeiro ||
            uNovo.modulo_transparencia !== usuario.modulo_transparencia ||
            uNovo.modulo_mudancas !== usuario.modulo_mudancas ||
            uNovo.modulo_manutencoes !== usuario.modulo_manutencoes ||
            uNovo.subperfil !== usuario.subperfil ||
            JSON.stringify(uNovo.permissoes_sistema) !== JSON.stringify(usuario.permissoes_sistema) ||
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
      return () => {
        cancelado = true;
      };
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.update().catch(() => {}));
      }).catch(() => {});
    }
    if (!usuario.condominio_id) {
      setNotif({ visitas: 0, precadastros: 0, total: 0 });
      return () => {
        cancelado = true;
      };
    }
    api<{ visitas: number; precadastros: number; total: number }>('notificacoes_layout', { query: { v: 3 } })
      .then((n) => {
        if (!cancelado) setNotif(n);
      })
      .catch(() => {});

    return () => {
      cancelado = true;
    };
  }, [usuario?.id, usuario?.condominio_id, location.pathname]);

  // Inicializa os grupos abertos do Accordion e garante que o grupo da rota atual esteja sempre aberto
  const grupos = useMemo(() => (usuario ? menuDoUsuario(usuario) : []), [usuario]);
  const grupoAtivo = useMemo(
    () => (usuario ? grupoDoCaminho(location.pathname, usuario) : undefined),
    [location.pathname, usuario],
  );

  useEffect(() => {
    if (!usuario || grupos.length === 0) return;
    const chaveStorage = `sectrum:nav-accordion:${usuario.perfil}`;
    let salvo: Record<string, boolean> = {};
    try {
      const raw = localStorage.getItem(chaveStorage);
      if (raw) salvo = JSON.parse(raw);
    } catch {
      salvo = {};
    }
    setGruposAbertos((ant) => {
      const novo: Record<string, boolean> = {};
      for (const g of grupos) {
        if (g.id in ant) novo[g.id] = ant[g.id];
        else if (g.id in salvo) novo[g.id] = salvo[g.id];
        else novo[g.id] = Boolean(g.abertoPorPadrao);
      }
      if (grupoAtivo) {
        novo[grupoAtivo.id] = true;
      }
      return novo;
    });
  }, [usuario?.perfil, grupos.length, grupoAtivo?.id]);

  const alternarGrupoAccordion = (grupoId: string) => {
    setGruposAbertos((ant) => {
      const prox = { ...ant, [grupoId]: !ant[grupoId] };
      if (usuario) {
        try {
          localStorage.setItem(`sectrum:nav-accordion:${usuario.perfil}`, JSON.stringify(prox));
        } catch {
          // ignora erro de quota
        }
      }
      return prox;
    });
  };

  const todosAbertos = grupos.length > 0 && grupos.every((g) => gruposAbertos[g.id]);
  const alternarTodosGrupos = () => {
    const abrir = !todosAbertos;
    const prox: Record<string, boolean> = {};
    for (const g of grupos) prox[g.id] = abrir;
    if (!abrir && grupoAtivo) prox[grupoAtivo.id] = true;
    setGruposAbertos(prox);
    if (usuario) {
      try {
        localStorage.setItem(`sectrum:nav-accordion:${usuario.perfil}`, JSON.stringify(prox));
      } catch {
        // ignora
      }
    }
  };

  // Filtra os grupos do menu lateral em tempo real caso o usuário digite no campo rápido da sidebar
  const gruposVisiveisSidebar = useMemo(() => {
    const q = normalizarTextoBusca(filtroMenu);
    if (!q) return grupos;
    const tokens = q.split(/\s+/).filter(Boolean);
    return grupos
      .map((g) => ({
        ...g,
        itens: g.itens.filter((item) => {
          const base = normalizarTextoBusca(
            `${item.nome} ${item.titulo || ''} ${g.titulo} ${(item.palavrasChave || []).join(' ')}`,
          );
          return tokens.every((tk) => base.includes(tk));
        }),
      }))
      .filter((g) => g.itens.length > 0);
  }, [grupos, filtroMenu]);

  if (!usuario) return null;

  const itemAtual = itemDoCaminho(location.pathname);
  const precisaCondominio = itemAtual?.exigeCondominio && usuario.condominio_id === null;
  const IconePagina = itemAtual?.icone ?? LayoutDashboard;
  const tituloCurtoPagina = itemAtual?.nome || 'Sectrum';
  const tituloCompletoPagina = itemAtual?.titulo || itemAtual?.nome || 'Sectrum';
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
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="min-[901px]:hidden fixed inset-0 bg-black/45 z-[190] backdrop-blur-[2px]"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR INDEXADA & RECOLHÍVEL */}
      <aside
        style={{ paddingTop: safeTopCss, paddingBottom: safeBottomCss }}
        className={`w-[280px] max-[900px]:w-[304px] bg-[#0f172a] h-screen h-[100dvh] max-h-[100dvh] fixed top-0 left-0 flex flex-col z-[200] transition-transform duration-250 ease-[cubic-bezier(0.4,0,0.2,1)] shadow-[4px_0_24px_rgba(0,0,0,0.22)] ${
          sidebarOpen ? 'max-[900px]:translate-x-0' : 'max-[900px]:-translate-x-full'
        } ${desktopCollapsed ? 'min-[901px]:-translate-x-full' : 'min-[901px]:translate-x-0'}`}
      >
        {/* Marca */}
        <div className="px-4 h-[60px] flex items-center justify-between gap-3 border-b border-white/[0.08] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-[36px] h-[36px] bg-[#2563eb] rounded-[10px] flex items-center justify-center shrink-0 shadow-md shadow-blue-600/30">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-white w-[19px] h-[19px]"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="text-[1.02rem] font-extrabold text-white tracking-[-0.3px] leading-[1.15]">
              Sectrum
              <small className="block text-[0.72rem] font-medium text-white/45 tracking-normal">
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
            <X size={19} />
          </button>
        </div>

        {/* Card compacto do usuário */}
        <div className="mx-3 mt-2.5 px-3 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.06] flex items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-[34px] h-[34px] rounded-full flex items-center justify-center font-extrabold text-[0.78rem] text-white shrink-0 tracking-[0.5px]"
              style={{ background: avCor }}
            >
              {avIni}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[0.88rem] font-bold text-white truncate">{usuario.nome}</div>
              <div className="text-[0.72rem] text-white/45 capitalize leading-tight">
                {usuario.perfil}
              </div>
            </div>
          </div>
          <button
            onClick={sair}
            className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-white/[0.08] transition-colors shrink-0 cursor-pointer"
            title="Sair do Sistema"
            aria-label="Sair do Sistema"
          >
            <LogOut size={16} />
          </button>
        </div>

        {/* Filtro Rápido do Menu Lateral */}
        <div className="px-3 pt-2.5 pb-1 shrink-0">
          <div className="relative flex items-center">
            <Search size={14} className="absolute left-3 text-white/40 pointer-events-none" />
            <input
              type="text"
              value={filtroMenu}
              onChange={(e) => setFiltroMenu(e.target.value)}
              placeholder="Filtrar menu (ex: PIX, CND, Ata)..."
              className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-white/[0.07] border border-white/[0.1] focus:border-blue-400 focus:bg-white/[0.11] text-white placeholder:text-white/35 text-xs font-medium outline-none transition"
            />
            {filtroMenu ? (
              <button
                type="button"
                onClick={() => setFiltroMenu('')}
                className="absolute right-2 text-white/45 hover:text-white cursor-pointer"
                aria-label="Limpar filtro"
              >
                <X size={13} />
              </button>
            ) : (
              <button
                type="button"
                onClick={alternarTodosGrupos}
                className="absolute right-2 text-white/35 hover:text-white/80 cursor-pointer"
                title={todosAbertos ? 'Recolher categorias secundárias' : 'Expandir todas as categorias'}
              >
                <ChevronsUpDown size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Navegação Indexada em Categorias Recolhíveis (Accordion) */}
        <nav className="flex-1 overflow-y-auto px-3 py-2 sidebar-scroll space-y-1.5">
          {gruposVisiveisSidebar.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-white/45 space-y-2">
              <div>Nenhum menu com &quot;{filtroMenu}&quot;.</div>
              <button
                type="button"
                onClick={() => {
                  const q = filtroMenu;
                  setFiltroMenu('');
                  setSidebarOpen(false);
                  setPesquisaAberta(true);
                  void q;
                }}
                className="px-3 py-1.5 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 font-bold text-xs cursor-pointer"
              >
                🔎 Usar Pesquisa Inteligente Global
              </button>
            </div>
          ) : (
            gruposVisiveisSidebar.map((group) => {
              const filtrando = filtroMenu.trim() !== '';
              const aberto = filtrando || Boolean(gruposAbertos[group.id]);
              const contemRotaAtiva = group.itens.some((i) => i.caminho === location.pathname);
              const badgeGrupo = group.itens.reduce((soma, i) => soma + badgeDoItem(i.caminho), 0);

              return (
                <div
                  key={group.id}
                  className={`rounded-xl transition-colors ${
                    aberto ? 'bg-white/[0.025]' : ''
                  }`}
                >
                  {/* Cabeçalho clicável da Categoria */}
                  <button
                    type="button"
                    onClick={() => alternarGrupoAccordion(group.id)}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left transition cursor-pointer select-none ${
                      contemRotaAtiva
                        ? 'text-blue-300 hover:bg-white/[0.06]'
                        : 'text-white/50 hover:text-white/85 hover:bg-white/[0.05]'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      {aberto ? (
                        <ChevronDown size={14} className="shrink-0 opacity-80" />
                      ) : (
                        <ChevronRight size={14} className="shrink-0 opacity-80" />
                      )}
                      <span className="text-[0.72rem] font-extrabold uppercase tracking-[1px] truncate">
                        {group.titulo}
                      </span>
                    </span>

                    <span className="flex items-center gap-1.5 shrink-0">
                      {!aberto && badgeGrupo > 0 && (
                        <span className="bg-red-500 text-white text-[0.68rem] font-extrabold px-1.5 py-0.2 rounded-full">
                          {badgeGrupo}
                        </span>
                      )}
                      <span className="text-[0.68rem] font-bold text-white/30">
                        {group.itens.length}
                      </span>
                    </span>
                  </button>

                  {/* Itens da Categoria */}
                  {aberto && (
                    <div className="pt-0.5 pb-1 px-1 space-y-1">
                      {group.itens.map((item) => {
                        const Icon = item.icone;
                        const isActive = location.pathname === item.caminho;
                        const badge = badgeDoItem(item.caminho);
                        return (
                          <Link
                            key={item.caminho}
                            to={item.caminho}
                            onClick={() => setSidebarOpen(false)}
                            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[0.9rem] transition-all duration-150 relative ${
                              isActive
                                ? 'bg-[#2563eb] text-white font-bold shadow-[0_3px_12px_rgba(37,99,235,0.42)]'
                                : 'text-white/80 font-medium hover:bg-white/[0.09] hover:text-white active:bg-white/[0.14]'
                            }`}
                          >
                            <span
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                                isActive ? 'bg-white/20 text-white' : 'bg-white/[0.06] text-blue-300'
                              }`}
                            >
                              <Icon size={17} className="shrink-0" />
                            </span>
                            <span className="leading-snug truncate">{item.nome}</span>
                            {badge > 0 && (
                              <span
                                className={`ml-auto text-white text-[0.72rem] font-extrabold px-2 py-0.5 rounded-full leading-[1.3] ${
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
                  )}
                </div>
              );
            })
          )}
        </nav>

        {/* Rodapé enxuto da Sidebar */}
        <div className="p-2.5 border-t border-white/[0.08] shrink-0">
          <a
            href={LINK_SUPORTE}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-emerald-500/[0.13] hover:bg-emerald-500/[0.22] text-[#34d399] text-[0.82rem] font-bold transition-colors"
          >
            <span className="flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-[16px] h-[16px] shrink-0"
              >
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              <span>Suporte WhatsApp</span>
            </span>
            <span className="text-[0.74rem] opacity-85">(98) 98598-3566</span>
          </a>
        </div>
      </aside>

      {/* MAIN */}
      <div
        style={{ paddingBottom: ehAndroidNativo ? safeBottomCss : undefined }}
        className={`flex-1 flex flex-col min-h-screen min-w-0 transition-[margin] duration-250 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          desktopCollapsed ? 'min-[901px]:ml-0' : 'min-[901px]:ml-[280px]'
        }`}
      >
        {/* Topbar Limpa com Breadcrumb + Pesquisa Inteligente Central (Ctrl+K) */}
        <header
          style={{
            paddingTop: appNativoComBarras ? `calc(${safeTopCss} + 8px)` : undefined,
            paddingBottom: appNativoComBarras ? '10px' : undefined,
          }}
          className="min-h-[60px] bg-white/95 backdrop-blur-md px-5 max-[900px]:px-3 flex items-center justify-between border-b border-slate-200/80 sticky top-0 z-[100] gap-2.5"
        >
          {/* Esquerda: Botão Menu + Breadcrumb da Categoria & Página */}
          <div className="flex items-center gap-2.5 min-w-0 shrink">
            <button
              type="button"
              onClick={alternarMenu}
              className="px-3 py-2 min-h-[38px] rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300/80 text-slate-800 border border-slate-200/90 transition-colors shrink-0 cursor-pointer flex items-center gap-1.5 shadow-2xs touch-manipulation select-none"
              aria-label="Alternar Menu Lateral"
              title={desktopCollapsed ? 'Mostrar menu lateral' : 'Recolher menu lateral'}
            >
              <span className="min-[901px]:hidden flex items-center gap-1">
                <Menu size={20} className="text-blue-600" />
                <span className="text-xs font-extrabold text-slate-800">Menu</span>
              </span>
              <span className="max-[900px]:hidden">
                {desktopCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
              </span>
            </button>

            <div className="min-w-0" title={tituloCompletoPagina}>
              {grupoAtivo && (
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 leading-none mb-0.5 truncate max-[640px]:hidden">
                  {grupoAtivo.titulo}
                </div>
              )}
              <div className="flex items-center gap-1.5 text-[0.96rem] font-extrabold text-[#0f172a] truncate">
                <IconePagina size={17} className="text-[#2563eb] shrink-0" />
                <span className="truncate">{tituloCurtoPagina}</span>
              </div>
            </div>
          </div>

          {/* Centro: Barra de Pesquisa Rápida & Inteligente (Desktop/Tablet) */}
          <div className="flex-1 max-w-md mx-2 max-[720px]:hidden">
            <button
              type="button"
              onClick={() => setPesquisaAberta(true)}
              className="w-full flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-slate-100/90 hover:bg-slate-200/75 border border-slate-200/90 text-slate-500 hover:text-slate-800 transition cursor-pointer shadow-2xs"
              title="Abrir Pesquisa Rápida e Inteligente (Ctrl+K)"
            >
              <span className="flex items-center gap-2 min-w-0 truncate text-xs font-semibold">
                <Search size={15} className="text-blue-600 shrink-0" />
                <span className="truncate">
                  {usuario.perfil === 'morador'
                    ? 'Pesquisar boletos PIX, CND, reservas, docs...'
                    : 'Pesquisa inteligente (apto, morador, placa, NF, tela)...'}
                </span>
              </span>
              <kbd className="px-1.5 py-0.5 rounded-md bg-white border border-slate-300 text-[10px] font-mono font-bold text-slate-500 shrink-0">
                Ctrl K
              </kbd>
            </button>
          </div>

          {/* Direita: Lupa Mobile + Seletor Condomínio + Notificações + Tela Cheia + Avatar */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Gatilho rápido de Pesquisa no Mobile */}
            <button
              type="button"
              onClick={() => setPesquisaAberta(true)}
              className="min-[721px]:hidden px-2.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 flex items-center gap-1 text-xs font-extrabold cursor-pointer shrink-0"
              aria-label="Pesquisa Rápida"
              title="Pesquisa Rápida e Inteligente"
            >
              <Search size={16} />
              <span className="max-[390px]:hidden">Buscar</span>
            </button>

            {usuario.superadmin && <SeletorCondominio />}

            <button
              onClick={alternarTelaCheia}
              className="max-[640px]:hidden w-[34px] h-[34px] rounded-[8px] flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
              title={emTelaCheia ? 'Sair da Tela Cheia (ESC)' : 'Modo Operacional em Tela Cheia'}
            >
              {emTelaCheia ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>

            {notif.total > 0 && (
              <Link
                to={notif.precadastros > 0 ? '/precadastros' : '/visitas'}
                className="w-[34px] h-[34px] rounded-[8px] flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors relative"
                title={`${notif.total} notificação(ões)`}
              >
                <Bell size={17} />
                <span className="absolute top-[2px] right-[2px] bg-[#ef4444] text-white text-[0.55em] font-extrabold px-[4px] py-[2px] rounded-[20px] min-w-[16px] text-center leading-[1.3]">
                  {notif.total}
                </span>
              </Link>
            )}

            {/* Avatar do usuário com menu dropdown */}
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

        {/* Central de Pesquisa Rápida & Inteligente (Ctrl+K) */}
        <ModalPesquisaInteligente
          aberto={pesquisaAberta}
          usuario={usuario}
          onFechar={() => setPesquisaAberta(false)}
          onAbrirFichaUnidade360={(unidId) => setFicha360GlobalId(unidId)}
        />

        {/* Ficha 360º aberta diretamente pela Pesquisa Inteligente de qualquer tela */}
        {ficha360GlobalId !== null && (
          <ModalFichaUnidade360
            unidadeId={ficha360GlobalId}
            limiteVagasCondominio={2}
            onFechar={() => setFicha360GlobalId(null)}
          />
        )}

        {excluirContaAberto && (
          <ModalExcluirConta perfil={usuario.perfil} onFechar={() => setExcluirContaAberto(false)} />
        )}

        {/* Monitor global de Transbordo Automático de Interfone + Registro de Push do Watchdog para Portaria/Síndico/Admin */}
        {usuario.perfil !== 'morador' && (
          <MonitorTransbordoPortaria condominioId={usuario.condominio_id ?? null} />
        )}

        {/* Tela global de Alarme da Lista de Restrição Facial (Portaria, Admin/Supervisor e Síndico) */}
        {usuario.perfil !== 'morador' && usuario.modulo_seguranca_facial && usuario.condominio_id && (
          <MonitorAlarmesRestricao condominioId={usuario.condominio_id} />
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
            <LimiteErro chave={`${location.pathname}:${usuario.condominio_id ?? 'geral'}`}>
              <div key={`${location.pathname}:${usuario.condominio_id ?? 'geral'}`} className="contents">
                <Outlet />
              </div>
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
