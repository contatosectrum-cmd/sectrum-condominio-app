import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { X, Save, Check, UserPlus, Pencil, RefreshCw } from 'lucide-react';
import { SENHA_PADRAO } from '../../lib/constantes';
import { api, ErroApi } from '../../lib/api';
import ValidadorCpf from '../../components/ValidadorCpf';
import type { Morador } from '../Moradores';

// Acoes do modulo de moradores - paridade com os formularios/modais de views/consulta_pessoas.php:
// aba "Cadastrar Novo", modal-edicao, modal-bloqueio, modal-exclusao, modal-restauracao,
// modal-exclusao-definitiva e modal-sync (sincronizacao em lote com barra de progresso).

export interface Bloco { id: number; nome: string }
export interface Unidade {
  id: number;
  numero: string;
  bloco_id: number | null;
  bloco_nome: string | null;
  ramal?: string | null;
  ramal_custom?: string | null;
  ramal_automatico?: string | null;
  ramal_efetivo?: string | null;
}
export interface Controlador { id: number; nome: string; tipo_acesso: string | null; bloco_id: number | null }
export interface Grupo { id: number; nome: string; terminais_acesso: string | null }
export interface CondominioInfo { id: number; nome: string; tipo_portaria: string; portaria_autonoma: number; permite_temporada?: number }
export interface Apoio { blocos: Bloco[]; unidades: Unidade[]; controladores: Controlador[]; grupos_acesso: Grupo[]; condominio?: CondominioInfo }
export interface Aviso { tipo: 'ok' | 'aviso' | 'erro'; mensagem: string }
interface RespostaAcao { tipo?: 'ok' | 'aviso'; mensagem: string }

const RELACOES = [
  { valor: 'Titular', rotulo: 'Proprietário / Titular' },
  { valor: 'Inquilino', rotulo: 'Inquilino' },
  { valor: 'Dependente', rotulo: 'Dependente / Familiar' },
  { valor: 'Funcionario', rotulo: 'Funcionário da Unidade' },
];

const rotuloCampo = 'block text-[0.78rem] font-bold text-slate-600 mb-1.5';
const entrada = 'w-full px-3 py-2.5 border border-slate-300 rounded-lg outline-none focus:border-blue-500 bg-white text-slate-900';

export function mascaraCpf(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}
export function mascaraTelefone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}

