import { useCallback, useEffect, useState } from 'react';
import {
  Wrench, Plus, CheckCircle2, Clock, AlertTriangle, Camera, Send, X, MessageSquare, Filter,
  Gavel, ShieldAlert, Scale,
} from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import { useSessao } from '../lib/useSessao';

interface Ocorrencia {
  id: number;
  unidade_id: number | null;
  unidade_label: string;
  proprietario_nome?: string;
  inquilino_nome?: string;
  usuario_id: number;
  morador_nome: string;
  morador_telefone: string | null;
  tipo_registro: 'chamado' | 'advertencia' | 'multa' | string;
  valor_multa: number;
  artigo_regimento: string | null;
  prazo_defesa: string | null;
  defesa_morador: string | null;
  defesa_enviada_em: string | null;
  status_infracao: string | null;
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

interface UnidadeApoio {
  id: number;
  numero: string;
  bloco_nome: string;
  proprietario_nome: string;
  inquilino_nome: string;
}

const CATEGORIAS: Record<string, string> = {
  manutencao: '🔧 Manutenção / Estrutura',
  iluminacao: '💡 Iluminação / Elétrica',
  portoes_acesso: '🚪 Portões / Controle de Acesso',
  barulho: '🔊 Barulho / Lei do Silêncio',
  garagem: '🚗 Vaga de Garagem / Estacionamento Indevido',
  limpeza: '🧹 Limpeza / Conservação / Lixo',
  areas_comuns: '🏊 Uso Indevido de Áreas Comuns',
  obras_mudanca: '🏗️ Obras / Mudança fora de Horário',
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
  const ehGestao = ['superadmin', 'admin', 'sindico'].includes(usuario?.perfil ?? '');

  const [lista, setLista] = useState<Ocorrencia[]>([]);
  const [unidades, setUnidades] = useState<UnidadeApoio[]>([]);
  const [resumo, setResumo] = useState({
    aberto: 0,
    em_andamento: 0,
    concluido: 0,
    advertencias: 0,
    multas: 0,
    total: 0,
  });
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; mensagem: string } | null>(null);

  // Modal de Novo Chamado ou Emissão de Advertência / Multa
  const [modalNovo, setModalNovo] = useState(false);
  const [tipoRegistro, setTipoRegistro] = useState<'chamado' | 'advertencia' | 'multa'>('chamado');
  const [unidadeIdAlvo, setUnidadeIdAlvo] = useState('');
  const [valorMulta, setValorMulta] = useState('');
  const [artigoRegimento, setArtigoRegimento] = useState('');
  const [prazoDefesa, setPrazoDefesa] = useState('');
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

  // Defesa do Morador
  const [defesaId, setDefesaId] = useState<number | null>(null);
  const [textoDefesa, setTextoDefesa] = useState('');
  const [enviandoDefesa, setEnviandoDefesa] = useState(false);

  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{
        ocorrencias: Ocorrencia[];
        unidades?: UnidadeApoio[];
        resumo: {
          aberto: number;
          em_andamento: number;
          concluido: number;
          advertencias?: number;
          multas?: number;
          total: number;
        };
      }>('ocorrencias_painel');
      setLista(r.ocorrencias ?? []);
      setUnidades(r.unidades ?? []);
      setResumo({
        aberto: r.resumo?.aberto ?? 0,
        em_andamento: r.resumo?.em_andamento ?? 0,
        concluido: r.resumo?.concluido ?? 0,
        advertencias: r.resumo?.advertencias ?? 0,
        multas: r.resumo?.multas ?? 0,
        total: r.resumo?.total ?? 0,
      });
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
    void carregar();
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

  const abrirModal = (tipo: 'chamado' | 'advertencia' | 'multa') => {
    setTipoRegistro(tipo);
    setCategoria(tipo === 'chamado' ? 'manutencao' : 'barulho');
    setPrioridade(tipo === 'multa' ? 'alta' : 'normal');
    setTitulo('');
    setDescricao('');
    setFotoBase64('');
    setValorMulta('');
    setArtigoRegimento('');
    setPrazoDefesa('');
    setModalNovo(true);
  };

