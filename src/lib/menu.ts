// Menu indexado por perfil e domínio funcional — com suporte a categorias recolhíveis (Accordion)
// e indexação semântica para Pesquisa Rápida no Menu e Pesquisa Inteligente Global (Ctrl+K).
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Megaphone, Building2, Database, MonitorCheck, Package, UserCheck,
  ClipboardList, ScanSearch, Users, Car, Cpu, Video, FileText, ShieldAlert, Activity,
  ShieldCheck, UsersRound, Upload, Settings, Home, Phone, PhoneCall, Key, Bell, ScanFace,
  Calendar, Wrench, Vote, MessageSquare, UserX, Truck, Wallet, FileCheck2, PawPrint,
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
  /** Descrição curta exibida na Pesquisa Inteligente (Ctrl+K). */
  descricaoCurta?: string;
  /** Sinônimos e palavras-chave indexadas para busca instantânea. */
  palavrasChave?: string[];
}

export interface GrupoMenu {
  id: string;
  titulo: string;
  abertoPorPadrao?: boolean;
  itens: ItemMenu[];
}

const GESTAO: Perfil[] = ['superadmin', 'admin', 'sindico'];
const OPERACAO: Perfil[] = ['superadmin', 'admin', 'sindico', 'portaria'];
const MORADOR: Perfil[] = ['morador'];

