// Hook reativo da sessao + acoes de login/logout/troca de condominio.
import { useSyncExternalStore } from 'react';
import { api } from './api';
import { assinarSessao, encerrarSessao, obterUsuario, salvarSessao, type Usuario } from './sessao';

interface RespostaSessao {
  token: string;
  usuario: Usuario;
  destino?: string;
}

export function useSessao() {
  const usuario = useSyncExternalStore(assinarSessao, obterUsuario);
  return { usuario, logado: usuario !== null };
}

export async function entrar(email: string, senha: string): Promise<RespostaSessao> {
  const r = await api<RespostaSessao>('login', { corpo: { email, senha } });
  salvarSessao(r.token, r.usuario);
  return r;
}

export function sair() {
  encerrarSessao();
  window.location.assign('/login');
}

export async function trocarSenha(nova_senha: string, confirma_senha: string): Promise<RespostaSessao> {
  const r = await api<RespostaSessao>('trocar_senha', { corpo: { nova_senha, confirma_senha } });
  salvarSessao(r.token, r.usuario);
  return r;
}

/** Superadmin: escolhe o condominio de trabalho (null = visao SaaS geral). */
export async function selecionarCondominio(condominio_id: number | null): Promise<Usuario> {
  const r = await api<RespostaSessao>('selecionar_condominio', { corpo: { condominio_id } });
  salvarSessao(r.token, r.usuario);
  return r.usuario;
}