/** Executa uma acao da API e converte o resultado em aviso (ok/aviso/erro), como os flash() do legado. */
async function executar(rota: string, corpo: unknown): Promise<Aviso> {
  try {
    const r = await api<RespostaAcao>(rota, { corpo });
    return { tipo: r.tipo ?? 'ok', mensagem: r.mensagem };
  } catch (e) {
    return { tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro inesperado.' };
  }
}

export function Modal({ titulo, borda, onFechar, children, largura = 'max-w-lg' }: { titulo: ReactNode; borda: string; onFechar: () => void; children: ReactNode; largura?: string }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onFechar]);
  return (
    <div className="fixed inset-0 z-[90] bg-slate-900/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${largura} my-8 p-7 border-t-[6px] ${borda}`} role="dialog">
        <div className="flex justify-between items-center mb-4 gap-3">
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2.5">{titulo}</h2>
          <button onClick={onFechar} aria-label="Fechar" className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center shrink-0"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Grupo de acesso + selecao transparente de quais portas o morador pode abrir pelo App e usar na catraca:
 * - Separa Portaria de Entrada (Pedestre / Veiculos) das Portas de Blocos;
 * - Destaca automaticamente o Bloco ao qual a unidade selecionada pertence.
 */
function CamposAcesso({ apoio, unidadeId, grupoId, setGrupoId, terminais, setTerminais }: {
  apoio: Apoio; unidadeId: string; grupoId: string; setGrupoId: (v: string) => void; terminais: number[]; setTerminais: (v: number[]) => void;
}) {
  const doGrupo = useMemo(() => {
    const g = apoio.grupos_acesso.find((x) => String(x.id) === grupoId);
    if (!g) return null;
    try { return (JSON.parse(g.terminais_acesso ?? '[]') as (string | number)[]).map(Number); } catch { return []; }
  }, [apoio.grupos_acesso, grupoId]);

  const unidSel = useMemo(() => apoio.unidades.find((u) => String(u.id) === unidadeId) ?? null, [apoio.unidades, unidadeId]);
  const blocoIdMorador = unidSel?.bloco_id !== null && unidSel?.bloco_id !== undefined ? Number(unidSel.bloco_id) : null;
  const ehPortariaRemota = (apoio.condominio?.portaria_autonoma ?? 0) === 1;

  const portariaEntrada = useMemo(
    () => apoio.controladores.filter((c) => c.bloco_id === null || c.tipo_acesso === 'geral_pedestre' || c.tipo_acesso === 'geral_veiculo'),
    [apoio.controladores]
  );
  const portasBlocos = useMemo(
    () => apoio.controladores.filter((c) => c.bloco_id !== null && c.tipo_acesso !== 'geral_pedestre' && c.tipo_acesso !== 'geral_veiculo'),
    [apoio.controladores]
  );

  const alternar = (id: number) => setTerminais(terminais.includes(id) ? terminais.filter((t) => t !== id) : [...terminais, id]);

  return (
    <>
      <div className="col-span-full mt-2">
        <label className={rotuloCampo}>Grupo de Acesso</label>
        <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)} className={entrada}>
          <option value="">Acesso Personalizado (Automático pelo Bloco da Unidade + Portaria)</option>
          {apoio.grupos_acesso.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
        </select>
      </div>

      <div className="col-span-full mt-2 space-y-3">
        <label className={rotuloCampo}>Portas Liberadas no App do Celular &amp; Catracas</label>

        {/* 1. Portaria de Entrada (Pedestre / Veículos) */}
        <div className="bg-blue-50/80 p-4 border border-blue-200 rounded-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
            <span className="text-xs font-extrabold uppercase tracking-wide text-blue-900">
              1. Portões de Entrada da Portaria (Pedestre / Veículos)
            </span>
            <span className={`text-[0.7rem] font-bold px-2 py-0.5 rounded-full border ${ehPortariaRemota ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-amber-100 text-amber-800 border-amber-300'}`}>
              {ehPortariaRemota ? '🤖 Condomínio em Portaria Remota (Liberado p/ todos)' : '🏢 Condomínio em Portaria Humana (Opcional por morador)'}
            </span>
          </div>
          <p className="text-xs text-slate-600 mb-3">
            {ehPortariaRemota
              ? 'Como o condomínio está em modo Portaria Remota, todos os moradores já abrem estes portões gerais da portaria pelo celular.'
              : 'Neste condomínio com Portaria Humana, marque abaixo caso queira permitir que este morador também abra o portão de Pedestre ou de Veículos pelo aplicativo no celular:'}
          </p>
          <div className="flex flex-wrap gap-2.5">
            {portariaEntrada.length === 0 && <span className="text-xs text-slate-400">Nenhum portão geral de portaria cadastrado.</span>}
            {portariaEntrada.map((c) => {
              const marcado = doGrupo ? doGrupo.includes(c.id) : (ehPortariaRemota || terminais.includes(c.id));
              const desabilitado = !!doGrupo || ehPortariaRemota;
              return (
                <label
                  key={c.id}
                  className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-bold transition ${
                    marcado ? 'bg-blue-600 text-white border-blue-600 shadow-xs' : 'bg-white text-slate-800 border-blue-300'
                  } ${desabilitado ? 'opacity-75' : 'cursor-pointer'}`}
                >
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-white"
                    checked={marcado}
                    disabled={desabilitado}
                    onChange={() => alternar(c.id)}
                  />
                  <span>{c.nome}</span>
                  {ehPortariaRemota && <span className="text-[0.65rem] bg-white/20 px-1.5 py-0.5 rounded">Automático</span>}
                </label>
              );
            })}
          </div>
        </div>

        {/* 2. Portas dos Blocos */}
        <div className="bg-purple-50/80 p-4 border border-purple-200 rounded-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
            <span className="text-xs font-extrabold uppercase tracking-wide text-purple-900">
              2. Portas Exclusivas dos Blocos / Torres
            </span>
            {unidSel && (
              <span className="text-[0.7rem] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                ✓ Unidade pertence ao: {unidSel.bloco_nome ?? 'Bloco'} (Liberado automaticamente)
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 mb-3">
            O morador só tem acesso automático à porta do <b>seu próprio bloco</b> (pelo vínculo da Unidade). Outros blocos ficam bloqueados por padrão — marque outro bloco abaixo apenas se este morador também possuir unidade/vaga nele:
          </p>
          <div className="flex flex-wrap gap-2">
            {portasBlocos.length === 0 && (
              <span className="text-xs text-slate-500">
                Nenhum terminal vinculado a bloco. Em <b>Terminais LPR/Facial</b>, selecione a regra <b>"Só Moradores: Bloco..."</b> no terminal correspondente.
              </span>
            )}
            {portasBlocos.map((c) => {
              const ehBlocoPadrao = blocoIdMorador !== null && c.bloco_id !== null && Number(c.bloco_id) === blocoIdMorador;
              const marcado = ehBlocoPadrao || (doGrupo ? doGrupo.includes(c.id) : terminais.includes(c.id));
              const desabilitado = !!doGrupo || ehBlocoPadrao;
              return (
                <label
                  key={c.id}
                  className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm font-bold transition ${
                    ehBlocoPadrao
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : marcado
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-white text-purple-900 border-purple-300'
                  } ${desabilitado ? '' : 'cursor-pointer'}`}
                >
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-white"
                    checked={marcado}
                    disabled={desabilitado}
                    onChange={() => alternar(c.id)}
                  />
                  <span>{c.nome}</span>
                  {ehBlocoPadrao ? (
                    <span className="text-[0.65rem] bg-white/25 px-1.5 py-0.5 rounded font-extrabold">Bloco do Morador</span>
                  ) : !marcado ? (
                    <span className="text-[0.65rem] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">Outro Bloco</span>
                  ) : null}
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function calcularRamalAutomaticoCliente(u: Unidade | null): string {
  if (!u) return '';
  if (u.ramal_automatico) return u.ramal_automatico;
  const numLimpo = (u.numero ?? '').replace(/\D+/g, '').replace(/^0+/, '') || (u.numero ?? '').replace(/\D+/g, '');
  if (!numLimpo) return '';
  const apto2 = numLimpo.padStart(2, '0');
  const mBloco = (u.bloco_nome ?? '').match(/(\d+)/);
  if (mBloco) {
    const bSemZero = mBloco[1].replace(/^0+/, '') || '0';
    if (bSemZero !== '0') {
      const bloco2 = bSemZero.padStart(2, '0');
      if ((bloco2 + apto2).length === 4) return bloco2 + apto2;
      if ((bSemZero + apto2).length === 4) return bSemZero + apto2;
      return bloco2 + apto2;
    }
  }
  return apto2;
}

function SelectUnidade({ apoio, valor, onChange, vazio }: { apoio: Apoio; valor: string; onChange: (v: string) => void; vazio: string }) {
  return (
    <select required value={valor} onChange={(e) => onChange(e.target.value)} className={entrada}>
      <option value="">{vazio}</option>
      {apoio.unidades.map((u) => {
        const ramalExib = u.ramal_efetivo || calcularRamalAutomaticoCliente(u);
        return (
          <option key={u.id} value={u.id}>
            {u.bloco_nome ?? 'Sem Bloco'} — Unid: {u.numero}{ramalExib ? ` (📞 Ramal: ${ramalExib})` : ''}
          </option>
        );
      })}
    </select>
  );
}

/**
 * Bloco visual de configuração e exemplo do Ramal do Interfone vinculado ao apartamento do morador.
 */
function CampoRamalInterfone({ apoio, unidadeId, ramal, setRamal }: {
  apoio: Apoio; unidadeId: string; ramal: string; setRamal: (v: string) => void;
}) {
  const unidSel = useMemo(() => apoio.unidades.find((u) => String(u.id) === unidadeId) ?? null, [apoio.unidades, unidadeId]);
  const ramalAuto = useMemo(() => calcularRamalAutomaticoCliente(unidSel), [unidSel]);
  const ramalEfetivo = (ramal.trim() || ramalAuto || '0101');
  const ehCustomizado = Boolean(unidSel && ramal.trim() !== '' && ramal.trim() !== ramalAuto);

  return (
    <div className="col-span-full bg-emerald-50/70 border border-emerald-200 rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <span className="text-xs font-extrabold uppercase tracking-wide text-emerald-950 flex items-center gap-1.5">
          📞 Ramal do Interfone (Vinculado ao Apartamento)
        </span>
        <span className={`text-[0.7rem] font-extrabold px-2.5 py-0.5 rounded-full border ${
          ehCustomizado
            ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
            : 'bg-emerald-100 text-emerald-800 border-emerald-300'
        }`}>
          {ehCustomizado ? '✏️ Ramal Personalizado' : '⚡ Geração Automática Ativa'}
        </span>
      </div>

      <p className="text-xs text-slate-600 mb-3 leading-relaxed">
        <b>Criação 100% automática:</b> ao selecionar a Unidade, o sistema já cria e ativa automaticamente o ramal combinando <b>Bloco + Apartamento</b> (Ex.: <code className="bg-white px-1.5 py-0.5 rounded border border-emerald-200 font-mono font-bold text-emerald-800">BL_01 + Apto 01 = 0101</code>). Se quiser personalizar o número de discagem deste apartamento, edite abaixo e ele será atualizado em todo o sistema (Leitor Facial da Portaria, Interfone entre Apartamentos e App do Morador):
      </p>

      <div className="grid gap-3 md:grid-cols-12 items-center">
        <div className="md:col-span-5">
          <label className="block text-[0.72rem] font-extrabold text-emerald-900 mb-1">
            NÚMERO DO RAMAL DESTE APARTAMENTO
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              maxLength={20}
              value={ramal}
              disabled={!unidSel}
              onChange={(e) => setRamal(e.target.value.replace(/[^0-9A-Za-z_-]/g, ''))}
              placeholder={unidSel ? (ramalAuto || 'Ex: 0101') : 'Selecione a unidade primeiro...'}
              className={`${entrada} font-mono font-extrabold text-base tracking-wider !border-emerald-300 focus:!border-emerald-600 disabled:bg-slate-100 disabled:text-slate-400`}
            />
            {unidSel && ehCustomizado && ramalAuto && (
              <button
                type="button"
                onClick={() => setRamal(ramalAuto)}
                title={`Voltar para o ramal automático (${ramalAuto})`}
                className="px-3 py-2 rounded-lg text-xs font-extrabold bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 shrink-0 cursor-pointer"
              >
                Usar {ramalAuto}
              </button>
            )}
          </div>
        </div>

        <div className="md:col-span-7 bg-white/90 border border-emerald-200/90 rounded-xl p-3 text-xs text-slate-700">
          {unidSel ? (
            <div className="space-y-1">
              <div className="font-extrabold text-emerald-900 flex items-center justify-between gap-2 flex-wrap">
                <span>🏠 {unidSel.bloco_nome ?? 'Sem Bloco'} / Apto {unidSel.numero}</span>
                <span className="bg-emerald-600 text-white px-2 py-0.5 rounded font-mono text-xs">
                  Ramal Ativo: {ramalEfetivo}
                </span>
              </div>
              <p className="text-slate-600">
                • <b>Na Portaria (Leitor Facial) ou no App:</b> basta discar <b className="font-mono text-emerald-700 bg-emerald-50 px-1 rounded">{ramalEfetivo}</b>{ramalAuto && ramalEfetivo !== ramalAuto ? <> (ou <b className="font-mono">{ramalAuto}</b>)</> : ''} para tocar no celular de todos os moradores deste apartamento.
              </p>
            </div>
          ) : (
            <div className="space-y-1 text-slate-500">
              <div className="font-bold text-slate-700">💡 Exemplo de Criação Automática de Ramal:</div>
              <div>• <b>BL_01 + Unid. 01</b> → Cria automaticamente o ramal <b className="font-mono text-emerald-700">0101</b> (ou <b className="font-mono">101</b>)</div>
              <div>• <b>BL_06 + Unid. 102</b> → Cria automaticamente o ramal <b className="font-mono text-emerald-700">6102</b> (ou <b className="font-mono">06102</b>)</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Aba "Cadastrar Novo" (acao_form = novo_morador). */
export function FormNovoMorador({ apoio, onConcluido }: { apoio: Apoio; onConcluido: (a: Aviso) => void }) {
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [unidade, setUnidade] = useState('');
  const [ramal, setRamal] = useState('');
  const [relacao, setRelacao] = useState('Titular');
  const [grupoId, setGrupoId] = useState('');
  const [terminais, setTerminais] = useState<number[]>([]);
  const [gerarAcesso, setGerarAcesso] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const selecionarUnidadeNovo = (novoId: string) => {
    setUnidade(novoId);
    const u = apoio.unidades.find((x) => String(x.id) === novoId) ?? null;
    setRamal(u ? (u.ramal_efetivo || calcularRamalAutomaticoCliente(u)) : '');
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    const r = await executar('morador_novo', {
      nome, cpf, unidade_id: unidade, relacao, ramal: ramal.trim(), grupo_acesso_id: grupoId, gerar_acesso: gerarAcesso,
      terminais_permitidos: grupoId ? [] : terminais, // checkboxes desabilitados nao sao enviados (igual ao legado)
    });
    setEnviando(false);
    if (r.tipo === 'erro') setErro(r.mensagem); // legado: erros aparecem acima do formulario, sem perder o que foi digitado
    else onConcluido(r);
  };

  return (
    <div>
      {erro && <div className="bg-red-100 text-red-800 border border-red-400 px-4 py-3 rounded-xl mb-4 font-semibold">⚠ {erro}</div>}
      <div className="bg-white rounded-2xl border border-slate-200 border-t-4 border-t-emerald-500 p-6 shadow-sm">
        <div className="flex items-center gap-2.5 text-xl font-extrabold text-slate-900 mb-6">
          <span className="bg-green-100 text-green-600 p-2 rounded-xl"><UserPlus size={20} /></span> Cadastrar Novo Morador
        </div>
        <form onSubmit={enviar}>
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className={rotuloCampo}>Nome Completo *</label><input required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: João da Silva" className={entrada} /></div>
            <div>
              <label className={rotuloCampo}>CPF (apenas números) *</label>
              <input required maxLength={14} value={cpf} onChange={(e) => setCpf(mascaraCpf(e.target.value))} placeholder="000.000.000-00" className={entrada} />
              <ValidadorCpf cpf={cpf} onNomeEncontrado={(nomeSug) => { if (!nome.trim()) setNome(nomeSug); }} />
            </div>
            <div><label className={rotuloCampo}>Unidade Pertencente *</label><SelectUnidade apoio={apoio} valor={unidade} onChange={selecionarUnidadeNovo} vazio="Selecione o Bloco e Apto..." /></div>
            <div>
              <label className={rotuloCampo}>Relação com o Imóvel</label>
              <select value={relacao} onChange={(e) => setRelacao(e.target.value)} className={entrada}>
                {RELACOES.map((r) => <option key={r.valor} value={r.valor}>{r.rotulo}</option>)}
              </select>
            </div>
            <CampoRamalInterfone apoio={apoio} unidadeId={unidade} ramal={ramal} setRamal={setRamal} />
            <CamposAcesso apoio={apoio} unidadeId={unidade} grupoId={grupoId} setGrupoId={setGrupoId} terminais={terminais} setTerminais={setTerminais} />
            <label className="col-span-full bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-start gap-3.5 cursor-pointer">
              <input type="checkbox" checked={gerarAcesso} onChange={(e) => setGerarAcesso(e.target.checked)} className="w-6 h-6 mt-0.5 accent-blue-600 shrink-0" />
              <span className="font-extrabold text-slate-900">
                Gerar Acesso ao App do Morador
                <span className="block font-medium text-sm text-slate-500 mt-1.5">
                  Cria login com o CPF e senha provisória <b className="bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded">{SENHA_PADRAO}</b>. Recomendado para Titulares e Inquilinos.
                </span>
              </span>
            </label>
          </div>
          <button disabled={enviando} className="mt-6 w-full inline-flex items-center justify-center gap-2 py-4 text-[1.05rem] font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60">
            <Check size={18} /> {enviando ? 'Salvando...' : 'Concluir Cadastro'}
          </button>
        </form>
      </div>
    </div>
  );
}

/** modal-edicao (acao_form = editar_morador), incluindo veiculos/vagas e reset de senha. */
export function ModalEditar({ m, apoio, onFechar, onConcluido }: { m: Morador; apoio: Apoio; onFechar: () => void; onConcluido: (a: Aviso) => void }) {
  const [nome, setNome] = useState(m.nome);
  const [cpf, setCpf] = useState(mascaraCpf(m.cpf ?? ''));
  const [telefone, setTelefone] = useState(m.telefone ?? '');
  const [unidade, setUnidade] = useState(m.unidade_id ? String(m.unidade_id) : '');
  const unidInicial = apoio.unidades.find((u) => u.id === m.unidade_id) ?? null;
  const [ramal, setRamal] = useState(
    m.ramal || unidInicial?.ramal_efetivo || calcularRamalAutomaticoCliente(unidInicial)
  );
  const [relacao, setRelacao] = useState(m.relacao || 'Titular');
  const [grupoId, setGrupoId] = useState(m.grupo_acesso_id ? String(m.grupo_acesso_id) : '');
  const [terminais, setTerminais] = useState<number[]>((m.terminais_acesso ?? []).map(Number));
  const [veiculos, setVeiculos] = useState(m.veiculos.map((v) => ({ id: v.id, placa: v.placa, vaga: v.vaga_garagem ?? '', excluir: false })));
  const [novaPlaca, setNovaPlaca] = useState('');
  const [novaVaga, setNovaVaga] = useState('');
  const [resetSenha, setResetSenha] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const selecionarUnidadeEdicao = (novoId: string) => {
    setUnidade(novoId);
    const u = apoio.unidades.find((x) => String(x.id) === novoId) ?? null;
    if (u) {
      setRamal(u.ramal_efetivo || calcularRamalAutomaticoCliente(u));
    }
  };

  const mudarVeiculo = (i: number, campo: 'placa' | 'vaga' | 'excluir', valor: string | boolean) =>
    setVeiculos((vs) => vs.map((v, j) => (j === i ? { ...v, [campo]: valor } : v)));

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    const r = await executar('morador_editar', {
      id: m.id, nome, cpf, telefone, unidade_id: unidade, relacao, ramal: ramal.trim(), grupo_acesso_id: grupoId,
      terminais_permitidos: grupoId ? [] : terminais, veiculos,
      novo_veiculo_placa: novaPlaca, novo_veiculo_vaga: novaVaga, reset_senha: resetSenha,
    });
    setEnviando(false);
    if (r.tipo === 'erro') setErro(r.mensagem);
    else onConcluido(r);
  };

  return (
    <Modal onFechar={onFechar} borda="border-t-indigo-500" largura="max-w-2xl"
      titulo={<><span className="bg-indigo-100 text-indigo-600 p-2 rounded-xl flex"><Pencil size={18} /></span> Editar Morador</>}>
      {erro && <div className="bg-red-100 text-red-800 border border-red-400 px-4 py-3 rounded-xl mb-4 font-semibold">⚠ {erro}</div>}
      {(m.cpf_pendente || !m.cpf || m.importado_leitor) && (
        <div className={`p-3.5 rounded-xl border text-xs mb-4 ${
          m.cpf_pendente || !m.cpf
            ? 'bg-amber-50 border-amber-300 text-amber-950'
            : 'bg-sky-50 border-sky-200 text-sky-950'
        }`}>
          <div className="font-extrabold text-sm flex items-center justify-between gap-2 flex-wrap">
            <span>
              {m.cpf_pendente || !m.cpf
                ? '⚠️ Cadastro Importado do Leitor Facial — CPF Pendente'
                : '📥 Cadastro Importado do Leitor Facial'}
            </span>
            {m.id_leitor_facial && (
              <span className="font-mono px-2 py-0.5 rounded bg-white border border-amber-300 text-amber-900">
                ID original no leitor: #{m.id_leitor_facial}
              </span>
            )}
          </div>
          <p className="mt-1 leading-relaxed">
            {m.cpf_pendente || !m.cpf
              ? 'Informe o CPF de 11 dígitos abaixo e confira a Unidade/Apartamento. Ao salvar com um CPF válido, o sistema liberará o login do morador no Aplicativo e atualizará o ID dele no leitor facial automaticamente!'
              : 'Este morador teve a foto/cadastro importado do leitor facial e já está com CPF vinculado.'}
          </p>
        </div>
      )}
      <form onSubmit={enviar}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="col-span-full"><label className={rotuloCampo}>Nome Completo *</label><input required value={nome} onChange={(e) => setNome(e.target.value)} className={`${entrada} font-semibold`} /></div>
          <div>
            <label className={rotuloCampo}>
              {m.cpf_pendente || !m.cpf ? 'CPF (Informe para regularizar o cadastro) *' : 'CPF *'}
            </label>
            <input
              required={!m.cpf_pendente && !!m.cpf}
              maxLength={14}
              placeholder={m.cpf_pendente || !m.cpf ? 'Digite os 11 dígitos do CPF...' : '000.000.000-00'}
              value={cpf}
              onChange={(e) => setCpf(mascaraCpf(e.target.value))}
              className={`${entrada} font-semibold ${(m.cpf_pendente || !m.cpf) && !cpf ? '!border-amber-400 !bg-amber-50/40' : ''}`}
            />
            <ValidadorCpf cpf={cpf} />
          </div>
          <div><label className={rotuloCampo}>Telefone</label><input value={telefone} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} className={`${entrada} font-semibold`} /></div>
          <div><label className={rotuloCampo}>Unidade *</label><SelectUnidade apoio={apoio} valor={unidade} onChange={selecionarUnidadeEdicao} vazio="Selecione..." /></div>
          <div>
            <label className={rotuloCampo}>Relação</label>
            <select value={relacao} onChange={(e) => setRelacao(e.target.value)} className={entrada}>
              {RELACOES.map((r) => <option key={r.valor} value={r.valor}>{r.rotulo}</option>)}
            </select>
          </div>
          <CampoRamalInterfone apoio={apoio} unidadeId={unidade} ramal={ramal} setRamal={setRamal} />
          <CamposAcesso apoio={apoio} unidadeId={unidade} grupoId={grupoId} setGrupoId={setGrupoId} terminais={terminais} setTerminais={setTerminais} />

          {(m.vinculados?.length ?? 0) > 0 && (
            <div className="col-span-full mt-2">
              <label className="text-[1.05rem] font-extrabold text-slate-900 mb-2 flex items-center gap-2">
                👨‍👩‍👧‍👦 Filhos / Dependentes &amp; Funcionários Vinculados a este Apartamento ({m.vinculados!.length})
              </label>
              <div className="flex flex-col gap-2.5">
                {m.vinculados!.map((v) => {
                  const ehFunc = v.relacao === 'Funcionario';
                  return (
                    <div
                      key={v.id}
                      className={`p-3 rounded-xl border flex items-start gap-3 ${
                        ehFunc ? 'bg-indigo-50/60 border-indigo-200' : 'bg-violet-50/70 border-violet-200'
                      }`}
                    >
                      {v.foto_base64 ? (
                        <img
                          src={v.foto_base64}
                          alt={v.nome}
                          className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-xs shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 shrink-0 text-sm font-bold">
                          {v.nome.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-slate-900 text-sm">{v.nome}</span>
                          <span className={`text-[0.68rem] font-extrabold px-2 py-0.5 rounded border ${
                            ehFunc ? 'bg-indigo-100 text-indigo-800 border-indigo-200' : 'bg-violet-100 text-violet-800 border-violet-200'
                          }`}>
                            {ehFunc ? '👷 Funcionário' : '👶 Filho(a) / Dependente'}
                          </span>
                          <span className={`text-[0.68rem] font-bold px-2 py-0.5 rounded ${
                            v.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                          }`}>
                            {v.ativo ? 'Facial Ativo' : 'Facial Pausado'}
                          </span>
                        </div>
                        {v.cpf && (
                          <div className="text-xs text-slate-600 font-mono mt-0.5">
                            CPF: {v.cpf.startsWith('99') ? 'Menor s/ CPF (código interno)' : mascaraCpf(v.cpf)}
                            {v.telefone ? ` • Tel: ${mascaraTelefone(v.telefone)}` : ''}
                          </div>
                        )}
                        {v.observacao && (
                          <div className="text-[0.72rem] text-slate-700 bg-white/80 border border-slate-200/80 rounded-lg px-2.5 py-1.5 mt-1.5 font-medium">
                            {v.observacao}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="col-span-full mt-2">
            <label className="text-[1.05rem] font-extrabold text-slate-900 mb-2 flex items-center gap-2">🚗 Veículos e Vagas de Garagem</label>
            <div className="flex flex-col gap-2.5">
              {veiculos.map((v, i) => (
                <div key={v.id} className={`flex items-center gap-2.5 bg-slate-50 p-2.5 rounded-lg border border-slate-200 ${v.excluir ? 'opacity-50' : ''}`}>
                  <input value={v.placa} onChange={(e) => mudarVeiculo(i, 'placa', e.target.value.toUpperCase())} placeholder="Placa" className="flex-1 min-w-0 px-2 py-1.5 border border-slate-300 rounded font-mono font-bold text-indigo-800 uppercase text-sm" />
                  <input value={v.vaga} onChange={(e) => mudarVeiculo(i, 'vaga', e.target.value)} placeholder="Qual a vaga?" className="flex-1 min-w-0 px-2 py-1.5 border border-slate-300 rounded text-sm" />
                  <label className="flex items-center gap-1 text-xs font-bold text-red-500 cursor-pointer">
                    <input type="checkbox" checked={v.excluir} onChange={(e) => mudarVeiculo(i, 'excluir', e.target.checked)} className="w-[18px] h-[18px] accent-red-500" title="Excluir este veículo" /> Excluir
                  </label>
                </div>
              ))}
              <div className="flex items-center gap-2.5 bg-green-50 p-2.5 rounded-lg border border-dashed border-green-200">
                <input value={novaPlaca} onChange={(e) => setNovaPlaca(e.target.value.toUpperCase())} placeholder="Nova Placa (opcional)" className="flex-1 min-w-0 px-2 py-1.5 border border-slate-300 rounded font-mono font-bold text-green-800 uppercase text-sm" />
                <input value={novaVaga} onChange={(e) => setNovaVaga(e.target.value)} placeholder="Vaga (opcional)" className="flex-1 min-w-0 px-2 py-1.5 border border-slate-300 rounded text-sm" />
              </div>
            </div>
          </div>

          <label className="col-span-full bg-orange-50 p-4 rounded-xl border border-orange-200 flex items-start gap-3 mt-2 cursor-pointer">
            <input type="checkbox" checked={resetSenha} onChange={(e) => setResetSenha(e.target.checked)} className="w-5 h-5 mt-0.5 accent-orange-600 shrink-0" />
            <span className="text-[0.95rem] font-bold text-orange-800">
              Redefinir senha para <b className="bg-orange-100 px-1.5 py-0.5 rounded">{SENHA_PADRAO}</b>
              <span className="block text-sm font-medium text-orange-700 mt-1">O morador será obrigado a alterar a senha no próximo acesso ao aplicativo.</span>
            </span>
          </label>
        </div>
        <div className="flex gap-3 mt-7">
          <button type="button" onClick={onFechar} className="flex-1 py-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-700">Cancelar</button>
          <button disabled={enviando} className="flex-1 inline-flex items-center justify-center gap-2 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold disabled:opacity-60">
            <Save size={16} /> {enviando ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export type TipoConfirmacao = 'bloquear' | 'excluir' | 'restaurar' | 'definitivo';

/** modal-bloqueio / modal-exclusao / modal-restauracao / modal-exclusao-definitiva. */
export function ModalConfirmacao({ tipo, m, onFechar, onConcluido }: { tipo: TipoConfirmacao; m: Morador; onFechar: () => void; onConcluido: (a: Aviso) => void }) {
  const [obs, setObs] = useState('');
  const [enviando, setEnviando] = useState(false);
  const cfg = {
    bloquear: {
      rota: 'morador_bloquear', borda: 'border-t-amber-500', tituloCor: 'text-slate-900',
      titulo: m.ativo ? 'Bloquear Morador' : 'Liberar Morador',
      texto: <>O status no aplicativo e na catraca de <b>{m.nome}</b> será modificado.</>,
      obs: { rotulo: 'Adicionar uma Observação (Opcional)', placeholder: 'Ex: Atraso no pagamento, mudança provisória...' },
      botao: m.ativo ? 'Confirmar Bloqueio' : 'Confirmar Liberação', botaoCor: 'bg-blue-600 hover:bg-blue-700',
    },
    excluir: {
      rota: 'morador_excluir', borda: 'border-t-red-500', tituloCor: 'text-red-800', titulo: 'Remover Morador',
      texto: <>Você está prestes a mover <b>{m.nome}</b> para a lixeira. Ele(a) perderá acesso imediato à catraca e ao app.</>,
      obs: { rotulo: 'Motivo da Exclusão (Opcional mas recomendado)', placeholder: 'Ex: Mudou-se para outra cidade em jan/2026...' },
      botao: 'Mover p/ Lixeira', botaoCor: 'bg-red-500 hover:bg-red-600',
    },
    restaurar: {
      rota: 'morador_restaurar', borda: 'border-t-emerald-500', tituloCor: 'text-emerald-800', titulo: 'Restaurar Morador',
      texto: <>Você deseja retirar <b>{m.nome}</b> da lixeira? Suas permissões de catraca serão reativadas imediatamente.</>,
      obs: null, botao: 'Sim, Restaurar', botaoCor: 'bg-emerald-500 hover:bg-emerald-600',
    },
    definitivo: {
      rota: 'morador_excluir_definitivo', borda: 'border-t-red-700', tituloCor: 'text-red-800', titulo: 'Excluir Definitivamente',
      texto: <>Você tem certeza que deseja excluir <b>PERMANENTEMENTE</b> <b>{m.nome}</b> da base de dados? Esta ação não poderá ser desfeita e todos os vínculos (como veículos) também poderão ser perdidos.</>,
      obs: null, botao: 'Sim, Excluir Para Sempre', botaoCor: 'bg-red-700 hover:bg-red-800',
    },
  }[tipo];

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    const r = await executar(cfg.rota, { id: m.id, observacao: obs });
    setEnviando(false);
    onConcluido(r);
  };

  return (
    <Modal onFechar={onFechar} borda={cfg.borda} titulo={<span className={cfg.tituloCor}>{cfg.titulo}</span>}>
      <p className="text-slate-600 leading-relaxed">{cfg.texto}</p>
      <form onSubmit={confirmar}>
        {cfg.obs && (
          <div className="mt-4">
            <label className={rotuloCampo}>{cfg.obs.rotulo}</label>
            <textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} placeholder={cfg.obs.placeholder} className={entrada} />
          </div>
        )}
        <div className="flex gap-3 mt-6">
          <button type="button" onClick={onFechar} className="flex-1 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-700">Cancelar</button>
          <button disabled={enviando} className={`flex-1 py-3 rounded-xl text-white font-bold disabled:opacity-60 ${cfg.botaoCor}`}>{enviando ? 'Processando...' : cfg.botao}</button>
        </div>
      </form>
    </Modal>
  );
}

/** modal-sync: busca a lista (get_sync_list) e envia um a um (sync_single) com barra de progresso. */
export function ModalSync({ onFechar }: { onFechar: () => void }) {
  const [status, setStatus] = useState('Buscando lista de moradores...');
  const [pct, setPct] = useState(0);
  const [fim, setFim] = useState(false);
  const [modo, setModo] = useState('');

  useEffect(() => {
    let cancelado = false;
    (async () => {
      let ids: number[] = [];
      try {
        const r = await api<{ ids: number[]; modo: string }>('morador_sync_lista');
        ids = r.ids;
        setModo(r.modo);
      } catch (e) {
        setStatus('Erro: ' + (e instanceof ErroApi ? e.message : 'falha de conexão ao buscar moradores.'));
        setFim(true);
        return;
      }
      if (ids.length === 0) { setStatus('Nenhum morador para sincronizar.'); setPct(100); setFim(true); return; }
      let ok = 0;
      for (let i = 0; i < ids.length && !cancelado; i++) {
        try {
          const r = await api<{ resultado: string }>('morador_sync', { corpo: { id: ids[i] } });
          if (r.resultado === 'ok') ok++;
        } catch { /* igual ao legado: segue para o proximo */ }
        setPct(Math.round(((i + 1) / ids.length) * 100));
        setStatus(`Enviando dados: ${i + 1} de ${ids.length}`);
      }
      if (!cancelado) { setStatus(`Concluído! ${ok} moradores sincronizados.`); setFim(true); }
    })();
    return () => { cancelado = true; };
  }, []);

  return (
    <div className="fixed inset-0 z-[95] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-7 border-t-[6px] border-t-blue-600 text-center">
        <h2 className="text-xl font-extrabold text-slate-900 flex items-center justify-center gap-2"><RefreshCw size={18} className={fim ? '' : 'animate-spin'} /> Sincronizando Catracas</h2>
        {modo === 'simulado' && <p className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mt-3">Laboratório em modo SIMULADO: nenhum comando é enviado aos equipamentos.</p>}
        <p className={`text-sm my-5 ${fim ? 'font-bold text-emerald-600' : 'text-slate-500'}`}>{status}</p>
        <div className="bg-slate-100 rounded-lg h-3 overflow-hidden mb-2.5"><div className="bg-blue-600 h-full transition-all" style={{ width: `${pct}%` }} /></div>
        <div className="font-bold text-slate-900 text-lg">{pct}%</div>
        {fim && <button onClick={onFechar} className="w-full mt-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold">Concluir e Atualizar</button>}
      </div>
    </div>
  );
}
