import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Unlock, X, DoorOpen, Car, Video, RefreshCw, AlertCircle, CheckCircle2, Volume2, VolumeX, Mic, PhoneCall, PhoneOff, Maximize, Minimize2, LayoutGrid, Rows2, Globe,
} from 'lucide-react';
import { api, ErroApi } from '../../lib/api';
import { obterToken, obterTokenInterfone, restaurarSessaoInterfone } from '../../lib/sessao';
import {
  acionarSireneEmergenciaNativa,
  callKitTocandoChamada,
  ehAppNativo,
  lerChamadaAtendidaNativa,
  obterUrlWsGo2rtc,
  pararSireneEmergenciaNativa,
  pararToqueInterfoneNativo,
  temAudioInterfoneNativo,
} from '../../lib/nativo';
import {
  iniciarConversaBidirecional,
  desbloquearContextoAudioConversa,
  reproduzirUlawNoContexto,
  obterAutoVozPorta,
  definirAutoVozPorta,
  obterModoSaidaAudio,
  definirModoSaidaAudio,
  obterNivelVozRecebida,
  type SessaoConversaBidirecional,
  type ModoSaidaAudio,
} from '../../lib/interfoneAudio';
import { cadastrarBiometria, temBiometriaNoAparelho } from '../../lib/webauthn';
import FotoUsuario from '../../components/FotoUsuario';

// Paridade com src/views/meu_painel.php + MeuPainelController.php ("Controle de Acesso")
// + Visualização ao vivo das câmeras de monitoramento escolhidas no painel do Síndico logo abaixo do botão Abrir Porta
// + Modal de Câmera Ao Vivo e Interfone do Controle de Acesso Facial.

interface Porta {
  valor: string;
  nome: string;
  controlador_id?: number;
  controlador_nome?: string;
  online?: boolean;
  status?: 'online' | 'offline';
  latencia_ms?: number | null;
  modo_conexao?: string;
  mensagem_status?: string;
}

interface CameraMorador {
  id: number;
  nome: string;
  localizacao: string;
  controlador_id: number | null;
  controlador_nome: string | null;
  porta_numero: number;
  bloco_id: number | null;
  modo_conexao: 'isup' | 'rtsp';
  online?: boolean;
  status?: 'online' | 'offline';
  latencia_ms?: number | null;
  mensagem_status?: string;
}

interface DadosPainel {
  tem_foto: boolean;
  tem_biometria: boolean;
  portas: Porta[];
  modulo_interfone?: boolean;
  modulo_emergencia?: boolean;
  emergencia_furar_nao_perturbe?: boolean;
  cameras_morador_ativo?: boolean;
  cameras?: CameraMorador[];
  testado_em?: string;
}

interface Aviso {
  tipo: 'ok' | 'erro';
  texto: string;
}

export interface ChamadaInterfone {
  call_id: string;
  status: 'ringing' | 'answered' | string;
  tipo?: 'portaria' | 'apartamento' | string;
  device_id: string;
  controlador_id: number;
  porta: string;
  nome_portaria: string;
  origem_nome?: string;
  origem_unidade_id?: number;
  unidade: string;
  room_number: string;
  source?: string;
  age_s?: number;
}

export interface UnidadeInterfone {
  unidade_id: number;
  numero: string;
  bloco_nome: string;
  label: string;
  codigo_discagem: string;
  ramal_custom?: string;
  moradores_count: number;
  moradores_resumo?: string;
}

export interface ItemHistoricoInterfone {
  id: number;
  call_id: string;
  tipo: 'portaria' | 'apartamento' | string;
  direcao: 'recebida' | 'realizada';
  status: 'ringing' | 'answered' | 'rejected' | 'ended' | 'missed' | 'canceled' | string;
  contraparte_nome: string;
  contraparte_unidade_id: number | null;
  contraparte_codigo: string;
  duracao_segundos: number;
  data_hora: string;
  ts: number;
}

export interface PainelInterfoneDados {
  minha_unidade: {
    unidade_id: number;
    label: string;
    codigo_principal: string;
    codigos_discagem: string[];
  };
  unidades: UnidadeInterfone[];
  historico: ItemHistoricoInterfone[];
}

export interface SessaoChamadaApartamento {
  call_id: string;
  status: 'ringing' | 'answered' | 'rejected' | 'ended' | 'missed' | 'canceled' | string;
  direcao: 'realizada' | 'recebida';
  contraparte_nome: string;
  contraparte_codigo?: string;
  device_id?: string;
}

export interface ConfirmacaoEmergencia {
  usuario_id: number;
  nome: string;
  papel: string;
  unidade: string;
  hora: string;
}

export interface AlertaEmergenciaAtivo {
  id: number;
  tipo: 'medica' | 'seguranca' | string;
  status: 'ativo' | 'controlado' | string;
  autor_id: number;
  autor_nome: string;
  autor_telefone: string;
  unidade_id: number | null;
  unidade_label: string;
  bloco_id: number | null;
  bloco_nome: string;
  detalhe: string;
  sou_autor: boolean;
  confirmacoes: ConfirmacaoEmergencia[];
  criado_em: string;
  segundos_ativos: number;
  furar_nao_perturbe?: boolean;
}

const msgErro = (e: unknown, padrao = 'Erro inesperado.') =>
  e instanceof ErroApi ? e.message : padrao;

interface InfoVisualPorta {
  ehVeiculo: boolean;
  ehSaida: boolean;
  titulo: string;
  subtitulo: string;
  etiqueta: string;
  textoBotao: string;
  textoBotaoCompacto: string;
}

