import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LogIn, LogOut, Users, DoorOpen, Search, AlertCircle, CalendarDays,
  MessageCircle, X, Eye, Video, RefreshCw, CheckCircle2, Maximize2, Minimize2,
  Volume2, VolumeX, Mic, PhoneCall, PhoneOff, Package, Plus, UserPlus, Ban, Camera, Copy,
  PhoneIncoming, PhoneOutgoing, Settings, Sparkles, Barcode, Car, Unlock, Zap, Lock,
} from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import { obterUrlWsGo2rtc } from '../lib/nativo';
import {
  iniciarConversaBidirecional,
  desbloquearContextoAudioConversa,
  reproduzirUlawNoContexto,
  obterNivelVozRecebida,
  type SessaoConversaBidirecional,
} from '../lib/interfoneAudio';
import { obterToken } from '../lib/sessao';
import FotoUsuario from '../components/FotoUsuario';
import ValidadorCpf from '../components/ValidadorCpf';
import ModalReceberEncomendaInteligente from '../components/ModalReceberEncomendaInteligente';
import ScannerCodigoCamera from '../components/ScannerCodigoCamera';
import BannerAlertaPetsPerdidos from '../components/BannerAlertaPetsPerdidos';
import {
  filtrarUnidadesInteligente,
  listarGruposMacroUnidades,
  textoCasaBuscaInteligente,
} from '../lib/buscaUnidadeInteligente';

// =============================================================================
// TIPOS E UTILITÁRIOS
// =============================================================================

interface Stats {
  entradas_hoje: number;
  saidas_hoje: number;
  dentro_agora: number;
  esperados_hoje?: number;
  encomendas_na_portaria?: number;
}

interface Controlador {
  id: number;
  nome: string;
  tipo_acesso?: string;
  categoria?: 'pedestre' | 'veiculo';
  online?: boolean;
  status?: 'online' | 'offline';
  latencia_ms?: number | null;
  modo_conexao?: string;
  mensagem_status?: string;
}

interface Esperado {
  id: number;
  nome: string;
  cpf: string | null;
  tem_foto: boolean;
  tem_documento?: boolean;
  origem: string;
  tipo_visita?: string | null;
  modo_entrada?: 'pedestre' | 'motorista' | 'ambos' | string | null;
  placa_veiculo?: string | null;
  observacao?: string | null;
  pre_aprovado_morador?: boolean;
  pronto_aceite_direto?: boolean;
  status: string;
  data_entrada?: string | null;
  data_saida?: string | null;
  expira_em?: string | null;
  unidade_id?: number | null;
  unidade_label?: string | null;
  morador_id?: number | null;
  morador_nome: string | null;
  morador_telefone: string | null;
}

interface PresenteVisita {
  id: number;
  nome: string;
  cpf: string | null;
  tem_foto: boolean;
  origem: string;
  tipo_visita?: string | null;
  modo_entrada?: 'pedestre' | 'motorista' | 'ambos' | string | null;
  placa_veiculo?: string | null;
  terminais_liberados?: string | null;
  status: string;
  data_entrada: string | null;
  expira_em: string | null;
  unidade_id?: number | null;
  unidade_label?: string | null;
  morador_nome: string | null;
  morador_telefone?: string | null;
  facial_ativa?: boolean;
}

interface Ativa {
  id: number;
  visita_id?: number | null;
  nome_externo: string | null;
  cpf_externo?: string | null;
  tipo_registro: string | null;
  data_hora: string | null;
  observacao?: string | null;
}

interface ResultadoBusca {
  origem: 'usuario' | 'hospede_temporada' | 'visita_ativa' | 'precadastro' | 'pendente';
  id: number;
  nome: string;
  cpf: string | null;
  tem_foto: boolean;
  unidade_id?: number | null;
  unidade?: string | null;
  morador_nome?: string | null;
  modo_entrada?: string | null;
  placa_veiculo?: string | null;
  status?: string;
  ativo?: boolean;
  excluido?: boolean;
  tem_documento?: boolean;
  data_entrada?: string;
  data_saida?: string;
}

interface MoradorCatalogo {
  id: number;
  nome: string;
  telefone: string | null;
  tem_app: boolean;
}

interface UnidadeCatalogo {
  id: number;
  numero: string;
  bloco_nome: string;
  label: string;
  codigo_discagem: string;
  moradores: MoradorCatalogo[];
}

interface EncomendaItem {
  id: number;
  unidade_id?: number | null;
  usuario_id?: number | null;
  status: string;
  empresa: string;
  codigo_rastreio?: string | null;
  observacoes?: string | null;
  pin_entrega: string | null;
  tem_foto?: boolean;
  exige_codigo?: boolean;
  data_recebimento: string | null;
  data_entrega: string | null;
  unidade_nome: string | null;
  bloco_nome: string | null;
  morador_nome: string | null;
  porteiro_recebeu: string | null;
  porteiro_entregou: string | null;
}

interface SipPortariaInfo {
  servidor: string;
  porta: number;
  transporte: string;
  codec: string;
  ramal: string;
  usuario: string;
  senha: string;
  registrado_online: boolean;
  ip_remoto: string | null;
  porta_remota: number | null;
  user_agent: string | null;
  ultimo_registro: string | null;
  em_chamada_sip: boolean;
}

interface HistoricoChamadaPortaria {
  id: number;
  call_id: string;
  direcao: 'realizada' | 'recebida' | 'interna';
  origem_nome: string;
  destino_unidade_id: number | null;
  destino_nome: string;
  destino_codigo: string;
  status: string;
  duracao_segundos: number;
  atendido_por_nome: string | null;
  data_hora: string;
}

interface ChamadaSaintePortaria {
  call_id: string;
  status: string;
  destino_nome: string;
  destino_codigo: string;
}

interface Aviso {
  tipo: 'ok' | 'erro';
  mensagem: string;
}

const fmtData = (s?: string | null) =>
  s
    ? new Date(s.replace(' ', 'T')).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
const fmtHora = (s?: string | null) =>
  s ? new Date(s.replace(' ', 'T')).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
const soDigitos = (s?: string | null) => (s ? s.replace(/\D/g, '') : '');
const mascaraDoc = (cpf: string | null) => {
  const d = soDigitos(cpf);
  if (d.length === 11) return `${d.slice(0, 3)}.***.***-${d.slice(-2)}`;
  return cpf ? `${cpf.slice(0, 3)}...` : 'Sem CPF';
};
const msgErro = (e: unknown) => (e instanceof ErroApi ? e.message : 'Erro inesperado.');

/** Sinal sonoro curto e agradável (bip duplo ascendente de fechadura eletrônica) ao destravar portão. */
function tocarSomPortaoAberto(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const tocarNota = (freq: number, ini: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + ini);
      gain.gain.setValueAtTime(0.22, ctx.currentTime + ini);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ini + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + ini);
      osc.stop(ctx.currentTime + ini + dur + 0.01);
    };
    tocarNota(784, 0, 0.09);
    tocarNota(1175, 0.1, 0.14);
  } catch {
    /* ignora caso navegador bloqueie áudio */
  }
}

// Gera tom telefônico suave ("tuuu... tuuu...") enquanto a Portaria chama um apartamento
let audioPulsoPortariaEl: HTMLAudioElement | null = null;
function obterAudioPulsoPortaria(): HTMLAudioElement {
  if (!audioPulsoPortariaEl) {
    const sr = 8000;
    const dur = 4.5;
    const total = Math.floor(sr * dur);
    const buf = new ArrayBuffer(44 + total * 2);
    const v = new DataView(buf);
    const ws = (o: number, s: string) => {
      for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
    };
    ws(0, 'RIFF');
    v.setUint32(4, 36 + total * 2, true);
    ws(8, 'WAVE');
    ws(12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, sr, true);
    v.setUint32(28, sr * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    ws(36, 'data');
    v.setUint32(40, total * 2, true);
    for (let i = 0; i < total; i++) {
      const t = i / sr;
      const s = t <= 1.0 ? Math.sin(2 * Math.PI * 425 * t) * 0.35 : 0;
      v.setInt16(44 + i * 2, Math.floor(s * 32767), true);
    }
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
    audioPulsoPortariaEl = new Audio('data:audio/wav;base64,' + window.btoa(bin));
    audioPulsoPortariaEl.loop = true;
  }
  return audioPulsoPortariaEl;
}

// =============================================================================
// COMPONENTE AUXILIAR: CAPTURA DE FOTO PELA WEBCAM OU ARQUIVO
// =============================================================================

function CapturadorFotoPortaria({
  fotoBase64,
  onFotoChange,
  rotulo = 'Capturar Foto na Webcam',
}: {
  fotoBase64: string;
  onFotoChange: (b64: string) => void;
  rotulo?: string;
}) {
  const [cameraAberta, setCameraAberta] = useState(false);
  const [erroWebcam, setErroWebcam] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const pararStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraAberta(false);
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const abrirWebcam = async () => {
    setErroWebcam('');
    try {
      const st = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = st;
      setCameraAberta(true);
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = st;
          videoRef.current.play().catch(() => {});
        }
      }, 60);
    } catch {
      setErroWebcam('Webcam não encontrada ou bloqueada. Use "Escolher Imagem" ao lado.');
    }
  };

  const baterFoto = () => {
    const v = videoRef.current;
    if (!v || v.videoWidth === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    onFotoChange(canvas.toDataURL('image/jpeg', 0.82));
    pararStream();
  };

  const lerArquivo = (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') onFotoChange(reader.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-2">
      {fotoBase64 ? (
        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
          <img src={fotoBase64} alt="Foto capturada" className="w-16 h-16 rounded-xl object-cover border border-emerald-300" />
          <div className="flex-1 text-xs font-bold text-emerald-800">✅ Foto pronta para liberação facial</div>
          <button
            type="button"
            onClick={() => onFotoChange('')}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-600 cursor-pointer"
          >
            Trocar
          </button>
        </div>
      ) : cameraAberta ? (
        <div className="p-3 rounded-xl bg-slate-900 text-white space-y-2.5">
          <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-52 rounded-lg object-contain bg-black" />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={pararStream}
              className="px-4 py-2 rounded-lg bg-slate-700 text-xs font-bold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={baterFoto}
              className="flex-1 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-extrabold cursor-pointer"
            >
              📸 Capturar Foto Agora
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={abrirWebcam}
            className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-xs font-extrabold text-slate-700 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Camera size={15} />
            {rotulo}
          </button>
          <label className="py-2.5 px-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-xs font-bold text-slate-600 flex items-center justify-center gap-1.5 cursor-pointer">
            Escolher Arquivo
            <input type="file" accept="image/*" className="hidden" onChange={(e) => lerArquivo(e.target.files?.[0])} />
          </label>
        </div>
      )}
      {erroWebcam && <div className="text-xs font-semibold text-amber-700">{erroWebcam}</div>}
    </div>
  );
}

// =============================================================================
// MODAL DE CÂMERA AO VIVO DO LEITOR FACIAL + CONVERSA NA PORTA (PRESERVADO 100%)
// =============================================================================

