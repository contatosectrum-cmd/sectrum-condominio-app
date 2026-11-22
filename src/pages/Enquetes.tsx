import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Vote, Plus, CheckCircle2, Lock, Unlock, Trash2, ShieldCheck, Printer, X, FileCheck2, Scale, ScrollText, AlertTriangle,
} from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import { useSessao } from '../lib/useSessao';

interface OpcaoEnquete {
  id: number;
  texto: string;
  ordem: number;
  votos: number;
  percentual: number;
  fracao_acumulada?: number;
  percentual_fracao?: number;
}

interface VotoAuditado {
  id: number;
  unidade_label: string;
  fracao_ideal_voto?: number;
  morador_nome: string;
  opcao_texto: string;
  justificativa: string | null;
  votado_em: string;
  ip_origem: string | null;
  hash_auditoria: string;
}

interface Enquete {
  id: number;
  titulo: string;
  descricao: string | null;
  encerramento_em: string;
  status: 'aberta' | 'encerrada' | string;
  tipo_votacao?: 'enquete' | 'assembleia_ago' | 'assembleia_age' | string;
  quorum_exigido?: 'maioria_simples' | 'maioria_absoluta' | 'dois_tercos' | string;
  ponderar_fracao_ideal?: boolean;
  bloquear_inadimplentes?: boolean;
  edital_convocacao?: string | null;
  ata_gerada_texto?: string | null;
  ata_protocolo?: string | null;
  ata_hash?: string | null;
  ata_gerada_em?: string | null;
  criado_em: string;
  criador_nome: string | null;
  opcoes: OpcaoEnquete[];
  total_votos: number;
  total_fracao_votante?: number;
  participacao_percentual: number;
  voto_minha_unidade: {
    opcao_id: number;
    opcao_texto: string;
    justificativa: string | null;
    votado_em: string;
    hash_auditoria: string;
    votado_por_nome: string;
    fracao_ideal_voto?: number;
  } | null;
  auditoria_votos: VotoAuditado[];
}

const entrada =
  'w-full px-3.5 py-2.5 border border-slate-300 rounded-xl outline-none focus:border-indigo-600 bg-white text-slate-900 text-sm';

const labelTipoVotacao = (tipo?: string) => {
  switch (tipo) {
    case 'assembleia_ago':
      return {
        rotulo: '🏛️ Assembleia Geral Ordinária (AGO)',
        cor: 'bg-indigo-100 text-indigo-900 border-indigo-300',
      };
    case 'assembleia_age':
      return {
        rotulo: '⚖️ Assembleia Geral Extraordinária (AGE)',
        cor: 'bg-purple-100 text-purple-900 border-purple-300',
      };
    default:
      return {
        rotulo: '🗳️ Enquete / Deliberação Rápida',
        cor: 'bg-sky-100 text-sky-900 border-sky-300',
      };
  }
};

const labelQuorum = (q?: string) => {
  switch (q) {
    case 'maioria_absoluta':
      return 'Quórum: Maioria Absoluta (>50% do Condomínio)';
    case 'dois_tercos':
      return 'Quórum Qualificado: 2/3 (66,67%)';
    default:
      return 'Quórum: Maioria Simples dos Votantes';
  }
};

