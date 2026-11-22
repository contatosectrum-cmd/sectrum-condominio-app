import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  UserX, Plus, Search, ShieldAlert, RefreshCw, Pencil, Trash2, Power, Camera, CheckCircle2, AlertTriangle, X, History, Upload, Users, Check,
} from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import { Modal } from './moradores/AcoesMorador';

// Lista de Restrição Facial (Blacklist) — gravada nos próprios leitores faciais Hikvision do condomínio.
// Gestão (Superadmin/Admin/Síndico) cadastra e administra; Portaria visualiza a lista e o histórico de alarmes.

interface StatusLeitor {
  controlador_id: number;
  nome: string;
  status: 'ok' | 'erro' | 'offline' | 'simulado' | 'removido' | string;
  detalhe: string;
}

interface Restricao {
  id: number;
  nome: string;
  documento: string | null;
  foto_base64: string | null;
  motivo: string;
  nivel: 'critico' | 'atencao' | string;
  modo: 'bloquear' | 'alerta_silencioso' | string;
  validade_ate: string | null;
  vencida: boolean;
  ativo: boolean;
  status_leitores: StatusLeitor[];
  leitores_ok: number;
  leitores_total: number;
  sincronizado_em: string | null;
  criado_por_nome: string | null;
  criado_em: string;
  total_alarmes: number;
}

interface AlarmeHistorico {
  id: number;
  restricao_nome: string;
  nivel: string;
  modo: string;
  controlador_nome: string | null;
  evento_em: string;
  status: 'pendente' | 'ciente' | string;
  tratado_por_nome: string | null;
  tratado_em: string | null;
  observacao: string | null;
  tem_foto: boolean;
}

interface FormRestricao {
  id?: number;
  nome: string;
  documento: string;
  motivo: string;
  nivel: string;
  modo: string;
  validade_ate: string;
  foto_base64: string;
  foto_atual: string | null;
  usuario_origem_id?: number | null;
  origem_resumo?: string | null;
  origem_ja_restrito?: boolean;
  bloquear_cadastro_morador: boolean;
}

interface MoradorBuscaItem {
  id: number;
  nome: string;
  cpf: string;
  relacao: string;
  bloco_nome: string;
  unidade_numero: string;
  tem_foto: boolean;
  ativo: boolean;
  excluido: boolean;
  ja_restrito: boolean;
  foto_base64?: string | null;
}

const FORM_VAZIO: FormRestricao = {
  nome: '',
  documento: '',
  motivo: '',
  nivel: 'critico',
  modo: 'bloquear',
  validade_ate: '',
  foto_base64: '',
  foto_atual: null,
  usuario_origem_id: null,
  origem_resumo: null,
  origem_ja_restrito: false,
  bloquear_cadastro_morador: true,
};

function formatarCpfDoc(cpf: string): string {
  const d = (cpf || '').replace(/\D/g, '');
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  return cpf;
}

const msgErro = (e: unknown, padrao = 'Falha na operação.') => (e instanceof ErroApi ? e.message : padrao);

function dataBr(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(String(iso).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function soData(iso: string | null): string {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : String(iso);
}

/** Lê e reduz a foto (máx. 1280px) antes do envio, mantendo qualidade para o reconhecimento facial. */
async function lerFotoReduzida(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error('Falha ao ler a imagem.'));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('Imagem inválida.'));
    i.src = dataUrl;
  });
  const max = 1280;
  const f = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * f);
  canvas.height = Math.round(img.height * f);
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.9);
}

