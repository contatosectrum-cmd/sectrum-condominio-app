// src/lib/interfoneAudio.ts
// Conversa Bidirecional em Tempo Real (Full-Duplex) para Interfone entre Apartamentos e Leitores Faciais Hikvision ISAPI:
// - Suporte a Modo Viva-Voz (🔊 Alto-falante) e Modo Fone Normal / No Ouvido (👂 Auricular)
// - Streaming Full-Duplex contínuo em blocos curtos (~180ms) permitindo que os dois moradores falem e se escutem ao mesmo tempo
// - Desbloqueio síncrono de AudioContext para iPhone/iOS WebKit e roteamento setSinkId para Android
// - Reamostragem para 8000 Hz mono com filtro de voz humana (250Hz-3500Hz), crossfade anti-estalo e codificação ITU-T G.711 u-law (PCMU)

export type ModoSaidaAudio = 'vivavoz' | 'ouvido';

export interface SessaoConversaBidirecional {
  /** Encerra a conversa bidirecional (enviando eventual fala pendente) e desliga o microfone. */
  encerrar: () => void;
  /** Reproduz imediatamente um chunk de áudio G.711 u-law (8000 Hz, Base64) no canal selecionado (Viva-Voz ou No Ouvido). */
  reproduzirUlawBase64: (audioUlawBase64: string) => void;
  /** Alterna em tempo real entre Viva-Voz ('vivavoz') e Fone Normal / No Ouvido ('ouvido'). */
  definirModoSaida: (modo: ModoSaidaAudio) => Promise<ModoSaidaAudio>;
}

export interface OpcoesConversaBidirecional {
  /** Chamado continuamente (0 a 100) para exibir o medidor visual da própria voz na tela. */
  onNivelVoz?: (nivel: number) => void;
  /** Chamado automaticamente sempre que um pacote/trecho de voz está pronto para envio. */
  onTrechoVoz: (audioUlawBase64: string) => void | Promise<void>;
  /**
   * Quando true, opera em streaming Full-Duplex contínuo de baixa latência (~180ms por pacote),
   * permitindo que as duas pessoas conversem simultaneamente como numa chamada telefônica/WhatsApp
   * sem comportamento de rádio walkie-talkie.
   */
  modoFullDuplex?: boolean;
  /** Modo inicial de saída de áudio ('vivavoz' ou 'ouvido'). */
  modoSaidaInicial?: ModoSaidaAudio;
}

/** Converte byte ITU-T G.711 u-law (0..255) para amostra Float32 (-1.0..1.0). */
function ulawParaFloat(ulawByte: number): number {
  const u = ~ulawByte & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  return (sign ? -sample : sample) / 32768.0;
}

