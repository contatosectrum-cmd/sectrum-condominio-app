import { useCallback, useEffect, useRef, useState } from 'react';
import {
  UserPlus, Camera, Upload, Pencil, Trash2, PauseCircle, PlayCircle, X, CheckCircle2, AlertCircle, Building2, ShieldCheck, RefreshCw, UsersRound, Share2, Smartphone,
} from 'lucide-react';
import { api, ErroApi } from '../../lib/api';
import ValidadorCpf from '../../components/ValidadorCpf';
import FotoUsuario from '../../components/FotoUsuario';

interface Dependente {
  id: number;
  nome: string;
  cpf: string;
  sem_cpf: boolean;
  telefone: string | null;
  relacao?: string;
  tipo_familiar?: 'adulto' | 'menor';
  tem_acesso_app?: boolean;
  parentesco: string;
  data_nascimento: string;
  observacao: string | null;
  ativo: boolean;
  tem_foto: boolean;
  criado_em: string | null;
}

interface InfoUnidade {
  unidade_num: string | null;
  bloco_nome: string | null;
  bloco_id: number | null;
}

interface InfoResponsavel {
  nome: string;
  cpf: string;
}

const PARENTESCOS_ADULTO = [
  'Esposo(a) / Cônjuge',
  'Companheiro(a)',
  'Pai / Mãe',
  'Filho(a) Maior de Idade',
  'Irmão(ã) / Familiar Adulto',
];

const PARENTESCOS_MENOR = [
  'Filho(a) Menor de Idade',
  'Enteado(a) Menor de Idade',
  'Neto(a) / Menor sob Guarda',
  'Irmão(ã) Menor / Dependente',
  'Dependente Familiar',
];

function mascaraCpf(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function mascaraTelefone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}

function redimensionarImagem(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const propCaixa = 3 / 4;
        const vw = img.width;
        const vh = img.height;
        let visW = vw;
        let visH = vh;
        let visX = 0;
        let visY = 0;
        if (vw / vh > propCaixa) {
          visW = Math.round(vh * propCaixa);
          visX = Math.round((vw - visW) / 2);
        } else {
          visH = Math.round(vw / propCaixa);
          visY = Math.round((vh - visH) / 2);
        }
        const canvas = document.createElement('canvas');
        canvas.width = 360;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Falha ao processar imagem.'));
          return;
        }
        ctx.drawImage(img, visX, visY, visW, visH, 0, 0, 360, 480);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('Imagem inválida.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo.'));
    reader.readAsDataURL(arquivo);
  });
}