  const criarOcorrencia = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviandoNovo(true);
    setAviso(null);
    try {
      const r = await api<{ mensagem: string }>('ocorrencia_criar', {
        corpo: {
          tipo_registro: tipoRegistro,
          unidade_id: unidadeIdAlvo ? Number(unidadeIdAlvo) : undefined,
          valor_multa: tipoRegistro === 'multa' ? valorMulta : undefined,
          artigo_regimento: artigoRegimento,
          prazo_defesa: prazoDefesa || undefined,
          categoria,
          prioridade,
          titulo,
          descricao,
          foto_base64: fotoBase64,
        },
      });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      setModalNovo(false);
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

  const enviarDefesaMorador = async (e: React.FormEvent, id: number) => {
    e.preventDefault();
    setEnviandoDefesa(true);
    try {
      const r = await api<{ mensagem: string }>('ocorrencia_enviar_defesa', {
        corpo: {
          id,
          defesa_morador: textoDefesa,
        },
      });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      setDefesaId(null);
      setTextoDefesa('');
      await carregar();
    } catch (err) {
      setAviso({
        tipo: 'erro',
        mensagem: err instanceof ErroApi ? err.message : 'Erro ao enviar defesa.',
      });
    } finally {
      setEnviandoDefesa(false);
    }
  };

  const listaFiltrada = lista.filter((o) => {
    if (filtroStatus === 'todos') return true;
    if (filtroStatus === 'infracoes') return ['advertencia', 'multa'].includes(o.tipo_registro);
    return o.status === filtroStatus;
  });

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Cabeçalho */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-lg sm:text-xl font-black text-slate-900">
            <Wrench size={22} className="text-indigo-600" />
            Livro Digital de Ocorrências, Chamados &amp; Infrações
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            {ehOperacao
              ? 'Gerencie chamados de manutenção dos moradores e emita Advertências ou Multas regimentais com foto e direito de defesa digital no aplicativo.'
              : 'Envie solicitações de manutenção com foto para o Síndico ou apresente sua defesa formal caso receba alguma notificação.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ehGestao && (
            <button
              type="button"
              onClick={() => abrirModal('advertencia')}
              className="px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow cursor-pointer"
            >
              <Gavel size={16} /> Emitir Advertência / Multa
            </button>
          )}
          <button
            type="button"
            onClick={() => abrirModal('chamado')}
            className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow cursor-pointer"
          >
            <Plus size={16} /> Abrir Chamado / Ocorrência
          </button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
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
            <Clock size={14} /> Em Análise / Recurso
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

