import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Lock, Pencil, Trash2, Save, X, Search } from 'lucide-react';
import { api, ErroApi } from '../lib/api';

// Paridade com src/views/usuarios.php ("Gestão de Acessos"): card "Criar Novo Acesso" / "Editar Utilizador"
// e card "Lista de Acessos" (Nome/E-mail, Perfil, Condomínio, Ações). A busca é um extra só no navegador.

interface UsuarioAcesso {
  id: number; nome: string; email: string; perfil: string;
  unidade_id: number | null; condominio_id: number | null; condominio_nome: string | null;
}
interface Condominio { id: number; nome: string }
interface Aviso { tipo: 'ok' | 'erro'; mensagem: string }
interface Form { id: number | null; nome: string; email: string; senha: string; perfil: string; unidade_id: string; condominio_id: string }

const ROTULO_PERFIL: Record<string, string> = {
  portaria: 'Operador de Portaria',
  sindico: 'Síndico / Gestor',
  morador: 'Morador (Acesso App)',
  superadmin: 'Super Admin',
};
const VAZIO: Form = { id: null, nome: '', email: '', senha: '', perfil: 'portaria', unidade_id: '', condominio_id: '' };

const rotulo = 'block text-[0.78rem] font-bold text-slate-600 mb-1.5';
const entrada = 'w-full px-3 py-2.5 border border-slate-300 rounded-lg outline-none focus:border-emerald-500 bg-white text-slate-900';
const th = 'text-left text-[0.72rem] font-extrabold uppercase tracking-wide text-slate-500 px-4 py-3 border-b border-slate-200';
const td = 'px-4 py-3 border-b border-slate-100 text-sm';

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioAcesso[]>([]);
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [perfis, setPerfis] = useState<string[]>(['portaria', 'sindico', 'morador']);
  const [super_, setSuper] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [form, setForm] = useState<Form>(VAZIO);
  const [enviando, setEnviando] = useState(false);
  const [busca, setBusca] = useState('');

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ super: boolean; perfis: string[]; condominios: Condominio[]; usuarios: UsuarioAcesso[] }>('listar_usuarios');
      setUsuarios(r.usuarios);
      setCondominios(r.condominios);
      setPerfis(r.perfis);
      setSuper(r.super);
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro ao carregar os acessos.' });
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const rolarTopo = () => document.querySelector('main .overflow-auto')?.scrollTo({ top: 0, behavior: 'smooth' });

  const executar = async (rota: string, corpo: Record<string, unknown>, aoConcluir?: () => void) => {
    setEnviando(true);
    try {
      const r = await api<{ mensagem: string }>(rota, { corpo });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      aoConcluir?.();
      await carregar();
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro inesperado.' });
    } finally {
      setEnviando(false);
      rolarTopo();
    }
  };

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    const corpo: Record<string, unknown> = {
      nome: form.nome, email: form.email, senha: form.senha, perfil: form.perfil,
      unidade_id: form.perfil === 'morador' ? form.unidade_id : '',
    };
    if (form.id) corpo.id = form.id;
    else if (super_) corpo.condominio_id = form.condominio_id;
    executar('usuario_salvar', corpo, () => setForm(VAZIO));
  };

  const editar = (u: UsuarioAcesso) => {
    setForm({ id: u.id, nome: u.nome, email: u.email, senha: '', perfil: u.perfil, unidade_id: u.unidade_id ? String(u.unidade_id) : '', condominio_id: '' });
    rolarTopo();
  };

  const excluir = (u: UsuarioAcesso) => {
    if (window.confirm(`Remover o utilizador ${u.nome}?`)) {
      executar('usuario_excluir', { id: u.id }, () => { if (form.id === u.id) setForm(VAZIO); });
    }
  };

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return usuarios;
    return usuarios.filter((u) => `${u.nome} ${u.email} ${u.perfil} ${u.condominio_nome ?? ''}`.toLowerCase().includes(t));
  }, [usuarios, busca]);

  const editando = form.id !== null;
  // Mantém visível um perfil que o usuário logado não pode atribuir (ex.: síndico editando conta "admin")
  const opcoesPerfil = perfis.includes(form.perfil) ? perfis : [...perfis, form.perfil];
  const muda = (campo: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [campo]: e.target.value });

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8">
      {aviso && (
        <div className={`border-l-4 px-4 py-3 rounded-lg text-sm font-semibold mb-5 flex justify-between gap-3 ${aviso.tipo === 'ok' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-rose-50 border-rose-500 text-rose-800'}`}>
          <span>{aviso.mensagem}</span>
          <button onClick={() => setAviso(null)} aria-label="Fechar aviso"><X size={16} /></button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 border-t-4 border-t-emerald-500 p-6 shadow-sm mb-6">
        <div className="flex items-center gap-2 text-lg font-extrabold text-emerald-800 mb-5">
          <ShieldCheck size={18} /> {editando ? 'Editar Utilizador' : 'Criar Novo Acesso'}
        </div>
        <form onSubmit={salvar}>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div><label className={rotulo}>Nome Completo *</label><input required value={form.nome} onChange={muda('nome')} className={entrada} /></div>
            <div><label className={rotulo}>E-mail (Login) *</label><input type="email" required value={form.email} onChange={muda('email')} className={entrada} /></div>
            <div>
              <label className={rotulo}>Senha {editando ? '(deixe em branco para manter)' : '*'}</label>
              <input type="password" required={!editando} minLength={6} value={form.senha} onChange={muda('senha')} autoComplete="new-password" className={entrada} />
            </div>
            <div>
              <label className={rotulo}>Nível de Acesso *</label>
              <select value={form.perfil} onChange={muda('perfil')} className={entrada}>
                {opcoesPerfil.map((p) => <option key={p} value={p}>{ROTULO_PERFIL[p] ?? p}</option>)}
              </select>
            </div>
            {form.perfil === 'morador' && (
              <div className="md:col-span-2 lg:col-span-4">
                <label className={rotulo}>Vincular a qual Unidade (ID da Estrutura)? *</label>
                <input type="number" required value={form.unidade_id} onChange={muda('unidade_id')} className={entrada} />
              </div>
            )}
            {super_ && !editando && (
              <div className="md:col-span-2 lg:col-span-4">
                <label className={rotulo}>Vincular a qual Condomínio?</label>
                <select value={form.condominio_id} onChange={muda('condominio_id')} className={entrada}>
                  <option value="">Acesso Geral / Sectrum</option>
                  {condominios.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="flex gap-2.5 mt-5 flex-wrap">
            <button disabled={enviando} className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold disabled:opacity-60 ${editando ? 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}>
              {editando ? <><Save size={15} /> Atualizar Registo</> : <><ShieldCheck size={15} /> Gerar Acesso</>}
            </button>
            {editando && (
              <button type="button" onClick={() => setForm(VAZIO)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">
                <X size={15} /> Cancelar
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div className="flex items-center gap-2 text-lg font-extrabold text-slate-900"><Lock size={18} /> Lista de Acessos ({usuarios.length})</div>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, e-mail, perfil..." className="pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-emerald-500 w-64" />
          </div>
        </div>
        {carregando ? (
          <div className="text-center text-slate-400 py-12">Carregando acessos...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr><th className={th}>Nome / E-mail</th><th className={th}>Perfil</th><th className={th}>Condomínio</th><th className={`${th} text-right w-[100px]`}>Ações</th></tr></thead>
              <tbody>
                {filtrados.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className={td}>
                      <b className="text-slate-900">{u.nome}</b>
                      <div className="text-[0.83em] text-slate-500">{u.email}</div>
                    </td>
                    <td className={td}><span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[0.72em] font-bold uppercase">{u.perfil}</span></td>
                    <td className={`${td} text-emerald-500 font-semibold`}>{u.condominio_nome ?? 'Sectrum'}</td>
                    <td className={`${td} text-right`}>
                      <div className="flex gap-1.5 justify-end">
                        <button onClick={() => editar(u)} title="Editar" className="p-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"><Pencil size={12} /></button>
                        {u.id !== 1 && (
                          <button disabled={enviando} onClick={() => excluir(u)} title="Remover" className="p-2 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-50"><Trash2 size={12} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtrados.length === 0 && <tr><td colSpan={4} className="text-center text-slate-400 py-10">{busca ? 'Nenhum acesso encontrado.' : 'Nenhum acesso criado ainda.'}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
