import { useCallback, useEffect, useState } from 'react';
import {
  FileCheck2, Eye, CheckCircle2, AlertTriangle, Plus, X, FileText, Upload, ShieldCheck,
  Building2, ArrowUpCircle, ArrowDownCircle, Trash2, Printer, BookOpen,
} from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import { useSessao } from '../lib/useSessao';

interface DespesaMes {
  id: number;
  conta_contabil: string;
  categoria: string;
  fornecedor_nome: string | null;
  descricao: string;
  valor: number;
  vencimento: string;
  status: string;
  aprovado_conselho: boolean;
  status_conselho: 'pendente' | 'aprovada' | 'ressalva' | string;
  parecer_conselho: string | null;
  conselheiro_nome: string | null;
  avaliado_conselho_em: string | null;
  tem_comprovante: boolean;
  comprovante_nome: string | null;
  comprovante_mime: string | null;
}

interface CatResumo {
  categoria: string;
  conta: string;
  total: number;
  qtd: number;
}

interface PastaMensal {
  id: number;
  competencia: string;
  status_pasta: 'aprovada' | 'ressalva' | 'aberta' | string;
  parecer_texto: string | null;
  aprovado_por_nome: string | null;
  protocolo_fechamento: string | null;
  hash_fechamento: string | null;
  fechado_em: string | null;
}

interface DocCondominio {
  id: number;
  categoria: string;
  titulo: string;
  descricao: string | null;
  mime_type: string;
  nome_arquivo: string | null;
  tem_arquivo: boolean;
  criado_por_nome: string | null;
  criado_em: string;
}

const CATEGORIAS_DOCS: Record<string, string> = {
  convencao: '🏛️ Convenção Condominial',
  regimento_interno: '📖 Regimento Interno & Normas',
  ata_assembleia: '📜 Ata de Assembleia Geral',
  contrato_prestador: '🤝 Contrato de Prestador / Fornecedor',
  comunicado_oficial: '📢 Manual / Comunicado Institucional',
};

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

