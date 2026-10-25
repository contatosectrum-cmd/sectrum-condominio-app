import { useEffect, useState } from 'react';
import { UserCheck, Calendar, Clock } from 'lucide-react';
import { api, ErroApi } from '../../lib/api';
import FotoUsuario from '../../components/FotoUsuario';

// Paridade com src/views/meus_visitantes.php + MeusVisitantesController.php ("Visitas Confirmadas").
// Correcoes no backend: mostra `data_entrada` quando existe (o legado usava sempre `criado_em`) e tambem exibe CPF de hospede de temporada.

interface VisitaHist {
  id: number;
  nome_visitante: string | null;
  documento: string | null;
  tipo: string | null;
  status: string;
  entrada: string | null;
  tem_foto: boolean;
}

function formatarCpf(doc: string | null): string {
  if (!doc) return '';
  const d = doc.replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return doc;
}

function chaveData(s: string | null): string {
  if (!s) return '—';
  const dt = new Date(s.replace(' ', 'T'));
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('pt-BR');
}

function rotuloDia(dataBr: string): string {
  const hoje = new Date();
  const strHoje = hoje.toLocaleDateString('pt-BR');
  const ontem = new Date(hoje.getTime() - 86400000).toLocaleDateString('pt-BR');
  if (dataBr === strHoje) return 'Hoje';
  if (dataBr === ontem) return 'Ontem';
  return dataBr;
}

function horaEntrada(s: string | null): string {
  if (!s) return '—';
  const dt = new Date(s.replace(' ', 'T'));
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function badgeTipo(tipo: string | null): { rotulo: string; classe: string } {
  if (tipo === 'temporada') return { rotulo: 'Hóspede Airbnb', classe: 'bg-violet-100 text-violet-700' };
  if (tipo === 'comum') return { rotulo: 'Visitante Comum', classe: 'bg-blue-100 text-blue-700' };
  if (tipo === 'entrega') return { rotulo: 'Entrega', classe: 'bg-yellow-100 text-yellow-800' };
  return { rotulo: 'Desconhecido', classe: 'bg-slate-100 text-slate-600' };
}

function badgeStatus(status: string): { rotulo: string; classe: string; pulso?: boolean } {
  if (status === 'presente') return { rotulo: 'Visita Confirmada', classe: 'bg-emerald-100 text-emerald-700', pulso: true };
  if (status === 'saiu') return { rotulo: 'Saiu', classe: 'bg-slate-100 text-slate-600' };
  if (status === 'aguardando') return { rotulo: 'Aguardando', classe: 'bg-yellow-100 text-yellow-800' };
  return { rotulo: 'Histórico', classe: 'bg-slate-100 text-slate-600' };
}

export default function MoradorVisitantes() {
  const [visitas, setVisitas] = useState<VisitaHist[]>([]);
  const [erro, setErro] = useState('');

  useEffect(() => {
    api<{ visitas: VisitaHist[] }>('morador_visitantes')
      .then((r) => setVisitas(r.visitas))
      .catch((e) => setErro(e instanceof ErroApi ? e.message : 'Erro ao carregar visitas.'));
  }, []);

  // Agrupamento preservando a ordem do banco (id DESC)
  const grupos: { data: string; itens: VisitaHist[] }[] = [];
  for (const v of visitas) {
    const d = chaveData(v.entrada);
    const ultimo = grupos[grupos.length - 1];
    if (!ultimo || ultimo.data !== d) {
      grupos.push({ data: d, itens: [v] });
    } else {
      ultimo.itens.push(v);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      {erro && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-rose-50 border-l-4 border-rose-500 text-rose-800 text-sm font-semibold">
          {erro}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center gap-2 text-lg font-extrabold text-slate-900 mb-5">
          <UserCheck size={20} className="text-blue-600" />
          <span>Visitas Confirmadas (Histórico)</span>
        </div>

        {grupos.length === 0 ? (
          <div className="text-center py-10 text-slate-400">Nenhum registro de entrada recente.</div>
        ) : (
          <div className="space-y-6">
            {grupos.map((g) => (
              <div key={g.data} className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-extrabold text-slate-600 pb-2 border-b-2 border-slate-200">
                  <Calendar size={15} />
                  <span>{rotuloDia(g.data)}</span>
                </div>

                <div className="space-y-3">
                  {g.itens.map((v) => {
                    const bt = badgeTipo(v.tipo);
                    const bs = badgeStatus(v.status);
                    return (
                      <div
                        key={v.id}
                        className="border border-slate-200 rounded-[14px] p-4 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <FotoUsuario rota={`morador_foto_visita&id=${v.id}`} temFoto={Boolean(v.tem_foto)} tamanho={48} redonda />
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate">{v.nome_visitante || 'Visitante sem Nome'}</div>
                            {v.documento && (
                              <div className="text-xs font-mono text-slate-500">CPF: {formatarCpf(v.documento)}</div>
                            )}
                            <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                              <Clock size={12} />
                              <span>Entrada às {horaEntrada(v.entrada)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${bt.classe}`}>{bt.rotulo}</span>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5 ${bs.classe}`}>
                            {bs.pulso && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
                            {bs.rotulo}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
