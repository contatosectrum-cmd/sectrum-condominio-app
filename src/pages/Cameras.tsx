import React, { useCallback, useEffect, useRef, useState } from 'react';
import { obterUrlWsGo2rtc } from '../lib/nativo';
import {
  AlertCircle,
  Edit2,
  Trash2,
  VideoOff,
  Camera,
  Plus,
  Trash,
  X,
  LayoutGrid,
  Maximize,
  Power,
  Wifi,
  Server,
  ListChecks,
  CheckSquare,
  Square,
  RefreshCw,
  Smartphone,
  Globe,
  Link2,
} from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import { Modal } from './moradores/AcoesMorador';

interface CameraItem {
  id: number;
  nome: string;
  localizacao: string | null;
  status: string;
  modo_conexao?: 'rtsp' | 'isup';
  host: string | null;
  isup_device_id?: string | null;
  online_isup?: boolean | null;
  porta_rtsp: number | null;
  usuario: string | null;
  canal: number | null;
  tem_senha: boolean;
  visivel_morador?: boolean;
  controlador_id?: number | null;
  controlador_nome?: string | null;
  porta_numero?: number;
  bloco_id?: number | null;
  bloco_nome?: string | null;
}

interface NvrItem {
  id: number;
  nome: string;
  ip: string;
  porta_http: number;
  porta_rtsp: number;
  usuario: string;
  max_canais: number;
  localizacao: string;
  modo_conexao?: 'ip' | 'isup';
  online_isup?: boolean | null;
  tem_senha: boolean;
  canais_ativos: number;
}

interface ControladorItem {
  id: number;
  nome: string;
  bloco_id: number | null;
  bloco_nome: string | null;
  porta_1_ativa: boolean;
  porta_1_nome: string;
  porta_2_ativa: boolean;
  porta_2_nome: string;
  modo_conexao: 'ip' | 'isup';
  device_id: string;
  online_isup: boolean | null;
}

interface BlocoItem {
  id: number;
  nome: string;
}

interface IsupConectado {
  device_id: string;
  online: boolean;
  ip_remoto: string;
  firmware: string;
}

interface CondominioCfg {
  id: number;
  nome: string;
  tipo_portaria: string;
  portaria_autonoma: number;
  cameras_morador_ativo: number;
}

interface CanalNvr {
  canal: number;
  selecionado: boolean;
  camera_id: number | null;
  nome: string;
  nome_nvr: string;
  localizacao: string;
  online_nvr: boolean | null;
  ip_camera: string | null;
}

interface FormNvr {
  id: number | null;
  nome: string;
  modo_conexao: 'ip' | 'isup';
  ip: string;
  porta_http: string;
  porta_rtsp: string;
  usuario: string;
  senha: string;
  max_canais: string;
  localizacao: string;
}

interface Aviso {
  tipo: 'ok' | 'erro';
  mensagem: string;
}

interface FormCam {
  id: number | null;
  nome: string;
  localizacao: string;
  modo: 'nvr' | 'isup' | 'url';
  nvr_ip: string;
  porta_rtsp: string;
  nvr_usuario: string;
  nvr_senha: string;
  isup_device_id: string;
  isup_senha: string;
  canal: string;
  url_stream: string;
  visivel_morador: boolean;
  controlador_id: string;
  porta_numero: string;
  bloco_id: string;
}

const FORM_VAZIO: FormCam = {
  id: null,
  nome: '',
  localizacao: '',
  modo: 'isup',
  nvr_ip: '',
  porta_rtsp: '554',
  nvr_usuario: 'admin',
  nvr_senha: '',
  isup_device_id: '',
  isup_senha: '',
  canal: '1',
  url_stream: '',
  visivel_morador: true,
  controlador_id: '',
  porta_numero: '0',
  bloco_id: '',
};

const NVR_VAZIO: FormNvr = {
  id: null,
  nome: '',
  modo_conexao: 'ip',
  ip: '',
  porta_http: '80',
  porta_rtsp: '554',
  usuario: 'admin',
  senha: '',
  max_canais: '16',
  localizacao: '',
};

const msgErro = (e: unknown) => (e instanceof ErroApi ? e.message : 'Erro inesperado.');
const lbl = 'block text-sm font-bold text-slate-700 mb-1';
const inp = 'w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500';

