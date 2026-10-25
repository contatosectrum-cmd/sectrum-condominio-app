import { useCallback, useEffect, useState } from 'react';
import { Key, X } from 'lucide-react';
import { api, ErroApi, origemPublica } from '../../lib/api';
import FotoUsuario from '../../components/FotoUsuario';

// Paridade com src/views/aluguel.php + AluguelController.php ("Aluguel Temporada (Airbnb)").
// Correcoes no backend:
// - Exige data_saida > data_entrada e grava validade_convite = data_saida (no legado ficava nulo e expirava sempre em 7 dias);
// - Aprovar hospede verifica autorizado_por (evita IDOR) e sincroniza a face nas catracas em portaria autonoma/remota;
// - Foto servida pela rota protegida `morador_foto_visita` (LGPD).

interface Hospede {
  id: number;
  nome_visitante: string | null;
  status: string;
  token_convite: string | null;
  data_entrada: string | null;
  data_saida: string | null;
  tem_foto: boolean;
}

const rot = 'block text-xs font-bold uppercase text-slate-600 mb-1.5';
const inp = 'w-full px-3.5 py-2.5 rounded-[9px] bg-slate-50 border border-slate-300 outline-none focus:border-violet-600';

function fmtDataHora(s: string | null): string {
  if (!s) return '—';
  const dt = new Date(s.replace(' ', 'T'));
  if (Number.isNaN(dt.getTime())) return '—';
  const d = dt.toLocaleDateString('pt-BR');
  const h = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${d} ${h}`;
}

function badgeStatus(status: string): { rotulo: string; classe: string } {
  if (status === 'convite') return { rotulo: 'Aguardando Hóspede', classe: 'bg-slate-100 text-slate-600' };
  if (status === 'aguardando_morador') return { rotulo: 'Aprovar Cadastro', classe: 'bg-yellow-100 text-yellow-800' };
  if (status === 'aguardando_portaria') return { rotulo: 'Aguardando Chegada', classe: 'bg-blue-100 text-blue-700' };
  if (status === 'presente') return { rotulo: 'Hospedado', classe: 'bg-emerald-100 text-emerald-700' };
  return { rotulo: 'Encerrado', classe: 'bg-slate-100 text-slate-600' };
}

export default function MoradorAluguel() {
  const [hospedes, setHospedes] = useState<Hospede[]>([]);
  const [form, setForm] = useState({ data_entrada: '', data_saida: '' });
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ hospedes: Hospede[] }>('morador_aluguel');
      setHospedes(r.hospedes);
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e instanceof ErroApi ? e.message : 'Erro ao carregar aluguéis.' });
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const gerar = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    try {
      const r = await api<{ mensagem: string }>('morador_temporada_gerar', { corpo: form });
      setMsg({ tipo: 'ok', texto: r.mensagem });
      setForm({ data_entrada: '', data_saida: '' });
      await carregar();
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err instanceof ErroApi ? err.message : 'Erro ao gerar link.' });
    } finally {
      setOcupado(false);
    }
  };

  const aprovar = async (id: number) => {
    if (!window.confirm('Deseja APROVAR o acesso deste hóspede?')) return;
    setOcupado(true);
    try {
      const r = await api<{ mensagem: string }>('morador_hospede_aprovar', { corpo: { hospede_id: id } });
      setMsg({ tipo: 'ok', texto: r.mensagem });
      await carregar();
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err instanceof ErroApi ? err.message : 'Erro ao aprovar hóspede.' });
    } finally {
      setOcupado(false);
    }
  };

  const cancelar = async (id: number) => {
    if (!window.confirm('Tem certeza que deseja cancelar este aluguel?')) return;
    setOcupado(true);
    try {
      const r = await api<{ mensagem: string }>('morador_temporada_cancelar', { corpo: { id } });
      setMsg({ tipo: 'ok', texto: r.mensagem });
      await carregar();
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err instanceof ErroApi ? err.message : 'Erro ao cancelar aluguel.' });
    } finally {
      setOcupado(false);
    }
  };

  const copiarLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setMsg({ tipo: 'ok', texto: 'Link copiado!' });
    } catch {
      setMsg({ tipo: 'erro', texto: 'Não foi possível copiar automaticamente. Copie manualmente.' });
    }
  };

  const urlBase = origemPublica();

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
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

      {/* Card 1 — Novo Aluguel por Temporada (Airbnb) */}
      <div className="bg-white rounded-2xl border border-slate-200 border-t-4 border-t-violet-500 p-6 shadow-sm">
        <div className="flex items-center gap-2 text-lg font-extrabold text-violet-700 mb-4">
          <Key size={20} />
          <span>Novo Aluguel por Temporada (Airbnb)</span>
        </div>

        <form onSubmit={gerar} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={rot}>Data e Hora de Entrada *</label>
              <input
                type="datetime-local"
                name="data_entrada"
                required
                value={form.data_entrada}
                onChange={(e) => setForm({ ...form, data_entrada: e.target.value })}
                className={inp}
              />
            </div>
            <div>
              <label className={rot}>Data e Hora de Saída *</label>
              <input
                type="datetime-local"
                name="data_saida"
                required
                value={form.data_saida}
                onChange={(e) => setForm({ ...form, data_saida: e.target.value })}
                className={inp}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={ocupado}
            className="w-full py-3.5 rounded-xl bg-violet-500 hover:bg-violet-600 text-white font-bold shadow-sm disabled:opacity-60"
          >
            {ocupado ? '⏳ Aguarde...' : 'Gerar Link para o Hóspede'}
          </button>
        </form>
      </div>

      {/* Card 2 — Meus Hóspedes */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="text-lg font-extrabold text-slate-900 mb-4">Meus Hóspedes</div>

        {hospedes.length === 0 ? (
          <div className="text-center py-8 text-slate-400">Nenhum aluguel registrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-extrabold uppercase text-slate-500">
                  <th className="py-3 px-3">Hóspede</th>
                  <th className="py-3 px-3">Período da Estadia</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {hospedes.map((h) => {
                  const b = badgeStatus(h.status);
                  const link = `${urlBase}?acao=convite_temporada&t=${h.token_convite ?? ''}`;
                  return (
                    <tr key={h.id}>
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-3">
                          <FotoUsuario rota={`morador_foto_visita&id=${h.id}`} temFoto={Boolean(h.tem_foto)} tamanho={60} />
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-base text-slate-900">
                              {h.nome_visitante || 'Aguardando Preenchimento'}
                            </div>
                            {h.status === 'convite' && h.token_convite && (
                              <input
                                type="text"
                                readOnly
                                value={link}
                                onClick={(e) => {
                                  (e.currentTarget as HTMLInputElement).select();
                                  copiarLink(link);
                                }}
                                title="Clique para copiar o link"
                                className="mt-1.5 w-full max-w-sm px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-mono text-slate-700 cursor-pointer"
                              />
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-xs space-y-1">
                        <div>
                          <strong className="text-slate-700">Início:</strong> {fmtDataHora(h.data_entrada)}
                        </div>
                        <div>
                          <strong className="text-red-500">Fim:</strong> {fmtDataHora(h.data_saida)}
                        </div>
                      </td>
                      <td className="py-3.5 px-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${b.classe}`}>{b.rotulo}</span>
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        {h.status === 'aguardando_morador' ? (
                          <button
                            type="button"
                            disabled={ocupado}
                            onClick={() => aprovar(h.id)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold disabled:opacity-60"
                          >
                            ✅ Aprovar
                          </button>
                        ) : h.status === 'convite' || h.status === 'aguardando_portaria' ? (
                          <button
                            type="button"
                            disabled={ocupado}
                            onClick={() => cancelar(h.id)}
                            className="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-bold disabled:opacity-60"
                          >
                            Cancelar
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
