import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ErroApi } from '../lib/api';

// Paridade com src/controllers/convite_temporada.php + views/convite_temporada.php (pagina publica do hospede).
// Correcoes no backend:
// - Bloqueia links ja usados ou cancelados (o legado aceitava reenvio indefinidamente);
// - Expiracao usa a data de check-out informada pelo morador (o legado usava sempre +7 dias);
// - Valida o tipo MIME real do documento enviado.

function fmtCheckout(s: string): string {
  const dt = new Date(s.replace(' ', 'T'));
  if (Number.isNaN(dt.getTime())) return s;
  const d = dt.toLocaleDateString('pt-BR');
  const h = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${d} às ${h}`;
}

export default function ConviteTemporada() {
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';

  const [carregando, setCarregando] = useState(true);
  const [erroFatal, setErroFatal] = useState('');
  const [nome, setNome] = useState('');
  const [documento, setDocumento] = useState('');
  const [selfieBase64, setSelfieBase64] = useState('');
  const [cameraAberta, setCameraAberta] = useState(false);
  const [arquivoDoc, setArquivoDoc] = useState<File | null>(null);
  const [origemDoc, setOrigemDoc] = useState<'galeria' | 'camera' | null>(null);
  const [erroForm, setErroForm] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ vip: boolean; checkout: string } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galeriaRef = useRef<HTMLInputElement | null>(null);
  const cameraDocRef = useRef<HTMLInputElement | null>(null);

  const pararCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraAberta(false);
  }, []);

  useEffect(() => {
    document.title = 'Pré-cadastro Hóspede - Sectrum';
    if (!token) {
      setErroFatal('Link inválido ou expirado.');
      setCarregando(false);
      return;
    }
    api('convite_temporada_dados', { query: { t: token } })
      .catch((e) => {
        setErroFatal(e instanceof ErroApi ? e.message : 'Convite não encontrado no sistema.');
      })
      .finally(() => setCarregando(false));

    return () => pararCamera();
  }, [token, pararCamera]);

  const abrirCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      setCameraAberta(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch {
      alert('Não foi possível acessar a câmera. Verifique as permissões do navegador.');
    }
  };

  const capturarRosto = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) {
      alert('Aguarde a câmara inicializar corretamente.');
      return;
    }
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    const tmp = document.createElement('canvas');
    tmp.width = vw; tmp.height = vh;
    const tc = tmp.getContext('2d')!;
    tc.translate(vw, 0); tc.scale(-1, 1); tc.drawImage(v, 0, 0);

    const propCaixa = 3 / 4;
    let visW = vw, visH = vh, visX = 0, visY = 0;
    if (vw / vh > propCaixa) {
      visW = Math.round(vh * propCaixa);
      visX = Math.round((vw - visW) / 2);
    } else {
      visH = Math.round(vw / propCaixa);
      visY = Math.round((vh - visH) / 2);
    }
    const cx = visX + Math.round(visW * 0.08);
    const cy = visY + Math.round(visH * 0.06);
    const cw = Math.round(visW * 0.84);
    const ch = Math.round(visH * 0.84);

    const canvas = document.createElement('canvas');
    canvas.width = 360;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(tmp, cx, cy, cw, ch, 0, 0, 360, 480);
    setSelfieBase64(canvas.toDataURL('image/jpeg', 0.82));
    pararCamera();
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroForm('');
    if (!selfieBase64) {
      alert('Por favor, tire a Selfie (Passo 1) antes de enviar.');
      return;
    }
    if (!arquivoDoc) {
      alert('Por favor, escolha uma opção para anexar a Foto do Documento (Passo 2).');
      return;
    }
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append('t', token);
      fd.append('nome_visitante', nome);
      fd.append('documento_numero', documento);
      fd.append('foto_selfie_base64', selfieBase64);
      fd.append('foto_doc', arquivoDoc);

      const resp = await fetch('/api.php?route=convite_temporada_enviar', {
        method: 'POST',
        body: fd,
      });
      const dados = await resp.json();
      if (!resp.ok || dados.status === 'erro') {
        throw new Error(dados.mensagem || 'Erro ao processar as imagens. Verifique se as fotos são válidas e tente novamente.');
      }
      setResultado({ vip: Boolean(dados.vip), checkout: String(dados.checkout ?? '') });
    } catch (err) {
      setErroForm((err as Error)?.message || 'Erro ao enviar os dados.');
    } finally {
      setEnviando(false);
    }
  };

  if (carregando) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-slate-500 font-bold">Carregando...</div>;
  }

  if (erroFatal) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8 text-center">
        <div className="text-slate-700 font-bold text-lg">{erroFatal}</div>
      </div>
    );
  }

  if (resultado) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-[450px] bg-white rounded-3xl px-7 py-10 shadow-xl text-center space-y-5">
          <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center text-3xl font-bold mx-auto">
            ✓
          </div>

          {resultado.vip ? (
            <>
              <h2 className="text-2xl font-extrabold text-slate-900">Acesso VIP Liberado!</h2>
              <p className="text-sm text-slate-600">
                A sua biometria foi registada com sucesso na portaria do condomínio.
              </p>

              <div className="text-left bg-slate-50 rounded-2xl p-5 space-y-4 border border-slate-200">
                <div className="text-xs font-extrabold uppercase text-slate-500 tracking-wider">COMO ENTRAR</div>
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-600 font-bold flex items-center justify-center shrink-0">
                    ✓
                  </span>
                  <div className="text-sm text-slate-600">
                    <strong className="text-slate-900 block">Catraca Facial Ativada</strong>
                    Dirija-se à portaria e posicione o rosto no leitor. A porta abrirá automaticamente para si.
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-600 font-bold flex items-center justify-center shrink-0">
                    ⌚
                  </span>
                  <div className="text-sm text-slate-600">
                    <strong className="text-slate-900 block">Check-out Automático</strong>
                    O seu acesso encerra automaticamente na data do seu check-out ({fmtCheckout(resultado.checkout)}).
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-extrabold text-slate-900">Enviado para Análise!</h2>
              <p className="text-sm text-slate-600">
                Seus dados foram processados com segurança. Veja como funcionará a sua entrada:
              </p>

              <div className="text-left bg-slate-50 rounded-2xl p-5 space-y-4 border border-slate-200">
                <div className="text-xs font-extrabold uppercase text-slate-500 tracking-wider">PRÓXIMOS PASSOS</div>
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-full bg-violet-100 text-violet-600 font-bold flex items-center justify-center shrink-0">
                    1
                  </span>
                  <div className="text-sm text-slate-600">
                    <strong className="text-slate-900 block">Aprovação do Anfitrião</strong>
                    A administração ou o morador responsável irão revisar o seu pré-cadastro no sistema.
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-full bg-violet-100 text-violet-600 font-bold flex items-center justify-center shrink-0">
                    2
                  </span>
                  <div className="text-sm text-slate-600">
                    <strong className="text-slate-900 block">Chegada na Portaria</strong>
                    Ao chegar no condomínio, dirija-se à guarita e identifique-se informando o seu CPF.
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-full bg-violet-100 text-violet-600 font-bold flex items-center justify-center shrink-0">
                    3
                  </span>
                  <div className="text-sm text-slate-600">
                    <strong className="text-slate-900 block">Validação de Documento</strong>
                    Tenha em mãos o <strong>documento original</strong> enviado neste cadastro para a liberação final pelo porteiro.
                  </div>
                </div>
              </div>
            </>
          )}

          <p className="text-xs text-slate-400 pt-2">
            Você já pode fechar esta página. Desejamos uma excelente estadia!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-[500px] mx-auto space-y-5">
        <div className="text-center">
          <h2 className="text-2xl font-extrabold text-slate-900">Pré-cadastro de Hóspede</h2>
          <p className="text-sm text-slate-500 mt-1">
            O morador solicitou seus dados para liberar seu acesso à portaria.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 border-t-4 border-t-violet-500 p-6 shadow-sm">
          {erroForm && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold">
              ⚠️ {erroForm}
            </div>
          )}

          <form onSubmit={enviar} className="space-y-5">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">Seu Nome Completo *</label>
              <input
                type="text"
                name="nome_visitante"
                required
                placeholder="Digite exatamente como no documento"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full p-3.5 rounded-[10px] border border-slate-200 outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                Nº do Documento (CPF ou RG) *
              </label>
              <input
                type="text"
                name="documento_numero"
                required
                placeholder="Apenas números"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                className="w-full p-3.5 rounded-[10px] border border-slate-200 outline-none focus:border-violet-500"
              />
            </div>

            {/* Bloco 1 — Selfie */}
            <div className="rounded-xl bg-purple-50/70 border-2 border-dashed border-purple-300 p-4 text-center space-y-3">
              <div className="text-sm font-extrabold text-violet-700">📷 1. Selfie (Biometria Facial) *</div>
              <p className="text-xs text-slate-600">
                Centralize seu rosto no círculo tracejado. Retire óculos escuros ou bonés.
              </p>

              {!cameraAberta && !selfieBase64 && (
                <button
                  type="button"
                  onClick={abrirCamera}
                  className="px-5 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 text-white text-sm font-bold"
                >
                  Abrir Câmera Frontal
                </button>
              )}

              <div className={cameraAberta ? 'relative w-full aspect-[3/4] rounded-xl overflow-hidden bg-black' : 'hidden'}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                />
                <div className="absolute inset-[12.5%_17.5%] rounded-full border-[2.5px] border-dashed border-emerald-500 shadow-[0_0_0_4000px_rgba(0,0,0,0.65)] pointer-events-none" />
                <button
                  type="button"
                  onClick={capturarRosto}
                  className="absolute bottom-4 inset-x-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold shadow-lg"
                >
                  Capturar Rosto
                </button>
              </div>

              {selfieBase64 && !cameraAberta && (
                <div className="space-y-2">
                  <img
                    src={selfieBase64}
                    alt="Selfie"
                    className="w-[140px] h-[140px] rounded-full object-cover border-[3px] border-emerald-500 mx-auto"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSelfieBase64('');
                      abrirCamera();
                    }}
                    className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold"
                  >
                    Tirar Nova Foto
                  </button>
                </div>
              )}
            </div>

            {/* Bloco 2 — Documento */}
            <div className="rounded-xl bg-slate-50 border-2 border-dashed border-slate-300 p-4 space-y-3">
              <div className="text-sm font-extrabold text-slate-800">📄 2. Foto do Documento (CNH ou RG) *</div>
              <p className="text-xs text-slate-600">
                A foto do documento deve estar <strong>aberta e totalmente legível</strong>.
              </p>

              <input
                ref={galeriaRef}
                type="file"
                name="foto_doc_galeria"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setArquivoDoc(f);
                  setOrigemDoc(f ? 'galeria' : null);
                  if (cameraDocRef.current) cameraDocRef.current.value = '';
                }}
              />
              <input
                ref={cameraDocRef}
                type="file"
                name="foto_doc_camera"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setArquivoDoc(f);
                  setOrigemDoc(f ? 'camera' : null);
                  if (galeriaRef.current) galeriaRef.current.value = '';
                }}
              />

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => galeriaRef.current?.click()}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    origemDoc === 'galeria'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-800'
                  }`}
                >
                  <div className="font-bold text-sm">{origemDoc === 'galeria' ? 'Anexado! ✓' : 'Galeria'}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Escolha a foto da sua galeria e anexe.</div>
                </button>

                <button
                  type="button"
                  onClick={() => cameraDocRef.current?.click()}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    origemDoc === 'camera'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-800'
                  }`}
                >
                  <div className="font-bold text-sm">{origemDoc === 'camera' ? 'Foto Tirada! ✓' : 'Tirar Foto'}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Tirar foto da sua CNH aberta e anexe.</div>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={enviando}
              className="w-full py-4 rounded-xl bg-violet-500 hover:bg-violet-600 text-white text-lg font-extrabold shadow-md disabled:opacity-60"
            >
              {enviando ? '⏳ Aguarde...' : 'Enviar para Análise'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
