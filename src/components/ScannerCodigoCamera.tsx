import { useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, RefreshCw, X } from 'lucide-react';

/** Emite um "bip" curto de leitor óptico de supermercado/logística ao decodificar o código. */
export function tocarBipScanner(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1480, ctx.currentTime);
    gain.gain.setValueAtTime(0.28, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.13);
  } catch {
    /* ignora caso navegador bloqueie áudio */
  }
}

const FORMATOS_SUPORTADOS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
  Html5QrcodeSupportedFormats.PDF_417,
];

export default function ScannerCodigoCamera({
  titulo = 'Aponte para o Código de Barras ou QR Code',
  subtitulo = 'Posicione o código da etiqueta ou do celular dentro da área iluminada',
  onDetectado,
  onFechar,
}: {
  titulo?: string;
  subtitulo?: string;
  onDetectado: (codigo: string) => void;
  onFechar: () => void;
}) {
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const divId = `sectrum-qr-scanner-${reactId}`;
  const [erro, setErro] = useState('');
  const [modoCamera, setModoCamera] = useState<'environment' | 'user'>('environment');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const jaLidoRef = useRef(false);
  const onDetectadoRef = useRef(onDetectado);

  useEffect(() => {
    onDetectadoRef.current = onDetectado;
  });

  useEffect(() => {
    let cancelado = false;
    jaLidoRef.current = false;
    setErro('');

    const inst = new Html5Qrcode(divId, {
      formatsToSupport: FORMATOS_SUPORTADOS,
      verbose: false,
    });
    scannerRef.current = inst;

    inst
      .start(
        { facingMode: modoCamera },
        {
          fps: 12,
          qrbox: { width: 280, height: 170 },
          aspectRatio: 1.333,
        },
        (decodedText) => {
          if (cancelado || jaLidoRef.current) return;
          const limpo = decodedText.trim();
          if (!limpo) return;
          jaLidoRef.current = true;
          tocarBipScanner();
          inst
            .stop()
            .catch(() => {})
            .finally(() => {
              if (!cancelado) onDetectadoRef.current(limpo);
            });
        },
        () => {
          /* frame sem código ainda */
        },
      )
      .catch(() => {
        // Se falhar 'environment' em PC desktop sem câmera traseira, tenta câmera padrão ('user')
        if (!cancelado && modoCamera === 'environment') {
          setModoCamera('user');
        } else if (!cancelado) {
          setErro('Não foi possível acessar a câmera. Verifique a permissão do navegador ou use o leitor USB.');
        }
      });

    return () => {
      cancelado = true;
      if (inst.isScanning) {
        inst
          .stop()
          .then(() => inst.clear())
          .catch(() => {});
      } else {
        try {
          inst.clear();
        } catch {
          /* ignora */
        }
      }
    };
  }, [divId, modoCamera]);

  return (
    <div
      className="fixed inset-0 z-[320] bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full overflow-hidden shadow-2xl text-white">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Camera size={19} />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-sm sm:text-base truncate">{titulo}</h3>
              <p className="text-[11px] text-slate-400 truncate">{subtitulo}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center cursor-pointer shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="rounded-2xl overflow-hidden bg-black border border-slate-800 min-h-[240px] flex items-center justify-center">
            <div id={divId} className="w-full" />
          </div>

          {erro && (
            <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-400/50 text-xs font-bold text-rose-200 text-center">
              {erro}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setModoCamera((m) => (m === 'environment' ? 'user' : 'environment'))}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw size={13} /> Alternar Câmera
            </button>
            <button
              type="button"
              onClick={onFechar}
              className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-xs font-extrabold cursor-pointer"
            >
              Fechar Scanner
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
