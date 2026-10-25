// WebAuthn (biometria do aparelho: digital / Face ID) - cadastro na tela "Registro Facial" e login.
// Mesma lógica do JS do legado (views/minha_biometria.php e views/login.php), usando as rotas da API nova.
// No App Nativo Android (Capacitor), utiliza também o BiometricPrompt nativo do Android quando disponível.
import { api } from './api';
import { obterToken, obterUsuario, salvarSessao, type Usuario } from './sessao';
import {
  autenticarComBiometriaNativa,
  ehAppNativo,
  temBiometriaNativaDisponivel,
} from './nativo';

export function bufferParaB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function b64urlParaBuffer(b64url: string): ArrayBuffer {
  const pad = '==='.slice((b64url.length + 3) % 4);
  const s = atob(b64url.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const buf = new ArrayBuffer(s.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return buf;
}

/** O aparelho tem leitor biométrico nativo? (o legado só mostra o botão de login nesse caso) */
export async function temBiometriaNoAparelho(): Promise<boolean> {
  if (ehAppNativo() && temBiometriaNativaDisponivel()) {
    return true;
  }
  if (!window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export interface OpcoesCadastro {
  selo: string;
  publicKey: PublicKeyCredentialCreationOptions & { challenge: string; user: { id: string; name: string; displayName: string } };
}

/** Pre-carrega o desafio de cadastro para que no iPhone (Safari WebKit) o navigator.credentials.create rode no mesmo tick do toque. */
export async function prepararDesafioCadastro(): Promise<OpcoesCadastro> {
  return api<OpcoesCadastro>('morador_webauthn_desafio', { corpo: {} });
}

/** Cadastra a biometria do aparelho para o morador logado. Lança Error com a mensagem para o usuário. */
export async function cadastrarBiometria(opPrevia?: OpcoesCadastro | null): Promise<void> {
  if (ehAppNativo() && temBiometriaNativaDisponivel() && window.SectrumAndroid) {
    const tok = obterToken();
    const usu = obterUsuario();
    const loginSalvo = localStorage.getItem('sectrum_cpf') || String(usu?.id ?? 'morador');
    if (tok && usu) {
      window.SectrumAndroid.salvarCredencialBiometriaNativa?.(
        loginSalvo,
        tok,
        JSON.stringify(usu),
      );
      await autenticarComBiometriaNativa(
        loginSalvo,
        'Cadastrar Biometria no Aparelho',
        'Confirme sua digital ou rosto para vincular seu acesso rápido',
      );
      return;
    }
  }
  const op = opPrevia ?? (await prepararDesafioCadastro());
  const pk = {
    ...op.publicKey,
    rp: { ...(op.publicKey.rp ?? { name: 'Sectrum' }), id: window.location.hostname },
    challenge: b64urlParaBuffer(op.publicKey.challenge),
    user: { ...op.publicKey.user, id: b64urlParaBuffer(op.publicKey.user.id) },
  } as PublicKeyCredentialCreationOptions;
  const cred = (await navigator.credentials.create({ publicKey: pk })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Não foi possível cadastrar a biometria. Tente novamente.');
  const r = cred.response as AuthenticatorAttestationResponse;
  await api('morador_webauthn_cadastrar', {
    corpo: {
      selo: op.selo,
      id: cred.id,
      type: cred.type,
      response: { clientDataJSON: bufferParaB64url(r.clientDataJSON), attestationObject: bufferParaB64url(r.attestationObject) },
    },
  });
}

interface OpcoesLogin {
  selo: string;
  publicKey: { challenge: string; timeout: number; rpId: string; userVerification: UserVerificationRequirement; allowCredentials: { type: 'public-key'; id: string; transports: AuthenticatorTransport[] }[] };
}

/** Login por biometria (CPF ou e-mail + autenticador do aparelho). Salva a sessão e devolve o usuário. */
export async function entrarComBiometria(login: string): Promise<{ usuario: Usuario }> {
  if (ehAppNativo() && temBiometriaNativaDisponivel() && window.SectrumAndroid) {
    const dados = await autenticarComBiometriaNativa(
      login,
      'Entrar com Biometria',
      'Toque no sensor de impressão digital para acessar o Sectrum',
    );
    const usu = dados.usuario as unknown as Usuario;
    salvarSessao(dados.token, usu);
    return { usuario: usu };
  }
  const op = await api<OpcoesLogin>('webauthn_desafio', { corpo: { login } });
  const pk: PublicKeyCredentialRequestOptions = {
    ...op.publicKey,
    rpId: window.location.hostname,
    challenge: b64urlParaBuffer(op.publicKey.challenge),
    allowCredentials: (op.publicKey.allowCredentials ?? []).map((c) => ({ ...c, id: b64urlParaBuffer(c.id) })),
  };
  const a = (await navigator.credentials.get({ publicKey: pk })) as PublicKeyCredential | null;
  if (!a) throw new Error('Biometria não reconhecida. Tente novamente.');
  const r = a.response as AuthenticatorAssertionResponse;
  const res = await api<{ token: string; usuario: Usuario }>('webauthn_entrar', {
    corpo: {
      login,
      selo: op.selo,
      authData: {
        id: a.id,
        response: {
          authenticatorData: bufferParaB64url(r.authenticatorData),
          clientDataJSON: bufferParaB64url(r.clientDataJSON),
          signature: bufferParaB64url(r.signature),
        },
      },
    },
  });
  salvarSessao(res.token, res.usuario);
  return res;
}
