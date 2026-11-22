import { useCallback, useEffect, useState } from 'react';
import {
  Wallet, Copy, Check, FileCheck2, AlertTriangle, CheckCircle2, PieChart, Printer, X, QrCode,
} from 'lucide-react';
import { api, ErroApi } from '../../lib/api';

interface ItemComposicao {
  conta: string;
  descricao: string;
  valor: number;
}

interface BoletoMorador {
  id: number;
  competencia: string | null;
  descricao: string;
  categoria: string;
  valor: number;
  vencimento: string;
  linha_digitavel: string | null;
  pix_copia_cola: string | null;
  status: 'pendente' | 'vencido' | 'pago' | string;
  pago_em: string | null;
  dias_atraso: number;
  multa_calculada: number;
  juros_calculado: number;
  valor_atualizado: number;
  composicao: ItemComposicao[];
}

interface DistItem {
  categoria: string;
  valor?: number;
  percentual: number;
}

interface CertidaoCnd {
  id: number;
  protocolo: string;
  titular_nome: string;
  unidade_label: string;
  condominio_nome?: string;
  valido_ate: string;
  hash_verificacao: string;
  emitido_em: string;
}

function fMoeda(v: number): string {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function MoradorBoletos() {
  const [boletos, setBoletos] = useState<BoletoMorador[]>([]);
  const [adimplente, setAdimplente] = useState(true);
  const [qtdVencidos, setQtdVencidos] = useState(0);
  const [unidadeLabel, setUnidadeLabel] = useState('');
  const [distribuicao, setDistribuicao] = useState<DistItem[]>([]);
  const [cnd, setCnd] = useState<CertidaoCnd | null>(null);
  const [modalCnd, setModalCnd] = useState(false);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [emitindoCnd, setEmitindoCnd] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; mensagem: string } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{
        boletos: BoletoMorador[];
        adimplente: boolean;
        qtd_vencidos: number;
        unidade_label: string;
        distribuicao_despesas: DistItem[];
        ultima_cnd: CertidaoCnd | null;
      }>('morador_financeiro_painel');
      setBoletos(r.boletos ?? []);
      setAdimplente(r.adimplente ?? true);
      setQtdVencidos(r.qtd_vencidos ?? 0);
      setUnidadeLabel(r.unidade_label ?? '');
      setDistribuicao(r.distribuicao_despesas ?? []);
      setCnd(r.ultima_cnd ?? null);
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro ao carregar faturas.' });
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const copiarTexto = (chave: string, texto: string | null) => {
    if (!texto) return;
    void navigator.clipboard.writeText(texto);
    setCopiadoId(chave);
    window.setTimeout(() => setCopiadoId(null), 2500);
  };

  const emitirCnd = async () => {
    setEmitindoCnd(true);
    setAviso(null);
    try {
      const r = await api<{ cnd: CertidaoCnd; mensagem: string }>('emitir_cnd_automatica', { corpo: {} });
      setCnd(r.cnd);
      setModalCnd(true);
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
    } catch (err) {
      setAviso({ tipo: 'erro', mensagem: err instanceof ErroApi ? err.message : 'Erro ao emitir CND.' });
    } finally {
      setEmitindoCnd(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Cabeçalho + Botão CND em 1 Clique */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-lg sm:text-xl font-black text-slate-900">
            <Wallet size={22} className="text-indigo-600" />
            Meus Boletos, PIX &amp; Certidão Negativa ({unidadeLabel || 'Meu Apartamento'})
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            Pague sua cota condominial com PIX Copia-e-Cola, acompanhe a transparência dos recursos do condomínio e emita sua Certidão Negativa de Débitos (CND) na hora.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {adimplente ? (
            <button
              type="button"
              disabled={emitindoCnd}
              onClick={() => void emitirCnd()}
              className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow cursor-pointer"
            >
              <FileCheck2 size={16} />
              {emitindoCnd ? 'Emitindo CND...' : 'Emitir Certidão Negativa (CND) em 1 Clique'}
            </button>
          ) : (
            <span className="px-3.5 py-2 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-extrabold flex items-center gap-1.5">
              <AlertTriangle size={15} /> {qtdVencidos} fatura(s) vencida(s) em aberto
            </span>
          )}
        </div>
      </div>

      {aviso && (
        <div
          className={`border-l-4 px-4 py-3.5 rounded-xl text-sm font-bold flex items-center justify-between gap-3 ${
            aviso.tipo === 'ok'
              ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
              : 'bg-rose-50 border-rose-500 text-rose-900'
          }`}
        >
          <span>{aviso.mensagem}</span>
          <button type="button" onClick={() => setAviso(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Gráfico de Transparência Condominial */}
      {distribuicao.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <PieChart size={15} className="text-indigo-600" />
              Transparência na Fatura — Para onde vai a Taxa do seu Condomínio
            </div>
            {adimplente && (
              <span className="inline-flex items-center gap-1 text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                <CheckCircle2 size={12} /> Unidade 100% em Dia
              </span>
            )}
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {distribuicao.slice(0, 4).map((d, idx) => (
              <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-lg font-black text-indigo-700">{d.percentual}%</div>
                <div className="text-xs font-bold text-slate-800 line-clamp-1">{d.categoria}</div>
                <div className="w-full h-1.5 bg-slate-200 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${Math.min(100, d.percentual)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista de Faturas da Unidade */}
      <div className="space-y-4">
        {carregando ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400">
            Carregando suas faturas...
          </div>
        ) : boletos.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
            Nenhuma fatura lançada para o seu apartamento até o momento.
          </div>
        ) : (
          boletos.map((b) => {
            const pago = b.status === 'pago';
            const vencido = b.status === 'vencido';
            return (
              <div
                key={b.id}
                className={`bg-white rounded-2xl border p-5 shadow-xs space-y-4 ${
                  vencido
                    ? 'border-rose-300 border-l-4 border-l-rose-600'
                    : pago
                      ? 'border-emerald-200 border-l-4 border-l-emerald-500'
                      : 'border-indigo-200 border-l-4 border-l-indigo-600'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                          pago
                            ? 'bg-emerald-100 text-emerald-800'
                            : vencido
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {pago ? '✅ LIQUIDADO' : vencido ? `🔴 VENCIDO (${b.dias_atraso}d)` : '🟡 ABERTO / A VENCER'}
                      </span>
                      <span className="text-xs font-bold text-slate-500">{b.categoria}</span>
                    </div>
                    <h3 className="text-base font-extrabold text-slate-900 mt-1">{b.descricao}</h3>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Vencimento: <b>{new Date(`${b.vencimento}T12:00:00`).toLocaleDateString('pt-BR')}</b>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xl font-black text-slate-900">{fMoeda(b.valor_atualizado)}</div>
                    {b.dias_atraso > 0 && !pago && (
                      <div className="text-[11px] text-rose-600 font-semibold">
                        Original: {fMoeda(b.valor)} + Multa ({fMoeda(b.multa_calculada)}) + Juros ({fMoeda(b.juros_calculado)})
                      </div>
                    )}
                  </div>
                </div>

                {/* Composição Detalhada da Fatura */}
                {b.composicao.length > 0 && (
                  <div className="bg-slate-50 rounded-xl border border-slate-200 p-3.5 space-y-1.5">
                    <div className="text-[11px] font-extrabold uppercase text-slate-500">
                      Composição Detalhada da Fatura
                    </div>
                    {b.composicao.map((it, idx) => (
                      <div key={idx} className="flex justify-between text-xs text-slate-700">
                        <span>{it.descricao}</span>
                        <span className="font-bold">{fMoeda(it.valor)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Botões de Pagamento PIX Copia-e-Cola e Linha Digitável */}
                {!pago && (
                  <div className="flex flex-wrap gap-2.5 pt-1">
                    {b.pix_copia_cola && (
                      <button
                        type="button"
                        onClick={() => copiarTexto(`pix-${b.id}`, b.pix_copia_cola)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold cursor-pointer shadow-xs"
                      >
                        {copiadoId === `pix-${b.id}` ? <Check size={15} /> : <QrCode size={15} />}
                        {copiadoId === `pix-${b.id}` ? 'Código PIX Copiado!' : 'Copiar PIX Copia-e-Cola'}
                      </button>
                    )}
                    {b.linha_digitavel && (
                      <button
                        type="button"
                        onClick={() => copiarTexto(`bol-${b.id}`, b.linha_digitavel)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-extrabold cursor-pointer"
                      >
                        {copiadoId === `bol-${b.id}` ? <Check size={15} /> : <Copy size={15} />}
                        {copiadoId === `bol-${b.id}`
                          ? 'Linha Digitável Copiada!'
                          : `Copiar Código de Barras (${b.linha_digitavel.slice(0, 18)}...)`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal de Visualização / Impressão da CND */}
      {modalCnd && cnd && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalCnd(false);
          }}
        >
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border-t-4 border-t-emerald-600 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800">
                  DOCUMENTO OFICIAL AUTENTICADO
                </span>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 mt-1">
                  CERTIDÃO NEGATIVA DE DÉBITOS CONDOMINIAIS (CND)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalCnd(false)}
                className="p-2 rounded-full bg-slate-100 text-slate-600"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 text-xs sm:text-sm text-slate-700 leading-relaxed">
              <p>
                Certificamos para os devidos fins que, até a presente data, <b>NÃO CONSTAM DÉBITOS CONDOMINIAIS VENCIDOS EM ABERTO</b> referentes à unidade autônoma abaixo identificada:
              </p>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1">
                <div>
                  <b>Unidade:</b> {cnd.unidade_label}
                </div>
                <div>
                  <b>Titular / Responsável:</b> {cnd.titular_nome}
                </div>
                <div>
                  <b>Protocolo de Emissão:</b> <span className="font-mono font-bold">{cnd.protocolo}</span>
                </div>
                <div>
                  <b>Validade da Certidão:</b>{' '}
                  {new Date(`${cnd.valido_ate}T12:00:00`).toLocaleDateString('pt-BR')}
                </div>
                <div>
                  <b>Assinatura Digital SHA-256:</b>{' '}
                  <span className="font-mono text-xs text-slate-500">{cnd.hash_verificacao}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold cursor-pointer"
              >
                <Printer size={15} /> Imprimir / Salvar PDF
              </button>
              <button
                type="button"
                onClick={() => setModalCnd(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
