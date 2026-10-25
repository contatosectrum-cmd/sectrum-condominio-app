// Ponte de integração entre o React e a camada nativa Android (Kotlin/Java) e futuro iOS (Swift) via Capacitor.
// Mantém 100% de compatibilidade quando executado no navegador Web/PWA comum.

export interface SectrumAndroidBridge {
  ehAppNativo?: () => boolean;
  obterVersaoApp?: () => string;
  salvarSessaoNativa?: (token: string, usuarioJson: string, baseUrl: string) => void;
  limparSessaoNativa?: () => void;
  iniciarSireneNativa?: (tipo: string, titulo: string, mensagem: string, furarDnd: boolean) => void;
  pararSireneNativa?: () => void;
  iniciarToqueInterfoneNativo?: (titulo: string, subtitulo: string) => void;
  pararToqueInterfoneNativo?: () => void;
  temBiometriaNativa?: () => boolean;
  temCredencialBiometriaSalva?: (login: string) => boolean;
  salvarCredencialBiometriaNativa?: (login: string, token: string, usuarioJson: string) => boolean;
  autenticarBiometriaNativa?: (login: string, titulo: string, subtitulo: string) => void;
  solicitarOtimizacaoBateria?: () => void;
  otimizacaoBateriaIgnorada?: () => boolean;
  /** iOS: conversa entre apartamentos com áudio nativo (fone de ouvido + viva-voz). */
  iniciarAudioInterfoneNativo?: (callId: string, modo: 'ouvido' | 'vivavoz') => void;
  encerrarAudioInterfoneNativo?: () => void;
  mudoAudioInterfoneNativo?: (mudo: boolean) => void;
  saidaAudioInterfoneNativo?: (modo: 'ouvido' | 'vivavoz') => void;
  /** iOS: encerra a ligação da tela nativa (CallKit) quando o morador desliga pela tela do app. */
  desligarChamadaNativa?: (callId: string) => void;
}

declare global {
  interface Window {
    SectrumAndroid?: SectrumAndroidBridge;
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
    };
    __sectrumOnBiometricResult?: (sucesso: boolean, payloadJsonOuErro: string) => void;
    /** iOS: call_id da chamada que a tela nativa (CallKit) já está tocando. */
    __sectrumCallKitTocando?: string;
  }
}

/** True quando o app iOS nativo faz o áudio da conversa entre apartamentos (fone de ouvido + viva-voz). */
export function temAudioInterfoneNativo(): boolean {
  return typeof window !== 'undefined' && typeof window.SectrumAndroid?.iniciarAudioInterfoneNativo === 'function';
}

/** True quando a tela nativa do iOS (CallKit) já está tocando esta chamada (o app não toca campainha por cima). */
export function callKitTocandoChamada(callId: string | undefined | null): boolean {
  return !!callId && typeof window !== 'undefined' && window.__sectrumCallKitTocando === callId;
}

/** Dados enviados pelo iOS quando uma chamada entre apartamentos é atendida na tela nativa (CallKit). */
export interface ChamadaAtendidaNativa {
  call_id: string;
  origem_nome?: string;
  device_id?: string;
}

/** Lê o detalhe do evento `sectrum-callkit-atendida-nativa`. */
export function lerChamadaAtendidaNativa(ev: Event): ChamadaAtendidaNativa | null {
  const d = (ev as CustomEvent<ChamadaAtendidaNativa | undefined>).detail;
  return d && typeof d.call_id === 'string' && d.call_id !== '' ? d : null;
}

const URL_PRODUCAO_PADRAO = 'https://cond.vps.seg.br';

/** Retorna true quando o sistema está rodando dentro do APK Android nativo ou App iOS nativo (Capacitor). */
export function ehAppNativo(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.SectrumAndroid?.ehAppNativo?.()) return true;
    if (window.Capacitor?.isNativePlatform?.()) return true;
  } catch {
    // Ignora
  }
  return false;
}

/**
 * Retorna a origem HTTP(S) do servidor da API.
 * - No App Nativo (onde window.location.origin é https://localhost ou capacitor://localhost),
 *   aponta para https://cond.vps.seg.br (ou URL customizada salva em localStorage 'sectrum_server_url').
 * - Na Web/PWA, retorna '' para caminhos relativos na mesma origem.
 */
export function obterOrigemServidor(): string {
  if (typeof window === 'undefined') return URL_PRODUCAO_PADRAO;
  if (ehAppNativo()) {
    const custom = localStorage.getItem('sectrum_server_url')?.trim();
    if (custom && /^https?:\/\//i.test(custom)) {
      return custom.replace(/\/+$/, '');
    }
    return URL_PRODUCAO_PADRAO;
  }
  return window.location.origin;
}

/**
 * Monta a URL WebSocket do go2rtc (/go2rtc/api/ws?src=...) compatível tanto com Web/PWA
 * quanto com o App Nativo Android/iOS.
 */
