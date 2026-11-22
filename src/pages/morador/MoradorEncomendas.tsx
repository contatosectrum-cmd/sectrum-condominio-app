import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Barcode, Camera, Package, X } from 'lucide-react';
import { api, ErroApi } from '../../lib/api';
import { obterToken } from '../../lib/sessao';

// Minhas Encomendas (App do Morador):
// - Exibe QR Code real gerado 100% localmente no dispositivo (sem enviar hash a terceiros) + código manual de 6 dígitos
// - Mostra código de rastreio do volume e foto da encomenda registrada na portaria

interface EncomendaMorador {
  id: number;
  empresa: string;
  codigo_rastreio?: string | null;
  observacoes: string | null;
  pin_entrega: string | null;
  tem_foto?: boolean;
  status: string;
  hash_retirada: string | null;
  data_registro: string | null;
  data_recebimento: string | null;
  data_entrega: string | null;
}

function QrRetiradaLocal({ hash }: { hash: string }) {
  const [urlQr, setUrlQr] = useState<string>('');

  useEffect(() => {
    let ativo = true;
    QRCode.toDataURL(`SECTRUM-ENC:${hash}`, {
      width: 188,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((u) => {
        if (ativo) setUrlQr(u);
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [hash]);

  if (!urlQr) return null;
  return (
    <div className="inline-flex flex-col items-center p-2.5 bg-white rounded-2xl border border-emerald-200 shadow-xs">
      <img src={urlQr} alt="QR Code de Retirada" className="w-40 h-40 rounded-lg" />
    </div>
  );
}

function fmtCompleto(s: string | null): string {
  if (!s) return '—';
  const dt = new Date(s.replace(' ', 'T'));
  if (Number.isNaN(dt.getTime())) return '—';
  const d = dt.toLocaleDateString('pt-BR');
  const h = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${d} ${h}`;
}

function fmtCurto(s: string | null): string {
  if (!s) return '—';
  const dt = new Date(s.replace(' ', 'T'));
  if (Number.isNaN(dt.getTime())) return '—';
  const d = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const h = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${d} ${h}`;
}

export default function MoradorEncomendas() {
  const [encomendas, setEncomendas] = useState<EncomendaMorador[]>([]);
  const [modal, setModal] = useState(false);
  const [fotoModalUrl, setFotoModalUrl] = useState<string | null>(null);
  const [carregandoFotoId, setCarregandoFotoId] = useState<number | null>(null);
  const [form, setForm] = useState({ empresa: '', pin_entrega: '', observacoes: '' });
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ encomendas: EncomendaMorador[] }>('morador_encomendas');
      setEncomendas(r.encomendas);
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e instanceof ErroApi ? e.message : 'Erro ao carregar encomendas.' });
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const abrirFotoEncomenda = async (id: number) => {
    setCarregandoFotoId(id);
    try {
      const resp = await fetch(`/api.php?rota=morador_foto_encomenda&id=${id}`, {
        headers: { Authorization: `Bearer ${obterToken() ?? ''}` },
      });
      if (!resp.ok) throw new Error('Foto indisponível');
      const blobUrl = URL.createObjectURL(await resp.blob());
      setFotoModalUrl(blobUrl);
    } catch {
      setMsg({ tipo: 'erro', texto: 'Não foi possível carregar a foto da encomenda.' });
    } finally {
      setCarregandoFotoId(null);
    }
  };

  const fecharFotoModal = () => {
    if (fotoModalUrl) URL.revokeObjectURL(fotoModalUrl);
    setFotoModalUrl(null);
  };

  const salvarPrevisao = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    try {
      const r = await api<{ mensagem: string }>('morador_encomenda_prever', { corpo: form });
      setMsg({ tipo: 'ok', texto: r.mensagem });
      setForm({ empresa: '', pin_entrega: '', observacoes: '' });
      setModal(false);
      await carregar();
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err instanceof ErroApi ? err.message : 'Erro ao registrar previsão.' });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="max-w-[600px] mx-auto p-6 space-y-5">
      {fotoModalUrl && (
        <div
          className="fixed inset-0 z-[90] bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={fecharFotoModal}
        >
          <div
            className="bg-white rounded-3xl p-4 max-w-md w-full space-y-3 shadow-2xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-slate-900 text-sm">📷 Foto da Encomenda na Portaria</span>
              <button onClick={fecharFotoModal} className="p-1.5 rounded-full bg-slate-100 cursor-pointer">
                <X size={16} />
              </button>
            </div>
            <img src={fotoModalUrl} alt="Foto da encomenda" className="w-full max-h-[65vh] object-contain rounded-2xl bg-slate-950" />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-extrabold text-slate-900">Minhas Encomendas</h2>
        <button
          type="button"
          onClick={() => setModal(true)}
          className="px-4 py-2.5 rounded-[10px] bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-sm cursor-pointer"
        >
          + Nova Previsão
        </button>
      </div>

      {msg && (
        <div
          className={`border-l-4 px-4 py-3 rounded-lg text-sm font-semibold flex justify-between items-center gap-3 ${
            msg.tipo === 'ok' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-rose-50 border-rose-500 text-rose-800'
          }`}
        >
          <span>{msg.texto}</span>
          <button onClick={() => setMsg(null)} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
      )}

      {encomendas.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center bg-white">
          <Package size={40} className="mx-auto text-slate-300 mb-3" />
          <div className="font-bold text-slate-700">Nenhuma encomenda</div>
          <div className="text-sm text-slate-400 mt-1">Registre uma previsão quando fizer um pedido.</div>
        </div>
      ) : (
        <div className="space-y-4">
          {encomendas.map((e) => {
            const naPortaria = e.status === 'recebida_portaria';
            const entregue = e.status === 'entregue_morador';
            const aguardando = !naPortaria && !entregue;
            return (
              <div
                key={e.id}
                className={`rounded-2xl p-5 shadow-sm transition-all ${
                  naPortaria
                    ? 'border-2 border-emerald-500 bg-emerald-50/70'
                    : entregue
                      ? 'border border-slate-200 bg-slate-50 opacity-75'
                      : 'border border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-bold text-slate-900">{e.empresa}</div>
                    <div className="text-xs text-slate-500">Registrado em {fmtCompleto(e.data_registro)}</div>
                  </div>
                  {naPortaria ? (
                    <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-emerald-500 text-white">
                      Na Portaria
                    </span>
                  ) : entregue ? (
                    <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-slate-200 text-slate-600">
                      Entregue
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-amber-100 text-amber-800">
                      Aguardando
                    </span>
                  )}
                </div>

                {e.codigo_rastreio && (
                  <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/80 border border-slate-200 text-xs font-mono font-bold text-slate-700">
                    <Barcode size={13} className="text-slate-500" />
                    Volume: {e.codigo_rastreio}
                  </div>
                )}

                {e.observacoes && (
                  <div className="mt-2 text-sm text-slate-600">
                    <strong>Obs:</strong> {e.observacoes}
                  </div>
                )}

                {e.tem_foto && (
                  <div className="mt-2.5">
                    <button
                      type="button"
                      disabled={carregandoFotoId === e.id}
                      onClick={() => abrirFotoEncomenda(e.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-xs font-extrabold text-slate-700 cursor-pointer"
                    >
                      <Camera size={14} className="text-emerald-600" />
                      {carregandoFotoId === e.id ? 'Carregando foto...' : 'Ver Foto do Pacote'}
                    </button>
                  </div>
                )}

                {aguardando && e.pin_entrega && (
                  <div className="mt-3">
                    <div className="text-[11px] font-bold uppercase text-slate-500 mb-1">PIN / Código de Entrega:</div>
                    <div className="inline-block px-3 py-1.5 rounded-lg border border-dashed border-blue-400 bg-blue-50/50 font-mono font-bold text-blue-600">
                      {e.pin_entrega}
                    </div>
                  </div>
                )}

                {naPortaria && e.hash_retirada && (
                  <div className="mt-4 pt-3 border-t border-emerald-200 space-y-3 text-center sm:text-left">
                    <div>
                      <div className="font-extrabold text-emerald-900">Pronto para Retirada!</div>
                      <div className="text-xs text-emerald-800">
                        Apresente este QR Code para leitura na portaria ou informe o código de 6 dígitos abaixo:
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <QrRetiradaLocal hash={e.hash_retirada} />
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-extrabold uppercase text-emerald-800">Código Manual (6 dígitos)</div>
                        <div className="inline-block px-4 py-2 rounded-xl border-2 border-dashed border-blue-500 bg-white font-mono text-xl font-extrabold tracking-[4px] text-blue-600">
                          {e.hash_retirada.slice(0, 6).toUpperCase()}
                        </div>
                        <div className="text-xs text-emerald-800">Chegou em: {fmtCurto(e.data_recebimento)}</div>
                      </div>
                    </div>
                  </div>
                )}

                {entregue && (
                  <div className="mt-3 text-xs text-slate-500">Entregue em {fmtCompleto(e.data_entrega)}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Nova Previsão */}
      {modal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setModal(false)}
        >
          <div
            className="w-full max-w-[400px] bg-white rounded-[20px] p-6 shadow-2xl space-y-4"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div>
              <h3 className="text-lg font-extrabold text-slate-900">Nova Encomenda</h3>
              <p className="text-xs text-slate-500 mt-0.5">Avise a portaria que um pacote está a chegar.</p>
            </div>

            <form onSubmit={salvarPrevisao} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Empresa / App</label>
                <input
                  type="text"
                  name="empresa"
                  required
                  autoComplete="off"
                  placeholder="Ex: iFood, Mercado Livre, Correios"
                  value={form.empresa}
                  onChange={(e) => setForm({ ...form, empresa: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 border border-slate-300 outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                  PIN de Entrega (Opcional)
                </label>
                <input
                  type="text"
                  name="pin_entrega"
                  placeholder="Ex: 4912 (Código do iFood)"
                  value={form.pin_entrega}
                  onChange={(e) => setForm({ ...form, pin_entrega: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 border border-slate-300 outline-none focus:border-blue-600"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Se o app exigir senha para o porteiro receber, digite aqui.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                  Observações (Opcional)
                </label>
                <textarea
                  name="observacoes"
                  rows={2}
                  placeholder="Ex: Deixar na geladeira, Frágil..."
                  value={form.observacoes}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 border border-slate-300 outline-none focus:border-blue-600"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={ocupado}
                  className="flex-[2] py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm disabled:opacity-60"
                >
                  {ocupado ? '⏳ Aguarde...' : 'Salvar Previsão'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
