import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Upload, Trash2, Eye, Sparkles, Calendar, FolderOpen, X, ScanFace } from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import { obterToken } from '../lib/sessao';
import { useSessao } from '../lib/useSessao';
import { Modal } from '../pages/moradores/AcoesMorador';

export interface DocumentoCadastro {
  id: number;
  condominio_id: number;
  unidade_id: number | null;
  usuario_id: number | null;
  precadastro_id: number | null;
  categoria: string;
  categoria_rotulo: string;
  titulo: string;
  nome_original: string;
  mime_type: string;
  eh_pdf: boolean;
  tamanho_bytes: number;
  validade_contrato: string | null;
  origem: 'painel' | 'whatsapp_ia' | 'formulario_externo' | string;
  observacao: string | null;
  criado_em: string;
}

const CATEGORIAS_OPCOES: { valor: string; rotulo: string }[] = [
  { valor: 'contrato_locacao', rotulo: '📄 Contrato de Locação' },
  { valor: 'autorizacao_proprietario', rotulo: '✍️ Autorização do Proprietário' },
  { valor: 'escritura_imovel', rotulo: '🏠 Escritura / Compra e Venda' },
  { valor: 'documento_pessoal', rotulo: '🪪 Documento Pessoal (RG / CNH / CPF)' },
  { valor: 'documento_veiculo', rotulo: '🚗 Documento do Veículo (CRLV)' },
  { valor: 'outros', rotulo: '📎 Outros Comprovantes' },
];

