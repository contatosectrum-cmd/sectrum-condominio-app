// Menu por perfil - espelho do src/views/layout.php do legado.
// A mesma tabela serve para montar o menu lateral e para proteger as rotas no frontend
// (a protecao definitiva e sempre a da API).
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Megaphone, Building2, Database, MonitorCheck, Package, UserCheck,
  ClipboardList, ScanSearch, Users, Car, Cpu, Video, FileText, ShieldAlert, Activity,
  ShieldCheck, UsersRound, Upload, Settings, Home, Phone, PhoneCall, Key, Bell, ScanFace,
  Calendar, Wrench, Vote, MessageSquare,
} from 'lucide-react';
import type { Perfil, Usuario } from './sessao';

export interface ItemMenu {
  nome: string;
  caminho: string;
  icone: LucideIcon;
  perfis: Perfil[];
  /** Somente superadmin (no legado: condominio_id === null). */
  apenasSuperadmin?: boolean;
  /** Exige condominio selecionado (superadmin precisa escolher antes). */
  exigeCondominio?: boolean;
  /** Titulo da barra superior, quando diferente do nome no menu. */
  titulo?: string;
  /** Tela acessada por link (nao aparece no menu). */
  oculto?: boolean;
}

export interface GrupoMenu {
  titulo: string;
  itens: ItemMenu[];
}

const GESTAO: Perfil[] = ['superadmin', 'admin', 'sindico'];
const OPERACAO: Perfil[] = ['superadmin', 'admin', 'sindico', 'portaria'];
const MORADOR: Perfil[] = ['morador'];

export const GRUPOS_MENU: GrupoMenu[] = [
  {
    // App do morador (legado: layout.php, grupo "Meu Apartamento"). Mesmo layout lateral da equipe.
    titulo: 'Meu Apartamento',
    itens: [
      { nome: 'Controle de Acesso', caminho: '/morador', icone: Home, perfis: MORADOR },
      { nome: 'Interfone Digital', caminho: '/morador/interfone', icone: PhoneCall, perfis: MORADOR, titulo: 'Interfone Digital' },
      { nome: 'Reserva de Espaços', caminho: '/morador/reservas', icone: Calendar, perfis: MORADOR, titulo: 'Reserva de Áreas Comuns & Lista da Festa' },
      { nome: 'Convites e Visitas', caminho: '/morador/convites', icone: Phone, perfis: MORADOR },
      { nome: 'Visitas Confirmadas', caminho: '/morador/visitantes', icone: UserCheck, perfis: MORADOR },
      { nome: 'Filhos / Dependentes', caminho: '/morador/dependentes', icone: UsersRound, perfis: MORADOR, titulo: 'Filhos e Dependentes Menores' },
      { nome: 'Funcionários do Apto', caminho: '/morador/funcionarios', icone: Users, perfis: MORADOR, titulo: 'Funcionários do Meu Apartamento' },
      { nome: 'Meus Veículos', caminho: '/morador/veiculos', icone: Car, perfis: MORADOR },
      { nome: 'Aluguel Temporada', caminho: '/morador/aluguel', icone: Key, perfis: MORADOR, titulo: 'Aluguel Temporada (Airbnb)' },
      { nome: 'Minhas Encomendas', caminho: '/morador/encomendas', icone: Package, perfis: MORADOR },
      { nome: 'Livro de Ocorrências', caminho: '/morador/ocorrencias', icone: Wrench, perfis: MORADOR, titulo: 'Livro Digital de Ocorrências & Chamados' },
      { nome: 'Enquetes / Votação', caminho: '/morador/enquetes', icone: Vote, perfis: MORADOR, titulo: 'Enquetes & Votação por Unidade' },
      { nome: 'Mural de Avisos', caminho: '/morador/avisos', icone: Bell, perfis: MORADOR },
      { nome: 'Registro Facial', caminho: '/morador/biometria', icone: ScanFace, perfis: MORADOR, oculto: true },
    ],
  },
  {
    titulo: 'Visão Geral',
    itens: [
      { nome: 'Dashboard', caminho: '/', icone: LayoutDashboard, perfis: GESTAO },
      { nome: 'WhatsApp & IA', caminho: '/whatsapp', icone: MessageSquare, perfis: ['superadmin'], apenasSuperadmin: true, titulo: 'Central WhatsApp Oficial (Meta Cloud API) & Assistente IA' },
      { nome: 'Mural de Avisos', caminho: '/avisos', icone: Megaphone, perfis: GESTAO, exigeCondominio: true },
      { nome: 'Reserva de Espaços', caminho: '/reservas', icone: Calendar, perfis: OPERACAO, exigeCondominio: true, titulo: 'Reserva de Áreas Comuns & Listas de Festa' },
      { nome: 'Livro de Ocorrências', caminho: '/ocorrencias', icone: Wrench, perfis: OPERACAO, exigeCondominio: true, titulo: 'Livro Digital de Ocorrências & Chamados' },
      { nome: 'Enquetes / Votação', caminho: '/enquetes', icone: Vote, perfis: GESTAO, exigeCondominio: true, titulo: 'Enquetes & Votação Oficial por Unidade' },
    ],
  },
  {
    titulo: 'Sectrum SaaS',
    itens: [
      { nome: 'Meus Clientes', caminho: '/condominios', icone: Building2, perfis: ['superadmin'], apenasSuperadmin: true },
      { nome: 'Cópia de Segurança', caminho: '/backup', icone: Database, perfis: ['superadmin'], apenasSuperadmin: true },
      // Extra do React (nao existe no menu do legado)
      { nome: 'Configurações', caminho: '/configuracoes', icone: Settings, perfis: ['superadmin'], apenasSuperadmin: true },
    ],
  },
  {
    titulo: 'Operação (Portaria)',
    itens: [
      { nome: 'Terminal de Portaria', caminho: '/portaria', icone: MonitorCheck, perfis: OPERACAO, exigeCondominio: true },
      { nome: 'Gestão de Encomendas', caminho: '/painel-portaria', icone: Package, perfis: OPERACAO, exigeCondominio: true },
      { nome: 'Convites / Visitantes', caminho: '/visitas', icone: UserCheck, perfis: OPERACAO, exigeCondominio: true },
      { nome: 'Pré-cadastros', caminho: '/precadastros', icone: ClipboardList, perfis: OPERACAO, exigeCondominio: true },
      { nome: 'Modo Ronda', caminho: '/consulta-placa', icone: ScanSearch, perfis: OPERACAO, exigeCondominio: true },
    ],
  },
  {
    titulo: 'Cadastros',
    itens: [
      { nome: 'Moradores', caminho: '/pessoas', icone: Users, perfis: GESTAO, exigeCondominio: true },
      { nome: 'Veículos', caminho: '/veiculos', icone: Car, perfis: GESTAO, exigeCondominio: true },
      { nome: 'Blocos & Unidades', caminho: '/estrutura', icone: Building2, perfis: GESTAO, exigeCondominio: true },
    ],
  },
  {
    titulo: 'Dispositivos',
    itens: [
      { nome: 'Terminais LPR/Facial', caminho: '/terminais', icone: Cpu, perfis: GESTAO, exigeCondominio: true },
      { nome: 'Câmeras de Segurança', caminho: '/cameras', icone: Video, perfis: GESTAO, exigeCondominio: true },
    ],
  },
  {
    titulo: 'Administração & Logs',
    itens: [
      { nome: 'Relatório de Acessos', caminho: '/acessos', icone: FileText, perfis: OPERACAO, exigeCondominio: true },
      { nome: 'Auditoria do Sistema', caminho: '/auditoria', icone: ShieldAlert, perfis: GESTAO },
      // Legado: so admin/sindico (o superadmin nao via este item por um bug da variavel $perfil)
      { nome: 'Diagnóstico de Erros', caminho: '/logs-sistema', icone: Activity, perfis: ['superadmin', 'admin', 'sindico'] },
      { nome: 'Usuários e Permissões', caminho: '/usuarios', icone: ShieldCheck, perfis: GESTAO },
      { nome: 'Grupos de Acesso', caminho: '/grupos-acesso', icone: UsersRound, perfis: GESTAO, exigeCondominio: true },
      { nome: 'Importação de Dados', caminho: '/pessoas/importar', icone: Upload, perfis: GESTAO, exigeCondominio: true },
    ],
  },
];

