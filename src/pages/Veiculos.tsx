import { useCallback, useEffect, useMemo, useState } from 'react';
import { Truck, Save, List, CheckCircle, Ban, Trash2, Info, X } from 'lucide-react';
import { api, ErroApi } from '../lib/api';

// Paridade com src/views/veiculos.php: "Cadastrar Novo Veículo na Garagem" (placa, vaga, modelo/marca, cor, categoria,
// proprietário) e "Controle de Garagem e Acessos" (busca por placa ou dono, abas Autorizados / Bloqueados / Lixeira
// com Bloquear, Liberar, Lixeira, Restaurar e Excluir permanente).

interface Veiculo {
  id: number; placa: string; modelo: string | null; cor: string | null; tipo: string | null; vaga_garagem: string | null; status: string;
  proprietario: string | null; proprietario_tipo: string | null; unidade: string | null; bloco: string | null;
}
interface Pessoa { id: number; nome: string; tipo: string | null; unidade: string | null; bloco: string | null }
interface Aviso { tipo: 'ok' | 'erro'; mensagem: string }
type Aba = 'aprovado' | 'bloqueado' | 'lixeira';

const VAZIO = { placa: '', vaga_garagem: '', modelo: '', cor: '', tipo_veiculo: 'Carro', usuario_id: '' };
const rot = 'block text-sm font-bold text-slate-600 mb-1.5';
const inp = 'w-full px-3 py-2.5 border border-slate-300 rounded-lg outline-none focus:border-blue-500 bg-white';
const th = 'text-left text-[0.72rem] font-extrabold uppercase tracking-wide text-slate-500 px-4 py-3 border-b border-slate-200';
const td = 'px-4 py-3 border-b border-slate-100 text-sm';

