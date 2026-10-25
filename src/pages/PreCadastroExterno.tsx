import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SENHA_PADRAO } from '../lib/constantes';
import { api, ErroApi } from '../lib/api';

// Paridade com src/controllers/precadastro_externo.php (página pública, sem login, aberta pelo link ?t=TOKEN):
// cabeçalho (geral/temporada), dados pessoais, bloco/unidade (travados pelo link ou escolhidos), vínculo, check-in/out e
// documento (temporada), veículo principal + 2º veículo (se o link permitir), selfie com guia de rosto e tela de sucesso.

interface Link {
  condominio: string; perfil: string; tipo: string; unidade_info: string | null;
  permite_segundo: boolean; app_habilitado: boolean; blocos: { id: number; nome: string }[];
}

const VAZIO = {
  nome: '', cpf: '', telefone: '', relacao: 'Titular', bloco_id: '', unidade_numero: '', periodo_inicio: '', periodo_fim: '',
  tipo_veiculo1: 'Carro', placa1: '', vaga_garagem1: '', marca1: '', modelo1: '', cor1: '',
  tipo_veiculo2: 'Carro', placa2: '', vaga_garagem2: '', marca2: '', modelo2: '', cor2: '',
};
const lbl = 'text-[0.78em] font-bold text-slate-600 uppercase tracking-wide';
const inp = 'bg-slate-50 border-2 border-slate-200 text-slate-800 px-3.5 py-3 rounded-xl text-[0.95em] w-full outline-none focus:border-blue-600 focus:bg-white';
const sec = 'text-[0.8em] font-extrabold text-slate-500 uppercase tracking-wider mb-3.5 pb-2 border-b-2 border-slate-100';
const btn = 'block w-full p-4 rounded-xl text-[1.05em] font-bold text-center disabled:opacity-60';

const mascaraCpf = (v: string) => {
  let d = v.replace(/\D/g, '');
  if (d.length > 3) d = d.slice(0, 3) + '.' + d.slice(3);
  if (d.length > 7) d = d.slice(0, 7) + '.' + d.slice(7);
  if (d.length > 11) d = d.slice(0, 11) + '-' + d.slice(11, 13);
  return d;
};

