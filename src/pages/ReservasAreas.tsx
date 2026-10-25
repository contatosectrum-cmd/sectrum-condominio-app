import { useCallback, useEffect, useState } from 'react';
import {
  Calendar, Users, Plus, CheckCircle2, Clock, Trash2, Share2, Copy, Settings,
  Sparkles, FileText, X, ScanFace, AlertCircle, Check, Pencil,
} from 'lucide-react';
import { api, ErroApi, origemPublica } from '../lib/api';
import { useSessao } from '../lib/useSessao';

interface AreaComum {
  id: number;
  nome: string;
  descricao: string | null;
  capacidade_maxima: number;
  hora_inicio_padrao: string;
  hora_fim_padrao: string;
  taxa_valor: string | number;
  exige_aprovacao: boolean;
  regimento_interno: string | null;
  ativo: boolean;
}

interface DataOcupada {
  reserva_id: number;
  area_id: number;
  data_reserva: string;
  status: string;
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

const entrada =
  'w-full px-3.5 py-2.5 border border-slate-300 rounded-xl outline-none focus:border-indigo-600 bg-white text-slate-900 text-sm';

function fmtDataBr(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
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
    taxa_valor: string;
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
    setAreaReservaModal(area);
    setDataReserva(amanha);
    setHoraInicio(area.hora_inicio_padrao || '10:00');
    setHoraFim(area.hora_fim_padrao || '22:00');
    setTituloEvento(`Confraternização — ${area.nome}`);
    setAceitouRegimento(false);
    setConvidadosIniciais('');
    setObservacoes('');
  };

