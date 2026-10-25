import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Cpu, Plus, Pencil, RefreshCw, Trash2, Lock, Wifi, X, PhoneCall, ShieldAlert, Clock, CheckCircle2, AlertTriangle, Download } from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import { useSessao } from '../lib/useSessao';

// Paridade com src/views/pontos.php: card "Dispositivos de Acesso" (Nome, IP/Porta, Status, Ações: Testar, Editar, Sync, Excluir)
// e card "Cadastrar Terminal" / "Editar Terminal" com Configuração de Portas (Abertura via App).
// Inclui diagnóstico real HTTP/ISAPI (/ISAPI/System/deviceInfo) individual e em lote, com latência (ms), modelo, firmware e MAC.

interface Dispositivo {
  id: number; nome: string; ip: string; porta: number; usuario: string;
  tipo_acesso: string; bloco_id: number | null; bloco_nome: string | null;
  porta_1_ativa: boolean; porta_1_nome: string | null; porta_2_ativa: boolean; porta_2_nome: string | null;
}
interface Bloco { id: number; nome: string }
interface Aviso { tipo: 'ok' | 'aviso' | 'erro'; mensagem: string }
interface DiagTerminal {
  status: 'online' | 'offline';
  autenticado: boolean;
  http_code: number;
  latencia_ms: number | null;
  tempo_total_ms: number | null;
  modelo: string | null;
  firmware: string | null;
  mac: string | null;
  device_name: string | null;
  mensagem: string;
  testado_em: string;
}
interface ItemFilaSync {
  id: number;
  controlador_id: number;
  controlador_nome: string | null;
  usuario_id: number;
  acao: 'sincronizarFace' | 'excluirUsuario' | 'sincronizarRamal' | string;
  nome: string | null;
  tentativas: number;
  ultimo_erro: string | null;
  criado_em: string;
  atualizado_em: string;
}
interface EventoWatchdog {
  id: number;
  controlador_id: number;
  controlador_nome: string;
  evento: 'queda' | 'restauracao' | string;
  status_novo: string;
  latencia_ms: number | null;
  mensagem: string | null;
  notificacoes_enviadas: number;
  criado_em: string;
}
interface Form {
  id: number | null; nome: string; ip: string; porta: string; usuario: string; senha: string;
  tipo_acesso: string; bloco_id: string; porta_1_ativa: boolean; porta_1_nome: string; porta_2_ativa: boolean; porta_2_nome: string;
}

const VAZIO: Form = {
  id: null, nome: '', ip: '', porta: '80', usuario: '', senha: '', tipo_acesso: 'geral_pedestre', bloco_id: '',
  porta_1_ativa: true, porta_1_nome: 'Portão Pedestre', porta_2_ativa: false, porta_2_nome: 'Portão Veículos',
};
const entrada = 'w-full px-3 py-2.5 border border-slate-300 rounded-lg outline-none focus:border-blue-500 bg-white text-slate-900';
const th = 'text-left text-[0.72rem] font-extrabold uppercase tracking-wide text-slate-500 px-4 py-3 border-b border-slate-200';
const td = 'px-4 py-3 border-b border-slate-100 text-sm';
const CORES_AVISO = {
  ok: 'bg-emerald-50 border-emerald-500 text-emerald-800',
  aviso: 'bg-amber-50 border-amber-500 text-amber-800',
  erro: 'bg-rose-50 border-rose-500 text-rose-800',
};

function corLatencia(ms: number | null): string {
  if (ms === null) return 'bg-slate-100 text-slate-500';
  if (ms <= 100) return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  if (ms <= 300) return 'bg-amber-50 text-amber-700 border border-amber-200';
  return 'bg-rose-50 text-rose-700 border border-rose-200';
}

/** Extrai a letra ou número do bloco a partir de qualquer nomenclatura ("Bloco A" -> "A", "AC Bloco 01" -> "1", "Torre B" -> "B"). */
function extrairChaveBloco(texto: string): string | null {
  const limpo = texto.trim();
  if (!limpo) return null;
  const m = limpo.match(/\b(?:bloco|blovo|torre|quadra|bl)\s*[-:.º°]*\s*([a-z0-9]+)\b/i);
  if (m) {
    const ch = m[1].toUpperCase();
    return /^\d+$/.test(ch) ? String(Number(ch)) : ch;
  }
  const mCurto = limpo.match(/^([a-z]|\d{1,3})$/i);
  if (mCurto) {
    const ch = mCurto[1].toUpperCase();
    return /^\d+$/.test(ch) ? String(Number(ch)) : ch;
  }
  return null;
}

/** Detecta se o nome do terminal refere-se a um Bloco/Torre específico e encontra o bloco correspondente na lista. */
function detectarBlocoDoTerminal(nomeTerminal: string, blocos: Bloco[]): { ehNomeDeBloco: boolean; blocoEncontrado: Bloco | null; chaveSugerida: string | null } {
  const txt = nomeTerminal.trim();
  const temPalavraPortaria = /\b(?:portaria|rua|geral|veiculo|veículo|guarita)\b/i.test(txt);
  const temPalavraBloco = /\b(?:bloco|blovo|torre|quadra)\b/i.test(txt);
  if (temPalavraPortaria || !temPalavraBloco) {
    return { ehNomeDeBloco: false, blocoEncontrado: null, chaveSugerida: null };
  }
  const chave = extrairChaveBloco(txt);
  const exato = blocos.find((b) => b.nome.trim().toLowerCase() === txt.toLowerCase());
  if (exato) return { ehNomeDeBloco: true, blocoEncontrado: exato, chaveSugerida: chave };
  if (chave) {
    const porChave = blocos.find((b) => extrairChaveBloco(b.nome) === chave);
    if (porChave) return { ehNomeDeBloco: true, blocoEncontrado: porChave, chaveSugerida: chave };
  }
  return { ehNomeDeBloco: true, blocoEncontrado: null, chaveSugerida: chave };
}