export default function PreCadastroExterno() {
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';
  const [link, setLink] = useState<Link | null>(null);
  const [erroLink, setErroLink] = useState('');
  const [f, setF] = useState(VAZIO);
  const [v2, setV2] = useState(false);
  const [foto, setFoto] = useState('');
  const [doc, setDoc] = useState('');
  const [camera, setCamera] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState<{ cpf: string; app: boolean } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const docRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) { setErroLink('Link inválido ou ausente.'); return; }
    api<{ link: Link }>('precadastro_link', { query: { t: token } })
      .then((r) => { setLink(r.link); document.title = `Pré-cadastro — ${r.link.condominio}`; })
      .catch((e) => setErroLink(e instanceof ErroApi ? e.message : 'Este link expirou ou é inválido. Solicite um novo ao síndico.'));
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
  }, [token]);

  const muda = (k: keyof typeof VAZIO) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const temporada = link?.tipo === 'temporada';

  useEffect(() => {
    if (camera && videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
      videoRef.current.play().catch(() => {});
    }
  }, [camera]);

  const ligarCamera = async () => {
    (document.activeElement as HTMLElement | null)?.blur();
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = s;
      setCamera(true);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play().catch(() => {});
      }
    } catch {
      alert('Permita o acesso à câmera para tirar a foto.');
    }
  };
  const capturar = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) {
      alert('Aguarde a imagem da câmera carregar antes de capturar.');
      return;
    }
    const vw = v.videoWidth, vh = v.videoHeight;
    // 1. Espelha o frame e calcula a janela 3:4 visível no container (object-cover)
    const tmp = document.createElement('canvas');
    tmp.width = vw; tmp.height = vh;
    const tc = tmp.getContext('2d')!;
    tc.translate(vw, 0); tc.scale(-1, 1); tc.drawImage(v, 0, 0);

    const propCaixa = 3 / 4;
    let visW = vw, visH = vh, visX = 0, visY = 0;
    if (vw / vh > propCaixa) {
      visW = Math.round(vh * propCaixa);
      visX = Math.round((vw - visW) / 2);
    } else {
      visH = Math.round(vw / propCaixa);
      visY = Math.round((vh - visH) / 2);
    }
    // 2. Recorta a área do tracejado do rosto (com margem acima da cabeça e abaixo do queixo para o leitor Hikvision)
    const cx = visX + Math.round(visW * 0.08);
    const cy = visY + Math.round(visH * 0.06);
    const cw = Math.round(visW * 0.84);
    const ch = Math.round(visH * 0.84);

    // 3. Redimensiona para 360x480 px (leve ~18 KB e proporção 3:4 ideal para reconhecimento facial)
    const c = document.createElement('canvas');
    c.width = 360; c.height = 480;
    c.getContext('2d')!.drawImage(tmp, cx, cy, cw, ch, 0, 0, 360, 480);
    setFoto(c.toDataURL('image/jpeg', 0.82));
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamera(false);
  };
  const lerDocumento = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arq = e.target.files?.[0];
    if (!arq) return;
    const r = new FileReader();
    r.onload = () => setDoc(String(r.result));
    r.readAsDataURL(arq);
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErro('');
    try {
      const r = await api<{ cpf: string; app_habilitado: boolean }>('precadastro_enviar', {
        corpo: { t: token, ...f, ...(v2 ? {} : { placa2: '', marca2: '', modelo2: '', cor2: '', vaga_garagem2: '' }), foto_base64: foto, doc_base64: doc },
      });
      setSucesso({ cpf: r.cpf, app: r.app_habilitado });
      window.scrollTo({ top: 0 });
    } catch (e2) {
      // Correção: no legado qualquer erro de validação trocava o formulário pela tela "Link Inválido" e perdia o que foi digitado
      setErro(e2 instanceof ErroApi ? e2.message : 'Erro ao salvar os dados. Tente novamente.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setEnviando(false);
    }
  };

  const caixa = (conteudo: React.ReactNode) => (
    <div className="min-h-screen bg-slate-100 px-4 pt-5 pb-10 font-sans">
      <div className="bg-white rounded-[20px] shadow-xl w-full max-w-[480px] mx-auto overflow-hidden">{conteudo}</div>
    </div>
  );

  if (erroLink) {
    return caixa(
      <div className="text-center px-7 py-12">
        <div className="text-5xl mb-4">⛔</div>
        <h2 className="text-red-600 text-xl font-bold mb-2.5">Link Inválido</h2>
        <p className="text-slate-500 text-sm">{erroLink}</p>
      </div>,
    );
  }
  if (!link) return caixa(<div className="p-12 text-center text-slate-400">Carregando...</div>);

  if (sucesso) {
    return caixa(
      <div className="px-6 pt-10 pb-5">
        <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-5 shadow-lg text-white text-3xl font-bold">✓</div>
        <h2 className="text-slate-900 font-extrabold mb-2.5 text-2xl text-center">Cadastro Enviado!</h2>
        <p className="text-slate-500 text-[0.95em] mb-7 text-center leading-relaxed">Suas informações foram recebidas e estão aguardando aprovação da administração.</p>
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
          <h3 className="text-xs uppercase text-slate-400 font-extrabold mb-5 tracking-wider">Veja os próximos passos:</h3>
          {sucesso.app ? (
            <>
              <div className="flex gap-3.5 mb-5"><span className="shrink-0 w-7 h-7 bg-violet-100 text-violet-500 rounded-full flex items-center justify-center font-extrabold text-sm">1</span>
                <div><b className="text-slate-800 block mb-1">Aguarde a Liberação</b><span className="text-slate-500 text-sm">Após a análise da administração, a sua biometria facial será ativada na portaria.</span></div></div>
              <div className="flex gap-3.5 mb-5"><span className="shrink-0 w-7 h-7 bg-violet-100 text-violet-500 rounded-full flex items-center justify-center font-extrabold text-sm">2</span>
                <div className="w-full"><b className="text-slate-800 block mb-3">Acesse o Aplicativo</b>
                  <div className="bg-white border border-slate-300 rounded-xl p-3 mb-2 flex justify-between items-center"><span className="text-slate-500 text-sm font-bold">👤 Usuário (CPF)</span><span className="text-slate-900 font-extrabold font-mono">{sucesso.cpf}</span></div>
                  <div className="bg-white border-2 border-red-200 rounded-xl p-3 flex justify-between items-center"><span className="text-slate-500 text-sm font-bold">🔑 Senha Padrão</span><span className="text-red-600 font-black font-mono bg-red-50 px-2.5 py-1 rounded-md tracking-wider">{SENHA_PADRAO}</span></div>
                </div></div>
              <div className="flex gap-3.5"><span className="shrink-0 w-7 h-7 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center">⚠️</span>
                <div><b className="text-slate-800 block mb-1">Troca Obrigatória</b><span className="text-slate-500 text-sm">Por segurança, o sistema exigirá que você cadastre uma nova senha no primeiro acesso.</span></div></div>
            </>
          ) : (
            <div className="flex gap-3.5"><span className="shrink-0 w-7 h-7 bg-violet-100 text-violet-500 rounded-full flex items-center justify-center">✔️</span>
              <div><b className="text-slate-800 block mb-1">Aguarde a Análise da Administração</b><span className="text-slate-500 text-sm leading-relaxed">O seu cadastro foi enviado para a administração do condomínio. Após a análise e aprovação, a sua biometria facial será ativada automaticamente na portaria e você receberá as instruções de acesso.</span></div></div>
          )}
        </div>
        <a
          href={`https://wa.me/559885983566?text=${encodeURIComponent(`Olá! Acabei de enviar meu pré-cadastro (CPF: ${sucesso.cpf}) e gostaria de receber a confirmação de aprovação por aqui.`)}`}
          target="_blank"
          rel="noreferrer"
          className={`${btn} bg-emerald-600 hover:bg-emerald-700 text-white mt-5 shadow-lg`}
        >
          💬 Confirmar Recebimento no WhatsApp
        </a>
        <p className="text-emerald-700 text-xs font-semibold mt-2 text-center">
          Toque acima para ativar o aviso automático de liberação e ramal no seu WhatsApp.
        </p>
        {sucesso.app && (
          <>
            <a href="/login" className={`${btn} bg-blue-600 text-white mt-3 shadow-lg`}>📱 Baixar / Acessar Aplicativo</a>
            <p className="text-slate-400 text-sm mt-4 text-center">Para baixar, toque no botão acima e adicione a tela de login à sua Tela Inicial do celular.</p>
          </>
        )}
      </div>,
    );
  }

  return caixa(
    <>
      <div className={`text-white px-7 pt-7 pb-6 text-center ${temporada ? 'bg-gradient-to-br from-cyan-600 to-cyan-700' : 'bg-gradient-to-br from-blue-600 to-blue-700'}`}>
        <div className="inline-block bg-white/20 border border-white/40 px-3.5 py-1 rounded-full text-xs font-bold mb-3">{temporada ? '🏖️ Aluguel de Temporada' : `📋 Pré-cadastro — ${link.perfil}`}</div>
        <h1 className="text-xl font-extrabold mb-1.5">{link.condominio}</h1>
        {temporada && link.unidade_info && <div className="bg-white/15 rounded-lg px-3.5 py-2 my-2.5 text-sm font-semibold">🏠 Unidade: {link.unidade_info}</div>}
        <p className="text-sm opacity-85 leading-snug">{temporada
          ? 'Preencha seus dados como inquilino de temporada. Envie seus documentos e foto para agilizar a liberação na portaria.'
          : 'Preencha seus dados para solicitar o acesso ao condomínio. Após análise do síndico, você receberá a confirmação.'}</p>
      </div>
      <div className="px-6 pt-6 pb-8">
        {erro && <div className="bg-red-50 text-red-600 border border-red-300 p-3.5 rounded-xl text-sm font-semibold mb-5">⚠️ {erro}</div>}
        <form onSubmit={enviar}>
          <div className="mb-6">
            <div className={sec}>👤 Dados Pessoais</div>
            <div className="flex flex-col gap-1.5 mb-3.5"><label className={lbl}>Nome Completo *</label><input required value={f.nome} onChange={muda('nome')} placeholder="Seu nome completo" className={inp} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5 mb-3.5"><label className={lbl}>CPF *</label><input required value={f.cpf} onChange={(e) => setF({ ...f, cpf: mascaraCpf(e.target.value) })} placeholder="000.000.000-00" maxLength={14} inputMode="numeric" className={inp} /></div>
              <div className="flex flex-col gap-1.5 mb-3.5"><label className={lbl}>WhatsApp</label><input value={f.telefone} onChange={muda('telefone')} placeholder="(00) 00000-0000" className={inp} /></div>
            </div>
            {link.unidade_info ? (
              <div className="flex flex-col gap-1.5 mb-3.5"><label className={lbl}>Bloco / Unidade</label><input readOnly value={link.unidade_info} className={`${inp} !bg-sky-100 !border-sky-300 !text-sky-700 font-semibold`} /></div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5 mb-3.5"><label className={lbl}>Bloco Pertencente *</label>
                  <select required value={f.bloco_id} onChange={muda('bloco_id')} className={inp}><option value="">Selecione a torre...</option>{link.blocos.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}</select></div>
                <div className="flex flex-col gap-1.5 mb-3.5"><label className={lbl}>Número / Identificação *</label><input required value={f.unidade_numero} onChange={muda('unidade_numero')} placeholder="Ex: 101, 204B..." className={inp} /></div>
              </div>
            )}
            <div className="flex flex-col gap-1.5 mb-3.5"><label className={lbl}>Vínculo</label>
              <select value={temporada ? 'Temporada' : f.relacao} onChange={muda('relacao')} className={inp}>
                {temporada ? <option value="Temporada">Inquilino de Temporada</option> : <><option value="Titular">Proprietário / Titular</option><option value="Inquilino">Inquilino</option><option value="Dependente">Dependente</option></>}
              </select></div>
            {temporada && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5 mb-3.5"><label className={lbl}>Check-in *</label><input type="date" required value={f.periodo_inicio} onChange={muda('periodo_inicio')} className={inp} /></div>
                <div className="flex flex-col gap-1.5 mb-3.5"><label className={lbl}>Check-out *</label><input type="date" required value={f.periodo_fim} onChange={muda('periodo_fim')} className={inp} /></div>
              </div>
            )}
          </div>

          {temporada && (
            <div className="mb-6">
              <div className={sec}>🪪 Documento (CNH ou RG)</div>
              <p className="text-sm text-slate-500 mb-3.5">Fotografe ou faça upload do seu documento de identificação (frente).</p>
              <input ref={docRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={lerDocumento} />
              {doc ? (
                <><img src={doc} alt="Documento" className="w-full max-w-[340px] mx-auto mb-3.5 rounded-xl border-2 border-cyan-600" />
                  <button type="button" onClick={() => setDoc('')} className={`${btn} bg-slate-900 text-white mb-3.5`}>🔄 Refazer Documento</button></>
              ) : (
                <><button type="button" onClick={() => { docRef.current?.setAttribute('capture', 'environment'); docRef.current?.click(); }} className={`${btn} bg-cyan-600 text-white mb-2.5`}>📷 Fotografar Documento</button>
                  <button type="button" onClick={() => { docRef.current?.removeAttribute('capture'); docRef.current?.click(); }} className={`${btn} bg-slate-100 text-slate-700`}>📁 Escolher da Galeria</button></>
              )}
            </div>
          )}

          {([1, 2] as const).map((n) => (n === 1 || v2) && (
            <div key={n} className="mb-6">
              <div className={sec}>🚗 {n === 1 ? 'Veículo Principal' : '2º Veículo'}</div>
              <div className="grid grid-cols-3 gap-2.5">
                <div className="flex flex-col gap-1.5 mb-3.5"><label className={lbl}>Tipo</label><select value={f[`tipo_veiculo${n}`]} onChange={muda(`tipo_veiculo${n}`)} className={`${inp} !px-1.5`}><option value="Carro">🚗 Carro</option><option value="Moto">🏍️ Moto</option></select></div>
                <div className="flex flex-col gap-1.5 mb-3.5"><label className={lbl}>Placa</label><input value={f[`placa${n}`]} onChange={muda(`placa${n}`)} placeholder="ABC1D23" maxLength={8} className={`${inp} uppercase font-mono font-bold tracking-wide`} /></div>
                <div className="flex flex-col gap-1.5 mb-3.5"><label className={lbl}>Vaga</label><input value={f[`vaga_garagem${n}`]} onChange={muda(`vaga_garagem${n}`)} placeholder={n === 1 ? 'Ex: 42-A' : 'Ex: 43-B'} className={inp} /></div>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <div className="flex flex-col gap-1.5 mb-3.5"><label className={lbl}>Marca</label><input value={f[`marca${n}`]} onChange={muda(`marca${n}`)} placeholder={n === 1 ? 'Ex: Fiat' : 'Ex: VW'} className={inp} /></div>
                <div className="flex flex-col gap-1.5 mb-3.5"><label className={lbl}>Modelo</label><input value={f[`modelo${n}`]} onChange={muda(`modelo${n}`)} placeholder={n === 1 ? 'Ex: Toro' : 'Ex: Gol'} className={inp} /></div>
                <div className="flex flex-col gap-1.5 mb-3.5"><label className={lbl}>Cor</label><input value={f[`cor${n}`]} onChange={muda(`cor${n}`)} placeholder={n === 1 ? 'Branca' : 'Prata'} className={inp} /></div>
              </div>
            </div>
          ))}
          {link.permite_segundo
            ? <button type="button" onClick={() => setV2(!v2)} className="w-full border-2 border-dashed border-slate-300 text-slate-500 rounded-xl p-2.5 text-sm font-semibold mb-3.5 hover:border-blue-600 hover:text-blue-600">{v2 ? '− Remover 2º Veículo' : '+ Adicionar 2º Veículo (opcional)'}</button>
            : <p className="text-xs text-slate-500 text-center mb-6">O limite configurado pelo condomínio é de 1 veículo.</p>}

          <div className="mb-6">
            <div className={sec}>📷 Foto Facial (Reconhecimento)</div>
            <p className="text-sm text-slate-500 mb-3.5">Tire uma selfie para ativar o reconhecimento facial na portaria. Certifique-se de estar em local bem iluminado.</p>
            <div className={camera ? 'relative w-full aspect-[3/4] bg-black rounded-2xl overflow-hidden mb-4' : 'hidden'}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
              <div className="absolute top-[12%] left-[12%] right-[12%] bottom-[22%] border-[3px] border-dashed border-white/75 rounded-[50%_50%_42%_42%] shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] pointer-events-none" />
              <div className="absolute bottom-[7%] inset-x-0 text-white font-bold text-sm text-center [text-shadow:1px_1px_4px_rgba(0,0,0,.8)]">Alinhe o rosto no tracejado</div>
            </div>
            {foto && <img src={foto} alt="Foto capturada" className="w-full max-w-[240px] mx-auto mb-4 aspect-[3/4] object-cover rounded-2xl border-[3px] border-emerald-500" />}
            {!camera && !foto && <button type="button" onClick={ligarCamera} className={`${btn} bg-slate-900 text-white mb-3.5`}>📸 Ligar Câmera Frontal</button>}
            {camera && <button type="button" onClick={capturar} className={`${btn} bg-amber-500 text-white mb-3.5`}>📷 Capturar Rosto</button>}
            {foto && <button type="button" onClick={() => { setFoto(''); ligarCamera(); }} className={`${btn} bg-slate-900 text-white mb-3.5`}>🔄 Refazer Foto</button>}
          </div>

          <button disabled={enviando} className={`${btn} bg-blue-600 text-white shadow-lg`}>{enviando ? 'Enviando...' : '🛡️ Enviar para Análise'}</button>
        </form>
        {link.app_habilitado && (
          <div className="mt-6 text-center border-t border-dashed border-slate-300 pt-5">
            <p className="text-sm text-slate-500 mb-2">Já tem o seu cadastro aprovado?</p>
            <a href="/login" className="text-blue-600 font-bold text-sm">📱 Baixar / Acessar o Aplicativo</a>
          </div>
        )}
      </div>
    </>,
  );
}
