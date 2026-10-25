import { useCallback, useEffect, useState } from 'react';
import { Clock, CheckCircle, XCircle, Link2, Pencil, Check, X, Trash2, Phone, Users, CalendarDays, Save, ShieldCheck, ShieldAlert } from 'lucide-react';
import { api, ErroApi, origemPublica } from '../lib/api';
import { Modal } from './moradores/AcoesMorador';
import FotoUsuario from '../components/FotoUsuario';
import ValidadorCpf from '../components/ValidadorCpf';
import { validarCpfModulo11, regiaoFiscalCpf } from '../lib/cpf';
import { obterToken } from '../lib/sessao';

// Paridade com src/views/precadastros.php: abas Aguardando / Aprovados / Rejeitados / Links (com contadores), barra de
// busca + ordenação + itens por página, cards dos pendentes (duplicado, temporada, "Na Planilha"/"Não Consta", veículos,
// documento) com Editar / Aprovar / Rejeitar, tabelas de aprovados e rejeitados, geração de links (geral e temporada)
// e lista de links com WhatsApp, vagas, usos, validade e exclusão.

type Aba = 'aguardando' | 'aprovados' | 'rejeitados' | 'links';
interface Pre {
  id: number; nome: string; cpf: string | null; telefone: string | null; relacao: string | null; unidade_info: string | null;
  bloco_id: number | null; unidade_numero: string | null; tipo: string | null; consta_lista: boolean | number;
  placa1: string | null; marca1: string | null; modelo1: string | null; cor1: string | null; tipo_veiculo1: string | null; vaga_garagem1: string | null;
  placa2: string | null; marca2: string | null; modelo2: string | null; cor2: string | null; tipo_veiculo2: string | null; vaga_garagem2: string | null;
  periodo_inicio: string | null; periodo_fim: string | null; criado_em: string; tem_foto: boolean; tem_documento: boolean;
  cpf_valido?: boolean; cpf_regiao?: string; cpf_situacao_receita?: string | null; cpf_nome_receita?: string | null;
}
interface LinkPre { id: number; token: string; perfil: string | null; tipo: string | null; unidade_info: string | null; expira_em: string | null; permite_segundo: number; usos: number }
interface Resposta {
  totais: { pendente: number; aprovado: number; rejeitado: number }; paginas: number; p: number; limite: number;
  registros: Pre[]; links: LinkPre[]; blocos: { id: number; nome: string }[];
}
interface Aviso { tipo: 'ok' | 'aviso' | 'erro'; mensagem: string }

