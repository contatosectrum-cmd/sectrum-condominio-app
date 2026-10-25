// Sessao do usuario no navegador (substitui a $_SESSION do legado).
// Guarda o token assinado pela API e os dados publicos do usuario.
import { sincronizarSessaoComAppNativo } from './nativo';

export type Perfil = 'superadmin' | 'admin' | 'sindico' | 'portaria' | 'morador';

export interface Usuario {
  id: number;
  nome: string;
  perfil: Perfil;
  condominio_id: number | null;
  condominio_nome: string | null;
  permite_temporada?: boolean;
  modulo_airbnb?: boolean;
  modulo_interfone?: boolean;
  modulo_reservas?: boolean;
  modulo_ocorrencias?: boolean;
  modulo_enquetes?: boolean;
  modulo_avisos?: boolean;
  modulo_encomendas?: boolean;
  modulo_emergencia?: boolean;
  emergencia_furar_nao_perturbe?: boolean;
  cameras_morador_ativo?: boolean;
  superadmin: boolean;
  unidade_id: number | null;
  primeiro_acesso: number;
}

const CHAVE_TOKEN = 'sectrum_token';
const CHAVE_USUARIO = 'sectrum_usuario';
const CHAVE_INTERFONE_TOKEN = 'sectrum_interfone_token';
const CHAVE_INTERFONE_USUARIO = 'sectrum_interfone_usuario';

type Ouvinte = () => void;
const ouvintes = new Set<Ouvinte>();

function decodificarTokenMorador(tok: string): Usuario | null {
  try {
    const partes = tok.split('.');
    if (partes.length !== 3) return null;
    const b64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      window
        .atob(b64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    const claims = JSON.parse(json) as {
      sub?: number;
      nome?: string;
      perfil?: Perfil;
      cid?: number | null;
      cid_proprio?: number | null;
      uid?: number | null;
      pa?: number;
    };
    if (!claims || !claims.sub || claims.perfil !== 'morador') return null;
    return {
      id: Number(claims.sub),
      nome: String(claims.nome || 'Morador'),
      perfil: 'morador',
      condominio_id: claims.cid ?? null,
      condominio_nome: null,
      permite_temporada: true,
      superadmin: false,
      unidade_id: claims.uid ?? null,
      primeiro_acesso: Number(claims.pa ?? 0),
    };
  } catch {
    return null;
  }
}

// Se o morador tocou em uma notificacao Push de chamada de interfone enquanto estava deslogado (?interfone_token=...),
// restaura automaticamente a sessao do interfone antes de renderizar as rotas para abrir direto na tela de atender!
(() => {
  try {
    const params = new URLSearchParams(window.location.search);
    const tokUrl = params.get('interfone_token');
    if (tokUrl) {
      const uDec = decodificarTokenMorador(tokUrl);
      if (uDec) {
        localStorage.setItem(CHAVE_TOKEN, tokUrl);
        localStorage.setItem(CHAVE_USUARIO, JSON.stringify(uDec));
        localStorage.setItem(CHAVE_INTERFONE_TOKEN, tokUrl);
        localStorage.setItem(CHAVE_INTERFONE_USUARIO, JSON.stringify(uDec));
      }
      params.delete('interfone_token');
      const novaQuery = params.toString();
      const novaUrl = window.location.pathname + (novaQuery ? `?${novaQuery}` : '') + window.location.hash;
      window.history.replaceState(null, '', novaUrl);
    } else {
      // Garante que moradores ja logados tenham o vinculo permanente de interfone salvo no aparelho
      const tokAtual = localStorage.getItem(CHAVE_TOKEN);
      const usuAtual = localStorage.getItem(CHAVE_USUARIO);
      if (tokAtual && usuAtual) {
        const uObj = JSON.parse(usuAtual) as Usuario;
        if (uObj?.perfil === 'morador') {
          localStorage.setItem(CHAVE_INTERFONE_TOKEN, tokAtual);
          localStorage.setItem(CHAVE_INTERFONE_USUARIO, usuAtual);
        }
        sincronizarSessaoComAppNativo(tokAtual, uObj);
      } else {
        const tokInterfone = localStorage.getItem(CHAVE_INTERFONE_TOKEN);
        const usuInterfone = localStorage.getItem(CHAVE_INTERFONE_USUARIO);
        if (tokInterfone && usuInterfone) {
          sincronizarSessaoComAppNativo(tokInterfone, usuInterfone);
        }
      }
    }
  } catch {
    // Ignora
  }
})();

let usuarioCache: Usuario | null = lerUsuario();

function lerUsuario(): Usuario | null {
  try {
    const bruto = localStorage.getItem(CHAVE_USUARIO);
    return bruto ? (JSON.parse(bruto) as Usuario) : null;
  } catch {
    return null;
  }
}

function notificar() {
  usuarioCache = lerUsuario();
  ouvintes.forEach((o) => o());
}

export function obterToken(): string | null {
  return localStorage.getItem(CHAVE_TOKEN);
}

/** Token persistente do interfone do morador (mantido mesmo quando o aplicativo esta deslogado). */
export function obterTokenInterfone(): string | null {
  return localStorage.getItem(CHAVE_TOKEN) || localStorage.getItem(CHAVE_INTERFONE_TOKEN);
}

export function obterUsuario(): Usuario | null {
  return usuarioCache;
}

export function salvarSessao(token: string, usuario: Usuario) {
  localStorage.setItem(CHAVE_TOKEN, token);
  localStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
  if (usuario.perfil === 'morador') {
    localStorage.setItem(CHAVE_INTERFONE_TOKEN, token);
    localStorage.setItem(CHAVE_INTERFONE_USUARIO, JSON.stringify(usuario));
  } else {
    localStorage.removeItem(CHAVE_INTERFONE_TOKEN);
    localStorage.removeItem(CHAVE_INTERFONE_USUARIO);
  }
  sincronizarSessaoComAppNativo(token, usuario);
  notificar();
}

export function restaurarSessaoInterfone(tokenPush?: string): boolean {
  try {
    if (tokenPush) {
      const u = decodificarTokenMorador(tokenPush);
      if (u) {
        salvarSessao(tokenPush, u);
        return true;
      }
    }
    const tokSalvo = localStorage.getItem(CHAVE_INTERFONE_TOKEN);
    const usuSalvo = localStorage.getItem(CHAVE_INTERFONE_USUARIO);
    if (tokSalvo && usuSalvo) {
      localStorage.setItem(CHAVE_TOKEN, tokSalvo);
      localStorage.setItem(CHAVE_USUARIO, usuSalvo);
      notificar();
      return true;
    }
  } catch {
    // Ignora
  }
  return false;
}

export function atualizarUsuario(usuario: Usuario) {
  localStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
  if (usuario.perfil === 'morador') {
    localStorage.setItem(CHAVE_INTERFONE_USUARIO, JSON.stringify(usuario));
  }
  notificar();
}

export function encerrarSessao() {
  localStorage.removeItem(CHAVE_TOKEN);
  localStorage.removeItem(CHAVE_USUARIO);
  // Limpa chaves da fase anterior (login simulado), mas PRESERVA CHAVE_INTERFONE_TOKEN
  // para que o interfone continue tocando no celular do morador mesmo deslogado!
  localStorage.removeItem('cond_token');
  localStorage.removeItem('cond_perfil');
  notificar();
}

/** Assinatura para useSyncExternalStore. */
export function assinarSessao(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

// Mantem abas diferentes sincronizadas (logout em uma aba derruba as outras)
window.addEventListener('storage', (e) => {
  if (e.key === CHAVE_TOKEN || e.key === CHAVE_USUARIO) notificar();
});