export default function Enquetes() {
  const { usuario } = useSessao();
  const ehGestao =
    usuario?.perfil === 'superadmin' || usuario?.perfil === 'admin' || usuario?.perfil === 'sindico';

  const [enquetes, setEnquetes] = useState<Enquete[]>([]);
  const [totalUnidades, setTotalUnidades] = useState(0);
  const [minhaUnidadeLabel, setMinhaUnidadeLabel] = useState('');
  const [minhaFracaoIdeal, setMinhaFracaoIdeal] = useState<number>(0);
  const [minhaInadimplente, setMinhaInadimplente] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; mensagem: string } | null>(null);

  // Votação do morador
  const [opcaoSelecionadaPorEnquete, setOpcaoSelecionadaPorEnquete] = useState<Record<number, number>>({});
  const [justificativaPorEnquete, setJustificativaPorEnquete] = useState<Record<number, string>>({});
  const [votandoId, setVotandoId] = useState<number | null>(null);

  // Relatório Auditado aberto (Síndico/Admin)
  const [auditoriaAbertaId, setAuditoriaAbertaId] = useState<number | null>(null);

  // Modal de Ata Oficial Gerada
  const [ataModal, setAtaModal] = useState<{
    titulo: string;
    protocolo: string;
    hash: string;
    texto: string;
  } | null>(null);
  const [gerandoAtaId, setGerandoAtaId] = useState<number | null>(null);

  // Modal Criar Assembleia / Enquete (Síndico/Admin)
  const [modalCriar, setModalCriar] = useState(false);
  const [tipoVotacao, setTipoVotacao] = useState<'enquete' | 'assembleia_ago' | 'assembleia_age'>('assembleia_age');
  const [quorumExigido, setQuorumExigido] = useState<'maioria_simples' | 'maioria_absoluta' | 'dois_tercos'>('maioria_simples');
  const [ponderarFracao, setPonderarFracao] = useState(true);
  const [bloquearInadimplentes, setBloquearInadimplentes] = useState(true);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [editalConvocacao, setEditalConvocacao] = useState('');
  const [encerramento, setEncerramento] = useState('');
  const [opcoesForm, setOpcoesForm] = useState<string[]>([
    'Sim — Aprovo a proposta da Ordem do Dia',
    'Não — Rejeito a proposta',
    'Abstenção',
  ]);
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{
        enquetes: Enquete[];
        total_unidades_condominio: number;
        minha_unidade_label: string;
        minha_unidade_fracao_ideal?: number;
        minha_unidade_inadimplente?: boolean;
      }>('enquetes_painel');
      const lista = r.enquetes ?? [];
      setEnquetes(lista);
      setTotalUnidades(r.total_unidades_condominio ?? 0);
      setMinhaUnidadeLabel(r.minha_unidade_label ?? '');
      setMinhaFracaoIdeal(Number(r.minha_unidade_fracao_ideal ?? 0));
      setMinhaInadimplente(Boolean(r.minha_unidade_inadimplente));

      const mapaOp: Record<number, number> = {};
      const mapaJust: Record<number, string> = {};
      for (const e of lista) {
        if (e.voto_minha_unidade) {
          mapaOp[e.id] = Number(e.voto_minha_unidade.opcao_id);
          mapaJust[e.id] = e.voto_minha_unidade.justificativa || '';
        }
      }
      setOpcaoSelecionadaPorEnquete((ant) => ({ ...mapaOp, ...ant }));
      setJustificativaPorEnquete((ant) => ({ ...mapaJust, ...ant }));
    } catch (e) {
      setAviso({
        tipo: 'erro',
        mensagem: e instanceof ErroApi ? e.message : 'Erro ao carregar assembleias e enquetes.',
      });
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const abrirModalCriar = () => {
    const daqui7Dias = new Date(Date.now() + 7 * 86400000);
    daqui7Dias.setHours(22, 0, 0, 0);
    const isoLocal = new Date(daqui7Dias.getTime() - daqui7Dias.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setTipoVotacao('assembleia_age');
    setQuorumExigido('maioria_simples');
    setPonderarFracao(true);
    setBloquearInadimplentes(true);
    setTitulo('');
    setDescricao('');
    setEditalConvocacao('');
    setEncerramento(isoLocal);
    setOpcoesForm([
      'Sim — Aprovo a proposta da Ordem do Dia',
      'Não — Rejeito a proposta',
      'Abstenção',
    ]);
    setModalCriar(true);
  };

  const criarEnquete = async (e: React.FormEvent) => {
    e.preventDefault();
    setCriando(true);
    setAviso(null);
    try {
      const r = await api<{ mensagem: string }>('enquete_criar', {
        corpo: {
          tipo_votacao: tipoVotacao,
          quorum_exigido: quorumExigido,
          ponderar_fracao_ideal: ponderarFracao,
          bloquear_inadimplentes: bloquearInadimplentes,
          titulo,
          descricao,
          edital_convocacao: editalConvocacao,
          encerramento_em: encerramento,
          opcoes: opcoesForm.filter((x) => x.trim() !== ''),
        },
      });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      setModalCriar(false);
      await carregar();
    } catch (err) {
      setAviso({
        tipo: 'erro',
        mensagem: err instanceof ErroApi ? err.message : 'Erro ao criar deliberação.',
      });
    } finally {
      setCriando(false);
    }
  };

  const registrarVotoUnidade = async (enqueteId: number) => {
    const opId = opcaoSelecionadaPorEnquete[enqueteId];
    if (!opId) {
      setAviso({ tipo: 'erro', mensagem: 'Selecione uma opção antes de confirmar o voto da sua unidade.' });
      return;
    }
    setVotandoId(enqueteId);
    setAviso(null);
    try {
      const r = await api<{ mensagem: string }>('enquete_votar', {
        corpo: {
          enquete_id: enqueteId,
          opcao_id: opId,
          justificativa: justificativaPorEnquete[enqueteId] || '',
        },
      });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      await carregar();
    } catch (err) {
      setAviso({
        tipo: 'erro',
        mensagem: err instanceof ErroApi ? err.message : 'Falha ao registrar voto.',
      });
    } finally {
      setVotandoId(null);
    }
  };

  const alterarStatusEnquete = async (id: number, acao: 'encerrar' | 'reabrir' | 'excluir') => {
    if (acao === 'excluir' && !window.confirm('Tem certeza que deseja excluir esta deliberação e todos os votos?')) {
      return;
    }
    try {
      const r = await api<{ mensagem: string }>('enquete_status', {
        corpo: { id, acao },
      });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      await carregar();
    } catch (err) {
      setAviso({
        tipo: 'erro',
        mensagem: err instanceof ErroApi ? err.message : 'Erro ao alterar deliberação.',
      });
    }
  };

  const gerarAtaOficial = async (enq: Enquete) => {
    setGerandoAtaId(enq.id);
    setAviso(null);
    try {
      const r = await api<{
        mensagem: string;
        ata_protocolo: string;
        ata_hash: string;
        ata_texto: string;
      }>('assembleia_gerar_ata', {
        corpo: {
          enquete_id: enq.id,
          publicar_transparencia: true,
        },
      });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      setAtaModal({
        titulo: enq.titulo,
        protocolo: r.ata_protocolo,
        hash: r.ata_hash,
        texto: r.ata_texto,
      });
      await carregar();
    } catch (err) {
      setAviso({
        tipo: 'erro',
        mensagem: err instanceof ErroApi ? err.message : 'Erro ao lavrar Ata Oficial.',
      });
    } finally {
      setGerandoAtaId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Cabeçalho */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 text-white shadow-lg flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1.5 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-extrabold uppercase">
            <ShieldCheck size={14} /> Lei nº 14.309/2022 · Voto por Fração Ideal &amp; Ata Automática SHA-256
          </div>
          <h1 className="text-xl sm:text-2xl font-black flex items-center gap-2.5">
            <Vote size={24} className="text-amber-400" />
            Assembleias Digitais (AGO / AGE) &amp; Enquetes por Fração Ideal
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Deliberações oficiais com validade de <b>1 voto por unidade autônoma</b> ponderado pela{' '}
            <b>Fração Ideal</b>
            {minhaUnidadeLabel
              ? ` (Sua unidade: ${minhaUnidadeLabel}${minhaFracaoIdeal > 0 ? ` · Fração: ${minhaFracaoIdeal.toFixed(4)}%` : ''})`
              : ''}
            , validação automática do Art. 1.335 do Código Civil e lavratura automática da Ata Oficial no Portal da Transparência.
          </p>
        </div>

        {ehGestao && (
          <button
            type="button"
            onClick={abrirModalCriar}
            className="px-4 py-2.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shadow cursor-pointer shrink-0"
          >
            <Plus size={16} /> Convocar Assembleia / Nova Votação
          </button>
        )}
      </div>

      {minhaInadimplente && !ehGestao && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-2xl flex items-start gap-3 text-xs sm:text-sm text-amber-950">
          <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <b>Atenção (Art. 1.335, III do Código Civil):</b> Consta cobrança vencida em aberto na sua unidade. Nas Assembleias Oficiais com trava de adimplência ativa, regularize{' '}
            {usuario?.modulo_financeiro !== false ? (
              <>
                via PIX em{' '}
                <Link to="/morador/boletos" className="underline font-extrabold text-indigo-700">
                  Meus Boletos &amp; PIX
                </Link>{' '}
              </>
            ) : (
              <>junto à administração do condomínio </>
            )}
            para liberar o voto imediato.
          </div>
        </div>
      )}

      {aviso && (
        <div
          className={`border-l-4 px-4 py-3.5 rounded-xl text-sm font-bold flex items-center justify-between gap-3 ${
            aviso.tipo === 'ok'
              ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
              : 'bg-rose-50 border-rose-500 text-rose-900'
          }`}
        >
          <span>{aviso.mensagem}</span>
          <button type="button" onClick={() => setAviso(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      {carregando ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400">
          Carregando assembleias e votações...
        </div>
      ) : enquetes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-2">
          <Vote size={36} className="mx-auto text-slate-300" />
          <div className="font-extrabold text-slate-700">Nenhuma assembleia ou enquete cadastrada até o momento</div>
          <p className="text-xs text-slate-500">
            {ehGestao
              ? 'Clique em "+ Convocar Assembleia / Nova Votação" acima para abrir uma AGO, AGE ou Enquete Digital com Ata Automática.'
              : 'Quando o Síndico convocar uma Assembleia Digital ou Enquete, ela aparecerá aqui e você receberá uma notificação no celular.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {enquetes.map((enq) => {
            const aberta = enq.status === 'aberta';
            const opEscolhida = opcaoSelecionadaPorEnquete[enq.id] ?? enq.voto_minha_unidade?.opcao_id ?? 0;
            const mostrarAuditoria = auditoriaAbertaId === enq.id;
            const metaTipo = labelTipoVotacao(enq.tipo_votacao);
            const usaFracao = enq.ponderar_fracao_ideal !== false;
            const totalFracao = Number(enq.total_fracao_votante ?? 0);

            return (
              <div
                key={enq.id}
                className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1.5 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2">
                      {aberta ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-extrabold uppercase">
                          🟢 Sessão Aberta
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 text-xs font-extrabold uppercase">
                          🔒 Sessão Encerrada
                        </span>
                      )}

                      <span className={`px-2.5 py-0.5 rounded-full border text-xs font-extrabold ${metaTipo.cor}`}>
                        {metaTipo.rotulo}
                      </span>

                      <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold">
                        {labelQuorum(enq.quorum_exigido)}
                      </span>

                      {usaFracao && (
                        <span className="px-2.5 py-0.5 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 text-xs font-extrabold flex items-center gap-1">
                          <Scale size={12} /> Fração Ideal ({totalFracao.toFixed(4)}%)
                        </span>
                      )}

                      <span className="px-2.5 py-0.5 rounded-lg bg-indigo-50 text-indigo-800 text-xs font-extrabold">
                        🗳️ {enq.total_votos}/{totalUnidades} un. ({enq.participacao_percentual}%)
                      </span>
                    </div>

                    <h2 className="text-lg sm:text-xl font-black text-slate-900 pt-1">{enq.titulo}</h2>
                    {enq.descricao && (
                      <p className="text-xs sm:text-sm text-slate-600 whitespace-pre-line">{enq.descricao}</p>
                    )}
                    {enq.edital_convocacao && (
                      <div className="text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-600">
                        <b>Edital / Base Legal:</b> {enq.edital_convocacao}
                      </div>
                    )}
                    <div className="text-xs text-slate-500 pt-0.5">
                      Encerramento: <b>{new Date(enq.encerramento_em).toLocaleString('pt-BR')}</b>
                      {enq.bloquear_inadimplentes !== false && (
                        <span className="ml-2 text-emerald-700 font-bold">
                          · ✓ Validação Art. 1.335 CC (Unidades Adimplentes)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {enq.ata_gerada_texto && (
                      <button
                        type="button"
                        onClick={() =>
                          setAtaModal({
                            titulo: enq.titulo,
                            protocolo: enq.ata_protocolo || 'ATA-OFICIAL',
                            hash: enq.ata_hash || '',
                            texto: enq.ata_gerada_texto || '',
                          })
                        }
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <ScrollText size={14} /> Ver Ata Oficial ({enq.ata_protocolo})
                      </button>
                    )}

                    {ehGestao && (
                      <>
                        <button
                          type="button"
                          disabled={gerandoAtaId === enq.id}
                          onClick={() => gerarAtaOficial(enq)}
                          className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                          title="Encerra a sessão, lavra a Ata Oficial com Hash SHA-256 e publica na Biblioteca do Portal da Transparência"
                        >
                          <ScrollText size={14} />
                          {gerandoAtaId === enq.id
                            ? 'Lavrando Ata...'
                            : enq.ata_gerada_texto
                              ? 'Atualizar Ata & Transparência'
                              : '📜 Lavrar Ata & Publicar'}
                        </button>

                        <button
                          type="button"
                          onClick={() => setAuditoriaAbertaId(mostrarAuditoria ? null : enq.id)}
                          className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <FileCheck2 size={14} />
                          {mostrarAuditoria
                            ? 'Ocultar Votos'
                            : `Lista de Presença (${enq.auditoria_votos.length})`}
                        </button>

                        {aberta ? (
                          <button
                            type="button"
                            onClick={() => alterarStatusEnquete(enq.id, 'encerrar')}
                            className="px-3 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs flex items-center gap-1 cursor-pointer"
                          >
                            <Lock size={13} /> Encerrar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => alterarStatusEnquete(enq.id, 'reabrir')}
                            className="px-3 py-2 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-xs flex items-center gap-1 cursor-pointer"
                          >
                            <Unlock size={13} /> Reabrir
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => alterarStatusEnquete(enq.id, 'excluir')}
                          className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 cursor-pointer"
                          title="Excluir deliberação"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Comprovante de voto da minha unidade */}
                {enq.voto_minha_unidade && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-950">
                    <div className="flex items-center gap-2 font-bold">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <span>
                        Voto oficial da sua unidade registrado em:{' '}
                        <b className="underline">{enq.voto_minha_unidade.opcao_texto}</b> (por{' '}
                        {enq.voto_minha_unidade.votado_por_nome} · Fração Ideal:{' '}
                        {Number(enq.voto_minha_unidade.fracao_ideal_voto ?? minhaFracaoIdeal).toFixed(4)}%)
                      </span>
                    </div>
                    <span className="font-mono text-[11px] bg-white px-2.5 py-1 rounded-lg border border-emerald-200 text-emerald-800">
                      Protocolo SHA-256: {enq.voto_minha_unidade.hash_auditoria}
                    </span>
                  </div>
                )}

                {/* Opções de Voto + Barras de Resultado por Unidade e Fração Ideal */}
                <div className="space-y-2.5">
                  {enq.opcoes.map((op) => {
                    const marcada = Number(opEscolhida) === Number(op.id);
                    const pctBarra = usaFracao ? (op.percentual_fracao ?? op.percentual) : op.percentual;
                    return (
                      <div
                        key={op.id}
                        onClick={() => {
                          if (!aberta) return;
                          setOpcaoSelecionadaPorEnquete((ant) => ({ ...ant, [enq.id]: op.id }));
                        }}
                        className={`relative rounded-2xl border p-3.5 overflow-hidden transition ${
                          aberta ? 'cursor-pointer' : ''
                        } ${
                          marcada
                            ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-600/20'
                            : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'
                        }`}
                      >
                        <div
                          className="absolute inset-y-0 left-0 bg-indigo-500/10 transition-all duration-300 pointer-events-none"
                          style={{ width: `${pctBarra}%` }}
                        />
                        <div className="relative flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <input
                              type="radio"
                              name={`enq-${enq.id}`}
                              disabled={!aberta}
                              checked={marcada}
                              onChange={() =>
                                setOpcaoSelecionadaPorEnquete((ant) => ({ ...ant, [enq.id]: op.id }))
                              }
                              className="w-4 h-4 accent-indigo-600"
                            />
                            <span className="font-extrabold text-slate-900 text-sm">{op.texto}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 text-xs font-extrabold">
                            <span className="text-slate-600">{op.votos} un.</span>
                            {usaFracao && (
                              <span
                                className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900 font-mono"
                                title="Fração Ideal Acumulada dos votos nesta opção"
                              >
                                ⚖️ {Number(op.fracao_acumulada ?? 0).toFixed(4)}% fração
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-indigo-700 font-mono">
                              {pctBarra}%
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Botão de Confirmar Voto da Unidade */}
                {aberta && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
                    <input
                      type="text"
                      value={justificativaPorEnquete[enq.id] || ''}
                      onChange={(e) =>
                        setJustificativaPorEnquete((ant) => ({ ...ant, [enq.id]: e.target.value }))
                      }
                      placeholder="Declaração de voto / justificativa opcional para constar em Ata..."
                      className={entrada}
                    />
                    <button
                      type="button"
                      disabled={votandoId === enq.id || !opEscolhida}
                      onClick={() => registrarVotoUnidade(enq.id)}
                      className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm shrink-0 cursor-pointer shadow-xs"
                    >
                      {votandoId === enq.id
                        ? 'Assinando Voto...'
                        : enq.voto_minha_unidade
                          ? '🔄 Atualizar Voto Oficial da Minha Unidade'
                          : '🗳️ Assinar Voto Oficial da Unidade'}
                    </button>
                  </div>
                )}

                {/* Relatório Auditado de Votação (Síndico / Admin) */}
                {ehGestao && mostrarAuditoria && (
                  <div className="pt-4 border-t border-slate-200 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                        <ShieldCheck size={16} className="text-emerald-600" />
                        Lista de Presença Digital &amp; Auditoria por Fração Ideal ({enq.auditoria_votos.length} unidade(s))
                      </h3>
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <Printer size={13} /> Imprimir Lista de Presença
                      </button>
                    </div>

                    {enq.auditoria_votos.length === 0 ? (
                      <div className="text-xs text-slate-400 py-4 text-center">
                        Nenhuma unidade registrou voto nesta deliberação ainda.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 text-slate-500 uppercase font-extrabold">
                            <tr>
                              <th className="px-3 py-2.5 border-b">Unidade (Bloco / Apto)</th>
                              <th className="px-3 py-2.5 border-b">Fração Ideal</th>
                              <th className="px-3 py-2.5 border-b">Condômino Votante</th>
                              <th className="px-3 py-2.5 border-b">Voto Oficial</th>
                              <th className="px-3 py-2.5 border-b">Data / Hora</th>
                              <th className="px-3 py-2.5 border-b">Protocolo SHA-256</th>
                            </tr>
                          </thead>
                          <tbody>
                            {enq.auditoria_votos.map((v) => (
                              <tr key={v.id} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="px-3 py-2.5 font-extrabold text-slate-900">
                                  {v.unidade_label || '—'}
                                </td>
                                <td className="px-3 py-2.5 font-mono text-amber-800 font-bold">
                                  {Number(v.fracao_ideal_voto ?? 0.1736).toFixed(4)}%
                                </td>
                                <td className="px-3 py-2.5 text-slate-700">{v.morador_nome}</td>
                                <td className="px-3 py-2.5">
                                  <span className="font-bold text-indigo-800">{v.opcao_texto}</span>
                                  {v.justificativa && (
                                    <div className="text-[11px] text-slate-500 italic">
                                      "{v.justificativa}"
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 font-mono text-slate-500">
                                  {new Date(v.votado_em).toLocaleString('pt-BR')}
                                </td>
                                <td className="px-3 py-2.5 font-mono text-[11px] text-emerald-700">
                                  {v.hash_auditoria}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Visualização / Impressão da Ata Oficial */}
      {ataModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAtaModal(null);
          }}
        >
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border-t-4 border-t-emerald-600 space-y-4 my-8">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-xs font-extrabold">
                  <ScrollText size={13} /> Ata Oficial Lavrada · Protocolo {ataModal.protocolo}
                </span>
                <h3 className="text-lg font-black text-slate-900 mt-1">{ataModal.titulo}</h3>
                {ataModal.hash && (
                  <p className="text-[11px] font-mono text-slate-500 break-all">
                    Assinatura SHA-256: {ataModal.hash}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setAtaModal(null)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            <pre className="bg-slate-950 text-emerald-300 font-mono text-xs p-4 rounded-2xl overflow-x-auto max-h-[60vh] whitespace-pre-wrap leading-relaxed border border-slate-800">
              {ataModal.texto}
            </pre>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-xs text-slate-500">
                ✓ Publicada automaticamente na Biblioteca do <b>Portal da Transparência</b>.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer size={14} /> Imprimir / Salvar PDF da Ata
                </button>
                <button
                  type="button"
                  onClick={() => setAtaModal(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Convocar Assembleia Digital / Nova Enquete */}
      {modalCriar && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalCriar(false);
          }}
        >
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border-t-4 border-t-amber-500 space-y-4 my-8">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-slate-900">
                Convocar Assembleia Digital (AGO / AGE) ou Enquete
              </h3>
              <button
                type="button"
                onClick={() => setModalCriar(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={criarEnquete} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                    Modalidade Jurídica
                  </label>
                  <select
                    value={tipoVotacao}
                    onChange={(e) => setTipoVotacao(e.target.value as 'enquete' | 'assembleia_ago' | 'assembleia_age')}
                    className={entrada}
                  >
                    <option value="assembleia_age">⚖️ Assembleia Geral Extraordinária (AGE)</option>
                    <option value="assembleia_ago">🏛️ Assembleia Geral Ordinária (AGO)</option>
                    <option value="enquete">🗳️ Enquete Consultiva Rápida</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                    Quórum Legal Exigido
                  </label>
                  <select
                    value={quorumExigido}
                    onChange={(e) =>
                      setQuorumExigido(e.target.value as 'maioria_simples' | 'maioria_absoluta' | 'dois_tercos')
                    }
                    className={entrada}
                  >
                    <option value="maioria_simples">Maioria Simples dos Votantes</option>
                    <option value="maioria_absoluta">Maioria Absoluta (&gt;50% do Condomínio)</option>
                    <option value="dois_tercos">Quórum Qualificado de 2/3 (66,67%)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Ordem do Dia / Pauta da Deliberação
                </label>
                <input
                  type="text"
                  required
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex: Aprovação da Previsão Orçamentária / Reforma da Portaria"
                  className={entrada}
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Detalhamento / Justificativa &amp; Valores da Proposta
                </label>
                <textarea
                  rows={3}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Descreva os detalhes, orçamentos, prazos e condições para orientar o voto das unidades..."
                  className={entrada}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                    Referência do Edital / Base Legal
                  </label>
                  <input
                    type="text"
                    value={editalConvocacao}
                    onChange={(e) => setEditalConvocacao(e.target.value)}
                    placeholder="Ex: Edital AGE nº 04/2026 · Art. 1.354-A CC"
                    className={entrada}
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                    Encerramento da Sessão Virtual
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={encerramento}
                    onChange={(e) => setEncerramento(e.target.value)}
                    className={entrada}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs">
                <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ponderarFracao}
                    onChange={(e) => setPonderarFracao(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600"
                  />
                  <span>⚖️ Ponderar votos pela Fração Ideal (100%)</span>
                </label>

                <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bloquearInadimplentes}
                    onChange={(e) => setBloquearInadimplentes(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600"
                  />
                  <span>🛡️ Exigir Adimplência (Art. 1.335, III CC)</span>
                </label>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-extrabold uppercase text-slate-600">
                    Opções de Deliberação
                  </label>
                  <button
                    type="button"
                    onClick={() => setOpcoesForm([...opcoesForm, ''])}
                    className="text-xs font-extrabold text-indigo-600 hover:underline cursor-pointer"
                  >
                    + Adicionar Opção
                  </button>
                </div>
                {opcoesForm.map((op, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      required={idx < 2}
                      value={op}
                      onChange={(e) => {
                        const copia = [...opcoesForm];
                        copia[idx] = e.target.value;
                        setOpcoesForm(copia);
                      }}
                      placeholder={`Opção ${idx + 1}`}
                      className={entrada}
                    />
                    {opcoesForm.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setOpcoesForm(opcoesForm.filter((_, i) => i !== idx))}
                        className="p-2 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="submit"
                  disabled={criando}
                  className="flex-1 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm cursor-pointer"
                >
                  {criando ? 'Convocando Sessão...' : '🏛️ Publicar Edital & Notificar Unidades'}
                </button>
                <button
                  type="button"
                  onClick={() => setModalCriar(false)}
                  className="py-3 px-4 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm cursor-pointer"
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