export default function Transparencia() {
  const { usuario } = useSessao();
  const ehGestao = ['superadmin', 'admin', 'sindico'].includes(usuario?.perfil ?? '');

  const [aba, setAba] = useState<'balancete' | 'documentos'>('balancete');
  const [competencia, setCompetencia] = useState(() => {
    const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 7);
  });
  const [resumoMes, setResumoMes] = useState({
    saldo_global_caixa: 0,
    receitas_recebidas_mes: 0,
    receitas_em_aberto_mes: 0,
    despesas_pagas_mes: 0,
    despesas_pendentes_mes: 0,
    resultado_liquido_mes: 0,
    qtd_unidades_pagas: 0,
    qtd_unidades_vencidas: 0,
    total_faturas_mes: 0,
    total_despesas_lancadas: 0,
    qtd_despesas_auditadas: 0,
    qtd_despesas_com_nf: 0,
  });
  const [despesasMes, setDespesasMes] = useState<DespesaMes[]>([]);
  const [porCategoria, setPorCategoria] = useState<CatResumo[]>([]);
  const [pastaMensal, setPastaMensal] = useState<PastaMensal | null>(null);
  const [documentos, setDocumentos] = useState<DocCondominio[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; mensagem: string } | null>(null);

  // Modal de Parecer da Pasta Mensal
  const [modalParecer, setModalParecer] = useState(false);
  const [statusPasta, setStatusPasta] = useState<'aprovada' | 'ressalva'>('aprovada');
  const [parecerTexto, setParecerTexto] = useState('');

  // Modal Novo Documento Institucional
  const [modalNovoDoc, setModalNovoDoc] = useState(false);
  const [catDoc, setCatDoc] = useState('regimento_interno');
  const [tituloDoc, setTituloDoc] = useState('');
  const [descDoc, setDescDoc] = useState('');
  const [arqDocBase64, setArqDocBase64] = useState('');
  const [arqDocNome, setArqDocNome] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await api<{
        competencia: string;
        resumo_mes: typeof resumoMes;
        despesas_mes: DespesaMes[];
        por_categoria: CatResumo[];
        pasta_mensal: PastaMensal | null;
        documentos: DocCondominio[];
      }>('transparencia_painel', { query: { competencia } });
      setResumoMes(r.resumo_mes ?? resumoMes);
      setDespesasMes(r.despesas_mes ?? []);
      setPorCategoria(r.por_categoria ?? []);
      setPastaMensal(r.pasta_mensal ?? null);
      setDocumentos(r.documentos ?? []);
      if (r.pasta_mensal?.parecer_texto) {
        setParecerTexto(r.pasta_mensal.parecer_texto);
      }
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro ao carregar Portal da Transparência.' });
    } finally {
      setCarregando(false);
    }
  }, [competencia]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Modal Visualizador de NF / PDF / Imagem (compatível com Mobile iOS/Android sem bloqueio de pop-up)
  const [visualizador, setVisualizador] = useState<{
    titulo: string;
    nomeArquivo: string;
    blobUrl: string;
    ehPdf: boolean;
  } | null>(null);

  const fecharVisualizador = () => {
    if (visualizador?.blobUrl) {
      URL.revokeObjectURL(visualizador.blobUrl);
    }
    setVisualizador(null);
  };

  const abrirNotaFiscalDespesa = async (despesaId: number) => {
    try {
      const r = await api<{
        descricao: string;
        comprovante_base64: string;
        comprovante_nome: string;
        comprovante_mime: string;
      }>('despesa_comprovante', { query: { id: despesaId } });
      if (!r.comprovante_base64) return;
      const { url, ehPdf } = criarBlobUrlDeBase64(r.comprovante_base64, r.comprovante_mime || 'application/pdf');
      setVisualizador({
        titulo: `Nota Fiscal / Comprovante — ${r.descricao || `#${despesaId}`}`,
        nomeArquivo: r.comprovante_nome || `comprovante_${despesaId}.${ehPdf ? 'pdf' : 'jpg'}`,
        blobUrl: url,
        ehPdf,
      });
    } catch (err) {
      setAviso({ tipo: 'erro', mensagem: err instanceof ErroApi ? err.message : 'Erro ao abrir comprovante.' });
    }
  };

  const anexarNfRapido = (despesaId: number, e: React.ChangeEvent<HTMLInputElement>) => {
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

  const avaliarDespesaConselho = async (despesaId: number, statusConselho: 'aprovada' | 'ressalva') => {
    let parecer = '';
    if (statusConselho === 'ressalva') {
      const p = window.prompt('Descreva a ressalva ou pedido de esclarecimento sobre esta despesa:', '');
      if (p === null) return;
      parecer = p;
    }
    setEnviando(true);
    try {
      const r = await api<{ mensagem: string }>('transparencia_conselho_avaliar', {
        corpo: {
          despesa_id: despesaId,
          status_conselho: statusConselho,
          parecer_conselho: parecer,
        },
      });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      await carregar();
    } catch (err) {
      setAviso({ tipo: 'erro', mensagem: err instanceof ErroApi ? err.message : 'Erro ao avaliar despesa.' });
    } finally {
      setEnviando(false);
    }
  };

  const homologarPastaMes = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      const r = await api<{ mensagem: string }>('transparencia_fechar_pasta_mes', {
        corpo: {
          competencia,
          status_pasta: statusPasta,
          parecer_texto: parecerTexto,
        },
      });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      setModalParecer(false);
      await carregar();
    } catch (err) {
      setAviso({ tipo: 'erro', mensagem: err instanceof ErroApi ? err.message : 'Erro ao homologar pasta.' });
    } finally {
      setEnviando(false);
    }
  };

  const selecionarArquivoDoc = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setArqDocBase64(String(reader.result || ''));
      setArqDocNome(f.name);
    };
    reader.readAsDataURL(f);
  };

  const salvarDocumentoCondominio = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      const r = await api<{ mensagem: string }>('documento_condominio_salvar', {
        corpo: {
          categoria: catDoc,
          titulo: tituloDoc,
          descricao: descDoc,
          arquivo_base64: arqDocBase64 || undefined,
          nome_arquivo: arqDocNome || undefined,
        },
      });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      setModalNovoDoc(false);
      setTituloDoc('');
      setDescDoc('');
      setArqDocBase64('');
      setArqDocNome('');
      await carregar();
    } catch (err) {
      setAviso({ tipo: 'erro', mensagem: err instanceof ErroApi ? err.message : 'Erro ao publicar documento.' });
    } finally {
      setEnviando(false);
    }
  };

  const abrirArquivoDoc = async (id: number) => {
    try {
      const r = await api<{
        documento: { arquivo_base64: string; titulo: string; mime_type?: string; nome_arquivo?: string };
      }>('documento_condominio_abrir', {
        query: { id },
      });
      const b64 = r.documento?.arquivo_base64;
      if (!b64) return;
      const { url, ehPdf } = criarBlobUrlDeBase64(b64, r.documento.mime_type || 'application/pdf');
      setVisualizador({
        titulo: r.documento.titulo,
        nomeArquivo: r.documento.nome_arquivo || `documento_${id}.${ehPdf ? 'pdf' : 'jpg'}`,
        blobUrl: url,
        ehPdf,
      });
    } catch (err) {
      setAviso({ tipo: 'erro', mensagem: err instanceof ErroApi ? err.message : 'Erro ao abrir documento.' });
    }
  };

  const excluirDoc = async (id: number, titulo: string) => {
    if (!window.confirm(`Remover "${titulo}" da Biblioteca do Condomínio?`)) return;
    setEnviando(true);
    try {
      const r = await api<{ mensagem: string }>('documento_condominio_excluir', { corpo: { id } });
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
      await carregar();
    } catch (err) {
      setAviso({ tipo: 'erro', mensagem: err instanceof ErroApi ? err.message : 'Erro ao excluir documento.' });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Cabeçalho */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-lg sm:text-xl font-black text-slate-900">
            <FileCheck2 size={22} className="text-emerald-600" />
            Portal da Transparência — Prestação de Contas, Notas Fiscais &amp; Documentos
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            Acompanhe em tempo real o balancete mensal do condomínio, visualize as Notas Fiscais anexadas a cada despesa, o Parecer do Conselho Fiscal e a Biblioteca Oficial (Convenção, Regimento e Atas).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Printer size={15} /> Imprimir Balancete
          </button>
          {ehGestao && aba === 'balancete' && (
            <button
              type="button"
              onClick={() => setModalParecer(true)}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm flex items-center gap-1.5 shadow cursor-pointer"
            >
              <ShieldCheck size={16} /> Emitir Parecer da Pasta Mensal
            </button>
          )}
          {ehGestao && aba === 'documentos' && (
            <button
              type="button"
              onClick={() => setModalNovoDoc(true)}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs sm:text-sm flex items-center gap-1.5 shadow cursor-pointer"
            >
              <Plus size={16} /> Publicar Documento Oficial
            </button>
          )}
        </div>
      </div>

      {/* Navegação de Abas e Seletor de Mês */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAba('balancete')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold border transition cursor-pointer flex items-center gap-1.5 ${
              aba === 'balancete'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <FileCheck2 size={15} /> Balancete Mensal &amp; Notas Fiscais
          </button>
          <button
            type="button"
            onClick={() => setAba('documentos')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold border transition cursor-pointer flex items-center gap-1.5 ${
              aba === 'documentos'
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <BookOpen size={15} /> Convenção, Regimento &amp; Atas ({documentos.length})
          </button>
        </div>

        {aba === 'balancete' && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold uppercase text-slate-500">Mês de Referência:</span>
            <input
              type="month"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-extrabold bg-white text-slate-900"
            />
          </div>
        )}
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

      {carregando ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
          Carregando Portal da Transparência...
        </div>
      ) : aba === 'balancete' ? (
        <div className="space-y-6">
          {/* Card Parecer Oficial do Conselho Fiscal (se já homologado) */}
          {pastaMensal && (
            <div className="bg-emerald-50 border-2 border-emerald-400 rounded-2xl p-5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-0.5 rounded-full text-xs font-extrabold bg-emerald-600 text-white">
                    ✅ PASTA DE PRESTAÇÃO DE CONTAS HOMOLOGADA ({pastaMensal.competencia})
                  </span>
                  <span className="font-mono text-xs font-bold text-emerald-900">
                    Protocolo: {pastaMensal.protocolo_fechamento}
                  </span>
                </div>
                <span className="text-xs text-emerald-800 font-semibold">
                  Assinado digitalmente por: <b>{pastaMensal.aprovado_por_nome}</b> • SHA-256:{' '}
                  <code className="font-mono">{pastaMensal.hash_fechamento}</code>
                </span>
              </div>
              <p className="text-xs sm:text-sm text-emerald-950 leading-relaxed">{pastaMensal.parecer_texto}</p>
            </div>
          )}

          {/* Termômetro Mensal de Transparência */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="p-4 rounded-2xl bg-white border border-slate-200">
              <div className="text-xs font-extrabold uppercase text-emerald-700 flex items-center gap-1.5">
                <ArrowUpCircle size={14} /> Receitas Arrecadadas ({competencia})
              </div>
              <div className="text-xl sm:text-2xl font-black text-emerald-700 mt-1">
                {fMoeda(resumoMes.receitas_recebidas_mes)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {resumoMes.qtd_unidades_pagas} de {resumoMes.total_faturas_mes} faturas quitadas no mês
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200">
              <div className="text-xs font-extrabold uppercase text-rose-700 flex items-center gap-1.5">
                <ArrowDownCircle size={14} /> Despesas Pagas ({competencia})
              </div>
              <div className="text-xl sm:text-2xl font-black text-rose-700 mt-1">
                {fMoeda(resumoMes.despesas_pagas_mes)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {resumoMes.qtd_despesas_com_nf} com NF • {resumoMes.qtd_despesas_auditadas} auditadas pelo Conselho
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200">
              <div className="text-xs font-extrabold uppercase text-indigo-700 flex items-center gap-1.5">
                <ShieldCheck size={14} /> Resultado Líquido do Mês
              </div>
              <div
                className={`text-xl sm:text-2xl font-black mt-1 ${
                  resumoMes.resultado_liquido_mes >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {fMoeda(resumoMes.resultado_liquido_mes)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Receitas Recebidas − Despesas Pagas</div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200">
              <div className="text-xs font-extrabold uppercase text-blue-700 flex items-center gap-1.5">
                <Building2 size={14} /> Saldo Global em Caixa
              </div>
              <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
                {fMoeda(resumoMes.saldo_global_caixa)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Em aberto no mês (LGPD): {fMoeda(resumoMes.receitas_em_aberto_mes)}
              </div>
            </div>
          </div>

          {/* Resumo por Categoria Contábil */}
          {porCategoria.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
              <div className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                📊 Resumo de Despesas por Conta Contábil ({competencia})
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                {porCategoria.map((c, idx) => (
                  <div key={idx} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex justify-between items-center">
                    <div>
                      <span className="font-mono text-[11px] font-bold text-slate-500">{c.conta}</span>
                      <div className="text-xs font-extrabold text-slate-900">{c.categoria}</div>
                      <div className="text-[11px] text-slate-500">{c.qtd} lançamento(s)</div>
                    </div>
                    <div className="text-sm font-black text-slate-900">{fMoeda(c.total)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Balancete Analítico com Comprovantes Clicáveis e Auditoria do Conselho */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-extrabold text-slate-900">
                🧾 Demonstrativo Analítico de Despesas, Notas Fiscais &amp; Auditoria do Conselho ({competencia})
              </h3>
              <span className="text-xs text-slate-500">
                Clique em <b>&quot;📎 Ver Nota Fiscal&quot;</b> para conferir o documento original de cada despesa.
              </span>
            </div>

            {despesasMes.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm">
                Nenhuma despesa registrada na competência {competencia}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs font-extrabold uppercase text-slate-500">
                      <th className="py-3 px-3">Data / Conta</th>
                      <th className="py-3 px-3">Descrição &amp; Fornecedor</th>
                      <th className="py-3 px-3">Valor</th>
                      <th className="py-3 px-3">Nota Fiscal / Comprovante</th>
                      <th className="py-3 px-3">Auditoria Conselho Fiscal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {despesasMes.map((d) => (
                      <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-3">
                          <div className="text-xs font-bold text-slate-800">
                            {new Date(`${d.vencimento}T12:00:00`).toLocaleDateString('pt-BR')}
                          </div>
                          <span className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                            {d.conta_contabil}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-extrabold text-slate-900">{d.descricao}</div>
                          <div className="text-xs text-slate-500">
                            {d.categoria} {d.fornecedor_nome ? `• Forn.: ${d.fornecedor_nome}` : ''}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-extrabold text-slate-900">{fMoeda(d.valor)}</td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            {d.tem_comprovante ? (
                              <button
                                type="button"
                                onClick={() => void abrirNotaFiscalDespesa(d.id)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-extrabold cursor-pointer"
                              >
                                <Eye size={13} /> 📎 Ver Nota Fiscal
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Sem anexo</span>
                            )}

                            {ehGestao && (
                              <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer">
                                <Upload size={12} /> {d.tem_comprovante ? 'Trocar NF' : 'Anexar NF'}
                                <input
                                  type="file"
                                  accept="application/pdf,image/*"
                                  onChange={(e) => anexarNfRapido(d.id, e)}
                                  className="hidden"
                                />
                              </label>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {d.status_conselho === 'aprovada' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-extrabold">
                                <CheckCircle2 size={13} /> Aprovada pelo Conselho
                                {d.conselheiro_nome ? ` (${d.conselheiro_nome})` : ''}
                              </span>
                            ) : d.status_conselho === 'ressalva' ? (
                              <span
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-extrabold"
                                title={d.parecer_conselho || ''}
                              >
                                <AlertTriangle size={13} /> Ressalva: {d.parecer_conselho || 'Em verificação'}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400 font-semibold">⏳ Aguardando conferência</span>
                            )}

                            {ehGestao && d.status_conselho !== 'aprovada' && (
                              <div className="inline-flex gap-1">
                                <button
                                  type="button"
                                  disabled={enviando}
                                  onClick={() => void avaliarDespesaConselho(d.id, 'aprovada')}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold cursor-pointer"
                                >
                                  Aprovar Conta
                                </button>
                                <button
                                  type="button"
                                  disabled={enviando}
                                  onClick={() => void avaliarDespesaConselho(d.id, 'ressalva')}
                                  className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold cursor-pointer"
                                >
                                  Ressalva
                                </button>
                              </div>
                            )}
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
        /* ABA 2: BIBLIOTECA DIGITAL DE DOCUMENTOS DO CONDOMÍNIO */
        <div className="space-y-4">
          {documentos.map((doc) => (
            <div key={doc.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-indigo-100 text-indigo-800">
                    {CATEGORIAS_DOCS[doc.categoria] || doc.categoria}
                  </span>
                  <h3 className="text-base font-extrabold text-slate-900 mt-1">{doc.titulo}</h3>
                  <div className="text-xs text-slate-400">
                    Publicado por {doc.criado_por_nome || 'Administração'} em{' '}
                    {new Date(doc.criado_em).toLocaleDateString('pt-BR')}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {doc.tem_arquivo && (
                    <button
                      type="button"
                      onClick={() => void abrirArquivoDoc(doc.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold cursor-pointer"
                    >
                      <FileText size={14} /> Abrir PDF / Anexo
                    </button>
                  )}
                  {ehGestao && (
                    <button
                      type="button"
                      onClick={() => void excluirDoc(doc.id, doc.titulo)}
                      className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 cursor-pointer"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>

              {doc.descricao && (
                <div className="text-xs sm:text-sm text-slate-700 whitespace-pre-line bg-slate-50 p-4 rounded-xl border border-slate-100 leading-relaxed">
                  {doc.descricao}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal Emitir Parecer da Pasta Mensal */}
      {modalParecer && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalParecer(false);
          }}
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border-t-4 border-t-emerald-600 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-slate-900">
                ✅ Homologar Pasta de Prestação de Contas ({competencia})
              </h3>
              <button
                type="button"
                onClick={() => setModalParecer(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={homologarPastaMes} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStatusPasta('aprovada')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-extrabold border cursor-pointer ${
                    statusPasta === 'aprovada'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  ✅ Aprovada Sem Ressalvas
                </button>
                <button
                  type="button"
                  onClick={() => setStatusPasta('ressalva')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-extrabold border cursor-pointer ${
                    statusPasta === 'ressalva'
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  ⚠️ Aprovada Com Ressalvas
                </button>
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Parecer Oficial do Conselho Fiscal &amp; Administração
                </label>
                <textarea
                  rows={4}
                  value={parecerTexto}
                  onChange={(e) => setParecerTexto(e.target.value)}
                  placeholder="Deixe em branco para gerar automaticamente o texto padrão de aprovação..."
                  className={entrada}
                />
              </div>

              <button
                type="submit"
                disabled={enviando}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm cursor-pointer"
              >
                {enviando ? 'Assinando Digitalmente...' : '🛡️ Homologar & Publicar Parecer SHA-256'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Publicar Novo Documento Institucional */}
      {modalNovoDoc && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalNovoDoc(false);
          }}
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border-t-4 border-t-indigo-600 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-slate-900">
                📚 Publicar Documento na Biblioteca do Condomínio
              </h3>
              <button
                type="button"
                onClick={() => setModalNovoDoc(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={salvarDocumentoCondominio} className="space-y-3.5">
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">Categoria *</label>
                <select value={catDoc} onChange={(e) => setCatDoc(e.target.value)} className={entrada}>
                  {Object.entries(CATEGORIAS_DOCS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">Título *</label>
                <input
                  required
                  value={tituloDoc}
                  onChange={(e) => setTituloDoc(e.target.value)}
                  placeholder="Ex: Ata da Assembleia Geral Ordinária 2026"
                  className={entrada}
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Resumo / Texto Integral do Documento
                </label>
                <textarea
                  rows={4}
                  value={descDoc}
                  onChange={(e) => setDescDoc(e.target.value)}
                  placeholder="Escreva o conteúdo ou resumo para leitura direta pelo morador..."
                  className={entrada}
                />
              </div>

              <div>
                <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-extrabold cursor-pointer">
                  <Upload size={14} />
                  {arqDocNome ? `Arquivo Anexado: ${arqDocNome}` : 'Anexar PDF / Imagem Oficial (Opcional)'}
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={selecionarArquivoDoc}
                    className="hidden"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={enviando}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm cursor-pointer"
              >
                {enviando ? 'Publicando...' : '📲 Publicar para Todos os Moradores'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Visualizador de Nota Fiscal / Documento Oficial */}
      {visualizador && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) fecharVisualizador();
          }}
        >
          <div className="bg-white rounded-3xl max-w-4xl w-full h-[88vh] flex flex-col overflow-hidden shadow-2xl border-t-4 border-t-indigo-600">
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="font-extrabold text-slate-900 text-sm truncate max-w-xl">{visualizador.titulo}</div>
              <div className="flex items-center gap-2">
                <a
                  href={visualizador.blobUrl}
                  download={visualizador.nomeArquivo}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold"
                >
                  ⬇️ Baixar Arquivo
                </a>
                <a
                  href={visualizador.blobUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-extrabold"
                >
                  ↗ Nova Guia
                </a>
                <button
                  type="button"
                  onClick={fecharVisualizador}
                  className="w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 flex items-center justify-center cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-900 flex items-center justify-center overflow-auto">
              {visualizador.ehPdf ? (
                <iframe src={visualizador.blobUrl} title={visualizador.titulo} className="w-full h-full border-0 bg-white" />
              ) : (
                <img src={visualizador.blobUrl} alt={visualizador.titulo} className="max-w-full max-h-full object-contain p-4" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
