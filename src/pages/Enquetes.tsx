import { useCallback, useEffect, useState } from 'react';
import {
  Vote, Plus, CheckCircle2, Lock, Unlock, Trash2, ShieldCheck, Printer, X, FileCheck2,
} from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import { useSessao } from '../lib/useSessao';

interface OpcaoEnquete {
  id: number;
  texto: string;
  ordem: number;
  votos: number;
  percentual: number;
}

interface VotoAuditado {
  id: number;
  unidade_label: string;
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
  criado_em: string;
  criador_nome: string | null;
  opcoes: OpcaoEnquete[];
  total_votos: number;
  participacao_percentual: number;
  voto_minha_unidade: {
    opcao_id: number;
    opcao_texto: string;
    justificativa: string | null;
    votado_em: string;
    hash_auditoria: string;
    votado_por_nome: string;
  } | null;
  auditoria_votos: VotoAuditado[];
}

const entrada =
  'w-full px-3.5 py-2.5 border border-slate-300 rounded-xl outline-none focus:border-indigo-600 bg-white text-slate-900 text-sm';

export default function Enquetes() {
  const { usuario } = useSessao();
  const ehGestao =
    usuario?.perfil === 'superadmin' || usuario?.perfil === 'admin' || usuario?.perfil === 'sindico';

  const [enquetes, setEnquetes] = useState<Enquete[]>([]);
  const [totalUnidades, setTotalUnidades] = useState(0);
  const [minhaUnidadeLabel, setMinhaUnidadeLabel] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; mensagem: string } | null>(null);

  // Votação do morador
  const [opcaoSelecionadaPorEnquete, setOpcaoSelecionadaPorEnquete] = useState<Record<number, number>>({});
  const [justificativaPorEnquete, setJustificativaPorEnquete] = useState<Record<number, string>>({});
  const [votandoId, setVotandoId] = useState<number | null>(null);

  // Relatório Auditado aberto (Síndico/Admin)
  const [auditoriaAbertaId, setAuditoriaAbertaId] = useState<number | null>(null);

  // Modal Criar Enquete (Síndico/Admin)
  const [modalCriar, setModalCriar] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [encerramento, setEncerramento] = useState('');
  const [opcoesForm, setOpcoesForm] = useState<string[]>([
    'Sim — Aprovo a proposta',
    'Não — Sou contrário',
    'Abstenção',
  ]);
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{
        enquetes: Enquete[];
        total_unidades_condominio: number;
        minha_unidade_label: string;
      }>('enquetes_painel');
      const lista = r.enquetes ?? [];
      setEnquetes(lista);
      setTotalUnidades(r.total_unidades_condominio ?? 0);
      setMinhaUnidadeLabel(r.minha_unidade_label ?? '');

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
        mensagem: e instanceof ErroApi ? e.message : 'Erro ao carregar enquetes.',
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
    setTitulo('');
    setDescricao('');
    setEncerramento(isoLocal);
    setOpcoesForm(['Sim — Aprovo a proposta', 'Não — Sou contrário', 'Abstenção']);
    setModalCriar(true);
  };

  const criarEnquete = async (e: React.FormEvent) => {
    e.preventDefault();
    setCriando(true);
    setAviso(null);
    try {
      const r = await api<{ mensagem: string }>('enquete_criar', {
        corpo: {
          titulo,
          descricao,
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
        mensagem: err instanceof ErroApi ? err.message : 'Erro ao criar enquete.',
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
    if (acao === 'excluir' && !window.confirm('Tem certeza que deseja excluir esta enquete e todos os votos?')) {
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
        mensagem: err instanceof ErroApi ? err.message : 'Erro ao alterar enquete.',
      });
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Cabeçalho */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 text-white shadow-lg flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1.5 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-extrabold uppercase">
            <ShieldCheck size={14} /> 1 Voto Oficial por Unidade · Relatório Auditado SHA-256
          </div>
          <h1 className="text-xl sm:text-2xl font-black flex items-center gap-2.5">
            <Vote size={24} className="text-amber-400" />
            Enquetes &amp; Votação Digital por Unidade
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Decisões rápidas do condomínio com validade de <b>1 voto oficial por apartamento/unidade</b>
            {minhaUnidadeLabel ? ` (Sua unidade: ${minhaUnidadeLabel})` : ''}. Cada voto gera um protocolo criptográfico de auditoria.
          </p>
        </div>

        {ehGestao && (
          <button
            type="button"
            onClick={abrirModalCriar}
            className="px-4 py-2.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shadow cursor-pointer shrink-0"
          >
            <Plus size={16} /> Nova Enquete / Votação
          </button>
        )}
      </div>

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
          Carregando votações...
        </div>
      ) : enquetes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-2">
          <Vote size={36} className="mx-auto text-slate-300" />
          <div className="font-extrabold text-slate-700">Nenhuma enquete cadastrada até o momento</div>
          <p className="text-xs text-slate-500">
            {ehGestao
              ? 'Clique em "+ Nova Enquete / Votação" acima para consultar os moradores com 1 voto oficial por unidade.'
              : 'Quando o Síndico abrir uma votação oficial, ela aparecerá aqui e você receberá uma notificação no celular.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {enquetes.map((enq) => {
            const aberta = enq.status === 'aberta';
            const opEscolhida = opcaoSelecionadaPorEnquete[enq.id] ?? enq.voto_minha_unidade?.opcao_id ?? 0;
            const mostrarAuditoria = auditoriaAbertaId === enq.id;

            return (
              <div
                key={enq.id}
                className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2">
                      {aberta ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-extrabold uppercase">
                          🟢 Votação Aberta
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 text-xs font-extrabold uppercase">
                          🔒 Encerrada
                        </span>
                      )}
                      <span className="text-xs font-semibold text-slate-500">
                        Prazo: <b>{new Date(enq.encerramento_em).toLocaleString('pt-BR')}</b>
                      </span>
                      <span className="px-2.5 py-0.5 rounded-lg bg-indigo-50 text-indigo-800 text-xs font-extrabold">
                        🗳️ {enq.total_votos} de {totalUnidades} unidades votaram ({enq.participacao_percentual}%)
                      </span>
                    </div>

                    <h2 className="text-lg sm:text-xl font-black text-slate-900 pt-1">{enq.titulo}</h2>
                    {enq.descricao && (
                      <p className="text-xs sm:text-sm text-slate-600 whitespace-pre-line">{enq.descricao}</p>
                    )}
                  </div>

                  {ehGestao && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setAuditoriaAbertaId(mostrarAuditoria ? null : enq.id)}
                        className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <FileCheck2 size={14} />
                        {mostrarAuditoria
                          ? 'Ocultar Ata Auditada'
                          : `Ata Auditada (${enq.auditoria_votos.length})`}
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
                        title="Excluir enquete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Comprovante de voto da minha unidade */}
                {enq.voto_minha_unidade && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-950">
                    <div className="flex items-center gap-2 font-bold">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <span>
                        Voto oficial da sua unidade registrado em:{' '}
                        <b className="underline">{enq.voto_minha_unidade.opcao_texto}</b> (por{' '}
                        {enq.voto_minha_unidade.votado_por_nome})
                      </span>
                    </div>
                    <span className="font-mono text-[11px] bg-white px-2.5 py-1 rounded-lg border border-emerald-200 text-emerald-800">
                      Protocolo SHA-256: {enq.voto_minha_unidade.hash_auditoria}
                    </span>
                  </div>
                )}

                {/* Opções de Voto + Barras de Resultado Parcial/Final */}
                <div className="space-y-2.5">
                  {enq.opcoes.map((op) => {
                    const marcada = Number(opEscolhida) === Number(op.id);
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
                          style={{ width: `${op.percentual}%` }}
                        />
                        <div className="relative flex items-center justify-between gap-3">
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
                            <span className="text-slate-600">{op.votos} voto(s)</span>
                            <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-indigo-700 font-mono">
                              {op.percentual}%
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
                      placeholder="Observação / justificativa opcional do voto da sua unidade..."
                      className={entrada}
                    />
                    <button
                      type="button"
                      disabled={votandoId === enq.id || !opEscolhida}
                      onClick={() => registrarVotoUnidade(enq.id)}
                      className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm shrink-0 cursor-pointer shadow-xs"
                    >
                      {votandoId === enq.id
                        ? 'Registrando Voto...'
                        : enq.voto_minha_unidade
                          ? '🔄 Atualizar Voto da Minha Unidade'
                          : '🗳️ Confirmar Voto Oficial da Unidade'}
                    </button>
                  </div>
                )}

                {/* Relatório Auditado de Votação (Síndico / Admin) */}
                {ehGestao && mostrarAuditoria && (
                  <div className="pt-4 border-t border-slate-200 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                        <ShieldCheck size={16} className="text-emerald-600" />
                        Relatório Auditado de Votação por Unidade ({enq.auditoria_votos.length} voto(s) auditados)
                      </h3>
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <Printer size={13} /> Imprimir Ata / Relatório
                      </button>
                    </div>

                    {enq.auditoria_votos.length === 0 ? (
                      <div className="text-xs text-slate-400 py-4 text-center">
                        Nenhuma unidade registrou voto nesta enquete ainda.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 text-slate-500 uppercase font-extrabold">
                            <tr>
                              <th className="px-3 py-2.5 border-b">Unidade (Bloco / Apto)</th>
                              <th className="px-3 py-2.5 border-b">Morador Votante</th>
                              <th className="px-3 py-2.5 border-b">Voto Oficial</th>
                              <th className="px-3 py-2.5 border-b">Data / Hora</th>
                              <th className="px-3 py-2.5 border-b">Hash SHA-256</th>
                            </tr>
                          </thead>
                          <tbody>
                            {enq.auditoria_votos.map((v) => (
                              <tr key={v.id} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="px-3 py-2.5 font-extrabold text-slate-900">
                                  {v.unidade_label || '—'}
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

      {/* Modal de Criar Nova Enquete */}
      {modalCriar && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalCriar(false);
          }}
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border-t-4 border-t-amber-500 space-y-4 my-8">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-slate-900">
                Nova Enquete / Votação por Unidade
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
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Título / Pauta da Votação
                </label>
                <input
                  type="text"
                  required
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex: Aprovação da pintura da fachada / Novo horário da quadra"
                  className={entrada}
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Explicação / Detalhes da Pauta
                </label>
                <textarea
                  rows={3}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Descreva os detalhes, valores ou regras para orientar o voto dos apartamentos..."
                  className={entrada}
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Data e Hora de Encerramento
                </label>
                <input
                  type="datetime-local"
                  required
                  value={encerramento}
                  onChange={(e) => setEncerramento(e.target.value)}
                  className={entrada}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-extrabold uppercase text-slate-600">
                    Opções de Voto
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
                  {criando ? 'Publicando Votação...' : '🗳️ Publicar Enquete e Notificar Moradores'}
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