/** Ordem do menu da portaria no legado (grupo unico "Operação"). */
const ORDEM_PORTARIA = ['/portaria', '/painel-portaria', '/reservas', '/ocorrencias', '/visitas', '/consulta-placa', '/precadastros', '/acessos'];

export function podeVer(item: ItemMenu, u: Usuario): boolean {
  if (!item.perfis.includes(u.perfil)) return false;
  if (item.apenasSuperadmin && !u.superadmin) return false;
  if (u.condominio_id !== null) {
    if (item.caminho === '/morador/aluguel' && (u.permite_temporada === false || u.modulo_airbnb === false)) return false;
    if (item.caminho === '/morador/interfone' && u.modulo_interfone === false) return false;
    if ((item.caminho === '/reservas' || item.caminho === '/morador/reservas') && u.modulo_reservas === false) return false;
    if ((item.caminho === '/ocorrencias' || item.caminho === '/morador/ocorrencias') && u.modulo_ocorrencias === false) return false;
    if ((item.caminho === '/enquetes' || item.caminho === '/morador/enquetes') && u.modulo_enquetes === false) return false;
    if ((item.caminho === '/avisos' || item.caminho === '/morador/avisos') && u.modulo_avisos === false) return false;
    if ((item.caminho === '/painel-portaria' || item.caminho === '/encomendas' || item.caminho === '/morador/encomendas') && u.modulo_encomendas === false) return false;
  }
  return true;
}

/** Menu do usuario logado, ja filtrado por perfil e módulos contratados do condomínio. */
export function menuDoUsuario(u: Usuario): GrupoMenu[] {
  if (u.perfil === 'portaria') {
    const todos = GRUPOS_MENU.flatMap((g) => g.itens);
    const itens = ORDEM_PORTARIA
      .map((c) => todos.find((i) => i.caminho === c)!)
      .filter((i): i is ItemMenu => Boolean(i) && podeVer(i, u));
    return [{ titulo: 'Operação', itens }];
  }
  return GRUPOS_MENU.map((g) => ({ ...g, itens: g.itens.filter((i) => !i.oculto && podeVer(i, u)) })).filter((g) => g.itens.length > 0);
}

/** Item de menu correspondente a um caminho (para titulo e protecao de rota). */
export function itemDoCaminho(caminho: string): ItemMenu | undefined {
  return GRUPOS_MENU.flatMap((g) => g.itens).find((i) => i.caminho === caminho);
}

/** Pagina inicial por perfil (mesmo redirect do login legado). */
export function inicioDoPerfil(u: Usuario): string {
  if (u.primeiro_acesso === 1) return '/trocar-senha';
  if (u.perfil === 'morador') return '/morador';
  if (u.perfil === 'portaria') return '/portaria';
  return '/';
}
