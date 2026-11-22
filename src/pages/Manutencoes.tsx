import { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck, Plus, CheckCircle2, Clock, AlertTriangle, X, Calendar, Wrench, Phone, Trash2, Pencil,
} from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import { useSessao } from '../lib/useSessao';

interface ManutencaoItem {
  id: number;
  categoria: string;
  titulo: string;
  descricao: string | null;
  fornecedor_nome: string | null;
  fornecedor_telefone: string | null;
  periodicidade_dias: number;
  ultima_execucao: string | null;
  proximo_vencimento: string;
  dias_restantes: number;
  semaforo: 'em_dia' | 'atencao' | 'vencida' | string;
  custo_estimado: number;
  observacoes: string | null;
}

const CATEGORIAS_MANUT: Record<string, string> = {
  seguranca: '🧯 Segurança & Incêndio (Extintores / AVCB)',
  higiene: '💧 Higiene & Saúde (Caixa d\'Água / Dedetização)',
  eletrica_hidraulica: '⚡ Elétrica, Bombas & Para-raios (SPDA)',
  acesso_seguranca: '🚪 Portões, Cancelas & Leitores Faciais',
  juridico_seguro: '⚖️ Seguro Obrigatório, Mandato & Certificado Digital',
  preventiva: '🔧 Manutenção Preventiva Geral',
};

const entrada =
  'w-full px-3.5 py-2.5 border border-slate-300 rounded-xl outline-none focus:border-indigo-600 bg-white text-slate-900 text-sm';

