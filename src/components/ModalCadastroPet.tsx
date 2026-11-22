import { useEffect, useRef, useState } from 'react';
import {
  Camera, ImagePlus, X, Check, ZoomIn, RotateCcw, Calendar,
  ShieldAlert, Sparkles, PawPrint,
} from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import {
  COMPORTAMENTOS_OPCOES,
  ESPECIES_OPCOES,
  PORTES_OPCOES,
  SUGESTOES_CORES_PELAGEM,
  calcularIdadeLegivelPet,
  resolverUrlFotoPet,
  type ComportamentoPet,
  type EspeciePet,
  type PetItem,
  type PortePet,
} from '../lib/petsUtils';

export interface UnidadeOpcaoPet {
  id: number;
  numero: string;
  bloco_id: number | null;
  bloco_nome: string | null;
}

interface Props {
  aberto: boolean;
  petEdicao: PetItem | null;
  modoGestao?: boolean;
  unidades?: UnidadeOpcaoPet[];
  onFechar: () => void;
  onSalvo: (mensagem: string, pet: PetItem | null) => void;
}

const CROP_VIEWPORT_PX = 260;

export default function ModalCadastroPet({
  aberto,
  petEdicao,
  modoGestao = false,
  unidades = [],
  onFechar,
  onSalvo,
}: Props) {
  // Campos do formulário
  const [unidadeId, setUnidadeId] = useState<string>('');
  const [buscaUnidade, setBuscaUnidade] = useState('');
  const [nome, setNome] = useState('');
  const [especie, setEspecie] = useState<EspeciePet>('Cachorro');
  const [raca, setRaca] = useState('');
  const [porte, setPorte] = useState<PortePet>('Pequeno');
  const [pelagemCor, setPelagemCor] = useState('');

  const [naoSeiDataExata, setNaoSeiDataExata] = useState(false);
  const [dataNascimento, setDataNascimento] = useState('');
  const [idadeAnosAprox, setIdadeAnosAprox] = useState<number>(1);
  const [idadeMesesAprox, setIdadeMesesAprox] = useState<number>(0);

  const [vacinaValidade, setVacinaValidade] = useState('');
  const [microchip, setMicrochip] = useState('');
  const [castrado, setCastrado] = useState(false);
  const [comportamento, setComportamento] = useState<ComportamentoPet>('Dócil');
  const [usaFocinheira, setUsaFocinheira] = useState(false);
  const [somenteElevadorServico, setSomenteElevadorServico] = useState(false);
  const [observacoes, setObservacoes] = useState('');

  // Foto final (Preview + Blob para upload multipart)
  const [previewFinal, setPreviewFinal] = useState<string | null>(null);
  const [arquivoRecortado, setArquivoRecortado] = useState<Blob | null>(null);
  const [fotoBase64Envio, setFotoBase64Envio] = useState<string | null>(null);

  // Estado do Editor de Recorte 1:1
  const [fonteBrutaCrop, setFonteBrutaCrop] = useState<string | null>(null);
  const [dimImagemBruta, setDimImagemBruta] = useState<{ w: number; h: number } | null>(null);
  const [cropZoom, setCropZoom] = useState<number>(1);
  const [cropOffset, setCropOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const arrastandoRef = useRef<{ ativo: boolean; iniX: number; iniY: number; origX: number; origY: number }>({
    ativo: false,
    iniX: 0,
    iniY: 0,
    origX: 0,
    origY: 0,
  });

  // Estado da Webcam ao vivo (para computadores/notebooks)
  const [webcamAberta, setWebcamAberta] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const inputCameraMobileRef = useRef<HTMLInputElement | null>(null);
  const inputGaleriaRef = useRef<HTMLInputElement | null>(null);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const pararWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setWebcamAberta(false);
  };

  useEffect(() => {
    if (!aberto) {
      pararWebcam();
      return;
    }
    setErro('');
    setArquivoRecortado(null);
    setFotoBase64Envio(null);
    setFonteBrutaCrop(null);
    setDimImagemBruta(null);

    if (petEdicao) {
      setUnidadeId(String(petEdicao.unidade_id));
      setBuscaUnidade('');
      setNome(petEdicao.nome);
      setEspecie(petEdicao.especie);
      setRaca(petEdicao.raca ?? '');
      setPorte(petEdicao.porte);
      setPelagemCor(petEdicao.pelagem_cor);

      if (petEdicao.data_nascimento) {
        setNaoSeiDataExata(false);
        setDataNascimento(petEdicao.data_nascimento.slice(0, 10));
        setIdadeAnosAprox(1);
        setIdadeMesesAprox(0);
      } else if (typeof petEdicao.idade_estimada_meses === 'number') {
        setNaoSeiDataExata(true);
        setDataNascimento('');
        setIdadeAnosAprox(Math.floor(petEdicao.idade_estimada_meses / 12));
        setIdadeMesesAprox(petEdicao.idade_estimada_meses % 12);
      } else {
        setNaoSeiDataExata(false);
        setDataNascimento('');
        setIdadeAnosAprox(1);
        setIdadeMesesAprox(0);
      }

      setVacinaValidade(petEdicao.vacina_antirrabica_validade ? petEdicao.vacina_antirrabica_validade.slice(0, 10) : '');
      setMicrochip(petEdicao.microchip ?? '');
      setCastrado(Boolean(petEdicao.castrado));
      setComportamento(petEdicao.comportamento || 'Dócil');
      setUsaFocinheira(Boolean(petEdicao.usa_focinheira));
      setSomenteElevadorServico(Boolean(petEdicao.somente_elevador_servico));
      setObservacoes(petEdicao.observacoes ?? '');
      setPreviewFinal(resolverUrlFotoPet(petEdicao.foto_url));
    } else {
      setUnidadeId('');
      setBuscaUnidade('');
      setNome('');
      setEspecie('Cachorro');
      setRaca('');
      setPorte('Pequeno');
      setPelagemCor('');
      setNaoSeiDataExata(false);
      setDataNascimento('');
      setIdadeAnosAprox(1);
      setIdadeMesesAprox(0);
      setVacinaValidade('');
      setMicrochip('');
      setCastrado(false);
      setComportamento('Dócil');
      setUsaFocinheira(false);
      setSomenteElevadorServico(false);
      setObservacoes('');
      setPreviewFinal(null);
    }
  }, [aberto, petEdicao]);

  useEffect(() => {
    return () => pararWebcam();
  }, []);

  if (!aberto) return null;

  // Abre uma imagem selecionada no recortador 1:1
  const iniciarCropComDataUrl = (dataUrl: string) => {
    const img = new Image();
    img.onload = () => {
      setDimImagemBruta({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
      setCropZoom(1);
      setCropOffset({ x: 0, y: 0 });
      setFonteBrutaCrop(dataUrl);
    };
    img.onerror = () => {
      setErro('Não foi possível carregar a imagem selecionada.');
    };
    img.src = dataUrl;
  };

  const aoSelecionarArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErro('Selecione um arquivo de imagem válido (JPG, PNG ou WebP).');
      return;
    }
    setErro('');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        iniciarCropComDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const acionarCameraInteligente = async () => {
    setErro('');
    const ehMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (ehMobile || !navigator.mediaDevices?.getUserMedia) {
      inputCameraMobileRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1080 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      setWebcamAberta(true);
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 60);
    } catch {
      inputCameraMobileRef.current?.click();
    }
  };

  const capturarFrameWebcam = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    const dataUrl = c.toDataURL('image/jpeg', 0.92);
    pararWebcam();
    iniciarCropComDataUrl(dataUrl);
  };

  // Cálculo da geometria de cobertura 1:1 no viewport de CROP_VIEWPORT_PX
  const calcularGeometriaCrop = (zoom = cropZoom, offset = cropOffset) => {
    if (!dimImagemBruta) {
      return { dispW: CROP_VIEWPORT_PX, dispH: CROP_VIEWPORT_PX, clampedX: 0, clampedY: 0, baseScale: 1 };
    }
    const baseScale = Math.max(CROP_VIEWPORT_PX / dimImagemBruta.w, CROP_VIEWPORT_PX / dimImagemBruta.h);
    const dispW = dimImagemBruta.w * baseScale * zoom;
    const dispH = dimImagemBruta.h * baseScale * zoom;
    const maxOffsetX = Math.max(0, (dispW - CROP_VIEWPORT_PX) / 2);
    const maxOffsetY = Math.max(0, (dispH - CROP_VIEWPORT_PX) / 2);
    const clampedX = Math.max(-maxOffsetX, Math.min(maxOffsetX, offset.x));
    const clampedY = Math.max(-maxOffsetY, Math.min(maxOffsetY, offset.y));
    return { dispW, dispH, clampedX, clampedY, baseScale };
  };

  const confirmarRecorteQuadrado = () => {
    if (!fonteBrutaCrop || !dimImagemBruta) return;
    const img = new Image();
    img.onload = () => {
      const { baseScale, clampedX, clampedY } = calcularGeometriaCrop();
      const escalaEfetiva = baseScale * cropZoom;
      const imgLeft = (CROP_VIEWPORT_PX - dimImagemBruta.w * escalaEfetiva) / 2 + clampedX;
      const imgTop = (CROP_VIEWPORT_PX - dimImagemBruta.h * escalaEfetiva) / 2 + clampedY;

      const srcX = Math.max(0, -imgLeft / escalaEfetiva);
      const srcY = Math.max(0, -imgTop / escalaEfetiva);
      const srcSize = Math.min(
        dimImagemBruta.w - srcX,
        dimImagemBruta.h - srcY,
        CROP_VIEWPORT_PX / escalaEfetiva,
      );

      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 800;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 800, 800);
      ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, 800, 800);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
      setPreviewFinal(dataUrl);
      setFotoBase64Envio(dataUrl);
      canvas.toBlob(
        (blob) => {
          if (blob) setArquivoRecortado(blob);
        },
        'image/jpeg',
        0.86,
      );
      setFonteBrutaCrop(null);
    };
    img.src = fonteBrutaCrop;
  };

  const geom = calcularGeometriaCrop();

  const mesesEstimadosCalculados = idadeAnosAprox * 12 + idadeMesesAprox;
  const textoIdadePreview = naoSeiDataExata
    ? calcularIdadeLegivelPet(null, mesesEstimadosCalculados)
    : dataNascimento
      ? calcularIdadeLegivelPet(dataNascimento, null)
      : null;

  const unidadesFiltradas = modoGestao
    ? unidades.filter((u) => {
        if (!buscaUnidade.trim()) return true;
        const termo = buscaUnidade.toLowerCase();
        const lbl = `${u.bloco_nome ?? ''} ${u.numero}`.toLowerCase();
        return lbl.includes(termo);
      })
    : [];

  const submeterFormulario = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');

    if (!previewFinal) {
      setErro('Adicione e recorte uma foto 1:1 do pet para identificação visual.');
      return;
    }
    if (!nome.trim()) {
      setErro('Informe o nome do pet.');
      return;
    }
    if (!pelagemCor.trim()) {
      setErro('Informe a cor / pelagem do pet.');
      return;
    }
    if (modoGestao && !unidadeId) {
      setErro('Selecione a unidade (apartamento/lote) responsável pelo pet.');
      return;
    }

    setSalvando(true);
    try {
      const fd = new FormData();
      if (petEdicao) {
        fd.append('id', String(petEdicao.id));
      }
      if (modoGestao && unidadeId) {
        fd.append('unidade_id', unidadeId);
      }
      fd.append('nome', nome.trim());
      fd.append('especie', especie);
      fd.append('raca', raca.trim());
      fd.append('porte', porte);
      fd.append('pelagem_cor', pelagemCor.trim());

      if (naoSeiDataExata) {
        fd.append('data_nascimento', '');
        fd.append('idade_estimada_meses', String(mesesEstimadosCalculados));
      } else {
        fd.append('data_nascimento', dataNascimento);
        fd.append('idade_estimada_meses', '');
      }

      fd.append('vacina_antirrabica_validade', vacinaValidade);
      fd.append('microchip', microchip.trim());
      fd.append('castrado', castrado ? '1' : '0');
      fd.append('comportamento', comportamento);
      fd.append('usa_focinheira', usaFocinheira ? '1' : '0');
      fd.append('somente_elevador_servico', somenteElevadorServico ? '1' : '0');
      fd.append('observacoes', observacoes.trim());

      if (arquivoRecortado) {
        fd.append('foto', arquivoRecortado, 'pet_800x800.jpg');
      } else if (fotoBase64Envio) {
        fd.append('foto_base64', fotoBase64Envio);
      }

      const rotaAlvo = petEdicao ? 'pets_atualizar' : 'pets_criar';
      const resp = await api<{ mensagem: string; pet: PetItem | null }>(rotaAlvo, {
        metodo: 'POST',
        query: petEdicao ? { id: petEdicao.id } : undefined,
        corpo: fd,
      });

      window.dispatchEvent(new CustomEvent('sectrum:pets-atualizados'));
      onSalvo(resp.mensagem, resp.pet ?? null);
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : 'Erro ao salvar os dados do pet.');
    } finally {
      setSalvando(false);
    }
  };

  const rotuloCls = 'block text-xs font-extrabold uppercase tracking-wide text-slate-600 mb-1.5';
  const inputCls =
    'w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-800 text-sm outline-none focus:border-blue-600 focus:bg-white transition';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-3xl rounded-t-3xl shadow-2xl border border-slate-200 max-h-[94vh] flex flex-col overflow-hidden">
        {/* Cabeçalho */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600 text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <PawPrint size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold leading-tight">
                {petEdicao ? `Editar Pet — ${petEdicao.nome}` : 'Cadastrar Novo Pet'}
              </h2>
              <p className="text-[11px] text-blue-100">
                Identificação visual para portaria, câmeras CFTV e regras do condomínio
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center cursor-pointer"
            aria-label="Fechar modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Corpo com rolagem */}
        <form onSubmit={submeterFormulario} className="overflow-y-auto p-5 sm:p-6 space-y-6">
          {erro && (
            <div className="bg-rose-50 border-l-4 border-rose-500 text-rose-800 px-4 py-3 rounded-xl text-sm font-semibold flex items-center justify-between gap-2">
              <span>{erro}</span>
              <button type="button" onClick={() => setErro('')} className="cursor-pointer">
                <X size={16} />
              </button>
            </div>
          )}

          {/* inputs nativos ocultos */}
          <input
            ref={inputCameraMobileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={aoSelecionarArquivo}
          />
          <input
            ref={inputGaleriaRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={aoSelecionarArquivo}
          />

          {/* 1. FOTO COM PREVIEW E RECORTE 1:1 */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
            <label className={rotuloCls}>Foto de Identificação do Pet (1:1) *</label>

            {webcamAberta ? (
              <div className="flex flex-col items-center gap-3">
                <div className="relative w-[260px] h-[260px] rounded-2xl overflow-hidden bg-black border-2 border-blue-500 shadow-md">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={capturarFrameWebcam}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Camera size={15} /> Capturar Foto
                  </button>
                  <button
                    type="button"
                    onClick={pararWebcam}
                    className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : fonteBrutaCrop ? (
              <div className="flex flex-col items-center gap-3">
                <p className="text-xs text-slate-600 font-semibold text-center">
                  Arraste a imagem para enquadrar o pet no quadrado 1:1:
                </p>
                <div
                  className="relative rounded-2xl overflow-hidden bg-slate-900 border-2 border-blue-600 shadow-inner touch-none select-none cursor-grab active:cursor-grabbing"
                  style={{ width: CROP_VIEWPORT_PX, height: CROP_VIEWPORT_PX }}
                  onPointerDown={(ev) => {
                    ev.currentTarget.setPointerCapture(ev.pointerId);
                    arrastandoRef.current = {
                      ativo: true,
                      iniX: ev.clientX,
                      iniY: ev.clientY,
                      origX: geom.clampedX,
                      origY: geom.clampedY,
                    };
                  }}
                  onPointerMove={(ev) => {
                    if (!arrastandoRef.current.ativo) return;
                    const dx = ev.clientX - arrastandoRef.current.iniX;
                    const dy = ev.clientY - arrastandoRef.current.iniY;
                    setCropOffset({
                      x: arrastandoRef.current.origX + dx,
                      y: arrastandoRef.current.origY + dy,
                    });
                  }}
                  onPointerUp={() => {
                    arrastandoRef.current.ativo = false;
                  }}
                  onPointerCancel={() => {
                    arrastandoRef.current.ativo = false;
                  }}
                >
                  <img
                    src={fonteBrutaCrop}
                    alt="Recorte 1:1"
                    draggable={false}
                    className="max-w-none pointer-events-none select-none"
                    style={{
                      width: geom.dispW,
                      height: geom.dispH,
                      position: 'absolute',
                      left: (CROP_VIEWPORT_PX - geom.dispW) / 2 + geom.clampedX,
                      top: (CROP_VIEWPORT_PX - geom.dispH) / 2 + geom.clampedY,
                    }}
                  />
                  {/* Grade guia 3x3 */}
                  <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3">
                    {Array.from({ length: 9 }).map((_, idx) => (
                      <div key={idx} className="border border-white/25" />
                    ))}
                  </div>
                </div>

                {/* Controle de Zoom */}
                <div className="flex items-center gap-2.5 w-full max-w-[260px]">
                  <ZoomIn size={16} className="text-slate-500 shrink-0" />
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.05}
                    value={cropZoom}
                    onChange={(e) => setCropZoom(Number(e.target.value))}
                    className="w-full accent-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCropZoom(1);
                      setCropOffset({ x: 0, y: 0 });
                    }}
                    title="Centralizar"
                    className="p-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 cursor-pointer"
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>

                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={confirmarRecorteQuadrado}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <Check size={16} /> Confirmar Recorte 1:1
                  </button>
                  <button
                    type="button"
                    onClick={() => setFonteBrutaCrop(null)}
                    className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="w-28 h-28 rounded-2xl border-2 border-dashed border-slate-300 bg-white overflow-hidden flex items-center justify-center shrink-0 shadow-xs">
                  {previewFinal ? (
                    <img src={previewFinal} alt="Preview do Pet" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center text-slate-400 p-2">
                      <PawPrint size={28} className="mx-auto mb-1 opacity-60" />
                      <span className="text-[10px] font-bold uppercase block">Sem Foto</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-2.5 w-full">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={acionarCameraInteligente}
                      className="px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                    >
                      <Camera size={16} /> Tirar Foto (Câmera)
                    </button>
                    <button
                      type="button"
                      onClick={() => inputGaleriaRef.current?.click()}
                      className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <ImagePlus size={16} /> Escolher da Galeria
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Dica: Enquadre bem o pet para facilitar a identificação imediata pela Portaria nas câmeras em caso de fuga.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* SELEÇÃO DE UNIDADE (somente quando aberto por Síndico/Portaria) */}
          {modoGestao && (
            <div className="bg-blue-50/60 border border-blue-200 rounded-2xl p-4 space-y-2">
              <label className={rotuloCls}>Unidade Responsável (Bloco / Apartamento) *</label>
              <input
                type="text"
                placeholder="Filtrar bloco ou número do apartamento..."
                value={buscaUnidade}
                onChange={(e) => setBuscaUnidade(e.target.value)}
                className={inputCls}
              />
              <select
                required
                value={unidadeId}
                onChange={(e) => setUnidadeId(e.target.value)}
                className={inputCls}
              >
                <option value="">— Selecione a unidade do tutor —</option>
                {unidadesFiltradas.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.bloco_nome ? `${u.bloco_nome} - Unid. ${u.numero}` : `Unid. ${u.numero}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 2. DADOS OBRIGATÓRIOS DE IDENTIFICAÇÃO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={rotuloCls}>Nome do Pet *</label>
              <input
                type="text"
                required
                maxLength={100}
                placeholder="Ex: Thor, Mel, Luna..."
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={rotuloCls}>Raça (Opcional)</label>
              <input
                type="text"
                maxLength={100}
                placeholder="Ex: SRD (Vira-lata), Shih Tzu, Siamês..."
                value={raca}
                onChange={(e) => setRaca(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Espécie */}
          <div>
            <label className={rotuloCls}>Espécie *</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ESPECIES_OPCOES.map((op) => {
                const ativo = especie === op.valor;
                return (
                  <button
                    key={op.valor}
                    type="button"
                    onClick={() => setEspecie(op.valor)}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      ativo
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-base">{op.emoji}</span>
                    <span>{op.rotulo}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Porte */}
          <div>
            <label className={rotuloCls}>Porte *</label>
            <div className="grid grid-cols-3 gap-2">
              {PORTES_OPCOES.map((op) => {
                const ativo = porte === op.valor;
                return (
                  <button
                    key={op.valor}
                    type="button"
                    onClick={() => setPorte(op.valor)}
                    className={`py-2.5 px-3 rounded-xl border text-center transition cursor-pointer ${
                      ativo
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="text-xs font-extrabold">{op.rotulo}</div>
                    <div className={`text-[10px] ${ativo ? 'text-indigo-100' : 'text-slate-400'}`}>{op.dica}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cor / Pelagem */}
          <div>
            <label className={rotuloCls}>Cor / Pelagem (Filtro Visual das Câmeras) *</label>
            <input
              type="text"
              required
              maxLength={100}
              placeholder="Ex: Caramelo com patas brancas, Preto, Rajado cinza..."
              value={pelagemCor}
              onChange={(e) => setPelagemCor(e.target.value)}
              className={inputCls}
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {SUGESTOES_CORES_PELAGEM.map((corSug) => (
                <button
                  key={corSug}
                  type="button"
                  onClick={() => setPelagemCor(corSug)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition cursor-pointer ${
                    pelagemCor.toLowerCase() === corSug.toLowerCase()
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  {corSug}
                </button>
              ))}
            </div>
          </div>

          {/* 3. IDADE / DATA DE NASCIMENTO */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-extrabold uppercase tracking-wide text-slate-700 flex items-center gap-1.5">
                <Calendar size={15} className="text-blue-600" /> Data de Nascimento / Idade
              </label>

              <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={naoSeiDataExata}
                  onChange={(e) => setNaoSeiDataExata(e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-600"
                />
                <span>Não sei a data exata</span>
              </label>
            </div>

            {!naoSeiDataExata ? (
              <div>
                <input
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  value={dataNascimento}
                  onChange={(e) => setDataNascimento(e.target.value)}
                  className={inputCls}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="block text-[11px] font-bold text-slate-500 mb-1">Anos aproximados</span>
                  <select
                    value={idadeAnosAprox}
                    onChange={(e) => setIdadeAnosAprox(Number(e.target.value))}
                    className={inputCls}
                  >
                    {Array.from({ length: 26 }).map((_, a) => (
                      <option key={a} value={a}>
                        {a} {a === 1 ? 'ano' : 'anos'}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className="block text-[11px] font-bold text-slate-500 mb-1">Meses adicionais</span>
                  <select
                    value={idadeMesesAprox}
                    onChange={(e) => setIdadeMesesAprox(Number(e.target.value))}
                    className={inputCls}
                  >
                    {Array.from({ length: 12 }).map((_, m) => (
                      <option key={m} value={m}>
                        {m} {m === 1 ? 'mês' : 'meses'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {textoIdadePreview && (
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full">
                <Sparkles size={13} /> Idade exibida no perfil: {textoIdadePreview}
              </div>
            )}
          </div>

          {/* 4. SAÚDE & REGRAS CONDOMINIAIS */}
          <div className="border border-slate-200 rounded-2xl p-4 space-y-4">
            <div className="text-xs font-extrabold uppercase tracking-wide text-slate-700 flex items-center gap-1.5">
              <ShieldAlert size={15} className="text-emerald-600" /> Saúde & Regras Condominiais
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={rotuloCls}>Validade da Vacina Antirrábica</label>
                <input
                  type="date"
                  value={vacinaValidade}
                  onChange={(e) => setVacinaValidade(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={rotuloCls}>Nº do Microchip (Opcional)</label>
                <input
                  type="text"
                  maxLength={50}
                  placeholder="Ex: 985112000123456"
                  value={microchip}
                  onChange={(e) => setMicrochip(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <div>
                <label className={rotuloCls}>Comportamento</label>
                <select
                  value={comportamento}
                  onChange={(e) => setComportamento(e.target.value as ComportamentoPet)}
                  className={inputCls}
                >
                  {COMPORTAMENTOS_OPCOES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Toggle Castrado */}
              <button
                type="button"
                onClick={() => setCastrado((v) => !v)}
                className={`w-full px-4 py-2.5 rounded-xl border flex items-center justify-between text-sm font-bold transition cursor-pointer ${
                  castrado
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
                    : 'bg-slate-50 border-slate-300 text-slate-700'
                }`}
              >
                <span>Pet Castrado</span>
                <span
                  className={`w-10 h-6 rounded-full p-0.5 transition flex items-center ${
                    castrado ? 'bg-emerald-600 justify-end' : 'bg-slate-300 justify-start'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-white shadow-xs" />
                </span>
              </button>
            </div>

            {/* Checkboxes de Regras */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={usaFocinheira}
                  onChange={(e) => setUsaFocinheira(e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-600"
                />
                <span className="text-xs font-bold text-slate-700">Usa focinheira nas áreas comuns</span>
              </label>

              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={somenteElevadorServico}
                  onChange={(e) => setSomenteElevadorServico(e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-600"
                />
                <span className="text-xs font-bold text-slate-700">Somente elevador de serviço</span>
              </label>
            </div>

            <div>
              <label className={rotuloCls}>Observações / Sinais Particulares</label>
              <textarea
                rows={2}
                maxLength={2000}
                placeholder="Ex: Usa coleira azul com plaquinha, tem medo de fogos, alergia alimentar..."
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Rodapé de Ação */}
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onFechar}
              disabled={salvando}
              className="px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando || Boolean(fonteBrutaCrop)}
              className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-extrabold shadow-md disabled:opacity-60 cursor-pointer"
            >
              {salvando ? '⏳ Salvando pet...' : petEdicao ? 'Salvar Alterações' : 'Cadastrar Pet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
