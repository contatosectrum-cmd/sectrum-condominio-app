import { useCallback, useEffect, useState } from 'react';
import { FileText, Search, RefreshCw, Download, X, ScanFace, ShieldCheck, Smartphone, Calendar, CheckSquare, Square } from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import { obterToken } from '../lib/sessao';

// Relatorio Completo de Acessos (evolucao sobre src/views/log.php do legado):
// - Cards de resumo do filtro atual (Total, Biometria Facial, Portaria Manual, App Morador);
// - Atalhos rapidos de periodo (Hoje, Ontem, 7 dias, 30 dias, Tudo);
// - Selecao visual de Terminais / Portas com filtragem imediata e sincronizacao real paginada (minor=75) da Hikvision;
// - Tabela completa em ordem cronologica real (Data/Hora com segundos, Pessoa + CPF, Bloco/Unidade, Metodo e Terminal).

interface Registro {
  id: number;
  data_hora: string;
  tipo: string | null;
  metodo: string | null;
  nome: string;
  cpf: string | null;
  unidade: string | null;
  ponto: string | null;
  observacao: string | null;
}
interface Terminal { id: number; nome: string }
interface Sugestao { nome: string; cpf: string | null; unidade: string | null; acessos: number }
interface Resumo { total: number; faciais: number; portaria: number; app: number }
interface Filtros { busca: string; data_de: string; data_ate: string; tipo: string; pontos: number[] }
interface Aviso { tipo: 'ok' | 'erro'; mensagem: string }

const VAZIO: Filtros = { busca: '', data_de: '', data_ate: '', tipo: '', pontos: [] };
const rot = 'block text-xs font-bold text-slate-600 uppercase mb-1.5';
const inp = 'w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-blue-500 bg-white text-sm';

const fmtDataHora = (s: string) => {
  const dt = new Date(s.replace(' ', 'T'));
  if (Number.isNaN(dt.getTime())) return s;
  return dt.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).replace(',', '');
};

const fmtCpf = (c: string | null) => {
  if (!c) return '';
  const d = c.replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return c;
};

