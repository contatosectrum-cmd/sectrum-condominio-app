import { useCallback, useEffect, useState } from 'react';
import {
  Wallet, Plus, AlertTriangle, X, Copy, Check, Building2,
  ArrowUpCircle, ArrowDownCircle, Settings, Sparkles, Search, Trash2, FileCheck2, MessageSquare, Eye, Upload,
} from 'lucide-react';
import { api, ErroApi } from '../lib/api';

interface ItemComposicao {
  conta: string;
  descricao: string;
  valor: number;
}

interface CobrancaItem {
  id: number;
  unidade_id: number;
  unidade_numero: string;
  bloco_nome: string;
  proprietario_nome: string;
  inquilino_nome: string;
  competencia: string | null;
  descricao: string;
  categoria: string;
  valor: number;
  vencimento: string;
  linha_digitavel: string | null;
  pix_copia_cola: string | null;
  status: 'pendente' | 'vencido' | 'pago' | string;
  pago_em: string | null;
  forma_pagamento: string | null;
  dias_atraso: number;
  multa_calculada: number;
  juros_calculado: number;
  valor_atualizado: number;
  composicao: ItemComposicao[];
}

interface DespesaItem {
  id: number;
  conta_contabil: string;
  categoria: string;
  fornecedor_nome: string | null;
  fornecedor_cnpj_pix: string | null;
  descricao: string;
  valor: number;
  vencimento: string;
  status: 'pendente' | 'vencido' | 'pago' | string;
  pago_em: string | null;
  tem_comprovante?: boolean;
  comprovante_nome?: string | null;
  status_conselho?: 'pendente' | 'aprovada' | 'ressalva' | string;
  conselheiro_nome?: string | null;
}

interface ConfigFin {
  taxa_condominio_padrao: number;
  fundo_reserva_percentual: number;
  dia_vencimento_padrao: number;
  multa_atraso_percentual: number;
  juros_mensal_percentual: number;
  desconto_pontualidade: number;
  chave_pix_condominio: string | null;
  favorecido_nome: string | null;
  banco_codigo: string;
  banco_nome: string;
  agencia: string | null;
  conta: string | null;
}

interface UnidadeApoio {
  id: number;
  numero: string;
  bloco_nome: string;
  proprietario_nome: string;
  inquilino_nome: string;
  fracao_ideal: number;
  taxa_mensal: number;
}

const PLANO_CONTAS_DESPESAS = [
  { conta: '2.1.5', cat: 'Segurança, Portaria & Monitoramento', rotulo: '2.1.5 — Segurança, Portaria & Monitoramento' },
  { conta: '2.1.7', cat: 'Manutenção Predial & Conservação', rotulo: '2.1.7 — Manutenção Predial & Conservação' },
  { conta: '2.1.9', cat: 'Consumo (Água, Energia & Internet)', rotulo: '2.1.9 — Consumo (Água, Energia & Internet)' },
  { conta: '2.1.1', cat: 'Pessoal & Folha de Pagamento', rotulo: '2.1.1 — Pessoal & Folha de Pagamento' },
  { conta: '2.1.2', cat: 'Encargos Sociais & Impostos (INSS/FGTS/Reinf)', rotulo: '2.1.2 — Encargos Sociais & Impostos' },
  { conta: '2.1.4', cat: 'Administrativas & Contabilidade', rotulo: '2.1.4 — Administrativas & Contabilidade' },
  { conta: '2.2.1', cat: 'Obras & Despesas Extraordinárias', rotulo: '2.2.1 — Obras & Despesas Extraordinárias' },
];

const entrada =
  'w-full px-3.5 py-2.5 border border-slate-300 rounded-xl outline-none focus:border-indigo-600 bg-white text-slate-900 text-sm';

function fMoeda(v: number): string {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function criarBlobUrlDeBase64(b64OuDataUri: string, mimePadrao = 'application/pdf'): { url: string; ehPdf: boolean } {
  let mime = mimePadrao;
  let b64 = b64OuDataUri.trim();
  const m = b64.match(/^data:([^;]+);base64,(.+)$/is);
  if (m) {
    mime = m[1].toLowerCase();
    b64 = m[2];
  }
  const bin = window.atob(b64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mime });
  return { url: URL.createObjectURL(blob), ehPdf: mime.includes('pdf') };
}

