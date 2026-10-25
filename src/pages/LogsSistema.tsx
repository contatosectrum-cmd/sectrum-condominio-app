import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Cpu, Trash2, X } from 'lucide-react';
import { api, ErroApi } from '../lib/api';

// Paridade com src/views/logs_sistema.php + LogsSistemaController.php ("Diagnóstico de Erros"):
// Monitora PHP Fatal Errors (error_log.txt) e Hikvision Sync Debug (hik_debug.log) e permite limpar os logs.

interface RespLogs {
  erros: string[];
  debugs: string[];
  log_size: string;
  debug_size?: string;
}

interface Msg {
  tipo: 'ok' | 'erro';
  mensagem: string;
}

export default function LogsSistema() {
  const [dados, setDados] = useState<RespLogs>({ erros: [], debugs: [], log_size: '0 KB' });
  const [msg, setMsg] = useState<Msg | null>(null);
  const [limpando, setLimpando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await api<RespLogs>('logs_sistema_listar');
      setDados({
        erros: r.erros ?? [],
        debugs: r.debugs ?? [],
        log_size: r.log_size ?? '0 KB',
        debug_size: r.debug_size,
      });
    } catch (e) {
      setMsg({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro ao carregar os logs do sistema.' });
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const limparLogs = async () => {
    if (!window.confirm('Tem certeza que deseja limpar todos os logs registrados?')) {
      return;
    }
    setLimpando(true);
    try {
      const r = await api<{ mensagem: string }>('logs_sistema_limpar', { metodo: 'POST', corpo: { limpar_logs: 1 } });
      setMsg({ tipo: 'ok', mensagem: r.mensagem });
      await carregar();
    } catch (e) {
      setMsg({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro ao limpar os logs.' });
    } finally {
      setLimpando(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-8 space-y-5">
      {msg && (
        <div
          className={`border-l-4 px-4 py-3 rounded-lg text-sm font-semibold flex justify-between items-center gap-3 ${
            msg.tipo === 'ok'
              ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
              : 'bg-rose-50 border-rose-500 text-rose-800'
          }`}
        >
          <span>{msg.mensagem}</span>
          <button onClick={() => setMsg(null)} aria-label="Fechar aviso">
            <X size={16} />
          </button>
        </div>
      )}

      {/* CABEÇALHO */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Diagnóstico do Sistema</h2>
          <p className="text-slate-500 text-sm mt-1">
            Monitoramento de erros e instabilidades. Arquivo atual: <strong className="text-slate-800">{dados.log_size}</strong>
          </p>
        </div>
        <button
          onClick={limparLogs}
          disabled={limpando}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold shadow-xs transition disabled:opacity-60"
        >
          <Trash2 size={16} />
          {limpando ? 'Limpando...' : 'Limpar Logs'}
        </button>
      </div>

      {/* CARD 1: PHP FATAL ERRORS */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="bg-red-50 border-b border-red-200 px-5 py-4 flex items-center gap-2 text-red-800 font-semibold">
          <AlertTriangle size={20} />
          <span>PHP Fatal Errors (error_log.txt)</span>
        </div>
        <div className="max-h-[400px] overflow-y-auto bg-slate-800">
          {dados.erros.length === 0 ? (
            <div className="p-5 text-slate-400 text-center font-mono text-xs">
              Nenhum erro registrado no servidor. Tudo limpo!
            </div>
          ) : (
            <table className="w-full border-collapse font-mono text-xs">
              <tbody>
                {dados.erros.map((erro, idx) => (
                  <tr key={idx} className="border-b border-slate-700 last:border-b-0">
                    <td className="px-3 py-2 text-slate-50 break-all leading-relaxed">{erro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* CARD 2: HIKVISION SYNC DEBUG */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="bg-blue-50 border-b border-blue-200 px-5 py-4 flex items-center gap-2 text-blue-800 font-semibold">
          <Cpu size={20} />
          <span>Hikvision Sync Debug (hik_debug.log)</span>
        </div>
        <div className="max-h-[400px] overflow-y-auto bg-slate-800">
          {dados.debugs.length === 0 ? (
            <div className="p-5 text-slate-400 text-center font-mono text-xs">
              Nenhuma atividade recente registrada nos terminais.
            </div>
          ) : (
            <table className="w-full border-collapse font-mono text-xs">
              <tbody>
                {dados.debugs.map((dbg, idx) => (
                  <tr key={idx} className="border-b border-slate-700 last:border-b-0">
                    <td
                      className={`px-3 py-2 break-all leading-relaxed ${
                        dbg.includes('Failed') ? 'text-red-300' : 'text-green-300'
                      }`}
                    >
                      {dbg}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