export default function Veiculos() {
  const [lista, setLista] = useState<Veiculo[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('');
  const [aba, setAba] = useState<Aba>('aprovado');
  const [form, setForm] = useState(VAZIO);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ veiculos: Veiculo[]; pessoas: Pessoa[] }>('veiculos_listar', { query: { busca: filtro } });
      setLista(r.veiculos);
      setPessoas(r.pessoas);
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro ao carregar veículos.' });
    }
  }, [filtro]);
  useEffect(() => { carregar(); }, [carregar]);

  const executar = async (rota: string, corpo: Record<string, unknown>, depois?: () => void) => {
    setOcupado(true);
    try {
      const r = await api<{ mensagem: string }>(rota, { corpo });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      depois?.();
      await carregar();
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro inesperado.' });
    } finally {
      setOcupado(false);
      document.querySelector('main .overflow-auto')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };
  const status = (v: Veiculo, s: Aba, pergunta?: string) => { if (!pergunta || window.confirm(pergunta)) executar('veiculo_status', { id: v.id, status: s }); };

  const grupos = useMemo(() => ({
    aprovado: lista.filter((v) => v.status === 'aprovado'),
    bloqueado: lista.filter((v) => v.status === 'bloqueado'),
    lixeira: lista.filter((v) => v.status === 'lixeira'),
  }), [lista]);
  const dono = (v: Veiculo) => v.proprietario ?? '—';

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8 space-y-5">
      {aviso && (
        <div className={`border-l-4 px-4 py-3 rounded-lg text-sm font-semibold flex justify-between gap-3 ${aviso.tipo === 'ok' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-rose-50 border-rose-500 text-rose-800'}`}>
          <span>{aviso.mensagem}</span><button onClick={() => setAviso(null)} aria-label="Fechar aviso"><X size={16} /></button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 border-t-4 border-t-blue-500 p-6 shadow-sm">
        <div className="flex items-center gap-2 text-lg font-extrabold text-slate-900 mb-4"><Truck size={18} /> Cadastrar Novo Veículo na Garagem</div>
        <form onSubmit={(e) => { e.preventDefault(); executar('veiculo_salvar', form, () => setForm(VAZIO)); }}>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div><label className={rot}>Placa *</label><input required value={form.placa} onChange={(e) => setForm({ ...form, placa: e.target.value })} placeholder="ABC-1234" className={`${inp} uppercase font-mono text-lg border-2`} /></div>
            <div><label className={rot}>Vaga de Garagem</label><input value={form.vaga_garagem} onChange={(e) => setForm({ ...form, vaga_garagem: e.target.value })} placeholder="Ex: 42-A, Subsolo 3" className={inp} /></div>
            <div><label className={rot}>Modelo / Marca</label><input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} placeholder="Ex: Corolla / Toyota" className={inp} /></div>
            <div><label className={rot}>Cor</label><input value={form.cor} onChange={(e) => setForm({ ...form, cor: e.target.value })} placeholder="Ex: Prata" className={inp} /></div>
            <div><label className={rot}>Categoria</label>
              <select value={form.tipo_veiculo} onChange={(e) => setForm({ ...form, tipo_veiculo: e.target.value })} className={inp}><option>Carro</option><option>Moto</option><option>Utilitário</option></select></div>
            <div className="md:col-span-2 lg:col-span-3"><label className={rot}>Proprietário (Morador / Funcionário) *</label>
              <select required value={form.usuario_id} onChange={(e) => setForm({ ...form, usuario_id: e.target.value })} className={inp}>
                <option value="">Selecione quem é o titular...</option>
                {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.unidade ? ` — ${p.bloco ? `${p.bloco}/` : ''}${p.unidade}` : ''}{p.tipo ? ` (${p.tipo})` : ''}</option>)}
              </select></div>
          </div>
          <button disabled={ocupado} className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-60"><Save size={15} /> Salvar Veículo</button>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center gap-2 text-lg font-extrabold text-slate-900 mb-4"><List size={18} /> Controle de Garagem e Acessos</div>
        <form onSubmit={(e) => { e.preventDefault(); setFiltro(busca); }} className="flex gap-3 mb-5 bg-slate-50 p-3.5 rounded-xl flex-wrap items-end">
          <div className="flex-1 min-w-[160px]"><label className={rot}>Buscar por Placa ou Dono</label><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Placa ou nome..." className={inp} /></div>
          <button className="px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-bold">Filtrar</button>
          {filtro && <button type="button" onClick={() => { setBusca(''); setFiltro(''); }} className="px-4 py-2.5 rounded-lg bg-red-50 text-red-600 border border-red-200 text-sm font-bold">Limpar</button>}
        </form>

        <div className="flex gap-2 mb-5 flex-wrap">
          {([['aprovado', 'Autorizados', <CheckCircle size={13} />], ['bloqueado', 'Bloqueados', <Ban size={13} />], ['lixeira', 'Lixeira', <Trash2 size={13} />]] as const).map(([id, r, ic]) => (
            <button key={id} onClick={() => setAba(id)} className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold border ${aba === id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{ic} {r} ({grupos[id].length})</button>
          ))}
        </div>

        <div className="overflow-x-auto">
          {aba === 'aprovado' && (
            <table className="w-full">
              <thead><tr>{['Placa', 'Veículo', 'Proprietário', 'Unidade / Vaga'].map((h) => <th key={h} className={th}>{h}</th>)}<th className={`${th} text-center w-[120px]`}>Ações</th></tr></thead>
              <tbody>
                {grupos.aprovado.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50">
                    <td className={td}><span className="bg-slate-50 border-2 border-slate-300 px-3 py-1 rounded-md inline-block font-mono text-lg font-bold text-slate-900">{v.placa}</span></td>
                    <td className={td}><span className="px-2 py-0.5 rounded text-xs font-bold uppercase bg-indigo-100 text-indigo-800">{v.tipo ?? 'Carro'}</span><div className="text-slate-600 font-medium mt-1">{`${v.modelo ?? ''}${v.cor ? ` · ${v.cor}` : ''}`.trim()}</div></td>
                    <td className={td}><div className="font-semibold text-slate-900">{dono(v)}</div><div className="text-xs text-slate-500">{v.proprietario_tipo ?? ''}</div></td>
                    <td className={td}><div className="text-slate-600">{v.bloco ? `${v.bloco} / ${v.unidade ?? ''}` : '—'}</div>{v.vaga_garagem && <span className="bg-green-50 text-emerald-800 px-2 py-0.5 rounded text-xs font-semibold inline-block mt-1">Vaga {v.vaga_garagem}</span>}</td>
                    <td className={`${td} text-center`}>
                      <div className="flex gap-1 justify-center">
                        <button disabled={ocupado} onClick={() => status(v, 'bloqueado', 'Bloquear o acesso deste veículo?')} className="px-2.5 py-1.5 rounded-lg bg-slate-600 text-white text-xs font-bold disabled:opacity-60">Bloquear</button>
                        <button disabled={ocupado} onClick={() => status(v, 'lixeira', 'Mover este veículo para a lixeira?')} title="Lixeira" className="p-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 disabled:opacity-60"><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {grupos.aprovado.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400 py-10">Nenhum veículo com acesso autorizado.</td></tr>}
              </tbody>
            </table>
          )}
          {aba === 'bloqueado' && (
            <table className="w-full">
              <thead><tr>{['Placa', 'Veículo', 'Proprietário', 'Status'].map((h) => <th key={h} className={th}>{h}</th>)}<th className={`${th} text-center w-[100px]`}>Ação</th></tr></thead>
              <tbody>
                {grupos.bloqueado.map((v) => (
                  <tr key={v.id} className="bg-red-50">
                    <td className={`${td} line-through font-mono text-lg font-bold text-red-500`}>{v.placa}</td>
                    <td className={`${td} text-slate-600`}>{`${v.modelo ?? ''}${v.cor ? ` — ${v.cor}` : ''}`}</td>
                    <td className={`${td} font-semibold text-slate-900`}>{dono(v)}</td>
                    <td className={td}><span className="bg-red-100 text-red-800 px-2 py-0.5 rounded text-xs font-semibold">Bloqueado</span></td>
                    <td className={`${td} text-center`}><button disabled={ocupado} onClick={() => status(v, 'aprovado', 'Liberar acesso novamente?')} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold disabled:opacity-60">Liberar</button></td>
                  </tr>
                ))}
                {grupos.bloqueado.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400 py-10">Nenhum veículo bloqueado.</td></tr>}
              </tbody>
            </table>
          )}
          {aba === 'lixeira' && (
            <>
              <div className="bg-slate-100 px-3.5 py-2.5 text-sm text-slate-600 mb-3 rounded-lg flex items-center gap-2"><Info size={14} /> Veículos aqui não têm acesso. Podem ser excluídos permanentemente.</div>
              <table className="w-full">
                <thead><tr><th className={th}>Placa</th><th className={th}>Proprietário</th><th className={`${th} text-center w-[180px]`}>Ações Definitivas</th></tr></thead>
                <tbody>
                  {grupos.lixeira.map((v) => (
                    <tr key={v.id}>
                      <td className={`${td} font-mono text-lg text-slate-400`}><del>{v.placa}</del></td>
                      <td className={`${td} text-slate-500`}>{dono(v)}</td>
                      <td className={`${td} text-center`}>
                        <div className="flex gap-1 justify-center">
                          <button disabled={ocupado} onClick={() => status(v, 'aprovado')} className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-bold disabled:opacity-60">Restaurar</button>
                          <button disabled={ocupado} onClick={() => window.confirm('Excluir PERMANENTEMENTE?') && executar('veiculo_excluir', { id: v.id })} className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 text-xs font-bold disabled:opacity-60">Excluir</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {grupos.lixeira.length === 0 && <tr><td colSpan={3} className="text-center text-slate-400 py-10">A lixeira está vazia.</td></tr>}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
