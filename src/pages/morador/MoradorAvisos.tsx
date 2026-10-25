import { useEffect, useState } from 'react';
import { api, ErroApi } from '../../lib/api';

// Paridade com src/views/meus_avisos.php + MeusAvisosController.php ("Mural de Avisos").

interface AvisoMorador {
  id: number;
  titulo: string;
  mensagem: string;
  prioridade: string;
  criado_em: string | null;
}

function fmtData(s: string | null): string {
  if (!s) return '—';
  const dt = new Date(s.replace(' ', 'T'));
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('pt-BR');
}

export default function MoradorAvisos() {
  const [avisos, setAvisos] = useState<AvisoMorador[]>([]);
  const [erro, setErro] = useState('');

  useEffect(() => {
    api<{ avisos: AvisoMorador[] }>('morador_avisos')
      .then((r) => setAvisos(r.avisos))
      .catch((e) => setErro(e instanceof ErroApi ? e.message : 'Erro ao carregar avisos.'));
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      {erro && (
        <div className="px-4 py-3 rounded-lg bg-rose-50 border-l-4 border-rose-500 text-rose-800 text-sm font-semibold">
          {erro}
        </div>
      )}

      {avisos.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 shadow-sm">
          Nenhum comunicado da administração no momento.
        </div>
      ) : (
        avisos.map((a) => (
          <div
            key={a.id}
            className={`bg-white rounded-2xl border border-slate-200 border-l-4 p-6 shadow-sm ${
              a.prioridade === 'alta' ? 'border-l-red-500' : 'border-l-blue-500'
            }`}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="font-bold text-slate-900 text-lg">{a.titulo}</div>
              <div className="text-xs text-slate-400 shrink-0">{fmtData(a.criado_em)}</div>
            </div>
            <p className="text-slate-600 text-[0.95rem] leading-relaxed whitespace-pre-wrap">{a.mensagem}</p>
          </div>
        ))
      )}
    </div>
  );
}
