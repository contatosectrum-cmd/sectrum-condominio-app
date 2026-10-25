import { useCallback, useEffect, useRef, useState } from 'react';
import { PhoneCall, PhoneOff, Unlock, Mic, Volume2, ArrowRightLeft, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import { obterToken } from '../lib/sessao';
import {
  iniciarConversaBidirecional,
  desbloquearContextoAudioConversa,
  reproduzirUlawNoContexto,
  type SessaoConversaBidirecional,
} from '../lib/interfoneAudio';
import { desbloquearAudioInterfone } from '../pages/morador/MoradorHome';

export interface ItemChamadaPortaria {
  call_id: string;
  device_id: string;
  terminal_id: number;
  terminal_nome: string;
  room_no: string;
  unidade_id: number | null;
  unidade_label: string;
  moradores_nomes: string;
  moradores_com_app: number;
  status: 'ringing' | 'answered' | string;
  age_s: number;
  segundos_para_transbordo: number;
  transbordou_portaria: boolean;
  motivo_transbordo: string;
  motivo_label: string;
}

const VAPID_PUBLIC_KEY_SECTRUM =
  'BMvZvM9VGPXbpU8R05KDWaJ-kwrG65AgK69nS7KoyibLv0_1w38F5WJjtiW6V8jjMFigzbZIxDlasOmnXT-kyJE';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

let pushGestaoSyncEmAndamento = false;
let pushGestaoUltimoToken = '';

/**
 * Registra o navegador/celular do Síndico, Admin ou Portaria no Web Push
 * para receber alertas automáticos de queda de equipamento (Watchdog) e Transbordo de Interfone.
 */
async function sincronizarWebPushGestao(): Promise<void> {
  if (pushGestaoSyncEmAndamento) return;
  const jwt = obterToken();
  if (!jwt) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return;
  }
  pushGestaoSyncEmAndamento = true;
  try {
    if (Notification.permission === 'default') {
      await Notification.requestPermission().catch(() => 'default');
    }
    if (Notification.permission !== 'granted') return;

    const reg = await navigator.serviceWorker.ready;
    const vapidKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY_SECTRUM);
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey as unknown as BufferSource,
      });
    }
    if (sub) {
      const subJson = sub.toJSON();
      const rawStr = JSON.stringify(subJson);
      const chave = `${jwt.slice(-16)}:${rawStr}`;
      if (pushGestaoUltimoToken !== chave) {
        await api('salvar_fcm_token', {
          corpo: {
            subscription: subJson,
            fcm_token: rawStr,
          },
        });
        pushGestaoUltimoToken = chave;
      }
    }
  } catch {
    // Ignora silenciosamente
  } finally {
    pushGestaoSyncEmAndamento = false;
  }
}

let wavToquePortariaCache: string | null = null;
let audioToquePortariaEl: HTMLAudioElement | null = null;

function obterAudioToquePortaria(): HTMLAudioElement {
  if (!wavToquePortariaCache) {
    const sampleRate = 16000;
    const durationSec = 1.8;
    const numSamples = Math.floor(sampleRate * durationSec);
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);
    const writeStr = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, numSamples * 2, true);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      let sample = 0;
      if ((t >= 0 && t <= 0.38) || (t >= 0.48 && t <= 0.86)) {
        const mod = Math.sin(2 * Math.PI * 22 * t) >= 0 ? 880 : 1174.66;
        sample = Math.max(-1, Math.min(1, Math.sin(2 * Math.PI * mod * t) * 0.85));
      }
      view.setInt16(44 + i * 2, Math.floor(sample * 32767), true);
    }
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    wavToquePortariaCache = 'data:audio/wav;base64,' + window.btoa(binary);
  }
  if (!audioToquePortariaEl) {
    audioToquePortariaEl = new Audio(wavToquePortariaCache);
    audioToquePortariaEl.loop = true;
    audioToquePortariaEl.preload = 'auto';
    audioToquePortariaEl.volume = 1.0;
  }
  return audioToquePortariaEl;
}

