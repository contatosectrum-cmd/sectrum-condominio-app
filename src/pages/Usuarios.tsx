import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck, Lock, Pencil, Trash2, Save, X, Search, UsersRound,
  Building2, Sparkles, ArrowRight, Home,
} from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import type { PermissoesGestorSistema } from '../lib/sessao';

interface UsuarioAcesso {
  id: number;
  nome: string;
  email: string;
  cpf: string;
  telefone: string;
  perfil: string;
  perfil_banco?: string;
  subperfil?: string;
  cargo_funcao?: string;
  unidade_id: number | null;
  unidade_label?: string;
  grupo_acesso_id: number | null;
  grupo_acesso_nome?: string;
  terminais_acesso: number[];
  terminais_efetivos: number[];
  permissoes_sistema: PermissoesGestorSistema;
  condominio_id: number | null;
  condominio_nome: string | null;
  ativo: boolean;
}

interface Condominio {
  id: number;
  nome: string;
}

interface GrupoAcessoItem {
  id: number;
  nome: string;
  terminais: number[];
}

interface UnidadeItem {
  id: number;
  numero: string;
  bloco_id: number | null;
  bloco_nome: string;
  grupo_acesso_id?: number | null;
  grupo_acesso_nome?: string | null;
}

interface Aviso {
  tipo: 'ok' | 'erro';
  mensagem: string;
}

const PERMISSOES_PADRAO: Required<PermissoesGestorSistema> = {
  gerenciar_colaboradores: true,
  gerenciar_frota_lpr: true,
  liberar_visitantes: true,
  abrir_portas_remoto: true,
  visualizar_cameras: true,
  gerenciar_encomendas: true,
  abrir_ocorrencias: true,
  usar_interfone: true,
};

interface Form {
  id: number | null;
  nome: string;
  email: string;
  cpf: string;
  telefone: string;
  senha: string;
  perfil: string;
  condominio_id: string;
  unidade_id: string;
  grupo_acesso_id: string;
  permissoes_sistema: Required<PermissoesGestorSistema>;
}

const ROTULO_PERFIL: Record<string, string> = {
  portaria: '🛡️ Operador de Portaria',
  sindico: '👔 Síndico / Administrador',
  subsindico: '🛡️ Subsíndico',
  morador: '🏠 Morador / Titular (Acesso App)',
  superadmin: '👑 Super Admin',
};

const VAZIO: Form = {
  id: null,
  nome: '',
  email: '',
  cpf: '',
  telefone: '',
  senha: '',
  perfil: 'portaria',
  condominio_id: '',
  unidade_id: '',
  grupo_acesso_id: '',
  permissoes_sistema: { ...PERMISSOES_PADRAO },
};

