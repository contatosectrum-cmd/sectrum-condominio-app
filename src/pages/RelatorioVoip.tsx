import { useCallback, useEffect, useState } from 'react';
import {
  PhoneCall, Cpu, Smartphone, CheckCircle2, PhoneMissed, RefreshCw, Download,
  Search, X, ArrowRight, Building2, Clock, Radio, CornerDownRight, ShieldAlert,
  BookOpen, Hash,
} from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import { useSessao } from '../lib/useSessao';
import PainelRamaisSipAdmin from '../components/PainelRamaisSipAdmin';

interface ResumoVoip {
  total: number;
  controle_para_app: number;
  controle_atendidas_app: number;
  controle_transbordo: number;
  controle_atendidas_portaria: number;
  app_para_app: number;
  app_para_app_atendidas: number;
  atendidas_total: number;
  perdidas: number;
  recusadas: number;
  canceladas: number;
  ativas_agora: number;
  duracao_total_seg: number;
  tempo_medio_atendimento_seg: number;
}

interface DispositivosResumo {
  moradores_ativos: number;
  moradores_com_app: number;
  android_nativo: number;
  ios_nativo: number;
  iphones_voip_callkit: number;
  web_push: number;
  unidades_com_app: number;
  unidades_total: number;
  apns_configurado: boolean;
}

interface UsoCondominio {
  condominio_id: number;
  condominio_nome: string;
  total: number;
  controle_para_app: number;
  app_para_app: number;
  atendidas: number;
  transbordos: number;
  ultima_chamada: string | null;
}

interface ChamadaVoip {
  id: number;
  call_id: string;
  condominio_id: number;
  condominio_nome: string;
  modalidade: 'controle_app' | 'app_app';
  tipo: string;
  origem_tipo: string;
  origem_nome: string;
  origem_device_id: string | null;
  origem_usuario_nome: string | null;
  origem_usuario_perfil: string | null;
  destino_unidade_id: number | null;
  destino_nome: string;
  destino_codigo: string | null;
  status: string;
  atendido_por_nome: string | null;
  atendido_por_perfil: string | null;
  transbordou_portaria: boolean;
  motivo_transbordo: string | null;
  iniciado_em: string;
  atendido_em: string | null;
  encerrado_em: string | null;
  duracao_segundos: number;
  tempo_ate_atender_seg: number | null;
}

interface RespostaRelatorioVoip {
  super: boolean;
  cond_fil: number;
  resumo: ResumoVoip;
  dispositivos: DispositivosResumo;
  por_condominio: UsoCondominio[];
  chamadas: ChamadaVoip[];
  total: number;
  pagina: number;
  paginas: number;
  condominios: { id: number; nome: string }[];
}

interface FiltrosVoip {
  cond_fil: string;
  modalidade: string;
  status: string;
  data_de: string;
  data_ate: string;
  busca: string;
}

const rot = 'block text-xs font-bold text-slate-600 uppercase mb-1.5';
const inp = 'w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-blue-500 bg-white text-sm';