function ModalCameraPorta({
  controlador,
  onFechar,
  onPortaAberta,
}: {
  controlador: Controlador;
  onFechar: () => void;
  onPortaAberta: (aviso: Aviso) => void;
}) {
  const [stream, setStream] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [horarioSnap, setHorarioSnap] = useState<string>('');
  const [modoVideo, setModoVideo] = useState<'rtc' | 'snapshot'>('rtc');
  const [videoPronto, setVideoPronto] = useState(false);
  const [audioAtivo, setAudioAtivo] = useState(true);
  const [carregandoCam, setCarregandoCam] = useState(true);
  const [erroCam, setErroCam] = useState('');
  const [abrindo, setAbrindo] = useState(false);
  const [msgModal, setMsgModal] = useState<Aviso | null>(null);
  const [conversaAtiva, setConversaAtiva] = useState(false);
  const [transmitindoVoz, setTransmitindoVoz] = useState(false);
  const [nivelVoz, setNivelVoz] = useState(0);
  const [msgVoz, setMsgVoz] = useState<Aviso | null>(null);
  const rtcContainerRef = useRef<HTMLDivElement | null>(null);
  const sessaoConversaRef = useRef<SessaoConversaBidirecional | null>(null);
  const filaEnvioRef = useRef<Promise<void>>(Promise.resolve());
  const pacotesPendentesRef = useRef<number>(0);
  const audioAntesVozRef = useRef<boolean>(true);

  const buscarSnapshot = useCallback(async () => {
    try {
      const r = await api<{ imagem: string; horario: string }>('portaria_camera_snapshot', {
        query: { terminal_id: controlador.id },
      });
      setSnapshot(r.imagem);
      setHorarioSnap(r.horario);
      setErroCam('');
      setCarregandoCam(false);
    } catch (e) {
      setErroCam(msgErro(e));
      setCarregandoCam(false);
    }
  }, [controlador.id]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onFechar]);

  useEffect(() => {
    let ativo = true;
    setCarregandoCam(true);
    setErroCam('');
    setSnapshot(null);
    setStream(null);
    setVideoPronto(false);
    setModoVideo('rtc');
    setMsgModal(null);

    api<{ imagem: string; horario: string }>('portaria_camera_snapshot', {
      query: { terminal_id: controlador.id },
    })
      .then((r) => {
        if (!ativo) return;
        setSnapshot(r.imagem);
        setHorarioSnap(r.horario);
        setErroCam('');
        setCarregandoCam(false);
      })
      .catch((e) => {
        if (!ativo) return;
        setErroCam(msgErro(e));
        setCarregandoCam(false);
      });

    api<{ stream: string }>('portaria_camera_stream', {
      query: { terminal_id: controlador.id },
    })
      .then((r) => {
        if (!ativo) return;
        setStream(r.stream);
      })
      .catch((e) => {
        if (!ativo) return;
        setModoVideo('snapshot');
        setErroCam((atual) => atual || msgErro(e));
      });

    return () => {
      ativo = false;
    };
  }, [controlador.id]);

  useEffect(() => {
    if (modoVideo !== 'rtc' || !stream) {
      setVideoPronto(false);
      return;
    }
    const container = rtcContainerRef.current;
    if (!container) return;

    let limpo = false;
    let videoEl: HTMLVideoElement | null = null;

    const aoTocar = () => {
      if (limpo || !videoEl) return;
      if (videoEl.readyState >= 2 && videoEl.videoWidth > 0) {
        setVideoPronto(true);
        setCarregandoCam(false);
        setErroCam('');
        setAudioAtivo(!videoEl.muted && videoEl.volume > 0);
      }
    };

    const aoMudarVolume = () => {
      if (!videoEl) return;
      setAudioAtivo(!videoEl.muted && videoEl.volume > 0);
    };

    const aoPausar = () => {
      if (limpo || !videoEl) return;
      if (!document.hidden && videoEl.paused) {
        videoEl.play().catch(() => {});
      }
    };

    let ultimoTempo = -1;
    let ultimoAvancoEm = Date.now();

    const timerBusca = window.setInterval(() => {
      const v = container.querySelector('video');
      if (v && v !== videoEl) {
        videoEl = v;
        ultimoTempo = v.currentTime;
        ultimoAvancoEm = Date.now();
        v.muted = false;
        v.volume = 1.0;
        setAudioAtivo(!v.muted && v.volume > 0);
        v.addEventListener('loadeddata', aoTocar);
        v.addEventListener('playing', aoTocar);
        v.addEventListener('timeupdate', aoTocar);
        v.addEventListener('volumechange', aoMudarVolume);
        v.addEventListener('pause', aoPausar);
        if (v.readyState >= 2 && v.videoWidth > 0) aoTocar();
      }
      if (v && !document.hidden && v.readyState >= 2 && v.videoWidth > 0) {
        if (v.buffered && v.buffered.length > 0) {
          const fim = v.buffered.end(v.buffered.length - 1);
          if (fim - v.currentTime > 1.8) v.currentTime = fim - 0.15;
        }
        if (Math.abs(v.currentTime - ultimoTempo) > 0.01) {
          ultimoTempo = v.currentTime;
          ultimoAvancoEm = Date.now();
        } else if (Date.now() - ultimoAvancoEm > 5000) {
          ultimoAvancoEm = Date.now();
          const rtcEl = container.querySelector('video-rtc') as (HTMLElement & {
            ondisconnect?: () => void;
            onconnect?: () => void;
          }) | null;
          if (rtcEl?.ondisconnect && rtcEl?.onconnect) {
            rtcEl.ondisconnect();
            rtcEl.onconnect();
          }
        }
      }
    }, 250);

    return () => {
      limpo = true;
      window.clearInterval(timerBusca);
      if (videoEl) {
        videoEl.removeEventListener('loadeddata', aoTocar);
        videoEl.removeEventListener('playing', aoTocar);
        videoEl.removeEventListener('timeupdate', aoTocar);
        videoEl.removeEventListener('volumechange', aoMudarVolume);
        videoEl.removeEventListener('pause', aoPausar);
      }
    };
  }, [modoVideo, stream]);

  useEffect(() => {
    if (modoVideo === 'rtc' && videoPronto) return;
    const intervalo = erroCam && !snapshot ? 3500 : 1800;
    const timer = window.setInterval(() => {
      if (!document.hidden) buscarSnapshot();
    }, intervalo);
    return () => window.clearInterval(timer);
  }, [modoVideo, videoPronto, erroCam, snapshot, buscarSnapshot]);

  const alternarAudio = () => {
    const rtcEl = rtcContainerRef.current?.querySelector('video-rtc') as (HTMLElement & { _userMuted?: boolean }) | null;
    const v = rtcContainerRef.current?.querySelector('video');
    if (!v) return;
    const novoAtivo = v.muted || v.volume === 0;
    audioAntesVozRef.current = novoAtivo;
    if (rtcEl) rtcEl._userMuted = !novoAtivo;
    v.muted = !novoAtivo;
    if (novoAtivo) {
      v.volume = 1.0;
      v.play().catch(() => {});
    }
    setAudioAtivo(novoAtivo);
  };

  const manterAudioCameraAtivo = useCallback(() => {
    if (!audioAntesVozRef.current) return;
    const rtcEl = rtcContainerRef.current?.querySelector('video-rtc') as (HTMLElement & { _userMuted?: boolean }) | null;
    const v = rtcContainerRef.current?.querySelector('video');
    if (!v) return;
    if (rtcEl) rtcEl._userMuted = false;
    v.muted = false;
    v.volume = 1.0;
    if (v.paused) v.play().catch(() => {});
    setAudioAtivo(true);
  }, []);

  useEffect(() => {
    return () => {
      sessaoConversaRef.current?.encerrar();
      sessaoConversaRef.current = null;
    };
  }, []);

  const enfileirarTrechoVoz = useCallback(
    (audioBase64: string) => {
      if (!controlador.id || !audioBase64) return;
      pacotesPendentesRef.current += 1;
      setTransmitindoVoz(true);
      manterAudioCameraAtivo();

      filaEnvioRef.current = filaEnvioRef.current
        .then(async () => {
          try {
            await api<{ mensagem: string }>('portaria_camera_falar', {
              corpo: {
                terminal_id: controlador.id,
                audio_base64: audioBase64,
                audio_ulaw: audioBase64,
              },
            });
          } catch (e) {
            setMsgVoz({
              tipo: 'erro',
              mensagem: e instanceof ErroApi ? e.message : 'Falha ao reproduzir voz na porta.',
            });
          } finally {
            pacotesPendentesRef.current = Math.max(0, pacotesPendentesRef.current - 1);
            if (pacotesPendentesRef.current === 0) setTransmitindoVoz(false);
            manterAudioCameraAtivo();
          }
        })
        .catch(() => {});
    },
    [controlador.id, manterAudioCameraAtivo],
  );

  const comecarConversa = async () => {
    if (conversaAtiva || !controlador.id) return;
    desbloquearContextoAudioConversa();
    setMsgVoz(null);
    audioAntesVozRef.current = true;
    manterAudioCameraAtivo();
    try {
      const sessao = await iniciarConversaBidirecional({
        onNivelVoz: (n) => setNivelVoz(n),
        onTrechoVoz: (b64) => enfileirarTrechoVoz(b64),
      });
      sessaoConversaRef.current = sessao;
      setConversaAtiva(true);
      manterAudioCameraAtivo();
    } catch (e) {
      setConversaAtiva(false);
      setMsgVoz({
        tipo: 'erro',
        mensagem: e instanceof Error ? e.message : 'Permita o acesso ao microfone para conversar com a porta.',
      });
    }
  };

  useEffect(() => {
    if (!conversaAtiva || !controlador.id) return;
    let cancelado = false;
    let cursor = 0;
    let emRequisicao = false;

    const buscarAudioPorta = async () => {
      if (cancelado || emRequisicao) return;
      emRequisicao = true;
      try {
        const r = await api<{ ok: boolean; audio_b64: string; cursor: number }>('portaria_camera_escutar', {
          query: { terminal_id: controlador.id, cursor },
        });
        if (cancelado) return;
        if (typeof r.cursor === 'number' && r.cursor > 0) cursor = r.cursor;
        if (r.ok && r.audio_b64 && audioAntesVozRef.current) reproduzirUlawNoContexto(r.audio_b64);
      } catch {
        // Ignora
      } finally {
        emRequisicao = false;
      }
    };

    const tIni = window.setTimeout(buscarAudioPorta, 350);
    const timer = window.setInterval(buscarAudioPorta, 220);
    return () => {
      cancelado = true;
      window.clearTimeout(tIni);
      window.clearInterval(timer);
    };
  }, [conversaAtiva, controlador.id]);

  const fecharConversa = () => {
    const sessao = sessaoConversaRef.current;
    sessaoConversaRef.current = null;
    setConversaAtiva(false);
    setNivelVoz(0);
    sessao?.encerrar();
    manterAudioCameraAtivo();
  };

  const tentarNovamente = () => {
    (window as unknown as { __sectrumBlessVideo?: () => void }).__sectrumBlessVideo?.();
    setCarregandoCam(true);
    setErroCam('');
    setVideoPronto(false);
    buscarSnapshot();
    api<{ stream: string }>('portaria_camera_stream', {
      query: { terminal_id: controlador.id },
    })
      .then((r) => {
        setStream(r.stream);
        setModoVideo('rtc');
      })
      .catch(() => {
        setModoVideo('snapshot');
      });
  };

  const confirmarAbertura = async () => {
    setAbrindo(true);
    setMsgModal(null);
    try {
      const r = await api<{ mensagem: string; hardware?: { modo: string } }>('portaria_abrir', {
        corpo: { terminal_id: controlador.id },
      });
      const simulado = r.hardware?.modo === 'simulado' ? ' (modo SIMULADO)' : '';
      const avisoOk: Aviso = { tipo: 'ok', mensagem: `${r.mensagem}${simulado}` };
      setMsgModal(avisoOk);
      onPortaAberta(avisoOk);
    } catch (e) {
      setMsgModal({ tipo: 'erro', mensagem: msgErro(e) });
    } finally {
      setAbrindo(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[250] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border-t-[6px] border-t-emerald-500">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
              <DoorOpen size={22} />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold text-slate-900 truncate flex items-center gap-2">
                {controlador.nome}
                <span className="inline-flex items-center gap-1.5 text-[0.7rem] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Câmera Ao Vivo
                </span>
              </h2>
              <p className="text-xs text-slate-500">Verifique a porta pela câmera antes de confirmar a abertura</p>
            </div>
          </div>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 bg-slate-50">
          <div className="relative w-full aspect-[4/3] max-h-[420px] bg-slate-950 rounded-xl overflow-hidden shadow-inner border border-slate-800 flex items-center justify-center">
            {snapshot && <img src={snapshot} alt={`Câmera de ${controlador.nome}`} className="w-full h-full object-contain select-none" />}
            {modoVideo === 'rtc' && stream && (
              <div
                ref={rtcContainerRef}
                className={`absolute inset-0 transition-opacity duration-200 ${videoPronto ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              >
                <video-rtc
                  src={obterUrlWsGo2rtc(stream)}
                  mode="webrtc,mse,hls,mjpeg"
                  media="video,audio"
                  autoplay
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>
            )}
            {carregandoCam && !snapshot && !videoPronto && (
              <div className="flex flex-col items-center gap-3 text-slate-300">
                <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                <span className="text-sm font-semibold">Conectando à câmera de {controlador.nome}...</span>
              </div>
            )}
            {!carregandoCam && !snapshot && !videoPronto && erroCam && (
              <div className="flex flex-col items-center gap-2 text-center px-6 text-slate-400">
                <AlertCircle size={38} className="text-amber-400 mb-1" />
                <span className="font-bold text-slate-200 text-sm">Não foi possível obter a imagem da câmera</span>
                <span className="text-xs text-slate-400 max-w-md">{erroCam}</span>
                <button
                  type="button"
                  onClick={tentarNovamente}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold cursor-pointer"
                >
                  <RefreshCw size={13} /> Tentar Novamente
                </button>
              </div>
            )}
            <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
              {modoVideo === 'rtc' && videoPronto && (
                <button
                  type="button"
                  onClick={alternarAudio}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border flex items-center gap-1.5 cursor-pointer ${
                    audioAtivo ? 'bg-emerald-600/90 text-white border-emerald-400/40' : 'bg-amber-600/90 text-white border-amber-400/40'
                  }`}
                >
                  {audioAtivo ? <Volume2 size={13} /> : <VolumeX size={13} />}
                  {audioAtivo ? 'Som Ativo' : 'Ativar Som'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setModoVideo((m) => (m === 'rtc' ? 'snapshot' : 'rtc'))}
                className="px-2.5 py-1 rounded-lg bg-slate-900/80 text-white text-xs font-bold border border-white/15 flex items-center gap-1.5 cursor-pointer"
              >
                <Video size={13} className="text-emerald-400" />
                {modoVideo === 'rtc' && videoPronto ? 'Ao Vivo' : `Foto (${horarioSnap || '1s'})`}
              </button>
            </div>
          </div>

          <div className="mt-3 p-3 rounded-xl bg-white border border-slate-200 flex flex-col gap-2">
            {!conversaAtiva ? (
              <button
                type="button"
                onClick={comecarConversa}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <PhoneCall size={18} /> 📞 Falar no Alto-Falante da Porta
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center gap-2.5">
                  <Mic size={16} className="text-indigo-600 shrink-0" />
                  <div className="flex-1">
                    <div className="text-xs font-extrabold text-indigo-950">
                      {transmitindoVoz ? '🔊 Transmitindo voz na porta...' : '🎙️ Conversa Ativa — Fale normalmente'}
                    </div>
                    <div className="mt-1 w-full h-1.5 bg-indigo-200 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.max(8, nivelVoz)}%` }} />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={fecharConversa}
                  className="py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <PhoneOff size={15} /> Encerrar
                </button>
              </div>
            )}
            {msgVoz && <div className="text-xs font-bold text-rose-700">{msgVoz.mensagem}</div>}
          </div>

          {msgModal && (
            <div
              className={`mt-3 px-4 py-3 rounded-xl border flex items-center gap-2 text-sm font-bold ${
                msgModal.tipo === 'ok' ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-rose-50 border-rose-300 text-rose-800'
              }`}
            >
              {msgModal.tipo === 'ok' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span>{msgModal.mensagem}</span>
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={onFechar}
              className="px-6 py-3.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-sm cursor-pointer"
            >
              Fechar
            </button>
            <button
              type="button"
              disabled={abrindo}
              onClick={confirmarAbertura}
              className="flex-1 py-3.5 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-base sm:text-lg shadow-lg cursor-pointer disabled:opacity-60"
            >
              {abrindo ? '⏳ Enviando comando...' : '🔓 CONFIRMAR E ABRIR PORTA'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MODAL DE LIGAÇÃO DE SAÍDA DA PORTARIA -> MORADOR (NAVEGADOR FULL-DUPLEX)
// =============================================================================

function ModalLigacaoPortariaSainte({
  chamada,
  onEncerrar,
}: {
  chamada: ChamadaSaintePortaria;
  onEncerrar: () => void;
}) {
  const [status, setStatus] = useState(chamada.status || 'ringing');
  const [segundos, setSegundos] = useState(0);
  const [mudo, setMudo] = useState(false);
  const [nivelMic, setNivelMic] = useState(0);
  const [nivelRemoto, setNivelRemoto] = useState(0);
  const [erroMic, setErroMic] = useState('');
  const mudoRef = useRef(false);
  const sessaoMicRef = useRef<SessaoConversaBidirecional | null>(null);
  const enviosRef = useRef(0);

  useEffect(() => {
    mudoRef.current = mudo;
  }, [mudo]);

  // Pulso sonoro enquanto está chamando ('ringing')
  useEffect(() => {
    const el = obterAudioPulsoPortaria();
    if (status !== 'ringing') {
      el.pause();
      el.currentTime = 0;
      return;
    }
    el.volume = 0.7;
    el.play().catch(() => undefined);
    return () => {
      el.pause();
      el.currentTime = 0;
    };
  }, [status]);

  // Cronômetro quando atendida
  useEffect(() => {
    if (status !== 'answered') return;
    const t = window.setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [status]);

  // Microfone Full-Duplex quando o morador atende
  useEffect(() => {
    if (status !== 'answered') return;
    let cancelado = false;
    desbloquearContextoAudioConversa();

    iniciarConversaBidirecional({
      modoFullDuplex: true,
      onNivelVoz: (n) => {
        if (!cancelado) setNivelMic(mudoRef.current ? 0 : n);
      },
      onTrechoVoz: (b64) => {
        if (cancelado || mudoRef.current || !b64 || enviosRef.current >= 2) return;
        enviosRef.current += 1;
        api('portaria_interfone_app_falar', {
          corpo: { call_id: chamada.call_id, audio_base64: b64 },
        })
          .catch(() => {})
          .finally(() => {
            enviosRef.current = Math.max(0, enviosRef.current - 1);
          });
      },
    })
      .then((s) => {
        if (cancelado) {
          s.encerrar();
          return;
        }
        sessaoMicRef.current = s;
      })
      .catch((e) => {
        if (!cancelado) setErroMic(e instanceof Error ? e.message : 'Permita o microfone no navegador.');
      });

    return () => {
      cancelado = true;
      sessaoMicRef.current?.encerrar();
      sessaoMicRef.current = null;
    };
  }, [status, chamada.call_id]);

  // Loop de escuta e acompanhamento de status (a cada 140ms)
  useEffect(() => {
    let cancelado = false;
    let cursor = 0;
    let emReq = false;

    const ciclo = async () => {
      if (cancelado || emReq) return;
      emReq = true;
      try {
        const r = await api<{ ok: boolean; cursor: number; audio_b64: string; call_status?: string }>(
          'portaria_interfone_app_escutar',
          { query: { call_id: chamada.call_id, cursor } },
        );
        if (cancelado) return;
        if (typeof r.cursor === 'number' && r.cursor > 0) cursor = r.cursor;
        if (r.ok && r.audio_b64) {
          reproduzirUlawNoContexto(r.audio_b64);
          setNivelRemoto(obterNivelVozRecebida());
        }
        if (r.call_status && r.call_status !== status) {
          setStatus(r.call_status);
        }
      } catch {
        // Ignora
      } finally {
        emReq = false;
      }
    };

    const timer = window.setInterval(ciclo, 140);
    return () => {
      cancelado = true;
      window.clearInterval(timer);
    };
  }, [chamada.call_id, status]);

  // Fecha automaticamente quando encerrada/recusada pelo morador
  useEffect(() => {
    if (['rejected', 'ended', 'missed', 'canceled'].includes(status)) {
      const t = window.setTimeout(onEncerrar, 1600);
      return () => window.clearTimeout(t);
    }
  }, [status, onEncerrar]);

  const desligar = async () => {
    sessaoMicRef.current?.encerrar();
    sessaoMicRef.current = null;
    await api('portaria_interfone_sinalizar', {
      corpo: {
        call_id: chamada.call_id,
        device_id: 'APT:0',
        acao: status === 'ringing' ? 'cancel' : 'hangUp',
      },
    }).catch(() => undefined);
    onEncerrar();
  };

  const fmtTempo = `${String(Math.floor(segundos / 60)).padStart(2, '0')}:${String(segundos % 60).padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-[9998] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border-2 border-indigo-500/70 rounded-3xl max-w-md w-full p-6 text-white text-center space-y-5 shadow-2xl">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 text-xs font-extrabold uppercase">
          <span className={`w-2 h-2 rounded-full ${status === 'answered' ? 'bg-emerald-400 animate-ping' : 'bg-amber-400 animate-ping'}`} />
          Interfone da Portaria
        </div>

        <div>
          <h2 className="text-2xl font-black">{chamada.destino_nome}</h2>
          <p className={`text-sm font-extrabold mt-1 ${status === 'answered' ? 'text-emerald-400' : status === 'ringing' ? 'text-amber-300' : 'text-rose-400'}`}>
            {status === 'ringing'
              ? '🔊 Chamando celular do morador...'
              : status === 'answered'
                ? `🟢 Em conversa • ${fmtTempo}`
                : status === 'rejected'
                  ? 'Chamada recusada / ocupado'
                  : status === 'missed'
                    ? 'Morador não atendeu'
                    : 'Chamada encerrada'}
          </p>
        </div>

        <div className="py-3 flex justify-center">
          <div className="relative flex items-center justify-center">
            {(status === 'ringing' || status === 'answered') && (
              <span className="absolute w-28 h-28 rounded-full bg-indigo-500/20 animate-ping" />
            )}
            <div className="relative w-20 h-20 rounded-full bg-indigo-600/30 border-2 border-indigo-400 flex items-center justify-center text-indigo-200">
              <PhoneCall size={36} className={status === 'ringing' ? 'animate-bounce' : ''} />
            </div>
          </div>
        </div>

        {status === 'answered' && (
          <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-3.5 space-y-2 text-left text-xs">
            <div>
              <div className="flex justify-between font-bold text-slate-300 mb-1">
                <span>🎙️ Microfone da Portaria</span>
                <span className="text-emerald-400">{mudo ? 'Mudo' : 'Ativo'}</span>
              </div>
              <div className="h-2 bg-slate-950 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-400 transition-all" style={{ width: `${Math.max(6, nivelMic)}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between font-bold text-slate-300 mb-1">
                <span>🔊 Voz do Morador</span>
              </div>
              <div className="h-2 bg-slate-950 rounded-full overflow-hidden">
                <div className="h-full bg-sky-400 transition-all" style={{ width: `${Math.max(6, nivelRemoto)}%` }} />
              </div>
            </div>
          </div>
        )}

        {erroMic && <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-400 text-xs font-bold text-rose-200">{erroMic}</div>}

        <div className="flex items-center justify-center gap-3 pt-2">
          {status === 'answered' && (
            <button
              type="button"
              onClick={() => setMudo((v) => !v)}
              className={`px-5 py-3.5 rounded-2xl font-extrabold text-sm flex items-center gap-2 cursor-pointer ${
                mudo ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
              }`}
            >
              {mudo ? <VolumeX size={18} /> : <Mic size={18} />}
              {mudo ? 'Ativar Mic' : 'Silenciar'}
            </button>
          )}
          <button
            type="button"
            onClick={desligar}
            className="flex-1 py-3.5 px-6 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer"
          >
            <PhoneOff size={18} />
            {status === 'ringing' ? 'Cancelar Chamada' : 'Desligar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// PÁGINA PRINCIPAL: TERMINAL OPERACIONAL UNIFICADO DA PORTARIA
// =============================================================================

export default function Portaria() {
  const [abaAtiva, setAbaAtiva] = useState<'visitantes' | 'encomendas' | 'interfone'>('visitantes');
  const [stats, setStats] = useState<Stats>({ entradas_hoje: 0, saidas_hoje: 0, dentro_agora: 0 });
  const [modulos, setModulos] = useState<{ encomendas: boolean; interfone: boolean }>({ encomendas: true, interfone: true });
  const [controladores, setControladores] = useState<Controlador[]>([]);
  const [esperados, setEsperados] = useState<Esperado[]>([]);
  const [presentesVisitas, setPresentesVisitas] = useState<PresenteVisita[]>([]);
  const [ativas, setAtivas] = useState<Ativa[]>([]);
  const [encResumo, setEncResumo] = useState<{ aguardando: number; na_portaria: number }>({ aguardando: 0, na_portaria: 0 });
  const [modo, setModo] = useState('');
  const [aviso, setAviso] = useState<Aviso | null>(null);

  // Catálogo de Unidades + Moradores (usado em Visitantes Avulsos, Encomendas e Interfone)
  const [catalogoUnidades, setCatalogoUnidades] = useState<UnidadeCatalogo[]>([]);

  // Busca global rápida no topo
  const [buscaGlobal, setBuscaGlobal] = useState('');
  const [buscadoGlobal, setBuscadoGlobal] = useState('');
  const [resultadoBusca, setResultadoBusca] = useState<ResultadoBusca | null>(null);
  const [filtroVisitantes, setFiltroVisitantes] = useState('');

  // Estados de Ação e Modais de Portão + Feedback Luminoso de Portão Aberto
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [cameraModal, setCameraModal] = useState<Controlador | null>(null);
  const [modoOperacional, setModoOperacional] = useState<boolean>(() => Boolean(document.fullscreenElement));
  const [testandoEquipamentos, setTestandoEquipamentos] = useState(false);
  const [ultimoTesteHora, setUltimoTesteHora] = useState('');
  const [aberturaDireta, setAberturaDireta] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sectrum_portaria_1clique') !== '0';
    } catch {
      return true;
    }
  });
  const [feedbackPortoes, setFeedbackPortoes] = useState<
    Record<number, { status: 'aberto' | 'erro'; inicioEm: number; expiraEm: number; hora: string; msg?: string }>
  >({});
  const [ultimaAberturaPortao, setUltimaAberturaPortao] = useState<Record<number, string>>({});
  const [agoraTick, setAgoraTick] = useState<number>(() => Date.now());

  // Modal 1: Conferência e Liberação de Visitante Esperado + Aceite Rápido 1-Clique
  const [visitaConferindo, setVisitaConferindo] = useState<Esperado | null>(null);
  const [cpfDigitadoBalcao, setCpfDigitadoBalcao] = useState('');
  const [nomeConferencia, setNomeConferencia] = useState('');
  const [fotoConferencia, setFotoConferencia] = useState('');
  const [liberarFacialCheck, setLiberarFacialCheck] = useState(true);
  const [modoConferencia, setModoConferencia] = useState<'pedestre' | 'motorista' | 'ambos'>('pedestre');
  const [placaConferencia, setPlacaConferencia] = useState('');
  const [obsConferencia, setObsConferencia] = useState('');
  const [modoPorCard, setModoPorCard] = useState<Record<number, 'pedestre' | 'motorista' | 'ambos'>>({});
  const [cpfReveladoCard, setCpfReveladoCard] = useState<Record<number, boolean>>({});

  // Modal 2: Entrada de Visitante / Prestador Sem Convite
  const [modalSemConvite, setModalSemConvite] = useState(false);
  const [avulsoTipo, setAvulsoTipo] = useState<'visita' | 'prestador' | 'entrega' | 'corretor' | 'outro'>('visita');
  const [avulsoModoEntrada, setAvulsoModoEntrada] = useState<'pedestre' | 'motorista' | 'ambos'>('pedestre');
  const [avulsoPlaca, setAvulsoPlaca] = useState('');
  const [avulsoNome, setAvulsoNome] = useState('');
  const [avulsoCpf, setAvulsoCpf] = useState('');
  const [avulsoBuscaUnid, setAvulsoBuscaUnid] = useState('');
  const [avulsoGrupoRua, setAvulsoGrupoRua] = useState('');
  const [avulsoUnid, setAvulsoUnid] = useState<UnidadeCatalogo | null>(null);
  const [avulsoMoradorId, setAvulsoMoradorId] = useState<number>(0);
  const [avulsoAutorizadoTexto, setAvulsoAutorizadoTexto] = useState('');
  const [avulsoObs, setAvulsoObs] = useState('');
  const [avulsoFoto, setAvulsoFoto] = useState('');
  const [avulsoLiberarFacial, setAvulsoLiberarFacial] = useState(false);

  // Aba Encomendas
  const [encomendasLista, setEncomendasLista] = useState<EncomendaItem[]>([]);
  const [buscaEncomenda, setBuscaEncomenda] = useState('');
  const [modalNovaEnc, setModalNovaEnc] = useState(false);
  const [scannerEncModo, setScannerEncModo] = useState<'localizar' | 'entrega' | null>(null);
  const [encEntregarModal, setEncEntregarModal] = useState<EncomendaItem | null>(null);
  const [encCodigoRetirada, setEncCodigoRetirada] = useState('');
  const [encSemCodigo, setEncSemCodigo] = useState(false);
  const [encRetiradoPor, setEncRetiradoPor] = useState('');

  // Aba Interfone & VoIP
  const [sipInfo, setSipInfo] = useState<SipPortariaInfo | null>(null);
  const [mostrarCredenciaisSip, setMostrarCredenciaisSip] = useState(false);
  const [mostrarSenhaSip, setMostrarSenhaSip] = useState(false);
  const [historicoVoip, setHistoricoVoip] = useState<HistoricoChamadaPortaria[]>([]);
  const [buscaDiscador, setBuscaDiscador] = useState('');
  const [grupoRuaDiscador, setGrupoRuaDiscador] = useState('');
  const [mostrarTecladoVoip, setMostrarTecladoVoip] = useState(false);
  const [chamadaSainte, setChamadaSainte] = useState<ChamadaSaintePortaria | null>(null);

  // Tela cheia / Modo Operacional
  useEffect(() => {
    const aoMudarFullscreen = (ev: Event) => {
      const custom = ev as CustomEvent<{ ativo?: boolean }>;
      if (custom.detail && typeof custom.detail.ativo === 'boolean') {
        setModoOperacional(custom.detail.ativo);
      } else {
        setModoOperacional(Boolean(document.fullscreenElement));
      }
    };
    window.addEventListener('sectrum:fullscreen-status', aoMudarFullscreen);
    document.addEventListener('fullscreenchange', aoMudarFullscreen);
    return () => {
      window.removeEventListener('sectrum:fullscreen-status', aoMudarFullscreen);
      document.removeEventListener('fullscreenchange', aoMudarFullscreen);
    };
  }, []);

  const alternarModoOperacional = () => {
    const novo = !modoOperacional;
    setModoOperacional(novo);
    window.dispatchEvent(
      new CustomEvent('sectrum:modo-operacional', {
        detail: { recolherMenu: novo, telaCheia: novo },
      }),
    );
  };

  // Carregamento principal do painel
  const carregarPainel = useCallback(async () => {
    try {
      const r = await api<{
        stats: Stats;
        modulos?: { encomendas: boolean; interfone: boolean };
        controladores: Controlador[];
        esperados: Esperado[];
        presentes_visitas?: PresenteVisita[];
        ativas: Ativa[];
        encomendas_resumo?: { aguardando: number; na_portaria: number };
        modo_hardware: string;
      }>('portaria_painel');
      setStats(r.stats);
      if (r.modulos) setModulos({ encomendas: r.modulos.encomendas, interfone: r.modulos.interfone });
      setControladores(r.controladores);
      setEsperados(r.esperados);
      setPresentesVisitas(r.presentes_visitas || []);
      setAtivas(r.ativas);
      if (r.encomendas_resumo) setEncResumo(r.encomendas_resumo);
      setModo(r.modo_hardware);
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: msgErro(e) });
    }
  }, []);

  const carregarCatalogo = useCallback(async () => {
    try {
      const r = await api<{ unidades: UnidadeCatalogo[] }>('portaria_catalogo_unidades');
      setCatalogoUnidades(r.unidades || []);
    } catch {
      /* ignora */
    }
  }, []);

  const carregarEncomendas = useCallback(async () => {
    try {
      const r = await api<{ encomendas: EncomendaItem[] }>('encomendas_painel');
      setEncomendasLista(r.encomendas || []);
      setEncResumo({
        aguardando: (r.encomendas || []).filter((e) => e.status === 'aguardando_entrega').length,
        na_portaria: (r.encomendas || []).filter((e) => e.status === 'recebida_portaria').length,
      });
    } catch {
      /* ignora */
    }
  }, []);

  const carregarInterfone = useCallback(async () => {
    try {
      const r = await api<{ sip_portaria: SipPortariaInfo; historico: HistoricoChamadaPortaria[] }>('portaria_interfone_painel');
      setSipInfo(r.sip_portaria);
      setHistoricoVoip(r.historico || []);
    } catch {
      /* ignora */
    }
  }, []);

  useEffect(() => {
    carregarPainel();
    carregarCatalogo();
  }, [carregarPainel, carregarCatalogo]);

  // Atualização suave em background a cada 12s quando sem modal crítico aberto
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.hidden) return;
      carregarPainel();
      if (abaAtiva === 'encomendas') carregarEncomendas();
      if (abaAtiva === 'interfone') carregarInterfone();
    }, 12000);
    return () => window.clearInterval(t);
  }, [abaAtiva, carregarPainel, carregarEncomendas, carregarInterfone]);

  useEffect(() => {
    if (abaAtiva === 'encomendas') carregarEncomendas();
    if (abaAtiva === 'interfone') carregarInterfone();
  }, [abaAtiva, carregarEncomendas, carregarInterfone]);

  // =========================================================================
  // AÇÕES DE PORTÕES E EQUIPAMENTOS
  // =========================================================================

  const testarEquipamentos = async () => {
    setTestandoEquipamentos(true);
    try {
      const r = await api<{
        controladores: Controlador[];
        resumo: { total: number; online: number; offline: number; testado_em: string };
      }>('portaria_testar_equipamentos');
      setControladores(r.controladores);
      setUltimoTesteHora(r.resumo.testado_em);
      setAviso({
        tipo: r.resumo.offline > 0 ? 'erro' : 'ok',
        mensagem:
          r.resumo.offline > 0
            ? `⚠️ Teste (${r.resumo.testado_em}): ${r.resumo.offline} de ${r.resumo.total} equipamento(s) OFF-LINE.`
            : `✅ Teste (${r.resumo.testado_em}): Todos os ${r.resumo.total} equipamento(s) estão ONLINE.`,
      });
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: msgErro(e) });
    } finally {
      setTestandoEquipamentos(false);
    }
  };

  const registrarSinalizacaoPortao = useCallback((idCtrl: number, status: 'aberto' | 'erro', msg?: string) => {
    const agora = Date.now();
    const horaFmt = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const duracaoMs = status === 'aberto' ? 5000 : 4500;
    setAgoraTick(agora);
    setFeedbackPortoes((prev) => ({
      ...prev,
      [idCtrl]: { status, inicioEm: agora, expiraEm: agora + duracaoMs, hora: horaFmt, msg },
    }));
    if (status === 'aberto') {
      setUltimaAberturaPortao((prev) => ({ ...prev, [idCtrl]: horaFmt }));
      tocarSomPortaoAberto();
    }
  }, []);

  // Ticker suave (150ms) ativo apenas enquanto algum portão estiver com sinalizador luminoso aceso
  useEffect(() => {
    const temAtivo = Object.values(feedbackPortoes).some((f) => f.expiraEm > Date.now());
    if (!temAtivo) return;
    const iv = window.setInterval(() => {
      const now = Date.now();
      setAgoraTick(now);
      setFeedbackPortoes((prev) => {
        let mudou = false;
        const prox = { ...prev };
        for (const k of Object.keys(prox)) {
          const numK = Number(k);
          if (prox[numK] && prox[numK].expiraEm <= now) {
            delete prox[numK];
            mudou = true;
          }
        }
        return mudou ? prox : prev;
      });
    }, 150);
    return () => window.clearInterval(iv);
  }, [feedbackPortoes]);

  const alternarAberturaDireta = () => {
    setAberturaDireta((atual) => {
      const novo = !atual;
      try {
        localStorage.setItem('sectrum_portaria_1clique', novo ? '1' : '0');
      } catch {
        /* ignora */
      }
      return novo;
    });
  };

  const abrirPortaDireto = async (c: Controlador) => {
    // Evita disparo duplo acidental se o relé deste mesmo portão acabou de ser acionado há menos de 1.5s
    const fbAtual = feedbackPortoes[c.id];
    if (fbAtual && fbAtual.status === 'aberto' && Date.now() - fbAtual.inicioEm < 1500) {
      return;
    }
    setOcupado(`porta-${c.id}`);
    try {
      const r = await api<{ mensagem: string; hardware?: { modo: string } }>('portaria_abrir', {
        corpo: { terminal_id: c.id },
      });
      const sim = r.hardware?.modo === 'simulado' ? ' (SIMULADO)' : '';
      registrarSinalizacaoPortao(c.id, 'aberto', r.mensagem + sim);
      setAviso({ tipo: 'ok', mensagem: r.mensagem + sim });
      carregarPainel();
    } catch (e) {
      const m = msgErro(e);
      registrarSinalizacaoPortao(c.id, 'erro', m);
      setAviso({ tipo: 'erro', mensagem: m });
    } finally {
      setOcupado(null);
    }
  };

  // =========================================================================
  // AÇÕES DE VISITANTES (CONFERIR, LIBERAR FACIAL PEDESTRE, REVOGAR, AVULSO)
  // =========================================================================

  const resolverModoInicialVisita = (e: Esperado): 'pedestre' | 'motorista' | 'ambos' => {
    const salvoCard = modoPorCard[e.id];
    if (salvoCard) return salvoCard;
    if (e.modo_entrada === 'motorista') return 'motorista';
    if (e.modo_entrada === 'ambos') return 'ambos';
    return 'pedestre';
  };

  const abrirModalConferencia = (e: Esperado) => {
    setVisitaConferindo(e);
    setCpfDigitadoBalcao('');
    setNomeConferencia(
      e.nome === 'Convidado (link enviado)' || e.nome === 'Convite Pendente' || e.nome === 'Hóspede (Pendente)'
        ? ''
        : e.nome,
    );
    setFotoConferencia('');
    setLiberarFacialCheck(true);
    setModoConferencia(resolverModoInicialVisita(e));
    setPlacaConferencia(e.placa_veiculo || '');
    setObsConferencia('');
  };

  // Aceite direto em 1 clique quando o visitante já está pré-aprovado pelo morador!
  const darAceiteRapidoPreAprovado = async (e: Esperado, abrirPortaAgora = false) => {
    const ehPlaceholder =
      !e.nome ||
      e.nome === 'Convidado (link enviado)' ||
      e.nome === 'Convite Pendente' ||
      e.nome === 'Hóspede (Pendente)';
    if (ehPlaceholder) {
      abrirModalConferencia(e);
      return;
    }

    const modoEscolhido = resolverModoInicialVisita(e);
    const temFacialCompleta = Boolean(e.tem_foto && soDigitos(e.cpf).length === 11);
    setOcupado(`aceite-${e.id}`);
    try {
      const r = await api<{ mensagem: string }>('portaria_visita_liberar', {
        corpo: {
          visita_id: e.id,
          modo_entrada: modoEscolhido,
          placa_veiculo: e.placa_veiculo || undefined,
          liberar_facial: temFacialCompleta,
          abrir_porta_agora: abrirPortaAgora,
        },
      });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      setResultadoBusca(null);
      setBuscadoGlobal('');
      setBuscaGlobal('');
      await carregarPainel();
    } catch (err) {
      setAviso({ tipo: 'erro', mensagem: msgErro(err) });
    } finally {
      setOcupado(null);
    }
  };

  const confirmarLiberacaoVisita = async (abrirPortaAgora: boolean) => {
    if (!visitaConferindo) return;
    setOcupado(abrirPortaAgora ? 'liberar-abrir' : 'liberar');
    try {
      const r = await api<{ mensagem: string }>('portaria_visita_liberar', {
        corpo: {
          visita_id: visitaConferindo.id,
          cpf_informado: cpfDigitadoBalcao || undefined,
          nome_visitante: nomeConferencia || visitaConferindo.nome,
          foto_base64: fotoConferencia || undefined,
          modo_entrada: modoConferencia,
          placa_veiculo: placaConferencia.trim() || undefined,
          liberar_facial: liberarFacialCheck,
          abrir_porta_agora: abrirPortaAgora,
          observacao: obsConferencia || undefined,
        },
      });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      setVisitaConferindo(null);
      setResultadoBusca(null);
      setBuscadoGlobal('');
      setBuscaGlobal('');
      await carregarPainel();
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: msgErro(e) });
    } finally {
      setOcupado(null);
    }
  };

  const revogarOuDarSaidaVisita = async (visitaId: number, nome: string, estavaPresente: boolean) => {
    const pergunta = estavaPresente
      ? `Confirmar SAÍDA de ${nome} e remover imediatamente o rosto do leitor facial?`
      : `Cancelar o convite/acesso de ${nome} (e remover do leitor se já estiver liberado)?`;
    if (!window.confirm(pergunta)) return;

    setOcupado(`revogar-${visitaId}`);
    try {
      const r = await api<{ mensagem: string }>('portaria_visita_revogar', {
        corpo: { visita_id: visitaId },
      });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      if (visitaConferindo?.id === visitaId) setVisitaConferindo(null);
      await carregarPainel();
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: msgErro(e) });
    } finally {
      setOcupado(null);
    }
  };

  const registrarSaidaLogManual = async (log: Ativa) => {
    if (!window.confirm(`Registrar saída de ${log.nome_externo ?? 'visitante'}?`)) return;
    setOcupado(`saida-log-${log.id}`);
    try {
      const r = await api<{ mensagem: string }>('portaria_saida', { corpo: { id: log.id } });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      await carregarPainel();
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: msgErro(e) });
    } finally {
      setOcupado(null);
    }
  };

  const abrirModalEntradaSemConvite = () => {
    setAvulsoTipo('visita');
    setAvulsoModoEntrada('pedestre');
    setAvulsoPlaca('');
    setAvulsoNome('');
    setAvulsoCpf('');
    setAvulsoBuscaUnid('');
    setAvulsoGrupoRua('');
    setAvulsoUnid(null);
    setAvulsoMoradorId(0);
    setAvulsoAutorizadoTexto('');
    setAvulsoObs('');
    setAvulsoFoto('');
    setAvulsoLiberarFacial(false);
    setModalSemConvite(true);
  };

  const salvarEntradaSemConvite = async (abrirPortaAgora: boolean) => {
    if (!avulsoNome.trim()) {
      setAviso({ tipo: 'erro', mensagem: 'Informe o nome do visitante ou prestador.' });
      return;
    }
    setOcupado(abrirPortaAgora ? 'avulso-abrir' : 'avulso-reg');
    try {
      const r = await api<{ mensagem: string }>('portaria_entrada_avulsa', {
        corpo: {
          nome: avulsoNome.trim(),
          cpf: avulsoCpf || undefined,
          tipo_visitante: avulsoTipo,
          modo_entrada: avulsoModoEntrada,
          placa_veiculo: avulsoPlaca.trim() || undefined,
          unidade_id: avulsoUnid?.id || undefined,
          autorizado_por_usuario_id: avulsoMoradorId || undefined,
          autorizado_por_texto: avulsoAutorizadoTexto.trim() || undefined,
          observacao: avulsoObs.trim() || undefined,
          foto_base64: avulsoFoto || undefined,
          liberar_facial: avulsoLiberarFacial,
          abrir_porta_agora: abrirPortaAgora,
        },
      });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      setModalSemConvite(false);
      await carregarPainel();
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: msgErro(e) });
    } finally {
      setOcupado(null);
    }
  };

  // =========================================================================
  // BUSCA GLOBAL NO TOPO
  // =========================================================================

  const executarBuscaGlobal = async (termo: string) => {
    const t = termo.trim();
    if (!t) return;
    setBuscaGlobal(t);

    // Se bater direto com um visitante esperado na tela, já abre o modal de conferência!
    const dig = soDigitos(t);
    const achouEsperado = esperados.find(
      (e) => (dig.length >= 6 && soDigitos(e.cpf) === dig) || e.nome.toLowerCase() === t.toLowerCase(),
    );
    if (achouEsperado) {
      setAbaAtiva('visitantes');
      abrirModalConferencia(achouEsperado);
      return;
    }

    setOcupado('busca');
    try {
      const r = await api<{ resultado: ResultadoBusca | null }>('portaria_buscar', { query: { busca: t } });
      setResultadoBusca(r.resultado);
      setBuscadoGlobal(t);
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: msgErro(e) });
    } finally {
      setOcupado(null);
    }
  };

  const limparBuscaGlobal = () => {
    setBuscaGlobal('');
    setBuscadoGlobal('');
    setResultadoBusca(null);
  };

  const verDocumentoVisita = async (visitaId: number) => {
    const novaAba = window.open('about:blank', '_blank');
    try {
      const resp = await fetch(`/api.php?route=foto_registro&tipo=visita&campo=documento&id=${visitaId}`, {
        headers: { Authorization: `Bearer ${obterToken() ?? ''}` },
      });
      if (resp.ok) {
        const blobUrl = URL.createObjectURL(await resp.blob());
        if (novaAba) novaAba.location.href = blobUrl;
        else window.open(blobUrl, '_blank');
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      } else {
        novaAba?.close();
        setAviso({ tipo: 'erro', mensagem: 'Documento não encontrado.' });
      }
    } catch {
      novaAba?.close();
      setAviso({ tipo: 'erro', mensagem: 'Falha ao abrir documento.' });
    }
  };

  // =========================================================================
  // AÇÕES DE INTERFONE / VOIP (LIGAR PARA UNIDADE)
  // =========================================================================

  const ligarParaUnidade = useCallback(async (params: { unidade_id?: number; codigo?: string }) => {
    desbloquearContextoAudioConversa();
    setOcupado('discando');
    try {
      const r = await api<{
        mensagem: string;
        chamada: ChamadaSaintePortaria;
      }>('portaria_interfone_discar', { corpo: params });
      setChamadaSainte(r.chamada);
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: msgErro(e) });
    } finally {
      setOcupado(null);
    }
  }, []);

  // Atalho direto de outros módulos (ex: Achados e Perdidos Pet -> ?ligar_unidade=ID)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const unidParam = Number(q.get('ligar_unidade') ?? 0);
    if (unidParam > 0) {
      q.delete('ligar_unidade');
      const novaSearch = q.toString();
      window.history.replaceState(null, '', window.location.pathname + (novaSearch ? `?${novaSearch}` : ''));
      setAbaAtiva('interfone');
      void ligarParaUnidade({ unidade_id: unidParam });
    }
  }, [ligarParaUnidade]);

  // =========================================================================
  // AÇÕES DE ENCOMENDAS NA PORTARIA
  // =========================================================================

  const abrirModalReceberEncomenda = () => {
    setModalNovaEnc(true);
  };

  const localizarEncomendaPorCodigoNaPortaria = async (codLido: string) => {
    const limpo = codLido.trim();
    if (!limpo) return;
    try {
      const r = await api<{ encomenda_na_portaria: EncomendaItem | null }>('encomenda_analisar_codigo_ou_foto', {
        corpo: { codigo_lido: limpo },
      });
      if (r.encomenda_na_portaria) {
        const achada = encomendasLista.find((x) => x.id === r.encomenda_na_portaria!.id) || r.encomenda_na_portaria;
        setEncEntregarModal(achada);
        setEncSemCodigo(false);
        setEncRetiradoPor(achada.morador_nome || '');
        const ehQrMorador = /^SECTRUM-ENC:/i.test(limpo) || /^[0-9a-f]{6}$/i.test(limpo) || /^[0-9a-f]{32}$/i.test(limpo);
        setEncCodigoRetirada(ehQrMorador ? limpo.replace(/^SECTRUM-ENC:/i, '') : '');
        setBuscaEncomenda('');
      } else {
        setBuscaEncomenda(limpo);
        setAviso({ tipo: 'erro', mensagem: `Nenhum pacote na prateleira com o código "${limpo}".` });
      }
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: msgErro(e) });
    }
  };

  const confirmarChegadaEncomendaPreAvisada = async (enc: EncomendaItem) => {
    setOcupado(`enc-rec-${enc.id}`);
    try {
      const r = await api<{ mensagem: string }>('encomenda_receber', { corpo: { encomenda_id: enc.id } });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      await Promise.all([carregarEncomendas(), carregarPainel()]);
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: msgErro(e) });
    } finally {
      setOcupado(null);
    }
  };

  const confirmarEntregaEncomenda = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!encEntregarModal) return;
    setOcupado('enc-entregar');
    try {
      const r = await api<{ mensagem: string }>('encomenda_entregar', {
        corpo: {
          encomenda_id: encEntregarModal.id,
          qr_code: encCodigoRetirada,
          sem_codigo: encSemCodigo,
          retirado_por_nome: encRetiradoPor,
        },
      });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      setEncEntregarModal(null);
      setEncCodigoRetirada('');
      setEncRetiradoPor('');
      await Promise.all([carregarEncomendas(), carregarPainel()]);
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: msgErro(e) });
    } finally {
      setOcupado(null);
    }
  };

  // =========================================================================
  // FILTROS E DADOS DERIVADOS
  // =========================================================================

  const totalOnline = controladores.filter((c) => c.online !== false).length;
  const totalOffline = controladores.length - totalOnline;

  const gruposRuasCondominio = useMemo(() => listarGruposMacroUnidades(catalogoUnidades), [catalogoUnidades]);

  const esperadosFiltrados = useMemo(() => {
    const t = filtroVisitantes.trim();
    if (!t) return esperados;
    return esperados.filter((e) =>
      textoCasaBuscaInteligente(
        `${e.nome} ${e.cpf ?? ''} ${e.placa_veiculo ?? ''} ${e.unidade_label ?? ''} ${e.morador_nome ?? ''}`,
        t,
      ),
    );
  }, [esperados, filtroVisitantes]);

  const unidadesAvulsoFiltradas = useMemo(() => {
    return filtrarUnidadesInteligente(catalogoUnidades, avulsoBuscaUnid, avulsoGrupoRua, true).slice(0, 80);
  }, [catalogoUnidades, avulsoBuscaUnid, avulsoGrupoRua]);

  const unidadesDiscadorFiltradas = useMemo(() => {
    return filtrarUnidadesInteligente(catalogoUnidades, buscaDiscador, grupoRuaDiscador, false);
  }, [catalogoUnidades, buscaDiscador, grupoRuaDiscador]);

  const encPreAvisadas = encomendasLista.filter((e) => e.status === 'aguardando_entrega');
  const encNaPrateleira = encomendasLista.filter((e) => {
    if (e.status !== 'recebida_portaria') return false;
    if (!buscaEncomenda.trim()) return true;
    return textoCasaBuscaInteligente(
      `${e.morador_nome ?? ''} ${e.bloco_nome ?? ''} ${e.unidade_nome ?? ''} ${e.empresa} ${e.codigo_rastreio ?? ''} ${e.observacoes ?? ''}`,
      buscaEncomenda,
    );
  });

  // Validação em tempo real do CPF digitado no balcão durante a conferência do visitante
  const statusConferenciaCpf = useMemo(() => {
    if (!visitaConferindo) return null;
    const cpfCad = soDigitos(visitaConferindo.cpf);
    const cpfDig = soDigitos(cpfDigitadoBalcao);
    if (!cpfCad) {
      return { tipo: 'sem_cadastro', texto: 'Convite sem CPF prévio — digite o CPF do visitante para registrar' };
    }
    if (!cpfDig) {
      return { tipo: 'aguardando', texto: `Peça os números do CPF ao visitante (final -${cpfCad.slice(-2)})` };
    }
    if (cpfDig.length < 11) {
      const comecaIgual = cpfCad.startsWith(cpfDig);
      return {
        tipo: comecaIgual ? 'digitando_ok' : 'erro',
        texto: comecaIgual ? 'Digitando... números iniciais conferem!' : '⚠️ Atenção: os dígitos não conferem com o cadastro!',
      };
    }
    if (cpfDig === cpfCad) {
      return { tipo: 'ok', texto: '✅ CPF CONFERE EXATAMENTE COM O CADASTRO!' };
    }
    return { tipo: 'erro', texto: '❌ CPF DIFERENTE DO CADASTRADO NO CONVITE!' };
  }, [visitaConferindo, cpfDigitadoBalcao]);

  return (
    <div className={`${modoOperacional ? 'max-w-full' : 'max-w-7xl'} mx-auto p-4 sm:p-6 space-y-5 transition-all`}>
      {/* Modal de Câmera da Porta */}
      {cameraModal && (
        <ModalCameraPorta
          controlador={cameraModal}
          onFechar={() => setCameraModal(null)}
          onPortaAberta={(av) => {
            if (av.tipo === 'ok') registrarSinalizacaoPortao(cameraModal.id, 'aberto', av.mensagem);
            setAviso(av);
            carregarPainel();
          }}
        />
      )}

      {/* Modal de Ligação Sainte (Portaria -> Morador) */}
      {chamadaSainte && (
        <ModalLigacaoPortariaSainte
          chamada={chamadaSainte}
          onEncerrar={() => {
            setChamadaSainte(null);
            if (abaAtiva === 'interfone') carregarInterfone();
          }}
        />
      )}

      {/* Aviso de Feedback Operacional */}
      {aviso && (
        <div
          className={`border-l-4 px-4 py-3 rounded-xl text-sm font-bold flex items-center justify-between gap-3 shadow-xs ${
            aviso.tipo === 'ok'
              ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
              : 'bg-rose-50 border-rose-500 text-rose-900'
          }`}
        >
          <span>{aviso.mensagem}</span>
          <button onClick={() => setAviso(null)} aria-label="Fechar aviso" className="cursor-pointer">
            <X size={17} />
          </button>
        </div>
      )}

      {/* Banner Vermelho Fixo de Alerta de Pet Perdido (com acionamento direto do Interfone WebRTC) */}
      <BannerAlertaPetsPerdidos
        onLigarInterfoneUnidade={(unidadeId) => {
          setAbaAtiva('interfone');
          void ligarParaUnidade({ unidade_id: unidadeId });
        }}
      />

      {/* =====================================================================
          BARRA SUPERIOR FIXA: PORTÕES + BUSCA RÁPIDA + MODO OPERACIONAL
         ===================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
              🛡️ Central Operacional da Portaria
              {modo === 'simulado' && (
                <span className="text-xs font-extrabold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300">
                  SIMULADO
                </span>
              )}
            </h1>
            <div className="flex items-center gap-2 text-xs font-extrabold">
              <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 inline-flex items-center gap-1">
                <LogIn size={13} /> {stats.entradas_hoje} entradas hoje
              </span>
              <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-1">
                <Users size={13} /> {stats.dentro_agora} dentro agora
              </span>
              {controladores.length > 0 && (
                <span
                  className={`px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 ${
                    totalOffline > 0
                      ? 'bg-rose-100 text-rose-800 border-rose-300'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${totalOffline > 0 ? 'bg-rose-600' : 'bg-emerald-500 animate-pulse'}`} />
                  {totalOffline > 0 ? `${totalOffline} Off-line` : `${totalOnline} Portões Online`}
                  {ultimoTesteHora ? ` (${ultimoTesteHora})` : ''}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {controladores.length > 0 && (
              <button
                type="button"
                onClick={alternarAberturaDireta}
                className={`px-3 py-2 rounded-xl text-xs font-extrabold border flex items-center gap-1.5 cursor-pointer transition ${
                  aberturaDireta
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                    : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                }`}
                title={
                  aberturaDireta
                    ? 'Abertura rápida em 1 clique ativada (sem caixa de confirmação). Clique se quiser exigir confirmação.'
                    : 'Confirmação antes de abrir ativada. Clique para voltar à abertura direta em 1 clique.'
                }
              >
                {aberturaDireta ? <Zap size={14} className="text-emerald-600" /> : <Lock size={14} className="text-amber-700" />}
                {aberturaDireta ? '1-Clique Direto' : 'Pedir Confirmação'}
              </button>
            )}
            {controladores.length > 0 && (
              <button
                type="button"
                disabled={testandoEquipamentos}
                onClick={testarEquipamentos}
                className="px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <RefreshCw size={14} className={testandoEquipamentos ? 'animate-spin text-blue-600' : ''} />
                Testar Portões
              </button>
            )}
            <button
              type="button"
              onClick={alternarModoOperacional}
              className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 cursor-pointer ${
                modoOperacional
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
            >
              {modoOperacional ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              {modoOperacional ? 'Sair Tela Cheia' : 'Tela Cheia'}
            </button>
          </div>
        </div>

        {/* Cards em Alta Evidência de Acionamento dos Portões (Pedestre / Veículos) */}
        {controladores.length > 0 && (
          <div
            className={`grid gap-4 ${
              controladores.length === 1
                ? 'grid-cols-1'
                : controladores.length === 2 || controladores.length === 4
                  ? 'grid-cols-1 lg:grid-cols-2'
                  : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
            }`}
          >
            {controladores.map((c) => {
              const online = c.online !== false;
              const ehVeiculo = c.categoria === 'veiculo' || /ve[ií]culo|garagem|carro/i.test(c.nome);
              const nomeLimpo = c.nome.replace(/_/g, ' ');
              const estaAbrindoEste = ocupado === `porta-${c.id}`;
              const fb = feedbackPortoes[c.id];
              const msRestante = fb ? Math.max(0, fb.expiraEm - agoraTick) : 0;
              const segRestantes = msRestante > 0 ? Math.ceil(msRestante / 1000) : 0;
              const pctBarra =
                fb && msRestante > 0
                  ? Math.min(100, Math.max(0, (msRestante / Math.max(1, fb.expiraEm - fb.inicioEm)) * 100))
                  : 0;
              const foiAbertoAgora = Boolean(fb && fb.status === 'aberto' && msRestante > 0);
              const deuErroAgora = Boolean(fb && fb.status === 'erro' && msRestante > 0);
              const horaUltima = ultimaAberturaPortao[c.id];

              return (
                <div
                  key={c.id}
                  className={`relative overflow-hidden rounded-2xl p-4 sm:p-5 border-2 transition-all duration-200 flex flex-col justify-between gap-4 ${
                    foiAbertoAgora
                      ? 'bg-gradient-to-br from-emerald-100 via-emerald-50 to-emerald-100 border-emerald-600 ring-4 ring-emerald-400/50 shadow-lg shadow-emerald-500/20'
                      : deuErroAgora
                        ? 'bg-gradient-to-br from-rose-100 via-rose-50 to-rose-100 border-rose-600 ring-4 ring-rose-400/50 shadow-lg'
                        : !online
                          ? 'bg-gradient-to-br from-rose-50 via-white to-rose-50/80 border-rose-500 shadow-sm'
                          : ehVeiculo
                            ? 'bg-gradient-to-br from-indigo-50/90 via-white to-indigo-50/50 border-indigo-400 shadow-sm hover:shadow-md'
                            : 'bg-gradient-to-br from-emerald-50/90 via-white to-emerald-50/50 border-emerald-400 shadow-sm hover:shadow-md'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-13 h-13 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0 transition-transform ${
                        foiAbertoAgora
                          ? 'bg-emerald-600 scale-105 ring-4 ring-emerald-300'
                          : deuErroAgora || !online
                            ? 'bg-rose-600'
                            : ehVeiculo
                              ? 'bg-indigo-600'
                              : 'bg-emerald-600'
                      }`}
                    >
                      {foiAbertoAgora ? (
                        <Unlock size={28} className="animate-bounce" />
                      ) : ehVeiculo ? (
                        <Car size={27} />
                      ) : (
                        <DoorOpen size={27} />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`whitespace-nowrap text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                            ehVeiculo
                              ? 'bg-indigo-100 text-indigo-900 border-indigo-300'
                              : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                          }`}
                        >
                          {ehVeiculo ? '🚗 Acesso Veículos' : '🚶 Acesso Pedestre'}
                        </span>

                        {foiAbertoAgora ? (
                          <span className="whitespace-nowrap inline-flex items-center gap-1.5 text-xs font-black px-3 py-0.5 rounded-full bg-emerald-600 text-white shadow-xs animate-pulse">
                            <CheckCircle2 size={14} />
                            ABERTO AGORA! ({segRestantes}s)
                          </span>
                        ) : deuErroAgora ? (
                          <span className="whitespace-nowrap inline-flex items-center gap-1.5 text-xs font-black px-3 py-0.5 rounded-full bg-rose-600 text-white">
                            <AlertCircle size={14} />
                            FALHA NA ABERTURA
                          </span>
                        ) : (
                          <span
                            className={`whitespace-nowrap inline-flex items-center gap-1.5 text-xs font-extrabold px-2.5 py-0.5 rounded-full border ${
                              online
                                ? 'bg-white text-emerald-700 border-emerald-300'
                                : 'bg-rose-600 text-white border-rose-700'
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full ${online ? 'bg-emerald-500 animate-pulse' : 'bg-white'}`} />
                            {online ? `Online${c.latencia_ms ? ` • ${c.latencia_ms}ms` : ''}` : 'Off-line'}
                          </span>
                        )}
                      </div>

                      <div className="flex items-baseline justify-between gap-2 mt-1">
                        <div className="font-black text-slate-900 text-lg sm:text-xl leading-tight truncate">
                          {nomeLimpo}
                        </div>
                        {horaUltima && !foiAbertoAgora && (
                          <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap shrink-0">
                            Última abertura: {horaUltima}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        (window as unknown as { __sectrumBlessVideo?: () => void }).__sectrumBlessVideo?.();
                        setCameraModal(c);
                      }}
                      className="sm:col-span-2 py-3.5 px-4 rounded-xl bg-white hover:bg-slate-100 border-2 border-slate-300 text-slate-800 text-sm font-extrabold flex items-center justify-center gap-2 shadow-2xs cursor-pointer transition"
                      title="Ver câmera ao vivo do leitor e conversar pelo alto-falante da porta"
                    >
                      <Video size={18} className={ehVeiculo ? 'text-indigo-600' : 'text-emerald-600'} />
                      <span>Ver Câmera</span>
                    </button>

                    <button
                      type="button"
                      disabled={ocupado !== null}
                      onClick={() => {
                        if (!aberturaDireta && !window.confirm(`Abrir agora: ${nomeLimpo}?`)) {
                          return;
                        }
                        abrirPortaDireto(c);
                      }}
                      className={`relative overflow-hidden sm:col-span-3 py-3.5 px-5 rounded-xl text-white font-black text-sm sm:text-base tracking-wide shadow-md hover:shadow-lg active:scale-[0.98] transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 ${
                        foiAbertoAgora
                          ? 'bg-emerald-600 ring-2 ring-emerald-300'
                          : deuErroAgora
                            ? 'bg-rose-600 hover:bg-rose-700'
                            : !online
                              ? 'bg-rose-600 hover:bg-rose-700'
                              : ehVeiculo
                                ? 'bg-indigo-600 hover:bg-indigo-700'
                                : 'bg-emerald-600 hover:bg-emerald-700'
                      }`}
                    >
                      {estaAbrindoEste ? (
                        <RefreshCw size={19} className="animate-spin" />
                      ) : foiAbertoAgora ? (
                        <CheckCircle2 size={21} />
                      ) : (
                        <Unlock size={19} />
                      )}
                      <span>
                        {estaAbrindoEste
                          ? 'ACIONANDO PORTÃO...'
                          : foiAbertoAgora
                            ? `PORTÃO ABERTO! (${segRestantes}s)`
                            : deuErroAgora
                              ? 'FALHA — TENTAR NOVAMENTE'
                              : ehVeiculo
                                ? 'ABRIR PORTÃO VEÍCULOS'
                                : 'ABRIR PORTÃO PEDESTRE'}
                      </span>

                      {foiAbertoAgora && (
                        <span
                          className="absolute bottom-0 left-0 h-1.5 bg-white/80 transition-all duration-150"
                          style={{ width: `${pctBarra}%` }}
                        />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Busca Global Sempre Visível */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            executarBuscaGlobal(buscaGlobal);
          }}
          className="flex gap-2 flex-wrap"
        >
          <div className="relative flex-1 min-w-[240px]">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={buscaGlobal}
              onChange={(e) => setBuscaGlobal(e.target.value)}
              placeholder="Consulta rápida no balcão: digite CPF, Nome do Visitante/Morador ou Placa do Veículo..."
              className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-slate-200 focus:border-blue-600 outline-none text-sm font-semibold bg-slate-50 focus:bg-white"
            />
          </div>
          <button
            disabled={ocupado === 'busca'}
            className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <Search size={16} /> Consultar
          </button>
          {buscadoGlobal && (
            <button
              type="button"
              onClick={limparBuscaGlobal}
              className="px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm cursor-pointer"
            >
              Limpar
            </button>
          )}
        </form>
        {/^\d[\d.\-\s]*$/.test(buscaGlobal.trim()) && soDigitos(buscaGlobal).length >= 11 && (
          <ValidadorCpf cpf={buscaGlobal} compacto />
        )}

        {/* Resultado da Busca Global */}
        {buscadoGlobal && !resultadoBusca && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <AlertCircle size={24} className="text-amber-600 shrink-0" />
              <div>
                <div className="font-extrabold text-amber-950 text-sm">
                  Nenhum cadastro encontrado para "{buscadoGlobal}"
                </div>
                <div className="text-xs text-amber-800">
                  Se for um visitante sem convite, clique ao lado para registrar ou liberar agora.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                limparBuscaGlobal();
                abrirModalEntradaSemConvite();
                if (/^\d/.test(buscadoGlobal)) setAvulsoCpf(soDigitos(buscadoGlobal));
                else setAvulsoNome(buscadoGlobal);
              }}
              className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs cursor-pointer"
            >
              ➕ Registrar Entrada Sem Convite
            </button>
          </div>
        )}

        {buscadoGlobal && resultadoBusca && (
          <div className="rounded-2xl border-2 border-blue-500 bg-blue-50/40 p-4 flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <FotoUsuario
                rota={
                  resultadoBusca.origem === 'usuario'
                    ? `foto_usuario&id=${resultadoBusca.id}`
                    : resultadoBusca.origem === 'hospede_temporada' || resultadoBusca.origem === 'visita_ativa'
                      ? `foto_registro&tipo=visita&id=${resultadoBusca.id}`
                      : `foto_registro&tipo=precadastro&id=${resultadoBusca.id}`
                }
                temFoto={resultadoBusca.tem_foto}
                largura={76}
                altura={92}
              />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-black text-slate-900">{resultadoBusca.nome}</span>
                  <span className="px-2 py-0.5 rounded text-xs font-extrabold bg-blue-100 text-blue-800">
                    {resultadoBusca.origem === 'usuario'
                      ? resultadoBusca.ativo === false || resultadoBusca.excluido
                        ? '⚠️ Morador Bloqueado / Inativo'
                        : '🏠 Morador Cadastrado'
                      : resultadoBusca.origem === 'hospede_temporada'
                        ? '🧳 Hóspede Temporada (Airbnb)'
                        : resultadoBusca.origem === 'visita_ativa'
                          ? '🧍 Visitante c/ Convite'
                          : '📋 Pré-cadastro'}
                  </span>
                </div>
                <div className="text-xs text-slate-600 mt-1 space-y-0.5">
                  {resultadoBusca.cpf && (
                    <div>
                      CPF: <b className="font-mono">{resultadoBusca.cpf}</b>
                    </div>
                  )}
                  {resultadoBusca.unidade && (
                    <div>
                      Unidade / Vínculo: <b>{resultadoBusca.unidade}</b>
                    </div>
                  )}
                  {resultadoBusca.morador_nome && (
                    <div className="text-emerald-700 font-bold">
                      ✅ Pré-aprovado por: <b>{resultadoBusca.morador_nome}</b>
                    </div>
                  )}
                  {resultadoBusca.placa_veiculo && (
                    <div>
                      🚗 Placa informada: <b className="font-mono">{resultadoBusca.placa_veiculo}</b>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {(resultadoBusca.origem === 'visita_ativa' || resultadoBusca.origem === 'hospede_temporada') ? (
                <>
                  {resultadoBusca.morador_nome && resultadoBusca.tem_foto && (
                    <button
                      type="button"
                      disabled={ocupado !== null}
                      onClick={() =>
                        darAceiteRapidoPreAprovado({
                          id: resultadoBusca.id,
                          nome: resultadoBusca.nome,
                          cpf: resultadoBusca.cpf,
                          tem_foto: resultadoBusca.tem_foto,
                          tem_documento: resultadoBusca.tem_documento,
                          origem: resultadoBusca.origem === 'hospede_temporada' ? 'temporada' : 'comum',
                          modo_entrada: resultadoBusca.modo_entrada || 'pedestre',
                          placa_veiculo: resultadoBusca.placa_veiculo || null,
                          pre_aprovado_morador: true,
                          status: resultadoBusca.status || 'aguardando_portaria',
                          unidade_id: resultadoBusca.unidade_id || null,
                          unidade_label: resultadoBusca.unidade || null,
                          morador_nome: resultadoBusca.morador_nome || null,
                          morador_telefone: null,
                        })
                      }
                      className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      ✅ Dar Aceite Rápido ({resultadoBusca.modo_entrada === 'motorista' ? '🚗 Motorista' : '🚶 Pedestre'})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      abrirModalConferencia({
                        id: resultadoBusca.id,
                        nome: resultadoBusca.nome,
                        cpf: resultadoBusca.cpf,
                        tem_foto: resultadoBusca.tem_foto,
                        tem_documento: resultadoBusca.tem_documento,
                        origem: resultadoBusca.origem === 'hospede_temporada' ? 'temporada' : 'comum',
                        modo_entrada: resultadoBusca.modo_entrada || 'pedestre',
                        placa_veiculo: resultadoBusca.placa_veiculo || null,
                        status: resultadoBusca.status || 'aguardando',
                        unidade_id: resultadoBusca.unidade_id || null,
                        unidade_label: resultadoBusca.unidade || null,
                        morador_nome: resultadoBusca.morador_nome || null,
                        morador_telefone: null,
                      });
                    }}
                    className="px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm cursor-pointer"
                  >
                    🔍 Conferir / Escolher Portão
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={ocupado !== null}
                  onClick={async () => {
                    if (!window.confirm(`Registrar entrada na portaria para ${resultadoBusca.nome}?`)) return;
                    setOcupado('entrada-busca');
                    try {
                      const r = await api<{ mensagem: string }>('portaria_entrada', {
                        corpo: { tipo_pessoa: resultadoBusca.origem, ref_id: resultadoBusca.id },
                      });
                      setAviso({ tipo: 'ok', mensagem: r.mensagem });
                      limparBuscaGlobal();
                      carregarPainel();
                    } catch (e) {
                      setAviso({ tipo: 'erro', mensagem: msgErro(e) });
                    } finally {
                      setOcupado(null);
                    }
                  }}
                  className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm cursor-pointer"
                >
                  ✅ Registrar Entrada
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
          SELETOR DAS 3 ABAS OPERACIONAIS GRANDES
         ===================================================================== */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 bg-slate-200/70 p-1.5 rounded-2xl border border-slate-200">
        <button
          type="button"
          onClick={() => setAbaAtiva('visitantes')}
          className={`py-3.5 px-3 rounded-xl font-black text-xs sm:text-base flex items-center justify-center gap-2 transition cursor-pointer ${
            abaAtiva === 'visitantes'
              ? 'bg-white text-blue-700 shadow-md'
              : 'text-slate-700 hover:bg-white/60'
          }`}
        >
          <Users size={19} />
          <span>Visitantes</span>
          {esperados.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-black bg-blue-600 text-white">
              {esperados.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva('encomendas')}
          className={`py-3.5 px-3 rounded-xl font-black text-xs sm:text-base flex items-center justify-center gap-2 transition cursor-pointer ${
            abaAtiva === 'encomendas'
              ? 'bg-white text-emerald-700 shadow-md'
              : 'text-slate-700 hover:bg-white/60'
          }`}
        >
          <Package size={19} />
          <span>Encomendas</span>
          {(encResumo.na_portaria > 0 || encResumo.aguardando > 0) && (
            <span className="px-2 py-0.5 rounded-full text-xs font-black bg-emerald-600 text-white">
              {encResumo.na_portaria}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva('interfone')}
          className={`py-3.5 px-3 rounded-xl font-black text-xs sm:text-base flex items-center justify-center gap-2 transition cursor-pointer ${
            abaAtiva === 'interfone'
              ? 'bg-white text-indigo-700 shadow-md'
              : 'text-slate-700 hover:bg-white/60'
          }`}
        >
          <PhoneCall size={19} />
          <span>Interfone & VoIP</span>
          {sipInfo?.registrado_online && (
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" title="Telefone IP SIP Online" />
          )}
        </button>
      </div>

      {/* =====================================================================
          ABA 1: VISITANTES (FILA PARA CHEGAR + PRÉ-APROVADOS VERDES + DENTRO AGORA)
         ===================================================================== */}
      {abaAtiva === 'visitantes' && (
        <div className="space-y-6">
          {/* Cabeçalho de Visitantes + Botão Visitante Sem Convite */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                  <CalendarDays size={21} className="text-blue-600" />
                  Visitantes Esperados (Para Chegar)
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-100 text-blue-800">
                    {esperados.length}
                  </span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Convites em <b className="text-emerald-700">VERDE</b> já estão pré-aprovados pelo morador: basta conferir e clicar em{' '}
                  <b>Dar Aceite</b> para enviar a facial direto ao terminal de <b>Pedestre</b> ou <b>Motorista</b>!
                </p>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                {esperados.length > 1 && (
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={filtroVisitantes}
                      onChange={(e) => setFiltroVisitantes(e.target.value)}
                      placeholder="Buscar nome, rua 2, 1A 002, placa..."
                      className="pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:border-blue-600 min-w-[230px]"
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={abrirModalEntradaSemConvite}
                  className="px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm shadow-md flex items-center gap-2 cursor-pointer"
                >
                  <UserPlus size={18} />
                  + Visitante / Prestador Sem Convite
                </button>
              </div>
            </div>

            {esperadosFiltrados.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {esperadosFiltrados.map((e) => {
                  const ehPreAprovado = Boolean(
                    e.pre_aprovado_morador ||
                      (e.morador_nome && (e.status === 'aguardando_portaria' || e.status === 'aguardando')),
                  );
                  const ehPlaceholder =
                    !e.nome ||
                    e.nome === 'Convidado (link enviado)' ||
                    e.nome === 'Convite Pendente' ||
                    e.nome === 'Hóspede (Pendente)';
                  const modoCard = resolverModoInicialVisita(e);
                  const cpfDig = soDigitos(e.cpf);
                  const temFacialPronta = Boolean(e.tem_foto && cpfDig.length === 11 && !ehPlaceholder);
                  const cpfFormatadoCompleto =
                    cpfDig.length === 11
                      ? `${cpfDig.slice(0, 3)}.${cpfDig.slice(3, 6)}.${cpfDig.slice(6, 9)}-${cpfDig.slice(9)}`
                      : e.cpf || 'Sem CPF';

                  return (
                    <div
                      key={e.id}
                      className={`rounded-2xl transition overflow-hidden flex flex-col justify-between ${
                        ehPreAprovado
                          ? 'border-2 border-emerald-500 bg-emerald-50/70 shadow-md hover:shadow-lg'
                          : 'border border-slate-200 bg-slate-50/70 hover:bg-white hover:shadow-md'
                      }`}
                    >
                      {/* Faixa de Pré-Aprovação pelo Morador */}
                      {ehPreAprovado ? (
                        <div className="bg-emerald-600 text-white px-4 py-2 flex items-center justify-between gap-2 text-xs font-black">
                          <span className="truncate flex items-center gap-1.5">
                            <CheckCircle2 size={15} className="shrink-0" />
                            APROVADO PELO MORADOR: {e.morador_nome || 'Morador'}
                          </span>
                          {temFacialPronta && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-white/20 shrink-0">
                              📸 Facial Pronta
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="bg-amber-100/90 text-amber-900 px-4 py-1.5 flex items-center justify-between gap-2 text-[11px] font-extrabold border-b border-amber-200">
                          <span className="truncate">
                            {e.status === 'convite'
                              ? `📩 Link enviado por ${e.morador_nome || 'Morador'} (aguardando preenchimento)`
                              : '📋 Cadastro aguardando conferência'}
                          </span>
                        </div>
                      )}

                      <div className="p-4 flex flex-col justify-between flex-1 gap-3">
                        <div className="flex gap-3.5 items-start">
                          <FotoUsuario
                            rota={`foto_registro&tipo=visita&id=${e.id}`}
                            temFoto={e.tem_foto}
                            tamanho={72}
                            redonda
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap mb-1">
                              {e.origem === 'temporada' ? (
                                <span className="px-2 py-0.5 rounded text-[11px] font-extrabold bg-violet-100 text-violet-800">
                                  🧳 Airbnb / Temporada
                                </span>
                              ) : e.origem === 'festa' ? (
                                <span className="px-2 py-0.5 rounded text-[11px] font-extrabold bg-pink-100 text-pink-800">
                                  🎉 Lista de Evento
                                </span>
                              ) : null}
                              {e.placa_veiculo && (
                                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-black bg-indigo-100 text-indigo-900 border border-indigo-200">
                                  🚗 {e.placa_veiculo}
                                </span>
                              )}
                            </div>

                            <div className="font-black text-slate-900 text-base leading-tight truncate">{e.nome}</div>
                            <div className="text-xs font-mono font-bold text-slate-700 mt-1 flex items-center gap-1.5">
                              <span>CPF: {cpfReveladoCard[e.id] ? cpfFormatadoCompleto : mascaraDoc(e.cpf)}</span>
                              {cpfDig.length === 11 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCpfReveladoCard((prev) => ({ ...prev, [e.id]: !prev[e.id] }))
                                  }
                                  className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-sans font-bold text-blue-700 hover:bg-blue-50 cursor-pointer"
                                  title="Mostrar/ocultar dígitos do CPF para conferência visual"
                                >
                                  {cpfReveladoCard[e.id] ? 'Ocultar' : 'Ver CPF'}
                                </button>
                              )}
                            </div>

                            <div className="mt-2 p-2 rounded-xl bg-white border border-slate-200/90 space-y-0.5 text-xs">
                              <div className="font-extrabold text-slate-900 truncate">
                                🏠 Destino:{' '}
                                <span className="text-blue-700">{e.unidade_label || 'Unidade não informada'}</span>
                              </div>
                              <div className="text-slate-600 truncate">
                                👤 Morador: <b className="text-slate-800">{e.morador_nome || '—'}</b>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Seletor rápido de Terminal Destino (Pedestre vs Motorista) quando já tem dados */}
                        {!ehPlaceholder && (
                          <div className="p-2 rounded-xl bg-white/90 border border-slate-200 space-y-1.5">
                            <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                              Enviar acesso facial de visitante para:
                            </div>
                            <div className="grid grid-cols-3 gap-1">
                              {(
                                [
                                  ['pedestre', '🚶 Pedestre'],
                                  ['motorista', '🚗 Motorista'],
                                  ['ambos', '🔄 Ambos'],
                                ] as const
                              ).map(([idModo, rotModo]) => (
                                <button
                                  key={idModo}
                                  type="button"
                                  onClick={() =>
                                    setModoPorCard((prev) => ({ ...prev, [e.id]: idModo }))
                                  }
                                  className={`py-1.5 px-2 rounded-lg text-[11px] font-extrabold border transition cursor-pointer ${
                                    modoCard === idModo
                                      ? idModo === 'motorista'
                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                        : 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                  }`}
                                >
                                  {rotModo}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="space-y-2 pt-0.5">
                          {/* Botão principal de Aceite Rápido (1 clique) quando pré-aprovado com cadastro preenchido */}
                          {ehPreAprovado && !ehPlaceholder ? (
                            <>
                              <button
                                type="button"
                                disabled={ocupado !== null}
                                onClick={() => darAceiteRapidoPreAprovado(e, false)}
                                className="w-full py-3 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
                              >
                                <CheckCircle2 size={18} />
                                {ocupado === `aceite-${e.id}`
                                  ? '⏳ Enviando ao Terminal...'
                                  : temFacialPronta
                                    ? `DAR ACEITE (${modoCard === 'motorista' ? '🚗 Facial Motorista' : modoCard === 'ambos' ? '🔄 Pedestre + Motorista' : '🚶 Facial Pedestre'})`
                                    : 'DAR ACEITE (Registrar Entrada)'}
                              </button>

                              <div className="flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => abrirModalConferencia(e)}
                                  className="flex-1 py-2 px-2.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-extrabold text-xs flex items-center justify-center gap-1 cursor-pointer"
                                  title="Abrir detalhes, capturar selfie se faltar ou acionar abertura imediata do portão"
                                >
                                  🔍 Detalhes / Abrir Portão
                                </button>
                                {e.unidade_id && modulos.interfone && (
                                  <button
                                    type="button"
                                    onClick={() => ligarParaUnidade({ unidade_id: e.unidade_id! })}
                                    className="py-2 px-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                                    title="Interfonar para a unidade"
                                  >
                                    <PhoneCall size={13} />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={ocupado !== null}
                                  onClick={() => revogarOuDarSaidaVisita(e.id, e.nome, false)}
                                  className="py-2 px-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-xs flex items-center gap-1 cursor-pointer"
                                  title="Cancelar convite / recusar"
                                >
                                  <Ban size={13} />
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              {e.unidade_id && modulos.interfone && (
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => ligarParaUnidade({ unidade_id: e.unidade_id! })}
                                    className="flex-1 py-1.5 px-2.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-extrabold flex items-center justify-center gap-1 cursor-pointer"
                                  >
                                    <PhoneCall size={13} /> Interfonar p/ Unidade
                                  </button>
                                  {e.morador_telefone && (
                                    <a
                                      href={`https://wa.me/55${soDigitos(e.morador_telefone)}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="py-1.5 px-2.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 text-xs font-extrabold flex items-center gap-1"
                                    >
                                      <MessageCircle size={13} /> Zap
                                    </a>
                                  )}
                                </div>
                              )}
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => abrirModalConferencia(e)}
                                  className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                                >
                                  <CheckCircle2 size={16} />
                                  Completar & Liberar
                                </button>
                                <button
                                  type="button"
                                  disabled={ocupado !== null}
                                  onClick={() => revogarOuDarSaidaVisita(e.id, e.nome, false)}
                                  className="py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-xs flex items-center gap-1 cursor-pointer"
                                  title="Cancelar convite / revogar acesso"
                                >
                                  <Ban size={14} />
                                  Cancelar
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center rounded-2xl bg-slate-50 border border-dashed border-slate-300 space-y-2">
                <div className="text-slate-600 font-bold text-sm">
                  Nenhum visitante aguardando na fila neste momento.
                </div>
                <div className="text-xs text-slate-400">
                  Quando um morador enviar convite ou chegar alguém sem convite, use o botão{' '}
                  <b>+ Visitante / Prestador Sem Convite</b> acima.
                </div>
              </div>
            )}
          </div>

          {/* Seção 2: No Condomínio Agora / Com Facial Ativa */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <LogOut size={20} className="text-emerald-600" />
                  Visitantes no Condomínio Agora / Com Facial Ativa
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-800">
                    {presentesVisitas.length + ativas.length}
                  </span>
                </h3>
                <p className="text-xs text-slate-500">
                  Inclui visitantes liberados como Pedestre ou Motorista. Clicar em{' '}
                  <b>Dar Saída / Revogar Facial</b> apaga imediatamente o rosto de todos os leitores faciais.
                </p>
              </div>
            </div>

            {presentesVisitas.length === 0 && ativas.length === 0 ? (
              <div className="p-5 text-center text-xs font-semibold text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
                Nenhum visitante registrado dentro do condomínio neste momento.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {presentesVisitas.map((pv) => (
                  <div
                    key={`vis-${pv.id}`}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FotoUsuario rota={`foto_registro&tipo=visita&id=${pv.id}`} temFoto={pv.tem_foto} tamanho={48} redonda />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-extrabold text-slate-900 text-sm truncate">{pv.nome}</span>
                          {pv.facial_ativa ? (
                            pv.modo_entrada === 'motorista' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-300">
                                🚗 Facial Motorista Ativa
                              </span>
                            ) : pv.modo_entrada === 'ambos' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                🔄 Facial Pedestre + Motorista
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                🟢 Facial Pedestre Ativa
                              </span>
                            )
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                              📝 Entrada Registrada
                            </span>
                          )}
                          {pv.placa_veiculo && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-white border border-slate-200 text-slate-700">
                              🚗 {pv.placa_veiculo}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-600 truncate mt-0.5">
                          {pv.unidade_label ? <b>{pv.unidade_label}</b> : 'Portaria'}{' '}
                          {pv.morador_nome ? `• Aut.: ${pv.morador_nome}` : ''}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          Entrada: {fmtHora(pv.data_entrada)}
                          {pv.expira_em ? ` • Válido até ${fmtData(pv.expira_em)}` : ''}
                          {pv.terminais_liberados ? ` • [${pv.terminais_liberados}]` : ''}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={ocupado !== null}
                      onClick={() => revogarOuDarSaidaVisita(pv.id, pv.nome, true)}
                      className="px-3.5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      🚪 Dar Saída / Revogar Facial
                    </button>
                  </div>
                ))}

                {ativas.map((a) => (
                  <div
                    key={`log-${a.id}`}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-extrabold text-slate-900 text-sm truncate">{a.nome_externo || 'Visitante'}</div>
                      {a.observacao && <div className="text-xs text-slate-500 truncate">{a.observacao}</div>}
                      <div className="text-[11px] text-slate-400">Entrada hoje às {fmtHora(a.data_hora)}</div>
                    </div>
                    <button
                      type="button"
                      disabled={ocupado !== null}
                      onClick={() => registrarSaidaLogManual(a)}
                      className="px-3.5 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white font-extrabold text-xs shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      Registrar Saída
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          ABA 2: ENCOMENDAS (RECEBER NA HORA + SCANNER + IA + ENTREGAR)
         ===================================================================== */}
      {abaAtiva === 'encomendas' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <Package size={22} className="text-emerald-600" />
                Recebimento e Retirada de Encomendas
              </h2>
              <p className="text-xs text-slate-500">
                Bipe o código de barras/QR ou fotografe a etiqueta — o morador recebe Push no App e WhatsApp na hora!
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="relative min-w-[230px]">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={buscaEncomenda}
                  onChange={(e) => setBuscaEncomenda(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && buscaEncomenda.trim().length >= 6) {
                      e.preventDefault();
                      localizarEncomendaPorCodigoNaPortaria(buscaEncomenda);
                    }
                  }}
                  placeholder="Filtrar ou bipar pacote/QR..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:border-emerald-600"
                />
              </div>
              <button
                type="button"
                onClick={() => setScannerEncModo('localizar')}
                className="px-4 py-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 font-extrabold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer"
                title="Escanear código da caixa ou QR Code do celular do morador para dar baixa"
              >
                <Barcode size={17} />
                Bipar Baixa
              </button>
              <button
                type="button"
                onClick={abrirModalReceberEncomenda}
                className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-md flex items-center gap-2 cursor-pointer"
              >
                <Plus size={18} />
                📦 Receber Nova Encomenda
              </button>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2 items-start">
            {/* Prateleira: Na Portaria aguardando retirada */}
            <div className="bg-white rounded-2xl border border-slate-200 border-t-4 border-t-emerald-500 p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-slate-900 text-base">
                  Na Portaria — Aguardando Retirada
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800">
                  {encNaPrateleira.length}
                </span>
              </div>

              {encNaPrateleira.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-400 bg-slate-50 rounded-xl">
                  Nenhum pacote aguardando retirada na prateleira.
                </div>
              ) : (
                <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                  {encNaPrateleira.map((e) => (
                    <div
                      key={e.id}
                      className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 flex items-center justify-between gap-3 flex-wrap"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-emerald-800 bg-emerald-100 inline-block px-2 py-0.5 rounded mb-1">
                          {e.bloco_nome ? `${e.bloco_nome} - ` : ''}Unid. {e.unidade_nome || 'Geral'}
                        </div>
                        <div className="font-black text-slate-900 text-base">{e.morador_nome || 'Morador da Unidade'}</div>
                        <div className="text-xs font-bold text-slate-700 mt-0.5">
                          📦 {e.empresa} {e.observacoes ? `• ${e.observacoes}` : ''}
                        </div>
                        {e.codigo_rastreio && (
                          <div className="text-[11px] font-mono font-bold text-slate-600 mt-0.5">
                            🔖 Volume: {e.codigo_rastreio}
                          </div>
                        )}
                        <div className="text-[11px] text-slate-500 mt-0.5">Recebido em {fmtData(e.data_recebimento)}</div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setEncEntregarModal(e);
                          setEncCodigoRetirada('');
                          setEncSemCodigo(false);
                          setEncRetiradoPor(e.morador_nome || '');
                        }}
                        className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm cursor-pointer shrink-0"
                      >
                        Entregar Pacote
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Avisadas previamente pelo morador */}
            <div className="bg-white rounded-2xl border border-slate-200 border-t-4 border-t-amber-500 p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-slate-900 text-base">Previsões Avisadas pelos Moradores</h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-800">
                  {encPreAvisadas.length}
                </span>
              </div>

              {encPreAvisadas.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-400 bg-slate-50 rounded-xl">
                  Nenhuma entrega pré-avisada pendente. Use o botão verde <b>Receber Nova Encomenda</b> para qualquer pacote que chegar!
                </div>
              ) : (
                <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                  {encPreAvisadas.map((e) => (
                    <div
                      key={e.id}
                      className="p-4 rounded-xl bg-amber-50/60 border border-amber-200 flex items-center justify-between gap-3 flex-wrap"
                    >
                      <div>
                        <div className="text-xs font-extrabold text-amber-800 bg-amber-100 inline-block px-2 py-0.5 rounded mb-1">
                          {e.bloco_nome ? `${e.bloco_nome} - ` : ''}Unid. {e.unidade_nome || 'Geral'}
                        </div>
                        <div className="font-black text-slate-900 text-base">{e.morador_nome || 'Morador'}</div>
                        <div className="text-xs font-bold text-slate-700">📦 {e.empresa}</div>
                        {e.pin_entrega && (
                          <div className="mt-1 text-xs font-mono font-extrabold text-amber-900">
                            PIN / Senha informada: {e.pin_entrega}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={ocupado !== null}
                        onClick={() => confirmarChegadaEncomendaPreAvisada(e)}
                        className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs sm:text-sm cursor-pointer"
                      >
                        Confirmar Chegada
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          ABA 3: INTERFONE & VOIP (NAVEGADOR + TELEFONE IP SIP 5060)
         ===================================================================== */}
      {abaAtiva === 'interfone' && (
        <div className="space-y-5">
          {/* Card Status Telefone IP Físico (SIP) + Credenciais */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                    sipInfo?.registrado_online ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <PhoneCall size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-black text-slate-900 text-base sm:text-lg">
                      Interfone da Portaria (Navegador + Telefone IP)
                    </h2>
                    {sipInfo?.registrado_online ? (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        🟢 Telefone IP Online • Ramal {sipInfo.ramal} ({sipInfo.ip_remoto})
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                        💻 Operando pelo Navegador (Ramal IP {sipInfo?.ramal || '—'} pronto p/ registro)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Você pode ligar e atender direto aqui pelo navegador (com microfone/caixa de som) <b>e também</b> registrar um Telefone IP físico na guarita.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setMostrarCredenciaisSip((v) => !v)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-extrabold text-slate-700 flex items-center gap-1.5 cursor-pointer"
              >
                <Settings size={14} />
                {mostrarCredenciaisSip ? 'Ocultar Dados do Telefone IP' : 'Configurar Telefone IP (SIP)'}
              </button>
            </div>

            {mostrarCredenciaisSip && sipInfo && (
              <div className="p-4 rounded-xl bg-slate-900 text-slate-100 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                <div>
                  <div className="text-slate-400 font-bold uppercase text-[10px]">Servidor SIP / Proxy</div>
                  <div className="font-mono font-bold text-sm mt-0.5">{sipInfo.servidor}</div>
                  <div className="text-slate-400 text-[11px]">Porta {sipInfo.porta} ({sipInfo.transporte})</div>
                </div>
                <div>
                  <div className="text-slate-400 font-bold uppercase text-[10px]">Ramal / Usuário SIP</div>
                  <div className="font-mono font-bold text-sm mt-0.5 text-emerald-300">{sipInfo.usuario}</div>
                  <div className="text-slate-400 text-[11px]">Codec: {sipInfo.codec}</div>
                </div>
                <div>
                  <div className="text-slate-400 font-bold uppercase text-[10px]">Senha SIP</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono font-bold text-sm text-amber-300">
                      {mostrarSenhaSip ? sipInfo.senha : '••••••••••••'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setMostrarSenhaSip((v) => !v)}
                      className="px-2 py-0.5 rounded bg-slate-800 text-[11px] font-bold cursor-pointer"
                    >
                      {mostrarSenhaSip ? 'Ocultar' : 'Ver'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(sipInfo.senha);
                        setAviso({ tipo: 'ok', mensagem: 'Senha SIP copiada para a área de transferência!' });
                      }}
                      className="p-1 rounded bg-slate-800 cursor-pointer"
                      title="Copiar senha SIP"
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 font-bold uppercase text-[10px]">Status do Aparelho IP</div>
                  <div className="font-bold text-sm mt-0.5">
                    {sipInfo.registrado_online ? `Conectado (${sipInfo.ultimo_registro})` : 'Aguardando aparelho'}
                  </div>
                  {sipInfo.user_agent && <div className="text-slate-400 text-[11px] truncate">{sipInfo.user_agent}</div>}
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-5 lg:grid-cols-5 items-start">
            {/* Discador Rápido para Unidades / Moradores (3 colunas) */}
            <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h3 className="font-black text-slate-900 text-base">📞 Ligar para Unidade / Morador</h3>
                  <p className="text-[11px] text-slate-500">
                    Pesquisa inteligente: digite <b>rua 2</b>, <b>1A 002</b>, <b>5b 10</b> ou o nome do morador
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMostrarTecladoVoip((v) => !v)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  🔢 {mostrarTecladoVoip ? 'Ocultar Teclado' : 'Teclado Numérico'}
                </button>
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={buscaDiscador}
                    onChange={(e) => setBuscaDiscador(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && buscaDiscador.trim()) {
                        e.preventDefault();
                        if (unidadesDiscadorFiltradas.length === 1) {
                          ligarParaUnidade({ unidade_id: unidadesDiscadorFiltradas[0].id });
                        } else if (unidadesDiscadorFiltradas.length > 0 && /\s/.test(buscaDiscador.trim())) {
                          ligarParaUnidade({ unidade_id: unidadesDiscadorFiltradas[0].id });
                        } else {
                          ligarParaUnidade({ codigo: buscaDiscador.trim() });
                        }
                      }
                    }}
                    placeholder="Ex.: rua 2, 1A 002, 5b 1 ou nome do morador..."
                    className="w-full pl-10 pr-9 py-3 rounded-xl border-2 border-slate-200 focus:border-indigo-600 outline-none text-sm font-bold"
                  />
                  {buscaDiscador && (
                    <button
                      type="button"
                      onClick={() => setBuscaDiscador('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      aria-label="Limpar pesquisa"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                {buscaDiscador.trim() && (
                  <button
                    type="button"
                    disabled={ocupado !== null}
                    onClick={() => {
                      if (unidadesDiscadorFiltradas.length === 1) {
                        ligarParaUnidade({ unidade_id: unidadesDiscadorFiltradas[0].id });
                      } else if (unidadesDiscadorFiltradas.length > 0 && /\s/.test(buscaDiscador.trim())) {
                        ligarParaUnidade({ unidade_id: unidadesDiscadorFiltradas[0].id });
                      } else {
                        ligarParaUnidade({ codigo: buscaDiscador.trim() });
                      }
                    }}
                    className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <PhoneCall size={16} /> Chamar
                  </button>
                )}
              </div>

              {/* Barra de Atalhos Rápidos por Rua / Bloco (1 Clique) */}
              {gruposRuasCondominio.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setGrupoRuaDiscador('')}
                    className={`px-3 py-1.5 rounded-full text-xs font-extrabold border shrink-0 transition cursor-pointer ${
                      grupoRuaDiscador === ''
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    Todas ({catalogoUnidades.length})
                  </button>
                  {gruposRuasCondominio.map((g) => (
                    <button
                      key={g.chave}
                      type="button"
                      onClick={() => setGrupoRuaDiscador((atual) => (atual === g.chave ? '' : g.chave))}
                      className={`px-3 py-1.5 rounded-full text-xs font-extrabold border shrink-0 transition cursor-pointer ${
                        grupoRuaDiscador === g.chave
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-indigo-50'
                      }`}
                    >
                      {g.label} ({g.total})
                    </button>
                  ))}
                </div>
              )}

              {mostrarTecladoVoip && (
                <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-200 max-w-xs mx-auto">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Limpar', '0', '⌫'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        if (t === 'Limpar') setBuscaDiscador('');
                        else if (t === '⌫') setBuscaDiscador((v) => v.slice(0, -1));
                        else setBuscaDiscador((v) => v + t);
                      }}
                      className="py-2.5 rounded-xl bg-white hover:bg-indigo-50 border border-slate-200 font-black text-slate-800 cursor-pointer"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 px-1">
                <span>
                  Exibindo <b>{unidadesDiscadorFiltradas.length}</b> de {catalogoUnidades.length} unidades
                </span>
                {(buscaDiscador || grupoRuaDiscador) && (
                  <button
                    type="button"
                    onClick={() => {
                      setBuscaDiscador('');
                      setGrupoRuaDiscador('');
                    }}
                    className="text-indigo-600 hover:underline cursor-pointer"
                  >
                    Mostrar todas as ruas
                  </button>
                )}
              </div>

              <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                {unidadesDiscadorFiltradas.map((u, idx) => {
                  const temApp = u.moradores.some((m) => m.tem_app);
                  const blocoAnt = idx > 0 ? unidadesDiscadorFiltradas[idx - 1].bloco_nome : null;
                  const mostrarCabecalhoBloco = u.bloco_nome && u.bloco_nome !== blocoAnt && !buscaDiscador.trim();

                  return (
                    <div key={u.id} className="space-y-1.5">
                      {mostrarCabecalhoBloco && (
                        <div className="sticky top-0 z-10 px-3 py-1 rounded-lg bg-indigo-50/95 border border-indigo-200/80 text-[11px] font-black uppercase tracking-wider text-indigo-900">
                          📍 {u.bloco_nome}
                        </div>
                      )}
                      <div className="p-3 rounded-xl border border-slate-200 hover:border-indigo-300 bg-slate-50/70 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-slate-900 text-sm">{u.label}</span>
                            {temApp ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                                📱 App Ativo
                              </span>
                            ) : u.moradores.length > 0 ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">
                                Sem push ativo
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs text-slate-500 truncate">
                            {u.moradores.length > 0
                              ? u.moradores.map((m) => m.nome).join(', ')
                              : 'Nenhum morador vinculado'}
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={ocupado !== null}
                          onClick={() => ligarParaUnidade({ unidade_id: u.id })}
                          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
                        >
                          <PhoneCall size={14} /> Ligar
                        </button>
                      </div>
                    </div>
                  );
                })}
                {unidadesDiscadorFiltradas.length === 0 && (
                  <div className="p-6 text-center text-sm text-slate-400">Nenhuma unidade encontrada para esta busca.</div>
                )}
              </div>
            </div>

            {/* Histórico de Chamadas do Condomínio (2 colunas) */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-slate-900 text-base">📋 Últimas Ligações</h3>
                <button
                  type="button"
                  onClick={carregarInterfone}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                >
                  <RefreshCw size={14} />
                </button>
              </div>

              {historicoVoip.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
                  Nenhuma chamada registrada ainda.
                </div>
              ) : (
                <div className="space-y-2 max-h-[490px] overflow-y-auto pr-1">
                  {historicoVoip.map((h) => (
                    <div
                      key={h.id}
                      className="p-3 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-extrabold text-slate-900">
                          {h.direcao === 'realizada' ? (
                            <PhoneOutgoing size={13} className="text-indigo-600 shrink-0" />
                          ) : (
                            <PhoneIncoming size={13} className="text-emerald-600 shrink-0" />
                          )}
                          <span className="truncate">
                            {h.origem_nome} ➔ {h.destino_nome}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {h.data_hora} •{' '}
                          <b
                            className={
                              h.status === 'answered' || h.status === 'ended'
                                ? 'text-emerald-700'
                                : 'text-rose-600'
                            }
                          >
                            {h.status === 'answered' || h.status === 'ended'
                              ? `Atendida (${h.duracao_segundos}s)`
                              : h.status === 'missed'
                                ? 'Não atendida'
                                : h.status === 'rejected'
                                  ? 'Recusada'
                                  : 'Cancelada'}
                          </b>
                        </div>
                      </div>
                      {h.destino_unidade_id && (
                        <button
                          type="button"
                          onClick={() => ligarParaUnidade({ unidade_id: h.destino_unidade_id! })}
                          className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-indigo-50 text-indigo-700 font-bold shrink-0 cursor-pointer"
                        >
                          Ligar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 1: CONFERÊNCIA RÁPIDA E LIBERAÇÃO DE VISITANTE ESPERADO
         ===================================================================== */}
      {visitaConferindo && (
        <div
          className="fixed inset-0 z-[260] bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setVisitaConferindo(null);
          }}
        >
          <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden border-t-[6px] border-t-emerald-500">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900">✅ Conferência Rápida de Visitante</h2>
                <p className="text-xs text-slate-500">Confirme os dados abaixo e clique em Liberar</p>
              </div>
              <button
                onClick={() => setVisitaConferindo(null)}
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Foto + Nome do Visitante */}
              <div className="flex gap-4 items-center flex-wrap">
                <FotoUsuario
                  rota={`foto_registro&tipo=visita&id=${visitaConferindo.id}`}
                  temFoto={visitaConferindo.tem_foto}
                  largura={104}
                  altura={124}
                />
                <div className="flex-1 min-w-[200px] space-y-2">
                  <label className="text-[11px] font-extrabold uppercase text-slate-500 block">
                    Nome do Visitante
                  </label>
                  <input
                    value={nomeConferencia}
                    onChange={(e) => setNomeConferencia(e.target.value)}
                    placeholder="Digite o nome completo do visitante..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-extrabold text-slate-900 text-base"
                  />
                  {visitaConferindo.tem_documento && (
                    <button
                      type="button"
                      onClick={() => verDocumentoVisita(visitaConferindo.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-extrabold cursor-pointer"
                    >
                      <Eye size={14} /> Ver Documento Anexado (Airbnb)
                    </button>
                  )}
                </div>
              </div>

              {/* Se o convite não tinha foto ainda, permite capturar pela webcam */}
              {!visitaConferindo.tem_foto && (
                <div>
                  <label className="text-xs font-extrabold text-slate-600 block mb-1">
                    Convite sem selfie prévia — capture a foto para liberar o facial (opcional):
                  </label>
                  <CapturadorFotoPortaria fotoBase64={fotoConferencia} onFotoChange={setFotoConferencia} />
                </div>
              )}

              {/* Roteiro de Perguntas-Chave para o Porteiro */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="text-xs font-black uppercase tracking-wider text-blue-700 flex items-center gap-1.5">
                  <Sparkles size={14} /> Perguntas-Chave no Balcão
                </div>

                <div className="grid sm:grid-cols-2 gap-2.5 text-sm">
                  <div className="p-3 rounded-xl bg-white border border-slate-200">
                    <div className="text-[11px] font-bold text-slate-400 uppercase">1. Vai para qual unidade?</div>
                    <div className="font-black text-slate-900 text-base mt-0.5">
                      {visitaConferindo.unidade_label || 'Não especificada'}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-slate-400 uppercase">2. Quem autorizou?</div>
                      <div className="font-black text-slate-900 text-base mt-0.5 truncate">
                        {visitaConferindo.morador_nome || 'Morador'}
                      </div>
                    </div>
                    {visitaConferindo.unidade_id && modulos.interfone && (
                      <button
                        type="button"
                        onClick={() => ligarParaUnidade({ unidade_id: visitaConferindo.unidade_id! })}
                        className="p-2 rounded-xl bg-indigo-100 hover:bg-indigo-200 text-indigo-700 shrink-0 cursor-pointer"
                        title="Ligar para o morador agora"
                      >
                        <PhoneCall size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Pergunta 3: Conferência do CPF */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-extrabold text-slate-700">
                      3. Qual o CPF informado pelo visitante?
                    </label>
                    {visitaConferindo.cpf && (
                      <button
                        type="button"
                        onClick={() => setCpfDigitadoBalcao(soDigitos(visitaConferindo.cpf))}
                        className="text-[11px] font-extrabold text-blue-600 hover:underline cursor-pointer"
                      >
                        🪪 Conferido pelo documento em mãos
                      </button>
                    )}
                  </div>
                  <input
                    autoFocus
                    value={cpfDigitadoBalcao}
                    onChange={(e) => setCpfDigitadoBalcao(e.target.value)}
                    placeholder="Digite apenas os números falados pelo visitante..."
                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-300 focus:border-blue-600 outline-none font-mono font-bold text-base bg-white"
                  />
                  {statusConferenciaCpf && (
                    <div
                      className={`mt-1.5 px-3 py-2 rounded-xl text-xs font-extrabold ${
                        statusConferenciaCpf.tipo === 'ok'
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          : statusConferenciaCpf.tipo === 'erro'
                            ? 'bg-rose-100 text-rose-900 border border-rose-300'
                            : 'bg-blue-50 text-blue-800 border border-blue-200'
                      }`}
                    >
                      {statusConferenciaCpf.texto}
                    </div>
                  )}
                </div>
              </div>

              {/* Seletor de Terminal Destino (Pedestre vs Motorista) + Biometria Facial */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200 space-y-2.5">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={liberarFacialCheck}
                    onChange={(e) => setLiberarFacialCheck(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600"
                  />
                  <span className="text-xs font-extrabold text-emerald-950">
                    Enviar biometria automática como <b>Visitante</b> no terminal facial:
                  </span>
                </label>

                {liberarFacialCheck && (
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        ['pedestre', '🚶 Terminal Pedestre'],
                        ['motorista', '🚗 Terminal Motorista'],
                        ['ambos', '🔄 Pedestre + Motorista'],
                      ] as const
                    ).map(([idM, rotM]) => (
                      <button
                        key={idM}
                        type="button"
                        onClick={() => setModoConferencia(idM)}
                        className={`py-2 px-2 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
                          modoConferencia === idM
                            ? idM === 'motorista'
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                              : 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {rotM}
                      </button>
                    ))}
                  </div>
                )}

                {(modoConferencia === 'motorista' || modoConferencia === 'ambos' || placaConferencia) && (
                  <input
                    value={placaConferencia}
                    onChange={(e) => setPlacaConferencia(e.target.value.toUpperCase())}
                    maxLength={10}
                    placeholder="Placa do veículo do visitante (opcional, ex.: ABC1D23)..."
                    className="w-full px-3 py-2 rounded-xl border border-indigo-200 bg-white text-xs font-mono font-bold uppercase"
                  />
                )}
              </div>

              <input
                value={obsConferencia}
                onChange={(e) => setObsConferencia(e.target.value)}
                placeholder="Observação opcional (ex.: acompanhante, empresa)..."
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs"
              />

              {/* Botões de Ação */}
              <div className="space-y-2.5 pt-1">
                <div className="grid sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={ocupado !== null}
                    onClick={() => confirmarLiberacaoVisita(false)}
                    className="py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-md cursor-pointer disabled:opacity-50"
                  >
                    {ocupado === 'liberar'
                      ? '⏳ Liberando...'
                      : modoConferencia === 'motorista'
                        ? '✅ ACEITAR (FACIAL MOTORISTA)'
                        : modoConferencia === 'ambos'
                          ? '✅ ACEITAR (PEDESTRE + MOTORISTA)'
                          : '✅ ACEITAR (FACIAL PEDESTRE)'}
                  </button>
                  <button
                    type="button"
                    disabled={ocupado !== null}
                    onClick={() => confirmarLiberacaoVisita(true)}
                    className="py-3.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm shadow-md cursor-pointer disabled:opacity-50"
                  >
                    {ocupado === 'liberar-abrir' ? '⏳ Abrindo...' : '🔓 ACEITAR + ABRIR PORTÃO AGORA'}
                  </button>
                </div>

                <button
                  type="button"
                  disabled={ocupado !== null}
                  onClick={() => revogarOuDarSaidaVisita(visitaConferindo.id, visitaConferindo.nome, false)}
                  className="w-full py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-extrabold text-xs cursor-pointer"
                >
                  🚫 Não Liberar / Cancelar Convite e Remover do Leitor
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: VISITANTE / PRESTADOR SEM CONVITE (LIBERAR OU SÓ REGISTRAR)
         ===================================================================== */}
      {modalSemConvite && (
        <div
          className="fixed inset-0 z-[260] bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalSemConvite(false);
          }}
        >
          <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden border-t-[6px] border-t-indigo-600">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900">➕ Entrada Sem Convite (Visitante / Prestador)</h2>
                <p className="text-xs text-slate-500">
                  Você pode liberar o acesso ou apenas registrar no sistema informando quem autorizou
                </p>
              </div>
              <button
                onClick={() => setModalSemConvite(false)}
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Tipo de Visitante */}
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ['visita', '🧍 Visita'],
                    ['prestador', '🔧 Prestador'],
                    ['entrega', '🛵 Entrega'],
                    ['corretor', '🏠 Corretor'],
                    ['outro', '📋 Outro'],
                  ] as const
                ).map(([id, rot]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setAvulsoTipo(id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border cursor-pointer ${
                      avulsoTipo === id
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    {rot}
                  </button>
                ))}
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-extrabold text-slate-700 block mb-1">Nome Completo *</label>
                  <input
                    autoFocus
                    value={avulsoNome}
                    onChange={(e) => setAvulsoNome(e.target.value)}
                    placeholder="Nome do visitante/prestador..."
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-extrabold text-slate-700 block mb-1">
                    CPF {avulsoLiberarFacial ? '*' : '(opcional)'}
                  </label>
                  <input
                    value={avulsoCpf}
                    onChange={(e) => setAvulsoCpf(e.target.value)}
                    placeholder="Somente números..."
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-sm font-mono font-bold"
                  />
                </div>
              </div>

              {/* Destino (Unidade) + Atalho para Interfonar */}
              <div>
                <label className="text-xs font-extrabold text-slate-700 block mb-1">
                  Unidade Destino (opcional — selecione para ligar ou vincular ao morador)
                </label>
                {avulsoUnid ? (
                  <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <div className="font-extrabold text-indigo-950 text-sm">{avulsoUnid.label}</div>
                      {avulsoUnid.moradores.length > 0 && (
                        <div className="text-xs text-indigo-700">
                          Morador(es): {avulsoUnid.moradores.map((m) => m.nome).join(', ')}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {modulos.interfone && (
                        <button
                          type="button"
                          onClick={() => ligarParaUnidade({ unidade_id: avulsoUnid.id })}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                        >
                          <PhoneCall size={13} /> Ligar p/ Unidade
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setAvulsoUnid(null);
                          setAvulsoMoradorId(0);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-indigo-200 text-xs font-bold text-indigo-700 cursor-pointer"
                      >
                        Trocar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <input
                      value={avulsoBuscaUnid}
                      onChange={(e) => setAvulsoBuscaUnid(e.target.value)}
                      placeholder="Ex.: rua 2, 1A 002, 5b 10 ou nome do morador..."
                      className="w-full p-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
                    />
                    {gruposRuasCondominio.length > 0 && (
                      <div className="mt-1.5 flex items-center gap-1 overflow-x-auto pb-1">
                        <button
                          type="button"
                          onClick={() => setAvulsoGrupoRua('')}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold border shrink-0 cursor-pointer ${
                            avulsoGrupoRua === ''
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          Todas
                        </button>
                        {gruposRuasCondominio.map((g) => (
                          <button
                            key={g.chave}
                            type="button"
                            onClick={() => setAvulsoGrupoRua((atual) => (atual === g.chave ? '' : g.chave))}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold border shrink-0 cursor-pointer ${
                              avulsoGrupoRua === g.chave
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-indigo-50'
                            }`}
                          >
                            {g.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {(avulsoBuscaUnid.trim() || avulsoGrupoRua) && (
                      <div className="mt-1.5 max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                        {unidadesAvulsoFiltradas.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => {
                              setAvulsoUnid(u);
                              if (u.moradores[0]) {
                                setAvulsoMoradorId(u.moradores[0].id);
                                setAvulsoAutorizadoTexto(u.moradores[0].nome);
                              }
                            }}
                            className="w-full px-3 py-2 text-left hover:bg-indigo-50 flex justify-between items-center text-xs cursor-pointer"
                          >
                            <span>
                              <b>{u.label}</b>{' '}
                              {u.moradores.length > 0 ? `(${u.moradores.map((m) => m.nome).join(', ')})` : ''}
                            </span>
                            <span className="font-bold text-indigo-600">Escolher</span>
                          </button>
                        ))}
                        {unidadesAvulsoFiltradas.length === 0 && (
                          <div className="p-3 text-center text-xs text-slate-400">Nenhuma unidade encontrada.</div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Quem liberou / autorizou */}
              <div>
                <label className="text-xs font-extrabold text-slate-700 block mb-1">
                  Liberado / Autorizado por quem? (Morador ou X pessoa)
                </label>
                {avulsoUnid && avulsoUnid.moradores.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {avulsoUnid.moradores.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setAvulsoMoradorId(m.id);
                          setAvulsoAutorizadoTexto(m.nome);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer ${
                          avulsoMoradorId === m.id
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        👤 {m.nome}
                      </button>
                    ))}
                  </div>
                )}
                <input
                  value={avulsoAutorizadoTexto}
                  onChange={(e) => {
                    setAvulsoAutorizadoTexto(e.target.value);
                    setAvulsoMoradorId(0);
                  }}
                  placeholder="Ex.: Autorizado pelo morador João / Síndica / Administração..."
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
                />
              </div>

              <div>
                <label className="text-xs font-extrabold text-slate-700 block mb-1">
                  Observação (placa, empresa, motivo — opcional)
                </label>
                <input
                  value={avulsoObs}
                  onChange={(e) => setAvulsoObs(e.target.value)}
                  placeholder="Ex.: Equatorial Energia, Placa ABC1D23..."
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              {/* Modo de entrada + Opção de liberar facial temporária como Visitante */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      ['pedestre', '🚶 A Pé (Pedestre)'],
                      ['motorista', '🚗 Motorista'],
                      ['ambos', '🔄 Ambos'],
                    ] as const
                  ).map(([idM, rotM]) => (
                    <button
                      key={idM}
                      type="button"
                      onClick={() => setAvulsoModoEntrada(idM)}
                      className={`py-2 px-2 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
                        avulsoModoEntrada === idM
                          ? idM === 'motorista'
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      {rotM}
                    </button>
                  ))}
                </div>

                {(avulsoModoEntrada === 'motorista' || avulsoModoEntrada === 'ambos' || avulsoPlaca) && (
                  <input
                    value={avulsoPlaca}
                    onChange={(e) => setAvulsoPlaca(e.target.value.toUpperCase())}
                    maxLength={10}
                    placeholder="Placa do veículo (opcional, ex.: ABC1D23)..."
                    className="w-full p-2.5 rounded-xl border border-indigo-200 bg-white text-xs font-mono font-bold uppercase"
                  />
                )}

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={avulsoLiberarFacial}
                    onChange={(e) => setAvulsoLiberarFacial(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600"
                  />
                  <span className="text-xs font-extrabold text-slate-800">
                    Também cadastrar rosto temporário como <b>Visitante</b> no{' '}
                    <b>{avulsoModoEntrada === 'motorista' ? 'Terminal Motorista' : avulsoModoEntrada === 'ambos' ? 'Pedestre + Motorista' : 'Terminal Pedestre'}</b>{' '}
                    (exige CPF + Foto)
                  </span>
                </label>
                {avulsoLiberarFacial && (
                  <CapturadorFotoPortaria fotoBase64={avulsoFoto} onFotoChange={setAvulsoFoto} />
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={ocupado !== null}
                  onClick={() => salvarEntradaSemConvite(false)}
                  className="py-3.5 px-4 rounded-2xl bg-slate-800 hover:bg-slate-900 text-white font-extrabold text-sm cursor-pointer disabled:opacity-50"
                >
                  {ocupado === 'avulso-reg'
                    ? '⏳ Salvando...'
                    : avulsoLiberarFacial
                      ? '✅ Registrar + Liberar Facial'
                      : '📝 Apenas Registrar Entrada'}
                </button>
                <button
                  type="button"
                  disabled={ocupado !== null}
                  onClick={() => salvarEntradaSemConvite(true)}
                  className="py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-md cursor-pointer disabled:opacity-50"
                >
                  {ocupado === 'avulso-abrir' ? '⏳ Abrindo...' : '🔓 Registrar + Abrir Portão Agora'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: RECEBER NOVA ENCOMENDA NA PORTARIA (CÓDIGO / QR + IA ETIQUETA)
         ===================================================================== */}
      {modalNovaEnc && (
        <ModalReceberEncomendaInteligente
          unidades={catalogoUnidades}
          onFechar={() => setModalNovaEnc(false)}
          onRegistrada={(msg) => {
            setAviso({ tipo: 'ok', mensagem: msg });
            Promise.all([carregarEncomendas(), carregarPainel()]);
          }}
          onAbrirEntregaExistente={(encId) => {
            const achou = encomendasLista.find((x) => x.id === encId);
            if (achou) {
              setEncEntregarModal(achou);
              setEncCodigoRetirada('');
              setEncSemCodigo(false);
              setEncRetiradoPor(achou.morador_nome || '');
            }
          }}
        />
      )}

      {scannerEncModo && (
        <ScannerCodigoCamera
          titulo={scannerEncModo === 'entrega' ? 'Ler QR Code do Morador' : 'Bipar Pacote ou QR Code de Retirada'}
          onDetectado={(cod) => {
            const modoAtual = scannerEncModo;
            setScannerEncModo(null);
            if (modoAtual === 'entrega') {
              setEncCodigoRetirada(cod.replace(/^SECTRUM-ENC:/i, ''));
            } else {
              localizarEncomendaPorCodigoNaPortaria(cod);
            }
          }}
          onFechar={() => setScannerEncModo(null)}
        />
      )}

      {/* =====================================================================
          MODAL 4: ENTREGAR PACOTE AO MORADOR
         ===================================================================== */}
      {encEntregarModal && (
        <div
          className="fixed inset-0 z-[260] bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEncEntregarModal(null);
          }}
        >
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border-t-[6px] border-t-emerald-500 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900">📤 Entregar Pacote</h3>
              <button onClick={() => setEncEntregarModal(null)} className="cursor-pointer text-slate-400">
                <X size={18} />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <div className="font-extrabold text-slate-900 text-sm">
                {encEntregarModal.bloco_nome ? `${encEntregarModal.bloco_nome} - ` : ''}
                Unid. {encEntregarModal.unidade_nome} ({encEntregarModal.morador_nome || 'Morador'})
              </div>
              <div className="text-slate-600 mt-0.5">📦 {encEntregarModal.empresa}</div>
              {encEntregarModal.codigo_rastreio && (
                <div className="font-mono font-bold text-slate-500 mt-0.5">🔖 {encEntregarModal.codigo_rastreio}</div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setEncSemCodigo(false)}
                className={`py-2 rounded-lg text-xs font-extrabold cursor-pointer ${
                  !encSemCodigo ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                🔐 Código / QR Code
              </button>
              <button
                type="button"
                onClick={() => setEncSemCodigo(true)}
                className={`py-2 rounded-lg text-xs font-extrabold cursor-pointer ${
                  encSemCodigo ? 'bg-white text-amber-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                🪪 No Balcão (Sem App)
              </button>
            </div>

            <form onSubmit={confirmarEntregaEncomenda} className="space-y-4">
              {!encSemCodigo ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-extrabold text-slate-600">
                      CÓDIGO DE 6 DÍGITOS OU QR CODE:
                    </label>
                    <button
                      type="button"
                      onClick={() => setScannerEncModo('entrega')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-extrabold cursor-pointer"
                    >
                      <Camera size={13} /> Ler QR na Câmera
                    </button>
                  </div>
                  <input
                    autoFocus
                    required
                    value={encCodigoRetirada}
                    onChange={(e) => setEncCodigoRetirada(e.target.value)}
                    placeholder="Ex: A4F9B2 ou bipe o QR"
                    className="w-full p-3.5 rounded-xl border-2 border-slate-200 focus:border-emerald-600 outline-none text-center font-mono text-xl font-black uppercase tracking-widest"
                  />
                </div>
              ) : (
                <div>
                  <label className="text-xs font-extrabold text-slate-600 block mb-1">
                    Informe quem está retirando presencialmente no balcão:
                  </label>
                  <input
                    autoFocus
                    required
                    value={encRetiradoPor}
                    onChange={(e) => setEncRetiradoPor(e.target.value)}
                    placeholder="Nome completo de quem retirou..."
                    className="w-full p-3 rounded-xl border-2 border-amber-300 focus:border-amber-500 outline-none text-sm font-bold"
                  />
                </div>
              )}

              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setEncEntregarModal(null)}
                  className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  disabled={ocupado !== null}
                  className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm cursor-pointer disabled:opacity-50"
                >
                  Confirmar Entrega
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