export function normalizarTextoBusca(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export const GRUPOS_MENU: GrupoMenu[] = [
  // =========================================================================
  // ÁREA DO MORADOR — Dividida em 4 categorias claras para não poluir a tela
  // =========================================================================
  {
    id: 'morador_acesso',
    titulo: 'Acesso & Portaria',
    abertoPorPadrao: true,
    itens: [
      {
        nome: 'Controle de Acesso',
        caminho: '/morador',
        icone: Home,
        perfis: MORADOR,
        descricaoCurta: 'Painel inicial, abertura de portões, QR Code e biometria facial',
        palavrasChave: ['inicio', 'home', 'portao', 'catraca', 'facial', 'biometria', 'qrcode', 'abrir'],
      },
      {
        nome: 'Interfone Digital',
        caminho: '/morador/interfone',
        icone: PhoneCall,
        perfis: MORADOR,
        titulo: 'Interfone Digital',
        descricaoCurta: 'Atender chamadas de vídeo da portaria e ver ramal do apartamento',
        palavrasChave: ['ramal', 'ligacao', 'chamada', 'video', 'porteiro', 'voz', 'atender'],
      },
      {
        nome: 'Convites e Visitas',
        caminho: '/morador/convites',
        icone: Phone,
        perfis: MORADOR,
        descricaoCurta: 'Gerar link de convite facial ou QR Code para visitantes e prestadores',
        palavrasChave: ['liberar', 'visitante', 'prestador', 'link', 'convidado', 'selfie', 'entrada'],
      },
      {
        nome: 'Visitas Confirmadas',
        caminho: '/morador/visitantes',
        icone: UserCheck,
        perfis: MORADOR,
        descricaoCurta: 'Lista de visitantes com acesso facial ativo e revogação rápida',
        palavrasChave: ['visitantes', 'confirmados', 'remover visita', 'cancelar convite', 'liberados'],
      },
      {
        nome: 'Minhas Encomendas',
        caminho: '/morador/encomendas',
        icone: Package,
        perfis: MORADOR,
        descricaoCurta: 'Pacotes e entregas aguardando retirada na portaria com protocolo',
        palavrasChave: ['pacote', 'entrega', 'correios', 'mercado livre', 'shopee', 'retirada', 'codigo', 'locker'],
      },
      {
        nome: 'Registro Facial',
        caminho: '/morador/biometria',
        icone: ScanFace,
        perfis: MORADOR,
        oculto: true,
        descricaoCurta: 'Atualizar foto de reconhecimento facial do morador',
        palavrasChave: ['foto', 'selfie', 'rosto', 'biometria', 'facial', 'leitor'],
      },
    ],
  },
  {
    id: 'morador_financeiro',
    titulo: 'Financeiro & Transparência',
    abertoPorPadrao: false,
    itens: [
      {
        nome: 'Meus Boletos & PIX',
        caminho: '/morador/boletos',
        icone: Wallet,
        perfis: MORADOR,
        titulo: 'Meus Boletos, PIX & Certidão Negativa (CND)',
        descricaoCurta: '2ª via da taxa de condomínio, PIX Copia e Cola e emissão de CND em 1 clique',
        palavrasChave: ['boleto', 'pix', '2 via', 'segunda via', 'fatura', 'taxa', 'cota', 'cnd', 'certidao negativa', 'quitacao', 'nada consta', 'pagar'],
      },
      {
        nome: 'Transparência & Docs',
        caminho: '/morador/transparencia',
        icone: FileCheck2,
        perfis: MORADOR,
        titulo: 'Portal da Transparência, Balancete & Documentos',
        descricaoCurta: 'Balancete mensal, notas fiscais das despesas, convenção, regimento e atas',
        palavrasChave: ['prestacao de contas', 'balancete', 'notas fiscais', 'conselho fiscal', 'regimento interno', 'convencao', 'atas', 'gastos'],
      },
    ],
  },
  {
    id: 'morador_condominio',
    titulo: 'Reservas & Condomínio',
    abertoPorPadrao: false,
    itens: [
      {
        nome: 'Reserva de Espaços',
        caminho: '/morador/reservas',
        icone: Calendar,
        perfis: MORADOR,
        titulo: 'Reserva de Áreas Comuns & Lista da Festa',
        descricaoCurta: 'Reservar salão de festas, churrasqueira/quiosque e enviar lista de convidados',
        palavrasChave: ['salao de festas', 'churrasqueira', 'quiosque', 'area comum', 'festa', 'convidados', 'agenda'],
      },
      {
        nome: 'Agendar Mudança',
        caminho: '/morador/mudancas',
        icone: Truck,
        perfis: MORADOR,
        titulo: 'Autorização Digital de Mudança & Entrega de Móveis',
        descricaoCurta: 'Solicitar entrada/saída de mudança ou entrega de móveis e eletrodomésticos',
        palavrasChave: ['caminhao', 'moveis', 'entrada', 'saida', 'frete', 'transportadora', 'desocupacao'],
      },
      {
        nome: 'Livro de Ocorrências',
        caminho: '/morador/ocorrencias',
        icone: Wrench,
        perfis: MORADOR,
        titulo: 'Livro Digital de Ocorrências, Chamados & Notificações',
        descricaoCurta: 'Abrir chamado de manutenção/barulho ou enviar defesa de advertência/multa',
        palavrasChave: ['chamado', 'reclamacao', 'barulho', 'manutencao', 'advertencia', 'multa', 'defesa', 'recurso', 'sindico'],
      },
      {
        nome: 'Assembleias & Enquetes',
        caminho: '/morador/enquetes',
        icone: Vote,
        perfis: MORADOR,
        titulo: 'Assembleias Digitais (AGO/AGE), Enquetes & Atas',
        descricaoCurta: 'Votar nas pautas oficiais da unidade e consultar atas assinadas',
        palavrasChave: ['votacao', 'voto', 'ago', 'age', 'assembleia', 'ata', 'pauta', 'fracao ideal'],
      },
      {
        nome: 'Mural de Avisos',
        caminho: '/morador/avisos',
        icone: Bell,
        perfis: MORADOR,
        descricaoCurta: 'Comunicados oficiais e avisos importantes da administração',
        palavrasChave: ['comunicados', 'noticias', 'recados', 'mural'],
      },
    ],
  },
  {
    id: 'morador_cadastro',
    titulo: 'Meu Apartamento',
    abertoPorPadrao: false,
    itens: [
      {
        nome: 'Família / Dependentes',
        caminho: '/morador/dependentes',
        icone: UsersRound,
        perfis: MORADOR,
        titulo: 'Minha Família, Cônjuge e Dependentes',
        descricaoCurta: 'Cadastrar esposa/marido, filhos e familiares moradores da unidade',
        palavrasChave: ['conjuge', 'esposa', 'marido', 'filho', 'parente', 'dependente', 'moradores'],
      },
      {
        nome: 'Funcionários do Apto',
        caminho: '/morador/funcionarios',
        icone: Users,
        perfis: MORADOR,
        titulo: 'Funcionários do Meu Apartamento',
        descricaoCurta: 'Gerenciar acesso facial de diaristas, babás e colaboradores domésticos',
        palavrasChave: ['diarista', 'empregada', 'baba', 'motorista', 'colaborador', 'prestador fixo'],
      },
      {
        nome: 'Meus Veículos',
        caminho: '/morador/veiculos',
        icone: Car,
        perfis: MORADOR,
        descricaoCurta: 'Carros e motos cadastrados para abertura LPR na garagem',
        palavrasChave: ['carro', 'moto', 'placa', 'garagem', 'vaga', 'lpr'],
      },
      {
        nome: 'Meus Pets',
        caminho: '/morador/pets',
        icone: PawPrint,
        perfis: MORADOR,
        titulo: 'Meus Pets & Alerta de Fuga',
        descricaoCurta: 'Cadastro dos animais da unidade, carteira antirrábica e botão de pet perdido',
        palavrasChave: ['pet', 'cachorro', 'cao', 'gato', 'ave', 'animal', 'vacina', 'antirrabica', 'perdido', 'fuga'],
      },
      {
        nome: 'Aluguel Temporada',
        caminho: '/morador/aluguel',
        icone: Key,
        perfis: MORADOR,
        titulo: 'Aluguel Temporada (Airbnb)',
        descricaoCurta: 'Check-in facial com início e fim automáticos para hóspedes',
        palavrasChave: ['airbnb', 'hospede', 'booking', 'locacao temporada', 'checkin'],
      },
    ],
  },

  // =========================================================================
  // ÁREA DA GESTÃO & EQUIPE — Organizada em domínios claros e recolhíveis
  // =========================================================================
  {
    id: 'gestao_painel',
    titulo: 'Painel & Comunicação',
    abertoPorPadrao: true,
    itens: [
      {
        nome: 'Dashboard',
        caminho: '/',
        icone: LayoutDashboard,
        perfis: GESTAO,
        descricaoCurta: 'Indicadores gerais do condomínio, acessos recentes e resumo operacional',
        palavrasChave: ['inicio', 'visao geral', 'indicadores', 'resumo', 'estatisticas', 'painel'],
      },
      {
        nome: 'WhatsApp & IA',
        caminho: '/whatsapp',
        icone: MessageSquare,
        perfis: GESTAO,
        titulo: 'Central WhatsApp Oficial (Meta Cloud API) & Assistente IA',
        descricaoCurta: 'Atendimento em tempo real, assistente IA 24h, disparos e templates Meta',
        palavrasChave: ['zap', 'chat', 'mensagens', 'robo', 'ia', 'meta', 'campanha', 'atendimento'],
      },
      {
        nome: 'Mural de Avisos',
        caminho: '/avisos',
        icone: Megaphone,
        perfis: GESTAO,
        exigeCondominio: true,
        descricaoCurta: 'Publicar comunicados oficiais com Push Notification para os moradores',
        palavrasChave: ['comunicado', 'notificacao', 'push', 'aviso', 'circular'],
      },
    ],
  },
  {
    id: 'gestao_financeiro',
    titulo: 'Financeiro & Transparência',
    abertoPorPadrao: true,
    itens: [
      {
        nome: 'Financeiro & PIX',
        caminho: '/financeiro',
        icone: Wallet,
        perfis: GESTAO,
        exigeCondominio: true,
        titulo: 'Financeiro Condominial, Rateio Mensal, PIX & CND',
        descricaoCurta: 'Arrecadação em lote, boletos PIX BR Code, contas a pagar com NF, inadimplência e CND',
        palavrasChave: ['boletos', 'pix', 'rateio', 'cota', 'arrecadacao', 'inadimplencia', 'despesas', 'contas a pagar', 'cnd', 'certidao', 'caixa', 'nota fiscal'],
      },
      {
        nome: 'Portal da Transparência',
        caminho: '/transparencia',
        icone: FileCheck2,
        perfis: GESTAO,
        exigeCondominio: true,
        titulo: 'Portal da Transparência, Prestação de Contas & Biblioteca',
        descricaoCurta: 'Balancete mensal, auditoria do Conselho Fiscal, notas fiscais e documentos oficiais',
        palavrasChave: ['balancete', 'prestacao de contas', 'conselho fiscal', 'parecer', 'pasta mensal', 'convencao', 'regimento interno', 'atas', 'documentos'],
      },
    ],
  },
  {
    id: 'gestao_condominial',
    titulo: 'Gestão Condominial',
    abertoPorPadrao: false,
    itens: [
      {
        nome: 'Assembleias & Enquetes',
        caminho: '/enquetes',
        icone: Vote,
        perfis: GESTAO,
        exigeCondominio: true,
        titulo: 'Assembleias Digitais (AGO/AGE), Fração Ideal & Ata Automática',
        descricaoCurta: 'Convocar AGO/AGE ou enquete ponderada por fração ideal e lavrar Ata Oficial SHA-256',
        palavrasChave: ['assembleia', 'ago', 'age', 'votacao', 'voto', 'ata', 'edital', 'quorum', 'fracao ideal'],
      },
      {
        nome: 'Reserva de Espaços',
        caminho: '/reservas',
        icone: Calendar,
        perfis: OPERACAO,
        exigeCondominio: true,
        titulo: 'Reserva de Áreas Comuns & Listas de Festa',
        descricaoCurta: 'Agenda do salão de festas, churrasqueiras, taxas e listas de convidados faciais',
        palavrasChave: ['salao', 'churrasqueira', 'quiosque', 'festa', 'areas comuns', 'convidados'],
      },
      {
        nome: 'Autorização de Mudanças',
        caminho: '/mudancas',
        icone: Truck,
        perfis: OPERACAO,
        exigeCondominio: true,
        titulo: 'Autorização Digital de Mudanças (Entrada & Saída)',
        descricaoCurta: 'Aprovar entrada/saída de mudanças e revogar facial de inquilinos na saída',
        palavrasChave: ['mudanca', 'caminhao', 'entrada', 'saida', 'desocupacao', 'moveis', 'frete'],
      },
      {
        nome: 'Livro de Ocorrências',
        caminho: '/ocorrencias',
        icone: Wrench,
        perfis: OPERACAO,
        exigeCondominio: true,
        titulo: 'Livro Digital de Ocorrências, Chamados & Multas',
        descricaoCurta: 'Responder chamados, emitir advertências/multas regimentais e julgar defesas',
        palavrasChave: ['chamados', 'reclamacao', 'barulho', 'advertencia', 'multa', 'infracao', 'defesa', 'zeladoria'],
      },
      {
        nome: 'Radar de Manutenções',
        caminho: '/manutencoes',
        icone: ShieldCheck,
        perfis: GESTAO,
        exigeCondominio: true,
        titulo: 'Radar do Síndico — Manutenções Programadas, Seguro & Mandatos',
        descricaoCurta: 'Semáforo de vencimentos de AVCB, extintores, caixas d’água, bombas, seguro e mandato',
        palavrasChave: ['extintor', 'avcb', 'caixa dagua', 'dedetizacao', 'seguro', 'mandato', 'spda', 'para-raios', 'preventiva', 'bomba'],
      },
    ],
  },
  {
    id: 'gestao_portaria',
    titulo: 'Portaria & Operação',
    abertoPorPadrao: false,
    itens: [
      {
        nome: 'Terminal de Portaria',
        caminho: '/portaria',
        icone: MonitorCheck,
        perfis: OPERACAO,
        exigeCondominio: true,
        descricaoCurta: 'Tela operacional da guarita, câmeras ao vivo, abertura remota e triagem de visitas',
        palavrasChave: ['guarita', 'porteiro', 'abrir portao', 'triagem', 'acesso ao vivo'],
      },
      {
        nome: 'Gestão de Encomendas',
        caminho: '/painel-portaria',
        icone: Package,
        perfis: OPERACAO,
        exigeCondominio: true,
        descricaoCurta: 'Leitura de código de barras/etiqueta OCR, recebimento e baixa de pacotes',
        palavrasChave: ['pacotes', 'correios', 'entregas', 'etiqueta', 'ocr', 'protocolo', 'rastreio'],
      },
      {
        nome: 'Convites / Visitantes',
        caminho: '/visitas',
        icone: UserCheck,
        perfis: OPERACAO,
        exigeCondominio: true,
        descricaoCurta: 'Histórico e liberação de visitantes, prestadores e convites ativos',
        palavrasChave: ['visitante', 'prestador', 'convite', 'entrada visitante'],
      },
      {
        nome: 'Pré-cadastros',
        caminho: '/precadastros',
        icone: ClipboardList,
        perfis: OPERACAO,
        exigeCondominio: true,
        descricaoCurta: 'Aprovar cadastros de novos moradores/inquilinos com sincronização facial automática',
        palavrasChave: ['aprovar cadastro', 'recadastramento', 'novo morador', 'pendentes', 'triagem ia'],
      },
      {
        nome: 'Modo Ronda (Placas)',
        caminho: '/consulta-placa',
        icone: ScanSearch,
        perfis: OPERACAO,
        exigeCondominio: true,
        descricaoCurta: 'Consultar placa de veículo por foto/digitação no pátio para identificar o apartamento',
        palavrasChave: ['ronda', 'placa', 'estacionamento', 'patio', 'identificar carro', 'ocr placa'],
      },
      {
        nome: 'Pets & Perdidos',
        caminho: '/pets',
        icone: PawPrint,
        perfis: OPERACAO,
        exigeCondominio: true,
        titulo: 'Gestão Pet, Achados e Perdidos & Censo Vacinal',
        descricaoCurta: 'Busca visual rápida por cor/espécie/porte nas câmeras CFTV, alertas de fuga e censo pet',
        palavrasChave: ['pet', 'pets', 'cachorro', 'cao', 'gato', 'achados e perdidos', 'perdido', 'fuga', 'censo pet', 'vacina'],
      },
    ],
  },
  {
    id: 'gestao_cadastros',
    titulo: 'Cadastros & Segurança IA',
    abertoPorPadrao: false,
    itens: [
      {
        nome: 'Blocos & Unidades 360º',
        caminho: '/estrutura',
        icone: Building2,
        perfis: GESTAO,
        exigeCondominio: true,
        titulo: 'Blocos, Unidades 360º, Fração Ideal & Sincronização',
        descricaoCurta: 'Estrutura do condomínio, Ficha 360º do apartamento, proprietários, inquilinos e fração ideal',
        palavrasChave: ['apartamentos', 'torres', 'galpoes', 'ficha 360', 'fracao ideal', 'proprietario', 'inquilino', 'superlogica', 'vagas'],
      },
      {
        nome: 'Moradores',
        caminho: '/pessoas',
        icone: Users,
        perfis: GESTAO,
        exigeCondominio: true,
        descricaoCurta: 'Cadastro completo de moradores, biometria facial, contratos e sincronização com leitores',
        palavrasChave: ['pessoas', 'condominos', 'titular', 'inquilinos', 'dependentes', 'cpf', 'telefone', 'resetar senha'],
      },
      {
        nome: 'Veículos',
        caminho: '/veiculos',
        icone: Car,
        perfis: GESTAO,
        exigeCondominio: true,
        descricaoCurta: 'Frota de carros e motos dos moradores, vagas de garagem e liberação LPR',
        palavrasChave: ['carros', 'motos', 'placas', 'garagem', 'vagas', 'lpr'],
      },
      {
        nome: 'Visão Facial 512D',
        caminho: '/visao-facial',
        icone: ScanFace,
        perfis: OPERACAO,
        exigeCondominio: true,
        titulo: 'Visão Computacional 512D — Busca Forense 1:N, Vestuário & Alertas IA',
        descricaoCurta: 'Busca forense por foto ou cor de roupa nas câmeras com inteligência artificial 512D',
        palavrasChave: ['ia', 'forense', 'reconhecimento facial', 'roupa', 'vestuario', '512d', 'buscar rosto'],
      },
      {
        nome: 'Suspeitos / Blacklist',
        caminho: '/lista-restricao',
        icone: UserX,
        perfis: OPERACAO,
        exigeCondominio: true,
        titulo: 'Suspeitos / Blacklist — Lista de Restrição Facial & Alarmes',
        descricaoCurta: 'Monitoramento e alarme sonoro imediato para pessoas com restrição judicial ou segurança',
        palavrasChave: ['proibidos', 'restricao', 'alarme', 'foragido', 'seguranca', 'bloqueio facial'],
      },
      {
        nome: 'Importação de Dados',
        caminho: '/pessoas/importar',
        icone: Upload,
        perfis: GESTAO,
        exigeCondominio: true,
        descricaoCurta: 'Importar planilhas CSV/Excel de moradores e lista oficial da administradora',
        palavrasChave: ['planilha', 'excel', 'csv', 'importar', 'lote', 'lista oficial'],
      },
    ],
  },
  {
    id: 'gestao_sistema',
    titulo: 'Hardware, Logs & Sistema',
    abertoPorPadrao: false,
    itens: [
      {
        nome: 'Terminais LPR/Facial',
        caminho: '/terminais',
        icone: Cpu,
        perfis: GESTAO,
        exigeCondominio: true,
        descricaoCurta: 'Controladoras faciais Hikvision, leitores LPR, status online e sincronismo ISAPI',
        palavrasChave: ['hikvision', 'leitor', 'catraca', 'controladora', 'ip', 'isapi', 'dispositivos'],
      },
      {
        nome: 'Câmeras de Segurança',
        caminho: '/cameras',
        icone: Video,
        perfis: GESTAO,
        exigeCondominio: true,
        descricaoCurta: 'Câmeras RTSP/HLS, mosaico CFTV e integração com NVR',
        palavrasChave: ['cftv', 'rtsp', 'nvr', 'dvr', 'monitoramento', 'video'],
      },
      {
        nome: 'VoIP & Ramais IP',
        caminho: '/relatorio-voip',
        icone: PhoneCall,
        perfis: GESTAO,
        titulo: 'Central VoIP, Telefonia IP (SIP) & Lista de Ramais',
        descricaoCurta: 'Status da central Asterisk/SIP, ramais por apartamento e histórico de ligações',
        palavrasChave: ['interfone', 'sip', 'asterisk', 'ramais', 'telefonia', 'chamadas'],
      },
      {
        nome: 'Relatório de Acessos',
        caminho: '/acessos',
        icone: FileText,
        perfis: OPERACAO,
        exigeCondominio: true,
        descricaoCurta: 'Auditoria de passagens nos leitores faciais e cancelas com foto e horário',
        palavrasChave: ['passagens', 'entradas', 'saidas', 'historico de acesso', 'eventos'],
      },
      {
        nome: 'Usuários e Permissões',
        caminho: '/usuarios',
        icone: ShieldCheck,
        perfis: GESTAO,
        descricaoCurta: 'Contas de síndicos, administradores, porteiros e permissões de acesso ao painel',
        palavrasChave: ['operadores', 'porteiro', 'sindico', 'admin', 'senhas', 'perfis'],
      },
      {
        nome: 'Grupos de Acesso',
        caminho: '/grupos-acesso',
        icone: UsersRound,
        perfis: GESTAO,
        exigeCondominio: true,
        descricaoCurta: 'Regras de permissão por blocos, portões e horários nos terminais faciais',
        palavrasChave: ['regras', 'horarios', 'portoes permitidos', 'permissoes'],
      },
      {
        nome: 'Auditoria do Sistema',
        caminho: '/auditoria',
        icone: ShieldAlert,
        perfis: GESTAO,
        descricaoCurta: 'Trilha completa de quem fez cada ação administrativa no sistema',
        palavrasChave: ['logs', 'rastreabilidade', 'seguranca', 'acoes'],
      },
      {
        nome: 'Diagnóstico de Erros',
        caminho: '/logs-sistema',
        icone: Activity,
        perfis: ['superadmin', 'admin', 'sindico'],
        descricaoCurta: 'Monitoramento técnico de integrações, hardware e saúde da API',
        palavrasChave: ['erros', 'debug', 'falhas', 'saude', 'status'],
      },
    ],
  },
  {
    id: 'sectrum_saas',
    titulo: 'Sectrum SaaS',
    abertoPorPadrao: false,
    itens: [
      {
        nome: 'Meus Clientes',
        caminho: '/condominios',
        icone: Building2,
        perfis: ['superadmin'],
        apenasSuperadmin: true,
        descricaoCurta: 'Gestão multi-condomínio, módulos contratados e ativação de clientes SaaS',
        palavrasChave: ['clientes', 'condominios', 'modulos', 'planos', 'licencas'],
      },
      {
        nome: 'Cópia de Segurança',
        caminho: '/backup',
        icone: Database,
        perfis: ['superadmin'],
        apenasSuperadmin: true,
        descricaoCurta: 'Backups completos do banco PostgreSQL e restauração segura',
        palavrasChave: ['backup', 'dump', 'restaurar', 'banco de dados'],
      },
      {
        nome: 'Configurações',
        caminho: '/configuracoes',
        icone: Settings,
        perfis: ['superadmin'],
        apenasSuperadmin: true,
        descricaoCurta: 'Parâmetros globais da plataforma Sectrum',
        palavrasChave: ['ajustes', 'parametros', 'global', 'servidor'],
      },
    ],
  },
];

/** Divisão limpa em 2 grupos para o perfil Portaria (Atendimento Imediato vs Rondas & Segurança). */
const ORDEM_PORTARIA_ATENDIMENTO = ['/portaria', '/painel-portaria', '/mudancas', '/visitas', '/precadastros'];
const ORDEM_PORTARIA_APOIO = ['/pets', '/consulta-placa', '/reservas', '/ocorrencias', '/acessos', '/visao-facial', '/lista-restricao'];

export function podeVer(item: ItemMenu, u: Usuario): boolean {
  if (!item.perfis.includes(u.perfil)) return false;
  if (item.apenasSuperadmin && !u.superadmin) return false;
  if (item.caminho === '/whatsapp' && !u.superadmin && !u.whatsapp_chat_condominio) return false;
  if ((item.caminho === '/lista-restricao' || item.caminho === '/visao-facial') && !u.modulo_seguranca_facial && !u.superadmin) return false;
  if (u.condominio_id !== null) {
    if (u.perfil === 'morador' && u.permissoes_sistema) {
      const p = u.permissoes_sistema;
      if (item.caminho === '/morador/funcionarios' && p.gerenciar_colaboradores === false) return false;
      if (item.caminho === '/morador/veiculos' && p.gerenciar_frota_lpr === false) return false;
      if ((item.caminho === '/morador/convites' || item.caminho === '/morador/visitantes') && p.liberar_visitantes === false) return false;
      if (item.caminho === '/morador/encomendas' && p.gerenciar_encomendas === false) return false;
      if (item.caminho === '/morador/ocorrencias' && p.abrir_ocorrencias === false) return false;
      if (item.caminho === '/morador/interfone' && p.usar_interfone === false) return false;
    }
    if (item.caminho === '/morador/aluguel' && (u.permite_temporada === false || u.modulo_airbnb === false)) return false;
    if (item.caminho === '/morador/interfone' && u.modulo_interfone === false) return false;
    if (item.caminho === '/relatorio-voip' && u.modulo_interfone === false && !u.superadmin) return false;
    if ((item.caminho === '/reservas' || item.caminho === '/morador/reservas') && u.modulo_reservas === false) return false;
    if ((item.caminho === '/ocorrencias' || item.caminho === '/morador/ocorrencias') && u.modulo_ocorrencias === false) return false;
    if ((item.caminho === '/enquetes' || item.caminho === '/morador/enquetes') && u.modulo_enquetes === false) return false;
    if ((item.caminho === '/avisos' || item.caminho === '/morador/avisos') && u.modulo_avisos === false) return false;
    if ((item.caminho === '/painel-portaria' || item.caminho === '/encomendas' || item.caminho === '/morador/encomendas') && u.modulo_encomendas === false) return false;
    if ((item.caminho === '/financeiro' || item.caminho === '/morador/boletos') && u.modulo_financeiro === false) return false;
    if ((item.caminho === '/transparencia' || item.caminho === '/morador/transparencia') && u.modulo_transparencia === false) return false;
    if ((item.caminho === '/mudancas' || item.caminho === '/morador/mudancas') && u.modulo_mudancas === false) return false;
    if (item.caminho === '/manutencoes' && u.modulo_manutencoes === false) return false;
  }
  return true;
}

/** Menu do usuario logado, ja filtrado por perfil e módulos contratados. */
export function menuDoUsuario(u: Usuario): GrupoMenu[] {
  if (u.perfil === 'portaria') {
    const todos = GRUPOS_MENU.flatMap((g) => g.itens);
    const g1 = ORDEM_PORTARIA_ATENDIMENTO
      .map((c) => todos.find((i) => i.caminho === c)!)
      .filter((i): i is ItemMenu => Boolean(i) && podeVer(i, u));
    const g2 = ORDEM_PORTARIA_APOIO
      .map((c) => todos.find((i) => i.caminho === c)!)
      .filter((i): i is ItemMenu => Boolean(i) && podeVer(i, u));
    return [
      { id: 'portaria_atendimento', titulo: 'Atendimento da Portaria', abertoPorPadrao: true, itens: g1 },
      { id: 'portaria_apoio', titulo: 'Segurança, Rondas & Apoio', abertoPorPadrao: false, itens: g2 },
    ].filter((g) => g.itens.length > 0);
  }

  return GRUPOS_MENU.map((g) => ({
    ...g,
    itens: g.itens.filter((i) => !i.oculto && podeVer(i, u)),
  })).filter((g) => g.itens.length > 0);
}

/** Item de menu correspondente a um caminho (para titulo e protecao de rota). */
export function itemDoCaminho(caminho: string): ItemMenu | undefined {
  return GRUPOS_MENU.flatMap((g) => g.itens).find((i) => i.caminho === caminho);
}

/** Grupo ao qual um caminho pertence (para Breadcrumb e abertura automática no Accordion). */
export function grupoDoCaminho(caminho: string, u: Usuario): GrupoMenu | undefined {
  return menuDoUsuario(u).find((g) => g.itens.some((i) => i.caminho === caminho));
}

export interface AtalhoPesquisaLocal {
  id: string;
  nome: string;
  grupoTitulo: string;
  descricao: string;
  caminho: string;
  icone: LucideIcon;
  score: number;
}

/**
 * Pesquisa instantânea client-side (0ms) em todas as telas e ações permitidas para o usuário,
 * compreendendo sinônimos, intenções sem acento e palavras-chave.
 */
export function pesquisarTelasIndexadas(termo: string, u: Usuario): AtalhoPesquisaLocal[] {
  const grupos = menuDoUsuario(u);
  const q = normalizarTextoBusca(termo);
  const tokens = q.split(/\s+/).filter(Boolean);

  const candidatos: AtalhoPesquisaLocal[] = [];
  for (const g of grupos) {
    for (const item of g.itens) {
      const nomeNorm = normalizarTextoBusca(item.nome);
      const titNorm = normalizarTextoBusca(item.titulo || '');
      const descNorm = normalizarTextoBusca(item.descricaoCurta || '');
      const grpNorm = normalizarTextoBusca(g.titulo);
      const kwsNorm = (item.palavrasChave || []).map(normalizarTextoBusca);
      const baseCompleta = `${nomeNorm} ${titNorm} ${descNorm} ${grpNorm} ${kwsNorm.join(' ')}`;

      if (tokens.length === 0) {
        candidatos.push({
          id: item.caminho,
          nome: item.nome,
          grupoTitulo: g.titulo,
          descricao: item.descricaoCurta || item.titulo || g.titulo,
          caminho: item.caminho,
          icone: item.icone,
          score: g.abertoPorPadrao ? 10 : 5,
        });
        continue;
      }

      const bateTodos = tokens.every((tk) => baseCompleta.includes(tk));
      if (!bateTodos) continue;

      let score = 20;
      if (nomeNorm.startsWith(q)) score += 60;
      else if (nomeNorm.includes(q)) score += 40;
      if (kwsNorm.some((k) => k === q || k.startsWith(q))) score += 35;
      if (titNorm.includes(q)) score += 20;

      candidatos.push({
        id: item.caminho,
        nome: item.nome,
        grupoTitulo: g.titulo,
        descricao: item.descricaoCurta || item.titulo || g.titulo,
        caminho: item.caminho,
        icone: item.icone,
        score,
      });
    }
  }

  return candidatos.sort((a, b) => b.score - a.score).slice(0, tokens.length === 0 ? 8 : 10);
}

/** Pagina inicial por perfil (mesmo redirect do login legado). */
export function inicioDoPerfil(u: Usuario): string {
  if (u.primeiro_acesso === 1) return '/trocar-senha';
  if (u.perfil === 'morador') return '/morador';
  if (u.perfil === 'portaria') return '/portaria';
  return '/';
}
