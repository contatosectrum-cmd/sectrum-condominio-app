import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  MessageSquare, Bot, Sparkles, Send, RefreshCw, QrCode, CheckCircle2, AlertCircle,
  Phone, UserCheck, Plus, Trash2, Pencil, Users, Zap, Cpu, ShieldCheck, X, Megaphone, ImagePlus, Building2, CheckSquare, Square,
} from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import { useSessao } from '../lib/useSessao';

interface ConfigWhatsapp {
  id: number;
  condominio_id: number;
  provedor_ativo?: 'meta_oficial' | 'evolution' | string;
  meta_app_id?: string;
  meta_waba_id?: string;
  meta_phone_number_id?: string;
  meta_access_token?: string;
  meta_verify_token?: string;
  meta_numero?: string;
  meta_nome_verificado?: string;
  telefone_notificacao_humano?: string;
  evolution_url: string;
  evolution_url_publica: string;
  evolution_apikey: string;
  instance_name: string;
  instance_token: string;
  auto_aprovar_ativo: boolean;
  auto_encomenda_ativo: boolean;
  auto_resposta_ativa: boolean;
  ia_ativa: boolean;
  ia_url: string;
  ia_modelo: string;
  ia_prompt_sistema: string;
  template_aprovacao: string;
  template_encomenda: string;
  antiban_ativo: boolean;
  antiban_delay_min: number;
  antiban_delay_max: number;
  antiban_digitando_ms: number;
  antiban_variar_texto: boolean;
  antiban_pausa_lote_qtd: number;
  antiban_pausa_lote_seg: number;
}

interface ItemFilaAntiban {
  id: number;
  telefone: string;
  nome_contato: string | null;
  unidade_label: string | null;
  origem: string;
  status: 'na_fila' | 'processando' | 'enviado' | 'erro' | 'cancelado' | string;
  tentativas: number;
  delay_aplicado_ms: number | null;
  erro_detalhe: string | null;
  criado_em: string;
  processado_em: string | null;
  resumo_conteudo: string;
}

interface FilaAntibanStatus {
  pm2_online: boolean;
  pm2_processo: string;
  worker: {
    pid: number | null;
    estado_atual: string;
    ultimo_ciclo: string | null;
    ultimo_envio_em: string | null;
    ultimo_delay_ms: number | null;
    contador_lote: number;
  };
  na_fila: number;
  enviados: number;
  erros: number;
  itens_recentes: ItemFilaAntiban[];
}

interface InstanciaEvolution {
  id: string;
  name: string;
  connectionStatus: string;
  profileName: string;
  number: string;
  token: string;
  mensagens_count: number;
  contatos_count: number;
}

interface ModeloIa {
  name: string;
  size_gb: number;
  parameter_size: string;
}

interface RegraAuto {
  id: number;
  condominio_id: number;
  titulo: string;
  gatilho: string;
  resposta: string;
  ativo: boolean;
  ordem: number;
}

interface DadosPainelWhatsapp {
  config: ConfigWhatsapp;
  meta_oficial?: {
    ativo: boolean;
    conectado: boolean;
    status: string;
    verificado: string;
    qualidade: string;
    app_id: string;
    waba_id: string;
    phone_number_id: string;
    numero: string;
    nome_verificado: string;
    webhook_url: string;
    verify_token: string;
  };
  evolution: {
    online: boolean;
    status_conexao: string;
    conectado: boolean;
    provedor?: string;
    numero: string;
    perfil_nome: string;
    foto_url: string;
    instancias: InstanciaEvolution[];
  };
  ia_servidor: {
    online: boolean;
    url: string;
    modelo_atual: string;
    modelos_disponiveis: ModeloIa[];
  };
  fila_antiban?: FilaAntibanStatus;
  estatisticas: {
    conversas: number;
    conversas_abertas?: number;
    conversas_encerradas?: number;
    aguardando_humano?: number;
    nao_lidas: number;
    mensagens_enviadas: number;
    respostas_automaticas: number;
  };
  regras: RegraAuto[];
}

interface ConversaWhatsapp {
  id: number;
  condominio_id: number;
  telefone: string;
  remote_jid: string;
  nome_contato: string;
  usuario_id: number | null;
  unidade_label: string | null;
  ultima_mensagem: string | null;
  ultima_direcao: 'in' | 'out';
  nao_lidas: number;
  ia_pausada: boolean;
  aguardando_humano?: boolean;
  motivo_humano?: string | null;
  solicitou_humano_em?: string | null;
  atualizado_em: string;
  ultima_interacao_em?: string | null;
  status_atendimento?: 'aberta' | 'encerrada' | string;
  etapa_atendimento?: string | null;
  cpf_confirmado?: string | null;
  motivo_encerramento?: string | null;
  morador_cpf?: string | null;
  condominio_nome?: string | null;
}

interface MensagemWhatsapp {
  id: number;
  conversa_id: number;
  direcao: 'in' | 'out';
  origem: 'morador' | 'manual' | 'auto_aprovacao' | 'auto_regra' | 'ia' | 'auto_encomenda' | 'auto_encerramento' | 'disparo_massa' | string;
  conteudo: string;
  status_envio: string;
  erro_detalhe?: string | null;
  midia_url?: string | null;
  midia_tipo?: string | null;
  criado_em: string;
}

interface CondominioMassa {
  id: number;
  nome: string;
  total_moradores_fone: number;
  total_conversas: number;
}

interface BlocoMassa {
  id: number;
  nome: string;
}

interface DestinatarioMassa {
  telefone: string;
  nome: string;
  usuario_id: number | null;
  cpf: string;
  condominio_id: number;
  condominio_nome: string;
  bloco_id: number | null;
  bloco_nome: string;
  unidade_label: string;
  ramal: string;
  tem_push_app: boolean;
  janela_24h_aberta: boolean;
  origem_cadastro: 'morador' | 'conversa_whatsapp' | string;
}

interface CampanhaMassa {
  id: number;
  condominio_id: number;
  condominio_nome: string;
  titulo: string;
  mensagem: string;
  midia_url?: string | null;
  total_destinatarios: number;
  enviados_sucesso: number;
  enviados_template: number;
  enviados_push: number;
  falhas: number;
  data_hora: string;
}

/** Lê um arquivo de imagem (JPG/PNG/WEBP) e redimensiona/comprime suavemente para até 1280px Base64. */
function lerEComprimirImagemParaBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo de imagem.'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new Image();
      img.onerror = () => resolve(dataUrl);
      img.onload = () => {
        try {
          const maxDim = 1280;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width >= height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const out = canvas.toDataURL('image/jpeg', 0.86);
          resolve(out);
        } catch {
          resolve(dataUrl);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

const msgErro = (e: unknown, padrao = 'Erro inesperado.') =>
  e instanceof ErroApi ? e.message : padrao;

function tocarAlertaSonoroHumano() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notas = [880, 1174.66, 880, 1174.66];
    notas.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const inicio = ctx.currentTime + idx * 0.16;
      gain.gain.setValueAtTime(0.001, inicio);
      gain.gain.exponentialRampToValueAtTime(0.25, inicio + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, inicio + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(inicio);
      osc.stop(inicio + 0.15);
    });
  } catch {
    // navegador pode bloquear caso o usuário ainda não tenha clicado na página
  }
}

function formatarHoraMsg(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return iso;
  const hoje = new Date();
  const mesmoDia =
    d.getDate() === hoje.getDate() &&
    d.getMonth() === hoje.getMonth() &&
    d.getFullYear() === hoje.getFullYear();
  return mesmoDia
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatarTelefoneExibicao(fone?: string | null): string {
  const d = (fone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('55') && d.length === 13) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.startsWith('55') && d.length === 12) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  }
  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  return `+${d}`;
}

function formatarCpfExibicao(cpf?: string | null): string {
  const d = (cpf || '').replace(/\D/g, '');
  if (d.length !== 11) return cpf || '';
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function obterIniciaisContato(nome?: string | null, fone?: string | null): string {
  const limpo = (nome || '').trim();
  const soDigitos = limpo.replace(/\D/g, '');
  if (!limpo || (soDigitos.length >= 8 && soDigitos === (fone || '').replace(/\D/g, ''))) {
    return '📱';
  }
  const partes = limpo.split(/\s+/).filter(Boolean);
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function badgeOrigemMensagem(origem: string) {
  switch (origem) {
    case 'ia':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-600/15 text-violet-900 border border-violet-500/25 text-[10px] font-extrabold">
          <Sparkles size={10} className="text-violet-700" /> Assistente IA (Qwen)
        </span>
      );
    case 'auto_aprovacao':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-700/15 text-emerald-950 border border-emerald-600/25 text-[10px] font-extrabold">
          <CheckCircle2 size={10} className="text-emerald-700" /> Boas-Vindas Automático
        </span>
      );
    case 'auto_regra':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-700/15 text-teal-950 border border-teal-600/25 text-[10px] font-extrabold">
          <Zap size={10} className="text-teal-700" /> Triagem Natural / Regra
        </span>
      );
    case 'auto_encerramento':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-700/15 text-slate-800 border border-slate-500/25 text-[10px] font-extrabold">
          ⏱️ Encerramento por Inatividade
        </span>
      );
    case 'disparo_massa':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-600/15 text-amber-950 border border-amber-500/30 text-[10px] font-extrabold">
          📢 Comunicado em Massa
        </span>
      );
    case 'manual':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-700/15 text-sky-950 border border-sky-600/25 text-[10px] font-extrabold">
          👤 Atendente (Painel)
        </span>
      );
    default:
      return null;
  }
}