export default function ListaRestricao() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [aba, setAba] = useState<'pessoas' | 'alarmes'>('pessoas');
  const [restricoes, setRestricoes] = useState<Restricao[]>([]);
  const [contadores, setContadores] = useState({ ativos: 0, inativos: 0 });
  const [podeGerenciar, setPodeGerenciar] = useState(false);
  const [filtro, setFiltro] = useState<'ativos' | 'inativos' | 'todos'>('ativos');
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [processandoId, setProcessandoId] = useState<number | null>(null);

  const [form, setForm] = useState<FormRestricao | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState('');
  const [qualidade, setQualidade] = useState<{ aprovado: boolean; mensagem: string } | null>(null);
  const [avaliandoFoto, setAvaliandoFoto] = useState(false);
  const inputFotoRef = useRef<HTMLInputElement | null>(null);

  // Seletor rápido de moradores/vinculados do condomínio dentro do modal
  const [seletorAberto, setSeletorAberto] = useState(false);
  const [buscaMorador, setBuscaMorador] = useState('');
  const [listaMoradores, setListaMoradores] = useState<MoradorBuscaItem[]>([]);
  const [buscandoMoradores, setBuscandoMoradores] = useState(false);
  const [importandoMoradorId, setImportandoMoradorId] = useState<number | null>(null);

  const [detalheLeitores, setDetalheLeitores] = useState<Restricao | null>(null);

  const [alarmes, setAlarmes] = useState<AlarmeHistorico[]>([]);
  const [pagAlarmes, setPagAlarmes] = useState({ p: 1, paginas: 1, total: 0 });

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await api<{ restricoes: Restricao[]; contadores: { ativos: number; inativos: number }; pode_gerenciar: boolean }>(
        'restricao_listar',
        { query: { status: filtro, busca } },
      );
      setRestricoes(r.restricoes ?? []);
      setContadores(r.contadores);
      setPodeGerenciar(Boolean(r.pode_gerenciar));
    } catch (e) {
      setAviso({ tipo: 'erro', texto: msgErro(e, 'Erro ao carregar a Lista de Restrição.') });
    } finally {
      setCarregando(false);
    }
  }, [filtro, busca]);

  const carregarAlarmes = useCallback(async (p = 1) => {
    try {
      const r = await api<{ alarmes: AlarmeHistorico[]; total: number; paginas: number; p: number }>('alarmes_restricao_historico', {
        query: { p },
      });
      setAlarmes(r.alarmes ?? []);
      setPagAlarmes({ p: r.p, paginas: Math.max(1, r.paginas), total: r.total });
    } catch (e) {
      setAviso({ tipo: 'erro', texto: msgErro(e, 'Erro ao carregar histórico de alarmes.') });
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void carregar(), busca ? 350 : 0);
    return () => window.clearTimeout(t);
  }, [carregar, busca]);

  useEffect(() => {
    if (aba === 'alarmes') void carregarAlarmes(1);
  }, [aba, carregarAlarmes]);

  const avaliarQualidadeBase64 = useCallback(async (b64: string) => {
    if (!b64) return;
    setQualidade(null);
    setAvaliandoFoto(true);
    try {
      const q = await api<{ ok: boolean; aprovado: boolean; mensagem: string }>('selfie_avaliar_qualidade', {
        corpo: { foto_base64: b64 },
      });
      setQualidade(q.ok ? { aprovado: q.aprovado, mensagem: q.mensagem } : null);
    } catch {
      setQualidade(null);
    } finally {
      setAvaliandoFoto(false);
    }
  }, []);

  const importarMoradorPorId = useCallback(
    async (uid: number) => {
      setImportandoMoradorId(uid);
      setErroForm('');
      try {
        const r = await api<{ morador: MoradorBuscaItem }>('restricao_buscar_moradores', {
          query: { usuario_id: uid },
        });
        const m = r.morador;
        const unidTxt = [m.bloco_nome, m.unidade_numero ? `Unid. ${m.unidade_numero}` : ''].filter(Boolean).join(' / ');
        const resumo = [m.relacao || 'Morador', unidTxt, m.excluido ? 'Na Lixeira' : m.ativo ? 'Cadastro Ativo' : 'Cadastro Bloqueado']
          .filter(Boolean)
          .join(' • ');
        const fotoImportada = m.foto_base64 || '';

        setForm((ant) => ({
          ...(ant ?? FORM_VAZIO),
          id: undefined,
          nome: m.nome,
          documento: formatarCpfDoc(m.cpf || ''),
          foto_base64: fotoImportada,
          foto_atual: null,
          usuario_origem_id: m.id,
          origem_resumo: resumo,
          origem_ja_restrito: m.ja_restrito,
          bloquear_cadastro_morador: (ant?.modo ?? 'bloquear') === 'bloquear',
        }));
        setSeletorAberto(false);
        if (fotoImportada) {
          void avaliarQualidadeBase64(fotoImportada);
        } else {
          setQualidade(null);
          setErroForm('Este morador ainda não possui foto facial cadastrada. Selecione uma foto de rosto ao lado para gravar nos leitores.');
        }
      } catch (e) {
        setAviso({ tipo: 'erro', texto: msgErro(e, 'Não foi possível carregar os dados do morador selecionado.') });
      } finally {
        setImportandoMoradorId(null);
      }
    },
    [avaliarQualidadeBase64],
  );

  // Se abriu via ?importar_usuario=ID vindo da tela de Moradores, já abre o modal preenchido automaticamente!
  useEffect(() => {
    const paramId = Number(searchParams.get('importar_usuario') || 0);
    if (paramId > 0) {
      const novosParams = new URLSearchParams(searchParams);
      novosParams.delete('importar_usuario');
      setSearchParams(novosParams, { replace: true });
      setAba('pessoas');
      setForm({ ...FORM_VAZIO });
      setErroForm('');
      setQualidade(null);
      void importarMoradorPorId(paramId);
    }
  }, [searchParams, setSearchParams, importarMoradorPorId]);

  useEffect(() => {
    if (!form || !seletorAberto) return;
    let cancelado = false;
    const timer = window.setTimeout(async () => {
      setBuscandoMoradores(true);
      try {
        const r = await api<{ moradores: MoradorBuscaItem[] }>('restricao_buscar_moradores', {
          query: { busca: buscaMorador.trim() },
        });
        if (!cancelado) setListaMoradores(r.moradores ?? []);
      } catch {
        if (!cancelado) setListaMoradores([]);
      } finally {
        if (!cancelado) setBuscandoMoradores(false);
      }
    }, buscaMorador ? 250 : 0);
    return () => {
      cancelado = true;
      window.clearTimeout(timer);
    };
  }, [form, seletorAberto, buscaMorador]);

  const abrirNovo = (comSeletor = false) => {
    setForm({ ...FORM_VAZIO });
    setErroForm('');
    setQualidade(null);
    setBuscaMorador('');
    setSeletorAberto(comSeletor);
  };

  const abrirEdicao = (r: Restricao) => {
    setForm({
      id: r.id,
      nome: r.nome,
      documento: r.documento ?? '',
      motivo: r.motivo,
      nivel: r.nivel,
      modo: r.modo,
      validade_ate: r.validade_ate ?? '',
      foto_base64: '',
      foto_atual: r.foto_base64,
      usuario_origem_id: null,
      origem_resumo: null,
      origem_ja_restrito: false,
      bloquear_cadastro_morador: false,
    });
    setSeletorAberto(false);
    setErroForm('');
    setQualidade(null);
  };

  const selecionarFoto = async (file: File | undefined) => {
    if (!file || !form) return;
    try {
      const b64 = await lerFotoReduzida(file);
      setForm({ ...form, foto_base64: b64 });
      await avaliarQualidadeBase64(b64);
    } catch (e) {
      setErroForm(e instanceof Error ? e.message : 'Falha ao ler a foto.');
    }
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSalvando(true);
    setErroForm('');
    try {
      const r = await api<{ mensagem: string; aviso_qualidade?: string | null }>('restricao_salvar', {
        corpo: {
          id: form.id ?? 0,
          nome: form.nome.trim(),
          documento: form.documento.trim(),
          motivo: form.motivo.trim(),
          nivel: form.nivel,
          modo: form.modo,
          validade_ate: form.validade_ate,
          foto_base64: form.foto_base64,
          usuario_origem_id: form.usuario_origem_id ?? 0,
          bloquear_cadastro_morador: form.usuario_origem_id ? form.bloquear_cadastro_morador : false,
        },
      });
      setForm(null);
      setAviso({ tipo: 'ok', texto: r.mensagem + (r.aviso_qualidade ? ` ⚠️ ${r.aviso_qualidade}` : '') });
      await carregar();
    } catch (err) {
      setErroForm(msgErro(err, 'Erro ao salvar a restrição.'));
    } finally {
      setSalvando(false);
    }
  };

  const acao = async (r: Restricao, rota: 'restricao_reenviar' | 'restricao_alternar_ativo' | 'restricao_excluir') => {
    if (rota === 'restricao_excluir' && !window.confirm(`Excluir ${r.nome} da Lista de Restrição e remover dos leitores faciais?`)) return;
    if (rota === 'restricao_alternar_ativo' && r.ativo && !window.confirm(`Desativar a restrição de ${r.nome}? Ela será removida dos leitores.`)) return;
    setProcessandoId(r.id);
    try {
      const resp = await api<{ mensagem: string }>(rota, { corpo: { id: r.id } });
      setAviso({ tipo: 'ok', texto: resp.mensagem });
      await carregar();
    } catch (e) {
      setAviso({ tipo: 'erro', texto: msgErro(e) });
    } finally {
      setProcessandoId(null);
    }
  };

  const fotoPreview = form?.foto_base64 || form?.foto_atual || '';

  return (
    <div className="max-w-6xl mx-auto p-3 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2">
            <span className="p-2 rounded-xl bg-rose-100 text-rose-700">
              <UserX size={22} />
            </span>
            Suspeitos / Blacklist (Restrição Facial)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-3xl">
            Pessoas suspeitas ou restritas gravadas diretamente nos leitores faciais do condomínio. Ao serem reconhecidas, o leitor{' '}
            <b>bloqueia a entrada</b> (ou emite alerta silencioso) e a tela de alarme dispara para Portaria, Supervisor e Síndico.
          </p>
        </div>
        {podeGerenciar && aba === 'pessoas' && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => abrirNovo(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border-2 border-rose-300 text-sm font-extrabold shadow-2xs cursor-pointer"
            >
              <Users size={16} /> Selecionar de Moradores
            </button>
            <button
              type="button"
              onClick={() => abrirNovo(false)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-extrabold shadow cursor-pointer"
            >
              <Plus size={16} /> Cadastrar Suspeito Externo
            </button>
          </div>
        )}
      </div>

      {aviso && (
        <div
          className={`border-l-4 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-between gap-3 ${
            aviso.tipo === 'ok' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-rose-50 border-rose-500 text-rose-800'
          }`}
        >
          <span>{aviso.texto}</span>
          <button type="button" onClick={() => setAviso(null)} className="cursor-pointer">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-2xl border border-slate-200 w-fit">
        <button
          type="button"
          onClick={() => setAba('pessoas')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold cursor-pointer ${
            aba === 'pessoas' ? 'bg-rose-600 text-white' : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          🚫 Pessoas ({contadores.ativos} ativas)
        </button>
        <button
          type="button"
          onClick={() => setAba('alarmes')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold cursor-pointer inline-flex items-center gap-1.5 ${
            aba === 'alarmes' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <History size={15} /> Histórico de Alarmes
        </button>
      </div>

      {aba === 'pessoas' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, documento ou motivo..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-rose-500"
              />
            </div>
            <select
              value={filtro}
              onChange={(e) => setFiltro(e.target.value as typeof filtro)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold"
            >
              <option value="ativos">Ativas ({contadores.ativos})</option>
              <option value="inativos">Inativas / expiradas ({contadores.inativos})</option>
              <option value="todos">Todas</option>
            </select>
            <button
              type="button"
              onClick={() => void carregar()}
              className="p-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 cursor-pointer"
              title="Atualizar"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          {carregando ? (
            <div className="text-center text-slate-400 py-10 text-sm">Carregando...</div>
          ) : restricoes.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center text-sm text-slate-500">
              <ShieldAlert size={34} className="mx-auto mb-2 text-slate-300" />
              Nenhuma pessoa {filtro === 'ativos' ? 'ativa ' : ''}na Lista de Restrição.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {restricoes.map((r) => {
                const leitoresComFalha = r.status_leitores.filter((s) => !['ok', 'simulado', 'removido'].includes(s.status)).length;
                return (
                  <div
                    key={r.id}
                    className={`bg-white rounded-2xl border p-3.5 flex gap-3 shadow-2xs ${
                      !r.ativo ? 'opacity-60 border-slate-200' : r.nivel === 'critico' ? 'border-rose-300' : 'border-amber-300'
                    }`}
                  >
                    <div className="w-20 h-24 rounded-xl overflow-hidden bg-slate-100 shrink-0 border border-slate-200">
                      {r.foto_base64 ? (
                        <img src={r.foto_base64} alt={r.nome} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                          <UserX size={28} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-extrabold text-slate-900 truncate">{r.nome}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                            r.nivel === 'critico' ? 'bg-rose-600 text-white' : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {r.nivel === 'critico' ? '🚨 Crítico' : '⚠️ Atenção'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                            r.modo === 'bloquear' ? 'bg-slate-900 text-white' : 'bg-sky-100 text-sky-800'
                          }`}
                        >
                          {r.modo === 'bloquear' ? '⛔ Bloqueia entrada' : '👁️ Alerta silencioso'}
                        </span>
                        {!r.ativo && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-200 text-slate-700">
                            {r.vencida ? 'Expirada' : 'Inativa'}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-600 line-clamp-2">
                        <b>Motivo:</b> {r.motivo}
                      </div>
                      <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-2.5">
                        {r.documento && <span>Doc.: {r.documento}</span>}
                        <span>Validade: {r.validade_ate ? soData(r.validade_ate) : 'indeterminada'}</span>
                        <span>Alarmes: {r.total_alarmes}</span>
                        {r.criado_por_nome && <span>Por: {r.criado_por_nome}</span>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        <button
                          type="button"
                          onClick={() => setDetalheLeitores(r)}
                          className={`px-2 py-1 rounded-lg text-[11px] font-extrabold border cursor-pointer ${
                            leitoresComFalha > 0
                              ? 'bg-amber-50 border-amber-300 text-amber-900'
                              : 'bg-emerald-50 border-emerald-300 text-emerald-800'
                          }`}
                          title="Ver status em cada leitor facial"
                        >
                          {r.ativo ? `📡 ${r.leitores_ok}/${r.leitores_total} leitores` : '📡 Leitores'}
                        </button>
                        {podeGerenciar && (
                          <>
                            <button
                              type="button"
                              onClick={() => abrirEdicao(r)}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                              title="Editar"
                            >
                              <Pencil size={13} />
                            </button>
                            {r.ativo && (
                              <button
                                type="button"
                                disabled={processandoId === r.id}
                                onClick={() => void acao(r, 'restricao_reenviar')}
                                className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 cursor-pointer disabled:opacity-50"
                                title="Reenviar aos leitores"
                              >
                                <Upload size={13} />
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={processandoId === r.id}
                              onClick={() => void acao(r, 'restricao_alternar_ativo')}
                              className={`p-1.5 rounded-lg cursor-pointer disabled:opacity-50 ${
                                r.ativo ? 'bg-amber-50 hover:bg-amber-100 text-amber-700' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                              }`}
                              title={r.ativo ? 'Desativar (remove dos leitores)' : 'Reativar (grava nos leitores)'}
                            >
                              <Power size={13} />
                            </button>
                            <button
                              type="button"
                              disabled={processandoId === r.id}
                              onClick={() => void acao(r, 'restricao_excluir')}
                              className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 cursor-pointer disabled:opacity-50"
                              title="Excluir"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                        {processandoId === r.id && <span className="text-[11px] font-bold text-slate-500">Processando nos leitores...</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <span className="text-sm font-extrabold text-slate-800">{pagAlarmes.total} alarme(s) registrados (retenção de 90 dias)</span>
            <button
              type="button"
              onClick={() => void carregarAlarmes(pagAlarmes.p)}
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 cursor-pointer"
            >
              <RefreshCw size={14} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 font-extrabold">
                <tr>
                  <th className="text-left px-3 py-2">Data/Hora</th>
                  <th className="text-left px-3 py-2">Pessoa</th>
                  <th className="text-left px-3 py-2">Leitor</th>
                  <th className="text-left px-3 py-2">Situação</th>
                  <th className="text-left px-3 py-2">Tratado por</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {alarmes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-slate-400">
                      Nenhum alarme registrado.
                    </td>
                  </tr>
                ) : (
                  alarmes.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 whitespace-nowrap">{dataBr(a.evento_em)}</td>
                      <td className="px-3 py-2">
                        <div className="font-bold text-slate-900">{a.restricao_nome}</div>
                        <div className="text-[10px] text-slate-500">
                          {a.nivel === 'critico' ? '🚨 Crítico' : '⚠️ Atenção'} •{' '}
                          {a.modo === 'bloquear' ? 'Entrada bloqueada' : 'Alerta silencioso'}
                          {a.tem_foto && (
                            <span className="ml-1 inline-flex items-center gap-0.5">
                              • <Camera size={10} /> foto
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">{a.controlador_nome || '—'}</td>
                      <td className="px-3 py-2">
                        {a.status === 'ciente' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                            <CheckCircle2 size={13} /> Ciente
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-700 font-bold">
                            <AlertTriangle size={13} /> Pendente
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {a.tratado_por_nome ? (
                          <>
                            <div className="font-semibold">{a.tratado_por_nome}</div>
                            <div className="text-[10px] text-slate-500">{dataBr(a.tratado_em)}</div>
                            {a.observacao && <div className="text-[11px] italic text-slate-600">{a.observacao}</div>}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {pagAlarmes.paginas > 1 && (
            <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                disabled={pagAlarmes.p <= 1}
                onClick={() => void carregarAlarmes(pagAlarmes.p - 1)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 disabled:opacity-40 cursor-pointer"
              >
                Anterior
              </button>
              <span>
                {pagAlarmes.p} / {pagAlarmes.paginas}
              </span>
              <button
                type="button"
                disabled={pagAlarmes.p >= pagAlarmes.paginas}
                onClick={() => void carregarAlarmes(pagAlarmes.p + 1)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 disabled:opacity-40 cursor-pointer"
              >
                Próxima
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal de cadastro/edição */}
      {form && (
        <Modal
          titulo={
            <>
              <span className="bg-rose-100 text-rose-700 p-2 rounded-xl">
                <UserX size={18} />
              </span>
              {form.id ? 'Editar Restrição' : 'Incluir na Lista de Restrição'}
            </>
          }
          borda="border-t-rose-600"
          largura="max-w-2xl"
          onFechar={() => !salvando && setForm(null)}
        >
          <form onSubmit={salvar} className="space-y-4">
            {erroForm && (
              <div className="bg-rose-50 border-l-4 border-rose-500 text-rose-800 px-3.5 py-2.5 rounded-lg text-xs font-bold">{erroForm}</div>
            )}

            {/* SELETOR RÁPIDO DA LISTA DE MORADORES / INQUILINOS / FUNCIONÁRIOS */}
            {!form.id && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-extrabold text-indigo-950 flex items-center gap-1.5">
                    <Users size={15} className="text-indigo-700" />
                    {form.usuario_origem_id
                      ? `Importado de Moradores: ${form.nome}`
                      : 'Deseja puxar alguém já cadastrado na Lista de Moradores?'}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {form.usuario_origem_id && (
                      <button
                        type="button"
                        onClick={() =>
                          setForm({
                            ...FORM_VAZIO,
                          })
                        }
                        className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 text-[11px] font-bold cursor-pointer"
                      >
                        Limpar vínculo
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSeletorAberto((v) => !v)}
                      className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold cursor-pointer"
                    >
                      {seletorAberto ? 'Fechar lista' : form.usuario_origem_id ? 'Trocar morador' : '🔍 Buscar na Lista de Moradores'}
                    </button>
                  </div>
                </div>

                {form.usuario_origem_id && form.origem_resumo && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold text-indigo-900 bg-white/90 border border-indigo-200 rounded-lg px-3 py-1.5 flex items-center justify-between gap-2 flex-wrap">
                      <span>📌 Origem: <b>{form.origem_resumo}</b></span>
                      {form.foto_base64 && <span className="text-emerald-700 font-extrabold">✅ Foto facial puxada automaticamente</span>}
                    </div>
                    {form.origem_ja_restrito && (
                      <div className="text-[11px] font-bold text-amber-900 bg-amber-100 border border-amber-300 rounded-lg px-3 py-1.5">
                        ⚠️ Atenção: esta pessoa já consta ativa na Lista de Suspeitos / Blacklist deste condomínio.
                      </div>
                    )}
                    <label className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 w-4 h-4 accent-rose-600"
                        checked={form.bloquear_cadastro_morador}
                        onChange={(e) => setForm({ ...form, bloquear_cadastro_morador: e.target.checked })}
                      />
                      <div className="text-[11px] text-rose-950 leading-snug">
                        <span className="font-extrabold">Bloquear também o cadastro normal de morador/acesso liberado desta pessoa</span>
                        <div className="text-rose-800/90 mt-0.5">
                          Recomendado quando a ação for <b>Bloquear entrada</b>, para remover a liberação antiga de morador dos leitores e do App. Desmarque apenas se quiser monitorar em <b>Alerta silencioso</b> mantendo a entrada normal liberada.
                        </div>
                      </div>
                    </label>
                  </div>
                )}

                {seletorAberto && (
                  <div className="bg-white rounded-xl border border-indigo-200 p-2.5 space-y-2 shadow-xs">
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        autoFocus
                        value={buscaMorador}
                        onChange={(e) => setBuscaMorador(e.target.value)}
                        placeholder="Digite nome, CPF, bloco ou número do apartamento..."
                        className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-300 text-xs outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-lg">
                      {buscandoMoradores ? (
                        <div className="py-6 text-center text-xs text-slate-400 font-semibold">Buscando moradores...</div>
                      ) : listaMoradores.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-400">Nenhum morador encontrado para essa busca.</div>
                      ) : (
                        listaMoradores.map((m) => {
                          const unidTxt = [m.bloco_nome, m.unidade_numero ? `Apto/Unid. ${m.unidade_numero}` : ''].filter(Boolean).join(' • ');
                          const carregandoEste = importandoMoradorId === m.id;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              disabled={importandoMoradorId !== null}
                              onClick={() => void importarMoradorPorId(m.id)}
                              className="w-full text-left px-3 py-2 hover:bg-indigo-50/70 flex items-center justify-between gap-2 transition cursor-pointer disabled:opacity-50"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-extrabold text-slate-900 truncate">{m.nome}</span>
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                                    {m.relacao}
                                  </span>
                                  {m.tem_foto ? (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                                      📷 Com foto
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                      Sem foto
                                    </span>
                                  )}
                                  {m.excluido && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                                      Lixeira
                                    </span>
                                  )}
                                  {m.ja_restrito && (
                                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-rose-600 text-white">
                                      Já na Blacklist
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-x-2">
                                  {unidTxt && <span>🏠 {unidTxt}</span>}
                                  {m.cpf && <span>• CPF: {formatarCpfDoc(m.cpf)}</span>}
                                </div>
                              </div>
                              <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-extrabold">
                                <Check size={12} /> {carregandoEste ? 'Puxando...' : 'Selecionar'}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid sm:grid-cols-[150px_1fr] gap-4">
              <div className="space-y-2">
                <div className="w-full aspect-[3/4] rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
                  {fotoPreview ? (
                    <img src={fotoPreview} alt="Foto" className="w-full h-full object-cover" />
                  ) : (
                    <Camera size={30} className="text-slate-300" />
                  )}
                </div>
                <input
                  ref={inputFotoRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    void selecionarFoto(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => inputFotoRef.current?.click()}
                  className="w-full px-2 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold cursor-pointer"
                >
                  {fotoPreview ? 'Trocar foto' : 'Selecionar foto *'}
                </button>
                {avaliandoFoto && <div className="text-[11px] text-slate-500 font-semibold">🔎 Avaliando qualidade na GPU...</div>}
                {qualidade && (
                  <div
                    className={`text-[11px] font-bold rounded-lg px-2 py-1.5 ${
                      qualidade.aprovado ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'
                    }`}
                  >
                    {qualidade.aprovado ? '✅ ' : '⚠️ '}
                    {qualidade.mensagem}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Nome completo *</label>
                  <input
                    required
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Documento (opcional)</label>
                    <input
                      value={form.documento}
                      onChange={(e) => setForm({ ...form, documento: e.target.value })}
                      placeholder="CPF / RG"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Válida até (opcional)</label>
                    <input
                      type="date"
                      value={form.validade_ate}
                      onChange={(e) => setForm({ ...form, validade_ate: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Motivo da restrição * (registrado em auditoria — LGPD)</label>
                  <textarea
                    required
                    rows={2}
                    value={form.motivo}
                    onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                    placeholder="Ex.: Ex-funcionário desligado / medida protetiva / ex-inquilino com entrada proibida"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Nível do alerta</label>
                    <select
                      value={form.nivel}
                      onChange={(e) => setForm({ ...form, nivel: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold"
                    >
                      <option value="critico">🚨 Crítico</option>
                      <option value="atencao">⚠️ Atenção</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Ação no leitor</label>
                    <select
                      value={form.modo}
                      onChange={(e) => {
                        const novoModo = e.target.value;
                        setForm({
                          ...form,
                          modo: novoModo,
                          bloquear_cadastro_morador: form.usuario_origem_id
                            ? novoModo === 'bloquear'
                            : form.bloquear_cadastro_morador,
                        });
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold"
                    >
                      <option value="bloquear">⛔ Bloquear entrada + alarme</option>
                      <option value="alerta_silencioso">👁️ Liberar + alerta silencioso</option>
                    </select>
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  Ao salvar, a pessoa é gravada em <b>todos os leitores faciais</b> do condomínio. Em <b>Bloquear</b>, o leitor nega a
                  entrada; em <b>Alerta silencioso</b>, o acesso é liberado e somente a equipe é avisada.
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={salvando}
                onClick={() => setForm(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando || (!form.id && !form.foto_base64)}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-extrabold cursor-pointer"
              >
                {salvando ? 'Gravando nos leitores...' : 'Salvar e gravar nos leitores'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Status por leitor */}
      {detalheLeitores && (
        <Modal
          titulo={<>📡 Leitores — {detalheLeitores.nome}</>}
          borda="border-t-slate-800"
          onFechar={() => setDetalheLeitores(null)}
        >
          <div className="space-y-2">
            {detalheLeitores.status_leitores.length === 0 ? (
              <div className="text-sm text-slate-500">Nenhum leitor processado ainda.</div>
            ) : (
              detalheLeitores.status_leitores.map((s) => (
                <div key={s.controlador_id} className="flex items-start justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div>
                    <div className="text-sm font-bold text-slate-900">{s.nome}</div>
                    {s.detalhe && <div className="text-[11px] text-slate-500">{s.detalhe}</div>}
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold shrink-0 ${
                      ['ok', 'simulado', 'removido'].includes(s.status)
                        ? 'bg-emerald-100 text-emerald-800'
                        : s.status === 'offline'
                          ? 'bg-slate-200 text-slate-700'
                          : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {s.status === 'ok' ? 'Gravado' : s.status === 'offline' ? 'Off-line' : s.status === 'removido' ? 'Removido' : s.status === 'simulado' ? 'Simulado' : 'Erro'}
                  </span>
                </div>
              ))
            )}
            {detalheLeitores.sincronizado_em && (
              <div className="text-[11px] text-slate-500 pt-1">Última gravação: {dataBr(detalheLeitores.sincronizado_em)}</div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