function isoDataLocal(diasAtras = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

function fmtDataHora(s: string | null): string {
  if (!s) return '—';
  const dt = new Date(s.replace(' ', 'T'));
  if (Number.isNaN(dt.getTime())) return s;
  return dt
    .toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    .replace(',', '');
}

function fmtDuracao(seg: number): string {
  if (!seg || seg <= 0) return '—';
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${String(rm).padStart(2, '0')}m`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtDuracaoTotal(seg: number): string {
  if (!seg || seg <= 0) return '0 min';
  if (seg < 60) return `${seg}s`;
  const min = Math.floor(seg / 60);
  const resto = seg % 60;
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const rm = min % 60;
    return `${h}h ${rm}min`;
  }
  return resto > 0 ? `${min}m ${resto}s` : `${min} min`;
}

function rotuloMotivoTransbordo(motivo: string | null): string {
  switch (motivo) {
    case 'sem_resposta_morador':
    case 'timeout_20s':
      return 'Transbordo p/ Portaria (20s sem atender)';
    case 'recusado_morador':
      return 'Morador recusou → Portaria';
    case 'sem_app_morador':
      return 'Unidade sem App ativo → Portaria';
    case 'chamada_direta_portaria':
      return 'Chamada direta p/ Portaria';
    case 'assumido_portaria':
      return 'Assumida pela Portaria';
    case 'atendido_portaria':
      return 'Atendida pela Portaria';
    default:
      return 'Transbordou p/ Portaria';
  }
}

function badgeStatus(status: string): { rotulo: string; classe: string } {
  switch (status) {
    case 'ringing':
      return { rotulo: 'Tocando agora', classe: 'bg-amber-100 text-amber-800 border-amber-300 animate-pulse' };
    case 'answered':
      return { rotulo: 'Em conversa', classe: 'bg-emerald-100 text-emerald-800 border-emerald-300 animate-pulse' };
    case 'ended':
      return { rotulo: 'Atendida', classe: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'missed':
      return { rotulo: 'Não atendida', classe: 'bg-rose-50 text-rose-700 border-rose-200' };
    case 'rejected':
      return { rotulo: 'Recusada', classe: 'bg-orange-50 text-orange-700 border-orange-200' };
    case 'canceled':
      return { rotulo: 'Cancelada', classe: 'bg-slate-100 text-slate-600 border-slate-200' };
    default:
      return { rotulo: status, classe: 'bg-slate-100 text-slate-600 border-slate-200' };
  }
}

export default function RelatorioVoip() {
  const { usuario } = useSessao();
  const [abaPrincipal, setAbaPrincipal] = useState<'ramais' | 'guia' | 'historico'>(() => {
    const q = new URLSearchParams(window.location.search).get('aba');
    if (q === 'guia' || q === 'historico' || q === 'ramais') return q;
    return 'ramais';
  });
  const condPadrao = usuario?.superadmin
    ? usuario.condominio_id
      ? String(usuario.condominio_id)
      : 'todos'
    : String(usuario?.condominio_id ?? '0');

  const [form, setForm] = useState<FiltrosVoip>(() => ({
    cond_fil: condPadrao,
    modalidade: '',
    status: '',
    data_de: '',
    data_ate: '',
    busca: '',
  }));
  const [filtros, setFiltros] = useState<FiltrosVoip>(() => ({
    cond_fil: condPadrao,
    modalidade: '',
    status: '',
    data_de: '',
    data_ate: '',
    busca: '',
  }));
  const [pag, setPag] = useState(1);
  const [dados, setDados] = useState<RespostaRelatorioVoip | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [erro, setErro] = useState('');

  // Sincroniza quando o SuperAdmin troca o seletor de condomínio no topo do Layout
  useEffect(() => {
    if (!usuario?.superadmin) return;
    const novo = usuario.condominio_id ? String(usuario.condominio_id) : 'todos';
    setForm((f) => ({ ...f, cond_fil: novo }));
    setFiltros((f) => ({ ...f, cond_fil: novo }));
    setPag(1);
  }, [usuario?.superadmin, usuario?.condominio_id]);

  // Filtro dinâmico com debounce para busca e datas
  useEffect(() => {
    const t = setTimeout(() => {
      setFiltros((atual) => {
        if (
          atual.cond_fil === form.cond_fil &&
          atual.modalidade === form.modalidade &&
          atual.status === form.status &&
          atual.data_de === form.data_de &&
          atual.data_ate === form.data_ate &&
          atual.busca === form.busca
        ) {
          return atual;
        }
        setPag(1);
        return { ...form };
      });
    }, 180);
    return () => clearTimeout(t);
  }, [form]);

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    setErro('');
    try {
      const resp = await api<RespostaRelatorioVoip>('voip_relatorio', {
        query: { ...filtros, pag },
      });
      setDados(resp);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Erro ao carregar o relatório de chamadas VoIP.');
    } finally {
      if (!silencioso) setCarregando(false);
    }
  }, [filtros, pag]);

  useEffect(() => {
    carregar(false);
  }, [carregar]);

  useEffect(() => {
    if (!autoRefresh) return;
    const iv = setInterval(() => {
      carregar(true);
    }, 15000);
    return () => clearInterval(iv);
  }, [autoRefresh, carregar]);

  const aplicarPeriodo = (dias: number | null, apenasOntem = false) => {
    if (dias === null) {
      setForm((f) => ({ ...f, data_de: '', data_ate: '' }));
      return;
    }
    if (apenasOntem) {
      const ontem = isoDataLocal(1);
      setForm((f) => ({ ...f, data_de: ontem, data_ate: ontem }));
      return;
    }
    setForm((f) => ({
      ...f,
      data_de: isoDataLocal(dias),
      data_ate: isoDataLocal(0),
    }));
  };

  const limparFiltros = () => {
    const limpo: FiltrosVoip = {
      cond_fil: condPadrao,
      modalidade: '',
      status: '',
      data_de: '',
      data_ate: '',
      busca: '',
    };
    setForm(limpo);
    setFiltros(limpo);
    setPag(1);
  };

  const exportarPlanilhaCsv = async () => {
    setExportando(true);
    try {
      const resp = await api<RespostaRelatorioVoip>('voip_relatorio', {
        query: { ...filtros, exportar: 'csv' },
      });
      const cabecalho = [
        'Data/Hora Início',
        'Condomínio',
        'Modalidade',
        'Origem',
        'Dispositivo Origem',
        'Destino (Unidade)',
        'Ramal Discado',
        'Quem Atendeu',
        'Perfil Atendente',
        'Transbordou Portaria',
        'Motivo Transbordo',
        'Status',
        'Tempo até Atender (s)',
        'Duração Conversa (s)',
        'ID Chamada',
      ];
      const esc = (v: string | number | null | undefined) =>
        `"${String(v ?? '').replace(/"/g, '""')}"`;
      const linhas = resp.chamadas.map((c) => [
        fmtDataHora(c.iniciado_em),
        c.condominio_nome,
        c.modalidade === 'controle_app' ? 'Controle de Acesso -> App' : 'App -> App',
        c.origem_nome,
        c.origem_device_id ?? '',
        c.destino_nome,
        c.destino_codigo ?? '',
        c.atendido_por_nome ?? '',
        c.atendido_por_perfil ?? '',
        c.transbordou_portaria ? 'Sim' : 'Não',
        c.motivo_transbordo ? rotuloMotivoTransbordo(c.motivo_transbordo) : '',
        badgeStatus(c.status).rotulo,
        c.tempo_ate_atender_seg ?? '',
        c.duracao_segundos || 0,
        c.call_id,
      ].map(esc).join(';'));

      const conteudo = '\uFEFF' + [cabecalho.map(esc).join(';'), ...linhas].join('\r\n');
      const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-voip-sectrum-${isoDataLocal(0)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Erro ao exportar CSV.');
    } finally {
      setExportando(false);
    }
  };

  const res = dados?.resumo;
  const disp = dados?.dispositivos;
  const mostrarColunaCondominio = Boolean(dados?.super && dados.cond_fil === 0);
  const taxaAtendimento = res && res.total > 0 ? Math.round((res.atendidas_total / res.total) * 100) : 0;
  const pctControle = res && res.total > 0 ? Math.round((res.controle_para_app / res.total) * 100) : 0;
  const pctApp = res && res.total > 0 ? 100 - pctControle : 0;
  const pctUnidadesApp =
    disp && disp.unidades_total > 0 ? Math.min(100, Math.round((disp.unidades_com_app / disp.unidades_total) * 100)) : 0;

  const temFiltroAtivo = Boolean(
    form.modalidade || form.status || form.data_de || form.data_ate || form.busca || form.cond_fil !== condPadrao,
  );

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {erro && (
        <div className="border-l-4 px-4 py-3 rounded-lg text-sm font-semibold flex justify-between items-center bg-rose-50 border-rose-500 text-rose-800">
          <span>{erro}</span>
          <button type="button" onClick={() => setErro('')} className="cursor-pointer">
            <X size={16} />
          </button>
        </div>
      )}

      {/* CABEÇALHO EXECUTIVO */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <PhoneCall size={20} />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 leading-tight flex items-center gap-2 flex-wrap">
                <span>Central VoIP, Telefonia IP (SIP) & Lista de Ramais</span>
                {res && res.ativas_agora > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse">
                    <Radio size={13} /> {res.ativas_agora} em andamento agora
                  </span>
                )}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500">
                Gestão dinâmica de <b>Telefones IP (SIP 5060)</b>, <b>Lista Oficial de Ramais das Unidades</b>, <b>Passo a Passo</b> e <b>Histórico de Ligações</b>
              </p>
            </div>
          </div>
        </div>

        {abaPrincipal === 'historico' && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setAutoRefresh((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition cursor-pointer ${
              autoRefresh
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
            title="Atualiza automaticamente os dados a cada 15 segundos"
          >
            <Radio size={14} className={autoRefresh ? 'text-emerald-600' : 'text-slate-400'} />
            {autoRefresh ? 'Ao vivo (15s)' : 'Auto-refresh off'}
          </button>

          <button
            type="button"
            onClick={() => carregar(false)}
            disabled={carregando}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold transition cursor-pointer disabled:opacity-60"
          >
            <RefreshCw size={14} className={carregando ? 'animate-spin text-blue-600' : ''} />
            Atualizar
          </button>

          <button
            type="button"
            onClick={exportarPlanilhaCsv}
            disabled={exportando || !res || res.total === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
          >
            <Download size={14} />
            {exportando ? 'Exportando...' : 'Exportar CSV'}
          </button>
        </div>
        )}
      </div>

      {/* BARRA DE ABAS PRINCIPAIS */}
      <div className="flex flex-wrap gap-2 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-xs">
        <button
          type="button"
          onClick={() => setAbaPrincipal('ramais')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-extrabold transition cursor-pointer ${
            abaPrincipal === 'ramais'
              ? 'bg-slate-900 text-white shadow'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Hash size={16} />
          Painel de Ramais &amp; Telefone IP (SIP)
        </button>

        <button
          type="button"
          onClick={() => setAbaPrincipal('guia')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-extrabold transition cursor-pointer ${
            abaPrincipal === 'guia'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <BookOpen size={16} />
          Passo a Passo de Configuração
        </button>

        <button
          type="button"
          onClick={() => setAbaPrincipal('historico')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-extrabold transition cursor-pointer ${
            abaPrincipal === 'historico'
              ? 'bg-slate-900 text-white shadow'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <PhoneCall size={16} />
          Histórico &amp; Métricas de Ligações
          {(res?.total ?? 0) > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] bg-blue-100 text-blue-800 font-black">
              {res?.total}
            </span>
          )}
        </button>
      </div>

      {abaPrincipal !== 'historico' ? (
        <PainelRamaisSipAdmin
          abaModo={abaPrincipal}
          condominioFiltroExterno={usuario?.condominio_id ?? 0}
          aoTrocarabaModo={(nova) => setAbaPrincipal(nova)}
        />
      ) : (
        <>
      {/* 4 CARDS DE INDICADORES PRINCIPAIS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Card 1: Volume Geral */}
        <div
          onClick={() => setForm((f) => ({ ...f, modalidade: '' }))}
          className={`bg-white rounded-2xl border p-5 shadow-xs transition cursor-pointer ${
            form.modalidade === '' ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Total de Ligações</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <PhoneCall size={18} />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900">{(res?.total ?? 0).toLocaleString('pt-BR')}</div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
              <CheckCircle2 size={13} /> {res?.atendidas_total ?? 0} atendidas ({taxaAtendimento}%)
            </span>
            <span className="inline-flex items-center gap-1 text-slate-500">
              <Clock size={12} /> {fmtDuracaoTotal(res?.duracao_total_seg ?? 0)} falados
            </span>
          </div>
          {(res?.tempo_medio_atendimento_seg ?? 0) > 0 && (
            <div className="mt-1 text-[11px] text-slate-400 font-medium">
              Tempo médio p/ atender: <b className="text-slate-600">{res?.tempo_medio_atendimento_seg}s</b>
            </div>
          )}
        </div>

        {/* Card 2: Controle de Acesso -> App */}
        <div
          onClick={() => setForm((f) => ({ ...f, modalidade: f.modalidade === 'controle_app' ? '' : 'controle_app' }))}
          className={`bg-white rounded-2xl border p-5 shadow-xs transition cursor-pointer ${
            form.modalidade === 'controle_app'
              ? 'border-indigo-500 ring-2 ring-indigo-100'
              : 'border-slate-200 hover:border-indigo-300'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-extrabold uppercase tracking-wide text-indigo-700">
              Controle de Acesso → App
            </span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Cpu size={18} />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900">
            {(res?.controle_para_app ?? 0).toLocaleString('pt-BR')}
          </div>
          <div className="mt-2.5 space-y-1 text-xs">
            <div className="flex items-center justify-between text-slate-600">
              <span>Atendidas direto no App:</span>
              <b className="text-emerald-700">{res?.controle_atendidas_app ?? 0}</b>
            </div>
            <div className="flex items-center justify-between text-slate-500">
              <span>Transbordo p/ Portaria:</span>
              <b className="text-amber-700">{res?.controle_transbordo ?? 0}</b>
            </div>
          </div>
        </div>

        {/* Card 3: App -> App */}
        <div
          onClick={() => setForm((f) => ({ ...f, modalidade: f.modalidade === 'app_app' ? '' : 'app_app' }))}
          className={`bg-white rounded-2xl border p-5 shadow-xs transition cursor-pointer ${
            form.modalidade === 'app_app'
              ? 'border-violet-500 ring-2 ring-violet-100'
              : 'border-slate-200 hover:border-violet-300'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-extrabold uppercase tracking-wide text-violet-700">
              Ligação App → App
            </span>
            <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
              <Smartphone size={18} />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900">
            {(res?.app_para_app ?? 0).toLocaleString('pt-BR')}
          </div>
          <div className="mt-2.5 space-y-1 text-xs">
            <div className="flex items-center justify-between text-slate-600">
              <span>Atendidas no App:</span>
              <b className="text-emerald-700">{res?.app_para_app_atendidas ?? 0}</b>
            </div>
            <div className="flex items-center justify-between text-slate-500">
              <span>Participação no volume:</span>
              <b className="text-violet-700">{pctApp}% das chamadas</b>
            </div>
          </div>
        </div>

        {/* Card 4: Cobertura de Aparelhos VoIP / App */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-extrabold uppercase tracking-wide text-emerald-700">
              Cobertura VoIP no App
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">{disp?.unidades_com_app ?? 0}</span>
            <span className="text-xs font-semibold text-slate-400">
              / {disp?.unidades_total ?? 0} unidades ({pctUnidadesApp}%)
            </span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] font-bold">
            <span className="px-2 py-0.5 rounded-md bg-slate-900 text-white" title="iPhones com CallKit VoIP / APNs">
              iOS VoIP: {disp?.iphones_voip_callkit ?? 0}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800" title="Android APK Nativo (FCM Alta Prioridade)">
              Android App: {disp?.android_nativo ?? 0}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700" title="Navegador Web Push">
              Web: {disp?.web_push ?? 0}
            </span>
          </div>
        </div>
      </div>

      {/* COMPARATIVO VISUAL DE MODALIDADES + RANKING POR CONDOMÍNIO (SUPERADMIN) */}
      {res && res.total > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="text-sm font-extrabold text-slate-800">
              Distribuição das Ligações: <span className="text-indigo-600">Controle de Acesso → App ({pctControle}%)</span>{' '}
              vs. <span className="text-violet-600">App → App ({pctApp}%)</span>
            </div>
            <div className="flex flex-wrap gap-3 text-xs font-semibold">
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Atendidas: {res.atendidas_total}
              </span>
              <span className="inline-flex items-center gap-1 text-rose-700">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Perdidas: {res.perdidas}
              </span>
              <span className="inline-flex items-center gap-1 text-orange-700">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-400" /> Recusadas: {res.recusadas}
              </span>
              <span className="inline-flex items-center gap-1 text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400" /> Canceladas: {res.canceladas}
              </span>
            </div>
          </div>

          <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden flex">
            {pctControle > 0 && (
              <div
                style={{ width: `${pctControle}%` }}
                className="bg-indigo-600 h-full transition-all"
                title={`Controle de Acesso → App: ${res.controle_para_app} ligações (${pctControle}%)`}
              />
            )}
            {pctApp > 0 && (
              <div
                style={{ width: `${pctApp}%` }}
                className="bg-violet-500 h-full transition-all"
                title={`App → App: ${res.app_para_app} ligações (${pctApp}%)`}
              />
            )}
          </div>

          {dados?.super && dados.por_condominio.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                  <Building2 size={14} className="text-blue-600" /> Uso de Ligações VoIP por Condomínio (clique para filtrar)
                </span>
                {dados.cond_fil > 0 && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, cond_fil: 'todos' }))}
                    className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                  >
                    Ver todos os condomínios
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {dados.por_condominio.map((c) => {
                  const ativo = Number(form.cond_fil) === Number(c.condominio_id);
                  return (
                    <button
                      key={c.condominio_id}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          cond_fil: ativo ? 'todos' : String(c.condominio_id),
                        }))
                      }
                      className={`text-left p-3 rounded-xl border transition cursor-pointer ${
                        ativo
                          ? 'bg-blue-50/70 border-blue-500 ring-1 ring-blue-300'
                          : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200'
                      }`}
                    >
                      <div className="font-extrabold text-slate-900 text-xs truncate">{c.condominio_nome}</div>
                      <div className="mt-1.5 flex items-center justify-between text-[11px]">
                        <span className="font-black text-slate-800">{c.total} ligações</span>
                        <span className="text-emerald-700 font-bold">{c.atendidas} atend.</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10.5px] font-semibold">
                        <span className="text-indigo-700">Leitor→App: {c.controle_para_app}</span>
                        <span className="text-slate-300">•</span>
                        <span className="text-violet-700">App→App: {c.app_para_app}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* BLOCO DE FILTROS + TABELA */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-extrabold text-slate-500 uppercase mr-1">Período:</span>
            {[
              { rotulo: 'Hoje', acao: () => aplicarPeriodo(0) },
              { rotulo: 'Ontem', acao: () => aplicarPeriodo(1, true) },
              { rotulo: '7 dias', acao: () => aplicarPeriodo(7) },
              { rotulo: '30 dias', acao: () => aplicarPeriodo(30) },
              { rotulo: 'Tudo', acao: () => aplicarPeriodo(null) },
            ].map((b) => (
              <button
                key={b.rotulo}
                type="button"
                onClick={b.acao}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 transition cursor-pointer"
              >
                {b.rotulo}
              </button>
            ))}
          </div>

          {temFiltroAtivo && (
            <button
              type="button"
              onClick={limparFiltros}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold cursor-pointer"
            >
              <X size={13} /> Limpar filtros
            </button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 bg-slate-50 p-3.5 rounded-xl mb-5">
          {dados?.super && (
            <div>
              <label className={rot}>Condomínio</label>
              <select
                value={form.cond_fil}
                onChange={(e) => setForm({ ...form, cond_fil: e.target.value })}
                className={inp}
              >
                <option value="todos">Todos os condomínios</option>
                {dados.condominios.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className={rot}>Tipo de Ligação</label>
            <select
              value={form.modalidade}
              onChange={(e) => setForm({ ...form, modalidade: e.target.value })}
              className={inp}
            >
              <option value="">Todas as modalidades</option>
              <option value="controle_app">Controle de Acesso → App</option>
              <option value="app_app">Ligação App → App</option>
              <option value="transbordo">Com Transbordo p/ Portaria</option>
            </select>
          </div>

          <div>
            <label className={rot}>Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className={inp}
            >
              <option value="">Todos os status</option>
              <option value="atendidas">Atendidas</option>
              <option value="perdidas">Não atendidas (Perdidas)</option>
              <option value="recusadas">Recusadas</option>
              <option value="canceladas">Canceladas</option>
              <option value="ativas">Em curso agora</option>
            </select>
          </div>

          <div>
            <label className={rot}>De (Data)</label>
            <input
              type="date"
              value={form.data_de}
              onChange={(e) => setForm({ ...form, data_de: e.target.value })}
              className={inp}
            />
          </div>

          <div>
            <label className={rot}>Até (Data)</label>
            <input
              type="date"
              value={form.data_ate}
              onChange={(e) => setForm({ ...form, data_ate: e.target.value })}
              className={inp}
            />
          </div>

          <div className={dados?.super ? '' : 'lg:col-span-2'}>
            <label className={rot}>Buscar</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                value={form.busca}
                onChange={(e) => setForm({ ...form, busca: e.target.value })}
                placeholder="Unidade, ramal, morador, leitor..."
                className={`${inp} pl-8`}
              />
            </div>
          </div>
        </div>

        {/* TABELA DE REGISTRO DE CHAMADAS */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {[
                  'Data / Hora',
                  ...(mostrarColunaCondominio ? ['Condomínio'] : []),
                  'Modalidade',
                  'Origem (Quem ligou)',
                  'Destino (Unidade / Ramal)',
                  'Atendimento / Desfecho',
                  'Status',
                  'Duração',
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left text-[0.71rem] font-extrabold uppercase tracking-wide text-slate-500 px-3.5 py-3 border-b border-slate-200 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(dados?.chamadas ?? []).map((c) => {
                const st = badgeStatus(c.status);
                const ehControle = c.modalidade === 'controle_app';
                return (
                  <tr key={c.id} className="hover:bg-slate-50/90 transition-colors">
                    <td className="px-3.5 py-3 border-b border-slate-100 text-xs text-slate-600 font-semibold whitespace-nowrap">
                      {fmtDataHora(c.iniciado_em)}
                    </td>

                    {mostrarColunaCondominio && (
                      <td className="px-3.5 py-3 border-b border-slate-100 text-xs font-bold text-slate-700 whitespace-nowrap">
                        {c.condominio_nome}
                      </td>
                    )}

                    <td className="px-3.5 py-3 border-b border-slate-100 whitespace-nowrap">
                      {ehControle ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <Cpu size={12} />
                          Controle <ArrowRight size={11} /> App
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-violet-50 text-violet-700 border border-violet-200">
                          <Smartphone size={12} />
                          App <ArrowRight size={11} /> App
                        </span>
                      )}
                    </td>

                    <td className="px-3.5 py-3 border-b border-slate-100 text-sm">
                      <div className="font-bold text-slate-900 leading-snug">{c.origem_nome}</div>
                      {ehControle && c.origem_device_id && (
                        <div className="text-[11px] text-slate-400 font-mono">{c.origem_device_id}</div>
                      )}
                      {!ehControle && c.origem_usuario_nome && !c.origem_nome.includes(c.origem_usuario_nome.split(' ')[0]) && (
                        <div className="text-[11px] text-slate-500">{c.origem_usuario_nome}</div>
                      )}
                    </td>

                    <td className="px-3.5 py-3 border-b border-slate-100 text-sm">
                      <div className="font-bold text-slate-800 leading-snug">{c.destino_nome}</div>
                      {c.destino_codigo && (
                        <div className="text-[11px] text-slate-500">
                          Ramal: <span className="font-mono font-bold text-slate-700">{c.destino_codigo}</span>
                        </div>
                      )}
                    </td>

                    <td className="px-3.5 py-3 border-b border-slate-100 text-xs">
                      {c.atendido_por_nome ? (
                        <div>
                          <div className="font-bold text-emerald-800 flex items-center gap-1">
                            <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                            <span>{c.atendido_por_nome}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                            <span className="capitalize">
                              {c.atendido_por_perfil === 'morador' ? 'Atendeu pelo App' : `Perfil: ${c.atendido_por_perfil}`}
                            </span>
                            {c.tempo_ate_atender_seg !== null && (
                              <span className="text-slate-400">• em {c.tempo_ate_atender_seg}s</span>
                            )}
                          </div>
                        </div>
                      ) : c.transbordou_portaria ? (
                        <div className="inline-flex items-center gap-1 text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md font-semibold">
                          <CornerDownRight size={12} className="shrink-0" />
                          <span>{rotuloMotivoTransbordo(c.motivo_transbordo)}</span>
                        </div>
                      ) : c.status === 'missed' ? (
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          <PhoneMissed size={13} /> Sem atendimento no período de toque
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}

                      {c.atendido_por_nome && c.transbordou_portaria && (
                        <div className="mt-1 inline-flex items-center gap-1 text-[10.5px] text-amber-700 font-semibold">
                          <ShieldAlert size={11} /> {rotuloMotivoTransbordo(c.motivo_transbordo)}
                        </div>
                      )}
                    </td>

                    <td className="px-3.5 py-3 border-b border-slate-100 whitespace-nowrap">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${st.classe}`}>
                        {st.rotulo}
                      </span>
                    </td>

                    <td className="px-3.5 py-3 border-b border-slate-100 text-xs font-mono font-bold text-slate-700 whitespace-nowrap">
                      {fmtDuracao(c.duracao_segundos)}
                    </td>
                  </tr>
                );
              })}

              {dados && dados.chamadas.length === 0 && (
                <tr>
                  <td colSpan={mostrarColunaCondominio ? 8 : 7} className="text-center text-slate-400 py-12">
                    <PhoneCall size={34} className="mx-auto mb-2 opacity-60" strokeWidth={1.5} />
                    <div className="font-semibold text-slate-600">Nenhuma ligação VoIP encontrada para este filtro</div>
                    <div className="text-xs text-slate-400 mt-1">
                      Assim que moradores usarem o interfone do Controle de Acesso → App ou de App → App, os registros aparecerão aqui automaticamente.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINAÇÃO */}
        {dados && dados.paginas > 1 && (
          <div className="flex items-center justify-between gap-2 mt-5 pt-3 border-t border-slate-100 flex-wrap">
            <span className="text-xs text-slate-500 font-medium">
              Mostrando página <b>{dados.pagina}</b> de <b>{dados.paginas}</b> ({dados.total.toLocaleString('pt-BR')} ligações)
            </span>
            <div className="flex gap-1.5 flex-wrap">
              {Array.from({ length: Math.min(dados.paginas, 12) }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPag(n)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition ${
                    n === dados.pagina ? 'bg-blue-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}