const StreamPlayer = ({ camera }: { camera: CameraItem }) => {
  const [erro, setErro] = useState(false);
  const [stream, setStream] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [webrtcPlaying, setWebrtcPlaying] = useState(false);
  const playerRef = useRef<(HTMLElement & { src?: string; video?: HTMLVideoElement }) | null>(null);
  const webrtcPlayingRef = useRef(false);

  useEffect(() => {
    webrtcPlayingRef.current = webrtcPlaying;
  }, [webrtcPlaying]);

  useEffect(() => {
    let ativo = true;
    setErro(false);
    setStream(null);
    setSnapshot(null);
    setWebrtcPlaying(false);

    if (camera.status === 'online' && camera.modo_conexao !== 'isup') {
      api<{ stream: string }>('camera_stream', { query: { id: camera.id } })
        .then((r) => {
          if (ativo) setStream(r.stream);
        })
        .catch(() => {
          if (ativo) setErro(true);
        });
    }
    return () => {
      ativo = false;
    };
  }, [camera.id, camera.status, camera.modo_conexao]);

  // Liga o WebSocket do go2rtc no elemento <video-rtc> e monitora se o vídeo entrou em reprodução
  useEffect(() => {
    const el = playerRef.current as (HTMLElement & {
      src?: string;
      video?: HTMLVideoElement;
      ondisconnect?: () => void;
      onconnect?: () => void;
    }) | null;
    if (!el || !stream) return;
    const wsUrl = obterUrlWsGo2rtc(stream);
    el.setAttribute('mode', 'webrtc,mse,hls,mjpeg');
    el.setAttribute('media', 'video');
    el.src = wsUrl;

    let ultimoTempo = -1;
    let ultimoAvancoEm = Date.now();

    const timer = window.setInterval(() => {
      const v = el.querySelector('video');
      if (v) {
        v.playsInline = true;
        v.controls = false;
        v.muted = true;
        v.style.width = '100%';
        v.style.height = '100%';
        v.style.objectFit = 'cover';
        if (v.readyState >= 2 && !v.paused && v.videoWidth > 0) {
          if (v.buffered && v.buffered.length > 0) {
            const fim = v.buffered.end(v.buffered.length - 1);
            if (fim - v.currentTime > 1.8) {
              v.currentTime = fim - 0.15;
            }
          }
          if (Math.abs(v.currentTime - ultimoTempo) > 0.01) {
            ultimoTempo = v.currentTime;
            ultimoAvancoEm = Date.now();
            setWebrtcPlaying(true);
          } else if (!document.hidden && Date.now() - ultimoAvancoEm > 4500) {
            ultimoAvancoEm = Date.now();
            setWebrtcPlaying(false);
            el.ondisconnect?.();
            el.onconnect?.();
          }
        } else if (v.paused && v.readyState >= 2 && !document.hidden) {
          v.play().catch(() => {});
        }
      }
    }, 350);
    return () => window.clearInterval(timer);
  }, [stream]);

  // Fallback contínuo via snapshot enquanto o stream WebRTC/MSE não estiver reproduzindo frames
  useEffect(() => {
    if (camera.status !== 'online') return;
    let cancelado = false;
    let timer: number | undefined;

    const ehIsup = camera.modo_conexao === 'isup';

    const ciclo = async () => {
      if (cancelado) return;
      if (document.hidden || webrtcPlayingRef.current) {
        timer = window.setTimeout(ciclo, 2000);
        return;
      }
      let okSnap = false;
      try {
        const r = await api<{ imagem: string }>('camera_snapshot', { query: { id: camera.id } });
        if (!cancelado && r.imagem) {
          okSnap = true;
          setSnapshot(r.imagem);
          setErro(false);
        }
      } catch {
        // Ignora silenciosamente se o stream principal estiver conectando
      }
      if (!cancelado) {
        // Se o canal falhou (ex.: canal sem câmera no NVR), aguarda 5s para não sobrecarregar a VPS
        const proximoMs = okSnap ? (ehIsup ? 1200 : 1800) : 5000;
        timer = window.setTimeout(ciclo, proximoMs);
      }
    };

    // Para câmeras ISUP busca o 1º frame imediatamente; para RTSP aguarda 1.8s deixando o WebRTC/MSE conectar livre
    timer = window.setTimeout(ciclo, ehIsup ? 80 : 1800);
    return () => {
      cancelado = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [camera.id, camera.status, camera.modo_conexao]);

  if (camera.status !== 'online') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-500">
        <VideoOff size={40} className="mb-2" />
        <span className="font-bold text-sm">Câmera Desativada</span>
      </div>
    );
  }
  if (erro && !snapshot) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-red-500">
        <AlertCircle size={40} className="mb-2" />
        <span className="font-bold text-sm">Falha no Stream</span>
      </div>
    );
  }
  if (!stream && !snapshot) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-900">
        <div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }
  return (
    <div className="w-full h-full relative bg-black overflow-hidden">
      {snapshot && !webrtcPlaying && (
        <img
          src={snapshot}
          alt={camera.nome}
          className="absolute inset-0 w-full h-full object-cover z-[1]"
        />
      )}
      {stream && (
        <video-rtc
          ref={(node: HTMLElement | null) => {
            playerRef.current = node as (HTMLElement & { src?: string; video?: HTMLVideoElement }) | null;
          }}
          autoplay
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      )}
    </div>
  );
};