export default function MonitorTransbordoPortaria({ condominioId }: { condominioId: number | null }) {
  const [chamadasEmCurso, setChamadasEmCurso] = useState<ItemChamadaPortaria[]>([]);
  const [chamadaTransbordo, setChamadaTransbordo] = useState<ItemChamadaPortaria | null>(null);
  const [emAtendimento, setEmAtendimento] = useState(false);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [horarioSnap, setHorarioSnap] = useState('');
  const [nivelVoz, setNivelVoz] = useState(0);
  const [abrindoPorta, setAbrindoPorta] = useState(false);
  const [assumindoId, setAssumindoId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null);

  const chamadasEncerradasRef = useRef<Set<string>>(new Set());
  const sessaoMicRef = useRef<SessaoConversaBidirecional | null>(null);
  const filaEnvioRef = useRef<Promise<void>>(Promise.resolve());
  const seqAudioRef = useRef<number>(0);

  // Registra Web Push da equipe (Admin / Síndico / Portaria) e desbloqueia contexto de áudio
  useEffect(() => {
    sincronizarWebPushGestao();
    const aoInteragir = () => {
      desbloquearAudioInterfone();
      desbloquearContextoAudioConversa();
      sincronizarWebPushGestao();
    };
    window.addEventListener('touchstart', aoInteragir, { passive: true });
    window.addEventListener('pointerdown', aoInteragir, { passive: true });
    window.addEventListener('click', aoInteragir, { passive: true });
    return () => {
      window.removeEventListener('touchstart', aoInteragir);
      window.removeEventListener('pointerdown', aoInteragir);
      window.removeEventListener('click', aoInteragir);
    };
  }, []);

  // Faz polling das chamadas de interfone do condomínio a cada 1.5s
  const verificarStatusPortaria = useCallback(async () => {
    if (!condominioId) {
      setChamadasEmCurso([]);
      setChamadaTransbordo(null);
      return;
    }
    try {
      const r = await api<{
        chamada_transbordo: ItemChamadaPortaria | null;
        chamadas_em_curso: ItemChamadaPortaria[];
      }>('portaria_interfone_status');

      const ativas = (r.chamadas_em_curso ?? []).filter(
        (c) => !chamadasEncerradasRef.current.has(c.call_id),
      );
      setChamadasEmCurso(ativas);

      const transb =
        r.chamada_transbordo && !chamadasEncerradasRef.current.has(r.chamada_transbordo.call_id)
          ? r.chamada_transbordo
          : null;

      setChamadaTransbordo((atual) => {
        if (!transb) {
          setEmAtendimento(false);
          return null;
        }
        if (atual && atual.call_id !== transb.call_id) {
          setEmAtendimento(false);
          setFeedback(null);
        }
        return transb;
      });
    } catch {
      // Ignora falhas de rede transitórias
    }
  }, [condominioId]);

  useEffect(() => {
    verificarStatusPortaria();
    const timer = window.setInterval(verificarStatusPortaria, 1500);
    return () => window.clearInterval(timer);
  }, [verificarStatusPortaria]);

  // Toca campainha de transbordo na Portaria enquanto estiver tocando e ainda não atendida pelo porteiro
  useEffect(() => {
    const el = obterAudioToquePortaria();
    if (!chamadaTransbordo || emAtendimento) {
      el.pause();
      el.currentTime = 0;
      return;
    }
    el.muted = false;
    el.volume = 1.0;
    el.play().catch(() => undefined);

    return () => {
      el.pause();
      el.currentTime = 0;
    };
  }, [chamadaTransbordo, emAtendimento]);

  // Atualiza snapshot da câmera do leitor facial quando há chamada em transbordo
  useEffect(() => {
    if (!chamadaTransbordo?.terminal_id) {
      setSnapshot(null);
      setHorarioSnap('');
      return;
    }
    let cancelado = false;
    const buscarSnap = async () => {
      try {
        const r = await api<{ imagem: string; horario: string }>('portaria_camera_snapshot', {
          query: { terminal_id: chamadaTransbordo.terminal_id },
        });
        if (!cancelado) {
          setSnapshot(r.imagem);
          setHorarioSnap(r.horario);
        }
      } catch {
        // Ignora
      }
    };
    buscarSnap();
    const timer = window.setInterval(buscarSnap, 1300);
    return () => {
      cancelado = true;
      window.clearInterval(timer);
    };
  }, [chamadaTransbordo?.terminal_id, chamadaTransbordo?.call_id]);

  // Quando em atendimento na portaria, captura microfone do operador e recebe áudio do leitor facial
  useEffect(() => {
    if (!emAtendimento || !chamadaTransbordo?.terminal_id) {
      sessaoMicRef.current?.encerrar();
      sessaoMicRef.current = null;
      setNivelVoz(0);
      return;
    }

    let cancelado = false;
    const termId = chamadaTransbordo.terminal_id;
    seqAudioRef.current = 0;

    iniciarConversaBidirecional({
      onNivelVoz: (n) => {
        if (!cancelado) setNivelVoz(n);
      },
      onTrechoVoz: (audioUlawBase64) => {
        if (cancelado || !audioUlawBase64) return;
        filaEnvioRef.current = filaEnvioRef.current
          .then(async () => {
            await api('portaria_camera_falar', {
              corpo: {
                terminal_id: termId,
                audio_base64: audioUlawBase64,
                audio_ulaw: audioUlawBase64,
              },
            }).catch(() => undefined);
          })
          .catch(() => undefined);
      },
    })
      .then((sessao) => {
        if (cancelado) {
          sessao.encerrar();
          return;
        }
        sessaoMicRef.current = sessao;
      })
      .catch(() => undefined);

    const timerRx = window.setInterval(async () => {
      if (cancelado) return;
      try {
        const rx = await api<{
          ok: boolean;
          seq: number;
          ulaw_b64?: string;
        }>('portaria_interfone_audio_receber', {
          query: { terminal_id: termId, seq: seqAudioRef.current },
        });
        if (!cancelado && rx.ok && rx.seq > seqAudioRef.current) {
          seqAudioRef.current = rx.seq;
          if (rx.ulaw_b64) {
            reproduzirUlawNoContexto(rx.ulaw_b64);
          }
        }
      } catch {
        // Ignora
      }
    }, 280);

    return () => {
      cancelado = true;
      window.clearInterval(timerRx);
      sessaoMicRef.current?.encerrar();
      sessaoMicRef.current = null;
    };
  }, [emAtendimento, chamadaTransbordo?.terminal_id, chamadaTransbordo?.call_id]);

  const assumirChamadaAgora = async (c: ItemChamadaPortaria) => {
    setAssumindoId(c.call_id);
    try {
      desbloquearContextoAudioConversa();
      await api('portaria_interfone_sinalizar', {
        corpo: {
          call_id: c.call_id,
          device_id: c.device_id,
          acao: 'assumir',
        },
      });
      await verificarStatusPortaria();
    } catch {
      // Ignora
    } finally {
      setAssumindoId(null);
    }
  };

  const atenderNaPortaria = async () => {
    if (!chamadaTransbordo) return;
    desbloquearContextoAudioConversa();
    setEmAtendimento(true);
    await api('portaria_interfone_sinalizar', {
      corpo: {
        call_id: chamadaTransbordo.call_id,
        device_id: chamadaTransbordo.device_id,
        acao: 'answer',
      },
    }).catch(() => undefined);
  };

  const abrirPortaPeloTransbordo = async () => {
    if (!chamadaTransbordo) return;
    setAbrindoPorta(true);
    setFeedback(null);
    try {
      await api('portaria_interfone_sinalizar', {
        corpo: {
          call_id: chamadaTransbordo.call_id,
          device_id: chamadaTransbordo.device_id,
          acao: 'answer',
        },
      }).catch(() => undefined);

      const r = await api<{ mensagem: string }>('portaria_abrir', {
        corpo: { terminal_id: chamadaTransbordo.terminal_id },
      });
      setFeedback({ tipo: 'ok', msg: r.mensagem || '✅ Porta aberta com sucesso!' });

      const idEncerrar = chamadaTransbordo.call_id;
      const devEncerrar = chamadaTransbordo.device_id;
      window.setTimeout(() => {
        chamadasEncerradasRef.current.add(idEncerrar);
        api('portaria_interfone_sinalizar', {
          corpo: { call_id: idEncerrar, device_id: devEncerrar, acao: 'hangUp' },
        }).catch(() => undefined);
        setEmAtendimento(false);
        setChamadaTransbordo(null);
        setFeedback(null);
      }, 1500);
    } catch (e) {
      setFeedback({
        tipo: 'erro',
        msg: e instanceof ErroApi ? e.message : 'Falha ao abrir porta.',
      });
    } finally {
      setAbrindoPorta(false);
    }
  };

  const encerrarChamadaPortaria = async () => {
    if (!chamadaTransbordo) return;
    const atual = chamadaTransbordo;
    chamadasEncerradasRef.current.add(atual.call_id);
    sessaoMicRef.current?.encerrar();
    sessaoMicRef.current = null;
    setEmAtendimento(false);
    setChamadaTransbordo(null);
    setFeedback(null);

    await api('portaria_interfone_sinalizar', {
      corpo: {
        call_id: atual.call_id,
        device_id: atual.device_id,
        acao: emAtendimento ? 'hangUp' : 'reject',
      },
    }).catch(() => undefined);
  };

  const chamadasTocandoNoMorador = chamadasEmCurso.filter((c) => !c.transbordou_portaria);

  return (
    <>
      {/* Barra superior informativa quando há visitante interfonando para um apartamento (< 20s) */}
      {chamadasTocandoNoMorador.length > 0 && !chamadaTransbordo && (
        <div className="bg-indigo-950 text-white px-4 py-2.5 border-b border-indigo-800 shadow-md flex flex-wrap items-center justify-between gap-3 z-[180]">
          {chamadasTocandoNoMorador.map((c) => (
            <div key={c.call_id} className="flex flex-wrap items-center justify-between gap-3 w-full">
              <div className="flex items-center gap-2.5 text-xs sm:text-sm">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping shrink-0" />
                <span className="font-extrabold text-amber-300">📞 Interfone Tocando no Morador:</span>
                <span className="font-bold text-white">
                  {c.unidade_label} {c.moradores_nomes ? `(${c.moradores_nomes})` : ''}
                </span>
                <span className="text-indigo-200 hidden sm:inline">
                  • Leitor: <b>{c.terminal_nome}</b>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-900 border border-indigo-700 text-xs font-mono text-amber-200">
                  <Clock size={12} /> Transbordo automático p/ Portaria em {c.segundos_para_transbordo}s
                </span>
              </div>
              <button
                type="button"
                disabled={assumindoId === c.call_id}
                onClick={() => assumirChamadaAgora(c)}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shrink-0 shadow"
              >
                <ArrowRightLeft size={14} />
                {assumindoId === c.call_id ? 'Assumindo...' : '📞 Assumir na Portaria Agora'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal Global de Atendimento de Transbordo do Interfone na Portaria / Central */}
      {chamadaTransbordo && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border-2 border-amber-500/80 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl text-white">
            {/* Cabeçalho de Alerta de Transbordo */}
            <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 px-5 py-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                  <PhoneCall size={22} className={emAtendimento ? '' : 'animate-bounce'} />
                </div>
                <div>
                  <div className="text-[11px] font-black uppercase tracking-wider text-amber-100">
                    {emAtendimento ? '🔊 Em Atendimento na Portaria' : '🚨 Transbordo Automático de Interfone'}
                  </div>
                  <div className="text-base sm:text-lg font-black leading-tight">
                    {chamadaTransbordo.terminal_nome} ➔ {chamadaTransbordo.unidade_label}
                  </div>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-black/30 text-xs font-mono font-bold">
                Ramal {chamadaTransbordo.room_no || 'Portaria'}
              </span>
            </div>

            <div className="p-5 space-y-4">
              {/* Motivo do Transbordo e Moradores */}
              <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-3.5 space-y-1 text-xs">
                <div className="font-extrabold text-amber-300 flex items-center gap-1.5">
                  <ArrowRightLeft size={14} />
                  {chamadaTransbordo.motivo_label}
                </div>
                {chamadaTransbordo.moradores_nomes ? (
                  <div className="text-slate-300">
                    Morador(es) da unidade: <b className="text-white">{chamadaTransbordo.moradores_nomes}</b>
                  </div>
                ) : (
                  <div className="text-slate-400">
                    Nenhum morador cadastrado ou vinculado a este apartamento no momento.
                  </div>
                )}
              </div>

              {/* Visor da Câmera do Leitor Facial */}
              <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden bg-black border border-slate-700 flex items-center justify-center">
                {snapshot ? (
                  <img
                    src={snapshot}
                    alt="Câmera da Portaria"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-400 p-6 text-center">
                    <PhoneCall size={36} className="text-amber-400 animate-pulse" />
                    <span className="text-xs font-bold">Capturando vídeo do leitor {chamadaTransbordo.terminal_nome}...</span>
                  </div>
                )}
                <div className="absolute top-3 left-3 flex items-center gap-1.5">
                  <span className="px-2.5 py-1 rounded-full bg-rose-600/90 text-white text-[11px] font-extrabold uppercase flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                    Câmera: {chamadaTransbordo.terminal_nome}
                  </span>
                </div>
                {horarioSnap && (
                  <span className="absolute bottom-3 right-3 px-2 py-0.5 rounded bg-black/75 text-[11px] font-mono text-slate-200">
                    {horarioSnap}
                  </span>
                )}
              </div>

              {/* Medidor de voz quando em atendimento */}
              {emAtendimento && (
                <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-2xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs font-extrabold text-emerald-300">
                    <span className="flex items-center gap-1.5">
                      <Mic size={14} className="animate-pulse" /> Áudio Bidirecional Ativo com a Porta
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-emerald-200">
                      <Volume2 size={13} /> Ouvindo e Falando
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 transition-all duration-100"
                      style={{ width: `${Math.min(100, Math.max(8, Math.round(nivelVoz)))}%` }}
                    />
                  </div>
                </div>
              )}

              {feedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-extrabold flex items-center gap-2 ${
                    feedback.tipo === 'ok'
                      ? 'bg-emerald-500/20 border border-emerald-400 text-emerald-200'
                      : 'bg-rose-500/20 border border-rose-400 text-rose-200'
                  }`}
                >
                  {feedback.tipo === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{feedback.msg}</span>
                </div>
              )}

              {/* Botões de Ação da Portaria */}
              <div className="space-y-3 pt-1">
                <button
                  type="button"
                  disabled={abrindoPorta}
                  onClick={abrirPortaPeloTransbordo}
                  className="w-full py-3.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 cursor-pointer transition"
                >
                  <Unlock size={18} />
                  {abrindoPorta ? '⏳ Abrindo Porta...' : `🔓 Liberar e Abrir ${chamadaTransbordo.terminal_nome}`}
                </button>

                <div className="grid grid-cols-2 gap-3">
                  {!emAtendimento ? (
                    <button
                      type="button"
                      onClick={atenderNaPortaria}
                      className="py-3.5 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 cursor-pointer animate-pulse"
                    >
                      <PhoneCall size={18} />
                      Atender e Falar
                    </button>
                  ) : (
                    <div className="py-3.5 px-4 rounded-2xl bg-emerald-900/50 border border-emerald-500/40 text-emerald-200 font-extrabold text-xs flex items-center justify-center gap-1.5">
                      <Mic size={16} /> Em Conversa...
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={encerrarChamadaPortaria}
                    className="py-3.5 px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-rose-600/30 cursor-pointer"
                  >
                    <PhoneOff size={18} />
                    {emAtendimento ? 'Desligar' : 'Recusar / Encerrar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
