// Constantes compartilhadas pela interface.

/**
 * Senha provisória de contas novas e do "redefinir senha" (troca obrigatória no 1º acesso).
 * Decisão de 13/10: o legado usava 'Muda@123'; no sistema novo passa a ser 'mudar@123'.
 * Mesmo valor de SENHA_PADRAO em backend/lib/auth.php.
 */
export const SENHA_PADRAO = 'mudar@123';