const badgeMetodo = (m: string | null) => {
  if (m === 'facial') return { rotulo: 'Biometria Facial', classe: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (m === 'abertura_remota' || m === 'app') return { rotulo: 'App Morador', classe: 'bg-violet-50 text-violet-700 border-violet-200' };
  if (m === 'portaria') return { rotulo: 'Portaria Manual', classe: 'bg-amber-50 text-amber-800 border-amber-200' };
  return { rotulo: m || 'Manual', classe: 'bg-slate-100 text-slate-600 border-slate-200' };
};

const isoDataHora = (diasAtras = 0, hora = '00:00') => {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}T${hora}`;
};

function query(f: Filtros, pag?: number) {
  const q = new URLSearchParams();
  (['busca', 'data_de', 'data_ate', 'tipo'] as const).forEach((k) => { if (f[k]) q.set(k, f[k]); });
  f.pontos.forEach((p) => q.append('pontos[]', String(p)));
  if (pag) q.set('pag', String(pag));
  return q.toString();
}

export default function Acessos() {
  const [form, setForm] = useState<Filtros>(VAZIO);
  const [filtros, setFiltros] = useState<Filtros>(VAZIO);
  const [pag, setPag] = useState(1);
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const [dados, setDados] = useState<{
    registros: Registro[];
    sugestoes?: Sugestao[];
    total: number;
    resumo?: Resumo;
    pagina: number;
    paginas: number;
    terminais: Terminal[];
  } | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Filtra em tempo real conforme digita a inicial do nome ou altera datas (debounce 150ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setFiltros((atual) => {
        if (
          atual.busca === form.busca &&
          atual.data_de === form.data_de &&
          atual.data_ate === form.data_ate
        ) {
          return atual;
        }
        setPag(1);
        return { ...atual, busca: form.busca, data_de: form.data_de, data_ate: form.data_ate };
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [form.busca, form.data_de, form.data_ate]);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api.php?route=acessos_listar&${query(filtros, pag)}`, {
        headers: { Authorization: `Bearer ${obterToken() ?? ''}` },
      });
      const j = await r.json();
      if (!r.ok || j.status === 'erro') throw new ErroApi(j.mensagem ?? `Erro ${r.status}`, r.status);
      setDados(j);
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro ao carregar o relatório.' });
    }
  }, [filtros, pag]);

  useEffect(() => { carregar(); }, [carregar]);

  const filtrar = (e: React.FormEvent) => {
    e.preventDefault();
    setMostrarSugestoes(false);
    setFiltros(form);
    setPag(1);
  };

  const limpar = () => {
    setForm(VAZIO);
    setFiltros(VAZIO);
    setMostrarSugestoes(false);
    setPag(1);
  };

  const escolherSugestao = (nome: string) => {
    const novo = { ...form, busca: nome };
    setForm(novo);
    setFiltros(novo);
    setMostrarSugestoes(false);
    setPag(1);
  };

  const aplicarAtalhoPeriodo = (de: string, ate: string) => {
    const novo = { ...form, data_de: de, data_ate: ate };
    setForm(novo);
    setFiltros(novo);
    setPag(1);
  };

  const alternarPonto = (id: number) => {
    const novosPontos = form.pontos.includes(id)
      ? form.pontos.filter((p) => p !== id)
      : [...form.pontos, id];
    const novo = { ...form, pontos: novosPontos };
    setForm(novo);
    setFiltros(novo);
    setPag(1);
  };

  const selecionarTodosPontos = () => {
    const todosIds = (dados?.terminais ?? []).map((t) => t.id);
    const novosPontos = form.pontos.length === todosIds.length ? [] : todosIds;
    const novo = { ...form, pontos: novosPontos };
    setForm(novo);
    setFiltros(novo);
    setPag(1);
  };

  const temFiltro = !!(filtros.busca || filtros.data_de || filtros.data_ate || filtros.tipo || filtros.pontos.length);

  const sincronizar = async () => {
    setOcupado(true);
    setAviso(null);
    // Aplica tambem os filtros atuais na tela para mostrar imediatamente os terminais/datas sincronizados
    setFiltros(form);
    setPag(1);
    try {
      const r = await api<{ tipo: 'ok' | 'erro'; mensagem: string; hardware?: { modo: string } }>('acessos_sincronizar', {
        corpo: {
          pontos: form.pontos,
          data_de: form.data_de,
          data_ate: form.data_ate,
        },
      });
      setAviso({
        tipo: r.tipo,
        mensagem: r.mensagem + (r.hardware?.modo === 'simulado' ? ' (modo SIMULADO: nenhum equipamento foi consultado)' : ''),
      });
      await carregar();
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro na sincronização.' });
    } finally {
      setOcupado(false);
    }
  };

  const exportar = async () => {
    const r = await fetch(`/api.php?route=acessos_csv&${query(filtros)}`, {
      headers: { Authorization: `Bearer ${obterToken() ?? ''}` },
    });
    if (!r.ok) {
      setAviso({ tipo: 'erro', mensagem: 'Não foi possível exportar.' });
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await r.blob());
    a.download = `log_acessos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const resumo = dados?.resumo ?? { total: dados?.total ?? 0, faciais: 0, portaria: 0, app: 0 };
  const sugestoes = dados?.sugestoes ?? [];
  const paginas = dados?.paginas ?? 1;
  const inicio = Math.max(1, pag - 2), fim = Math.min(paginas, pag + 2);
  const terminais = dados?.terminais ?? [];

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8 space-y-5">
      {aviso && (
        <div className={`border-l-4 px-4 py-3 rounded-lg text-sm font-semibold flex justify-between gap-3 ${aviso.tipo === 'ok' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-rose-50 border-rose-500 text-rose-800'}`}>
          <span>{aviso.mensagem}</span>
          <button onClick={() => setAviso(null)} aria-label="Fechar aviso"><X size={16} /></button>
        </div>
      )}

      {/* Cards de resumo do filtro */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-2xl font-extrabold text-slate-900">{resumo.total.toLocaleString('pt-BR')}</div>
            <div className="text-xs font-bold uppercase text-slate-500">Total de Acessos</div>
          </div>
          <div className="bg-slate-100 text-slate-700 p-2.5 rounded-xl"><FileText size={20} /></div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-2xl font-extrabold text-emerald-600">{resumo.faciais.toLocaleString('pt-BR')}</div>
            <div className="text-xs font-bold uppercase text-slate-500">Biometria Facial</div>
          </div>
          <div className="bg-emerald-100 text-emerald-600 p-2.5 rounded-xl"><ScanFace size={20} /></div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-2xl font-extrabold text-amber-600">{resumo.portaria.toLocaleString('pt-BR')}</div>
            <div className="text-xs font-bold uppercase text-slate-500">Portaria Manual</div>
          </div>
          <div className="bg-amber-100 text-amber-600 p-2.5 rounded-xl"><ShieldCheck size={20} /></div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-2xl font-extrabold text-violet-600">{resumo.app.toLocaleString('pt-BR')}</div>
            <div className="text-xs font-bold uppercase text-slate-500">App Morador</div>
          </div>
          <div className="bg-violet-100 text-violet-600 p-2.5 rounded-xl"><Smartphone size={20} /></div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
            <FileText size={18} className="text-blue-600" /> Histórico Completo de Acessos
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-slate-400 mr-1 inline-flex items-center gap-1"><Calendar size={12} /> Período rápido:</span>
            {[
              ['Hoje', isoDataHora(0, '00:00'), isoDataHora(0, '23:59')],
              ['Ontem', isoDataHora(1, '00:00'), isoDataHora(1, '23:59')],
              ['Últimos 7 dias', isoDataHora(7, '00:00'), isoDataHora(0, '23:59')],
              ['Últimos 30 dias', isoDataHora(30, '00:00'), isoDataHora(0, '23:59')],
              ['Tudo', '', ''],
            ].map(([rotulo, de, ate]) => {
              const ativo = form.data_de === de && form.data_ate === ate;
              return (
                <button
                  key={rotulo}
                  type="button"
                  onClick={() => aplicarAtalhoPeriodo(de, ate)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition ${ativo ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                >
                  {rotulo}
                </button>
              );
            })}
          </div>
        </div>

        <form onSubmit={filtrar} className="mb-5">
          <div className="grid gap-3 md:grid-cols-4 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
            <div className="md:col-span-1 relative">
              <label className={rot}>Pesquisar pessoa (nome, CPF ou unidade)</label>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  value={form.busca}
                  onFocus={() => setMostrarSugestoes(true)}
                  onBlur={() => setTimeout(() => setMostrarSugestoes(false), 180)}
                  onChange={(e) => {
                    setForm({ ...form, busca: e.target.value });
                    setMostrarSugestoes(true);
                  }}
                  placeholder="Digite a inicial do nome..."
                  autoComplete="off"
                  className={`${inp} pl-9 pr-8`}
                />
                {form.busca && (
                  <button
                    type="button"
                    onClick={() => {
                      const novo = { ...form, busca: '' };
                      setForm(novo);
                      setFiltros(novo);
                      setPag(1);
                    }}
                    aria-label="Limpar busca"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              {mostrarSugestoes && form.busca.trim() !== '' && sugestoes.length > 0 && (
                <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-[280px] overflow-y-auto">
                  <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 text-[0.68rem] font-extrabold uppercase text-slate-400">
                    Pessoas encontradas ({sugestoes.length})
                  </div>
                  {sugestoes.map((s) => (
                    <button
                      key={`${s.nome}-${s.cpf ?? ''}`}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        escolherSugestao(s.nome);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-slate-100 last:border-b-0 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-900 truncate">{s.nome}</div>
                        <div className="text-xs text-slate-400 truncate">
                          {s.unidade ? `${s.unidade}` : 'Sem unidade'}
                          {s.cpf ? ` · ${fmtCpf(s.cpf)}` : ''}
                        </div>
                      </div>
                      <span className="shrink-0 bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full text-[0.7rem] font-bold">
                        {s.acessos} {Number(s.acessos) === 1 ? 'acesso' : 'acessos'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className={rot}>De (data e hora)</label>
              <input
                type="datetime-local"
                value={form.data_de}
                onChange={(e) => setForm({ ...form, data_de: e.target.value })}
                className={inp}
              />
            </div>
            <div>
              <label className={rot}>Até (data e hora)</label>
              <input
                type="datetime-local"
                value={form.data_ate}
                onChange={(e) => setForm({ ...form, data_ate: e.target.value })}
                className={inp}
              />
            </div>
            <div>
              <label className={rot}>Método de acesso</label>
              <select
                value={form.tipo}
                onChange={(e) => {
                  const novo = { ...form, tipo: e.target.value };
                  setForm(novo);
                  setFiltros(novo);
                  setPag(1);
                }}
                className={inp}
              >
                <option value="">Todos os métodos</option>
                <option value="facial">Biometria Facial</option>
                <option value="portaria">Portaria Manual</option>
                <option value="abertura_remota">App Morador</option>
              </select>
            </div>

            <div className="md:col-span-4 mt-1">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase">
                  Terminais / Controladores de Acesso {form.pontos.length > 0 ? `(${form.pontos.length} selecionado${form.pontos.length > 1 ? 's' : ''})` : '(Todos)'}
                </label>
                {terminais.length > 0 && (
                  <button
                    type="button"
                    onClick={selecionarTodosPontos}
                    className="text-xs font-bold text-blue-600 hover:underline inline-flex items-center gap-1"
                  >
                    {form.pontos.length === terminais.length ? <><Square size={12} /> Desmarcar todos</> : <><CheckSquare size={12} /> Selecionar todos</>}
                  </button>
                )}
              </div>
              <div className="bg-white border border-slate-300 rounded-xl p-2.5 flex flex-wrap gap-1.5 max-h-[128px] overflow-y-auto">
                {terminais.map((t) => {
                  const marcado = form.pontos.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => alternarPonto(t.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition inline-flex items-center gap-1.5 ${
                        marcado
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <input type="checkbox" checked={marcado} readOnly className="w-3.5 h-3.5 pointer-events-none accent-white" />
                      {t.nome}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-3 flex-wrap items-center">
            <button className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold">
              <Search size={14} /> Filtrar Relatório
            </button>
            {temFiltro && (
              <button type="button" onClick={limpar} className="px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold">
                ✕ Limpar Filtros
              </button>
            )}
            <button
              type="button"
              disabled={ocupado}
              onClick={sincronizar}
              title="Conecta nos leitores faciais selecionados (ou em todos) e importa os acessos diretamente da memória dos equipamentos Hikvision"
              className="ml-auto inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-60 shadow-xs"
            >
              <RefreshCw size={14} className={ocupado ? 'animate-spin' : ''} />
              {ocupado
                ? 'Puxando acessos das catracas...'
                : form.pontos.length > 0
                ? `Sincronizar Faciais (${form.pontos.length} terminal${form.pontos.length > 1 ? 'is' : ''})`
                : 'Sincronizar Faciais (Todos)'}
            </button>
            <button type="button" onClick={exportar} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold">
              <Download size={14} /> Exportar CSV
            </button>
          </div>
        </form>

        <div className="flex items-center justify-between text-sm text-slate-500 mb-3">
          <span>
            <b>{(dados?.total ?? 0).toLocaleString('pt-BR')}</b> registro(s) encontrado(s)
          </span>
          {paginas > 1 && <span className="text-xs font-semibold text-slate-400">Página {pag} de {paginas}</span>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['Data / Hora', 'Pessoa / Documento', 'Bloco / Unidade', 'Método', 'Terminal / Porta'].map((h) => (
                  <th key={h} className="text-left text-[0.72rem] font-extrabold uppercase tracking-wide text-slate-500 px-4 py-3 border-b border-slate-200 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(dados?.registros ?? []).map((l) => {
                const bm = badgeMetodo(l.metodo);
                return (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 border-b border-slate-100 text-sm text-slate-600 font-mono font-semibold whitespace-nowrap">
                      {fmtDataHora(l.data_hora)}
                    </td>
                    <td className="px-4 py-3 border-b border-slate-100 text-sm">
                      <div className="font-bold text-slate-900">{l.nome}</div>
                      {l.cpf && <div className="text-xs text-slate-400 font-mono">{fmtCpf(l.cpf)}</div>}
                    </td>
                    <td className="px-4 py-3 border-b border-slate-100 text-sm">
                      {l.unidade ? (
                        <span className="font-semibold text-slate-700">{l.unidade}</span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 border-b border-slate-100 whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${bm.classe}`}>
                        {bm.rotulo}
                      </span>
                    </td>
                    <td className="px-4 py-3 border-b border-slate-100">
                      <span className="text-slate-800 font-bold text-sm">{l.ponto ?? 'Portaria / Recepção'}</span>
                      {l.observacao && <div className="text-xs text-slate-400">{l.observacao}</div>}
                    </td>
                  </tr>
                );
              })}
              {dados && dados.registros.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-slate-400 py-10">
                    <Search size={32} className="mx-auto mb-2" strokeWidth={1.5} />
                    <div>Nenhum evento encontrado no banco com os filtros aplicados.</div>
                    <div className="text-xs mt-1 text-slate-400">
                      Dica: clique em <b>Sincronizar Faciais</b> para importar os acessos diretamente da memória das catracas Hikvision.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {paginas > 1 && (
          <div className="flex justify-center gap-2 mt-5">
            {pag > 1 && (
              <button onClick={() => setPag(pag - 1)} className="px-3 py-1.5 rounded-md bg-slate-100 text-slate-600 text-sm font-medium">
                « Ant
              </button>
            )}
            {Array.from({ length: fim - inicio + 1 }, (_, i) => inicio + i).map((n) => (
              <button
                key={n}
                onClick={() => setPag(n)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium ${n === pag ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {n}
              </button>
            ))}
            {pag < paginas && (
              <button onClick={() => setPag(pag + 1)} className="px-3 py-1.5 rounded-md bg-slate-100 text-slate-600 text-sm font-medium">
                Próx »
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
