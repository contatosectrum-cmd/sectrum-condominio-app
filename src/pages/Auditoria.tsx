import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Search, X } from 'lucide-react';
import { api, ErroApi } from '../lib/api';

// Paridade com src/views/auditoria.php ("Log de Auditoria"): total de registros, filtros (condomínio só para o
// superadmin, busca, de/até, tipo de ação), tabela Data/Hora, [Condomínio], Usuário, Ação, Descrição, IP e paginação de 50.

interface Log { id: number; criado_em: string; usuario_nome: string | null; acao: string | null; descricao: string | null; ip: string | null; condo_nome: string | null }
interface Resp { super: boolean; cond_fil: number; logs: Log[]; total: number; pagina: number; paginas: number; acoes: string[]; condominios: { id: number; nome: string }[] }
interface Filtros { cond_fil: string; busca: string; data_de: string; data_ate: string; acao_fil: string }

const VAZIO: Filtros = { cond_fil: '0', busca: '', data_de: '', data_ate: '', acao_fil: '' };
// Mesmos rótulos e cores do _audBadge() do legado; demais ações aparecem com "_" trocado por espaço
const BADGES: Record<string, [string, string]> = {
  morador_cadastrado: ['bg-emerald-100 text-emerald-800', 'Cadastro'], morador_editado: ['bg-blue-100 text-blue-700', 'Edição'],
  morador_excluido: ['bg-red-100 text-red-800', 'Exclusão'], morador_status: ['bg-amber-100 text-amber-800', 'Status'],
  precadastro_aprovado: ['bg-emerald-100 text-emerald-800', 'Aprovação'], precadastro_rejeitado: ['bg-red-100 text-red-800', 'Rejeição'],
  link_gerado: ['bg-violet-100 text-violet-700', 'Link Gerado'], veiculo_cadastrado: ['bg-sky-100 text-sky-700', 'Veículo'],
  veiculo_status: ['bg-amber-100 text-amber-800', 'Veíc. Status'], veiculo_excluido: ['bg-red-100 text-red-800', 'Veíc. Excluído'],
  camera_visualizada: ['bg-green-50 text-green-600', 'Câmera'], porta_aberta: ['bg-fuchsia-50 text-purple-600', 'Porta'],
};
const rot = 'block text-xs font-bold text-slate-600 uppercase mb-1.5';
const inp = 'w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-blue-500 bg-white text-sm';
const fmt = (s: string) => new Date(s.replace(' ', 'T')).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');

export default function Auditoria() {
  const [form, setForm] = useState<Filtros>(VAZIO);
  const [filtros, setFiltros] = useState<Filtros>(VAZIO);
  const [pag, setPag] = useState(1);
  const [d, setD] = useState<Resp | null>(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try {
      setD(await api<Resp>('auditoria_listar', { query: { ...filtros, pag } }));
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Erro ao carregar a auditoria.');
    }
  }, [filtros, pag]);
  useEffect(() => { carregar(); }, [carregar]);

  const temFiltro = !!(filtros.busca || filtros.data_de || filtros.data_ate || filtros.acao_fil || Number(filtros.cond_fil));
  const colunas = d?.super ? 6 : 5;

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8">
      {erro && <div className="border-l-4 px-4 py-3 rounded-lg text-sm font-semibold mb-5 flex justify-between bg-rose-50 border-rose-500 text-rose-800"><span>{erro}</span><button onClick={() => setErro('')}><X size={16} /></button></div>}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center gap-2 text-lg font-extrabold text-slate-900 mb-4">
          <ShieldCheck size={18} /> Log de Auditoria
          {!!d?.total && <span className="ml-auto text-sm text-slate-500 font-medium"><b>{d.total.toLocaleString('pt-BR')}</b> registros</span>}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setFiltros(form); setPag(1); }} className="mb-5">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 bg-slate-50 p-3.5 rounded-xl">
            {d?.super && (
              <div><label className={rot}>Condomínio</label>
                <select value={form.cond_fil} onChange={(e) => setForm({ ...form, cond_fil: e.target.value })} className={inp}>
                  <option value="0">Todos os condomínios</option>{d.condominios.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select></div>
            )}
            <div><label className={rot}>Buscar</label><input value={form.busca} onChange={(e) => setForm({ ...form, busca: e.target.value })} placeholder="Nome do usuário ou descrição..." className={inp} /></div>
            <div><label className={rot}>De (data)</label><input type="date" value={form.data_de} onChange={(e) => setForm({ ...form, data_de: e.target.value })} className={inp} /></div>
            <div><label className={rot}>Até (data)</label><input type="date" value={form.data_ate} onChange={(e) => setForm({ ...form, data_ate: e.target.value })} className={inp} /></div>
            {!!d?.acoes.length && (
              <div><label className={rot}>Tipo de Ação</label>
                <select value={form.acao_fil} onChange={(e) => setForm({ ...form, acao_fil: e.target.value })} className={inp}>
                  <option value="">Todas as ações</option>{d.acoes.map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
                </select></div>
            )}
          </div>
          <div className="flex gap-2 mt-3">
            <button className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold"><Search size={13} /> Filtrar</button>
            {temFiltro && <button type="button" onClick={() => { setForm(VAZIO); setFiltros(VAZIO); setPag(1); }} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 text-sm font-bold">✕ Limpar</button>}
          </div>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr>
              {['Data / Hora', ...(d?.super ? ['Condomínio'] : []), 'Usuário', 'Ação', 'Descrição', 'IP'].map((h) => <th key={h} className="text-left text-[0.72rem] font-extrabold uppercase tracking-wide text-slate-500 px-4 py-3 border-b border-slate-200 whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody>
              {(d?.logs ?? []).map((l) => {
                const [cor, rotulo] = BADGES[l.acao ?? ''] ?? ['bg-slate-100 text-slate-600', (l.acao ?? '').replace(/_/g, ' ')];
                return (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 border-b border-slate-100 text-sm text-slate-500 font-medium whitespace-nowrap">{fmt(l.criado_em)}</td>
                    {d?.super && <td className="px-4 py-3 border-b border-slate-100 text-xs text-slate-600">{l.condo_nome ?? '—'}</td>}
                    <td className="px-4 py-3 border-b border-slate-100 text-sm"><b className="text-slate-900">{l.usuario_nome}</b></td>
                    <td className="px-4 py-3 border-b border-slate-100"><span className={`px-2.5 py-0.5 rounded-full text-[0.73em] font-bold whitespace-nowrap ${cor}`}>{rotulo}</span></td>
                    <td className="px-4 py-3 border-b border-slate-100 text-sm text-slate-700 max-w-[320px]">{l.descricao}</td>
                    <td className="px-4 py-3 border-b border-slate-100 font-mono text-xs text-slate-400">{l.ip ?? '—'}</td>
                  </tr>
                );
              })}
              {d && d.logs.length === 0 && (
                <tr><td colSpan={colunas} className="text-center text-slate-400 py-10"><ShieldCheck size={32} className="mx-auto mb-2" strokeWidth={1.5} />
                  {d.super && !d.cond_fil ? 'Selecione um condomínio ou aguarde as primeiras ações.' : 'Nenhuma ação registrada ainda.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {d && d.paginas > 1 && (
          <div className="flex gap-1.5 mt-5 flex-wrap justify-center">
            {Array.from({ length: d.paginas }, (_, i) => i + 1).map((n) => (
              <button key={n} onClick={() => setPag(n)} className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${n === d.pagina ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{n}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
