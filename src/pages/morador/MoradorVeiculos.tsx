import { useCallback, useEffect, useState } from 'react';
import { Car, Lock, X } from 'lucide-react';
import { api, ErroApi } from '../../lib/api';

// Paridade com src/views/meus_veiculos.php + MeusVeiculosController.php ("Meus Veiculos").
// Correcoes no backend:
// - O legado fazia INSERT na coluna inexistente `criado_em` (o cadastro dava erro 500);
// - O botao "Remover" enviava POST, mas o controller so lia GET ?excluir_veiculo= (nao removia nada).

interface VeiculoMorador {
  id: number;
  placa: string;
  modelo: string;
  cor: string;
}

const rot = 'block text-xs font-bold uppercase text-slate-600 mb-1.5';
const inp = 'w-full px-3.5 py-2.5 rounded-[9px] bg-slate-50 border border-slate-300 outline-none focus:border-blue-600';

export default function MoradorVeiculos() {
  const [veiculos, setVeiculos] = useState<VeiculoMorador[]>([]);
  const [form, setForm] = useState({ placa: '', modelo: '', cor: '' });
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ veiculos: VeiculoMorador[] }>('morador_veiculos');
      setVeiculos(r.veiculos);
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e instanceof ErroApi ? e.message : 'Erro ao carregar veículos.' });
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    try {
      const r = await api<{ mensagem: string }>('morador_veiculo_salvar', { corpo: form });
      setMsg({ tipo: 'ok', texto: r.mensagem });
      setForm({ placa: '', modelo: '', cor: '' });
      await carregar();
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err instanceof ErroApi ? err.message : 'Erro ao cadastrar veículo.' });
    } finally {
      setOcupado(false);
    }
  };

  const remover = async (id: number) => {
    if (!window.confirm('Tem certeza que deseja remover este veículo?')) return;
    setOcupado(true);
    try {
      const r = await api<{ mensagem: string }>('morador_veiculo_excluir', { corpo: { veiculo_id: id } });
      setMsg({ tipo: 'ok', texto: r.mensagem });
      await carregar();
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err instanceof ErroApi ? err.message : 'Erro ao remover veículo.' });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {msg && (
        <div
          className={`border-l-4 px-4 py-3 rounded-lg text-sm font-semibold flex justify-between items-center gap-3 ${
            msg.tipo === 'ok' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-rose-50 border-rose-500 text-rose-800'
          }`}
        >
          <span>{msg.texto}</span>
          <button onClick={() => setMsg(null)} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Card 1 — Cadastrar Veículo */}
      <div className="bg-white rounded-2xl border border-slate-200 border-t-4 border-t-blue-600 p-6 shadow-sm">
        <div className="flex items-center gap-2 text-lg font-extrabold text-blue-700 mb-4">
          <Car size={20} />
          <span>Cadastrar Veículo</span>
        </div>

        <form onSubmit={salvar} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={rot}>Placa *</label>
              <input
                type="text"
                name="placa"
                required
                maxLength={7}
                autoComplete="off"
                placeholder="ABC1D23"
                value={form.placa}
                onChange={(e) => setForm({ ...form, placa: e.target.value.toUpperCase() })}
                className={`${inp} uppercase font-mono font-bold`}
              />
            </div>
            <div>
              <label className={rot}>Modelo e Marca *</label>
              <input
                type="text"
                name="modelo"
                required
                placeholder="Ex: Toyota Corolla"
                value={form.modelo}
                onChange={(e) => setForm({ ...form, modelo: e.target.value })}
                className={inp}
              />
            </div>
            <div>
              <label className={rot}>Cor *</label>
              <input
                type="text"
                name="cor"
                required
                placeholder="Ex: Preto"
                value={form.cor}
                onChange={(e) => setForm({ ...form, cor: e.target.value })}
                className={inp}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={ocupado}
            className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-base shadow-sm disabled:opacity-60"
          >
            {ocupado ? '⏳ Aguarde...' : 'Salvar Veículo'}
          </button>
        </form>
      </div>

      {/* Card 2 — Meus Veículos Autorizados */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center gap-2 text-lg font-extrabold text-slate-900 mb-4">
          <Lock size={18} className="text-slate-600" />
          <span>Meus Veículos Autorizados</span>
        </div>

        {veiculos.length === 0 ? (
          <div className="text-center py-8 text-slate-400">Nenhum veículo cadastrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-extrabold uppercase text-slate-500">
                  <th className="py-3 px-3">Placa</th>
                  <th className="py-3 px-3">Modelo / Marca</th>
                  <th className="py-3 px-3">Cor</th>
                  <th className="py-3 px-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {veiculos.map((v) => (
                  <tr key={v.id}>
                    <td className="py-3 px-3">
                      <span className="inline-block font-mono font-extrabold text-base bg-slate-100 border-2 border-slate-300 rounded-md px-2.5 py-0.5 text-slate-900">
                        {v.placa}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-800">{v.modelo}</td>
                    <td className="py-3 px-3 text-slate-600">{v.cor}</td>
                    <td className="py-3 px-3 text-right">
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => remover(v.id)}
                        className="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-bold disabled:opacity-60"
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
