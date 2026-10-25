import { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, Plus, Pencil, Trash2, CreditCard, Home, X } from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import { Modal } from './moradores/AcoesMorador';
import FotoUsuario from '../components/FotoUsuario';

// Paridade com src/views/grupos_acesso.php: cards de grupos (portas vinculadas, Pessoas / Editar / Excluir),
// modais Criar/Editar (checkboxes de terminais + Marcar Todas), Excluir e "Atribuir Pessoas ao Grupo"
// (filtro Todos/Já Atribuídos/Não Atribuídos, bloco, busca nome/CPF, Selecionar Visíveis, Salvar e Sincronizar).

interface Grupo { id: number; nome: string; terminais: number[] }
interface Controlador { id: number; nome: string; tipo_acesso: string | null; bloco_id: number | null }
interface Pessoa { id: number; nome: string; cpf: string | null; grupo_acesso_id: number | null; bloco_id: number | null; bloco_nome: string | null; tem_foto: boolean }
interface Bloco { id: number; nome: string }
interface Dados { grupos: Grupo[]; controladores: Controlador[]; usuarios: Pessoa[]; blocos: Bloco[] }
interface Aviso { tipo: 'ok' | 'aviso' | 'erro'; mensagem: string }

const CORES_AVISO = {
  ok: 'bg-emerald-50 border-emerald-500 text-emerald-800',
  aviso: 'bg-amber-50 border-amber-500 text-amber-800',
  erro: 'bg-rose-50 border-rose-500 text-rose-800',
};
const msgErro = (e: unknown) => (e instanceof ErroApi ? e.message : 'Erro inesperado.');

