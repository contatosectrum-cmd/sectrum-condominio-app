import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ScanFace,
  Search,
  ShieldAlert,
  Users,
  Video,
  Upload,
  Sparkles,
  RefreshCw,
  Plus,
  Trash2,
  Edit2,
  Pin,
  Eye,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  X,
  Camera,
  SlidersHorizontal,
  UserPlus,
  Play,
  Pause,
  Zap,
  RotateCcw,
  Server,
  Copy,
  Check,
  Download,
  ShieldCheck,
} from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import { obterUrlWsGo2rtc } from '../lib/nativo';
import { Modal as ModalBase } from './moradores/AcoesMorador';

const Modal: React.FC<{
  aberto: boolean;
  aoFechar: () => void;
  titulo: React.ReactNode;
  largura?: string;
  borda?: string;
  children: React.ReactNode;
}> = ({ aberto, aoFechar, titulo, largura = 'max-w-lg', borda = 'border-blue-600', children }) => {
  if (!aberto) return null;
  return (
    <ModalBase titulo={titulo} borda={borda} onFechar={aoFechar} largura={largura}>
      {children}
    </ModalBase>
  );
};

// ─── Cache em memória para mídias autenticadas LGPD (`vision_midia`) ─────────
const CACHE_MIDIA = new Map<string, string>();

function guardarMidiaCache(chave: string, blobUrl: string) {
  if (CACHE_MIDIA.size >= 260) {
    const primeira = CACHE_MIDIA.keys().next().value;
    if (primeira) {
      const antiga = CACHE_MIDIA.get(primeira);
      if (antiga) URL.revokeObjectURL(antiga);
      CACHE_MIDIA.delete(primeira);
    }
  }
  CACHE_MIDIA.set(chave, blobUrl);
}

const VisionImg: React.FC<{
  path?: string | null;
  alt?: string;
  className?: string;
  onClick?: () => void;
}> = ({ path, alt = 'Imagem IA', className = '', onClick }) => {
  const [src, setSrc] = useState<string | null>(() => (path ? CACHE_MIDIA.get(path) ?? null : null));
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    if (!path) {
      setSrc(null);
      setFalhou(false);
      return;
    }
    if (path.startsWith('data:image/')) {
      setSrc(path);
      setFalhou(false);
      return;
    }
    const emCache = CACHE_MIDIA.get(path);
    if (emCache) {
      setSrc(emCache);
      setFalhou(false);
      return;
    }
    let ativo = true;
    setFalhou(false);
    fetch(`/api.php?route=vision_midia&path=${encodeURIComponent(path)}`)
      .then((r) => {
        if (!r.ok) throw new Error('404');
        return r.blob();
      })
      .then((b) => {
        const url = URL.createObjectURL(b);
        guardarMidiaCache(path, url);
        if (ativo) setSrc(url);
      })
      .catch(() => {
        if (ativo) setFalhou(true);
      });
    return () => {
      ativo = false;
    };
  }, [path]);

  if (!path || falhou) {
    return (
      <div className={`flex flex-col items-center justify-center bg-slate-100 text-slate-400 ${className}`}>
        <ScanFace size={24} />
      </div>
    );
  }
  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-slate-100 animate-pulse ${className}`}>
        <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      onClick={onClick}
      className={`${className} ${onClick ? 'cursor-pointer' : ''}`}
    />
  );
};

// ─── Player Ao Vivo Substream H.264 (`cam_{id}_live` via MSE/HLS/MJPEG) ──────
const LiveVisionPlayer: React.FC<{
  cameraId: number;
  streamLive: string;
  nome: string;
  ativo: boolean;
}> = ({ cameraId, streamLive, nome, ativo }) => {
  const [jogando, setJogando] = useState(false);
  const [snap, setSnap] = useState<string | null>(null);
  const playerRef = useRef<(HTMLElement & { src?: string; ondisconnect?: () => void; onconnect?: () => void }) | null>(null);

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    api<{ imagem: string }>('vision_camera_snapshot', { query: { id: cameraId } })
      .then((r) => {
        if (vivo && r.imagem) setSnap(r.imagem);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [cameraId, ativo]);

  useEffect(() => {
    const el = playerRef.current;
    if (!el || !ativo || !streamLive) return;
    const wsUrl = obterUrlWsGo2rtc(streamLive);
    el.setAttribute('mode', 'mse,hls,mjpeg');
    el.setAttribute('media', 'video');
    el.src = wsUrl;

    let ultimoTempo = -1;
    let ultimoAvanco = Date.now();
    const timer = window.setInterval(() => {
      const v = el.querySelector('video');
      if (!v) return;
      v.playsInline = true;
      v.controls = false;
      v.muted = true;
      v.style.width = '100%';
      v.style.height = '100%';
      v.style.objectFit = 'cover';
      if (v.readyState >= 2 && !v.paused && v.videoWidth > 0) {
        if (v.buffered && v.buffered.length > 0) {
          const fim = v.buffered.end(v.buffered.length - 1);
          if (fim - v.currentTime > 1.8) v.currentTime = fim - 0.15;
        }
        if (Math.abs(v.currentTime - ultimoTempo) > 0.01) {
          ultimoTempo = v.currentTime;
          ultimoAvanco = Date.now();
          setJogando(true);
        } else if (!document.hidden && Date.now() - ultimoAvanco > 5000) {
          ultimoAvanco = Date.now();
          setJogando(false);
          el.ondisconnect?.();
          el.onconnect?.();
        }
      } else if (v.paused && v.readyState >= 2 && !document.hidden) {
        v.play().catch(() => {});
      }
    }, 400);
    return () => window.clearInterval(timer);
  }, [streamLive, ativo]);

  if (!ativo) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-500 text-xs font-semibold">
        <Pause size={24} className="mb-1" />
        Câmera Pausada
      </div>
    );
  }

  return (
    <div className="w-full h-full relative bg-black overflow-hidden">
      {snap && !jogando && (
        <img src={snap} alt={nome} className="absolute inset-0 w-full h-full object-cover z-[1]" />
      )}
      <video-rtc
        ref={(node: HTMLElement | null) => {
          playerRef.current = node as (HTMLElement & { src?: string }) | null;
        }}
        autoplay
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      <div className="absolute top-2 left-2 z-[2] flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/65 text-[11px] font-bold text-white">
        <span className={`w-2 h-2 rounded-full ${jogando ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
        {jogando ? 'AO VIVO H.264' : 'CONECTANDO...'}
      </div>
    </div>
  );
};

// ─── Tipos & Dicionários em Português ────────────────────────────────────────
interface TelemetriaGpu {
  habilitado?: boolean;
  online?: boolean;
  cuda_ativo?: boolean;
  endpoint_ativo?: string;
  gpu_nome?: string;
  vram_usada_mb?: number;
  vram_total_mb?: number;
  temp_c?: number;
  gpu_util_pct?: number;
  fallbacks_cpu?: number;
}

interface VisionStatusResp {
  condominio_id: number;
  local_id: number;
  pode_gerenciar: boolean;
  eh_superadmin: boolean;
  motor: {
    ok?: boolean;
    erro?: string;
    uptime_s?: number;
    modelo_vetor?: string;
    galeria_identidades_ram?: number;
    fila_indexacao?: number;
    gpu_worker?: TelemetriaGpu;
  };
  contadores: {
    cameras_total: number;
    cameras_ativas: number;
    cameras_nvr_nativo?: number;
    galeria_ativas: number;
    passagens_hoje: number;
    passagens_total: number;
    alertas_24h: number;
  };
}

interface PassagemItem {
  id: number;
  local_id: number;
  camera_id: number | null;
  camera_nome: string | null;
  galeria_pessoa_id: number | null;
  pessoa_nome: string | null;
  pessoa_categoria: string | null;
  laplaciano_score: number | null;
  foto_rosto_url: string | null;
  foto_cena_url: string | null;
  cor_camisa: string | null;
  tipo_manga: string | null;
  estampa_camisa: string | null;
  cor_calca: string | null;
  tipo_parte_inferior: string | null;
  usa_bone: boolean;
  usa_oculos: boolean;
  carrega_mochila: boolean;
  tipo_bolsa: string | null;
  segurando_objetos: boolean;
  genero_aparente: string | null;
  faixa_etaria_aparente: string | null;
  total_aparicoes: number;
  criado_em: string;
  ultima_visto_em: string;
  similaridade: number | null;
  fixado_evidencia?: boolean;
  nota_investigacao?: string;
  origem_motor?: string;
}

interface AlertaItem {
  id: number;
  camera_id: number | null;
  camera_nome: string;
  galeria_pessoa_id: number;
  pessoa_nome: string;
  pessoa_categoria: string;
  nivel_alerta: string;
  pessoa_foto_url: string | null;
  pessoa_observacao: string;
  passagem_id: number | null;
  zona_confianca: 'critico' | 'atencao' | string;
  similaridade: number;
  similaridade_pct: number;
  foto_captura_url: string | null;
  foto_cena_url: string | null;
  resumo_vestuario: string;
  origem_motor?: string;
  criado_em: string;
}

interface GaleriaPessoa {
  id: number;
  pessoa_externa_id: string | null;
  nome: string;
  categoria: 'restrito' | 'monitorado' | 'vip' | 'funcionario';
  nivel_alerta: 'critico' | 'atencao' | 'informativo';
  escopo: 'restrito_locais' | 'global';
  foto_url: string | null;
  modelo_vetor: string;
  laplaciano_score: number | null;
  ativo: boolean;
  observacao: string;
  total_alertas: number;
  criado_em: string;
  pode_editar: boolean;
}

interface VisionCamera {
  id: number;
  local_id: number;
  nome: string;
  fabricante: 'uniview' | 'hikvision' | 'intelbras' | 'onvif';
  host: string;
  porta_rtsp: number;
  porta_http: number;
  porta_onvif: number;
  usuario: string;
  tem_senha: boolean;
  rtsp_main_path: string;
  rtsp_sub_path: string;
  limiar_nitidez: number;
  modo_captura: 'onvif_burst' | 'rtsp_poll' | 'ftp_push' | 'hikvision_nvr_nativo';
  nvr_id?: number | null;
  nvr_nome?: string | null;
  canal_nvr?: number;
  ativo: boolean;
  stream_ia: string;
  stream_live: string;
}

interface NvrCondominioItem {
  id: number;
  nome: string;
  ip: string;
  porta_http: number;
  porta_rtsp: number;
  usuario: string;
  max_canais: number;
  modo_conexao: 'ip' | 'isup';
  ia_facial_nativa: boolean;
  modelo_detectado?: string | null;
  fdlib_id?: string | null;
  ultimo_sync_fdlib_em?: string | null;
  ultimo_evento_nvr_em?: string | null;
  webhook_url: string;
  webhook_caminho: string;
}

interface CftvImportavel {
  cftv_id: number;
  nome: string;
  localizacao: string;
  host: string;
  porta_rtsp: number;
  usuario: string;
  canal?: number;
  fabricante: 'uniview' | 'hikvision';
  modo_sugerido?: string;
  rtsp_main_path: string;
  rtsp_sub_path: string;
}

interface MoradorBusca {
  id: number;
  nome: string;
  cpf?: string;
  perfil?: string;
  unidade_label?: string;
  tem_foto?: boolean;
}

interface RestritoHik {
  id: number;
  nome: string;
  documento?: string;
  motivo?: string;
  nivel?: string;
}

const CORES_OPCOES = [
  { valor: '', rotulo: 'Todas as cores' },
  { valor: 'preto', rotulo: '⚫ Preto' },
  { valor: 'branco', rotulo: '⚪ Branco' },
  { valor: 'cinza', rotulo: '🔘 Cinza' },
  { valor: 'azul', rotulo: '🔵 Azul' },
  { valor: 'vermelho', rotulo: '🔴 Vermelho' },
  { valor: 'verde', rotulo: '🟢 Verde' },
  { valor: 'amarelo', rotulo: '🟡 Amarelo' },
  { valor: 'laranja', rotulo: '🟠 Laranja' },
  { valor: 'rosa_roxo', rotulo: '🟣 Rosa / Roxo' },
  { valor: 'marrom_bege', rotulo: '🟤 Marrom / Bege' },
  { valor: 'pb_noturno', rotulo: '🌙 P&B Infravermelho' },
];

const LABEL_COR: Record<string, string> = {
  preto: 'Preto',
  branco: 'Branco',
  cinza: 'Cinza',
  azul: 'Azul',
  vermelho: 'Vermelho',
  verde: 'Verde',
  amarelo: 'Amarelo',
  laranja: 'Laranja',
  rosa_roxo: 'Rosa/Roxo',
  marrom_bege: 'Marrom/Bege',
  pb_noturno: 'P&B IR',
};

const LABEL_MANGA: Record<string, string> = {
  manga_curta: 'Manga Curta',
  manga_longa: 'Manga Longa',
  casaco_longo: 'Casaco Longo',
};

const LABEL_INFERIOR: Record<string, string> = {
  calca: 'Calça',
  bermuda_shorts: 'Bermuda/Shorts',
  saia_vestido: 'Saia/Vestido',
};

const LABEL_BOLSA: Record<string, string> = {
  mochila_costas: 'Mochila',
  bolsa_ombro: 'Bolsa Ombro',
  bolsa_mao: 'Bolsa Mão',
};

const LABEL_FAIXA: Record<string, string> = {
  menor_18: 'Jovem (<18)',
  adulto_18_60: 'Adulto (18-60)',
  acima_60: 'Idoso (60+)',
};

const BADGE_CATEGORIA: Record<string, { txt: string; cls: string }> = {
  restrito: { txt: 'Suspeito / Restrito', cls: 'bg-red-100 text-red-800 border-red-200' },
  monitorado: { txt: 'Monitorado', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  vip: { txt: 'VIP / Morador', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  funcionario: { txt: 'Funcionário / Prestador', cls: 'bg-blue-100 text-blue-800 border-blue-200' },
};

function formatarDataHora(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function lerArquivoBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao ler imagem.'));
    reader.readAsDataURL(file);
  });
}

