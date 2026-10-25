import { useCallback, useEffect, useRef, useState } from 'react';
import { Package, Search, X } from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import { Modal } from './moradores/AcoesMorador';

// Paridade com src/views/painel_portaria.php ("Gestão de Encomendas"): abas Painel de Operação / Relatório e Histórico,
// busca nos cards, colunas "Aguardando Chegada" (Confirmar Recebimento) e "Na Prateleira (Retirada)" (Entregar ao Morador,
// com QR ou código de 6 caracteres), histórico com auditoria de recepção/entrega e monitoramento a cada 10 s com aviso sonoro.

interface Encomenda {
  id: number; status: string; empresa: string; pin_entrega: string | null;
  data_recebimento: string | null; data_entrega: string | null;
  unidade_nome: string | null; bloco_nome: string | null; morador_nome: string | null;
  porteiro_recebeu: string | null; porteiro_entregou: string | null;
}
interface Aviso { tipo: 'ok' | 'erro'; mensagem: string }
interface Banner { texto: string; cor: string }

const data = (s: string | null, ano = true) => (s ? new Date(s.replace(' ', 'T')).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', ...(ano ? { year: 'numeric' } : {}), hour: '2-digit', minute: '2-digit' }).replace(',', '') : '—');
const msgErro = (e: unknown) => (e instanceof ErroApi ? e.message : 'Erro inesperado.');

function tocarNotificacao() {
  try {
    const ctx = new AudioContext();
    [880, 1100].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = freq;
      const t0 = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.25, t0 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
      osc.start(t0); osc.stop(t0 + 0.36);
    });
  } catch { /* navegador pode bloquear som sem interação */ }
}