const LAYOUTS: Record<string, { name: string; cols: string; slots: number }> = {
  all: { name: 'Todas Ativas', cols: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4', slots: 0 },
  '1x1': { name: 'Única (1x1)', cols: 'grid-cols-1 max-w-4xl mx-auto', slots: 1 },
  '2x2': { name: 'Mosaico (2x2)', cols: 'grid-cols-2 max-w-5xl mx-auto', slots: 4 },
  '3x3': { name: 'Matriz (3x3)', cols: 'grid-cols-3', slots: 9 },
  '4x2': { name: 'Panorâmico (4x2)', cols: 'grid-cols-4', slots: 8 },
  '4x4': { name: 'Completo (4x4)', cols: 'grid-cols-4', slots: 16 },
};

export default function Cameras() {
  const [cameras, setCameras] = useState<CameraItem[]>([]);
  const [nvrs, setNvrs] = useState<NvrItem[]>([]);
  const [controladores, setControladores] = useState<ControladorItem[]>([]);
  const [blocos, setBlocos] = useState<BlocoItem[]>([]);
  const [isupConectados, setIsupConectados] = useState<IsupConectado[]>([]);
  const [condCfg, setCondCfg] = useState<CondominioCfg | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [form, setForm] = useState<FormCam | null>(null);
  const [formNvr, setFormNvr] = useState<FormNvr | null>(null);
  const [seletorNvr, setSeletorNvr] = useState<{
    nvr: NvrItem;
    conectou_isapi: boolean;
    canais: CanalNvr[];
    carregando: boolean;
  } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [teste, setTeste] = useState<Aviso | null>(null);
  const [layout, setLayout] = useState('all');
  const [slots, setSlots] = useState<(number | null)[]>([]);
  const [slotSelecionado, setSlotSelecionado] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{
        cameras: CameraItem[];
        nvrs?: NvrItem[];
        controladores?: ControladorItem[];
        blocos?: BlocoItem[];
        isup_conectados?: IsupConectado[];
        condominio_cfg?: CondominioCfg;
      }>('cameras_listar');
      setCameras(r.cameras);
      setNvrs(r.nvrs ?? []);
      setControladores(r.controladores ?? []);
      setBlocos(r.blocos ?? []);
      setIsupConectados(r.isup_conectados ?? []);
      if (r.condominio_cfg) setCondCfg(r.condominio_cfg);
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: msgErro(e) });
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const executar = async (rota: string, corpo: Record<string, unknown>, depois?: () => void) => {
    setOcupado(true);
    try {
      const r = await api<{ tipo?: 'ok' | 'erro'; mensagem: string }>(rota, { corpo });
      setAviso({ tipo: r.tipo === 'erro' ? 'erro' : 'ok', mensagem: r.mensagem });
      depois?.();
      await carregar();
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: msgErro(e) });
    } finally {
      setOcupado(false);
    }
  };

  const alternarConfigMoradorCondominio = async (novoValor: boolean) => {
    await executar('cameras_config_morador', { cameras_morador_ativo: novoValor ? 1 : 0 });
  };

  const alternarCameraNoAppMorador = async (
    cam: CameraItem,
    visivel?: boolean,
    ctrlId?: number | null,
    portaNum?: number,
  ) => {
    const novoVisivel = visivel !== undefined ? visivel : !cam.visivel_morador;
    await executar('camera_alternar_morador', {
      id: cam.id,
      visivel_morador: novoVisivel,
      controlador_id: ctrlId !== undefined ? ctrlId : cam.controlador_id,
      porta_numero: portaNum !== undefined ? portaNum : (cam.porta_numero ?? 0),
      ativar_condominio: novoVisivel,
    });
  };

  const importarCameraDeTerminal = async (ctrlId: number) => {
    await executar('camera_importar_controlador', {
      controlador_id: ctrlId,
      visivel_morador: true,
    });
  };

  const testar = async (corpo: Record<string, unknown>) => {
    setTeste({ tipo: 'ok', mensagem: 'Testando conexão...' });
    try {
      const r = await api<{ tipo: 'ok' | 'erro'; mensagem: string }>('camera_testar', { corpo });
      setTeste({ tipo: r.tipo, mensagem: r.mensagem });
    } catch (e) {
      setTeste({ tipo: 'erro', mensagem: msgErro(e) });
    }
  };

  const abrirSelecaoCanais = async (nvrId: number, nvrResumo?: NvrItem) => {
    setSeletorNvr({
      nvr: nvrResumo ?? {
        id: nvrId,
        nome: 'Carregando NVR...',
        ip: '',
        porta_http: 80,
        porta_rtsp: 554,
        usuario: 'admin',
        max_canais: 16,
        localizacao: '',
        tem_senha: true,
        canais_ativos: 0,
      },
      conectou_isapi: false,
      canais: [],
      carregando: true,
    });
    try {
      const r = await api<{ nvr: NvrItem; conectou_isapi: boolean; canais: CanalNvr[] }>('nvr_canais', {
        query: { id: nvrId },
      });
      setSeletorNvr({
        nvr: { ...r.nvr, tem_senha: true, canais_ativos: r.canais.filter((c) => c.selecionado).length },
        conectou_isapi: r.conectou_isapi,
        canais: r.canais,
        carregando: false,
      });
    } catch (e) {
      setSeletorNvr(null);
      setAviso({ tipo: 'erro', mensagem: msgErro(e) });
    }
  };

  const salvarNvr = async (e: React.FormEvent, abrirCanaisDepois = true) => {
    e.preventDefault();
    if (!formNvr) return;
    setOcupado(true);
    try {
      const r = await api<{ tipo?: 'ok' | 'erro'; mensagem: string; nvr_id: number }>('nvr_salvar', {
        corpo: {
          id: formNvr.id,
          nome: formNvr.nome,
          modo_conexao: formNvr.modo_conexao,
          ip: formNvr.ip,
          porta_http: Number(formNvr.porta_http) || 80,
          porta_rtsp: Number(formNvr.porta_rtsp) || 554,
          usuario: formNvr.usuario,
          senha: formNvr.senha,
          max_canais: Number(formNvr.max_canais) || 16,
          localizacao: formNvr.localizacao,
        },
      });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      setFormNvr(null);
      await carregar();
      if (abrirCanaisDepois && r.nvr_id) {
        await abrirSelecaoCanais(r.nvr_id);
      }
    } catch (err) {
      setAviso({ tipo: 'erro', mensagem: msgErro(err) });
    } finally {
      setOcupado(false);
    }
  };

  const salvarCanaisSelecionados = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!seletorNvr) return;
    await executar(
      'nvr_salvar_canais',
      {
        nvr_id: seletorNvr.nvr.id,
        canais: seletorNvr.canais.map((c) => ({
          canal: c.canal,
          selecionado: c.selecionado,
          nome: c.nome,
          localizacao: c.localizacao,
        })),
      },
      () => setSeletorNvr(null),
    );
  };

  const alternarCanal = (canalNum: number) => {
    if (!seletorNvr) return;
    setSeletorNvr({
      ...seletorNvr,
      canais: seletorNvr.canais.map((c) => (c.canal === canalNum ? { ...c, selecionado: !c.selecionado } : c)),
    });
  };

  const alterarNomeCanal = (canalNum: number, novoNome: string) => {
    if (!seletorNvr) return;
    setSeletorNvr({
      ...seletorNvr,
      canais: seletorNvr.canais.map((c) => (c.canal === canalNum ? { ...c, nome: novoNome } : c)),
    });
  };

  const marcarCanaisEmLote = (modoLote: 'todos' | 'nenhum' | 'online') => {
    if (!seletorNvr) return;
    setSeletorNvr({
      ...seletorNvr,
      canais: seletorNvr.canais.map((c) => ({
        ...c,
        selecionado:
          modoLote === 'todos' ? true : modoLote === 'nenhum' ? false : c.online_nvr === true,
      })),
    });
  };

  const toggleFullScreen = () => {
    const el = document.getElementById('camera-grid-container');
    if (!document.fullscreenElement) el?.requestFullscreen().catch(() => undefined);
    else document.exitFullscreen();
  };

  const changeLayout = (key: string) => {
    setLayout(key);
    if (key !== 'all') {
      const n = LAYOUTS[key].slots;
      setSlots((prev) => {
        const s = [...prev];
        while (s.length < n) s.push(null);
        return s.slice(0, n);
      });
    }
  };

  const atribuirCamera = (camId: number) => {
    if (slotSelecionado === null) return;
    setSlots((prev) => {
      const s = [...prev];
      s[slotSelecionado] = camId;
      return s;
    });
    setSlotSelecionado(null);
  };

  const removerCameraSlot = (i: number) => {
    setSlots((prev) => {
      const s = [...prev];
      s[i] = null;
      return s;
    });
    setSlotSelecionado(null);
  };

  const editar = (c: CameraItem) => {
    setTeste(null);
    const ehIsup = c.modo_conexao === 'isup';
    setForm({
      id: c.id,
      nome: c.nome,
      localizacao: c.localizacao ?? '',
      modo: ehIsup ? 'isup' : c.canal ? 'nvr' : 'url',
      nvr_ip: ehIsup ? '' : (c.host ?? ''),
      porta_rtsp: String(ehIsup ? 554 : (c.porta_rtsp ?? 554)),
      nvr_usuario: c.usuario ?? 'admin',
      nvr_senha: '',
      isup_device_id: ehIsup ? (c.isup_device_id ?? c.host ?? '') : '',
      isup_senha: '',
      canal: String(c.canal ?? 1),
      url_stream: '',
      visivel_morador: Boolean(c.visivel_morador),
      controlador_id: c.controlador_id ? String(c.controlador_id) : '',
      porta_numero: String(c.porta_numero ?? 0),
      bloco_id: c.bloco_id ? String(c.bloco_id) : '',
    });
  };

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    executar(
      'camera_salvar',
      {
        ...form,
        porta_rtsp: Number(form.porta_rtsp) || 554,
        canal: Number(form.canal) || 1,
        controlador_id: form.controlador_id ? Number(form.controlador_id) : null,
        porta_numero: Number(form.porta_numero) || 0,
        bloco_id: form.bloco_id ? Number(form.bloco_id) : null,
      },
      () => setForm(null),
    );
  };

  const muda = (k: keyof FormCam) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    form && setForm({ ...form, [k]: e.target.value });

  const tile = (cam: CameraItem, mosaico?: number) => {
    const ehIsup = cam.modo_conexao === 'isup';
    const valorVinculo = cam.controlador_id ? `${cam.controlador_id}|${cam.porta_numero ?? 0}` : '';

    return (
      <div
        className={`bg-white ${
          mosaico === undefined ? 'rounded-2xl border-slate-200' : 'rounded-2xl border-slate-700'
        } overflow-hidden shadow-sm border flex flex-col`}
      >
        <div className="relative group aspect-video bg-black overflow-hidden">
          <div className="absolute inset-0">
            <StreamPlayer camera={cam} />
          </div>
          <div className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex justify-between items-start z-10 pointer-events-none">
            <div className="flex flex-col gap-1 pointer-events-auto">
              <span className="text-white font-bold text-sm drop-shadow-md">{cam.nome}</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {ehIsup ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-600/90 text-white border border-indigo-400/50">
                    <Globe size={10} /> ISUP 5.0 · {cam.host} (CH {cam.canal ?? 1})
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800/80 text-slate-200 border border-white/15">
                    RTSP {cam.canal ? `· CH ${cam.canal}` : ''}
                  </span>
                )}
                {cam.visivel_morador && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/90 text-white">
                    <Smartphone size={10} /> No App
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto">
              {mosaico === undefined ? (
                <>
                  <button
                    onClick={() => executar('camera_status', { id: cam.id })}
                    className="p-1.5 bg-white/20 hover:bg-white/40 rounded-lg text-white cursor-pointer"
                    title={cam.status === 'online' ? 'Desativar' : 'Ativar'}
                  >
                    <Power size={14} />
                  </button>
                  <button
                    onClick={() => editar(cam)}
                    className="p-1.5 bg-white/20 hover:bg-white/40 rounded-lg text-white cursor-pointer"
                    title="Editar"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() =>
                      window.confirm('Deseja excluir esta câmera?') && executar('camera_excluir', { id: cam.id })
                    }
                    className="p-1.5 bg-red-500/80 hover:bg-red-500 rounded-lg text-white cursor-pointer"
                    title="Excluir"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setSlotSelecionado(mosaico)}
                    className="p-2 bg-white/20 hover:bg-white/40 rounded-lg text-white cursor-pointer"
                    title="Trocar Câmera"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => removerCameraSlot(mosaico)}
                    className="p-2 bg-red-500/80 hover:bg-red-500 rounded-lg text-white cursor-pointer"
                    title="Remover do Mosaico"
                  >
                    <X size={14} />
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="absolute bottom-3 right-3 z-10 pointer-events-none">
            <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur px-2 py-1 rounded-md border border-white/10">
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  cam.status === 'online' && (!ehIsup || cam.online_isup !== false)
                    ? 'bg-emerald-500 animate-pulse'
                    : 'bg-red-500'
                }`}
              />
              <span
                className={`text-[9px] font-bold tracking-widest ${
                  cam.status === 'online' && (!ehIsup || cam.online_isup !== false)
                    ? 'text-emerald-400'
                    : 'text-red-400'
                }`}
              >
                {cam.status !== 'online' ? 'OFF' : ehIsup && cam.online_isup === false ? 'ISUP OFF' : 'LIVE'}
              </span>
            </div>
          </div>
        </div>

        {/* Barra de controle do Síndico: Exibir no App do Morador + Vincular ao Portão */}
        {mosaico === undefined && (
          <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={ocupado}
                onClick={() => alternarCameraNoAppMorador(cam)}
                className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 border transition cursor-pointer ${
                  cam.visivel_morador
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                }`}
                title="Escolher se esta câmera aparece para os moradores logo abaixo do botão Abrir Porta"
              >
                <Smartphone size={13} />
                {cam.visivel_morador ? 'Liberada no App do Morador' : 'Liberar no App do Morador'}
              </button>
              <button
                type="button"
                onClick={() => editar(cam)}
                className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
                title="Configurações da câmera"
              >
                <Edit2 size={13} />
              </button>
            </div>

            {controladores.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Link2 size={13} className="text-slate-400 shrink-0" />
                <select
                  value={valorVinculo}
                  disabled={ocupado}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      alternarCameraNoAppMorador(cam, cam.visivel_morador, null, 0);
                    } else {
                      const [cId, pNum] = val.split('|').map(Number);
                      alternarCameraNoAppMorador(cam, true, cId, pNum || 0);
                    }
                  }}
                  className="flex-1 text-[11px] font-semibold bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 outline-none focus:border-blue-500"
                  title="Vincular esta câmera a um portão/porta específico para exibir quando o morador for abrir o portão"
                >
                  <option value="">🔗 Sem portão específico (Geral)</option>
                  {controladores.map((ct) => (
                    <React.Fragment key={ct.id}>
                      <option value={`${ct.id}|0`}>🔓 {ct.nome} (Todas as portas)</option>
                      {ct.porta_1_ativa && (
                        <option value={`${ct.id}|1`}>↳ {ct.nome} ({ct.porta_1_nome})</option>
                      )}
                      {ct.porta_2_ativa && (
                        <option value={`${ct.id}|2`}>↳ {ct.nome} ({ct.porta_2_nome})</option>
                      )}
                    </React.Fragment>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const qtdMarcados = seletorNvr ? seletorNvr.canais.filter((c) => c.selecionado).length : 0;
  const qtdLiberadasMorador = cameras.filter((c) => c.visivel_morador).length;
  const appCamerasAtivo = (condCfg?.cameras_morador_ativo ?? 0) === 1;

  return (
    <div id="camera-grid-container" className="p-8 pb-24 h-full overflow-y-auto bg-slate-50 flex flex-col">
      {aviso && (
        <div
          className={`border-l-4 px-4 py-3 rounded-lg text-sm font-semibold mb-5 flex justify-between gap-3 ${
            aviso.tipo === 'ok'
              ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
              : 'bg-rose-50 border-rose-500 text-rose-800'
          }`}
        >
          <span>{aviso.mensagem}</span>
          <button onClick={() => setAviso(null)} aria-label="Fechar aviso">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Monitoramento (CFTV & ISUP 5.0)</h1>
          <p className="text-slate-500 mt-1">
            Feeds ao vivo das câmeras de segurança (RTSP e Túnel ISUP 5.0) e controle de exibição no App do Morador.
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={toggleFullScreen}
            className="px-4 py-2 bg-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-300 flex items-center gap-2 cursor-pointer"
          >
            <Maximize size={18} /> Tela Cheia
          </button>
          <button
            disabled={ocupado || cameras.length === 0}
            onClick={() =>
              window.confirm(
                'ATENÇÃO: Deseja apagar TODAS as câmeras deste condomínio do sistema? O NVR em si não será afetado.',
              ) && executar('cameras_limpar', {})
            }
            className="px-4 py-2 bg-red-100 text-red-600 font-bold rounded-xl hover:bg-red-200 flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <Trash size={18} /> Limpar Câmeras
          </button>
          <button
            onClick={() => {
              setTeste(null);
              setFormNvr(NVR_VAZIO);
            }}
            className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <Server size={18} /> Cadastrar NVR
          </button>
          <button
            onClick={() => {
              setTeste(null);
              setForm({
                ...FORM_VAZIO,
                isup_device_id: isupConectados[0]?.device_id ?? '',
              });
            }}
            className="px-4 py-2 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 flex items-center gap-2 cursor-pointer"
          >
            <Plus size={18} /> Cadastrar Câmera (ISUP / RTSP)
          </button>
        </div>
      </div>

      {/* Painel do Síndico: Habilitar Câmeras na Tela Inicial do App do Morador (Portaria Autônoma / Remota) */}
      <div
        className={`rounded-2xl border p-4 mb-6 shadow-sm shrink-0 transition ${
          appCamerasAtivo
            ? 'bg-gradient-to-r from-emerald-50/90 via-white to-indigo-50/60 border-emerald-300'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                appCamerasAtivo ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500'
              }`}
            >
              <Smartphone size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-extrabold text-slate-900">
                  Visualização de Câmeras na Tela Inicial do App do Morador
                </h2>
                <span
                  className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full ${
                    appCamerasAtivo
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
                >
                  {appCamerasAtivo ? '🟢 HABILITADO NESTE CONDOMÍNIO' : '⚪ DESABILITADO NESTE CONDOMÍNIO'}
                </span>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {qtdLiberadasMorador} {qtdLiberadasMorador === 1 ? 'câmera escolhida' : 'câmeras escolhidas'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Quando habilitado para este condomínio (Portaria Autônoma ou Remota), os moradores veem as câmeras
                marcadas com <strong>"Liberada no App do Morador"</strong> na tela inicial logo abaixo do botão{' '}
                <strong>Abrir Porta</strong>, acompanhando ao vivo o portão vinculado no momento do comando.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 self-end lg:self-center">
            <button
              type="button"
              disabled={ocupado}
              onClick={() => alternarConfigMoradorCondominio(!appCamerasAtivo)}
              className={`px-4 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer shadow-xs ${
                appCamerasAtivo
                  ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              <Power size={16} />
              {appCamerasAtivo ? 'Desabilitar no App do Morador' : 'Habilitar Câmeras no App do Morador'}
            </button>
          </div>
        </div>

        {/* Atalho rápido para importar a câmera embutida dos Terminais Faciais (ISUP 5.0 ou IP) como câmera vinculada */}
        {controladores.length > 0 && (
          <div className="mt-3.5 pt-3 border-t border-slate-200/80 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-600">
              ⚡ Vincular câmera embutida de Terminal de Portaria (ISUP 5.0 / IP):
            </span>
            {controladores.map((ct) => {
              const jaImportada = cameras.some((cam) => cam.controlador_id === ct.id);
              return (
                <button
                  key={ct.id}
                  type="button"
                  disabled={ocupado}
                  onClick={() => importarCameraDeTerminal(ct.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition cursor-pointer ${
                    jaImportada
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                      : 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100'
                  }`}
                  title="Cria ou atualiza automaticamente a câmera deste terminal (via ISUP 5.0 ou RTSP) e vincula ao botão de abrir porta"
                >
                  <Camera size={13} />
                  {jaImportada ? `✓ ${ct.nome}` : `+ Importar ${ct.nome}`}
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/80 font-extrabold uppercase">
                    {ct.modo_conexao === 'isup' ? `ISUP (${ct.device_id})` : 'IP'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Painel de NVRs Cadastrados */}
      {nvrs.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-6 shadow-sm shrink-0">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 text-sm font-extrabold text-slate-800">
              <Server size={17} className="text-emerald-600" />
              NVRs Cadastrados ({nvrs.length})
              <span className="text-xs font-normal text-slate-500">
                — Selecione quais canais de cada NVR deseja exibir no monitoramento
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {nvrs.map((n) => (
              <div
                key={n.id}
                className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200"
              >
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 text-sm truncate flex items-center gap-2">
                    {n.nome}
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      {n.canais_ativos} {n.canais_ativos === 1 ? 'canal ativo' : 'canais ativos'}
                    </span>
                    {n.modo_conexao === 'isup' && (
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                        ISUP 5.0
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">
                    {n.modo_conexao === 'isup'
                      ? `Device ID ISUP: ${n.ip} · ${n.online_isup ? '🟢 Online' : '⚪ Aguardando'}`
                      : `IP: ${n.ip} · RTSP: ${n.porta_rtsp} · Usuário: ${n.usuario}`}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => abrirSelecaoCanais(n.id, n)}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                    title="Escolher quais canais deste NVR serão exibidos no sistema"
                  >
                    <ListChecks size={15} /> Selecionar Canais
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTeste(null);
                      setFormNvr({
                        id: n.id,
                        nome: n.nome,
                        modo_conexao: n.modo_conexao ?? 'ip',
                        ip: n.ip,
                        porta_http: String(n.porta_http || 80),
                        porta_rtsp: String(n.porta_rtsp || 554),
                        usuario: n.usuario || 'admin',
                        senha: '',
                        max_canais: String(n.max_canais || 16),
                        localizacao: n.localizacao || '',
                      });
                    }}
                    className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
                    title="Editar NVR"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Deseja remover o cadastro do NVR "${n.nome}" (${n.ip})?\n\nAs câmeras já selecionadas continuarão salvas a menos que você limpe as câmeras.`,
                        )
                      ) {
                        executar('nvr_excluir', { id: n.id, remover_cameras: false });
                      }
                    }}
                    className="p-1.5 rounded-lg bg-white border border-slate-200 text-rose-600 hover:bg-rose-50 cursor-pointer"
                    title="Excluir NVR"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200 mb-6 w-fit overflow-x-auto max-w-full shrink-0">
        {Object.entries(LAYOUTS).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => changeLayout(key)}
            className={`px-4 py-2 rounded-xl font-bold text-sm whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              layout === key ? 'bg-slate-800 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {key === 'all' && <LayoutGrid size={16} />}
            {cfg.name}
          </button>
        ))}
      </div>

      {layout === 'all' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {cameras.length > 0 ? (
            cameras.map((cam) => <div key={cam.id}>{tile(cam)}</div>)
          ) : (
            <div className="col-span-full py-12 text-center text-slate-500">
              Nenhuma câmera selecionada para visualização ainda. Cadastre uma câmera via ISUP 5.0, NVR ou importe a
              câmera de um terminal de portaria acima.
            </div>
          )}
        </div>
      ) : (
        <div className={`grid gap-4 ${LAYOUTS[layout].cols} flex-1`}>
          {slots.map((camId, i) => {
            const cam = cameras.find((c) => c.id === camId);
            return cam ? (
              <div key={i}>{tile(cam, i)}</div>
            ) : (
              <div
                key={i}
                onClick={() => setSlotSelecionado(i)}
                className="bg-slate-200/50 hover:bg-slate-200 border-2 border-dashed border-slate-300 rounded-2xl aspect-video flex flex-col items-center justify-center cursor-pointer group"
              >
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm text-slate-400 group-hover:text-blue-500">
                  <Plus size={24} />
                </div>
                <span className="mt-3 font-bold text-sm text-slate-500 group-hover:text-blue-600">Atribuir Câmera</span>
              </div>
            );
          })}
        </div>
      )}

      {slotSelecionado !== null && (
        <Modal titulo="Selecionar Câmera" borda="border-t-blue-600" onFechar={() => setSlotSelecionado(null)}>
          <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
            {slots[slotSelecionado] !== null && (
              <button
                onClick={() => removerCameraSlot(slotSelecionado)}
                className="p-3 text-left rounded-xl hover:bg-red-50 text-red-600 font-bold text-sm flex items-center gap-3"
              >
                <Trash2 size={18} /> Limpar Quadrante
              </button>
            )}
            {cameras.map((cam) => (
              <button
                key={cam.id}
                onClick={() => atribuirCamera(cam.id)}
                className={`p-3 text-left rounded-xl border flex justify-between items-center ${
                  slots[slotSelecionado] === cam.id ? 'bg-blue-50 border-blue-200' : 'hover:bg-slate-50 border-slate-100'
                }`}
              >
                <div>
                  <div className="font-bold text-slate-800">{cam.nome}</div>
                  <div className="text-xs text-slate-500">{cam.localizacao}</div>
                </div>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {/* Modal: Cadastrar / Editar Câmera Individual (ISUP 5.0, NVR/IP ou URL Direta) */}
      {form && (
        <Modal
          largura="max-w-xl"
          titulo={
            <>
              <Camera /> {form.id ? 'Editar Câmera' : 'Cadastrar Nova Câmera'}
            </>
          }
          borda="border-t-slate-800"
          onFechar={() => setForm(null)}
        >
          <form onSubmit={salvar} className="space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Nome da Câmera *</label>
                <input
                  required
                  value={form.nome}
                  onChange={muda('nome')}
                  placeholder="Ex: Câmera Portão Garagem"
                  className={inp}
                />
              </div>
              <div>
                <label className={lbl}>Localização</label>
                <input
                  value={form.localizacao}
                  onChange={muda('localizacao')}
                  placeholder="Ex: Portaria / Entrada"
                  className={inp}
                />
              </div>
            </div>

            <div>
              <label className={lbl}>Modo de Conexão da Câmera</label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'isup', label: '🌐 ISUP 5.0 (Sem VPN)' },
                    { id: 'nvr', label: '🖧 Por NVR / IP (RTSP)' },
                    { id: 'url', label: '🔗 URL Direta' },
                  ] as const
                ).map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => setForm({ ...form, modo: m.id })}
                    className={`py-2 px-2 rounded-xl text-xs sm:text-sm font-bold border cursor-pointer transition ${
                      form.modo === m.id
                        ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {form.modo === 'isup' ? (
              <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-3">
                <div className="text-xs text-indigo-900 font-semibold">
                  Conecte câmeras Hikvision, NVRs ou a câmera de Terminais Faciais via protocolo{' '}
                  <strong>ISUP 5.0</strong> (Servidor <code className="font-mono">24.152.119.249</code> porta{' '}
                  <code className="font-mono">7660</code>), sem necessidade de IP fixo ou VPN.
                </div>

                {isupConectados.length > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-indigo-800 mb-1">
                      Dispositivos ISUP Conectados no Servidor (clique para preencher):
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {isupConectados.map((d) => (
                        <button
                          key={d.device_id}
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              isup_device_id: d.device_id,
                              nome: form.nome || `Câmera ${d.device_id}`,
                            })
                          }
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer ${
                            form.isup_device_id.toUpperCase() === d.device_id.toUpperCase()
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-indigo-800 border-indigo-300 hover:bg-indigo-100'
                          }`}
                        >
                          {d.online ? '🟢' : '⚪'} {d.device_id} {d.ip_remoto ? `(${d.ip_remoto})` : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className={lbl}>Device ID ISUP 5.0 *</label>
                    <input
                      required
                      value={form.isup_device_id}
                      onChange={muda('isup_device_id')}
                      placeholder="Ex: CONJDFARAO"
                      className={`${inp} font-mono bg-white`}
                    />
                  </div>
                  <div>
                    <label className={lbl}>Canal de Vídeo</label>
                    <input
                      type="number"
                      min={1}
                      max={64}
                      value={form.canal}
                      onChange={muda('canal')}
                      className={`${inp} bg-white`}
                    />
                  </div>
                </div>
                <div>
                  <label className={lbl}>
                    Chave de Criptografia ISUP (Opcional se o terminal/NVR já estiver cadastrado)
                  </label>
                  <input
                    type="password"
                    value={form.isup_senha}
                    onChange={muda('isup_senha')}
                    autoComplete="new-password"
                    placeholder="Deixe em branco se já cadastrado em Terminais/NVRs (padrão: pwd001@@)"
                    className={`${inp} bg-white`}
                  />
                </div>
              </div>
            ) : form.modo === 'nvr' ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className={lbl}>IP ou Host do NVR/DVR *</label>
                    <input required value={form.nvr_ip} onChange={muda('nvr_ip')} className={`${inp} font-mono`} />
                  </div>
                  <div>
                    <label className={lbl}>Porta RTSP</label>
                    <input type="number" value={form.porta_rtsp} onChange={muda('porta_rtsp')} className={inp} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={lbl}>Usuário NVR</label>
                    <input value={form.nvr_usuario} onChange={muda('nvr_usuario')} className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Senha NVR</label>
                    <input
                      type="password"
                      value={form.nvr_senha}
                      onChange={muda('nvr_senha')}
                      required={!form.id}
                      autoComplete="new-password"
                      placeholder={form.id ? '(manter atual)' : ''}
                      className={inp}
                    />
                  </div>
                  <div>
                    <label className={lbl}>Canal (nº no NVR)</label>
                    <input type="number" min={1} max={64} value={form.canal} onChange={muda('canal')} className={inp} />
                  </div>
                </div>
              </>
            ) : (
              <div>
                <label className={lbl}>URL do Stream (RTSP ou ISUP)</label>
                <input
                  value={form.url_stream}
                  onChange={muda('url_stream')}
                  required={!form.id}
                  placeholder={
                    form.id
                      ? '(deixe em branco para manter a atual)'
                      : 'rtsp://usuario:senha@192.168.1.50:554/Streaming/Channels/102 ou isup://DEVICE_ID/1'
                  }
                  className={`${inp} font-mono text-sm`}
                />
              </div>
            )}

            {/* Seção: Exibição no App do Morador e Vínculo com o Botão Abrir Porta */}
            <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.visivel_morador}
                  onChange={(e) => setForm({ ...form, visivel_morador: e.target.checked })}
                  className="mt-0.5 w-4 h-4 accent-emerald-600"
                />
                <div>
                  <div className="text-sm font-extrabold text-emerald-950 flex items-center gap-1.5">
                    <Smartphone size={15} className="text-emerald-600" />
                    Liberar esta câmera na Tela Inicial do App do Morador
                  </div>
                  <div className="text-xs text-emerald-800/80">
                    Aparecerá logo abaixo do botão de <strong>Abrir Porta</strong> quando a visualização estiver
                    habilitada para este condomínio.
                  </div>
                </div>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Vincular ao Portão / Terminal (Opcional)
                  </label>
                  <select
                    value={form.controlador_id}
                    onChange={(e) => setForm({ ...form, controlador_id: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 outline-none focus:border-emerald-500"
                  >
                    <option value="">Sem vínculo específico (Câmera Geral)</option>
                    {controladores.map((ct) => (
                      <option key={ct.id} value={ct.id}>
                        {ct.nome} ({ct.modo_conexao.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Porta Específica / Restrição</label>
                  {form.controlador_id ? (
                    <select
                      value={form.porta_numero}
                      onChange={(e) => setForm({ ...form, porta_numero: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 outline-none focus:border-emerald-500"
                    >
                      <option value="0">Todas as portas deste terminal</option>
                      <option value="1">Apenas Porta 1 (Pedestre / Social)</option>
                      <option value="2">Apenas Porta 2 (Veículos / Garagem)</option>
                    </select>
                  ) : (
                    <select
                      value={form.bloco_id}
                      onChange={(e) => setForm({ ...form, bloco_id: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 outline-none focus:border-emerald-500"
                    >
                      <option value="">Visível para todos os blocos</option>
                      {blocos.map((b) => (
                        <option key={b.id} value={b.id}>
                          Apenas moradores de: {b.nome}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>

            {teste && (
              <div className={`text-sm font-semibold ${teste.tipo === 'ok' ? 'text-emerald-700' : 'text-rose-700'}`}>
                {teste.mensagem}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              {(form.modo === 'nvr' || form.modo === 'isup') && (
                <button
                  type="button"
                  onClick={() =>
                    testar(
                      form.modo === 'isup'
                        ? { modo: 'isup', isup_device_id: form.isup_device_id, isup_senha: form.isup_senha }
                        : form.nvr_ip
                          ? { nvr_ip: form.nvr_ip, porta_rtsp: Number(form.porta_rtsp) }
                          : { id: form.id },
                    )
                  }
                  className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 font-bold text-slate-700 flex items-center gap-2 cursor-pointer"
                >
                  <Wifi size={16} /> Testar Conexão
                </button>
              )}
              <button
                type="button"
                onClick={() => setForm(null)}
                className="flex-1 py-2.5 bg-slate-100 font-bold rounded-xl text-slate-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                disabled={ocupado}
                className="flex-[2] py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
              >
                {form.id ? 'Salvar Alterações' : 'Cadastrar Câmera'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal 1: Cadastrar / Editar NVR (IP/VPN ou ISUP 5.0) */}
      {formNvr && (
        <Modal
          titulo={
            <>
              <Server size={20} className="text-emerald-600" /> {formNvr.id ? 'Editar NVR' : 'Cadastrar NVR'}
            </>
          }
          borda="border-t-emerald-600"
          onFechar={() => setFormNvr(null)}
        >
          <form onSubmit={(e) => salvarNvr(e, true)} className="space-y-3">
            <p className="text-sm text-slate-500">
              Cadastre os dados do NVR/DVR (via IP/VPN ou Túnel ISUP 5.0). Em seguida, você poderá selecionar quais
              canais deseja visualizar no sistema.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormNvr({ ...formNvr, modo_conexao: 'ip' })}
                className={`py-2 px-3 rounded-xl text-xs font-bold border cursor-pointer ${
                  formNvr.modo_conexao === 'ip'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                🖧 Conexão por IP / VPN (RTSP)
              </button>
              <button
                type="button"
                onClick={() => setFormNvr({ ...formNvr, modo_conexao: 'isup' })}
                className={`py-2 px-3 rounded-xl text-xs font-bold border cursor-pointer ${
                  formNvr.modo_conexao === 'isup'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                🌐 Túnel Reverso ISUP 5.0 (Sem VPN)
              </button>
            </div>

            {formNvr.modo_conexao === 'isup' && isupConectados.length > 0 && (
              <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200">
                <label className="block text-xs font-bold text-indigo-800 mb-1.5">
                  Dispositivos ISUP 5.0 Conectados na Porta 7660 (clique para preencher):
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {isupConectados.map((d) => (
                    <button
                      key={d.device_id}
                      type="button"
                      onClick={() =>
                        setFormNvr({
                          ...formNvr,
                          ip: d.device_id,
                          nome: formNvr.nome || `NVR ${d.device_id}`,
                        })
                      }
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer ${
                        formNvr.ip.toUpperCase() === d.device_id.toUpperCase()
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-indigo-800 border-indigo-300 hover:bg-indigo-100'
                      }`}
                    >
                      {d.online ? '🟢' : '⚪'} {d.device_id} {d.ip_remoto ? `(${d.ip_remoto})` : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Nome / Identificação do NVR *</label>
                <input
                  required
                  value={formNvr.nome}
                  onChange={(e) => setFormNvr({ ...formNvr, nome: e.target.value })}
                  placeholder="Ex: NVR Portaria Principal"
                  className={inp}
                />
              </div>
              <div>
                <label className={lbl}>Localização Padrão</label>
                <input
                  value={formNvr.localizacao}
                  onChange={(e) => setFormNvr({ ...formNvr, localizacao: e.target.value })}
                  placeholder="Ex: Portaria / Área Comum"
                  className={inp}
                />
              </div>
            </div>

            {formNvr.modo_conexao === 'isup' ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className={lbl}>Device ID ISUP 5.0 do NVR *</label>
                  <input
                    required
                    value={formNvr.ip}
                    onChange={(e) => setFormNvr({ ...formNvr, ip: e.target.value })}
                    placeholder="Ex: NVRCONDOMINIO01"
                    className={`${inp} font-mono`}
                  />
                </div>
                <div>
                  <label className={lbl}>Total de Canais</label>
                  <select
                    value={formNvr.max_canais}
                    onChange={(e) => setFormNvr({ ...formNvr, max_canais: e.target.value })}
                    className={inp}
                  >
                    <option value="4">4 Canais</option>
                    <option value="8">8 Canais</option>
                    <option value="16">16 Canais</option>
                    <option value="32">32 Canais</option>
                    <option value="64">64 Canais</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-2">
                  <label className={lbl}>IP do NVR *</label>
                  <input
                    required
                    value={formNvr.ip}
                    onChange={(e) => setFormNvr({ ...formNvr, ip: e.target.value })}
                    placeholder="192.168.10.2"
                    className={`${inp} font-mono`}
                  />
                </div>
                <div>
                  <label className={lbl}>Porta HTTP</label>
                  <input
                    type="number"
                    value={formNvr.porta_http}
                    onChange={(e) => setFormNvr({ ...formNvr, porta_http: e.target.value })}
                    className={inp}
                  />
                </div>
                <div>
                  <label className={lbl}>Porta RTSP</label>
                  <input
                    type="number"
                    value={formNvr.porta_rtsp}
                    onChange={(e) => setFormNvr({ ...formNvr, porta_rtsp: e.target.value })}
                    className={inp}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={lbl}>Usuário *</label>
                <input
                  required
                  value={formNvr.usuario}
                  onChange={(e) => setFormNvr({ ...formNvr, usuario: e.target.value })}
                  className={inp}
                />
              </div>
              <div>
                <label className={lbl}>
                  {formNvr.modo_conexao === 'isup' ? 'Chave ISUP' : 'Senha'} {formNvr.id ? '' : '*'}
                </label>
                <input
                  required={!formNvr.id}
                  type="password"
                  autoComplete="new-password"
                  placeholder={
                    formNvr.id
                      ? '(manter atual)'
                      : formNvr.modo_conexao === 'isup'
                        ? 'Chave de criptografia ISUP'
                        : 'Senha do NVR'
                  }
                  value={formNvr.senha}
                  onChange={(e) => setFormNvr({ ...formNvr, senha: e.target.value })}
                  className={inp}
                />
              </div>
              {formNvr.modo_conexao === 'ip' && (
                <div>
                  <label className={lbl}>Total de Canais</label>
                  <select
                    value={formNvr.max_canais}
                    onChange={(e) => setFormNvr({ ...formNvr, max_canais: e.target.value })}
                    className={inp}
                  >
                    <option value="4">4 Canais</option>
                    <option value="8">8 Canais</option>
                    <option value="16">16 Canais</option>
                    <option value="32">32 Canais</option>
                    <option value="64">64 Canais</option>
                  </select>
                </div>
              )}
            </div>
            {teste && (
              <div className={`text-sm font-semibold ${teste.tipo === 'ok' ? 'text-emerald-700' : 'text-rose-700'}`}>
                {teste.mensagem}
              </div>
            )}
            <div className="flex gap-2 pt-2 flex-wrap">
              <button
                type="button"
                onClick={() =>
                  testar(
                    formNvr.modo_conexao === 'isup'
                      ? { modo: 'isup', isup_device_id: formNvr.ip, isup_senha: formNvr.senha }
                      : { nvr_ip: formNvr.ip, porta_rtsp: Number(formNvr.porta_rtsp) },
                  )
                }
                className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 font-bold text-slate-700 flex items-center gap-2 cursor-pointer"
              >
                <Wifi size={16} /> Testar Conexão
              </button>
              <button
                type="button"
                onClick={() => setFormNvr(null)}
                className="px-4 py-2.5 bg-slate-100 font-bold rounded-xl text-slate-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={ocupado}
                className="flex-1 py-2.5 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
              >
                {ocupado ? 'Salvando...' : 'Salvar e Selecionar Canais'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal 2: Selecionar Canais do NVR para Visualizar no Sistema */}
      {seletorNvr && (
        <Modal
          largura="max-w-3xl"
          titulo={
            <div className="flex items-center gap-2">
              <ListChecks size={20} className="text-blue-600" />
              <span>Selecionar Canais do NVR — {seletorNvr.nvr.nome}</span>
            </div>
          }
          borda="border-t-blue-600"
          onFechar={() => setSeletorNvr(null)}
        >
          {seletorNvr.carregando ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-500">
              <RefreshCw size={28} className="animate-spin text-blue-600" />
              <span className="font-semibold text-sm">Consultando canais disponíveis no NVR {seletorNvr.nvr.ip}...</span>
            </div>
          ) : (
            <form onSubmit={salvarCanaisSelecionados} className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="text-xs text-slate-600">
                  <span className="font-bold text-slate-800">
                    {seletorNvr.nvr.modo_conexao === 'isup' ? 'Device ID ISUP' : 'IP'}: {seletorNvr.nvr.ip}
                  </span>
                  {' · '}
                  {seletorNvr.conectou_isapi ? (
                    <span className="text-emerald-700 font-bold">
                      ✓ Canais sincronizados automaticamente com o NVR
                    </span>
                  ) : (
                    <span className="text-slate-500">
                      Exibindo lista de {seletorNvr.canais.length} canais do NVR
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => marcarCanaisEmLote('todos')}
                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    Marcar Todos
                  </button>
                  {seletorNvr.conectou_isapi && (
                    <button
                      type="button"
                      onClick={() => marcarCanaisEmLote('online')}
                      className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                    >
                      Apenas Canais Online
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => marcarCanaisEmLote('nenhum')}
                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    Desmarcar Todos
                  </button>
                </div>
              </div>

              <div className="max-h-[52vh] overflow-y-auto pr-1 grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {seletorNvr.canais.map((c) => (
                  <div
                    key={c.canal}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition ${
                      c.selecionado
                        ? 'bg-blue-50/70 border-blue-300 shadow-2xs'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => alternarCanal(c.canal)}
                      className={`shrink-0 cursor-pointer ${c.selecionado ? 'text-blue-600' : 'text-slate-400'}`}
                      title={c.selecionado ? 'Desmarcar canal' : 'Selecionar canal para visualização'}
                    >
                      {c.selecionado ? <CheckSquare size={22} /> : <Square size={22} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span
                          onClick={() => alternarCanal(c.canal)}
                          className="text-xs font-extrabold text-slate-700 cursor-pointer"
                        >
                          Canal {String(c.canal).padStart(2, '0')}
                        </span>
                        {c.online_nvr !== null && (
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              c.online_nvr
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {c.online_nvr ? 'ONLINE NO NVR' : 'OFFLINE'}
                          </span>
                        )}
                      </div>
                      <input
                        value={c.nome}
                        onChange={(e) => alterarNomeCanal(c.canal, e.target.value)}
                        placeholder={`Canal ${c.canal}`}
                        className="w-full px-2.5 py-1.5 text-sm font-semibold bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200">
                <span className="text-sm font-bold text-slate-600">
                  {qtdMarcados} de {seletorNvr.canais.length} canais selecionados para visualização
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSeletorNvr(null)}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 font-bold text-slate-700 hover:bg-slate-200 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={ocupado}
                    className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold disabled:opacity-60 cursor-pointer shadow-sm"
                  >
                    {ocupado ? 'Salvando...' : `Salvar Canais Selecionados (${qtdMarcados})`}
                  </button>
                </div>
              </div>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
