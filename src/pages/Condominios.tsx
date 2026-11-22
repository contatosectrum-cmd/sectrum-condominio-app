import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, UserCog, Pencil, Power, LogIn, X, CheckCircle2, AlertTriangle,
  Sliders, PhoneCall, Calendar, Wrench, Vote, Megaphone, Key, Package, Video, Check, Siren, BellRing, MessageSquare, Bot, ScanFace, Trash2,
  Wallet, FileCheck2, Truck, ShieldCheck, Users,
} from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import { selecionarCondominio } from '../lib/useSessao';

// Paridade com src/views/condominios.php + Gestão Comercial de Módulos SaaS por Condomínio:
// O Super Admin pode habilitar/desabilitar individualmente cada módulo cobrado à parte.
interface Cliente {
  id: number;
  nome: string;
  cnpj: string | null;
  ativo: boolean;
  app_habilitado: number;
  portaria_autonoma: number;
  abrir_veiculo_sem_video?: number;
  abrir_pedestre_sem_video?: number;
  cameras_morador_ativo?: number;
  permite_temporada?: number;
  modulo_airbnb?: number;
  modulo_interfone?: number;
  modulo_reservas?: number;
  modulo_ocorrencias?: number;
  modulo_enquetes?: number;
  modulo_avisos?: number;
  modulo_encomendas?: number;
  modulo_emergencia?: number;
  emergencia_furar_nao_perturbe?: number;
  emergencia_somente_administracao?: number;
  whatsapp_auto_ativo?: number;
  whatsapp_ia_ativo?: number;
  whatsapp_chat_condominio?: number;
  modulo_seguranca_facial?: number;
  modulo_financeiro?: number;
  modulo_transparencia?: number;
  modulo_mudancas?: number;
  modulo_manutencoes?: number;
  plano_whatsapp_ia?: string;
  valor_mensal_plano_zap_brl?: number;
  tipo_portaria?: string;
  nome_sindico: string | null;
  email_sindico: string | null;
  total_usuarios: number;
  total_moradores?: number;
  total_unidades: number;
}

interface Form {
  id?: number;
  nome: string;
  cnpj: string;
  app_habilitado: boolean;
  portaria_autonoma: boolean;
  abrir_veiculo_sem_video: boolean;
  abrir_pedestre_sem_video: boolean;
  cameras_morador_ativo: boolean;
  permite_temporada: boolean;
  modulo_interfone: boolean;
  modulo_reservas: boolean;
  modulo_ocorrencias: boolean;
  modulo_enquetes: boolean;
  modulo_avisos: boolean;
  modulo_encomendas: boolean;
  modulo_emergencia: boolean;
  emergencia_furar_nao_perturbe: boolean;
  emergencia_somente_administracao: boolean;
  whatsapp_auto_ativo: boolean;
  whatsapp_ia_ativo: boolean;
  whatsapp_chat_condominio: boolean;
  modulo_seguranca_facial: boolean;
  modulo_financeiro: boolean;
  modulo_transparencia: boolean;
  modulo_mudancas: boolean;
  modulo_manutencoes: boolean;
  plano_whatsapp_ia: string;
  valor_mensal_plano_zap_brl: string;
  nome_sindico: string;
  email_sindico: string;
  senha_sindico: string;
}

type ChaveModulo =
  | 'modulo_financeiro'
  | 'modulo_transparencia'
  | 'modulo_mudancas'
  | 'modulo_manutencoes'
  | 'whatsapp_auto_ativo'
  | 'whatsapp_ia_ativo'
  | 'whatsapp_chat_condominio'
  | 'modulo_seguranca_facial'
  | 'modulo_emergencia'
  | 'emergencia_furar_nao_perturbe'
  | 'emergencia_somente_administracao'
  | 'modulo_interfone'
  | 'modulo_reservas'
  | 'modulo_ocorrencias'
  | 'modulo_enquetes'
  | 'modulo_avisos'
  | 'permite_temporada'
  | 'modulo_encomendas'
  | 'cameras_morador_ativo';

interface DefinicaoModulo {
  chave: ChaveModulo;
  titulo: string;
  curto: string;
  descricao: string;
  icone: typeof PhoneCall;
  corAtivo: string;
  badgeClasses: string;
}

