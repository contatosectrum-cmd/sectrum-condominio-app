import { api } from './api';

export interface RespostaConsultaCpf {
  cpf: string;
  cpf_formatado: string;
  valido: boolean;
  matematico: boolean;
  confirmado_governo: boolean;
  regiao_fiscal: string;
  situacao_cadastral: string;
  nome_sugerido: string;
  origem_local?: string;
  data_nascimento?: string;
  fonte: 'receita_federal' | 'cache_receita' | 'cadastro_interno' | 'modulo11';
  provedor_configurado?: string;
  mensagem: string;
}

/** Remove qualquer caractere não numérico. */
export function limparCpf(valor: string | null | undefined): string {
  return (valor ?? '').replace(/\D/g, '').slice(0, 11);
}

/** Formata o CPF no padrão 000.000.000-00 enquanto digita. */
export function mascaraCpf(valor: string): string {
  const d = limparCpf(valor);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

/**
 * Valida matematicamente os 11 dígitos pelo algoritmo oficial da Receita Federal (Módulo 11).
 * Rejeita sequências de dígitos repetidos (000.000.000-00 a 999.999.999-99).
 */
export function validarCpfModulo11(cpf: string | null | undefined): boolean {
  const d = limparCpf(cpf);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;

  for (let t = 9; t < 11; t++) {
    let soma = 0;
    for (let c = 0; c < t; c++) {
      soma += Number(d[c]) * (t + 1 - c);
    }
    const resto = ((10 * soma) % 11) % 10;
    if (Number(d[t]) !== resto) return false;
  }
  return true;
}

/**
 * Retorna a Região Fiscal da Receita Federal correspondente ao 9º dígito do CPF.
 */
export function regiaoFiscalCpf(cpf: string | null | undefined): string {
  const d = limparCpf(cpf);
  if (d.length !== 11) return '';
  const digito = Number(d[8]);
  switch (digito) {
    case 1:
      return 'DF, GO, MS, MT, TO';
    case 2:
      return 'AC, AM, AP, PA, RO, RR';
    case 3:
      return 'CE, MA, PI';
    case 4:
      return 'AL, PB, PE, RN';
    case 5:
      return 'BA, SE';
    case 6:
      return 'MG';
    case 7:
      return 'ES, RJ';
    case 8:
      return 'SP';
    case 9:
      return 'PR, SC';
    case 0:
      return 'RS';
    default:
      return '';
  }
}

/** Consulta o CPF no backend (Módulo 11 + Cache + SERPRO/Receita Federal se configurado). */
export async function consultarCpfReceita(cpf: string, forcar = false): Promise<RespostaConsultaCpf> {
  return api<RespostaConsultaCpf>('consultar_cpf', {
    query: { cpf: limparCpf(cpf), forcar: forcar ? 1 : 0 },
  });
}
