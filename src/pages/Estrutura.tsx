import { useCallback, useEffect, useState } from 'react';
import { Building2, Home, LayoutGrid, Save, Plus, X, Pencil, Sparkles, Cpu } from 'lucide-react';
import { api, ErroApi } from '../lib/api';

interface Bloco {
  id: number;
  nome: string;
  andares: number | null;
  qtd_unidades?: number;
  qtd_moradores?: number;
  terminais_nomes?: string;
}
interface Unidade {
  id: number;
  numero: string;
  tipo: string | null;
  bloco_id: number | null;
  bloco_nome: string | null;
  qtd_moradores?: number;
}
interface Aviso { tipo: 'ok' | 'erro'; mensagem: string }

const rotulo = 'block text-[0.78rem] font-bold text-slate-600 mb-1.5';
const entrada = 'w-full px-3 py-2.5 border border-slate-300 rounded-lg outline-none focus:border-blue-500 bg-white text-slate-900';
const th = 'text-left text-[0.72rem] font-extrabold uppercase tracking-wide text-slate-500 px-4 py-3 border-b border-slate-200';
const td = 'px-4 py-3 border-b border-slate-100 text-sm';

export default function Estrutura() {
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [aba, setAba] = useState<'unidades' | 'blocos'>('blocos');

  // Criacao individual vs em lote (Letras A..Z ou Numeros 1..N)
  const [modoCriacaoBloco, setModoCriacaoBloco] = useState<'unico' | 'lote'>('unico');
  const [nomeBloco, setNomeBloco] = useState('');
  const [andares, setAndares] = useState('1');
  const [lotePrefixo, setLotePrefixo] = useState('Bloco');
  const [lotePadrao, setLotePadrao] = useState<'letras' | 'numeros'>('letras');
  const [loteInicio, setLoteInicio] = useState('A');
  const [loteFim, setLoteFim] = useState('B');
  const [loteZeroEsq, setLoteZeroEsq] = useState(false);

  // Edicao inline de Bloco e Unidade
  const [editBloco, setEditBloco] = useState<{ id: number; nome: string; andares: string } | null>(null);
  const [editUnidade, setEditUnidade] = useState<{ id: number; bloco_id: string; numero: string } | null>(null);

  const [blocoUnidade, setBlocoUnidade] = useState('');
  const [numero, setNumero] = useState('');
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ blocos: Bloco[]; unidades: Unidade[] }>('listar_estrutura');
      setBlocos(r.blocos);
      setUnidades(r.unidades);
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro ao carregar a estrutura.' });
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const executar = async (rota: string, corpo: Record<string, unknown>, aoConcluir?: () => void) => {
    setEnviando(true);
    try {
      const r = await api<{ mensagem: string }>(rota, { corpo });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      aoConcluir?.();
      await carregar();
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro inesperado.' });
    } finally {
      setEnviando(false);
      document.querySelector('main .overflow-auto')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const salvarBloco = (e: React.FormEvent) => {
    e.preventDefault();
    if (modoCriacaoBloco === 'lote') {
      executar('estrutura_gerar_blocos', {
        prefixo: lotePrefixo,
        modo: lotePadrao,
        inicio: loteInicio,
        fim: loteFim,
        zero_esquerda: loteZeroEsq,
        andares: Number(andares) || 1,
      });
    } else {
      executar('estrutura_bloco', { nome: nomeBloco, andares: Number(andares) || 1 }, () => { setNomeBloco(''); setAndares('1'); });
    }
  };

  const salvarEdicaoBloco = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editBloco) return;
    executar('estrutura_editar_bloco', {
      id: editBloco.id,
      nome: editBloco.nome,
      andares: Number(editBloco.andares) || 1,
    }, () => setEditBloco(null));
  };

  const salvarUnidade = (e: React.FormEvent) => {
    e.preventDefault();
    executar('estrutura_unidade', { bloco_id: blocoUnidade, numero }, () => setNumero(''));
  };

  const salvarEdicaoUnidade = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUnidade) return;
    executar('estrutura_editar_unidade', {
      id: editUnidade.id,
      bloco_id: Number(editUnidade.bloco_id),
      numero: editUnidade.numero,
    }, () => setEditUnidade(null));
  };

  const excluirUnidade = (u: Unidade) => {
    if (window.confirm('ATENÇÃO: Deseja apagar esta unidade permanentemente?')) executar('estrutura_excluir_unidade', { id: u.id });
  };
  const excluirBloco = (b: Bloco) => {
    if (window.confirm('Deseja excluir este Bloco? A ação será bloqueada se existirem unidades dentro dele.')) executar('estrutura_excluir_bloco', { id: b.id });
  };

  const trocarPadraoLote = (novo: 'letras' | 'numeros') => {
    setLotePadrao(novo);
    if (novo === 'letras') {
      setLoteInicio('A');
      setLoteFim('D');
    } else {
      setLoteInicio('1');
      setLoteFim('10');
    }
  };

  const abaBtn = (ativa: boolean) =>
    `inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold border transition ${ativa ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`;
  const btnExcluir = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-50';
  const btnEditar = 'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200 disabled:opacity-50';

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8">
      {aviso && (
        <div className={`border-l-4 px-4 py-3 rounded-lg text-sm font-semibold mb-5 flex justify-between gap-3 ${aviso.tipo === 'ok' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-rose-50 border-rose-500 text-rose-800'}`}>
          <span>{aviso.mensagem}</span>
          <button onClick={() => setAviso(null)} aria-label="Fechar aviso"><X size={16} /></button>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 mb-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2.5 text-lg font-extrabold text-slate-900">
              <span className="bg-blue-100 text-blue-600 p-2 rounded-xl"><Building2 size={18} /></span> Criar Bloco / Torre
            </div>
            <div className="inline-flex rounded-lg bg-slate-100 p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setModoCriacaoBloco('unico')}
                className={`px-2.5 py-1 rounded-md transition ${modoCriacaoBloco === 'unico' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'}`}
              >
                Individual
              </button>
              <button
                type="button"
                onClick={() => setModoCriacaoBloco('lote')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md transition ${modoCriacaoBloco === 'lote' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'}`}
              >
                <Sparkles size={12} /> Em Lote (Letras / Números)
              </button>
            </div>
          </div>

          <form onSubmit={salvarBloco}>
            {modoCriacaoBloco === 'unico' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={rotulo}>Nome do Bloco *</label>
                  <input required value={nomeBloco} onChange={(e) => setNomeBloco(e.target.value)} placeholder="Ex: Bloco A, Bloco 1, Torre Sul..." className={entrada} />
                </div>
                <div>
                  <label className={rotulo}>Total de Andares</label>
                  <input type="number" min={1} value={andares} onChange={(e) => setAndares(e.target.value)} className={entrada} />
                </div>
              </div>
            ) : (
              <div className="space-y-3 bg-indigo-50/60 p-3.5 rounded-xl border border-indigo-200">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={rotulo}>Prefixo da Nomenclatura</label>
                    <select value={lotePrefixo} onChange={(e) => setLotePrefixo(e.target.value)} className={entrada}>
                      <option value="Bloco">Bloco (ex: Bloco A, Bloco 1)</option>
                      <option value="Torre">Torre (ex: Torre A, Torre 1)</option>
                      <option value="Quadra">Quadra (ex: Quadra A, Quadra 1)</option>
                      <option value="">Apenas Letra/Número (ex: A, B ou 1, 2)</option>
                    </select>
                  </div>
                  <div>
                    <label className={rotulo}>Padrão de Identificação</label>
                    <select value={lotePadrao} onChange={(e) => trocarPadraoLote(e.target.value as 'letras' | 'numeros')} className={entrada}>
                      <option value="letras">🔤 Letras (A, B, C, D...)</option>
                      <option value="numeros">🔢 Numeração (1, 2, 3, 4...)</option>
                    </select>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className={rotulo}>{lotePadrao === 'letras' ? 'Da Letra' : 'Do Número'}</label>
                    <input
                      required
                      maxLength={lotePadrao === 'letras' ? 1 : 3}
                      value={loteInicio}
                      onChange={(e) => setLoteInicio(e.target.value.toUpperCase())}
                      className={`${entrada} font-bold text-center`}
                    />
                  </div>
                  <div>
                    <label className={rotulo}>{lotePadrao === 'letras' ? 'Até a Letra' : 'Até o Número'}</label>
                    <input
                      required
                      maxLength={lotePadrao === 'letras' ? 1 : 3}
                      value={loteFim}
                      onChange={(e) => setLoteFim(e.target.value.toUpperCase())}
                      className={`${entrada} font-bold text-center`}
                    />
                  </div>
                  <div>
                    <label className={rotulo}>Andares</label>
                    <input type="number" min={1} value={andares} onChange={(e) => setAndares(e.target.value)} className={entrada} />
                  </div>
                </div>
                {lotePadrao === 'numeros' && (
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={loteZeroEsq} onChange={(e) => setLoteZeroEsq(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
                    Usar zero à esquerda (ex: {lotePrefixo ? `${lotePrefixo} 01` : '01'} em vez de {lotePrefixo ? `${lotePrefixo} 1` : '1'})
                  </label>
                )}
              </div>
            )}
            <button disabled={enviando} className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold disabled:opacity-60">
              <Save size={16} /> {modoCriacaoBloco === 'lote' ? 'Gerar Blocos Automaticamente' : 'Salvar Bloco'}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-2.5 text-lg font-extrabold text-slate-900 mb-5">
            <span className="bg-emerald-100 text-emerald-600 p-2 rounded-xl"><Home size={18} /></span> Cadastrar Unidade (Apto/Casa)
          </div>
          <form onSubmit={salvarUnidade}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={rotulo}>Bloco Pertencente *</label>
                <select required value={blocoUnidade} onChange={(e) => setBlocoUnidade(e.target.value)} className={entrada}>
                  <option value="">Selecione a torre...</option>
                  {blocos.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
                </select>
              </div>
              <div><label className={rotulo}>Número / Identificação *</label><input required value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex: 101, 204B..." className={entrada} /></div>
            </div>
            <button disabled={enviando} className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-60"><Plus size={16} /> Salvar Unidade</button>
          </form>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2.5 text-lg font-extrabold text-slate-900">
            <span className="bg-indigo-100 text-indigo-600 p-2 rounded-xl"><LayoutGrid size={18} /></span> Estrutura do Condomínio
          </div>
          <span className="text-xs text-slate-500">
            💡 Renomear um Bloco ou Unidade atualiza automaticamente todos os moradores e terminais vinculados (sem retrabalho).
          </span>
        </div>
        <div className="flex gap-2.5 border-b border-slate-200 pb-3 mb-4 flex-wrap">
          <button onClick={() => setAba('blocos')} className={abaBtn(aba === 'blocos')}><Building2 size={15} /> Blocos / Torres ({blocos.length})</button>
          <button onClick={() => setAba('unidades')} className={abaBtn(aba === 'unidades')}><Home size={15} /> Unidades Cadastradas ({unidades.length})</button>
        </div>

        {carregando ? (
          <div className="text-center text-slate-400 py-12">Carregando estrutura...</div>
        ) : aba === 'unidades' ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Bloco / Torre</th>
                  <th className={th}>Número da Unidade</th>
                  <th className={th}>Moradores</th>
                  <th className={`${th} text-right`}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {unidades.map((u) => {
                  const emEdicao = editUnidade?.id === u.id;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className={`${td} font-semibold text-slate-700`}>
                        {emEdicao ? (
                          <select
                            value={editUnidade.bloco_id}
                            onChange={(e) => setEditUnidade({ ...editUnidade, bloco_id: e.target.value })}
                            className="px-2.5 py-1.5 border border-blue-400 rounded-lg text-sm font-bold bg-white"
                          >
                            {blocos.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
                          </select>
                        ) : (
                          u.bloco_nome ?? '—'
                        )}
                      </td>
                      <td className={`${td} font-bold text-slate-900`}>
                        {emEdicao ? (
                          <input
                            value={editUnidade.numero}
                            onChange={(e) => setEditUnidade({ ...editUnidade, numero: e.target.value })}
                            className="px-2.5 py-1.5 border border-blue-400 rounded-lg text-sm font-bold w-32"
                          />
                        ) : (
                          u.numero
                        )}
                      </td>
                      <td className={td}>
                        <span className="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full text-xs font-bold">
                          {u.qtd_moradores ?? 0} morador(es)
                        </span>
                      </td>
                      <td className={`${td} text-right`}>
                        <div className="inline-flex items-center gap-1.5">
                          {emEdicao ? (
                            <>
                              <button type="button" disabled={enviando} onClick={salvarEdicaoUnidade} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700">Salvar</button>
                              <button type="button" onClick={() => setEditUnidade(null)} className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600">Cancelar</button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={enviando}
                                onClick={() => setEditUnidade({ id: u.id, bloco_id: String(u.bloco_id ?? ''), numero: u.numero })}
                                className={btnEditar}
                              >
                                <Pencil size={12} /> Editar
                              </button>
                              <button disabled={enviando} onClick={() => excluirUnidade(u)} className={btnExcluir}>Excluir</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {unidades.length === 0 && <tr><td colSpan={4} className="text-center text-slate-400 py-10">Nenhuma unidade registrada neste condomínio.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Nome do Bloco / Torre</th>
                  <th className={th}>Unidades / Moradores</th>
                  <th className={th}>Terminais Vinculados ao Bloco</th>
                  <th className={th}>Andares</th>
                  <th className={`${th} text-right`}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {blocos.map((b) => {
                  const emEdicao = editBloco?.id === b.id;
                  return (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className={`${td} font-bold text-slate-900`}>
                        {emEdicao ? (
                          <input
                            value={editBloco.nome}
                            onChange={(e) => setEditBloco({ ...editBloco, nome: e.target.value })}
                            placeholder="Ex: Bloco A, Bloco 1..."
                            className="px-2.5 py-1.5 border border-blue-400 rounded-lg text-sm font-bold w-48"
                          />
                        ) : (
                          b.nome
                        )}
                      </td>
                      <td className={td}>
                        <div className="flex flex-wrap gap-1.5 text-xs font-bold">
                          <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-md">
                            {b.qtd_unidades ?? 0} unid.
                          </span>
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md">
                            {b.qtd_moradores ?? 0} morador(es)
                          </span>
                        </div>
                      </td>
                      <td className={td}>
                        {b.terminais_nomes ? (
                          <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-800 border border-purple-200 px-2.5 py-0.5 rounded-md text-xs font-bold">
                            <Cpu size={12} /> {b.terminais_nomes}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Nenhum terminal exclusivo</span>
                        )}
                      </td>
                      <td className={td}>
                        {emEdicao ? (
                          <input
                            type="number"
                            min={1}
                            value={editBloco.andares}
                            onChange={(e) => setEditBloco({ ...editBloco, andares: e.target.value })}
                            className="px-2 py-1 border border-blue-400 rounded-lg text-sm w-20"
                          />
                        ) : (
                          `${b.andares ?? 1} Andar(es)`
                        )}
                      </td>
                      <td className={`${td} text-right`}>
                        <div className="inline-flex items-center gap-1.5">
                          {emEdicao ? (
                            <>
                              <button type="button" disabled={enviando} onClick={salvarEdicaoBloco} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700">Salvar</button>
                              <button type="button" onClick={() => setEditBloco(null)} className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600">Cancelar</button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={enviando}
                                onClick={() => setEditBloco({ id: b.id, nome: b.nome, andares: String(b.andares ?? 1) })}
                                title="Renomear bloco (ou digite o nome de outro bloco existente para unificá-los automaticamente)"
                                className={btnEditar}
                              >
                                <Pencil size={12} /> Editar
                              </button>
                              <button disabled={enviando} onClick={() => excluirBloco(b)} className={btnExcluir}>Excluir</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {blocos.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400 py-10">Nenhum bloco registrado. Crie o primeiro acima.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
