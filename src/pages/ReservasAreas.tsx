import { useCallback, useEffect, useState } from 'react';
import {
  Calendar, Users, Plus, CheckCircle2, Clock, Trash2, Share2, Copy, Settings,
  Sparkles, FileText, X, ScanFace, AlertCircle, Check, Pencil, Package, DollarSign, Layers,
} from 'lucide-react';
import { api, ErroApi, origemPublica } from '../lib/api';
import { useSessao } from '../lib/useSessao';

interface ObjetoDisponivelArea {
  id?: string;
  nome: string;
  qtd_max: number;
  valor_unitario: number;
}

interface ObjetoSelecionadoReserva {
  nome: string;
  qtd: number;
  valor_unitario: number;
  subtotal: number;
}

interface AreaComum {
  id: number;
  nome: string;
  descricao: string | null;
  capacidade_maxima: number;
  hora_inicio_padrao: string;
  hora_fim_padrao: string;
  taxa_valor: string | number;
  permite_reserva_total?: boolean;
  permite_reserva_parcial?: boolean;
  taxa_reserva_parcial?: string | number;
  capacidade_parcial?: number;
  descricao_parcial?: string | null;
  objetos_disponiveis?: ObjetoDisponivelArea[];
  exige_aprovacao: boolean;
  regimento_interno: string | null;
  ativo: boolean;
}

interface DataOcupada {
  reserva_id: number;
  area_id: number;
  data_reserva: string;
  status: string;
  tipo_reserva?: 'total' | 'parcial' | string;
  hora_inicio: string;
  hora_fim: string;
  reservado_por: string;
}

interface ConvidadoFesta {
  id: number;
  reserva_id: number;
  visita_id: number | null;
  nome: string;
  cpf: string;
  telefone: string;
  token_convite: string;
  tem_foto_facial: boolean;
  sincronizado_leitor: boolean;
  visita_status: string;
}

interface ReservaArea {
  id: number;
  area_id: number;
  area_nome: string;
  capacidade_maxima: number;
  unidade_id: number | null;
  unidade_label: string;
  usuario_id: number;
  morador_nome: string;
  morador_telefone: string | null;
  titulo_evento: string;
  data_reserva: string;
  hora_inicio: string;
  hora_fim: string;
  tipo_reserva?: 'total' | 'parcial' | string;
  objetos?: ObjetoSelecionadoReserva[];
  valor_taxa_base?: number;
  valor_objetos?: number;
  valor_total?: number;
  status: 'aprovada' | 'pendente' | 'rejeitada' | 'cancelada' | 'concluida' | string;
  observacoes: string | null;
  resposta_gestao: string | null;
  convidados: ConvidadoFesta[];
  total_convidados: number;
  convidados_com_face: number;
}

interface Aviso {
  tipo: 'ok' | 'erro';
  mensagem: string;
}

const SUGESTOES_OBJETOS_RAPIDOS: { nome: string; qtd_max: number; valor_unitario: number }[] = [
  { nome: 'Jogo de Mesa c/ 4 Cadeiras', qtd_max: 15, valor_unitario: 0 },
  { nome: 'Freezer / Geladeira', qtd_max: 2, valor_unitario: 0 },
  { nome: 'Kit Churrasqueira (Grelha e Espetos)', qtd_max: 1, valor_unitario: 0 },
  { nome: 'Caixa Térmica / Cooler', qtd_max: 2, valor_unitario: 0 },
  { nome: 'Gás de Cozinha / Fogão Industrial', qtd_max: 1, valor_unitario: 35 },
  { nome: 'Taxa de Limpeza Pós-Evento', qtd_max: 1, valor_unitario: 80 },
];

const entrada =
  'w-full px-3.5 py-2.5 border border-slate-300 rounded-xl outline-none focus:border-indigo-600 bg-white text-slate-900 text-sm';