/** Converte amostra PCM linear 16-bit (-32768..32767) para byte ITU-T G.711 u-law. */
function linearParaUlaw(sample: number): number {
  const BIAS = 0x84;
  const CLIP = 32635;
  let sign = 0;
  if (sample < 0) {
    sign = 0x80;
    sample = -sample;
  }
  if (sample > CLIP) {
    sample = CLIP;
  }
  sample += BIAS;

  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {
    // localiza segmento logarítmico
  }
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

/** Reamostra Float32Array da taxa nativa (ex.: 48000 Hz) para 8000 Hz e codifica em G.711 u-law Base64. */
export function codificarChunksParaUlawBase64(
  chunks: Float32Array[],
  sampleRateOrigem: number,
  fullDuplex = false,
): string {
  const totalOrigem = chunks.reduce((acc, c) => acc + c.length, 0);
  if (totalOrigem === 0) return '';

  const bufferOrigem = new Float32Array(totalOrigem);
  let pos = 0;
  for (const c of chunks) {
    bufferOrigem.set(c, pos);
    pos += c.length;
  }

  const taxaAlvo = 8000;
  const razao = sampleRateOrigem / taxaAlvo;
  const tamanhoAlvo = Math.floor(totalOrigem / razao);
  if (tamanhoAlvo < 120) return '';

  const reamostrado = new Float32Array(tamanhoAlvo);
  let picoMax = 0;

  for (let i = 0; i < tamanhoAlvo; i++) {
    const ini = Math.floor(i * razao);
    const fim = Math.min(totalOrigem, Math.max(ini + 1, Math.floor((i + 1) * razao)));
    let soma = 0;
    for (let j = ini; j < fim; j++) {
      soma += bufferOrigem[j];
    }
    const media = soma / (fim - ini);
    reamostrado[i] = media;
    const abs = Math.abs(media);
    if (abs > picoMax) picoMax = abs;
  }

  // Em Full-Duplex entre celulares, usa ganho natural e suave para não saturar o cancelador de eco (AEC)
  // e permitir que os dois lados falem e se escutem ao mesmo tempo.
  const ganho = fullDuplex
    ? picoMax > 0.015
      ? Math.min(2.6, Math.max(1.05, 0.78 / picoMax))
      : 1.35
    : picoMax > 0.01
      ? Math.min(4.2, Math.max(1.2, 0.9 / picoMax))
      : 2.0;

  const ulawBytes = new Uint8Array(tamanhoAlvo);
  for (let i = 0; i < tamanhoAlvo; i++) {
    // Noise gate suave para silenciar ruído de fundo muito baixo quando não há fala
    const amostraBruta = Math.abs(reamostrado[i]) < 0.0012 ? 0 : reamostrado[i];
    const v = Math.tanh(amostraBruta * ganho);
    const pcm16 = Math.round(Math.max(-1, Math.min(1, v)) * 32767);
    ulawBytes[i] = linearParaUlaw(pcm16);
  }

  let binario = '';
  const bloco = 8192;
  for (let i = 0; i < ulawBytes.length; i += bloco) {
    binario += String.fromCharCode(...ulawBytes.subarray(i, i + bloco));
  }
  return window.btoa(binario);
}

let ctxCompartilhadoConversa: AudioContext | null = null;
let proximoTempoReproducaoGlobal = 0;
let streamMicrofoneCompartilhado: MediaStream | null = null;

// Nós de roteamento de saída de áudio (Viva-Voz vs No Ouvido / Fone Normal)
let filtroPassaAltaGlobal: BiquadFilterNode | null = null;
let filtroPassaBaixaGlobal: BiquadFilterNode | null = null;
let gainSaidaGlobal: GainNode | null = null;
let destStreamSaidaGlobal: MediaStreamAudioDestinationNode | null = null;
let elementoAudioSaidaGlobal: (HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> }) | null = null;
let usandoSinkElementoAudio = false;

const CHAVE_MIC_AUTORIZADO = 'sectrum_mic_autorizado_v1';
const CHAVE_AUTO_VOZ = 'sectrum_auto_voz_porta_v1';
const CHAVE_MODO_SAIDA_AUDIO = 'sectrum_modo_saida_audio_v1';

let modoSaidaAtual: ModoSaidaAudio = (() => {
  try {
    return window.localStorage.getItem(CHAVE_MODO_SAIDA_AUDIO) === 'ouvido' ? 'ouvido' : 'vivavoz';
  } catch {
    return 'vivavoz';
  }
})();

let ultimoNivelVozRecebida = 0;
let tsUltimoPacoteRecebido = 0;

/** Retorna o modo de saída de áudio atual ('vivavoz' ou 'ouvido'). */
export function obterModoSaidaAudio(): ModoSaidaAudio {
  return modoSaidaAtual;
}

/** Retorna de 0 a 100 o nível de voz que está sendo recebido da outra ponta neste instante. */
export function obterNivelVozRecebida(): number {
  if (Date.now() - tsUltimoPacoteRecebido > 450) {
    return 0;
  }
  return ultimoNivelVozRecebida;
}

