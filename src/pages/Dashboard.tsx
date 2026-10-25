import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Monitor, Users, Clock, FileText, Smartphone, ScanFace, UserCog, Activity, AlertTriangle } from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import { useSessao } from '../lib/useSessao';

// Paridade com src/views/dashboard.php: 4 contadores, grafico 7 dias (com condominio) e ultimos 10 acessos.
interface Acesso {
  id: number;
  data_hora: string;
  tipo: string;
  metodo: string | null;
  observacao: string | null;
  nome_ponto: string | null;
  pessoa: string | null;
}

interface DadosDashboard {
  visao_geral: boolean;
  stats: { unidades: number; pessoas: number; visitantes: number; acessos: number };
  moradores_sem_cpf?: number;
  ultimos_acessos: Acesso[];
  acessos_por_dia: { dia: string; total: number }[];
}

const CARDS = [
  { chave: 'unidades', titulo: 'Unidades', icone: Monitor, link: '/estrutura', cor: 'border-l-blue-500', fundo: 'bg-blue-50 text-blue-600' },
  { chave: 'pessoas', titulo: 'Moradores', icone: Users, link: '/pessoas', cor: 'border-l-emerald-500', fundo: 'bg-emerald-50 text-emerald-600' },
  { chave: 'visitantes', titulo: 'Visitantes Pendentes', icone: Clock, link: '/visitas', cor: 'border-l-amber-500', fundo: 'bg-amber-50 text-amber-600' },
  { chave: 'acessos', titulo: 'Acessos Hoje', icone: FileText, link: '/acessos', cor: 'border-l-violet-500', fundo: 'bg-violet-50 text-violet-600' },
] as const;

/** Rotulo do metodo de acesso (o legado so distinguia "App Morador" x "Biometria Facial"). */
function Metodo({ a }: { a: Acesso }) {
  if (a.tipo === 'abertura_remota') {
    return <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600"><Smartphone size={13} /> App Morador</span>;
  }
  if (a.metodo === 'facial') {
    return <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600"><ScanFace size={13} /> Biometria Facial</span>;
  }
  return <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700"><UserCog size={13} /> {a.metodo === 'portaria' ? 'Portaria' : a.metodo || a.tipo}</span>;
}

