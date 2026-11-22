import { useCallback, useEffect, useState } from 'react';
import {
  Building2, Home, LayoutGrid, Save, Plus, X, Pencil, Sparkles, Cpu, ShieldCheck,
  Eye, Percent, RefreshCw, Search,
} from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import ModalFichaUnidade360 from '../components/ModalFichaUnidade360';

interface Bloco {
  id: number;
  nome: string;
  andares: number | null;
  grupo_acesso_id?: number | null;
  grupo_acesso_nome?: string | null;
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
  limite_vagas?: number | null;
  fracao_ideal?: number;
  area_m2?: number | null;
  proprietario_nome?: string;
  proprietario_cpf?: string;
  proprietario_telefone?: string;
  proprietario_celular?: string;
  proprietario_email?: string;
  inquilino_nome?: string;
  imobiliaria_nome?: string;
  tipo_ocupacao?: 'proprietario' | 'alugado' | 'vazio' | string;
  id_externo_superlogica?: number | null;
  grupo_acesso_id?: number | null;
  grupo_acesso_nome?: string | null;
  qtd_moradores?: number;
  qtd_inquilinos_app?: number;
  qtd_veiculos?: number;
}
interface GrupoAcesso {
  id: number;
  nome: string;
  terminais_acesso?: string | null;
}
interface Aviso { tipo: 'ok' | 'erro'; mensagem: string }

const rotulo = 'block text-[0.78rem] font-bold text-slate-600 mb-1.5';
const entrada = 'w-full px-3 py-2.5 border border-slate-300 rounded-lg outline-none focus:border-blue-500 bg-white text-slate-900';
const th = 'text-left text-[0.72rem] font-extrabold uppercase tracking-wide text-slate-500 px-4 py-3 border-b border-slate-200';
const td = 'px-4 py-3 border-b border-slate-100 text-sm';