const rotulo = 'block text-[0.76rem] font-extrabold text-slate-700 mb-1';
const entrada = 'w-full px-3 py-2.5 border border-slate-300 rounded-xl outline-none focus:border-emerald-600 bg-white text-slate-900 text-sm';
const th = 'text-left text-[0.72rem] font-extrabold uppercase tracking-wide text-slate-500 px-4 py-3 border-b border-slate-200';
const td = 'px-4 py-3 border-b border-slate-100 text-sm align-top';

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

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioAcesso[]>([]);
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [grupos, setGrupos] = useState<GrupoAcessoItem[]>([]);
  const [unidades, setUnidades] = useState<UnidadeItem[]>([]);
  const [perfis, setPerfis] = useState<string[]>(['portaria', 'sindico', 'subsindico', 'morador']);
  const [super_, setSuper] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [form, setForm] = useState<Form>(VAZIO);
  const [enviando, setEnviando] = useState(false);
  const [busca, setBusca] = useState('');

  const carregar = useCallback(async (cidFiltro?: string) => {
    try {
      const r = await api<{
        super: boolean;
        perfis: string[];
        condominios: Condominio[];
        grupos_acesso: GrupoAcessoItem[];
        unidades: UnidadeItem[];
        usuarios: UsuarioAcesso[];
      }>('listar_usuarios', {
        query: cidFiltro ? { condominio_id: cidFiltro } : undefined,
      });
      setUsuarios(r.usuarios);
      setCondominios(r.condominios || []);
      setGrupos(r.grupos_acesso || []);
      setUnidades(r.unidades || []);
      setPerfis(r.perfis);
      setSuper(r.super);
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro ao carregar os acessos.' });
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const rolarTopo = () => document.querySelector('main .overflow-auto')?.scrollTo({ top: 0, behavior: 'smooth' });

  // Ao selecionar o Condômino / Empresa (Galpão), puxa automaticamente a Pré-Autorização (Grupo de Acesso) daquele Galpão!
  const aoSelecionarCondomino = (unidIdStr: string) => {
    const un = unidades.find((u) => String(u.id) === unidIdStr);
    let grupoAuto = un?.grupo_acesso_id ? String(un.grupo_acesso_id) : '';

    // Se a unidade ainda não tinha grupo gravado no banco, mas o nome da unidade coincide com algum grupo (ex.: MELI -> CANCELA E TORNIQ MELI), sugere automaticamente!
    if (!grupoAuto && un) {
      const termoUnid = un.numero.trim().toLowerCase();
      const grpSugerido = grupos.find((g) => termoUnid.length >= 2 && g.nome.toLowerCase().includes(termoUnid));
      if (grpSugerido) {
        grupoAuto = String(grpSugerido.id);
      }
    }

    setForm((prev) => ({
      ...prev,
      unidade_id: unidIdStr,
      grupo_acesso_id: grupoAuto || prev.grupo_acesso_id,
    }));
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setAviso(null);
    try {
      const precisaUnidade = form.perfil === 'morador';
      const grpSelecionado = grupos.find((g) => String(g.id) === form.grupo_acesso_id);

      const corpo: Record<string, unknown> = {
        nome: form.nome.trim(),
        email: form.email.trim(),
        cpf: form.cpf,
        telefone: form.telefone,
        senha: form.senha,
        perfil: form.perfil,
        unidade_id: precisaUnidade ? form.unidade_id : '',
        grupo_acesso_id: precisaUnidade ? form.grupo_acesso_id : '',
        terminais_acesso: precisaUnidade && grpSelecionado ? grpSelecionado.terminais : [],
        permissoes_sistema: form.permissoes_sistema,
      };

      if (form.id) {
        corpo.id = form.id;
      } else if (super_ && form.condominio_id) {
        corpo.condominio_id = form.condominio_id;
      }

      const r = await api<{ mensagem: string }>('usuario_salvar', { corpo });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      setForm(VAZIO);
      await carregar(form.condominio_id || undefined);
    } catch (err) {
      setAviso({ tipo: 'erro', mensagem: err instanceof ErroApi ? err.message : 'Erro ao salvar usuário.' });
    } finally {
      setEnviando(false);
      rolarTopo();
    }
  };

  const editar = (u: UsuarioAcesso) => {
    setForm({
      id: u.id,
      nome: u.nome,
      email: u.email || '',
      cpf: mascaraCpf(u.cpf || ''),
      telefone: mascaraTelefone(u.telefone || ''),
      senha: '',
      perfil: u.perfil,
      condominio_id: u.condominio_id ? String(u.condominio_id) : '',
      unidade_id: u.unidade_id ? String(u.unidade_id) : '',
      grupo_acesso_id: u.grupo_acesso_id ? String(u.grupo_acesso_id) : '',
      permissoes_sistema: { ...PERMISSOES_PADRAO, ...(u.permissoes_sistema || {}) },
    });
    rolarTopo();
  };

  const excluir = async (u: UsuarioAcesso) => {
    if (!window.confirm(`Remover o acesso de "${u.nome}"?`)) return;
    setEnviando(true);
    try {
      const r = await api<{ mensagem: string }>('usuario_excluir', { corpo: { id: u.id } });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      if (form.id === u.id) setForm(VAZIO);
      await carregar();
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro ao excluir.' });
    } finally {
      setEnviando(false);
    }
  };

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return usuarios;
    return usuarios.filter((u) =>
      `${u.nome} ${u.email} ${u.cpf} ${u.perfil} ${u.unidade_label ?? ''} ${u.grupo_acesso_nome ?? ''}`
        .toLowerCase()
        .includes(t),
    );
  }, [usuarios, busca]);

  const editando = form.id !== null;
  const opcoesPerfil = perfis.includes(form.perfil) ? perfis : [...perfis, form.perfil];
  const vinculaCondomino = form.perfil === 'morador';

  const unidadeSelecionada = useMemo(
    () => unidades.find((u) => String(u.id) === form.unidade_id) ?? null,
    [unidades, form.unidade_id],
  );

  const grupoSelecionado = useMemo(
    () => grupos.find((g) => String(g.id) === form.grupo_acesso_id) ?? null,
    [grupos, form.grupo_acesso_id],
  );

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8 space-y-6">
      {aviso && (
        <div
          className={`border-l-4 px-4 py-3 rounded-xl text-sm font-semibold flex justify-between items-center gap-3 ${
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

      {/* GUIA RÁPIDO EM 3 ETAPAS CLARAS */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm font-bold">
          <span className="inline-flex items-center gap-1.5 bg-slate-800 text-emerald-400 px-3 py-1.5 rounded-xl border border-slate-700">
            1º Cadastrar Bloco / Unidade
          </span>
          <ArrowRight size={15} className="text-slate-500 hidden sm:inline" />
          <span className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-xl shadow-xs">
            2º Criar Usuário e Perfil de Acesso
          </span>
          <ArrowRight size={15} className="text-slate-500 hidden sm:inline" />
          <span className="inline-flex items-center gap-1.5 bg-slate-800 text-sky-300 px-3 py-1.5 rounded-xl border border-slate-700">
            3º Grupo de Acesso &amp; Permissões
          </span>
        </div>
        <Link
          to="/estrutura"
          className="text-xs font-extrabold bg-white/10 hover:bg-white/20 text-white px-3.5 py-2 rounded-xl transition inline-flex items-center gap-1.5"
        >
          <Building2 size={14} /> Ver / Cadastrar Blocos &amp; Unidades
        </Link>
      </div>

      {/* FORMULÁRIO LIMPO */}
      <div className="bg-white rounded-2xl border border-slate-200 border-t-4 border-t-emerald-500 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
              <ShieldCheck size={20} className="text-emerald-600" />
              {editando ? `Editar Usuário — ${form.nome}` : 'Cadastrar Usuário e Permissões de Acesso'}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Cadastre operadores de portaria, síndicos, subsíndicos ou acessos de moradores vinculados à unidade.
            </p>
          </div>
          {editando && (
            <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-extrabold">
              ✏️ Editando ID #{form.id}
            </span>
          )}
        </div>

        <form onSubmit={salvar} className="space-y-5">
          {/* PASSO 1: DADOS DO USUÁRIO */}
          <div>
            <div className="text-xs font-extrabold uppercase tracking-wider text-emerald-700 mb-3 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 inline-flex items-center justify-center text-[0.7rem]">1</span>
              Dados de Login do Usuário
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className={rotulo}>Nome Completo *</label>
                <input
                  required
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Ex.: João Carlos Silva"
                  className={entrada}
                />
              </div>

              <div>
                <label className={rotulo}>E-mail ou Login *</label>
                <input
                  type="text"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="Ex.: portaria@condominio.com"
                  className={entrada}
                />
              </div>

              <div>
                <label className={rotulo}>Senha {editando ? '(em branco = manter)' : '*'}</label>
                <input
                  type="password"
                  required={!editando}
                  minLength={6}
                  value={form.senha}
                  onChange={(e) => setForm({ ...form, senha: e.target.value })}
                  autoComplete="new-password"
                  placeholder="Mínimo 6 caracteres"
                  className={entrada}
                />
              </div>

              <div>
                <label className={rotulo}>Perfil / Tipo de Usuário *</label>
                <select
                  value={form.perfil}
                  onChange={(e) => setForm({ ...form, perfil: e.target.value })}
                  className={`${entrada} font-bold border-emerald-400 bg-emerald-50/40`}
                >
                  {opcoesPerfil.map((p) => (
                    <option key={p} value={p}>
                      {ROTULO_PERFIL[p] ?? p}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {super_ && !editando && condominios.length > 0 && (
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <label className={rotulo}>Condomínio</label>
              <select
                value={form.condominio_id}
                onChange={(e) => {
                  setForm({ ...form, condominio_id: e.target.value });
                  if (e.target.value) carregar(e.target.value);
                }}
                className={entrada}
              >
                <option value="">Condomínio Atual Selecionado</option>
                {condominios.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* PASSO 2: VINCULAR À UNIDADE */}
          {vinculaCondomino && (
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-extrabold uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white inline-flex items-center justify-center text-[0.7rem]">2</span>
                  Vincular à Unidade do Condomínio
                </div>
                <Link
                  to="/estrutura"
                  className="text-xs font-bold text-indigo-700 hover:text-indigo-900 underline"
                >
                  + Cadastrar nova Unidade
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
                <div className="md:col-span-2">
                  <label className={rotulo}>Bloco / Unidade *</label>
                  <select
                    required
                    value={form.unidade_id}
                    onChange={(e) => aoSelecionarCondomino(e.target.value)}
                    className={`${entrada} font-bold text-indigo-950 border-indigo-300`}
                  >
                    <option value="">— Selecione a Unidade —</option>
                    {unidades.map((u) => (
                      <option key={u.id} value={u.id}>
                        🏠 {u.bloco_nome ? `${u.bloco_nome} — ` : ''}{u.numero}
                        {u.grupo_acesso_nome ? ` (Pré-autorizado: ${u.grupo_acesso_nome})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={rotulo}>CPF (Opcional - Facial)</label>
                  <input
                    value={form.cpf}
                    onChange={(e) => setForm({ ...form, cpf: mascaraCpf(e.target.value) })}
                    placeholder="000.000.000-00"
                    maxLength={14}
                    className={entrada}
                  />
                </div>

                <div>
                  <label className={rotulo}>Telefone / WhatsApp (Opcional)</label>
                  <input
                    value={form.telefone}
                    onChange={(e) => setForm({ ...form, telefone: mascaraTelefone(e.target.value) })}
                    placeholder="(00) 00000-0000"
                    maxLength={15}
                    className={entrada}
                  />
                </div>
              </div>
            </div>
          )}

          {/* PASSO 3: PRÉ-AUTORIZAÇÃO (GRUPO DE ACESSO) */}
          {vinculaCondomino && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs font-extrabold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white inline-flex items-center justify-center text-[0.7rem]">3</span>
                  Grupo de Acesso (Pré-Autorização)
                </div>
                {unidadeSelecionada?.grupo_acesso_id && String(unidadeSelecionada.grupo_acesso_id) === form.grupo_acesso_id && (
                  <span className="inline-flex items-center gap-1 text-[0.68rem] font-extrabold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-300">
                    <Sparkles size={11} /> Pré-autorizado pela Unidade
                  </span>
                )}
              </div>

              <div>
                <label className={rotulo}>Grupo de Acesso Liberado para este Usuário</label>
                <select
                  value={form.grupo_acesso_id}
                  onChange={(e) => setForm({ ...form, grupo_acesso_id: e.target.value })}
                  className={`${entrada} font-bold text-emerald-950 border-emerald-300`}
                >
                  <option value="">— Padrão do Bloco / Portaria —</option>
                  {grupos.map((g) => (
                    <option key={g.id} value={g.id}>
                      🔑 {g.nome} ({g.terminais.length} porta(s) vinculada(s))
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-white/90 border border-emerald-200/80 rounded-xl p-3 text-xs text-slate-600 space-y-1">
                {grupoSelecionado ? (
                  <>
                    <div className="font-extrabold text-emerald-900">
                      ✓ Grupo ativo: {grupoSelecionado.nome} ({grupoSelecionado.terminais.length} controlador(es))
                    </div>
                    <p>
                      Ao salvar, este grupo fica vinculado a{' '}
                      <b>{unidadeSelecionada ? `${unidadeSelecionada.bloco_nome} — ${unidadeSelecionada.numero}` : 'sua unidade'}</b>.
                    </p>
                  </>
                ) : (
                  <p>
                    Selecione opcionalmente um <b>Grupo de Acesso</b> acima para definir portas específicas para esta unidade.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2.5 pt-2 border-t border-slate-100">
            <button
              disabled={enviando}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm shadow-sm disabled:opacity-60 cursor-pointer"
            >
              {editando ? <Save size={17} /> : < Lock size={17} />}
              {enviando
                ? 'Salvando...'
                : editando
                  ? 'Salvar Alterações do Usuário'
                  : 'Liberar Acesso do Usuário'}
            </button>
            {editando && (
              <button
                type="button"
                onClick={() => setForm(VAZIO)}
                className="inline-flex items-center gap-1.5 px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm cursor-pointer"
              >
                <X size={16} /> Cancelar Edição
              </button>
            )}
          </div>
        </form>
      </div>

      {/* TABELA DE USUÁRIOS E GESTORES CADASTRADOS */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <UsersRound size={18} className="text-emerald-600" />
            Usuários Cadastrados ({filtrados.length})
          </h3>
          <div className="relative w-full sm:w-80">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar nome, e-mail, unidade..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs font-medium outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {carregando ? (
          <div className="text-center text-slate-400 py-12">Carregando usuários...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Usuário / Login</th>
                  <th className={th}>Perfil</th>
                  <th className={th}>Unidade Vinculada</th>
                  <th className={th}>Grupo de Acesso</th>
                  <th className={`${th} text-right`}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/80">
                    <td className={td}>
                      <div className="font-extrabold text-slate-900">{u.nome}</div>
                      <div className="text-xs text-slate-500">{u.email || '—'}</div>
                    </td>

                    <td className={td}>
                      <span
                        className={`inline-block text-xs font-extrabold px-2.5 py-1 rounded-full ${
                          u.perfil === 'sindico' || u.perfil === 'subsindico'
                            ? 'bg-amber-100 text-amber-800'
                            : u.perfil === 'portaria'
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {ROTULO_PERFIL[u.perfil] ?? u.perfil}
                      </span>
                    </td>

                    <td className={td}>
                      {u.unidade_label ? (
                        <div className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-800 px-2.5 py-1 rounded-lg text-xs font-bold">
                          <Home size={13} className="text-indigo-600" />
                          {u.unidade_label}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Administração Geral ({u.condominio_nome})</span>
                      )}
                    </td>

                    <td className={td}>
                      {u.grupo_acesso_nome ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-extrabold">
                          🔑 {u.grupo_acesso_nome}
                        </span>
                      ) : u.perfil === 'sindico' || u.perfil === 'subsindico' || u.perfil === 'portaria' || u.perfil === 'superadmin' ? (
                        <span className="text-xs text-slate-500 font-semibold">Acesso Total ao Condomínio</span>
                      ) : (
                        <span className="text-xs text-slate-400">Padrão do Bloco</span>
                      )}
                    </td>

                    <td className={`${td} text-right whitespace-nowrap`}>
                      <button
                        onClick={() => editar(u)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-extrabold bg-slate-100 text-slate-700 hover:bg-slate-200 mr-1.5 cursor-pointer"
                      >
                        <Pencil size={13} /> Editar
                      </button>
                      {u.id !== 1 && (
                        <button
                          onClick={() => excluir(u)}
                          disabled={enviando}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-extrabold bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 disabled:opacity-50 cursor-pointer"
                        >
                          <Trash2 size={13} /> Excluir
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-slate-400 py-10">
                      Nenhum usuário encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
