import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LogIn, LogOut, Users, Lock, DoorOpen, Search, AlertCircle, CalendarDays,
  MessageCircle, X, ShieldAlert, Eye, Video, RefreshCw, CheckCircle2, Maximize2, Minimize2,
  Volume2, VolumeX, Mic, PhoneCall, PhoneOff,
} from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import { obterUrlWsGo2rtc } from '../lib/nativo';
import {
  iniciarConversaBidirecional,
  desbloquearContextoAudioConversa,
  reproduzirUlawNoContexto,
  type SessaoConversaBidirecional,
} from '../lib/interfoneAudio';
import { obterToken } from '../lib/sessao';
import FotoUsuario from '../components/FotoUsuario';
import ValidadorCpf from '../components/ValidadorCpf';

// Paridade com src/views/portaria.php + Opção 2 (Modal de Câmera Ao Vivo do Controle de Acesso Facial):
// Ao clicar em "ABRIR PORTA" em qualquer terminal, abre o quadro com a câmera embutida do leitor facial
// (vídeo ao vivo RTSP via go2rtc + captura instantânea ISAPI) e o botão "CONFIRMAR E ABRIR PORTA".

interface Stats { entradas_hoje: number; saidas_hoje: number; dentro_agora: number }
interface Controlador {
  id: number;
  nome: string;
  online?: boolean;
  status?: 'online' | 'offline';
  latencia_ms?: number | null;
  modo_conexao?: string;
  mensagem_status?: string;
}
interface Esperado { id: number; nome: string; cpf: string | null; tem_foto: boolean; origem: string; morador_nome: string | null; morador_telefone: string | null }
interface Ativa { id: number; nome_externo: string | null; tipo_registro: string | null; data_hora: string | null }
interface Resultado {
  origem: 'usuario' | 'hospede_temporada' | 'precadastro' | 'pendente';
  id: number; nome: string; cpf: string | null; tem_foto: boolean; unidade?: string | null;
  ativo?: boolean; excluido?: boolean; tem_documento?: boolean; data_entrada?: string; data_saida?: string;
}
interface Aviso { tipo: 'ok' | 'erro'; mensagem: string }