const msgErro = (e: unknown) => (e instanceof ErroApi ? e.message : 'Ocorreu um erro inesperado.');
const lbl = 'block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1';
const inp = 'w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 focus:bg-white transition';

// ═════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL — VISÃO FACIAL 512D, VESTUÁRIO & BUSCA FORENSE 1:N
// ═════════════════════════════════════════════════════════════════════════════

export default function VisaoFacialIA() {
  const [aba, setAba] = useState<'forense' | 'alertas' | 'galeria' | 'cameras'>('forense');
  const [status, setStatus] = useState<VisionStatusResp | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  // ── Estado Aba 1: Busca Forense Híbrida 1:N ───────────────────────────────
  const [passagens, setPassagens] = useState<PassagemItem[]>([]);
  const [modoBusca, setModoBusca] = useState<string>('filtros_atributos');
  const [buscando, setBuscando] = useState(false);
  const [fotoBuscaB64, setFotoBuscaB64] = useState<string>('');
  const [passagemRef, setPassagemRef] = useState<{ id: number; foto?: string | null } | null>(null);
  const [limiarSim, setLimiarSim] = useState<number>(46);
  const [corCamisa, setCorCamisa] = useState('');
  const [corCalca, setCorCalca] = useState('');
  const [tipoManga, setTipoManga] = useState('');
  const [tipoInferior, setTipoInferior] = useState('');
  const [generoAparente, setGeneroAparente] = useState('');
  const [faixaEtaria, setFaixaEtaria] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [usaBone, setUsaBone] = useState(false);
  const [usaOculos, setUsaOculos] = useState(false);
  const [carregaMochila, setCarregaMochila] = useState(false);
  const [segurandoObj, setSegurandoObj] = useState(false);
  const [soEvidencias, setSoEvidencias] = useState(false);

  // Modal Cena / Zoom e Modal Fixar Evidência
  const [modalCena, setModalCena] = useState<{
    titulo: string;
    rostoUrl?: string | null;
    cenaUrl?: string | null;
    resumo?: string;
  } | null>(null);
  const [modalEvidencia, setModalEvidencia] = useState<{
    id: number;
    fixado: boolean;
    nota: string;
  } | null>(null);

  // ── Estado Aba 2: Alertas Zona 1 / Zona 2 ─────────────────────────────────
  const [alertas, setAlertas] = useState<AlertaItem[]>([]);
  const [carregandoAlertas, setCarregandoAlertas] = useState(false);

  // ── Estado Aba 3: Galeria Monitorada 512D ─────────────────────────────────
  const [galeria, setGaleria] = useState<GaleriaPessoa[]>([]);
  const [restritosHik, setRestritosHik] = useState<RestritoHik[]>([]);
  const [filtroCatGaleria, setFiltroCatGaleria] = useState('');
  const [buscaGaleria, setBuscaGaleria] = useState('');
  const [carregandoGaleria, setCarregandoGaleria] = useState(false);

  // Modal Cadastro/Edição Galeria
  const [modalGaleria, setModalGaleria] = useState(false);
  const [abaOrigemGaleria, setAbaOrigemGaleria] = useState<'upload' | 'morador' | 'blacklist'>('upload');
  const [formGaleria, setFormGaleria] = useState<{
    id: number;
    nome: string;
    categoria: 'restrito' | 'monitorado' | 'vip' | 'funcionario';
    nivel_alerta: 'critico' | 'atencao' | 'informativo';
    escopo: 'restrito_locais' | 'global';
    pessoa_externa_id: string;
    observacao: string;
    foto_base64: string;
    usuario_origem_id: number;
    restricao_origem_id: number;
    passagem_origem_id: number;
    passagem_foto_url?: string | null;
  }>({
    id: 0,
    nome: '',
    categoria: 'restrito',
    nivel_alerta: 'critico',
    escopo: 'restrito_locais',
    pessoa_externa_id: '',
    observacao: '',
    foto_base64: '',
    usuario_origem_id: 0,
    restricao_origem_id: 0,
    passagem_origem_id: 0,
  });
  const [validandoFotoGal, setValidandoFotoGal] = useState(false);
  const [previaValidacao, setPreviaValidacao] = useState<{
    provedor?: string;
    nitidez_lap?: number;
    simetria_frontal?: number;
    retrato_3x4_base64?: string;
    erro?: string;
  } | null>(null);
  const [buscaMoradorTxt, setBuscaMoradorTxt] = useState('');
  const [moradoresEncontrados, setMoradoresEncontrados] = useState<MoradorBusca[]>([]);
  const [salvandoGaleria, setSalvandoGaleria] = useState(false);

  // ── Estado Aba 4: Câmeras IP Dual-Stream & NVRs Hikvision ─────────────────
  const [cameras, setCameras] = useState<VisionCamera[]>([]);
  const [nvrsCondominio, setNvrsCondominio] = useState<NvrCondominioItem[]>([]);
  const [cftvImportaveis, setCftvImportaveis] = useState<CftvImportavel[]>([]);
  const [camerasAoVivo, setCamerasAoVivo] = useState<Record<number, boolean>>({});
  const [carregandoCameras, setCarregandoCameras] = useState(false);
  const [modalCamera, setModalCamera] = useState(false);
  const [salvandoCamera, setSalvandoCamera] = useState(false);
  const [testandoCamId, setTestandoCamId] = useState<number | null>(null);
  const [resultadoTesteCam, setResultadoTesteCam] = useState<{
    cameraNome: string;
    latenciaMs: number;
    calibradoH264: boolean;
    snapshot: string;
    analise: Record<string, unknown>;
  } | null>(null);
  const [formCam, setFormCam] = useState({
    id: 0,
    importar_cftv_id: 0,
    nvr_id: 0,
    canal_nvr: '1',
    nome: '',
    fabricante: 'uniview' as 'uniview' | 'hikvision' | 'intelbras' | 'onvif',
    host: '',
    porta_rtsp: '554',
    porta_http: '80',
    porta_onvif: '80',
    usuario: 'admin',
    senha: '',
    rtsp_main_path: '/media/video1',
    rtsp_sub_path: '/media/video2',
    limiar_nitidez: '50',
    modo_captura: 'onvif_burst' as 'onvif_burst' | 'rtsp_poll' | 'hikvision_nvr_nativo',
    ativo: true,
  });

  // ── Gestão Direta NVR Hikvision (FDLib + Webhook + Coleta) ────────────────
  const [modalNovoNvr, setModalNovoNvr] = useState(false);
  const [salvandoNvr, setSalvandoNvr] = useState(false);
  const [acaoNvrId, setAcaoNvrId] = useState<number | null>(null);
  const [copiadoTokenId, setCopiadoTokenId] = useState<number | null>(null);
  const [formNovoNvr, setFormNovoNvr] = useState({
    nome: 'NVR Facial Hikvision Portaria',
    modo_conexao: 'ip' as 'ip' | 'isup',
    ip: '',
    porta_http: '80',
    porta_rtsp: '554',
    usuario: 'admin',
    senha: '',
  });

  // ── Modal Análise Avulsa ──────────────────────────────────────────────────
  const [modalAnaliseManual, setModalAnaliseManual] = useState(false);
  const [fotoManualB64, setFotoManualB64] = useState('');
  const [indexarManual, setIndexarManual] = useState(true);
  const [analisandoManual, setAnalisandoManual] = useState(false);
  const [resAnaliseManual, setResAnaliseManual] = useState<Record<string, unknown> | null>(null);

  // ─── Carregamento de Status e Dados ───────────────────────────────────────
  const carregarStatus = useCallback(async () => {
    try {
      const r = await api<VisionStatusResp>('vision_status');
      setStatus(r);
    } catch (e) {
      setAviso({ tipo: 'erro', texto: msgErro(e) });
    }
  }, []);

  const executarBuscaForense = useCallback(
    async (override?: { passagemRefId?: number | null; fotoB64?: string }) => {
      setBuscando(true);
      try {
        const refId =
          override?.passagemRefId !== undefined
            ? override.passagemRefId ?? 0
            : passagemRef?.id ?? 0;
        const fB64 = override?.fotoB64 !== undefined ? override.fotoB64 : fotoBuscaB64;

        const r = await api<{
          modo_busca: string;
          total_retornado: number;
          itens: PassagemItem[];
        }>('vision_passagens_buscar', {
          metodo: 'POST',
          corpo: {
            passagem_ref_id: refId > 0 ? refId : undefined,
            foto_base64: refId === 0 && fB64 ? fB64 : undefined,
            limiar_similaridade: limiarSim / 100,
            cor_camisa: corCamisa || undefined,
            cor_calca: corCalca || undefined,
            tipo_manga: tipoManga || undefined,
            tipo_parte_inferior: tipoInferior || undefined,
            genero_aparente: generoAparente || undefined,
            faixa_etaria_aparente: faixaEtaria || undefined,
            data_inicio: dataInicio || undefined,
            data_fim: dataFim || undefined,
            usa_bone: usaBone || undefined,
            usa_oculos: usaOculos || undefined,
            carrega_mochila: carregaMochila || undefined,
            segurando_objetos: segurandoObj || undefined,
            fixado_evidencia: soEvidencias || undefined,
            limite: 80,
          },
        });
        setPassagens(r.itens ?? []);
        setModoBusca(r.modo_busca ?? 'filtros_atributos');
      } catch (e) {
        setAviso({ tipo: 'erro', texto: msgErro(e) });
      } finally {
        setBuscando(false);
      }
    },
    [
      passagemRef,
      fotoBuscaB64,
      limiarSim,
      corCamisa,
      corCalca,
      tipoManga,
      tipoInferior,
      generoAparente,
      faixaEtaria,
      dataInicio,
      dataFim,
      usaBone,
      usaOculos,
      carregaMochila,
      segurandoObj,
      soEvidencias,
    ],
  );

  const carregarAlertas = useCallback(async () => {
    setCarregandoAlertas(true);
    try {
      const r = await api<{ alertas: AlertaItem[] }>('vision_alertas_listar', { query: { limite: 60 } });
      setAlertas(r.alertas ?? []);
    } catch (e) {
      setAviso({ tipo: 'erro', texto: msgErro(e) });
    } finally {
      setCarregandoAlertas(false);
    }
  }, []);

  const carregarGaleria = useCallback(async () => {
    setCarregandoGaleria(true);
    try {
      const r = await api<{ pessoas: GaleriaPessoa[]; restritos_hikvision: RestritoHik[] }>(
        'vision_galeria_listar',
        { query: { categoria: filtroCatGaleria, busca: buscaGaleria, status: 'todos' } },
      );
      setGaleria(r.pessoas ?? []);
      setRestritosHik(r.restritos_hikvision ?? []);
    } catch (e) {
      setAviso({ tipo: 'erro', texto: msgErro(e) });
    } finally {
      setCarregandoGaleria(false);
    }
  }, [filtroCatGaleria, buscaGaleria]);

  const carregarCameras = useCallback(async () => {
    setCarregandoCameras(true);
    try {
      const r = await api<{
        cameras: VisionCamera[];
        nvrs_condominio?: NvrCondominioItem[];
        cftv_importaveis: CftvImportavel[];
      }>('vision_cameras_listar');
      setCameras(r.cameras ?? []);
      setNvrsCondominio(r.nvrs_condominio ?? []);
      setCftvImportaveis(r.cftv_importaveis ?? []);
    } catch (e) {
      setAviso({ tipo: 'erro', texto: msgErro(e) });
    } finally {
      setCarregandoCameras(false);
    }
  }, []);

  useEffect(() => {
    carregarStatus();
    executarBuscaForense();
  }, [carregarStatus]);

  useEffect(() => {
    if (aba === 'alertas') {
      carregarAlertas();
      const t = window.setInterval(carregarAlertas, 12000);
      return () => window.clearInterval(t);
    }
    if (aba === 'galeria') carregarGaleria();
    if (aba === 'cameras') carregarCameras();
  }, [aba, carregarAlertas, carregarGaleria, carregarCameras]);

  // Busca moradores para importação 1-clique na Galeria
  useEffect(() => {
    if (!modalGaleria || abaOrigemGaleria !== 'morador') return;
    const t = window.setTimeout(() => {
      api<{ moradores: MoradorBusca[] }>('restricao_buscar_moradores', {
        query: { q: buscaMoradorTxt },
      })
        .then((r) => setMoradoresEncontrados(r.moradores ?? []))
        .catch(() => {});
    }, 260);
    return () => window.clearTimeout(t);
  }, [modalGaleria, abaOrigemGaleria, buscaMoradorTxt]);

  // ─── Ações: Busca Forense 1:N ─────────────────────────────────────────────
  const aoSelecionarFotoBusca = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const b64 = await lerArquivoBase64(f);
    setPassagemRef(null);
    setFotoBuscaB64(b64);
    executarBuscaForense({ passagemRefId: null, fotoB64: b64 });
  };

  const buscarRostoDePassagem = (p: PassagemItem) => {
    setFotoBuscaB64('');
    setPassagemRef({ id: p.id, foto: p.foto_rosto_url });
    setAba('forense');
    executarBuscaForense({ passagemRefId: p.id, fotoB64: '' });
  };

  const limparFiltrosForense = () => {
    setFotoBuscaB64('');
    setPassagemRef(null);
    setLimiarSim(46);
    setCorCamisa('');
    setCorCalca('');
    setTipoManga('');
    setTipoInferior('');
    setGeneroAparente('');
    setFaixaEtaria('');
    setDataInicio('');
    setDataFim('');
    setUsaBone(false);
    setUsaOculos(false);
    setCarregaMochila(false);
    setSegurandoObj(false);
    setSoEvidencias(false);
    window.setTimeout(() => executarBuscaForense({ passagemRefId: null, fotoB64: '' }), 20);
  };

  const salvarEvidenciaPassagem = async () => {
    if (!modalEvidencia) return;
    try {
      const r = await api<{ mensagem: string }>('vision_passagem_fixar', {
        metodo: 'POST',
        corpo: {
          id: modalEvidencia.id,
          fixado_evidencia: modalEvidencia.fixado,
          nota_investigacao: modalEvidencia.nota,
        },
      });
      setAviso({ tipo: 'ok', texto: r.mensagem });
      setPassagens((ant) =>
        ant.map((it) =>
          it.id === modalEvidencia.id
            ? { ...it, fixado_evidencia: modalEvidencia.fixado, nota_investigacao: modalEvidencia.nota }
            : it,
        ),
      );
      setModalEvidencia(null);
    } catch (e) {
      setAviso({ tipo: 'erro', texto: msgErro(e) });
    }
  };

  // ─── Ações: Galeria 512D ──────────────────────────────────────────────────
  const abrirNovoGaleria = (passagem?: PassagemItem) => {
    setPreviaValidacao(null);
    setAbaOrigemGaleria('upload');
    setFormGaleria({
      id: 0,
      nome: passagem?.pessoa_nome || '',
      categoria: 'restrito',
      nivel_alerta: 'critico',
      escopo: 'restrito_locais',
      pessoa_externa_id: passagem ? `PASS-${passagem.id}` : '',
      observacao: passagem?.nota_investigacao || '',
      foto_base64: '',
      usuario_origem_id: 0,
      restricao_origem_id: 0,
      passagem_origem_id: passagem ? passagem.id : 0,
      passagem_foto_url: passagem?.foto_rosto_url ?? null,
    });
    setModalGaleria(true);
  };

  const abrirEditarGaleria = (g: GaleriaPessoa) => {
    setPreviaValidacao(null);
    setAbaOrigemGaleria('upload');
    setFormGaleria({
      id: g.id,
      nome: g.nome,
      categoria: g.categoria,
      nivel_alerta: g.nivel_alerta,
      escopo: g.escopo,
      pessoa_externa_id: g.pessoa_externa_id || '',
      observacao: g.observacao || '',
      foto_base64: '',
      usuario_origem_id: 0,
      restricao_origem_id: 0,
      passagem_origem_id: 0,
      passagem_foto_url: g.foto_url,
    });
    setModalGaleria(true);
  };

  const validarFotoGaleriaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const b64 = await lerArquivoBase64(f);
    setFormGaleria((p) => ({
      ...p,
      foto_base64: b64,
      usuario_origem_id: 0,
      restricao_origem_id: 0,
      passagem_origem_id: 0,
    }));
    setValidandoFotoGal(true);
    setPreviaValidacao(null);
    try {
      const r = await api<{
        validacao: {
          provedor: string;
          nitidez_lap: number;
          simetria_frontal: number;
          retrato_3x4_base64: string;
        };
      }>('vision_galeria_validar_foto', {
        metodo: 'POST',
        corpo: { foto_base64: b64 },
      });
      setPreviaValidacao(r.validacao);
    } catch (err) {
      setPreviaValidacao({ erro: msgErro(err) });
    } finally {
      setValidandoFotoGal(false);
    }
  };

  const salvarPessoaGaleria = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvandoGaleria(true);
    try {
      const r = await api<{ mensagem: string }>('vision_galeria_salvar', {
        metodo: 'POST',
        corpo: formGaleria,
      });
      setAviso({ tipo: 'ok', texto: r.mensagem });
      setModalGaleria(false);
      carregarStatus();
      if (aba === 'galeria') carregarGaleria();
      if (aba === 'forense') executarBuscaForense();
    } catch (err) {
      setAviso({ tipo: 'erro', texto: msgErro(err) });
    } finally {
      setSalvandoGaleria(false);
    }
  };

  const alternarGaleria = async (g: GaleriaPessoa) => {
    try {
      const r = await api<{ mensagem: string }>('vision_galeria_alternar', {
        metodo: 'POST',
        corpo: { id: g.id },
      });
      setAviso({ tipo: 'ok', texto: r.mensagem });
      carregarGaleria();
      carregarStatus();
    } catch (err) {
      setAviso({ tipo: 'erro', texto: msgErro(err) });
    }
  };

  const excluirGaleria = async (g: GaleriaPessoa) => {
    if (!window.confirm(`Remover '${g.nome}' da Galeria Biométrica 512D?`)) return;
    try {
      const r = await api<{ mensagem: string }>('vision_galeria_excluir', {
        metodo: 'POST',
        corpo: { id: g.id },
      });
      setAviso({ tipo: 'ok', texto: r.mensagem });
      carregarGaleria();
      carregarStatus();
    } catch (err) {
      setAviso({ tipo: 'erro', texto: msgErro(err) });
    }
  };

  // ─── Ações: Câmeras IP Dual-Stream & Direto NVR Hikvision ─────────────────
  const abrirNovaCamera = (nvrPreSelecionado?: NvrCondominioItem) => {
    const usarNvr = Boolean(nvrPreSelecionado) || nvrsCondominio.some((n) => n.ia_facial_nativa);
    const nvrDefault = nvrPreSelecionado || nvrsCondominio.find((n) => n.ia_facial_nativa) || nvrsCondominio[0];
    setFormCam({
      id: 0,
      importar_cftv_id: 0,
      nvr_id: usarNvr && nvrDefault ? nvrDefault.id : 0,
      canal_nvr: '1',
      nome: '',
      fabricante: usarNvr ? 'hikvision' : 'uniview',
      host: usarNvr && nvrDefault ? nvrDefault.ip : '',
      porta_rtsp: usarNvr && nvrDefault ? String(nvrDefault.porta_rtsp) : '554',
      porta_http: usarNvr && nvrDefault ? String(nvrDefault.porta_http) : '80',
      porta_onvif: usarNvr && nvrDefault ? String(nvrDefault.porta_http) : '80',
      usuario: usarNvr && nvrDefault ? nvrDefault.usuario : 'admin',
      senha: '',
      rtsp_main_path: usarNvr ? '/Streaming/Channels/101' : '/media/video1',
      rtsp_sub_path: usarNvr ? '/Streaming/Channels/102' : '/media/video2',
      limiar_nitidez: '50',
      modo_captura: usarNvr ? 'hikvision_nvr_nativo' : 'onvif_burst',
      ativo: true,
    });
    setModalCamera(true);
  };

  const abrirEditarCamera = (c: VisionCamera) => {
    setFormCam({
      id: c.id,
      importar_cftv_id: 0,
      nvr_id: c.nvr_id ?? 0,
      canal_nvr: String(c.canal_nvr ?? 1),
      nome: c.nome,
      fabricante: c.fabricante,
      host: c.host,
      porta_rtsp: String(c.porta_rtsp),
      porta_http: String(c.porta_http),
      porta_onvif: String(c.porta_onvif),
      usuario: c.usuario,
      senha: '',
      rtsp_main_path: c.rtsp_main_path,
      rtsp_sub_path: c.rtsp_sub_path,
      limiar_nitidez: String(c.limiar_nitidez),
      modo_captura:
        c.modo_captura === 'hikvision_nvr_nativo'
          ? 'hikvision_nvr_nativo'
          : c.modo_captura === 'rtsp_poll'
            ? 'rtsp_poll'
            : 'onvif_burst',
      ativo: c.ativo,
    });
    setModalCamera(true);
  };

  const aplicarImportacaoCftv = (cf: CftvImportavel) => {
    const nvrMesmoHost = nvrsCondominio.find((n) => n.ip.toLowerCase() === cf.host.toLowerCase());
    const sugerirNvr = cf.modo_sugerido === 'hikvision_nvr_nativo' || Boolean(nvrMesmoHost);
    setFormCam((p) => ({
      ...p,
      importar_cftv_id: cf.cftv_id,
      nvr_id: nvrMesmoHost ? nvrMesmoHost.id : 0,
      canal_nvr: String(cf.canal ?? 1),
      nome: cf.nome,
      fabricante: cf.fabricante,
      host: cf.host,
      porta_rtsp: String(cf.porta_rtsp),
      usuario: cf.usuario,
      modo_captura: sugerirNvr ? 'hikvision_nvr_nativo' : p.modo_captura === 'hikvision_nvr_nativo' ? 'onvif_burst' : p.modo_captura,
      rtsp_main_path: cf.rtsp_main_path,
      rtsp_sub_path: cf.rtsp_sub_path,
    }));
  };

  const salvarCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvandoCamera(true);
    try {
      const r = await api<{ mensagem: string; id: number }>('vision_camera_salvar', {
        metodo: 'POST',
        corpo: {
          ...formCam,
          nvr_id: formCam.nvr_id > 0 ? formCam.nvr_id : undefined,
          canal_nvr: Number(formCam.canal_nvr) || 1,
          porta_rtsp: Number(formCam.porta_rtsp) || 554,
          porta_http: Number(formCam.porta_http) || 80,
          porta_onvif: Number(formCam.porta_onvif) || 80,
          limiar_nitidez: Number(formCam.limiar_nitidez) || 50,
        },
      });
      setAviso({ tipo: 'ok', texto: r.mensagem });
      setModalCamera(false);
      setCamerasAoVivo((ant) => ({ ...ant, [r.id]: true }));
      carregarCameras();
      carregarStatus();
    } catch (err) {
      setAviso({ tipo: 'erro', texto: msgErro(err) });
    } finally {
      setSalvandoCamera(false);
    }
  };

  const configurarSincronizarNvr = async (nv: NvrCondominioItem, ativar: boolean) => {
    setAcaoNvrId(nv.id);
    try {
      const r = await api<{ mensagem: string }>('vision_nvr_configurar', {
        metodo: 'POST',
        corpo: {
          nvr_id: nv.id,
          ia_facial_nativa: ativar,
          sincronizar_agora: ativar,
        },
      });
      setAviso({ tipo: 'ok', texto: r.mensagem });
      carregarCameras();
    } catch (err) {
      setAviso({ tipo: 'erro', texto: msgErro(err) });
    } finally {
      setAcaoNvrId(null);
    }
  };

  const coletarEventosNvrAgora = async (nv: NvrCondominioItem) => {
    setAcaoNvrId(nv.id);
    try {
      const r = await api<{ mensagem: string }>('vision_nvr_coletar_agora', {
        metodo: 'POST',
        corpo: { nvr_id: nv.id },
      });
      setAviso({ tipo: 'ok', texto: r.mensagem });
      carregarStatus();
      carregarCameras();
    } catch (err) {
      setAviso({ tipo: 'erro', texto: msgErro(err) });
    } finally {
      setAcaoNvrId(null);
    }
  };

  const salvarNovoNvr = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvandoNvr(true);
    try {
      const r = await api<{ mensagem: string }>('vision_nvr_configurar', {
        metodo: 'POST',
        corpo: {
          ...formNovoNvr,
          porta_http: Number(formNovoNvr.porta_http) || 80,
          porta_rtsp: Number(formNovoNvr.porta_rtsp) || (formNovoNvr.modo_conexao === 'isup' ? 7660 : 554),
          ia_facial_nativa: true,
          sincronizar_agora: true,
        },
      });
      setAviso({ tipo: 'ok', texto: r.mensagem });
      setModalNovoNvr(false);
      carregarCameras();
    } catch (err) {
      setAviso({ tipo: 'erro', texto: msgErro(err) });
    } finally {
      setSalvandoNvr(false);
    }
  };

  const copiarWebhookNvr = (nv: NvrCondominioItem) => {
    navigator.clipboard?.writeText(nv.webhook_url);
    setCopiadoTokenId(nv.id);
    window.setTimeout(() => setCopiadoTokenId(null), 2200);
  };

  const testarCamera = async (c: VisionCamera) => {
    setTestandoCamId(c.id);
    try {
      const r = await api<{
        mensagem: string;
        calibrado_h264: boolean;
        latencia_captura_ms: number;
        snapshot_base64: string;
        analise: Record<string, unknown>;
      }>('vision_camera_testar', {
        metodo: 'POST',
        corpo: { id: c.id, indexar_historico: true },
      });
      setResultadoTesteCam({
        cameraNome: c.nome,
        latenciaMs: r.latencia_captura_ms,
        calibradoH264: r.calibrado_h264,
        snapshot: r.snapshot_base64,
        analise: r.analise,
      });
      carregarStatus();
    } catch (err) {
      setAviso({ tipo: 'erro', texto: msgErro(err) });
    } finally {
      setTestandoCamId(null);
    }
  };

  const excluirCamera = async (c: VisionCamera) => {
    if (!window.confirm(`Remover a câmera IA '${c.nome}'?`)) return;
    try {
      const r = await api<{ mensagem: string }>('vision_camera_excluir', {
        metodo: 'POST',
        corpo: { id: c.id },
      });
      setAviso({ tipo: 'ok', texto: r.mensagem });
      carregarCameras();
      carregarStatus();
    } catch (err) {
      setAviso({ tipo: 'erro', texto: msgErro(err) });
    }
  };

  // ─── Ação: Análise Manual Avulsa ──────────────────────────────────────────
  const rodarAnaliseManual = async () => {
    if (!fotoManualB64) return;
    setAnalisandoManual(true);
    setResAnaliseManual(null);
    try {
      const r = await api<{ analise: Record<string, unknown> }>('vision_analisar_manual', {
        metodo: 'POST',
        corpo: {
          foto_base64: fotoManualB64,
          camera_nome: 'Teste Operador IA',
          indexar_historico: indexarManual,
        },
      });
      setResAnaliseManual(r.analise);
      carregarStatus();
      if (indexarManual && aba === 'forense') executarBuscaForense();
    } catch (err) {
      setAviso({ tipo: 'erro', texto: msgErro(err) });
    } finally {
      setAnalisandoManual(false);
    }
  };

  const gpu = status?.motor?.gpu_worker;
  const motorOnline = Boolean(status?.motor?.ok);
  const podeGerenciar = Boolean(status?.pode_gerenciar);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1600px] mx-auto">
      {/* ── Cabeçalho + Telemetria GPU / Motor 512D ────────────────────────── */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-5 shadow-lg border border-slate-700/60">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300 shrink-0">
              <ScanFace size={26} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-extrabold tracking-tight">
                  Visão Computacional 512D &amp; Busca Forense 1:N
                </h1>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    motorOnline
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                      : 'bg-red-500/20 text-red-300 border border-red-400/30'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${motorOnline ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                  {motorOnline ? 'Motor :8099 Online' : 'Motor Offline'}
                </span>
                {gpu?.cuda_ativo ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/25 text-indigo-200 border border-indigo-400/30">
                    <Zap size={12} className="text-amber-300" />
                    CUDA: {gpu.gpu_nome || 'RTX 3060'} ({gpu.vram_usada_mb ?? 0}/{gpu.vram_total_mb ?? 0} MB • {gpu.temp_c ?? 0}°C)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-200 border border-amber-400/30">
                    <Cpu size={12} />
                    Modo CPU Local (Failover Automático)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-1">
                Biometria AdaFace IR-50 (512D) + Alinhamento 3D Umeyama + Cores HSV (IR Noturno) + 26 Atributos PP-LCNet PA-100K + Classificador Dedicado de Óculos SigLIP Vision 224 + Índice HNSW
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setResAnaliseManual(null);
                setModalAnaliseManual(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow transition"
            >
              <Sparkles size={15} />
              Analisar Foto Avulsa
            </button>
            <button
              type="button"
              onClick={() => {
                carregarStatus();
                if (aba === 'forense') executarBuscaForense();
                if (aba === 'alertas') carregarAlertas();
                if (aba === 'galeria') carregarGaleria();
                if (aba === 'cameras') carregarCameras();
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-700/80 hover:bg-slate-700 text-slate-100 text-xs font-bold border border-slate-600 transition"
            >
              <RefreshCw size={14} />
              Atualizar
            </button>
          </div>
        </div>

        {/* Cartões de Contadores */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <div className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5">
            <div className="text-[11px] text-slate-400 font-semibold uppercase">Passagens Hoje</div>
            <div className="text-xl font-extrabold text-white mt-0.5">
              {status?.contadores.passagens_hoje ?? 0}
              <span className="text-xs font-normal text-slate-400 ml-1.5">
                ({status?.contadores.passagens_total ?? 0} no acervo)
              </span>
            </div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5">
            <div className="text-[11px] text-slate-400 font-semibold uppercase">Alertas (Últimas 24h)</div>
            <div className="text-xl font-extrabold text-rose-300 mt-0.5">
              {status?.contadores.alertas_24h ?? 0}
            </div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5">
            <div className="text-[11px] text-slate-400 font-semibold uppercase">Galeria Monitorada 512D</div>
            <div className="text-xl font-extrabold text-amber-300 mt-0.5">
              {status?.contadores.galeria_ativas ?? 0}
              <span className="text-xs font-normal text-slate-400 ml-1.5">
                ({status?.motor?.galeria_identidades_ram ?? 0} em RAM)
              </span>
            </div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5">
            <div className="text-[11px] text-slate-400 font-semibold uppercase">Câmeras IP &amp; NVR Hikvision</div>
            <div className="text-xl font-extrabold text-emerald-300 mt-0.5">
              {status?.contadores.cameras_ativas ?? 0}
              <span className="text-xs font-normal text-slate-400 ml-1.5">
                / {status?.contadores.cameras_total ?? 0} ativas
                {(status?.contadores.cameras_nvr_nativo ?? 0) > 0
                  ? ` • ${status?.contadores.cameras_nvr_nativo} direto NVR`
                  : ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Aviso Flutuante ────────────────────────────────────────────────── */}
      {aviso && (
        <div
          className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-sm font-semibold ${
            aviso.tipo === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {aviso.tipo === 'ok' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span>{aviso.texto}</span>
          </div>
          <button type="button" onClick={() => setAviso(null)} className="opacity-70 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Navegação por Abas ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm">
        <button
          type="button"
          onClick={() => setAba('forense')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition ${
            aba === 'forense'
              ? 'bg-slate-900 text-white shadow'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Search size={16} />
          Busca Forense 1:N &amp; Passagens
        </button>
        <button
          type="button"
          onClick={() => setAba('alertas')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition ${
            aba === 'alertas'
              ? 'bg-rose-600 text-white shadow'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ShieldAlert size={16} />
          Alertas Tempo Real
          {(status?.contadores.alertas_24h ?? 0) > 0 && (
            <span className="px-2 py-0.5 text-[11px] rounded-full bg-rose-100 text-rose-700 font-extrabold">
              {status?.contadores.alertas_24h}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setAba('galeria')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition ${
            aba === 'galeria'
              ? 'bg-slate-900 text-white shadow'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users size={16} />
          Galeria Monitorada 512D ({status?.contadores.galeria_ativas ?? 0})
        </button>
        <button
          type="button"
          onClick={() => setAba('cameras')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition ${
            aba === 'cameras'
              ? 'bg-slate-900 text-white shadow'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Video size={16} />
          Câmeras IP &amp; NVR Hikvision ({status?.contadores.cameras_total ?? 0})
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          ABA 1: BUSCA FORENSE HÍBRIDA 1:N & HISTÓRICO DE PASSAGENS
         ═══════════════════════════════════════════════════════════════════════ */}
      {aba === 'forense' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={18} className="text-blue-600" />
                <h2 className="text-base font-extrabold text-slate-800">
                  Filtros Híbridos 1:N — Rosto 512D + Cor da Roupa + 26 Características Humanas
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                  Modo ativo:{' '}
                  {modoBusca === 'vetorial_hibrida' ? '🎯 Busca Vetorial HNSW 512D' : '👕 Cronológico / Atributos'}
                </span>
                <button
                  type="button"
                  onClick={limparFiltrosForense}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
                >
                  <RotateCcw size={13} />
                  Limpar Filtros
                </button>
              </div>
            </div>

            {/* Linha 1: Busca por Foto Facial ou Passagem de Referência */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
              <div className="lg:col-span-6 flex flex-wrap items-center gap-3">
                {passagemRef ? (
                  <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                    <VisionImg
                      path={passagemRef.foto}
                      alt="Referência"
                      className="w-12 h-14 object-cover rounded-lg border border-blue-300"
                    />
                    <div>
                      <div className="text-xs font-extrabold text-blue-900">
                        Buscando aparições da Passagem #{passagemRef.id}
                      </div>
                      <div className="text-[11px] text-blue-700">
                        Comparando vetor 512D via índice HNSW em todo o histórico
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPassagemRef(null);
                        executarBuscaForense({ passagemRefId: null });
                      }}
                      className="p-1 text-blue-700 hover:bg-blue-100 rounded-lg"
                      title="Remover referência facial"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : fotoBuscaB64 ? (
                  <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2">
                    <img
                      src={fotoBuscaB64}
                      alt="Foto busca"
                      className="w-12 h-14 object-cover rounded-lg border border-indigo-300"
                    />
                    <div>
                      <div className="text-xs font-extrabold text-indigo-900">Foto Facial Carregada (1:N)</div>
                      <div className="text-[11px] text-indigo-700">Vetor 512D extraído em tempo real</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFotoBuscaB64('');
                        executarBuscaForense({ fotoB64: '' });
                      }}
                      className="p-1 text-indigo-700 hover:bg-indigo-100 rounded-lg"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <label className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer shadow-sm transition">
                    <Upload size={15} />
                    Buscar por Foto do Rosto (1:N)
                    <input type="file" accept="image/*" className="hidden" onChange={aoSelecionarFotoBusca} />
                  </label>
                )}
                <span className="text-xs text-slate-500">
                  Ou clique em <strong>&ldquo;Buscar este rosto&rdquo;</strong> em qualquer pessoa abaixo.
                </span>
              </div>

              <div className="lg:col-span-6 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1">
                  <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                    <span>Limiar de Similaridade Facial</span>
                    <span className="text-blue-600">{limiarSim}%</span>
                  </div>
                  <input
                    type="range"
                    min={35}
                    max={80}
                    value={limiarSim}
                    onChange={(e) => setLimiarSim(Number(e.target.value))}
                    className="w-full accent-blue-600"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>35% (Mais amplo)</span>
                    <span>46% (Recomendado CFTV)</span>
                    <span>80% (Idêntico)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Linha 2: Filtros de Roupas, Gênero, Idade e Datas */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              <div>
                <label className={lbl}>Cor da Camisa</label>
                <select value={corCamisa} onChange={(e) => setCorCamisa(e.target.value)} className={inp}>
                  {CORES_OPCOES.map((c) => (
                    <option key={c.valor} value={c.valor}>
                      {c.rotulo}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={lbl}>Cor da Calça</label>
                <select value={corCalca} onChange={(e) => setCorCalca(e.target.value)} className={inp}>
                  {CORES_OPCOES.map((c) => (
                    <option key={c.valor} value={c.valor}>
                      {c.rotulo}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={lbl}>Manga / Casaco</label>
                <select value={tipoManga} onChange={(e) => setTipoManga(e.target.value)} className={inp}>
                  <option value="">Todos</option>
                  <option value="manga_curta">Manga Curta</option>
                  <option value="manga_longa">Manga Longa</option>
                  <option value="casaco_longo">Casaco / Jaqueta</option>
                </select>
              </div>
              <div>
                <label className={lbl}>Parte Inferior</label>
                <select value={tipoInferior} onChange={(e) => setTipoInferior(e.target.value)} className={inp}>
                  <option value="">Todos</option>
                  <option value="calca">Calça Comprida</option>
                  <option value="bermuda_shorts">Bermuda / Shorts</option>
                  <option value="saia_vestido">Saia / Vestido</option>
                </select>
              </div>
              <div>
                <label className={lbl}>Gênero Aparente</label>
                <select value={generoAparente} onChange={(e) => setGeneroAparente(e.target.value)} className={inp}>
                  <option value="">Todos</option>
                  <option value="masculino">Masculino</option>
                  <option value="feminino">Feminino</option>
                </select>
              </div>
              <div>
                <label className={lbl}>Faixa Etária</label>
                <select value={faixaEtaria} onChange={(e) => setFaixaEtaria(e.target.value)} className={inp}>
                  <option value="">Todas</option>
                  <option value="menor_18">Menor de 18</option>
                  <option value="adulto_18_60">Adulto (18–60)</option>
                  <option value="acima_60">Idoso (60+)</option>
                </select>
              </div>
              <div>
                <label className={lbl}>Data Inicial</label>
                <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className={inp} />
              </div>
              <div>
                <label className={lbl}>Data Final</label>
                <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className={inp} />
              </div>
            </div>

            {/* Linha 3: Checkboxes de Acessórios + Botão Pesquisar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { ativo: usaBone, set: setUsaBone, txt: '🧢 Boné / Chapéu' },
                  { ativo: usaOculos, set: setUsaOculos, txt: '👓 Óculos' },
                  { ativo: carregaMochila, set: setCarregaMochila, txt: '🎒 Mochila / Bolsa' },
                  { ativo: segurandoObj, set: setSegurandoObj, txt: '📦 Segurando Objeto' },
                  { ativo: soEvidencias, set: setSoEvidencias, txt: '📌 Só Evidências Fixadas' },
                ].map((ck) => (
                  <button
                    key={ck.txt}
                    type="button"
                    onClick={() => ck.set(!ck.ativo)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                      ck.ativo
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {ck.txt}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={buscando}
                onClick={() => executarBuscaForense()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold shadow disabled:opacity-60 transition"
              >
                <Search size={16} />
                {buscando ? 'Consultando HNSW...' : `Pesquisar Passagens (${passagens.length})`}
              </button>
            </div>
          </div>

          {/* Grade de Passagens */}
          {passagens.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <ScanFace size={44} className="mx-auto text-slate-300 mb-3" />
              <h3 className="text-base font-bold text-slate-700">Nenhuma passagem encontrada para os filtros atuais</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Assim que as câmeras IP capturarem rostos (ou você enviar uma foto em &ldquo;Analisar Foto Avulsa&rdquo;), cada passagem aparecerá indexada aqui com vetor 512D e atributos de roupa.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {passagens.map((p) => {
                const simPct = p.similaridade !== null && p.similaridade !== undefined ? Math.round(p.similaridade * 100) : null;
                return (
                  <div
                    key={p.id}
                    className={`bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col transition hover:shadow-md ${
                      p.fixado_evidencia ? 'border-amber-400 ring-2 ring-amber-200/60' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex gap-3 p-3.5 bg-slate-50/70 border-b border-slate-100">
                      <div className="relative w-20 h-26 shrink-0 rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                        <VisionImg
                          path={p.foto_rosto_url}
                          alt={`Passagem #${p.id}`}
                          className="w-20 h-26 object-cover"
                          onClick={() =>
                            setModalCena({
                              titulo: `Passagem #${p.id} — ${p.camera_nome || 'Câmera IA'}`,
                              rostoUrl: p.foto_rosto_url,
                              cenaUrl: p.foto_cena_url,
                              resumo: formatarDataHora(p.ultima_visto_em),
                            })
                          }
                        />
                        {simPct !== null && (
                          <span
                            className={`absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md text-[11px] font-extrabold text-white shadow ${
                              simPct >= 52 ? 'bg-emerald-600' : 'bg-blue-600'
                            }`}
                          >
                            {simPct}%
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1 flex-wrap">
                          <span className="text-[11px] font-bold text-slate-400">#{p.id}</span>
                          <div className="flex items-center gap-1 flex-wrap">
                            {p.origem_motor === 'hikvision_nvr_nativo' && (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200"
                                title="Capturado e comparado direto pelo NVR Hikvision (0% uso da nossa IA)"
                              >
                                🛡️ NVR Hikvision
                              </span>
                            )}
                            {p.fixado_evidencia && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                <Pin size={10} /> Evidência
                              </span>
                            )}
                          </div>
                        </div>

                        {p.pessoa_nome ? (
                          <div className="mt-0.5">
                            <div className="text-sm font-extrabold text-slate-900 truncate">{p.pessoa_nome}</div>
                            <span
                              className={`inline-block mt-0.5 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                BADGE_CATEGORIA[p.pessoa_categoria || 'monitorado']?.cls ||
                                'bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              {BADGE_CATEGORIA[p.pessoa_categoria || 'monitorado']?.txt || p.pessoa_categoria}
                            </span>
                          </div>
                        ) : (
                          <div className="text-sm font-bold text-slate-700 mt-0.5">Visitante / Não Cadastrado</div>
                        )}

                        <div className="text-[11px] text-slate-500 mt-1.5 truncate">
                          📹 {p.camera_nome || 'Câmera IA'}
                        </div>
                        <div className="text-[11px] text-slate-500">{formatarDataHora(p.ultima_visto_em)}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Aparições: <strong>{p.total_aparicoes}x</strong>
                          {p.laplaciano_score ? ` • Nitidez ${Math.round(p.laplaciano_score)}` : ''}
                        </div>
                      </div>
                    </div>

                    {/* Chips de Vestuário e 26 Características */}
                    <div className="p-3 flex-1 space-y-2">
                      <div className="flex flex-wrap gap-1">
                        {p.cor_camisa && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700">
                            👕 Camisa {LABEL_COR[p.cor_camisa] || p.cor_camisa}
                          </span>
                        )}
                        {p.tipo_manga && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700">
                            {LABEL_MANGA[p.tipo_manga] || p.tipo_manga}
                          </span>
                        )}
                        {p.cor_calca && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700">
                            👖 {LABEL_INFERIOR[p.tipo_parte_inferior || 'calca'] || 'Inferior'}{' '}
                            {LABEL_COR[p.cor_calca] || p.cor_calca}
                          </span>
                        )}
                        {p.usa_bone && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700">
                            🧢 Boné
                          </span>
                        )}
                        {p.usa_oculos && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-sky-50 text-sky-700">
                            👓 Óculos
                          </span>
                        )}
                        {p.carrega_mochila && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-800">
                            🎒 {LABEL_BOLSA[p.tipo_bolsa || ''] || 'Bolsa/Mochila'}
                          </span>
                        )}
                        {p.segurando_objetos && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-50 text-purple-700">
                            📦 Objeto em Mãos
                          </span>
                        )}
                        {p.genero_aparente && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-50 text-slate-500 border border-slate-200">
                            {p.genero_aparente === 'feminino' ? 'Fem.' : 'Masc.'}
                            {p.faixa_etaria_aparente ? ` • ${LABEL_FAIXA[p.faixa_etaria_aparente] || ''}` : ''}
                          </span>
                        )}
                      </div>

                      {p.nota_investigacao && (
                        <div className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-2.5 py-1.5">
                          📌 {p.nota_investigacao}
                        </div>
                      )}
                    </div>

                    {/* Botões de Ação Forense */}
                    <div className="px-3 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-1.5">
                      <button
                        type="button"
                        onClick={() => buscarRostoDePassagem(p)}
                        className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold transition"
                        title="Buscar todas as passagens desta mesma pessoa (1:N)"
                      >
                        <Search size={12} />
                        Buscar este rosto
                      </button>
                      {p.foto_cena_url && (
                        <button
                          type="button"
                          onClick={() =>
                            setModalCena({
                              titulo: `Cena Completa — Passagem #${p.id}`,
                              rostoUrl: p.foto_rosto_url,
                              cenaUrl: p.foto_cena_url,
                              resumo: `${p.camera_nome || 'Câmera IA'} • ${formatarDataHora(p.ultima_visto_em)}`,
                            })
                          }
                          className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                          title="Ver foto da cena completa"
                        >
                          <Eye size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setModalEvidencia({
                            id: p.id,
                            fixado: !p.fixado_evidencia,
                            nota: p.nota_investigacao || '',
                          })
                        }
                        className={`p-1.5 rounded-lg border ${
                          p.fixado_evidencia
                            ? 'bg-amber-100 border-amber-300 text-amber-800'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                        title="Fixar como evidência / adicionar nota"
                      >
                        <Pin size={14} />
                      </button>
                      {podeGerenciar && !p.galeria_pessoa_id && (
                        <button
                          type="button"
                          onClick={() => abrirNovoGaleria(p)}
                          className="p-1.5 rounded-lg bg-white border border-slate-200 text-rose-600 hover:bg-rose-50"
                          title="Cadastrar este rosto na Galeria Monitorada 512D"
                        >
                          <UserPlus size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          ABA 2: ALERTAS EM TEMPO REAL (ZONA 1 CRÍTICO / ZONA 2 ATENÇÃO)
         ═══════════════════════════════════════════════════════════════════════ */}
      {aba === 'alertas' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-slate-800">
                Central de Alertas Biométricos 512D (Webhook + Push Instantâneo)
              </h2>
              <p className="text-xs text-slate-500">
                <strong>Zona 1 Crítico (&ge; 52%)</strong> confirma alta certeza forense;{' '}
                <strong>Zona 2 Atenção (&ge; 44%)</strong> alerta preventiva em ângulos rápidos de CFTV.
              </p>
            </div>
            <button
              type="button"
              onClick={carregarAlertas}
              disabled={carregandoAlertas}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700"
            >
              <RefreshCw size={14} className={carregandoAlertas ? 'animate-spin' : ''} />
              Atualizar Alertas
            </button>
          </div>

          {alertas.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <ShieldAlert size={44} className="mx-auto text-slate-300 mb-3" />
              <h3 className="text-base font-bold text-slate-700">Nenhum alerta registrado neste condomínio</h3>
              <p className="text-xs text-slate-500 mt-1">
                Quando uma pessoa cadastrada na Galeria 512D passar por qualquer câmera IP, o alerta aparecerá aqui imediatamente.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {alertas.map((a) => {
                const critico = a.zona_confianca === 'critico';
                return (
                  <div
                    key={a.id}
                    className={`rounded-2xl border p-4 shadow-sm flex flex-col sm:flex-row gap-4 ${
                      critico
                        ? 'bg-red-50/40 border-red-300 ring-1 ring-red-200'
                        : 'bg-amber-50/40 border-amber-300 ring-1 ring-amber-200'
                    }`}
                  >
                    {/* Par de fotos: Captura Câmera vs Galeria Oficial */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-center">
                        <VisionImg
                          path={a.foto_captura_url}
                          alt="Captura"
                          className="w-20 h-24 object-cover rounded-xl border-2 border-red-400 shadow-sm"
                          onClick={() =>
                            setModalCena({
                              titulo: `Alerta #${a.id} — ${a.pessoa_nome}`,
                              rostoUrl: a.foto_captura_url,
                              cenaUrl: a.foto_cena_url,
                              resumo: `${a.camera_nome} • ${a.similaridade_pct}% de similaridade`,
                            })
                          }
                        />
                        <span className="text-[10px] font-bold text-slate-500 block mt-1">Câmera</span>
                      </div>
                      <div className="text-center">
                        <VisionImg
                          path={a.pessoa_foto_url}
                          alt={a.pessoa_nome}
                          className="w-20 h-24 object-cover rounded-xl border-2 border-slate-300 shadow-sm"
                        />
                        <span className="text-[10px] font-bold text-slate-500 block mt-1">Galeria</span>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase ${
                              critico ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'
                            }`}
                          >
                            {critico ? '🚨 Zona 1 • Crítico' : '⚠️ Zona 2 • Atenção'} ({a.similaridade_pct}%)
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                              BADGE_CATEGORIA[a.pessoa_categoria]?.cls || 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {BADGE_CATEGORIA[a.pessoa_categoria]?.txt || a.pessoa_categoria}
                          </span>
                          {a.origem_motor === 'hikvision_nvr_nativo' && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-teal-100 text-teal-800 border border-teal-200">
                              🛡️ Direto do NVR Hikvision (0% GPU)
                            </span>
                          )}
                        </div>

                        <h3 className="text-base font-extrabold text-slate-900 mt-1.5">{a.pessoa_nome}</h3>
                        <div className="text-xs text-slate-600 mt-0.5">
                          📹 <strong>{a.camera_nome}</strong> • {formatarDataHora(a.criado_em)}
                        </div>
                        {a.resumo_vestuario && (
                          <div className="text-xs font-semibold text-slate-700 mt-1">👕 {a.resumo_vestuario}</div>
                        )}
                        {a.pessoa_observacao && (
                          <div className="text-xs text-red-800 bg-white/80 border border-red-200 rounded-lg px-2.5 py-1 mt-1.5">
                            Motivo: {a.pessoa_observacao}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        {a.foto_cena_url && (
                          <button
                            type="button"
                            onClick={() =>
                              setModalCena({
                                titulo: `Cena do Alerta #${a.id} — ${a.pessoa_nome}`,
                                rostoUrl: a.foto_captura_url,
                                cenaUrl: a.foto_cena_url,
                                resumo: `${a.camera_nome} • ${formatarDataHora(a.criado_em)}`,
                              })
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-bold text-slate-800 hover:bg-slate-50"
                          >
                            <Eye size={13} />
                            Ver Cena Completa
                          </button>
                        )}
                        {a.passagem_id && (
                          <button
                            type="button"
                            onClick={() => {
                              setFotoBuscaB64('');
                              setPassagemRef({ id: a.passagem_id!, foto: a.foto_captura_url });
                              setAba('forense');
                              executarBuscaForense({ passagemRefId: a.passagem_id! });
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
                          >
                            <Search size={13} />
                            Rastrear Aparições (1:N)
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          ABA 3: GALERIA MONITORADA 512D (UPLOAD VALIDADO + IMPORTAÇÃO 1-CLIQUE)
         ═══════════════════════════════════════════════════════════════════════ */}
      {aba === 'galeria' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <input
                type="text"
                placeholder="Buscar por nome, código ou observação..."
                value={buscaGaleria}
                onChange={(e) => setBuscaGaleria(e.target.value)}
                className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 w-full md:w-72"
              />
              <select
                value={filtroCatGaleria}
                onChange={(e) => setFiltroCatGaleria(e.target.value)}
                className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none"
              >
                <option value="">Todas as Categorias</option>
                <option value="restrito">Suspeito / Restrito</option>
                <option value="monitorado">Monitorado</option>
                <option value="vip">VIP / Morador</option>
                <option value="funcionario">Funcionário</option>
              </select>
              <button
                type="button"
                onClick={carregarGaleria}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700"
              >
                Filtrar
              </button>
            </div>

            {podeGerenciar && (
              <button
                type="button"
                onClick={() => abrirNovoGaleria()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm"
              >
                <Plus size={16} />
                Cadastrar Pessoa na Galeria 512D
              </button>
            )}
          </div>

          {carregandoGaleria ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-sm text-slate-500">
              Carregando Galeria 512D...
            </div>
          ) : galeria.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <Users size={44} className="mx-auto text-slate-300 mb-3" />
              <h3 className="text-base font-bold text-slate-700">Nenhuma pessoa cadastrada na Galeria 512D</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Cadastre suspeitos, pessoas monitoradas, VIPs ou importe diretamente de Moradores / Blacklist Hikvision para gerar alertas automáticos nas câmeras IP.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {galeria.map((g) => (
                <div
                  key={g.id}
                  className={`bg-white rounded-2xl border p-4 shadow-sm flex flex-col justify-between ${
                    g.ativo ? 'border-slate-200' : 'border-slate-200 opacity-60'
                  }`}
                >
                  <div className="flex gap-3.5">
                    <VisionImg
                      path={g.foto_url}
                      alt={g.nome}
                      className="w-20 h-26 object-cover rounded-xl border border-slate-200 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                            BADGE_CATEGORIA[g.categoria]?.cls || 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {BADGE_CATEGORIA[g.categoria]?.txt || g.categoria}
                        </span>
                        {g.escopo === 'global' && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-800">
                            Global
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-extrabold text-slate-900 mt-1 truncate">{g.nome}</h3>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Alerta:{' '}
                        <strong className={g.nivel_alerta === 'critico' ? 'text-red-600' : 'text-amber-600'}>
                          {g.nivel_alerta.toUpperCase()}
                        </strong>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Alertas disparados: <strong>{g.total_alertas}</strong>
                        {g.laplaciano_score ? ` • Lap. ${Math.round(g.laplaciano_score)}` : ''}
                      </div>
                      {g.observacao && (
                        <p className="text-xs text-slate-600 mt-1.5 line-clamp-2">{g.observacao}</p>
                      )}
                    </div>
                  </div>

                  {g.pode_editar && (
                    <div className="flex items-center justify-end gap-1.5 mt-3 pt-2.5 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => alternarGaleria(g)}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700"
                      >
                        {g.ativo ? 'Pausar' : 'Ativar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => abrirEditarGaleria(g)}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
                        title="Editar"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => excluirGaleria(g)}
                        className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600"
                        title="Excluir"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          ABA 4: CÂMERAS IP & INTEGRAÇÃO DIRETA NVR FACIAL HIKVISION
         ═══════════════════════════════════════════════════════════════════════ */}
      {aba === 'cameras' && (
        <div className="space-y-5">
          {/* ── Seção 1: Integração Direta com NVRs Faciais Hikvision (0% Consumo da Nossa IA) ── */}
          <div className="bg-gradient-to-br from-teal-950 via-slate-900 to-slate-900 text-white rounded-2xl border border-teal-700/40 p-5 shadow-md space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300 shrink-0">
                  <ShieldCheck size={24} />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-extrabold text-white">
                      Integração Direta NVR Hikvision — Comparação Facial no Próprio Equipamento
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                      0% GPU / 0% Banda 4MP no Servidor
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 max-w-4xl">
                    Tem câmera Hikvision com captura facial ligada no NVR Hikvision com IA (AcuSense / DeepinMind)?
                    Vincule direto abaixo: o NVR faz toda a comparação internamente, sincroniza nossa Galeria Monitorada +
                    Blacklist e entrega os eventos prontos via Push HTTP e Coletor ISAPI/ISUP sem consumir nossa IA!
                  </p>
                </div>
              </div>

              {podeGerenciar && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setModalNovoNvr(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow transition"
                  >
                    <Server size={15} />
                    + Cadastrar NVR Hikvision
                  </button>
                  <button
                    type="button"
                    onClick={() => abrirNovaCamera()}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow transition"
                  >
                    <Plus size={16} />
                    Adicionar Câmera (NVR ou IA)
                  </button>
                </div>
              )}
            </div>

            {nvrsCondominio.length === 0 ? (
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs text-slate-300">
                  Nenhum NVR Hikvision cadastrado neste condomínio ainda. Cadastre o NVR (via IP/Tailscale ou ISUP 5.0)
                  para sincronizar a Galeria Facial e vincular os canais das câmeras faciais em 1 clique!
                </div>
                {podeGerenciar && (
                  <button
                    type="button"
                    onClick={() => setModalNovoNvr(true)}
                    className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold shrink-0"
                  >
                    Configurar Primeiro NVR
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                {nvrsCondominio.map((nv) => {
                  const processando = acaoNvrId === nv.id;
                  return (
                    <div
                      key={nv.id}
                      className={`rounded-xl border p-4 space-y-3 transition ${
                        nv.ia_facial_nativa
                          ? 'bg-teal-950/60 border-teal-400/40'
                          : 'bg-white/5 border-white/10'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-extrabold text-white">{nv.nome}</span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-800 text-slate-200 border border-slate-700">
                              {nv.modo_conexao === 'isup' ? 'ISUP 5.0 (Sem abrir portas)' : `IP ${nv.ip}:${nv.porta_http}`}
                            </span>
                            {nv.ia_facial_nativa ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/25 text-emerald-300 border border-emerald-400/30">
                                ● Motor NVR Ativo
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-700 text-slate-300">
                                Motor NVR Inativo
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-300 mt-1">
                            {nv.modelo_detectado ? `Modelo: ${nv.modelo_detectado} • ` : ''}
                            {nv.fdlib_id ? `Biblioteca FDLib #${nv.fdlib_id} • ` : ''}
                            {nv.ultimo_sync_fdlib_em
                              ? `Último Sync: ${formatarDataHora(nv.ultimo_sync_fdlib_em)}`
                              : 'Galeria ainda não sincronizada'}
                            {nv.ultimo_evento_nvr_em
                              ? ` • Último Evento: ${formatarDataHora(nv.ultimo_evento_nvr_em)}`
                              : ''}
                          </div>
                        </div>
                      </div>

                      {/* Webhook Push HTTP Listening do NVR */}
                      <div className="bg-black/35 border border-white/10 rounded-lg p-2.5 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-teal-300">
                            Push Tempo Real (HTTP Listening / Destinatário HTTP do NVR):
                          </span>
                          <button
                            type="button"
                            onClick={() => copiarWebhookNvr(nv)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-bold text-white"
                          >
                            {copiadoTokenId === nv.id ? <Check size={11} /> : <Copy size={11} />}
                            {copiadoTokenId === nv.id ? 'Copiado!' : 'Copiar URL'}
                          </button>
                        </div>
                        <div className="text-[11px] font-mono text-slate-200 truncate">{nv.webhook_caminho}</div>
                        <div className="text-[10px] text-slate-400">
                          Configurado automaticamente via ISAPI, ou no NVR: <strong>Sistema → Eventos → Destinatário HTTP</strong> (Host{' '}
                          <code className="text-slate-200">cond.vps.seg.br</code> • HTTPS <code className="text-slate-200">443</code>).
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {podeGerenciar && (
                          <>
                            <button
                              type="button"
                              disabled={processando}
                              onClick={() => configurarSincronizarNvr(nv, true)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold disabled:opacity-50"
                            >
                              <RefreshCw size={13} className={processando ? 'animate-spin' : ''} />
                              {nv.ia_facial_nativa ? 'Sincronizar Galeria + Push' : 'Ativar IA do NVR + Sincronizar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => abrirNovaCamera(nv)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600/90 hover:bg-blue-500 text-white text-xs font-bold"
                            >
                              <Plus size={13} />
                              Vincular Câmera deste NVR
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          disabled={processando}
                          onClick={() => coletarEventosNvrAgora(nv)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold disabled:opacity-50"
                          title="Busca via ISAPI/ISUP (FCSearch/FDSearch) os eventos faciais recentes gravados no NVR"
                        >
                          <Download size={13} />
                          Puxar Eventos Agora
                        </button>
                        {podeGerenciar && nv.ia_facial_nativa && (
                          <button
                            type="button"
                            disabled={processando}
                            onClick={() => configurarSincronizarNvr(nv, false)}
                            className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-slate-300 hover:text-red-200 text-[11px] font-semibold ml-auto"
                          >
                            Desativar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Seção 2: Grade de Câmeras Cadastradas (Direto NVR Hikvision + Motor IA 512D) ── */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-slate-800">
                Câmeras Monitoradas — Visualização Leve H.264 (<code className="font-mono">go2rtc</code>)
              </h2>
              <p className="text-xs text-slate-500">
                Câmeras <strong>🛡️ Direto NVR Hikvision</strong> abrem apenas o Substream leve para visualização (0% uso de GPU).
                Câmeras comuns operam em Dual-Stream (<code className="font-mono">cam_id_ia</code> 4MP +{' '}
                <code className="font-mono">cam_id_live</code> H.264).
              </p>
            </div>
            {podeGerenciar && (
              <button
                type="button"
                onClick={() => abrirNovaCamera()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-sm shrink-0"
              >
                <Plus size={16} />
                Adicionar Câmera
              </button>
            )}
          </div>

          {carregandoCameras ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-sm text-slate-500">
              Carregando câmeras...
            </div>
          ) : cameras.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <Camera size={44} className="mx-auto text-slate-300 mb-3" />
              <h3 className="text-base font-bold text-slate-700">Nenhuma câmera cadastrada neste condomínio ainda</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Clique em &ldquo;Vincular Câmera deste NVR&rdquo; (para câmeras faciais ligadas no NVR Hikvision sem usar nossa IA) ou &ldquo;Adicionar Câmera&rdquo; para câmeras IP comuns.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {cameras.map((c) => {
                const verLive = camerasAoVivo[c.id] ?? true;
                const ehNvrNativo = c.modo_captura === 'hikvision_nvr_nativo';
                return (
                  <div
                    key={c.id}
                    className={`bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col ${
                      ehNvrNativo ? 'border-teal-300 ring-1 ring-teal-100' : 'border-slate-200'
                    }`}
                  >
                    <div className="aspect-video bg-slate-950 relative">
                      {verLive ? (
                        <LiveVisionPlayer
                          cameraId={c.id}
                          streamLive={c.stream_live}
                          nome={c.nome}
                          ativo={c.ativo}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                          <Play size={28} className="mb-1" />
                          <span className="text-xs font-bold">Visualização ao vivo pausada nesta aba</span>
                        </div>
                      )}
                    </div>

                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-extrabold text-slate-900 truncate">{c.nome}</h3>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase shrink-0 ${
                              !c.ativo
                                ? 'bg-slate-100 text-slate-600'
                                : ehNvrNativo
                                  ? 'bg-teal-100 text-teal-800 border border-teal-200'
                                  : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {!c.ativo ? 'Inativa' : ehNvrNativo ? '🛡️ Direto NVR Hikvision' : c.modo_captura}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {ehNvrNativo ? (
                            <>
                              <strong>{c.nvr_nome || 'NVR Hikvision'}</strong> • Canal <strong>{c.canal_nvr || 1}</strong> •{' '}
                              <code className="font-mono">{c.host}</code>
                            </>
                          ) : (
                            <>
                              {c.fabricante.toUpperCase()} • <code className="font-mono">{c.host}:{c.porta_rtsp}</code> • Nitidez mín.{' '}
                              {c.limiar_nitidez}
                            </>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {ehNvrNativo ? (
                            <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 font-bold text-[10px] border border-teal-200">
                              IA no NVR • 0% GPU Sectrum
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px]">
                              IA: {c.stream_ia}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono text-[10px]">
                            LIVE: {c.stream_live}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setCamerasAoVivo((ant) => ({ ...ant, [c.id]: !verLive }))}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700"
                          >
                            {verLive ? 'Ocultar Live' : 'Ver Ao Vivo'}
                          </button>
                          <button
                            type="button"
                            disabled={testandoCamId === c.id}
                            onClick={() => testarCamera(c)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-white text-xs font-bold disabled:opacity-60 ${
                              ehNvrNativo ? 'bg-teal-600 hover:bg-teal-700' : 'bg-indigo-600 hover:bg-indigo-700'
                            }`}
                          >
                            <Zap size={12} />
                            {testandoCamId === c.id
                              ? 'Testando...'
                              : ehNvrNativo
                                ? 'Testar Vídeo NVR'
                                : 'Testar & IA'}
                          </button>
                        </div>

                        {podeGerenciar && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => abrirEditarCamera(c)}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
                              title="Editar câmera"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => excluirCamera(c)}
                              className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600"
                              title="Remover câmera"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAIS DE APOIO
         ═══════════════════════════════════════════════════════════════════════ */}

      {/* 1. Modal Visualizar Cena Completa + Retrato */}
      <Modal
        aberto={Boolean(modalCena)}
        aoFechar={() => setModalCena(null)}
        titulo={modalCena?.titulo || 'Inspeção Visual'}
        largura="max-w-4xl"
      >
        {modalCena && (
          <div className="space-y-4">
            {modalCena.resumo && <div className="text-xs font-semibold text-slate-500">{modalCena.resumo}</div>}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
              {modalCena.rostoUrl && (
                <div className="md:col-span-4 bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                  <div className="text-xs font-bold text-slate-600 mb-2">Recorte Facial 3:4</div>
                  <VisionImg
                    path={modalCena.rostoUrl}
                    alt="Rosto"
                    className="w-44 h-56 object-cover rounded-xl mx-auto border border-slate-300 shadow-sm"
                  />
                </div>
              )}
              <div className={modalCena.rostoUrl ? 'md:col-span-8' : 'md:col-span-12'}>
                <div className="text-xs font-bold text-slate-600 mb-2">Quadro Completo da Câmera</div>
                {modalCena.cenaUrl ? (
                  <VisionImg
                    path={modalCena.cenaUrl}
                    alt="Cena Completa"
                    className="w-full max-h-[460px] object-contain rounded-xl bg-slate-950 border border-slate-300"
                  />
                ) : (
                  <div className="p-8 rounded-xl bg-slate-100 text-center text-xs text-slate-500">
                    Quadro panorâmico não disponível para este registro.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* 2. Modal Fixar Evidência / Nota Investigativa */}
      <Modal
        aberto={Boolean(modalEvidencia)}
        aoFechar={() => setModalEvidencia(null)}
        titulo={`Evidência Forense — Passagem #${modalEvidencia?.id ?? ''}`}
      >
        {modalEvidencia && (
          <div className="space-y-4">
            <label className="flex items-center gap-2.5 cursor-pointer bg-amber-50 border border-amber-200 p-3 rounded-xl">
              <input
                type="checkbox"
                checked={modalEvidencia.fixado}
                onChange={(e) => setModalEvidencia({ ...modalEvidencia, fixado: e.target.checked })}
                className="w-4 h-4 accent-amber-600"
              />
              <span className="text-sm font-bold text-amber-900">
                Proteger passagem como Evidência Fixada (não será apagada pela retenção automática)
              </span>
            </label>
            <div>
              <label className={lbl}>Nota de Investigação / Ocorrência</label>
              <textarea
                rows={3}
                maxLength={250}
                value={modalEvidencia.nota}
                onChange={(e) => setModalEvidencia({ ...modalEvidencia, nota: e.target.value })}
                placeholder="Ex.: Suspeito rondando portão lateral às 23h15..."
                className={inp}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalEvidencia(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvarEvidenciaPassagem}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold"
              >
                Salvar Evidência
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* 3. Modal Cadastrar / Editar Pessoa na Galeria 512D */}
      <Modal
        aberto={modalGaleria}
        aoFechar={() => setModalGaleria(false)}
        titulo={formGaleria.id > 0 ? 'Editar Pessoa na Galeria 512D' : 'Cadastrar Pessoa na Galeria Biométrica 512D'}
        largura="max-w-2xl"
      >
        <form onSubmit={salvarPessoaGaleria} className="space-y-4">
          {formGaleria.id === 0 && formGaleria.passagem_origem_id === 0 && (
            <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl">
              {[
                { id: 'upload', txt: '📷 Enviar Foto' },
                { id: 'morador', txt: '🏠 Importar Morador' },
                { id: 'blacklist', txt: '🚨 Importar Suspeito Hikvision' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setAbaOrigemGaleria(t.id as 'upload' | 'morador' | 'blacklist')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${
                    abaOrigemGaleria === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  {t.txt}
                </button>
              ))}
            </div>
          )}

          {/* Origem: Passagem Capturada */}
          {formGaleria.passagem_origem_id > 0 && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 p-3 rounded-xl">
              <VisionImg
                path={formGaleria.passagem_foto_url}
                alt="Passagem"
                className="w-16 h-20 object-cover rounded-lg border border-blue-300"
              />
              <div className="text-xs text-blue-900">
                <strong>Promovendo Passagem #{formGaleria.passagem_origem_id}</strong>
                <p className="text-blue-700 mt-0.5">
                  O vetor 512D já extraído desta captura será vinculado imediatamente à Galeria em RAM.
                </p>
              </div>
            </div>
          )}

          {/* Origem: Importar Morador */}
          {formGaleria.id === 0 && formGaleria.passagem_origem_id === 0 && abaOrigemGaleria === 'morador' && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
              <input
                type="text"
                placeholder="Digite o nome ou CPF do morador..."
                value={buscaMoradorTxt}
                onChange={(e) => setBuscaMoradorTxt(e.target.value)}
                className={inp}
              />
              <div className="max-h-40 overflow-y-auto divide-y divide-slate-200/70">
                {moradoresEncontrados.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() =>
                      setFormGaleria((p) => ({
                        ...p,
                        usuario_origem_id: m.id,
                        restricao_origem_id: 0,
                        foto_base64: '',
                        nome: m.nome,
                        pessoa_externa_id: `USR-${m.id}`,
                      }))
                    }
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-blue-50 rounded-lg ${
                      formGaleria.usuario_origem_id === m.id ? 'bg-blue-100 font-bold text-blue-900' : ''
                    }`}
                  >
                    <span>
                      {m.nome} {m.unidade_label ? `• ${m.unidade_label}` : ''}
                    </span>
                    <span className="text-[11px] text-emerald-700 font-semibold">Selecionar</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Origem: Importar da Blacklist Hikvision */}
          {formGaleria.id === 0 && formGaleria.passagem_origem_id === 0 && abaOrigemGaleria === 'blacklist' && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 max-h-44 overflow-y-auto">
              {restritosHik.length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-3">
                  Nenhum registro ativo em Suspeitos / Blacklist Hikvision neste condomínio.
                </div>
              ) : (
                restritosHik.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() =>
                      setFormGaleria((p) => ({
                        ...p,
                        restricao_origem_id: r.id,
                        usuario_origem_id: 0,
                        foto_base64: '',
                        nome: r.nome,
                        categoria: 'restrito',
                        nivel_alerta: 'critico',
                        observacao: r.motivo || p.observacao,
                        pessoa_externa_id: `BL-${r.id}`,
                      }))
                    }
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-rose-50 rounded-lg ${
                      formGaleria.restricao_origem_id === r.id ? 'bg-rose-100 font-bold text-rose-900' : ''
                    }`}
                  >
                    <span>
                      {r.nome} {r.motivo ? `— ${r.motivo}` : ''}
                    </span>
                    <span className="text-[11px] text-rose-700 font-bold">Importar</span>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Origem: Upload de Foto com Validação 512D ao vivo */}
          {(formGaleria.id > 0 || (formGaleria.passagem_origem_id === 0 && abaOrigemGaleria === 'upload')) && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row items-center gap-4">
              <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer shrink-0">
                <Upload size={14} />
                {formGaleria.id > 0 ? 'Trocar Foto (Opcional)' : 'Selecionar Foto Frontal'}
                <input type="file" accept="image/*" className="hidden" onChange={validarFotoGaleriaUpload} />
              </label>

              {validandoFotoGal && (
                <div className="text-xs font-semibold text-blue-600">
                  Validando pose 3D, nitidez Laplaciana e vetor 512D...
                </div>
              )}

              {previaValidacao && !previaValidacao.erro && (
                <div className="flex items-center gap-3">
                  {previaValidacao.retrato_3x4_base64 && (
                    <img
                      src={previaValidacao.retrato_3x4_base64}
                      alt="Prévia 3:4"
                      className="w-14 h-18 object-cover rounded-lg border-2 border-emerald-400"
                    />
                  )}
                  <div className="text-xs">
                    <div className="font-extrabold text-emerald-700">✓ Foto Aprovada pelo Motor 512D</div>
                    <div className="text-slate-600">
                      Provedor: <strong>{previaValidacao.provedor}</strong> • Nitidez:{' '}
                      <strong>{Math.round(previaValidacao.nitidez_lap || 0)}</strong>
                    </div>
                  </div>
                </div>
              )}

              {previaValidacao?.erro && (
                <div className="text-xs font-bold text-red-600">⚠️ {previaValidacao.erro}</div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className={lbl}>Nome Completo *</label>
              <input
                type="text"
                required
                value={formGaleria.nome}
                onChange={(e) => setFormGaleria({ ...formGaleria, nome: e.target.value })}
                placeholder="Nome completo da pessoa"
                className={inp}
              />
            </div>

            <div>
              <label className={lbl}>Categoria</label>
              <select
                value={formGaleria.categoria}
                onChange={(e) =>
                  setFormGaleria({
                    ...formGaleria,
                    categoria: e.target.value as 'restrito' | 'monitorado' | 'vip' | 'funcionario',
                  })
                }
                className={inp}
              >
                <option value="restrito">🚨 Suspeito / Restrito</option>
                <option value="monitorado">⚠️ Monitorado</option>
                <option value="vip">⭐ VIP / Morador</option>
                <option value="funcionario">👷 Funcionário / Prestador</option>
              </select>
            </div>

            <div>
              <label className={lbl}>Nível de Alerta</label>
              <select
                value={formGaleria.nivel_alerta}
                onChange={(e) =>
                  setFormGaleria({
                    ...formGaleria,
                    nivel_alerta: e.target.value as 'critico' | 'atencao' | 'informativo',
                  })
                }
                className={inp}
              >
                <option value="critico">Crítico (Push + Alerta Vermelho)</option>
                <option value="atencao">Atenção (Alerta Âmbar)</option>
                <option value="informativo">Informativo</option>
              </select>
            </div>

            <div>
              <label className={lbl}>Código / Documento (Opcional)</label>
              <input
                type="text"
                value={formGaleria.pessoa_externa_id}
                onChange={(e) => setFormGaleria({ ...formGaleria, pessoa_externa_id: e.target.value })}
                placeholder="CPF, RG ou ID externo"
                className={inp}
              />
            </div>

            {status?.eh_superadmin && (
              <div>
                <label className={lbl}>Escopo de Monitoramento</label>
                <select
                  value={formGaleria.escopo}
                  onChange={(e) =>
                    setFormGaleria({ ...formGaleria, escopo: e.target.value as 'restrito_locais' | 'global' })
                  }
                  className={inp}
                >
                  <option value="restrito_locais">Apenas este Condomínio</option>
                  <option value="global">Global (Todos os Condomínios)</option>
                </select>
              </div>
            )}

            <div className="sm:col-span-2">
              <label className={lbl}>Observação / Motivo do Monitoramento</label>
              <textarea
                rows={2}
                value={formGaleria.observacao}
                onChange={(e) => setFormGaleria({ ...formGaleria, observacao: e.target.value })}
                placeholder="Ex.: Tentativa de invasão anterior, medida protetiva, autorização especial..."
                className={inp}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalGaleria(false)}
              className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvandoGaleria}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-60"
            >
              {salvandoGaleria ? 'Gerando Vetor 512D...' : 'Salvar na Galeria 512D'}
            </button>
          </div>
        </form>
      </Modal>

      {/* 4. Modal Adicionar / Editar Câmera (Direto NVR Hikvision ou Motor IA 512D) */}
      <Modal
        aberto={modalCamera}
        aoFechar={() => setModalCamera(false)}
        titulo={formCam.id > 0 ? 'Editar Câmera Facial / CFTV' : 'Cadastrar Câmera Facial (Direto NVR Hikvision ou IA 512D)'}
        largura="max-w-2xl"
      >
        <form onSubmit={salvarCamera} className="space-y-4">
          {/* Seletor Prático: Onde processar a comparação facial? */}
          <div>
            <label className={lbl}>Onde a captura e a comparação facial devem rodar?</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-1">
              <button
                type="button"
                onClick={() => {
                  const nvrDefault = nvrsCondominio.find((n) => n.ia_facial_nativa) || nvrsCondominio[0];
                  setFormCam((p) => ({
                    ...p,
                    modo_captura: 'hikvision_nvr_nativo',
                    fabricante: 'hikvision',
                    nvr_id: p.nvr_id > 0 ? p.nvr_id : nvrDefault?.id ?? 0,
                    host: p.host || nvrDefault?.ip || '',
                  }));
                }}
                className={`text-left p-3 rounded-xl border-2 transition ${
                  formCam.modo_captura === 'hikvision_nvr_nativo'
                    ? 'border-teal-600 bg-teal-50/70 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-teal-900">🛡️ Direto no NVR Hikvision</span>
                  <span className="px-1.5 py-0.5 rounded bg-teal-600 text-white text-[10px] font-bold">0% GPU</span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1">
                  Para câmera Hikvision com captura facial ligada no NVR Hikvision. Usa o motor do próprio NVR sem consumir nosso servidor!
                </p>
              </button>

              <button
                type="button"
                onClick={() =>
                  setFormCam((p) => ({
                    ...p,
                    modo_captura: p.modo_captura === 'hikvision_nvr_nativo' ? 'onvif_burst' : p.modo_captura,
                    nvr_id: 0,
                  }))
                }
                className={`text-left p-3 rounded-xl border-2 transition ${
                  formCam.modo_captura !== 'hikvision_nvr_nativo'
                    ? 'border-blue-600 bg-blue-50/70 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-blue-900">🧠 Processar na Nossa IA</span>
                  <span className="px-1.5 py-0.5 rounded bg-blue-600 text-white text-[10px] font-bold">GPU 512D</span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1">
                  Para câmeras IP comuns (Uniview, Intelbras, ONVIF) sem NVR facial. Nosso servidor processa os frames 4MP na GPU.
                </p>
              </button>
            </div>
          </div>

          {formCam.id === 0 && cftvImportaveis.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
              <div className="text-xs font-extrabold text-blue-900">
                ⚡ Importar em 1 Clique do CFTV deste Condomínio (preenche IP/ISUP, canal e senha automaticamente):
              </div>
              <div className="flex flex-wrap gap-1.5">
                {cftvImportaveis.map((cf) => (
                  <button
                    key={cf.cftv_id}
                    type="button"
                    onClick={() => aplicarImportacaoCftv(cf)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition ${
                      formCam.importar_cftv_id === cf.cftv_id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-blue-800 border-blue-200 hover:bg-blue-100'
                    }`}
                  >
                    📹 {cf.nome} ({cf.host}{cf.canal ? ` • Canal ${cf.canal}` : ''})
                  </button>
                ))}
              </div>
            </div>
          )}

          {formCam.modo_captura === 'hikvision_nvr_nativo' ? (
            /* ── Formulário Simplificado: Direto no NVR Hikvision ── */
            <div className="space-y-3 bg-teal-50/40 border border-teal-200 rounded-xl p-4">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-8">
                  <label className={lbl}>NVR Hikvision do Condomínio *</label>
                  <select
                    value={formCam.nvr_id}
                    onChange={(e) => {
                      const nid = Number(e.target.value);
                      const nvSel = nvrsCondominio.find((x) => x.id === nid);
                      setFormCam((p) => ({
                        ...p,
                        nvr_id: nid,
                        host: nvSel ? nvSel.ip : p.host,
                        porta_http: nvSel ? String(nvSel.porta_http) : p.porta_http,
                        porta_rtsp: nvSel ? String(nvSel.porta_rtsp) : p.porta_rtsp,
                        usuario: nvSel ? nvSel.usuario : p.usuario,
                      }));
                    }}
                    className={inp}
                  >
                    {nvrsCondominio.map((nv) => (
                      <option key={nv.id} value={nv.id}>
                        {nv.nome} ({nv.modo_conexao === 'isup' ? `ISUP: ${nv.ip}` : nv.ip})
                      </option>
                    ))}
                    <option value={0}>➕ Informar IP / ISUP de um novo NVR manualmente...</option>
                  </select>
                </div>

                <div className="sm:col-span-4">
                  <label className={lbl}>Canal da Câmera no NVR *</label>
                  <input
                    type="number"
                    min={1}
                    max={64}
                    required
                    value={formCam.canal_nvr}
                    onChange={(e) => setFormCam({ ...formCam, canal_nvr: e.target.value })}
                    placeholder="Ex.: 1"
                    className={inp}
                  />
                </div>

                <div className="sm:col-span-12">
                  <label className={lbl}>Nome de Identificação da Câmera *</label>
                  <input
                    type="text"
                    required
                    value={formCam.nome}
                    onChange={(e) => setFormCam({ ...formCam, nome: e.target.value })}
                    placeholder="Ex.: Entrada Pedestre - Câmera Facial Hikvision"
                    className={inp}
                  />
                </div>
              </div>

              {formCam.nvr_id === 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-teal-200/70">
                  <div>
                    <label className={lbl}>IP/Tailscale ou isup://DEVICE_ID do NVR *</label>
                    <input
                      type="text"
                      required
                      value={formCam.host}
                      onChange={(e) => setFormCam({ ...formCam, host: e.target.value })}
                      placeholder="Ex.: 10.2.1.200 ou isup://nvrportaria"
                      className={inp}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={lbl}>Porta HTTP</label>
                      <input
                        type="number"
                        value={formCam.porta_http}
                        onChange={(e) => setFormCam({ ...formCam, porta_http: e.target.value })}
                        className={inp}
                      />
                    </div>
                    <div>
                      <label className={lbl}>Porta RTSP</label>
                      <input
                        type="number"
                        value={formCam.porta_rtsp}
                        onChange={(e) => setFormCam({ ...formCam, porta_rtsp: e.target.value })}
                        className={inp}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={lbl}>Usuário do NVR</label>
                    <input
                      type="text"
                      value={formCam.usuario}
                      onChange={(e) => setFormCam({ ...formCam, usuario: e.target.value })}
                      className={inp}
                    />
                  </div>
                  <div>
                    <label className={lbl}>Senha do NVR {formCam.id > 0 ? '(em branco = manter)' : '*'}</label>
                    <input
                      type="password"
                      value={formCam.senha}
                      onChange={(e) => setFormCam({ ...formCam, senha: e.target.value })}
                      placeholder="••••••••"
                      className={inp}
                    />
                  </div>
                </div>
              )}

              <div className="text-[11px] text-teal-900 bg-white/80 rounded-lg px-3 py-2 border border-teal-200">
                ✓ Ao salvar, esta câmera <strong>não abrirá stream 4MP no motor Python</strong> (zero uso de GPU/CPU). O Sectrum sincronizará automaticamente a Galeria Facial com o NVR e receberá passagens + alertas direto do NVR!
              </div>
            </div>
          ) : (
            /* ── Formulário Completo: Processar na Nossa IA (GPU 512D) ── */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Nome da Câmera *</label>
                <input
                  type="text"
                  required
                  value={formCam.nome}
                  onChange={(e) => setFormCam({ ...formCam, nome: e.target.value })}
                  placeholder="Ex.: Portaria Pedestre Entrada"
                  className={inp}
                />
              </div>

              <div>
                <label className={lbl}>Fabricante / Protocolo</label>
                <select
                  value={formCam.fabricante}
                  onChange={(e) => {
                    const fab = e.target.value as 'uniview' | 'hikvision' | 'intelbras' | 'onvif';
                    setFormCam((p) => ({
                      ...p,
                      fabricante: fab,
                      rtsp_main_path:
                        fab === 'hikvision'
                          ? '/Streaming/Channels/101'
                          : fab === 'intelbras'
                            ? '/cam/realmonitor?channel=1&subtype=0'
                            : '/media/video1',
                      rtsp_sub_path:
                        fab === 'hikvision'
                          ? '/Streaming/Channels/102'
                          : fab === 'intelbras'
                            ? '/cam/realmonitor?channel=1&subtype=1'
                            : '/media/video2',
                    }));
                  }}
                  className={inp}
                >
                  <option value="uniview">Uniview (Calibração LAPI H.264 Automática)</option>
                  <option value="hikvision">Hikvision (Sem NVR Facial — Usar Nossa GPU)</option>
                  <option value="intelbras">Intelbras</option>
                  <option value="onvif">ONVIF Genérico</option>
                </select>
              </div>

              <div>
                <label className={lbl}>IP / Host (LAN ou Tailscale) *</label>
                <input
                  type="text"
                  required
                  value={formCam.host}
                  onChange={(e) => setFormCam({ ...formCam, host: e.target.value })}
                  placeholder="Ex.: 10.2.1.50"
                  className={inp}
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={lbl}>RTSP</label>
                  <input
                    type="number"
                    value={formCam.porta_rtsp}
                    onChange={(e) => setFormCam({ ...formCam, porta_rtsp: e.target.value })}
                    className={inp}
                  />
                </div>
                <div>
                  <label className={lbl}>HTTP</label>
                  <input
                    type="number"
                    value={formCam.porta_http}
                    onChange={(e) => setFormCam({ ...formCam, porta_http: e.target.value })}
                    className={inp}
                  />
                </div>
                <div>
                  <label className={lbl}>ONVIF</label>
                  <input
                    type="number"
                    value={formCam.porta_onvif}
                    onChange={(e) => setFormCam({ ...formCam, porta_onvif: e.target.value })}
                    className={inp}
                  />
                </div>
              </div>

              <div>
                <label className={lbl}>Usuário RTSP/ONVIF</label>
                <input
                  type="text"
                  value={formCam.usuario}
                  onChange={(e) => setFormCam({ ...formCam, usuario: e.target.value })}
                  className={inp}
                />
              </div>

              <div>
                <label className={lbl}>
                  Senha {formCam.id > 0 || formCam.importar_cftv_id > 0 ? '(em branco = manter atual)' : '*'}
                </label>
                <input
                  type="password"
                  value={formCam.senha}
                  onChange={(e) => setFormCam({ ...formCam, senha: e.target.value })}
                  placeholder="••••••••"
                  className={inp}
                />
              </div>

              <div>
                <label className={lbl}>Caminho Main Stream 4MP (IA)</label>
                <input
                  type="text"
                  value={formCam.rtsp_main_path}
                  onChange={(e) => setFormCam({ ...formCam, rtsp_main_path: e.target.value })}
                  className={inp}
                />
              </div>

              <div>
                <label className={lbl}>Caminho Substream Leve H.264 (Live)</label>
                <input
                  type="text"
                  value={formCam.rtsp_sub_path}
                  onChange={(e) => setFormCam({ ...formCam, rtsp_sub_path: e.target.value })}
                  className={inp}
                />
              </div>

              <div>
                <label className={lbl}>Modo de Captura IA</label>
                <select
                  value={formCam.modo_captura}
                  onChange={(e) =>
                    setFormCam({ ...formCam, modo_captura: e.target.value as 'onvif_burst' | 'rtsp_poll' })
                  }
                  className={inp}
                >
                  <option value="onvif_burst">Rajada Inteligente ONVIF (Recomendado)</option>
                  <option value="rtsp_poll">Polling Contínuo RTSP</option>
                </select>
              </div>

              <div>
                <label className={lbl}>Limiar Nitidez Laplaciana (112x112)</label>
                <input
                  type="number"
                  min={15}
                  max={220}
                  value={formCam.limiar_nitidez}
                  onChange={(e) => setFormCam({ ...formCam, limiar_nitidez: e.target.value })}
                  className={inp}
                />
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formCam.ativo}
              onChange={(e) => setFormCam({ ...formCam, ativo: e.target.checked })}
              className="w-4 h-4 accent-blue-600"
            />
            <span className="text-sm font-bold text-slate-700">
              {formCam.modo_captura === 'hikvision_nvr_nativo'
                ? 'Câmera ativa para eventos nativos do NVR Hikvision + streaming ao vivo leve'
                : 'Câmera ativa para captura facial 512D e streaming ao vivo'}
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalCamera(false)}
              className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvandoCamera}
              className={`px-5 py-2 rounded-xl text-white text-sm font-bold disabled:opacity-60 ${
                formCam.modo_captura === 'hikvision_nvr_nativo'
                  ? 'bg-teal-600 hover:bg-teal-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {salvandoCamera
                ? 'Salvando...'
                : formCam.modo_captura === 'hikvision_nvr_nativo'
                  ? 'Vincular Direto ao NVR Hikvision'
                  : 'Salvar Câmera IA'}
            </button>
          </div>
        </form>
      </Modal>

      {/* 5. Modal Resultado do Teste de Câmera & IA */}
      <Modal
        aberto={Boolean(resultadoTesteCam)}
        aoFechar={() => setResultadoTesteCam(null)}
        titulo={`Diagnóstico de Vídeo — ${resultadoTesteCam?.cameraNome ?? ''}`}
        largura="max-w-3xl"
      >
        {resultadoTesteCam && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                ✓ Frame capturado em {resultadoTesteCam.latenciaMs} ms
              </span>
              {resultadoTesteCam.calibradoH264 && (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                  ✓ Codec H.264 Calibrado (LAPI)
                </span>
              )}
              {Boolean(resultadoTesteCam.analise.modo_nvr_nativo) ? (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-teal-100 text-teal-800 border border-teal-200">
                  🛡️ Comparação Facial Operando 100% no NVR Hikvision (0% Uso da Nossa GPU)
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
                  Rostos analisados: {Number(resultadoTesteCam.analise.pessoas_analisadas ?? 0)} (
                  {Number(resultadoTesteCam.analise.latencia_total_ms ?? 0)} ms na IA)
                </span>
              )}
            </div>

            <img
              src={resultadoTesteCam.snapshot}
              alt="Snapshot teste"
              className="w-full max-h-96 object-contain rounded-xl bg-slate-950 border border-slate-200"
            />
          </div>
        )}
      </Modal>

      {/* 5B. Modal Cadastrar NVR Facial Hikvision */}
      <Modal
        aberto={modalNovoNvr}
        aoFechar={() => setModalNovoNvr(false)}
        titulo="Cadastrar NVR Facial Hikvision (AcuSense / DeepinMind)"
        borda="border-teal-600"
      >
        <form onSubmit={salvarNovoNvr} className="space-y-4">
          <div>
            <label className={lbl}>Nome do NVR *</label>
            <input
              type="text"
              required
              value={formNovoNvr.nome}
              onChange={(e) => setFormNovoNvr({ ...formNovoNvr, nome: e.target.value })}
              placeholder="Ex.: NVR Hikvision Portaria Principal"
              className={inp}
            />
          </div>

          <div>
            <label className={lbl}>Modo de Conexão com o NVR</label>
            <select
              value={formNovoNvr.modo_conexao}
              onChange={(e) => {
                const m = e.target.value as 'ip' | 'isup';
                setFormNovoNvr((p) => ({
                  ...p,
                  modo_conexao: m,
                  porta_rtsp: m === 'isup' ? '7660' : '554',
                }));
              }}
              className={inp}
            >
              <option value="ip">IP Local / VPN / Tailscale (ISAPI + Webhook Push)</option>
              <option value="isup">ISUP 5.0 / EHome (Ideal para CGNAT sem abrir portas)</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-8">
              <label className={lbl}>
                {formNovoNvr.modo_conexao === 'isup' ? 'Device ID ISUP do NVR *' : 'IP ou Host Tailscale do NVR *'}
              </label>
              <input
                type="text"
                required
                value={formNovoNvr.ip}
                onChange={(e) => setFormNovoNvr({ ...formNovoNvr, ip: e.target.value })}
                placeholder={formNovoNvr.modo_conexao === 'isup' ? 'Ex.: nvrportaria01' : 'Ex.: 100.88.10.25'}
                className={inp}
              />
            </div>
            <div className="sm:col-span-4">
              <label className={lbl}>Porta HTTP</label>
              <input
                type="number"
                value={formNovoNvr.porta_http}
                onChange={(e) => setFormNovoNvr({ ...formNovoNvr, porta_http: e.target.value })}
                className={inp}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Usuário</label>
              <input
                type="text"
                value={formNovoNvr.usuario}
                onChange={(e) => setFormNovoNvr({ ...formNovoNvr, usuario: e.target.value })}
                className={inp}
              />
            </div>
            <div>
              <label className={lbl}>{formNovoNvr.modo_conexao === 'isup' ? 'Chave ISUP / Senha *' : 'Senha ISAPI *'}</label>
              <input
                type="password"
                required
                value={formNovoNvr.senha}
                onChange={(e) => setFormNovoNvr({ ...formNovoNvr, senha: e.target.value })}
                placeholder="••••••••"
                className={inp}
              />
            </div>
          </div>

          <div className="text-xs text-teal-900 bg-teal-50 border border-teal-200 rounded-xl p-3">
            Ao salvar, o Sectrum configura automaticamente o <strong>Destinatário HTTP (Push)</strong> e cria/sincroniza a
            biblioteca facial <strong>&ldquo;Sectrum Monitorados&rdquo;</strong> dentro do NVR!
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setModalNovoNvr(false)}
              className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvandoNvr}
              className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold disabled:opacity-60"
            >
              {salvandoNvr ? 'Conectando ao NVR...' : 'Salvar & Sincronizar NVR'}
            </button>
          </div>
        </form>
      </Modal>

      {/* 6. Modal Analisar Foto Avulsa (Teste Interativo 512D + 26 Atributos) */}
      <Modal
        aberto={modalAnaliseManual}
        aoFechar={() => setModalAnaliseManual(false)}
        titulo="Analisar Foto Avulsa — Extração 512D + Roupas + 26 Características"
        largura="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer">
              <Upload size={14} />
              Escolher Foto / Captura
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setFotoManualB64(await lerArquivoBase64(f));
                  setResAnaliseManual(null);
                }}
              />
            </label>

            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={indexarManual}
                onChange={(e) => setIndexarManual(e.target.checked)}
                className="w-4 h-4 accent-blue-600"
              />
              Indexar também no Histórico de Passagens
            </label>

            <button
              type="button"
              disabled={!fotoManualB64 || analisandoManual}
              onClick={rodarAnaliseManual}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold disabled:opacity-50"
            >
              {analisandoManual ? 'Processando GPU...' : 'Executar Motor 512D'}
            </button>
          </div>

          {fotoManualB64 && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
              <div className="md:col-span-5">
                <img
                  src={fotoManualB64}
                  alt="Entrada"
                  className="w-full max-h-72 object-contain rounded-xl bg-slate-950 border border-slate-200"
                />
              </div>
              <div className="md:col-span-7 space-y-2.5">
                {resAnaliseManual ? (
                  <>
                    <div className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl">
                      ✓ {Number(resAnaliseManual.pessoas_analisadas ?? 0)} pessoa(s) analisada(s) em{' '}
                      {Number(resAnaliseManual.latencia_total_ms ?? 0)} ms
                    </div>
                    {Array.isArray(resAnaliseManual.resultados) &&
                      (resAnaliseManual.resultados as Array<Record<string, unknown>>).map((it, idx) => {
                        const match = it.match_galeria as Record<string, unknown> | null;
                        return (
                          <div
                            key={idx}
                            className="flex gap-3 p-3 rounded-xl border border-slate-200 bg-white shadow-sm"
                          >
                            {typeof it.retrato_3x4_base64 === 'string' && (
                              <img
                                src={it.retrato_3x4_base64}
                                alt="3:4"
                                className="w-16 h-20 object-cover rounded-lg border border-slate-200"
                              />
                            )}
                            <div className="text-xs space-y-1">
                              <div className="font-extrabold text-slate-900">
                                {match
                                  ? `🚨 Match Galeria: ${String(match.nome)} (${Math.round(Number(match.similaridade || 0) * 100)}%)`
                                  : 'Visitante Analisado'}
                              </div>
                              <div className="text-slate-600">
                                Provedor: <strong>{String(it.provedor_vetor || '')}</strong> • Nitidez Lap.:{' '}
                                <strong>{Math.round(Number(it.nitidez_lap || 0))}</strong>
                              </div>
                              {Boolean(it.resumo_vestuario) && (
                                <div className="font-semibold text-blue-800">
                                  👕 {String(it.resumo_vestuario)}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </>
                ) : (
                  <div className="text-xs text-slate-500 p-4 bg-slate-50 rounded-xl border border-slate-200">
                    Clique em <strong>&ldquo;Executar Motor 512D&rdquo;</strong> para extrair o rosto alinhado, comparar com a Galeria e listar roupa e acessórios.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