/** Configura e atualiza os filtros e o roteamento físico (alto-falante vs auricular de ouvido). */
function garantirRoteamentoSaidaAudio(audioCtx: AudioContext): AudioNode {
  if (!filtroPassaAltaGlobal || !filtroPassaBaixaGlobal || !gainSaidaGlobal) {
    filtroPassaAltaGlobal = audioCtx.createBiquadFilter();
    filtroPassaAltaGlobal.type = 'highpass';
    filtroPassaAltaGlobal.frequency.value = 240;

    filtroPassaBaixaGlobal = audioCtx.createBiquadFilter();
    filtroPassaBaixaGlobal.type = 'lowpass';
    filtroPassaBaixaGlobal.frequency.value = 3500;

    gainSaidaGlobal = audioCtx.createGain();
    gainSaidaGlobal.gain.value = modoSaidaAtual === 'ouvido' ? 0.48 : 1.55;

    filtroPassaAltaGlobal.connect(filtroPassaBaixaGlobal);
    filtroPassaBaixaGlobal.connect(gainSaidaGlobal);
    gainSaidaGlobal.connect(audioCtx.destination);

    // Prepara também MediaStreamAudioDestinationNode + <audio> para aparelhos que suportam setSinkId (seleção de auricular/earpiece)
    try {
      if (typeof audioCtx.createMediaStreamDestination === 'function') {
        destStreamSaidaGlobal = audioCtx.createMediaStreamDestination();
        const el = new Audio() as HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> };
        el.autoplay = true;
        (el as unknown as { playsInline: boolean }).playsInline = true;
        el.srcObject = destStreamSaidaGlobal.stream;
        elementoAudioSaidaGlobal = el;
      }
    } catch {
      // Ignora caso navegador não suporte MediaStreamDestination
    }
  }

  // Ajusta equalização e volume conforme o modo selecionado:
  // - 'ouvido' (Fone normal / encostado na orelha): volume suave e confortável (0.48), banda telefônica limpa (280Hz-3200Hz), zero vazamento acústico para o microfone
  // - 'vivavoz' (Alto-falante): volume aberto e nítido (1.55), banda ampla (220Hz-3600Hz) calibrada para Full-Duplex sem abafar o microfone
  try {
    const agora = audioCtx.currentTime;
    const ganhoAlvo = modoSaidaAtual === 'ouvido' ? 0.48 : 1.55;
    gainSaidaGlobal.gain.setTargetAtTime(ganhoAlvo, agora, 0.015);
    filtroPassaAltaGlobal.frequency.setTargetAtTime(modoSaidaAtual === 'ouvido' ? 280 : 220, agora, 0.02);
    filtroPassaBaixaGlobal.frequency.setTargetAtTime(modoSaidaAtual === 'ouvido' ? 3200 : 3600, agora, 0.02);
  } catch {
    // Ignora
  }

  return filtroPassaAltaGlobal;
}

/**
 * Alterna entre Viva-Voz ('vivavoz') e Fone Normal / No Ouvido ('ouvido').
 * Em dispositivos com suporte a seleção de dispositivo de saída (setSinkId), direciona para o auricular (earpiece/headset).
 * Em todos os dispositivos (incluindo iOS/iPhone), ajusta imediatamente a curva acústica e o ganho auricular para escutar no ouvido com conforto e privacidade.
 */
