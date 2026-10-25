import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api, ErroApi } from '../lib/api';

// Paridade com src/views/avisos.php: "📢 Publicar no Mural de Avisos" (título, mensagem, prioridade) e
// "Comunicados Ativos" (últimos 20, urgentes destacados, data de publicação e Excluir).

interface Aviso { id: number; titulo: string; mensagem: string; prioridade: string; criado_em: string }
interface Msg { tipo: 'ok' | 'erro'; mensagem: string }

const fmt = (s: string) => new Date(s.replace(' ', 'T')).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
const rot = 'block text-sm font-bold text-slate-600 mb-1.5';
const inp = 'w-full px-3 py-2.5 border border-slate-300 rounded-lg outline-none focus:border-amber-500 bg-white';

export default function Avisos() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [form, setForm] = useState({ titulo: '', mensagem: '', prioridade: 'normal' });
  const [msg, setMsg] = useState<Msg | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setAvisos((await api<{ avisos: Aviso[] }>('avisos_listar')).avisos);
    } catch (e) {
      setMsg({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro ao carregar avisos.' });
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const executar = async (rota: string, corpo: Record<string, unknown>, depois?: () => void) => {
    setOcupado(true);
    try {
      const r = await api<{ mensagem: string }>(rota, { corpo });
      setMsg({ tipo: 'ok', mensagem: r.mensagem });
      depois?.();
      await carregar();
    } catch (e) {
      setMsg({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro inesperado.' });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 lg:p-8 space-y-6">
      {msg && (
        <div className={`border-l-4 px-4 py-3 rounded-lg text-sm font-semibold flex justify-between gap-3 ${msg.tipo === 'ok' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-rose-50 border-rose-500 text-rose-800'}`}>
          <span>{msg.mensagem}</span><button onClick={() => setMsg(null)} aria-label="Fechar aviso"><X size={16} /></button>
        </div>
      )}
      <div className="bg-white rounded-2xl border border-slate-200 border-t-4 border-t-amber-500 p-6 shadow-sm">
        <div className="text-lg font-extrabold text-amber-800 mb-4">📢 Publicar no Mural de Avisos</div>
        <form onSubmit={(e) => { e.preventDefault(); executar('aviso_publicar', form, () => setForm({ titulo: '', mensagem: '', prioridade: 'normal' })); }} className="space-y-3">
          <div><label className={rot}>Título do Comunicado</label><input required value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className={inp} /></div>
          <div><label className={rot}>Mensagem</label><textarea required rows={3} value={form.mensagem} onChange={(e) => setForm({ ...form, mensagem: e.target.value })} className={inp} /></div>
          <div><label className={rot}>Prioridade</label>
            <select value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value })} className={inp}>
              <option value="normal">Informativo Normal</option><option value="alta">⚠️ Urgente / Atenção</option>
            </select></div>
          <button disabled={ocupado} className="mt-2 px-5 py-2.5 rounded-xl border border-slate-300 bg-white font-bold hover:bg-slate-50 disabled:opacity-60">Publicar Aviso no Painel</button>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="text-lg font-extrabold text-slate-900 mb-4">Comunicados Ativos</div>
        {avisos.map((a) => (
          <div key={a.id} className={`rounded-xl p-4 mb-3 border ${a.prioridade === 'alta' ? 'bg-orange-50 border-orange-200 border-l-4 border-l-amber-500' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex justify-between items-start gap-3">
              <div>
                <h3 className="mb-1.5 text-slate-900 text-lg font-bold">{a.titulo}</h3>
                <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{a.mensagem}</p>
                <div className="text-xs text-slate-400 mt-2.5">Publicado em: {fmt(a.criado_em)}</div>
              </div>
              <button disabled={ocupado} onClick={() => window.confirm('Remover este aviso do mural permanentemente?') && executar('aviso_excluir', { id: a.id })}
                className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 text-xs font-bold shrink-0 disabled:opacity-60">Excluir</button>
            </div>
          </div>
        ))}
        {avisos.length === 0 && <div className="text-center text-slate-400 py-10">Nenhum aviso ativo no mural hoje.</div>}
      </div>
    </div>
  );
}