export default function Financeiro() {
  const [aba, setAba] = useState<'receitas' | 'despesas' | 'rateio' | 'config'>('receitas');
  const [cobrancas, setCobrancas] = useState<CobrancaItem[]>([]);
  const [despesas, setDespesas] = useState<DespesaItem[]>([]);
  const [unidades, setUnidades] = useState<UnidadeApoio[]>([]);
  const [config, setConfig] = useState<ConfigFin | null>(null);
  const [resumo, setResumo] = useState({
    saldo_atual: 0,
    total_recebido: 0,
    receitas_a_vencer: 0,
    inadimplencia_total: 0,
    qtd_boletos_vencidos: 0,
    qtd_unidades_inadimplentes: 0,
    total_despesas_pagas: 0,
    despesas_a_pagar: 0,
    total_unidades: 0,
  });
  const [filtroCob, setFiltroCob] = useState<'todos' | 'pendente' | 'vencido' | 'pago'>('todos');
  const [buscaCob, setBuscaCob] = useState('');
  const [copiadoId, setCopiadoId] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; mensagem: string } | null>(null);

  // Formulário Rateio em Lote
  const [compRateio, setCompRateio] = useState(() => new Date().toISOString().slice(0, 7));
  const [vencRateio, setVencRateio] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(10);
    return d.toISOString().slice(0, 10);
  });
  const [modoRateio, setModoRateio] = useState<'taxa_fixa' | 'fracao_ideal'>('taxa_fixa');
  const [valorBaseRateio, setValorBaseRateio] = useState('240.00');
  const [incluirFundo, setIncluirFundo] = useState(true);
  const [incluirExtras, setIncluirExtras] = useState(true);

  // Formulário Cobrança Avulsa
  const [unidAvulsa, setUnidAvulsa] = useState('');
  const [catAvulsa, setCatAvulsa] = useState('Taxa Extra');
  const [descAvulsa, setDescAvulsa] = useState('');
  const [valAvulsa, setValAvulsa] = useState('');
  const [vencAvulsa, setVencAvulsa] = useState(() => new Date().toISOString().slice(0, 10));

  // Formulário Nova Despesa
  const [contaDesp, setContaDesp] = useState('2.1.7');
  const [fornNome, setFornNome] = useState('');
  const [fornPix, setFornPix] = useState('');
  const [descDesp, setDescDesp] = useState('');
  const [valDesp, setValDesp] = useState('');
  const [vencDesp, setVencDesp] = useState(() => new Date().toISOString().slice(0, 10));
  const [jaPagoDesp, setJaPagoDesp] = useState(false);
  const [compBase64, setCompBase64] = useState('');
  const [compNome, setCompNome] = useState('');

  const selecionarArquivoNf = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) {
      setAviso({ tipo: 'erro', mensagem: 'O comprovante/Nota Fiscal deve ter no máximo 8 MB.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCompBase64(String(reader.result || ''));
      setCompNome(f.name);
    };
    reader.readAsDataURL(f);
  };

  const carregar = useCallback(async () => {
    try {
      const r = await api<{
        config: ConfigFin;
        resumo: typeof resumo;
        cobrancas: CobrancaItem[];
        despesas: DespesaItem[];
        unidades: UnidadeApoio[];
      }>('financeiro_painel');
      setConfig(r.config);
      setResumo(r.resumo);
      setCobrancas(r.cobrancas ?? []);
      setDespesas(r.despesas ?? []);
      setUnidades(r.unidades ?? []);
      if (r.config?.taxa_condominio_padrao) {
        setValorBaseRateio(String(r.config.taxa_condominio_padrao));
      }
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro ao carregar módulo financeiro.' });
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const gerarRateioLote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !window.confirm(
        `Gerar faturas da competência ${compRateio} (vencimento ${vencRateio}) para todas as ${resumo.total_unidades} unidades com Boleto + PIX QR Code?`,
      )
    ) {
      return;
    }
    setEnviando(true);
    setAviso(null);
    try {
      const r = await api<{ mensagem: string }>('financeiro_gerar_rateio_lote', {
        corpo: {
          competencia: compRateio,
          vencimento: vencRateio,
          modo_rateio: modoRateio,
          valor_base: valorBaseRateio,
          incluir_fundo_reserva: incluirFundo,
          incluir_reservas_multas: incluirExtras,
        },
      });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      setAba('receitas');
      await carregar();
    } catch (err) {
      setAviso({ tipo: 'erro', mensagem: err instanceof ErroApi ? err.message : 'Erro ao gerar arrecadação.' });
    } finally {
      setEnviando(false);
    }
  };

  const lancarCobrancaAvulsa = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setAviso(null);
    try {
      const r = await api<{ mensagem: string }>('financeiro_lancar_cobranca_avulsa', {
        corpo: {
          unidade_id: Number(unidAvulsa),
          categoria: catAvulsa,
          descricao: descAvulsa,
          valor: valAvulsa,
          vencimento: vencAvulsa,
        },
      });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      setDescAvulsa('');
      setValAvulsa('');
      setAba('receitas');
      await carregar();
    } catch (err) {
      setAviso({ tipo: 'erro', mensagem: err instanceof ErroApi ? err.message : 'Erro ao lançar cobrança.' });
    } finally {
      setEnviando(false);
    }
  };

  const acaoCobranca = async (id: number, acao: 'liquidar' | 'estornar' | 'excluir') => {
    setEnviando(true);
    try {
      const r = await api<{ mensagem: string }>('financeiro_cobranca_status', { corpo: { id, acao } });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      await carregar();
    } catch (err) {
      setAviso({ tipo: 'erro', mensagem: err instanceof ErroApi ? err.message : 'Erro ao atualizar cobrança.' });
    } finally {
      setEnviando(false);
    }
  };

  const salvarDespesa = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setAviso(null);
    const itemPlano = PLANO_CONTAS_DESPESAS.find((p) => p.conta === contaDesp);
    try {
      const r = await api<{ mensagem: string }>('financeiro_despesa_salvar', {
        corpo: {
          conta_contabil: contaDesp,
          categoria: itemPlano?.cat || 'Manutenção',
          fornecedor_nome: fornNome,
          fornecedor_cnpj_pix: fornPix,
          descricao: descDesp,
          valor: valDesp,
          vencimento: vencDesp,
          ja_pago: jaPagoDesp,
          comprovante_base64: compBase64 || undefined,
          comprovante_nome: compNome || undefined,
        },
      });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      setDescDesp('');
      setValDesp('');
      setFornNome('');
      setFornPix('');
      setCompBase64('');
      setCompNome('');
      await carregar();
    } catch (err) {
      setAviso({ tipo: 'erro', mensagem: err instanceof ErroApi ? err.message : 'Erro ao salvar despesa.' });
    } finally {
      setEnviando(false);
    }
  };

  const acaoDespesa = async (id: number, acao: 'pagar' | 'estornar' | 'excluir') => {
    setEnviando(true);
    try {
      const r = await api<{ mensagem: string }>('financeiro_despesa_status', { corpo: { id, acao } });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      await carregar();
    } catch (err) {
      setAviso({ tipo: 'erro', mensagem: err instanceof ErroApi ? err.message : 'Erro ao atualizar despesa.' });
    } finally {
      setEnviando(false);
    }
  };

  const [visualizadorNf, setVisualizadorNf] = useState<{
    titulo: string;
    nomeArquivo: string;
    blobUrl: string;
    ehPdf: boolean;
  } | null>(null);

  const fecharVisualizadorNf = () => {
    if (visualizadorNf?.blobUrl) {
      URL.revokeObjectURL(visualizadorNf.blobUrl);
    }
    setVisualizadorNf(null);
  };

  const verNotaFiscalDespesa = async (despesaId: number) => {
    try {
      const r = await api<{
        descricao: string;
        comprovante_base64: string;
        comprovante_nome: string;
        comprovante_mime: string;
      }>('despesa_comprovante', { query: { id: despesaId } });
      if (!r.comprovante_base64) return;
      const { url, ehPdf } = criarBlobUrlDeBase64(r.comprovante_base64, r.comprovante_mime || 'application/pdf');
      setVisualizadorNf({
        titulo: `Nota Fiscal — ${r.descricao || `#${despesaId}`}`,
        nomeArquivo: r.comprovante_nome || `nf_${despesaId}.${ehPdf ? 'pdf' : 'jpg'}`,
        blobUrl: url,
        ehPdf,
      });
    } catch (err) {
      setAviso({ tipo: 'erro', mensagem: err instanceof ErroApi ? err.message : 'Erro ao abrir Nota Fiscal.' });
    }
  };

  const anexarNfNaLinha = (despesaId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      setEnviando(true);
      try {
        const r = await api<{ mensagem: string }>('financeiro_despesa_anexar_nf', {
          corpo: {
            id: despesaId,
            comprovante_base64: String(reader.result || ''),
            comprovante_nome: f.name,
            comprovante_mime: f.type,
          },
        });
        setAviso({ tipo: 'ok', mensagem: r.mensagem });
        await carregar();
      } catch (err) {
        setAviso({ tipo: 'erro', mensagem: err instanceof ErroApi ? err.message : 'Erro ao anexar NF.' });
      } finally {
        setEnviando(false);
      }
    };
    reader.readAsDataURL(f);
  };

  const salvarConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setEnviando(true);
    try {
      const r = await api<{ mensagem: string }>('financeiro_salvar_config', { corpo: config });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      await carregar();
    } catch (err) {
      setAviso({ tipo: 'erro', mensagem: err instanceof ErroApi ? err.message : 'Erro ao salvar parâmetros.' });
    } finally {
      setEnviando(false);
    }
  };

  const emitirCndUnidade = async (unidadeId: number) => {
    setEnviando(true);
    try {
      const r = await api<{ mensagem: string }>('emitir_cnd_automatica', { corpo: { unidade_id: unidadeId } });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
    } catch (err) {
      setAviso({ tipo: 'erro', mensagem: err instanceof ErroApi ? err.message : 'Erro ao emitir CND.' });
    } finally {
      setEnviando(false);
    }
  };

  const copiarPix = (c: CobrancaItem) => {
    const txt = c.pix_copia_cola || c.linha_digitavel || '';
    if (!txt) return;
    void navigator.clipboard.writeText(txt);
    setCopiadoId(c.id);
    window.setTimeout(() => setCopiadoId(null), 2500);
  };

  const enviarBoletoWhatsapp = async (cobrancaId: number) => {
    setEnviando(true);
    try {
      const r = await api<{ mensagem: string }>('financeiro_enviar_boleto_whatsapp', {
        corpo: { cobranca_id: cobrancaId },
      });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
    } catch (err) {
      setAviso({
        tipo: 'erro',
        mensagem: err instanceof ErroApi ? err.message : 'Erro ao enviar cobrança por WhatsApp.',
      });
    } finally {
      setEnviando(false);
    }
  };

  const cobrancasFiltradas = cobrancas.filter((c) => {
    if (filtroCob !== 'todos' && c.status !== filtroCob) return false;
    if (buscaCob.trim() !== '') {
      const q = buscaCob.toLowerCase();
      const alvo = `${c.bloco_nome} ${c.unidade_numero} ${c.proprietario_nome} ${c.inquilino_nome} ${c.descricao}`.toLowerCase();
      if (!alvo.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Cabeçalho */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-lg sm:text-xl font-black text-slate-900">
            <Wallet size={22} className="text-indigo-600" />
            Financeiro Condominial &amp; Arrecadação Inteligente (PIX + Boleto)
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            Rateio mensal automático em lote (Taxa Fixa ou Fração Ideal 100%) integrado com Reservas de Espaços, Multas Regimentais, Contas a Pagar e CND Automática.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAba('rateio')}
            className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow cursor-pointer"
          >
            <Sparkles size={16} /> Gerar Arrecadação do Mês ({resumo.total_unidades} unids.)
          </button>
        </div>
      </div>

      {/* Termômetro Executivo de Caixa */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200">
          <div className="text-xs font-extrabold uppercase text-blue-700 flex items-center gap-1.5">
            <Building2 size={14} /> Saldo em Caixa
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1">{fMoeda(resumo.saldo_atual)}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Recebido: {fMoeda(resumo.total_recebido)}</div>
        </div>

        <button
          type="button"
          onClick={() => {
            setAba('receitas');
            setFiltroCob(filtroCob === 'pendente' ? 'todos' : 'pendente');
          }}
          className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-emerald-300 text-left cursor-pointer"
        >
          <div className="text-xs font-extrabold uppercase text-emerald-700 flex items-center gap-1.5">
            <ArrowUpCircle size={14} /> A Receber (Em Dia)
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1">{fMoeda(resumo.receitas_a_vencer)}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Faturas dentro do vencimento</div>
        </button>

        <button
          type="button"
          onClick={() => {
            setAba('receitas');
            setFiltroCob(filtroCob === 'vencido' ? 'todos' : 'vencido');
          }}
          className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-rose-300 text-left cursor-pointer"
        >
          <div className="text-xs font-extrabold uppercase text-rose-700 flex items-center gap-1.5">
            <AlertTriangle size={14} /> Inadimplência
          </div>
          <div className="text-xl sm:text-2xl font-black text-rose-700 mt-1">{fMoeda(resumo.inadimplencia_total)}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {resumo.qtd_unidades_inadimplentes} unidade(s) • {resumo.qtd_boletos_vencidos} título(s)
          </div>
        </button>

        <button
          type="button"
          onClick={() => setAba('despesas')}
          className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-amber-300 text-left cursor-pointer"
        >
          <div className="text-xs font-extrabold uppercase text-amber-700 flex items-center gap-1.5">
            <ArrowDownCircle size={14} /> Contas a Pagar
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1">{fMoeda(resumo.despesas_a_pagar)}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Pagas: {fMoeda(resumo.total_despesas_pagas)}</div>
        </button>
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

      {/* Abas */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {(
          [
            ['receitas', `📥 Contas a Receber & Inadimplência (${cobrancas.length})`],
            ['rateio', '⚡ Gerar Arrecadação / Cobrança Avulsa'],
            ['despesas', `📤 Contas a Pagar / Despesas (${despesas.length})`],
            ['config', '⚙️ Chave PIX, Banco & Juros/Multa'],
          ] as const
        ).map(([id, rot]) => (
          <button
            key={id}
            type="button"
            onClick={() => setAba(id)}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold border transition cursor-pointer ${
              aba === id
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {rot}
          </button>
        ))}
      </div>

      {carregando ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
          Carregando dados financeiros...
        </div>
      ) : aba === 'receitas' ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2 flex-wrap">
              {(
                [
                  ['todos', 'Todos'],
                  ['pendente', '🟡 A Vencer'],
                  ['vencido', '🔴 Vencidos (Inadimplência)'],
                  ['pago', '🟢 Recebidos'],
                ] as const
              ).map(([st, lab]) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setFiltroCob(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold border cursor-pointer ${
                    filtroCob === st
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-600 border-slate-200'
                  }`}
                >
                  {lab}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                value={buscaCob}
                onChange={(e) => setBuscaCob(e.target.value)}
                placeholder="Buscar bloco, apto, proprietário..."
                className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs w-64 bg-white"
              />
            </div>
          </div>

          {cobrancasFiltradas.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              Nenhuma cobrança encontrada neste filtro. Clique em <b>&quot;Gerar Arrecadação do Mês&quot;</b> acima para emitir o lote das unidades.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-extrabold uppercase text-slate-500">
                    <th className="py-3 px-3">Unidade / Titular</th>
                    <th className="py-3 px-3">Referência &amp; Composição</th>
                    <th className="py-3 px-3">Vencimento</th>
                    <th className="py-3 px-3">Valor / Atualizado</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">PIX / Baixa / CND</th>
                  </tr>
                </thead>
                <tbody>
                  {cobrancasFiltradas.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-3">
                        <div className="font-extrabold text-slate-900">
                          {c.bloco_nome} — Apto {c.unidade_numero}
                        </div>
                        <div className="text-xs text-slate-500">
                          {c.proprietario_nome || 'Sem titular'}{' '}
                          {c.inquilino_nome ? `• 🔑 Inq.: ${c.inquilino_nome}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-800">{c.descricao}</div>
                        {c.composicao.length > 0 && (
                          <div className="text-[11px] text-slate-500 space-x-2">
                            {c.composicao.map((it, idx) => (
                              <span key={idx}>
                                • {it.descricao}: <b>{fMoeda(it.valor)}</b>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-xs font-semibold text-slate-700">
                        {new Date(`${c.vencimento}T12:00:00`).toLocaleDateString('pt-BR')}
                        {c.dias_atraso > 0 && (
                          <div className="text-[10px] font-extrabold text-rose-600">
                            {c.dias_atraso} dia(s) em atraso
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-extrabold text-slate-900">{fMoeda(c.valor_atualizado)}</div>
                        {c.dias_atraso > 0 && (
                          <div className="text-[10px] text-rose-600">
                            Orig: {fMoeda(c.valor)} + Multa/Juros
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {c.status === 'pago' ? (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800">
                            🟢 Pago
                          </span>
                        ) : c.status === 'vencido' ? (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800">
                            🔴 Vencido
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800">
                            🟡 A Vencer
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {c.status !== 'pago' && (
                            <>
                              <button
                                type="button"
                                onClick={() => copiarPix(c)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-extrabold cursor-pointer"
                                title="Copiar código PIX Copia-e-Cola da fatura"
                              >
                                {copiadoId === c.id ? <Check size={13} /> : <Copy size={13} />}
                                {copiadoId === c.id ? 'Copiado!' : 'PIX'}
                              </button>
                              <button
                                type="button"
                                disabled={enviando}
                                onClick={() => void enviarBoletoWhatsapp(c.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-extrabold cursor-pointer"
                                title="Enviar 2ª via e PIX Copia-e-Cola direto no WhatsApp do morador"
                              >
                                <MessageSquare size={13} /> Zap
                              </button>
                              <button
                                type="button"
                                disabled={enviando}
                                onClick={() => void acaoCobranca(c.id, 'liquidar')}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold cursor-pointer"
                              >
                                Dar Baixa
                              </button>
                            </>
                          )}
                          {c.status === 'pago' && (
                            <button
                              type="button"
                              disabled={enviando}
                              onClick={() => void emitirCndUnidade(c.unidade_id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-extrabold cursor-pointer"
                              title="Emitir Certidão Negativa de Débitos (CND) da Unidade"
                            >
                              <FileCheck2 size={13} /> Emitir CND
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={enviando}
                            onClick={() => void acaoCobranca(c.id, 'excluir')}
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 cursor-pointer"
                            title="Excluir cobrança"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : aba === 'rateio' ? (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Card 1: Arrecadação Mensal em Lote */}
          <form
            onSubmit={gerarRateioLote}
            className="bg-white rounded-2xl border border-slate-200 border-t-4 border-t-indigo-600 p-6 shadow-xs space-y-4"
          >
            <div className="flex items-center gap-2 text-base font-extrabold text-slate-900">
              <Sparkles size={18} className="text-indigo-600" />
              Gerar Arrecadação Mensal em Lote ({resumo.total_unidades} Unidades)
            </div>
            <p className="text-xs text-slate-500">
              Gera as faturas de todas as unidades do condomínio com <b>PIX Copia-e-Cola (BR Code)</b> e{' '}
              <b>Linha Digitável</b>, somando automaticamente o Fundo de Reserva, Reservas de Salão/Churrasqueira e Multas do mês.
            </p>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Mês de Competência *
                </label>
                <input
                  type="month"
                  required
                  value={compRateio}
                  onChange={(e) => setCompRateio(e.target.value)}
                  className={entrada}
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Data de Vencimento *
                </label>
                <input
                  type="date"
                  required
                  value={vencRateio}
                  onChange={(e) => setVencRateio(e.target.value)}
                  className={entrada}
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Critério de Rateio *
                </label>
                <select
                  value={modoRateio}
                  onChange={(e) => setModoRateio(e.target.value as typeof modoRateio)}
                  className={entrada}
                >
                  <option value="taxa_fixa">🏠 Taxa Fixa por Unidade</option>
                  <option value="fracao_ideal">📐 Rateio de Orçamento pela Fração Ideal (100%)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  {modoRateio === 'taxa_fixa' ? 'Valor da Cota por Unidade (R$) *' : 'Orçamento Total do Mês (R$) *'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={valorBaseRateio}
                  onChange={(e) => setValorBaseRateio(e.target.value)}
                  className={entrada}
                />
              </div>
            </div>

            <div className="space-y-2 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={incluirFundo}
                  onChange={(e) => setIncluirFundo(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600"
                />
                Adicionar Fundo de Reserva ({config?.fundo_reserva_percentual ?? 10}% sobre a cota ordinária)
              </label>
              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={incluirExtras}
                  onChange={(e) => setIncluirExtras(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600"
                />
                Incluir automaticamente Taxas de Reserva de Áreas Comuns e Multas Regimentais do mês na fatura
              </label>
            </div>

            <button
              type="submit"
              disabled={enviando}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm cursor-pointer"
            >
              {enviando ? 'Gerando Lote...' : `⚡ Emitir Faturas para as ${resumo.total_unidades} Unidades`}
            </button>
          </form>

          {/* Card 2: Cobrança Avulsa Individual */}
          <form
            onSubmit={lancarCobrancaAvulsa}
            className="bg-white rounded-2xl border border-slate-200 border-t-4 border-t-emerald-600 p-6 shadow-xs space-y-4"
          >
            <div className="flex items-center gap-2 text-base font-extrabold text-slate-900">
              <Plus size={18} className="text-emerald-600" />
              Lançar Cobrança Avulsa Individual
            </div>
            <p className="text-xs text-slate-500">
              Emita uma cobrança específica para uma única unidade (Taxa Extra, Reposição de Controle/Tag, Ressarcimento de Dano ou Acordo).
            </p>

            <div>
              <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                Unidade Destino *
              </label>
              <select
                required
                value={unidAvulsa}
                onChange={(e) => setUnidAvulsa(e.target.value)}
                className={entrada}
              >
                <option value="">Selecione a unidade...</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.bloco_nome} — Apto {u.numero} {u.proprietario_nome ? `(${u.proprietario_nome})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">Categoria *</label>
                <select value={catAvulsa} onChange={(e) => setCatAvulsa(e.target.value)} className={entrada}>
                  <option value="Taxa Extra">1.21.1 — Taxa Extra / Chamada de Capital</option>
                  <option value="Aluguel Área Comum">1.22 — Reserva de Espaço / Salão</option>
                  <option value="Multa Regimental">1.8 — Multa por Infração</option>
                  <option value="Acordo Financeiro">1.20 — Parcela de Acordo</option>
                  <option value="Ressarcimento">1.21.15 — Ressarcimento / Tag / Controle</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">Valor (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={valAvulsa}
                  onChange={(e) => setValAvulsa(e.target.value)}
                  placeholder="0.00"
                  className={entrada}
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">Descrição *</label>
                <input
                  required
                  value={descAvulsa}
                  onChange={(e) => setDescAvulsa(e.target.value)}
                  placeholder="Ex: Taxa Extra Modernização Portaria"
                  className={entrada}
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">Vencimento *</label>
                <input
                  type="date"
                  required
                  value={vencAvulsa}
                  onChange={(e) => setVencAvulsa(e.target.value)}
                  className={entrada}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={enviando}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm cursor-pointer"
            >
              ➕ Emitir Cobrança Avulsa c/ PIX
            </button>
          </form>
        </div>
      ) : aba === 'despesas' ? (
        <div className="space-y-6">
          {/* Formulário Lançar Despesa */}
          <form
            onSubmit={salvarDespesa}
            className="bg-white rounded-2xl border border-slate-200 border-t-4 border-t-rose-600 p-6 shadow-xs space-y-4"
          >
            <div className="text-base font-extrabold text-slate-900">
              📤 Lançar Nova Despesa (Contas a Pagar — Plano de Contas Condominial)
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Conta Contábil / Categoria *
                </label>
                <select value={contaDesp} onChange={(e) => setContaDesp(e.target.value)} className={entrada}>
                  {PLANO_CONTAS_DESPESAS.map((p) => (
                    <option key={p.conta} value={p.conta}>
                      {p.rotulo}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Fornecedor / Prestador
                </label>
                <input
                  value={fornNome}
                  onChange={(e) => setFornNome(e.target.value)}
                  placeholder="Ex: Equatorial Energia / CAEMA"
                  className={entrada}
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  CNPJ ou Chave PIX do Fornecedor
                </label>
                <input
                  value={fornPix}
                  onChange={(e) => setFornPix(e.target.value)}
                  placeholder="Opcional"
                  className={entrada}
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Descrição Detalhada *
                </label>
                <input
                  required
                  value={descDesp}
                  onChange={(e) => setDescDesp(e.target.value)}
                  placeholder="Ex: Conta de Energia Área Comum Ref. 11/2026"
                  className={entrada}
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">Valor (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={valDesp}
                  onChange={(e) => setValDesp(e.target.value)}
                  placeholder="0.00"
                  className={entrada}
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">Vencimento *</label>
                <input
                  type="date"
                  required
                  value={vencDesp}
                  onChange={(e) => setVencDesp(e.target.value)}
                  className={entrada}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={jaPagoDesp}
                    onChange={(e) => setJaPagoDesp(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600"
                  />
                  Esta despesa já foi paga (liquidada no caixa)
                </label>

                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-extrabold cursor-pointer">
                  📎 {compNome ? `NF Anexada: ${compNome}` : 'Anexar Nota Fiscal / Comprovante (PDF ou Foto)'}
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={selecionarArquivoNf}
                    className="hidden"
                  />
                </label>
              </div>
              <button
                type="submit"
                disabled={enviando}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold cursor-pointer"
              >
                Registrar Despesa
              </button>
            </div>
          </form>

          {/* Tabela de Despesas */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <h3 className="text-base font-extrabold text-slate-900 mb-4">Histórico de Despesas</h3>
            {despesas.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">Nenhuma despesa registrada ainda.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs font-extrabold uppercase text-slate-500">
                      <th className="py-3 px-3">Conta / Categoria</th>
                      <th className="py-3 px-3">Descrição / Fornecedor</th>
                      <th className="py-3 px-3">Vencimento</th>
                      <th className="py-3 px-3">Valor</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {despesas.map((d) => (
                      <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-3">
                          <span className="font-mono text-xs font-bold bg-slate-100 px-2 py-0.5 rounded">
                            {d.conta_contabil}
                          </span>
                          <div className="text-xs font-bold text-rose-700 mt-0.5">{d.categoria}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-extrabold text-slate-900">{d.descricao}</div>
                          <div className="text-xs text-slate-500 flex flex-wrap gap-2 mt-0.5">
                            {d.fornecedor_nome && <span>Fornecedor: {d.fornecedor_nome}</span>}
                            {d.tem_comprovante && (
                              <span className="px-2 py-0.2 rounded-full bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 text-[10px]">
                                📎 NF Anexada
                              </span>
                            )}
                            {d.status_conselho === 'aprovada' && (
                              <span className="px-2 py-0.2 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 text-[10px]">
                                ✅ Auditada pelo Conselho
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-xs font-semibold">
                          {new Date(`${d.vencimento}T12:00:00`).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="py-3 px-3 font-extrabold text-slate-900">{fMoeda(d.valor)}</td>
                        <td className="py-3 px-3">
                          {d.status === 'pago' ? (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800">
                              🟢 Pago
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800">
                              🟡 A Pagar
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {d.tem_comprovante ? (
                              <button
                                type="button"
                                onClick={() => void verNotaFiscalDespesa(d.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-extrabold cursor-pointer"
                                title="Visualizar Nota Fiscal / Comprovante"
                              >
                                <Eye size={13} /> Ver NF
                              </button>
                            ) : (
                              <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer">
                                <Upload size={12} /> Anexar NF
                                <input
                                  type="file"
                                  accept="application/pdf,image/*"
                                  onChange={(e) => anexarNfNaLinha(d.id, e)}
                                  className="hidden"
                                />
                              </label>
                            )}
                            {d.status !== 'pago' && (
                              <button
                                type="button"
                                disabled={enviando}
                                onClick={() => void acaoDespesa(d.id, 'pagar')}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold cursor-pointer"
                              >
                                Informar Pagamento
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={enviando}
                              onClick={() => void acaoDespesa(d.id, 'excluir')}
                              className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 cursor-pointer"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        config && (
          <form
            onSubmit={salvarConfig}
            className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5 max-w-3xl"
          >
            <div className="flex items-center gap-2 text-base font-extrabold text-slate-900">
              <Settings size={18} className="text-indigo-600" />
              Parâmetros Financeiros, Conta Bancária &amp; Chave PIX Oficial
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Cota Condominial Padrão (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={config.taxa_condominio_padrao}
                  onChange={(e) => setConfig({ ...config, taxa_condominio_padrao: Number(e.target.value) })}
                  className={entrada}
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Fundo de Reserva (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={config.fundo_reserva_percentual}
                  onChange={(e) => setConfig({ ...config, fundo_reserva_percentual: Number(e.target.value) })}
                  className={entrada}
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Dia Padrão de Vencimento
                </label>
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={config.dia_vencimento_padrao}
                  onChange={(e) => setConfig({ ...config, dia_vencimento_padrao: Number(e.target.value) })}
                  className={entrada}
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Multa por Atraso (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={config.multa_atraso_percentual}
                  onChange={(e) => setConfig({ ...config, multa_atraso_percentual: Number(e.target.value) })}
                  className={entrada}
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Juros ao Mês (% pro-rata)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={config.juros_mensal_percentual}
                  onChange={(e) => setConfig({ ...config, juros_mensal_percentual: Number(e.target.value) })}
                  className={entrada}
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Chave PIX do Condomínio (CNPJ/E-mail)
                </label>
                <input
                  value={config.chave_pix_condominio ?? ''}
                  onChange={(e) => setConfig({ ...config, chave_pix_condominio: e.target.value })}
                  placeholder="20.780.385/0001-64"
                  className={entrada}
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Banco Principal
                </label>
                <input
                  value={config.banco_nome ?? ''}
                  onChange={(e) => setConfig({ ...config, banco_nome: e.target.value })}
                  className={entrada}
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">Agência</label>
                <input
                  value={config.agencia ?? ''}
                  onChange={(e) => setConfig({ ...config, agencia: e.target.value })}
                  className={entrada}
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">Conta Corrente</label>
                <input
                  value={config.conta ?? ''}
                  onChange={(e) => setConfig({ ...config, conta: e.target.value })}
                  className={entrada}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={enviando}
              className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm cursor-pointer"
            >
              Salvar Configurações Financeiras
            </button>
          </form>
        )
      )}

      {/* Modal Visualizador de Nota Fiscal / Comprovante */}
      {visualizadorNf && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) fecharVisualizadorNf();
          }}
        >
          <div className="bg-white rounded-3xl max-w-4xl w-full h-[88vh] flex flex-col overflow-hidden shadow-2xl border-t-4 border-t-indigo-600">
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="font-extrabold text-slate-900 text-sm truncate max-w-xl">{visualizadorNf.titulo}</div>
              <div className="flex items-center gap-2">
                <a
                  href={visualizadorNf.blobUrl}
                  download={visualizadorNf.nomeArquivo}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold"
                >
                  ⬇️ Baixar NF
                </a>
                <a
                  href={visualizadorNf.blobUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-extrabold"
                >
                  ↗ Nova Guia
                </a>
                <button
                  type="button"
                  onClick={fecharVisualizadorNf}
                  className="w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 flex items-center justify-center cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-900 flex items-center justify-center overflow-auto">
              {visualizadorNf.ehPdf ? (
                <iframe src={visualizadorNf.blobUrl} title={visualizadorNf.titulo} className="w-full h-full border-0 bg-white" />
              ) : (
                <img src={visualizadorNf.blobUrl} alt={visualizadorNf.titulo} className="max-w-full max-h-full object-contain p-4" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