export async function definirModoSaidaAudio(modo: ModoSaidaAudio): Promise<ModoSaidaAudio> {
  modoSaidaAtual = modo;
  try {
    window.localStorage.setItem(CHAVE_MODO_SAIDA_AUDIO, modo);
  } catch {
    // Ignora
  }

  const audioCtx = ctxCompartilhadoConversa;
  if (audioCtx && audioCtx.state !== 'closed') {
    garantirRoteamentoSaidaAudio(audioCtx);
  }

  // Tenta rotear fisicamente para o auricular (earpiece) quando suportado pelo navegador (Android Chrome / Desktop)
  try {
    if (
      elementoAudioSaidaGlobal &&
      typeof elementoAudioSaidaGlobal.setSinkId === 'function' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.enumerateDevices === 'function'
    ) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const saidas = devices.filter((d) => d.kind === 'audiooutput');
      if (saidas.length > 0) {
        let sinkAlvo = 'default';
        if (modo === 'ouvido') {
          const auricular = saidas.find((d) =>
            /earpiece|receiver|auricular|handset|communications|headset|headphone|fone/i.test(d.label || ''),
          );
          if (auricular && auricular.deviceId) {
            sinkAlvo = auricular.deviceId;
          } else {
            const comm = saidas.find((d) => d.deviceId === 'communications');
            if (comm) sinkAlvo = 'communications';
          }
        } else {
          const speaker = saidas.find((d) => /speaker|alto-falante|altifalante|vivavoz/i.test(d.label || ''));
          if (speaker && speaker.deviceId) {
            sinkAlvo = speaker.deviceId;
          }
        }

        if (sinkAlvo !== 'default' || usandoSinkElementoAudio) {
          await elementoAudioSaidaGlobal.setSinkId(sinkAlvo);
          if (gainSaidaGlobal && destStreamSaidaGlobal && audioCtx) {
            try {
              gainSaidaGlobal.disconnect();
            } catch {}
            gainSaidaGlobal.connect(destStreamSaidaGlobal);
            usandoSinkElementoAudio = true;
            await elementoAudioSaidaGlobal.play().catch(() => {});
          }
        }
      }
    }
  } catch {
    // Fallback seguro: mantém reprodução direta via AudioContext.destination com perfil auricular
    if (gainSaidaGlobal && audioCtx && usandoSinkElementoAudio) {
      try {
        gainSaidaGlobal.disconnect();
        gainSaidaGlobal.connect(audioCtx.destination);
      } catch {}
      usandoSinkElementoAudio = false;
    }
  }

  return modoSaidaAtual;
}

/** Verifica se o usuário deixou ativada a fala bidirecional automática ao abrir a porta (padrão: true). */
export function obterAutoVozPorta(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_AUTO_VOZ) !== '0';
  } catch {
    return true;
  }
}

/** Salva a preferência do morador de iniciar a fala bidirecional automaticamente ao abrir o modal da porta. */
export function definirAutoVozPorta(ativo: boolean): void {
  try {
    window.localStorage.setItem(CHAVE_AUTO_VOZ, ativo ? '1' : '0');
  } catch {
    // ignora
  }
}

/** Verifica se já existe um MediaStream de microfone vivo na sessão ou permissão já concedida no navegador. */
export async function temMicrofoneAutorizadoNaSessao(): Promise<boolean> {
  if (
    streamMicrofoneCompartilhado &&
    streamMicrofoneCompartilhado.getAudioTracks().some((t) => t.readyState === 'live')
  ) {
    return true;
  }
  try {
    if (navigator.permissions && typeof navigator.permissions.query === 'function') {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (status.state === 'granted') return true;
      if (status.state === 'denied') return false;
    }
  } catch {
    // Safari mais antigo pode não suportar permissions.query('microphone')
  }
  try {
    return window.localStorage.getItem(CHAVE_MIC_AUTORIZADO) === '1';
  } catch {
    return false;
  }
}

/**
 * Cria e desbloqueia o AudioContext de conversa SINCRONAMENTE dentro do evento de toque/clique do usuário (onClick/onTouchStart).
 * No iPhone (iOS 17/18 WebKit), isso garante que tanto a reprodução da voz quanto a captura do microfone
 * funcionem imediatamente em Full-Duplex sem ficarem em estado 'suspended'.
 */