function fmtDataBr(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

function fmtMoeda(valor: number | string | undefined | null): string {
  const n = Number(valor) || 0;
  return `R$ ${n.toFixed(2).replace('.', ',')}`;
}

export default function ReservasAreas() {
  const { usuario } = useSessao();
  const ehGestao = usuario?.perfil === 'superadmin' || usuario?.perfil === 'admin' || usuario?.perfil === 'sindico';
  const ehMorador = usuario?.perfil === 'morador';

  const [areas, setAreas] = useState<AreaComum[]>([]);
  const [datasOcupadas, setDatasOcupadas] = useState<DataOcupada[]>([]);
  const [reservas, setReservas] = useState<ReservaArea[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  // Modal de Nova Reserva
  const [areaReservaModal, setAreaReservaModal] = useState<AreaComum | null>(null);
  const [dataReserva, setDataReserva] = useState('');
  const [horaInicio, setHoraInicio] = useState('10:00');
  const [horaFim, setHoraFim] = useState('22:00');
  const [tipoReserva, setTipoReserva] = useState<'total' | 'parcial'>('total');
  const [qtdObjetosReserva, setQtdObjetosReserva] = useState<Record<string, number>>({});
  const [tituloEvento, setTituloEvento] = useState('');
  const [aceitouRegimento, setAceitouRegimento] = useState(false);
  const [convidadosIniciais, setConvidadosIniciais] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [salvandoReserva, setSalvandoReserva] = useState(false);

  // Modal / Drawer de Lista de Convidados de uma Reserva específica
  const [reservaFocoId, setReservaFocoId] = useState<number | null>(null);
  const [novosNomesLote, setNovosNomesLote] = useState('');
  const [adicionandoConvidados, setAdicionandoConvidados] = useState(false);
  const [copiadoToken, setCopiadoToken] = useState<string | null>(null);

  // Modal de Configuração de Áreas Comuns (Síndico/Admin)
  const [modalConfigArea, setModalConfigArea] = useState<{
    id?: number;
    nome: string;
    descricao: string;
    capacidade_maxima: number;
    hora_inicio_padrao: string;
    hora_fim_padrao: string;
    permite_reserva_total: boolean;
    taxa_valor: string;
    permite_reserva_parcial: boolean;
    taxa_reserva_parcial: string;
    capacidade_parcial: number;
    descricao_parcial: string;
    objetos_disponiveis: { nome: string; qtd_max: number; valor_unitario: string }[];
    exige_aprovacao: boolean;
    regimento_interno: string;
    ativo: boolean;
  } | null>(null);
  const [salvandoArea, setSalvandoArea] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{
        areas: AreaComum[];
        datas_ocupadas: DataOcupada[];
        reservas: ReservaArea[];
      }>('areas_comuns_painel');
      setAreas(r.areas ?? []);
      setDatasOcupadas(r.datas_ocupadas ?? []);
      setReservas(r.reservas ?? []);
    } catch (e) {
      setAviso({
        tipo: 'erro',
        mensagem: e instanceof ErroApi ? e.message : 'Erro ao carregar áreas comuns e reservas.',
      });
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const abrirModalNovaReserva = (area: AreaComum) => {
    const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const permiteTotal = area.permite_reserva_total !== false;
    const permiteParcial = Boolean(area.permite_reserva_parcial);
    setAreaReservaModal(area);
    setDataReserva(amanha);
    setHoraInicio(area.hora_inicio_padrao || '10:00');
    setHoraFim(area.hora_fim_padrao || '22:00');
    setTipoReserva(permiteTotal ? 'total' : permiteParcial ? 'parcial' : 'total');
    setQtdObjetosReserva({});
    setTituloEvento(`Confraternização — ${area.nome}`);
    setAceitouRegimento(false);
    setConvidadosIniciais('');
    setObservacoes('');
  };

  const alterarQtdObjetoReserva = (nomeObj: string, qtd: number, max: number) => {
    const val = Math.max(0, Math.min(max, qtd));
    setQtdObjetosReserva((ant) => ({
      ...ant,
      [nomeObj]: val,
    }));
  };

  const criarReserva = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!areaReservaModal) return;
    setSalvandoReserva(true);
    setAviso(null);
    try {
      const catalogo = areaReservaModal.objetos_disponiveis ?? [];
      const objetosSelecionados = catalogo
        .filter((o) => (qtdObjetosReserva[o.nome] ?? 0) > 0)
        .map((o) => ({
          nome: o.nome,
          qtd: qtdObjetosReserva[o.nome] ?? 0,
          valor_unitario: Number(o.valor_unitario) || 0,
        }));

      const r = await api<{ mensagem: string; reserva_id: number }>('reserva_area_criar', {
        corpo: {
          area_id: areaReservaModal.id,
          data_reserva: dataReserva,
          hora_inicio: horaInicio,
          hora_fim: horaFim,
          tipo_reserva: tipoReserva,
          objetos_selecionados: objetosSelecionados,
          titulo_evento: tituloEvento,
          aceitou_regimento: aceitouRegimento,
          convidados_iniciais: convidadosIniciais,
          observacoes,
        },
      });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      setAreaReservaModal(null);
      await carregar();
      if (r.reserva_id) {
        setReservaFocoId(r.reserva_id);
      }
    } catch (err) {
      setAviso({
        tipo: 'erro',
        mensagem: err instanceof ErroApi ? err.message : 'Erro ao realizar reserva.',
      });
    } finally {
      setSalvandoReserva(false);
    }
  };

  const adicionarConvidados = async (e: React.FormEvent, reservaId: number) => {
    e.preventDefault();
    if (!novosNomesLote.trim()) return;
    setAdicionandoConvidados(true);
    try {
      const r = await api<{ mensagem: string }>('reserva_convidado_adicionar', {
        corpo: {
          reserva_id: reservaId,
          lista_nomes: novosNomesLote,
        },
      });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      setNovosNomesLote('');
      await carregar();
    } catch (err) {
      setAviso({
        tipo: 'erro',
        mensagem: err instanceof ErroApi ? err.message : 'Erro ao adicionar convidados.',
      });
    } finally {
      setAdicionandoConvidados(false);
    }
  };

  const removerConvidado = async (idConvidado: number, nome: string) => {
    if (!window.confirm(`Remover "${nome}" da lista de convidados do evento?`)) return;
    try {
      const r = await api<{ mensagem: string }>('reserva_convidado_remover', {
        corpo: { id: idConvidado },
      });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      await carregar();
    } catch (err) {
      setAviso({
        tipo: 'erro',
        mensagem: err instanceof ErroApi ? err.message : 'Erro ao remover convidado.',
      });
    }
  };

  const alterarStatusReserva = async (id: number, novoStatus: string) => {
    const label =
      novoStatus === 'cancelada'
        ? 'cancelar esta reserva'
        : novoStatus === 'aprovada'
          ? 'aprovar esta reserva'
          : 'rejeitar esta reserva';
    if (!window.confirm(`Tem certeza que deseja ${label}?`)) return;
    try {
      const r = await api<{ mensagem: string }>('reserva_area_status', {
        corpo: { id, status: novoStatus },
      });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      await carregar();
    } catch (err) {
      setAviso({
        tipo: 'erro',
        mensagem: err instanceof ErroApi ? err.message : 'Erro ao atualizar reserva.',
      });
    }
  };

  const salvarAreaComum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalConfigArea) return;
    if (!modalConfigArea.permite_reserva_total && !modalConfigArea.permite_reserva_parcial) {
      setAviso({ tipo: 'erro', mensagem: 'Ative pelo menos uma modalidade (Reserva Total ou Reserva Parcial).' });
      return;
    }
    setSalvandoArea(true);
    try {
      const r = await api<{ mensagem: string }>('areas_comuns_salvar', {
        corpo: {
          ...modalConfigArea,
          objetos_disponiveis: modalConfigArea.objetos_disponiveis
            .filter((o) => o.nome.trim() !== '')
            .map((o) => ({
              nome: o.nome.trim(),
              qtd_max: Math.max(1, Number(o.qtd_max) || 1),
              valor_unitario: Number(String(o.valor_unitario).replace(',', '.')) || 0,
            })),
        },
      });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      setModalConfigArea(null);
      await carregar();
    } catch (err) {
      setAviso({
        tipo: 'erro',
        mensagem: err instanceof ErroApi ? err.message : 'Erro ao salvar área comum.',
      });
    } finally {
      setSalvandoArea(false);
    }
  };

  const linkConviteFacial = (token: string) => `${origemPublica()}/convite?t=${encodeURIComponent(token)}`;

  const copiarLinkConvidado = (c: ConvidadoFesta, res: ReservaArea) => {
    const url = linkConviteFacial(c.token_convite);
    const texto =
      `🎉 Olá ${c.nome !== 'Aguardando Preenchimento' ? c.nome : ''}!\n` +
      `Você está na Lista de Convidados do nosso evento (${res.titulo_evento} - ${res.area_nome}) no dia ${fmtDataBr(res.data_reserva)} das ${res.hora_inicio} às ${res.hora_fim}.\n\n` +
      `📸 Cadastre sua selfie facial neste link para o leitor da portaria abrir automaticamente na sua chegada:\n${url}`;
    navigator.clipboard.writeText(texto).catch(() => {});
    setCopiadoToken(c.token_convite);
    window.setTimeout(() => setCopiadoToken(null), 2500);
  };

  const enviarWhatsAppConvidado = (c: ConvidadoFesta, res: ReservaArea) => {
    const url = linkConviteFacial(c.token_convite);
    const texto =
      `🎉 Olá ${c.nome !== 'Aguardando Preenchimento' ? c.nome : ''}!\n` +
      `Você está na Lista de Convidados do nosso evento (*${res.titulo_evento}* — ${res.area_nome}) no dia *${fmtDataBr(res.data_reserva)}* das *${res.hora_inicio} às ${res.hora_fim}*.\n\n` +
      `📸 Cadastre sua selfie neste link para liberar sua entrada automática no leitor facial da portaria:\n${url}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`, '_blank', 'noopener,noreferrer');
  };

  const reservaFoco = reservas.find((r) => r.id === reservaFocoId) ?? null;

  const datasOcupadasDaAreaModal = areaReservaModal
    ? datasOcupadas.filter((d) => d.area_id === areaReservaModal.id)
    : [];
  const reservasNaDataEscolhida = datasOcupadasDaAreaModal.filter((d) => d.data_reserva === dataReserva);
  const temReservaTotalNaData = reservasNaDataEscolhida.some((d) => (d.tipo_reserva ?? 'total') === 'total');
  const dataBloqueadaParaModalidade =
    reservasNaDataEscolhida.length > 0 && (tipoReserva === 'total' || temReservaTotalNaData);

  // Cálculo em tempo real dos valores no Modal de Nova Reserva
  const taxaBaseModal = areaReservaModal
    ? tipoReserva === 'parcial'
      ? Number(areaReservaModal.taxa_reserva_parcial) || 0
      : Number(areaReservaModal.taxa_valor) || 0
    : 0;
  const totalObjetosModal = (areaReservaModal?.objetos_disponiveis ?? []).reduce((acc, o) => {
    const qtd = qtdObjetosReserva[o.nome] ?? 0;
    return acc + qtd * (Number(o.valor_unitario) || 0);
  }, 0);
  const valorTotalModal = taxaBaseModal + totalObjetosModal;
  const capacidadeModalidadeAtual = areaReservaModal
    ? tipoReserva === 'parcial'
      ? areaReservaModal.capacidade_parcial || Math.max(1, Math.round(areaReservaModal.capacidade_maxima / 2))
      : areaReservaModal.capacidade_maxima
    : 40;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Cabeçalho Comercial / Explicativo */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-blue-900 rounded-3xl p-6 text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-amber-300 text-xs font-extrabold uppercase tracking-wider">
              <Sparkles size={13} /> Acesso Facial Inteligente + Reserva Total, Parcial e Objetos
            </div>
            <h1 className="text-xl sm:text-2xl font-black">
              Reserva de Áreas Comuns &amp; Lista de Convidados da Festa
            </h1>
            <p className="text-xs sm:text-sm text-indigo-100 leading-relaxed">
              Escolha o espaço, a modalidade (<b>Reserva Total</b> ou <b>Reserva Parcial</b>), inclua os <b>objetos/itens</b> desejados
              e preencha a <b>Lista de Convidados</b>. Cada convidado recebe um <b>link exclusivo de Selfie Facial</b> que libera a entrada no leitor da portaria!
            </p>
          </div>
          {ehGestao && (
            <button
              type="button"
              onClick={() =>
                setModalConfigArea({
                  nome: '',
                  descricao: '',
                  capacidade_maxima: 50,
                  hora_inicio_padrao: '10:00',
                  hora_fim_padrao: '22:00',
                  permite_reserva_total: true,
                  taxa_valor: '0',
                  permite_reserva_parcial: false,
                  taxa_reserva_parcial: '0',
                  capacidade_parcial: 25,
                  descricao_parcial: 'Espaço compartilhado / metade das mesas',
                  objetos_disponiveis: [
                    { nome: 'Jogo de Mesa c/ 4 Cadeiras', qtd_max: 10, valor_unitario: '0' },
                    { nome: 'Freezer / Geladeira', qtd_max: 1, valor_unitario: '0' },
                  ],
                  exige_aprovacao: false,
                  regimento_interno:
                    '1. O morador titular responde integralmente por seus convidados e pela conservação do espaço e dos objetos utilizados.\n2. Respeitar rigorosamente o horário limite e a Lei do Silêncio.',
                  ativo: true,
                })
              }
              className="px-4 py-2.5 rounded-2xl bg-white text-indigo-950 hover:bg-indigo-50 font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow cursor-pointer shrink-0"
            >
              <Plus size={16} /> Nova Área Comum
            </button>
          )}
        </div>
      </div>

      {aviso && (
        <div
          className={`border-l-4 px-4 py-3.5 rounded-xl text-sm font-bold flex items-center justify-between gap-3 ${
            aviso.tipo === 'ok'
              ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
              : 'bg-rose-50 border-rose-500 text-rose-900'
          }`}
        >
          <span className="flex items-center gap-2">
            {aviso.tipo === 'ok' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            {aviso.mensagem}
          </span>
          <button type="button" onClick={() => setAviso(null)} className="text-slate-500 hover:text-slate-800">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Cards de Áreas Comuns Disponíveis */}
      <div>
        <h2 className="text-base sm:text-lg font-extrabold text-slate-900 mb-3 flex items-center gap-2">
          <Calendar size={18} className="text-indigo-600" />
          Espaços do Condomínio Disponíveis para Reserva
        </h2>

        {carregando ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400">
            Carregando espaços e agenda...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {areas.map((a) => {
              const ocupadasArea = datasOcupadas.filter((d) => d.area_id === a.id);
              const permiteTotal = a.permite_reserva_total !== false;
              const permiteParcial = Boolean(a.permite_reserva_parcial);
              const taxaTotalNum = Number(a.taxa_valor) || 0;
              const taxaParcialNum = Number(a.taxa_reserva_parcial) || 0;
              const objsArea = a.objetos_disponiveis ?? [];
              return (
                <div
                  key={a.id}
                  className={`bg-white rounded-2xl border p-5 shadow-xs flex flex-col justify-between gap-4 transition ${
                    a.ativo ? 'border-slate-200 hover:border-indigo-300' : 'border-slate-200 opacity-60'
                  }`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-base font-extrabold text-slate-900">{a.nome}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {a.descricao || 'Espaço comum para eventos e confraternizações.'}
                        </p>
                      </div>
                      {ehGestao && (
                        <button
                          type="button"
                          onClick={() =>
                            setModalConfigArea({
                              id: a.id,
                              nome: a.nome,
                              descricao: a.descricao || '',
                              capacidade_maxima: a.capacidade_maxima,
                              hora_inicio_padrao: a.hora_inicio_padrao,
                              hora_fim_padrao: a.hora_fim_padrao,
                              permite_reserva_total: a.permite_reserva_total !== false,
                              taxa_valor: String(a.taxa_valor ?? '0'),
                              permite_reserva_parcial: Boolean(a.permite_reserva_parcial),
                              taxa_reserva_parcial: String(a.taxa_reserva_parcial ?? '0'),
                              capacidade_parcial: a.capacidade_parcial || Math.max(1, Math.round(a.capacidade_maxima / 2)),
                              descricao_parcial: a.descricao_parcial || '',
                              objetos_disponiveis: (a.objetos_disponiveis ?? []).map((o) => ({
                                nome: o.nome,
                                qtd_max: o.qtd_max,
                                valor_unitario: String(o.valor_unitario ?? '0'),
                              })),
                              exige_aprovacao: Boolean(a.exige_aprovacao),
                              regimento_interno: a.regimento_interno || '',
                              ativo: Boolean(a.ativo),
                            })
                          }
                          title="Configurar modalidades, valores e objetos deste espaço"
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          <Pencil size={13} /> Configurar
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold">
                        <Clock size={13} /> {a.hora_inicio_padrao} às {a.hora_fim_padrao}
                      </span>
                      {permiteTotal && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200 text-xs font-bold">
                          🏛️ Reserva Total: {taxaTotalNum > 0 ? fmtMoeda(taxaTotalNum) : 'Grátis'} (até {a.capacidade_maxima} pess.)
                        </span>
                      )}
                      {permiteParcial && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 text-xs font-bold">
                          🌗 Reserva Parcial: {taxaParcialNum > 0 ? fmtMoeda(taxaParcialNum) : 'Grátis'} (até {a.capacidade_parcial || Math.round(a.capacidade_maxima / 2)} pess.)
                        </span>
                      )}
                    </div>

                    {objsArea.length > 0 && (
                      <div className="pt-1.5">
                        <div className="text-[11px] font-extrabold uppercase text-slate-500 flex items-center gap-1 mb-1">
                          <Package size={12} className="text-indigo-600" /> Objetos disponíveis para incluir na reserva:
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {objsArea.map((o, idx) => (
                            <span
                              key={`${o.nome}-${idx}`}
                              className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-semibold"
                            >
                              {o.nome} (até {o.qtd_max}x{Number(o.valor_unitario) > 0 ? ` · ${fmtMoeda(o.valor_unitario)}/un.` : ' · Incluso'})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {ocupadasArea.length > 0 && (
                      <div className="pt-2 border-t border-slate-100">
                        <div className="text-[11px] font-bold uppercase text-slate-400 mb-1">
                          Próximas datas com reserva:
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {ocupadasArea.slice(0, 5).map((o) => (
                            <span
                              key={o.reserva_id}
                              className={`px-2 py-0.5 rounded border text-[11px] font-bold ${
                                o.tipo_reserva === 'parcial'
                                  ? 'bg-sky-50 border-sky-200 text-sky-800'
                                  : 'bg-amber-50 border-amber-200 text-amber-800'
                              }`}
                              title={`Reservado por ${o.reservado_por} (${o.tipo_reserva === 'parcial' ? 'Reserva Parcial' : 'Reserva Total'})`}
                            >
                              {fmtDataBr(o.data_reserva)} {o.tipo_reserva === 'parcial' ? '(Parcial)' : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={!a.ativo}
                    onClick={() => abrirModalNovaReserva(a)}
                    className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition shadow-sm"
                  >
                    <Calendar size={15} />
                    Reservar Espaço &amp; Incluir Objetos
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lista de Reservas & Gerenciador da Lista de Convidados da Festa */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
              <Users size={18} className="text-indigo-600" />
              {ehMorador ? 'Minhas Reservas & Lista de Convidados' : 'Reservas do Condomínio & Listas de Convidados'}
            </h2>
            <p className="text-xs text-slate-500">
              Clique em <b>"Gerenciar Lista de Convidados (Facial)"</b> em qualquer reserva para adicionar convidados e enviar o link de selfie pelo WhatsApp.
            </p>
          </div>
        </div>

        {reservas.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm">
            Nenhuma reserva registrada até o momento. Clique em <b>"Reservar Espaço &amp; Incluir Objetos"</b> em um dos espaços acima!
          </div>
        ) : (
          <div className="space-y-4">
            {reservas.map((r) => {
              const aberta = reservaFocoId === r.id;
              const ehParcial = r.tipo_reserva === 'parcial';
              const valorTotalRes = Number(r.valor_total ?? 0);
              const objsReserva = r.objetos ?? [];
              const badgeCor =
                r.status === 'aprovada'
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  : r.status === 'pendente'
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : 'bg-slate-100 text-slate-600 border-slate-300';

              return (
                <div
                  key={r.id}
                  className={`rounded-2xl border transition overflow-hidden ${
                    aberta ? 'border-indigo-500 ring-2 ring-indigo-500/15 bg-indigo-50/10' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1.5 flex-1 min-w-[260px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-lg bg-indigo-600 text-white text-xs font-extrabold">
                          {r.area_nome}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-lg text-xs font-extrabold border ${
                            ehParcial
                              ? 'bg-amber-50 text-amber-900 border-amber-300'
                              : 'bg-blue-50 text-blue-800 border-blue-200'
                          }`}
                        >
                          {ehParcial ? '🌗 Reserva Parcial' : '🏛️ Reserva Total'}
                        </span>
                        <span className="font-extrabold text-slate-900 text-sm sm:text-base">
                          {r.titulo_evento}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold border uppercase ${badgeCor}`}>
                          {r.status}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-extrabold">
                          💰 {valorTotalRes > 0 ? fmtMoeda(valorTotalRes) : 'Sem taxa'}
                        </span>
                      </div>

                      <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span>
                          📅 Data: <b className="text-slate-900">{fmtDataBr(r.data_reserva)}</b> ({r.hora_inicio} às {r.hora_fim})
                        </span>
                        <span>
                          🏢 Unidade: <b className="text-slate-900">{r.unidade_label || 'Geral'}</b> ({r.morador_nome})
                        </span>
                        <span className="text-indigo-700 font-bold">
                          👥 Convidados na Lista: {r.total_convidados} / {r.capacidade_maxima} ({r.convidados_com_face} com biometria facial pronta)
                        </span>
                      </div>

                      {objsReserva.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[11px] font-extrabold text-slate-500 flex items-center gap-1">
                            <Package size={12} className="text-indigo-600" /> Objetos incluídos na reserva:
                          </span>
                          {objsReserva.map((ob, idx) => (
                            <span
                              key={`${ob.nome}-${idx}`}
                              className="px-2 py-0.5 rounded-md bg-indigo-50/80 border border-indigo-200 text-indigo-900 text-[11px] font-bold"
                            >
                              {ob.qtd}x {ob.nome}
                              {Number(ob.subtotal) > 0 ? ` (${fmtMoeda(ob.subtotal)})` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setReservaFocoId(aberta ? null : r.id)}
                        className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <ScanFace size={15} />
                        {aberta
                          ? 'Recolher Lista da Festa'
                          : `Gerenciar Lista de Convidados (${r.total_convidados})`}
                      </button>

                      {ehGestao && r.status === 'pendente' && (
                        <>
                          <button
                            type="button"
                            onClick={() => alterarStatusReserva(r.id, 'aprovada')}
                            className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer"
                          >
                            ✅ Aprovar
                          </button>
                          <button
                            type="button"
                            onClick={() => alterarStatusReserva(r.id, 'rejeitada')}
                            className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs cursor-pointer"
                          >
                            ❌ Rejeitar
                          </button>
                        </>
                      )}

                      {(r.status === 'aprovada' || r.status === 'pendente') && (
                        <button
                          type="button"
                          onClick={() => alterarStatusReserva(r.id, 'cancelada')}
                          className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs cursor-pointer"
                        >
                          Cancelar Reserva
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Painel Expandido da Lista de Convidados da Festa */}
                  {aberta && reservaFoco && (
                    <div className="border-t border-indigo-200 bg-slate-50/80 p-4 sm:p-6 space-y-5">
                      <div className="bg-indigo-950 text-white rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="text-xs font-extrabold uppercase text-amber-300 flex items-center gap-1.5">
                            <Sparkles size={14} /> Como funciona a liberação facial da sua festa
                          </div>
                          <p className="text-xs text-indigo-100">
                            Adicione os nomes dos seus convidados abaixo e clique em <b>"📲 Enviar no WhatsApp"</b>.
                            Quando o convidado abrir o link e tirar a selfie, o leitor facial da portaria liberará a entrada dele
                            automaticamente no dia <b>{fmtDataBr(r.data_reserva)} ({r.hora_inicio} às {r.hora_fim})</b>!
                          </p>
                        </div>
                      </div>

                      {r.status !== 'cancelada' && r.status !== 'rejeitada' && (
                        <form
                          onSubmit={(e) => adicionarConvidados(e, r.id)}
                          className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3"
                        >
                          <label className="block text-xs font-extrabold uppercase text-slate-700">
                            ➕ Adicionar Convidados à Lista da Festa (digite ou cole 1 nome por linha):
                          </label>
                          <div className="flex flex-col sm:flex-row gap-3">
                            <textarea
                              rows={2}
                              value={novosNomesLote}
                              onChange={(e) => setNovosNomesLote(e.target.value)}
                              placeholder={'Ex:\nJoão Silva\nMaria Oliveira\nCarlos Eduardo'}
                              className={entrada}
                            />
                            <button
                              type="submit"
                              disabled={adicionandoConvidados || !novosNomesLote.trim()}
                              className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm shrink-0 flex items-center justify-center gap-2 cursor-pointer"
                            >
                              <Plus size={16} />
                              {adicionandoConvidados ? 'Gerando Convites...' : 'Adicionar à Lista'}
                            </button>
                          </div>
                        </form>
                      )}

                      {r.convidados.length === 0 ? (
                        <div className="text-center py-6 text-slate-400 text-xs">
                          Nenhum convidado adicionado ainda nesta reserva.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {r.convidados.map((c, idx) => (
                            <div
                              key={c.id}
                              className="bg-white rounded-xl border border-slate-200 p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs"
                            >
                              <div className="space-y-1 min-w-0">
                                <div className="font-extrabold text-slate-900 text-sm truncate">
                                  {idx + 1}. {c.nome}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                  {c.tem_foto_facial ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-extrabold">
                                      <CheckCircle2 size={12} /> Selfie Facial Pronta
                                      {c.sincronizado_leitor ? ' · Na Leitora' : ''}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold">
                                      <Clock size={12} /> Aguardando Selfie pelo Link
                                    </span>
                                  )}
                                  {c.cpf && (
                                    <span className="font-mono text-slate-500">CPF: {c.cpf}</span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {c.token_convite && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => enviarWhatsAppConvidado(c, r)}
                                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-1 cursor-pointer"
                                      title="Enviar link de cadastro facial pelo WhatsApp"
                                    >
                                      <Share2 size={13} /> WhatsApp
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => copiarLinkConvidado(c, r)}
                                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1 cursor-pointer"
                                      title="Copiar convite e link facial"
                                    >
                                      {copiadoToken === c.token_convite ? (
                                        <>
                                          <Check size={13} className="text-emerald-600" /> Copiado!
                                        </>
                                      ) : (
                                        <>
                                          <Copy size={13} /> Link
                                        </>
                                      )}
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={() => removerConvidado(c.id, c.nome)}
                                  className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 cursor-pointer"
                                  title="Remover convidado da lista"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Nova Reserva (com escolha de Reserva Total / Parcial, Inclusão de Objetos e Resumo de Valores) */}
      {areaReservaModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAreaReservaModal(null);
          }}
        >
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border-t-4 border-t-indigo-600 space-y-4 my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  Reservar {areaReservaModal.nome}
                </h3>
                <p className="text-xs text-slate-500">
                  Capacidade na modalidade selecionada: até {capacidadeModalidadeAtual} convidados
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAreaReservaModal(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={criarReserva} className="space-y-4">
              {/* 1. Escolha da Modalidade: Reserva Total ou Reserva Parcial */}
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-700 mb-2 flex items-center gap-1.5">
                  <Layers size={14} className="text-indigo-600" />
                  1. Modalidade da Reserva do Espaço
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {areaReservaModal.permite_reserva_total !== false && (
                    <label
                      className={`p-3.5 rounded-2xl border-2 cursor-pointer transition flex flex-col justify-between gap-1 ${
                        tipoReserva === 'total'
                          ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-500/15'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                          <input
                            type="radio"
                            name="tipo_reserva"
                            checked={tipoReserva === 'total'}
                            onChange={() => setTipoReserva('total')}
                            className="accent-indigo-600"
                          />
                          🏛️ Reserva Total
                        </span>
                        <span className="px-2 py-0.5 rounded-lg bg-indigo-600 text-white text-xs font-extrabold">
                          {(Number(areaReservaModal.taxa_valor) || 0) > 0
                            ? fmtMoeda(areaReservaModal.taxa_valor)
                            : 'Sem taxa'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 pl-5">
                        Uso exclusivo do espaço para até <b>{areaReservaModal.capacidade_maxima} convidados</b>.
                      </p>
                    </label>
                  )}

                  {Boolean(areaReservaModal.permite_reserva_parcial) && (
                    <label
                      className={`p-3.5 rounded-2xl border-2 cursor-pointer transition flex flex-col justify-between gap-1 ${
                        tipoReserva === 'parcial'
                          ? 'border-amber-600 bg-amber-50/70 ring-2 ring-amber-500/15'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                          <input
                            type="radio"
                            name="tipo_reserva"
                            checked={tipoReserva === 'parcial'}
                            onChange={() => setTipoReserva('parcial')}
                            className="accent-amber-600"
                          />
                          🌗 Reserva Parcial
                        </span>
                        <span className="px-2 py-0.5 rounded-lg bg-amber-600 text-white text-xs font-extrabold">
                          {(Number(areaReservaModal.taxa_reserva_parcial) || 0) > 0
                            ? fmtMoeda(areaReservaModal.taxa_reserva_parcial)
                            : 'Sem taxa'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 pl-5">
                        Até <b>{areaReservaModal.capacidade_parcial || Math.round(areaReservaModal.capacidade_maxima / 2)} convidados</b>
                        {areaReservaModal.descricao_parcial ? ` · ${areaReservaModal.descricao_parcial}` : ' · Uso parcial do espaço'}.
                      </p>
                    </label>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Nome do Evento / Confraternização
                </label>
                <input
                  type="text"
                  required
                  value={tituloEvento}
                  onChange={(e) => setTituloEvento(e.target.value)}
                  placeholder="Ex: Aniversário do Lucas, Churrasco em Família..."
                  className={entrada}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                    Data do Evento
                  </label>
                  <input
                    type="date"
                    required
                    min={new Date().toISOString().slice(0, 10)}
                    value={dataReserva}
                    onChange={(e) => setDataReserva(e.target.value)}
                    className={entrada}
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                    Hora de Início
                  </label>
                  <input
                    type="time"
                    required
                    value={horaInicio}
                    onChange={(e) => setHoraInicio(e.target.value)}
                    className={entrada}
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                    Hora de Término
                  </label>
                  <input
                    type="time"
                    required
                    value={horaFim}
                    onChange={(e) => setHoraFim(e.target.value)}
                    className={entrada}
                  />
                </div>
              </div>

              {reservasNaDataEscolhida.length > 0 && (
                <div
                  className={`p-3 rounded-xl border text-xs font-bold ${
                    dataBloqueadaParaModalidade
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  {dataBloqueadaParaModalidade ? (
                    <>
                      ⚠️ Atenção: O dia {fmtDataBr(dataReserva)} já possui reserva conflitante para {areaReservaModal.nome} ({reservasNaDataEscolhida.map((x) => x.reservado_por).join(', ')}). Escolha outra data{Boolean(areaReservaModal.permite_reserva_parcial) && !temReservaTotalNaData ? ' ou altere para Reserva Parcial' : ''}!
                    </>
                  ) : (
                    <>
                      ℹ️ O dia {fmtDataBr(dataReserva)} já possui {reservasNaDataEscolhida.length} Reserva(s) Parcial(is) ativa(s), mas ainda permite sua Reserva Parcial compartilhada!
                    </>
                  )}
                </div>
              )}

              {/* 2. Inclusão de Objetos na Reserva */}
              {(areaReservaModal.objetos_disponiveis?.length ?? 0) > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold uppercase text-slate-700 flex items-center gap-1.5">
                      <Package size={15} className="text-indigo-600" />
                      2. Inclusão de Objetos / Itens na Reserva
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500">
                      Selecione os objetos e quantidades que utilizará
                    </span>
                  </div>
                  <div className="space-y-2">
                    {areaReservaModal.objetos_disponiveis!.map((o, idx) => {
                      const qtdAtual = qtdObjetosReserva[o.nome] ?? 0;
                      const valUnit = Number(o.valor_unitario) || 0;
                      const subtotal = qtdAtual * valUnit;
                      return (
                        <div
                          key={`${o.nome}-${idx}`}
                          className={`p-2.5 rounded-xl border flex flex-wrap items-center justify-between gap-2 transition ${
                            qtdAtual > 0 ? 'bg-indigo-50/70 border-indigo-300' : 'bg-white border-slate-200'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-xs sm:text-sm font-extrabold text-slate-900">{o.nome}</div>
                            <div className="text-[11px] text-slate-500">
                              Disponível: até {o.qtd_max} un. ·{' '}
                              <b className={valUnit > 0 ? 'text-emerald-700' : 'text-slate-700'}>
                                {valUnit > 0 ? `${fmtMoeda(valUnit)} por unidade` : 'Incluso (Sem custo adicional)'}
                              </b>
                              {subtotal > 0 && (
                                <span className="ml-2 text-indigo-700 font-extrabold">
                                  Subtotal: {fmtMoeda(subtotal)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => alterarQtdObjetoReserva(o.nome, qtdAtual - 1, o.qtd_max)}
                              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 font-extrabold text-slate-700 flex items-center justify-center cursor-pointer"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min={0}
                              max={o.qtd_max}
                              value={qtdAtual}
                              onChange={(e) => alterarQtdObjetoReserva(o.nome, Number(e.target.value) || 0, o.qtd_max)}
                              className="w-14 px-2 py-1 text-center font-extrabold text-sm border border-slate-300 rounded-lg bg-white"
                            />
                            <button
                              type="button"
                              onClick={() => alterarQtdObjetoReserva(o.nome, qtdAtual + 1, o.qtd_max)}
                              className="w-7 h-7 rounded-lg bg-indigo-600 hover:bg-indigo-700 font-extrabold text-white flex items-center justify-center cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Resumo de Valores da Reserva */}
              <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5 text-xs text-emerald-950">
                  <div className="font-extrabold uppercase flex items-center gap-1">
                    <DollarSign size={14} className="text-emerald-700" /> Resumo de Valores da Reserva
                  </div>
                  <div className="text-emerald-800">
                    Modalidade ({tipoReserva === 'parcial' ? 'Reserva Parcial' : 'Reserva Total'}):{' '}
                    <b>{fmtMoeda(taxaBaseModal)}</b>
                    {totalObjetosModal > 0 && (
                      <>
                        {' '}
                        + Objetos selecionados: <b>{fmtMoeda(totalObjetosModal)}</b>
                      </>
                    )}
                  </div>
                </div>
                <div className="px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white font-black text-sm">
                  Total: {fmtMoeda(valorTotalModal)}
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Lista Inicial de Convidados da Festa (Opcional — 1 nome por linha)
                </label>
                <textarea
                  rows={3}
                  value={convidadosIniciais}
                  onChange={(e) => setConvidadosIniciais(e.target.value)}
                  placeholder={'Cole ou digite os nomes dos convidados (você também pode adicionar depois):\nJoão da Silva\nMaria Fernanda\nPedro Henrique'}
                  className={entrada}
                />
                <p className="text-[11px] text-indigo-700 font-semibold mt-1">
                  ✨ Para cada nome informado, o sistema já cria o link de acesso facial válido no dia {fmtDataBr(dataReserva)} das {horaInicio} às {horaFim}!
                </p>
              </div>

              {areaReservaModal.regimento_interno && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
                  <div className="text-xs font-extrabold uppercase text-slate-700 flex items-center gap-1.5">
                    <FileText size={14} className="text-indigo-600" />
                    Regimento Interno &amp; Termo de Responsabilidade
                  </div>
                  <div className="text-xs text-slate-600 whitespace-pre-line max-h-28 overflow-y-auto pr-1">
                    {areaReservaModal.regimento_interno}
                  </div>
                  <label className="flex items-start gap-2.5 pt-2 border-t border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      required
                      checked={aceitouRegimento}
                      onChange={(e) => setAceitouRegimento(e.target.checked)}
                      className="w-4 h-4 mt-0.5 accent-indigo-600"
                    />
                    <span className="text-xs font-bold text-slate-800">
                      Li e aceito integralmente o Regimento Interno e assumo responsabilidade pelos meus convidados e objetos incluídos.
                    </span>
                  </label>
                </div>
              )}

              <div className="flex items-center gap-2.5 pt-2">
                <button
                  type="submit"
                  disabled={salvandoReserva || dataBloqueadaParaModalidade}
                  className="flex-1 py-3 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-extrabold text-sm cursor-pointer shadow"
                >
                  {salvandoReserva ? 'Confirmando Reserva...' : '✅ Confirmar Reserva e Gerar Convites'}
                </button>
                <button
                  type="button"
                  onClick={() => setAreaReservaModal(null)}
                  className="py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Configuração de Área Comum (Síndico/Admin): Reserva Total, Reserva Parcial, Valores e Objetos */}
      {modalConfigArea && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalConfigArea(null);
          }}
        >
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border-t-4 border-t-blue-600 space-y-4 my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <Settings size={18} className="text-blue-600" />
                {modalConfigArea.id ? 'Configurar Espaço, Valores e Objetos' : 'Cadastrar Nova Área Comum'}
              </h3>
              <button
                type="button"
                onClick={() => setModalConfigArea(null)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={salvarAreaComum} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">Nome do Espaço *</label>
                  <input
                    type="text"
                    required
                    value={modalConfigArea.nome}
                    onChange={(e) => setModalConfigArea({ ...modalConfigArea, nome: e.target.value })}
                    placeholder="Ex: Salão de Festas, Churrasqueira..."
                    className={entrada}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">Descrição Curta</label>
                  <input
                    type="text"
                    value={modalConfigArea.descricao}
                    onChange={(e) => setModalConfigArea({ ...modalConfigArea, descricao: e.target.value })}
                    placeholder="Ex: Espaço climatizado com churrasqueira e freezer"
                    className={entrada}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">Horário Início Padrão</label>
                  <input
                    type="time"
                    value={modalConfigArea.hora_inicio_padrao}
                    onChange={(e) => setModalConfigArea({ ...modalConfigArea, hora_inicio_padrao: e.target.value })}
                    className={entrada}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">Horário Fim Padrão</label>
                  <input
                    type="time"
                    value={modalConfigArea.hora_fim_padrao}
                    onChange={(e) => setModalConfigArea({ ...modalConfigArea, hora_fim_padrao: e.target.value })}
                    className={entrada}
                  />
                </div>
              </div>

              {/* Configuração de Reserva Total e Reserva Parcial + Valores */}
              <div className="space-y-3">
                <div className="text-xs font-extrabold uppercase text-slate-700 flex items-center gap-1.5">
                  <Layers size={15} className="text-blue-600" />
                  Modalidades de Reserva (Total / Parcial) &amp; Valores (R$)
                </div>

                {/* Card Reserva Total */}
                <div
                  className={`p-4 rounded-2xl border transition space-y-3 ${
                    modalConfigArea.permite_reserva_total
                      ? 'bg-indigo-50/60 border-indigo-300'
                      : 'bg-slate-50 border-slate-200 opacity-70'
                  }`}
                >
                  <label className="flex items-center justify-between gap-2 cursor-pointer">
                    <span className="flex items-center gap-2 text-sm font-extrabold text-indigo-950">
                      <input
                        type="checkbox"
                        checked={modalConfigArea.permite_reserva_total}
                        onChange={(e) =>
                          setModalConfigArea({ ...modalConfigArea, permite_reserva_total: e.target.checked })
                        }
                        className="w-4 h-4 accent-indigo-600"
                      />
                      🏛️ Habilitar Reserva Total (Uso Exclusivo do Espaço)
                    </span>
                    <span className="text-[11px] font-bold text-indigo-700">Bloqueia a data inteira</span>
                  </label>

                  {modalConfigArea.permite_reserva_total && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Valor da Reserva Total (R$)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={modalConfigArea.taxa_valor}
                          onChange={(e) => setModalConfigArea({ ...modalConfigArea, taxa_valor: e.target.value })}
                          placeholder="0.00"
                          className={entrada}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Capacidade Máxima (Reserva Total)
                        </label>
                        <input
                          type="number"
                          min={1}
                          required
                          value={modalConfigArea.capacidade_maxima}
                          onChange={(e) =>
                            setModalConfigArea({ ...modalConfigArea, capacidade_maxima: Number(e.target.value) || 40 })
                          }
                          className={entrada}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Reserva Parcial */}
                <div
                  className={`p-4 rounded-2xl border transition space-y-3 ${
                    modalConfigArea.permite_reserva_parcial
                      ? 'bg-amber-50/70 border-amber-300'
                      : 'bg-slate-50 border-slate-200 opacity-75'
                  }`}
                >
                  <label className="flex items-center justify-between gap-2 cursor-pointer">
                    <span className="flex items-center gap-2 text-sm font-extrabold text-amber-950">
                      <input
                        type="checkbox"
                        checked={modalConfigArea.permite_reserva_parcial}
                        onChange={(e) =>
                          setModalConfigArea({ ...modalConfigArea, permite_reserva_parcial: e.target.checked })
                        }
                        className="w-4 h-4 accent-amber-600"
                      />
                      🌗 Habilitar Reserva Parcial (Uso Parcial / Compartilhado)
                    </span>
                    <span className="text-[11px] font-bold text-amber-800">Permite reserva menor / parcial</span>
                  </label>

                  {modalConfigArea.permite_reserva_parcial && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Valor da Reserva Parcial (R$)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={modalConfigArea.taxa_reserva_parcial}
                          onChange={(e) =>
                            setModalConfigArea({ ...modalConfigArea, taxa_reserva_parcial: e.target.value })
                          }
                          placeholder="0.00"
                          className={entrada}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Capacidade na Parcial
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={modalConfigArea.capacidade_parcial}
                          onChange={(e) =>
                            setModalConfigArea({ ...modalConfigArea, capacidade_parcial: Number(e.target.value) || 20 })
                          }
                          className={entrada}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Descrição da Parcial
                        </label>
                        <input
                          type="text"
                          value={modalConfigArea.descricao_parcial}
                          onChange={(e) =>
                            setModalConfigArea({ ...modalConfigArea, descricao_parcial: e.target.value })
                          }
                          placeholder="Ex: Metade das mesas / 1 churrasqueira"
                          className={entrada}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Catálogo de Objetos / Itens para Inclusão na Reserva */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-extrabold uppercase text-slate-800 flex items-center gap-1.5">
                      <Package size={15} className="text-indigo-600" />
                      Objetos / Itens para Inclusão na Reserva do Espaço
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Cadastre mesas, cadeiras, freezer, churrasqueira, gás ou taxas opcionais (use R$ 0,00 se o objeto já for gratuito/incluso).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setModalConfigArea({
                        ...modalConfigArea,
                        objetos_disponiveis: [
                          ...modalConfigArea.objetos_disponiveis,
                          { nome: '', qtd_max: 1, valor_unitario: '0' },
                        ],
                      })
                    }
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={14} /> Adicionar Objeto
                  </button>
                </div>

                {/* Botões rápidos de objetos comuns */}
                <div className="flex flex-wrap gap-1.5">
                  {SUGESTOES_OBJETOS_RAPIDOS.map((sug) => {
                    const jaExiste = modalConfigArea.objetos_disponiveis.some(
                      (o) => o.nome.trim().toLowerCase() === sug.nome.toLowerCase(),
                    );
                    if (jaExiste) return null;
                    return (
                      <button
                        key={sug.nome}
                        type="button"
                        onClick={() =>
                          setModalConfigArea({
                            ...modalConfigArea,
                            objetos_disponiveis: [
                              ...modalConfigArea.objetos_disponiveis,
                              {
                                nome: sug.nome,
                                qtd_max: sug.qtd_max,
                                valor_unitario: String(sug.valor_unitario),
                              },
                            ],
                          })
                        }
                        className="px-2.5 py-1 rounded-lg bg-white hover:bg-indigo-50 border border-slate-300 text-slate-700 hover:text-indigo-800 text-[11px] font-bold cursor-pointer"
                      >
                        + {sug.nome}
                      </button>
                    );
                  })}
                </div>

                {modalConfigArea.objetos_disponiveis.length === 0 ? (
                  <div className="text-xs text-slate-400 text-center py-3">
                    Nenhum objeto cadastrado ainda. Clique nos atalhos acima ou em "+ Adicionar Objeto".
                  </div>
                ) : (
                  <div className="space-y-2">
                    {modalConfigArea.objetos_disponiveis.map((obj, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-white p-2.5 rounded-xl border border-slate-200">
                        <div className="col-span-6">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase">Nome do Objeto / Item</label>
                          <input
                            type="text"
                            value={obj.nome}
                            onChange={(e) => {
                              const lista = [...modalConfigArea.objetos_disponiveis];
                              lista[idx] = { ...lista[idx], nome: e.target.value };
                              setModalConfigArea({ ...modalConfigArea, objetos_disponiveis: lista });
                            }}
                            placeholder="Ex: Jogo de Mesa, Freezer..."
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase">Qtd. Máx</label>
                          <input
                            type="number"
                            min={1}
                            value={obj.qtd_max}
                            onChange={(e) => {
                              const lista = [...modalConfigArea.objetos_disponiveis];
                              lista[idx] = { ...lista[idx], qtd_max: Math.max(1, Number(e.target.value) || 1) };
                              setModalConfigArea({ ...modalConfigArea, objetos_disponiveis: lista });
                            }}
                            className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-center"
                          />
                        </div>
                        <div className="col-span-3">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase">Valor Unit. (R$)</label>
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            value={obj.valor_unitario}
                            onChange={(e) => {
                              const lista = [...modalConfigArea.objetos_disponiveis];
                              lista[idx] = { ...lista[idx], valor_unitario: e.target.value };
                              setModalConfigArea({ ...modalConfigArea, objetos_disponiveis: lista });
                            }}
                            placeholder="0.00"
                            className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs font-bold"
                          />
                        </div>
                        <div className="col-span-1 flex justify-end pt-3.5">
                          <button
                            type="button"
                            onClick={() => {
                              const lista = modalConfigArea.objetos_disponiveis.filter((_, i) => i !== idx);
                              setModalConfigArea({ ...modalConfigArea, objetos_disponiveis: lista });
                            }}
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 cursor-pointer"
                            title="Remover objeto"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                  Regimento Interno / Regras de Uso
                </label>
                <textarea
                  rows={3}
                  value={modalConfigArea.regimento_interno}
                  onChange={(e) => setModalConfigArea({ ...modalConfigArea, regimento_interno: e.target.value })}
                  className={entrada}
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={modalConfigArea.exige_aprovacao}
                  onChange={(e) => setModalConfigArea({ ...modalConfigArea, exige_aprovacao: e.target.checked })}
                  className="w-4 h-4 accent-blue-600"
                />
                Exigir aprovação prévia do Síndico antes de confirmar a reserva
              </label>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={salvandoArea}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm cursor-pointer"
                >
                  {salvandoArea ? 'Salvando...' : 'Salvar Configuração do Espaço'}
                </button>
                <button
                  type="button"
                  onClick={() => setModalConfigArea(null)}
                  className="py-2.5 px-4 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
