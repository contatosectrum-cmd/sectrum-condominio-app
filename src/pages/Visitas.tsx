import { useCallback, useEffect, useState } from 'react';
import { CheckSquare, Clock, UserCheck, CalendarDays, Check, Phone, User, List, Camera, LogOut, X, Mail, XCircle, ShieldCheck, ShieldAlert } from 'lucide-react';
import { api, ErroApi, origemPublica } from '../lib/api';
import { obterToken } from '../lib/sessao';
import { validarCpfModulo11, regiaoFiscalCpf, mascaraCpf, limparCpf } from '../lib/cpf';

// Paridade com src/views/visitas.php: abas Todos Ativos / Aguardando / No Condomínio / Chegaram Hoje / Encerrados (com contadores),
// cards "Gerar Convite (WhatsApp)" e "Registrar Entrada Manual" (só em Ativos/Aguardando/Hoje), tabela "Registros" com
// Link/Visitante, Destino, Status e Ações da Portaria (Liberar, Saída, Cancelar) e paginação de 25.

type Filtro = 'ativos' | 'pendentes' | 'presentes' | 'hoje' | 'encerrados';
interface Registro {
  id: number; status: string; tipo: string | null; nome_visitante: string | null; documento?: string | null; token_convite: string | null; tem_foto: boolean;
  unidade: string | null; bloco: string | null; autorizado_nome: string | null;
}
interface Unidade { id: number; numero: string; bloco: string | null }
interface Morador { id: number; nome: string }
interface Resposta {
  registros: Registro[]; total: number; pagina: number; paginas: number;
  contagens: { pendentes: number; presentes: number; hoje: number }; unidades: Unidade[]; moradores: Morador[];
}
interface Aviso { tipo: 'ok' | 'erro'; mensagem: string }

const ABAS: { id: Filtro; rotulo: string; icone: React.ReactNode; contador?: keyof Resposta['contagens'] }[] = [
  { id: 'ativos', rotulo: 'Todos Ativos', icone: <CheckSquare size={14} /> },
  { id: 'pendentes', rotulo: 'Aguardando', icone: <Clock size={14} />, contador: 'pendentes' },
  { id: 'presentes', rotulo: 'No Condomínio', icone: <UserCheck size={14} />, contador: 'presentes' },
  { id: 'hoje', rotulo: 'Chegaram Hoje', icone: <CalendarDays size={14} />, contador: 'hoje' },
  { id: 'encerrados', rotulo: 'Encerrados', icone: <Check size={14} /> },
];

// Correção: o legado mostrava "Cancelado" para qualquer status fora da lista (ex.: aguardando_portaria, finalizado)
const STATUS: Record<string, { rotulo: string; cor: string; icone: React.ReactNode }> = {
  convite: { rotulo: 'Convite Enviado', cor: 'bg-indigo-100 text-indigo-800', icone: <Mail size={11} /> },
  aguardando: { rotulo: 'Aguardando', cor: 'bg-yellow-200 text-yellow-800', icone: <Clock size={11} /> },
  aguardando_portaria: { rotulo: 'Aguardando Portaria', cor: 'bg-yellow-200 text-yellow-800', icone: <Clock size={11} /> },
  aguardando_morador: { rotulo: 'Aguardando Morador', cor: 'bg-yellow-200 text-yellow-800', icone: <Clock size={11} /> },
  presente: { rotulo: 'No Condomínio', cor: 'bg-emerald-100 text-emerald-800', icone: <UserCheck size={11} /> },
  concluido: { rotulo: 'Concluído', cor: 'bg-slate-100 text-slate-600', icone: <Check size={11} /> },
  finalizado: { rotulo: 'Concluído', cor: 'bg-slate-100 text-slate-600', icone: <Check size={11} /> },
  expirado: { rotulo: 'Expirado', cor: 'bg-rose-100 text-rose-800', icone: <XCircle size={11} /> },
  cancelado: { rotulo: 'Cancelado', cor: 'bg-rose-100 text-rose-800', icone: <XCircle size={11} /> },
};

const msgErro = (e: unknown) => (e instanceof ErroApi ? e.message : 'Erro inesperado.');
const rotulo = 'block text-sm font-bold text-slate-600 mb-1.5';
const entrada = 'w-full px-3 py-2.5 border border-slate-300 rounded-lg outline-none focus:border-blue-500 bg-white';
const linkConvite = (token: string) => `${origemPublica()}/?acao=convite_externo&t=${token}`;