export function desbloquearContextoAudioConversa(): AudioContext | null {
  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!ctxCompartilhadoConversa || ctxCompartilhadoConversa.state === 'closed') {
      ctxCompartilhadoConversa = new AudioCtx();
      proximoTempoReproducaoGlobal = 0;
      filtroPassaAltaGlobal = null;
      filtroPassaBaixaGlobal = null;
      gainSaidaGlobal = null;
    }
    if (ctxCompartilhadoConversa.state === 'suspended') {
      ctxCompartilhadoConversa.resume().catch(() => {});
    }
    const noEntrada = garantirRoteamentoSaidaAudio(ctxCompartilhadoConversa);
    const buf = ctxCompartilhadoConversa.createBuffer(1, 1, 8000);
    const src = ctxCompartilhadoConversa.createBufferSource();
    src.buffer = buf;
    src.connect(noEntrada);
    src.start(0);
    return ctxCompartilhadoConversa;
  } catch {
    return null;
  }
}

/**
 * Reproduz um chunk de áudio G.711 u-law (8000 Hz, Base64) diretamente no AudioContext desbloqueado do celular
 * com crossfade suave de bordas (zero estalos), baixa latência e respeito ao modo Viva-Voz ou No Ouvido (Fone).
 */
export function reproduzirUlawNoContexto(audioUlawBase64: string): void {
  if (!audioUlawBase64) return;
  try {
    const audioCtx = ctxCompartilhadoConversa ?? desbloquearContextoAudioConversa();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    const bin = window.atob(audioUlawBase64);
    const len = bin.length;
    if (len < 60) return;

    const audioBuffer = audioCtx.createBuffer(1, len, 8000);
    const canal = audioBuffer.getChannelData(0);
    const fadeLen = Math.min(24, Math.floor(len / 6)); // ~3ms de fade nas bordas para eliminar cliques entre pacotes Full-Duplex
    let somaQuad = 0;

    for (let i = 0; i < len; i++) {
      const b = bin.charCodeAt(i) & 0xff;
      let val = ulawParaFloat(b);
      if (i < fadeLen) {
        val *= i / fadeLen;
      } else if (i >= len - fadeLen) {
        val *= (len - 1 - i) / fadeLen;
      }
      canal[i] = val;
      somaQuad += val * val;
    }

    const rms = Math.sqrt(somaQuad / len);
    ultimoNivelVozRecebida = Math.min(100, Math.round(Math.pow(Math.min(1, rms * 8), 0.65) * 100));
    tsUltimoPacoteRecebido = Date.now();

    const noSaida = garantirRoteamentoSaidaAudio(audioCtx);
    const srcNode = audioCtx.createBufferSource();
    srcNode.buffer = audioBuffer;
    srcNode.connect(noSaida);

    const agora = audioCtx.currentTime;
    // Jitter buffer enxuto (30ms inicial e teto de 450ms) para conversa simultânea em tempo real sem atraso acumulado
    if (proximoTempoReproducaoGlobal < agora || proximoTempoReproducaoGlobal > agora + 0.45) {
      proximoTempoReproducaoGlobal = agora + 0.03;
    }
    srcNode.start(proximoTempoReproducaoGlobal);
    proximoTempoReproducaoGlobal += audioBuffer.duration;
  } catch {
    // ignora pacotes inválidos
  }
}

/**
 * Obtém ou reaproveita o MediaStream do microfone já autorizado na sessão.
 * Ao manter a track viva (apenas com enabled=false quando fora de conversa), o navegador/iOS
 * não volta a exibir o popup de confirmação nas próximas conversas.
 */
async function obterStreamMicrofonePersistente(): Promise<MediaStream> {
  if (streamMicrofoneCompartilhado) {
    const tracksVivas = streamMicrofoneCompartilhado
      .getAudioTracks()
      .filter((t) => t.readyState === 'live');
    if (tracksVivas.length > 0) {
      tracksVivas.forEach((t) => {
        t.enabled = true;
      });
      return streamMicrofoneCompartilhado;
    }
    streamMicrofoneCompartilhado = null;
  }

  const novoStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
    video: false,
  });

  streamMicrofoneCompartilhado = novoStream;
  try {
    window.localStorage.setItem(CHAVE_MIC_AUTORIZADO, '1');
  } catch {
    // ignora
  }
  return novoStream;
}

