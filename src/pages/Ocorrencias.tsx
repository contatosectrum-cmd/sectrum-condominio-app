import { useCallback, useEffect, useState } from 'react';
import {
  Wrench, Plus, CheckCircle2, Clock, AlertTriangle, Camera, Send, X, MessageSquare, Filter,
} from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import { useSessao } from '../lib/useSessao';

interface Ocorrencia {
  id: number;
  unidade_id: number | null;
  unidade_label: string;
  usuario_id: number;
  morador_nome: string;
  morador_telefone: string | null;
  categoria: string;
  prioridade: 'baixa' | 'normal' | 'alta' | 'urgente' | string;
  titulo: string;
  descricao: string;
  foto_base64: string | null;
  status: 'aberto' | 'em_andamento' | 'concluido' | 'cancelado' | string;
  resposta_sindico: string | null;
  respondido_por_nome: string | null;
  respondido_em: string | null;
  criado_em: string;
}

const CATEGORIAS: Record<string, string> = {
  manutencao: '🔧 Manutenção / Estrutura',
  iluminacao: '💡 Iluminação / Elétrica',
  portoes_acesso: '🚪 Portões / Controle de Acesso',
  barulho: '🔊 Barulho / Convivência',
  garagem: '🚗 Vaga de Garagem / Estacionamento',
  limpeza: '🧹 Limpeza / Conservação',
  outros: '📌 Sugestão / Outros',
};

const entrada =
  'w-full px-3.5 py-2.5 border border-slate-300 rounded-xl outline-none focus:border-indigo-600 bg-white text-slate-900 text-sm';

function redimensionarImagemBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 850;
        let w = img.width;
        let h = img.height;
        if (w > max || h > max) {
          if (w > h) {
            h = Math.round((h * max) / w);
            w = max;
          } else {
            w = Math.round((w * max) / h);
            h = max;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Falha no canvas'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.onerror = reject;
      img.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Ocorrencias() {
  const { usuario } = useSessao();
  const ehOperacao = usuario?.perfil !== 'morador';

  const [lista, setLista] = useState<Ocorrencia[]>([]);
  const [resumo, setResumo] = useState({ aberto: 0, em_andamento: 0, concluido: 0, total: 0 });
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; mensagem: string } | null>(null);

  // Modal de Novo Chamado
  const [modalNovo, setModalNovo] = useState(false);
  const [categoria, setCategoria] = useState('manutencao');
  const [prioridade, setPrioridade] = useState('normal');
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [fotoBase64, setFotoBase64] = useState('');
  const [enviandoNovo, setEnviandoNovo] = useState(false);

  // Edição de resposta do Síndico/Admin
  const [ocorrenciaRespostaId, setOcorrenciaRespostaId] = useState<number | null>(null);
  const [statusResposta, setStatusResposta] = useState('em_andamento');
  const [textoResposta, setTextoResposta] = useState('');
  const [salvandoResposta, setSalvandoResposta] = useState(false);
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{
        ocorrencias: Ocorrencia[];
        resumo: { aberto: number; em_andamento: number; concluido: number; total: number };
      }>('ocorrencias_painel');
      setLista(r.ocorrencias ?? []);
      setResumo(r.resumo ?? { aberto: 0, em_andamento: 0, concluido: 0, total: 0 });
    } catch (e) {
      setAviso({
        tipo: 'erro',
        mensagem: e instanceof ErroApi ? e.message : 'Erro ao carregar ocorrências.',
      });
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const selecionarFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const b64 = await redimensionarImagemBase64(f);
      setFotoBase64(b64);
    } catch {
      setAviso({ tipo: 'erro', mensagem: 'Não foi possível processar a imagem selecionada.' });
    }
  };

  const criarOcorrencia = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviandoNovo(true);
    setAviso(null);
    try {
      const r = await api<{ mensagem: string }>('ocorrencia_criar', {
        corpo: {
          categoria,
          prioridade,
          titulo,
          descricao,
          foto_base64: fotoBase64,
        },
      });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      setModalNovo(false);
      setTitulo('');
      setDescricao('');
      setFotoBase64('');
      await carregar();
    } catch (err) {
      setAviso({
        tipo: 'erro',
        mensagem: err instanceof ErroApi ? err.message : 'Erro ao registrar chamado.',
      });
    } finally {
      setEnviandoNovo(false);
    }
  };

  const salvarRespostaSindico = async (e: React.FormEvent, id: number) => {
    e.preventDefault();
    setSalvandoResposta(true);
    try {
      const r = await api<{ mensagem: string }>('ocorrencia_responder', {
        corpo: {
          id,
          status: statusResposta,
          resposta_sindico: textoResposta,
        },
      });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      setOcorrenciaRespostaId(null);
      await carregar();
    } catch (err) {
      setAviso({
        tipo: 'erro',
        mensagem: err instanceof ErroApi ? err.message : 'Erro ao atualizar chamado.',
      });
    } finally {
      setSalvandoResposta(false);
    }
  };

  const listaFiltrada =
    filtroStatus === 'todos' ? lista : lista.filter((o) => o.status === filtroStatus);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Cabeçalho */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-lg sm:text-xl font-black text-slate-900">
            <Wrench size={22} className="text-indigo-600" />
            Livro Digital de Ocorrências &amp; Chamados de Manutenção
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            {ehOperacao
              ? 'Gerencie solicitações de manutenção e ocorrências dos moradores. Ao alterar o status ou responder, o morador recebe uma Notificação Push imediata no celular.'
              : 'Envie solicitações de manutenção (lâmpada queimada, portão, limpeza, vaga) com foto direto para o Síndico e acompanhe a resolução no seu celular.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalNovo(true)}
          className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow cursor-pointer"
        >
          <Plus size={16} /> Abrir Novo Chamado / Ocorrência
        </button>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => setFiltroStatus(filtroStatus === 'aberto' ? 'todos' : 'aberto')}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
            filtroStatus === 'aberto'
              ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-400/20'
              : 'bg-white border-slate-200 hover:border-amber-300'
          }`}
        >
          <div className="text-xs font-extrabold uppercase text-amber-700 flex items-center gap-1.5">
            <AlertTriangle size={14} /> Em Aberto
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">{resumo.aberto}</div>
        </button>

        <button
          type="button"
          onClick={() => setFiltroStatus(filtroStatus === 'em_andamento' ? 'todos' : 'em_andamento')}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
            filtroStatus === 'em_andamento'
              ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-400/20'
              : 'bg-white border-slate-200 hover:border-blue-300'
          }`}
        >
          <div className="text-xs font-extrabold uppercase text-blue-700 flex items-center gap-1.5">
            <Clock size={14} /> Em Andamento
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">{resumo.em_andamento}</div>
        </button>

        <button
          type="button"
          onClick={() => setFiltroStatus(filtroStatus === 'concluido' ? 'todos' : 'concluido')}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
            filtroStatus === 'concluido'
              ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-400/20'
              : 'bg-white border-slate-200 hover:border-emerald-300'
          }`}
        >
          <div className="text-xs font-extrabold uppercase text-emerald-700 flex items-center gap-1.5">
            <CheckCircle2 size={14} /> Concluídos
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">{resumo.concluido}</div>
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

      {/* Lista de Ocorrências */}
      <div className="space-y-4">
        { filtroStatus !== 'todos' && (
          <div className="flex items-center justify-between bg-slate-100 px-4 py-2 rounded-xl text-xs font-bold text-slate-700">
            <span className="flex items-center gap-1.5">
              <Filter size={13} /> Filtrando por status: <b className="uppercase">{filtroStatus.replace('_', ' ')}</b>
            </span>
            <button
              type="button"
              onClick={() => setFiltroStatus('todos')}
              className="text-indigo-600 hover:underline cursor-pointer"
            >
              Mostrar todos ({resumo.total})
            </button>
          </div>
        )}

        {carregando ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400">
            Carregando livro de ocorrências...
          </div>
        ) : listaFiltrada.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
            Nenhuma ocorrência registrada neste filtro.
          </div>
        ) : (
          listaFiltrada.map((o) => {
            const badgeStatus =
              o.status === 'aberto'
                ? { txt: '📋 Aberto', cls: 'bg-amber-100 text-amber-900 border-amber-300' }
                : o.status === 'em_andamento'
                  ? { txt: '🔧 Em Andamento', cls: 'bg-blue-100 text-blue-900 border-blue-300' }
                  : { txt: '✅ Concluído', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' };

            const editando = ocorrenciaRespostaId === o.id;

            return (
              <div
                key={o.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-extrabold text-slate-400">#{o.id}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold border ${badgeStatus.cls}`}>
                        {badgeStatus.txt}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold">
                        {CATEGORIAS[o.categoria] || o.categoria}
                      </span>
                      {o.prioridade === 'urgente' && (
                        <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-xs font-extrabold">
                          🚨 Urgente
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-extrabold text-slate-900">{o.titulo}</h3>
                    <div className="text-xs text-slate-500 flex flex-wrap gap-3">
                      <span>
                        🏢 <b>{o.unidade_label || 'Condomínio'}</b> ({o.morador_nome})
                      </span>
                      <span>🕒 {new Date(o.criado_em).toLocaleString('pt-BR')}</span>
                    </div>
                  </div>

                  {ehOperacao && (
                    <button
                      type="button"
                      onClick={() => {
                        if (editando) {
                          setOcorrenciaRespostaId(null);
                        } else {
                          setOcorrenciaRespostaId(o.id);
                          setStatusResposta(o.status === 'aberto' ? 'em_andamento' : o.status);
                          setTextoResposta(o.resposta_sindico || '');
                        }
                      }}
                      className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <MessageSquare size={14} />
                      {editando ? 'Fechar Edição' : 'Responder / Mudar Status'}
                    </button>
                  )}
                </div>

                <p className="text-sm text-slate-700 whitespace-pre-line bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  {o.descricao}
                </p>

                {o.foto_base64 && (
                  <div>
                    <img
                      src={o.foto_base64}
                      alt="Foto da ocorrência"
                      onClick={() => setFotoAmpliada(o.foto_base64)}
                      className="h-36 w-auto rounded-xl border border-slate-200 object-cover cursor-pointer hover:opacity-90 transition"
                      title="Clique para ampliar a foto"
                    />
                  </div>
                )}

                {o.resposta_sindico && (
                  <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3.5 space-y-1">
                    <div className="text-xs font-extrabold text-emerald-900 flex items-center justify-between">
                      <span>💬 Resposta da Administração / Síndico:</span>
                      {o.respondido_em && (
                        <span className="font-normal text-emerald-700">
                          {new Date(o.respondido_em).toLocaleString('pt-BR')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-emerald-950 whitespace-pre-line">
                      {o.resposta_sindico}
                    </p>
                  </div>
                )}

                {editando && ehOperacao && (
                  <form
                    onSubmit={(e) => salvarRespostaSindico(e, o.id)}
                    className="pt-3 border-t border-slate-200 space-y-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {(
                        [
                          ['aberto', '📋 Aberto'],
                          ['em_andamento', '🔧 Em Andamento'],
                          ['concluido', '✅ Concluído / Resolvido'],
                        ] as const
                      ).map(([val, lab]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setStatusResposta(val)}
                          className={`py-2 px-3 rounded-xl font-extrabold text-xs border transition cursor-pointer ${
                            statusResposta === val
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {lab}
                        </button>
                      ))}
                    </div>

                    <textarea
                      rows={3}
                      value={textoResposta}
                      onChange={(e) => setTextoResposta(e.target.value)}
                      placeholder="Escreva o parecer ou providência tomada (o morador receberá um alerta Push no celular)..."
                      className={entrada}
                    />

                    <div className="flex justify-end gap-2">
                      <button
                        type="submit"
                        disabled={salvandoResposta}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <Send size={14} />
                        {salvandoResposta
                          ? 'Salvando e Notificando...'
                          : 'Salvar Status & Notificar Morador via Push'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal de Abrir Nova Ocorrência */}
      {modalNovo && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalNovo(false);
          }}
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border-t-4 border-t-indigo-600 space-y-4 my-8">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-slate-900">
                Abrir Ocorrência / Solicitação de Manutenção
              </h3>
              <button
                type="button"
                onClick={() => setModalNovo(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={criarOcorrencia} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                    Categoria
                  </label>
                  <select
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                    className={entrada}
                  >
                    {Object.entries(CATEGORIAS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                    Prioridade
                  </label>
                  <select
                    value={prioridade}
                    onChange={(e) => setPrioridade(e.target.value)}
                    className={entrada}
                  >
                    <option value="normal">Normal</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">🚨 Urgente</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Título Resumido
                </label>
                <input
                  type="text"
                  required
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex: Lâmpada queimada no corredor do Bloco 2"
                  className={entrada}
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Descrição Detalhada
                </label>
                <textarea
                  rows={4}
                  required
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Descreva o local exato e o que está acontecendo..."
                  className={entrada}
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Foto do Local / Ocorrência (Opcional)
                </label>
                <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 hover:border-indigo-500 bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer">
                  <Camera size={16} className="text-indigo-600" />
                  <span>{fotoBase64 ? '📸 Foto Anexada (Clique para trocar)' : 'Tirar Foto ou Escolher da Galeria'}</span>
                  <input type="file" accept="image/*" onChange={selecionarFoto} className="hidden" />
                </label>
                {fotoBase64 && (
                  <div className="mt-2 flex items-center gap-3">
                    <img src={fotoBase64} alt="Preview" className="h-20 rounded-lg border" />
                    <button
                      type="button"
                      onClick={() => setFotoBase64('')}
                      className="text-xs font-bold text-rose-600 hover:underline"
                    >
                      Remover foto
                    </button>
                  </div>
                )}
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="submit"
                  disabled={enviandoNovo}
                  className="flex-1 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm cursor-pointer"
                >
                  {enviandoNovo ? 'Enviando Chamado...' : '📲 Registrar Ocorrência'}
                </button>
                <button
                  type="button"
                  onClick={() => setModalNovo(false)}
                  className="py-3 px-4 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Foto Ampliada */}
      {fotoAmpliada && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setFotoAmpliada(null)}
        >
          <img src={fotoAmpliada} alt="Foto Ampliada" className="max-h-[90vh] max-w-full rounded-2xl shadow-2xl" />
        </div>
      )}
    </div>
  );
}
