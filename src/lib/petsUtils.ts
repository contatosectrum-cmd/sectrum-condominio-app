// Utilitários e tipagens do Módulo de Gestão Pet & Achados e Perdidos.
import { ehAppNativo, obterOrigemServidor } from './nativo';

export type EspeciePet = 'Cachorro' | 'Gato' | 'Ave' | 'Outro';
export type PortePet = 'Pequeno' | 'Médio' | 'Grande';
export type ComportamentoPet = 'Dócil' | 'Reativo com outros cães' | 'Arisco';
export type StatusPet = 'ativo' | 'perdido' | 'falecido' | 'mudou';
export type VacinaStatusPet = 'em_dia' | 'vencida' | 'nao_informada';

export interface PetItem {
  id: number;
  condominio_id: number;
  unidade_id: number;
  tutor_id: number;
  nome: string;
  especie: EspeciePet;
  raca: string | null;
  porte: PortePet;
  pelagem_cor: string;
  foto_url: string | null;
  data_nascimento: string | null;
  idade_estimada_meses: number | null;
  microchip: string | null;
  castrado: boolean;
  vacina_antirrabica_validade: string | null;
  vacina_status: VacinaStatusPet;
  comportamento: ComportamentoPet;
  usa_focinheira: boolean;
  somente_elevador_servico: boolean;
  observacoes: string | null;
  status: StatusPet;
  perdido_em: string | null;
  created_at: string | null;
  updated_at: string | null;
  bloco_id: number | null;
  bloco_nome: string | null;
  unidade_numero: string | null;
  unidade_label: string;
  tutor_nome: string;
  tutor_telefone: string | null;
}

export interface KpisCensoPet {
  total_ativos: number;
  total_perdidos: number;
  total_cachorros: number;
  total_gatos: number;
  total_aves: number;
  total_outros: number;
  vacinas_em_dia: number;
  vacinas_vencidas: number;
  vacinas_nao_informadas: number;
  unidades_com_pets: number;
}

export interface UnidadeCensoPet {
  unidade_id: number;
  bloco_nome: string;
  unidade_numero: string;
  tutor_principal: string | null;
  tutor_telefone: string | null;
  total_pets: number;
  cachorros: number;
  gatos: number;
  outros: number;
  vacinas_vencidas: number;
  vacinas_sem_data: number;
  resumo_animais: string;
}

export const ESPECIES_OPCOES: { valor: EspeciePet; rotulo: string; emoji: string }[] = [
  { valor: 'Cachorro', rotulo: 'Cachorro', emoji: '🐶' },
  { valor: 'Gato', rotulo: 'Gato', emoji: '🐱' },
  { valor: 'Ave', rotulo: 'Ave', emoji: '🦜' },
  { valor: 'Outro', rotulo: 'Outro', emoji: '🐾' },
];

export const PORTES_OPCOES: { valor: PortePet; rotulo: string; dica: string }[] = [
  { valor: 'Pequeno', rotulo: 'Pequeno', dica: 'Até 10 kg' },
  { valor: 'Médio', rotulo: 'Médio', dica: '10 a 25 kg' },
  { valor: 'Grande', rotulo: 'Grande', dica: 'Acima de 25 kg' },
];

export const COMPORTAMENTOS_OPCOES: ComportamentoPet[] = [
  'Dócil',
  'Reativo com outros cães',
  'Arisco',
];

export const SUGESTOES_CORES_PELAGEM = [
  'Caramelo',
  'Preto',
  'Branco',
  'Marrom / Chocolate',
  'Cinza',
  'Dourado',
  'Preto e Branco',
  'Rajado / Tigrado',
  'Tricolor',
];

/** Formata uma quantidade de meses em texto legível em português ("1 ano e 3 meses"). */
export function formatarMesesEmIdade(totalMeses: number, sufixoEstimado = false): string {
  const m = Math.max(0, Math.floor(totalMeses));
  if (m === 0) {
    return sufixoEstimado ? 'Menos de 1 mês (aprox.)' : 'Menos de 1 mês';
  }
  const anos = Math.floor(m / 12);
  const meses = m % 12;
  const partes: string[] = [];
  if (anos > 0) {
    partes.push(`${anos} ${anos === 1 ? 'ano' : 'anos'}`);
  }
  if (meses > 0) {
    partes.push(`${meses} ${meses === 1 ? 'mês' : 'meses'}`);
  }
  const base = partes.join(' e ');
  return sufixoEstimado ? `~${base} (aprox.)` : base;
}

/**
 * Calcula dinamicamente a idade legível a partir de `data_nascimento` (YYYY-MM-DD)
 * ou utiliza `idade_estimada_meses` quando a data exata não foi informada.
 */
