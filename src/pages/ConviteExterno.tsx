import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ErroApi } from '../lib/api';

// Paridade com src/controllers/convite_externo.php (pagina publica do visitante, sem login).
// Correcoes sobre o legado:
// - Respeita validade_convite de 24h e nao aceita tokens de temporada;
// - Mantem os dados digitados caso ocorra erro de validacao;
// - Dispara notificacao push ao morador (simulada no laboratorio).

function mascaraCpf(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export default function ConviteExterno() {
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';

  const [carregando, setCarregando] = useState(true);
  const [erroFatal, setErroFatal] = useState<{ msg: string; critico: boolean } | null>(null);
  const [unidade, setUnidade] = useState<string>('');
  const [nome, setNome] = useState('');
  const [documento, setDocumento] = useState('');
  const [fotoBase64, setFotoBase64] = useState('');
  const [cameraAberta, setCameraAberta] = useState(false);
  const [cameraFalhou, setCameraFalhou] = useState(false);
  const [erroForm, setErroForm] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [sucessoMsg, setSucessoMsg] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const pararCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraAberta(false);
  }, []);

  useEffect(() => {
    if (!token) {
      setErroFatal({ msg: 'Erro de Segurança: Link inválido ou ausente.', critico: true });
      setCarregando(false);
      return;
    }
    api<{ unidade: string | null; condominio: string | null; nome_visitante?: string | null; documento?: string | null }>('convite_externo_dados', { query: { t: token } })
      .then((r) => {
        setUnidade(r.unidade ?? '—');
        if (r.nome_visitante && r.nome_visitante !== 'Aguardando Preenchimento') {
          setNome(r.nome_visitante);
        }
        if (r.documento) {
          setDocumento(mascaraCpf(r.documento));
        }
        if (r.condominio) document.title = `Convite de Acesso - ${r.condominio}`;
      })
      .catch((e) => {
        setErroFatal({
          msg: e instanceof ErroApi ? e.message : 'Este convite já foi utilizado, expirou, ou foi cancelado pelo morador.',
          critico: false,
        });
      })
      .finally(() => setCarregando(false));

    return () => pararCamera();
  }, [token, pararCamera]);

  const abrirCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      setCameraAberta(true);
      setCameraFalhou(false);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch {
      alert('Necessário autorizar a câmara para registar o seu rosto.');
      setCameraFalhou(true);
    }
  }, []);

  const aoDigitarCpf = (valor: string) => {
    const m = mascaraCpf(valor);
    setDocumento(m);
    if (m.length === 14 && nome.trim() !== '' && !cameraAberta && !fotoBase64) {
      abrirCamera();
    }
  };

  const tirarSelfie = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) {
      alert('Aguarde a câmara inicializar corretamente.');
      return;
    }
    const vw = v.videoWidth, vh = v.videoHeight;
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
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    setFotoBase64(dataUrl);
    pararCamera();
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroForm('');
    setEnviando(true);
    try {
      const r = await api<{ mensagem: string; unidade: string | null }>('convite_externo_enviar', {
        corpo: { t: token, nome, documento, foto_base64: fotoBase64 },
      });
      if (r.unidade) setUnidade(r.unidade);
      setSucessoMsg(r.mensagem);
    } catch (err) {
      setErroForm(err instanceof ErroApi ? err.message : 'Erro ao enviar o cadastro.');
    } finally {
      setEnviando(false);
    }
  };

  if (carregando) {
    return <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6 text-slate-500 font-bold">Carregando...</div>;
  }

  if (erroFatal) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-12 text-center">
        <h3 className={`text-lg font-bold ${erroFatal.critico ? 'text-red-500' : 'text-slate-500'}`}>{erroFatal.msg}</h3>
      </div>
    );
  }

  if (sucessoMsg) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-[400px] bg-white rounded-[20px] px-6 py-8 shadow-lg text-center space-y-4">
          <div className="text-6xl">✅</div>
          <h2 className="text-2xl font-extrabold text-slate-900">Tudo Certo!</h2>
          <p className="text-slate-600 text-sm leading-relaxed">{sucessoMsg}</p>
          <div className="p-3.5 rounded-xl bg-slate-50 text-xs text-slate-600">
            O morador do <strong>Apto {unidade}</strong> foi notificado da sua chegada.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-[400px] bg-white rounded-[20px] px-6 py-7 shadow-lg text-center space-y-4">
        <span className="inline-block px-3.5 py-1 rounded-full bg-indigo-100 text-indigo-800 text-xs font-bold">
          Destino: Apto {unidade}
        </span>

        <h2 className="text-2xl font-extrabold text-slate-900">Convite Digital</h2>
        <p className="text-sm text-slate-500">
          Preencha os seus dados para registar o seu acesso. A câmara abrirá automaticamente.
        </p>

        {erroForm && (
          <div className="p-3 rounded-xl bg-rose-50 text-red-500 text-sm font-semibold">⚠️ {erroForm}</div>
        )}

        <form onSubmit={enviar} className="space-y-3">
          {!cameraAberta && (
            <>
              <input
                type="text"
                name="nome"
                required
                placeholder="Seu Nome Completo"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full p-4 rounded-xl bg-slate-50 border border-slate-300 text-center font-medium outline-none focus:border-blue-600"
              />
              <input
                type="tel"
                name="documento"
                required
                maxLength={14}
                placeholder="Digite o seu CPF"
                value={documento}
                onChange={(e) => aoDigitarCpf(e.target.value)}
                className="w-full p-4 rounded-xl bg-slate-50 border border-slate-300 text-center font-medium outline-none focus:border-blue-600"
              />
            </>
          )}

          <input type="hidden" name="foto_base64" value={fotoBase64} />

          <div className={cameraAberta ? 'space-y-3' : 'hidden'}>
            <div className="relative w-full max-w-[300px] mx-auto aspect-[3/4] rounded-2xl overflow-hidden bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
              <div className="absolute inset-[15%_15%_25%_15%] rounded-[50%_50%_40%_40%] border-2 border-dashed border-white/80 shadow-[0_0_0_4000px_rgba(0,0,0,0.5)] pointer-events-none" />
              <div className="absolute bottom-3 inset-x-0 text-white text-xs font-bold drop-shadow">
                Alinhe o rosto no tracejado
              </div>
            </div>

            <button
              type="button"
              onClick={tirarSelfie}
              className="w-full py-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold uppercase tracking-wide"
            >
              Tirar Selfie Agora
            </button>
          </div>

          {fotoBase64 && !cameraAberta && (
            <div className="space-y-2">
              <img
                id="foto-tirada"
                src={fotoBase64}
                alt="Selfie capturada"
                className="w-40 h-40 object-cover rounded-2xl border-[3px] border-emerald-500 mx-auto"
                style={{ transform: 'scaleX(-1)' }}
              />
              <button
                type="button"
                onClick={() => {
                  setFotoBase64('');
                  abrirCamera();
                }}
                className="text-xs font-semibold text-slate-500 underline"
              >
                Tirar outra foto
              </button>
            </div>
          )}

          {(cameraFalhou || (!cameraAberta && !fotoBase64)) && (
            <button
              type="button"
              onClick={abrirCamera}
              className="w-full py-3.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold"
            >
              📸 Abrir Câmera
            </button>
          )}

          {fotoBase64 && !cameraAberta && (
            <button
              type="submit"
              disabled={enviando}
              className="w-full py-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold disabled:opacity-60"
            >
              {enviando ? '⏳ Aguarde...' : 'Concluir Cadastro'}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