function formatarDataHora(v: string) {
  const d = new Date(v.replace(' ', 'T'));
  return isNaN(d.getTime()) ? v : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Dashboard() {
  const { usuario } = useSessao();
  const [dados, setDados] = useState<DadosDashboard | null>(null);
  const [erro, setErro] = useState('');
  const [condConfig, setCondConfig] = useState<{ portaria_autonoma: number; permite_temporada: number } | null>(null);
  const [salvandoCfg, setSalvandoCfg] = useState(false);
  const [msgCfg, setMsgCfg] = useState('');

  useEffect(() => {
    setDados(null);
    setErro('');
    api<DadosDashboard>('dashboard')
      .then(setDados)
      .catch((e) => setErro(e instanceof ErroApi ? e.message : 'Erro ao carregar o painel.'));
    if (usuario?.condominio_id) {
      api<{ condominio?: { portaria_autonoma: number; permite_temporada?: number } }>('moradores_apoio')
        .then((r) => {
          if (r.condominio) {
            setCondConfig({
              portaria_autonoma: Number(r.condominio.portaria_autonoma ?? 0),
              permite_temporada: Number(r.condominio.permite_temporada ?? 1),
            });
          }
        })
        .catch(() => {});
    }
  }, [usuario?.condominio_id]);

  const alternarTemporada = async (permitir: number) => {
    if (!condConfig || condConfig.permite_temporada === permitir || salvandoCfg) return;
    setSalvandoCfg(true);
    setMsgCfg('');
    try {
      const r = await api<{ mensagem: string; permite_temporada: number }>('condominio_modo_temporada', {
        corpo: { permite_temporada: permitir },
      });
      setCondConfig((ant) => (ant ? { ...ant, permite_temporada: r.permite_temporada } : ant));
      setMsgCfg(r.mensagem);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Erro ao atualizar permissão de temporada.');
    } finally {
      setSalvandoCfg(false);
    }
  };

  const primeiroNome = (usuario?.nome ?? '').split(' ')[0];
  const max = Math.max(1, ...(dados?.acessos_por_dia.map((d) => d.total) ?? [0]));
  const permiteTemporada = (condConfig?.permite_temporada ?? 1) === 1;

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Olá, {primeiroNome}!</h1>
          <p className="text-slate-500 mt-1">
            {dados?.visao_geral ? 'Resumo de todos os condomínios hoje.' : 'Aqui está o resumo do condomínio hoje.'}
          </p>
        </div>

        {/* Controle rápido do Aluguel de Temporada (Airbnb) para o Síndico */}
        {condConfig && !dados?.visao_geral && (
          <div className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-4 shadow-sm ${permiteTemporada ? 'bg-emerald-50/70 border-emerald-200' : 'bg-rose-50/70 border-rose-200'}`}>
            <div>
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-700">
                <span>🏖️ Aluguel de Temporada (Airbnb)</span>
                <span className={`px-2 py-0.5 rounded-full text-[0.68rem] font-extrabold ${permiteTemporada ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
                  {permiteTemporada ? '✅ HABILITADO NO APP' : '🚫 DESABILITADO NO APP'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                {permiteTemporada
                  ? 'Liberado no App dos moradores para gerar links de hóspedes.'
                  : 'Ocultado automaticamente do menu no App dos moradores.'}
              </p>
            </div>
            <div className="inline-flex bg-white p-1 rounded-xl border border-slate-200 shadow-xs">
              <button
                type="button"
                disabled={salvandoCfg}
                onClick={() => alternarTemporada(1)}
                className={`px-3 py-2 rounded-lg text-xs font-extrabold transition cursor-pointer ${permiteTemporada ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                ✅ Habilitar no App
              </button>
              <button
                type="button"
                disabled={salvandoCfg}
                onClick={() => alternarTemporada(0)}
                className={`px-3 py-2 rounded-lg text-xs font-extrabold transition cursor-pointer ${!permiteTemporada ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                🚫 Desabilitar
              </button>
            </div>
          </div>
        )}
      </div>

      {msgCfg && (
        <div className="bg-emerald-50 border-l-4 border-emerald-500 text-emerald-800 px-4 py-3 rounded-lg text-sm font-semibold">
          ✓ {msgCfg}
        </div>
      )}

      {erro && <div className="bg-rose-50 border-l-4 border-rose-500 text-rose-800 px-4 py-3 rounded-lg text-sm">⚠ {erro}</div>}

      {/* ALERTA DE MORADORES IMPORTADOS DO LEITOR SEM CPF */}
      {(dados?.moradores_sem_cpf ?? 0) > 0 && !dados?.visao_geral && (
        <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle size={20} />
            </div>
            <div>
              <div className="text-sm sm:text-base font-extrabold text-amber-950 flex items-center gap-2 flex-wrap">
                <span>⚠️ Atenção Síndico: Existem {dados!.moradores_sem_cpf} morador(es) importados do leitor facial sem CPF!</span>
                <span className="text-[0.68rem] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-extrabold">
                  Ação Recomendada
                </span>
              </div>
              <p className="text-xs sm:text-sm text-amber-900 mt-0.5">
                Estes cadastros foram importados da memória do controle de acesso facial com ID provisório. Atualize o CPF deles para liberar o acesso ao Aplicativo e padronizar o cadastro.
              </p>
            </div>
          </div>
          <Link
            to="/pessoas?sem_cpf=1"
            className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs sm:text-sm shadow-xs transition shrink-0"
          >
            Revisar e Atualizar CPFs →
          </Link>
        </div>
      )}

      {/* CARDS (mesmos 4 contadores do legado, com os mesmos links) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {CARDS.map((c) => {
          const Icone = c.icone;
          return (
            <Link key={c.chave} to={c.link} className={`bg-white rounded-2xl p-5 flex items-center gap-4 border border-slate-100 border-l-4 ${c.cor} shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all`}>
              <div className={`w-13 h-13 p-3 rounded-xl ${c.fundo}`}><Icone size={26} /></div>
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{c.titulo}</h3>
                <p className="text-3xl font-extrabold text-slate-900 leading-none mt-1">{dados ? dados.stats[c.chave] : '…'}</p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* GRÁFICO 7 DIAS (no legado só aparece com condomínio selecionado) */}
      {dados && dados.acessos_por_dia.length > 0 && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><Activity size={20} className="text-slate-400" /> Acessos nos Últimos 7 Dias</h2>
          <div className="flex items-end gap-3 md:gap-6 h-52 pt-6">
            {dados.acessos_por_dia.map((d, i) => (
              <div key={d.dia} className="flex-1 h-full flex flex-col items-center justify-end gap-2 group">
                <span className="text-xs font-bold text-slate-500">{d.total}</span>
                <div
                  className={`w-full rounded-md border-2 ${i === dados.acessos_por_dia.length - 1 ? 'bg-blue-600/80 border-blue-600' : 'bg-blue-600/10 border-blue-600'}`}
                  style={{ height: `${Math.max((d.total / max) * 100, 2)}%` }}
                  title={`${d.total} acessos`}
                />
                <span className="text-xs font-semibold text-slate-400">{d.dia}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ÚLTIMOS ACESSOS */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
          <h2 className="text-lg font-bold text-slate-800">Últimos Acessos Registrados</h2>
          <Link to="/acessos" className="text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg">Ver Relatório Completo</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
                <th className="py-3 pr-4">Data / Hora</th>
                <th className="py-3 pr-4">Método de Acesso</th>
                <th className="py-3 pr-4">Porta / Terminal</th>
                <th className="py-3 pr-4">Pessoa</th>
                <th className="py-3">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {dados?.ultimos_acessos.map((a) => (
                <tr key={a.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-3 pr-4 font-semibold text-slate-600 whitespace-nowrap">{formatarDataHora(a.data_hora)}</td>
                  <td className="py-3 pr-4"><Metodo a={a} /></td>
                  <td className="py-3 pr-4 font-bold text-slate-800">{a.nome_ponto ?? 'Desconhecido'}</td>
                  <td className="py-3 pr-4 text-slate-700">{a.pessoa ?? '—'}</td>
                  <td className="py-3 text-slate-500">{a.observacao ?? ''}</td>
                </tr>
              ))}
              {dados && dados.ultimos_acessos.length === 0 && (
                <tr><td colSpan={5} className="py-10 text-center text-slate-400">Nenhum acesso registrado até ao momento.</td></tr>
              )}
              {!dados && !erro && (
                <tr><td colSpan={5} className="py-10 text-center text-slate-400">Carregando...</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