        <button
          type="button"
          onClick={() => setFiltroStatus(filtroStatus === 'infracoes' ? 'todos' : 'infracoes')}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
            filtroStatus === 'infracoes'
              ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-400/20'
              : 'bg-white border-slate-200 hover:border-rose-300'
          }`}
        >
          <div className="text-xs font-extrabold uppercase text-rose-700 flex items-center gap-1.5">
            <Gavel size={14} /> Advertências &amp; Multas
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
            {resumo.advertencias + resumo.multas}
          </div>
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
        {filtroStatus !== 'todos' && (
          <div className="flex items-center justify-between bg-slate-100 px-4 py-2 rounded-xl text-xs font-bold text-slate-700">
            <span className="flex items-center gap-1.5">
              <Filter size={13} /> Filtro ativo: <b className="uppercase">{filtroStatus.replace('_', ' ')}</b>
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
            Nenhum registro encontrado neste filtro.
          </div>
        ) : (
          listaFiltrada.map((o) => {
            const ehInfracao = o.tipo_registro === 'advertencia' || o.tipo_registro === 'multa';
            const badgeStatus =
              o.status === 'aberto'
                ? { txt: ehInfracao ? '⚠️ Notificado' : '📋 Aberto', cls: 'bg-amber-100 text-amber-900 border-amber-300' }
                : o.status === 'em_andamento'
                  ? { txt: o.defesa_morador ? '⚖️ Defesa em Análise' : '🔧 Em Andamento', cls: 'bg-blue-100 text-blue-900 border-blue-300' }
                  : { txt: '✅ Concluído', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' };

            const editando = ocorrenciaRespostaId === o.id;
            const abrindoDefesa = defesaId === o.id;

            return (
              <div
                key={o.id}
                className={`bg-white rounded-2xl border p-5 shadow-xs space-y-3 ${
                  o.tipo_registro === 'multa'
                    ? 'border-rose-300 border-l-4 border-l-rose-600'
                    : o.tipo_registro === 'advertencia'
                      ? 'border-amber-300 border-l-4 border-l-amber-500'
                      : 'border-slate-200'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-extrabold text-slate-400">#{o.id}</span>
                      {o.tipo_registro === 'multa' && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-rose-600 text-white flex items-center gap-1">
                          <Gavel size={12} /> MULTA REGIMENTAL{' '}
                          {o.valor_multa > 0 && `• R$ ${o.valor_multa.toFixed(2).replace('.', ',')}`}
                        </span>
                      )}
                      {o.tipo_registro === 'advertencia' && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-500 text-white flex items-center gap-1">
                          <ShieldAlert size={12} /> ADVERTÊNCIA FORMAL
                        </span>
                      )}
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold border ${badgeStatus.cls}`}>
                        {badgeStatus.txt}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold">
                        {CATEGORIAS[o.categoria] || o.categoria}
                      </span>
                    </div>
                    <h3 className="text-base font-extrabold text-slate-900">{o.titulo}</h3>
                    <div className="text-xs text-slate-500 flex flex-wrap gap-3">
                      <span>
                        🏢 <b>{o.unidade_label || 'Condomínio'}</b>{' '}
                        {o.proprietario_nome ? `(Titular: ${o.proprietario_nome})` : `(${o.morador_nome})`}
                      </span>
                      {o.artigo_regimento && (
                        <span className="text-rose-700 font-bold">📖 Base: {o.artigo_regimento}</span>
                      )}
                      {o.prazo_defesa && (
                        <span className="text-amber-800 font-bold">
                          ⏳ Prazo p/ Defesa: {new Date(`${o.prazo_defesa}T12:00:00`).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                      <span>🕒 {new Date(o.criado_em).toLocaleString('pt-BR')}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!ehOperacao && ehInfracao && o.status !== 'concluido' && (
                      <button
                        type="button"
                        onClick={() => {
                          setDefesaId(abrindoDefesa ? null : o.id);
                          setTextoDefesa(o.defesa_morador || '');
                        }}
                        className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <Scale size={14} />
                        {o.defesa_morador ? 'Editar Minha Defesa' : 'Apresentar Defesa / Recurso'}
                      </button>
                    )}

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
                        {editando ? 'Fechar Edição' : ehInfracao ? 'Julgar / Dar Parecer' : 'Responder / Mudar Status'}
                      </button>
                    )}
                  </div>
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

                {o.defesa_morador && (
                  <div className="bg-amber-50/90 border border-amber-300 rounded-xl p-3.5 space-y-1">
                    <div className="text-xs font-extrabold text-amber-900 flex items-center justify-between">
                      <span>⚖️ Defesa / Recurso Apresentado pelo Morador:</span>
                      {o.defesa_enviada_em && (
                        <span className="font-normal text-amber-700">
                          {new Date(o.defesa_enviada_em).toLocaleString('pt-BR')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-amber-950 whitespace-pre-line">{o.defesa_morador}</p>
                  </div>
                )}

                {o.resposta_sindico && (
                  <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3.5 space-y-1">
                    <div className="text-xs font-extrabold text-emerald-900 flex items-center justify-between">
                      <span>💬 Parecer da Administração / Síndico:</span>
                      {o.respondido_em && (
                        <span className="font-normal text-emerald-700">
                          {new Date(o.respondido_em).toLocaleString('pt-BR')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-emerald-950 whitespace-pre-line">{o.resposta_sindico}</p>
                  </div>
                )}

                {abrindoDefesa && (
                  <form
                    onSubmit={(e) => enviarDefesaMorador(e, o.id)}
                    className="pt-3 border-t border-amber-200 space-y-3"
                  >
                    <label className="block text-xs font-extrabold text-amber-900">
                      ⚖️ Escreva sua justificativa ou recurso de defesa para o Síndico e Conselho:
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={textoDefesa}
                      onChange={(e) => setTextoDefesa(e.target.value)}
                      placeholder="Apresente seus esclarecimentos sobre o ocorrido..."
                      className={entrada}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="submit"
                        disabled={enviandoDefesa}
                        className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <Send size={14} />
                        {enviandoDefesa ? 'Protocolando...' : 'Protocolar Defesa Oficial'}
                      </button>
                    </div>
                  </form>
                )}

                {editando && ehOperacao && (
                  <form
                    onSubmit={(e) => salvarRespostaSindico(e, o.id)}
                    className="pt-3 border-t border-slate-200 space-y-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {(
                        [
                          ['aberto', '📋 Aberto / Notificado'],
                          ['em_andamento', '🔧 Em Análise / Recurso'],
                          ['concluido', '✅ Concluído / Decisão Final'],
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
                      placeholder="Escreva o parecer ou decisão final (o morador receberá um alerta Push no celular)..."
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
                          : 'Salvar Parecer & Notificar Morador via Push'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal de Abrir Nova Ocorrência ou Emitir Advertência / Multa */}
      {modalNovo && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalNovo(false);
          }}
        >
          <div
            className={`bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border-t-4 space-y-4 my-8 ${
              tipoRegistro === 'multa'
                ? 'border-t-rose-600'
                : tipoRegistro === 'advertencia'
                  ? 'border-t-amber-500'
                  : 'border-t-indigo-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-slate-900">
                {tipoRegistro === 'multa'
                  ? '🚨 Emitir Notificação de Multa Condominial'
                  : tipoRegistro === 'advertencia'
                    ? '⚠️ Emitir Advertência Formal à Unidade'
                    : '🛠️ Abrir Ocorrência / Solicitação de Manutenção'}
              </h3>
              <button
                type="button"
                onClick={() => setModalNovo(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            {ehGestao && (
              <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1.5 rounded-2xl">
                {(
                  [
                    ['chamado', '🛠️ Chamado Geral'],
                    ['advertencia', '⚠️ Advertência'],
                    ['multa', '🚨 Multa'],
                  ] as const
                ).map(([t, rot]) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipoRegistro(t)}
                    className={`py-2 px-3 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                      tipoRegistro === t
                        ? t === 'multa'
                          ? 'bg-rose-600 text-white shadow'
                          : t === 'advertencia'
                            ? 'bg-amber-500 text-white shadow'
                            : 'bg-indigo-600 text-white shadow'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {rot}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={criarOcorrencia} className="space-y-3.5">
              {ehOperacao && (
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                    Unidade (Bloco / Apartamento) {tipoRegistro !== 'chamado' ? '*' : '(Opcional)'}
                  </label>
                  <select
                    required={tipoRegistro !== 'chamado'}
                    value={unidadeIdAlvo}
                    onChange={(e) => setUnidadeIdAlvo(e.target.value)}
                    className={entrada}
                  >
                    <option value="">
                      {tipoRegistro === 'chamado' ? '— Área Comum / Condomínio Geral —' : 'Selecione a unidade infratora...'}
                    </option>
                    {unidades.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.bloco_nome} — Apto {u.numero}{' '}
                        {u.proprietario_nome ? `(${u.proprietario_nome})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {tipoRegistro !== 'chamado' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-rose-50/50 border border-rose-200 p-3.5 rounded-2xl">
                  {tipoRegistro === 'multa' && (
                    <div>
                      <label className="block text-xs font-extrabold uppercase text-rose-800 mb-1">
                        Valor da Multa (R$) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={valorMulta}
                        onChange={(e) => setValorMulta(e.target.value)}
                        placeholder="Ex: 250.00"
                        className={entrada}
                      />
                    </div>
                  )}
                  <div className={tipoRegistro === 'multa' ? '' : 'sm:col-span-2'}>
                    <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1">
                      Artigo do Regimento / Convenção
                    </label>
                    <input
                      value={artigoRegimento}
                      onChange={(e) => setArtigoRegimento(e.target.value)}
                      placeholder="Ex: Art. 14 - Lei do Silêncio após 22h"
                      className={entrada}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1">
                      Prazo Limite p/ Defesa
                    </label>
                    <input
                      type="date"
                      value={prazoDefesa}
                      onChange={(e) => setPrazoDefesa(e.target.value)}
                      className={entrada}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">Categoria</label>
                  <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={entrada}>
                    {Object.entries(CATEGORIAS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">Prioridade</label>
                  <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)} className={entrada}>
                    <option value="normal">Normal</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">🚨 Urgente</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">Título Resumido *</label>
                <input
                  type="text"
                  required
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder={
                    tipoRegistro === 'chamado'
                      ? 'Ex: Lâmpada queimada no corredor do Bloco 2'
                      : 'Ex: Estacionamento em vaga de outra unidade / Som alto após 22h'
                  }
                  className={entrada}
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Descrição Detalhada dos Fatos *
                </label>
                <textarea
                  rows={4}
                  required
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Descreva a data, horário, local exato e detalhes da ocorrência..."
                  className={entrada}
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Foto / Evidência (Opcional)
                </label>
                <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 hover:border-indigo-500 bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer">
                  <Camera size={16} className="text-indigo-600" />
                  <span>
                    {fotoBase64 ? '📸 Foto Anexada (Clique para trocar)' : 'Tirar Foto ou Escolher Evidência da Galeria'}
                  </span>
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
                  className={`flex-1 py-3 px-4 rounded-xl text-white font-extrabold text-sm cursor-pointer ${
                    tipoRegistro === 'multa'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : tipoRegistro === 'advertencia'
                        ? 'bg-amber-600 hover:bg-amber-700'
                        : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  {enviandoNovo
                    ? 'Enviando...'
                    : tipoRegistro === 'multa'
                      ? '🚨 Emitir Multa & Notificar Unidade'
                      : tipoRegistro === 'advertencia'
                        ? '⚠️ Emitir Advertência Formal'
                        : '📲 Registrar Ocorrência'}
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