const fmtCpf = (c: string | null) => (c ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9, 11)}` : '-');
const fmtData = (s: string | null, hora = false) => (s ? new Date(s.replace(' ', 'T')).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', ...(hora ? { hour: '2-digit', minute: '2-digit' } : {}) }).replace(',', '') : '?');
const icone = (t: string | null) => (t === 'Moto' ? '🏍️' : '🚗');
const msgErro = (e: unknown) => (e instanceof ErroApi ? e.message : 'Erro inesperado.');
const linkUrl = (token: string) => `${origemPublica()}/?acao=precadastro_externo&t=${token}`;
const CORES = { ok: 'bg-emerald-50 border-emerald-500 text-emerald-800', aviso: 'bg-amber-50 border-amber-500 text-amber-800', erro: 'bg-rose-50 border-rose-500 text-rose-800' };
const campo = 'w-full px-3 py-2.5 border border-slate-300 rounded-lg outline-none focus:border-blue-500 bg-white text-sm';
const th = 'text-left text-[0.72rem] font-extrabold uppercase tracking-wide text-slate-500 px-4 py-3 border-b border-slate-200';
const td = 'px-4 py-3 border-b border-slate-100 text-sm';

const BadgeTemporada = () => <span className="bg-cyan-100 text-cyan-700 px-2.5 py-0.5 rounded-full text-[0.72em] font-bold inline-flex items-center gap-1"><CalendarDays size={10} /> Temporada</span>;

export default function Precadastros() {
  const [aba, setAba] = useState<Aba>('aguardando');
  const [filtros, setFiltros] = useState({ q: '', ordem: 'recentes', limite: 50, p: 1 });
  const [busca, setBusca] = useState('');
  const [dados, setDados] = useState<Resposta | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [editando, setEditando] = useState<Pre | null>(null);
  const [ampliar, setAmpliar] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setDados(await api<Resposta>('precadastros_listar', { query: { tab: aba, ...filtros } }));
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: msgErro(e) });
    }
  }, [aba, filtros]);
  useEffect(() => { carregar(); }, [carregar]);

  const executar = async (rota: string, corpo: Record<string, unknown>, depois?: () => void) => {
    setOcupado(true);
    try {
      const r = await api<{ tipo?: 'ok' | 'aviso'; mensagem: string; hardware?: { modo: string; comandos: unknown[] } }>(rota, { corpo });
      const sim = r.hardware?.modo === 'simulado' && r.hardware.comandos.length ? ` [modo SIMULADO: ${r.hardware.comandos.length} envio(s) às catracas registrados, nada saiu para a rede]` : '';
      setAviso({ tipo: r.tipo ?? 'ok', mensagem: r.mensagem + sim });
      depois?.();
      await carregar();
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: msgErro(e) });
    } finally {
      setOcupado(false);
      document.querySelector('main .overflow-auto')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const abrirImagem = async (rota: string) => {
    const r = await fetch(`/api.php?route=${rota}`, { headers: { Authorization: `Bearer ${obterToken() ?? ''}` } });
    if (r.ok) setAmpliar(URL.createObjectURL(await r.blob()));
  };
  const trocarAba = (a: Aba) => { setAba(a); setFiltros({ ...filtros, p: 1 }); };
  const totais = dados?.totais ?? { pendente: 0, aprovado: 0, rejeitado: 0 };
  const regs = dados?.registros ?? [];
  const contaCpf = regs.reduce<Record<string, number>>((m, p) => { if (p.cpf) m[p.cpf] = (m[p.cpf] ?? 0) + 1; return m; }, {});

  const ABAS: [Aba, string, React.ReactNode, number][] = [
    ['aguardando', 'Aguardando', <Clock size={14} />, totais.pendente],
    ['aprovados', 'Aprovados', <CheckCircle size={14} />, totais.aprovado],
    ['rejeitados', 'Rejeitados', <XCircle size={14} />, totais.rejeitado],
    ['links', 'Links', <Link2 size={14} />, dados?.links.length ?? 0],
  ];

  const paginacao = dados && dados.paginas > 1 && (
    <div className="flex justify-center gap-1.5 mt-5 items-center">
      {filtros.p > 1 && <button onClick={() => setFiltros({ ...filtros, p: filtros.p - 1 })} className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-600">« Anterior</button>}
      <span className="px-2.5 text-sm text-slate-500">Página <b>{filtros.p}</b> de {dados.paginas}</span>
      {filtros.p < dados.paginas && <button onClick={() => setFiltros({ ...filtros, p: filtros.p + 1 })} className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-600">Próxima »</button>}
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8 space-y-5">
      {aviso && (
        <div className={`border-l-4 px-4 py-3 rounded-lg text-sm font-semibold flex justify-between gap-3 ${CORES[aviso.tipo]}`}>
          <span>{aviso.mensagem}</span><button onClick={() => setAviso(null)} aria-label="Fechar aviso"><X size={16} /></button>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {ABAS.map(([id, rot, ic, n]) => (
          <button key={id} onClick={() => trocarAba(id)} className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold border ${aba === id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {ic} {rot}{n > 0 && <span className="bg-red-500 text-white text-[0.65em] px-1.5 py-0.5 rounded-full font-bold ml-1">{n}</span>}
          </button>
        ))}
      </div>

      {aba !== 'links' && (
        <form onSubmit={(e) => { e.preventDefault(); setFiltros({ ...filtros, q: busca, p: 1 }); }} className="flex gap-2.5 flex-wrap items-center bg-white p-3 rounded-xl shadow-sm">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, CPF ou unidade..." className="flex-1 min-w-[200px] px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          <select value={filtros.ordem} onChange={(e) => setFiltros({ ...filtros, ordem: e.target.value, p: 1 })} className="px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-sm">
            <option value="recentes">Mais Recentes</option><option value="antigos">Mais Antigos</option><option value="az">Ordem Alfabética (A-Z)</option><option value="za">Ordem Alfabética (Z-A)</option>
          </select>
          <select value={filtros.limite} onChange={(e) => setFiltros({ ...filtros, limite: Number(e.target.value), p: 1 })} className="px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-sm">
            <option value={20}>20 por página</option><option value={50}>50 por página</option><option value={100}>100 por página</option>
          </select>
          <button className="px-4 py-2 rounded-lg border border-slate-300 bg-white font-bold text-sm">Filtrar</button>
        </form>
      )}

      {aba === 'aguardando' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 text-lg font-extrabold text-slate-900 mb-4"><Clock size={18} /> Pré-cadastros Aguardando Aprovação</div>
          {regs.length === 0 ? (
            <div className="text-center text-slate-400 py-12"><CheckCircle size={36} className="mx-auto mb-2" strokeWidth={1.5} />Nenhum pré-cadastro pendente. Tudo em dia!</div>
          ) : (
            <div className="flex flex-col gap-3.5">
              {regs.map((p) => {
                const temp = p.tipo === 'temporada';
                const dup = !!p.cpf && (contaCpf[p.cpf] ?? 1) > 1;
                const consta = !!Number(p.consta_lista);
                const cpfOk = p.cpf_valido ?? (p.cpf ? validarCpfModulo11(p.cpf) : false);
                const ufCpf = p.cpf_regiao || (p.cpf && cpfOk ? regiaoFiscalCpf(p.cpf) : '');
                const cor = !cpfOk
                  ? 'border-rose-500 bg-rose-50/60'
                  : dup
                  ? 'border-red-500 bg-red-50'
                  : temp
                  ? 'border-cyan-600 bg-cyan-50/40'
                  : consta
                  ? 'border-emerald-500 bg-green-50'
                  : 'border-slate-200 bg-white';
                return (
                  <div key={p.id} className={`rounded-2xl p-4 relative border-2 ${cor}`}>
                    <div className="absolute top-3.5 right-3.5 flex flex-col items-end gap-1.5">
                      {!cpfOk ? (
                        <span className="bg-rose-100 text-rose-800 px-2.5 py-0.5 rounded-full text-[0.72em] font-extrabold border border-rose-300 inline-flex items-center gap-1">
                          <ShieldAlert size={12} /> CPF Inválido / Falso
                        </span>
                      ) : (
                        <span className="bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full text-[0.72em] font-extrabold border border-emerald-300 inline-flex items-center gap-1">
                          <ShieldCheck size={12} /> CPF Válido (RFB)
                        </span>
                      )}
                      {dup && <span className="bg-red-50 text-red-700 px-2.5 py-0.5 rounded-full text-[0.72em] font-extrabold border border-red-200">⚠️ Duplicado ({contaCpf[p.cpf!]} envios)</span>}
                      {temp && <BadgeTemporada />}
                      {consta ? <span className="bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full text-[0.72em] font-bold">✓ Na Planilha</span>
                        : <span className="bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full text-[0.72em] font-bold">⚠ Não Consta</span>}
                    </div>
                    <div className="flex gap-3.5 items-start">
                      <button type="button" onClick={() => p.tem_foto && abrirImagem(`foto_registro&tipo=precadastro&id=${p.id}`)} title="Ampliar">
                        <FotoUsuario rota={`foto_registro&tipo=precadastro&id=${p.id}`} temFoto={p.tem_foto} tamanho={70} redonda />
                      </button>
                      <div className="flex-1 min-w-0 sm:pr-36">
                        <div className="font-extrabold text-slate-900 mb-1">{p.nome}</div>
                        <div className="text-[0.83em] text-slate-600 leading-relaxed">
                          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                            <span>CPF: <b className="font-mono text-slate-800">{fmtCpf(p.cpf)}</b></span>
                            {cpfOk ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[0.82em] font-bold">
                                <ShieldCheck size={12} /> Válido RFB{ufCpf ? ` • ${ufCpf}` : ''}
                                {p.cpf_situacao_receita ? ` • Receita: ${p.cpf_situacao_receita}` : ''}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[0.82em] font-extrabold border border-rose-300">
                                <ShieldAlert size={12} /> CPF INVÁLIDO (Dígito Verificador Falso)
                              </span>
                            )}
                          </div>
                          {p.cpf && <ValidadorCpf cpf={p.cpf} compacto autoConsultar={false} />}
                          <div className="mt-1">
                            {p.relacao}{p.unidade_info && <> · Unid: <b>{p.unidade_info}</b></>}
                            {p.telefone && <><br />{p.telefone}</>}
                            {temp && p.periodo_inicio && <><br /><span className="text-cyan-600 font-semibold">📅 Período: {fmtData(p.periodo_inicio)} → {p.periodo_fim ? fmtData(p.periodo_fim) : '?'}</span></>}
                          </div>
                        </div>
                        {p.placa1 && (
                          <div className="flex gap-1.5 flex-wrap mt-2 items-center">
                            <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-mono text-sm font-bold">{icone(p.tipo_veiculo1)} {p.placa1}</span>
                            {(p.marca1 || p.modelo1) && <span className="text-xs text-slate-600">{`${p.marca1 ?? ''} ${p.modelo1 ?? ''}`.trim()}{p.cor1 ? ` · ${p.cor1}` : ''}</span>}
                            {p.placa2 && <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-mono text-sm font-bold ml-2">{icone(p.tipo_veiculo2)} {p.placa2}</span>}
                            {p.placa2 && (p.marca2 || p.modelo2) && <span className="text-xs text-slate-600">{`${p.marca2 ?? ''} ${p.modelo2 ?? ''}`.trim()}{p.cor2 ? ` · ${p.cor2}` : ''}</span>}
                          </div>
                        )}
                        {temp && p.tem_documento && (
                          <button type="button" onClick={() => abrirImagem(`foto_registro&tipo=precadastro&campo=documento&id=${p.id}`)} className="mt-2 text-xs font-bold text-cyan-700 underline">Documento: ver imagem</button>
                        )}
                        <div className="text-[0.73em] text-slate-400 mt-1.5">Enviado em: {fmtData(p.criado_em, true)}</div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3 pt-2.5 border-t border-slate-100 justify-end flex-wrap">
                      <button onClick={() => setEditando(p)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-300 text-slate-700"><Pencil size={14} /> Editar</button>
                      <button
                        disabled={ocupado}
                        onClick={() => {
                          const msgConfirm = !cpfOk
                            ? 'ATENÇÃO: Este CPF é matematicamente INVÁLIDO pela Receita Federal! Deseja aprovar mesmo assim?'
                            : 'Aprovar o pré-cadastro?';
                          if (window.confirm(msgConfirm)) executar('precadastro_aprovar', { id: p.id });
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-white disabled:opacity-60"
                      >
                        <Check size={14} /> Aprovar
                      </button>
                      <button disabled={ocupado} onClick={() => window.confirm('Rejeitar o pré-cadastro?') && executar('precadastro_rejeitar', { id: p.id })} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-600 border border-red-200 disabled:opacity-60"><X size={14} /> Rejeitar</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {paginacao}
        </div>
      )}

      {(aba === 'aprovados' || aba === 'rejeitados') && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 text-lg font-extrabold text-slate-900 mb-4">{aba === 'aprovados' ? <><CheckCircle size={18} /> Pré-cadastros Aprovados</> : <><XCircle size={18} /> Pré-cadastros Rejeitados</>}</div>
          {regs.length === 0 ? (
            <div className="text-center text-slate-400 py-12">{aba === 'aprovados' ? 'Nenhum aprovado ainda.' : 'Nenhum rejeitado.'}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr>{(aba === 'aprovados' ? ['Nome', 'Tipo', 'CPF / Validação', 'Unidade', 'Placa(s)', 'Data', 'WhatsApp'] : ['Nome', 'Tipo', 'CPF / Validação', 'Placa(s)', 'Data']).map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {regs.map((p) => {
                    const cpfOk = p.cpf_valido ?? (p.cpf ? validarCpfModulo11(p.cpf) : false);
                    return (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className={td}>
                          <b>{p.nome}</b>
                          {p.telefone && <div className="text-xs text-slate-500 font-mono">{p.telefone}</div>}
                        </td>
                        <td className={td}>{p.tipo === 'temporada' && <BadgeTemporada />}{aba === 'aprovados' && (!p.tipo || p.tipo === 'morador') && <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[0.72em] font-bold">Morador</span>}</td>
                        <td className={td}>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono">{fmtCpf(p.cpf)}</span>
                            {p.cpf && (
                              cpfOk ? (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[0.7em] font-bold" title={p.cpf_regiao || regiaoFiscalCpf(p.cpf)}>
                                  <ShieldCheck size={11} /> Válido
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[0.7em] font-bold">
                                  <ShieldAlert size={11} /> Inválido
                                </span>
                              )
                            )}
                          </div>
                        </td>
                        {aba === 'aprovados' && <td className={td}>{p.unidade_info || '-'}</td>}
                        <td className={td}>
                          {aba === 'aprovados' ? <>
                            {p.placa1 && <span className="font-mono font-bold text-blue-600">{icone(p.tipo_veiculo1)} {p.placa1}</span>}
                            {p.placa2 && <> / <span className="font-mono font-bold text-blue-600">{icone(p.tipo_veiculo2)} {p.placa2}</span></>}
                          </> : p.placa1 && <span className="font-mono">{p.placa1}</span>}
                        </td>
                        <td className={`${td} text-slate-500`}>{fmtData(p.criado_em)}</td>
                        {aba === 'aprovados' && (
                          <td className={td}>
                            {p.telefone ? (
                              <button
                                type="button"
                                disabled={ocupado}
                                onClick={() => executar('whatsapp_enviar_boas_vindas', { precadastro_id: p.id })}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-2xs disabled:opacity-50 cursor-pointer"
                                title="Enviar mensagem automática de Boas-Vindas, Login, Senha e Ramal via WhatsApp"
                              >
                                <Phone size={12} /> Enviar Acesso no Zap
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">Sem telefone</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {paginacao}
        </div>
      )}

      {aba === 'links' && dados && <AbaLinks dados={dados} ocupado={ocupado} executar={executar} />}

      {editando && dados && (
        <ModalEditar p={editando} blocos={dados.blocos} onFechar={() => setEditando(null)}
          onSalvar={(corpo) => executar('precadastro_editar', corpo, () => setEditando(null))} ocupado={ocupado} />
      )}
      {ampliar && (
        <div onClick={() => setAmpliar(null)} className="fixed inset-0 bg-black/80 z-[99] flex items-center justify-center cursor-zoom-out">
          <img src={ampliar} alt="" className="max-w-[90vw] max-h-[85vh] rounded-2xl" />
        </div>
      )}
    </div>
  );
}

function AbaLinks({ dados, ocupado, executar }: { dados: Resposta; ocupado: boolean; executar: (r: string, c: Record<string, unknown>) => void }) {
  const [geral, setGeral] = useState({ perfil: 'Geral', bloco_id: '', unidade_numero: '', validade_horas: '72', permite_segundo: '1' });
  const [temp, setTemp] = useState({ bloco_id: '', unidade_numero: '', validade_horas: '72', permite_segundo: '1' });
  const validade = (v: string, set: (x: string) => void, cor = '') => (
    <select value={v} onChange={(e) => set(e.target.value)} className={`${campo} ${cor}`}>
      <option value="24">24 horas</option><option value="72">3 dias</option><option value="168">7 dias</option><option value="720">30 dias</option>
    </select>
  );
  const blocos = (v: string, set: (x: string) => void, vazio: string, cor = '') => (
    <select value={v} onChange={(e) => set(e.target.value)} className={`${campo} ${cor}`}>
      <option value="">{vazio}</option>{dados.blocos.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
    </select>
  );
  const rot = 'block text-sm font-bold text-slate-600 mb-1.5';
  const copiar = (t: string) => navigator.clipboard?.writeText(t);

  return (
    <>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="bg-white rounded-2xl border border-slate-200 border-t-4 border-t-blue-600 p-6 shadow-sm">
          <div className="flex items-center gap-2 text-lg font-extrabold text-blue-700 mb-1"><Users size={18} /> Link Geral de Pré-cadastro</div>
          <p className="text-sm text-slate-500 mb-3.5">Para moradores que vão morar no condomínio. O porteiro analisa e aprova o acesso.</p>
          <div className="space-y-3">
            <div><label className={rot}>Perfil / Tipo de Morador</label>
              <select value={geral.perfil} onChange={(e) => setGeral({ ...geral, perfil: e.target.value })} className={campo}>
                <option value="Geral">Geral (Moradores)</option><option value="Prestadores">Prestadores de Serviço</option><option value="Funcionários">Funcionários</option><option value="Inquilinos">Inquilinos</option>
              </select></div>
            <div className="grid grid-cols-2 gap-2.5">
              <div><label className={rot}>Travar Bloco (Opcional)</label>{blocos(geral.bloco_id, (x) => setGeral({ ...geral, bloco_id: x }), 'Deixar morador escolher...')}</div>
              <div><label className={rot}>Travar Unidade (Opcional)</label><input value={geral.unidade_numero} onChange={(e) => setGeral({ ...geral, unidade_numero: e.target.value })} placeholder="Ex: 101" className={campo} /></div>
            </div>
            <div><label className={rot}>Validade do Link</label>{validade(geral.validade_horas, (x) => setGeral({ ...geral, validade_horas: x }))}</div>
            <div><label className={rot}>Vagas Liberadas</label>
              <select value={geral.permite_segundo} onChange={(e) => setGeral({ ...geral, permite_segundo: e.target.value })} className={campo}>
                <option value="1">Permitir até 2 Veículos (Carros ou Motos)</option><option value="0">Apenas 1 Veículo (Carro ou Moto)</option>
              </select></div>
          </div>
          <button disabled={ocupado} onClick={() => executar('precadastro_link_gerar', { tipo_link: 'geral', ...geral })} className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-60"><Link2 size={15} /> Gerar Link Geral</button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 border-t-4 border-t-cyan-600 p-6 shadow-sm">
          <div className="flex items-center gap-2 text-lg font-extrabold text-cyan-700 mb-1"><CalendarDays size={18} /> Link de Aluguel de Temporada</div>
          <p className="text-sm text-slate-500 mb-3.5">Para inquilinos de temporada. Pede documentos (CNH/RG) e período de estadia.</p>
          <div className="space-y-3">
            <div><label className={rot}>Travar Bloco / Unidade (Opcional)</label>
              <div className="grid grid-cols-2 gap-2.5">
                {blocos(temp.bloco_id, (x) => setTemp({ ...temp, bloco_id: x }), 'Deixar inquilino escolher...', 'border-cyan-600')}
                <input value={temp.unidade_numero} onChange={(e) => setTemp({ ...temp, unidade_numero: e.target.value })} placeholder="Ex: Apto 204" className={`${campo} border-cyan-600`} />
              </div></div>
            <div className="grid grid-cols-2 gap-2.5">
              <div><label className={rot}>Validade do Link</label>{validade(temp.validade_horas, (x) => setTemp({ ...temp, validade_horas: x }))}</div>
              <div><label className={rot}>Vagas Liberadas</label>
                <select value={temp.permite_segundo} onChange={(e) => setTemp({ ...temp, permite_segundo: e.target.value })} className={campo}><option value="1">Permitir até 2 Veículos</option><option value="0">Apenas 1 Veículo</option></select></div>
            </div>
          </div>
          <button disabled={ocupado} onClick={() => executar('precadastro_link_gerar', { tipo_link: 'temporada', ...temp })} className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-600 text-white font-bold disabled:opacity-60"><CalendarDays size={15} /> Gerar Link de Temporada</button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center gap-2 text-lg font-extrabold text-slate-900 mb-4"><Link2 size={18} /> Links Criados</div>
        {dados.links.length === 0 ? <div className="text-center text-slate-400 py-12">Nenhum link gerado ainda.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>{['Tipo', 'Link para Compartilhar', 'Vagas', 'Usos', 'Expira', 'Ação'].map((h) => <th key={h} className={`${th} ${h === 'Ação' ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
              <tbody>
                {dados.links.map((l) => {
                  const url = linkUrl(l.token);
                  const exp = l.expira_em ? new Date(l.expira_em.replace(' ', 'T')).getTime() : null;
                  const expirado = exp !== null && exp < Date.now();
                  const resta = exp !== null && !expirado ? Math.round((exp - Date.now()) / 3600000) : null;
                  const isTemp = l.tipo === 'temporada';
                  const wa = isTemp ? `Olá! Você tem uma reserva no nosso condomínio. Preencha seu cadastro de temporada neste link: ${url}` : `Clique neste link para fazer seu pré-cadastro no condomínio: ${url}`;
                  return (
                    <tr key={l.id} className={expirado ? 'opacity-50' : ''}>
                      <td className={td}>{isTemp
                        ? <span className="bg-cyan-100 text-cyan-700 px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap">🏖️ Temporada{l.unidade_info && <><br /><small className="font-medium">{l.unidade_info}</small></>}</span>
                        : <span className="bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full text-xs font-bold">{l.perfil ?? 'Geral'}</span>}</td>
                      <td className={td}>
                        <div className="flex gap-1.5 items-center">
                          <input readOnly value={url} onClick={(e) => { (e.target as HTMLInputElement).select(); copiar(url); }} className="text-xs flex-1 p-1.5 border border-slate-200 rounded-md cursor-pointer bg-slate-50 min-w-0" />
                          <a href={`https://api.whatsapp.com/send?text=${encodeURIComponent(wa)}`} target="_blank" rel="noreferrer" className="bg-[#25D366] text-white px-2.5 py-1.5 rounded-md shrink-0"><Phone size={14} /></a>
                        </div>
                      </td>
                      <td className={`${td} text-center font-bold`}>{Number(l.permite_segundo) === 1 ? '🚗🚗 (2)' : '🚗 (1)'}</td>
                      <td className={`${td} text-center font-bold`}>{l.usos}</td>
                      <td className={`${td} whitespace-nowrap`}>{!l.expira_em ? <span className="text-slate-500 text-xs">Sem validade</span> : expirado ? <span className="text-red-500 text-xs font-semibold">Expirado</span> : <span className="text-emerald-600 text-xs font-semibold">{resta}h restantes</span>}</td>
                      <td className={`${td} text-right`}>
                        <button disabled={ocupado} onClick={() => window.confirm('Remover este link?') && executar('precadastro_link_excluir', { id: l.id })} className="p-2 rounded-lg bg-red-50 text-red-600 border border-red-200 disabled:opacity-60"><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function ModalEditar({ p, blocos, onFechar, onSalvar, ocupado }: { p: Pre; blocos: { id: number; nome: string }[]; onFechar: () => void; onSalvar: (c: Record<string, unknown>) => void; ocupado: boolean }) {
  const [f, setF] = useState({ nome: p.nome, cpf: p.cpf ?? '', bloco_id: p.bloco_id ? String(p.bloco_id) : '', unidade_numero: p.unidade_numero ?? '', placa1: p.placa1 ?? '', placa2: p.placa2 ?? '', vaga_garagem1: p.vaga_garagem1 ?? '', vaga_garagem2: p.vaga_garagem2 ?? '' });
  const m = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const rot = 'block text-sm font-bold text-slate-600 mb-1.5';
  return (
    <Modal titulo={<><span className="bg-indigo-100 text-indigo-600 p-2 rounded-xl"><Pencil size={18} /></span> Editar Pré-cadastro</>} borda="border-t-indigo-500" onFechar={onFechar}>
      <form onSubmit={(e) => { e.preventDefault(); onSalvar({ id: p.id, ...f }); }} className="space-y-3">
        <div><label className={rot}>Nome Completo *</label><input required value={f.nome} onChange={m('nome')} className={`${campo} font-semibold`} /></div>
        <div>
          <label className={rot}>CPF (apenas números) *</label>
          <input required maxLength={14} value={f.cpf} onChange={m('cpf')} className={campo} />
          <ValidadorCpf cpf={f.cpf} onNomeEncontrado={(nome) => { if (!f.nome.trim()) setF((prev) => ({ ...prev, nome })); }} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={rot}>Bloco *</label><select required value={f.bloco_id} onChange={m('bloco_id')} className={campo}><option value="">Selecione...</option>{blocos.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}</select></div>
          <div><label className={rot}>Número da Unidade *</label><input required value={f.unidade_numero} onChange={m('unidade_numero')} placeholder="Ex: 101" className={campo} /></div>
        </div>
        <div className="text-xs font-extrabold text-slate-500 uppercase pt-1">Veículos (Opcional)</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><input value={f.placa1} onChange={m('placa1')} placeholder="Placa 1" className={`${campo} font-mono uppercase`} /><input value={f.vaga_garagem1} onChange={m('vaga_garagem1')} placeholder="Vaga da Placa 1" className={campo} /></div>
          <div className="space-y-2"><input value={f.placa2} onChange={m('placa2')} placeholder="Placa 2" className={`${campo} font-mono uppercase`} /><input value={f.vaga_garagem2} onChange={m('vaga_garagem2')} placeholder="Vaga da Placa 2" className={campo} /></div>
        </div>
        <div className="flex gap-3 pt-3">
          <button type="button" onClick={onFechar} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold">Cancelar</button>
          <button disabled={ocupado} className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-300 bg-white font-bold disabled:opacity-60"><Save size={16} /> Salvar Alterações</button>
        </div>
      </form>
    </Modal>
  );
}
