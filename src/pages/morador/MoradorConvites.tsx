import { useCallback, useEffect, useState } from 'react';
import { Smartphone, Plus, Calendar, Users, X } from 'lucide-react';
import { api, ErroApi, origemPublica } from '../../lib/api';
import FotoUsuario from '../../components/FotoUsuario';

// Paridade com src/views/meus_convites.php + MeusConvitesController.php ("Convites e Visitas").
// Correcao no backend: aprovar_convite sincroniza a face nas catracas (no legado faltava `use Hikvision\HikvisionAPI`).

interface Convite {
  id: number;
  nome_visitante: string | null;
  documento: string | null;
  status: string;
  criado_em: string | null;
  token_convite: string | null;
  tem_foto: boolean;
}

function formatarCpf(doc: string | null): string {
  if (!doc) return '';
  const d = doc.replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return doc;
}

function formatarDataHora(s: string | null): string {
  if (!s) return '—';
  const dt = new Date(s.replace(' ', 'T'));
  if (Number.isNaN(dt.getTime())) return '—';
  const data = dt.toLocaleDateString('pt-BR');
  const hora = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${data} às ${hora}`;
}

function badgeStatus(status: string): { rotulo: string; classe: string } {
  if (status === 'convite') return { rotulo: 'Aguardando', classe: 'bg-slate-100 text-slate-600' };
  if (status === 'aguardando') return { rotulo: 'Selfie Pendente', classe: 'bg-yellow-100 text-yellow-800' };
  if (status === 'presente') return { rotulo: 'Liberado', classe: 'bg-emerald-100 text-emerald-700' };
  return { rotulo: 'Finalizado', classe: 'bg-slate-100 text-slate-600' };
}

export default function MoradorConvites() {
  const [convites, setConvites] = useState<Convite[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'aviso' | 'erro'; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ convites: Convite[] }>('morador_convites');
      setConvites(r.convites);
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e instanceof ErroApi ? e.message : 'Erro ao carregar convites.' });
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const executar = async (rota: string, corpo: Record<string, unknown> = {}) => {
    setOcupado(true);
    try {
      const r = await api<{ tipo?: 'ok' | 'aviso' | 'erro'; mensagem: string }>(rota, { corpo });
      setMsg({ tipo: r.tipo ?? 'ok', texto: r.mensagem });
      await carregar();
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e instanceof ErroApi ? e.message : 'Erro inesperado.' });
    } finally {
      setOcupado(false);
    }
  };

  const copiarLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setMsg({ tipo: 'ok', texto: 'Copiado!' });
    } catch {
      setMsg({ tipo: 'erro', texto: 'Copie manualmente o link acima.' });
    }
  };

  const urlBase = `${origemPublica()}/`;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {msg && (
        <div
          className={`border-l-4 px-4 py-3 rounded-lg text-sm font-semibold flex justify-between items-center gap-3 ${
            msg.tipo === 'ok'
              ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
              : msg.tipo === 'aviso'
              ? 'bg-amber-50 border-amber-500 text-amber-800'
              : 'bg-rose-50 border-rose-500 text-rose-800'
          }`}
        >
          <span>{msg.texto}</span>
          <button onClick={() => setMsg(null)} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Card 1 — Gerar Novo Convite */}
      <div className="bg-white rounded-2xl border border-slate-200 border-t-4 border-t-blue-500 p-6 shadow-sm">
        <div className="flex items-center gap-2 text-lg font-extrabold text-blue-700 mb-2">
          <Smartphone size={20} />
          <span>Gerar Novo Convite</span>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Crie um link exclusivo para seu visitante preencher os dados e tirar uma selfie antes de chegar.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            executar('morador_convite_gerar');
          }}
        >
          <button
            type="submit"
            disabled={ocupado}
            className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-500/25 hover:opacity-95 disabled:opacity-60"
          >
            <Plus size={18} />
            <span>{ocupado ? '⏳ Aguarde...' : 'Criar Link de Convite'}</span>
          </button>
        </form>
      </div>

      {/* Card 2 — Meus Visitantes Recentes */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="text-lg font-extrabold text-slate-900 mb-4">Meus Visitantes Recentes</div>

        {convites.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <Users size={36} className="mx-auto mb-2 opacity-60" />
            <p className="font-semibold text-slate-500">Nenhum convite gerado ainda.</p>
            <p className="text-sm">Use o botão acima para criar o primeiro.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {convites.map((c) => {
              const b = badgeStatus(c.status);
              const link = `${urlBase}?acao=convite_externo&t=${c.token_convite ?? ''}`;
              const podeAgir = c.status === 'convite' || c.status === 'aguardando';
              return (
                <div key={c.id} className="border border-slate-200 rounded-[14px] p-4 bg-white space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <FotoUsuario rota={`morador_foto_visita&id=${c.id}`} temFoto={Boolean(c.tem_foto)} tamanho={48} redonda />
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate">{c.nome_visitante || 'Convite Pendente'}</div>
                        {c.documento && (
                          <div className="text-xs font-mono text-slate-500">CPF: {formatarCpf(c.documento)}</div>
                        )}
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 ${b.classe}`}>{b.rotulo}</span>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Calendar size={14} />
                    <span>{formatarDataHora(c.criado_em)}</span>
                  </div>

                  {c.status === 'convite' && c.token_convite && (
                    <div className="space-y-2 pt-1">
                      <input
                        type="text"
                        readOnly
                        value={link}
                        onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
                        className="w-full px-3 py-2 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-700 font-mono"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => copiarLink(link)}
                          className="flex-1 py-2 px-3 rounded-lg bg-slate-600 hover:bg-slate-700 text-white text-xs font-bold"
                        >
                          📋 Copiar link
                        </button>
                        <a
                          href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Acesse: ${link}`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 py-2 px-3 rounded-lg bg-[#25D366] hover:opacity-90 text-white text-xs font-bold text-center"
                        >
                          📲 WhatsApp
                        </a>
                      </div>
                    </div>
                  )}

                  {podeAgir && (
                    <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                      {c.status === 'aguardando' && (
                        <button
                          type="button"
                          disabled={ocupado}
                          onClick={() => executar('morador_convite_aprovar', { id: c.id })}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold disabled:opacity-60"
                        >
                          ✅ Aprovar
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={() =>
                          window.confirm('Tem certeza que deseja cancelar este convite?') &&
                          executar('morador_convite_cancelar', { convite_id: c.id })
                        }
                        className="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-bold disabled:opacity-60"
                      >
                        ✕ Cancelar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