export default function Manutencoes() {
  const { usuario } = useSessao();
  const ehGestao = ['superadmin', 'admin', 'sindico'].includes(usuario?.perfil ?? '');

  const [lista, setLista] = useState<ManutencaoItem[]>([]);
  const [resumo, setResumo] = useState({ em_dia: 0, atencao_30d: 0, vencidas: 0, total: 0 });
  const [filtro, setFiltro] = useState<'todos' | 'vencida' | 'atencao' | 'em_dia'>('todos');
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; mensagem: string } | null>(null);

  // Modal Criar/Editar
  const [modalForm, setModalForm] = useState(false);
  const [editId, setEditId] = useState<number>(0);
  const [categoria, setCategoria] = useState('seguranca');
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [fornecedorNome, setFornecedorNome] = useState('');
  const [fornecedorTelefone, setFornecedorTelefone] = useState('');
  const [periodicidadeDias, setPeriodicidadeDias] = useState('180');
  const [ultimaExecucao, setUltimaExecucao] = useState('');
  const [proximoVencimento, setProximoVencimento] = useState('');
  const [custoEstimado, setCustoEstimado] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{
        manutencoes: ManutencaoItem[];
        resumo: { em_dia: number; atencao_30d: number; vencidas: number; total: number };
      }>('manutencoes_painel');
      setLista(r.manutencoes ?? []);
      setResumo(r.resumo ?? { em_dia: 0, atencao_30d: 0, vencidas: 0, total: 0 });
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro ao carregar o Radar do Síndico.' });
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const abrirNovo = () => {
    setEditId(0);
    setCategoria('seguranca');
    setTitulo('');
    setDescricao('');
    setFornecedorNome('');
    setFornecedorTelefone('');
    setPeriodicidadeDias('180');
    setUltimaExecucao('');
    setProximoVencimento('');
    setCustoEstimado('');
    setObservacoes('');
    setModalForm(true);
  };

  const abrirEdicao = (m: ManutencaoItem) => {
    setEditId(m.id);
    setCategoria(m.categoria);
    setTitulo(m.titulo);
    setDescricao(m.descricao ?? '');
    setFornecedorNome(m.fornecedor_nome ?? '');
    setFornecedorTelefone(m.fornecedor_telefone ?? '');
    setPeriodicidadeDias(String(m.periodicidade_dias));
    setUltimaExecucao(m.ultima_execucao ?? '');
    setProximoVencimento(m.proximo_vencimento);
    setCustoEstimado(m.custo_estimado > 0 ? String(m.custo_estimado) : '');
    setObservacoes(m.observacoes ?? '');
    setModalForm(true);
  };

  const salvarItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setAviso(null);
    try {
      const r = await api<{ mensagem: string }>('manutencao_salvar', {
        corpo: {
          id: editId || undefined,
          categoria,
          titulo,
          descricao,
          fornecedor_nome: fornecedorNome,
          fornecedor_telefone: fornecedorTelefone,
          periodicidade_dias: Number(periodicidadeDias) || 180,
          ultima_execucao: ultimaExecucao || undefined,
          proximo_vencimento: proximoVencimento,
          custo_estimado: custoEstimado || 0,
          observacoes,
        },
      });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      setModalForm(false);
      await carregar();
    } catch (err) {
      setAviso({ tipo: 'erro', mensagem: err instanceof ErroApi ? err.message : 'Erro ao salvar item.' });
    } finally {
      setEnviando(false);
    }
  };

  const registrarExecucaoHoje = async (m: ManutencaoItem) => {
    const obs = window.prompt(
      `Confirmar a realização de "${m.titulo}" hoje?\nO sistema agendará automaticamente o próximo ciclo (+${m.periodicidade_dias} dias).\n\nObservação opcional (ex.: Empresa / NF / Responsável):`,
      '',
    );
    if (obs === null) return;
    setEnviando(true);
    try {
      const r = await api<{ mensagem: string }>('manutencao_registrar_execucao', {
        corpo: { id: m.id, observacoes: obs },
      });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      await carregar();
    } catch (err) {
      setAviso({ tipo: 'erro', mensagem: err instanceof ErroApi ? err.message : 'Erro ao registrar execução.' });
    } finally {
      setEnviando(false);
    }
  };

  const excluirItem = async (m: ManutencaoItem) => {
    if (!window.confirm(`Remover "${m.titulo}" do calendário de manutenções?`)) return;
    setEnviando(true);
    try {
      const r = await api<{ mensagem: string }>('manutencao_excluir', { corpo: { id: m.id } });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      await carregar();
    } catch (err) {
      setAviso({ tipo: 'erro', mensagem: err instanceof ErroApi ? err.message : 'Erro ao remover item.' });
    } finally {
      setEnviando(false);
    }
  };

  const listaFiltrada = filtro === 'todos' ? lista : lista.filter((m) => m.semaforo === filtro);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Cabeçalho */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-lg sm:text-xl font-black text-slate-900">
            <ShieldCheck size={22} className="text-emerald-600" />
            Radar do Síndico — Manutenções Programadas, Seguro &amp; Mandatos
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            Acompanhamento automático por semáforo das obrigações legais e preventivas do condomínio (Extintores, Caixas d&apos;Água, AVCB, Seguro Obrigatório, Bombas e Mandato).
          </p>
        </div>
        {ehGestao && (
          <button
            type="button"
            onClick={abrirNovo}
            className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow cursor-pointer"
          >
            <Plus size={16} /> Nova Manutenção / Obrigação
          </button>
        )}
      </div>

      {/* Semáforo Executivo */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => setFiltro(filtro === 'em_dia' ? 'todos' : 'em_dia')}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
            filtro === 'em_dia' ? 'bg-emerald-50 border-emerald-400' : 'bg-white border-slate-200'
          }`}
        >
          <div className="text-xs font-extrabold uppercase text-emerald-700 flex items-center gap-1.5">
            <CheckCircle2 size={14} /> 🟢 Em Dia (&gt; 30 dias)
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">{resumo.em_dia}</div>
        </button>

        <button
          type="button"
          onClick={() => setFiltro(filtro === 'atencao' ? 'todos' : 'atencao')}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
            filtro === 'atencao' ? 'bg-amber-50 border-amber-400' : 'bg-white border-slate-200'
          }`}
        >
          <div className="text-xs font-extrabold uppercase text-amber-700 flex items-center gap-1.5">
            <Clock size={14} /> 🟡 Vence em até 30 dias
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">{resumo.atencao_30d}</div>
        </button>

        <button
          type="button"
          onClick={() => setFiltro(filtro === 'vencida' ? 'todos' : 'vencida')}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
            filtro === 'vencida' ? 'bg-rose-50 border-rose-400' : 'bg-white border-slate-200'
          }`}
        >
          <div className="text-xs font-extrabold uppercase text-rose-700 flex items-center gap-1.5">
            <AlertTriangle size={14} /> 🔴 Vencidas / Ação Imediata
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">{resumo.vencidas}</div>
        </button>
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

      {/* Lista de Manutenções */}
      <div className="space-y-3">
        {carregando ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400">
            Carregando Radar do Síndico...
          </div>
        ) : listaFiltrada.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
            Nenhum item neste filtro.
          </div>
        ) : (
          listaFiltrada.map((m) => {
            const sem =
              m.semaforo === 'vencida'
                ? {
                    rotulo: `🔴 VENCIDA HÁ ${Math.abs(m.dias_restantes)} DIA(S)`,
                    cls: 'bg-rose-100 text-rose-900 border-rose-300',
                    borda: 'border-l-4 border-l-rose-600',
                  }
                : m.semaforo === 'atencao'
                  ? {
                      rotulo: `🟡 VENCE EM ${m.dias_restantes} DIA(S)`,
                      cls: 'bg-amber-100 text-amber-900 border-amber-300',
                      borda: 'border-l-4 border-l-amber-500',
                    }
                  : {
                      rotulo: `🟢 EM DIA (FALTAM ${m.dias_restantes} DIAS)`,
                      cls: 'bg-emerald-100 text-emerald-900 border-emerald-300',
                      borda: 'border-l-4 border-l-emerald-500',
                    };

            return (
              <div
                key={m.id}
                className={`bg-white rounded-2xl border border-slate-200 ${sem.borda} p-5 shadow-xs flex flex-wrap items-start justify-between gap-4`}
              >
                <div className="space-y-1.5 flex-1 min-w-[260px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold border ${sem.cls}`}>
                      {sem.rotulo}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold">
                      {CATEGORIAS_MANUT[m.categoria] || m.categoria}
                    </span>
                    <span className="text-xs text-slate-500 font-semibold">
                      🔄 Ciclo: a cada {m.periodicidade_dias} dias
                    </span>
                  </div>
                  <h3 className="text-base font-extrabold text-slate-900">{m.titulo}</h3>
                  {m.descricao && <p className="text-xs sm:text-sm text-slate-600">{m.descricao}</p>}
                  <div className="text-xs text-slate-500 flex flex-wrap gap-4 pt-1">
                    <span className="flex items-center gap-1 font-bold text-slate-800">
                      <Calendar size={13} className="text-indigo-600" />
                      Próximo Vencimento: {new Date(`${m.proximo_vencimento}T12:00:00`).toLocaleDateString('pt-BR')}
                    </span>
                    {m.ultima_execucao && (
                      <span>
                        ✅ Última Execução: {new Date(`${m.ultima_execucao}T12:00:00`).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                    {m.fornecedor_nome && (
                      <span className="flex items-center gap-1">
                        <Wrench size={12} /> Fornecedor: <b>{m.fornecedor_nome}</b>
                      </span>
                    )}
                    {m.fornecedor_telefone && (
                      <span className="flex items-center gap-1">
                        <Phone size={12} /> {m.fornecedor_telefone}
                      </span>
                    )}
                  </div>
                </div>

                {ehGestao && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={enviando}
                      onClick={() => void registrarExecucaoHoje(m)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold cursor-pointer shadow-2xs"
                    >
                      <CheckCircle2 size={14} /> Concluir &amp; Renovar Ciclo
                    </button>
                    <button
                      type="button"
                      onClick={() => abrirEdicao(m)}
                      className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                      title="Editar item"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void excluirItem(m)}
                      className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 cursor-pointer"
                      title="Excluir item"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal Criar/Editar Manutenção */}
      {modalForm && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalForm(false);
          }}
        >
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border-t-4 border-t-emerald-600 space-y-4 my-8">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-slate-900">
                {editId ? '✏️ Editar Manutenção / Obrigação' : '➕ Cadastrar Manutenção Programada'}
              </h3>
              <button
                type="button"
                onClick={() => setModalForm(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={salvarItem} className="space-y-3.5">
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">Categoria *</label>
                <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={entrada}>
                  {Object.entries(CATEGORIAS_MANUT).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Título da Manutenção / Obrigação *
                </label>
                <input
                  required
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex: Limpeza Semestral das Caixas d'Água"
                  className={entrada}
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Descrição / Escopo Técnico
                </label>
                <textarea
                  rows={2}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Detalhes técnicos ou exigência legal..."
                  className={entrada}
                />
              </div>

              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                    Próximo Vencimento *
                  </label>
                  <input
                    type="date"
                    required
                    value={proximoVencimento}
                    onChange={(e) => setProximoVencimento(e.target.value)}
                    className={entrada}
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                    Periodicidade (Dias) *
                  </label>
                  <select
                    value={periodicidadeDias}
                    onChange={(e) => setPeriodicidadeDias(e.target.value)}
                    className={entrada}
                  >
                    <option value="30">Mensal (30 dias)</option>
                    <option value="90">Trimestral (90 dias)</option>
                    <option value="180">Semestral (180 dias)</option>
                    <option value="365">Anual (365 dias)</option>
                    <option value="730">Bienal (730 dias)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                    Última Execução
                  </label>
                  <input
                    type="date"
                    value={ultimaExecucao}
                    onChange={(e) => setUltimaExecucao(e.target.value)}
                    className={entrada}
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                    Empresa / Fornecedor Responsável
                  </label>
                  <input
                    value={fornecedorNome}
                    onChange={(e) => setFornecedorNome(e.target.value)}
                    placeholder="Ex: Extintores São Luís"
                    className={entrada}
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                    Telefone / WhatsApp do Fornecedor
                  </label>
                  <input
                    value={fornecedorTelefone}
                    onChange={(e) => setFornecedorTelefone(e.target.value)}
                    placeholder="(98) 98888-0000"
                    className={entrada}
                  />
                </div>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="submit"
                  disabled={enviando}
                  className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm cursor-pointer"
                >
                  {enviando ? 'Salvando...' : '💾 Salvar no Radar do Síndico'}
                </button>
                <button
                  type="button"
                  onClick={() => setModalForm(false)}
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