export default function Encomendas() {
  const [lista, setLista] = useState<Encomenda[]>([]);
  const [aba, setAba] = useState<'op' | 'hist'>('op');
  const [busca, setBusca] = useState('');
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [receber, setReceber] = useState<Encomenda | null>(null);
  const [entregar, setEntregar] = useState<Encomenda | null>(null);
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [ativo, setAtivo] = useState(!document.hidden);
  const estado = useRef({ aguardando: 0, na_portaria: 0 });
  const modalAberto = receber !== null || entregar !== null;

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ encomendas: Encomenda[] }>('encomendas_painel');
      setLista(r.encomendas);
      estado.current = {
        aguardando: r.encomendas.filter((e) => e.status === 'aguardando_entrega').length,
        na_portaria: r.encomendas.filter((e) => e.status === 'recebida_portaria').length,
      };
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: msgErro(e) });
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // Monitoramento em tempo real (pausa com a aba inativa ou com modal aberto)
  useEffect(() => {
    const vis = () => setAtivo(!document.hidden);
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('focus', vis);
    return () => { document.removeEventListener('visibilitychange', vis); window.removeEventListener('focus', vis); };
  }, []);
  useEffect(() => {
    if (!ativo || modalAberto) return;
    const verificar = async () => {
      try {
        const n = await api<{ aguardando: number; na_portaria: number }>('encomendas_contagem');
        const a = estado.current;
        if (n.aguardando === a.aguardando && n.na_portaria === a.na_portaria) return;
        const dPrat = n.na_portaria - a.na_portaria;
        const dAg = n.aguardando - a.aguardando;
        tocarNotificacao();
        setBanner(dPrat > 0 ? { texto: `📦 ${dPrat === 1 ? '1 nova encomenda chegou' : `${dPrat} novas encomendas chegaram`} à portaria!`, cor: 'bg-emerald-800 border-emerald-500' }
          : dAg > 0 ? { texto: `🔔 ${dAg === 1 ? '1 nova previsão cadastrada' : `${dAg} novas previsões cadastradas`}.`, cor: 'bg-blue-900 border-blue-600' }
            : { texto: '🔄 Atualização detectada nas encomendas.', cor: 'bg-gray-700 border-gray-500' });
        await carregar();
        setTimeout(() => setBanner(null), 9000);
      } catch { /* rede instável não gera erro visível */ }
    };
    const t = setInterval(verificar, 10000);
    return () => clearInterval(t);
  }, [ativo, modalAberto, carregar]);

  const confirmar = async (rota: string, corpo: Record<string, unknown>) => {
    setEnviando(true);
    try {
      const r = await api<{ mensagem: string }>(rota, { corpo });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      setReceber(null); setEntregar(null); setCodigo('');
      await carregar();
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: msgErro(e) });
      if (rota === 'encomenda_receber') setReceber(null);
    } finally {
      setEnviando(false);
    }
  };

  const filtra = (e: Encomenda) => !busca || `${e.morador_nome ?? ''} ${e.bloco_nome ?? ''} ${e.unidade_nome ?? ''} ${e.empresa}`.toLowerCase().includes(busca.toLowerCase());
  const aguardando = lista.filter((e) => e.status === 'aguardando_entrega');
  const prateleira = lista.filter((e) => e.status === 'recebida_portaria');
  const historico = lista.filter((e) => e.status === 'entregue_morador');

  const card = (e: Encomenda, recebida: boolean) => (
    <div key={e.id} className={`rounded-xl p-4 mb-4 border border-slate-200 border-l-4 ${recebida ? 'bg-green-50 border-l-emerald-500' : 'bg-slate-50 border-l-amber-500'}`}>
      <div className="font-extrabold text-slate-900 text-lg mb-1">{e.morador_nome || 'Sem Identificação'}</div>
      <div className="text-sm text-slate-500 font-semibold mb-2.5 inline-block bg-slate-200 px-2 py-0.5 rounded-md">{e.bloco_nome || '—'} - Unidade {e.unidade_nome || 'Geral'}</div>
      <div className="text-sm text-slate-700 font-semibold mb-2">📦 {e.empresa}</div>
      {!recebida && e.pin_entrega && <div className="bg-amber-50 text-amber-700 border border-dashed border-amber-300 px-2.5 py-1.5 rounded-lg font-extrabold font-mono inline-block my-1">Senha Entrega: {e.pin_entrega}</div>}
      {recebida && <div className="text-xs text-emerald-500 mb-3">Chegou: {data(e.data_recebimento, false)}</div>}
      {recebida
        ? <button onClick={() => setEntregar(e)} className="w-full py-3 rounded-xl font-bold bg-emerald-500 hover:bg-emerald-600 text-white">Entregar ao Morador</button>
        : <button onClick={() => setReceber(e)} className="w-full mt-2.5 py-3 rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white">Confirmar Recebimento</button>}
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-8 space-y-5">
      {aviso && (
        <div className={`border-l-4 px-4 py-3 rounded-lg text-sm font-semibold flex justify-between gap-3 ${aviso.tipo === 'ok' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-rose-50 border-rose-500 text-rose-800'}`}>
          <span>{aviso.mensagem}</span>
          <button onClick={() => setAviso(null)} aria-label="Fechar aviso"><X size={16} /></button>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="text-2xl font-extrabold text-slate-900 flex items-center gap-2.5"><Package size={28} className="text-blue-600" /> Gestão de Encomendas</div>
        {aba === 'op' && (
          <div className="relative flex-1 min-w-[280px] max-w-[400px]">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por morador, apartamento ou empresa..." className="w-full pl-10 pr-4 py-3 border-2 border-slate-200 rounded-xl outline-none focus:border-blue-600 bg-white text-sm" />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {([['op', '📦 Painel de Operação'], ['hist', '📊 Relatório e Histórico']] as const).map(([id, rot]) => (
          <button key={id} onClick={() => setAba(id)} className={`px-4 py-2 rounded-lg text-sm font-bold border ${aba === id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{rot}</button>
        ))}
      </div>

      {aba === 'op' ? (
        <div className="grid gap-6 md:grid-cols-2 items-start">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
            <div className="text-lg font-extrabold text-slate-700 mb-4 flex justify-between items-center">Aguardando Chegada <span className="bg-slate-200 text-slate-600 px-2.5 py-0.5 rounded-xl text-sm">{aguardando.length}</span></div>
            {aguardando.length === 0 ? <div className="text-center p-5 text-slate-400">Nenhuma previsão.</div> : aguardando.filter(filtra).map((e) => card(e, false))}
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 border-t-4 border-t-emerald-500">
            <div className="text-lg font-extrabold text-slate-700 mb-4 flex justify-between items-center">Na Prateleira (Retirada) <span className="bg-slate-200 text-slate-600 px-2.5 py-0.5 rounded-xl text-sm">{prateleira.length}</span></div>
            {prateleira.length === 0 ? <div className="text-center p-5 text-slate-400">Prateleira vazia.</div> : prateleira.filter(filtra).map((e) => card(e, true))}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
          <div className="text-lg font-extrabold text-slate-700 mb-5">Histórico de Entregas (Últimos Registros)</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr>{['Morador / Unidade', 'Empresa', 'Auditoria de Receção', 'Auditoria de Entrega'].map((h) => <th key={h} className="text-left p-3 bg-slate-50 text-slate-500 font-bold border-b-2 border-slate-200">{h}</th>)}</tr></thead>
              <tbody>
                {historico.length === 0 && <tr><td colSpan={4} className="text-center p-8">Nenhum histórico encontrado.</td></tr>}
                {historico.map((h) => (
                  <tr key={h.id}>
                    <td className="p-3 border-b border-slate-100"><b>{h.morador_nome || 'Não identif.'}</b><br /><span className="text-xs text-slate-500">{h.bloco_nome} - {h.unidade_nome}</span></td>
                    <td className="p-3 border-b border-slate-100">{h.empresa}</td>
                    <td className="p-3 border-b border-slate-100 text-xs text-slate-500"><div>📥 {data(h.data_recebimento)}</div><div>👤 {h.porteiro_recebeu || 'Desconhecido'}</div></td>
                    <td className="p-3 border-b border-slate-100 text-xs text-slate-500"><div>📤 {data(h.data_entrega)}</div><div>👤 {h.porteiro_entregou || 'Desconhecido'}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {receber && (
        <Modal titulo="Receber Encomenda" borda="border-t-blue-600" onFechar={() => setReceber(null)} largura="max-w-md">
          <p className="text-slate-500 text-sm mb-5">Registrar entrada de pacote da <b>{receber.empresa}</b>?</p>
          <div className="flex gap-2.5">
            <button onClick={() => setReceber(null)} className="flex-1 py-3 rounded-xl font-bold bg-slate-100 text-slate-600">Cancelar</button>
            <button disabled={enviando} onClick={() => confirmar('encomenda_receber', { encomenda_id: receber.id })} className="flex-1 py-3 rounded-xl font-bold bg-blue-600 text-white disabled:opacity-60">Confirmar</button>
          </div>
        </Modal>
      )}
      {entregar && (
        <Modal titulo="Entregar Pacote" borda="border-t-emerald-500" onFechar={() => { setEntregar(null); setCodigo(''); }} largura="max-w-md">
          <p className="text-slate-500 text-sm mb-4">Para: <b>{entregar.morador_nome ?? 'Morador'}</b></p>
          <form onSubmit={(e) => { e.preventDefault(); confirmar('encomenda_entregar', { encomenda_id: entregar.id, qr_code: codigo }); }}>
            <label className="text-xs font-extrabold text-slate-600 block mb-1.5">LER QR CODE OU CÓDIGO (6 DÍGITOS):</label>
            <input autoFocus required value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ex: A4F9B2" autoComplete="off"
              className="w-full p-3.5 border-2 border-slate-200 rounded-xl outline-none focus:border-blue-600 mb-5 text-center font-mono text-xl font-bold tracking-widest" />
            <div className="flex gap-2.5">
              <button type="button" onClick={() => { setEntregar(null); setCodigo(''); }} className="flex-1 py-3 rounded-xl font-bold bg-slate-100 text-slate-600">Cancelar</button>
              <button disabled={enviando} className="flex-1 py-3 rounded-xl font-bold bg-emerald-500 text-white disabled:opacity-60">Confirmar Entrega</button>
            </div>
          </form>
        </Modal>
      )}

      {banner && (
        <div onClick={() => setBanner(null)} className={`fixed top-6 right-6 min-w-[280px] max-w-[360px] text-white px-5 py-4 rounded-2xl font-bold shadow-2xl z-[99] cursor-pointer border-l-4 ${banner.cor}`}>
          {banner.texto}<small className="block font-medium opacity-80 text-xs mt-1">Lista atualizada automaticamente</small>
        </div>
      )}
      <div className={`fixed bottom-5 right-5 px-4 py-2 rounded-full text-xs font-bold z-[90] flex items-center gap-2 border ${ativo ? 'bg-green-50 border-emerald-500 text-emerald-800' : 'bg-slate-50 border-slate-300 text-slate-400'}`}>
        <span className={`w-2 h-2 rounded-full ${ativo ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} /> {ativo ? 'Monitoramento ativo' : 'Em pausa (aba inativa)'}
      </div>
    </div>
  );
}
