// Cliente HTTP unico da API nova.
// - Envia o token em toda chamada;
// - 401 -> encerra a sessao e volta ao login; 428 -> obriga trocar a senha (1o acesso);
// - Erros viram ErroApi com a mensagem do servidor.
import { encerrarSessao, obterToken, obterTokenInterfone } from './sessao';
import { ehAppNativo, obterOrigemServidor } from './nativo';

const ROTAS_INTERFONE_BG = new Set([
  'morador_interfone_status',
  'morador_interfone_sinalizar',
  'morador_interfone_discar',
  'morador_interfone_falar',
  'morador_interfone_escutar',
  'morador_camera_snapshot',
  'morador_camera_voz',
  'morador_camera_stream',
  'morador_abrir_porta',
  'morador_emergencia_acionar',
  'emergencia_status_ativo',
  'emergencia_responder',
  'salvar_fcm_token',
]);

export class ErroApi extends Error {
  status: number;
  constructor(mensagem: string, status: number) {
    super(mensagem);
    this.status = status;
  }
}

interface Opcoes {
  metodo?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  corpo?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
}

function redirecionar(caminho: string) {
  if (window.location.pathname !== caminho) window.location.assign(caminho);
}

/** Trata respostas de sessao comuns a api() e ao interceptador de fetch. */
function tratarStatusSessao(status: number) {
  if (status === 401) {
    if (!obterToken()) return;
    encerrarSessao();
    redirecionar('/login');
  } else if (status === 428) {
    redirecionar('/trocar-senha');
  }
}

/** Chama uma rota: api('listar_blocos') ou api('login', { metodo: 'POST', corpo: {...} }). */
export async function api<T = Record<string, unknown>>(rota: string, opcoes: Opcoes = {}): Promise<T> {
  const params = new URLSearchParams({ route: rota });
  Object.entries(opcoes.query ?? {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null) params.set(k, String(v));
  });

  const metodo = opcoes.metodo ?? (opcoes.corpo !== undefined ? 'POST' : 'GET');
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = obterToken() || (ROTAS_INTERFONE_BG.has(rota) ? obterTokenInterfone() : null);
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opcoes.corpo !== undefined) headers['Content-Type'] = 'application/json';

  const baseApi = ehAppNativo() ? obterOrigemServidor() : '';
  let resp: Response;
  try {
    resp = await fetchOriginal(`${baseApi}/api.php?${params.toString()}`, {
      method: metodo,
      headers,
      body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
      signal: opcoes.signal,
    });
  } catch {
    throw new ErroApi('Falha de conexao com o servidor.', 0);
  }

  let dados: Record<string, unknown> = {};
  try {
    dados = await resp.json();
  } catch {
    // resposta sem JSON (ex.: erro do PHP)
  }

  if (!resp.ok || dados.status === 'erro') {
    if (rota !== 'login' && !rota.startsWith('webauthn_') && !ROTAS_INTERFONE_BG.has(rota)) {
      tratarStatusSessao(resp.status);
    }
    throw new ErroApi(String(dados.mensagem ?? `Erro ${resp.status}`), resp.status);
  }
  return dados as T;
}

// Referencia ao fetch nativo (antes do interceptador)
const fetchOriginal: typeof window.fetch = window.fetch.bind(window);

/**
 * Compatibilidade: as telas da fase anterior chamam fetch('/api.php?...') diretamente.
 * Este interceptador injeta o token, resolve a URL do servidor no App Nativo Android/iOS e trata 401/428.
 */
export function instalarInterceptadorFetch() {
  window.fetch = async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    const ehApiRelativa = url.startsWith('/api.php');
    const ehApi =
      ehApiRelativa ||
      url.startsWith(`${window.location.origin}/api.php`) ||
      url.startsWith(`${obterOrigemServidor()}/api.php`);
    if (!ehApi) return fetchOriginal(entrada, init);

    const headers = new Headers(init?.headers ?? (entrada instanceof Request ? entrada.headers : undefined));
    const token = obterToken();
    if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);

    let destinoFetch: RequestInfo | URL = entrada;
    if (ehAppNativo() && ehApiRelativa) {
      destinoFetch = `${obterOrigemServidor()}${url}`;
    }

    const resp = await fetchOriginal(destinoFetch, { ...init, headers });
    if (!url.includes('route=login')) tratarStatusSessao(resp.status);
    return resp;
  };
}

/**
 * Origem pública para links compartilháveis (pré-cadastro, convite de visitante, temporada).
 * No App Nativo Android/iOS (Capacitor), retorna a origem pública do servidor (https://cond.vps.seg.br).
 * Quando o painel está aberto em localhost/127.0.0.1 no laboratório, usa o domínio HTTPS público do Tailscale Funnel.
 */
export function origemPublica(): string {
  if (ehAppNativo()) {
    return obterOrigemServidor();
  }
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return (import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined) || 'https://sectrum.tail5a3e30.ts.net:8443';
  }
  return window.location.origin;
}