export default function Estrutura() {
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [grupos, setGrupos] = useState<GrupoAcesso[]>([]);
  const [limiteVagasCondominio, setLimiteVagasCondominio] = useState(2);
  const [somaFracaoIdeal, setSomaFracaoIdeal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [aba, setAba] = useState<'unidades' | 'blocos'>('unidades');

  // Filtros rápidos da grade de Unidades
  const [filtroBloco, setFiltroBloco] = useState('');
  const [filtroOcupacao, setFiltroOcupacao] = useState<'todos' | 'proprietario' | 'alugado' | 'sem_titular'>('todos');
  const [buscaTexto, setBuscaTexto] = useState('');
  const [unidadeFicha360Id, setUnidadeFicha360Id] = useState<number | null>(null);

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
  const [editUnidade, setEditUnidade] = useState<{ id: number; bloco_id: string; numero: string; grupo_acesso_id: string; limite_vagas: string } | null>(null);

  const [blocoUnidade, setBlocoUnidade] = useState('');
  const [numero, setNumero] = useState('');
  const [grupoUnidade, setGrupoUnidade] = useState('');
  const [limiteVagasUnidade, setLimiteVagasUnidade] = useState('');
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{
        limite_vagas_condominio?: number;
        soma_fracao_ideal?: number;
        blocos: Bloco[];
        unidades: Unidade[];
        grupos_acesso?: GrupoAcesso[];
      }>('listar_estrutura');
      setBlocos(r.blocos);
      setUnidades(r.unidades);
      setGrupos(r.grupos_acesso || []);
      setLimiteVagasCondominio(r.limite_vagas_condominio ?? 2);
      setSomaFracaoIdeal(r.soma_fracao_ideal ?? 0);
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
    executar(
      'estrutura_unidade',
      {
        bloco_id: blocoUnidade,
        numero,
        grupo_acesso_id: grupoUnidade ? Number(grupoUnidade) : '',
        limite_vagas: limiteVagasUnidade,
      },
      () => {
        setNumero('');
        setGrupoUnidade('');
        setLimiteVagasUnidade('');
      }
    );
  };

  const salvarEdicaoUnidade = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUnidade) return;
    executar('estrutura_editar_unidade', {
      id: editUnidade.id,
      bloco_id: Number(editUnidade.bloco_id),
      numero: editUnidade.numero,
      grupo_acesso_id: editUnidade.grupo_acesso_id ? Number(editUnidade.grupo_acesso_id) : '',
      limite_vagas: editUnidade.limite_vagas,
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
          <div className="flex items-center gap-2.5 text-lg font-extrabold text-slate-900 mb-1">
            <span className="bg-emerald-100 text-emerald-600 p-2 rounded-xl"><Home size={18} /></span>
            Cadastrar Unidade (Apto / Casa)
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Vincule a unidade ao Bloco/Torre e defina opcionalmente o <b>Grupo de Acesso Padrão (Pré-Autorização)</b> e o limite de vagas.
          </p>
          <form onSubmit={salvarUnidade}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={rotulo}>Bloco Pertencente *</label>
                <select required value={blocoUnidade} onChange={(e) => setBlocoUnidade(e.target.value)} className={entrada}>
                  <option value="">Selecione a torre/bloco...</option>
                  {blocos.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
                </select>
              </div>
              <div>
                <label className={rotulo}>Número / Identificação *</label>
                <input required value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex: 101, 204B, Casa 05..." className={entrada} />
              </div>
              <div>
                <label className={rotulo}>Pré-Autorização Padrão (Grupo de Acesso)</label>
                <select value={grupoUnidade} onChange={(e) => setGrupoUnidade(e.target.value)} className={entrada}>
                  <option value="">— Padrão do Bloco/Portaria (ou definir depois) —</option>
                  {grupos.map((g) => (
                    <option key={g.id} value={g.id}>
                      🔑 {g.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={rotulo}>Limite de Vagas da Unidade</label>
                <select value={limiteVagasUnidade} onChange={(e) => setLimiteVagasUnidade(e.target.value)} className={entrada}>
                  <option value="">🚗 Padrão do Condomínio ({limiteVagasCondominio} vaga{limiteVagasCondominio === 1 ? '' : 's'})</option>
                  <option value="0">Sem vaga (0)</option>
                  <option value="1">1 vaga</option>
                  <option value="2">2 vagas</option>
                  <option value="3">3 vagas</option>
                  <option value="4">4 vagas</option>
                  <option value="5">5 vagas</option>
                </select>
              </div>
            </div>
            <button disabled={enviando} className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-60">
              <Plus size={16} /> Salvar Unidade
            </button>
          </form>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        {/* PAINEL EXECUTIVO ERP: UNIDADES, FRAÇÃO IDEAL 100%, LOCAÇÕES E SINCRONIZAÇÃO */}
        <div className="grid sm:grid-cols-4 gap-3 mb-5">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <Home size={18} />
            </div>
            <div>
              <div className="text-xl font-extrabold text-slate-900">{unidades.length}</div>
              <div className="text-xs text-slate-500">Unidades em {blocos.length} blocos</div>
            </div>
          </div>

          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between gap-2 ${
              Math.abs(somaFracaoIdeal - 100) < 0.01
                ? 'bg-emerald-50/70 border-emerald-200'
                : 'bg-amber-50/80 border-amber-300'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  Math.abs(somaFracaoIdeal - 100) < 0.01
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                <Percent size={18} />
              </div>
              <div>
                <div className="text-base font-extrabold text-slate-900">
                  {somaFracaoIdeal.toFixed(4).replace('.', ',')}%
                </div>
                <div className="text-[11px] text-slate-600">
                  {Math.abs(somaFracaoIdeal - 100) < 0.01 ? 'Soma de Frações OK (100%)' : 'Soma deve ser 100%'}
                </div>
              </div>
            </div>
            <button
              type="button"
              disabled={enviando || unidades.length === 0}
              onClick={() => executar('estrutura_calcular_fracao_ideal', { modo: 'igualitario' })}
              className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-[11px] font-extrabold shadow-2xs cursor-pointer shrink-0"
              title="Distribuir 100% da fração ideal automaticamente entre todas as unidades"
            >
              Calcular 100%
            </button>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 font-extrabold text-sm">
              🔑
            </div>
            <div>
              <div className="text-xl font-extrabold text-slate-900">
                {unidades.filter((x) => x.tipo_ocupacao === 'alugado' || (x.inquilino_nome && x.inquilino_nome.trim() !== '')).length}
              </div>
              <div className="text-xs text-slate-500">Unidades Alugadas (Inquilino)</div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200 flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-extrabold text-indigo-950">Base Superlógica ERP</div>
              <div className="text-[11px] text-indigo-700">
                {unidades.filter((x) => x.proprietario_nome && x.proprietario_nome.trim() !== '').length} de {unidades.length} com titular
              </div>
            </div>
            <button
              type="button"
              disabled={enviando}
              onClick={() => {
                if (
                  window.confirm(
                    'Deseja sincronizar os Titulares, Inquilinos, Telefones, E-mails e ajustar 100% da Fração Ideal das unidades com a base mapeada da Superlógica?',
                  )
                ) {
                  void executar('estrutura_sincronizar_superlogica', {
                    recalcular_fracao_100: true,
                    atualizar_lista_oficial: true,
                  });
                }
              }}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-xs cursor-pointer shrink-0 disabled:opacity-50"
            >
              <RefreshCw size={13} /> Sincronizar Base
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2.5 text-lg font-extrabold text-slate-900">
            <span className="bg-indigo-100 text-indigo-600 p-2 rounded-xl"><LayoutGrid size={18} /></span> Estrutura de Blocos &amp; Unidades
          </div>
          <span className="text-xs text-slate-500">
            💡 Clique em <b>Ficha 360º</b> em qualquer unidade para gerenciar Proprietário, Inquilino, Contratos, Veículos e Histórico.
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 mb-4 flex-wrap">
          <div className="flex gap-2.5 flex-wrap">
            <button onClick={() => setAba('unidades')} className={abaBtn(aba === 'unidades')}><Home size={15} /> Unidades ({unidades.length})</button>
            <button onClick={() => setAba('blocos')} className={abaBtn(aba === 'blocos')}><Building2 size={15} /> Blocos / Torres ({blocos.length})</button>
          </div>

          {aba === 'unidades' && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  value={buscaTexto}
                  onChange={(e) => setBuscaTexto(e.target.value)}
                  placeholder="Buscar apto, proprietário, inquilino, e-mail..."
                  className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs w-64 bg-white"
                />
              </div>
              <select
                value={filtroBloco}
                onChange={(e) => setFiltroBloco(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold bg-white"
              >
                <option value="">Todos os Blocos ({blocos.length})</option>
                {blocos.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.nome}
                  </option>
                ))}
              </select>
              <select
                value={filtroOcupacao}
                onChange={(e) => setFiltroOcupacao(e.target.value as typeof filtroOcupacao)}
                className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold bg-white"
              >
                <option value="todos">Todas as Ocupações</option>
                <option value="proprietario">🏠 Somente Proprietário</option>
                <option value="alugado">🔑 Somente Alugados (Inquilino)</option>
                <option value="sem_titular">⚠️ Sem Titular Cadastrado</option>
              </select>
            </div>
          )}
        </div>

        {carregando ? (
          <div className="text-center text-slate-400 py-12">Carregando estrutura...</div>
        ) : aba === 'unidades' ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Bloco / Unidade</th>
                  <th className={th}>Proprietário (Titular) &amp; Inquilino</th>
                  <th className={th}>Fração Ideal</th>
                  <th className={th}>Pré-Autorização (Acesso)</th>
                  <th className={th}>Vagas &amp; App</th>
                  <th className={`${th} text-right`}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {unidades
                  .filter((u) => {
                    if (filtroBloco && String(u.bloco_id) !== filtroBloco) return false;
                    const ehAlugado = u.tipo_ocupacao === 'alugado' || Boolean(u.inquilino_nome && u.inquilino_nome.trim() !== '');
                    if (filtroOcupacao === 'alugado' && !ehAlugado) return false;
                    if (filtroOcupacao === 'proprietario' && ehAlugado) return false;
                    if (filtroOcupacao === 'sem_titular' && u.proprietario_nome && u.proprietario_nome.trim() !== '') return false;
                    if (buscaTexto.trim() !== '') {
                      const q = buscaTexto.toLowerCase();
                      const alvo = [
                        u.bloco_nome,
                        u.numero,
                        u.proprietario_nome,
                        u.inquilino_nome,
                        u.proprietario_email,
                        u.proprietario_celular,
                        u.proprietario_cpf,
                      ]
                        .filter(Boolean)
                        .join(' ')
                        .toLowerCase();
                      if (!alvo.includes(q)) return false;
                    }
                    return true;
                  })
                  .map((u) => {
                    const emEdicao = editUnidade?.id === u.id;
                    const ehAlugado = u.tipo_ocupacao === 'alugado' || Boolean(u.inquilino_nome && u.inquilino_nome.trim() !== '');
                    return (
                      <tr key={u.id} className="hover:bg-slate-50">
                        <td className={`${td} font-semibold text-slate-700`}>
                          {emEdicao ? (
                            <div className="flex gap-1.5">
                              <select
                                value={editUnidade.bloco_id}
                                onChange={(e) => setEditUnidade({ ...editUnidade, bloco_id: e.target.value })}
                                className="px-2 py-1 border border-blue-400 rounded-lg text-xs font-bold bg-white"
                              >
                                {blocos.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
                              </select>
                              <input
                                value={editUnidade.numero}
                                onChange={(e) => setEditUnidade({ ...editUnidade, numero: e.target.value })}
                                className="px-2 py-1 border border-blue-400 rounded-lg text-xs font-bold w-20"
                              />
                            </div>
                          ) : (
                            <div>
                              <button
                                type="button"
                                onClick={() => setUnidadeFicha360Id(u.id)}
                                className="text-left group cursor-pointer"
                              >
                                <span className="font-extrabold text-slate-900 group-hover:text-indigo-600 transition">
                                  {u.numero}
                                </span>{' '}
                                <span className="text-xs font-bold text-slate-500">{u.bloco_nome ?? '—'}</span>
                              </button>
                              <div className="mt-0.5">
                                {ehAlugado ? (
                                  <span className="inline-block px-2 py-0.2 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
                                    🔑 Alugado
                                  </span>
                                ) : (
                                  <span className="inline-block px-2 py-0.2 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                                    🏠 Proprietário
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </td>

                        <td className={td}>
                          {u.proprietario_nome ? (
                            <div className="space-y-0.5">
                              <div className="text-xs font-extrabold text-slate-900">{u.proprietario_nome}</div>
                              {u.inquilino_nome && (
                                <div className="text-xs font-bold text-amber-800">
                                  🔑 Inq.: {u.inquilino_nome}
                                </div>
                              )}
                              <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-2.5">
                                {(u.proprietario_celular || u.proprietario_telefone) && (
                                  <span>📞 {(u.proprietario_celular || u.proprietario_telefone || '').split(';')[0]}</span>
                                )}
                                {u.proprietario_email && (
                                  <span className="truncate max-w-[200px]">✉️ {u.proprietario_email.split(';')[0]}</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setUnidadeFicha360Id(u.id)}
                              className="text-xs text-indigo-600 hover:underline font-semibold cursor-pointer"
                            >
                              + Informar Proprietário / Inquilino
                            </button>
                          )}
                        </td>

                        <td className={`${td} font-mono text-xs text-slate-600`}>
                          {u.fracao_ideal && u.fracao_ideal > 0
                            ? `${u.fracao_ideal.toFixed(6).replace('.', ',')}%`
                            : '0,000000%'}
                        </td>

                        <td className={td}>
                          {emEdicao ? (
                            <select
                              value={editUnidade.grupo_acesso_id}
                              onChange={(e) => setEditUnidade({ ...editUnidade, grupo_acesso_id: e.target.value })}
                              className="px-2.5 py-1.5 border border-blue-400 rounded-lg text-xs font-bold bg-white"
                            >
                              <option value="">— Padrão do Bloco —</option>
                              {grupos.map((g) => (
                                <option key={g.id} value={g.id}>
                                  🔑 {g.nome}
                                </option>
                              ))}
                            </select>
                          ) : u.grupo_acesso_nome ? (
                            <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-lg text-xs font-extrabold">
                              <ShieldCheck size={13} className="text-emerald-600" /> {u.grupo_acesso_nome}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">Padrão do Bloco</span>
                          )}
                        </td>

                        <td className={td}>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {emEdicao ? (
                              <select
                                value={editUnidade.limite_vagas}
                                onChange={(e) => setEditUnidade({ ...editUnidade, limite_vagas: e.target.value })}
                                className="px-2.5 py-1.5 border border-blue-400 rounded-lg text-xs font-bold bg-white"
                              >
                                <option value="">Padrão ({limiteVagasCondominio})</option>
                                <option value="0">0 vagas</option>
                                <option value="1">1 vaga</option>
                                <option value="2">2 vagas</option>
                                <option value="3">3 vagas</option>
                                <option value="4">4 vagas</option>
                                <option value="5">5 vagas</option>
                              </select>
                            ) : (() => {
                              const limEfetivo = u.limite_vagas !== null && u.limite_vagas !== undefined ? Number(u.limite_vagas) : limiteVagasCondominio;
                              const ocup = Number(u.qtd_veiculos ?? 0);
                              return (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${ocup >= limEfetivo && limEfetivo > 0 ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                                  🚗 {ocup}/{limEfetivo}
                                </span>
                              );
                            })()}
                            <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full text-xs font-bold" title="Moradores cadastrados no App / Facial">
                              📱 {u.qtd_moradores ?? 0}
                            </span>
                          </div>
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
                                  onClick={() => setUnidadeFicha360Id(u.id)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 cursor-pointer"
                                >
                                  <Eye size={13} /> Ficha 360º
                                </button>
                                <button
                                  type="button"
                                  disabled={enviando}
                                  onClick={() =>
                                    setEditUnidade({
                                      id: u.id,
                                      bloco_id: String(u.bloco_id ?? ''),
                                      numero: u.numero,
                                      grupo_acesso_id: u.grupo_acesso_id ? String(u.grupo_acesso_id) : '',
                                      limite_vagas: u.limite_vagas !== null && u.limite_vagas !== undefined ? String(u.limite_vagas) : '',
                                    })
                                  }
                                  className={btnEditar}
                                >
                                  <Pencil size={12} />
                                </button>
                                <button disabled={enviando} onClick={() => excluirUnidade(u)} className={btnExcluir}>Excluir</button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                {unidades.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400 py-10">Nenhuma unidade registrada neste condomínio.</td></tr>}
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

      {unidadeFicha360Id !== null && (
        <ModalFichaUnidade360
          unidadeId={unidadeFicha360Id}
          limiteVagasCondominio={limiteVagasCondominio}
          onFechar={() => setUnidadeFicha360Id(null)}
          onSalvo={() => {
            void carregar();
          }}
        />
      )}
    </div>
  );
}