/**
 * Inicia a Conversa Bidirecional Contínua:
 * - Quando `modoFullDuplex: true` (chamadas entre apartamentos), transmite pacotes curtos contínuos (~180ms)
 *   em paralelo com a recepção, permitindo que os dois moradores conversem simultaneamente em tempo real
 *   como numa chamada telefônica ou de WhatsApp (sem efeito "rádio" walkie-talkie).
 * - Quando `modoFullDuplex: false` (leitor facial Hikvision ISAPI), transmite trechos contínuos de ~500ms.
 */
export async function iniciarConversaBidirecional(
  opcoes: OpcoesConversaBidirecional,
): Promise<SessaoConversaBidirecional> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('O seu navegador não permitiu acesso ao microfone (requer conexão segura HTTPS).');
  }

  if (opcoes.modoSaidaInicial) {
    await definirModoSaidaAudio(opcoes.modoSaidaInicial);
  }

  const audioCtx = desbloquearContextoAudioConversa();
  if (!audioCtx) {
    throw new Error('Não foi possível inicializar o sistema de áudio do aparelho.');
  }

  const stream = await obterStreamMicrofonePersistente();

  if (audioCtx.state === 'suspended') {
    await audioCtx.resume().catch(() => {});
  }

  const ehFullDuplex = opcoes.modoFullDuplex !== false;
  const tamanhoBuffer = ehFullDuplex ? 2048 : 4096;

  const source = audioCtx.createMediaStreamSource(stream);
  const processor = audioCtx.createScriptProcessor(tamanhoBuffer, 1, 1);
  const mudo = audioCtx.createGain();
  mudo.gain.value = 0;

  const sampleRate = audioCtx.sampleRate || 48000;
  const preRoll: Float32Array[] = [];
  let blocosFala: Float32Array[] = [];
  let blocosReserva: Float32Array[] = [];
  let amostrasFala = 0;
  let amostrasReserva = 0;
  let blocosSilencio = 0;
  let blocosHangoverFullDuplex = 0;
  let emFala = false;
  let enviouAlgumTrecho = false;
  let encerrado = false;

  const descarregarTrecho = (usarReservaSeVazio = false) => {
    let fonte = blocosFala;
    if (fonte.length === 0 && usarReservaSeVazio && !enviouAlgumTrecho && blocosReserva.length > 0) {
      fonte = blocosReserva;
    }
    if (fonte.length === 0) return;

    blocosFala = [];
    blocosReserva = [];
    amostrasFala = 0;
    amostrasReserva = 0;
    blocosSilencio = 0;
    if (!ehFullDuplex) {
      emFala = false;
    }

    const b64 = codificarChunksParaUlawBase64(fonte, sampleRate, ehFullDuplex);
    if (b64 && b64.length >= 120) {
      enviouAlgumTrecho = true;
      void opcoes.onTrechoVoz(b64);
    }
  };

  processor.onaudioprocess = (ev) => {
    if (encerrado) return;
    const input = ev.inputBuffer.getChannelData(0);
    const copia = new Float32Array(input);

    // Calcula energia (RMS e Pico) do bloco
    let somaQuad = 0;
    let pico = 0;
    for (let i = 0; i < copia.length; i++) {
      const v = Math.abs(copia[i]);
      somaQuad += v * v;
      if (v > pico) pico = v;
    }
    const rms = Math.sqrt(somaQuad / copia.length);
    const nivel = Math.min(100, Math.round(Math.pow(Math.min(1, rms * 10), 0.65) * 100));
    opcoes.onNivelVoz?.(nivel);

    if (ehFullDuplex) {
      // MODO FULL-DUPLEX TEMPO REAL (Chamada Telefônica / Entre Apartamentos):
      // Transmite continuamente em pacotes curtos de ~180ms sem esperar pausa na fala,
      // permitindo que os dois moradores falem e se escutem ao mesmo tempo!
      const temAtividade = rms > 0.0018 || pico > 0.0065;
      if (temAtividade) {
        if (blocosHangoverFullDuplex === 0 && preRoll.length > 0) {
          for (const p of preRoll) {
            blocosFala.push(p);
            amostrasFala += p.length;
          }
          preRoll.length = 0;
        }
        blocosHangoverFullDuplex = 4; // mantém transmissão por mais ~170ms após cada sílaba para nunca picotar
      }

      if (blocosHangoverFullDuplex > 0) {
        if (!temAtividade) {
          blocosHangoverFullDuplex--;
        }
        blocosFala.push(copia);
        amostrasFala += copia.length;

        // Despacha pacote curto a cada ~180ms para latência mínima em tempo real
        if (amostrasFala >= sampleRate * 0.18) {
          descarregarTrecho(false);
        }
      } else {
        if (amostrasFala > 0) {
          descarregarTrecho(false);
        }
        preRoll.push(copia);
        if (preRoll.length > 2) {
          preRoll.shift();
        }
      }
      return;
    }

    // MODO PORTARIA / LEITOR FACIAL ISAPI (blocos de ~0.55s)
    blocosReserva.push(copia);
    amostrasReserva += copia.length;
    while (amostrasReserva > sampleRate * 6 && blocosReserva.length > 1) {
      const rem = blocosReserva.shift();
      if (rem) amostrasReserva -= rem.length;
    }

    const temVozNoBloco = rms > 0.0035 || pico > 0.012;

    if (temVozNoBloco) {
      if (!emFala) {
        emFala = true;
        for (const p of preRoll) {
          blocosFala.push(p);
          amostrasFala += p.length;
        }
        preRoll.length = 0;
      }
      blocosFala.push(copia);
      amostrasFala += copia.length;
      blocosSilencio = 0;

      if (amostrasFala >= sampleRate * 0.5) {
        descarregarTrecho(false);
      }
    } else if (emFala) {
      blocosFala.push(copia);
      amostrasFala += copia.length;
      blocosSilencio++;

      if (blocosSilencio >= 2) {
        if (amostrasFala >= sampleRate * 0.12) {
          descarregarTrecho(false);
        } else {
          blocosFala = [];
          amostrasFala = 0;
          blocosSilencio = 0;
          emFala = false;
        }
      }
    } else {
      preRoll.push(copia);
      if (preRoll.length > 2) {
        preRoll.shift();
      }
    }
  };

  source.connect(processor);
  processor.connect(mudo);
  mudo.connect(audioCtx.destination);

  // Watchdog para iOS: garante que o AudioContext nunca fique suspenso enquanto a conversa estiver ativa
  const timerResume = window.setInterval(() => {
    if (!encerrado && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  }, 300);

  const limpar = () => {
    if (encerrado) return;
    encerrado = true;
    window.clearInterval(timerResume);
    opcoes.onNivelVoz?.(0);
    try {
      processor.disconnect();
      source.disconnect();
      mudo.disconnect();
    } catch {
      // ignora
    }
    // Mantém a track viva com enabled=false para que o navegador/iOS não peça permissão novamente na próxima conversa
    stream.getAudioTracks().forEach((t) => {
      t.enabled = false;
    });
  };

  return {
    encerrar: () => {
      if (encerrado) return;
      descarregarTrecho(true);
      limpar();
    },
    reproduzirUlawBase64: (b64: string) => {
      if (!encerrado) {
        reproduzirUlawNoContexto(b64);
      }
    },
    definirModoSaida: (modo: ModoSaidaAudio) => definirModoSaidaAudio(modo),
  };
}