  const criarReserva = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!areaReservaModal) return;
    setSalvandoReserva(true);
    setAviso(null);
    try {
      const r = await api<{ mensagem: string; reserva_id: number }>('reserva_area_criar', {
        corpo: {
          area_id: areaReservaModal.id,
          data_reserva: dataReserva,
          hora_inicio: horaInicio,
          hora_fim: horaFim,
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
    setSalvandoArea(true);
    try {
      const r = await api<{ mensagem: string }>('areas_comuns_salvar', {
        corpo: modalConfigArea,
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
  const dataEscolhidaOcupada = datasOcupadasDaAreaModal.find((d) => d.data_reserva === dataReserva);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Cabeçalho Comercial / Explicativo */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-blue-900 rounded-3xl p-6 text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-amber-300 text-xs font-extrabold uppercase tracking-wider">
              <Sparkles size={13} /> Acesso Facial Inteligente para Convidados
            </div>
            <h1 className="text-xl sm:text-2xl font-black">
              Reserva de Áreas Comuns &amp; Lista de Convidados da Festa
            </h1>
            <p className="text-xs sm:text-sm text-indigo-100 leading-relaxed">
              Escolha o espaço e a data do seu evento, aceite o regimento interno e preencha a <b>Lista de Convidados</b>.
              Cada convidado recebe um <b>link exclusivo de Selfie Facial</b> que libera a entrada no leitor da portaria
              <b> apenas no dia e horário da sua festa</b>, sem filas na portaria!
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
                  taxa_valor: '0',
                  exige_aprovacao: false,
                  regimento_interno:
                    '1. O morador titular responde integralmente por seus convidados e pela conservação do espaço.\n2. Respeitar rigorosamente o horário limite e a Lei do Silêncio.',
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
              const taxaNum = Number(a.taxa_valor) || 0;
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
                              taxa_valor: String(a.taxa_valor ?? '0'),
                              exige_aprovacao: Boolean(a.exige_aprovacao),
                              regimento_interno: a.regimento_interno || '',
                              ativo: Boolean(a.ativo),
                            })
                          }
                          title="Editar configurações deste espaço"
                          className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 text-xs font-bold">
                        <Users size={13} /> Até {a.capacidade_maxima} convidados
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold">
                        <Clock size={13} /> {a.hora_inicio_padrao} às {a.hora_fim_padrao}
                      </span>
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-bold">
                        {taxaNum > 0 ? `Taxa: R$ ${taxaNum.toFixed(2).replace('.', ',')}` : 'Sem taxa extra'}
                      </span>
                    </div>

                    {ocupadasArea.length > 0 && (
                      <div className="pt-2 border-t border-slate-100">
                        <div className="text-[11px] font-bold uppercase text-slate-400 mb-1">
                          Próximas datas já reservadas:
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {ocupadasArea.slice(0, 5).map((o) => (
                            <span
                              key={o.reserva_id}
                              className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold"
                              title={`Reservado por ${o.reservado_por}`}
                            >
                              {fmtDataBr(o.data_reserva)}
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
                    Reservar Data &amp; Criar Lista da Festa
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
            Nenhuma reserva registrada até o momento. Clique em <b>"Reservar Data &amp; Criar Lista da Festa"</b> em um dos espaços acima!
          </div>
        ) : (
          <div className="space-y-4">
            {reservas.map((r) => {
              const aberta = reservaFocoId === r.id;
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
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-lg bg-indigo-600 text-white text-xs font-extrabold">
                          {r.area_nome}
                        </span>
                        <span className="font-extrabold text-slate-900 text-sm sm:text-base">
                          {r.titulo_evento}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold border uppercase ${badgeCor}`}>
                          {r.status}
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

      {/* Modal de Nova Reserva */}
      {areaReservaModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAreaReservaModal(null);
          }}
        >
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border-t-4 border-t-indigo-600 space-y-4 my-8">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  Reservar {areaReservaModal.nome}
                </h3>
                <p className="text-xs text-slate-500">
                  Capacidade máxima: até {areaReservaModal.capacidade_maxima} convidados
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

              {dataEscolhidaOcupada && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold">
                  ⚠️ Atenção: O dia {fmtDataBr(dataReserva)} já está reservado para {areaReservaModal.nome} ({dataEscolhidaOcupada.reservado_por}). Escolha outra data!
                </div>
              )}

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Lista Inicial de Convidados da Festa (Opcional — 1 nome por linha)
                </label>
                <textarea
                  rows={4}
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
                      Li e aceito integralmente o Regimento Interno e assumo responsabilidade pelos meus convidados.
                    </span>
                  </label>
                </div>
              )}

              <div className="flex items-center gap-2.5 pt-2">
                <button
                  type="submit"
                  disabled={salvandoReserva || Boolean(dataEscolhidaOcupada)}
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

      {/* Modal de Configuração de Área Comum (Síndico/Admin) */}
      {modalConfigArea && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalConfigArea(null);
          }}
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border-t-4 border-t-blue-600 space-y-4 my-8">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <Settings size={18} className="text-blue-600" />
                {modalConfigArea.id ? 'Editar Área Comum' : 'Cadastrar Nova Área Comum'}
              </h3>
              <button
                type="button"
                onClick={() => setModalConfigArea(null)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={salvarAreaComum} className="space-y-3">
              <input
                type="text"
                required
                value={modalConfigArea.nome}
                onChange={(e) => setModalConfigArea({ ...modalConfigArea, nome: e.target.value })}
                placeholder="Nome do espaço (ex: Salão de Festas, Churrasqueira...)"
                className={entrada}
              />
              <input
                type="text"
                value={modalConfigArea.descricao}
                onChange={(e) => setModalConfigArea({ ...modalConfigArea, descricao: e.target.value })}
                placeholder="Descrição curta"
                className={entrada}
              />
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Capacidade Máx.</label>
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
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Início Padrão</label>
                  <input
                    type="time"
                    value={modalConfigArea.hora_inicio_padrao}
                    onChange={(e) => setModalConfigArea({ ...modalConfigArea, hora_inicio_padrao: e.target.value })}
                    className={entrada}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Fim Padrão</label>
                  <input
                    type="time"
                    value={modalConfigArea.hora_fim_padrao}
                    onChange={(e) => setModalConfigArea({ ...modalConfigArea, hora_fim_padrao: e.target.value })}
                    className={entrada}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Regimento Interno / Regras de Uso
                </label>
                <textarea
                  rows={4}
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
                  {salvandoArea ? 'Salvando...' : 'Salvar Área Comum'}
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