function classificarPorta(porta: Porta): InfoVisualPorta {
  const bruto = (porta.nome || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const matchParen = bruto.match(/^(.+?)\s*\((.+?)\)\s*$/);
  let titulo = bruto;
  let subtitulo = '';
  if (matchParen) {
    const p1 = matchParen[1].trim();
    const p2 = matchParen[2].trim();
    // Se a descrição entre parênteses for mais amigável e não for só "Interfone", usamos p2 como destaque ou subtítulo complementar
    titulo = p1;
    if (p2.toLowerCase() !== p1.toLowerCase()) {
      subtitulo = p2;
    }
  }

  const textoBusca = `${bruto} ${porta.controlador_nome || ''}`.toLowerCase();
  const ehVeiculo =
    textoBusca.includes('veiculo') ||
    textoBusca.includes('veículo') ||
    textoBusca.includes('carro') ||
    textoBusca.includes('garagem') ||
    textoBusca.includes('estacionamento') ||
    textoBusca.includes('cancela') ||
    textoBusca.includes('auto');

  const ehSaida = !ehVeiculo && (textoBusca.includes('saida') || textoBusca.includes('saída'));

  if (ehVeiculo) {
    return {
      ehVeiculo: true,
      ehSaida: false,
      titulo: subtitulo && subtitulo.length >= 6 && subtitulo.toLowerCase() !== 'interfone' ? subtitulo : titulo,
      subtitulo: subtitulo && subtitulo.length >= 6 && subtitulo.toLowerCase() !== 'interfone' ? titulo : subtitulo,
      etiqueta: '🚗 VEÍCULOS',
      textoBotao: '🚗 ABRIR PORTÃO DE VEÍCULOS',
      textoBotaoCompacto: '🚗 ABRIR VEÍCULOS',
    };
  }

  if (ehSaida) {
    return {
      ehVeiculo: false,
      ehSaida: true,
      titulo,
      subtitulo,
      etiqueta: '🚶 SAÍDA PEDESTRE',
      textoBotao: '🔓 ABRIR SAÍDA PEDESTRE',
      textoBotaoCompacto: '🔓 ABRIR SAÍDA',
    };
  }

  return {
    ehVeiculo: false,
    ehSaida: false,
    titulo,
    subtitulo,
    etiqueta: '🚶 PEDESTRE',
    textoBotao: '🔓 ABRIR PORTA',
    textoBotaoCompacto: '🔓 ABRIR PORTA',
  };
}

function encontrarCameraParaPorta(porta: Porta, cameras: CameraMorador[]): CameraMorador | null {
  if (!cameras.length) return null;
  const [ctrlIdStr, portaNumStr] = porta.valor.split('|');
  const ctrlId = Number(ctrlIdStr) || 0;
  const portaNum = Number(portaNumStr) || 0;

  // 1. Vínculo exato de controlador + número da porta
  const exata = cameras.find((c) => c.controlador_id === ctrlId && c.porta_numero === portaNum);
  if (exata) return exata;

  // 2. Vínculo ao controlador (todas as portas)
  const doControlador = cameras.find((c) => c.controlador_id === ctrlId && (!c.porta_numero || c.porta_numero === 0));
  if (doControlador) return doControlador;

  // 3. Qualquer câmera vinculada ao mesmo controlador
  const qualquerDoCtrl = cameras.find((c) => c.controlador_id === ctrlId);
  if (qualquerDoCtrl) return qualquerDoCtrl;

  // 4. Heurística por nome (igual ao legado meu_painel.php)
  const nomePorta = porta.nome.toLowerCase();
  if (nomePorta.includes('veículo') || nomePorta.includes('veiculo') || nomePorta.includes('garagem') || nomePorta.includes('carro')) {
    const porVeiculo = cameras.find((c) => {
      const n = `${c.nome} ${c.localizacao}`.toLowerCase();
      return n.includes('veículo') || n.includes('veiculo') || n.includes('garagem');
    });
    if (porVeiculo) return porVeiculo;
  } else if (nomePorta.includes('pedestre') || nomePorta.includes('principal') || nomePorta.includes('social') || nomePorta.includes('portaria')) {
    const porPedestre = cameras.find((c) => {
      const n = `${c.nome} ${c.localizacao}`.toLowerCase();
      return n.includes('pedestre') || n.includes('principal') || n.includes('portaria') || n.includes('social');
    });
    if (porPedestre) return porPedestre;
  }

  return cameras[0];
}

function ModalCameraPortaMorador({
  porta,
  iniciarConversaAoAbrir = false,
  chamadaInterfone = null,
  onFechar,
  onPortaAberta,
}: {
  porta: Porta;
  iniciarConversaAoAbrir?: boolean;
  chamadaInterfone?: ChamadaInterfone | null;
  onFechar: () => void;
  onPortaAberta: (aviso: Aviso) => void;
}) {
  const terminalId = Number(porta.valor.split('|')[0]) || 0;
  const infoPorta = classificarPorta(porta);
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
  const [autoVozPorta, setAutoVozPorta] = useState<boolean>(() => obterAutoVozPorta());
  const [modoSaidaPorta, setModoSaidaPorta] = useState<ModoSaidaAudio>(() => obterModoSaidaAudio());
  const [transmitindoVoz, setTransmitindoVoz] = useState(false);
  const [nivelVoz, setNivelVoz] = useState(0);
  const [msgVoz, setMsgVoz] = useState<Aviso | null>(null);
  const rtcContainerRef = useRef<HTMLDivElement | null>(null);
  const sessaoConversaRef = useRef<SessaoConversaBidirecional | null>(null);
  const filaEnvioRef = useRef<Promise<void>>(Promise.resolve());
  const pacotesPendentesRef = useRef<number>(0);
  const audioAntesVozRef = useRef<boolean>(true);

  const buscarSnapshot = useCallback(async () => {
    if (!terminalId) return;
    try {
      const r = await api<{ imagem: string; horario: string }>('morador_camera_snapshot', {
        query: { terminal_id: terminalId },
      });
      setSnapshot(r.imagem);
      setHorarioSnap(r.horario);
      setErroCam('');
    } catch (e) {
      setErroCam(msgErro(e));
    } finally {
      setCarregandoCam(false);
    }
  }, [terminalId]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onFechar]);

  useEffect(() => {
    if (!terminalId) return;
    let ativo = true;
    setCarregandoCam(true);
    setErroCam('');
    setSnapshot(null);
    setStream(null);
    setVideoPronto(false);
    setModoVideo('rtc');
    setMsgModal(null);

    // 1. Dispara captura instantânea via ISAPI/ISUP (serve de base enquanto o stream ao vivo conecta)
    api<{ imagem: string; horario: string }>('morador_camera_snapshot', {
      query: { terminal_id: terminalId },
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
    api<{ stream: string }>('morador_camera_stream', {
      query: { terminal_id: terminalId },
    })
      .then((r) => {
        if (!ativo) return;
        setStream(r.stream);
      })
      .catch(() => {
        if (!ativo) return;
        setModoVideo('snapshot');
      });

    return () => {
      ativo = false;
    };
  }, [terminalId]);

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
      // No iOS/PWA, ao ativar o microfone (PlayAndRecord), o sistema pode pausar o <video> por 1 instante;
      // retomamos imediatamente para manter o áudio e vídeo da porta 100% contínuos (Full-Duplex).
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

  // Mantém o áudio da porta ativo simultaneamente (Full-Duplex) enquanto o morador conversa
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
      if (!terminalId || !audioBase64) return;
      pacotesPendentesRef.current += 1;
      setTransmitindoVoz(true);
      manterAudioCameraAtivo();

      filaEnvioRef.current = filaEnvioRef.current
        .then(async () => {
          try {
            await api<{ mensagem: string }>('morador_camera_falar', {
              corpo: {
                terminal_id: terminalId,
                audio_base64: audioBase64,
                audio_ulaw: audioBase64,
              },
            });
          } catch (e) {
            setMsgVoz({
              tipo: 'erro',
              texto:
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
    [terminalId, manterAudioCameraAtivo],
  );

  const comecarConversa = useCallback(async () => {
    if (conversaAtiva || !terminalId) return;
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
      // Garante que após o iOS ativar o microfone (PlayAndRecord), o áudio da câmera continue tocando
      manterAudioCameraAtivo();
      window.setTimeout(manterAudioCameraAtivo, 150);
    } catch (e) {
      setConversaAtiva(false);
      const msgBase =
        e instanceof Error && e.name === 'NotAllowedError'
          ? 'Permita o microfone no navegador (no iPhone/Safari: toque em "aA" na barra de endereço → Ajustes do Site → Microfone → Permitir).'
          : e instanceof Error
            ? e.message
            : 'Permita o acesso ao microfone para conversar com a porta.';
      setMsgVoz({
        tipo: 'erro',
        texto: msgBase,
      });
    }
  }, [conversaAtiva, terminalId, manterAudioCameraAtivo, enfileirarTrechoVoz]);

  const alternarAutoVoz = () => {
    const novo = !autoVozPorta;
    setAutoVozPorta(novo);
    definirAutoVozPorta(novo);
    if (novo && !conversaAtiva) {
      void comecarConversa();
    }
  };

  const cameraIniciada = Boolean(videoPronto || snapshot);

  useEffect(() => {
    if (!iniciarConversaAoAbrir && !autoVozPorta) return;
    if (iniciarConversaAoAbrir) {
      void comecarConversa();
      return;
    }
    // Quando a Voz Automática está ativa na abertura manual da câmera da porta,
    // aguarda o 1º frame/snapshot (ou 1.2s) para não competir com o handshake de vídeo do leitor facial
    const delayMs = cameraIniciada ? 150 : 1200;
    const t = window.setTimeout(() => {
      void comecarConversa();
    }, delayMs);
    return () => window.clearTimeout(t);
  }, [iniciarConversaAoAbrir, autoVozPorta, cameraIniciada, comecarConversa]);

  // Recebe e reproduz continuamente a voz do visitante (G.711 u-law 8000 Hz) via Web Audio API
  // desde o primeiro instante em que a chamada/conversa é aberta (compatível com iOS 18 PlayAndRecord)
  const escutaPortaAtiva = Boolean(terminalId && (conversaAtiva || iniciarConversaAoAbrir || chamadaInterfone || (autoVozPorta && cameraIniciada)));
  useEffect(() => {
    if (!escutaPortaAtiva || !terminalId) return;
    let cancelado = false;
    let cursor = 0;
    let emRequisicao = false;

    const buscarAudioPorta = async () => {
      if (cancelado || emRequisicao) return;
      emRequisicao = true;
      try {
        const r = await api<{ ok: boolean; audio_b64: string; cursor: number }>('morador_camera_escutar', {
          query: { terminal_id: terminalId, cursor },
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

    const tIni = window.setTimeout(buscarAudioPorta, 450);
    const timer = window.setInterval(buscarAudioPorta, 260);
    return () => {
      cancelado = true;
      window.clearTimeout(tIni);
      window.clearInterval(timer);
    };
  }, [escutaPortaAtiva, terminalId]);

  const fecharConversa = () => {
    const sessao = sessaoConversaRef.current;
    sessaoConversaRef.current = null;
    setConversaAtiva(false);
    setNivelVoz(0);
    sessao?.encerrar();
    manterAudioCameraAtivo();
    if (chamadaInterfone) {
      api('morador_interfone_sinalizar', {
        corpo: {
          call_id: chamadaInterfone.call_id,
          device_id: chamadaInterfone.device_id,
          acao: 'hangUp',
        },
      }).catch(() => undefined);
    }
  };

  const tentarNovamente = () => {
    (window as unknown as { __sectrumBlessVideo?: () => void }).__sectrumBlessVideo?.();
    setCarregandoCam(true);
    setErroCam('');
    setVideoPronto(false);
    buscarSnapshot();
    api<{ stream: string }>('morador_camera_stream', {
      query: { terminal_id: terminalId },
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
      const r = await api<{ tipo: 'ok' | 'erro'; mensagem: string; hardware?: { modo: string } }>(
        'morador_abrir_porta',
        {
          corpo: { comando_abertura: porta.valor },
        },
      );
      const simulado =
        r.hardware?.modo === 'simulado' ? ' (modo SIMULADO: nenhum comando foi enviado ao equipamento)' : '';
      const aviso: Aviso = { tipo: r.tipo, texto: `${r.mensagem}${simulado}` };
      setMsgModal(aviso);
      onPortaAberta(aviso);
    } catch (e) {
      const avisoErro: Aviso = { tipo: 'erro', texto: msgErro(e, 'Falha ao acionar porta.') };
      setMsgModal(avisoErro);
    } finally {
      setAbrindo(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[250] bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border-t-[6px] ${
          infoPorta.ehVeiculo ? 'border-t-blue-600' : 'border-t-emerald-500'
        } animate-[fadeIn_0.15s_ease-out]`}
        role="dialog"
      >
        {/* Cabeçalho do Modal */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                infoPorta.ehVeiculo ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'
              }`}
            >
              {infoPorta.ehVeiculo ? <Car size={22} /> : <DoorOpen size={22} />}
            </div>
            <div className="min-w-0 text-left">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 truncate flex items-center gap-2 flex-wrap">
                <span className="truncate">{infoPorta.titulo}</span>
                <span
                  className={`inline-flex items-center gap-1 text-[0.65rem] font-extrabold uppercase px-2 py-0.5 rounded-full border shrink-0 ${
                    infoPorta.ehVeiculo
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {infoPorta.etiqueta}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[0.68rem] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Ao Vivo
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                {infoPorta.subtitulo ? `${infoPorta.subtitulo} — ` : ''}Verifique pela câmera do leitor facial antes de liberar
              </p>
            </div>
          </div>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center shrink-0 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Quadro da Câmera do Controle de Acesso */}
        <div className="p-3.5 sm:p-5 bg-slate-50">
          <div className="relative w-full aspect-[4/3] max-h-[420px] bg-slate-950 rounded-xl overflow-hidden shadow-inner border border-slate-800 flex items-center justify-center">
            {/* Imagem Instantânea de Fundo / Modo Snapshot */}
            {snapshot && (
              <img
                src={snapshot}
                alt={`Câmera de ${porta.nome}`}
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
              <div className="flex flex-col items-center gap-3 text-slate-300 px-4 text-center">
                <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                <span className="text-sm font-semibold">Conectando à câmera de {infoPorta.titulo}...</span>
              </div>
            )}

            {/* Estado de Erro (Terminal offline) */}
            {!carregandoCam && !snapshot && !videoPronto && erroCam && (
              <div className="flex flex-col items-center gap-2 text-center px-5 text-slate-400">
                <AlertCircle size={36} className="text-amber-400 mb-1" />
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

            {/* Botão em destaque caso o navegador mobile tenha iniciado o vídeo silenciado */}
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
            <div className="absolute top-2.5 right-2.5 flex items-center justify-end flex-wrap gap-1.5 z-10 max-w-[92%]">
              {modoVideo === 'rtc' && videoPronto && (
                <button
                  type="button"
                  onClick={alternarAudio}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold backdrop-blur-xs border flex items-center gap-1.5 cursor-pointer transition ${
                    audioAtivo
                      ? 'bg-emerald-600/90 hover:bg-emerald-600 text-white border-emerald-400/40'
                      : 'bg-amber-600/90 hover:bg-amber-600 text-white border-amber-400/40'
                  }`}
                  title={audioAtivo ? 'Áudio ativo (toque para silenciar)' : 'Áudio silenciado (toque para ativar o som)'}
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

          {/* Barra de Conversa Bidirecional (Começar Conversa / Fechar Conversa + Modo Automático + Viva-Voz / No Ouvido) */}
          <div className="mt-3 p-2.5 sm:p-3 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col gap-2">
            <div className="flex items-center justify-between gap-1.5 flex-wrap px-0.5">
              <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                <Mic size={12} className="text-indigo-600" />
                Interfone Bidirecional
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={async () => {
                    const novo: ModoSaidaAudio = modoSaidaPorta === 'vivavoz' ? 'ouvido' : 'vivavoz';
                    setModoSaidaPorta(novo);
                    await definirModoSaidaAudio(novo);
                  }}
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border transition cursor-pointer ${
                    modoSaidaPorta === 'ouvido'
                      ? 'bg-indigo-600 text-white border-indigo-700'
                      : 'bg-sky-50 text-sky-700 border-sky-300'
                  }`}
                  title="Alternar entre Viva-Voz (Alto-falante) e Fone Normal (No Ouvido)"
                >
                  {modoSaidaPorta === 'ouvido' ? '👂 No Ouvido (Fone)' : '🔊 Viva-Voz'}
                </button>
                <button
                  type="button"
                  onClick={alternarAutoVoz}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border transition cursor-pointer ${
                    autoVozPorta
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                      : 'bg-slate-100 text-slate-600 border-slate-300'
                  }`}
                  title="Iniciar fala bidirecional automaticamente ao abrir a câmera da porta"
                >
                  {autoVozPorta ? '⚡ Voz Auto: Ativa' : 'Voz Auto: Off'}
                </button>
              </div>
            </div>

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
                  Silenciar / Fechar Voz
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
                <span>{msgVoz.texto}</span>
              </div>
            )}
          </div>

          {/* Alerta se o equipamento estava marcado como off-line */}
          {porta.online === false && (
            <div className="mt-3 px-3.5 py-2.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-950 flex items-start gap-2 text-xs font-semibold text-left">
              <AlertCircle size={17} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-extrabold text-amber-900">
                  ⚠️ Seu equipamento está off-line por problema de conexão
                </div>
                <div className="text-amber-800 mt-0.5">
                  {porta.mensagem_status || 'Este controlador não respondeu ao último teste de rede. Caso a conexão não tenha voltado, o comando de abrir a porta não terá efeito.'}
                </div>
              </div>
            </div>
          )}

          {/* Feedback de abertura dentro do próprio modal */}
          {msgModal && (
            <div
              className={`mt-3 px-4 py-3 rounded-xl border flex items-center gap-2.5 text-sm font-bold text-left ${
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
                {msgModal.texto}
                {msgModal.tipo === 'ok' && ' — Acompanhe a entrada pela câmera acima.'}
              </span>
            </div>
          )}

          {/* Botões de Ação */}
          <div className="flex flex-col-reverse sm:flex-row gap-2.5 sm:gap-3 mt-4 sm:mt-5">
            <button
              type="button"
              onClick={onFechar}
              className="px-5 py-3 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-sm transition cursor-pointer"
            >
              Fechar
            </button>
            <button
              type="button"
              disabled={abrindo}
              onClick={confirmarAbertura}
              className={`flex-1 py-3.5 px-5 rounded-xl text-white font-extrabold text-base sm:text-lg transition disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2 ${
                porta.online === false
                  ? 'bg-amber-600 hover:bg-amber-700 border border-amber-700 shadow-lg shadow-amber-500/20'
                  : 'bg-emerald-500 hover:bg-emerald-600 border border-emerald-600 shadow-lg shadow-emerald-500/25'
              }`}
            >
              {abrindo
                ? '⏳ Testando e enviando comando...'
                : porta.online === false
                  ? '⚠️ TENTAR ABRIR MESMO ASSIM'
                  : '🔓 CONFIRMAR E ABRIR PORTA'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CelulaCameraMosaico({
  camera,
  pausado,
  destacada,
  expandida,
  classeAspecto,
  onAlternarExpandir,
  mostrarBotaoExpandir,
}: {
  camera: CameraMorador;
  pausado: boolean;
  destacada: boolean;
  expandida: boolean;
  classeAspecto: string;
  onAlternarExpandir: () => void;
  mostrarBotaoExpandir: boolean;
}) {
  const [stream, setStream] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [horarioSnap, setHorarioSnap] = useState<string>('');
  const [videoPronto, setVideoPronto] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapFullscreenRef = useRef<HTMLDivElement | null>(null);
  const videoProntoRef = useRef(false);

  useEffect(() => {
    videoProntoRef.current = videoPronto;
  }, [videoPronto]);

  const atualizarSnapshot = useCallback(async () => {
    if (pausado || !camera?.id) return;
    try {
      const r = await api<{ imagem: string; capturado_em?: string }>('morador_cftv_snapshot', {
        query: { camera_id: camera.id },
      });
      if (r.imagem) {
        setSnapshot(r.imagem);
        if (r.capturado_em) setHorarioSnap(r.capturado_em);
        setErro('');
      }
    } catch (e) {
      setErro(msgErro(e));
    } finally {
      setCarregando(false);
    }
  }, [camera?.id, pausado]);

  useEffect(() => {
    if (pausado || !camera?.id) {
      setStream(null);
      setVideoPronto(false);
      return;
    }
    let ativo = true;
    setCarregando(true);
    setErro('');
    setSnapshot(null);
    setStream(null);
    setVideoPronto(false);

    let snapOk = false;
    let streamOk = false;
    let finalizados = 0;

    const totalEsperado = camera.modo_conexao === 'isup' ? 1 : 2;
    const finalizar = (errStr?: string) => {
      finalizados++;
      if (!ativo) return;
      if (snapOk || streamOk) {
        setCarregando(false);
      } else if (finalizados >= totalEsperado) {
        setCarregando(false);
        if (errStr) setErro(errStr);
      }
    };

    api<{ imagem: string; capturado_em?: string }>('morador_cftv_snapshot', {
      query: { camera_id: camera.id },
    })
      .then((r) => {
        if (!ativo) return;
        snapOk = true;
        setSnapshot(r.imagem);
        if (r.capturado_em) setHorarioSnap(r.capturado_em);
        setErro('');
        finalizar();
      })
      .catch((e) => finalizar(msgErro(e)));

    if (camera.modo_conexao !== 'isup') {
      api<{ stream: string }>('morador_cftv_stream', {
        query: { camera_id: camera.id },
      })
        .then((r) => {
          if (!ativo) return;
          streamOk = true;
          setStream(r.stream);
          setErro('');
          finalizar();
        })
        .catch((e) => finalizar(msgErro(e)));
    }

    return () => {
      ativo = false;
    };
  }, [camera?.id, camera?.modo_conexao, pausado]);

  // Monta o player <video-rtc> preenchendo 100% do quadro da célula do mosaico
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';
    setVideoPronto(false);
    if (pausado || !stream) return;

    const wsUrl = obterUrlWsGo2rtc(stream);

    const el = document.createElement('video-rtc') as HTMLElement & {
      src?: string;
      video?: HTMLVideoElement;
      ondisconnect?: () => void;
      onconnect?: () => void;
    };
    el.setAttribute('mode', 'webrtc,mse,hls,mjpeg');
    el.setAttribute('media', 'video');
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.display = 'block';
    container.appendChild(el);
    el.src = wsUrl;

    let ultimoTempo = -1;
    let ultimoAvancoEm = Date.now();

    const timer = window.setInterval(() => {
      const v = el.video || container.querySelector('video');
      if (v) {
        v.playsInline = true;
        v.controls = false;
        v.style.width = '100%';
        v.style.height = '100%';
        v.style.objectFit = 'fill';
        v.muted = true;
        if (v.readyState >= 2 && !v.paused && v.videoWidth > 0) {
          if (v.buffered && v.buffered.length > 0) {
            const fim = v.buffered.end(v.buffered.length - 1);
            if (fim - v.currentTime > 1.8) {
              v.currentTime = fim - 0.15;
            }
          }
          if (Math.abs(v.currentTime - ultimoTempo) > 0.01) {
            ultimoTempo = v.currentTime;
            ultimoAvancoEm = Date.now();
            setVideoPronto(true);
          } else if (!document.hidden && Date.now() - ultimoAvancoEm > 4500) {
            ultimoAvancoEm = Date.now();
            setVideoPronto(false);
            el.ondisconnect?.();
            el.onconnect?.();
          }
        } else if (v.paused && v.readyState >= 2 && !document.hidden) {
          v.play().catch(() => {
            v.muted = true;
            v.play().catch(() => undefined);
          });
        }
      }
    }, 300);

    return () => {
      window.clearInterval(timer);
      container.innerHTML = '';
    };
  }, [stream, pausado]);

  // Atualização contínua de snapshot enquanto o stream de vídeo ao vivo ainda está sincronizando
  useEffect(() => {
    if (pausado || !camera?.id) return;
    let cancelado = false;
    let timer: number | undefined;
    const ehIsup = camera.modo_conexao === 'isup';

    const loop = async () => {
      if (cancelado) return;
      if (document.hidden || videoProntoRef.current) {
        timer = window.setTimeout(loop, 2000);
        return;
      }
      let okSnap = false;
      try {
        const r = await api<{ imagem: string; capturado_em?: string }>('morador_cftv_snapshot', {
          query: { camera_id: camera.id },
        });
        if (!cancelado && r.imagem) {
          okSnap = true;
          setSnapshot(r.imagem);
          if (r.capturado_em) setHorarioSnap(r.capturado_em);
          setErro('');
          setCarregando(false);
        }
      } catch {
        // Ignora falhas transitórias
      }
      if (!cancelado) {
        const proximoMs = okSnap ? (ehIsup ? 1150 : 1800) : 4500;
        timer = window.setTimeout(loop, proximoMs);
      }
    };

    timer = window.setTimeout(loop, ehIsup ? 950 : 2000);
    return () => {
      cancelado = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [camera?.id, camera?.modo_conexao, pausado]);

  const alternarTelaCheia = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = wrapFullscreenRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => undefined);
    } else {
      document.exitFullscreen?.().catch(() => undefined);
    }
  };

  const camOnline = Boolean(videoPronto || snapshot) || (camera.online !== false && !erro);

  return (
    <div
      ref={wrapFullscreenRef}
      onClick={() => {
        if (mostrarBotaoExpandir) onAlternarExpandir();
      }}
      className={`relative w-full ${classeAspecto} rounded-xl overflow-hidden bg-slate-950 shadow-inner transition-all select-none ${
        mostrarBotaoExpandir ? 'cursor-pointer' : ''
      } ${
        destacada
          ? 'ring-2 ring-emerald-500 border border-emerald-500/80'
          : 'border border-slate-800'
      }`}
    >
      {/* Imagem base / snapshot preenchendo 100% da célula */}
      {snapshot && (
        <img
          src={snapshot}
          alt={camera.nome}
          className={`absolute inset-0 w-full h-full object-fill transition-opacity duration-200 ${
            videoPronto ? 'opacity-0 pointer-events-none' : 'opacity-100 z-[2]'
          }`}
        />
      )}

      {/* Vídeo Ao Vivo (MSE/WebRTC) preenchendo 100% da célula */}
      <div
        ref={containerRef}
        className={`w-full h-full ${stream ? 'block' : 'hidden'}`}
      />

      {/* Barra superior sobreposta: Indicador Ao Vivo / Off-line + Controles Rápidos */}
      <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between gap-1 z-10 pointer-events-none">
        <div className="flex items-center gap-1 min-w-0">
          {camOnline ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/90 backdrop-blur-xs text-white text-[9px] font-extrabold tracking-wide shadow-xs shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
              AO VIVO{camera.latencia_ms ? ` · ${camera.latencia_ms}ms` : ''}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-600/95 backdrop-blur-xs text-white text-[9px] font-extrabold tracking-wide shadow-xs shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
              OFF-LINE
            </span>
          )}
          {camera.modo_conexao === 'isup' && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-indigo-600/85 text-white text-[9px] font-extrabold shrink-0">
              <Globe size={9} /> ISUP
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 pointer-events-auto shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              atualizarSnapshot();
            }}
            className="p-1 rounded-md bg-black/60 hover:bg-black/80 text-white border border-white/15 backdrop-blur-xs cursor-pointer"
            title="Atualizar imagem"
          >
            <RefreshCw size={11} />
          </button>
          {mostrarBotaoExpandir && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAlternarExpandir();
              }}
              className="p-1 rounded-md bg-black/60 hover:bg-black/80 text-white border border-white/15 backdrop-blur-xs cursor-pointer"
              title={expandida ? 'Voltar para o mosaico' : 'Ampliar esta câmera'}
            >
              {expandida ? <Minimize2 size={11} /> : <Maximize size={11} />}
            </button>
          )}
          {!mostrarBotaoExpandir && (
            <button
              type="button"
              onClick={alternarTelaCheia}
              className="p-1 rounded-md bg-black/60 hover:bg-black/80 text-white border border-white/15 backdrop-blur-xs cursor-pointer"
              title="Tela Cheia"
            >
              <Maximize size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Estado de Carregamento */}
      {carregando && !snapshot && !videoPronto && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-slate-300 bg-slate-950/90 z-10 p-2 text-center">
          <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
          <span className="text-[11px] font-bold truncate max-w-full">{camera.nome}</span>
        </div>
      )}

      {/* Estado de Erro / Off-line */}
      {!carregando && (erro || camera.online === false) && !snapshot && !videoPronto && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-2 text-center bg-slate-950/95 z-10">
          <AlertCircle size={20} className="text-rose-400" />
          <span className="text-[10px] font-extrabold text-rose-300">
            Câmera off-line por problema de conexão
          </span>
          <span className="text-[9px] font-medium text-slate-300 line-clamp-2">
            {camera.mensagem_status || erro}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              atualizarSnapshot();
            }}
            className="px-2 py-1 rounded bg-white/15 hover:bg-white/25 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw size={10} /> Testar Reconexão
          </button>
        </div>
      )}

      {/* Rodapé sobreposto: Nome da Câmera */}
      <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between pointer-events-none z-10">
        <span className="px-2 py-0.5 rounded bg-black/65 backdrop-blur-xs text-[10px] font-bold text-white border border-white/10 truncate max-w-[82%]">
          📹 {camera.nome}
        </span>
        {horarioSnap && !videoPronto && (
          <span className="px-1.5 py-0.5 rounded bg-black/65 text-[9px] font-mono text-slate-200">
            {horarioSnap}
          </span>
        )}
      </div>
    </div>
  );
}

function PainelCameraInlineMorador({
  cameras,
  cameraAtiva,
  onSelecionarCamera,
  pausado,
}: {
  cameras: CameraMorador[];
  cameraAtiva: CameraMorador;
  onSelecionarCamera: (cam: CameraMorador) => void;
  pausado: boolean;
  onAbrirInterfone?: () => void;
  portaSelecionada?: Porta | null;
}) {
  // Se o morador tocar em uma câmera do mosaico, ela expande em 1x1; tocando novamente volta ao mosaico
  const [cameraExpandidaId, setCameraExpandidaId] = useState<number | null>(null);
  // Para 2 câmeras, permite alternar entre Mosaico Grande (1 em cima da outra preenchendo toda a largura) e Grade 2x2 Lado a Lado
  const [modoDuasColunas, setModoDuasColunas] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sectrum_mosaico_2col') === '1';
    } catch {
      return false;
    }
  });

  const alternarModoColunas = () => {
    setCameraExpandidaId(null);
    setModoDuasColunas((atual) => {
      const novo = !atual;
      try {
        localStorage.setItem('sectrum_mosaico_2col', novo ? '1' : '0');
      } catch {
        // Ignora
      }
      return novo;
    });
  };

  const total = cameras.length;
  const totalOnline = cameras.filter((c) => c.online !== false).length;
  const cameraFoco =
    cameraExpandidaId !== null ? cameras.find((c) => c.id === cameraExpandidaId) ?? null : null;
  const camerasExibidas = cameraFoco ? [cameraFoco] : cameras;

  // Define a grade proporcional ao número de câmeras habilitadas (1, 2, 3 ou 4+)
  let classeGrid = 'grid-cols-1 gap-2';
  if (!cameraFoco) {
    if (total === 1) {
      classeGrid = 'grid-cols-1 gap-2';
    } else if (total === 2) {
      classeGrid = modoDuasColunas ? 'grid-cols-2 gap-1.5 sm:gap-2' : 'grid-cols-1 sm:grid-cols-2 gap-2';
    } else {
      // 3 ou 4+ câmeras: Mosaico 2x2 proporcional preenchendo a largura e altura
      classeGrid = 'grid-cols-2 gap-1.5 sm:gap-2';
    }
  }

  return (
    <div className="mt-3.5 pt-3 border-t border-slate-200 text-left">
      {/* Cabeçalho compacto do Mosaico */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {totalOnline > 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-extrabold tracking-wide shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
              AO VIVO ({totalOnline}/{total})
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-extrabold tracking-wide shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
              CÂMERAS OFF-LINE
            </span>
          )}
          <span className="text-xs sm:text-sm font-extrabold text-slate-800 truncate">
            {cameraFoco
              ? cameraFoco.nome
              : total === 1
                ? cameras[0].nome
                : `Mosaico (${total} câmeras)`}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {cameraFoco && total > 1 && (
            <button
              type="button"
              onClick={() => setCameraExpandidaId(null)}
              className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-extrabold flex items-center gap-1 cursor-pointer shadow-xs"
            >
              <LayoutGrid size={12} />
              Ver Mosaico ({total})
            </button>
          )}
          {!cameraFoco && total === 2 && (
            <button
              type="button"
              onClick={alternarModoColunas}
              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer sm:hidden"
              title="Alternar disposição das 2 câmeras"
            >
              {modoDuasColunas ? <Rows2 size={12} /> : <LayoutGrid size={12} />}
              {modoDuasColunas ? '1 por linha' : 'Lado a lado'}
            </button>
          )}
        </div>
      </div>

      {/* Grade do Mosaico Proporcional */}
      <div className={`grid ${classeGrid}`}>
        {camerasExibidas.map((cam, idx) => {
          // Quando há 3 câmeras no mosaico 2x2, a 1ª câmera ocupa as 2 colunas do topo para fechar o retângulo sem buraco
          const spanDuploTresCams = !cameraFoco && total === 3 && idx === 0;
          const emGradeDupla =
            !cameraFoco && ((total === 2 && modoDuasColunas) || (total >= 3 && !spanDuploTresCams));
          const classeAspecto = emGradeDupla
            ? 'aspect-[4/3] sm:aspect-video'
            : 'aspect-[16/10] sm:aspect-video';

          return (
            <div key={cam.id} className={spanDuploTresCams ? 'col-span-2' : ''}>
              <CelulaCameraMosaico
                camera={cam}
                pausado={pausado}
                destacada={total > 1 && cam.id === cameraAtiva?.id && !cameraFoco}
                expandida={Boolean(cameraFoco)}
                classeAspecto={classeAspecto}
                mostrarBotaoExpandir={total > 1}
                onAlternarExpandir={() => {
                  onSelecionarCamera(cam);
                  setCameraExpandidaId((atual) => (atual === cam.id ? null : cam.id));
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
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

let wavToqueCache: string | null = null;
let audioToqueGlobal: HTMLAudioElement | null = null;
/**
 * Espaço das barras do sistema (barra de status/notch em cima e barra de gestos embaixo) para telas em tela cheia.
 * iPhone: env(safe-area-inset-*). Android (Capacitor 8 / Android 15+): env() ou a variável --safe-area-inset-*
 * injetada pelo Capacitor. No navegador comum o resultado é 0.
 */
const AREA_SEGURA_TOPO = 'max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px))';
const AREA_SEGURA_BASE = 'max(env(safe-area-inset-bottom, 0px), var(--safe-area-inset-bottom, 0px))';
const ESTILO_AREA_SEGURA = { paddingTop: AREA_SEGURA_TOPO, paddingBottom: AREA_SEGURA_BASE } as const;

let audioCtxGlobal: AudioContext | null = null;
let audioDesbloqueado = false;

/**
 * Gera em memória um arquivo WAV PCM 16-bit de toque alto de telefone/interfone (2.0s em loop).
 * Ao tocar via elemento HTML5 <audio>, o iOS utiliza a sessão de mídia (Playback), que emite som alto
 * no alto-falante mesmo quando a chave lateral do iPhone está no modo Silencioso.
 */
function gerarWavToqueInterfoneDataUrl(): string {
  if (wavToqueCache) return wavToqueCache;
  const sampleRate = 16000;
  const durationSec = 2.0;
  const numSamples = Math.floor(sampleRate * durationSec);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;
    // Toque duplo de telefone (0.00-0.40s e 0.52-0.92s) + Ding-Dong alto (1.02-1.65s)
    if ((t >= 0 && t <= 0.4) || (t >= 0.52 && t <= 0.92)) {
      const mod = Math.sin(2 * Math.PI * 20 * t) >= 0 ? 880 : 1100;
      const harm = Math.sin(2 * Math.PI * mod * t) + 0.35 * Math.sin(2 * Math.PI * (mod * 2) * t);
      sample = Math.max(-1, Math.min(1, harm * 0.85));
    } else if (t >= 1.02 && t < 1.3) {
      const env = Math.exp(-(t - 1.02) * 5.5);
      sample = Math.sin(2 * Math.PI * 783.99 * t) * env * 0.9;
    } else if (t >= 1.3 && t < 1.72) {
      const env = Math.exp(-(t - 1.3) * 4.5);
      sample = Math.sin(2 * Math.PI * 659.25 * t) * env * 0.9;
    }
    view.setInt16(44 + i * 2, Math.floor(sample * 32767), true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  wavToqueCache = 'data:audio/wav;base64,' + window.btoa(binary);
  return wavToqueCache;
}

function obterAudioToqueInterfone(): HTMLAudioElement {
  if (!audioToqueGlobal) {
    audioToqueGlobal = new Audio(gerarWavToqueInterfoneDataUrl());
    audioToqueGlobal.loop = true;
    audioToqueGlobal.preload = 'auto';
    audioToqueGlobal.volume = 1.0;
  }
  return audioToqueGlobal;
}

let wavPulsoChamandoCache: string | null = null;
let audioPulsoChamandoGlobal: HTMLAudioElement | null = null;

/**
 * Gera em memória um arquivo WAV PCM 16-bit com o tom de chamada PADRÃO da telefonia brasileira (Anatel):
 * tom único de 425 Hz, 1,0 s tocando + 4,0 s de silêncio (ciclo de 5 s em loop) — o mesmo "tuuu... tuuu..." de uma ligação comum.
 * Antes eram dois tons sobrepostos (425 Hz + 440 Hz com harmônicos) e um segundo pulso sintetizado fora de sincronia,
 * o que soava como "dois toques" ao mesmo tempo.
 * Por usar HTML5 <audio>, toca alto mesmo com a chave Silencioso (🔕) ativada no iPhone e no Android.
 */
function gerarWavPulsoChamandoDataUrl(): string {
  if (wavPulsoChamandoCache) return wavPulsoChamandoCache;
  const sampleRate = 16000;
  const durationSec = 5.0;
  const numSamples = Math.floor(sampleRate * durationSec);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;
    // Tom de 1,0s ("tuuuuu...") seguido de 4,0s de silêncio, com rampas suaves de 30 ms (sem estalos)
    if (t >= 0.0 && t < 1.0) {
      let env = 1.0;
      if (t < 0.03) env = t / 0.03;
      else if (t > 0.97) env = (1.0 - t) / 0.03;
      sample = Math.sin(2 * Math.PI * 425 * t) * env * 0.7;
    }
    view.setInt16(44 + i * 2, Math.floor(sample * 32767), true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  wavPulsoChamandoCache = 'data:audio/wav;base64,' + window.btoa(binary);
  return wavPulsoChamandoCache;
}

function obterAudioPulsoChamando(): HTMLAudioElement {
  if (!audioPulsoChamandoGlobal) {
    audioPulsoChamandoGlobal = new Audio(gerarWavPulsoChamandoDataUrl());
    audioPulsoChamandoGlobal.loop = true;
    audioPulsoChamandoGlobal.preload = 'auto';
    audioPulsoChamandoGlobal.volume = 1.0;
  }
  return audioPulsoChamandoGlobal;
}

/**
 * Inicia imediatamente o som de pulso de chamada ("tuuu... tuuu...") dentro do gesto de clique do morador.
 */
export function iniciarPulsoChamando(): void {
  try {
    const el = obterAudioPulsoChamando();
    el.muted = false;
    el.volume = 1.0;
    el.currentTime = 0;
    el.play().catch(() => undefined);
  } catch {
    // Ignora
  }
}

export function pararPulsoChamando(): void {
  try {
    if (audioPulsoChamandoGlobal) {
      audioPulsoChamandoGlobal.pause();
      audioPulsoChamandoGlobal.currentTime = 0;
    }
  } catch {
    // Ignora
  }
}

let wavSireneEmergenciaCache: string | null = null;
let audioSireneEmergenciaGlobal: HTMLAudioElement | null = null;

/**
 * Gera em memória um arquivo WAV PCM 16-bit com o Alarme Oficial estilo Defesa Civil / Cell Broadcast (WEA / EAS):
 * Combina os dois tons dissonantes oficiais (853 Hz + 960 Hz simultâneos com harmônicos ímpares de onda quadrada)
 * na cadência oficial da Defesa Civil (1 pulso longo de 0.85s + 2 pulsos curtos de 0.45s: BEEEEEEP - BEEP - BEEP),
 * tocando em volume máximo via HTML5 <audio> (canal de mídia que ignora a chave Silencioso no iPhone/iOS com app aberto).
 */
function gerarWavSireneEmergenciaDataUrl(): string {
  if (wavSireneEmergenciaCache) return wavSireneEmergenciaCache;
  const sampleRate = 22050;
  const durationSec = 2.3;
  const numSamples = Math.floor(sampleRate * durationSec);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  const f1 = 853; // Frequência 1 oficial EAS / Defesa Civil
  const f2 = 960; // Frequência 2 oficial EAS / Defesa Civil

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Cadência oficial Cell Broadcast Defesa Civil:
    // Pulso 1 (longo): 0.00s - 0.85s | Pausa: 0.85s - 1.00s
    // Pulso 2 (curto): 1.00s - 1.45s | Pausa: 1.45s - 1.60s
    // Pulso 3 (curto): 1.60s - 2.05s | Pausa: 2.05s - 2.30s
    const ativo =
      (t >= 0.0 && t <= 0.85) ||
      (t >= 1.0 && t <= 1.45) ||
      (t >= 1.6 && t <= 2.05);

    if (!ativo) {
      view.setInt16(44 + i * 2, 0, true);
      continue;
    }

    const w1 = 2 * Math.PI * f1 * t;
    const w2 = 2 * Math.PI * f2 * t;

    // Soma de 853 Hz + 960 Hz com harmônicos ímpares (timbre estridente da Defesa Civil)
    const tom1 = Math.sin(w1) + 0.33 * Math.sin(3 * w1) + 0.18 * Math.sin(5 * w1);
    const tom2 = Math.sin(w2) + 0.33 * Math.sin(3 * w2) + 0.18 * Math.sin(5 * w2);
    const misto = (tom1 + tom2) * 0.55;
    const sample = Math.max(-1, Math.min(1, misto));
    view.setInt16(44 + i * 2, Math.floor(sample * 32767), true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  wavSireneEmergenciaCache = 'data:audio/wav;base64,' + window.btoa(binary);
  return wavSireneEmergenciaCache;
}

export function obterAudioSireneEmergencia(): HTMLAudioElement {
  if (!audioSireneEmergenciaGlobal) {
    audioSireneEmergenciaGlobal = new Audio(gerarWavSireneEmergenciaDataUrl());
    audioSireneEmergenciaGlobal.loop = true;
    audioSireneEmergenciaGlobal.preload = 'auto';
    audioSireneEmergenciaGlobal.volume = 1.0;
  }
  return audioSireneEmergenciaGlobal;
}

export function pararSireneEmergencia(): void {
  pararSireneEmergenciaNativa();
  try {
    if (audioSireneEmergenciaGlobal) {
      audioSireneEmergenciaGlobal.pause();
      audioSireneEmergenciaGlobal.currentTime = 0;
    }
  } catch {
    // Ignora
  }
}

let wavSentinelaDndCache: string | null = null;
let audioSentinelaDndGlobal: HTMLAudioElement | null = null;
let furarNaoPerturbeCondominioAtivo = true;

/**
 * Gera um loop WAV sub-audível (amplitude 1 LSB = 0.003%, 100% silencioso ao ouvido humano)
 * para manter o canal HTML5 <audio> (MediaPlayback) autenticado no iOS (iPhone) e Android.
 * Como o modo "Não Perturbe" e a chave "Silencioso" NÃO silenciam o canal MediaPlayback,
 * manter esta trilha ativa permite disparar a Sirene da Defesa Civil em volume 100% mesmo com a tela bloqueada!
 */
function gerarWavSentinelaNaoPerturbeDataUrl(): string {
  if (wavSentinelaDndCache) return wavSentinelaDndCache;
  const sampleRate = 8000;
  const durationSec = 2.0;
  const numSamples = Math.floor(sampleRate * durationSec);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
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
    // Amplitude 1 em 32767 (0 dB SPL = inaudível, mas impede o SO de suspender o canal de mídia)
    view.setInt16(44 + i * 2, i % 2 === 0 ? 1 : -1, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  wavSentinelaDndCache = 'data:audio/wav;base64,' + window.btoa(binary);
  return wavSentinelaDndCache;
}

export function definirModoFurarNaoPerturbe(ativo: boolean): void {
  furarNaoPerturbeCondominioAtivo = ativo;
  // No App Nativo iOS, o próprio AppDelegate.swift mantém o AVAudioPlayer nativo em segundo plano.
  // Evita que o processo WebContent do WKWebView roube a sessão de áudio nativa ao bloquear a tela.
  if (
    typeof document !== 'undefined' &&
    (document.documentElement.classList.contains('sectrum-ios-native') ||
      window.Capacitor?.getPlatform?.() === 'ios')
  ) {
    return;
  }
  try {
    if (!ativo && audioSentinelaDndGlobal && !audioSentinelaDndGlobal.paused) {
      audioSentinelaDndGlobal.pause();
    } else if (ativo && audioDesbloqueado) {
      if (!audioSentinelaDndGlobal) {
        audioSentinelaDndGlobal = new Audio(gerarWavSentinelaNaoPerturbeDataUrl());
        audioSentinelaDndGlobal.loop = true;
        audioSentinelaDndGlobal.volume = 0.01;
      }
      if (audioSentinelaDndGlobal.paused) {
        audioSentinelaDndGlobal.play().catch(() => undefined);
      }
    }
  } catch {
    // Ignora
  }
}

export function acionarSireneEmergenciaBackground(furarDnd = true): void {
  if (!furarDnd) return;
  acionarSireneEmergenciaNativa(
    'emergencia',
    '🚨 ALERTA DE EMERGÊNCIA SECTRUM',
    'Pedido de socorro acionado no condomínio!',
    furarDnd,
  );
  try {
    const elSirene = obterAudioSireneEmergencia();
    elSirene.muted = false;
    elSirene.volume = 1.0;
    if (elSirene.paused) {
      elSirene.play().catch(() => undefined);
    }
    if ('vibrate' in navigator) {
      navigator.vibrate([1000, 150, 500, 150, 500, 250, 1000]);
    }
  } catch {
    // Ignora
  }
}

let desbloqueioAudioEmAndamento = false;

/**
 * Libera a reprodução de áudio do navegador no primeiro toque do morador (exigência de autoplay dos navegadores).
 *
 * Correção do "apito de dois tons" ao abrir o app: antes, este desbloqueio dava play (no mudo) na própria
 * campainha do interfone — que começa com dois bipes — e era disparado 3 vezes seguidas no primeiro toque
 * (touchstart + pointerdown + click). Uma chamada tirava o mudo enquanto outra ainda tocava e os bipes vazavam.
 * Agora:
 *  - no app nativo (iOS/Android) NÃO toca nada: o Capacitor já libera o áudio sem gesto
 *    (iOS `mediaTypesRequiringUserActionForPlayback = []`, Android `setMediaPlaybackRequiresUserGesture(false)`);
 *  - no navegador, o desbloqueio roda uma única vez por vez e mantém os sons no MUDO
 *    (cada ponto que toca de verdade já tira o mudo antes do play).
 */
export function desbloquearAudioInterfone(): void {
  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      if (!audioCtxGlobal) audioCtxGlobal = new AudioCtx();
      if (audioCtxGlobal.state === 'suspended') {
        audioCtxGlobal.resume().catch(() => undefined);
      }
    }
    if (!audioDesbloqueado && ehAppNativo()) {
      audioDesbloqueado = true;
    }
    if (!audioDesbloqueado && !desbloqueioAudioEmAndamento) {
      desbloqueioAudioEmAndamento = true;
      const desbloquearElemento = (el: HTMLAudioElement): Promise<void> => {
        if (!el.paused) return Promise.resolve();
        el.muted = true;
        return Promise.resolve(el.play())
          .then(() => {
            el.pause();
            el.currentTime = 0;
          })
          .catch(() => undefined);
      };
      Promise.all([
        desbloquearElemento(obterAudioToqueInterfone()),
        desbloquearElemento(obterAudioPulsoChamando()),
        desbloquearElemento(obterAudioSireneEmergencia()),
      ]).finally(() => {
        desbloqueioAudioEmAndamento = false;
        audioDesbloqueado = true;
        if (furarNaoPerturbeCondominioAtivo) {
          definirModoFurarNaoPerturbe(true);
        }
      });
    } else if (audioDesbloqueado && furarNaoPerturbeCondominioAtivo) {
      definirModoFurarNaoPerturbe(true);
    }
  } catch {
    // Ignora
  }
}

export function ModalAlertaEmergenciaAtiva({
  emergencia,
  silenciado,
  onAlternarSilencio,
  onIndoAjudar,
  onEncerrarAlerta,
  onInterfonarUnidade,
  enviandoAcao,
}: {
  emergencia: AlertaEmergenciaAtivo;
  silenciado: boolean;
  onAlternarSilencio: () => void;
  onIndoAjudar: () => void;
  onEncerrarAlerta: () => void;
  onInterfonarUnidade?: (unidadeId: number, label: string) => void;
  enviandoAcao: string | null;
}) {
  const ehMedica = emergencia.tipo === 'medica';
  const furarDnd = emergencia.furar_nao_perturbe !== false;

  // Mantém a tela acesa (Screen Wake Lock API) no iPhone e Android enquanto o alerta de emergência estiver aberto
  useEffect(() => {
    let wakeLock: { release?: () => Promise<void> } | null = null;
    const nav = navigator as unknown as {
      wakeLock?: { request: (type: 'screen') => Promise<{ release?: () => Promise<void> }> };
    };
    const pedirWakeLock = async () => {
      try {
        if (nav.wakeLock && document.visibilityState === 'visible') {
          wakeLock = await nav.wakeLock.request('screen');
        }
      } catch {
        // Ignora se navegador não suportar
      }
    };
    pedirWakeLock();
    const aoVisibilidade = () => {
      if (document.visibilityState === 'visible') pedirWakeLock();
    };
    document.addEventListener('visibilitychange', aoVisibilidade);
    return () => {
      document.removeEventListener('visibilitychange', aoVisibilidade);
      try {
        wakeLock?.release?.();
      } catch {}
    };
  }, [emergencia.id]);

  // Toca Alarme Oficial estilo Defesa Civil (853 Hz + 960 Hz simultâneos) + Web Audio API + Vibração intensa
  useEffect(() => {
    const elSirene = obterAudioSireneEmergencia();
    if (silenciado) {
      pararSireneEmergencia();
      try {
        if ('vibrate' in navigator) navigator.vibrate(0);
      } catch {}
      return;
    }

    let cancelado = false;
    elSirene.muted = false;
    elSirene.volume = furarDnd ? 1.0 : 0.75;

    // Registra MediaSession prioritária no iOS/Android para manter o áudio em destaque mesmo na tela de bloqueio
    try {
      if ('mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: ehMedica ? '🚑 EMERGÊNCIA MÉDICA NO CONDOMÍNIO' : '🚨 ALERTA DE PÂNICO / SEGURANÇA',
          artist: emergencia.unidade_label || 'Condomínio Sectrum',
          album: 'Alerta Crítico Condominial (Defesa Civil)',
        });
        navigator.mediaSession.playbackState = 'playing';
      }
    } catch {}

    const tentarPlay = () => {
      if (cancelado || silenciado) return;
      if (elSirene.paused) {
        elSirene.play().catch(() => undefined);
      }
    };
    tentarPlay();

    const aoTocar = () => {
      if (!cancelado && !silenciado) tentarPlay();
    };
    window.addEventListener('touchstart', aoTocar, { passive: true });
    window.addEventListener('pointerdown', aoTocar, { passive: true });
    window.addEventListener('click', aoTocar, { passive: true });

    const cicloSirene = () => {
      if (cancelado || silenciado) return;
      tentarPlay();
      try {
        if ('vibrate' in navigator) {
          // Cadência de vibração padrão Defesa Civil / WEA (1 longo + 2 curtos)
          navigator.vibrate(furarDnd ? [900, 140, 480, 140, 480] : [500, 200, 500]);
        }
      } catch {}
      try {
        const AudioCtx =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        if (!audioCtxGlobal) audioCtxGlobal = new AudioCtx();
        const ctx = audioCtxGlobal;
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => undefined);
        }
        const now = ctx.currentTime;
        // Osciladores simultâneos (853 Hz + 960 Hz + harmônico 1706 Hz = Sinal Oficial da Defesa Civil / EAS)
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const osc3 = ctx.createOscillator();
        const gain = ctx.createGain();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.setValueAtTime(-12, now);
        comp.knee.setValueAtTime(10, now);
        comp.ratio.setValueAtTime(12, now);
        comp.attack.setValueAtTime(0.002, now);
        comp.release.setValueAtTime(0.15, now);

        osc1.type = 'square';
        osc2.type = 'sawtooth';
        osc3.type = 'square';
        osc1.frequency.setValueAtTime(853, now);
        osc2.frequency.setValueAtTime(960, now);
        osc3.frequency.setValueAtTime(1706, now);

        const volPico = furarDnd ? 0.65 : 0.35;
        // Cadência: Pulso longo (0.00s - 0.85s) + Pulso curto (1.00s - 1.45s) + Pulso curto (1.60s - 2.05s)
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(volPico, now + 0.02);
        gain.gain.setValueAtTime(volPico, now + 0.83);
        gain.gain.linearRampToValueAtTime(0.0001, now + 0.86);

        gain.gain.setValueAtTime(0.0001, now + 0.99);
        gain.gain.linearRampToValueAtTime(volPico, now + 1.01);
        gain.gain.setValueAtTime(volPico, now + 1.43);
        gain.gain.linearRampToValueAtTime(0.0001, now + 1.46);

        gain.gain.setValueAtTime(0.0001, now + 1.59);
        gain.gain.linearRampToValueAtTime(volPico, now + 1.61);
        gain.gain.setValueAtTime(volPico, now + 2.03);
        gain.gain.linearRampToValueAtTime(0.0001, now + 2.06);

        osc1.connect(gain);
        osc2.connect(gain);
        if (furarDnd) {
          osc3.connect(gain);
        }
        gain.connect(comp);
        comp.connect(ctx.destination);
        osc1.start(now);
        osc2.start(now);
        if (furarDnd) osc3.start(now);
        osc1.stop(now + 2.1);
        osc2.stop(now + 2.1);
        if (furarDnd) osc3.stop(now + 2.1);
      } catch {}
    };

    cicloSirene();
    const timer = window.setInterval(cicloSirene, 2300);

    return () => {
      cancelado = true;
      window.clearInterval(timer);
      window.removeEventListener('touchstart', aoTocar);
      window.removeEventListener('pointerdown', aoTocar);
      window.removeEventListener('click', aoTocar);
      pararSireneEmergencia();
      try {
        if ('vibrate' in navigator) navigator.vibrate(0);
      } catch {}
    };
  }, [emergencia.id, emergencia.unidade_label, ehMedica, furarDnd, silenciado]);

  const nomeMoradorExib =
    emergencia.autor_nome ||
    (emergencia as unknown as { morador_nome?: string }).morador_nome ||
    'Morador';
  const foneMoradorExib =
    emergencia.autor_telefone ||
    (emergencia as unknown as { morador_telefone?: string }).morador_telefone ||
    '';
  const telefoneLimpo = foneMoradorExib.replace(/\D/g, '');
  const confirmacoesLista = Array.isArray(emergencia.confirmacoes) ? emergencia.confirmacoes : [];

  return (
    <div
      style={{ paddingTop: `calc(${AREA_SEGURA_TOPO} + 12px)`, paddingBottom: `calc(${AREA_SEGURA_BASE} + 12px)` }}
      className="fixed inset-0 z-[10000] bg-slate-950/95 backdrop-blur-md text-white flex flex-col justify-between overflow-y-auto p-3 sm:p-5 select-none"
    >
      {/* Borda de Giroflex Piscando */}
      <div
        className={`pointer-events-none fixed inset-0 border-[6px] sm:border-[10px] animate-pulse ${
          ehMedica ? 'border-rose-500 shadow-[inset_0_0_60px_rgba(244,63,94,0.55)]' : 'border-red-600 shadow-[inset_0_0_70px_rgba(220,38,38,0.65)]'
        }`}
      />

      <div className="relative z-10 max-w-lg w-full mx-auto my-auto bg-slate-900 border-2 border-rose-500/90 rounded-3xl overflow-hidden shadow-2xl">
        {/* Topo de Emergência */}
        <div
          className={`px-5 py-4 text-center ${
            ehMedica
              ? 'bg-gradient-to-r from-rose-600 via-red-600 to-orange-600'
              : 'bg-gradient-to-r from-red-700 via-rose-600 to-indigo-700'
          }`}
        >
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-black/35 border border-white/25 text-white text-[11px] font-black uppercase tracking-widest mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
            {emergencia.bloco_nome
              ? `Alerta no ${emergencia.bloco_nome} • Portaria • Síndico`
              : 'Alerta Geral • Bloco • Portaria • Síndico'}
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white uppercase drop-shadow">
            {ehMedica ? '🚑 EMERGÊNCIA MÉDICA!' : '🚨 EMERGÊNCIA DE SEGURANÇA!'}
          </h1>
          <p className="text-xs sm:text-sm font-bold text-rose-100 mt-0.5">
            {emergencia.sou_autor
              ? 'Seu pedido de socorro foi disparado! Vizinhos do bloco, Portaria e Síndico estão sendo alertados.'
              : 'Pedido de socorro imediato acionado no seu condomínio!'}
          </p>
        </div>

        {/* Dados Principais: Unidade + Morador + Detalhe */}
        <div className="p-4 sm:p-5 space-y-4">
          <div className="rounded-2xl bg-rose-950/60 border-2 border-rose-500/70 p-4 text-center space-y-1.5 shadow-inner">
            <div className="text-[11px] font-extrabold uppercase tracking-widest text-rose-300">
              Local da Emergência
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {emergencia.unidade_label}
            </div>
            <div className="text-sm sm:text-base font-extrabold text-amber-300">
              Morador(a): {nomeMoradorExib}
            </div>
            {emergencia.detalhe && (
              <div className="mt-2 pt-2 border-t border-rose-500/30 text-xs sm:text-sm font-bold text-rose-100 bg-black/25 rounded-xl px-3 py-2">
                “{emergencia.detalhe}”
              </div>
            )}
          </div>

          {/* Lista em tempo real de quem já está indo ajudar / ciente */}
          <div className="rounded-2xl bg-slate-800/90 border border-slate-700 p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 size={15} />
                Quem já confirmou socorro ({confirmacoesLista.length})
              </span>
              <button
                type="button"
                onClick={onAlternarSilencio}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold flex items-center gap-1 cursor-pointer transition ${
                  silenciado
                    ? 'bg-slate-700 text-slate-200 border border-slate-600'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-400/40 hover:bg-amber-500/30'
                }`}
              >
                {silenciado ? <VolumeX size={13} /> : <Volume2 size={13} />}
                {silenciado ? 'Sirene Silenciada' : 'Silenciar Sirene'}
              </button>
            </div>

            {confirmacoesLista.length === 0 ? (
              <div className="text-xs text-slate-400 font-semibold py-1">
                ⏳ Aguardando confirmação dos vizinhos do bloco, portaria ou síndico...
              </div>
            ) : (
              <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                {confirmacoesLista.map((c, i) => {
                  const horaConfirm = c.hora || (c as unknown as { horario?: string }).horario || '';
                  const unidConfirm = c.unidade || (c as unknown as { origem?: string }).origem || 'Vizinho';
                  return (
                    <div
                      key={`${c.usuario_id}-${i}`}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-xs"
                    >
                      <div className="font-bold text-emerald-200 truncate">
                        🏃 {c.nome}{' '}
                        <span className="text-emerald-400 font-extrabold">
                          ({c.papel === 'portaria' ? 'Portaria' : c.papel === 'sindico' || c.papel === 'admin' ? 'Síndico/Adm' : unidConfirm})
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-300 shrink-0">
                        Indo ajudar{horaConfirm ? ` • ${horaConfirm}` : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Botões de Ação */}
          <div className="space-y-2.5 pt-1">
            {!emergencia.sou_autor && (
              <button
                type="button"
                disabled={enviandoAcao !== null}
                onClick={onIndoAjudar}
                className="w-full py-3.5 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-60 text-slate-950 font-black text-sm sm:text-base shadow-xl shadow-emerald-500/30 flex items-center justify-center gap-2 cursor-pointer transition"
              >
                <CheckCircle2 size={20} />
                {enviandoAcao === 'indo_ajudar'
                  ? '⏳ Confirmando...'
                  : '🏃 ESTOU INDO AJUDAR / CIENTE (Silenciar Sirene)'}
              </button>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {!emergencia.sou_autor && emergencia.unidade_id && onInterfonarUnidade && (
                <button
                  type="button"
                  onClick={() => {
                    onAlternarSilencio();
                    onInterfonarUnidade(emergencia.unidade_id!, emergencia.unidade_label);
                  }}
                  className="py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer transition"
                >
                  <PhoneCall size={16} />
                  📞 Interfonar p/ Apartamento
                </button>
              )}

              {!emergencia.sou_autor && telefoneLimpo.length >= 10 && (
                <a
                  href={`tel:${telefoneLimpo}`}
                  className="py-3 px-4 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer transition no-underline"
                >
                  <PhoneCall size={16} />
                  📱 Ligar p/ Celular do Morador
                </a>
              )}
            </div>

            <button
              type="button"
              disabled={enviandoAcao !== null}
              onClick={onEncerrarAlerta}
              className={`w-full py-3.5 px-4 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-2 cursor-pointer transition shadow-xl ${
                emergencia.sou_autor
                  ? 'bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 shadow-emerald-500/30'
                  : 'bg-slate-800 hover:bg-slate-700 border border-slate-500 text-white'
              }`}
            >
              {enviandoAcao === 'encerrar'
                ? '⏳ Encerrando alerta...'
                : emergencia.sou_autor
                  ? '🛑 PARAR ALARME / CANCELAR EMERGÊNCIA'
                  : '✅ Situação Controlada / Encerrar Alerta de Emergência'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CardBotaoEmergenciaMorador({
  onEmergenciaAcionada,
}: {
  onEmergenciaAcionada: (aviso: Aviso) => void;
}) {
  const [tipoConfirmacao, setTipoConfirmacao] = useState<'medica' | 'seguranca' | null>(null);
  const [detalhe, setDetalhe] = useState('');
  const [acionando, setAcionando] = useState(false);

  const opcoesRapidas =
    tipoConfirmacao === 'medica'
      ? [
          'Mal-estar súbito / Desmaio no apartamento',
          'Queda / Acidente doméstico — preciso de ajuda',
          'Falta de ar / Emergência cardíaca',
          'Preciso de socorro médico urgente na unidade',
        ]
      : [
          'Pessoa suspeita / Tentativa de invasão no bloco',
          'Pedido de socorro / Violência / Ameaça',
          'Princípio de incêndio / Fumaça / Vazamento de gás',
          'Emergência grave de segurança no apartamento',
        ];

  const dispararEmergenciaAgora = async () => {
    if (!tipoConfirmacao || acionando) return;
    desbloquearAudioInterfone();
    setAcionando(true);
    try {
      const r = await api<{
        ok: boolean;
        mensagem: string;
        emergencia?: AlertaEmergenciaAtivo;
      }>('morador_emergencia_acionar', {
        corpo: {
          tipo: tipoConfirmacao,
          detalhe: detalhe.trim(),
        },
      });
      setTipoConfirmacao(null);
      setDetalhe('');
      onEmergenciaAcionada({
        tipo: 'ok',
        texto:
          r.mensagem ||
          '🚨 Alerta de emergência disparado! Moradores do bloco, Portaria e Síndico foram notificados.',
      });
      // Dispara evento com o objeto emergencia para o monitor global abrir o modal instantaneamente
      window.dispatchEvent(new CustomEvent('sectrum-emergencia-disparada', { detail: r.emergencia }));
    } catch (e) {
      onEmergenciaAcionada({
        tipo: 'erro',
        texto: e instanceof ErroApi ? e.message : 'Não foi possível acionar o alerta de emergência.',
      });
    } finally {
      setAcionando(false);
    }
  };

  return (
    <>
      <div className="bg-gradient-to-r from-rose-50 via-red-50 to-amber-50 rounded-[20px] border-2 border-rose-200/90 px-3 sm:px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-rose-600 text-white flex items-center justify-center text-sm font-black shadow-xs animate-pulse">
              🆘
            </span>
            <div className="text-left">
              <h2 className="text-sm sm:text-base font-black text-rose-950 leading-tight">
                Botão de Emergência (SOS)
              </h2>
              <p className="text-[11px] font-semibold text-rose-800/90 leading-tight">
                Toca sirene e avisa imediatamente seu Bloco, Portaria e Síndico
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
          <button
            type="button"
            onClick={() => {
              desbloquearAudioInterfone();
              setDetalhe('');
              setTipoConfirmacao('medica');
            }}
            className="rounded-2xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white p-2.5 sm:p-3 flex flex-col items-center justify-center gap-1 shadow-md shadow-rose-600/20 border border-rose-500 cursor-pointer transition"
          >
            <span className="text-xl sm:text-2xl leading-none">🚑</span>
            <span className="text-xs sm:text-sm font-black tracking-tight uppercase">
              Emergência Médica
            </span>
            <span className="text-[10px] font-semibold text-rose-100 leading-tight">
              Mal-estar, queda, socorro
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              desbloquearAudioInterfone();
              setDetalhe('');
              setTipoConfirmacao('seguranca');
            }}
            className="rounded-2xl bg-slate-900 hover:bg-slate-800 active:bg-black text-white p-2.5 sm:p-3 flex flex-col items-center justify-center gap-1 shadow-md shadow-slate-900/20 border border-red-500/80 cursor-pointer transition"
          >
            <span className="text-xl sm:text-2xl leading-none">🚨</span>
            <span className="text-xs sm:text-sm font-black tracking-tight uppercase text-red-400">
              Segurança / Pânico
            </span>
            <span className="text-[10px] font-semibold text-slate-300 leading-tight">
              Invasão, suspeito, incêndio
            </span>
          </button>
        </div>
      </div>

      {/* Modal de Confirmação Rápida (Evita esbarrão acidental e permite escolher motivo em 1 toque) */}
      {tipoConfirmacao && (
        <div
          className="fixed inset-0 z-[9995] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3.5"
          onClick={() => !acionando && setTipoConfirmacao(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border-2 border-rose-500 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`px-5 py-4 text-white flex items-center justify-between ${
                tipoConfirmacao === 'medica'
                  ? 'bg-gradient-to-r from-rose-600 to-red-600'
                  : 'bg-gradient-to-r from-slate-900 via-red-900 to-rose-700'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">{tipoConfirmacao === 'medica' ? '🚑' : '🚨'}</span>
                <div>
                  <h3 className="text-base sm:text-lg font-black uppercase leading-tight">
                    {tipoConfirmacao === 'medica'
                      ? 'Acionar Emergência Médica'
                      : 'Acionar Emergência de Segurança'}
                  </h3>
                  <p className="text-[11px] font-semibold text-rose-100">
                    Dispara sirene para Moradores do seu Bloco, Portaria e Síndico
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={acionando}
                onClick={() => setTipoConfirmacao(null)}
                className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-3.5">
              <div>
                <div className="text-xs font-extrabold text-slate-700 mb-2">
                  O que está acontecendo? (Opcional — toque rápido ou digite):
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {opcoesRapidas.map((op) => {
                    const ativo = detalhe === op;
                    return (
                      <button
                        key={op}
                        type="button"
                        onClick={() => setDetalhe(ativo ? '' : op)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold text-left border transition cursor-pointer flex items-center justify-between gap-2 ${
                          ativo
                            ? 'bg-rose-50 border-rose-500 text-rose-900 ring-1 ring-rose-500'
                            : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                        }`}
                      >
                        <span>{op}</span>
                        {ativo && <CheckCircle2 size={15} className="text-rose-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <input
                  type="text"
                  value={detalhe}
                  onChange={(e) => setDetalhe(e.target.value)}
                  placeholder="Ou digite um detalhe rápido (ex: Preciso de ajuda no apto)..."
                  maxLength={240}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="pt-1 flex flex-col-reverse sm:flex-row gap-2">
                <button
                  type="button"
                  disabled={acionando}
                  onClick={() => setTipoConfirmacao(null)}
                  className="px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={acionando}
                  onClick={dispararEmergenciaAgora}
                  className="flex-1 py-3.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:opacity-60 text-white font-black text-sm sm:text-base shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2 cursor-pointer animate-pulse"
                >
                  {acionando
                    ? '⏳ Disparando Sirene e Alertas...'
                    : '🚨 DISPARAR ALERTA E SIRENE AGORA'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function ModalChamadaInterfoneRecebida({
  chamada,
  onAtender,
  onRecusar,
  onAbrirDireto,
  abrindoDireto,
}: {
  chamada: ChamadaInterfone;
  onAtender: () => void;
  onRecusar: () => void;
  onAbrirDireto: () => void;
  abrindoDireto: boolean;
}) {
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [horarioSnap, setHorarioSnap] = useState<string>('');

  // Toca campainha alta via HTML5 <audio loop> (canal de mídia que ignora modo silencioso no iOS) + Web Audio + vibração
  useEffect(() => {
    let cancelado = false;
    const elAudio = obterAudioToqueInterfone();
    elAudio.muted = false;
    elAudio.volume = 1.0;
    elAudio.currentTime = 0;

    const tentarPlayAudio = () => {
      if (cancelado) return;
      // iPhone: a tela nativa (CallKit) já está tocando esta chamada -> não toca uma segunda campainha por cima
      if (callKitTocandoChamada(chamada.call_id)) {
        if (!elAudio.paused) elAudio.pause();
        return;
      }
      elAudio.play().catch(() => undefined);
    };
    tentarPlayAudio();

    const aoTocarTela = () => {
      if (cancelado) return;
      tentarPlayAudio();
    };
    window.addEventListener('touchstart', aoTocarTela, { passive: true });
    window.addEventListener('pointerdown', aoTocarTela, { passive: true });
    window.addEventListener('click', aoTocarTela, { passive: true });

    const tocarPulso = () => {
      if (cancelado) return;
      try {
        if ('vibrate' in navigator) {
          navigator.vibrate([700, 100, 700]);
        }
      } catch {
        // Ignora
      }
      if (callKitTocandoChamada(chamada.call_id)) {
        if (!elAudio.paused) elAudio.pause();
        return;
      }
      if (elAudio.paused) {
        tentarPlayAudio();
      }
      // A campainha é UMA só (<audio> em loop). A melodia sintetizada abaixo só toca como reserva,
      // quando o navegador bloqueou o <audio> — antes as duas tocavam juntas e soavam como "dois toques".
      if (!elAudio.paused) return;
      try {
        const AudioCtx =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        if (!audioCtxGlobal) audioCtxGlobal = new AudioCtx();
        const ctx = audioCtxGlobal;
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => undefined);
        }
        const now = ctx.currentTime;
        const notas = [
          { freq: 880.0, ini: 0, dur: 0.25 },
          { freq: 1108.73, ini: 0.26, dur: 0.25 },
          { freq: 783.99, ini: 0.56, dur: 0.28 },
          { freq: 659.25, ini: 0.86, dur: 0.35 },
        ];
        notas.forEach(({ freq, ini, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + ini);
          gain.gain.setValueAtTime(0.001, now + ini);
          gain.gain.exponentialRampToValueAtTime(0.65, now + ini + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + ini + dur);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + ini);
          osc.stop(now + ini + dur + 0.02);
        });
      } catch {
        // Ignora bloqueio de autoplay
      }
    };

    tocarPulso();
    const timer = window.setInterval(tocarPulso, 1300);

    // Pulso de notificação nativa a cada 2.2s enquanto estiver tocando (faz o iOS/Android vibrar e tocar som nativo do sistema)
    const timerNotif = window.setInterval(() => {
      if (cancelado) return;
      try {
        if ('serviceWorker' in navigator && 'Notification' in window && Notification.permission === 'granted') {
          navigator.serviceWorker.ready
            .then((reg) =>
              reg.showNotification(`📲 CHAMADA DE INTERFONE — ${chamada.nome_portaria}`, {
                body: `🔴 Chamando ${chamada.unidade || `Unidade ${chamada.room_number}`} agora! Toque para atender!`,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag: `sectrum-interfone-${Date.now()}`,
                renotify: true,
                requireInteraction: true,
                vibrate: [700, 100, 700, 100, 800],
              } as NotificationOptions),
            )
            .catch(() => {});
        }
      } catch {
        // Ignora
      }
    }, 2200);

    return () => {
      cancelado = true;
      window.clearInterval(timer);
      window.clearInterval(timerNotif);
      window.removeEventListener('touchstart', aoTocarTela);
      window.removeEventListener('pointerdown', aoTocarTela);
      window.removeEventListener('click', aoTocarTela);
      try {
        elAudio.pause();
        elAudio.currentTime = 0;
      } catch {
        // Ignora
      }
      try {
        if ('vibrate' in navigator) navigator.vibrate(0);
      } catch {
        // Ignora
      }
      pararToqueInterfoneNativo();
      try {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.ready
            .then((reg) => reg.getNotifications())
            .then((lista) => lista.forEach((n) => n.close()))
            .catch(() => {});
        }
      } catch {
        // Ignora
      }
    };
  }, [chamada.call_id, chamada.nome_portaria, chamada.room_number, chamada.unidade]);

  // Captura foto instantânea do visitante em frente ao leitor facial a cada 1.1s
  useEffect(() => {
    if (!chamada.controlador_id) return;
    let cancelado = false;
    const buscar = async () => {
      try {
        const r = await api<{ imagem: string; horario: string }>('morador_camera_snapshot', {
          query: { terminal_id: chamada.controlador_id },
        });
        if (!cancelado && r.imagem) {
          setSnapshot(r.imagem);
          setHorarioSnap(r.horario || '');
        }
      } catch {
        // Ignora
      }
    };
    buscar();
    const t = window.setInterval(buscar, 1100);
    return () => {
      cancelado = true;
      window.clearInterval(t);
    };
  }, [chamada.controlador_id]);

  const ehChamadaApartamento =
    chamada.tipo === 'apartamento' ||
    chamada.source === 'apartamento' ||
    !chamada.controlador_id ||
    String(chamada.device_id || '').toUpperCase().startsWith('APT:');

  return (
    <div style={ESTILO_AREA_SEGURA} className="fixed inset-0 z-[9999] bg-slate-950 text-white flex flex-col justify-between overflow-hidden select-none">
      {/* Fundo em tela cheia com a imagem da câmera borrada para visual de chamada nativa */}
      {snapshot && !ehChamadaApartamento && (
        <img
          src={snapshot}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-25 blur-xl scale-110 pointer-events-none"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/90 via-slate-900/75 to-slate-950/95 pointer-events-none" />

      {/* Cabeçalho estilo Ligação iPhone / CallKit */}
      <div className="relative z-10 pt-8 sm:pt-10 px-6 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 text-xs font-extrabold uppercase tracking-widest mb-3 shadow-lg">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
          {ehChamadaApartamento ? 'Interfone entre Apartamentos' : 'Chamada de Vídeo / Interfone'}
        </div>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white drop-shadow">
          {chamada.origem_nome || chamada.nome_portaria}
        </h1>
        <p className="text-sm sm:text-base text-emerald-300 font-bold mt-1">
          Chamando {chamada.unidade || `Unidade ${chamada.room_number}`}...
        </p>
      </div>

      {/* Visor central de vídeo ao vivo do visitante (ou Avatar quando é de outro apartamento) */}
      <div className="relative z-10 px-4 sm:px-6 my-auto py-3 flex flex-col items-center">
        <div className="relative w-full max-w-md aspect-[4/3] rounded-3xl overflow-hidden bg-slate-900 border-2 border-emerald-500/70 shadow-2xl shadow-emerald-500/20 flex items-center justify-center">
          {ehChamadaApartamento ? (
            <div className="flex flex-col items-center gap-4 text-slate-200 p-6 text-center">
              <div className="relative flex items-center justify-center">
                <span className="absolute w-28 h-28 rounded-full bg-emerald-500/20 animate-ping" />
                <div className="w-24 h-24 rounded-full bg-emerald-500/30 border-2 border-emerald-400 flex items-center justify-center text-emerald-300 shadow-lg">
                  <PhoneCall size={42} className="animate-bounce" />
                </div>
              </div>
              <div className="space-y-1">
                <span className="block text-lg font-extrabold text-white">
                  {chamada.origem_nome || chamada.nome_portaria}
                </span>
                <span className="block text-xs font-semibold text-emerald-300">
                  Ligação de voz do condomínio — Toque em Atender para conversar
                </span>
              </div>
            </div>
          ) : snapshot ? (
            <img
              src={snapshot}
              alt="Visitante na portaria"
              className="w-full h-full object-cover select-none"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-slate-300 p-6 text-center">
              <div className="relative flex items-center justify-center">
                <span className="absolute w-24 h-24 rounded-full bg-emerald-500/20 animate-ping" />
                <div className="w-20 h-20 rounded-full bg-emerald-500/30 border-2 border-emerald-400 flex items-center justify-center text-emerald-300">
                  <PhoneCall size={36} className="animate-bounce" />
                </div>
              </div>
              <span className="text-sm font-bold text-slate-200 mt-2">
                Conectando vídeo da portaria...
              </span>
            </div>
          )}
          <div className="absolute top-3 left-3 flex items-center gap-1.5">
            <span className="px-2.5 py-1 rounded-full bg-emerald-600/95 text-white text-[11px] font-extrabold uppercase flex items-center gap-1.5 shadow-md">
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              {ehChamadaApartamento ? 'Interfone Condomínio' : 'Ao Vivo na Porta'}
            </span>
          </div>
          {horarioSnap && !ehChamadaApartamento && (
            <span className="absolute bottom-3 right-3 px-2.5 py-1 rounded-lg bg-black/75 text-xs font-mono text-slate-200">
              {horarioSnap}
            </span>
          )}
        </div>
      </div>

      {/* Rodapé estilo Chamada Telefônica (Recusar / Atender / Abrir Porta) */}
      <div className="relative z-10 px-5 pb-8 sm:pb-10 pt-2 w-full max-w-md mx-auto space-y-4">
        {!ehChamadaApartamento && chamada.porta && (
          <button
            type="button"
            disabled={abrindoDireto}
            onClick={onAbrirDireto}
            className="w-full py-3.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-60 text-white font-extrabold text-sm border border-indigo-400/40 shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer transition"
          >
            <Unlock size={18} />
            {abrindoDireto ? '⏳ Abrindo Portão...' : '🔓 Reconheci pela foto — Abrir Porta Agora'}
          </button>
        )}

        <div className="grid grid-cols-2 gap-4 pt-1">
          <button
            type="button"
            onClick={onRecusar}
            className="flex flex-col items-center justify-center gap-2 py-4 px-4 rounded-3xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-black text-base shadow-xl shadow-rose-600/30 cursor-pointer transition"
          >
            <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center">
              <PhoneOff size={26} />
            </div>
            <span>Recusar</span>
          </button>

          <button
            type="button"
            onClick={onAtender}
            className="flex flex-col items-center justify-center gap-2 py-4 px-4 rounded-3xl bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-black text-base shadow-xl shadow-emerald-500/40 cursor-pointer transition animate-pulse"
          >
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
              <PhoneCall size={26} />
            </div>
            <span>Atender</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function ModalConversaApartamento({
  sessao,
  onEncerrar,
  onStatusMudou,
}: {
  sessao: SessaoChamadaApartamento;
  onEncerrar: () => void;
  onStatusMudou: (novoStatus: string) => void;
}) {
  const [nivelVoz, setNivelVoz] = useState(0);
  const [nivelVozRemota, setNivelVozRemota] = useState(0);
  const [mudo, setMudo] = useState(false);
  // iPhone (app nativo): áudio da conversa feito pelo iOS, começando no FONE DE OUVIDO como uma ligação comum.
  // (O WKWebView do iPhone só consegue tocar no viva-voz.)
  const usarAudioNativo = useMemo(() => temAudioInterfoneNativo(), []);
  const [modoSaida, setModoSaida] = useState<ModoSaidaAudio>(() => (usarAudioNativo ? 'ouvido' : obterModoSaidaAudio()));
  const [segundosConversa, setSegundosConversa] = useState(0);
  const [pulsoChamada, setPulsoChamada] = useState(1);
  const [pulsoAtivoVisual, setPulsoAtivoVisual] = useState(true);
  const [erroMic, setErroMic] = useState('');
  const sessaoMicRef = useRef<SessaoConversaBidirecional | null>(null);
  const enviosAtivosRef = useRef<number>(0);
  const mudoRef = useRef<boolean>(false);
  const modoSaidaRef = useRef<ModoSaidaAudio>(modoSaida);
  const jaEncerrandoRef = useRef<boolean>(false);
  const onStatusMudouRef = useRef(onStatusMudou);
  useEffect(() => {
    onStatusMudouRef.current = onStatusMudou;
  });

  useEffect(() => {
    mudoRef.current = mudo;
  }, [mudo]);

  useEffect(() => {
    modoSaidaRef.current = modoSaida;
    const elPulso = obterAudioPulsoChamando();
    elPulso.volume = modoSaida === 'ouvido' ? 0.22 : 1.0;
  }, [modoSaida]);

  const alternarModoSaida = async () => {
    const novo: ModoSaidaAudio = modoSaida === 'vivavoz' ? 'ouvido' : 'vivavoz';
    setModoSaida(novo);
    if (usarAudioNativo) {
      window.SectrumAndroid?.saidaAudioInterfoneNativo?.(novo);
      return;
    }
    if (sessaoMicRef.current) {
      await sessaoMicRef.current.definirModoSaida(novo);
    } else {
      await definirModoSaidaAudio(novo);
    }
  };

  // iPhone (áudio nativo): repassa o "mudo" para o iOS
  useEffect(() => {
    if (usarAudioNativo && sessao.status === 'answered') {
      window.SectrumAndroid?.mudoAudioInterfoneNativo?.(mudo);
    }
  }, [usarAudioNativo, mudo, sessao.status]);

  // Enquanto está chamando outro apartamento ('ringing'), toca o pulso de chamada telefônica ("tuuu... tuuu...")
  // respeitando o volume mais suave caso o morador tenha selecionado "No Ouvido (Fone)"
  useEffect(() => {
    if (sessao.status !== 'ringing') {
      pararPulsoChamando();
      return;
    }
    let cancelado = false;
    setPulsoChamada(1);
    setPulsoAtivoVisual(true);

    const elPulso = obterAudioPulsoChamando();
    elPulso.muted = false;
    elPulso.volume = modoSaidaRef.current === 'ouvido' ? 0.22 : 1.0;
    const tentarPlay = () => {
      if (cancelado) return;
      if (elPulso.paused) {
        elPulso.play().catch(() => undefined);
      }
    };
    tentarPlay();

    const aoTocarTela = () => {
      if (!cancelado) tentarPlay();
    };
    window.addEventListener('touchstart', aoTocarTela, { passive: true });
    window.addEventListener('pointerdown', aoTocarTela, { passive: true });
    window.addEventListener('click', aoTocarTela, { passive: true });

    let numToque = 0;
    let timerOff: number | undefined;

    const dispararCicloPulso = () => {
      if (cancelado) return;
      numToque += 1;
      setPulsoChamada(numToque);
      setPulsoAtivoVisual(true);
      tentarPlay();

      try {
        if ('vibrate' in navigator) {
          navigator.vibrate(45);
        }
      } catch {
        // Ignora
      }

      // O som é SOMENTE o tom padrão do <audio> em loop (425 Hz, 1s/4s). Não sintetiza um segundo tom por cima.
      timerOff = window.setTimeout(() => {
        if (!cancelado) setPulsoAtivoVisual(false);
      }, 1000);
    };

    dispararCicloPulso();
    // Mesmo ciclo do tom (5s) para o contador "Nº toque" acompanhar o som
    const t = window.setInterval(dispararCicloPulso, 5000);
    return () => {
      cancelado = true;
      window.clearInterval(t);
      if (timerOff) window.clearTimeout(timerOff);
      window.removeEventListener('touchstart', aoTocarTela);
      window.removeEventListener('pointerdown', aoTocarTela);
      window.removeEventListener('click', aoTocarTela);
      pararPulsoChamando();
    };
  }, [sessao.status]);

  // Cronômetro da conversa quando atendida ('answered') + atualização visual de voz recebida
  useEffect(() => {
    if (sessao.status !== 'answered') {
      setSegundosConversa(0);
      setNivelVozRemota(0);
      return;
    }
    const t = window.setInterval(() => {
      setSegundosConversa((s) => s + 1);
    }, 1000);
    const tVozRemota = window.setInterval(() => {
      setNivelVozRemota(obterNivelVozRecebida());
    }, 120);
    return () => {
      window.clearInterval(t);
      window.clearInterval(tVozRemota);
    };
  }, [sessao.status]);

  // Quando a chamada entra em 'answered', liga automaticamente o microfone em MODO FULL-DUPLEX TEMPO REAL
  useEffect(() => {
    if (sessao.status !== 'answered') return;
    let cancelado = false;
    pararPulsoChamando();

    // iPhone (app nativo): o iOS faz microfone + fone de ouvido/viva-voz (com cancelamento de eco)
    if (usarAudioNativo) {
      window.SectrumAndroid?.iniciarAudioInterfoneNativo?.(sessao.call_id, modoSaidaRef.current);
      window.SectrumAndroid?.mudoAudioInterfoneNativo?.(mudoRef.current);
      setErroMic('');
      const aoStatusNativo = (ev: Event) => {
        const d = (ev as CustomEvent<{ call_id?: string; status?: string } | undefined>).detail;
        if (d?.call_id === sessao.call_id && d.status) {
          onStatusMudouRef.current(d.status);
        }
      };
      window.addEventListener('sectrum-audio-nativo-status', aoStatusNativo);
      return () => {
        window.removeEventListener('sectrum-audio-nativo-status', aoStatusNativo);
        window.SectrumAndroid?.encerrarAudioInterfoneNativo?.();
      };
    }

    desbloquearContextoAudioConversa();

    iniciarConversaBidirecional({
      modoFullDuplex: true,
      modoSaidaInicial: modoSaidaRef.current,
      onNivelVoz: (n) => {
        if (!cancelado) setNivelVoz(mudoRef.current ? 0 : n);
      },
      onTrechoVoz: (b64) => {
        if (cancelado || mudoRef.current || !b64) return;
        // Envio paralelo controlado (máx 2 em voo) para nunca atrasar pacotes em conversa Full-Duplex
        if (enviosAtivosRef.current >= 2) return;
        enviosAtivosRef.current += 1;
        api('morador_interfone_falar', {
          corpo: {
            call_id: sessao.call_id,
            audio_base64: b64,
          },
        })
          .catch(() => {})
          .finally(() => {
            enviosAtivosRef.current = Math.max(0, enviosAtivosRef.current - 1);
          });
      },
    })
      .then((s) => {
        if (cancelado) {
          s.encerrar();
          return;
        }
        sessaoMicRef.current = s;
        setErroMic('');
      })
      .catch((e) => {
        if (!cancelado) {
          setErroMic(e instanceof Error ? e.message : 'Permita o acesso ao microfone para falar.');
        }
      });

    return () => {
      cancelado = true;
      sessaoMicRef.current?.encerrar();
      sessaoMicRef.current = null;
    };
  }, [sessao.call_id, sessao.status, usarAudioNativo]);

  // Loop de escuta da outra unidade em tempo real (a cada 135ms) totalmente independente do envio (Full-Duplex).
  // No iPhone com áudio nativo, o iOS toca a voz; aqui só acompanhamos o status da chamada (mais devagar).
  useEffect(() => {
    let cancelado = false;
    let cursor = 0;
    let emReq = false;
    const somenteStatus = usarAudioNativo;

    const cicloEscuta = async () => {
      if (cancelado || emReq) return;
      emReq = true;
      try {
        const r = await api<{
          ok: boolean;
          cursor: number;
          bytes: number;
          audio_b64: string;
          call_status?: string;
        }>('morador_interfone_escutar', {
          query: { call_id: sessao.call_id, cursor },
        });
        if (cancelado) return;
        if (typeof r.cursor === 'number' && r.cursor > 0) {
          cursor = r.cursor;
        }
        if (!somenteStatus && r.ok && r.audio_b64) {
          reproduzirUlawNoContexto(r.audio_b64);
          setNivelVozRemota(obterNivelVozRecebida());
        }
        if (r.call_status && r.call_status !== sessao.status) {
          onStatusMudou(r.call_status);
        }
      } catch {
        // Ignora
      } finally {
        emReq = false;
      }
    };

    const timer = window.setInterval(cicloEscuta, somenteStatus ? 800 : 135);
    return () => {
      cancelado = true;
      window.clearInterval(timer);
    };
  }, [sessao.call_id, sessao.status, onStatusMudou, usarAudioNativo]);

  // Se a chamada foi recusada, perdida ou encerrada pela outra ponta, fecha após 1.6s
  useEffect(() => {
    if (['rejected', 'ended', 'missed', 'canceled'].includes(sessao.status)) {
      pararPulsoChamando();
      sessaoMicRef.current?.encerrar();
      sessaoMicRef.current = null;
      const t = window.setTimeout(() => {
        if (!jaEncerrandoRef.current) {
          jaEncerrandoRef.current = true;
          onEncerrar();
        }
      }, 1500);
      return () => window.clearTimeout(t);
    }
  }, [sessao.status, onEncerrar]);

  const formatarTempo = (seg: number) => {
    const m = Math.floor(seg / 60);
    const s = seg % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const labelStatus =
    sessao.status === 'ringing'
      ? `Chamando apartamento... (${pulsoChamada}º toque)`
      : sessao.status === 'answered'
        ? `Em conversa • ${formatarTempo(segundosConversa)}`
        : sessao.status === 'rejected'
          ? 'Chamada recusada / ocupado'
          : sessao.status === 'missed'
            ? 'Não atendida'
            : 'Chamada encerrada';

  const energiaTotalVisual = Math.max(nivelVoz, nivelVozRemota) / 100;

  return (
    <div style={ESTILO_AREA_SEGURA} className="fixed inset-0 z-[9999] bg-slate-950 text-white flex flex-col justify-between overflow-hidden select-none">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-950 to-black pointer-events-none" />

      {/* Topo da Ligação */}
      <div className="relative z-10 pt-8 sm:pt-10 px-6 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 text-xs font-extrabold uppercase tracking-widest mb-3">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              sessao.status === 'answered'
                ? 'bg-emerald-400 animate-ping'
                : sessao.status === 'ringing'
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-rose-400'
            }`}
          />
          Interfone Digital • Full-Duplex
        </div>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
          {sessao.contraparte_nome}
        </h1>
        <p
          className={`text-base font-extrabold mt-1.5 ${
            sessao.status === 'answered'
              ? 'text-emerald-400'
              : sessao.status === 'ringing'
                ? 'text-amber-300'
                : 'text-rose-400'
          }`}
        >
          {labelStatus}
        </p>

        {/* Pílula indicadora do modo de saída atual */}
        {(sessao.status === 'ringing' || sessao.status === 'answered') && (
          <div className="mt-2.5 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-[11px] font-bold text-slate-200">
            <span>
              {modoSaida === 'ouvido'
                ? '👂 Modo Fone Normal (Encoste o celular no ouvido)'
                : '🔊 Modo Viva-Voz (Alto-falante aberto)'}
            </span>
          </div>
        )}
      </div>

      {/* Centro com Avatar e Ondas de Pulso / Voz Simultânea */}
      <div className="relative z-10 my-auto px-6 flex flex-col items-center gap-5">
        <div className="relative flex items-center justify-center">
          {(sessao.status === 'ringing' || sessao.status === 'answered') && (
            <>
              <span
                className={`absolute w-36 h-36 rounded-full animate-ping ${
                  sessao.status === 'ringing' ? 'bg-amber-400/20' : 'bg-emerald-500/15'
                }`}
                style={{ animationDuration: sessao.status === 'ringing' ? '1.4s' : '2s' }}
              />
              <span
                className={`absolute w-28 h-28 rounded-full transition-transform duration-150 ${
                  sessao.status === 'ringing'
                    ? pulsoAtivoVisual
                      ? 'bg-indigo-400/35 scale-125'
                      : 'bg-indigo-500/15 scale-100'
                    : 'bg-emerald-500/25'
                }`}
                style={
                  sessao.status === 'answered'
                    ? { transform: `scale(${1 + Math.min(0.45, energiaTotalVisual * 0.55)})` }
                    : undefined
                }
              />
            </>
          )}
          <div
            className={`relative w-24 h-24 rounded-full border-2 flex items-center justify-center shadow-2xl ${
              sessao.status === 'answered'
                ? 'bg-emerald-600/30 border-emerald-400 text-emerald-300'
                : sessao.status === 'ringing'
                  ? 'bg-indigo-600/30 border-indigo-400 text-indigo-300'
                  : 'bg-rose-600/30 border-rose-400 text-rose-300'
            }`}
          >
            <PhoneCall size={42} className={sessao.status === 'ringing' ? 'animate-bounce' : ''} />
          </div>
        </div>

        {sessao.status === 'ringing' && (
          <div className="w-full max-w-xs space-y-2 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-indigo-950/80 border border-indigo-500/40 text-indigo-200 text-xs font-extrabold shadow-lg">
              <Volume2 size={16} className={pulsoAtivoVisual ? 'text-amber-300 animate-pulse' : 'text-indigo-400'} />
              <span>
                {pulsoAtivoVisual
                  ? `🔊 Pulso de chamada ("tuuu...") • ${pulsoChamada}º toque`
                  : `⏳ Aguardando atendimento (${pulsoChamada}º toque)...`}
              </span>
            </div>
            <div className="flex items-end justify-center gap-1.5 h-6 pt-1">
              {[0.5, 0.9, 1.0, 0.75, 1.0, 0.85, 0.55].map((mult, idx) => (
                <span
                  key={idx}
                  className={`w-1.5 rounded-full transition-all duration-200 ${
                    pulsoAtivoVisual ? 'bg-amber-400' : 'bg-slate-700'
                  }`}
                  style={{
                    height: pulsoAtivoVisual ? `${Math.round(mult * 22)}px` : '5px',
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {sessao.status === 'answered' && (
          <div className="w-full max-w-xs space-y-2.5 text-center bg-slate-900/80 border border-slate-800 rounded-2xl p-3.5">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
                <span>🎙️ Sua Voz</span>
                <span className="text-emerald-400">{mudo ? 'Silenciado' : 'Transmitindo'}</span>
              </div>
              <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-teal-300 transition-all duration-75"
                  style={{ width: `${Math.min(100, Math.max(6, nivelVoz))}%` }}
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
                <span>🔊 Voz de {sessao.contraparte_nome}</span>
                <span className="text-sky-400">
                  {modoSaida === 'ouvido' ? '👂 No Ouvido' : '🔊 Viva-Voz'}
                </span>
              </div>
              <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-sky-400 to-indigo-400 transition-all duration-75"
                  style={{ width: `${Math.min(100, Math.max(6, nivelVozRemota))}%` }}
                />
              </div>
            </div>

            <p className="text-[11px] font-semibold text-slate-300 pt-0.5">
              {mudo
                ? '🔇 Seu microfone está silenciado'
                : '⚡ Conversa em tempo real — Podem falar juntos normalmente'}
            </p>
          </div>
        )}

        {erroMic && (
          <div className="px-4 py-2.5 rounded-xl bg-rose-500/20 border border-rose-400/50 text-rose-200 text-xs font-bold max-w-xs text-center">
            {erroMic}
          </div>
        )}
      </div>

      {/* Botões de Controle da Chamada (Viva-Voz / No Ouvido + Silenciar + Desligar) */}
      <div className="relative z-10 px-5 pb-9 w-full max-w-md mx-auto">
        <div className="flex items-center justify-center gap-3 sm:gap-5">
          {(sessao.status === 'ringing' || sessao.status === 'answered') && (
            <button
              type="button"
              onClick={alternarModoSaida}
              className={`flex flex-col items-center justify-center gap-1.5 py-3.5 px-4 sm:px-5 rounded-3xl font-extrabold text-xs sm:text-sm transition cursor-pointer min-w-[96px] ${
                modoSaida === 'vivavoz'
                  ? 'bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/30'
                  : 'bg-indigo-600 text-white border border-indigo-400/50 shadow-lg shadow-indigo-600/30'
              }`}
            >
              <div className="w-11 h-11 rounded-full bg-black/15 flex items-center justify-center text-lg">
                {modoSaida === 'vivavoz' ? <Volume2 size={23} /> : <span>👂</span>}
              </div>
              <span>{modoSaida === 'vivavoz' ? 'Viva-Voz' : 'No Ouvido'}</span>
            </button>
          )}

          {sessao.status === 'answered' && (
            <button
              type="button"
              onClick={() => setMudo((m) => !m)}
              className={`flex flex-col items-center justify-center gap-1.5 py-3.5 px-4 sm:px-5 rounded-3xl font-extrabold text-xs sm:text-sm transition cursor-pointer min-w-[96px] ${
                mudo
                  ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30'
                  : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
              }`}
            >
              <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center">
                {mudo ? <VolumeX size={23} /> : <Mic size={23} />}
              </div>
              <span>{mudo ? 'Ativar Mic' : 'Silenciar'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              jaEncerrandoRef.current = true;
              pararPulsoChamando();
              sessaoMicRef.current?.encerrar();
              sessaoMicRef.current = null;
              // iPhone: se a chamada foi atendida pela tela nativa (CallKit), encerra também a ligação do iOS
              if (usarAudioNativo) {
                window.SectrumAndroid?.desligarChamadaNativa?.(sessao.call_id);
              }
              onEncerrar();
            }}
            className="flex flex-col items-center justify-center gap-1.5 py-3.5 px-6 sm:px-7 rounded-3xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-black text-xs sm:text-sm shadow-xl shadow-rose-600/40 cursor-pointer transition min-w-[104px]"
          >
            <div className="w-11 h-11 rounded-full bg-white/15 flex items-center justify-center">
              <PhoneOff size={24} />
            </div>
            <span>{sessao.status === 'ringing' ? 'Cancelar' : 'Desligar'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function PainelInterfoneDigitalMorador({
  dadosInterfone,
  carregando,
  discando,
  onDiscarUnidade,
  onDiscarCodigo,
  onAtualizar,
}: {
  dadosInterfone: PainelInterfoneDados | null;
  carregando: boolean;
  discando: boolean;
  onDiscarUnidade: (u: UnidadeInterfone) => void;
  onDiscarCodigo: (codigo: string) => void;
  onAtualizar: () => void;
}) {
  const [aba, setAba] = useState<'discar' | 'historico'>('discar');
  const [codigoDigitado, setCodigoDigitado] = useState('');
  const [mostrarTeclado, setMostrarTeclado] = useState(false);

  const unidadesBrutas = dadosInterfone?.unidades ?? [];
  const historico = dadosInterfone?.historico ?? [];
  const minhaUnidade = dadosInterfone?.minha_unidade;

  // Camada extra de deduplicação no frontend por código de discagem/ramal
  const unidades = (() => {
    const mapa = new Map<string, UnidadeInterfone>();
    for (const u of unidadesBrutas) {
      const chave = (u.codigo_discagem || u.label).toLowerCase().trim();
      const existente = mapa.get(chave);
      if (!existente) {
        mapa.set(chave, { ...u });
      } else {
        if (u.moradores_count > 0 && existente.moradores_count === 0) {
          existente.unidade_id = u.unidade_id;
        }
        existente.moradores_count += u.moradores_count;
        if (u.moradores_resumo && !existente.moradores_resumo) {
          existente.moradores_resumo = u.moradores_resumo;
        }
      }
    }
    return Array.from(mapa.values());
  })();

  const termoBusca = codigoDigitado.trim().toLowerCase();
  const unidadesFiltradas = termoBusca
    ? unidades.filter(
        (u) =>
          u.codigo_discagem.toLowerCase().includes(termoBusca) ||
          u.numero.toLowerCase().includes(termoBusca) ||
          u.label.toLowerCase().includes(termoBusca) ||
          (u.moradores_resumo && u.moradores_resumo.toLowerCase().includes(termoBusca)),
      )
    : unidades;

  const chamadasPerdidasCount = historico.filter(
    (h) => h.direcao === 'recebida' && (h.status === 'missed' || h.status === 'rejected'),
  ).length;

  const formatarDuracao = (s: number) => {
    if (!s || s <= 0) return '';
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m > 0 ? `${m}m ${r}s` : `${r}s`;
  };

  return (
    <div className="bg-white rounded-[22px] border border-slate-200/90 px-3.5 sm:px-5 py-4 shadow-sm space-y-3.5">
      {/* Cabeçalho Premium do Interfone Digital */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-indigo-500/25">
            <PhoneCall size={19} />
          </div>
          <div className="text-left min-w-0">
            <h2 className="text-base sm:text-lg font-black text-slate-900 leading-tight truncate">
              Interfone Digital
            </h2>
            {minhaUnidade ? (
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200/80 text-[11px] font-extrabold text-indigo-700">
                  Ramal {minhaUnidade.codigo_principal || minhaUnidade.label}
                </span>
                <span className="text-[11px] font-semibold text-slate-500 truncate">
                  {minhaUnidade.label}
                </span>
              </div>
            ) : (
              <p className="text-[11px] font-semibold text-slate-500">
                Chamadas de voz em tempo real entre apartamentos
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onAtualizar}
          className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer transition shrink-0"
          title="Atualizar lista de apartamentos e histórico"
        >
          <RefreshCw size={16} className={carregando ? 'animate-spin text-indigo-600' : ''} />
        </button>
      </div>

      {/* Seletor de Abas: Interfonar p/ Apartamento vs Registro de Chamadas */}
      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-slate-100 border border-slate-200/60">
        <button
          type="button"
          onClick={() => setAba('discar')}
          className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition ${
            aba === 'discar'
              ? 'bg-white text-indigo-700 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <PhoneCall size={14} />
          <span>Interfonar p/ Apto</span>
        </button>

        <button
          type="button"
          onClick={() => setAba('historico')}
          className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition ${
            aba === 'historico'
              ? 'bg-white text-indigo-700 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>Histórico</span>
          {historico.length > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                chamadasPerdidasCount > 0
                  ? 'bg-rose-500 text-white'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {historico.length}
            </span>
          )}
        </button>
      </div>

      {aba === 'discar' ? (
        <div className="space-y-3">
          {/* Visor de Discagem e Busca em Largura Total (sem cortar o texto em telas mobile) */}
          <div className="space-y-2">
            <div className="relative w-full">
              <input
                type="text"
                value={codigoDigitado}
                onChange={(e) => setCodigoDigitado(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && codigoDigitado.trim()) {
                    onDiscarCodigo(codigoDigitado.trim());
                  }
                }}
                placeholder="Digite o ramal (ex: 0103) ou busque o apto..."
                className="w-full pl-3.5 pr-9 py-3 rounded-xl bg-slate-50 focus:bg-white border border-slate-300 focus:border-indigo-500 focus:outline-none text-sm font-extrabold text-slate-900 placeholder:font-medium placeholder:text-slate-400 transition"
              />
              {codigoDigitado && (
                <button
                  type="button"
                  onClick={() => setCodigoDigitado('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  aria-label="Limpar"
                >
                  <X size={17} />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMostrarTeclado((v) => !v)}
                className={`py-2.5 px-3 rounded-xl border text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                  mostrarTeclado
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>🔢</span>
                <span>{mostrarTeclado ? 'Ocultar Teclado' : 'Abrir Teclado'}</span>
              </button>

              <button
                type="button"
                disabled={discando || !codigoDigitado.trim()}
                onClick={() => onDiscarCodigo(codigoDigitado.trim())}
                className="py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-45 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition"
              >
                <PhoneCall size={15} />
                <span>Chamar Ramal</span>
              </button>
            </div>
          </div>

          {/* Teclado Numérico de Interfone (expansível sob demanda) */}
          {mostrarTeclado && (
            <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-2">
              <div className="grid grid-cols-3 gap-1.5">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Limpar', '0', '⌫'].map((tecla) => (
                  <button
                    key={tecla}
                    type="button"
                    onClick={() => {
                      if (tecla === 'Limpar') setCodigoDigitado('');
                      else if (tecla === '⌫') setCodigoDigitado((v) => v.slice(0, -1));
                      else setCodigoDigitado((v) => (v + tecla).slice(0, 8));
                    }}
                    className={`py-2.5 rounded-xl border font-extrabold text-sm shadow-2xs cursor-pointer transition ${
                      tecla === 'Limpar' || tecla === '⌫'
                        ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-600 text-xs'
                        : 'bg-white hover:bg-indigo-50 active:bg-indigo-100 border-slate-200 text-slate-900 text-base'
                    }`}
                  >
                    {tecla}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Cabeçalho da Lista de Apartamentos */}
          <div className="flex items-center justify-between px-0.5 pt-0.5">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              Apartamentos do Condomínio ({unidadesFiltradas.length})
            </span>
            <span className="text-[11px] font-semibold text-slate-400">
              Toque para ligar
            </span>
          </div>

          {/* Lista de Apartamentos Deduplicada e com Visual Moderno */}
          <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
            {unidadesFiltradas.length === 0 ? (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs font-semibold text-slate-500">
                {unidades.length === 0
                  ? 'Nenhum outro apartamento cadastrado no condomínio.'
                  : 'Nenhum apartamento encontrado para essa busca.'}
              </div>
            ) : (
              unidadesFiltradas.map((u) => {
                const numCurto = (u.numero || u.codigo_discagem).slice(-4);
                return (
                  <div
                    key={`${u.codigo_discagem}-${u.unidade_id}`}
                    className="flex items-center justify-between gap-2.5 p-2.5 sm:px-3.5 sm:py-3 rounded-2xl bg-slate-50/80 hover:bg-indigo-50/40 border border-slate-200/90 transition"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 text-left">
                      <div className="w-10 h-10 rounded-xl bg-indigo-100/80 border border-indigo-200/70 text-indigo-700 font-black text-xs flex flex-col items-center justify-center shrink-0 leading-none">
                        <span className="text-[9px] font-bold text-indigo-400 uppercase">AP</span>
                        <span>{numCurto}</span>
                      </div>

                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-extrabold text-slate-900 truncate flex items-center gap-1.5">
                          <span className="truncate">
                            {u.bloco_nome ? `${u.bloco_nome} • Apto ${u.numero}` : u.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          <span className="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200/70 text-[10px] font-mono font-extrabold text-indigo-700">
                            Ramal: {u.codigo_discagem}
                          </span>
                          {u.moradores_resumo ? (
                            <span className="text-[11px] font-semibold text-slate-500 truncate max-w-[140px]">
                              • {u.moradores_resumo}
                            </span>
                          ) : u.moradores_count > 0 ? (
                            <span className="text-[10px] font-semibold text-emerald-600">
                              • {u.moradores_count} {u.moradores_count === 1 ? 'morador' : 'moradores'}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={discando}
                      onClick={() => onDiscarUnidade(u)}
                      className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer transition shrink-0"
                    >
                      <PhoneCall size={14} />
                      <span>Interfonar</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* Aba 2: Registro (Histórico) de Chamadas */
        <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
          {historico.length === 0 ? (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs font-semibold text-slate-500">
              Nenhuma chamada registrada ainda para o seu apartamento.
            </div>
          ) : (
            historico.map((h) => {
              const ehPerdida = h.status === 'missed' || h.status === 'rejected';
              const ehAtendida = h.status === 'answered' || h.status === 'ended';
              const labelStatus =
                h.status === 'missed'
                  ? 'Chamada Perdida'
                  : h.status === 'rejected'
                    ? 'Recusada'
                    : h.status === 'canceled'
                      ? 'Cancelada'
                      : h.direcao === 'realizada'
                        ? 'Realizada'
                        : 'Recebida';
              const durTxt = formatarDuracao(h.duracao_segundos);

              return (
                <div
                  key={h.id}
                  className="flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-2xl bg-slate-50 border border-slate-200/80"
                >
                  <div className="flex items-center gap-2.5 min-w-0 text-left">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-black ${
                        ehPerdida
                          ? 'bg-rose-100 text-rose-600'
                          : ehAtendida
                            ? 'bg-emerald-100 text-emerald-600'
                            : 'bg-blue-100 text-blue-600'
                      }`}
                    >
                      {h.direcao === 'realizada' ? '↗' : ehPerdida ? '↙' : '📞'}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-extrabold text-slate-900 truncate flex items-center gap-1.5">
                        <span className="truncate">{h.contraparte_nome}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold shrink-0 ${
                            h.tipo === 'portaria'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-indigo-100 text-indigo-800'
                          }`}
                        >
                          {h.tipo === 'portaria' ? 'Portaria' : 'Apto'}
                        </span>
                      </div>
                      <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5 flex-wrap">
                        <span
                          className={
                            ehPerdida
                              ? 'text-rose-600 font-bold'
                              : ehAtendida
                                ? 'text-emerald-700 font-bold'
                                : 'text-slate-600'
                          }
                        >
                          {labelStatus}
                        </span>
                        <span>•</span>
                        <span>{h.data_hora}</span>
                        {durTxt && (
                          <>
                            <span>•</span>
                            <span className="font-mono">{durTxt}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {h.tipo === 'apartamento' && h.contraparte_unidade_id && (
                    <button
                      type="button"
                      disabled={discando}
                      onClick={() =>
                        onDiscarUnidade({
                          unidade_id: h.contraparte_unidade_id!,
                          numero: h.contraparte_codigo,
                          bloco_nome: '',
                          label: h.contraparte_nome,
                          codigo_discagem: h.contraparte_codigo,
                          moradores_count: 1,
                        })
                      }
                      className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-extrabold flex items-center gap-1 cursor-pointer shrink-0"
                      title="Retornar ligação para este apartamento"
                    >
                      <PhoneCall size={12} />
                      <span>Ligar</span>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function MoradorHome() {
  const [dados, setDados] = useState<DadosPainel | null>(null);
  const [portaModal, setPortaModal] = useState<Porta | null>(null);
  const [iniciarVozModal, setIniciarVozModal] = useState(false);
  const [chamadaEmCurso, setChamadaEmCurso] = useState<ChamadaInterfone | null>(null);
  const [chamadaTocando, setChamadaTocando] = useState<ChamadaInterfone | null>(null);
  const [sessaoAptAtiva, setSessaoAptAtiva] = useState<SessaoChamadaApartamento | null>(null);
  const [portaFocada, setPortaFocada] = useState<Porta | null>(null);
  const [cameraSelecionada, setCameraSelecionada] = useState<CameraMorador | null>(null);
  const [abrindoDireto, setAbrindoDireto] = useState<string | null>(null);
  const [testandoEquipamentos, setTestandoEquipamentos] = useState(false);
  const [bioDisp, setBioDisp] = useState(false);
  const [msg, setMsg] = useState<Aviso | null>(null);
  const chamadasIgnoradasRef = useRef<Set<string>>(new Set());

  const carregar = useCallback(async () => {
    try {
      const r = await api<DadosPainel>('morador_painel');
      setDados(r);
      const cams = r.cameras ?? [];
      const portas = r.portas ?? [];
      if (portas.length > 0) {
        setPortaFocada((atual) => {
          if (!atual) return portas[0];
          return portas.find((p) => p.valor === atual.valor) ?? portas[0];
        });
      }
      if (r.cameras_morador_ativo && cams.length > 0) {
        setCameraSelecionada((atual) => {
          if (atual) {
            const achou = cams.find((c) => c.id === atual.id);
            if (achou) return achou;
          }
          if (portas.length > 0) {
            return encontrarCameraParaPorta(portas[0], cams) ?? cams[0];
          }
          return cams[0];
        });
      } else {
        setCameraSelecionada(null);
      }
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e instanceof ErroApi ? e.message : 'Erro ao carregar o painel.' });
    }
  }, []);

  const testarEquipamentos = async () => {
    setTestandoEquipamentos(true);
    try {
      const r = await api<{
        portas: Porta[];
        cameras_morador_ativo: boolean;
        cameras: CameraMorador[];
        resumo: {
          portas_total: number;
          portas_online: number;
          portas_offline: number;
          cameras_total: number;
          cameras_online: number;
          cameras_offline: number;
          testado_em: string;
        };
      }>('morador_testar_equipamentos');
      setDados((atual) =>
        atual
          ? {
              ...atual,
              portas: r.portas,
              cameras_morador_ativo: r.cameras_morador_ativo,
              cameras: r.cameras,
              testado_em: r.resumo.testado_em,
            }
          : atual,
      );
      if (r.portas.length > 0) {
        setPortaFocada((atual) => {
          if (!atual) return r.portas[0];
          return r.portas.find((p) => p.valor === atual.valor) ?? r.portas[0];
        });
      }
      if (r.cameras_morador_ativo && r.cameras.length > 0) {
        setCameraSelecionada((atual) => {
          if (!atual) return r.cameras[0];
          return r.cameras.find((c) => c.id === atual.id) ?? r.cameras[0];
        });
      }
      const totalOff = r.resumo.portas_offline + r.resumo.cameras_offline;
      if (totalOff > 0) {
        setMsg({
          tipo: 'erro',
          texto: `⚠️ Teste de conexão (${r.resumo.testado_em}): Seu equipamento está off-line por problema de conexão (${r.resumo.portas_offline} porta(s) e ${r.resumo.cameras_offline} câmera(s) sem resposta).`,
        });
      } else {
        setMsg({
          tipo: 'ok',
          texto: `✅ Teste de conexão (${r.resumo.testado_em}): Todos os equipamentos estão online e prontos para uso!`,
        });
      }
    } catch (e) {
      setMsg({
        tipo: 'erro',
        texto: e instanceof ErroApi ? e.message : 'Falha ao testar conexão dos equipamentos.',
      });
    } finally {
      setTestandoEquipamentos(false);
    }
  };

  useEffect(() => {
    carregar();
    temBiometriaNoAparelho().then(setBioDisp);
  }, [carregar]);

  // Registra Web Push W3C nativo (compatível com iPhone iOS 16.4+/17/18 web.push.apple.com e Android fcm.googleapis.com)
  // e desbloqueia o canal de áudio de toque ao primeiro toque na tela
  useEffect(() => {
    sincronizarWebPushInterfone();

    const aoInteragir = () => {
      desbloquearAudioInterfone();
      desbloquearContextoAudioConversa();
      sincronizarWebPushInterfone();
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

  // Monitora chamadas de interfone para a unidade do morador a cada 1.2s (e instantaneamente via postMessage do Service Worker)
  useEffect(() => {
    let cancelado = false;

    const verificarInterfone = async () => {
      if (cancelado) return;
      try {
        const r = await api<{
          chamada: ChamadaInterfone | null;
          chamada_sainte?: {
            call_id: string;
            status: string;
            destino_nome: string;
            destino_codigo: string;
          } | null;
        }>('morador_interfone_status');
        if (cancelado) return;

        // Sincroniza status da chamada de saída entre apartamentos (se eu estiver ligando para outro apto)
        if (r.chamada_sainte) {
          const cs = r.chamada_sainte;
          setSessaoAptAtiva((atual) => {
            if (!atual || atual.call_id !== cs.call_id) return atual;
            if (atual.status !== cs.status) {
              return { ...atual, status: cs.status };
            }
            return atual;
          });
        }

        const c = r.chamada;
        if (
          c &&
          c.status === 'ringing' &&
          !chamadasIgnoradasRef.current.has(c.call_id) &&
          chamadaEmCurso?.call_id !== c.call_id &&
          sessaoAptAtiva?.call_id !== c.call_id
        ) {
          setChamadaTocando((atual) => {
            if (!atual || atual.call_id !== c.call_id) {
              try {
                if ('serviceWorker' in navigator && 'Notification' in window && Notification.permission === 'granted') {
                  navigator.serviceWorker.ready
                    .then((reg) =>
                      reg.showNotification(`📲 CHAMADA DE INTERFONE — ${c.nome_portaria}`, {
                        body: `🔴 Chamando ${c.unidade || `Unidade ${c.room_number}`}. Toque para atender!`,
                        icon: '/icon-192.png',
                        badge: '/icon-192.png',
                        tag: `sectrum-interfone-${Date.now()}`,
                        requireInteraction: true,
                        vibrate: [700, 100, 700, 100, 800],
                      } as NotificationOptions),
                    )
                    .catch(() => {});
                } else if ('Notification' in window && Notification.permission === 'granted') {
                  new Notification(`📲 CHAMADA DE INTERFONE — ${c.nome_portaria}`, {
                    body: `🔴 Chamando ${c.unidade || `Unidade ${c.room_number}`}`,
                  });
                }
              } catch {
                // Ignora
              }
            }
            return c;
          });
        } else if (!c || c.status !== 'ringing') {
          setChamadaTocando(null);
        }
      } catch {
        // Ignora falhas de rede transitórias
      }
    };

    const aoMensagemSw = (ev: MessageEvent) => {
      if (ev.data && ev.data.type === 'SECTRUM_PUSH_INTERFONE') {
        verificarInterfone();
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', aoMensagemSw);
    }
    document.addEventListener('visibilitychange', verificarInterfone);

    verificarInterfone();
    const timer = window.setInterval(verificarInterfone, 1200);
    return () => {
      cancelado = true;
      window.clearInterval(timer);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', aoMensagemSw);
      }
      document.removeEventListener('visibilitychange', verificarInterfone);
    };
  }, [chamadaEmCurso?.call_id, sessaoAptAtiva?.call_id]);

  const atenderChamadaInterfone = async (c: ChamadaInterfone) => {
    desbloquearContextoAudioConversa();
    (window as unknown as { __sectrumBlessVideo?: () => void }).__sectrumBlessVideo?.();
    chamadasIgnoradasRef.current.add(c.call_id);
    setChamadaTocando(null);

    const ehApt =
      c.tipo === 'apartamento' ||
      c.source === 'apartamento' ||
      !c.controlador_id ||
      String(c.device_id || '').toUpperCase().startsWith('APT:');

    api('morador_interfone_sinalizar', {
      corpo: {
        call_id: c.call_id,
        device_id: c.device_id,
        acao: 'answer',
      },
    }).catch(() => undefined);

    if (ehApt) {
      setSessaoAptAtiva({
        call_id: c.call_id,
        status: 'answered',
        direcao: 'recebida',
        contraparte_nome: c.origem_nome || c.nome_portaria,
        device_id: c.device_id,
      });
      return;
    }

    setChamadaEmCurso(c);
    setIniciarVozModal(true);
    setPortaModal({
      valor: c.porta,
      nome: `${c.nome_portaria} (Interfone)`,
    });
  };

  useEffect(() => {
    const aoCallKitAtender = (ev: Event) => {
      const c = (ev as CustomEvent<ChamadaInterfone | undefined>)?.detail;
      if (c?.call_id) {
        chamadasIgnoradasRef.current.add(c.call_id);
        setChamadaTocando(null);
      }
    };
    const aoCallKitRecusar = (ev: Event) => {
      const cid = (ev as CustomEvent<{ call_id?: string } | undefined>)?.detail?.call_id;
      if (cid) {
        chamadasIgnoradasRef.current.add(cid);
        setChamadaTocando(null);
      }
    };
    // iOS: chamada entre apartamentos atendida na tela nativa (CallKit). O áudio é 100% nativo; o app mostra a
    // tela de conversa (com o iPhone desbloqueado o iOS abre o app e espera que ele exiba a ligação em andamento).
    const aoCallKitAtendidaNativa = (ev: Event) => {
      const d = lerChamadaAtendidaNativa(ev);
      if (!d) return;
      chamadasIgnoradasRef.current.add(d.call_id);
      setChamadaTocando(null);
      setSessaoAptAtiva((atual) =>
        atual?.call_id === d.call_id
          ? atual
          : {
              call_id: d.call_id,
              status: 'answered',
              direcao: 'recebida',
              contraparte_nome: d.origem_nome || 'Interfone',
              device_id: d.device_id || 'APT:0',
            },
      );
    };
    window.addEventListener('sectrum-callkit-atender', aoCallKitAtender);
    window.addEventListener('sectrum-callkit-recusar', aoCallKitRecusar);
    window.addEventListener('sectrum-callkit-atendida-nativa', aoCallKitAtendidaNativa);
    return () => {
      window.removeEventListener('sectrum-callkit-atender', aoCallKitAtender);
      window.removeEventListener('sectrum-callkit-recusar', aoCallKitRecusar);
      window.removeEventListener('sectrum-callkit-atendida-nativa', aoCallKitAtendidaNativa);
    };
  }, []);

  const recusarChamadaInterfone = async (c: ChamadaInterfone) => {
    chamadasIgnoradasRef.current.add(c.call_id);
    setChamadaTocando(null);
    await api('morador_interfone_sinalizar', {
      corpo: {
        call_id: c.call_id,
        device_id: c.device_id,
        acao: 'reject',
      },
    }).catch(() => undefined);
  };

  const encerrarChamadaApartamento = async () => {
    const atual = sessaoAptAtiva;
    setSessaoAptAtiva(null);
    if (atual) {
      await api('morador_interfone_sinalizar', {
        corpo: {
          call_id: atual.call_id,
          device_id: atual.device_id || 'APT:0',
          acao: atual.status === 'ringing' && atual.direcao === 'realizada' ? 'cancel' : 'hangUp',
        },
      }).catch(() => undefined);
    }
  };

  const abrirPortaDiretoDoInterfone = async (c: ChamadaInterfone) => {
    (window as unknown as { __sectrumBlessVideo?: () => void }).__sectrumBlessVideo?.();
    setAbrindoDireto(c.porta);
    try {
      await api('morador_interfone_sinalizar', {
        corpo: {
          call_id: c.call_id,
          device_id: c.device_id,
          acao: 'answer',
        },
      }).catch(() => undefined);
      const r = await api<{ tipo: 'ok' | 'erro'; mensagem: string }>('morador_abrir_porta', {
        corpo: { comando_abertura: c.porta },
      });
      chamadasIgnoradasRef.current.add(c.call_id);
      setChamadaTocando(null);
      setMsg({
        tipo: r.tipo,
        texto: `${r.mensagem} (${c.nome_portaria})`,
      });
    } catch (e) {
      setMsg({ tipo: 'erro', texto: msgErro(e, 'Falha ao abrir porta.') });
    } finally {
      setAbrindoDireto(null);
    }
  };

  const temCamerasInline = Boolean(
    dados?.cameras_morador_ativo && dados?.cameras && dados.cameras.length > 0,
  );

  const focarPortaECamera = (porta: Porta) => {
    setPortaFocada(porta);
    if (temCamerasInline && dados?.cameras) {
      const camAlvo = encontrarCameraParaPorta(porta, dados.cameras);
      if (camAlvo) {
        setCameraSelecionada(camAlvo);
      }
    }
  };

  const acionarAberturaPorta = (porta: Porta) => {
    desbloquearContextoAudioConversa();
    (window as unknown as { __sectrumBlessVideo?: () => void }).__sectrumBlessVideo?.();
    focarPortaECamera(porta);
    setIniciarVozModal(obterAutoVozPorta());
    setChamadaEmCurso(null);
    setPortaModal(porta);
  };

  const configurarBiometria = async () => {
    try {
      await cadastrarBiometria();
      alert('Biometria configurada! Agora pode usar o Login Biométrico.');
      await carregar();
    } catch (err) {
      if ((err as Error)?.name !== 'NotAllowedError') {
        alert(err instanceof ErroApi ? err.message : 'Erro ao configurar biometria.');
      }
    }
  };

  if (!dados) {
    return <div className="p-10 text-center font-bold text-slate-400">Carregando...</div>;
  }

  const cameraAtivaInline =
    cameraSelecionada ?? (dados.cameras && dados.cameras.length > 0 ? dados.cameras[0] : null);

  const portasOnlineCount = dados.portas.filter((p) => p.online !== false).length;
  const portasOfflineCount = dados.portas.length - portasOnlineCount;
  const camsLista = dados.cameras ?? [];
  const camsOfflineCount = dados.cameras_morador_ativo
    ? camsLista.filter((c) => c.online === false).length
    : 0;

  return (
    <div className="max-w-[680px] mx-auto px-2.5 sm:px-4 py-2.5 space-y-2.5">
      {chamadaTocando && !portaModal && !sessaoAptAtiva && (
        <ModalChamadaInterfoneRecebida
          chamada={chamadaTocando}
          onAtender={() => atenderChamadaInterfone(chamadaTocando)}
          onRecusar={() => recusarChamadaInterfone(chamadaTocando)}
          onAbrirDireto={() => abrirPortaDiretoDoInterfone(chamadaTocando)}
          abrindoDireto={abrindoDireto === chamadaTocando.porta}
        />
      )}

      {sessaoAptAtiva && (
        <ModalConversaApartamento
          sessao={sessaoAptAtiva}
          onEncerrar={encerrarChamadaApartamento}
          onStatusMudou={(novoStatus) =>
            setSessaoAptAtiva((atual) => (atual ? { ...atual, status: novoStatus } : null))
          }
        />
      )}

      {portaModal && (
        <ModalCameraPortaMorador
          porta={portaModal}
          iniciarConversaAoAbrir={iniciarVozModal}
          chamadaInterfone={chamadaEmCurso}
          onFechar={() => {
            if (chamadaEmCurso) {
              api('morador_interfone_sinalizar', {
                corpo: {
                  call_id: chamadaEmCurso.call_id,
                  device_id: chamadaEmCurso.device_id,
                  acao: 'hangUp',
                },
              }).catch(() => undefined);
            }
            setPortaModal(null);
            setIniciarVozModal(false);
            setChamadaEmCurso(null);
          }}
          onPortaAberta={(av) => setMsg(av)}
        />
      )}

      {msg && (
        <div
          className={`border-l-4 px-4 py-2.5 rounded-lg text-sm font-semibold flex justify-between items-center gap-3 ${
            msg.tipo === 'ok' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-rose-50 border-rose-500 text-rose-800'
          }`}
        >
          <span>{msg.texto}</span>
          <button onClick={() => setMsg(null)} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Card 1 — Status da Biometria Facial (compacto para caber tudo na mesma tela) */}
      <div className="bg-white rounded-2xl border border-slate-200 px-3.5 py-2.5 shadow-sm flex items-center gap-3 flex-wrap">
        {dados.tem_foto ? (
          <>
            <div className="rounded-full p-0.5 border-[3px] border-emerald-500 shrink-0">
              <FotoUsuario rota="morador_foto" temFoto={true} tamanho={48} redonda />
            </div>
            <div className="flex-1 min-w-[140px]">
              <div className="text-sm sm:text-base font-extrabold text-slate-900 leading-tight">Biometria Facial Ativa</div>
              <div className="text-xs text-slate-500">Rosto autorizado na portaria.</div>
              <Link to="/morador/biometria" className="inline-block mt-0.5 text-xs font-bold text-blue-600 hover:underline">
                Atualizar Foto
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="w-[48px] h-[48px] rounded-full bg-red-100 border-2 border-dashed border-red-500 flex items-center justify-center text-xl shrink-0">
              ⚠️
            </div>
            <div className="flex-1 min-w-[140px]">
              <div className="text-sm sm:text-base font-extrabold text-red-800 leading-tight">Biometria Pendente</div>
              <div className="text-xs text-slate-500">Entrada facial não configurada.</div>
              <Link
                to="/morador/biometria"
                className="inline-block mt-1 px-2.5 py-1 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-bold"
              >
                Registrar Rosto
              </Link>
            </div>
          </>
        )}

        {!dados.tem_biometria && bioDisp && (
          <button
            type="button"
            onClick={configurarBiometria}
            className="ml-auto px-2.5 py-1.5 rounded-lg bg-violet-500 hover:bg-violet-600 text-white text-[11px] font-bold"
          >
            + Login Biométrico
          </button>
        )}
      </div>

      {/* Card SOS — Botão de Emergência (Médica e Segurança) — exibido se habilitado para o condomínio */}
      {dados.modulo_emergencia !== false && (
        <CardBotaoEmergenciaMorador onEmergenciaAcionada={(av) => setMsg(av)} />
      )}

      {/* Card 2 — Abertura Remota + Mosaico Ao Vivo logo abaixo do botão ABRIR PORTA */}
      <div className="bg-white rounded-[20px] border border-slate-200 px-3 sm:px-4 py-3.5 shadow-sm text-center">
        <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                portasOfflineCount > 0
                  ? 'bg-amber-100 text-amber-600'
                  : 'bg-emerald-100 text-emerald-600'
              }`}
            >
              <Unlock size={17} />
            </div>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900">Abertura Remota</h2>
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            {dados.portas.length > 0 && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold border ${
                  portasOfflineCount > 0
                    ? 'bg-rose-100 text-rose-800 border-rose-300'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    portasOfflineCount > 0 ? 'bg-rose-600' : 'bg-emerald-500 animate-pulse'
                  }`}
                />
                {portasOfflineCount > 0
                  ? `${portasOfflineCount} Off-line`
                  : `${portasOnlineCount} Online`}
              </span>
            )}
            <button
              type="button"
              disabled={testandoEquipamentos}
              onClick={testarEquipamentos}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition cursor-pointer disabled:opacity-60"
              title="Testar conexão da porta e das câmeras agora"
            >
              <RefreshCw
                size={12}
                className={testandoEquipamentos ? 'animate-spin text-blue-600' : 'text-slate-600'}
              />
              {testandoEquipamentos ? 'Testando...' : 'Testar Conexão'}
            </button>
          </div>
        </div>

        {/* Alerta claro ao morador quando a porta ou câmera está off-line por problema de conexão */}
        {(portasOfflineCount > 0 || camsOfflineCount > 0) && (
          <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-left text-amber-950">
            <div className="flex items-start gap-2">
              <AlertCircle size={17} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs leading-snug">
                <div className="font-extrabold text-amber-900">
                  ⚠️ Seu equipamento está off-line por problema de conexão!
                </div>
                <div className="text-amber-800 mt-0.5">
                  {portasOfflineCount > 0
                    ? 'O controlador da porta não está respondendo na rede no momento. O comando de abrir a porta não funcionará enquanto a conexão do condomínio não for restabelecida.'
                    : 'Uma ou mais câmeras do condomínio estão sem conexão no momento.'}
                </div>
              </div>
            </div>
          </div>
        )}

        {dados.portas.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs font-semibold text-slate-500">
            Nenhum portão disponível
          </div>
        ) : (
          <div
            className={
              dados.portas.length >= 2
                ? 'grid grid-cols-2 gap-2 sm:gap-2.5'
                : 'grid grid-cols-1 gap-2.5'
            }
          >
            {dados.portas.map((p) => {
              const estaAbrindo = abrindoDireto === p.valor;
              const selecionada = portaFocada?.valor === p.valor;
              const estaOnline = p.online !== false;
              const info = classificarPorta(p);
              const emGrade = dados.portas.length >= 2;
              const ultimoImpar =
                emGrade && dados.portas.length % 2 === 1 && dados.portas[dados.portas.length - 1].valor === p.valor;

              return (
                <div
                  key={p.valor}
                  onClick={() => acionarAberturaPorta(p)}
                  title={p.mensagem_status || p.nome}
                  className={`${ultimoImpar ? 'col-span-2' : ''} rounded-2xl border p-2.5 sm:p-3 flex flex-col justify-between gap-2 transition cursor-pointer shadow-2xs ${
                    !estaOnline
                      ? 'bg-rose-50/70 border-rose-300 text-rose-950'
                      : info.ehVeiculo
                        ? selecionada
                          ? 'bg-blue-50/95 border-blue-400 ring-1 ring-blue-400/50 text-blue-950'
                          : 'bg-blue-50/55 hover:bg-blue-50/90 border-blue-200 text-slate-900'
                        : selecionada
                          ? 'bg-emerald-50/85 border-emerald-400 ring-1 ring-emerald-400/40 text-emerald-950'
                          : 'bg-slate-50/90 hover:bg-slate-100/80 border-slate-200 text-slate-900'
                  }`}
                >
                  {/* Topo do Card: Etiqueta de Tipo (Veículos vs Pedestre) + Status Online */}
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] sm:text-[10px] font-extrabold uppercase tracking-tight border ${
                        info.ehVeiculo
                          ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                          : info.ehSaida
                            ? 'bg-teal-100 text-teal-900 border-teal-300'
                            : 'bg-emerald-100/90 text-emerald-900 border-emerald-300'
                      }`}
                    >
                      {info.etiqueta}
                    </span>

                    {estaOnline ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/90 text-emerald-800 border border-emerald-300 text-[9px] sm:text-[10px] font-extrabold shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Online
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 text-[9px] sm:text-[10px] font-extrabold shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                        Off-line
                      </span>
                    )}
                  </div>

                  {/* Corpo do Card: Ícone em destaque (Carro para veículos / Porta para pedestres) + Nome legível */}
                  <div className="flex items-center gap-2 text-left min-w-0 my-0.5">
                    <div
                      className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${
                        !estaOnline
                          ? 'bg-rose-100 text-rose-600'
                          : info.ehVeiculo
                            ? 'bg-blue-600 text-white'
                            : info.ehSaida
                              ? 'bg-teal-600 text-white'
                              : 'bg-emerald-500 text-white'
                      }`}
                    >
                      {info.ehVeiculo ? <Car size={20} /> : <DoorOpen size={20} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs sm:text-sm font-extrabold text-slate-900 leading-tight line-clamp-2 break-words">
                        {info.titulo}
                      </div>
                      {info.subtitulo && (
                        <div className="text-[10px] sm:text-[11px] font-semibold text-slate-500 truncate mt-0.5">
                          {info.subtitulo}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Botão de Ação do Controlador */}
                  <button
                    type="button"
                    disabled={estaAbrindo}
                    onClick={(e) => {
                      e.stopPropagation();
                      acionarAberturaPorta(p);
                    }}
                    className={`w-full py-2 sm:py-2.5 px-2 rounded-xl disabled:opacity-60 text-white text-xs sm:text-sm font-extrabold tracking-wide shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                      !estaOnline
                        ? 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800'
                        : info.ehVeiculo
                          ? 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
                          : info.ehSaida
                            ? 'bg-teal-600 hover:bg-teal-700 active:bg-teal-800'
                            : 'bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700'
                    }`}
                  >
                    {estaAbrindo ? (
                      '⏳ ABRINDO...'
                    ) : !estaOnline ? (
                      '⚠️ TESTAR PORTA'
                    ) : info.ehVeiculo ? (
                      <>
                        <Car size={15} className="shrink-0" />
                        <span>{emGrade ? 'ABRIR VEÍCULOS' : 'ABRIR PORTÃO DE VEÍCULOS'}</span>
                      </>
                    ) : (
                      <>
                        <Unlock size={14} className="shrink-0" />
                        <span>{info.ehSaida ? 'ABRIR SAÍDA' : 'ABRIR PORTA'}</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Mosaico Proporcional de Câmeras logo abaixo do botão ABRIR PORTA */}
        {temCamerasInline && cameraAtivaInline && dados.cameras && (
          <PainelCameraInlineMorador
            cameras={dados.cameras}
            cameraAtiva={cameraAtivaInline}
            onSelecionarCamera={(cam) => setCameraSelecionada(cam)}
            pausado={Boolean(portaModal)}
            portaSelecionada={portaFocada ?? dados.portas[0] ?? null}
            onAbrirInterfone={
              dados.modulo_interfone !== false && (portaFocada ?? dados.portas[0])
                ? () => {
                    (window as unknown as { __sectrumBlessVideo?: () => void }).__sectrumBlessVideo?.();
                    setPortaModal(portaFocada ?? dados.portas[0]);
                  }
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}

let pushSyncEmAndamento = false;
let pushUltimoTokenEnviado = '';

/**
 * Registra e sincroniza a assinatura W3C Web Push (Apple Push iOS 16.4+/17/18 + Google FCM Android)
 * usando /sw-push.js (que possui bypass de cache no Cloudflare) e validando a chave VAPID real da subscription.
 */
export async function sincronizarWebPushInterfone(): Promise<void> {
  if (pushSyncEmAndamento) return;
  if (!obterTokenInterfone()) return;

  // No App Nativo iOS, as chamadas em segundo plano usam Apple CallKit nativo (tela cheia de ligação estilo WhatsApp).
  // Limpa eventual assinatura antiga de Safari Web Push no servidor para não enviar banners repetidos de texto.
  if (
    typeof document !== 'undefined' &&
    (document.documentElement.classList.contains('sectrum-ios-native') ||
      window.Capacitor?.getPlatform?.() === 'ios')
  ) {
    const chaveIos = `ios-callkit:${obterTokenInterfone()?.slice(-16) || ''}`;
    if (pushUltimoTokenEnviado !== chaveIos) {
      pushUltimoTokenEnviado = chaveIos;
      api('salvar_fcm_token', {
        corpo: { subscription: null, fcm_token: '' },
      }).catch(() => undefined);
    }
    return;
  }

  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

  pushSyncEmAndamento = true;
  try {
    if (Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {
        // No iOS exige gesto do usuário; tentará novamente no próximo toque
      }
    }
    if (Notification.permission !== 'granted') return;

    const reg = await navigator.serviceWorker
      .register('/sw-push.js?v=20261020d', { scope: '/', updateViaCache: 'none' })
      .catch(() => navigator.serviceWorker.ready);

    if (reg) {
      reg.update().catch(() => undefined);
    }

    const swReg = await navigator.serviceWorker.ready;
    // Aguarda até 2.5s caso o Service Worker esteja terminando de ativar
    if (!swReg.active) {
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!swReg.pushManager) return;

    const vapidEsperada = urlBase64ToUint8Array(VAPID_PUBLIC_KEY_SECTRUM);
    let sub = await swReg.pushManager.getSubscription();

    if (sub) {
      let chaveBate = false;
      try {
        const keyAtual = sub.options?.applicationServerKey
          ? new Uint8Array(sub.options.applicationServerKey)
          : null;
        if (keyAtual && keyAtual.length === vapidEsperada.length) {
          chaveBate = keyAtual.every((b, idx) => b === vapidEsperada[idx]);
        } else if (localStorage.getItem('sectrum_vapid_ver') === 'v2') {
          chaveBate = true;
        }
      } catch {
        chaveBate = localStorage.getItem('sectrum_vapid_ver') === 'v2';
      }

      if (!chaveBate) {
        await sub.unsubscribe().catch(() => undefined);
        sub = null;
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    if (!sub) {
      sub = await swReg.pushManager
        .subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidEsperada as unknown as BufferSource,
        })
        .catch(async () => {
          await new Promise((r) => setTimeout(r, 500));
          return swReg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: vapidEsperada as unknown as BufferSource,
          });
        });
    }

    if (sub) {
      const subJson = sub.toJSON();
      const rawStr = JSON.stringify(subJson);
      const chaveEnvio = `${obterTokenInterfone()?.slice(-16) || ''}:${rawStr}`;
      if (pushUltimoTokenEnviado !== chaveEnvio) {
        await api('salvar_fcm_token', {
          corpo: {
            subscription: subJson,
            fcm_token: rawStr,
          },
        });
        pushUltimoTokenEnviado = chaveEnvio;
      }
      localStorage.setItem('sectrum_vapid_ver', 'v2');
    }
  } catch {
    // Ignora silenciosamente
  } finally {
    pushSyncEmAndamento = false;
  }
}

/**
 * Monitor global do Interfone montado na raiz do App:
 * Garante que chamadas da Portaria ou de outro Apartamento cheguem, toquem e possam ser atendidas
 * em QUALQUER tela do aplicativo — inclusive quando o morador está na tela de /login (deslogado)!
 */
export function MonitorGlobalInterfone() {
  const local = useLocation();
  const [chamadaTocando, setChamadaTocando] = useState<ChamadaInterfone | null>(null);
  const [sessaoAptAtiva, setSessaoAptAtiva] = useState<SessaoChamadaApartamento | null>(null);
  const [portaModal, setPortaModal] = useState<Porta | null>(null);
  const [chamadaEmCurso, setChamadaEmCurso] = useState<ChamadaInterfone | null>(null);
  const [abrindoDireto, setAbrindoDireto] = useState<string | null>(null);
  const [emergenciaAtiva, setEmergenciaAtiva] = useState<AlertaEmergenciaAtivo | null>(null);
  const [emergenciaSilenciadaId, setEmergenciaSilenciadaId] = useState<number | null>(() => {
    try {
      const v = Number(localStorage.getItem('sectrum_emergencia_silenciada_id') || 0);
      return v > 0 ? v : null;
    } catch {
      return null;
    }
  });
  const [enviandoAcaoEmergencia, setEnviandoAcaoEmergencia] = useState<string | null>(null);
  const chamadasIgnoradasRef = useRef<Set<string>>(new Set());
  const emergenciaSilenciadaRef = useRef<number | null>(emergenciaSilenciadaId);
  const emergenciasEncerradasLocalRef = useRef<Set<number>>(
    new Set(
      (() => {
        try {
          const arr = JSON.parse(localStorage.getItem('sectrum_emergencias_encerradas') || '[]');
          return Array.isArray(arr) ? arr.map(Number).filter(Boolean) : [];
        } catch {
          return [];
        }
      })(),
    ),
  );

  useEffect(() => {
    emergenciaSilenciadaRef.current = emergenciaSilenciadaId;
    try {
      if (emergenciaSilenciadaId) {
        localStorage.setItem('sectrum_emergencia_silenciada_id', String(emergenciaSilenciadaId));
      } else {
        localStorage.removeItem('sectrum_emergencia_silenciada_id');
      }
    } catch {}
  }, [emergenciaSilenciadaId]);

  const registrarEmergenciaEncerradaLocal = (id: number) => {
    emergenciasEncerradasLocalRef.current.add(id);
    try {
      const lista = Array.from(emergenciasEncerradasLocalRef.current).slice(-30);
      localStorage.setItem('sectrum_emergencias_encerradas', JSON.stringify(lista));
    } catch {}
  };

  // Nas rotas /morador e /morador/interfone (quando logado), o próprio componente da página já renderiza o modal de interfone
  const paginaJaMonitora =
    Boolean(obterToken()) &&
    (local.pathname === '/morador' ||
      local.pathname === '/morador/' ||
      local.pathname === '/morador/interfone');

  useEffect(() => {
    sincronizarWebPushInterfone();
    const aoInteragir = () => {
      if (obterTokenInterfone() || obterToken()) {
        desbloquearAudioInterfone();
        desbloquearContextoAudioConversa();
        sincronizarWebPushInterfone();
      }
    };
    window.addEventListener('touchstart', aoInteragir, { passive: true });
    window.addEventListener('pointerdown', aoInteragir, { passive: true });
    window.addEventListener('click', aoInteragir, { passive: true });
    return () => {
      window.removeEventListener('touchstart', aoInteragir);
      window.removeEventListener('pointerdown', aoInteragir);
      window.removeEventListener('click', aoInteragir);
    };
  }, [local.pathname]);

  // Monitoramento global de EMERGÊNCIA ATIVA (para Moradores do mesmo bloco, Portaria, Síndico e Admin)
  useEffect(() => {
    let cancelado = false;

    const verificarEmergencia = async () => {
      if (cancelado) return;
      if (!obterToken() && !obterTokenInterfone()) return;
      try {
        const r = await api<{
          emergencia: AlertaEmergenciaAtivo | null;
          modulo_emergencia?: boolean;
          furar_nao_perturbe?: boolean;
        }>('emergencia_status_ativo');
        if (cancelado) return;
        if (r.furar_nao_perturbe !== undefined) {
          definirModoFurarNaoPerturbe(Boolean(r.furar_nao_perturbe && r.modulo_emergencia !== false));
        }
        const em = r.emergencia;
        if (em && em.status === 'ativo' && !emergenciasEncerradasLocalRef.current.has(em.id)) {
          if (em.furar_nao_perturbe !== false && emergenciaSilenciadaRef.current !== em.id) {
            acionarSireneEmergenciaBackground(true);
          }
          setEmergenciaAtiva((atual) => {
            if (!atual || atual.id !== em.id) {
              try {
                if ('serviceWorker' in navigator && 'Notification' in window && Notification.permission === 'granted') {
                  navigator.serviceWorker.ready
                    .then((reg) =>
                      reg.showNotification(
                        `${em.tipo === 'medica' ? '🚑 EMERGÊNCIA MÉDICA' : '🚨 EMERGÊNCIA DE SEGURANÇA'} — ${em.unidade_label}`,
                        {
                          body: `🆘 ${em.autor_nome} pediu socorro agora em ${em.unidade_label}! Toque para abrir!`,
                          icon: '/icon-192.png',
                          badge: '/icon-192.png',
                          tag: `sectrum-emergencia-${em.id}`,
                          renotify: true,
                          requireInteraction: true,
                          vibrate: [1000, 150, 500, 150, 500, 250, 1000],
                        } as NotificationOptions,
                      ),
                    )
                    .catch(() => {});
                }
              } catch {}
            }
            return em;
          });
        } else {
          setEmergenciaAtiva((atual) => {
            if (atual) {
              pararSireneEmergencia();
            }
            return null;
          });
        }
      } catch {
        // Ignora
      }
    };

    const aoMensagemSw = (ev: MessageEvent) => {
      if (ev.data && ev.data.type === 'SECTRUM_PUSH_INTERFONE') {
        const tokPush = ev.data?.data?.interfone_token as string | undefined;
        if (tokPush && !obterToken()) {
          restaurarSessaoInterfone(tokPush);
        }
        if (
          ev.data?.data?.tipo === 'emergencia' &&
          String(ev.data?.data?.furar_nao_perturbe ?? '1') !== '0'
        ) {
          acionarSireneEmergenciaBackground(true);
        }
        verificarEmergencia();
      }
    };

    const aoDisparoLocal = (ev: Event) => {
      const customEv = ev as CustomEvent<AlertaEmergenciaAtivo | undefined>;
      if (customEv?.detail && customEv.detail.id) {
        emergenciasEncerradasLocalRef.current.delete(customEv.detail.id);
        setEmergenciaAtiva(customEv.detail);
      }
      verificarEmergencia();
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', aoMensagemSw);
    }
    window.addEventListener('sectrum-emergencia-disparada', aoDisparoLocal);
    document.addEventListener('visibilitychange', verificarEmergencia);

    verificarEmergencia();
    const timer = window.setInterval(verificarEmergencia, 1800);
    return () => {
      cancelado = true;
      window.clearInterval(timer);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', aoMensagemSw);
      }
      window.removeEventListener('sectrum-emergencia-disparada', aoDisparoLocal);
      document.removeEventListener('visibilitychange', verificarEmergencia);
    };
  }, []);

  useEffect(() => {
    let cancelado = false;

    const verificar = async () => {
      if (cancelado || paginaJaMonitora) return;
      if (!obterTokenInterfone()) return;
      try {
        const r = await api<{ chamada: ChamadaInterfone | null }>('morador_interfone_status');
        if (cancelado || paginaJaMonitora) return;
        const c = r.chamada;
        if (
          c &&
          c.status === 'ringing' &&
          !chamadasIgnoradasRef.current.has(c.call_id) &&
          chamadaEmCurso?.call_id !== c.call_id &&
          sessaoAptAtiva?.call_id !== c.call_id
        ) {
          setChamadaTocando(c);
        } else if (!c || c.status !== 'ringing') {
          setChamadaTocando(null);
        }
      } catch {
        // Ignora
      }
    };

    const aoMensagemSw = (ev: MessageEvent) => {
      if (ev.data && ev.data.type === 'SECTRUM_PUSH_INTERFONE') {
        const tokPush = ev.data?.data?.interfone_token as string | undefined;
        if (tokPush && !obterToken()) {
          restaurarSessaoInterfone(tokPush);
        }
        verificar();
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', aoMensagemSw);
    }
    document.addEventListener('visibilitychange', verificar);

    verificar();
    const timer = window.setInterval(verificar, 1200);
    return () => {
      cancelado = true;
      window.clearInterval(timer);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', aoMensagemSw);
      }
      document.removeEventListener('visibilitychange', verificar);
    };
  }, [paginaJaMonitora, chamadaEmCurso?.call_id, sessaoAptAtiva?.call_id]);

  const confirmarIndoAjudar = async () => {
    if (!emergenciaAtiva) return;
    if (!obterToken() && obterTokenInterfone()) {
      restaurarSessaoInterfone();
    }
    setEmergenciaSilenciadaId(emergenciaAtiva.id);
    pararSireneEmergencia();
    setEnviandoAcaoEmergencia('indo_ajudar');
    try {
      await api('emergencia_responder', {
        corpo: {
          emergencia_id: emergenciaAtiva.id,
          acao: 'indo_ajudar',
        },
      });
      const r = await api<{ emergencia: AlertaEmergenciaAtivo | null }>('emergencia_status_ativo');
      if (r.emergencia) setEmergenciaAtiva(r.emergencia);
    } catch {
      // Ignora
    } finally {
      setEnviandoAcaoEmergencia(null);
    }
  };

  const encerrarEmergenciaAtiva = async () => {
    if (!emergenciaAtiva) return;
    if (!obterToken() && obterTokenInterfone()) {
      restaurarSessaoInterfone();
    }
    const idAlvo = emergenciaAtiva.id;
    setEmergenciaSilenciadaId(idAlvo);
    registrarEmergenciaEncerradaLocal(idAlvo);
    pararSireneEmergencia();
    setEnviandoAcaoEmergencia('encerrar');
    try {
      await api('emergencia_responder', {
        corpo: {
          emergencia_id: idAlvo,
          acao: 'encerrar',
        },
      });
      setEmergenciaAtiva(null);
    } catch {
      // Caso seja vizinho apenas fechando na própria tela após socorro
      setEmergenciaAtiva(null);
    } finally {
      setEnviandoAcaoEmergencia(null);
    }
  };

  const interfonarParaUnidadeEmEmergencia = async (unidadeId: number, label: string) => {
    if (!obterToken() && obterTokenInterfone()) {
      restaurarSessaoInterfone();
    }
    if (emergenciaAtiva) {
      setEmergenciaSilenciadaId(emergenciaAtiva.id);
    }
    pararSireneEmergencia();
    desbloquearContextoAudioConversa();
    iniciarPulsoChamando();
    try {
      const r = await api<{
        ok?: boolean;
        call_id?: string;
        status?: string;
        destino_nome?: string;
        destino_codigo?: string;
        chamada?: {
          call_id: string;
          status: string;
          destino_nome: string;
          destino_codigo: string;
        };
      }>('morador_interfone_discar', {
        corpo: {
          unidade_id: unidadeId,
        },
      });
      const cidDiscado = r.call_id || r.chamada?.call_id || '';
      if (cidDiscado) {
        setSessaoAptAtiva({
          call_id: cidDiscado,
          status: r.status || r.chamada?.status || 'ringing',
          direcao: 'realizada',
          contraparte_nome: r.destino_nome || r.chamada?.destino_nome || label,
          contraparte_codigo: r.destino_codigo || r.chamada?.destino_codigo,
          device_id: `APT:${unidadeId}`,
        });
      } else {
        pararPulsoChamando();
      }
    } catch {
      pararPulsoChamando();
    }
  };

  const atender = useCallback(async (c: ChamadaInterfone) => {
    if (!obterToken()) {
      restaurarSessaoInterfone();
    }
    desbloquearContextoAudioConversa();
    chamadasIgnoradasRef.current.add(c.call_id);
    setChamadaTocando(null);

    const ehApt =
      c.tipo === 'apartamento' ||
      c.source === 'apartamento' ||
      !c.controlador_id ||
      String(c.device_id || '').toUpperCase().startsWith('APT:');

    api('morador_interfone_sinalizar', {
      corpo: {
        call_id: c.call_id,
        device_id: c.device_id,
        acao: 'answer',
      },
    }).catch(() => undefined);

    if (ehApt) {
      setSessaoAptAtiva({
        call_id: c.call_id,
        status: 'answered',
        direcao: 'recebida',
        contraparte_nome: c.origem_nome || c.nome_portaria,
        device_id: c.device_id,
      });
      return;
    }

    setChamadaEmCurso(c);
    setPortaModal({
      valor: c.porta,
      nome: `${c.nome_portaria} (Interfone)`,
    });
  }, []);

  useEffect(() => {
    const win = window as unknown as { __sectrumPendingCallKitAnswer?: ChamadaInterfone | null };
    if (win.__sectrumPendingCallKitAnswer?.call_id) {
      const pendente = win.__sectrumPendingCallKitAnswer;
      win.__sectrumPendingCallKitAnswer = null;
      atender(pendente);
    }

    const aoCallKitAtender = (ev: Event) => {
      const c = (ev as CustomEvent<ChamadaInterfone | undefined>)?.detail;
      win.__sectrumPendingCallKitAnswer = null;
      if (c?.call_id) {
        atender(c);
      }
    };

    const aoCallKitRecusar = (ev: Event) => {
      const cid = (ev as CustomEvent<{ call_id?: string } | undefined>)?.detail?.call_id;
      if (cid) {
        chamadasIgnoradasRef.current.add(cid);
        setChamadaTocando(null);
      }
    };

    // iOS: chamada atendida na tela nativa (CallKit) -> mostra a tela de conversa (áudio 100% nativo).
    // Nas páginas que já monitoram o interfone, a própria página mostra a tela (evita duas telas).
    const aoCallKitAtendidaNativa = (ev: Event) => {
      const d = lerChamadaAtendidaNativa(ev);
      if (!d) return;
      chamadasIgnoradasRef.current.add(d.call_id);
      setChamadaTocando(null);
      if (paginaJaMonitora) return;
      setSessaoAptAtiva((atual) =>
        atual?.call_id === d.call_id
          ? atual
          : {
              call_id: d.call_id,
              status: 'answered',
              direcao: 'recebida',
              contraparte_nome: d.origem_nome || 'Interfone',
              device_id: d.device_id || 'APT:0',
            },
      );
    };

    window.addEventListener('sectrum-callkit-atender', aoCallKitAtender);
    window.addEventListener('sectrum-callkit-recusar', aoCallKitRecusar);
    window.addEventListener('sectrum-callkit-atendida-nativa', aoCallKitAtendidaNativa);
    return () => {
      window.removeEventListener('sectrum-callkit-atender', aoCallKitAtender);
      window.removeEventListener('sectrum-callkit-recusar', aoCallKitRecusar);
      window.removeEventListener('sectrum-callkit-atendida-nativa', aoCallKitAtendidaNativa);
    };
  }, [atender, paginaJaMonitora]);

  if (paginaJaMonitora && !sessaoAptAtiva && !portaModal && !emergenciaAtiva) {
    return null;
  }

  const recusar = async (c: ChamadaInterfone) => {
    chamadasIgnoradasRef.current.add(c.call_id);
    setChamadaTocando(null);
    await api('morador_interfone_sinalizar', {
      corpo: {
        call_id: c.call_id,
        device_id: c.device_id,
        acao: 'reject',
      },
    }).catch(() => undefined);
  };

  const abrirDireto = async (c: ChamadaInterfone) => {
    if (!obterToken()) {
      restaurarSessaoInterfone();
    }
    setAbrindoDireto(c.porta);
    try {
      await api('morador_interfone_sinalizar', {
        corpo: {
          call_id: c.call_id,
          device_id: c.device_id,
          acao: 'answer',
        },
      }).catch(() => undefined);
      await api('morador_abrir_porta', {
        corpo: { comando_abertura: c.porta },
      });
      chamadasIgnoradasRef.current.add(c.call_id);
      setChamadaTocando(null);
    } catch {
      // Ignora
    } finally {
      setAbrindoDireto(null);
    }
  };

  const encerrarApt = async () => {
    const atual = sessaoAptAtiva;
    setSessaoAptAtiva(null);
    if (atual) {
      await api('morador_interfone_sinalizar', {
        corpo: {
          call_id: atual.call_id,
          device_id: atual.device_id || 'APT:0',
          acao: atual.status === 'ringing' && atual.direcao === 'realizada' ? 'cancel' : 'hangUp',
        },
      }).catch(() => undefined);
    }
  };

  return (
    <>
      {emergenciaAtiva && !sessaoAptAtiva && (
        <ModalAlertaEmergenciaAtiva
          emergencia={emergenciaAtiva}
          silenciado={emergenciaSilenciadaId === emergenciaAtiva.id}
          onAlternarSilencio={() =>
            setEmergenciaSilenciadaId((atual) =>
              atual === emergenciaAtiva.id ? null : emergenciaAtiva.id,
            )
          }
          onIndoAjudar={confirmarIndoAjudar}
          onEncerrarAlerta={encerrarEmergenciaAtiva}
          onInterfonarUnidade={interfonarParaUnidadeEmEmergencia}
          enviandoAcao={enviandoAcaoEmergencia}
        />
      )}

      {chamadaTocando && !portaModal && !sessaoAptAtiva && !emergenciaAtiva && (
        <ModalChamadaInterfoneRecebida
          chamada={chamadaTocando}
          onAtender={() => atender(chamadaTocando)}
          onRecusar={() => recusar(chamadaTocando)}
          onAbrirDireto={() => abrirDireto(chamadaTocando)}
          abrindoDireto={abrindoDireto === chamadaTocando.porta}
        />
      )}

      {sessaoAptAtiva && (
        <ModalConversaApartamento
          sessao={sessaoAptAtiva}
          onEncerrar={encerrarApt}
          onStatusMudou={(novoStatus) =>
            setSessaoAptAtiva((atual) => (atual ? { ...atual, status: novoStatus } : null))
          }
        />
      )}

      {portaModal && (
        <ModalCameraPortaMorador
          porta={portaModal}
          iniciarConversaAoAbrir={true}
          chamadaInterfone={chamadaEmCurso}
          onPortaAberta={() => undefined}
          onFechar={() => {
            if (chamadaEmCurso) {
              api('morador_interfone_sinalizar', {
                corpo: {
                  call_id: chamadaEmCurso.call_id,
                  device_id: chamadaEmCurso.device_id,
                  acao: 'hangUp',
                },
              }).catch(() => undefined);
            }
            setPortaModal(null);
            setChamadaEmCurso(null);
          }}
        />
      )}
    </>
  );
}