function ehTerminalIsup(ip: string, porta: number | string): boolean {
  const ipStr = (ip || '').trim().toLowerCase();
  if (ipStr.startsWith('isup://') || Number(porta) === 7660) return true;
  return ipStr !== '' && !ipStr.includes('.');
}

function limparDeviceIdIsup(ip: string): string {
  return (ip || '').trim().replace(/^isup:\/\//i, '').trim();
}

export default function Terminais() {
  const { usuario } = useSessao();
  const ehAdminSistema = Boolean(usuario?.superadmin || usuario?.perfil === 'superadmin' || usuario?.perfil === 'admin');
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [status, setStatus] = useState<Record<number, string> | null>(null);
  const [detalhes, setDetalhes] = useState<Record<number, DiagTerminal>>({});
  const [testandoTodos, setTestandoTodos] = useState(false);
  const [testandoId, setTestandoId] = useState<number | null>(null);
  const [testeForm, setTesteForm] = useState<DiagTerminal | null>(null);
  const [testandoForm, setTestandoForm] = useState(false);
  const [modoConexaoForm, setModoConexaoForm] = useState<'ip' | 'isup'>('ip');
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [terminalInterfone, setTerminalInterfone] = useState<Dispositivo | null>(null);
  const [unidadeDiscar, setUnidadeDiscar] = useState('1');
  const [chamandoInterfone, setChamandoInterfone] = useState(false);
  const [configurandoInterfone, setConfigurandoInterfone] = useState(false);
  const [filaSync, setFilaSync] = useState<ItemFilaSync[]>([]);
  const [filaPorControlador, setFilaPorControlador] = useState<Record<number, number>>({});
  const [historicoWatchdog, setHistoricoWatchdog] = useState<EventoWatchdog[]>([]);
  const [processandoFila, setProcessandoFila] = useState(false);
  const [abaMonitoramento, setAbaMonitoramento] = useState<'fila' | 'watchdog'>('fila');
  const refForm = useRef<HTMLDivElement>(null);

  const carregarWatchdogFila = useCallback(async () => {
    try {
      const r = await api<{
        fila_sincronizacao: ItemFilaSync[];
        fila_por_controlador: Record<number, number>;
        historico_watchdog: EventoWatchdog[];
      }>('pontos_watchdog_fila');
      setFilaSync(r.fila_sincronizacao ?? []);
      setFilaPorControlador(r.fila_por_controlador ?? {});
      setHistoricoWatchdog(r.historico_watchdog ?? []);
    } catch {
      // ignora silenciosamente se não disponível
    }
  }, []);

  const processarFilaAgora = async (controladorId?: number) => {
    setProcessandoFila(true);
    try {
      const r = await api<{
        tipo: 'ok' | 'aviso';
        mensagem: string;
        fila: { processados: number; sucessos: number; falhas: number; pendentes_restantes: number };
      }>('pontos_processar_fila', {
        corpo: controladorId ? { controlador_id: controladorId } : {},
      });
      setAviso({ tipo: r.tipo ?? 'ok', mensagem: r.mensagem });
      await Promise.all([testarTodos(false), carregarWatchdogFila()]);
    } catch (err) {
      setAviso({ tipo: 'erro', mensagem: err instanceof ErroApi ? err.message : 'Falha ao processar fila.' });
    } finally {
      setProcessandoFila(false);
    }
  };

  const removerItemFila = async (idItem: number) => {
    try {
      const r = await api<Aviso>('pontos_limpar_item_fila', { corpo: { id: idItem } });
      setAviso(r);
      await carregarWatchdogFila();
    } catch (err) {
      setAviso({ tipo: 'erro', mensagem: err instanceof ErroApi ? err.message : 'Erro ao remover item da fila.' });
    }
  };

  const chamarUnidadeInterfone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalInterfone || !unidadeDiscar.trim()) return;
    setChamandoInterfone(true);
    try {
      const r = await api<Aviso>('pontos_interfone_chamar', {
        corpo: { terminal_id: terminalInterfone.id, numero_unidade: unidadeDiscar.trim() },
      });
      setAviso(r);
    } catch (err) {
      setAviso({ tipo: 'erro', mensagem: err instanceof ErroApi ? err.message : 'Falha ao chamar unidade.' });
    } finally {
      setChamandoInterfone(false);
    }
  };

  const configurarInterfoneTerminal = async () => {
    if (!terminalInterfone) return;
    setConfigurandoInterfone(true);
    try {
      const r = await api<Aviso>('pontos_interfone_configurar', {
        corpo: { terminal_id: terminalInterfone.id },
      });
      setAviso(r);
      await carregarWatchdogFila();
    } catch (err) {
      setAviso({ tipo: 'erro', mensagem: err instanceof ErroApi ? err.message : 'Falha ao configurar interfone.' });
    } finally {
      setConfigurandoInterfone(false);
    }
  };

  const testarTodos = useCallback(async (mostrarResumo = false) => {
    setTestandoTodos(true);
    try {
      const r = await api<{ conexao: Record<number, string>; detalhes?: Record<number, DiagTerminal> }>('pontos_status');
      setStatus(r.conexao ?? {});
      if (r.detalhes) {
        setDetalhes(r.detalhes);
        if (mostrarResumo) {
          const vals = Object.values(r.detalhes);
          const on = vals.filter((v) => v.status === 'online').length;
          const off = vals.length - on;
          const lats = vals.map((v) => v.latencia_ms).filter((x): x is number => x !== null);
          const media = lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : 0;
          setAviso({
            tipo: off === 0 ? 'ok' : on > 0 ? 'aviso' : 'erro',
            mensagem: `Diagnóstico concluído: ${on} online, ${off} offline${lats.length ? ` · Latência média: ${media} ms` : ''}.`,
          });
        }
      }
      await carregarWatchdogFila();
    } catch {
      setStatus({});
    } finally {
      setTestandoTodos(false);
    }
  }, [carregarWatchdogFila]);

  const testarUm = async (d: Dispositivo) => {
    setTestandoId(d.id);
    try {
      const r = await api<{ conexao: Record<number, string>; detalhes?: Record<number, DiagTerminal> }>('pontos_status', { query: { id: d.id } });
      setStatus((ant) => ({ ...(ant ?? {}), ...(r.conexao ?? {}) }));
      const diag = r.detalhes?.[d.id];
      if (diag) {
        setDetalhes((ant) => ({ ...ant, [d.id]: diag }));
        const infoExtra = [
          diag.latencia_ms !== null ? `${diag.latencia_ms} ms` : null,
          diag.modelo ? `Modelo ${diag.modelo}` : null,
          diag.firmware ? `FW ${diag.firmware}` : null,
        ].filter(Boolean).join(' · ');
        setAviso({
          tipo: diag.status === 'online' && diag.autenticado ? 'ok' : diag.status === 'online' ? 'aviso' : 'erro',
          mensagem: `${d.nome} (${d.ip}:${d.porta}): ${diag.mensagem}${infoExtra ? ` — ${infoExtra}` : ''}`,
        });
      }
      await carregarWatchdogFila();
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : `Falha ao testar ${d.nome}.` });
    } finally {
      setTestandoId(null);
    }
  };

  const testarConexaoFormulario = async () => {
    if (!form) return;
    setTestandoForm(true);
    setTesteForm(null);
    try {
      const ipEnvio = modoConexaoForm === 'isup' ? `isup://${limparDeviceIdIsup(form.ip)}` : form.ip.trim();
      const portaEnvio = modoConexaoForm === 'isup' ? 7660 : (Number(form.porta) || 80);
      const r = await api<{ diagnostico: DiagTerminal }>('pontos_testar_form', {
        corpo: {
          ...(form.id ? { id: form.id } : {}),
          ip: ipEnvio,
          porta: portaEnvio,
          usuario: form.usuario || 'admin',
          senha: form.senha,
        },
      });
      setTesteForm(r.diagnostico);
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro ao testar conexão.' });
    } finally {
      setTestandoForm(false);
    }
  };

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ dispositivos: Dispositivo[]; blocos: Bloco[] }>('pontos_listar');
      setDispositivos(r.dispositivos);
      setBlocos(r.blocos);
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro ao carregar os terminais.' });
    } finally {
      setCarregando(false);
    }
    setStatus(null);
    testarTodos(false);
    carregarWatchdogFila();
  }, [testarTodos, carregarWatchdogFila]);

  useEffect(() => { carregar(); }, [carregar]);

  const rolarTopo = () => document.querySelector('main .overflow-auto')?.scrollTo({ top: 0, behavior: 'smooth' });

  const executar = async (chave: string, rota: string, corpo: Record<string, unknown>, aoConcluir?: () => void) => {
    setOcupado(chave);
    try {
      const r = await api<{ tipo?: 'ok' | 'aviso'; mensagem: string; hardware?: { modo: string } }>(rota, { corpo });
      const simulado = r.hardware?.modo === 'simulado' ? ' (modo SIMULADO: nada foi enviado aos equipamentos)' : '';
      setAviso({ tipo: r.tipo ?? 'ok', mensagem: r.mensagem + simulado });
      aoConcluir?.();
      await carregar();
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro inesperado.' });
    } finally {
      setOcupado(null);
      rolarTopo();
    }
  };

  const abrirForm = (f: Form, modo?: 'ip' | 'isup') => {
    setTesteForm(null);
    const detIsup = modo ? modo === 'isup' : ehTerminalIsup(f.ip, f.porta);
    setModoConexaoForm(detIsup ? 'isup' : 'ip');
    setForm({
      ...f,
      ip: detIsup ? limparDeviceIdIsup(f.ip) : f.ip,
      porta: detIsup ? '7660' : (f.porta === '7660' ? '80' : f.porta),
      usuario: f.usuario || 'admin',
    });
    setTimeout(() => refForm.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const editar = (d: Dispositivo) => abrirForm({
    id: d.id, nome: d.nome, ip: d.ip, porta: String(d.porta ?? 80), usuario: d.usuario ?? 'admin', senha: '',
    tipo_acesso: d.tipo_acesso || 'geral_pedestre', bloco_id: d.bloco_id ? String(d.bloco_id) : '',
    porta_1_ativa: d.porta_1_ativa !== false, porta_1_nome: d.porta_1_nome ?? 'Portão Pedestre',
    porta_2_ativa: !!d.porta_2_ativa, porta_2_nome: d.porta_2_nome ?? 'Portão Veículos',
  });

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const { id, ...resto } = form;
    const blocoIdNum = form.bloco_id === '__auto__' ? 0 : Number(form.bloco_id) || 0;
    const ipSalvar = modoConexaoForm === 'isup' ? `isup://${limparDeviceIdIsup(form.ip)}` : form.ip.trim();
    const portaSalvar = modoConexaoForm === 'isup' ? 7660 : (Number(form.porta) || 80);
    executar('salvar', 'pontos_salvar', {
      ...resto,
      ...(id ? { id } : {}),
      ip: ipSalvar,
      porta: portaSalvar,
      usuario: form.usuario.trim() || 'admin',
      bloco_id: blocoIdNum,
    }, () => setForm(null));
  };

  /** Altera diretamente na linha da tabela se o terminal é Portaria Geral ou exclusivo de um Bloco específico. */
  const alterarVinculoRapido = (d: Dispositivo, valorSelect: string) => {
    if (valorSelect === 'geral_pedestre') {
      executar(`vinc-${d.id}`, 'pontos_alterar_vinculo', { id: d.id, tipo_acesso: 'geral_pedestre', bloco_id: null });
    } else if (valorSelect.startsWith('bloco:')) {
      const idB = Number(valorSelect.slice(6));
      executar(`vinc-${d.id}`, 'pontos_alterar_vinculo', { id: d.id, tipo_acesso: 'bloco', bloco_id: idB });
    } else if (valorSelect.startsWith('novo:')) {
      const nomeNovo = valorSelect.slice(5);
      executar(`vinc-${d.id}`, 'pontos_alterar_vinculo', { id: d.id, tipo_acesso: 'bloco', bloco_id: 0, novo_bloco_nome: nomeNovo });
    }
  };

  const sync = (d: Dispositivo) => {
    if (window.confirm('Deseja enviar as fotos dos moradores autorizados para este terminal? O processo pode levar alguns segundos.')) {
      executar(`sync-${d.id}`, 'pontos_sync', { id: d.id });
    }
  };
  const importarDoLeitor = (d: Dispositivo) => {
    if (
      window.confirm(
        `Deseja importar os cadastros e fotos faciais que já existem no leitor "${d.nome}" para o sistema?\n\n` +
        `• Moradores já cadastrados terão a foto facial atualizada;\n` +
        `• Novos moradores serão criados automaticamente;\n` +
        `• Cadastros sem CPF válido serão importados e sinalizados para o Síndico atualizar o CPF.`
      )
    ) {
      executar(`imp-${d.id}`, 'pontos_importar_leitor', { id: d.id });
    }
  };
  const excluir = (d: Dispositivo) => {
    if (window.confirm('Tem certeza que deseja excluir este terminal?')) {
      executar(`del-${d.id}`, 'pontos_excluir', { id: d.id }, () => { if (form?.id === d.id) setForm(null); });
    }
  };

  const muda = (campo: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (!form) return;
    const alvo = e.target as HTMLInputElement;
    const novoValor = alvo.type === 'checkbox' ? alvo.checked : alvo.value;
    const atualizado: Form = { ...form, [campo]: novoValor };

    // Ao digitar o nome do terminal (ex: "Bloco A", "Bloco B", "AC Bloco 1"), reconhece automaticamente o bloco correspondente
    if (campo === 'nome' && typeof novoValor === 'string') {
      const det = detectarBlocoDoTerminal(novoValor, blocos);
      if (det.ehNomeDeBloco) {
        atualizado.tipo_acesso = 'bloco';
        if (det.blocoEncontrado) {
          atualizado.bloco_id = String(det.blocoEncontrado.id);
        } else if (!atualizado.bloco_id) {
          atualizado.bloco_id = '__auto__';
        }
      }
    }
    setForm(atualizado);
  };

  const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50';

  const listaDet = Object.values(detalhes);
  const qtdOnline = listaDet.filter((x) => x.status === 'online').length;
  const qtdOffline = listaDet.filter((x) => x.status === 'offline').length;
  const latencias = listaDet.map((x) => x.latencia_ms).filter((x): x is number => x !== null);
  const mediaMs = latencias.length ? Math.round(latencias.reduce((a, b) => a + b, 0) / latencias.length) : null;
  const horarioTeste = listaDet[0]?.testado_em ?? null;

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8">
      {terminalInterfone && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setTerminalInterfone(null);
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border-t-4 border-t-indigo-600 p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                  <PhoneCall size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Interfone Digital · {terminalInterfone.nome}</h3>
                  <p className="text-xs text-slate-500">Discagem do leitor facial direto para o App do Morador</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTerminalInterfone(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-indigo-50/80 border border-indigo-200 text-xs text-indigo-950 space-y-1.5">
              <div className="font-extrabold">Como o visitante ou entregador chama na tela do leitor facial:</div>
              <ol className="list-decimal list-inside space-y-1 text-indigo-900">
                <li>Na tela do leitor facial, toca no ícone de <b>Interfone / Telefone (📞)</b>;</li>
                <li>Digita o número da <b>Unidade / Casa / Apartamento</b> (ex.: <b>1</b>, <b>2</b>, <b>101</b>) e toca em <b>Chamar</b>;</li>
                <li>O celular de todos os moradores daquela unidade toca na hora com vídeo ao vivo, áudio bidirecional e botão <b>🔓 Abrir Porta</b>!</li>
              </ol>
            </div>

            <form onSubmit={chamarUnidadeInterfone} className="space-y-2.5 pt-1">
              <label className="block text-xs font-extrabold uppercase text-slate-600">
                Testar / Chamar Unidade Agora no App do Morador:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={unidadeDiscar}
                  onChange={(e) => setUnidadeDiscar(e.target.value)}
                  placeholder="Ex: 1, 2, 101..."
                  className={entrada}
                />
                <button
                  type="submit"
                  disabled={chamandoInterfone}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm shrink-0 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <PhoneCall size={15} />
                  {chamandoInterfone ? 'Chamando...' : 'Chamar no App'}
                </button>
              </div>
            </form>

            <div className="pt-3 border-t border-slate-200 flex flex-col gap-2">
              <button
                type="button"
                disabled={configurandoInterfone}
                onClick={configurarInterfoneTerminal}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw size={14} className={configurandoInterfone ? 'animate-spin' : ''} />
                {configurandoInterfone
                  ? 'Configurando SIP e sincronizando ramais...'
                  : '⚙️ Configurar Leitor e Sincronizar Ramais dos Moradores'}
              </button>
            </div>
          </div>
        </div>
      )}

      {aviso && (
        <div className={`border-l-4 px-4 py-3 rounded-lg text-sm font-semibold mb-5 flex justify-between gap-3 ${CORES_AVISO[aviso.tipo]}`}>
          <span>{aviso.mensagem}</span>
          <button onClick={() => setAviso(null)} aria-label="Fechar aviso"><X size={16} /></button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 text-lg font-extrabold text-slate-900"><Cpu size={18} /> Dispositivos de Acesso</div>
            <p className="text-xs text-slate-500 mt-0.5">
              Defina na coluna <b>Regra de Acesso (Bloco)</b> se o terminal é da <b>Portaria Geral</b> (liberado a todos os blocos) ou <b>Exclusivo de um Bloco</b> (só moradores daquele bloco acessam, sem precisar editar morador por morador).
            </p>
            {status !== null && listaDet.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  ● {qtdOnline} Online
                </span>
                <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-md border ${qtdOffline > 0 ? 'text-rose-700 bg-rose-50 border-rose-200' : 'text-slate-500 bg-slate-50 border-slate-200'}`}>
                  ● {qtdOffline} Offline
                </span>
                {mediaMs !== null && (
                  <span className="font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                    Latência média: <b>{mediaMs} ms</b>
                  </span>
                )}
                {horarioTeste && (
                  <span className="text-slate-400">Verificado às {horarioTeste}</span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={testandoTodos || dispositivos.length === 0}
              onClick={() => testarTodos(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm disabled:opacity-50"
            >
              <Activity size={16} className={testandoTodos ? 'animate-spin' : ''} />
              {testandoTodos ? 'Testando Todos...' : 'Testar Todos'}
            </button>
            <button onClick={() => abrirForm(VAZIO, 'ip')} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm">
              <Plus size={16} /> Novo Terminal
            </button>
          </div>
        </div>
        {carregando ? (
          <div className="text-center text-slate-400 py-12">Carregando terminais...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Nome</th>
                  <th className={th}>Regra de Acesso (Bloco)</th>
                  <th className={th}>IP / Conexão</th>
                  <th className={th}>Status / Diagnóstico</th>
                  <th className={th}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {dispositivos.map((d) => {
                  const s = status?.[d.id];
                  const diag = detalhes[d.id];
                  const emTeste = testandoTodos || testandoId === d.id;
                  const ehPorBloco = d.tipo_acesso === 'bloco' && d.bloco_id !== null;
                  const valorVinculo = ehPorBloco ? `bloco:${d.bloco_id}` : 'geral_pedestre';
                  const sugestao = !ehPorBloco ? detectarBlocoDoTerminal(d.nome, blocos) : null;
                  const isIsup = ehTerminalIsup(d.ip, d.porta);

                  return (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className={`${td} font-semibold text-slate-900`}>{d.nome}</td>
                      <td className={td}>
                        <div className="flex flex-col gap-1">
                          <select
                            value={valorVinculo}
                            disabled={ocupado !== null}
                            onChange={(e) => alterarVinculoRapido(d, e.target.value)}
                            className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border outline-none cursor-pointer transition ${
                              ehPorBloco
                                ? 'bg-purple-50 text-purple-900 border-purple-300 hover:border-purple-400'
                                : 'bg-blue-50 text-blue-900 border-blue-200 hover:border-blue-300'
                            }`}
                          >
                            <option value="geral_pedestre">🌐 Portaria Geral (Todos os Blocos)</option>
                            {blocos.map((b) => (
                              <option key={b.id} value={`bloco:${b.id}`}>
                                🏢 Só Moradores: {b.nome}
                              </option>
                            ))}
                            {sugestao?.ehNomeDeBloco && !sugestao.blocoEncontrado && sugestao.chaveSugerida && (
                              <option value={`novo:Bloco ${sugestao.chaveSugerida}`}>
                                ➕ Criar e vincular "Bloco {sugestao.chaveSugerida}"
                              </option>
                            )}
                          </select>
                          {sugestao?.ehNomeDeBloco && sugestao.blocoEncontrado && (
                            <button
                              type="button"
                              onClick={() => alterarVinculoRapido(d, `bloco:${sugestao.blocoEncontrado!.id}`)}
                              className="text-[0.68rem] text-left font-bold text-amber-700 hover:underline"
                            >
                              ⚡ Sugestão: vincular exclusivamente ao {sugestao.blocoEncontrado.nome}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className={`${td} font-mono text-slate-600`}>
                        {isIsup ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200 text-xs font-bold" title="Conectado via Túnel Reverso ISUP 5.0 (Sem VPN)">
                            ☁️ ISUP 5.0 · ID: {limparDeviceIdIsup(d.ip)}
                          </span>
                        ) : (
                          <a
                            href={`http://${d.ip}:${d.porta}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Abrir interface web do controlador em nova aba"
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {d.ip}:{d.porta} ↗
                          </a>
                        )}
                      </td>
                      <td className={td}>
                        {status === null || emTeste ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-blue-600 font-semibold">
                            <RefreshCw size={12} className="animate-spin" /> testando conexão...
                          </span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {s === 'online' ? (
                                diag && !diag.autenticado && diag.http_code === 401 ? (
                                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800" title={diag.mensagem}>
                                    Online (Senha 401)
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-700" title={diag?.mensagem}>
                                    Online
                                  </span>
                                )
                              ) : (
                                <span className="px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-700" title={diag?.mensagem}>
                                  Offline
                                </span>
                              )}
                              {diag?.latencia_ms !== null && diag?.latencia_ms !== undefined && (
                                <span className={`px-2 py-0.5 rounded text-[0.7rem] font-mono font-bold ${corLatencia(diag.latencia_ms)}`} title={`Resposta HTTP: ${diag.latencia_ms} ms | Ciclo ISAPI completo: ${diag.tempo_total_ms ?? diag.latencia_ms} ms`}>
                                  {diag.latencia_ms} ms
                                </span>
                              )}
                              {(filaPorControlador[d.id] ?? 0) > 0 && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[0.68rem] font-extrabold bg-amber-100 text-amber-900 border border-amber-300" title="Sincronizações faciais/ramais aguardando o leitor ficar online">
                                  <Clock size={11} /> {filaPorControlador[d.id]} na fila
                                </span>
                              )}
                            </div>
                            {diag && (
                              diag.status === 'online' && (diag.modelo || diag.firmware || diag.mac) ? (
                                <div className="text-[0.7rem] text-slate-500 font-mono">
                                  {[diag.modelo, diag.firmware ? `FW ${diag.firmware}` : null, diag.mac].filter(Boolean).join(' · ')}
                                </div>
                              ) : diag.status === 'offline' ? (
                                <div className="text-[0.7rem] text-rose-500">
                                  {isIsup ? 'Aguardando conexão ISUP na porta 7660' : 'Sem resposta na rede (timeout)'}
                                </div>
                              ) : !diag.autenticado && diag.http_code === 401 ? (
                                <div className="text-[0.7rem] text-amber-700">Respondeu, mas recusou usuário/senha</div>
                              ) : null
                            )}
                          </div>
                        )}
                      </td>
                      <td className={td}>
                        <div className="flex gap-1.5 flex-wrap">
                          <button
                            type="button"
                            disabled={emTeste || ocupado !== null}
                            onClick={() => testarUm(d)}
                            title="Testar conexão, autenticação ISAPI e latência deste equipamento"
                            className={`${btn} bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100`}
                          >
                            <Wifi size={12} className={testandoId === d.id ? 'animate-pulse' : ''} />
                            {testandoId === d.id ? 'Testando...' : 'Testar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setTerminalInterfone(d)}
                            title="Interfone Digital: testar chamada para unidade ou configurar discagem no leitor facial"
                            className={`${btn} bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100`}
                          >
                            <PhoneCall size={12} /> Interfone
                          </button>
                          <button onClick={() => editar(d)} className={`${btn} bg-slate-500 text-white hover:bg-slate-600`}><Pencil size={12} /> Editar</button>
                          <button disabled={ocupado !== null} onClick={() => sync(d)} title="Envia todos os moradores autorizados para esta catraca" className={`${btn} bg-emerald-500 text-white hover:bg-emerald-600`}>
                            <RefreshCw size={12} className={ocupado === `sync-${d.id}` ? 'animate-spin' : ''} /> Sync
                          </button>
                          {ehAdminSistema && (
                            <button
                              type="button"
                              disabled={ocupado !== null}
                              onClick={() => importarDoLeitor(d)}
                              title="Exclusivo Administrador: Importa os moradores e fotos faciais já gravados neste leitor para o sistema"
                              className={`${btn} bg-amber-500 text-white hover:bg-amber-600 cursor-pointer`}
                            >
                              <Download size={12} className={ocupado === `imp-${d.id}` ? 'animate-bounce' : ''} />
                              {ocupado === `imp-${d.id}` ? 'Importando...' : 'Importar do Leitor'}
                            </button>
                          )}
                          <button disabled={ocupado !== null} onClick={() => excluir(d)} className={`${btn} bg-red-50 text-red-600 border border-red-200 hover:bg-red-100`}><Trash2 size={12} /> Excluir</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {dispositivos.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400 py-10">Nenhum terminal cadastrado.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Painel Watchdog de Disponibilidade & Fila Automática de Sincronização (Sync Queue) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 text-base sm:text-lg font-extrabold text-slate-900">
              <ShieldAlert size={19} className="text-indigo-600" />
              Watchdog 24/7 &amp; Fila Automática de Sincronização (Sync Queue)
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Quando um leitor facial está offline, fotos, exclusões e ramais entram automaticamente na fila e são enviados assim que o equipamento reconectar. Quedas e restaurações disparam alerta Push imediato para Síndico, Admin e Portaria.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={processandoFila}
              onClick={() => processarFilaAgora()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw size={15} className={processandoFila ? 'animate-spin' : ''} />
              {processandoFila ? 'Processando Fila & Watchdog...' : '⚡ Verificar Reconexão & Processar Fila Agora'}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 border-b border-slate-200 mb-4">
          <button
            type="button"
            onClick={() => setAbaMonitoramento('fila')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-extrabold border-b-2 transition cursor-pointer flex items-center gap-2 ${
              abaMonitoramento === 'fila'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock size={15} />
            Fila de Sincronização Pendente
            <span className={`px-2 py-0.5 rounded-full text-xs font-extrabold ${
              filaSync.length > 0 ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-emerald-100 text-emerald-700'
            }`}>
              {filaSync.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setAbaMonitoramento('watchdog')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-extrabold border-b-2 transition cursor-pointer flex items-center gap-2 ${
              abaMonitoramento === 'watchdog'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Activity size={15} />
            Histórico de Quedas e Restaurações (Watchdog)
            <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-slate-100 text-slate-700">
              {historicoWatchdog.length}
            </span>
          </button>
        </div>

        {abaMonitoramento === 'fila' ? (
          filaSync.length === 0 ? (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 text-emerald-900 text-sm">
              <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
              <div>
                <div className="font-extrabold">Fila de sincronização limpa (0 pendências)!</div>
                <div className="text-xs text-emerald-700 mt-0.5">
                  Todos os cadastros faciais, ramais de interfone e revogações estão em dia ou serão enfileirados automaticamente caso algum leitor fique offline.
                </div>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={th}>Terminal</th>
                    <th className={th}>Morador / Cadastro</th>
                    <th className={th}>Operação Pendente</th>
                    <th className={th}>Tentativas</th>
                    <th className={th}>Status / Motivo</th>
                    <th className={th}>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {filaSync.map((item) => {
                    const labelAcao =
                      item.acao === 'sincronizarFace'
                        ? '📸 Enviar Foto Facial + Ramal'
                        : item.acao === 'excluirUsuario'
                          ? '🚫 Revogar Acesso no Leitor'
                          : item.acao === 'sincronizarRamal'
                            ? '📞 Atualizar Ramal do Interfone'
                            : item.acao;
                    return (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className={`${td} font-bold text-slate-900`}>
                          {item.controlador_nome || `Terminal #${item.controlador_id}`}
                        </td>
                        <td className={td}>
                          <span className="font-semibold text-slate-800">{item.nome || `ID #${item.usuario_id}`}</span>
                        </td>
                        <td className={td}>
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                            {labelAcao}
                          </span>
                        </td>
                        <td className={`${td} font-mono text-xs text-slate-600`}>
                          {item.tentativas}x
                        </td>
                        <td className={`${td} text-xs text-amber-800 max-w-xs truncate`} title={item.ultimo_erro || ''}>
                          {item.ultimo_erro || 'Aguardando reconexão do leitor'}
                        </td>
                        <td className={td}>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={processandoFila}
                              onClick={() => processarFilaAgora(item.controlador_id)}
                              className={`${btn} bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 cursor-pointer`}
                            >
                              <RefreshCw size={12} /> Tentar Agora
                            </button>
                            <button
                              type="button"
                              onClick={() => removerItemFila(item.id)}
                              title="Remover este item da fila"
                              className={`${btn} bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 cursor-pointer`}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : historicoWatchdog.length === 0 ? (
          <div className="text-center text-slate-400 py-8 text-sm">
            Nenhuma queda ou restauração registrada até o momento. O Watchdog monitora continuamente todos os equipamentos ativos.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Data / Hora</th>
                  <th className={th}>Equipamento</th>
                  <th className={th}>Evento</th>
                  <th className={th}>Detalhes / Diagnóstico</th>
                  <th className={th}>Alertas Push</th>
                </tr>
              </thead>
              <tbody>
                {historicoWatchdog.map((ev) => {
                  const ehQueda = ev.evento === 'queda';
                  return (
                    <tr key={ev.id} className="hover:bg-slate-50">
                      <td className={`${td} font-mono text-xs text-slate-600 whitespace-nowrap`}>
                        {new Date(ev.criado_em).toLocaleString('pt-BR')}
                      </td>
                      <td className={`${td} font-bold text-slate-900`}>
                        {ev.controlador_nome}
                      </td>
                      <td className={td}>
                        {ehQueda ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-extrabold bg-rose-100 text-rose-800 border border-rose-200">
                            <AlertTriangle size={12} /> 🔴 Queda (Offline)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 size={12} /> 🟢 Reconectado (Online)
                          </span>
                        )}
                      </td>
                      <td className={`${td} text-xs text-slate-700`}>
                        {ev.mensagem || '-'}
                        {ev.latencia_ms !== null && (
                          <span className="ml-2 font-mono text-[0.7rem] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {ev.latencia_ms} ms
                          </span>
                        )}
                      </td>
                      <td className={`${td} text-xs font-semibold text-slate-600`}>
                        {ev.notificacoes_enviadas > 0 ? `📲 ${ev.notificacoes_enviadas} enviado(s)` : 'Registrado no painel'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>


      {form && (
        <div ref={refForm} className="bg-white rounded-2xl border border-slate-200 border-t-4 border-t-blue-500 p-6 shadow-sm">
          <div className="text-lg font-extrabold text-slate-900 mb-3">{form.id ? 'Editar Terminal' : 'Cadastrar Terminal'}</div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
            <button
              type="button"
              onClick={() => {
                setModoConexaoForm('ip');
                setTesteForm(null);
                setForm({ ...form, porta: form.porta === '7660' ? '80' : form.porta });
              }}
              className={`p-3 rounded-xl border text-left transition ${
                modoConexaoForm === 'ip'
                  ? 'border-blue-600 bg-blue-50/70 text-blue-950 ring-2 ring-blue-500/20'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <div className="font-extrabold text-sm">🌐 Rede Local / VPN (IP Direto)</div>
              <div className="text-xs opacity-80 mt-0.5">Conexão HTTP/ISAPI tradicional via IP fixo ou VPN Site-to-Site (Porta 80).</div>
            </button>
            <button
              type="button"
              onClick={() => {
                setModoConexaoForm('isup');
                setTesteForm(null);
                setForm({ ...form, ip: limparDeviceIdIsup(form.ip), porta: '7660', usuario: form.usuario || 'admin' });
              }}
              className={`p-3 rounded-xl border text-left transition ${
                modoConexaoForm === 'isup'
                  ? 'border-indigo-600 bg-indigo-50/80 text-indigo-950 ring-2 ring-indigo-500/20'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <div className="font-extrabold text-sm">☁️ Nuvem ISUP 5.0 (Sem VPN)</div>
              <div className="text-xs opacity-80 mt-0.5">O controlador Hikvision conecta sozinho ao servidor na porta 7660 (ideal para novos condomínios).</div>
            </button>
          </div>

          {modoConexaoForm === 'isup' && (
            <div className="mb-4 p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 text-xs text-indigo-950 space-y-1.5">
              <div className="font-extrabold text-sm text-indigo-900">📋 Como configurar na tela do equipamento Hikvision (Rede → Acesso à Plataforma / ISUP):</div>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 font-mono text-[0.76rem] pt-1">
                <div>• <b>Habilitar (Enable):</b> Marcar [x]</div>
                <div>• <b>Versão do Protocolo:</b> ISUP 5.0</div>
                <div>• <b>Endereço do Servidor (IP):</b> <span className="bg-white px-1.5 py-0.5 rounded border border-indigo-200 font-bold">24.152.119.249</span></div>
                <div>• <b>Porta (Port):</b> <span className="bg-white px-1.5 py-0.5 rounded border border-indigo-200 font-bold">7660</span></div>
                <div>• <b>ID do Dispositivo (Device ID):</b> <span className="bg-white px-1.5 py-0.5 rounded border border-indigo-200 font-bold">{limparDeviceIdIsup(form.ip) || 'Ex: GF5441555'}</span></div>
                <div>• <b>Chave de Criptografia (Encryption Key):</b> Mesma senha preenchida abaixo</div>
              </div>
            </div>
          )}

          <form onSubmit={salvar} className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <input required value={form.nome} onChange={muda('nome')} placeholder="Nome do Terminal (ex: Porta Rua, Bloco A, Bloco 1...)" className={entrada} />
              <input
                required
                value={form.ip}
                onChange={muda('ip')}
                placeholder={modoConexaoForm === 'isup' ? 'Device ID configurado no ISUP (ex: GF5441555)' : 'IP do Dispositivo (ex: 172.19.6.241)'}
                className={entrada}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {modoConexaoForm === 'isup' ? (
                <input disabled value="Porta ISUP: 7660 (Automática)" className={`${entrada} bg-slate-100 text-slate-500 cursor-not-allowed`} />
              ) : (
                <input type="number" value={form.porta} onChange={muda('porta')} placeholder="Porta HTTP (ex: 80)" className={entrada} />
              )}
              <select value={form.tipo_acesso} onChange={muda('tipo_acesso')} className={entrada}>
                <option value="geral_pedestre">🌐 Portaria Geral (Liberado p/ Todos os Blocos)</option>
                <option value="bloco">🏢 Acesso Exclusivo por Bloco (Só Moradores do Bloco)</option>
              </select>
            </div>
            {form.tipo_acesso === 'bloco' && (
              <select required value={form.bloco_id} onChange={muda('bloco_id')} className={entrada}>
                <option value="">Selecione a qual Torre/Bloco esta catraca pertence...</option>
                {blocos.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
                <option value="__auto__">✨ Criar/vincular bloco automaticamente pelo nome ("{form.nome || 'Bloco'}")</option>
              </select>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <input
                required
                value={form.usuario}
                onChange={muda('usuario')}
                placeholder={modoConexaoForm === 'isup' ? 'Usuário do equipamento (ex: admin)' : 'Usuário'}
                autoComplete="off"
                className={entrada}
              />
              <input
                type="password"
                required={!form.id}
                value={form.senha}
                onChange={muda('senha')}
                autoComplete="new-password"
                placeholder={
                  modoConexaoForm === 'isup'
                    ? (form.id ? 'Nova Encryption Key ISUP (em branco p/ manter)' : 'Encryption Key ISUP (ex: pwd001@@)')
                    : (form.id ? 'Nova senha (deixe em branco para manter)' : 'Senha')
                }
                className={entrada}
              />
            </div>

            {testeForm && (
              <div className={`p-3.5 rounded-xl border text-sm ${
                testeForm.status === 'online' && testeForm.autenticado
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : testeForm.status === 'online'
                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}>
                <div className="font-bold flex items-center justify-between gap-2">
                  <span>{testeForm.mensagem}</span>
                  {testeForm.latencia_ms !== null && (
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-white/80 border border-black/10">
                      {testeForm.latencia_ms} ms
                    </span>
                  )}
                </div>
                {(testeForm.modelo || testeForm.firmware || testeForm.mac) && (
                  <div className="text-xs font-mono mt-1 opacity-80">
                    {[testeForm.modelo ? `Modelo: ${testeForm.modelo}` : null, testeForm.firmware ? `Firmware: ${testeForm.firmware}` : null, testeForm.mac ? `MAC: ${testeForm.mac}` : null].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            )}

            <div className="pt-5 mt-3 border-t border-slate-200">
              <h3 className="flex items-center gap-2 font-bold text-slate-900 mb-1"><Lock size={18} className="text-blue-500" /> Configuração de Portas (Abertura via App)</h3>
              <p className="text-sm text-slate-500 mb-4">Selecione quais portas aparecerão no aplicativo do morador para abertura remota e defina os nomes de exibição.</p>
              <div className="grid gap-3 md:grid-cols-2">
                {([1, 2] as const).map((n) => (
                  <div key={n} className="bg-slate-50 border border-slate-300 p-4 rounded-xl">
                    <label className="flex items-center gap-2.5 font-bold text-slate-700 mb-3 cursor-pointer">
                      <input type="checkbox" checked={form[`porta_${n}_ativa`]} onChange={muda(`porta_${n}_ativa`)} className="w-5 h-5 accent-blue-500" />
                      Ativar Porta {n}
                    </label>
                    <input required value={form[`porta_${n}_nome`]} onChange={muda(`porta_${n}_nome`)} placeholder={n === 1 ? 'Ex: Portão Pedestre' : 'Ex: Portão Veículos'} className={entrada} />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5 pt-3">
              <button
                type="button"
                disabled={testandoForm || !form.ip}
                onClick={testarConexaoFormulario}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold disabled:opacity-50"
              >
                <Wifi size={16} className={testandoForm ? 'animate-pulse' : ''} />
                {testandoForm ? 'Testando...' : 'Testar Conexão'}
              </button>
              <button disabled={ocupado !== null} className="flex-1 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold disabled:opacity-60">Salvar Dispositivo</button>
              <button type="button" onClick={() => setForm(null)} className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200">Cancelar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
