import { useState } from 'react';
import { api, ErroApi } from '../lib/api';
import FotoUsuario from '../components/FotoUsuario';

// Paridade com src/views/consulta_placa.php ("Modo Ronda"): busca total ou parcial, cartões com placa e situação
// (Autorizado/Bloqueado), veículo, proprietário com foto, CPF, bloco/unidade, vínculo e WhatsApp do morador.

interface Resultado {
  id: number; placa: string; marca: string | null; modelo: string | null; cor: string | null; veiculo_status: string;
  usuario_id: number | null; nome: string | null; cpf: string | null; telefone: string | null; tem_foto: boolean;
  relacao: string | null; unidade_num: string | null; bloco_nome: string | null;
}

const STATUS: Record<string, [string, string, string]> = {
  aprovado: ['border-emerald-100', 'bg-emerald-100 text-emerald-800', '✅ Autorizado'],
  bloqueado: ['border-red-100', 'bg-red-100 text-red-800', '🚫 Bloqueado'],
};
const fmtCpf = (c: string) => { const d = c.replace(/\D/g, ''); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : c; };
// Correção: o legado montava o link sem o código do país (wa.me exige 55 + DDD + número)
const zap = (tel: string) => { const d = tel.replace(/\D/g, ''); return d.length <= 11 ? `55${d}` : d; };

export default function ConsultaPlaca() {
  const [placa, setPlaca] = useState('');
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [erro, setErro] = useState('');

  const buscar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    try {
      const r = await api<{ busca: string; resultados: Resultado[] }>('consulta_placa', { query: { placa } });
      setBusca(r.busca);
      setResultados(r.resultados);
    } catch (e2) {
      setErro(e2 instanceof ErroApi ? e2.message : 'Erro na consulta.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8 space-y-5">
      <div className="bg-white rounded-2xl border border-slate-200 border-t-4 border-t-slate-900 p-6 shadow-sm">
        <div className="text-lg font-extrabold text-slate-900 mb-4">🔍 Consulta de Veículo por Placa</div>
        <form onSubmit={buscar} className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-bold text-slate-600 mb-1.5">Digite a Placa (total ou parcial)</label>
            <input autoFocus value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} placeholder="Ex: ABC1D23 ou ABC..."
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg outline-none focus:border-blue-500 uppercase font-mono text-lg font-bold tracking-widest" />
          </div>
          <button className="px-6 py-3 rounded-xl bg-blue-600 text-white font-bold">🔍 Buscar</button>
          {busca && <button type="button" onClick={() => { setPlaca(''); setBusca(''); setResultados([]); }} className="px-5 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold">✕ Limpar</button>}
        </form>
        {erro && <div className="mt-3 text-sm text-rose-700 font-semibold">{erro}</div>}
      </div>

      {busca !== '' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center text-lg font-extrabold text-slate-900 mb-4">
            Resultado<span className="ml-auto text-sm font-medium text-slate-500">{resultados.length} veículo(s) encontrado(s) para "{busca}"</span>
          </div>
          {resultados.length === 0 ? (
            <div className="text-center text-slate-400 py-10"><div className="text-3xl mb-2">🔎</div>Nenhum veículo encontrado com a placa "<b>{busca}</b>".</div>
          ) : (
            <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
              {resultados.map((v) => {
                const [borda, badge, rotulo] = STATUS[v.veiculo_status] ?? ['border-slate-100', 'bg-slate-100 text-slate-600', '—'];
                return (
                  <div key={v.id} className={`bg-white border-2 ${borda} rounded-2xl p-5 shadow-sm`}>
                    <div className="flex justify-between items-center mb-3.5">
                      <div className="font-mono text-2xl font-black text-slate-900 tracking-[3px] bg-slate-50 px-4 py-2 rounded-lg border-2 border-slate-200">{v.placa}</div>
                      <span className={`${badge} px-3 py-1 rounded-full text-xs font-bold`}>{rotulo}</span>
                    </div>
                    {(v.marca || v.modelo || v.cor) && (
                      <div className="text-sm text-slate-600 mb-3">🚗 {`${v.marca ?? ''} ${v.modelo ?? ''}`.trim()}{v.cor && <> — <span className="text-slate-500">{v.cor}</span></>}</div>
                    )}
                    <div className="flex gap-3 items-start">
                      {v.usuario_id ? <FotoUsuario id={v.usuario_id} temFoto={v.tem_foto} tamanho={56} redonda /> : <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-2xl">👤</div>}
                      <div className="flex-1">
                        <div className="font-bold text-slate-900 mb-1">{v.nome || 'Proprietário não identificado'}</div>
                        {v.cpf && <div className="text-xs text-slate-500 font-mono">CPF: {fmtCpf(v.cpf)}</div>}
                        {(v.bloco_nome || v.unidade_num) && <div className="text-sm text-blue-600 font-semibold mt-1">🏢 {v.bloco_nome ?? ''}{v.unidade_num ? ` / Unid: ${v.unidade_num}` : ''}</div>}
                        {v.relacao && <div className="text-xs text-slate-400 mt-0.5">{v.relacao}</div>}
                        {v.telefone && (
                          <a href={`https://api.whatsapp.com/send?phone=${zap(v.telefone)}&text=${encodeURIComponent(`Olá ${v.nome ?? ''}, estamos entrando em contato pela portaria.`)}`} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1.5 bg-[#25D366] text-white px-3 py-1.5 rounded-lg text-xs font-bold mt-2">📲 {v.telefone}</a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