export default function GruposAcesso() {
  const [dados, setDados] = useState<Dados>({ grupos: [], controladores: [], usuarios: [], blocos: [] });
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [editando, setEditando] = useState<Grupo | 'novo' | null>(null);
  const [excluindo, setExcluindo] = useState<Grupo | null>(null);
  const [vinculando, setVinculando] = useState<Grupo | null>(null);

  const carregar = useCallback(async () => {
    try {
      setDados(await api<Dados>('grupos_listar'));
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: msgErro(e) });
    } finally {
      setCarregando(false);
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const concluir = (a: Aviso) => {
    setAviso(a);
    setEditando(null);
    setExcluindo(null);
    setVinculando(null);
    carregar();
    document.querySelector('main .overflow-auto')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8">
      {aviso && (
        <div className={`border-l-4 px-4 py-3 rounded-lg text-sm font-semibold mb-5 flex justify-between gap-3 ${CORES_AVISO[aviso.tipo]}`}>
          <span>{aviso.mensagem}</span>
          <button onClick={() => setAviso(null)} aria-label="Fechar aviso"><X size={16} /></button>
        </div>
      )}

      <div className="flex justify-between items-end gap-4 mb-8 flex-wrap">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-2.5"><Users size={28} className="text-blue-600" /> Grupos de Acesso</h1>
          <p className="text-slate-500 mt-2 max-w-3xl leading-relaxed">
            Crie grupos de acesso (ex: "Funcionários", "Visitantes Frequentes") e defina em quais catracas e portas eles podem entrar. Depois, ao cadastrar um morador ou funcionário, basta vinculá-lo a um grupo para que ele herde esses acessos automaticamente.
          </p>
        </div>
        <button onClick={() => setEditando('novo')} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold">
          <Plus size={20} /> Novo Grupo
        </button>
      </div>

      {carregando ? (
        <div className="text-center text-slate-400 py-16">Carregando grupos...</div>
      ) : dados.grupos.length === 0 ? (
        <div className="bg-white py-16 px-5 rounded-2xl border border-slate-200 text-center">
          <Users size={60} className="mx-auto mb-4 text-slate-300" strokeWidth={1.5} />
          <h3 className="text-xl font-bold text-slate-600 mb-2">Nenhum grupo criado</h3>
          <p className="text-slate-400">Clique em "Novo Grupo" para começar a organizar os acessos.</p>
        </div>
      ) : (
        <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(350px,1fr))]">
          {dados.grupos.map((g) => {
            const vinculados = dados.controladores.filter((c) => g.terminais.includes(c.id));
            return (
              <div key={g.id} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col">
                <div className="flex justify-between items-start gap-3 mb-4">
                  <h3 className="text-xl font-extrabold text-slate-900">{g.nome}</h3>
                  <span className="bg-indigo-50 text-indigo-600 border border-indigo-200 px-2.5 py-1 rounded-xl text-xs font-bold whitespace-nowrap">{g.terminais.length} porta(s)</span>
                </div>
                <div className="flex-1 mb-5">
                  {g.terminais.length === 0 ? (
                    <span className="text-slate-400 text-sm italic">Nenhuma porta vinculada.</span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {vinculados.slice(0, 6).map((c) => (
                        <span key={c.id} className="bg-slate-50 border border-slate-200 px-2 py-1 rounded-md text-sm text-slate-600 font-semibold">
                          {c.tipo_acesso === 'geral_pedestre' ? '🚪' : '🏢'} {c.nome}
                        </span>
                      ))}
                      {g.terminais.length > 6 && <span className="bg-slate-100 px-2 py-1 rounded-md text-sm text-slate-500 font-semibold">+{g.terminais.length - 6}</span>}
                    </div>
                  )}
                </div>
                <div className="flex gap-2.5 border-t border-slate-100 pt-4">
                  <button onClick={() => setVinculando(g)} className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"><Users size={14} /> Pessoas</button>
                  <button onClick={() => setEditando(g)} className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold"><Pencil size={14} /> Editar</button>
                  <button onClick={() => setExcluindo(g)} className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 text-sm font-semibold"><Trash2 size={14} /> Excluir</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editando && <ModalGrupo grupo={editando === 'novo' ? null : editando} controladores={dados.controladores} onFechar={() => setEditando(null)} onConcluido={concluir} />}
      {excluindo && <ModalExcluir grupo={excluindo} onFechar={() => setExcluindo(null)} onConcluido={concluir} />}
      {vinculando && <ModalVincular grupo={vinculando} pessoas={dados.usuarios} blocos={dados.blocos} onFechar={() => setVinculando(null)} onConcluido={concluir} />}
    </div>
  );
}

/** modal-novo / modal-edicao */
function ModalGrupo({ grupo, controladores, onFechar, onConcluido }: { grupo: Grupo | null; controladores: Controlador[]; onFechar: () => void; onConcluido: (a: Aviso) => void }) {
  const [nome, setNome] = useState(grupo?.nome ?? '');
  const [marcados, setMarcados] = useState<number[]>(grupo?.terminais ?? []);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  const alternar = (id: number) => setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      // Igual ao legado: grava na ordem em que os terminais aparecem na lista
      const ordenados = controladores.map((c) => c.id).filter((id) => marcados.includes(id));
      const r = await api<{ mensagem: string }>('grupo_salvar', { corpo: { ...(grupo ? { id: grupo.id } : {}), nome, terminais_acesso: ordenados } });
      onConcluido({ tipo: 'ok', mensagem: r.mensagem });
    } catch (e2) {
      setErro(msgErro(e2));
      setEnviando(false);
    }
  };

  return (
    <Modal titulo={grupo ? 'Editar Grupo' : 'Criar Novo Grupo'} borda="border-t-blue-600" onFechar={onFechar}>
      <form onSubmit={salvar}>
        {erro && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold rounded-lg px-3 py-2 mb-4">{erro}</div>}
        <label className="block text-sm font-bold text-slate-600 mb-1.5">Nome do Grupo *</label>
        <input required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Funcionários, Visitantes, Bloco A"
          className="w-full px-3 py-2.5 border border-slate-300 rounded-lg outline-none focus:border-blue-500 font-semibold mb-5" />
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm font-bold text-slate-600">Portas e Catracas Permitidas</span>
          <button type="button" onClick={() => setMarcados(controladores.map((c) => c.id))} className="text-blue-600 font-bold text-sm">Marcar Todas</button>
        </div>
        <div className="flex flex-col gap-2.5 bg-slate-50 p-4 border border-slate-200 rounded-xl max-h-[300px] overflow-y-auto">
          {controladores.map((c) => (
            <label key={c.id} className="flex items-center gap-2 bg-white px-3 py-2 border border-slate-300 rounded-lg cursor-pointer text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={marcados.includes(c.id)} onChange={() => alternar(c.id)} className="w-[18px] h-[18px] accent-blue-600" />
              {c.nome}
            </label>
          ))}
          {controladores.length === 0 && <span className="text-sm text-slate-400">Nenhum terminal cadastrado.</span>}
        </div>
        <div className="flex gap-3 mt-6">
          <button type="button" onClick={onFechar} className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200">Cancelar</button>
          <button disabled={enviando} className={`flex-1 py-2.5 rounded-xl text-white font-bold disabled:opacity-60 ${grupo ? 'bg-slate-900 hover:bg-slate-800' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {grupo ? 'Salvar Alterações' : 'Criar Grupo'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** modal-exclusao */
function ModalExcluir({ grupo, onFechar, onConcluido }: { grupo: Grupo; onFechar: () => void; onConcluido: (a: Aviso) => void }) {
  const [enviando, setEnviando] = useState(false);
  const excluir = async () => {
    setEnviando(true);
    try {
      const r = await api<{ mensagem: string }>('grupo_excluir', { corpo: { id: grupo.id } });
      onConcluido({ tipo: 'ok', mensagem: r.mensagem });
    } catch (e) {
      onConcluido({ tipo: 'erro', mensagem: msgErro(e) });
    }
  };
  return (
    <Modal titulo={<span className="text-red-700">Excluir Grupo</span>} borda="border-t-red-500" onFechar={onFechar}>
      <p className="text-slate-600 leading-relaxed">Tem certeza que deseja excluir o grupo <b>{grupo.nome}</b>?</p>
      <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-lg text-sm font-semibold my-5">
        Atenção: Os usuários que estiverem vinculados a este grupo perderão este vínculo e seus acessos poderão ser revogados.
      </div>
      <div className="flex gap-3">
        <button onClick={onFechar} className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200">Cancelar</button>
        <button disabled={enviando} onClick={excluir} className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold disabled:opacity-60">Sim, Excluir</button>
      </div>
    </Modal>
  );
}

/** modal-vincular: atribui pessoas e sincroniza cada uma (quem saiu + quem entrou) com morador_sync. */
function ModalVincular({ grupo, pessoas, blocos, onFechar, onConcluido }: {
  grupo: Grupo; pessoas: Pessoa[]; blocos: Bloco[]; onFechar: () => void; onConcluido: (a: Aviso) => void;
}) {
  const [marcados, setMarcados] = useState<Set<number>>(() => new Set(pessoas.filter((p) => p.grupo_acesso_id === grupo.id).map((p) => p.id)));
  const [filtro, setFiltro] = useState<'todos' | 'atribuidos' | 'nao_atribuidos'>('todos');
  const [bloco, setBloco] = useState('');
  const [busca, setBusca] = useState('');
  const [progresso, setProgresso] = useState<{ texto: string; pct: number; modo?: string } | null>(null);

  const visiveis = useMemo(() => {
    const t = busca.toLowerCase();
    return pessoas.filter((p) => {
      const at = marcados.has(p.id);
      return (p.nome.toLowerCase().includes(t) || (p.cpf ?? 'sem cpf').toLowerCase().includes(t))
        && (bloco === '' || String(p.bloco_id ?? '') === bloco)
        && (filtro === 'todos' || (filtro === 'atribuidos' ? at : !at));
    });
  }, [pessoas, busca, bloco, filtro, marcados]);

  const todosVisiveisMarcados = visiveis.length > 0 && visiveis.every((p) => marcados.has(p.id));
  const alternar = (id: number) => setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const alternarVisiveis = (marcar: boolean) => setMarcados((m) => { const n = new Set(m); visiveis.forEach((p) => (marcar ? n.add(p.id) : n.delete(p.id))); return n; });

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setProgresso({ texto: 'Salvando no banco de dados...', pct: 0 });
    let ids: number[];
    try {
      ids = (await api<{ usuarios_sync: number[] }>('grupo_vincular', { corpo: { grupo_id: grupo.id, usuarios: [...marcados] } })).usuarios_sync;
    } catch (e2) {
      alert('Erro ao salvar: ' + msgErro(e2));
      setProgresso(null);
      return;
    }
    // Correcao: no legado esta etapa chamava uma acao inexistente e nada chegava aos equipamentos
    let ok = 0, ignorados = 0, falhas = 0, modo = '';
    for (let i = 0; i < ids.length; i++) {
      setProgresso({ texto: `Sincronizando ${i + 1} de ${ids.length}...`, pct: Math.round((i / ids.length) * 100), modo });
      try {
        const r = await api<{ resultado: string; hardware?: { modo: string } }>('morador_sync', { corpo: { id: ids[i] } });
        modo = r.hardware?.modo ?? modo;
        if (r.resultado === 'ok') ok++; else if (r.resultado === 'ignorado') ignorados++; else falhas++;
      } catch {
        falhas++;
      }
    }
    const simulado = modo === 'simulado' ? ' (modo SIMULADO: nada foi enviado aos equipamentos)' : '';
    onConcluido({
      tipo: falhas ? 'aviso' : 'ok',
      mensagem: `Pessoas do grupo "${grupo.nome}" atualizadas: ${marcados.size} no grupo. Sincronização: ${ok} enviada(s), ${ignorados} sem foto/CPF, ${falhas} com falha${simulado}.`,
    });
  };

  const campo = 'px-3 py-2 border border-slate-300 rounded-md text-sm outline-none bg-white';
  return (
    <Modal titulo={<>Atribuir Pessoas ao Grupo: <span className="text-blue-600">{grupo.nome}</span></>} borda="border-t-blue-600" largura="max-w-3xl" onFechar={progresso ? () => {} : onFechar}>
      <div className="flex gap-3 mb-4 flex-wrap">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">Filtro:
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} className={campo}>
            <option value="todos">Todos</option>
            <option value="atribuidos">Já Atribuídos</option>
            <option value="nao_atribuidos">Não Atribuídos</option>
          </select>
        </label>
        <select value={bloco} onChange={(e) => setBloco(e.target.value)} className={campo}>
          <option value="">Todos os Blocos</option>
          {blocos.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
        </select>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar por nome ou CPF..." className={`${campo} flex-1 min-w-[200px]`} />
      </div>

      <form onSubmit={salvar}>
        <div className="flex justify-between items-center bg-slate-50 px-4 py-2.5 border border-slate-200 border-b-0 rounded-t-lg">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={todosVisiveisMarcados} onChange={(e) => alternarVisiveis(e.target.checked)} className="w-[18px] h-[18px] accent-blue-600" />
            <span className="text-sm font-bold text-slate-700">Selecionar Visíveis</span>
          </label>
          <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2.5 py-1 rounded-xl">{marcados.size} selecionado{marcados.size === 1 ? '' : 's'}</span>
        </div>
        <div className="border border-slate-200 rounded-b-lg max-h-[45vh] overflow-y-auto">
          {visiveis.map((p) => (
            <label key={p.id} className="flex items-center gap-4 px-4 py-3 border-b border-slate-100 cursor-pointer hover:bg-slate-50">
              <input type="checkbox" checked={marcados.has(p.id)} onChange={() => alternar(p.id)} className="w-[18px] h-[18px] accent-blue-600 mr-1" />
              <FotoUsuario id={p.id} temFoto={p.tem_foto} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-blue-600 truncate">{p.nome}</div>
                <div className="flex gap-4 text-xs text-slate-500 mt-1">
                  <span className="flex items-center gap-1"><CreditCard size={13} /> {p.cpf || 'Sem CPF'}</span>
                  <span className="flex items-center gap-1"><Home size={13} /> {p.bloco_nome || 'Sem Bloco/Unidade'}</span>
                </div>
              </div>
            </label>
          ))}
          {pessoas.length === 0 && <div className="p-10 text-center text-slate-400">Nenhum usuário ativo encontrado.</div>}
          {pessoas.length > 0 && visiveis.length === 0 && <div className="p-10 text-center text-slate-400">Nenhuma pessoa corresponde aos filtros.</div>}
        </div>

        {progresso ? (
          <div className="mt-5 bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
            <p className="font-bold text-blue-800 mb-2.5">{progresso.texto}</p>
            <div className="w-full bg-blue-100 rounded-lg h-2 overflow-hidden"><div className="h-full bg-blue-600 transition-all" style={{ width: `${progresso.pct}%` }} /></div>
            {progresso.modo === 'simulado' && <p className="text-xs font-bold text-amber-700 mt-2">Laboratório em modo SIMULADO: nenhum comando é enviado aos equipamentos.</p>}
          </div>
        ) : (
          <div className="flex gap-3 mt-6">
            <button type="button" onClick={onFechar} className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200">Cancelar</button>
            <button type="submit" className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold">Salvar e Sincronizar</button>
          </div>
        )}
      </form>
    </Modal>
  );
}
