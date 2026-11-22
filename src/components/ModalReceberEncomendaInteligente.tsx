import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Barcode, Camera, CheckCircle2, Sparkles, X, AlertCircle, BellRing, Repeat, Loader2,
} from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import ScannerCodigoCamera, { tocarBipScanner } from './ScannerCodigoCamera';
import { filtrarUnidadesInteligente, listarGruposMacroUnidades } from '../lib/buscaUnidadeInteligente';

export interface MoradorUnidadeEnc {
  id: number;
  nome: string;
  telefone: string | null;
  tem_app: boolean;
}

export interface UnidadeCatalogoEnc {
  id: number;
  numero: string;
  bloco_nome: string;
  label: string;
  codigo_discagem?: string;
  moradores: MoradorUnidadeEnc[];
}

const TRANSPORTADORAS_RAPIDAS = [
  'Mercado Livre',
  'Shopee',
  'Amazon',
  'Correios',
  'Magalu',
  'iFood / Delivery',
  'Transportadora',
  'Outra',
];

const msgErro = (e: unknown) => (e instanceof ErroApi ? e.message : 'Erro inesperado.');

export default function ModalReceberEncomendaInteligente({
  unidades,
  onFechar,
  onRegistrada,
  onAbrirEntregaExistente,
}: {
  unidades: UnidadeCatalogoEnc[];
  onFechar: () => void;
  onRegistrada: (mensagem: string) => void;
  onAbrirEntregaExistente?: (encomendaId: number) => void;
}) {
  const [codigoRastreio, setCodigoRastreio] = useState('');
  const [buscaUnid, setBuscaUnid] = useState('');
  const [grupoRuaAtivo, setGrupoRuaAtivo] = useState('');
  const [unidEscolhida, setUnidEscolhida] = useState<UnidadeCatalogoEnc | null>(null);
  const [moradorId, setMoradorId] = useState<number>(0);
  const [empresa, setEmpresa] = useState('Mercado Livre');
  const [observacoes, setObservacoes] = useState('');
  const [fotoBase64, setFotoBase64] = useState('');
  const [modoLote, setModoLote] = useState(false);

  const [scannerAberto, setScannerAberto] = useState(false);
  const [webcamEtiquetaAberta, setWebcamEtiquetaAberta] = useState(false);
  const [analisandoIa, setAnalisandoIa] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [feedbackIa, setFeedbackIa] = useState<{ tipo: 'ok' | 'aviso' | 'erro'; texto: string; encExistenteId?: number } | null>(null);
  const [msgSucessoLote, setMsgSucessoLote] = useState('');

  const inputCodigoRef = useRef<HTMLInputElement | null>(null);
  const videoEtiquetaRef = useRef<HTMLVideoElement | null>(null);
  const streamEtiquetaRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    inputCodigoRef.current?.focus();
    return () => {
      streamEtiquetaRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const pararWebcamEtiqueta = useCallback(() => {
    streamEtiquetaRef.current?.getTracks().forEach((t) => t.stop());
    streamEtiquetaRef.current = null;
    setWebcamEtiquetaAberta(false);
  }, []);

  const analisarCodigoOuFoto = useCallback(
    async (params: { codigo?: string; foto?: string }) => {
      setAnalisandoIa(true);
      setFeedbackIa(null);
      setMsgSucessoLote('');
      try {
        const r = await api<{
          ok: boolean;
          codigo_rastreio: string;
          empresa_sugerida: string;
          unidade_sugerida: { id: number; label: string } | null;
          morador_sugerido_id: number | null;
          morador_sugerido_nome: string | null;
          destinatario_etiqueta: string;
          observacao_sugerida: string;
          encomenda_na_portaria: {
            id: number;
            empresa: string;
            bloco_nome?: string | null;
            unidade_nome?: string | null;
            morador_nome?: string | null;
          } | null;
        }>('encomenda_analisar_codigo_ou_foto', {
          corpo: {
            codigo_lido: params.codigo || undefined,
            foto_base64: params.foto || undefined,
          },
        });

        if (r.codigo_rastreio) {
          setCodigoRastreio(r.codigo_rastreio);
        }
        if (r.empresa_sugerida) {
          setEmpresa(r.empresa_sugerida);
        }
        if (r.observacao_sugerida && !observacoes.trim()) {
          setObservacoes(r.observacao_sugerida);
        }

        if (r.encomenda_na_portaria) {
          const ex = r.encomenda_na_portaria;
          const destTxt = `${ex.bloco_nome ? ex.bloco_nome + ' - ' : ''}${ex.unidade_nome || ''} (${ex.morador_nome || 'Morador'})`;
          setFeedbackIa({
            tipo: 'aviso',
            texto: `⚠️ Este pacote já está na prateleira aguardando retirada para ${destTxt}!`,
            encExistenteId: ex.id,
          });
          return;
        }

        let achouUnidade = false;
        if (r.unidade_sugerida) {
          const uObj = unidades.find((u) => u.id === r.unidade_sugerida!.id);
          if (uObj) {
            setUnidEscolhida(uObj);
            setMoradorId(r.morador_sugerido_id || uObj.moradores[0]?.id || 0);
            achouUnidade = true;
          }
        }

        const partesOk: string[] = [];
        if (r.empresa_sugerida) partesOk.push(`Loja: ${r.empresa_sugerida}`);
        if (r.codigo_rastreio) partesOk.push(`Código: ${r.codigo_rastreio}`);
        if (achouUnidade && r.unidade_sugerida) partesOk.push(`Unidade identificada: ${r.unidade_sugerida.label}`);
        else if (r.destinatario_etiqueta) {
          partesOk.push(`Destinatário lido: "${r.destinatario_etiqueta}"`);
          setBuscaUnid(r.destinatario_etiqueta);
        }

        if (partesOk.length > 0) {
          tocarBipScanner();
          setFeedbackIa({
            tipo: 'ok',
            texto: `✨ Leitura automática concluída — ${partesOk.join(' • ')}`,
          });
        } else if (params.foto) {
          setFeedbackIa({
            tipo: 'aviso',
            texto: 'Foto anexada! Não foi possível identificar a unidade automaticamente na etiqueta — selecione abaixo.',
          });
        }
      } catch (e) {
        setFeedbackIa({ tipo: 'erro', texto: msgErro(e) });
      } finally {
        setAnalisandoIa(false);
      }
    },
    [unidades, observacoes],
  );

  const abrirCameraEtiqueta = async () => {
    try {
      const st = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      streamEtiquetaRef.current = st;
      setWebcamEtiquetaAberta(true);
      window.setTimeout(() => {
        if (videoEtiquetaRef.current) {
          videoEtiquetaRef.current.srcObject = st;
          videoEtiquetaRef.current.play().catch(() => {});
        }
      }, 60);
    } catch {
      setFeedbackIa({
        tipo: 'erro',
        texto: 'Não foi possível abrir a câmera ao vivo. Use "Enviar Foto da Etiqueta" ao lado.',
      });
    }
  };

  const capturarFotoEtiquetaWebcam = () => {
    const v = videoEtiquetaRef.current;
    if (!v || v.videoWidth === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    const b64 = canvas.toDataURL('image/jpeg', 0.85);
    setFotoBase64(b64);
    pararWebcamEtiqueta();
    analisarCodigoOuFoto({ foto: b64, codigo: codigoRastreio });
  };

  const selecionarArquivoEtiqueta = (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const b64 = reader.result;
        setFotoBase64(b64);
        analisarCodigoOuFoto({ foto: b64, codigo: codigoRastreio });
      }
    };
    reader.readAsDataURL(file);
  };

  const gruposRuas = useMemo(() => listarGruposMacroUnidades(unidades), [unidades]);

  const unidadesFiltradas = useMemo(() => {
    const base = filtrarUnidadesInteligente(unidades, buscaUnid, grupoRuaAtivo, true);
    return base.slice(0, 120);
  }, [unidades, buscaUnid, grupoRuaAtivo]);

  const salvar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!unidEscolhida) {
      setFeedbackIa({ tipo: 'erro', texto: 'Selecione a unidade (rua / bloco / apto) destinatária da encomenda.' });
      return;
    }
    setSalvando(true);
    setFeedbackIa(null);
    try {
      const r = await api<{ mensagem: string }>('encomenda_registrar_portaria', {
        corpo: {
          unidade_id: unidEscolhida.id,
          usuario_id: moradorId || undefined,
          empresa,
          codigo_rastreio: codigoRastreio || undefined,
          observacoes: observacoes || undefined,
          foto_base64: fotoBase64 || undefined,
        },
      });
      tocarBipScanner();
      onRegistrada(r.mensagem);

      if (modoLote) {
        setMsgSucessoLote(r.mensagem + ' — Pronto para o próximo pacote!');
        setCodigoRastreio('');
        setUnidEscolhida(null);
        setMoradorId(0);
        setBuscaUnid('');
        setObservacoes('');
        setFotoBase64('');
        window.setTimeout(() => inputCodigoRef.current?.focus(), 80);
      } else {
        onFechar();
      }
    } catch (e) {
      setFeedbackIa({ tipo: 'erro', texto: msgErro(e) });
    } finally {
      setSalvando(false);
    }
  };

  const moradoresComApp = unidEscolhida ? unidEscolhida.moradores.filter((m) => m.tem_app) : [];

  return (
    <div
      className="fixed inset-0 z-[270] bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      {scannerAberto && (
        <ScannerCodigoCamera
          titulo="Escanear Código de Barras ou QR da Encomenda"
          subtitulo="Aponte para o código da etiqueta do pacote (Mercado Livre, Shopee, Correios...)"
          onDetectado={(cod) => {
            setScannerAberto(false);
            setCodigoRastreio(cod);
            analisarCodigoOuFoto({ codigo: cod, foto: fotoBase64 || undefined });
          }}
          onFechar={() => setScannerAberto(false)}
        />
      )}

      <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden border-t-[6px] border-t-emerald-500 my-auto">
        {/* Cabeçalho */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              📦 Receber Encomenda na Portaria
            </h2>
            <p className="text-xs text-slate-500">
              Bipe o código de barras/QR, fotografe a etiqueta para leitura automática ou escolha a unidade
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center cursor-pointer shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={salvar} className="p-5 sm:p-6 space-y-4 max-h-[84vh] overflow-y-auto">
          {msgSucessoLote && (
            <div className="p-3 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-extrabold flex items-center gap-2">
              <CheckCircle2 size={16} className="shrink-0 text-emerald-700" />
              <span>{msgSucessoLote}</span>
            </div>
          )}

          {/* BLOCO 1: CAPTURA RÁPIDA POR CÓDIGO DE BARRAS / QR OU FOTO DA ETIQUETA (IA) */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-indigo-700 flex items-center gap-1.5">
                <Sparkles size={14} /> Captura Rápida (Código / QR ou Foto da Etiqueta)
              </span>
              {analisandoIa && (
                <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-indigo-600">
                  <Loader2 size={14} className="animate-spin" /> Lendo etiqueta...
                </span>
              )}
            </div>

            {/* Linha do Leitor Óptico USB + Botão Scanner de Câmera */}
            <div className="flex gap-2 flex-wrap sm:flex-nowrap">
              <div className="relative flex-1 min-w-[200px]">
                <Barcode size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={inputCodigoRef}
                  value={codigoRastreio}
                  onChange={(e) => setCodigoRastreio(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && codigoRastreio.trim()) {
                      e.preventDefault();
                      analisarCodigoOuFoto({ codigo: codigoRastreio.trim() });
                    }
                  }}
                  placeholder="Bipe aqui c/ leitor USB ou digite o código..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 border-slate-200 focus:border-indigo-600 outline-none text-xs sm:text-sm font-mono font-bold bg-white"
                />
              </div>
              <button
                type="button"
                onClick={() => setScannerAberto(true)}
                className="px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer shrink-0 shadow-xs"
                title="Ler Código de Barras ou QR Code usando a câmera do celular ou computador"
              >
                <Barcode size={15} />
                <span>Ler Código / QR</span>
              </button>
            </div>

            {/* Botões de Foto da Etiqueta com Leitura IA */}
            {webcamEtiquetaAberta ? (
              <div className="p-3 rounded-xl bg-slate-900 text-white space-y-2.5">
                <video
                  ref={videoEtiquetaRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full max-h-56 rounded-lg object-contain bg-black"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={pararWebcamEtiqueta}
                    className="px-4 py-2 rounded-lg bg-slate-700 text-xs font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={capturarFotoEtiquetaWebcam}
                    className="flex-1 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black cursor-pointer"
                  >
                    📸 Fotografar Etiqueta e Identificar Morador
                  </button>
                </div>
              </div>
            ) : fotoBase64 ? (
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-emerald-200">
                <img src={fotoBase64} alt="Etiqueta" className="w-14 h-14 rounded-lg object-cover border border-slate-200" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-extrabold text-emerald-800">✅ Foto da etiqueta/pacote anexada</div>
                  <div className="text-[11px] text-slate-500">O morador poderá visualizar esta foto no aplicativo</div>
                </div>
                <button
                  type="button"
                  onClick={() => setFotoBase64('')}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
                >
                  Trocar Foto
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={abrirCameraEtiqueta}
                  className="py-2.5 px-3 rounded-xl bg-white hover:bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Camera size={15} />
                  Fotografar Etiqueta (IA)
                </button>
                <label className="py-2.5 px-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer">
                  <Sparkles size={14} className="text-emerald-600" />
                  Enviar Foto / Celular
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => selecionarArquivoEtiqueta(e.target.files?.[0])}
                  />
                </label>
              </div>
            )}

            {feedbackIa && (
              <div
                className={`p-3 rounded-xl text-xs font-extrabold flex items-center justify-between gap-2 flex-wrap ${
                  feedbackIa.tipo === 'ok'
                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                    : feedbackIa.tipo === 'aviso'
                      ? 'bg-amber-100 text-amber-950 border border-amber-300'
                      : 'bg-rose-100 text-rose-900 border border-rose-300'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {feedbackIa.tipo === 'ok' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                  {feedbackIa.texto}
                </span>
                {feedbackIa.encExistenteId && onAbrirEntregaExistente && (
                  <button
                    type="button"
                    onClick={() => {
                      onFechar();
                      onAbrirEntregaExistente(feedbackIa.encExistenteId!);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-black cursor-pointer"
                  >
                    📤 Dar Baixa Agora
                  </button>
                )}
              </div>
            )}
          </div>

          {/* BLOCO 2: UNIDADE / MORADOR COM CONFIRMAÇÃO VISUAL DE PUSH NO APP */}
          <div>
            <label className="text-xs font-extrabold text-slate-700 uppercase block mb-1.5">
              1. Unidade / Morador Destinatário
            </label>
            {unidEscolhida ? (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border-2 border-emerald-400 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-black text-emerald-950 text-base">{unidEscolhida.label}</div>
                    <div className="text-xs font-semibold text-emerald-800">
                      {unidEscolhida.moradores.length > 0
                        ? `Morador(es): ${unidEscolhida.moradores.map((m) => m.nome).join(', ')}`
                        : 'Unidade sem morador vinculado no App no momento'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setUnidEscolhida(null);
                      setMoradorId(0);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white border border-emerald-300 text-xs font-extrabold text-emerald-800 cursor-pointer"
                  >
                    Trocar
                  </button>
                </div>

                {/* Aviso explícito sobre envio de Push Notification no App do Morador */}
                <div
                  className={`px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 ${
                    moradoresComApp.length > 0
                      ? 'bg-emerald-600 text-white'
                      : 'bg-amber-100 text-amber-900 border border-amber-300'
                  }`}
                >
                  <BellRing size={15} className="shrink-0" />
                  {moradoresComApp.length > 0 ? (
                    <span>
                      📲 Push automático no App será enviado na hora para:{' '}
                      <b>{moradoresComApp.map((m) => m.nome).join(', ')}</b>!
                    </span>
                  ) : unidEscolhida.moradores.length > 0 ? (
                    <span>
                      📱 Ficará disponível no App de <b>{unidEscolhida.moradores.map((m) => m.nome).join(', ')}</b> (aparelho sem Push ativo ainda).
                    </span>
                  ) : (
                    <span>
                      ℹ️ Esta unidade ainda não tem morador com App ativo — o pacote ficará salvo na prateleira da portaria.
                    </span>
                  )}
                </div>

                {unidEscolhida.moradores.length > 1 && (
                  <select
                    value={moradorId}
                    onChange={(e) => setMoradorId(Number(e.target.value))}
                    className="w-full p-2 rounded-xl border border-emerald-300 bg-white text-xs font-bold text-slate-800"
                  >
                    <option value={0}>Notificar todos os moradores da unidade</option>
                    {unidEscolhida.moradores.map((m) => (
                      <option key={m.id} value={m.id}>
                        Somente {m.nome}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ) : (
              <>
                <input
                  value={buscaUnid}
                  onChange={(e) => setBuscaUnid(e.target.value)}
                  placeholder="Ex.: rua 2, 1A 002, 5b 10 ou nome do morador..."
                  className="w-full p-3 rounded-xl border-2 border-slate-200 focus:border-emerald-600 outline-none text-sm font-semibold"
                />
                {gruposRuas.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1">
                    <button
                      type="button"
                      onClick={() => setGrupoRuaAtivo('')}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold border shrink-0 cursor-pointer ${
                        grupoRuaAtivo === ''
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      Todas ({unidades.length})
                    </button>
                    {gruposRuas.map((g) => (
                      <button
                        key={g.chave}
                        type="button"
                        onClick={() => setGrupoRuaAtivo((atual) => (atual === g.chave ? '' : g.chave))}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold border shrink-0 cursor-pointer ${
                          grupoRuaAtivo === g.chave
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50'
                        }`}
                      >
                        {g.label} ({g.total})
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-2 max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {unidadesFiltradas.map((u) => {
                    const qtdApp = u.moradores.filter((m) => m.tem_app).length;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setUnidEscolhida(u);
                          setMoradorId(u.moradores[0]?.id ?? 0);
                        }}
                        className="w-full px-3.5 py-2.5 text-left hover:bg-emerald-50 flex items-center justify-between gap-2 text-xs cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-slate-900 text-sm">{u.label}</span>
                            {qtdApp > 0 && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                                📲 Push App ({qtdApp})
                              </span>
                            )}
                          </div>
                          {u.moradores.length > 0 && (
                            <div className="text-slate-500 truncate">
                              {u.moradores.map((m) => m.nome).join(', ')}
                            </div>
                          )}
                        </div>
                        <span className="font-extrabold text-emerald-600 shrink-0">Selecionar</span>
                      </button>
                    );
                  })}
                  {unidadesFiltradas.length === 0 && (
                    <div className="p-3 text-center text-xs text-slate-400">Nenhuma unidade encontrada.</div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* BLOCO 3: TRANSPORTADORA / LOJA */}
          <div>
            <label className="text-xs font-extrabold text-slate-700 uppercase block mb-1.5">
              2. Transportadora / Origem
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {TRANSPORTADORAS_RAPIDAS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setEmpresa(t === 'Outra' ? '' : t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold border cursor-pointer ${
                    empresa === t
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <input
              required
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              placeholder="Nome da transportadora ou loja..."
              className="w-full p-2.5 rounded-xl border border-slate-300 text-sm font-bold"
            />
          </div>

          {/* BLOCO 4: OBSERVAÇÃO + MODO LOTE */}
          <div>
            <label className="text-xs font-extrabold text-slate-700 uppercase block mb-1">
              Observação (opcional)
            </label>
            <input
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Ex.: Caixa grande, envelope, 2 volumes..."
              className="w-full p-2.5 rounded-xl border border-slate-300 text-sm"
            />
          </div>

          <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={modoLote}
              onChange={(e) => setModoLote(e.target.checked)}
              className="w-4 h-4 accent-emerald-600"
            />
            <Repeat size={14} className="text-emerald-700 shrink-0" />
            <span className="text-xs font-extrabold text-slate-700">
              Modo Lote: manter esta janela aberta após salvar para bipar vários pacotes seguidos
            </span>
          </label>

          {/* RODAPÉ */}
          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={onFechar}
              className="flex-1 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm cursor-pointer"
            >
              Fechar
            </button>
            <button
              type="submit"
              disabled={salvando || !unidEscolhida}
              className="flex-[2] py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 size={18} />
              {salvando ? 'Registrando...' : 'Registrar e Avisar Morador'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