function formatarTamanho(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatarDataHoraPt(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export async function abrirDocumentoProtegido(doc: DocumentoCadastro) {
  const resp = await fetch(`/api.php?route=documento_arquivo&id=${doc.id}`, {
    headers: { Authorization: `Bearer ${obterToken() ?? ''}` },
  });
  if (!resp.ok) {
    throw new Error('Não foi possível abrir o documento.');
  }
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(url), 120000);
}

export interface VerificacaoBiometrica {
  id: number;
  documento_id: number | null;
  faixa: string;
  faixa_rotulo: string;
  similaridade_pct: number | null;
  mensagem: string;
  origem?: string;
  criado_em: string;
}

/** Cores do selo de resultado Selfie x Documento. */
export function classesFaixaBiometria(faixa: string): string {
  if (faixa === 'compativel') return 'bg-emerald-100 text-emerald-900 border-emerald-300';
  if (faixa === 'divergente') return 'bg-rose-100 text-rose-900 border-rose-300';
  if (faixa === 'inconclusivo' || faixa === 'documento_sem_rosto' || faixa === 'selfie_sem_rosto') return 'bg-amber-100 text-amber-900 border-amber-300';
  return 'bg-slate-100 text-slate-700 border-slate-300';
}

interface Props {
  nomePessoa: string;
  subtituloUnidade?: string | null;
  relacaoSugerida?: string | null;
  usuarioId?: number | null;
  unidadeId?: number | null;
  precadastroId?: number | null;
  onFechar: () => void;
  onAlterado?: () => void;
}

export default function ModalDocumentosCadastro({
  nomePessoa,
  subtituloUnidade,
  relacaoSugerida,
  usuarioId,
  unidadeId,
  precadastroId,
  onFechar,
  onAlterado,
}: Props) {
  const [documentos, setDocumentos] = useState<DocumentoCadastro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const catInicial = relacaoSugerida === 'Inquilino' ? 'contrato_locacao' : 'documento_pessoal';
  const [categoria, setCategoria] = useState(catInicial);
  const [titulo, setTitulo] = useState('');
  const [validadeContrato, setValidadeContrato] = useState('');
  const [observacao, setObservacao] = useState('');
  const [arquivoSelecionado, setArquivoSelecionado] = useState<File | null>(null);
  const inputFileRef = useRef<HTMLInputElement | null>(null);

  // Segurança Facial IA: comparação Selfie x Foto do Documento (somente quando o módulo está ligado no condomínio)
  const { usuario } = useSessao();
  const biometriaHabilitada = Boolean(usuario?.modulo_seguranca_facial) && Boolean(usuarioId || precadastroId);
  const [verificacoes, setVerificacoes] = useState<VerificacaoBiometrica[]>([]);
  const [comparandoDocId, setComparandoDocId] = useState<number | null>(null);

  const carregarVerificacoes = useCallback(async () => {
    if (!biometriaHabilitada) return;
    try {
      const r = await api<{ verificacoes: VerificacaoBiometrica[] }>('biometria_verificacoes', {
        query: { usuario_id: usuarioId || undefined, precadastro_id: !usuarioId ? precadastroId || undefined : undefined },
      });
      setVerificacoes(r.verificacoes ?? []);
    } catch {
      setVerificacoes([]);
    }
  }, [biometriaHabilitada, usuarioId, precadastroId]);

  useEffect(() => {
    void carregarVerificacoes();
  }, [carregarVerificacoes]);

  const compararComSelfie = async (doc: DocumentoCadastro) => {
    setComparandoDocId(doc.id);
    setErro('');
    setSucesso('');
    try {
      const r = await api<{ resultado: VerificacaoBiometrica }>('biometria_comparar', {
        corpo: {
          usuario_id: usuarioId || 0,
          precadastro_id: !usuarioId ? precadastroId || 0 : 0,
          documento_id: doc.id,
        },
      });
      const res = r.resultado;
      const texto = `Selfie x Documento: ${res.faixa_rotulo}${res.similaridade_pct !== null ? ` (${res.similaridade_pct}%)` : ''} — ${res.mensagem}`;
      if (res.faixa === 'compativel') setSucesso(texto);
      else setErro(texto);
      await carregarVerificacoes();
      onAlterado?.();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Falha na comparação biométrica.');
    } finally {
      setComparandoDocId(null);
    }
  };

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const r = await api<{ documentos: DocumentoCadastro[] }>('documentos_listar', {
        query: {
          usuario_id: usuarioId || undefined,
          precadastro_id: precadastroId || undefined,
          unidade_id: !usuarioId && !precadastroId ? unidadeId || undefined : undefined,
        },
      });
      setDocumentos(r.documentos ?? []);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Erro ao carregar documentos.');
    } finally {
      setCarregando(false);
    }
  }, [usuarioId, precadastroId, unidadeId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const enviarArquivo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!arquivoSelecionado) {
      setErro('Selecione um arquivo PDF ou Imagem para anexar.');
      return;
    }
    setEnviando(true);
    setErro('');
    setSucesso('');
    try {
      const fd = new FormData();
      fd.append('arquivo', arquivoSelecionado);
      fd.append('categoria', categoria);
      if (titulo.trim()) fd.append('titulo', titulo.trim());
      if (validadeContrato) fd.append('validade_contrato', validadeContrato);
      if (observacao.trim()) fd.append('observacao', observacao.trim());
      if (usuarioId) fd.append('usuario_id', String(usuarioId));
      if (unidadeId) fd.append('unidade_id', String(unidadeId));
      if (precadastroId) fd.append('precadastro_id', String(precadastroId));

      const resp = await fetch('/api.php?route=documento_upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${obterToken() ?? ''}` },
        body: fd,
      });
      const json = (await resp.json().catch(() => ({}))) as {
        status?: string;
        mensagem?: string;
        biometria?: { faixa: string; faixa_rotulo: string; similaridade_pct: number | null } | null;
      };
      if (!resp.ok || json.status === 'erro') {
        throw new Error(json.mensagem || `Erro ${resp.status} ao enviar documento.`);
      }

      setSucesso(
        'Documento vinculado com sucesso!' +
          (json.biometria
            ? ` Selfie x Documento: ${json.biometria.faixa_rotulo}${json.biometria.similaridade_pct !== null ? ` (${json.biometria.similaridade_pct}%)` : ''}`
            : ''),
      );
      void carregarVerificacoes();
      setArquivoSelecionado(null);
      setTitulo('');
      setValidadeContrato('');
      setObservacao('');
      if (inputFileRef.current) inputFileRef.current.value = '';
      await carregar();
      onAlterado?.();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao enviar documento.');
    } finally {
      setEnviando(false);
    }
  };

  const remover = async (doc: DocumentoCadastro) => {
    if (!window.confirm(`Remover o documento "${doc.titulo}"?`)) return;
    setErro('');
    setSucesso('');
    try {
      await api('documento_excluir', { corpo: { id: doc.id } });
      setDocumentos((ant) => ant.filter((d) => d.id !== doc.id));
      onAlterado?.();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Erro ao excluir documento.');
    }
  };

  return (
    <Modal
      titulo={
        <>
          <span className="bg-blue-100 text-blue-700 p-2 rounded-xl">
            <FolderOpen size={18} />
          </span>
          <div>
            <div className="text-base sm:text-lg font-extrabold text-slate-900 leading-tight">
              Pasta de Documentos — {nomePessoa}
            </div>
            {subtituloUnidade && (
              <div className="text-xs font-semibold text-slate-500">{subtituloUnidade}</div>
            )}
          </div>
        </>
      }
      borda="border-t-blue-600"
      largura="max-w-2xl"
      onFechar={onFechar}
    >
      <div className="space-y-5">
        {erro && (
          <div className="bg-rose-50 border-l-4 border-rose-500 text-rose-800 px-3.5 py-2.5 rounded-lg text-xs font-bold flex justify-between items-center gap-2">
            <span>{erro}</span>
            <button type="button" onClick={() => setErro('')}><X size={14} /></button>
          </div>
        )}
        {sucesso && (
          <div className="bg-emerald-50 border-l-4 border-emerald-500 text-emerald-800 px-3.5 py-2.5 rounded-lg text-xs font-bold flex justify-between items-center gap-2">
            <span>✅ {sucesso}</span>
            <button type="button" onClick={() => setSucesso('')}><X size={14} /></button>
          </div>
        )}

        {/* Lista de Documentos Vinculados */}
        <div>
          <div className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2">
            Documentos Vinculados ({documentos.length})
          </div>
          {carregando ? (
            <div className="text-center text-slate-400 py-6 text-sm">Carregando documentos...</div>
          ) : documentos.length === 0 ? (
            <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-5 text-center text-xs text-slate-500">
              Nenhum documento vinculado ainda (Contratos de Locação, Escrituras ou RGs enviados pela IA no WhatsApp também aparecerão automaticamente aqui).
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {documentos.map((d) => {
                const vencido =
                  d.validade_contrato &&
                  new Date(`${d.validade_contrato}T23:59:59`).getTime() < Date.now();
                return (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-blue-300 transition"
                  >
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 font-extrabold text-[11px] ${
                          d.eh_pdf
                            ? 'bg-rose-100 text-rose-700 border border-rose-200'
                            : 'bg-sky-100 text-sky-700 border border-sky-200'
                        }`}
                      >
                        {d.eh_pdf ? 'PDF' : 'IMG'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs sm:text-sm font-extrabold text-slate-900 truncate">
                            {d.titulo}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-extrabold">
                            {d.categoria_rotulo}
                          </span>
                          {d.origem === 'whatsapp_ia' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 text-[10px] font-extrabold">
                              <Sparkles size={10} /> Coletado via IA
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-2.5 gap-y-0.5 mt-0.5">
                          {d.nome_original && <span className="truncate max-w-[200px]">{d.nome_original}</span>}
                          {d.tamanho_bytes > 0 && <span>• {formatarTamanho(d.tamanho_bytes)}</span>}
                          <span>• {formatarDataHoraPt(d.criado_em)}</span>
                          {d.validade_contrato && (
                            <span
                              className={`inline-flex items-center gap-1 font-bold ${
                                vencido ? 'text-rose-600' : 'text-emerald-700'
                              }`}
                            >
                              <Calendar size={11} />
                              Vigência: {formatarDataHoraPt(d.validade_contrato)}
                              {vencido ? ' (Vencido)' : ''}
                            </span>
                          )}
                        </div>
                        {d.observacao && (
                          <div className="text-[11px] text-slate-600 italic mt-0.5">{d.observacao}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {biometriaHabilitada && d.categoria === 'documento_pessoal' && (
                        <button
                          type="button"
                          disabled={comparandoDocId !== null}
                          onClick={() => void compararComSelfie(d)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-xs font-bold cursor-pointer disabled:opacity-50"
                          title="Comparar o rosto da selfie do cadastro com a foto deste documento (GPU)"
                        >
                          <ScanFace size={13} /> {comparandoDocId === d.id ? 'Comparando...' : 'Comparar c/ selfie'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          abrirDocumentoProtegido(d).catch((err) =>
                            setErro(err instanceof Error ? err.message : 'Erro ao abrir arquivo.'),
                          );
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
                        title="Abrir e visualizar documento"
                      >
                        <Eye size={13} /> Abrir
                      </button>
                      <button
                        type="button"
                        onClick={() => void remover(d)}
                        className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 cursor-pointer"
                        title="Excluir documento"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Segurança Facial IA: histórico das comparações Selfie x Foto do Documento */}
        {biometriaHabilitada && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-rose-900">
              <ScanFace size={14} /> Selfie x Foto do Documento (IA)
            </div>
            {verificacoes.length === 0 ? (
              <div className="text-[11px] text-slate-600">
                Nenhuma comparação ainda. Ela roda automaticamente ao anexar um <b>Documento Pessoal (RG/CNH)</b> ou use o botão
                “Comparar c/ selfie” no documento.
              </div>
            ) : (
              <div className="space-y-1.5">
                {verificacoes.slice(0, 4).map((v) => (
                  <div key={v.id} className="flex items-start justify-between gap-2 text-[11px]">
                    <div className="min-w-0">
                      <span className={`inline-block px-2 py-0.5 rounded-full border font-extrabold mr-1.5 ${classesFaixaBiometria(v.faixa)}`}>
                        {v.faixa_rotulo}
                        {v.similaridade_pct !== null ? ` • ${v.similaridade_pct}%` : ''}
                      </span>
                      <span className="text-slate-600">{v.mensagem}</span>
                    </div>
                    <span className="text-slate-400 shrink-0">{formatarDataHoraPt(v.criado_em)}</span>
                  </div>
                ))}
                <div className="text-[10px] text-slate-500 pt-0.5">
                  A IA apenas sinaliza: a decisão de aprovar ou reprovar o cadastro é sempre da administração.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Formulário para Anexar Novo Documento */}
        <form onSubmit={enviarArquivo} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-700">
            <FileText size={14} className="text-blue-600" /> Anexar Novo Documento (PDF ou Foto)
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Tipo de Documento *</label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm font-semibold text-slate-800"
              >
                {CATEGORIAS_OPCOES.map((op) => (
                  <option key={op.valor} value={op.valor}>
                    {op.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                Descrição / Título (Opcional)
              </label>
              <input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex.: Contrato de Locação 2026/2027"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm"
              />
            </div>
          </div>

          {categoria === 'contrato_locacao' && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Término / Vigência da Locação (Opcional)
                </label>
                <input
                  type="date"
                  value={validadeContrato}
                  onChange={(e) => setValidadeContrato(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Observação (Imobiliária / Proprietário)
                </label>
                <input
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Ex.: Autorizado pelo proprietário"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm"
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <input
              ref={inputFileRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => setArquivoSelecionado(e.target.files?.[0] ?? null)}
              className="text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-extrabold file:bg-blue-100 file:text-blue-800 hover:file:bg-blue-200 cursor-pointer flex-1 min-w-[200px]"
            />
            <button
              type="submit"
              disabled={enviando || !arquivoSelecionado}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold disabled:opacity-50 cursor-pointer"
            >
              <Upload size={14} /> {enviando ? 'Enviando...' : 'Vincular Documento'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