export function obterUrlWsGo2rtc(stream: string): string {
  const srcParam = encodeURIComponent(stream);
  if (ehAppNativo()) {
    const origem = obterOrigemServidor();
    const wsOrigem = origem.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
    return `${wsOrigem}/go2rtc/api/ws?src=${srcParam}`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/go2rtc/api/ws?src=${srcParam}`;
}

/**
 * Sincroniza o token de autenticação/interfone com o Serviço Nativo em Segundo Plano (SectrumGuardService no Android).
 * Assim, mesmo que o morador feche o aplicativo, o serviço nativo Kotlin continua escutando chamadas de VoIP e Emergências.
 */
export function sincronizarSessaoComAppNativo(token: string | null, usuario: unknown, loginUsado?: string): void {
  if (typeof window === 'undefined' || !window.SectrumAndroid) return;
  try {
    if (token && usuario) {
      const usuarioStr = typeof usuario === 'string' ? usuario : JSON.stringify(usuario);
      window.SectrumAndroid.salvarSessaoNativa?.(token, usuarioStr, obterOrigemServidor());
      const loginSalvo = (loginUsado || localStorage.getItem('sectrum_cpf') || '').trim();
      if (loginSalvo) {
        window.SectrumAndroid.salvarCredencialBiometriaNativa?.(loginSalvo, token, usuarioStr);
      }
    }
  } catch {
    // Ignora falhas na ponte nativa
  }
}

/** Aciona a sirene nativa do Android no canal de ALARME (fura modo silencioso e Não Perturbe). */
export function acionarSireneEmergenciaNativa(
  tipo: string,
  titulo: string,
  mensagem: string,
  furarDnd = true,
): void {
  if (typeof window === 'undefined' || !window.SectrumAndroid) return;
  try {
    window.SectrumAndroid.iniciarSireneNativa?.(tipo, titulo, mensagem, furarDnd);
  } catch {
    // Ignora
  }
}

/** Interrompe imediatamente a sirene de emergência nativa do Android. */
export function pararSireneEmergenciaNativa(): void {
  if (typeof window === 'undefined' || !window.SectrumAndroid) return;
  try {
    window.SectrumAndroid.pararSireneNativa?.();
  } catch {
    // Ignora
  }
}

/** Interrompe imediatamente o toque nativo de interfone do Android (ao atender, recusar ou abrir porta). */
export function pararToqueInterfoneNativo(): void {
  if (typeof window === 'undefined' || !window.SectrumAndroid) return;
  try {
    window.SectrumAndroid.pararToqueInterfoneNativo?.();
  } catch {
    // Ignora
  }
}

/** Verifica se o dispositivo Android possui hardware biométrico (Impressão Digital / Face) configurado. */
export function temBiometriaNativaDisponivel(): boolean {
  if (typeof window === 'undefined' || !window.SectrumAndroid?.temBiometriaNativa) return false;
  try {
    return Boolean(window.SectrumAndroid.temBiometriaNativa());
  } catch {
    return false;
  }
}

/** Solicita autenticação biométrica nativa do Android (BiometricPrompt) e devolve os dados da sessão vinculada. */
export function autenticarComBiometriaNativa(
  login: string,
  titulo = 'Autenticação Biométrica Sectrum',
  subtitulo = 'Confirme sua digital ou reconhecimento facial para continuar',
): Promise<{ token: string; usuario: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.SectrumAndroid?.autenticarBiometriaNativa) {
      reject(new Error('Biometria nativa não disponível neste aparelho.'));
      return;
    }

    const timer = window.setTimeout(() => {
      window.__sectrumOnBiometricResult = undefined;
      reject(new Error('Tempo limite de leitura biométrica esgotado.'));
    }, 60000);

    window.__sectrumOnBiometricResult = (sucesso: boolean, payloadJsonOuErro: string) => {
      window.clearTimeout(timer);
      window.__sectrumOnBiometricResult = undefined;
      if (!sucesso) {
        reject(new Error(payloadJsonOuErro || 'Biometria não reconhecida ou cancelada.'));
        return;
      }
      try {
        const dados = JSON.parse(payloadJsonOuErro) as { token: string; usuario: Record<string, unknown> };
        if (!dados?.token || !dados?.usuario) {
          reject(
            new Error(
              'Nenhuma credencial salva para este usuário no aparelho. Entre com sua senha uma primeira vez para ativar a digital.',
            ),
          );
          return;
        }
        resolve(dados);
      } catch {
        reject(new Error('Falha ao processar credencial biométrica do aparelho.'));
      }
    };

    try {
      window.SectrumAndroid.autenticarBiometriaNativa(login.trim(), titulo, subtitulo);
    } catch (e) {
      window.clearTimeout(timer);
      window.__sectrumOnBiometricResult = undefined;
      reject(e instanceof Error ? e : new Error('Erro ao abrir leitor biométrico.'));
    }
  });
}