export function calcularIdadeLegivelPet(
  dataNascimento?: string | null,
  idadeEstimadaMeses?: number | null,
): string {
  if (dataNascimento && /^\d{4}-\d{2}-\d{2}/.test(dataNascimento)) {
    const [anoStr, mesStr, diaStr] = dataNascimento.slice(0, 10).split('-');
    const nascAno = Number(anoStr);
    const nascMes = Number(mesStr) - 1;
    const nascDia = Number(diaStr);

    const hoje = new Date();
    let totalMeses = (hoje.getFullYear() - nascAno) * 12 + (hoje.getMonth() - nascMes);
    if (hoje.getDate() < nascDia) {
      totalMeses -= 1;
    }
    if (totalMeses < 0) totalMeses = 0;
    return formatarMesesEmIdade(totalMeses, false);
  }

  if (typeof idadeEstimadaMeses === 'number' && idadeEstimadaMeses >= 0) {
    return formatarMesesEmIdade(idadeEstimadaMeses, true);
  }

  return 'Idade não informada';
}

/** Formata data YYYY-MM-DD para DD/MM/AAAA sem problemas de fuso horário. */
export function formatarDataBr(iso?: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** Retorna informações visuais do badge da vacina antirrábica. */
export function infoVacinaAntirrabica(validade?: string | null): {
  status: VacinaStatusPet;
  rotulo: string;
  detalhe: string;
  classeBadge: string;
} {
  if (!validade || !/^\d{4}-\d{2}-\d{2}/.test(validade)) {
    return {
      status: 'nao_informada',
      rotulo: 'Vacina não informada',
      detalhe: 'Cadastre a validade da antirrábica',
      classeBadge: 'bg-amber-100 text-amber-800 border-amber-300',
    };
  }

  const hojeIso = new Date().toISOString().slice(0, 10);
  const dataBr = formatarDataBr(validade);

  if (validade >= hojeIso) {
    return {
      status: 'em_dia',
      rotulo: 'Vacina em dia',
      detalhe: `Válida até ${dataBr}`,
      classeBadge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    };
  }

  return {
    status: 'vencida',
    rotulo: 'Vacina vencida',
    detalhe: `Venceu em ${dataBr}`,
    classeBadge: 'bg-rose-100 text-rose-800 border-rose-300',
  };
}

/** Resolve a URL da foto do pet tanto na Web quanto no App Nativo Android/iOS (Capacitor). */
export function resolverUrlFotoPet(fotoUrl?: string | null): string | null {
  if (!fotoUrl) return null;
  const f = fotoUrl.trim();
  if (!f) return null;
  if (f.startsWith('data:') || f.startsWith('http://') || f.startsWith('https://') || f.startsWith('blob:')) {
    return f;
  }
  const caminho = f.startsWith('/') ? f : `/${f}`;
  if (ehAppNativo()) {
    return `${obterOrigemServidor()}${caminho}`;
  }
  return caminho;
}

/** Tempo decorrido legível desde que o pet foi reportado como perdido. */
export function tempoPerdidoLegivel(perdidoEm?: string | null): string {
  if (!perdidoEm) return 'Agora mesmo';
  const d = new Date(perdidoEm.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return perdidoEm;
  const diffMin = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  if (diffMin < 1) return 'Agora mesmo';
  if (diffMin < 60) return `Há ${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  if (h < 24) return m > 0 ? `Há ${h}h ${m}min` : `Há ${h}h`;
  const dias = Math.floor(h / 24);
  return `Há ${dias} dia${dias > 1 ? 's' : ''}`;
}

/** Monta link wa.me direto com mensagem contextualizada para acionar o tutor do pet. */
export function gerarLinkWhatsappTutor(pet: Pick<PetItem, 'tutor_telefone' | 'tutor_nome' | 'nome' | 'unidade_label' | 'status'>): string | null {
  const digitos = (pet.tutor_telefone ?? '').replace(/\D/g, '');
  if (digitos.length < 10) return null;
  const fone = digitos.startsWith('55') && digitos.length >= 12 ? digitos : `55${digitos}`;
  const msg = pet.status === 'perdido'
    ? `Olá ${pet.tutor_nome}, aqui é da Portaria do condomínio (${pet.unidade_label}). Temos informações sobre o alerta do seu pet *${pet.nome}*!`
    : `Olá ${pet.tutor_nome}, aqui é da Portaria do condomínio (${pet.unidade_label}). Entramos em contato referente ao pet *${pet.nome}*.`;
  return `https://wa.me/${fone}?text=${encodeURIComponent(msg)}`;
}

/** Emoji representativo da espécie do pet. */
export function emojiEspeciePet(especie: string): string {
  if (especie === 'Cachorro') return '🐶';
  if (especie === 'Gato') return '🐱';
  if (especie === 'Ave') return '🦜';
  return '🐾';
}