const fmtData = (s?: string) => (s ? new Date(s.replace(' ', 'T')).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const fmtHora = (s: string | null) => (s ? new Date(s.replace(' ', 'T')).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');
const mascaraDoc = (cpf: string | null) => (cpf ? `${cpf.slice(0, 3)}...-${cpf.slice(-2)}` : '');
const msgErro = (e: unknown) => (e instanceof ErroApi ? e.message : 'Erro inesperado.');

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

    // 1. Dispara captura instantânea via ISAPI/ISUP (serve de base imediata enquanto o WebRTC/MSE conecta)
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

    // 2. Registra simultaneamente o stream ao vivo no go2rtc
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

  // Monitora o elemento <video> dentro do <video-rtc> para:
  // 1) Só tornar o <video-rtc> visível quando o 1º frame real de vídeo estiver carregado (zero tela preta!)
  // 2) Ativar o áudio automaticamente (muted = false, volume = 1.0)
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
        if (v.readyState >= 2 && v.videoWidth > 0) {
          aoTocar();
        }
      }
      if (v && !document.hidden && v.readyState >= 2 && v.videoWidth > 0) {
        if (v.buffered && v.buffered.length > 0) {
          const fim = v.buffered.end(v.buffered.length - 1);
          if (fim - v.currentTime > 1.8) {
            v.currentTime = fim - 0.15;
          }
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

  // Enquanto o vídeo ao vivo ainda não estiver pronto (ou se estiver no modo snapshot), atualiza o snapshot de forma controlada
  useEffect(() => {
    if (modoVideo === 'rtc' && videoPronto) return;
    const intervalo = erroCam && !snapshot ? 3500 : 1800;
    const timer = window.setInterval(() => {
      if (!document.hidden) {
        buscarSnapshot();
      }
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

  // Mantém o áudio da porta ativo simultaneamente (Full-Duplex) durante a conversa
  const manterAudioCameraAtivo = useCallback(() => {
    if (!audioAntesVozRef.current) return;
    const rtcEl = rtcContainerRef.current?.querySelector('video-rtc') as (HTMLElement & { _userMuted?: boolean }) | null;
    const v = rtcContainerRef.current?.querySelector('video');
    if (!v) return;
    if (rtcEl) rtcEl._userMuted = false;
    v.muted = false;
    v.volume = 1.0;
    if (v.paused) {
      v.play().catch(() => {});
    }
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
              mensagem:
                e instanceof ErroApi
                  ? e.message
                  : e instanceof Error
                    ? e.message
                    : 'Falha ao reproduzir voz na porta.',
            });
          } finally {
            pacotesPendentesRef.current = Math.max(0, pacotesPendentesRef.current - 1);
            if (pacotesPendentesRef.current === 0) {
              setTransmitindoVoz(false);
            }
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
      window.setTimeout(manterAudioCameraAtivo, 150);
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
        if (typeof r.cursor === 'number' && r.cursor > 0) {
          cursor = r.cursor;
        }
        if (r.ok && r.audio_b64 && audioAntesVozRef.current) {
          reproduzirUlawNoContexto(r.audio_b64);
        }
      } catch {
        // Ignora oscilações de rede
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
      const simulado =
        r.hardware?.modo === 'simulado' ? ' (modo SIMULADO: nenhum comando foi enviado ao equipamento)' : '';
      const avisoOk: Aviso = { tipo: 'ok', mensagem: `${r.mensagem}${simulado}` };
      setMsgModal(avisoOk);
      onPortaAberta(avisoOk);
    } catch (e) {
      const avisoErro: Aviso = { tipo: 'erro', mensagem: msgErro(e) };
      setMsgModal(avisoErro);
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
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border-t-[6px] border-t-emerald-500 animate-[fadeIn_0.15s_ease-out]"
        role="dialog"
      >
        {/* Cabeçalho do Modal */}
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
                  Câmera Facial
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Verifique pela câmera do leitor facial se há alguém em frente à porta antes de liberar
              </p>
            </div>
          </div>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center shrink-0 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Quadro da Câmera do Controle de Acesso */}
        <div className="p-5 bg-slate-50">
          <div className="relative w-full aspect-[4/3] max-h-[420px] bg-slate-950 rounded-xl overflow-hidden shadow-inner border border-slate-800 flex items-center justify-center">
            {/* Imagem Instantânea de Fundo / Modo Snapshot */}
            {snapshot && (
              <img
                src={snapshot}
                alt={`Câmera de ${controlador.nome}`}
                className="w-full h-full object-contain select-none"
              />
            )}

            {/* Stream Ao Vivo via go2rtc sobreposto (só fica visível quando o 1º frame real está pronto) */}
            {modoVideo === 'rtc' && stream && (
              <div
                ref={rtcContainerRef}
                className={`absolute inset-0 transition-opacity duration-200 ${
                  videoPronto ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
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

            {/* Estado de Carregamento */}
            {carregandoCam && !snapshot && !videoPronto && (
              <div className="flex flex-col items-center gap-3 text-slate-300">
                <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                <span className="text-sm font-semibold">Conectando à câmera de {controlador.nome}...</span>
              </div>
            )}

            {/* Estado de Erro (Terminal offline) */}
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

            {/* Botão em destaque caso o navegador tenha iniciado o vídeo silenciado */}
            {modoVideo === 'rtc' && videoPronto && !audioAtivo && !conversaAtiva && !transmitindoVoz && (
              <button
                type="button"
                onClick={alternarAudio}
                className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-xs sm:text-sm font-extrabold shadow-lg flex items-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <VolumeX size={16} />
                Toque aqui para ativar o áudio
              </button>
            )}

            {/* Barra de controles flutuante no canto superior direito do vídeo */}
            <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
              {modoVideo === 'rtc' && videoPronto && (
                <button
                  type="button"
                  onClick={alternarAudio}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold backdrop-blur-xs border flex items-center gap-1.5 cursor-pointer transition ${
                    audioAtivo
                      ? 'bg-emerald-600/90 hover:bg-emerald-600 text-white border-emerald-400/40'
                      : 'bg-amber-600/90 hover:bg-amber-600 text-white border-amber-400/40'
                  }`}
                  title={audioAtivo ? 'Áudio ativo (clique para silenciar)' : 'Áudio silenciado pelo navegador (clique para ativar o som)'}
                >
                  {audioAtivo ? <Volume2 size={13} /> : <VolumeX size={13} />}
                  {audioAtivo ? 'Som Ativo' : 'Ativar Som'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setModoVideo((m) => (m === 'rtc' ? 'snapshot' : 'rtc'))}
                className="px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-900 text-white text-xs font-bold backdrop-blur-xs border border-white/15 flex items-center gap-1.5 cursor-pointer"
                title="Alternar entre vídeo contínuo RTSP e fotos rápidas HTTP"
              >
                <Video size={13} className="text-emerald-400" />
                {modoVideo === 'rtc' && videoPronto
                  ? 'Modo: Vídeo Ao Vivo'
                  : modoVideo === 'rtc' && stream
                    ? 'Sincronizando Ao Vivo...'
                    : `Modo: Foto Rápida (${horarioSnap || '1s'})`}
              </button>
              <button
                type="button"
                onClick={tentarNovamente}
                className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-900 text-white backdrop-blur-xs border border-white/15 cursor-pointer"
                title="Atualizar imagem agora"
              >
                <RefreshCw size={13} />
              </button>
            </div>
          </div>

          {/* Barra de Conversa Bidirecional (Começar Conversa / Fechar Conversa) */}
          <div className="mt-3 p-3 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col gap-2">
            {!conversaAtiva ? (
              <button
                type="button"
                onClick={comecarConversa}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-extrabold text-sm sm:text-base shadow-sm flex items-center justify-center gap-2 cursor-pointer transition select-none"
              >
                <PhoneCall size={18} />
                📞 Começar Conversa
              </button>
            ) : (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="flex-1 px-3.5 py-2 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center gap-2.5">
                  <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 text-white shrink-0">
                    <Mic size={16} />
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white animate-ping" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-xs sm:text-sm font-extrabold text-indigo-950 truncate">
                      {transmitindoVoz
                        ? '🔊 Reproduzindo sua voz na porta...'
                        : '🎙️ Conversa Ativa — Fale normalmente'}
                    </div>
                    <div className="mt-1 w-full h-1.5 bg-indigo-200/80 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-100 rounded-full"
                        style={{ width: `${Math.max(8, nivelVoz)}%` }}
                      />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={fecharConversa}
                  className="py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-1.5 cursor-pointer shrink-0 transition"
                >
                  <PhoneOff size={16} />
                  Fechar Conversa
                </button>
              </div>
            )}

            {!conversaAtiva && transmitindoVoz && (
              <div className="w-full py-2 px-3 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800 font-bold text-xs flex items-center justify-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
                Finalizando transmissão de voz na porta...
              </div>
            )}

            {msgVoz && (
              <div
                className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 text-left ${
                  msgVoz.tipo === 'ok'
                    ? 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                <span>{msgVoz.mensagem}</span>
              </div>
            )}
          </div>

          {/* Alerta se o controlador estava marcado como off-line */}
          {controlador.online === false && (
            <div className="mt-3 px-4 py-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 flex items-start gap-2.5 text-xs sm:text-sm font-semibold">
              <ShieldAlert size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-extrabold">Equipamento off-line por problema de conexão</div>
                <div className="text-amber-800 mt-0.5">
                  {controlador.mensagem_status || 'Este equipamento não respondeu ao último teste de rede. Caso a conexão não tenha voltado agora, o comando de abrir a porta não terá efeito.'}
                </div>
              </div>
            </div>
          )}

          {/* Feedback de abertura dentro do próprio modal */}
          {msgModal && (
            <div
              className={`mt-3 px-4 py-3 rounded-xl border flex items-center gap-2.5 text-sm font-bold ${
                msgModal.tipo === 'ok'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-rose-50 border-rose-300 text-rose-800'
              }`}
            >
              {msgModal.tipo === 'ok' ? (
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle size={18} className="text-rose-600 shrink-0" />
              )}
              <span>
                {msgModal.mensagem}
                {msgModal.tipo === 'ok' && ' — Acompanhe a entrada pela câmera acima.'}
              </span>
            </div>
          )}

          {/* Botões de Ação */}
          <div className="flex gap-3 mt-5">
            <button
              type="button"
              onClick={onFechar}
              className="px-6 py-3.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-sm transition cursor-pointer"
            >
              Fechar
            </button>
            <button
              type="button"
              disabled={abrindo}
              onClick={confirmarAbertura}
              className={`flex-1 py-3.5 px-6 rounded-xl text-white font-extrabold text-lg transition disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2 ${
                controlador.online === false
                  ? 'bg-amber-600 hover:bg-amber-700 border border-amber-700 shadow-lg shadow-amber-500/20'
                  : 'bg-emerald-500 hover:bg-emerald-600 border border-emerald-600 shadow-lg shadow-emerald-500/25'
              }`}
            >
              {abrindo
                ? '⏳ Testando e enviando comando...'
                : controlador.online === false
                  ? '⚠️ TENTAR ABRIR MESMO ASSIM'
                  : '🔓 CONFIRMAR E ABRIR PORTA'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Portaria() {
  const [stats, setStats] = useState<Stats>({ entradas_hoje: 0, saidas_hoje: 0, dentro_agora: 0 });
  const [controladores, setControladores] = useState<Controlador[]>([]);
  const [esperados, setEsperados] = useState<Esperado[]>([]);
  const [ativas, setAtivas] = useState<Ativa[]>([]);
  const [modo, setModo] = useState('');
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [busca, setBusca] = useState('');
  const [buscado, setBuscado] = useState('');
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [cameraModal, setCameraModal] = useState<Controlador | null>(null);
  const [modoOperacional, setModoOperacional] = useState<boolean>(() => Boolean(document.fullscreenElement));
  const [testandoEquipamentos, setTestandoEquipamentos] = useState(false);
  const [ultimoTesteHora, setUltimoTesteHora] = useState('');

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

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ stats: Stats; controladores: Controlador[]; esperados: Esperado[]; ativas: Ativa[]; modo_hardware: string }>('portaria_painel');
      setStats(r.stats);
      setControladores(r.controladores);
      setEsperados(r.esperados);
      setAtivas(r.ativas);
      setModo(r.modo_hardware);
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: msgErro(e) });
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const testarEquipamentos = async () => {
    setTestandoEquipamentos(true);
    try {
      const r = await api<{
        controladores: Controlador[];
        resumo: { total: number; online: number; offline: number; testado_em: string };
      }>('portaria_testar_equipamentos');
      setControladores(r.controladores);
      setUltimoTesteHora(r.resumo.testado_em);
      if (r.resumo.offline > 0) {
        setAviso({
          tipo: 'erro',
          mensagem: `⚠️ Teste de conexão (${r.resumo.testado_em}): ${r.resumo.offline} de ${r.resumo.total} equipamento(s) estão OFF-LINE por problema de conexão.`,
        });
      } else {
        setAviso({
          tipo: 'ok',
          mensagem: `✅ Teste de conexão (${r.resumo.testado_em}): Todos os ${r.resumo.total} equipamento(s) estão ONLINE e respondendo normalmente.`,
        });
      }
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: msgErro(e) });
    } finally {
      setTestandoEquipamentos(false);
    }
  };

  const rolarTopo = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const consultar = async (termo: string) => {
    const t = termo.trim();
    if (!t) return;
    setBusca(t);
    setOcupado('busca');
    try {
      const r = await api<{ resultado: Resultado | null }>('portaria_buscar', { query: { busca: t } });
      setResultado(r.resultado);
      setBuscado(t);
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: msgErro(e) });
    } finally {
      setOcupado(null);
    }
  };
  const limpar = () => { setBusca(''); setBuscado(''); setResultado(null); };

  const executar = async (chave: string, rota: string, corpo: Record<string, unknown>, depois?: () => void) => {
    setOcupado(chave);
    try {
      const r = await api<{ mensagem: string; hardware?: { modo: string } }>(rota, { corpo });
      const simulado = r.hardware?.modo === 'simulado' ? ' (modo SIMULADO: nenhum comando foi enviado ao equipamento)' : '';
      setAviso({ tipo: 'ok', mensagem: r.mensagem + simulado });
      depois?.();
      await carregar();
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: msgErro(e) });
    } finally {
      setOcupado(null);
      rolarTopo();
    }
  };

  const liberar = (r: Resultado) => {
    const alerta = r.origem === 'usuario' && (r.excluido || r.ativo === false)
      ? `ATENÇÃO: este cadastro está ${r.excluido ? 'NA LIXEIRA' : 'BLOQUEADO'}.\n\n` : '';
    if (window.confirm(`${alerta}Deseja liberar a entrada de ${r.nome}?`)) {
      executar('entrada', 'portaria_entrada', { tipo_pessoa: r.origem, ref_id: r.id }, limpar);
    }
  };
  const saida = (a: Ativa) => {
    if (window.confirm('Registrar saída?')) executar(`saida-${a.id}`, 'portaria_saida', { id: a.id });
  };
  const verDocumento = async (r: Resultado) => {
    const resp = await fetch(`/api.php?route=foto_registro&tipo=visita&campo=documento&id=${r.id}`, { headers: { Authorization: `Bearer ${obterToken() ?? ''}` } });
    if (resp.ok) window.open(URL.createObjectURL(await resp.blob()), '_blank');
    else setAviso({ tipo: 'erro', mensagem: 'Documento não encontrado.' });
  };

  const corOrigem = resultado?.origem === 'hospede_temporada' ? 'border-t-violet-500' : resultado?.origem === 'usuario' ? 'border-t-emerald-500' : 'border-t-blue-600';
  const rotaFoto = (r: Resultado) => r.origem === 'usuario' ? `foto_usuario&id=${r.id}` : r.origem === 'hospede_temporada' ? `foto_registro&tipo=visita&id=${r.id}` : `foto_registro&tipo=precadastro&id=${r.id}`;

  const totalOnline = controladores.filter((c) => c.online !== false).length;
  const totalOffline = controladores.length - totalOnline;

  return (
    <div className={`${modoOperacional ? 'max-w-full' : 'max-w-7xl'} mx-auto p-6 lg:p-8 space-y-6 transition-all`}>
      {cameraModal && (
        <ModalCameraPorta
          controlador={cameraModal}
          onFechar={() => setCameraModal(null)}
          onPortaAberta={(av) => {
            setAviso(av);
            carregar();
          }}
        />
      )}

      {aviso && (
        <div className={`border-l-4 px-4 py-3 rounded-lg text-sm font-semibold flex justify-between gap-3 ${aviso.tipo === 'ok' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-rose-50 border-rose-500 text-rose-800'}`}>
          <span>{aviso.mensagem}</span>
          <button onClick={() => setAviso(null)} aria-label="Fechar aviso"><X size={16} /></button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { n: stats.entradas_hoje, l: 'Entradas Hoje', i: <LogIn size={22} className="text-blue-600" />, bg: 'bg-blue-100', cor: 'text-slate-900' },
          { n: stats.saidas_hoje, l: 'Saídas Hoje', i: <LogOut size={22} className="text-green-600" />, bg: 'bg-green-100', cor: 'text-slate-900' },
          { n: stats.dentro_agora, l: 'Dentro Agora', i: <Users size={22} className="text-yellow-600" />, bg: 'bg-yellow-100', cor: stats.dentro_agora > 0 ? 'text-amber-500' : 'text-slate-900' },
        ].map((s) => (
          <div key={s.l} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex justify-between items-center">
            <div><div className={`text-3xl font-extrabold ${s.cor}`}>{s.n}</div><div className="text-sm text-slate-500 font-semibold">{s.l}</div></div>
            <div className={`${s.bg} p-3 rounded-xl`}>{s.i}</div>
          </div>
        ))}
      </div>

      {controladores.length > 0 && (
        <div className={`bg-white rounded-2xl border border-slate-200 border-t-4 ${totalOffline > 0 ? 'border-t-amber-500' : 'border-t-emerald-500'} p-6 shadow-sm`}>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
                <Lock size={20} className={totalOffline > 0 ? 'text-amber-500' : 'text-emerald-500'} /> Abertura Remota de Portas
                {modo === 'simulado' && <span className="ml-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-0.5">modo SIMULADO</span>}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-xs font-extrabold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  {totalOnline} Online
                </span>
                {totalOffline > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-extrabold px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                    <span className="w-2 h-2 rounded-full bg-rose-600" />
                    {totalOffline} Off-line
                  </span>
                )}
                {ultimoTesteHora && (
                  <span className="text-[11px] font-semibold text-slate-400">
                    Testado às {ultimoTesteHora}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                disabled={testandoEquipamentos}
                onClick={testarEquipamentos}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition cursor-pointer disabled:opacity-60"
                title="Testar agora a conexão de rede/ISUP de todos os controladores de porta"
              >
                <RefreshCw size={14} className={testandoEquipamentos ? 'animate-spin text-blue-600' : 'text-slate-600'} />
                {testandoEquipamentos ? 'Testando conexão...' : 'Testar Conexão'}
              </button>
              <button
                type="button"
                onClick={alternarModoOperacional}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold border transition cursor-pointer ${
                  modoOperacional
                    ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 shadow-sm'
                    : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                }`}
                title={modoOperacional ? 'Sair da tela cheia e restaurar o menu lateral' : 'Recolher menu lateral e expandir painel em tela cheia para operação de portaria'}
              >
                {modoOperacional ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                {modoOperacional ? 'Sair do Modo Operacional' : 'Modo Operacional (Tela Cheia)'}
              </button>
            </div>
          </div>

          {totalOffline > 0 && (
            <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-amber-950 flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-2.5 text-xs sm:text-sm">
                <ShieldAlert size={20} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-extrabold text-amber-900">
                    {totalOffline === controladores.length
                      ? '⚠️ Atenção: Os equipamentos deste condomínio estão OFF-LINE por problema de conexão!'
                      : `⚠️ Atenção: ${totalOffline} equipamento(s) estão OFF-LINE por problema de conexão!`}
                  </div>
                  <div className="text-amber-800 mt-0.5">
                    As portas marcadas como <strong>Off-line</strong> estão sem comunicação com o servidor (queda de internet local ou equipamento desligado) e <strong>não abrirão</strong> pelo comando remoto enquanto a conexão não for restabelecida.
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
            {controladores.map((c) => {
              const estaOnline = c.online !== false;
              return (
                <div
                  key={c.id}
                  className={`border rounded-xl p-4 flex flex-col justify-between transition ${
                    estaOnline ? 'border-slate-200 bg-slate-50' : 'border-rose-300 bg-rose-50/50'
                  }`}
                >
                  <div>
                    <div className="font-bold text-slate-900 mb-2 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <DoorOpen size={20} className={estaOnline ? 'text-slate-500' : 'text-rose-600'} /> {c.nome}
                      </span>
                      {estaOnline ? (
                        <span
                          className="text-[0.68rem] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0"
                          title={c.mensagem_status || 'Equipamento online e pronto para abrir a porta'}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Online{c.latencia_ms ? ` · ${c.latencia_ms}ms` : ''}
                        </span>
                      ) : (
                        <span
                          className="text-[0.68rem] font-extrabold text-rose-700 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0"
                          title={c.mensagem_status || 'Equipamento off-line por problema de conexão'}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                          Off-line
                        </span>
                      )}
                    </div>
                    {!estaOnline && (
                      <div className="mb-3 text-[11px] font-semibold text-rose-800 bg-rose-100/80 border border-rose-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                        <AlertCircle size={13} className="shrink-0 text-rose-600" />
                        <span>Sem conexão no momento — o comando remoto não abrirá a porta.</span>
                      </div>
                    )}
                  </div>
                  <button
                    disabled={ocupado !== null}
                    onClick={() => {
                      (window as unknown as { __sectrumBlessVideo?: () => void }).__sectrumBlessVideo?.();
                      setCameraModal(c);
                    }}
                    className={`w-full py-3 rounded-lg font-bold transition disabled:opacity-60 cursor-pointer ${
                      estaOnline
                        ? 'bg-emerald-500 hover:bg-emerald-600 border border-emerald-600 text-white text-lg'
                        : 'bg-rose-600 hover:bg-rose-700 border border-rose-700 text-white text-sm'
                    }`}
                  >
                    {estaOnline ? '🔓 ABRIR PORTA' : '⚠️ EQUIPAMENTO OFF-LINE (TESTAR)'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 border-t-4 border-t-blue-600 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
            <Search size={20} className="text-blue-600" /> Terminal de Portaria — Liberação de Acesso
          </div>
          {controladores.length === 0 && (
            <button
              type="button"
              onClick={alternarModoOperacional}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold border transition cursor-pointer ${
                modoOperacional
                  ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 shadow-sm'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
            >
              {modoOperacional ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              {modoOperacional ? 'Sair do Modo Operacional' : 'Modo Operacional (Tela Cheia)'}
            </button>
          )}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); consultar(busca); }} className="flex gap-2.5 items-end flex-wrap">
          <div className="flex-1 min-w-[250px]">
            <label className="block text-sm font-bold text-slate-600 mb-1.5">Consultar CPF ou Nome</label>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite o CPF ou nome da pessoa..." autoFocus autoComplete="off"
              className="w-full px-4 py-3 border border-slate-300 rounded-lg outline-none focus:border-blue-500 text-[1.05em]" />
          </div>
          <button disabled={ocupado === 'busca'} className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold disabled:opacity-60"><Search size={16} /> Consultar</button>
          {buscado && <button type="button" onClick={limpar} className="px-6 py-3 rounded-lg bg-slate-100 text-slate-600 font-bold hover:bg-slate-200">Limpar</button>}
        </form>
        {/^\d[\d.\-\s]*$/.test(busca.trim()) && <ValidadorCpf cpf={busca} compacto />}
      </div>

      {buscado && !resultado && (
        <div className="bg-white rounded-2xl border border-slate-200 border-l-4 border-l-amber-500 p-5 shadow-sm flex items-center gap-3.5">
          <div className="w-[52px] h-[52px] bg-yellow-100 rounded-xl flex items-center justify-center shrink-0"><AlertCircle size={26} className="text-yellow-600" /></div>
          <div>
            <div className="font-bold text-slate-900 mb-1">Nenhum cadastro encontrado para "{buscado}"</div>
            <div className="text-sm text-slate-500">Esta pessoa não possui pré-cadastro aprovado. Para acesso avulso, use Convites/Visitantes.</div>
          </div>
        </div>
      )}

      {buscado && resultado && (
        <div className={`bg-white rounded-2xl border border-slate-200 border-t-4 ${corOrigem} p-6 shadow-lg`}>
          <div className="flex gap-5 items-start flex-wrap">
            <FotoUsuario rota={rotaFoto(resultado)} temFoto={resultado.tem_foto} largura={130} altura={160} />
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2.5 mb-2.5 flex-wrap">
                <span className="text-2xl font-extrabold text-slate-900">{resultado.nome}</span>
                {resultado.origem === 'hospede_temporada' ? <span className="bg-violet-100 text-violet-700 px-2 py-0.5 rounded text-xs font-bold">🧳 Hóspede Airbnb (Temporada)</span>
                  : resultado.origem === 'usuario' ? (
                    resultado.excluido ? <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded text-xs font-bold inline-flex items-center gap-1"><ShieldAlert size={12} /> Na lixeira</span>
                      : resultado.ativo === false ? <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded text-xs font-bold inline-flex items-center gap-1"><ShieldAlert size={12} /> Bloqueado / Sem App</span>
                        : <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-xs font-bold">Morador Ativo</span>
                  ) : resultado.origem === 'pendente' ? <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-xs font-bold">Pré-cadastro Pendente (não aprovado)</span>
                    : <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">Pré-cadastro / Visita Aprovada</span>}
              </div>
              <div className="grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(160px,1fr))] mb-3.5">
                {resultado.cpf && <div><div className="text-[0.7em] font-bold text-slate-400 uppercase">CPF / Documento</div><div className="font-semibold text-slate-800 font-mono">{resultado.cpf}</div></div>}
                {resultado.unidade && <div><div className="text-[0.7em] font-bold text-slate-400 uppercase">Unidade</div><div className="font-semibold text-slate-800">{resultado.unidade}</div></div>}
                {resultado.origem === 'hospede_temporada' && <div><div className="text-[0.7em] font-bold text-violet-500 uppercase">Período Autorizado</div><div className="font-semibold text-slate-800 text-sm">{fmtData(resultado.data_entrada)} a {fmtData(resultado.data_saida)}</div></div>}
              </div>
              {resultado.cpf && <div className="mb-3.5"><ValidadorCpf cpf={resultado.cpf} compacto /></div>}
              {resultado.origem === 'hospede_temporada' && resultado.tem_documento && (
                <div className="bg-violet-50 border border-dashed border-violet-300 p-4 rounded-xl mb-4 flex items-center justify-between flex-wrap gap-2.5">
                  <div><b className="text-violet-700 block mb-1">Validação de Identidade (Airbnb)</b><p className="text-slate-500 text-sm">Compare a foto do documento anexado com a pessoa na sua frente.</p></div>
                  <button type="button" onClick={() => verDocumento(resultado)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-sm font-bold"><Eye size={14} /> Ver CNH/RG Anexado</button>
                </div>
              )}
              <button disabled={ocupado !== null} onClick={() => liberar(resultado)}
                className={`w-full py-3.5 rounded-xl text-white font-bold text-lg disabled:opacity-60 ${resultado.origem === 'hospede_temporada' ? 'bg-violet-600 hover:bg-violet-700' : 'bg-emerald-500 hover:bg-emerald-600'}`}>
                ✅ Confirmar Identidade e Liberar Entrada
              </button>
            </div>
          </div>
        </div>
      )}

      {!buscado && (
        <div>
          <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2"><CalendarDays size={18} className="text-blue-600" /> Agenda de Visitantes (Pré-aprovados)</h3>
          {esperados.length > 0 ? (
            <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
              {esperados.map((e) => (
                <div key={e.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex gap-3.5 items-center shadow-sm hover:-translate-y-0.5 transition">
                  <FotoUsuario rota={`foto_registro&tipo=visita&id=${e.id}`} temFoto={e.tem_foto} tamanho={56} redonda />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 truncate">{e.nome}</div>
                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                      {e.origem === 'temporada' ? <span className="bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-bold">Airbnb</span> : <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">Visita</span>}
                      <b>Doc:</b> {mascaraDoc(e.cpf)}
                    </div>
                    {e.morador_nome && (
                      <>
                        <div className="mt-1.5 text-xs text-slate-500">Autorizado por: <b>{e.morador_nome}</b></div>
                        {e.morador_telefone && (
                          <a href={`https://wa.me/55${e.morador_telefone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded-md mt-1.5 hover:bg-green-200">
                            <MessageCircle size={12} /> Falar com Morador
                          </a>
                        )}
                      </>
                    )}
                  </div>
                  <button onClick={() => consultar(e.cpf ?? e.nome)} className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-bold ${e.origem === 'temporada' ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>Validar</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-5 text-center text-slate-500 text-sm bg-slate-50 border border-dashed border-slate-300 rounded-2xl">Nenhuma visita pré-aprovada ou hóspede de temporada aguardando na fila hoje.</div>
          )}
        </div>
      )}

      {ativas.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="text-lg font-extrabold text-slate-900 mb-4">Pessoas no Condomínio Agora <span className="ml-1.5 bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded text-sm">{ativas.length}</span></div>
          <table className="w-full">
            <thead><tr>{['Nome', 'Entrada', 'Ação'].map((h) => <th key={h} className={`text-[0.72rem] font-extrabold uppercase tracking-wide text-slate-500 px-4 py-3 border-b border-slate-200 ${h === 'Ação' ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
            <tbody>
              {ativas.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 border-b border-slate-100 font-semibold">{a.nome_externo ?? '—'} {a.tipo_registro === 'hospede_temporada' && <span className="bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded text-[0.7em] font-bold">Airbnb</span>}</td>
                  <td className="px-4 py-3 border-b border-slate-100 text-slate-500">{fmtHora(a.data_hora)}</td>
                  <td className="px-4 py-3 border-b border-slate-100 text-right">
                    <button disabled={ocupado !== null} onClick={() => saida(a)} className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold disabled:opacity-60">Registrar Saída</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