const CATALOGO_MODULOS: DefinicaoModulo[] = [
  {
    chave: 'modulo_financeiro',
    titulo: 'ERP Financeiro, Rateio, Cobranças PIX & CND Automática',
    curto: '💳 ERP Financeiro & PIX',
    descricao: 'Lançamento de rateio em lote, geração de PIX Copia e Cola EMV, Contas a Pagar, envio de 2ª via no WhatsApp e Certidão Negativa (CND) em 1 clique no App do Morador.',
    icone: Wallet,
    corAtivo: 'border-emerald-600 bg-emerald-50/80 ring-emerald-600/20',
    badgeClasses: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  },
  {
    chave: 'modulo_transparencia',
    titulo: 'Portal da Transparência, Conselho Fiscal & Pasta Digital',
    curto: '📊 Transparência & Conselho',
    descricao: 'Balancete em tempo real, anexos de Notas Fiscais/Recibos, parecer digital do Conselho Fiscal, fechamento mensal e biblioteca de Atas, Convenção e Regimento.',
    icone: FileCheck2,
    corAtivo: 'border-indigo-600 bg-indigo-50/80 ring-indigo-600/20',
    badgeClasses: 'bg-indigo-100 text-indigo-900 border-indigo-300',
  },
  {
    chave: 'modulo_mudancas',
    titulo: 'Módulo Autorização Digital de Mudanças (Entrada / Saída)',
    curto: '🚚 Mudanças',
    descricao: 'Solicitação de mudança ou entrega de grande porte pelo morador, reserva de elevador de serviço, dados da transportadora e liberação na Portaria.',
    icone: Truck,
    corAtivo: 'border-cyan-600 bg-cyan-50/80 ring-cyan-600/20',
    badgeClasses: 'bg-cyan-100 text-cyan-900 border-cyan-300',
  },
  {
    chave: 'modulo_manutencoes',
    titulo: 'Módulo Manutenções Preventivas & Mandatos Legais (NBR 5674)',
    curto: '🛡️ Manutenções NBR',
    descricao: 'Controle de vencimentos obrigatórios (AVCB Bombeiros, SPDA Para-raios, Limpeza de Caixa d’Água, Dedetização, Elevadores e Seguro) com semáforo de alertas.',
    icone: ShieldCheck,
    corAtivo: 'border-orange-600 bg-orange-50/80 ring-orange-600/20',
    badgeClasses: 'bg-orange-100 text-orange-900 border-orange-300',
  },
  {
    chave: 'whatsapp_auto_ativo',
    titulo: 'API do WhatsApp (Mensagens Automáticas)',
    curto: '📲 API Zap Auto',
    descricao: 'Disparo automático via WhatsApp Oficial ao aprovar cadastro, chegada de encomendas na portaria e comunicados.',
    icone: MessageSquare,
    corAtivo: 'border-emerald-600 bg-emerald-50/80 ring-emerald-600/20',
    badgeClasses: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  {
    chave: 'whatsapp_ia_ativo',
    titulo: 'Atendimento Inteligente por IA 24h (WhatsApp)',
    curto: '🤖 IA 24h Zap',
    descricao: 'Agente de IA 24h no WhatsApp para tirar dúvidas de moradores, enviar ramal, orientar instalação do app e resetar senha.',
    icone: Bot,
    corAtivo: 'border-violet-600 bg-violet-50/80 ring-violet-600/20',
    badgeClasses: 'bg-violet-100 text-violet-800 border-violet-300',
  },
  {
    chave: 'whatsapp_chat_condominio',
    titulo: 'Chat do WhatsApp para o Condomínio Responder (Síndico / Admin)',
    curto: '💬 Chat Síndico',
    descricao: 'Libera o Chat do WhatsApp para a Administração/Síndico responder e vincular documentos SOMENTE dos moradores/pré-cadastros vinculados ao próprio condomínio.',
    icone: MessageSquare,
    corAtivo: 'border-teal-600 bg-teal-50/80 ring-teal-600/20',
    badgeClasses: 'bg-teal-100 text-teal-800 border-teal-300',
  },
  {
    chave: 'modulo_seguranca_facial',
    titulo: 'Segurança Facial IA (Selfie x Documento + Lista de Restrição)',
    curto: '🛡️ Segurança Facial IA',
    descricao: 'Compara a selfie com a foto do RG/CNH no pré-cadastro (GPU) e libera a Lista de Restrição gravada nos próprios leitores faciais, com tela de alarme para Portaria, Supervisor e Síndico.',
    icone: ScanFace,
    corAtivo: 'border-rose-700 bg-rose-50/80 ring-rose-700/20',
    badgeClasses: 'bg-rose-100 text-rose-900 border-rose-300',
  },
  {
    chave: 'modulo_emergencia',
    titulo: 'Botão de Emergência SOS (Médica & Pânico)',
    curto: '🚨 Botão SOS',
    descricao: 'Botão de socorro médico e segurança no App do Morador com alerta instantâneo para o Bloco, Portaria e Síndico.',
    icone: Siren,
    corAtivo: 'border-red-500 bg-red-50/70 ring-red-500/15',
    badgeClasses: 'bg-red-50 text-red-700 border-red-200',
  },
  {
    chave: 'emergencia_furar_nao_perturbe',
    titulo: 'Alarme Defesa Civil (Furar Não Perturbe)',
    curto: '🔊 Furar Não Perturbe',
    descricao: 'Aciona sirene padrão Defesa Civil (853Hz+960Hz) furando o modo Silencioso e o pacote Não Perturbe (iPhone e Android).',
    icone: BellRing,
    corAtivo: 'border-rose-600 bg-rose-50/80 ring-rose-600/20',
    badgeClasses: 'bg-rose-100 text-rose-800 border-rose-300',
  },
  {
    chave: 'emergencia_somente_administracao',
    titulo: 'Emergência: Avisar Somente Administração (Portaria, Síndico e Subsíndico)',
    curto: '🛡️ SOS Só Administração',
    descricao: 'Quando marcado, o Botão de Emergência avisa somente Portaria, Síndico e Subsíndico (sem disparar sirene para os demais moradores do bloco).',
    icone: Siren,
    corAtivo: 'border-amber-600 bg-amber-50/80 ring-amber-600/20',
    badgeClasses: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  {
    chave: 'modulo_interfone',
    titulo: 'Módulo Interfone Digital',
    curto: '📞 Interfone',
    descricao: 'Chamadas de vídeo da portaria para o celular, interfone entre apartamentos e transbordo.',
    icone: PhoneCall,
    corAtivo: 'border-emerald-500 bg-emerald-50/70 ring-emerald-500/15',
    badgeClasses: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    chave: 'modulo_reservas',
    titulo: 'Módulo Reserva de Espaços',
    curto: '📅 Reservas',
    descricao: 'Salão de festas, churrasqueira e quadra integrados à Lista de Convidados com convite facial.',
    icone: Calendar,
    corAtivo: 'border-blue-500 bg-blue-50/70 ring-blue-500/15',
    badgeClasses: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    chave: 'modulo_enquetes',
    titulo: 'Assembleias Digitais (AGO/AGE), Enquetes & Ata Automática',
    curto: '🗳️ Assembleias & Enquetes',
    descricao: 'Assembleias Virtuais ponderadas por Fração Ideal, trava opcional de inadimplência (Art. 1.335 CC), enquetes rápidas e geração de Ata Oficial com hash SHA-256.',
    icone: Vote,
    corAtivo: 'border-violet-500 bg-violet-50/70 ring-violet-500/15',
    badgeClasses: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  {
    chave: 'modulo_ocorrencias',
    titulo: 'Livro de Ocorrências, Chamados & Multas Regimentais',
    curto: '🛠️ Ocorrências & Multas',
    descricao: 'Chamados com foto pelo morador, SLA de atendimento, notificações de Advertência/Multa regimental e direito de defesa digital auditado.',
    icone: Wrench,
    corAtivo: 'border-amber-500 bg-amber-50/70 ring-amber-500/15',
    badgeClasses: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  {
    chave: 'modulo_avisos',
    titulo: 'Módulo Mural de Avisos',
    curto: '📢 Avisos',
    descricao: 'Comunicados oficiais da administração/síndico direto no aplicativo dos moradores.',
    icone: Megaphone,
    corAtivo: 'border-sky-500 bg-sky-50/70 ring-sky-500/15',
    badgeClasses: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  {
    chave: 'permite_temporada',
    titulo: 'Módulo Airbnb / Temporada',
    curto: '🔑 Airbnb',
    descricao: 'Autorização de locação por temporada com link de check-in facial automático para hóspedes.',
    icone: Key,
    corAtivo: 'border-rose-500 bg-rose-50/70 ring-rose-500/15',
    badgeClasses: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  {
    chave: 'modulo_encomendas',
    titulo: 'Módulo Gestão de Encomendas',
    curto: '📦 Encomendas',
    descricao: 'Registro de pacotes na portaria, previsão de entregas pelo morador e baixa de retirada.',
    icone: Package,
    corAtivo: 'border-teal-500 bg-teal-50/70 ring-teal-500/15',
    badgeClasses: 'bg-teal-50 text-teal-700 border-teal-200',
  },
  {
    chave: 'cameras_morador_ativo',
    titulo: 'Módulo Câmeras no App',
    curto: '📹 Câmeras App',
    descricao: 'Exibe as câmeras selecionadas do condomínio ao vivo na tela inicial do App do Morador.',
    icone: Video,
    corAtivo: 'border-indigo-500 bg-indigo-50/70 ring-indigo-500/15',
    badgeClasses: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
];

const VAZIO: Form = {
  nome: '',
  cnpj: '',
  app_habilitado: true,
  portaria_autonoma: false,
  abrir_veiculo_sem_video: false,
  abrir_pedestre_sem_video: false,
  cameras_morador_ativo: false,
  permite_temporada: true,
  modulo_interfone: true,
  modulo_reservas: true,
  modulo_ocorrencias: true,
  modulo_enquetes: true,
  modulo_avisos: true,
  modulo_encomendas: true,
  modulo_emergencia: true,
  emergencia_furar_nao_perturbe: true,
  emergencia_somente_administracao: false,
  whatsapp_auto_ativo: true,
  whatsapp_ia_ativo: true,
  whatsapp_chat_condominio: false,
  modulo_seguranca_facial: false,
  modulo_financeiro: false,
  modulo_transparencia: false,
  modulo_mudancas: false,
  modulo_manutencoes: false,
  plano_whatsapp_ia: 'sob_demanda',
  valor_mensal_plano_zap_brl: '0.00',
  nome_sindico: '',
  email_sindico: '',
  senha_sindico: '',
};

const campo = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 text-sm';
const rotulo = 'block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5';

function clienteParaForm(c: Cliente): Form {
  const remota = Number(c.portaria_autonoma ?? 0) === 1 || c.tipo_portaria === 'remota';
  return {
    id: c.id,
    nome: c.nome,
    cnpj: c.cnpj ?? '',
    app_habilitado: Number(c.app_habilitado ?? 1) === 1,
    portaria_autonoma: remota,
    abrir_veiculo_sem_video: Number(c.abrir_veiculo_sem_video ?? 0) === 1,
    abrir_pedestre_sem_video: Number(c.abrir_pedestre_sem_video ?? 0) === 1,
    cameras_morador_ativo: Number(c.cameras_morador_ativo ?? 0) === 1,
    permite_temporada: Number(c.permite_temporada ?? c.modulo_airbnb ?? 1) === 1,
    modulo_interfone: Number(c.modulo_interfone ?? 1) === 1,
    modulo_reservas: Number(c.modulo_reservas ?? 1) === 1,
    modulo_ocorrencias: Number(c.modulo_ocorrencias ?? 1) === 1,
    modulo_enquetes: Number(c.modulo_enquetes ?? 1) === 1,
    modulo_avisos: Number(c.modulo_avisos ?? 1) === 1,
    modulo_encomendas: Number(c.modulo_encomendas ?? 1) === 1,
    modulo_emergencia: Number(c.modulo_emergencia ?? 1) === 1,
    emergencia_furar_nao_perturbe: Number(c.emergencia_furar_nao_perturbe ?? 1) === 1,
    emergencia_somente_administracao: Number(c.emergencia_somente_administracao ?? 0) === 1,
    whatsapp_auto_ativo: Number(c.whatsapp_auto_ativo ?? 1) === 1,
    whatsapp_ia_ativo: Number(c.whatsapp_ia_ativo ?? 1) === 1,
    whatsapp_chat_condominio: Number(c.whatsapp_chat_condominio ?? 0) === 1,
    modulo_seguranca_facial: Number(c.modulo_seguranca_facial ?? 0) === 1,
    modulo_financeiro: Number(c.modulo_financeiro ?? 0) === 1,
    modulo_transparencia: Number(c.modulo_transparencia ?? 0) === 1,
    modulo_mudancas: Number(c.modulo_mudancas ?? 0) === 1,
    modulo_manutencoes: Number(c.modulo_manutencoes ?? 0) === 1,
    plano_whatsapp_ia: c.plano_whatsapp_ia || 'sob_demanda',
    valor_mensal_plano_zap_brl: Number(c.valor_mensal_plano_zap_brl ?? 0).toFixed(2),
    nome_sindico: c.nome_sindico ?? '',
    email_sindico: c.email_sindico ?? '',
    senha_sindico: '',
  };
}

function SeletorModulosComerciais({
  f,
  set,
}: {
  f: Form;
  set: (novo: Form) => void;
}) {
  const totalAtivos = CATALOGO_MODULOS.filter((m) => Boolean(f[m.chave])).length;

  const marcarTodos = (valor: boolean) => {
    set({
      ...f,
      whatsapp_auto_ativo: valor,
      whatsapp_ia_ativo: valor,
      whatsapp_chat_condominio: valor,
      plano_whatsapp_ia: valor ? 'sob_demanda' : 'desativado',
      modulo_emergencia: valor,
      emergencia_furar_nao_perturbe: valor,
      modulo_interfone: valor,
      modulo_reservas: valor,
      modulo_ocorrencias: valor,
      modulo_enquetes: valor,
      modulo_avisos: valor,
      permite_temporada: valor,
      modulo_encomendas: valor,
      cameras_morador_ativo: valor,
      modulo_seguranca_facial: valor,
      modulo_financeiro: valor,
      modulo_transparencia: valor,
      modulo_mudancas: valor,
      modulo_manutencoes: valor,
    });
  };

  const selecionarPlanoComercialZap = (plano: string) => {
    if (plano === 'desativado') {
      set({ ...f, plano_whatsapp_ia: plano, whatsapp_auto_ativo: false, whatsapp_ia_ativo: false, valor_mensal_plano_zap_brl: '0.00' });
    } else if (plano === 'notificacoes') {
      set({ ...f, plano_whatsapp_ia: plano, whatsapp_auto_ativo: true, whatsapp_ia_ativo: false, valor_mensal_plano_zap_brl: '149.00' });
    } else if (plano === 'ia_essencial') {
      set({ ...f, plano_whatsapp_ia: plano, whatsapp_auto_ativo: true, whatsapp_ia_ativo: true, valor_mensal_plano_zap_brl: '299.00' });
    } else if (plano === 'ia_ilimitado') {
      set({ ...f, plano_whatsapp_ia: plano, whatsapp_auto_ativo: true, whatsapp_ia_ativo: true, valor_mensal_plano_zap_brl: '499.00' });
    } else {
      set({ ...f, plano_whatsapp_ia: 'sob_demanda', whatsapp_auto_ativo: true, whatsapp_ia_ativo: true, valor_mensal_plano_zap_brl: '0.00' });
    }
  };

  return (
    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <div className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
            <Sliders size={17} className="text-blue-600" />
            Módulos Contratados pelo Condomínio ({totalAtivos}/{CATALOGO_MODULOS.length} ativos)
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Ative ou desative cada módulo vendido separadamente. Módulos desmarcados ficam ocultos para o Síndico, Portaria e Moradores deste condomínio.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => marcarTodos(true)}
            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 cursor-pointer"
          >
            Liberar Todos
          </button>
          <button
            type="button"
            onClick={() => marcarTodos(false)}
            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 cursor-pointer"
          >
            Apenas Controle de Acesso
          </button>
        </div>
      </div>

      <div className="mb-3.5 p-3.5 rounded-xl bg-white border border-emerald-200 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="text-xs font-extrabold text-emerald-900 flex items-center gap-1.5">
            <MessageSquare size={15} className="text-emerald-600" />
            Plano Comercial de WhatsApp &amp; IA deste Condomínio
          </div>
          <span className="text-[11px] font-semibold text-slate-500">
            Define como a API Oficial da Meta e a IA 24h são tarifadas para este cliente
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="sm:col-span-2">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Modelo / Plano Contratado</label>
            <select
              value={f.plano_whatsapp_ia}
              onChange={(e) => selecionarPlanoComercialZap(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-emerald-500"
            >
              <option value="sob_demanda">📊 Sob Demanda — Por Atendimento / Notificação + Margem %</option>
              <option value="notificacoes">📲 Plano Start — Só API de Notificações Automáticas (Sem IA)</option>
              <option value="ia_essencial">🤖 Plano Smart — API WhatsApp + Atendimento IA 24h (Franquia 150 atend.)</option>
              <option value="ia_ilimitado">🚀 Plano Enterprise — API WhatsApp + IA 24h Total (Franquia 500 atend.)</option>
              <option value="desativado">🚫 Desativado — Sem API WhatsApp nem IA</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Mensalidade Fixa Zap/IA (R$)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={f.valor_mensal_plano_zap_brl}
              onChange={(e) => set({ ...f, valor_mensal_plano_zap_brl: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-emerald-500"
              placeholder="0.00"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {CATALOGO_MODULOS.map((m) => {
          const Icone = m.icone;
          const ativo = Boolean(f[m.chave]);
          return (
            <label
              key={m.chave}
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition select-none ${
                ativo
                  ? `${m.corAtivo} ring-2`
                  : 'bg-white border-slate-200 opacity-75 hover:opacity-100'
              }`}
            >
              <input
                type="checkbox"
                className="mt-1 w-4 h-4 accent-blue-600 shrink-0"
                checked={ativo}
                onChange={(e) => set({ ...f, [m.chave]: e.target.checked })}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-extrabold text-slate-800 flex items-center gap-1.5">
                    <Icone size={15} className={ativo ? 'text-blue-600' : 'text-slate-400'} />
                    {m.titulo}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                      ativo
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {ativo ? 'Habilitado' : 'Inativo'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">{m.descricao}</p>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function CamposCondominio({ f, set, edicao }: { f: Form; set: (f: Form) => void; edicao: boolean }) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={rotulo}>Nome do Condomínio / Residencial *</label>
          <input required className={campo} placeholder="Ex: Residencial Eco Urbanismo" value={f.nome} onChange={(e) => set({ ...f, nome: e.target.value })} />
        </div>
        <div>
          <label className={rotulo}>CNPJ (Opcional)</label>
          <input className={campo} placeholder="00.000.000/0000-00" value={f.cnpj} onChange={(e) => set({ ...f, cnpj: e.target.value })} />
        </div>
      </div>

      <div className="mt-4">
        <label className={rotulo}>Modo de Operação da Portaria (Abertura pelo App do Morador) *</label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${!f.portaria_autonoma ? 'bg-emerald-50/70 border-emerald-500 ring-2 ring-emerald-500/15' : 'bg-slate-50 border-slate-200'}`}>
            <input type="radio" name="modo_portaria" className="mt-1" checked={!f.portaria_autonoma} onChange={() => set({ ...f, portaria_autonoma: false })} />
            <div>
              <div className="text-sm font-bold text-slate-800">🏢 Portaria Humana (Presencial)</div>
              <div className="text-xs text-slate-500 mt-0.5">Pelo celular, o morador abre apenas a porta do próprio Bloco (portões de Pedestre/Veículo só se liberados na ficha dele).</div>
            </div>
          </label>
          <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${f.portaria_autonoma ? 'bg-indigo-50/70 border-indigo-500 ring-2 ring-indigo-500/15' : 'bg-slate-50 border-slate-200'}`}>
            <input type="radio" name="modo_portaria" className="mt-1" checked={f.portaria_autonoma} onChange={() => set({ ...f, portaria_autonoma: true })} />
            <div>
              <div className="text-sm font-bold text-slate-800">🤖 Portaria Remota (Autônoma)</div>
              <div className="text-xs text-slate-500 mt-0.5">Pelo celular, todos os moradores abrem a porta do próprio Bloco + os portões gerais de Entrada (Pedestre e Veículo).</div>
            </div>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${f.abrir_veiculo_sem_video ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/15' : 'bg-slate-50 border-slate-200'}`}>
            <input
              type="checkbox"
              className="mt-1 w-4 h-4 accent-blue-600"
              checked={f.abrir_veiculo_sem_video}
              onChange={(e) => set({ ...f, abrir_veiculo_sem_video: e.target.checked })}
            />
            <div>
              <div className="text-sm font-bold text-slate-800">🚗 Portão de Veículos: Abrir Sem Vídeo (Direto)</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {f.abrir_veiculo_sem_video
                  ? 'Ativo: Abre o portão de veículos direto em 1 toque sem abrir vídeo nem áudio.'
                  : 'Desmarcado: Abre primeiro o vídeo/interfone para confirmar antes de liberar.'}
              </div>
            </div>
          </label>
          <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${f.abrir_pedestre_sem_video ? 'bg-emerald-50/80 border-emerald-500 ring-2 ring-emerald-500/15' : 'bg-slate-50 border-slate-200'}`}>
            <input
              type="checkbox"
              className="mt-1 w-4 h-4 accent-emerald-600"
              checked={f.abrir_pedestre_sem_video}
              onChange={(e) => set({ ...f, abrir_pedestre_sem_video: e.target.checked })}
            />
            <div>
              <div className="text-sm font-bold text-slate-800">🚶 Portão de Pedestre: Abrir Sem Vídeo (Direto)</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {f.abrir_pedestre_sem_video
                  ? 'Ativo: Abre o portão de pedestre direto em 1 toque (ideal p/ internet instável).'
                  : 'Desmarcado: Abre primeiro o vídeo/interfone para confirmar antes de liberar.'}
              </div>
            </div>
          </label>
        </div>
      </div>

      <label className="flex items-center gap-2 mt-4 font-semibold text-slate-700 cursor-pointer">
        <input type="checkbox" className="w-5 h-5" checked={f.app_habilitado} onChange={(e) => set({ ...f, app_habilitado: e.target.checked })} />
        Habilitar Acesso Geral ao App para Moradores
      </label>
      <p className="text-xs text-slate-500 ml-7 mt-1">Se desmarcado, os moradores não usam o App (apenas controle de acesso facial). Ao aprovar o cadastro, o WhatsApp notificará apenas que o cadastro foi aprovado e que o morador já pode testar a face nos leitores da portaria.</p>

      {/* PAINEL DE MÓDULOS COMERCIAIS CONTRATADOS */}
      <SeletorModulosComerciais f={f} set={set} />

      <hr className="my-5 border-slate-200" />
      <div className="flex items-center gap-2 text-slate-600 font-semibold text-sm mb-3">
        <UserCog size={18} /> {edicao ? 'Dados do Síndico Principal' : 'Acesso Administrativo (Síndico / Gestor)'}
      </div>
      <div className={`grid grid-cols-1 ${edicao ? 'md:grid-cols-3' : 'md:grid-cols-3'} gap-4`}>
        <div>
          <label className={rotulo}>Nome do Síndico {edicao ? '' : '*'}</label>
          <input required={!edicao} className={campo} placeholder="Ex: João Silva" value={f.nome_sindico} onChange={(e) => set({ ...f, nome_sindico: e.target.value })} />
        </div>
        <div>
          <label className={rotulo}>E-mail de Acesso {edicao ? '' : '*'}</label>
          <input required={!edicao} type="text" className={campo} placeholder="sindico@condominio.com" value={f.email_sindico} onChange={(e) => set({ ...f, email_sindico: e.target.value })} />
        </div>
        <div>
          <label className={rotulo}>{edicao ? 'Nova Senha (em branco = manter)' : 'Senha Inicial *'}</label>
          <input required={!edicao} type="password" autoComplete="new-password" className={campo} placeholder="••••••••" value={f.senha_sindico} onChange={(e) => set({ ...f, senha_sindico: e.target.value })} />
        </div>
      </div>
    </>
  );
}

export default function Condominios() {
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [novo, setNovo] = useState<Form>(VAZIO);
  const [edicao, setEdicao] = useState<Form | null>(null);
  const [modalModulos, setModalModulos] = useState<Form | null>(null);
  const [modalExclusao, setModalExclusao] = useState<Cliente | null>(null);
  const [confirmacaoNome, setConfirmacaoNome] = useState('');
  const [excluindo, setExcluindo] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const navigate = useNavigate();

  const carregar = () =>
    api<{ condominios: Cliente[] }>('listar_condominios')
      .then((r) => setClientes(r.condominios))
      .catch((e) => setAviso({ tipo: 'erro', msg: e instanceof ErroApi ? e.message : 'Erro ao carregar.' }));

  useEffect(() => {
    carregar();
  }, []);

  const salvar = async (f: Form, aoConcluir: () => void) => {
    setSalvando(true);
    setAviso(null);
    try {
      const r = await api<{ mensagem: string }>('salvar_condominio', {
        corpo: {
          ...f,
          modulo_airbnb: f.permite_temporada,
        },
      });
      setAviso({ tipo: 'ok', msg: r.mensagem });
      aoConcluir();
      carregar();
    } catch (e) {
      setAviso({ tipo: 'erro', msg: e instanceof ErroApi ? e.message : 'Erro ao salvar.' });
    } finally {
      setSalvando(false);
    }
  };

  const salvarApenasModulos = async (f: Form) => {
    if (!f.id) return;
    setSalvando(true);
    setAviso(null);
    try {
      const r = await api<{ mensagem: string }>('salvar_modulos_condominio', {
        corpo: {
          id: f.id,
          app_habilitado: f.app_habilitado,
          cameras_morador_ativo: f.cameras_morador_ativo,
          permite_temporada: f.permite_temporada,
          modulo_airbnb: f.permite_temporada,
          modulo_interfone: f.modulo_interfone,
          modulo_reservas: f.modulo_reservas,
          modulo_ocorrencias: f.modulo_ocorrencias,
          modulo_enquetes: f.modulo_enquetes,
          modulo_avisos: f.modulo_avisos,
          modulo_encomendas: f.modulo_encomendas,
          modulo_emergencia: f.modulo_emergencia,
          emergencia_furar_nao_perturbe: f.emergencia_furar_nao_perturbe,
          emergencia_somente_administracao: f.emergencia_somente_administracao,
          whatsapp_auto_ativo: f.whatsapp_auto_ativo,
          whatsapp_ia_ativo: f.whatsapp_ia_ativo,
          whatsapp_chat_condominio: f.whatsapp_chat_condominio,
          modulo_seguranca_facial: f.modulo_seguranca_facial,
          modulo_financeiro: f.modulo_financeiro,
          modulo_transparencia: f.modulo_transparencia,
          modulo_mudancas: f.modulo_mudancas,
          modulo_manutencoes: f.modulo_manutencoes,
          plano_whatsapp_ia: f.plano_whatsapp_ia,
          valor_mensal_plano_zap_brl: f.valor_mensal_plano_zap_brl,
        },
      });
      setAviso({ tipo: 'ok', msg: r.mensagem });
      setModalModulos(null);
      carregar();
    } catch (e) {
      setAviso({ tipo: 'erro', msg: e instanceof ErroApi ? e.message : 'Erro ao salvar módulos.' });
    } finally {
      setSalvando(false);
    }
  };

  const alternarStatus = async (c: Cliente) => {
    if (!confirm('Alterar status deste cliente no sistema SaaS?')) return;
    try {
      const r = await api<{ mensagem: string }>('alternar_status_condominio', { corpo: { id: c.id } });
      setAviso({ tipo: 'ok', msg: r.mensagem });
      carregar();
    } catch (e) {
      setAviso({ tipo: 'erro', msg: e instanceof ErroApi ? e.message : 'Erro.' });
    }
  };

  const alternarApp = async (c: Cliente) => {
    const ativoAtual = Number(c.app_habilitado ?? 1) === 1;
    const msgConfirm = ativoAtual
      ? `Desabilitar o App para os moradores de "${c.nome}"?\n\nNesse modo, o sistema enviará no WhatsApp apenas a confirmação de que o cadastro foi aprovado e que o morador já pode testar a face no controle de acesso.`
      : `Habilitar o App para os moradores de "${c.nome}"?`;
    if (!confirm(msgConfirm)) return;
    try {
      const r = await api<{ mensagem: string }>('alternar_app_condominio', { corpo: { id: c.id } });
      setAviso({ tipo: 'ok', msg: r.mensagem });
      carregar();
    } catch (e) {
      setAviso({ tipo: 'erro', msg: e instanceof ErroApi ? e.message : 'Erro ao alterar App.' });
    }
  };

  const acessar = async (c: Cliente) => {
    await selecionarCondominio(c.id);
    navigate('/');
  };

  const abrirModalExclusao = (c: Cliente) => {
    setModalExclusao(c);
    setConfirmacaoNome('');
  };

  const confirmarExclusaoCondominio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalExclusao) return;
    setExcluindo(true);
    setAviso(null);
    try {
      const r = await api<{ mensagem: string; resetar_sessao_condominio?: boolean }>('excluir_condominio', {
        corpo: {
          id: modalExclusao.id,
          confirmacao_nome: confirmacaoNome,
        },
      });
      if (r.resetar_sessao_condominio) {
        await selecionarCondominio(null).catch(() => {});
      }
      setAviso({ tipo: 'ok', msg: r.mensagem });
      setModalExclusao(null);
      setConfirmacaoNome('');
      carregar();
    } catch (err) {
      setAviso({ tipo: 'erro', msg: err instanceof ErroApi ? err.message : 'Erro ao excluir condomínio.' });
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8 space-y-6">
      {aviso && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm border-l-4 ${aviso.tipo === 'ok' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-rose-50 border-rose-500 text-rose-800'}`}>
          {aviso.tipo === 'ok' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />} {aviso.msg}
        </div>
      )}

      {/* RESUMO GERAL DE CADASTROS DO SISTEMA SAAS */}
      {clientes && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-200 border-l-4 border-l-emerald-500 shadow-xs flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600 shrink-0"><Users size={24} /></div>
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Total de Pessoas no Sistema</div>
              <div className="text-2xl font-extrabold text-slate-900 leading-tight">
                {clientes.reduce((s, c) => s + Number(c.total_moradores ?? c.total_usuarios ?? 0), 0).toLocaleString('pt-BR')}
              </div>
              <div className="text-[11px] text-slate-500 font-semibold">Moradores / pessoas ativas cadastradas</div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-slate-200 border-l-4 border-l-blue-500 shadow-xs flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600 shrink-0"><Building2 size={24} /></div>
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Total de Unidades</div>
              <div className="text-2xl font-extrabold text-slate-900 leading-tight">
                {clientes.reduce((s, c) => s + Number(c.total_unidades ?? 0), 0).toLocaleString('pt-BR')}
              </div>
              <div className="text-[11px] text-slate-500 font-semibold">Apartamentos / lotes em todos os clientes</div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-slate-200 border-l-4 border-l-indigo-500 shadow-xs flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600 shrink-0"><CheckCircle2 size={24} /></div>
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Condomínios Ativos</div>
              <div className="text-2xl font-extrabold text-slate-900 leading-tight">
                {clientes.filter((c) => c.ativo).length} <span className="text-sm font-bold text-slate-400">/ {clientes.length}</span>
              </div>
              <div className="text-[11px] text-slate-500 font-semibold">Carteira ativa no Sectrum SaaS</div>
            </div>
          </div>
        </div>
      )}

      {/* CADASTRO NOVO */}
      <form
        onSubmit={(e) => { e.preventDefault(); salvar(novo, () => setNovo(VAZIO)); }}
        className="bg-white rounded-2xl p-6 border border-slate-200 border-t-4 border-t-blue-600 shadow-sm"
      >
        <h2 className="text-lg font-bold text-blue-700 mb-5 flex items-center gap-2"><Building2 size={20} /> Cadastrar Novo Condomínio (Cliente)</h2>
        <CamposCondominio f={novo} set={setNovo} edicao={false} />
        <button disabled={salvando} className="mt-5 bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-lg disabled:opacity-60 cursor-pointer">
          Salvar Cliente e Gerar Acesso
        </button>
      </form>

      {/* CARTEIRA DE CLIENTES */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Carteira de Clientes Ativos no SaaS</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
                <th className="py-3 pr-3">ID</th>
                <th className="py-3 pr-3">Nome do Condomínio</th>
                <th className="py-3 pr-3">Portaria</th>
                <th className="py-3 pr-3">Módulos Contratados</th>
                <th className="py-3 pr-3">Síndico Principal</th>
                <th className="py-3 pr-3">Unidades / Pessoas</th>
                <th className="py-3 pr-3">App Morador</th>
                <th className="py-3 pr-3">Status SaaS</th>
                <th className="py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {clientes?.map((c) => {
                const remota = Number(c.portaria_autonoma ?? 0) === 1 || c.tipo_portaria === 'remota';
                const fCliente = clienteParaForm(c);
                const modulosAtivos = CATALOGO_MODULOS.filter((m) => Boolean(fCliente[m.chave]));
                return (
                <tr key={c.id} className="border-b border-slate-50 last:border-0 align-top">
                  <td className="py-3 pr-3 text-slate-500">#{c.id}</td>
                  <td className="py-3 pr-3 font-bold text-slate-800">
                    {c.nome}
                    <div className="text-xs font-normal text-slate-400">{c.cnpj || 'Sem CNPJ'}</div>
                  </td>
                  <td className="py-3 pr-3">
                    {remota
                      ? <span className="px-2 py-1 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">🤖 Remota</span>
                      : <span className="px-2 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">🏢 Humana</span>}
                  </td>
                  <td className="py-3 pr-3 max-w-[300px]">
                    <div className="flex flex-wrap gap-1">
                      {modulosAtivos.map((m) => (
                        <span
                          key={m.chave}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${m.badgeClasses}`}
                          title={m.titulo}
                        >
                          {m.curto}
                        </span>
                      ))}
                      {modulosAtivos.length === 0 && (
                        <span className="text-xs text-slate-400 italic">Apenas Controle de Acesso</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setModalModulos(fCliente)}
                      className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                    >
                      <Sliders size={12} /> Configurar módulos ({modulosAtivos.length}/{CATALOGO_MODULOS.length})
                    </button>
                  </td>
                  <td className="py-3 pr-3 text-slate-600">{c.nome_sindico || 'Sem cadastro'}<div className="text-xs text-slate-400">{c.email_sindico}</div></td>
                  <td className="py-3 pr-3">
                    <div className="flex flex-col gap-1">
                      <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-md text-xs font-extrabold w-fit" title="Total de moradores / pessoas ativas neste condomínio">
                        👥 {(c.total_moradores ?? c.total_usuarios).toLocaleString('pt-BR')} pessoa(s)
                      </span>
                      <span className="text-xs font-semibold text-slate-500 px-1" title={`${c.total_usuarios} contas totais (incluindo síndico/portaria)`}>
                        🏢 {c.total_unidades.toLocaleString('pt-BR')} unid.
                      </span>
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    <button
                      type="button"
                      onClick={() => alternarApp(c)}
                      title="Clique para habilitar ou desabilitar o App para moradores deste condomínio"
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border transition cursor-pointer ${
                        c.app_habilitado
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                      }`}
                    >
                      {c.app_habilitado ? '📱 Liberado' : '🚫 Só Facial (Sem App)'}
                    </button>
                  </td>
                  <td className="py-3 pr-3">
                    {c.ativo
                      ? <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">🟢 Ativo</span>
                      : <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">🔴 Suspenso</span>}
                  </td>
                  <td className="py-3">
                    <div className="flex gap-1.5 flex-wrap">
                      <button onClick={() => acessar(c)} className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"><LogIn size={14} /> Acessar</button>
                      <button
                        onClick={() => setModalModulos(fCliente)}
                        className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 cursor-pointer"
                        title="Habilitar ou desabilitar módulos comerciais deste condomínio"
                      ><Sliders size={14} /> Módulos</button>
                      <button
                        onClick={() => setEdicao(fCliente)}
                        className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                      ><Pencil size={14} /> Editar</button>
                      <button onClick={() => alternarStatus(c)} className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg cursor-pointer ${c.ativo ? 'bg-rose-50 text-rose-700 hover:bg-rose-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
                        <Power size={14} /> {c.ativo ? 'Suspender SaaS' : 'Reativar SaaS'}
                      </button>
                      <button
                        type="button"
                        onClick={() => abrirModalExclusao(c)}
                        title="Excluir permanentemente este cliente/condomínio do sistema"
                        className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-red-600/10 text-red-700 border border-red-200 hover:bg-red-600 hover:text-white transition cursor-pointer"
                      >
                        <Trash2 size={14} /> Excluir
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
              {clientes && clientes.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-slate-400">Nenhum condomínio cadastrado ainda.</td></tr>}
              {!clientes && <tr><td colSpan={9} className="py-10 text-center text-slate-400">Carregando...</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL RÁPIDO DE MÓDULOS COMERCIAIS */}
      {modalModulos && (
        <div className="fixed inset-0 bg-slate-900/55 z-50 flex items-center justify-center p-4" onClick={() => setModalModulos(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl p-6 w-full max-w-3xl border-t-4 border-t-indigo-600 shadow-2xl max-h-[92vh] overflow-y-auto"
          >
            <div className="flex justify-between items-start gap-3 mb-2">
              <div>
                <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
                  <Sliders size={20} className="text-indigo-600" />
                  Módulos Contratados — {modalModulos.nome}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ligue ou desligue cada módulo comercial para este condomínio. As alterações entram em vigor imediatamente no Painel do Síndico, Portaria e App dos Moradores.
                </p>
              </div>
              <button type="button" onClick={() => setModalModulos(null)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"><X size={20} /></button>
            </div>

            <label className="flex items-center gap-2 mt-3 font-semibold text-slate-700 cursor-pointer bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
              <input
                type="checkbox"
                className="w-5 h-5 accent-emerald-600"
                checked={modalModulos.app_habilitado}
                onChange={(e) => setModalModulos({ ...modalModulos, app_habilitado: e.target.checked })}
              />
              <div>
                <div className="text-sm font-bold text-slate-800">📱 Habilitar Acesso ao App para Moradores</div>
                <div className="text-xs font-normal text-slate-500">Se desmarcado, o condomínio funciona apenas por Reconhecimento Facial e o WhatsApp notificará apenas a aprovação do cadastro para testar a face no controle de acesso.</div>
              </div>
            </label>

            <SeletorModulosComerciais f={modalModulos} set={setModalModulos} />

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setModalModulos(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 font-bold text-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={salvando}
                onClick={() => salvarApenasModulos(modalModulos)}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 font-bold text-white hover:bg-indigo-700 disabled:opacity-60 inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check size={18} />
                {salvando ? 'Salvando...' : 'Salvar Módulos Contratados'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE EDIÇÃO COMPLETA */}
      {edicao && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4" onClick={() => setEdicao(null)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); salvar(edicao, () => setEdicao(null)); }}
            className="bg-white rounded-2xl p-6 w-full max-w-3xl border-t-4 border-t-amber-500 shadow-2xl max-h-[92vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Pencil size={18} /> Editar Condomínio &amp; Módulos</h2>
              <button type="button" onClick={() => setEdicao(null)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"><X size={20} /></button>
            </div>
            <CamposCondominio f={edicao} set={setEdicao} edicao />
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setEdicao(null)} className="flex-1 py-2.5 rounded-lg bg-slate-100 font-bold text-slate-700 hover:bg-slate-200 cursor-pointer">Cancelar</button>
              <button disabled={salvando} className="flex-1 py-2.5 rounded-lg bg-amber-500 font-bold text-white hover:bg-amber-600 disabled:opacity-60 cursor-pointer">Salvar Alterações</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL DE EXCLUSÃO PERMANENTE DE CLIENTE / CONDOMÍNIO */}
      {modalExclusao && (
        <div
          className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4"
          onClick={() => !excluindo && setModalExclusao(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={confirmarExclusaoCondominio}
            className="bg-white rounded-2xl p-6 w-full max-w-lg border-t-4 border-t-red-600 shadow-2xl space-y-4"
          >
            <div className="flex justify-between items-start gap-3">
              <div className="flex items-center gap-2.5">
                <span className="p-2.5 rounded-xl bg-red-100 text-red-700 shrink-0">
                  <Trash2 size={22} />
                </span>
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900">Excluir Cliente / Condomínio</h2>
                  <p className="text-xs text-slate-500">Ação irreversível no banco de dados e arquivos</p>
                </div>
              </div>
              <button
                type="button"
                disabled={excluindo}
                onClick={() => setModalExclusao(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-900 space-y-1.5 leading-relaxed">
              <div className="font-extrabold text-sm text-red-800">
                ⚠️ Você está prestes a apagar permanentemente:
              </div>
              <div className="font-bold text-slate-900 bg-white/80 px-3 py-2 rounded-lg border border-red-200">
                #{modalExclusao.id} — {modalExclusao.nome}
                <div className="text-[11px] font-semibold text-slate-500 mt-0.5">
                  {modalExclusao.total_unidades} unidade(s) • {modalExclusao.total_usuarios} usuário(s)/morador(es) • Síndico: {modalExclusao.nome_sindico || 'Sem cadastro'}
                </div>
              </div>
              <p>
                Todos os blocos, unidades, moradores, veículos, pré-cadastros, documentos anexados, conversas de WhatsApp e terminais vinculados a este condomínio serão <b>removidos definitivamente</b>.
              </p>
            </div>

            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
                Para confirmar, digite exatamente o nome do condomínio abaixo:
              </label>
              <div className="text-xs font-mono font-bold text-red-700 bg-slate-100 px-3 py-1.5 rounded-lg mb-2 select-all">
                {modalExclusao.nome}
              </div>
              <input
                required
                autoFocus
                value={confirmacaoNome}
                onChange={(e) => setConfirmacaoNome(e.target.value)}
                placeholder={`Digite "${modalExclusao.nome}"`}
                className={campo}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={excluindo}
                onClick={() => setModalExclusao(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 font-bold text-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={
                  excluindo ||
                  confirmacaoNome.trim().replace(/\s+/g, ' ').toLowerCase() !==
                    modalExclusao.nome.trim().replace(/\s+/g, ' ').toLowerCase()
                }
                className="flex-1 py-2.5 rounded-xl bg-red-600 font-extrabold text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Trash2 size={16} />
                {excluindo ? 'Excluindo...' : 'Excluir Permanentemente'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