export default function WhatsappCentral() {
  const { usuario } = useSessao();
  const ehAdminGeral = Boolean(usuario?.superadmin);
  const [aba, setAba] = useState<'chat' | 'massa' | 'automacao' | 'ia_config'>('chat');
  const [painel, setPainel] = useState<DadosPainelWhatsapp | null>(null);
  const [formCfg, setFormCfg] = useState<ConfigWhatsapp | null>(null);
  const [conversas, setConversas] = useState<ConversaWhatsapp[]>([]);
  const [filtroStatusConv, setFiltroStatusConv] = useState<'aberta' | 'humano' | 'encerrada' | 'todas'>('aberta');
  const [contadoresConv, setContadoresConv] = useState<{
    abertas: number;
    encerradas: number;
    aguardando_humano: number;
  }>({
    abertas: 0,
    encerradas: 0,
    aguardando_humano: 0,
  });
  const [buscaConv, setBuscaConv] = useState('');
  const [conversaAtiva, setConversaAtiva] = useState<ConversaWhatsapp | null>(null);
  const [mensagens, setMensagens] = useState<MensagemWhatsapp[]>([]);
  const [textoEnvio, setTextoEnvio] = useState('');
  const [fotoChatBase64, setFotoChatBase64] = useState<string>('');
  const [enviando, setEnviando] = useState(false);
  const [gerandoIa, setGerandoIa] = useState(false);
  const [salvandoCfg, setSalvandoCfg] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  // Estados da Aba de Disparo em Massa por Condomínio (com Texto + Foto + Push + Mural)
  const [condominiosMassa, setCondominiosMassa] = useState<CondominioMassa[]>([]);
  const [blocosMassa, setBlocosMassa] = useState<BlocoMassa[]>([]);
  const [destinatariosMassa, setDestinatariosMassa] = useState<DestinatarioMassa[]>([]);
  const [campanhasMassa, setCampanhasMassa] = useState<CampanhaMassa[]>([]);
  const [condominioIdMassa, setCondominioIdMassa] = useState<number>(0);
  const [blocoIdMassa, setBlocoIdMassa] = useState<number>(0);
  const [filtroPublicoMassa, setFiltroPublicoMassa] = useState<'todos' | 'apenas_moradores' | 'apenas_conversas'>('todos');
  const [buscaDestMassa, setBuscaDestMassa] = useState('');
  const [telefonesDesmarcadosMassa, setTelefonesDesmarcadosMassa] = useState<Set<string>>(new Set());
  const [tituloMassa, setTituloMassa] = useState('🚀 Atualização do Aplicativo Sectrum — Novas Funcionalidades!');
  const [textoMassa, setTextoMassa] = useState(
    'Olá, *{primeiro_nome}*! 👋\n\n' +
      'Temos novidades importantes no aplicativo do *{condominio}* ({unidade}):\n\n' +
      '🆘 *Novo Botão de Emergência (SOS):* Agora você conta com alerta rápido de *Emergência Médica* e *Segurança*, que toca sirene e avisa imediatamente os moradores do seu bloco, a Portaria e o Síndico.\n' +
      '📞 *Interfone Digital Melhorado:* Conversa em tempo real (Full-Duplex), opção de escutar *🔊 Viva-Voz* ou *👂 No Ouvido* e toque contínuo mesmo com a tela bloqueada.\n\n' +
      '📲 Acesse agora em: {link_app}',
  );
  const [fotoMassaBase64, setFotoMassaBase64] = useState<string>('');
  const [fotoMassaNome, setFotoMassaNome] = useState<string>('');
  const [enviarPushMassa, setEnviarPushMassa] = useState<boolean>(true);
  const [publicarMuralMassa, setPublicarMuralMassa] = useState<boolean>(false);
  const [carregandoMassa, setCarregandoMassa] = useState<boolean>(false);
  const [disparandoMassa, setDisparandoMassa] = useState<boolean>(false);
  const inputFotoMassaRef = useRef<HTMLInputElement | null>(null);
  const inputFotoChatRef = useRef<HTMLInputElement | null>(null);

  // Modal de QR Code para conectar o WhatsApp na Evolution API
  const [modalQrAberto, setModalQrAberto] = useState(false);
  const [qrBase64, setQrBase64] = useState('');
  const [carregandoQr, setCarregandoQr] = useState(false);

  // Modal de Nova Conversa avulsa
  const [modalNovaMsg, setModalNovaMsg] = useState(false);
  const [novoTelefone, setNovoTelefone] = useState('');
  const [novoNome, setNovoNome] = useState('');
  const [novoTexto, setNovoTexto] = useState('');

  // Modal de edição/criação de Regra Automática
  const [regraEditando, setRegraEditando] = useState<Partial<RegraAuto> | null>(null);

  // Simulador de IA na aba de configuração
  const [perguntaTesteIa, setPerguntaTesteIa] = useState('Olá');
  const [respostaTesteIa, setRespostaTesteIa] = useState('');
  const [testandoIa, setTestandoIa] = useState(false);

  // Amostras do Humanizador Anti-Bloqueio
  const [amostrasHumanizadas, setAmostrasHumanizadas] = useState<string[]>([]);
  const [gerandoAmostras, setGerandoAmostras] = useState(false);

  const fimChatRef = useRef<HTMLDivElement | null>(null);
  const conversaAtivaIdRef = useRef<number | null>(null);
  const qtdAguardandoHumanoAnteriorRef = useRef<number>(0);

  const alternarFiltroConversas = (novoFiltro: 'aberta' | 'humano' | 'encerrada' | 'todas') => {
    setAba('chat');
    setFiltroStatusConv(novoFiltro);
    conversaAtivaIdRef.current = null;
    setConversaAtiva(null);
  };

  const carregarPainel = useCallback(async () => {
    if (!ehAdminGeral) return;
    try {
      const r = await api<DadosPainelWhatsapp>('whatsapp_painel');
      setPainel(r);
      setFormCfg((atual) => atual ?? r.config);
    } catch (e) {
      setAviso({ tipo: 'erro', texto: msgErro(e, 'Falha ao carregar painel de WhatsApp & IA.') });
    }
  }, [ehAdminGeral]);

  const carregarConversas = useCallback(async (silencioso = false) => {
    if (!ehAdminGeral) return;
    try {
      const r = await api<{
        conversas: ConversaWhatsapp[];
        recentes_historico?: ConversaWhatsapp[];
        contadores?: { abertas: number; encerradas: number; aguardando_humano?: number };
      }>('whatsapp_conversas_listar', {
        query: { busca: buscaConv, status_atendimento: filtroStatusConv },
      });
      setConversas(r.conversas);
      if (r.contadores) {
        const novoQtdHumano = r.contadores.aguardando_humano ?? 0;
        if (novoQtdHumano > qtdAguardandoHumanoAnteriorRef.current) {
          tocarAlertaSonoroHumano();
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            const convHum = r.conversas.find((c) => c.aguardando_humano);
            new Notification('🚨 Morador aguardando Atendimento Humano!', {
              body: convHum
                ? `${convHum.nome_contato || convHum.telefone} (${convHum.condominio_nome || 'Sem condomínio'}): ${convHum.motivo_humano || 'Solicitou suporte humano'}`
                : `${novoQtdHumano} conversa(s) aguardando atendente humano na Central WhatsApp.`,
            });
          }
        }
        qtdAguardandoHumanoAnteriorRef.current = novoQtdHumano;
        setContadoresConv({
          abertas: r.contadores.abertas,
          encerradas: r.contadores.encerradas,
          aguardando_humano: novoQtdHumano,
        });
      }
      setConversaAtiva((atual) => {
        const listaBase = r.conversas;
        if (!atual) {
          const inicial = listaBase[0] ?? null;
          conversaAtivaIdRef.current = inicial?.id ?? null;
          return inicial;
        }
        const encontrada = listaBase.find((c) => c.id === atual.id);
        if (encontrada) {
          conversaAtivaIdRef.current = encontrada.id;
          return { ...atual, ...encontrada };
        }
        // Se estamos na aba de Ativas ou Humano e a conversa foi encerrada (não está mais na lista ativa),
        // remove da tela ativa e seleciona a próxima conversa ativa (ou limpa a tela se zerou)
        if (filtroStatusConv === 'aberta' || filtroStatusConv === 'humano') {
          const proxima = listaBase[0] ?? null;
          conversaAtivaIdRef.current = proxima?.id ?? null;
          return proxima;
        }
        return atual;
      });
    } catch (e) {
      if (!silencioso) {
        setAviso({ tipo: 'erro', texto: msgErro(e) });
      }
    }
  }, [buscaConv, filtroStatusConv, ehAdminGeral]);

  const carregarMensagens = useCallback(async (conversaId: number, rolar = false, forcarSelecao = false) => {
    if (!ehAdminGeral) return;
    try {
      const r = await api<{ conversa: ConversaWhatsapp; mensagens: MensagemWhatsapp[] }>('whatsapp_mensagens_listar', {
        query: { conversa_id: conversaId },
      });
      // Ignora respostas atrasadas de outra conversa que não seja a selecionada atualmente (elimina o bug de ficar pulando entre conversas!)
      if (!forcarSelecao && conversaAtivaIdRef.current !== null && conversaAtivaIdRef.current !== r.conversa.id) {
        return;
      }
      // Se estamos na aba Ativas ou Humano e a conversa acabou de ser encerrada, remove da tela de Ativas
      if (
        !forcarSelecao &&
        r.conversa.status_atendimento === 'encerrada' &&
        (filtroStatusConv === 'aberta' || filtroStatusConv === 'humano')
      ) {
        setConversas((prev) => {
          const restantes = prev.filter((c) => c.id !== r.conversa.id);
          const proxima = restantes[0] ?? null;
          conversaAtivaIdRef.current = proxima?.id ?? null;
          setConversaAtiva(proxima);
          if (!proxima) {
            setMensagens([]);
          }
          return restantes;
        });
        return;
      }
      conversaAtivaIdRef.current = r.conversa.id;
      setConversaAtiva((atual) => {
        if (forcarSelecao || !atual) return r.conversa;
        if (atual.id !== r.conversa.id) return atual;
        return { ...atual, ...r.conversa };
      });
      setMensagens(r.mensagens);
      if (rolar) {
        window.setTimeout(() => {
          if (fimChatRef.current) {
            fimChatRef.current.scrollTop = fimChatRef.current.scrollHeight;
          }
        }, 60);
      }
    } catch {
      // ignora
    }
  }, [ehAdminGeral, filtroStatusConv]);

  useEffect(() => {
    if (!ehAdminGeral) return;
    carregarPainel();
    carregarConversas();
    const timerPainel = window.setInterval(() => {
      carregarPainel();
    }, 8000);
    return () => window.clearInterval(timerPainel);
  }, [ehAdminGeral, carregarPainel, carregarConversas]);

  useEffect(() => {
    if (!ehAdminGeral || !conversaAtiva?.id) {
      setMensagens([]);
      return;
    }
    carregarMensagens(conversaAtiva.id, true);
    const timer = window.setInterval(() => {
      carregarMensagens(conversaAtiva.id, false);
      carregarConversas(true);
    }, 3500);
    return () => window.clearInterval(timer);
  }, [ehAdminGeral, conversaAtiva?.id, carregarMensagens, carregarConversas]);

  const salvarConfig = async (cfgCustom?: ConfigWhatsapp) => {
    const alvo = cfgCustom ?? formCfg;
    if (!alvo) return;
    setSalvandoCfg(true);
    setAviso(null);
    try {
      const r = await api<{ mensagem: string; config: ConfigWhatsapp }>('whatsapp_config_salvar', {
        corpo: alvo as unknown as Record<string, unknown>,
      });
      setFormCfg(r.config);
      setAviso({ tipo: 'ok', texto: r.mensagem });
      await carregarPainel();
    } catch (e) {
      setAviso({ tipo: 'erro', texto: msgErro(e) });
    } finally {
      setSalvandoCfg(false);
    }
  };

  const abrirQrCode = useCallback(async (forcarReset = false, silencioso = false) => {
    setModalQrAberto(true);
    if (!silencioso) {
      setCarregandoQr(true);
      setQrBase64('');
    }
    try {
      const r = await api<{
        conectado: boolean;
        qrcode_base64?: string;
        mensagem: string;
      }>('whatsapp_conectar_qrcode', { corpo: { forcar_reset: forcarReset } });
      if (r.conectado) {
        setAviso({ tipo: 'ok', texto: r.mensagem || '✅ WhatsApp conectado com sucesso!' });
        setModalQrAberto(false);
        await carregarPainel();
        return;
      }
      if (r.qrcode_base64) {
        setQrBase64(r.qrcode_base64);
      }
    } catch (e) {
      if (!silencioso) {
        setAviso({ tipo: 'erro', texto: msgErro(e) });
      }
    } finally {
      if (!silencioso) {
        setCarregandoQr(false);
      }
    }
  }, [carregarPainel]);

  // Enquanto o modal do QR Code estiver aberto, verifica a cada 3s se já conectou e renova o QR a cada 28s
  useEffect(() => {
    if (!modalQrAberto) return;

    const timerStatus = window.setInterval(async () => {
      try {
        const r = await api<DadosPainelWhatsapp>('whatsapp_painel');
        setPainel(r);
        if (r.evolution?.conectado) {
          setModalQrAberto(false);
          setAviso({
            tipo: 'ok',
            texto: `✅ WhatsApp conectado com sucesso (${r.evolution.numero || r.config.instance_name})! Fila liberada.`,
          });
        }
      } catch {
        // ignora falha transitória de rede
      }
    }, 3000);

    const timerRefreshQr = window.setInterval(() => {
      abrirQrCode(false, true);
    }, 28000);

    return () => {
      window.clearInterval(timerStatus);
      window.clearInterval(timerRefreshQr);
    };
  }, [modalQrAberto, abrirQrCode]);

  const sincronizarMoradores = async () => {
    setSincronizando(true);
    try {
      const r = await api<{ mensagem: string }>('whatsapp_sincronizar_moradores', { corpo: {} });
      setAviso({ tipo: 'ok', texto: r.mensagem });
      await carregarConversas();
      await carregarPainel();
    } catch (e) {
      setAviso({ tipo: 'erro', texto: msgErro(e) });
    } finally {
      setSincronizando(false);
    }
  };

  const carregarDadosMassa = useCallback(async () => {
    if (!ehAdminGeral) return;
    setCarregandoMassa(true);
    try {
      const r = await api<{
        condominios: CondominioMassa[];
        blocos: BlocoMassa[];
        destinatarios: DestinatarioMassa[];
        campanhas_recentes: CampanhaMassa[];
      }>('whatsapp_disparo_massa_dados', {
        query: {
          condominio_id: condominioIdMassa,
          bloco_id: blocoIdMassa,
          filtro_publico: filtroPublicoMassa,
        },
      });
      setCondominiosMassa(r.condominios || []);
      setBlocosMassa(r.blocos || []);
      setDestinatariosMassa(r.destinatarios || []);
      setCampanhasMassa(r.campanhas_recentes || []);
    } catch (e) {
      setAviso({ tipo: 'erro', texto: msgErro(e, 'Erro ao carregar contatos para disparo em massa.') });
    } finally {
      setCarregandoMassa(false);
    }
  }, [ehAdminGeral, condominioIdMassa, blocoIdMassa, filtroPublicoMassa]);

  useEffect(() => {
    if (aba === 'massa') {
      void carregarDadosMassa();
    }
  }, [aba, carregarDadosMassa]);

  const executarDisparoMassa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textoMassa.trim() || disparandoMassa) return;

    const selecionados = destinatariosMassa
      .filter((d) => !telefonesDesmarcadosMassa.has(d.telefone))
      .map((d) => d.telefone);

    if (selecionados.length === 0) {
      setAviso({ tipo: 'erro', texto: 'Selecione pelo menos 1 contato para receber a mensagem em massa.' });
      return;
    }

    const nomeCond =
      condominioIdMassa > 0
        ? condominiosMassa.find((c) => c.id === condominioIdMassa)?.nome || `Condomínio #${condominioIdMassa}`
        : 'TODOS OS CONDOMÍNIOS';

    if (
      !window.confirm(
        `Confirmar disparo em massa para ${selecionados.length} contato(s) de "${nomeCond}"${fotoMassaBase64 ? ' (com foto anexada)' : ''}?`,
      )
    ) {
      return;
    }

    setDisparandoMassa(true);
    setAviso(null);
    try {
      const r = await api<{
        tipo: 'ok' | 'erro';
        mensagem: string;
        enviados_sucesso: number;
        enviados_push: number;
        falhas: number;
      }>('whatsapp_disparo_massa_enviar', {
        corpo: {
          condominio_id: condominioIdMassa,
          bloco_id: blocoIdMassa,
          filtro_publico: filtroPublicoMassa,
          titulo: tituloMassa.trim(),
          texto: textoMassa.trim(),
          imagem_base64: fotoMassaBase64 || undefined,
          telefones_selecionados: selecionados,
          enviar_push_app: enviarPushMassa,
          publicar_mural: publicarMuralMassa,
        },
      });
      setAviso({ tipo: r.tipo === 'ok' ? 'ok' : 'erro', texto: r.mensagem });
      await carregarDadosMassa();
      await carregarPainel();
      await carregarConversas(true);
    } catch (err) {
      setAviso({ tipo: 'erro', texto: msgErro(err, 'Erro ao realizar disparo em massa.') });
    } finally {
      setDisparandoMassa(false);
    }
  };

  const enviarMensagemChat = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!conversaAtiva || (!textoEnvio.trim() && !fotoChatBase64) || enviando) return;
    setEnviando(true);
    setAviso(null);
    try {
      await api('whatsapp_enviar_mensagem', {
        corpo: {
          conversa_id: conversaAtiva.id,
          texto: textoEnvio.trim(),
          imagem_base64: fotoChatBase64 || undefined,
        },
      });
      setTextoEnvio('');
      setFotoChatBase64('');
      await carregarMensagens(conversaAtiva.id, true);
      await carregarConversas(true);
    } catch (err) {
      setAviso({ tipo: 'erro', texto: msgErro(err) });
      await carregarMensagens(conversaAtiva.id, true);
    } finally {
      setEnviando(false);
    }
  };

  const sugerirComIaNoChat = async () => {
    if (!conversaAtiva || gerandoIa) return;
    setGerandoIa(true);
    setAviso(null);
    try {
      const r = await api<{ sugestao: string; modelo: string }>('whatsapp_sugerir_ia', {
        corpo: {
          conversa_id: conversaAtiva.id,
          pergunta: textoEnvio.trim(),
        },
      });
      setTextoEnvio(r.sugestao);
    } catch (e) {
      setAviso({ tipo: 'erro', texto: msgErro(e) });
    } finally {
      setGerandoIa(false);
    }
  };

  const alternarIaNaConversa = async (forcarEstadoPausada?: boolean) => {
    if (!conversaAtiva) return;
    try {
      const novoEstado =
        typeof forcarEstadoPausada === 'boolean'
          ? forcarEstadoPausada
          : !conversaAtiva.ia_pausada || Boolean(conversaAtiva.aguardando_humano);
      const r = await api<{ ia_pausada: boolean; aguardando_humano?: boolean; mensagem: string }>(
        'whatsapp_alternar_ia_conversa',
        {
          corpo: {
            conversa_id: conversaAtiva.id,
            ia_pausada: novoEstado,
          },
        },
      );
      setConversaAtiva({
        ...conversaAtiva,
        ia_pausada: r.ia_pausada,
        aguardando_humano: false,
      });
      if (novoEstado && !textoEnvio.trim()) {
        const pNome = (conversaAtiva.nome_contato || '').trim().split(' ')[0] || 'Morador';
        setTextoEnvio(`Olá, *${pNome}*! Aqui é do suporte da portaria, assumi seu atendimento. Como posso te ajudar?`);
      }
      setAviso({ tipo: 'ok', texto: r.mensagem });
      await carregarConversas(true);
      await carregarPainel();
    } catch (e) {
      setAviso({ tipo: 'erro', texto: msgErro(e) });
    }
  };

  const alterarStatusConversa = async (
    novoStatus: 'aberta' | 'encerrada',
    avisarMorador = false,
    conversaAlvo?: ConversaWhatsapp,
  ) => {
    const alvo = conversaAlvo || conversaAtiva;
    if (!alvo) return;
    setEnviando(true);
    try {
      const r = await api<{ status_atendimento: string; mensagem: string }>('whatsapp_alterar_status_conversa', {
        corpo: {
          conversa_id: alvo.id,
          status_atendimento: novoStatus,
          avisar_morador: avisarMorador,
        },
      });
      setAviso({ tipo: 'ok', texto: r.mensagem });

      if (novoStatus === 'encerrada' && (filtroStatusConv === 'aberta' || filtroStatusConv === 'humano')) {
        // Remove imediatamente da lista de Ativas e fecha/avança a janela para não continuar na tela de Ativas
        setConversas((prev) => {
          const restantes = prev.filter((c) => c.id !== alvo.id);
          if (conversaAtiva?.id === alvo.id) {
            const proxima = restantes[0] ?? null;
            conversaAtivaIdRef.current = proxima?.id ?? null;
            setConversaAtiva(proxima);
            if (!proxima) {
              setMensagens([]);
            }
          }
          return restantes;
        });
      } else {
        setConversaAtiva((prev) =>
          prev && prev.id === alvo.id
            ? {
                ...prev,
                status_atendimento: novoStatus,
                aguardando_humano: novoStatus === 'encerrada' ? false : prev.aguardando_humano,
                ia_pausada: novoStatus === 'encerrada' ? false : prev.ia_pausada,
              }
            : prev,
        );
        if (conversaAtiva && conversaAtiva.id === alvo.id) {
          await carregarMensagens(alvo.id, true);
        }
      }

      await carregarConversas(true);
      await carregarPainel();
    } catch (e) {
      setAviso({ tipo: 'erro', texto: msgErro(e) });
    } finally {
      setEnviando(false);
    }
  };

  const enviarBoasVindasDaConversa = async () => {
    if (!conversaAtiva?.usuario_id) return;
    setEnviando(true);
    try {
      const r = await api<{ mensagem: string }>('whatsapp_enviar_boas_vindas', {
        corpo: { usuario_id: conversaAtiva.usuario_id },
      });
      setAviso({ tipo: 'ok', texto: r.mensagem });
      await carregarMensagens(conversaAtiva.id, true);
    } catch (e) {
      setAviso({ tipo: 'erro', texto: msgErro(e) });
    } finally {
      setEnviando(false);
    }
  };

  const enviarNovaMensagemAvulsa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoTelefone.trim() || !novoTexto.trim()) return;
    setEnviando(true);
    try {
      const r = await api<{ conversa_id: number; mensagem: string }>('whatsapp_enviar_mensagem', {
        corpo: {
          telefone: novoTelefone.trim(),
          nome_contato: novoNome.trim() || novoTelefone.trim(),
          texto: novoTexto.trim(),
        },
      });
      setAviso({ tipo: 'ok', texto: r.mensagem });
      setModalNovaMsg(false);
      setNovoTelefone('');
      setNovoNome('');
      setNovoTexto('');
      setFiltroStatusConv('aberta');
      if (r.conversa_id) {
        conversaAtivaIdRef.current = r.conversa_id;
        await carregarMensagens(r.conversa_id, true, true);
      }
      await carregarConversas(true);
    } catch (err) {
      setAviso({ tipo: 'erro', texto: msgErro(err) });
    } finally {
      setEnviando(false);
    }
  };

  const salvarRegra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regraEditando) return;
    try {
      const r = await api<{ mensagem: string }>('whatsapp_regra_salvar', {
        corpo: {
          id: regraEditando.id ?? 0,
          titulo: regraEditando.titulo ?? '',
          gatilho: regraEditando.gatilho ?? '',
          resposta: regraEditando.resposta ?? '',
          ativo: regraEditando.ativo !== false,
          ordem: regraEditando.ordem ?? 10,
        },
      });
      setAviso({ tipo: 'ok', texto: r.mensagem });
      setRegraEditando(null);
      await carregarPainel();
    } catch (err) {
      setAviso({ tipo: 'erro', texto: msgErro(err) });
    }
  };

  const excluirRegra = async (id: number) => {
    if (!window.confirm('Remover esta regra de resposta automática?')) return;
    try {
      await api('whatsapp_regra_excluir', { corpo: { id } });
      await carregarPainel();
    } catch (err) {
      setAviso({ tipo: 'erro', texto: msgErro(err) });
    }
  };

  const testarIaNoSimulador = async () => {
    if (!perguntaTesteIa.trim() || testandoIa) return;
    setTestandoIa(true);
    setRespostaTesteIa('');
    try {
      const r = await api<{ sugestao: string; modelo: string }>('whatsapp_sugerir_ia', {
        corpo: {
          pergunta: perguntaTesteIa.trim(),
          ia_modelo: formCfg?.ia_modelo,
        },
      });
      setRespostaTesteIa(`🤖 [${r.modelo || formCfg?.ia_modelo || 'IA'}]:\n${r.sugestao}`);
    } catch (e) {
      setRespostaTesteIa('❌ ' + msgErro(e));
    } finally {
      setTestandoIa(false);
    }
  };

  const testarHumanizadorAntiban = async () => {
    setGerandoAmostras(true);
    try {
      const r = await api<{ amostras: string[] }>('whatsapp_fila_acao', {
        corpo: { acao: 'testar_humanizador' },
      });
      setAmostrasHumanizadas(r.amostras || []);
    } catch (e) {
      setAviso({ tipo: 'erro', texto: msgErro(e) });
    } finally {
      setGerandoAmostras(false);
    }
  };

  const executarAcaoFilaAntiban = async (acao: string, id?: number) => {
    try {
      const r = await api<{ mensagem: string }>('whatsapp_fila_acao', {
        corpo: { acao, id },
      });
      setAviso({ tipo: 'ok', texto: r.mensagem });
      await carregarPainel();
      if (conversaAtiva?.id) {
        await carregarMensagens(conversaAtiva.id, false);
      }
    } catch (e) {
      setAviso({ tipo: 'erro', texto: msgErro(e) });
    }
  };

  const evoConectado = Boolean(painel?.evolution.conectado);
  const usandoMetaOficial = (formCfg?.provedor_ativo ?? painel?.config.provedor_ativo ?? 'meta_oficial') === 'meta_oficial';
  const iaOnline = Boolean(painel?.ia_servidor.online);
  const pm2Online = Boolean(painel?.fila_antiban?.pm2_online);

  if (!ehAdminGeral) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="max-w-[1440px] mx-auto p-2.5 sm:p-4 space-y-3">
      {/* Barra Superior Unificada e Enxuta (Abas Principais + Status Compacto em 1 Linha) */}
      <div className="flex items-center justify-between gap-2 flex-wrap bg-white px-2.5 py-2 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setAba('chat')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition cursor-pointer ${
              aba === 'chat'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <MessageSquare size={15} />
            <span>Atendimento (Chat)</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[11px] font-extrabold ${
                aba === 'chat'
                  ? 'bg-white/25 text-white'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {contadoresConv.abertas}
            </span>
            {(painel?.estatisticas.nao_lidas ?? 0) > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px]">
                {painel?.estatisticas.nao_lidas} novas
              </span>
            )}
          </button>

          {contadoresConv.aguardando_humano > 0 && (
            <button
              type="button"
              onClick={() => alternarFiltroConversas('humano')}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition cursor-pointer ${
                aba === 'chat' && filtroStatusConv === 'humano'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'bg-rose-50 text-rose-800 border border-rose-300 hover:bg-rose-100 animate-pulse'
              }`}
            >
              <span>🚨 Humano</span>
              <span className="px-1.5 py-0.5 rounded-full text-[11px] font-extrabold bg-rose-600 text-white">
                {contadoresConv.aguardando_humano}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setAba('massa')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition cursor-pointer ${
              aba === 'massa'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Megaphone size={15} />
            <span>📢 Disparo em Massa</span>
          </button>

          <button
            type="button"
            onClick={() => setAba('automacao')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition cursor-pointer ${
              aba === 'automacao'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Zap size={15} />
            <span>Templates &amp; Regras</span>
          </button>

          <button
            type="button"
            onClick={() => setAba('ia_config')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition cursor-pointer ${
              aba === 'ia_config'
                ? 'bg-violet-600 text-white shadow-2xs'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Bot size={15} />
            <span>⚙️ IA &amp; API Meta</span>
          </button>
        </div>

        {/* Pílulas Compactas de Status na Direita (sem ocupar espaço vertical do Chat) */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setAba('ia_config')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-[11px] font-extrabold text-emerald-900 cursor-pointer"
            title="Clique para ver configurações da API Oficial da Meta"
          >
            <span className={`w-2 h-2 rounded-full ${evoConectado ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            <span>{usandoMetaOficial ? 'Meta Oficial' : 'Evolution QR'}</span>
          </button>

          {formCfg && (
            <button
              type="button"
              onClick={() => setAba('ia_config')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-extrabold cursor-pointer ${
                formCfg.ia_ativa
                  ? 'bg-violet-50 hover:bg-violet-100 border-violet-200 text-violet-900'
                  : 'bg-slate-100 border-slate-200 text-slate-600'
              }`}
              title="Modelo LLM em uso (clique para alterar modelo ou configurar IA)"
            >
              <span>🤖 {formCfg.ia_ativa ? formCfg.ia_modelo || 'qwen2.5:14b' : 'IA Pausada'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              carregarPainel();
              carregarConversas();
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-extrabold text-slate-700 cursor-pointer transition"
            title="Atualizar conversas e status"
          >
            <RefreshCw size={13} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
        </div>
      </div>

      {/* Cards Técnicos Detalhados — Exibidos apenas fora da aba de Chat para manter a tela de atendimento limpa */}
      {aba !== 'chat' && (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {/* Card 1: API Oficial da Meta (Cloud API) / Evolution API */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs flex flex-col justify-between gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  evoConectado ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
                }`}
              >
                <Phone size={18} />
              </div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700">
                {usandoMetaOficial ? 'API Oficial da Meta' : 'Evolution API (QR)'}
              </span>
            </div>

            {usandoMetaOficial ? (
              <button
                type="button"
                onClick={() => setAba('ia_config')}
                className="px-2.5 py-1 rounded-lg text-[11px] font-extrabold inline-flex items-center gap-1 shrink-0 cursor-pointer transition bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300"
              >
                <ShieldCheck size={13} />
                Oficial Ativa
              </button>
            ) : (
              <button
                type="button"
                onClick={() => abrirQrCode(false)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold inline-flex items-center gap-1 shrink-0 cursor-pointer transition ${
                  evoConectado
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-2xs'
                }`}
              >
                <QrCode size={13} />
                {evoConectado ? 'Status / QR' : 'Conectar QR'}
              </button>
            )}
          </div>

          <div className="space-y-0.5">
            <div className="text-xs sm:text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  evoConectado ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                }`}
              />
              <span>
                {evoConectado
                  ? `Conectado • ${formatarTelefoneExibicao(painel?.evolution.numero || '559885983566')}`
                  : 'WhatsApp Desconectado'}
              </span>
            </div>
            <div className="text-[11px] text-slate-500">
              {usandoMetaOficial
                ? `Conta Verificada: ${painel?.meta_oficial?.nome_verificado || 'Sectrum'} • Cloud API v22.0`
                : painel?.evolution.perfil_nome || 'api.zap.vps.seg.br'}
            </div>
          </div>
        </div>

        {/* Card 2: Servidor de IA com LLM (Ollama / Qwen 2.5 via Tailscale) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs flex flex-col justify-between gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  iaOnline ? 'bg-violet-100 text-violet-600' : 'bg-slate-100 text-slate-500'
                }`}
              >
                <Cpu size={18} />
              </div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-violet-700">
                Assistente IA (LLM Local)
              </span>
            </div>

            {formCfg && (
              <button
                type="button"
                onClick={() => {
                  const novo = { ...formCfg, ia_ativa: !formCfg.ia_ativa };
                  setFormCfg(novo);
                  void salvarConfig(novo);
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border cursor-pointer shrink-0 transition ${
                  formCfg.ia_ativa
                    ? 'bg-violet-50 text-violet-800 border-violet-300 hover:bg-violet-100'
                    : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}
              >
                {formCfg.ia_ativa ? '🤖 IA Ativa' : 'IA Pausada'}
              </button>
            )}
          </div>

          <div className="space-y-0.5">
            <div className="text-xs sm:text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  iaOnline ? 'bg-violet-500 animate-pulse' : 'bg-rose-500'
                }`}
              />
              <span>
                {iaOnline ? `Online • ${painel?.ia_servidor.modelo_atual || 'qwen2.5:14b'}` : 'Servidor LLM Offline'}
              </span>
            </div>
            <div className="text-[11px] text-slate-500">
              Tom Humano (2–3 linhas) • Zero Alucinação • <b>{painel?.estatisticas.respostas_automaticas ?? 0}</b> resp.
            </div>
          </div>
        </div>

        {/* Card 3: Disparo Direto (Meta Oficial) ou Fila PM2 Anti-Ban (Evolution) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs flex flex-col justify-between gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  usandoMetaOficial
                    ? 'bg-emerald-100 text-emerald-600'
                    : pm2Online
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-slate-100 text-slate-500'
                }`}
              >
                {usandoMetaOficial ? <Zap size={18} /> : <ShieldCheck size={18} />}
              </div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                {usandoMetaOficial ? 'Disparo Direto Cloud API' : 'Fila PM2 Anti-Ban'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setAba('automacao')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border cursor-pointer shrink-0 ${
                usandoMetaOficial
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                  : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
              }`}
            >
              {usandoMetaOficial ? '⚡ Regras' : '🛡️ Ver Fila'}
            </button>
          </div>

          <div className="space-y-0.5">
            <div className="text-xs sm:text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  usandoMetaOficial || pm2Online ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              <span>
                {usandoMetaOficial
                  ? 'Envio Instantâneo (Sem Fila PM2)'
                  : `${formCfg?.antiban_delay_min ?? 7}s a ${formCfg?.antiban_delay_max ?? 10}s + Digitando...`}
              </span>
            </div>
            <div className="text-[11px] text-slate-500">
              {usandoMetaOficial ? (
                <>
                  Total enviadas: <b>{painel?.estatisticas.mensagens_enviadas ?? 0}</b> • Daemon PM2 desligado
                </>
              ) : (
                <>
                  Na fila: <b>{painel?.fila_antiban?.na_fila ?? 0}</b> • Enviados: <b>{painel?.fila_antiban?.enviados ?? 0}</b>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Card 4: Transbordo Humano & Notificação WhatsApp quando a IA não resolver */}
        <div
          className={`rounded-2xl border p-3.5 shadow-2xs flex flex-col justify-between gap-2.5 ${
            contadoresConv.aguardando_humano > 0
              ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-500/20'
              : 'bg-white border-slate-200/90'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  contadoresConv.aguardando_humano > 0
                    ? 'bg-rose-600 text-white animate-bounce'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                <AlertCircle size={18} />
              </div>
              <span
                className={`text-[11px] font-extrabold uppercase tracking-wider ${
                  contadoresConv.aguardando_humano > 0 ? 'text-rose-800' : 'text-slate-600'
                }`}
              >
                Transbordo p/ Atendente
              </span>
            </div>

            <button
              type="button"
              onClick={() => alternarFiltroConversas('humano')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border cursor-pointer shrink-0 transition ${
                contadoresConv.aguardando_humano > 0
                  ? 'bg-rose-600 text-white border-rose-700 hover:bg-rose-700 shadow-2xs'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
            >
              {contadoresConv.aguardando_humano > 0
                ? `🚨 ${contadoresConv.aguardando_humano} Aguardando`
                : '👨‍💻 Fila Humana'}
            </button>
          </div>

          {formCfg && (
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <input
                  value={formCfg.telefone_notificacao_humano || ''}
                  onChange={(e) => setFormCfg({ ...formCfg, telefone_notificacao_humano: e.target.value })}
                  placeholder="WhatsApp Alerta (ex: 5598985983566)"
                  className="flex-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-[11px] font-mono outline-none focus:border-emerald-500"
                  title="Receba um WhatsApp imediato sempre que a IA não conseguir resolver ou o morador pedir atendente"
                />
                <button
                  type="button"
                  disabled={salvandoCfg}
                  onClick={() => {
                    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
                      void Notification.requestPermission();
                    }
                    void salvarConfig(formCfg);
                  }}
                  className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-extrabold cursor-pointer shrink-0"
                >
                  Salvar
                </button>
              </div>
              <div className="text-[10px] text-slate-500 leading-tight">
                Notifica seu WhatsApp + som no painel quando a IA não resolver
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* BANNER VERMELHO DE TRANSBORDO HUMANO QUANDO HOUVER MORADOR AGUARDANDO SUPORTE */}
      {contadoresConv.aguardando_humano > 0 && (
        <div className="bg-rose-600 text-white rounded-2xl p-3.5 shadow-sm flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center font-extrabold text-base animate-pulse">
              🚨
            </span>
            <div>
              <div className="text-xs sm:text-sm font-extrabold">
                Atenção: {contadoresConv.aguardando_humano} morador(es) aguardando atendimento humano agora!
              </div>
              <div className="text-[11px] text-rose-100">
                A IA pausou o robô automaticamente nessas conversas e bloqueou o encerramento por inatividade até você assumir.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => alternarFiltroConversas('humano')}
              className="px-3.5 py-2 rounded-xl bg-white text-rose-700 hover:bg-rose-50 text-xs font-extrabold cursor-pointer shadow-xs"
            >
              👨‍💻 Filtrar &amp; Assumir Agora ({contadoresConv.aguardando_humano})
            </button>
          </div>
        </div>
      )}

      {aviso && (
        <div
          className={`border-l-4 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-between gap-3 ${
            aviso.tipo === 'ok'
              ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
              : 'bg-rose-50 border-rose-500 text-rose-800'
          }`}
        >
          <span>{aviso.texto}</span>
          <button onClick={() => setAviso(null)} className="cursor-pointer">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ABA 1: CENTRAL DE MENSAGENS (LAYOUT ESTILO WHATSAPP WEB / CRM LIMPO E AMPLO) */}
      {aba === 'chat' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-12 h-[calc(100vh-145px)] min-h-[600px] max-h-[880px]">
          {/* Coluna Esquerda: Lista de Conversas */}
          <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col bg-white h-full overflow-hidden">
            {/* Cabeçalho da Lista */}
            <div className="p-3 border-b border-slate-200 space-y-2.5 bg-slate-50/70 shrink-0">
              {/* Seletor Ativas / Humano / Encerradas / Todas */}
              <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-200/70">
                <button
                  type="button"
                  onClick={() => alternarFiltroConversas('aberta')}
                  className={`py-1.5 px-1.5 rounded-lg text-[10px] font-extrabold flex items-center justify-center gap-1 cursor-pointer transition ${
                    filtroStatusConv === 'aberta'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-700 hover:bg-white/70'
                  }`}
                >
                  <span>🟢 Ativas</span>
                  <span
                    className={`px-1 rounded-full text-[9px] font-extrabold ${
                      filtroStatusConv === 'aberta' ? 'bg-white/25 text-white' : 'bg-white text-slate-700'
                    }`}
                  >
                    {contadoresConv.abertas}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => alternarFiltroConversas('humano')}
                  className={`py-1.5 px-1.5 rounded-lg text-[10px] font-extrabold flex items-center justify-center gap-1 cursor-pointer transition ${
                    filtroStatusConv === 'humano'
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : contadoresConv.aguardando_humano > 0
                        ? 'bg-rose-100 text-rose-800'
                        : 'text-slate-700 hover:bg-white/70'
                  }`}
                >
                  <span>🚨 Humano</span>
                  <span
                    className={`px-1 rounded-full text-[9px] font-extrabold ${
                      filtroStatusConv === 'humano'
                        ? 'bg-white/25 text-white'
                        : contadoresConv.aguardando_humano > 0
                          ? 'bg-rose-600 text-white'
                          : 'bg-white text-slate-700'
                    }`}
                  >
                    {contadoresConv.aguardando_humano}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => alternarFiltroConversas('encerrada')}
                  className={`py-1.5 px-1.5 rounded-lg text-[10px] font-extrabold flex items-center justify-center gap-1 cursor-pointer transition ${
                    filtroStatusConv === 'encerrada'
                      ? 'bg-slate-800 text-white shadow-2xs'
                      : 'text-slate-700 hover:bg-white/70'
                  }`}
                >
                  <span>📁 Fim</span>
                  <span
                    className={`px-1 rounded-full text-[9px] font-extrabold ${
                      filtroStatusConv === 'encerrada' ? 'bg-white/25 text-white' : 'bg-white text-slate-700'
                    }`}
                  >
                    {contadoresConv.encerradas}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => alternarFiltroConversas('todas')}
                  className={`py-1.5 px-1.5 rounded-lg text-[10px] font-extrabold flex items-center justify-center gap-1 cursor-pointer transition ${
                    filtroStatusConv === 'todas'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-700 hover:bg-white/70'
                  }`}
                >
                  <span>📋 Todas</span>
                  <span
                    className={`px-1 rounded-full text-[9px] font-extrabold ${
                      filtroStatusConv === 'todas' ? 'bg-white/25 text-white' : 'bg-white text-slate-700'
                    }`}
                  >
                    {contadoresConv.abertas + contadoresConv.encerradas}
                  </span>
                </button>
              </div>

              {/* Barra de Busca + Botões de Ação */}
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <input
                    value={buscaConv}
                    onChange={(e) => setBuscaConv(e.target.value)}
                    placeholder="Buscar nome, CPF, condomínio, apto..."
                    className="w-full pl-3 pr-7 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium outline-none focus:border-emerald-500"
                  />
                  {buscaConv && (
                    <button
                      type="button"
                      onClick={() => setBuscaConv('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  disabled={sincronizando}
                  onClick={sincronizarMoradores}
                  className="px-2.5 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                  title="Sincronizar moradores com telefone/CPF cadastrado"
                >
                  <Users size={13} />
                  <span className="hidden sm:inline">{sincronizando ? '...' : 'Base'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setModalNovaMsg(true)}
                  className="px-2.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold flex items-center gap-1 shrink-0 cursor-pointer shadow-2xs"
                >
                  <Plus size={13} /> Nova
                </button>
              </div>
            </div>

            {/* Lista Rolável de Contatos */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {conversas.length === 0 ? (
                <div className="p-8 text-center space-y-3">
                  <MessageSquare size={32} className="mx-auto text-emerald-500/60" />
                  <div className="text-xs font-extrabold text-slate-700">
                    {filtroStatusConv === 'aberta'
                      ? '✅ Nenhum atendimento ativo no momento!'
                      : filtroStatusConv === 'humano'
                        ? '✅ Nenhum morador aguardando atendente humano!'
                        : 'Nenhuma conversa encontrada para este filtro.'}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {filtroStatusConv === 'aberta'
                      ? 'Todas as conversas já foram respondidas e concluídas. Quando um morador enviar nova mensagem, ela aparecerá aqui automaticamente.'
                      : ''}
                  </div>
                  {filtroStatusConv === 'aberta' && contadoresConv.encerradas > 0 && (
                    <button
                      type="button"
                      onClick={() => alternarFiltroConversas('encerrada')}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-extrabold inline-flex items-center gap-2 cursor-pointer"
                    >
                      📁 Ver Histórico Encerradas ({contadoresConv.encerradas})
                    </button>
                  )}
                </div>
              ) : (
                conversas.map((c) => {
                  const selecionada = conversaAtiva?.id === c.id;
                  const cpfExib = c.cpf_confirmado || c.morador_cpf;
                  const nomeEhTelefone =
                    !c.nome_contato ||
                    c.nome_contato.replace(/\D/g, '') === c.telefone.replace(/\D/g, '');
                  const iniciais = obterIniciaisContato(c.nome_contato, c.telefone);
                  const estaAberta = c.status_atendimento !== 'encerrada';
                  const pedeHumano = Boolean(c.aguardando_humano) && estaAberta;

                  return (
                    <div
                      key={c.id}
                      onClick={() => {
                        if (conversaAtivaIdRef.current !== c.id) {
                          setTextoEnvio('');
                        }
                        conversaAtivaIdRef.current = c.id;
                        setConversaAtiva(c);
                      }}
                      className={`px-3 py-2.5 cursor-pointer transition flex items-start gap-2.5 ${
                        selecionada
                          ? pedeHumano
                            ? 'bg-rose-50/95 border-l-4 border-l-rose-600'
                            : 'bg-emerald-50/95 border-l-4 border-l-emerald-600'
                          : pedeHumano
                            ? 'bg-rose-50/50 hover:bg-rose-50 border-l-4 border-l-rose-500'
                            : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* Avatar com Iniciais */}
                      <div className="relative shrink-0 mt-0.5">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-extrabold shadow-2xs ${
                            pedeHumano
                              ? 'bg-rose-600 text-white animate-pulse'
                              : estaAberta
                                ? 'bg-emerald-600 text-white'
                                : cpfExib
                                  ? 'bg-slate-700 text-white'
                                  : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {iniciais}
                        </div>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                            pedeHumano ? 'bg-rose-500' : estaAberta ? 'bg-emerald-500' : 'bg-slate-400'
                          }`}
                        />
                      </div>

                      {/* Dados do Morador e Última Mensagem */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="font-extrabold text-xs sm:text-sm text-slate-900 truncate">
                            {nomeEhTelefone ? formatarTelefoneExibicao(c.telefone) : c.nome_contato}
                          </span>
                          <span className="text-[10px] text-slate-400 font-semibold shrink-0">
                            {formatarHoraMsg(c.ultima_interacao_em || c.atualizado_em)}
                          </span>
                        </div>

                        {/* Condomínio e Unidade */}
                        <div className="flex items-center gap-1 flex-wrap mt-0.5">
                          {pedeHumano && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[9px] font-extrabold animate-pulse">
                              🚨 AGUARDANDO ATENDENTE
                            </span>
                          )}
                          {c.condominio_nome ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-100/90 text-emerald-900 text-[10px] font-extrabold truncate max-w-[165px]">
                              🏢 {c.condominio_nome}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100/80 text-amber-900 text-[10px] font-bold">
                              ⏳ Aguardando CPF
                            </span>
                          )}
                          {c.unidade_label && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-extrabold truncate max-w-[120px]">
                              {c.unidade_label}
                            </span>
                          )}
                        </div>

                        {pedeHumano && c.motivo_humano && (
                          <div className="mt-1 px-1.5 py-0.5 rounded bg-rose-100/80 text-rose-900 text-[10px] font-bold truncate">
                            ⚠️ {c.motivo_humano}
                          </div>
                        )}

                        {/* Prévia da última mensagem + Badges de Status */}
                        <div className="flex items-center justify-between gap-2 mt-1">
                          <div className="text-[11px] text-slate-500 truncate flex-1">
                            {c.ultima_direcao === 'out' ? (
                              <span className="text-sky-600 font-bold mr-1">✓✓</span>
                            ) : null}
                            {c.ultima_mensagem || formatarTelefoneExibicao(c.telefone)}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {c.nao_lidas > 0 && (
                              <span className="px-1.5 py-0.2 rounded-full bg-emerald-500 text-white text-[10px] font-extrabold">
                                {c.nao_lidas}
                              </span>
                            )}
                            {c.status_atendimento === 'encerrada' ? (
                              <span className="px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 text-[9px] font-extrabold">
                                📁 Encerrado
                              </span>
                            ) : (
                              <>
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold ${
                                    pedeHumano
                                      ? 'bg-rose-100 text-rose-800'
                                      : c.ia_pausada
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-violet-100 text-violet-700'
                                  }`}
                                >
                                  {pedeHumano ? '🚨 Humano' : c.ia_pausada ? '👨‍💻 Humano' : '🤖 IA'}
                                </span>
                                <button
                                  type="button"
                                  disabled={enviando}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void alterarStatusConversa('encerrada', true, c);
                                  }}
                                  className="px-1.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-extrabold cursor-pointer shadow-2xs"
                                  title="Concluir atendimento agora e enviar aviso de conclusão no WhatsApp do morador"
                                >
                                  ✅ Encerrar
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Coluna Direita: Janela de Conversa Estilo WhatsApp Web */}
          <div className="lg:col-span-8 flex flex-col bg-[#efeae2]/65 h-full overflow-hidden">
            {!conversaAtiva ? (
              <div className="flex-1 flex flex-col items-center justify-center p-10 text-center text-slate-500">
                <div className="w-16 h-16 rounded-2xl bg-white shadow-xs border border-slate-200 flex items-center justify-center mb-3 text-emerald-600">
                  <MessageSquare size={32} />
                </div>
                <div className="font-extrabold text-slate-800 text-base">
                  Central de Atendimento WhatsApp &amp; Assistente IA
                </div>
                <div className="text-xs text-slate-500 mt-1 max-w-md leading-relaxed">
                  Selecione um contato na lista ao lado para visualizar o histórico completo de mensagens ou iniciar uma conversa.
                </div>
              </div>
            ) : (
              <>
                {/* Cabeçalho da Conversa Ativa */}
                <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 ${
                        conversaAtiva.aguardando_humano
                          ? 'bg-rose-600 text-white animate-pulse'
                          : conversaAtiva.status_atendimento === 'encerrada'
                            ? 'bg-slate-700 text-white'
                            : 'bg-emerald-600 text-white'
                      }`}
                    >
                      {obterIniciaisContato(conversaAtiva.nome_contato, conversaAtiva.telefone)}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-extrabold text-slate-900 text-sm sm:text-base truncate">
                          {conversaAtiva.nome_contato || formatarTelefoneExibicao(conversaAtiva.telefone)}
                        </span>
                        {conversaAtiva.condominio_nome && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[11px] font-extrabold border border-emerald-300">
                            🏢 {conversaAtiva.condominio_nome}
                          </span>
                        )}
                        {conversaAtiva.unidade_label && (
                          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[11px] font-extrabold">
                            {conversaAtiva.unidade_label}
                          </span>
                        )}
                        {conversaAtiva.aguardando_humano ? (
                          <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-extrabold animate-pulse">
                            🚨 Aguardando Atendente
                          </span>
                        ) : conversaAtiva.status_atendimento === 'encerrada' ? (
                          <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-extrabold">
                            📁 Encerrado
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">
                            🟢 Em Atendimento
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-500 font-medium mt-0.5 flex items-center gap-2 flex-wrap">
                        <span className="font-mono">{formatarTelefoneExibicao(conversaAtiva.telefone)}</span>
                        {(conversaAtiva.cpf_confirmado || conversaAtiva.morador_cpf) ? (
                          <span className="text-slate-700 font-bold">
                            • CPF: {formatarCpfExibicao(conversaAtiva.cpf_confirmado || conversaAtiva.morador_cpf)}
                          </span>
                        ) : (
                          <span className="text-amber-700 font-semibold">• ⏳ Aguardando confirmação de CPF</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Botões de Controle Rápido da Conversa */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {conversaAtiva.usuario_id && (
                      <button
                        type="button"
                        disabled={enviando}
                        onClick={enviarBoasVindasDaConversa}
                        className="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                        title="Enviar mensagem de Boas-Vindas com Login, Senha padrão (mudar@123) e Ramal"
                      >
                        <UserCheck size={13} /> Enviar Acesso
                      </button>
                    )}

                    {conversaAtiva.aguardando_humano || !conversaAtiva.ia_pausada ? (
                      <button
                        type="button"
                        onClick={() => alternarIaNaConversa(true)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border flex items-center gap-1 cursor-pointer transition ${
                          conversaAtiva.aguardando_humano
                            ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-700 shadow-xs animate-pulse'
                            : 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-2xs'
                        }`}
                        title="Assume o atendimento humano agora, pausa o robô/IA nesta conversa e prepara a resposta"
                      >
                        👨‍💻 Assumir Atendimento
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => alternarIaNaConversa(false)}
                        className="px-3 py-1.5 rounded-xl text-xs font-extrabold border bg-violet-50 hover:bg-violet-100 text-violet-800 border-violet-300 flex items-center gap-1 cursor-pointer transition"
                        title="Devolve o atendimento desta conversa para a IA automática"
                      >
                        <Bot size={13} /> 🤖 Devolver p/ IA
                      </button>
                    )}

                    {(conversaAtiva.status_atendimento !== 'encerrada' ||
                      !(
                        (conversaAtiva.ultima_mensagem || '').includes('atendimento foi concluído') ||
                        mensagens.some(
                          (m) =>
                            m.direcao === 'out' &&
                            (m.origem === 'auto_encerramento' || (m.conteudo || '').includes('atendimento foi concluído')),
                        )
                      )) && (
                      <button
                        type="button"
                        disabled={enviando}
                        onClick={() => alterarStatusConversa('encerrada', true)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 text-xs font-extrabold flex items-center gap-1 cursor-pointer shadow-xs transition disabled:opacity-50"
                        title="Finaliza o atendimento e envia no WhatsApp do morador o aviso de que o atendimento foi concluído"
                      >
                        ✅ Encerrar Atendimento
                      </button>
                    )}

                    {conversaAtiva.status_atendimento === 'encerrada' && (
                      <button
                        type="button"
                        disabled={enviando}
                        onClick={() => alterarStatusConversa('aberta', false)}
                        className="px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-300 text-xs font-extrabold cursor-pointer disabled:opacity-50"
                      >
                        🔄 Reabrir
                      </button>
                    )}
                  </div>
                </div>

                {/* FAIXA DE TRANSBORDO HUMANO NO TOPO DA CONVERSA ATIVA */}
                {(conversaAtiva.aguardando_humano || conversaAtiva.ia_pausada) && conversaAtiva.status_atendimento !== 'encerrada' && (
                  <div
                    className={`px-4 py-2.5 border-b flex items-center justify-between gap-3 flex-wrap shrink-0 ${
                      conversaAtiva.aguardando_humano
                        ? 'bg-rose-50 border-rose-200 text-rose-950'
                        : 'bg-amber-50 border-amber-200 text-amber-950'
                    }`}
                  >
                    <div className="text-xs font-bold flex items-center gap-2">
                      <span>{conversaAtiva.aguardando_humano ? '🚨' : '👨‍💻'}</span>
                      <div>
                        {conversaAtiva.aguardando_humano ? (
                          <>
                            <b>Aguardando Atendente Humano:</b>{' '}
                            {conversaAtiva.motivo_humano || 'A IA transferiu este atendimento para suporte humano.'}
                          </>
                        ) : (
                          <>
                            <b>Atendimento Humano Assumido:</b> A IA automática está pausada nesta conversa para você conversar livremente com o morador.
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {conversaAtiva.aguardando_humano && (
                        <button
                          type="button"
                          onClick={() => alternarIaNaConversa(true)}
                          className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold cursor-pointer shadow-2xs"
                        >
                          ✅ Assumir &amp; Responder Agora
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => alternarIaNaConversa(false)}
                        className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-[11px] font-bold cursor-pointer"
                      >
                        🤖 Reativar IA
                      </button>
                    </div>
                  </div>
                )}

                {/* Área Rolável de Mensagens (Balões Estilo WhatsApp Web) */}
                <div ref={fimChatRef} className="flex-1 px-4 py-3 overflow-y-auto space-y-2.5">
                  {/* Pílula informativa no topo do chat */}
                  <div className="flex justify-center mb-2">
                    <div className="px-3 py-1 rounded-full bg-white/90 border border-slate-200/80 text-[11px] font-semibold text-slate-600 shadow-2xs text-center">
                      🔒 Atendimento via <b>API Oficial da Meta</b> • Respostas humanas curtas (2–3 linhas) com dados reais do banco
                    </div>
                  </div>

                  {mensagens.length === 0 ? (
                    <div className="text-center py-12 text-xs font-semibold text-slate-500">
                      Nenhuma mensagem trocada ainda com este contato. Envie uma mensagem abaixo!
                    </div>
                  ) : (
                    mensagens.map((m) => {
                      const enviada = m.direcao === 'out';
                      return (
                        <div
                          key={m.id}
                          className={`flex ${enviada ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[85%] sm:max-w-[74%] rounded-2xl px-3.5 py-2 shadow-2xs text-xs sm:text-[13px] ${
                              enviada
                                ? 'bg-[#d9fdd3] text-slate-900 border border-[#bde9b6] rounded-tr-xs'
                                : 'bg-white text-slate-900 border border-slate-200/90 rounded-tl-xs'
                            }`}
                          >
                            {enviada ? (
                              <div className="mb-1 flex items-center justify-between gap-2 flex-wrap">
                                {badgeOrigemMensagem(m.origem)}
                                {m.status_envio === 'na_fila' && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-900 text-[10px] font-extrabold animate-pulse">
                                    ⏳ Na Fila
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="mb-0.5 text-[11px] font-extrabold text-emerald-700">
                                {conversaAtiva.nome_contato?.split(' ')[0] || 'Morador'}
                              </div>
                            )}

                            {m.midia_url && (
                              <div className="mb-2 rounded-xl overflow-hidden border border-black/10 bg-black/5">
                                <a href={m.midia_url} target="_blank" rel="noreferrer" title="Abrir imagem em tamanho real">
                                  <img
                                    src={m.midia_url}
                                    alt="Anexo enviado"
                                    className="w-full max-h-64 object-cover hover:opacity-95 transition"
                                  />
                                </a>
                              </div>
                            )}

                            <div className="whitespace-pre-wrap leading-relaxed break-words">
                              {m.conteudo}
                            </div>

                            {m.status_envio === 'erro' && m.erro_detalhe && (
                              <div className="mt-2 p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-[11px] space-y-1.5">
                                {m.erro_detalhe.includes('131047') || m.erro_detalhe.includes('24 hours') ? (
                                  <>
                                    <div className="font-extrabold text-rose-800 flex items-center gap-1">
                                      ⏳ Retida pela Janela de 24h da Meta (#131047)
                                    </div>
                                    <p className="text-[11px] text-slate-700 font-medium leading-snug">
                                      Na API Oficial da Meta, o primeiro contato ativo exige que o <b>Template Oficial</b> esteja aprovado pela Meta (atualmente <i>Em Análise / PENDING</i>) ou que o morador tenha enviado mensagem nas últimas 24h.{' '}
                                      <b>Assim que este morador mandar um &ldquo;Oi&rdquo;, o sistema entregará este acesso automaticamente!</b>
                                    </p>
                                  </>
                                ) : (
                                  <div className="font-bold text-rose-900">
                                    ⚠️ Falha no envio: {m.erro_detalhe}
                                  </div>
                                )}
                                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                  <a
                                    href={`https://wa.me/${conversaAtiva.telefone.replace(/\D/g, '')}?text=${encodeURIComponent(m.conteudo)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-extrabold inline-flex items-center gap-1 shadow-2xs"
                                  >
                                    📲 Enviar pelo WhatsApp Web (1 Clique)
                                  </a>
                                  <button
                                    type="button"
                                    disabled={enviando}
                                    onClick={() => {
                                      if (m.origem === 'auto_aprovacao' && conversaAtiva.usuario_id) {
                                        enviarBoasVindasDaConversa();
                                      } else {
                                        setTextoEnvio(m.conteudo);
                                      }
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-amber-300 text-amber-900 text-[10px] font-extrabold cursor-pointer"
                                  >
                                    🔄 Tentar Reenviar API
                                  </button>
                                </div>
                              </div>
                            )}

                            <div className="text-[10px] mt-1 text-right text-slate-500 flex items-center justify-end gap-1">
                              <span>{formatarHoraMsg(m.criado_em)}</span>
                              {enviada && m.status_envio === 'enviado' && (
                                <span className="text-sky-600 font-extrabold text-[11px]" title="Entregue">
                                  ✓✓
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Barra de Respostas Rápidas Naturais (1–2 linhas) + Sugestão IA */}
                <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-200 flex items-center gap-1.5 overflow-x-auto shrink-0">
                  <button
                    type="button"
                    disabled={gerandoIa}
                    onClick={sugerirComIaNoChat}
                    className="px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-extrabold flex items-center gap-1 shrink-0 cursor-pointer shadow-2xs disabled:opacity-60"
                  >
                    <Sparkles size={12} />
                    {gerandoIa ? 'Gerando resposta...' : '✨ Sugerir com IA'}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setTextoEnvio(
                        `Olá! 😊 Tudo bem? Me informa o seu *CPF (11 números)* rapidinho para eu localizar o seu cadastro e condomínio?`,
                      )
                    }
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-bold shrink-0 cursor-pointer"
                  >
                    🪪 Pedir CPF
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setTextoEnvio(
                        `Oi, *${conversaAtiva.nome_contato?.split(' ')[0] || 'Morador'}*! O acesso ao app é em https://cond.vps.seg.br usando seu CPF. Se quiser que eu resete sua senha para *mudar@123*, é só me confirmar!`,
                      )
                    }
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-bold shrink-0 cursor-pointer"
                  >
                    🔑 App / Senha (mudar@123)
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setTextoEnvio(
                        `Oi, *${conversaAtiva.nome_contato?.split(' ')[0] || 'Morador'}*! Seu cadastro e reconhecimento facial já estão ativos e liberados na portaria! ✅`,
                      )
                    }
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-bold shrink-0 cursor-pointer"
                  >
                    ✅ Facial Liberada
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setTextoEnvio(
                        `Oi, *${conversaAtiva.nome_contato?.split(' ')[0] || 'Morador'}*! Você mesmo(a) cadastra e libera a facial direto no app (https://cond.vps.seg.br): abra o menu *Filhos / Dependentes* (ou *Funcionários do Apto*), preencha os dados e envie uma *foto de rosto (selfie)* que já sincroniza na hora com a portaria! 😊`,
                      )
                    }
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-bold shrink-0 cursor-pointer"
                  >
                    👨‍👩‍👧 Dependente / Facial
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setTextoEnvio(
                        `Oi, *${conversaAtiva.nome_contato?.split(' ')[0] || 'Morador'}*! Para liberar visitante, abra o menu *Convites e Visitas* no app (https://cond.vps.seg.br), gere o link e envie no WhatsApp do visitante para ele tirar a selfie! 🎟️`,
                      )
                    }
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-bold shrink-0 cursor-pointer"
                  >
                    🎟️ Convite Visitante
                  </button>
                </div>

                {/* Preview de foto anexada no chat individual */}
                {fotoChatBase64 && (
                  <div className="px-3.5 py-2 bg-emerald-50 border-t border-emerald-200 flex items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={fotoChatBase64}
                        alt="Foto anexada"
                        className="w-12 h-12 rounded-xl object-cover border border-emerald-300 shrink-0"
                      />
                      <div className="text-xs font-extrabold text-emerald-950 truncate">
                        📷 Foto pronta para enviar com a mensagem abaixo
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFotoChatBase64('')}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold cursor-pointer shrink-0"
                    >
                      Remover Foto
                    </button>
                  </div>
                )}

                {/* Caixa de Digitação Estilo WhatsApp Web */}
                <form onSubmit={enviarMensagemChat} className="p-2.5 bg-[#f0f2f5] border-t border-slate-200 flex gap-2 items-end shrink-0">
                  <input
                    ref={inputFotoChatRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      try {
                        const b64 = await lerEComprimirImagemParaBase64(file);
                        setFotoChatBase64(b64);
                      } catch (err) {
                        setAviso({ tipo: 'erro', texto: msgErro(err) });
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => inputFotoChatRef.current?.click()}
                    className={`p-3 rounded-xl border text-xs font-extrabold flex items-center justify-center cursor-pointer shrink-0 transition ${
                      fotoChatBase64
                        ? 'bg-emerald-600 text-white border-emerald-700'
                        : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                    }`}
                    title="Anexar foto nesta conversa"
                  >
                    <ImagePlus size={17} />
                  </button>
                  <textarea
                    rows={2}
                    value={textoEnvio}
                    onChange={(e) => setTextoEnvio(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void enviarMensagemChat();
                      }
                    }}
                    placeholder="Digite uma mensagem curta (Enter envia, Shift+Enter quebra linha) ou anexe uma foto 📷..."
                    className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm outline-none focus:border-emerald-500 resize-none"
                  />
                  <button
                    type="submit"
                    disabled={enviando || (!textoEnvio.trim() && !fotoChatBase64)}
                    className="px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs"
                  >
                    <Send size={15} />
                    {enviando ? 'Enviando...' : 'Enviar'}
                  </button>
                  <button
                    type="button"
                    disabled={enviando}
                    onClick={() => alterarStatusConversa('encerrada', true)}
                    className="px-3.5 py-3 rounded-xl bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs"
                    title="Encerrar atendimento agora e enviar mensagem de conclusão para o morador"
                  >
                    ✅ Encerrar
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* ABA DE DISPARO EM MASSA POR CONDOMÍNIO (COMUNICADOS / ATUALIZAÇÃO DO APP COM TEXTO + FOTO) */}
      {aba === 'massa' && (() => {
        const destFiltradosBusca = destinatariosMassa.filter((d) => {
          if (!buscaDestMassa.trim()) return true;
          const b = buscaDestMassa.toLowerCase();
          return (
            d.nome.toLowerCase().includes(b) ||
            d.telefone.includes(b) ||
            d.unidade_label.toLowerCase().includes(b) ||
            d.condominio_nome.toLowerCase().includes(b) ||
            (d.cpf && d.cpf.includes(b))
          );
        });
        const totalMarcados = destinatariosMassa.filter(
          (d) => !telefonesDesmarcadosMassa.has(d.telefone),
        ).length;
        const exemploDest = destinatariosMassa[0] || {
          nome: 'Carlos Eduardo',
          condominio_nome:
            condominiosMassa.find((c) => c.id === condominioIdMassa)?.nome || 'Condomínio Exemplo',
          unidade_label: 'Bloco A - Apto 101',
          ramal: '1101',
          cpf: '12345678900',
        };
        const primeiroNomeEx = (exemploDest.nome || 'Morador').split(' ')[0] || 'Morador';
        const previewTextoRenderizado = (() => {
          const base = textoMassa
            .replace(/\{primeiro_nome\}/g, primeiroNomeEx)
            .replace(/\{nome\}/g, exemploDest.nome)
            .replace(/\{condominio\}/g, exemploDest.condominio_nome)
            .replace(/\{unidade\}/g, exemploDest.unidade_label)
            .replace(/\{ramal\}/g, exemploDest.ramal)
            .replace(/\{cpf\}/g, exemploDest.cpf || '')
            .replace(/\{link_app\}/g, 'https://cond.vps.seg.br');
          return tituloMassa.trim() && !base.includes(tituloMassa.trim())
            ? `*${tituloMassa.trim()}*\n\n${base}`
            : base;
        })();

        return (
          <div className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Coluna Esquerda: Configuração do Comunicado, Foto e Disparo */}
              <form
                onSubmit={executarDisparoMassa}
                className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap border-b border-slate-100 pb-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                      <Megaphone size={22} />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-base">
                        📢 Disparo em Massa por Condomínio (Texto + Foto)
                      </h3>
                      <p className="text-xs text-slate-500">
                        Envie avisos de atualização do aplicativo, novas funcionalidades ou comunicados para todos os contatos de um condomínio
                      </p>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-extrabold">
                    {totalMarcados} de {destinatariosMassa.length} selecionados
                  </span>
                </div>

                {/* 1. Escolha do Condomínio, Bloco e Público */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-700 mb-1 flex items-center gap-1">
                      <Building2 size={13} className="text-amber-600" />
                      1. Selecionar Condomínio
                    </label>
                    <select
                      value={condominioIdMassa}
                      onChange={(e) => {
                        setCondominioIdMassa(Number(e.target.value));
                        setBlocoIdMassa(0);
                        setTelefonesDesmarcadosMassa(new Set());
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-extrabold text-slate-900 outline-none focus:border-amber-500"
                    >
                      <option value={0}>🌐 Todos os Condomínios</option>
                      {condominiosMassa.map((c) => (
                        <option key={c.id} value={c.id}>
                          🏢 {c.nome} ({c.total_moradores_fone} moradores / {c.total_conversas} chats)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                      2. Filtrar Bloco (Opcional)
                    </label>
                    <select
                      value={blocoIdMassa}
                      disabled={condominioIdMassa === 0 || blocosMassa.length === 0}
                      onChange={(e) => {
                        setBlocoIdMassa(Number(e.target.value));
                        setTelefonesDesmarcadosMassa(new Set());
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white disabled:bg-slate-100 text-xs sm:text-sm font-bold text-slate-800 outline-none focus:border-amber-500"
                    >
                      <option value={0}>Todos os Blocos</option>
                      {blocosMassa.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                      3. Origem dos Contatos
                    </label>
                    <select
                      value={filtroPublicoMassa}
                      onChange={(e) => {
                        setFiltroPublicoMassa(
                          e.target.value as 'todos' | 'apenas_moradores' | 'apenas_conversas',
                        );
                        setTelefonesDesmarcadosMassa(new Set());
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-bold text-slate-800 outline-none focus:border-amber-500"
                    >
                      <option value="todos">Todos (Moradores + Chats WhatsApp)</option>
                      <option value="apenas_moradores">Apenas Moradores Cadastrados</option>
                      <option value="apenas_conversas">Apenas Conversas do WhatsApp</option>
                    </select>
                  </div>
                </div>

                {/* 2. Modelos Prontos de 1 Clique */}
                <div>
                  <div className="text-[11px] font-extrabold text-slate-600 mb-1.5">
                    ✨ Modelos Prontos Rápidos (Clique para preencher e edite como quiser):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setTituloMassa('🚀 Atualização do Aplicativo Sectrum — Novas Funcionalidades!');
                        setTextoMassa(
                          'Olá, *{primeiro_nome}*! 👋\n\n' +
                            'Acabamos de liberar uma atualização com novas funcionalidades no aplicativo do *{condominio}* ({unidade}):\n\n' +
                            '🆘 *Novo Botão de Emergência (SOS):* Opções de *Emergência Médica* e *Segurança* que tocam sirene e alertam imediatamente os moradores do seu bloco, a Portaria e o Síndico.\n' +
                            '📞 *Interfone Digital Full-Duplex:* Agora você pode conversar em tempo real como numa chamada telefônica, alternar entre *🔊 Viva-Voz* e *👂 No Ouvido* e receber chamadas mesmo com a tela bloqueada.\n\n' +
                            '📲 Acesse agora pelo link: {link_app}',
                        );
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-extrabold cursor-pointer transition"
                    >
                      🚀 Novidades / Atualização do App
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setTituloMassa('📢 Comunicado Importante da Administração');
                        setTextoMassa(
                          'Olá, *{primeiro_nome}* ({unidade})! 👋\n\n' +
                            'A administração do *{condominio}* informa:\n\n' +
                            'Digite aqui os detalhes do comunicado para todos os moradores...\n\n' +
                            '📲 Acompanhe também pelo aplicativo: {link_app}',
                        );
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-xs font-bold cursor-pointer transition"
                    >
                      📢 Comunicado Geral
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setTituloMassa('🙂 Atualize sua Biometria Facial e Cadastro no App');
                        setTextoMassa(
                          'Olá, *{primeiro_nome}*! 👋\n\n' +
                            'Lembramos a todos os moradores do *{condominio}* ({unidade}) que mantenham a *Biometria Facial*, veículos e dependentes atualizados no nosso aplicativo para agilizar o acesso na portaria.\n\n' +
                            '📞 *Ramal do seu Apto:* *{ramal}*\n' +
                            '🔗 *Acesse o App:* {link_app}',
                        );
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-xs font-bold cursor-pointer transition"
                    >
                      🙂 Lembrete de Biometria &amp; App
                    </button>
                  </div>
                </div>

                {/* 3. Título e Texto do Comunicado */}
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    Título do Comunicado / Aviso
                  </label>
                  <input
                    required
                    value={tituloMassa}
                    onChange={(e) => setTituloMassa(e.target.value)}
                    placeholder="Ex.: 🚀 Atualização do Aplicativo — Novas Funcionalidades!"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm font-bold text-slate-900 outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                    <label className="block text-xs font-extrabold text-slate-700">
                      Mensagem que será enviada no WhatsApp
                    </label>
                    <div className="flex flex-wrap gap-1 items-center">
                      <span className="text-[10px] font-bold text-slate-500">Inserir variável:</span>
                      {[
                        '{primeiro_nome}',
                        '{nome}',
                        '{condominio}',
                        '{unidade}',
                        '{ramal}',
                        '{link_app}',
                      ].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setTextoMassa((atual) => `${atual} ${v}`)}
                          className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[10px] font-bold cursor-pointer"
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    required
                    rows={7}
                    value={textoMassa}
                    onChange={(e) => setTextoMassa(e.target.value)}
                    placeholder="Digite o texto da mensagem... Você pode colar uma imagem (Ctrl+V) ou anexar no botão abaixo!"
                    onPaste={async (e) => {
                      const items = e.clipboardData?.items;
                      if (!items) return;
                      for (let i = 0; i < items.length; i++) {
                        if (items[i].type.startsWith('image/')) {
                          const file = items[i].getAsFile();
                          if (file) {
                            e.preventDefault();
                            try {
                              const b64 = await lerEComprimirImagemParaBase64(file);
                              setFotoMassaBase64(b64);
                              setFotoMassaNome(file.name || 'imagem-colada.jpg');
                            } catch (err) {
                              setAviso({ tipo: 'erro', texto: msgErro(err) });
                            }
                          }
                          break;
                        }
                      }
                    }}
                    className="w-full p-3 rounded-xl border border-slate-300 text-xs sm:text-sm outline-none focus:border-amber-500 leading-relaxed"
                  />
                </div>

                {/* 4. Anexo de Foto / Imagem */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <ImagePlus size={18} className="text-amber-600" />
                      <div>
                        <div className="text-xs font-extrabold text-slate-800">
                          📷 Anexar Foto / Print da Novidade (Opcional)
                        </div>
                        <div className="text-[11px] text-slate-500">
                          A foto será enviada no WhatsApp junto com o texto acima como legenda (você também pode colar com Ctrl+V)
                        </div>
                      </div>
                    </div>

                    <input
                      ref={inputFotoMassaRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        try {
                          const b64 = await lerEComprimirImagemParaBase64(file);
                          setFotoMassaBase64(b64);
                          setFotoMassaNome(file.name);
                        } catch (err) {
                          setAviso({ tipo: 'erro', texto: msgErro(err) });
                        }
                      }}
                    />

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => inputFotoMassaRef.current?.click()}
                        className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      >
                        <ImagePlus size={15} className="text-amber-600" />
                        {fotoMassaBase64 ? 'Trocar Foto' : 'Escolher Foto'}
                      </button>
                      {fotoMassaBase64 && (
                        <button
                          type="button"
                          onClick={() => {
                            setFotoMassaBase64('');
                            setFotoMassaNome('');
                          }}
                          className="px-2.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-extrabold cursor-pointer"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  </div>

                  {fotoMassaBase64 && (
                    <div className="flex items-center gap-3 pt-1">
                      <img
                        src={fotoMassaBase64}
                        alt="Preview anexo"
                        className="w-20 h-20 rounded-xl object-cover border border-amber-300 shadow-xs"
                      />
                      <div className="text-xs text-emerald-800 font-bold">
                        ✅ Foto anexada ({fotoMassaNome || 'imagem.jpg'}) — pronta para envio via API Oficial da Meta!
                      </div>
                    </div>
                  )}
                </div>

                {/* 5. Canais extras (Push no App + Mural de Avisos) */}
                <div className="flex flex-wrap gap-3 pt-1">
                  <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enviarPushMassa}
                      onChange={(e) => setEnviarPushMassa(e.target.checked)}
                      className="w-4 h-4 accent-emerald-600"
                    />
                    <span className="text-xs font-extrabold text-emerald-950">
                      📲 Enviar também Notificação Push nos celulares dos moradores
                    </span>
                  </label>

                  <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50 border border-blue-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={publicarMuralMassa}
                      onChange={(e) => setPublicarMuralMassa(e.target.checked)}
                      className="w-4 h-4 accent-blue-600"
                    />
                    <span className="text-xs font-extrabold text-blue-950">
                      📌 Publicar também no Mural de Avisos do App
                    </span>
                  </label>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={disparandoMassa || totalMarcados === 0 || !textoMassa.trim()}
                    className="w-full py-3.5 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-sm sm:text-base shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer transition"
                  >
                    <Send size={18} />
                    {disparandoMassa
                      ? `⏳ Disparando para ${totalMarcados} contatos (aguarde)...`
                      : `📢 DISPARAR MENSAGEM EM MASSA PARA ${totalMarcados} CONTATO(S)`}
                  </button>
                </div>
              </form>

              {/* Coluna Direita: Prévia Visual Estilo WhatsApp + Seleção de Contatos do Condomínio */}
              <div className="lg:col-span-5 space-y-5">
                {/* Card de Prévia ao Vivo no formato WhatsApp */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                  <div className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                    <span>📱 Prévia de como chegará no WhatsApp do Morador</span>
                    <span className="text-[10px] text-emerald-700 font-bold">
                      Exemplo: {exemploDest.nome}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[#efeae2] border border-slate-200">
                    <div className="max-w-[92%] ml-auto rounded-2xl rounded-tr-xs bg-[#d9fdd3] border border-[#bde9b6] p-3 shadow-xs text-xs text-slate-900 space-y-2">
                      {fotoMassaBase64 && (
                        <div className="rounded-xl overflow-hidden border border-black/10">
                          <img
                            src={fotoMassaBase64}
                            alt="Preview WhatsApp"
                            className="w-full max-h-52 object-cover"
                          />
                        </div>
                      )}
                      <div className="whitespace-pre-wrap leading-relaxed break-words">
                        {previewTextoRenderizado}
                      </div>
                      <div className="text-[10px] text-slate-500 text-right font-semibold">
                        Agora • ✓✓
                      </div>
                    </div>
                  </div>
                </div>

                {/* Lista de Destinatários do Condomínio com Marcar / Desmarcar */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <h4 className="font-extrabold text-slate-900 text-sm">
                        👥 Contatos do Condomínio ({totalMarcados}/{destinatariosMassa.length})
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Você pode desmarcar contatos específicos se desejar
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setTelefonesDesmarcadosMassa(new Set())}
                        className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold cursor-pointer"
                      >
                        Marcar Todos
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setTelefonesDesmarcadosMassa(
                            new Set(destinatariosMassa.map((d) => d.telefone)),
                          )
                        }
                        className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold cursor-pointer"
                      >
                        Desmarcar Todos
                      </button>
                    </div>
                  </div>

                  <input
                    value={buscaDestMassa}
                    onChange={(e) => setBuscaDestMassa(e.target.value)}
                    placeholder="Filtrar contato por nome, apto, telefone..."
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs outline-none focus:border-amber-500"
                  />

                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
                    {carregandoMassa ? (
                      <div className="p-6 text-center text-xs font-bold text-slate-500">
                        Carregando contatos do condomínio...
                      </div>
                    ) : destFiltradosBusca.length === 0 ? (
                      <div className="p-6 text-center text-xs font-semibold text-slate-500">
                        Nenhum contato com telefone encontrado para este filtro.
                      </div>
                    ) : (
                      destFiltradosBusca.map((d) => {
                        const marcado = !telefonesDesmarcadosMassa.has(d.telefone);
                        return (
                          <div
                            key={d.telefone}
                            onClick={() => {
                              setTelefonesDesmarcadosMassa((atual) => {
                                const novo = new Set(atual);
                                if (novo.has(d.telefone)) {
                                  novo.delete(d.telefone);
                                } else {
                                  novo.add(d.telefone);
                                }
                                return novo;
                              });
                            }}
                            className={`px-3 py-2 flex items-center justify-between gap-2 text-xs cursor-pointer transition ${
                              marcado ? 'bg-white hover:bg-emerald-50/40' : 'bg-slate-50 opacity-60'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {marcado ? (
                                <CheckSquare size={15} className="text-emerald-600 shrink-0" />
                              ) : (
                                <Square size={15} className="text-slate-400 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <div className="font-extrabold text-slate-900 truncate flex items-center gap-1.5">
                                  <span className="truncate">{d.nome}</span>
                                  <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold shrink-0">
                                    {d.unidade_label}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                                  <span>{formatarTelefoneExibicao(d.telefone)}</span>
                                  <span>•</span>
                                  <span className="truncate">{d.condominio_nome}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {d.janela_24h_aberta && (
                                <span
                                  className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-extrabold"
                                  title="Conversa com janela de 24h aberta na Meta"
                                >
                                  24h
                                </span>
                              )}
                              {d.tem_push_app && (
                                <span
                                  className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[9px] font-extrabold"
                                  title="Possui Push ativo no celular"
                                >
                                  Push
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Histórico de Disparos em Massa Recentes */}
            {campanhasMassa.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
                <h4 className="font-extrabold text-slate-900 text-sm">
                  🕓 Últimos Disparos em Massa Realizados
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {campanhasMassa.map((c) => (
                    <div
                      key={c.id}
                      className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 flex gap-3 items-start"
                    >
                      {c.midia_url && (
                        <a href={c.midia_url} target="_blank" rel="noreferrer" className="shrink-0">
                          <img
                            src={c.midia_url}
                            alt={c.titulo}
                            className="w-14 h-14 rounded-xl object-cover border border-slate-300"
                          />
                        </a>
                      )}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-extrabold truncate">
                            🏢 {c.condominio_nome}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500 shrink-0">
                            {c.data_hora}
                          </span>
                        </div>
                        <div className="text-xs font-extrabold text-slate-900 truncate">
                          {c.titulo}
                        </div>
                        <div className="text-[11px] text-slate-600 line-clamp-2 whitespace-pre-line">
                          {c.mensagem}
                        </div>
                        <div className="text-[10px] font-extrabold text-emerald-700 pt-0.5">
                          ✅ {c.enviados_sucesso}/{c.total_destinatarios} WhatsApp
                          {c.enviados_push > 0 ? ` • 📲 ${c.enviados_push} Push` : ''}
                          {c.falhas > 0 ? ` • ⚠️ ${c.falhas} falhas` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ABA 2: MENSAGENS AUTOMÁTICAS, ANTI-BAN META & FILA PM2 */}
      {aba === 'automacao' && formCfg && (
        <div className="space-y-5">
          {usandoMetaOficial ? (
            <div className="bg-emerald-50/80 rounded-2xl border border-emerald-200 p-4 shadow-2xs flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <Zap size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-emerald-950 text-sm sm:text-base flex items-center gap-2 flex-wrap">
                    Disparo Direto via API Oficial da Meta (WhatsApp Cloud API v22.0)
                    <span className="px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 text-[11px] font-extrabold">
                      ⚡ Envio Instantâneo • Fila PM2 Desativada
                    </span>
                  </h3>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    Como o sistema utiliza a <b>API Oficial da Meta</b>, não há risco de bloqueio por velocidade e não é necessário atrasar 7s–10s nem manter o daemon PM2 rodando na VPS. Todas as mensagens são entregues em tempo real!
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Painel Superior: Blindagem Anti-Bloqueio (Meta) & Controle de Fila PM2 (Somente modo Evolution API) */
            <div className="bg-white rounded-2xl border border-amber-300 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2 flex-wrap">
                    Blindagem Anti-Bloqueio (Meta) & Fila PM2 (`whatsapp-fila-antiban`)
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                        pm2Online ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {pm2Online
                        ? `🟢 PM2 Worker Online (PID ${painel?.fila_antiban?.worker?.pid || 'Ativo'})`
                        : '🟡 PM2 Auto-Start'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Controle de cadência sequencial no PM2 (7s–10s aleatório + simulação de "Digitando...") e mutação dinâmica do texto para nunca enviar duas mensagens iguais.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <label className="inline-flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200">
                  <input
                    type="checkbox"
                    checked={formCfg.antiban_ativo !== false}
                    onChange={(e) => setFormCfg({ ...formCfg, antiban_ativo: e.target.checked })}
                    className="w-4 h-4 accent-amber-600"
                  />
                  <span className="text-xs font-extrabold text-amber-900">Fila PM2 Ativa</span>
                </label>

                <label className="inline-flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200">
                  <input
                    type="checkbox"
                    checked={formCfg.antiban_variar_texto !== false}
                    onChange={(e) => setFormCfg({ ...formCfg, antiban_variar_texto: e.target.checked })}
                    className="w-4 h-4 accent-emerald-600"
                  />
                  <span className="text-xs font-extrabold text-emerald-900">Mutar Padrão das Mensagens</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div>
                <label className="block text-[11px] font-extrabold text-slate-600 mb-1">
                  Intervalo Mínimo (seg)
                </label>
                <input
                  type="number"
                  min={3}
                  max={60}
                  value={formCfg.antiban_delay_min ?? 7}
                  onChange={(e) => setFormCfg({ ...formCfg, antiban_delay_min: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-sm font-extrabold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-slate-600 mb-1">
                  Intervalo Máximo (seg)
                </label>
                <input
                  type="number"
                  min={4}
                  max={120}
                  value={formCfg.antiban_delay_max ?? 10}
                  onChange={(e) => setFormCfg({ ...formCfg, antiban_delay_max: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-sm font-extrabold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-slate-600 mb-1">
                  Simular "Digitando" (ms)
                </label>
                <input
                  type="number"
                  step={250}
                  min={800}
                  max={8000}
                  value={formCfg.antiban_digitando_ms ?? 2500}
                  onChange={(e) => setFormCfg({ ...formCfg, antiban_digitando_ms: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-sm font-extrabold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-slate-600 mb-1">
                  Pausa a cada X envios
                </label>
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={formCfg.antiban_pausa_lote_qtd ?? 15}
                  onChange={(e) => setFormCfg({ ...formCfg, antiban_pausa_lote_qtd: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-sm font-extrabold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-slate-600 mb-1">
                  Descanso do Lote (seg)
                </label>
                <input
                  type="number"
                  min={10}
                  max={180}
                  value={formCfg.antiban_pausa_lote_seg ?? 25}
                  onChange={(e) => setFormCfg({ ...formCfg, antiban_pausa_lote_seg: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-sm font-extrabold"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs text-slate-600 flex items-center gap-3 flex-wrap">
                <span>
                  <b>Estado do PM2:</b>{' '}
                  <code className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-[11px]">
                    {painel?.fila_antiban?.worker?.estado_atual || 'aguardando_fila'}
                  </code>
                </span>
                <span>
                  <b>Na Fila:</b> {painel?.fila_antiban?.na_fila ?? 0}
                </span>
                <span>
                  <b>Despachados:</b> {painel?.fila_antiban?.enviados ?? 0}
                </span>
                {(painel?.fila_antiban?.erros ?? 0) > 0 && (
                  <span className="text-rose-600 font-extrabold">
                    Erros: {painel?.fila_antiban?.erros}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={gerandoAmostras}
                  onClick={testarHumanizadorAntiban}
                  className="px-3 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 font-extrabold text-xs cursor-pointer"
                >
                  {gerandoAmostras ? 'Gerando variações...' : '🎲 Ver 3 Variações Anti-Bloqueio'}
                </button>

                {(painel?.fila_antiban?.erros ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => executarAcaoFilaAntiban('reprocessar_erros')}
                    className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs cursor-pointer"
                  >
                    🔄 Reenfileirar Erros ({painel?.fila_antiban?.erros})
                  </button>
                )}

                <button
                  type="button"
                  disabled={salvandoCfg}
                  onClick={() => salvarConfig()}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs cursor-pointer"
                >
                  {salvandoCfg ? 'Salvando...' : 'Salvar Regras Anti-Ban'}
                </button>
              </div>
            </div>

            {amostrasHumanizadas.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-amber-900">
                    🔍 Demonstração Real: 3 disparos consecutivos com mutação automática de saudação, sinônimos, protocolo e hash invisível:
                  </span>
                  <button
                    type="button"
                    onClick={() => setAmostrasHumanizadas([])}
                    className="text-xs font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    Fechar prévia
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {amostrasHumanizadas.map((amostra, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-emerald-950/90 text-emerald-50 text-[11px] whitespace-pre-wrap font-mono leading-relaxed border border-emerald-700"
                    >
                      <div className="text-[10px] font-extrabold text-amber-300 mb-1.5 uppercase">
                        Disparo #{idx + 1} ( Delay sorteado: {7 + idx}s + Digitando )
                      </div>
                      {amostra}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(painel?.fila_antiban?.itens_recentes ?? []).length > 0 && (
              <div className="pt-2 border-t border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                    Últimos Itens na Fila do PM2
                  </span>
                  <button
                    type="button"
                    onClick={() => executarAcaoFilaAntiban('limpar_concluidos')}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Limpar histórico de enviados
                  </button>
                </div>
                <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl bg-slate-50/60">
                  {painel!.fila_antiban!.itens_recentes.map((it) => (
                    <div key={it.id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-slate-800">
                            #{it.id} • {it.nome_contato || it.telefone}
                          </span>
                          {it.unidade_label && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold">
                              {it.unidade_label}
                            </span>
                          )}
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                              it.status === 'enviado'
                                ? 'bg-emerald-100 text-emerald-800'
                                : it.status === 'na_fila' || it.status === 'processando'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {it.status === 'enviado'
                              ? `✅ Enviado (${((it.delay_aplicado_ms || 7500) / 1000).toFixed(1)}s)`
                              : it.status === 'processando'
                                ? '⌨️ Digitando / Enviando...'
                                : it.status === 'na_fila'
                                  ? '⏳ Aguardando vez na fila PM2'
                                  : `⚠️ Erro (${it.tentativas}x)`}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          {it.resumo_conteudo}
                        </div>
                      </div>
                      {it.status === 'na_fila' && (
                        <button
                          type="button"
                          onClick={() => executarAcaoFilaAntiban('cancelar_item', it.id)}
                          className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-bold cursor-pointer shrink-0"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Template de Cadastro Aprovado */}
            <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                    <UserCheck size={20} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base">
                      Mensagem Automática de Cadastro Aprovado
                    </h3>
                    <p className="text-xs text-slate-500">
                      Suporta Spintax <code className="font-mono">{'{Olá|Oi|Tudo bem}'}</code> + mutação automática Anti-Ban
                    </p>
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formCfg.auto_aprovar_ativo}
                    onChange={(e) => setFormCfg({ ...formCfg, auto_aprovar_ativo: e.target.checked })}
                    className="w-4 h-4 accent-emerald-600"
                  />
                  <span className="text-xs font-extrabold text-slate-700">Ativo</span>
                </label>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <span className="text-[11px] font-bold text-slate-500 mr-1">Variáveis disponíveis:</span>
                {['{primeiro_nome}', '{nome}', '{condominio}', '{unidade}', '{cpf}', '{senha}', '{ramal}', '{link_app}'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() =>
                      setFormCfg({
                        ...formCfg,
                        template_aprovacao: formCfg.template_aprovacao + ' ' + v,
                      })
                    }
                    className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[11px] font-bold cursor-pointer"
                  >
                    {v}
                  </button>
                ))}
              </div>

              <textarea
                rows={10}
                value={formCfg.template_aprovacao}
                onChange={(e) => setFormCfg({ ...formCfg, template_aprovacao: e.target.value })}
                className="w-full p-3 rounded-xl border border-slate-300 text-xs sm:text-sm font-mono outline-none focus:border-emerald-500"
              />

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={salvandoCfg}
                  onClick={() => salvarConfig()}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm cursor-pointer disabled:opacity-50"
                >
                  {salvandoCfg ? 'Salvando...' : 'Salvar Mensagem de Aprovação'}
                </button>
              </div>
            </div>

            {/* Regras de Resposta Automática por Palavra-Chave */}
            <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                    <Zap size={20} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base">
                      Respostas Automáticas Rápidas (Gatilhos)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Enfileira resposta humanizada no PM2 quando o morador envia palavras-chave
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setRegraEditando({
                      titulo: '',
                      gatilho: '',
                      resposta: '',
                      ativo: true,
                      ordem: 10,
                    })
                  }
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={14} /> Nova Regra
                </button>
              </div>

              <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                {(painel?.regras ?? []).map((r) => (
                  <div
                    key={r.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-xs sm:text-sm text-slate-900">
                        {r.titulo}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                            r.ativo ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {r.ativo ? 'Ativa' : 'Inativa'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setRegraEditando(r)}
                          className="p-1 rounded hover:bg-slate-200 text-slate-600 cursor-pointer"
                          title="Editar regra"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => excluirRegra(r.id)}
                          className="p-1 rounded hover:bg-rose-100 text-rose-600 cursor-pointer"
                          title="Excluir regra"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    <div className="text-[11px] text-blue-700 font-mono">
                      <b>Palavras-chave:</b> {r.gatilho}
                    </div>
                    <div className="text-xs text-slate-600 line-clamp-2 whitespace-pre-line">
                      {r.resposta}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA 3: SERVIDOR DE IA (LLM QWEN 2.5) & CONEXÃO EVOLUTION API */}
      {aba === 'ia_config' && formCfg && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Configuração do Servidor LLM */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center">
                  <Bot size={22} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    Servidor de IA com LLM (Atendimento Inteligente 24h)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Conectado via Tailscale ao servidor <code className="font-mono">llm-server (100.116.82.84)</code>
                  </p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-extrabold ${
                  iaOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }`}
              >
                {iaOnline ? '🟢 LLM Conectado' : '🔴 LLM Offline'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">
                  URL do Servidor LLM (Ollama API)
                </label>
                <input
                  value={formCfg.ia_url}
                  onChange={(e) => setFormCfg({ ...formCfg, ia_url: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm font-mono"
                  placeholder="http://100.116.82.84:11434"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">
                  Modelo LLM Ativo (Salva ao selecionar ou pelo botão abaixo)
                </label>
                <div className="flex gap-2">
                  <select
                    value={formCfg.ia_modelo}
                    onChange={(e) => {
                      const novoModelo = e.target.value;
                      const novoCfg = { ...formCfg, ia_modelo: novoModelo };
                      setFormCfg(novoCfg);
                      void salvarConfig(novoCfg);
                    }}
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm font-bold bg-white outline-none focus:border-violet-500"
                  >
                    {(painel?.ia_servidor.modelos_disponiveis ?? []).length > 0 ? (
                      painel!.ia_servidor.modelos_disponiveis.map((m) => (
                        <option key={m.name} value={m.name}>
                          {m.name} ({m.parameter_size || `${m.size_gb} GB`})
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="qwen2.5:14b">qwen2.5:14b (14.8B - Rápido)</option>
                        <option value="qwen2.5:32b-otimizado">qwen2.5:32b-otimizado (32.8B)</option>
                        <option value="qwen2.5:32b">qwen2.5:32b (32.8B)</option>
                      </>
                    )}
                  </select>
                  <button
                    type="button"
                    disabled={salvandoCfg}
                    onClick={() => void salvarConfig(formCfg)}
                    className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-extrabold cursor-pointer shrink-0 shadow-2xs"
                    title="Salvar e ativar o modelo LLM selecionado"
                  >
                    {salvandoCfg ? 'Salvando...' : '💾 Salvar Modelo'}
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">
                Instruções do Agente de IA (Prompt do Sistema — Anti-Alucinação &amp; Escopo Restrito)
              </label>
              <textarea
                rows={7}
                value={formCfg.ia_prompt_sistema}
                onChange={(e) => setFormCfg({ ...formCfg, ia_prompt_sistema: e.target.value })}
                className="w-full p-3 rounded-xl border border-slate-300 text-xs sm:text-sm outline-none focus:border-violet-500"
              />
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900">
                  <b>⏳ Consulta de Pré-Cadastro:</b> Verifica automaticamente no banco se o cadastro está <b>pendente de aprovação</b> ou <b>aprovado</b>.
                </div>
                <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900">
                  <b>🔐 Troca Segura de Senha:</b> Exige confirmar <b>CPF, Nome Completo, Bloco e Apartamento</b> antes de alterar a senha no chat.
                </div>
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
                  <b>📵 Aviso de Áudio/Vídeo:</b> Responde automaticamente que o atendimento não recebe áudios nem vídeos, apenas texto.
                </div>
                <div className="p-2.5 rounded-xl bg-violet-50 border border-violet-200 text-violet-900">
                  <b>🎯 Zero Alucinação &amp; Textos Curtos:</b> Limita respostas a 3–4 linhas curtas e recusa assuntos fora do sistema.
                </div>
              </div>
            </div>

            {/* Simulador de Teste da IA */}
            <div className="p-3.5 rounded-xl bg-violet-50/70 border border-violet-200 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-extrabold text-violet-950 flex items-center gap-1.5">
                  <Sparkles size={14} className="text-violet-600" />
                  Testar Resposta do Servidor de IA Agora
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setPerguntaTesteIa('Meu cadastro já foi aprovado ou ainda está pendente?')}
                    className="px-2 py-1 rounded-lg bg-white border border-violet-200 text-[10px] font-bold text-violet-800 hover:bg-violet-100 cursor-pointer"
                  >
                    ⏳ Status Cadastro
                  </button>
                  <button
                    type="button"
                    onClick={() => setPerguntaTesteIa('Esqueci minha senha, quero trocar a senha pelo chat')}
                    className="px-2 py-1 rounded-lg bg-white border border-violet-200 text-[10px] font-bold text-violet-800 hover:bg-violet-100 cursor-pointer"
                  >
                    🔐 Trocar Senha
                  </button>
                  <button
                    type="button"
                    onClick={() => setPerguntaTesteIa('Sobre dependente, como faço pra cadastrar meu filho e liberar a facial dele?')}
                    className="px-2 py-1 rounded-lg bg-white border border-violet-200 text-[10px] font-bold text-violet-800 hover:bg-violet-100 cursor-pointer"
                  >
                    👨‍👩‍👧 Dependente / Facial
                  </button>
                  <button
                    type="button"
                    onClick={() => setPerguntaTesteIa('Como faço para atualizar minha foto facial e meus veículos?')}
                    className="px-2 py-1 rounded-lg bg-white border border-violet-200 text-[10px] font-bold text-violet-800 hover:bg-violet-100 cursor-pointer"
                  >
                    📲 Atualizar Cadastro
                  </button>
                  <button
                    type="button"
                    onClick={() => setPerguntaTesteIa('Me passa uma receita de bolo de chocolate')}
                    className="px-2 py-1 rounded-lg bg-white border border-violet-200 text-[10px] font-bold text-violet-800 hover:bg-violet-100 cursor-pointer"
                  >
                    🚫 Fora de Contexto
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  value={perguntaTesteIa}
                  onChange={(e) => setPerguntaTesteIa(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl border border-violet-300 bg-white text-xs"
                  placeholder="Digite uma pergunta como se fosse um morador..."
                />
                <button
                  type="button"
                  disabled={testandoIa}
                  onClick={testarIaNoSimulador}
                  className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-extrabold cursor-pointer shrink-0 disabled:opacity-50"
                >
                  {testandoIa ? 'Consultando...' : 'Testar IA'}
                </button>
              </div>
              {respostaTesteIa && (
                <div className="p-3 rounded-xl bg-white border border-violet-200 text-xs text-slate-800 whitespace-pre-wrap">
                  {respostaTesteIa}
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={salvandoCfg}
              onClick={() => void salvarConfig(formCfg)}
              className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <Bot size={16} />
              {salvandoCfg
                ? 'Salvando Configurações e Modelo da IA...'
                : `💾 Salvar Configurações da IA & Usar Modelo (${formCfg.ia_modelo || 'qwen2.5:14b'})`}
            </button>
          </div>

          {/* Configuração da API Oficial da Meta (Cloud API) / Evolution API */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    Provedor Oficial do WhatsApp
                  </h3>
                  <p className="text-xs text-slate-500">
                    API Oficial da Meta (Sem risco de bloqueio / Sem QR Code)
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800">
                🟢 CONECTADO
              </span>
            </div>

            {/* Seletor de Provedor */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 border border-slate-200">
              <button
                type="button"
                onClick={() => setFormCfg({ ...formCfg, provedor_ativo: 'meta_oficial' })}
                className={`py-2 px-3 rounded-lg text-xs font-extrabold cursor-pointer transition ${
                  (formCfg.provedor_ativo ?? 'meta_oficial') === 'meta_oficial'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ✅ API Oficial da Meta
              </button>
              <button
                type="button"
                onClick={() => setFormCfg({ ...formCfg, provedor_ativo: 'evolution' })}
                className={`py-2 px-3 rounded-lg text-xs font-extrabold cursor-pointer transition ${
                  formCfg.provedor_ativo === 'evolution'
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📱 Evolution API (QR)
              </button>
            </div>

            {(formCfg.provedor_ativo ?? 'meta_oficial') === 'meta_oficial' ? (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-1">
                  <div className="font-extrabold flex items-center justify-between">
                    <span>🏢 Conta Verificada: {painel?.meta_oficial?.nome_verificado || formCfg.meta_nome_verificado || 'Sectrum'}</span>
                    <span className="px-2 py-0.5 rounded bg-emerald-200 text-emerald-900 text-[10px] font-extrabold">
                      {painel?.meta_oficial?.verificado || 'VERIFIED'} • {painel?.meta_oficial?.qualidade || 'GREEN'}
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-emerald-800">
                    Número Oficial: <b>+{formCfg.meta_numero || '559885983566'}</b> (+55 98 8598-3566)
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                      Phone Number ID (Meta)
                    </label>
                    <input
                      value={formCfg.meta_phone_number_id || '1422064357652869'}
                      onChange={(e) => setFormCfg({ ...formCfg, meta_phone_number_id: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                      WABA ID (Conta WhatsApp Business)
                    </label>
                    <input
                      value={formCfg.meta_waba_id || '1080559984944780'}
                      onChange={(e) => setFormCfg({ ...formCfg, meta_waba_id: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                      App ID (Meta Developers)
                    </label>
                    <input
                      value={formCfg.meta_app_id || '2014750832566222'}
                      onChange={(e) => setFormCfg({ ...formCfg, meta_app_id: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                      Número Oficial (DDI+DDD+Número)
                    </label>
                    <input
                      value={formCfg.meta_numero || '559885983566'}
                      onChange={(e) => setFormCfg({ ...formCfg, meta_numero: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                    Token de Acesso Permanente (Meta Cloud API)
                  </label>
                  <input
                    type="password"
                    value={formCfg.meta_access_token || ''}
                    onChange={(e) => setFormCfg({ ...formCfg, meta_access_token: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                    placeholder="EAAcoZA7uvn84..."
                  />
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                  <div className="font-extrabold text-slate-800">
                    🔗 Dados para o Painel de Webhook da Meta (Caso solicitado):
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">URL de Callback do Webhook:</span>
                    <code className="block p-1.5 rounded bg-white border border-slate-200 font-mono text-[11px] text-slate-900 select-all">
                      https://cond.vps.seg.br/api.php?rota=whatsapp_webhook
                    </code>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">Verificar Token (Verify Token):</span>
                    <code className="block p-1.5 rounded bg-white border border-slate-200 font-mono text-[11px] text-slate-900 select-all">
                      {formCfg.meta_verify_token || 'sectrum_meta_2026'}
                    </code>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    Instância da Evolution API
                  </label>
                  <select
                    value={formCfg.instance_name}
                    onChange={(e) => {
                      const inst = painel?.evolution.instancias.find((i) => i.name === e.target.value);
                      setFormCfg({
                        ...formCfg,
                        instance_name: e.target.value,
                        instance_token: inst?.token || formCfg.instance_token,
                      });
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm font-bold bg-white"
                  >
                    {(painel?.evolution.instancias ?? []).map((inst) => (
                      <option key={inst.name} value={inst.name}>
                        {inst.name} — {inst.connectionStatus === 'open' ? '🟢 Conectada' : '🔴 Desconectada'} ({inst.profileName || inst.number || 'Sem número'})
                      </option>
                    ))}
                    {!(painel?.evolution.instancias ?? []).some((i) => i.name === formCfg.instance_name) && (
                      <option value={formCfg.instance_name}>{formCfg.instance_name}</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    URL Interna da Evolution API (no Servidor)
                  </label>
                  <input
                    value={formCfg.evolution_url}
                    onChange={(e) => setFormCfg({ ...formCfg, evolution_url: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    Global API Key (Evolution)
                  </label>
                  <input
                    type="password"
                    value={formCfg.evolution_apikey}
                    onChange={(e) => setFormCfg({ ...formCfg, evolution_apikey: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                  />
                </div>
              </div>
            )}

            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                disabled={salvandoCfg}
                onClick={() => salvarConfig()}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm cursor-pointer shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <ShieldCheck size={17} />
                {salvandoCfg ? 'Salvando e Sincronizando...' : 'Salvar Configurações & Ativar API Oficial'}
              </button>

              {formCfg.provedor_ativo === 'evolution' && (
                <button
                  type="button"
                  onClick={() => abrirQrCode(false)}
                  className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs cursor-pointer flex items-center justify-center gap-2"
                >
                  <QrCode size={15} />
                  Conectar / Ler QR Code da Instância ({formCfg.instance_name})
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL QR CODE WHATSAPP */}
      {modalQrAberto && (
        <div className="fixed inset-0 z-[250] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 text-center">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <QrCode size={18} className="text-emerald-600" />
                Conectar WhatsApp ({painel?.config.instance_name || 'Sectrum-Zap'})
              </h3>
              <button onClick={() => setModalQrAberto(false)} className="cursor-pointer text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            {carregandoQr ? (
              <div className="py-12 space-y-3">
                <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-600 rounded-full animate-spin mx-auto" />
                <div className="text-xs font-bold text-slate-600">Gerando QR Code limpo na Evolution API...</div>
              </div>
            ) : qrBase64 ? (
              <div className="space-y-3">
                <img
                  src={qrBase64.startsWith('data:') ? qrBase64 : `data:image/png;base64,${qrBase64}`}
                  alt="QR Code WhatsApp"
                  className="w-64 h-64 mx-auto rounded-xl border border-slate-200 p-2"
                />
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  Aguardando leitura no celular (renovação automática ativa)
                </div>
                <p className="text-xs text-slate-600">
                  Abra o WhatsApp no celular &rarr; <b>Aparelhos Conectados</b> &rarr; <b>Conectar um Aparelho</b> e aponte a câmera.
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-800 text-left leading-relaxed">
                  <b>💡 Dica importante:</b> Se o seu celular mostrar um aparelho antigo conectado que parou de responder, desconecte-o no celular ou clique em <b>Resetar Sessão Travada</b> abaixo antes de ler o QR Code.
                </div>
              </div>
            ) : (
              <div className="py-8 text-xs text-slate-600 space-y-2">
                <AlertCircle size={28} className="mx-auto text-amber-500" />
                <div>Clique em Resetar Sessão &amp; Novo QR abaixo para gerar um código limpo de leitura.</div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 justify-center">
              <button
                type="button"
                onClick={() => abrirQrCode(false)}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold cursor-pointer"
              >
                Atualizar QR Code
              </button>
              <button
                type="button"
                onClick={() => abrirQrCode(true)}
                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold cursor-pointer"
                title="Força logout da sessão fantasma na Evolution API e gera um novo QR Code limpo"
              >
                Resetar Sessão Travada &amp; Novo QR
              </button>
              <button
                type="button"
                onClick={() => {
                  setModalQrAberto(false);
                  carregarPainel();
                }}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NOVA MENSAGEM AVULSA */}
      {modalNovaMsg && (
        <div className="fixed inset-0 z-[250] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={enviarNovaMensagemAvulsa} className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-slate-900 text-base">Nova Conversa no WhatsApp</h3>
              <button type="button" onClick={() => setModalNovaMsg(false)} className="cursor-pointer text-slate-400">
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Telefone (com DDD)</label>
              <input
                required
                value={novoTelefone}
                onChange={(e) => setNovoTelefone(e.target.value)}
                placeholder="Ex.: 98985983566"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nome do Contato (opcional)</label>
              <input
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Nome do morador"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Mensagem</label>
              <textarea
                required
                rows={4}
                value={novoTexto}
                onChange={(e) => setNovoTexto(e.target.value)}
                placeholder="Digite a mensagem..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalNovaMsg(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={enviando}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-extrabold cursor-pointer"
              >
                {enviando ? 'Enviando...' : 'Enviar no WhatsApp'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL EDITAR/CRIAR REGRA AUTOMÁTICA */}
      {regraEditando && (
        <div className="fixed inset-0 z-[250] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={salvarRegra} className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-slate-900 text-base">
                {regraEditando.id ? 'Editar Regra Automática' : 'Nova Regra de Resposta Automática'}
              </h3>
              <button type="button" onClick={() => setRegraEditando(null)} className="cursor-pointer text-slate-400">
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Título da Regra</label>
              <input
                required
                value={regraEditando.titulo ?? ''}
                onChange={(e) => setRegraEditando({ ...regraEditando, titulo: e.target.value })}
                placeholder="Ex.: Dúvida sobre Acesso ao App"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Palavras-Chave (separadas por vírgula)
              </label>
              <input
                required
                value={regraEditando.gatilho ?? ''}
                onChange={(e) => setRegraEditando({ ...regraEditando, gatilho: e.target.value })}
                placeholder="Ex.: senha, aplicativo, login, entrar"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Resposta Automática (suporta {'{primeiro_nome}'}, {'{condominio}'}, {'{unidade}'}, {'{cpf}'}, {'{ramal}'}, {'{link_app}'})
              </label>
              <textarea
                required
                rows={5}
                value={regraEditando.resposta ?? ''}
                onChange={(e) => setRegraEditando({ ...regraEditando, resposta: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>

            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={regraEditando.ativo !== false}
                onChange={(e) => setRegraEditando({ ...regraEditando, ativo: e.target.checked })}
                className="w-4 h-4 accent-blue-600"
              />
              <span className="text-xs font-bold text-slate-700">Regra ativa</span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRegraEditando(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-extrabold cursor-pointer"
              >
                Salvar Regra
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
