import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Users, UserPlus, Camera, Upload, Pencil, Trash2, PauseCircle, PlayCircle, X, CheckCircle2, AlertCircle, Building2,
} from 'lucide-react';
import { api, ErroApi } from '../../lib/api';
import ValidadorCpf from '../../components/ValidadorCpf';
import FotoUsuario from '../../components/FotoUsuario';

interface Funcionario {
  id: number;
  nome: string;
  cpf: string;
  telefone: string | null;
  funcao: string;
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

const FUNCOES = [
  'Secretária do Lar / Doméstica',
  'Diarista',
  'Babá',
  'Cuidador(a)',
  'Motorista Particular',
  'Cozinheiro(a)',
  'Funcionário(a) da Unidade',
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
        canvas.width = 480;
        canvas.height = 640;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Falha ao processar imagem.'));
          return;
        }
        ctx.drawImage(img, visX, visY, visW, visH, 0, 0, 480, 640);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('Imagem inválida.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo.'));
    reader.readAsDataURL(arquivo);
  });
}

export default function MoradorFuncionarios() {
  const [unidade, setUnidade] = useState<InfoUnidade | null>(null);
  const [lista, setLista] = useState<Funcionario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [versaoFoto, setVersaoFoto] = useState(1);

  // Estado do formulário (novo ou edição)
  const [formAberto, setFormAberto] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [telefone, setTelefone] = useState('');
  const [funcao, setFuncao] = useState(FUNCOES[0]);
  const [fotoBase64, setFotoBase64] = useState<string>('');
  const [salvando, setSalvando] = useState(false);
  const [processandoId, setProcessandoId] = useState<number | null>(null);

  // Câmera (com guia oval tracejada do rosto igual ao Pré-Cadastro)
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
      const r = await api<{ unidade: InfoUnidade; funcionarios: Funcionario[] }>('morador_funcionarios');
      setUnidade(r.unidade);
      setLista(r.funcionarios);
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e instanceof ErroApi ? e.message : 'Erro ao carregar funcionários.' });
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

  const abrirNovo = () => {
    pararCamera();
    setEditId(null);
    setNome('');
    setCpf('');
    setTelefone('');
    setFuncao(FUNCOES[0]);
    setFotoBase64('');
    setFormAberto(true);
    setMsg(null);
  };

  const abrirEdicao = (f: Funcionario) => {
    pararCamera();
    setEditId(f.id);
    setNome(f.nome);
    setCpf(mascaraCpf(f.cpf || ''));
    setTelefone(mascaraTelefone(f.telefone || ''));
    setFuncao(FUNCOES.includes(f.funcao) ? f.funcao : FUNCOES[0]);
    setFotoBase64('');
    setFormAberto(true);
    setMsg(null);
  };

  const fecharForm = () => {
    pararCamera();
    setFormAberto(false);
    setEditId(null);
  };

  const iniciarCamera = async (modo: 'user' | 'environment' = cameraFacing) => {
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: modo, width: { ideal: 720 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraFacing(modo);
      setCameraAtiva(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch {
      alert('Não foi possível acessar a câmera. Você também pode enviar uma foto da galeria.');
    }
  };

  const capturarFotoCamera = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) return;
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

    const canvas = document.createElement('canvas');
    canvas.width = 360;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(tmp, cx, cy, cw, ch, 0, 0, 360, 480);
    setFotoBase64(canvas.toDataURL('image/jpeg', 0.82));
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

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setMsg(null);
    try {
      const r = await api<{ mensagem: string }>('morador_funcionario_salvar', {
        corpo: {
          id: editId ?? 0,
          nome,
          cpf,
          telefone,
          funcao,
          foto_base64: fotoBase64,
        },
      });
      setMsg({ tipo: 'ok', texto: r.mensagem });
      setVersaoFoto((v) => v + 1);
      fecharForm();
      await carregar();
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err instanceof ErroApi ? err.message : 'Erro ao salvar funcionário.' });
    } finally {
      setSalvando(false);
    }
  };

  const alternarStatus = async (f: Funcionario) => {
    setProcessandoId(f.id);
    setMsg(null);
    try {
      const r = await api<{ mensagem: string }>('morador_funcionario_status', { corpo: { id: f.id } });
      setMsg({ tipo: 'ok', texto: r.mensagem });
      await carregar();
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err instanceof ErroApi ? err.message : 'Erro ao alterar status.' });
    } finally {
      setProcessandoId(null);
    }
  };

  const excluir = async (f: Funcionario) => {
    if (!window.confirm(`Deseja realmente remover "${f.nome}" do seu apartamento e bloquear o acesso facial?`)) return;
    setProcessandoId(f.id);
    setMsg(null);
    try {
      const r = await api<{ mensagem: string }>('morador_funcionario_excluir', { corpo: { id: f.id } });
      setMsg({ tipo: 'ok', texto: r.mensagem });
      await carregar();
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err instanceof ErroApi ? err.message : 'Erro ao remover funcionário.' });
    } finally {
      setProcessandoId(null);
    }
  };

  if (carregando) {
    return <div className="p-10 text-center font-bold text-slate-400">Carregando funcionários do apartamento...</div>;
  }

  return (
    <div className="max-w-[680px] mx-auto p-5 space-y-5">
      {/* Cabeçalho da Unidade */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
            <Users size={24} />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Funcionários do Meu Apartamento</h2>
            <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
              <Building2 size={13} className="text-slate-400" />
              {unidade?.bloco_nome ? `${unidade.bloco_nome} • ` : ''}
              Unidade {unidade?.unidade_num || '—'} • Acesso liberado na Portaria e no seu Bloco
            </p>
          </div>
        </div>

        {!formAberto && (
          <button
            type="button"
            onClick={abrirNovo}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <UserPlus size={16} /> Cadastrar Funcionário
          </button>
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

      {/* Formulário de Cadastro / Edição */}
      {formAberto && (
        <form onSubmit={salvar} className="bg-white rounded-2xl border-2 border-blue-200 p-5 shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-extrabold text-slate-900 text-base">
              {editId ? '✏️ Editar Funcionário do Apartamento' : '➕ Novo Funcionário do Apartamento'}
            </h3>
            <button
              type="button"
              onClick={fecharForm}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-600 mb-1">Nome Completo *</label>
              <input
                required
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Maria das Graças Silva"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">CPF *</label>
              <input
                required
                value={cpf}
                onChange={(e) => setCpf(mascaraCpf(e.target.value))}
                placeholder="000.000.000-00"
                maxLength={14}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm outline-none focus:border-blue-500"
              />
              <ValidadorCpf cpf={cpf} />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Telefone / WhatsApp</label>
              <input
                value={telefone}
                onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
                placeholder="(00) 00000-0000"
                maxLength={15}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-600 mb-1">Função no Apartamento *</label>
              <select
                value={funcao}
                onChange={(e) => setFuncao(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm bg-white outline-none focus:border-blue-500 font-semibold text-slate-800"
              >
                {FUNCOES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Captura ou Upload de Foto Facial com Guia Oval do Rosto */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="text-xs font-extrabold text-slate-800">📷 Foto Facial (Reconhecimento)</div>
                <div className="text-[11px] text-slate-500">
                  Posicione o rosto dentro da marcação oval tracejada em local iluminado.
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => (cameraAtiva ? pararCamera() : iniciarCamera(cameraFacing))}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Camera size={14} /> {cameraAtiva ? 'Fechar Câmera' : 'Tirar Foto'}
                </button>
                <button
                  type="button"
                  onClick={() => inputFileRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload size={14} /> Escolher da Galeria
                </button>
                <input
                  ref={inputFileRef}
                  type="file"
                  accept="image/*"
                  onChange={aoEscolherArquivo}
                  className="hidden"
                />
              </div>
            </div>

            <div
              className={
                cameraAtiva
                  ? 'relative w-full max-w-[320px] mx-auto aspect-[3/4] bg-black rounded-2xl overflow-hidden shadow-lg'
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
              <div className="absolute bottom-[7%] inset-x-0 text-white font-bold text-xs sm:text-sm text-center [text-shadow:1px_1px_4px_rgba(0,0,0,.85)]">
                Alinhe o rosto no tracejado
              </div>
              <button
                type="button"
                onClick={() => iniciarCamera(cameraFacing === 'user' ? 'environment' : 'user')}
                className="absolute top-3 right-3 bg-black/60 hover:bg-black/80 text-white text-xs font-bold px-3 py-1.5 rounded-full backdrop-blur-xs cursor-pointer"
              >
                🔄 Virar Câmera
              </button>
            </div>

            {cameraAtiva && (
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={capturarFotoCamera}
                  className="w-full max-w-[320px] py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-extrabold shadow cursor-pointer"
                >
                  📷 Capturar Rosto
                </button>
              </div>
            )}

            {fotoBase64 && !cameraAtiva && (
              <div className="flex items-center gap-3 pt-1">
                <img
                  src={fotoBase64}
                  alt="Prévia"
                  className="w-20 h-28 object-cover rounded-xl border-2 border-emerald-500 shadow-xs"
                />
                <div className="text-xs text-emerald-700 font-bold">
                  ✓ Nova foto pronta para sincronizar com o leitor facial.
                  <button
                    type="button"
                    onClick={() => setFotoBase64('')}
                    className="block text-rose-600 hover:underline mt-1 font-semibold"
                  >
                    Remover seleção
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={fecharForm}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm disabled:opacity-60 cursor-pointer"
            >
              {salvando ? 'Salvando e sincronizando...' : 'Salvar e Liberar Acesso'}
            </button>
          </div>
        </form>
      )}

      {/* Lista de Funcionários da Unidade */}
      {lista.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-2">
          <div className="text-3xl">🏠</div>
          <div className="text-base font-extrabold text-slate-800">Nenhum funcionário cadastrado no seu apartamento</div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Cadastre aqui as pessoas que trabalham na sua residência (secretária do lar, diarista, babá, etc.). Elas
            ficarão vinculadas ao seu apartamento e terão acesso facial liberado na portaria e no seu bloco.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map((f) => {
            const ocupado = processandoId === f.id;
            return (
              <div
                key={f.id}
                className={`bg-white rounded-2xl border p-4 shadow-sm flex flex-wrap items-center justify-between gap-4 transition-opacity ${
                  f.ativo ? 'border-slate-200' : 'border-amber-200 bg-amber-50/30 opacity-80'
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-[220px] flex-1">
                  <FotoUsuario
                    rota={`morador_funcionario_foto&id=${f.id}&v=${versaoFoto}`}
                    temFoto={f.tem_foto}
                    tamanho={56}
                    redonda
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-slate-900 text-sm truncate">{f.nome}</span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                        {f.funcao}
                      </span>
                      {f.ativo ? (
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          ● Ativo na Catraca
                        </span>
                      ) : (
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                          ⏸ Acesso Pausado
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>CPF: {mascaraCpf(f.cpf || '')}</span>
                      {f.telefone && <span>Tel: {mascaraTelefone(f.telefone)}</span>}
                      {!f.tem_foto && (
                        <span className="text-rose-600 font-bold">⚠️ Sem foto facial</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 ml-auto">
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => abrirEdicao(f)}
                    title="Editar dados ou atualizar foto"
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Pencil size={13} /> Editar
                  </button>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => alternarStatus(f)}
                    title={f.ativo ? 'Pausar acesso nas catracas (ex.: férias)' : 'Reativar acesso nas catracas'}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer ${
                      f.ativo
                        ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    {f.ativo ? (
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
                    onClick={() => excluir(f)}
                    title="Remover funcionário"
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