export default function MoradorDependentes() {
  const [responsavel, setResponsavel] = useState<InfoResponsavel>({ nome: 'Morador', cpf: '' });
  const [unidade, setUnidade] = useState<InfoUnidade | null>(null);
  const [linkConjuge, setLinkConjuge] = useState<string>('');
  const [lista, setLista] = useState<Dependente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [versaoFoto, setVersaoFoto] = useState(1);

  // Estado do formulário ('adulto' = Cônjuge / Familiar Adulto com App + Facial | 'menor' = Filho/Dependente Menor só Facial)
  const [formAberto, setFormAberto] = useState(false);
  const [tipoFamiliar, setTipoFamiliar] = useState<'adulto' | 'menor'>('adulto');
  const [editId, setEditId] = useState<number | null>(null);
  const [nome, setNome] = useState('');
  const [parentesco, setParentesco] = useState(PARENTESCOS_ADULTO[0]);
  const [dataNascimento, setDataNascimento] = useState('');
  const [semCpf, setSemCpf] = useState(false);
  const [cpf, setCpf] = useState('');
  const [telefone, setTelefone] = useState('');
  const [fotoBase64, setFotoBase64] = useState<string>('');
  const [aceiteTermo, setAceiteTermo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [processandoId, setProcessandoId] = useState<number | null>(null);

  // Câmera (mesmo padrão com silhueta tracejada do rosto do Pré-Cadastro)
  const [cameraAtiva, setCameraAtiva] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputFileRef = useRef<HTMLInputElement | null>(null);

  const pararCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraAtiva(false);
  }, []);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{
        responsavel: InfoResponsavel;
        unidade: InfoUnidade;
        link_conjuge?: string;
        dependentes: Dependente[];
      }>('morador_dependentes');
      setResponsavel(r.responsavel);
      setUnidade(r.unidade);
      setLinkConjuge(r.link_conjuge || '');
      setLista(r.dependentes);
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e instanceof ErroApi ? e.message : 'Erro ao carregar familiares e dependentes.' });
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    return () => pararCamera();
  }, [carregar, pararCamera]);

  useEffect(() => {
    if (cameraAtiva && videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
      videoRef.current.play().catch(() => {});
    }
  }, [cameraAtiva]);

  const ligarCamera = async (modo: 'user' | 'environment' = cameraFacing) => {
    (document.activeElement as HTMLElement | null)?.blur();
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: modo, width: { ideal: 720 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = s;
      setCameraFacing(modo);
      setCameraAtiva(true);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play().catch(() => {});
      }
    } catch {
      alert('Permita o acesso à câmera para tirar a foto ou escolha uma foto da galeria.');
    }
  };

  const alternarCamera = () => {
    const novoModo = cameraFacing === 'user' ? 'environment' : 'user';
    ligarCamera(novoModo);
  };

  // Mesmo recorte da silhueta tracejada do Pré-Cadastro Externo (360x480 JPEG 0.82)
  const capturarRosto = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) {
      alert('Aguarde a imagem da câmera carregar antes de capturar.');
      return;
    }
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    const tmp = document.createElement('canvas');
    tmp.width = vw;
    tmp.height = vh;
    const tc = tmp.getContext('2d')!;
    if (cameraFacing === 'user') {
      tc.translate(vw, 0);
      tc.scale(-1, 1);
    }
    tc.drawImage(v, 0, 0);

    const propCaixa = 3 / 4;
    let visW = vw;
    let visH = vh;
    let visX = 0;
    let visY = 0;
    if (vw / vh > propCaixa) {
      visW = Math.round(vh * propCaixa);
      visX = Math.round((vw - visW) / 2);
    } else {
      visH = Math.round(vw / propCaixa);
      visY = Math.round((vh - visH) / 2);
    }

    const cx = visX + Math.round(visW * 0.08);
    const cy = visY + Math.round(visH * 0.06);
    const cw = Math.round(visW * 0.84);
    const ch = Math.round(visH * 0.84);

    const c = document.createElement('canvas');
    c.width = 360;
    c.height = 480;
    c.getContext('2d')!.drawImage(tmp, cx, cy, cw, ch, 0, 0, 360, 480);
    setFotoBase64(c.toDataURL('image/jpeg', 0.82));
    pararCamera();
  };

  const aoEscolherArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arq = e.target.files?.[0];
    if (!arq) return;
    try {
      const b64 = await redimensionarImagem(arq);
      setFotoBase64(b64);
      pararCamera();
    } catch (err) {
      alert((err as Error).message || 'Erro ao carregar foto.');
    } finally {
      e.target.value = '';
    }
  };

  const alternarModoTipo = (modo: 'adulto' | 'menor') => {
    setTipoFamiliar(modo);
    if (modo === 'adulto') {
      setSemCpf(false);
      if (!PARENTESCOS_ADULTO.includes(parentesco)) {
        setParentesco(PARENTESCOS_ADULTO[0]);
      }
    } else if (!PARENTESCOS_MENOR.includes(parentesco)) {
      setParentesco(PARENTESCOS_MENOR[0]);
    }
    setAceiteTermo(false);
  };

  const abrirNovo = (modo: 'adulto' | 'menor' = 'adulto') => {
    pararCamera();
    setEditId(null);
    setTipoFamiliar(modo);
    setNome('');
    setParentesco(modo === 'adulto' ? PARENTESCOS_ADULTO[0] : PARENTESCOS_MENOR[0]);
    setDataNascimento('');
    setSemCpf(false);
    setCpf('');
    setTelefone('');
    setFotoBase64('');
    setAceiteTermo(false);
    setFormAberto(true);
    setMsg(null);
  };

  const abrirEdicao = (d: Dependente) => {
    pararCamera();
    const modo: 'adulto' | 'menor' =
      d.tipo_familiar === 'adulto' || d.relacao === 'Conjuge' || d.tem_acesso_app || PARENTESCOS_ADULTO.includes(d.parentesco)
        ? 'adulto'
        : 'menor';
    const opcoes = modo === 'adulto' ? PARENTESCOS_ADULTO : PARENTESCOS_MENOR;
    setEditId(d.id);
    setTipoFamiliar(modo);
    setNome(d.nome);
    setParentesco(opcoes.includes(d.parentesco) ? d.parentesco : opcoes[0]);
    setDataNascimento(d.data_nascimento || '');
    setSemCpf(modo === 'menor' ? d.sem_cpf : false);
    setCpf(d.sem_cpf ? '' : mascaraCpf(d.cpf || ''));
    setTelefone(mascaraTelefone(d.telefone || ''));
    setFotoBase64('');
    setAceiteTermo(true);
    setFormAberto(true);
    setMsg(null);
  };

  const compartilharLinkConjuge = async () => {
    if (!linkConjuge) return;
    const textoShare = `💍 Olá! Acesse este link oficial para cadastrar sua foto facial e receber seu login próprio do nosso apartamento (${unidade?.bloco_nome ? `${unidade.bloco_nome} - ` : ''}Apto ${unidade?.unidade_num || ''}):\n\n${linkConjuge}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Cadastro de Cônjuge / Familiar', text: textoShare, url: linkConjuge });
        return;
      } catch {
        // segue para WhatsApp / cópia
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(textoShare)}`, '_blank', 'noopener,noreferrer');
  };

  const fecharForm = () => {
    pararCamera();
    setFormAberto(false);
    setEditId(null);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aceiteTermo) {
      setMsg({
        tipo: 'erro',
        texto:
          tipoFamiliar === 'adulto'
            ? 'Marque a confirmação da Declaração de Coabitação Familiar antes de salvar.'
            : 'Você precisa marcar a confirmação do Termo de Responsabilidade Parental antes de salvar.',
      });
      return;
    }
    setSalvando(true);
    setMsg(null);
    try {
      const r = await api<{ mensagem: string }>('morador_dependente_salvar', {
        corpo: {
          id: editId ?? 0,
          tipo_familiar: tipoFamiliar,
          nome,
          parentesco,
          data_nascimento: dataNascimento,
          sem_cpf: tipoFamiliar === 'menor' ? semCpf : false,
          cpf: tipoFamiliar === 'menor' && semCpf ? '' : cpf,
          telefone,
          foto_base64: fotoBase64,
          aceite_termo: aceiteTermo,
        },
      });
      setMsg({ tipo: 'ok', texto: r.mensagem });
      setVersaoFoto((v) => v + 1);
      fecharForm();
      await carregar();
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err instanceof ErroApi ? err.message : 'Erro ao salvar cadastro.' });
    } finally {
      setSalvando(false);
    }
  };

  const alternarStatus = async (d: Dependente) => {
    setProcessandoId(d.id);
    setMsg(null);
    try {
      const r = await api<{ mensagem: string }>('morador_dependente_status', { corpo: { id: d.id } });
      setMsg({ tipo: 'ok', texto: r.mensagem });
      await carregar();
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err instanceof ErroApi ? err.message : 'Erro ao alterar status.' });
    } finally {
      setProcessandoId(null);
    }
  };

  const excluir = async (d: Dependente) => {
    if (!window.confirm(`Deseja realmente remover "${d.nome}" do seu apartamento e revogar o acesso facial?`)) return;
    setProcessandoId(d.id);
    setMsg(null);
    try {
      const r = await api<{ mensagem: string }>('morador_dependente_excluir', { corpo: { id: d.id } });
      setMsg({ tipo: 'ok', texto: r.mensagem });
      await carregar();
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err instanceof ErroApi ? err.message : 'Erro ao remover familiar/dependente.' });
    } finally {
      setProcessandoId(null);
    }
  };

  if (carregando) {
    return <div className="p-10 text-center font-bold text-slate-400">Carregando família e dependentes...</div>;
  }

  const rotuloUnidade = `${unidade?.bloco_nome ? `${unidade.bloco_nome} • ` : ''}Unidade ${unidade?.unidade_num || '—'}`;
  const ehAdulto = tipoFamiliar === 'adulto';
  const opcoesParentesco = ehAdulto ? PARENTESCOS_ADULTO : PARENTESCOS_MENOR;

  return (
    <div className="max-w-[680px] mx-auto p-4 sm:p-5 space-y-5">
      {/* Cabeçalho */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
              <UsersRound size={24} />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">Minha Família, Cônjuge e Dependentes</h2>
              <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                <Building2 size={13} className="text-slate-400" />
                {rotuloUnidade} • Titular: {responsavel.nome}
              </p>
            </div>
          </div>
        </div>

        {!formAberto && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 border-t border-slate-100">
            <button
              type="button"
              onClick={() => abrirNovo('adulto')}
              className="px-4 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 shadow-sm cursor-pointer"
            >
              <UserPlus size={16} /> 💍 Cadastrar Cônjuge / Adulto
            </button>
            <button
              type="button"
              onClick={() => abrirNovo('menor')}
              className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 shadow-sm cursor-pointer"
            >
              <UserPlus size={16} /> 👶 Cadastrar Filho(a) Menor
            </button>
            {linkConjuge && (
              <button
                type="button"
                onClick={compartilharLinkConjuge}
                className="sm:col-span-2 px-4 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Share2 size={15} /> 📲 Enviar Link no WhatsApp para o Cônjuge Preencher no Celular Dele(a)
              </button>
            )}
          </div>
        )}
      </div>

      {msg && (
        <div
          className={`border-l-4 px-4 py-3 rounded-xl text-sm font-semibold flex items-center justify-between gap-3 ${
            msg.tipo === 'ok' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-rose-50 border-rose-500 text-rose-800'
          }`}
        >
          <span className="flex items-center gap-2">
            {msg.tipo === 'ok' ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
            {msg.texto}
          </span>
          <button type="button" onClick={() => setMsg(null)} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Formulário de Cadastro / Edição (Cônjuge/Adulto com App + Facial vs Filho Menor só Facial) */}
      {formAberto && (
        <form onSubmit={salvar} className="bg-white rounded-2xl border-2 border-violet-200 p-5 shadow-md space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-extrabold text-slate-900 text-base">
              {editId
                ? ehAdulto
                  ? '✏️ Editar Cônjuge / Familiar Adulto'
                  : '✏️ Editar Filho(a) / Dependente Menor'
                : ehAdulto
                  ? '💍 Cadastrar Cônjuge / Familiar Adulto (Com App + Facial)'
                  : '👶 Cadastrar Filho(a) / Dependente Menor (Só Facial)'}
            </h3>
            <button
              type="button"
              onClick={fecharForm}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X size={18} />
            </button>
          </div>

          {/* Seletor rápido de modalidade */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => alternarModoTipo('adulto')}
              className={`py-2 px-3 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                ehAdulto ? 'bg-white text-violet-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              💍 Cônjuge / Adulto (Com App)
            </button>
            <button
              type="button"
              onClick={() => alternarModoTipo('menor')}
              className={`py-2 px-3 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                !ehAdulto ? 'bg-white text-violet-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              👶 Filho(a) Menor (Só Facial)
            </button>
          </div>

          {ehAdulto && (
            <div className="bg-violet-50 border border-violet-200 rounded-xl px-3.5 py-2.5 text-xs text-violet-900 font-medium leading-relaxed">
              ✨ <strong>Acesso Individual Completo:</strong> seu cônjuge ou familiar adulto terá <strong>login próprio no aplicativo</strong> (CPF + senha inicial <code>mudar@123</code>), tocará o interfone no celular dele(a) e liberará o reconhecimento facial na hora!
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
                {ehAdulto ? 'Nome Completo do Cônjuge / Familiar *' : 'Nome Completo do Filho(a) *'}
              </label>
              <input
                required
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder={ehAdulto ? 'Nome completo do esposo(a) ou familiar adulto' : 'Nome completo do filho(a) ou dependente'}
                className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm outline-none focus:border-violet-600 bg-slate-50 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
                Vínculo / Parentesco *
              </label>
              <select
                value={parentesco}
                onChange={(e) => setParentesco(e.target.value)}
                className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white outline-none focus:border-violet-600 font-semibold text-slate-800"
              >
                {opcoesParentesco.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
                Data de Nascimento {!ehAdulto && '*'}
              </label>
              <input
                type="date"
                required={!ehAdulto}
                value={dataNascimento}
                onChange={(e) => setDataNascimento(e.target.value)}
                className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm outline-none focus:border-violet-600 bg-slate-50 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
                {ehAdulto ? 'CPF (Login no Aplicativo) *' : `CPF do Filho(a) ${!semCpf ? '*' : ''}`}
              </label>
              <input
                required={ehAdulto || !semCpf}
                disabled={!ehAdulto && semCpf}
                value={cpf}
                onChange={(e) => setCpf(mascaraCpf(e.target.value))}
                placeholder={!ehAdulto && semCpf ? 'Matrícula gerada automaticamente' : '000.000.000-00'}
                maxLength={14}
                inputMode="numeric"
                className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm outline-none focus:border-violet-600 bg-slate-50 focus:bg-white disabled:opacity-60"
              />
              {(ehAdulto || !semCpf) && <ValidadorCpf cpf={cpf} />}
              {!ehAdulto && (
                <label className="flex items-center gap-2 mt-1.5 text-xs text-slate-600 font-medium cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={semCpf}
                    onChange={(e) => {
                      setSemCpf(e.target.checked);
                      if (e.target.checked) setCpf('');
                    }}
                    className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                  />
                  <span>Menor ainda não possui CPF próprio</span>
                </label>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
                {ehAdulto ? 'WhatsApp Dele(a) (Envia Login Automaticamente)' : 'WhatsApp / Contato dos Pais'}
              </label>
              <input
                value={telefone}
                onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
                placeholder="(98) 98888-8888"
                maxLength={15}
                className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm outline-none focus:border-violet-600 bg-slate-50 focus:bg-white"
              />
            </div>
          </div>

          {/* Seção de Foto Facial com o Desenho/Silhueta do Rosto igual ao Pré-Cadastro */}
          <div className="border-t-2 border-slate-100 pt-4">
            <div className="text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-1">
              📷 Foto Facial (Reconhecimento na Portaria e Bloco)
            </div>
            <p className="text-xs text-slate-500 mb-3.5">
              {ehAdulto
                ? 'Posicione o rosto do cônjuge/familiar dentro da marcação oval tracejada (ou escolha uma selfie clara da galeria), sem boné ou óculos escuros.'
                : 'Posicione o rosto do seu filho(a) dentro da marcação oval tracejada em local bem iluminado, sem boné ou óculos escuros.'}
            </p>

            {/* Visor da câmera com o desenho oval tracejado do rosto (igual ao link de pré-cadastro) */}
            <div
              className={
                cameraAtiva
                  ? 'relative w-full max-w-[340px] mx-auto aspect-[3/4] bg-black rounded-2xl overflow-hidden mb-4 shadow-lg'
                  : 'hidden'
              }
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
                style={{ transform: cameraFacing === 'user' ? 'scaleX(-1)' : 'none' }}
              />
              <div className="absolute top-[12%] left-[12%] right-[12%] bottom-[22%] border-[3px] border-dashed border-white/80 rounded-[50%_50%_42%_42%] shadow-[0_0_0_9999px_rgba(0,0,0,0.52)] pointer-events-none" />
              <div className="absolute bottom-[7%] inset-x-0 text-white font-bold text-sm text-center [text-shadow:1px_1px_4px_rgba(0,0,0,.85)]">
                Alinhe o rosto no tracejado
              </div>
              <button
                type="button"
                onClick={alternarCamera}
                className="absolute top-3 right-3 bg-black/60 hover:bg-black/80 text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 backdrop-blur-xs cursor-pointer"
              >
                <RefreshCw size={13} /> Virar Câmera
              </button>
            </div>

            {fotoBase64 && !cameraAtiva && (
              <div className="text-center mb-4">
                <img
                  src={fotoBase64}
                  alt="Foto capturada"
                  className="w-full max-w-[220px] mx-auto aspect-[3/4] object-cover rounded-2xl border-[3px] border-emerald-500 shadow-md"
                />
                <span className="inline-block mt-2 text-xs font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                  ✓ Rosto enquadrado e pronto para as leitoras faciais
                </span>
              </div>
            )}

            <div className="flex flex-wrap gap-2.5 justify-center">
              {!cameraAtiva && !fotoBase64 && (
                <>
                  <button
                    type="button"
                    onClick={() => ligarCamera('user')}
                    className="flex-1 min-w-[180px] py-3.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold flex items-center justify-center gap-2 shadow cursor-pointer"
                  >
                    <Camera size={18} /> 📸 Ligar Câmera (Com Guia de Rosto)
                  </button>
                  <button
                    type="button"
                    onClick={() => inputFileRef.current?.click()}
                    className="py-3.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Upload size={17} /> Galeria
                  </button>
                </>
              )}

              {cameraAtiva && (
                <>
                  <button
                    type="button"
                    onClick={capturarRosto}
                    className="flex-1 min-w-[200px] py-3.5 px-5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-base font-extrabold shadow-md cursor-pointer"
                  >
                    📷 Capturar Rosto
                  </button>
                  <button
                    type="button"
                    onClick={pararCamera}
                    className="py-3.5 px-4 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-bold cursor-pointer"
                  >
                    Cancelar Câmera
                  </button>
                </>
              )}

              {fotoBase64 && !cameraAtiva && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setFotoBase64('');
                      ligarCamera(cameraFacing);
                    }}
                    className="py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold cursor-pointer"
                  >
                    🔄 Refazer Foto na Câmera
                  </button>
                  <button
                    type="button"
                    onClick={() => inputFileRef.current?.click()}
                    className="py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold cursor-pointer"
                  >
                    📁 Trocar por Foto da Galeria
                  </button>
                </>
              )}
              <input
                ref={inputFileRef}
                type="file"
                accept="image/*"
                onChange={aoEscolherArquivo}
                className="hidden"
              />
            </div>
          </div>

          {/* Declaração de Coabitação Familiar (Cônjuge/Adulto) OU Termo de Responsabilidade Parental (Menor) */}
          {ehAdulto ? (
            <div className="bg-violet-50/80 border-2 border-violet-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-violet-950 font-extrabold text-xs sm:text-sm uppercase tracking-wide">
                <ShieldCheck size={19} className="text-violet-700 shrink-0" />
                <span>Declaração de Coabitação e Vínculo Familiar</span>
              </div>
              <div className="text-xs text-slate-700 leading-relaxed bg-white border border-violet-200 rounded-xl p-3.5 space-y-1.5">
                <p>
                  Eu, <strong className="text-slate-900">{responsavel.nome}</strong>
                  {responsavel.cpf ? ` (CPF ${mascaraCpf(responsavel.cpf)})` : ''}, morador(a) responsável pela unidade{' '}
                  <strong className="text-slate-900">{rotuloUnidade}</strong>, declaro que{' '}
                  <strong className="text-violet-700">{nome.trim() || '[Nome do Cônjuge / Familiar]'}</strong> reside comigo
                  neste apartamento na qualidade de <strong>{parentesco}</strong>, autorizando a ativação de seu reconhecimento
                  facial e acesso individual ao aplicativo e interfone da unidade.
                </p>
              </div>
              <label className="flex items-start gap-3 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  required
                  checked={aceiteTermo}
                  onChange={(e) => setAceiteTermo(e.target.checked)}
                  className="mt-0.5 w-5 h-5 rounded border-violet-400 text-violet-600 focus:ring-violet-500 shrink-0 cursor-pointer"
                />
                <span className="text-xs sm:text-sm font-extrabold text-violet-950 leading-snug">
                  Confirmo a veracidade dos dados acima e autorizo o acesso residencial vinculado ao meu apartamento.
                </span>
              </label>
            </div>
          ) : (
            <div className="bg-amber-50/90 border-2 border-amber-300 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-amber-900 font-extrabold text-xs sm:text-sm uppercase tracking-wide">
                <ShieldCheck size={19} className="text-amber-700 shrink-0" />
                <span>Termo de Responsabilidade e Autorização Parental</span>
              </div>
              <div className="text-xs text-slate-700 leading-relaxed bg-white/90 border border-amber-200 rounded-xl p-3.5 space-y-1.5">
                <p>
                  Eu, <strong className="text-slate-900">{responsavel.nome}</strong>
                  {responsavel.cpf ? ` (CPF ${mascaraCpf(responsavel.cpf)})` : ''}, morador(a) responsável pelo apartamento{' '}
                  <strong className="text-slate-900">{rotuloUnidade}</strong>, declaro para todos os fins de direito que sou{' '}
                  <strong className="text-slate-900">pai, mãe ou responsável legal</strong> pelo(a) menor{' '}
                  <strong className="text-violet-700">{nome.trim() || '[Nome do Filho(a)]'}</strong> e, por meio deste ato:
                </p>
                <p>
                  <strong>1. Autorizo expressamente</strong> o cadastro e a coleta de sua biometria facial exclusivamente para
                  identificação e liberação de acesso nos terminais faciais da portaria e do nosso bloco (conforme Art. 14 da
                  LGPD — Lei nº 13.709/2018 e Estatuto da Criança e do Adolescente);
                </p>
                <p>
                  <strong>2. Assumo integral responsabilidade</strong> civil e condominial pela veracidade dos dados informados,
                  pela autorização de entrada/saída e pelos atos praticados pelo(a) menor nas dependências do condomínio.
                </p>
              </div>

              <label className="flex items-start gap-3 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  required
                  checked={aceiteTermo}
                  onChange={(e) => setAceiteTermo(e.target.checked)}
                  className="mt-0.5 w-5 h-5 rounded border-amber-400 text-violet-600 focus:ring-violet-500 shrink-0 cursor-pointer"
                />
                <span className="text-xs sm:text-sm font-extrabold text-amber-950 leading-snug">
                  Confirmo que sou o pai/mãe ou responsável legal, li e concordo com o Termo de Responsabilidade acima e
                  autorizo este cadastro vinculado ao meu apartamento.
                </span>
              </label>
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={fecharForm}
              className="px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando || !aceiteTermo}
              className="px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs sm:text-sm font-extrabold shadow-md disabled:opacity-50 cursor-pointer"
            >
              {salvando ? 'Salvando e sincronizando...' : ehAdulto ? '💍 Liberar Acesso e Facial' : '🛡️ Confirmar Responsabilidade e Salvar'}
            </button>
          </div>
        </form>
      )}

      {/* Lista de Familiares / Dependentes Cadastrados */}
      {lista.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-2">
          <div className="text-3xl">👨‍👩‍👧‍👦</div>
          <div className="text-base font-extrabold text-slate-800">
            Nenhum familiar ou dependente cadastrado no seu apartamento
          </div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Use os botões acima para cadastrar seu <strong>Cônjuge / Familiar Adulto</strong> (com acesso próprio ao aplicativo e interfone) ou <strong>Filhos Menores</strong> (reconhecimento facial).
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map((d) => {
            const ocupado = processandoId === d.id;
            return (
              <div
                key={d.id}
                className={`bg-white rounded-2xl border p-4 shadow-sm flex flex-wrap items-center justify-between gap-4 transition-opacity ${
                  d.ativo ? 'border-slate-200' : 'border-amber-200 bg-amber-50/30 opacity-80'
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-[220px] flex-1">
                  <FotoUsuario
                    rota={`morador_dependente_foto&id=${d.id}&v=${versaoFoto}`}
                    temFoto={d.tem_foto}
                    tamanho={58}
                    redonda
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-slate-900 text-sm truncate">{d.nome}</span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
                        {d.parentesco}
                      </span>
                      {d.tem_acesso_app && (
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 flex items-center gap-1">
                          <Smartphone size={11} /> App + Interfone
                        </span>
                      )}
                      {d.ativo ? (
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          ● Facial Ativo
                        </span>
                      ) : (
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                          ⏸ Acesso Pausado
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>{d.sem_cpf ? `Matrícula: ${d.cpf}` : `CPF: ${mascaraCpf(d.cpf || '')}`}</span>
                      {d.data_nascimento && (
                        <span>
                          Nasc.: {d.data_nascimento.split('-').reverse().join('/')}
                        </span>
                      )}
                      {!d.tem_foto && <span className="text-rose-600 font-bold">⚠️ Sem foto facial</span>}
                    </div>
                    {d.observacao && (
                      <div className="text-[11px] text-emerald-700 font-semibold mt-1 flex items-center gap-1">
                        <ShieldCheck size={13} className="shrink-0" />
                        <span className="truncate" title={d.observacao}>
                          Vinculado à unidade por {responsavel.nome}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 ml-auto">
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => abrirEdicao(d)}
                    title="Editar dados ou atualizar foto"
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Pencil size={13} /> Editar
                  </button>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => alternarStatus(d)}
                    title={d.ativo ? 'Pausar acesso facial' : 'Reativar acesso facial'}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer ${
                      d.ativo
                        ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    {d.ativo ? (
                      <>
                        <PauseCircle size={13} /> Pausar
                      </>
                    ) : (
                      <>
                        <PlayCircle size={13} /> Ativar
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => excluir(d)}
                    title="Remover cadastro"
                    className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