export default function Visitas() {
  const [filtro, setFiltro] = useState<Filtro>('ativos');
  const [pag, setPag] = useState(1);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [conv, setConv] = useState({ unidade_id: '', autorizado_por: '', validade_horas: '24' });
  const [manual, setManual] = useState({ nome_visitante: '', unidade_id: '' });
  const [permiteTemporada, setPermiteTemporada] = useState<number | null>(null);
  const [salvandoTemp, setSalvandoTemp] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setDados(await api<Resposta>('visitas_listar', { query: { status: filtro, pag } }));
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: msgErro(e) });
    }
  }, [filtro, pag]);
  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    api<{ condominio?: { permite_temporada?: number } }>('moradores_apoio')
      .then((r) => {
        if (r.condominio) setPermiteTemporada(Number(r.condominio.permite_temporada ?? 1));
      })
      .catch(() => {});
  }, []);

  const alternarTemporada = async (permitir: number) => {
    if (permiteTemporada === null || permiteTemporada === permitir || salvandoTemp) return;
    setSalvandoTemp(true);
    try {
      const r = await api<{ mensagem: string; permite_temporada: number }>('condominio_modo_temporada', {
        corpo: { permite_temporada: permitir },
      });
      setPermiteTemporada(r.permite_temporada);
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: msgErro(e) });
    } finally {
      setSalvandoTemp(false);
    }
  };

  const executar = async (chave: string, rota: string, corpo: Record<string, unknown>, depois?: () => void) => {
    setOcupado(chave);
    try {
      const r = await api<{ mensagem: string; hardware?: { modo: string; comandos: unknown[] } }>(rota, { corpo });
      const simulado = r.hardware?.modo === 'simulado' && r.hardware.comandos.length > 0 ? ' [modo SIMULADO: nada foi enviado aos equipamentos]' : '';
      setAviso({ tipo: 'ok', mensagem: r.mensagem + simulado });
      depois?.();
      await carregar();
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: msgErro(e) });
    } finally {
      setOcupado(null);
      document.querySelector('main .overflow-auto')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const verSelfie = async (id: number) => {
    const r = await fetch(`/api.php?route=foto_registro&tipo=visita&id=${id}`, { headers: { Authorization: `Bearer ${obterToken() ?? ''}` } });
    if (r.ok) window.open(URL.createObjectURL(await r.blob()), '_blank');
    else setAviso({ tipo: 'erro', mensagem: 'Selfie não encontrada.' });
  };
  const copiar = (texto: string) => { navigator.clipboard?.writeText(texto); setAviso({ tipo: 'ok', mensagem: 'Link copiado!' }); };
  const trocarAba = (f: Filtro) => { setFiltro(f); setPag(1); };

  const unidades = dados?.unidades ?? [];
  const mostraForms = ['ativos', 'pendentes', 'hoje'].includes(filtro);

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8 space-y-5">
      {permiteTemporada !== null && (
        <div className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-4 shadow-sm ${permiteTemporada === 1 ? 'bg-emerald-50/70 border-emerald-200' : 'bg-rose-50/70 border-rose-200'}`}>
          <div>
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-700">
              <span>🏖️ Aluguel de Temporada (Airbnb) no App do Morador</span>
              <span className={`px-2 py-0.5 rounded-full text-[0.68rem] font-extrabold ${permiteTemporada === 1 ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
                {permiteTemporada === 1 ? '✅ HABILITADO NO APP' : '🚫 DESABILITADO NO APP'}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              {permiteTemporada === 1
                ? 'A opção "Aluguel Temporada" está visível e liberada no App dos moradores deste condomínio.'
                : 'A opção "Aluguel Temporada" está ocultada automaticamente do menu no App dos moradores.'}
            </p>
          </div>
          <div className="inline-flex bg-white p-1 rounded-xl border border-slate-200 shadow-xs">
            <button
              type="button"
              disabled={salvandoTemp}
              onClick={() => alternarTemporada(1)}
              className={`px-3 py-2 rounded-lg text-xs font-extrabold transition cursor-pointer ${permiteTemporada === 1 ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              ✅ Habilitar no App
            </button>
            <button
              type="button"
              disabled={salvandoTemp}
              onClick={() => alternarTemporada(0)}
              className={`px-3 py-2 rounded-lg text-xs font-extrabold transition cursor-pointer ${permiteTemporada === 0 ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              🚫 Desabilitar
            </button>
          </div>
        </div>
      )}

      {aviso && (
        <div className={`border-l-4 px-4 py-3 rounded-lg text-sm font-semibold flex justify-between gap-3 ${aviso.tipo === 'ok' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-rose-50 border-rose-500 text-rose-800'}`}>
          <span>{aviso.mensagem}</span>
          <button onClick={() => setAviso(null)} aria-label="Fechar aviso"><X size={16} /></button>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {ABAS.map((a) => {
          const n = a.contador ? dados?.contagens[a.contador] ?? 0 : 0;
          return (
            <button key={a.id} onClick={() => trocarAba(a.id)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold border transition ${filtro === a.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {a.icone} {a.rotulo}
              {n > 0 && <span className="bg-red-500 text-white text-[0.68em] px-1.5 py-0.5 rounded-full font-bold ml-1">{n}</span>}
            </button>
          );
        })}
      </div>

      {mostraForms && (
        <div className="grid gap-5 grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
          <div className="bg-white rounded-2xl border border-slate-200 border-t-4 border-t-blue-600 p-6 shadow-sm">
            <div className="flex items-center gap-2 text-lg font-extrabold text-blue-700 mb-1"><Phone size={18} /> Gerar Convite (WhatsApp)</div>
            <p className="text-sm text-slate-500 mb-4">O visitante recebe um link, tira uma selfie e entra automaticamente.</p>
            <form onSubmit={(e) => { e.preventDefault(); executar('convite', 'visita_convite', conv, () => setConv({ unidade_id: '', autorizado_por: '', validade_horas: '24' })); }} className="space-y-3">
              <div><label className={rotulo}>Destino *</label>
                <select required value={conv.unidade_id} onChange={(e) => setConv({ ...conv, unidade_id: e.target.value })} className={entrada}>
                  <option value="">Selecione...</option>
                  {unidades.map((u) => <option key={u.id} value={u.id}>{u.bloco} — Unid: {u.numero}</option>)}
                </select></div>
              <div><label className={rotulo}>Morador Autorizando *</label>
                <select required value={conv.autorizado_por} onChange={(e) => setConv({ ...conv, autorizado_por: e.target.value })} className={entrada}>
                  <option value="">Selecione...</option>
                  {(dados?.moradores ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select></div>
              <div><label className={rotulo}>Validade</label>
                <select value={conv.validade_horas} onChange={(e) => setConv({ ...conv, validade_horas: e.target.value })} className={entrada}>
                  <option value="6">6 horas</option><option value="24">24 horas</option><option value="48">48 horas</option>
                </select></div>
              <button disabled={ocupado !== null} className="w-full mt-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold disabled:opacity-60"><Phone size={16} /> Gerar Link de Convite</button>
            </form>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 border-t-4 border-t-emerald-500 p-6 shadow-sm">
            <div className="flex items-center gap-2 text-lg font-extrabold text-emerald-800 mb-1"><User size={18} /> Registrar Entrada Manual</div>
            <p className="text-sm text-slate-500 mb-4">Visitante chegou sem convite ou é prestador de serviço pontual.</p>
            <form onSubmit={(e) => { e.preventDefault(); executar('manual', 'visita_nova', manual, () => setManual({ nome_visitante: '', unidade_id: '' })); }} className="space-y-3">
              <div><label className={rotulo}>Nome do Visitante *</label>
                <input required value={manual.nome_visitante} onChange={(e) => setManual({ ...manual, nome_visitante: e.target.value })} placeholder="Ex: Carlos Silva" className={entrada} /></div>
              <div><label className={rotulo}>Destino *</label>
                <select required value={manual.unidade_id} onChange={(e) => setManual({ ...manual, unidade_id: e.target.value })} className={entrada}>
                  <option value="">Selecione...</option>
                  {unidades.map((u) => <option key={u.id} value={u.id}>{u.bloco} — Unid: {u.numero}</option>)}
                </select></div>
              <button disabled={ocupado !== null} className="w-full mt-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold disabled:opacity-60"><Check size={16} /> Registrar e Liberar Acesso</button>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center gap-2 text-lg font-extrabold text-slate-900 mb-4">
          <List size={18} /> Registros
          <span className="ml-auto text-sm font-medium text-slate-500">{(dados?.total ?? 0).toLocaleString('pt-BR')} registros</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr>
              {['Link / Visitante', 'Destino', 'Status', 'Ações da Portaria'].map((h, i) => (
                <th key={h} className={`text-[0.72rem] font-extrabold uppercase tracking-wide text-slate-500 px-4 py-3 border-b border-slate-200 ${i === 3 ? 'text-center' : 'text-left'} ${i === 0 ? 'w-[35%]' : ''}`}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {(dados?.registros ?? []).map((v) => {
                const st = STATUS[v.status] ?? { rotulo: v.status, cor: 'bg-slate-100 text-slate-600', icone: null };
                const link = v.token_convite ? linkConvite(v.token_convite) : '';
                const zap = `Olá! O morador *${v.autorizado_nome ?? 'Morador'}* gerou um convite de acesso.\n\nPara entrar, clique no link, tire uma selfie e pronto:\n👉 ${link}`;
                return (
                  <tr key={v.id} className="hover:bg-slate-50 align-top">
                    <td className="px-4 py-3 border-b border-slate-100 text-sm">
                      {v.status === 'convite' ? (
                        <>
                          <div className="text-xs mb-1.5 text-slate-600 font-semibold">Aguardando selfie:</div>
                          <div className="flex gap-1.5">
                            <input readOnly value={link} onClick={(e) => { (e.target as HTMLInputElement).select(); copiar(link); }} className="text-xs p-1.5 cursor-pointer flex-1 border border-slate-300 rounded" />
                            <a href={`https://api.whatsapp.com/send?text=${encodeURIComponent(zap)}`} target="_blank" rel="noreferrer" className="bg-[#25D366] text-white px-2.5 rounded flex items-center" title="Enviar pelo WhatsApp"><Phone size={15} /></a>
                          </div>
                        </>
                      ) : v.nome_visitante ? (
                        <>
                          <b>{v.nome_visitante}</b>
                          {v.documento && (() => {
                            const docLimpo = limparCpf(v.documento);
                            const ehCpf = docLimpo.length === 11;
                            const valido = ehCpf ? validarCpfModulo11(docLimpo) : false;
                            return (
                              <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-xs">
                                <span className="font-mono text-slate-600">CPF: {ehCpf ? mascaraCpf(docLimpo) : v.documento}</span>
                                {ehCpf && (
                                  valido ? (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[0.72rem] font-bold" title={regiaoFiscalCpf(docLimpo)}>
                                      <ShieldCheck size={11} /> CPF Válido RFB
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[0.72rem] font-extrabold">
                                      <ShieldAlert size={11} /> CPF Inválido
                                    </span>
                                  )
                                )}
                              </div>
                            );
                          })()}
                          {v.tem_foto && <><button onClick={() => verSelfie(v.id)} className="text-xs text-blue-600 inline-flex items-center gap-1 mt-1"><Camera size={12} /> Ver Selfie</button></>}
                        </>
                      ) : <span className="text-slate-400 text-sm">Token utilizado</span>}
                    </td>
                    <td className="px-4 py-3 border-b border-slate-100 text-sm">
                      <b className="text-blue-800">{v.bloco ?? '—'}</b><br /><span className="text-slate-500">Unid: {v.unidade ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 border-b border-slate-100">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${st.cor}`}>{st.icone} {st.rotulo}</span>
                    </td>
                    <td className="px-4 py-3 border-b border-slate-100">
                      <div className="flex gap-1.5 justify-center flex-wrap">
                        {v.status === 'aguardando' && (
                          <button disabled={ocupado !== null} onClick={() => executar(`lib-${v.id}`, 'visita_acesso', { visita_id: v.id, tipo_acesso: 'entrada' })} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-bold disabled:opacity-60"><Check size={13} /> Liberar</button>
                        )}
                        {v.status === 'presente' && (
                          <button disabled={ocupado !== null} onClick={() => executar(`sai-${v.id}`, 'visita_acesso', { visita_id: v.id, tipo_acesso: 'saida' })} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold disabled:opacity-60"><LogOut size={13} /> Saída</button>
                        )}
                        {['aguardando', 'convite'].includes(v.status) && (
                          <button disabled={ocupado !== null} onClick={() => { if (window.confirm('Cancelar esta visita/convite?')) executar(`can-${v.id}`, 'visita_cancelar', { id: v.id }); }} className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 text-xs font-bold disabled:opacity-60">Cancelar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {dados && dados.registros.length === 0 && (
                <tr><td colSpan={4} className="text-center text-slate-400 py-10"><User size={32} className="mx-auto mb-2" strokeWidth={1.5} />Nenhum registro encontrado para este filtro.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {dados && dados.paginas > 1 && (
          <div className="flex justify-center gap-1.5 mt-4 flex-wrap">
            {Array.from({ length: dados.paginas }, (_, i) => i + 1).map((n) => (
              <button key={n} onClick={() => setPag(n)} className={`min-w-9 px-3 py-1.5 rounded-lg text-sm font-bold border ${n === dados.pagina ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>{n}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
