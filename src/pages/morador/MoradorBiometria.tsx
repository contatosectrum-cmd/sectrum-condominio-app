import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Shield, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api, ErroApi } from '../../lib/api';
import { cadastrarBiometria, prepararDesafioCadastro, type OpcoesCadastro } from '../../lib/webauthn';
import FotoUsuario from '../../components/FotoUsuario';

// Paridade com src/views/minha_biometria.php + MinhaBiometriaController.php ("Registro Facial").
// Correcoes sobre o legado:
// - Upload de foto tambem atualiza `foto_base64` (no legado syncs futuros reenviavam a foto antiga) e verifica a resposta real;
// - Cadastro WebAuthn funciona de ponta a ponta (no legado chamava funcoes CBOR de um arquivo-closure que nunca era carregado).

interface DadosBio {
  tem_foto: boolean;
  tem_biometria: boolean;
}

export default function MoradorBiometria() {
  const [dados, setDados] = useState<DadosBio | null>(null);
  const [cameraAtiva, setCameraAtiva] = useState(false);
  const [salvandoFoto, setSalvandoFoto] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [versaoFoto, setVersaoFoto] = useState(0);
  const [msgFoto, setMsgFoto] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [cadastrandoBio, setCadastrandoBio] = useState(false);
  const [bioMsg, setBioMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [desafioBio, setDesafioBio] = useState<OpcoesCadastro | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const pararCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraAtiva(false);
  }, []);

  const carregar = useCallback(async () => {
    try {
      const r = await api<DadosBio>('morador_biometria');
      setDados(r);
      prepararDesafioCadastro().then(setDesafioBio).catch(() => {});
    } catch (e) {
      setMsgFoto({ tipo: 'erro', texto: e instanceof ErroApi ? e.message : 'Erro ao carregar dados.' });
    }
  }, []);

  useEffect(() => {
    carregar();
    return () => pararCamera();
  }, [carregar, pararCamera]);

  const abrirCamera = async () => {
    setMsgFoto(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraAtiva(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch (err) {
      const e = err as Error;
      if (e?.name === 'NotAllowedError') {
        alert('Permissão de câmera negada. Habilite nas configurações do navegador.');
      } else {
        alert(`Câmera indisponível: ${e?.message || 'erro desconhecido'}`);
      }
    }
  };

  const capturarESalvar = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) return;
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
    const canvas = document.createElement('canvas');
    canvas.width = 360;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(tmp, visX, visY, visW, visH, 0, 0, 360, 480);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);

    setPreview(dataUrl);
    pararCamera();
    setSalvandoFoto(true);
    setMsgFoto(null);
    try {
      const r = await api<{ mensagem: string }>('morador_foto_salvar', { corpo: { foto_base64: dataUrl } });
      setMsgFoto({ tipo: 'ok', texto: r.mensagem || 'Foto atualizada com sucesso!' });
      setVersaoFoto((n) => n + 1);
      await carregar();
    } catch (e) {
      setMsgFoto({ tipo: 'erro', texto: e instanceof ErroApi ? e.message : 'Erro ao salvar foto.' });
    } finally {
      setSalvandoFoto(false);
    }
  };

  const registrarWebAuthn = async () => {
    if (!window.PublicKeyCredential) {
      setBioMsg({
        tipo: 'erro',
        texto: 'Seu navegador não suporta biometria (WebAuthn). Use Chrome, Safari ou Edge modernos.',
      });
      return;
    }
    setCadastrandoBio(true);
    setBioMsg(null);
    try {
      await cadastrarBiometria(desafioBio);
      setDados((ant) => (ant ? { ...ant, tem_biometria: true } : ant));
      setBioMsg({
        tipo: 'ok',
        texto: '✅ Biometria cadastrada com sucesso! Já pode usar para entrar no app.',
      });
    } catch (err) {
      if (err instanceof ErroApi) {
        setBioMsg({ tipo: 'erro', texto: err.message });
      } else {
        const e = err as Error;
        if (e?.name === 'NotAllowedError') {
          setBioMsg({ tipo: 'erro', texto: 'Operação cancelada ou biometria não reconhecida.' });
        } else if (e?.name === 'InvalidStateError') {
          setBioMsg({ tipo: 'erro', texto: 'Esta biometria já está cadastrada neste aparelho.' });
        } else if (e?.name === 'NotSupportedError') {
          setBioMsg({ tipo: 'erro', texto: 'Seu aparelho não suporta este tipo de autenticação.' });
        } else {
          setBioMsg({ tipo: 'erro', texto: `Erro inesperado: ${e?.message || 'falha desconhecida'}` });
        }
      }
    } finally {
      setCadastrandoBio(false);
      prepararDesafioCadastro().then(setDesafioBio).catch(() => {});
    }
  };

  if (!dados) {
    return <div className="p-10 text-center font-bold text-slate-400">Carregando...</div>;
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      {msgFoto && (
        <div
          className={`px-4 py-3 rounded-xl border text-sm font-semibold ${
            msgFoto.tipo === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}
        >
          {msgFoto.tipo === 'ok' ? `✅ ${msgFoto.texto}` : `⚠️ ${msgFoto.texto}`}
        </div>
      )}

      {/* Card 1 — Foto de Perfil */}
      <div className="bg-white rounded-[14px] border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2 font-extrabold text-slate-900">
          <Camera size={18} className="text-blue-600" />
          <span>Foto de Perfil</span>
        </div>

        <div className="p-6 flex flex-col items-center text-center space-y-4">
          {!cameraAtiva && (
            <div className="w-[110px] h-[110px] rounded-full border-[3px] border-slate-200 flex items-center justify-center overflow-hidden bg-slate-50">
              {preview ? (
                <img src={preview} alt="Foto de perfil" className="w-full h-full object-cover" />
              ) : dados.tem_foto ? (
                <FotoUsuario rota={`morador_foto&v=${versaoFoto}`} temFoto={true} tamanho={110} redonda />
              ) : (
                <span className="text-4xl text-slate-300">📷</span>
              )}
            </div>
          )}

          <div className={cameraAtiva ? 'w-full flex flex-col items-center space-y-3' : 'hidden'}>
            <div className="relative w-full max-w-[280px] aspect-square rounded-xl overflow-hidden bg-slate-900">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
            </div>
            <button
              type="button"
              onClick={capturarESalvar}
              aria-label="Capturar foto"
              className="w-[60px] h-[60px] rounded-full bg-white border-4 border-blue-500 shadow-md active:scale-95 transition-transform"
            />
            <button type="button" onClick={pararCamera} className="text-sm text-slate-400 underline">
              Cancelar
            </button>
          </div>

          <button
            type="button"
            disabled={salvandoFoto}
            onClick={abrirCamera}
            className="w-full py-3 px-4 rounded-[10px] bg-gradient-to-r from-blue-500 to-blue-700 text-white font-bold shadow-sm hover:opacity-95 disabled:opacity-60"
          >
            {salvandoFoto ? 'Salvando…' : 'Tirar / Trocar Foto'}
          </button>

          <p className="text-xs text-slate-400">A foto aparece no sistema do porteiro durante sua entrada.</p>
        </div>
      </div>

      {/* Card 2 — Login por Biometria */}
      <div
        className={`bg-white rounded-[14px] border border-slate-200 border-t-4 shadow-sm overflow-hidden ${
          dados.tem_biometria ? 'border-t-emerald-500' : 'border-t-amber-500'
        }`}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2 font-extrabold text-slate-900">
          <Shield size={18} className={dados.tem_biometria ? 'text-emerald-600' : 'text-amber-500'} />
          <span>Login por Biometria</span>
        </div>

        <div className="p-6 space-y-4">
          {dados.tem_biometria ? (
            <div className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 size={18} className="shrink-0" />
              <span>Biometria cadastrada — você pode entrar com digital ou Face ID</span>
            </div>
          ) : (
            <div className="px-4 py-3 rounded-xl bg-yellow-50 border border-yellow-300 text-yellow-900 text-sm font-semibold flex items-center gap-2">
              <AlertTriangle size={18} className="shrink-0" />
              <span>Nenhuma biometria cadastrada ainda</span>
            </div>
          )}

          <p className="text-sm text-slate-600 leading-relaxed">
            Após o cadastro, você poderá entrar no sistema usando a digital ou reconhecimento facial do seu celular — sem precisar digitar senha.
          </p>

          <button
            type="button"
            disabled={cadastrandoBio}
            onClick={registrarWebAuthn}
            className="w-full py-3 px-4 rounded-[10px] bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold shadow-sm hover:opacity-95 disabled:opacity-60"
          >
            {cadastrandoBio
              ? 'Aguardando biometria…'
              : dados.tem_biometria
              ? 'Recadastrar Biometria'
              : 'Cadastrar Biometria'}
          </button>

          {bioMsg && (
            <div
              id="bio-msg"
              className={`px-4 py-3 rounded-xl border text-sm font-semibold ${
                bioMsg.tipo === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}
            >
              {bioMsg.texto}
            </div>
          )}

          {!dados.tem_biometria && (
            <p className="text-xs text-slate-400">
              Requer navegador compatível com WebAuthn (Chrome, Safari, Edge modernos).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
