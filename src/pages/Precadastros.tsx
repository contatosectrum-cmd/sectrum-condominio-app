import { useCallback, useEffect, useState } from 'react';
import {
  Clock, CheckCircle, XCircle, Link2, Pencil, Check, X, Trash2, Phone, Users,
  CalendarDays, Save, ShieldCheck, ShieldAlert, Bot, Sparkles, FolderOpen,
  FileText, Send, RefreshCw, Eye, Camera,
} from 'lucide-react';
import { api, ErroApi, origemPublica } from '../lib/api';
import { Modal } from './moradores/AcoesMorador';
import FotoUsuario from '../components/FotoUsuario';
import ValidadorCpf from '../components/ValidadorCpf';
import ModalDocumentosCadastro, {
  abrirDocumentoProtegido,
  classesFaixaBiometria,
  type DocumentoCadastro,
} from '../components/ModalDocumentosCadastro';
import { validarCpfModulo11, regiaoFiscalCpf } from '../lib/cpf';
import { obterToken } from '../lib/sessao';
import { useSessao } from '../lib/useSessao';

// Paridade com src/views/precadastros.php + Triagem Documental Autônoma via IA (WhatsApp Oficial Meta + Qwen 2.5)
// e Pasta de Documentos exclusiva para Gestão (Superadmin, Admin e Síndico).

type Aba = 'aguardando' | 'aprovados' | 'rejeitados' | 'links';
type FiltroRapidoIa = 'todos' | 'concluido_ia' | 'em_andamento_ia' | 'nao_consta';

interface PendenciaIa {
  codigo: string;
  rotulo: string;
  tipo_esperado: string;
  categoria_doc?: string | null;
  instrucao?: string;
  concluido: boolean;
  concluido_em?: string | null;
  detalhe_retorno?: string | null;
}

interface MensagemIaPrecad {
  id: number;
  direcao: 'in' | 'out';
  origem: string;
  conteudo: string;
  status_envio: string;
  midia_url?: string | null;
  midia_tipo?: string | null;
  hora_fmt: string;
}

interface Pre {
  id: number;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  relacao: string | null;
  unidade_info: string | null;
  bloco_id: number | null;
  unidade_numero: string | null;
  tipo: string | null;
  consta_lista: boolean | number;
  placa1: string | null;
  marca1: string | null;
  modelo1: string | null;
  cor1: string | null;
  tipo_veiculo1: string | null;
  vaga_garagem1: string | null;
  placa2: string | null;
  marca2: string | null;
  modelo2: string | null;
  cor2: string | null;
  tipo_veiculo2: string | null;
  vaga_garagem2: string | null;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  criado_em: string;
  tem_foto: boolean;
  tem_documento: boolean;
  cpf_valido?: boolean;
  cpf_regiao?: string;
  cpf_situacao_receita?: string | null;
  cpf_nome_receita?: string | null;
  vagas_limite?: number;
  vagas_ocupadas?: number;
  vagas_conflito?: boolean;
  documentos?: DocumentoCadastro[];
  ia_triagem_status?: 'nenhum' | 'aguardando_morador' | 'em_conversa_ia' | 'concluido_ia' | string;
  ia_pendencias?: PendenciaIa[];
  ia_resumo_retorno?: string | null;
  ia_atualizado_em?: string | null;
  nomes_planilha_unidade?: string[];
  biometria?: { faixa: string; faixa_rotulo: string; similaridade_pct: number | null; mensagem: string; criado_em: string } | null;
}

interface LinkPre {
  id: number;
  token: string;
  perfil: string | null;
  tipo: string | null;
  unidade_info: string | null;
  expira_em: string | null;
  permite_segundo: number;
  usos: number;
}

interface Resposta {
  totais: { pendente: number; aprovado: number; rejeitado: number };
  paginas: number;
  p: number;
  limite: number;
  limite_veiculos_padrao?: number;
  registros: Pre[];
  links: LinkPre[];
  blocos: { id: number; nome: string }[];
}

interface Aviso {
  tipo: 'ok' | 'aviso' | 'erro';
  mensagem: string;
}

const OPCOES_CHECKS_IA: { codigo: string; rotulo: string; dica: string }[] = [
  {
    codigo: 'contrato_locacao',
    rotulo: '📄 Contrato de Locação',
    dica: 'IA pede PDF/foto do contrato e já vincula na pasta de documentos',
  },
  {
    codigo: 'confirmar_vinculo',
    rotulo: '🔍 Explicar Vínculo (Não consta na planilha)',
    dica: 'IA pergunta se é novo proprietário, inquilino ou familiar do titular',
  },
  {
    codigo: 'autorizacao_proprietario',
    rotulo: '✍️ Autorização do Proprietário',
    dica: 'IA solicita documento/autorização assinada pelo proprietário',
  },
  {
    codigo: 'escritura_imovel',
    rotulo: '🏠 Escritura / Compra e Venda',
    dica: 'Para quem comprou o imóvel recentemente e não consta na planilha',
  },
  {
    codigo: 'nova_selfie',
    rotulo: '🙂 Nova Selfie Facial Nítida',
    dica: 'IA pede selfie clara de frente e atualiza a foto do cadastro sozinha',
  },
  {
    codigo: 'documento_pessoal',
    rotulo: '🪪 Documento com CPF (RG / CNH)',
    dica: 'IA pede foto/PDF do documento oficial e anexa na ficha',
  },
  {
    codigo: 'confirmar_veiculo',
    rotulo: '🚗 Confirmar Placa / Veículo (ou CRLV)',
    dica: 'IA confirma modelo/placa ou solicita o CRLV do veículo',
  },
];

const fmtCpf = (c: string | null) =>
  c ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9, 11)}` : '-';
const fmtData = (s: string | null, hora = false) =>
  s
    ? new Date(s.replace(' ', 'T'))
        .toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          ...(hora ? { hour: '2-digit', minute: '2-digit' } : {}),
        })
        .replace(',', '')
    : '?';
const icone = (t: string | null) => (t === 'Moto' ? '🏍️' : '🚗');
const msgErro = (e: unknown) => (e instanceof ErroApi ? e.message : 'Erro inesperado.');
const linkUrl = (token: string) => `${origemPublica()}/?acao=precadastro_externo&t=${token}`;
const CORES = {
  ok: 'bg-emerald-50 border-emerald-500 text-emerald-800',
  aviso: 'bg-amber-50 border-amber-500 text-amber-800',
  erro: 'bg-rose-50 border-rose-500 text-rose-800',
};
const campo =
  'w-full px-3 py-2.5 border border-slate-300 rounded-lg outline-none focus:border-blue-500 bg-white text-sm';
const th =
  'text-left text-[0.72rem] font-extrabold uppercase tracking-wide text-slate-500 px-4 py-3 border-b border-slate-200';
const td = 'px-4 py-3 border-b border-slate-100 text-sm';

const BadgeTemporada = () => (
  <span className="bg-cyan-100 text-cyan-700 px-2.5 py-0.5 rounded-full text-[0.72em] font-bold inline-flex items-center gap-1">
    <CalendarDays size={10} /> Temporada
  </span>
);

const rotuloRelacao = (r: string | null) => {
  if (r === 'Conjuge') return 'Cônjuge / Esposo(a)';
  if (r === 'Dependente') return 'Filho(a) / Dependente';
  if (r === 'Inquilino') return 'Inquilino(a)';
  if (r === 'Titular') return 'Proprietário(a) / Titular';
  return r || 'Titular';
};

export default function Precadastros() {
  const { usuario } = useSessao();
  const ehGestao =
    usuario?.perfil === 'superadmin' || usuario?.perfil === 'admin' || usuario?.perfil === 'sindico';

  const [aba, setAba] = useState<Aba>('aguardando');
  const [filtros, setFiltros] = useState({ q: '', ordem: 'recentes', limite: 50, p: 1 });
  const [filtroIa, setFiltroIa] = useState<FiltroRapidoIa>('todos');
  const [busca, setBusca] = useState('');
  const [dados, setDados] = useState<Resposta | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [editando, setEditando] = useState<Pre | null>(null);
  const [ampliar, setAmpliar] = useState<string | null>(null);
  const [cardIaAbertoId, setCardIaAbertoId] = useState<number | null>(null);
  const [modalDocsPre, setModalDocsPre] = useState<Pre | null>(null);
  const [versaoFoto, setVersaoFoto] = useState(0);

  const carregar = useCallback(async (silencioso = false) => {
    try {
      setDados(await api<Resposta>('precadastros_listar', { query: { tab: aba, ...filtros } }));
    } catch (e) {
      if (!silencioso) setAviso({ tipo: 'erro', mensagem: msgErro(e) });
    }
  }, [aba, filtros]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Atualização suave em segundo plano na aba Aguardando quando há triagens da IA em andamento
  useEffect(() => {
    if (!ehGestao || aba !== 'aguardando') return;
    const t = window.setInterval(() => {
      void carregar(true);
    }, 10000);
    return () => window.clearInterval(t);
  }, [ehGestao, aba, carregar]);

  const executar = async (rota: string, corpo: Record<string, unknown>, depois?: () => void) => {
    setOcupado(true);
    try {
      const r = await api<{
        tipo?: 'ok' | 'aviso';
        mensagem: string;
        hardware?: { modo: string; comandos: unknown[] };
      }>(rota, { corpo });
      const sim =
        r.hardware?.modo === 'simulado' && r.hardware.comandos.length
          ? ` [modo SIMULADO: ${r.hardware.comandos.length} envio(s) às catracas registrados, nada saiu para a rede]`
          : '';
      setAviso({ tipo: r.tipo ?? 'ok', mensagem: r.mensagem + sim });
      depois?.();
      await carregar();
    } catch (e) {
      const m = msgErro(e);
      if (rota === 'precadastro_aprovar' && m.startsWith('LIMITE_VAGAS:')) {
        const detalhe = m.replace(/^LIMITE_VAGAS:\s*/, '');
        setOcupado(false);
        if (
          window.confirm(
            `${detalhe}\n\nDeseja aprovar apenas o cadastro pessoal/facial deste morador SEM cadastrar o veículo excedente?`,
          )
        ) {
          await executar(rota, { ...corpo, sem_veiculos: 1 }, depois);
        }
        return;
      }
      setAviso({ tipo: 'erro', mensagem: m.replace(/^LIMITE_VAGAS:\s*/, '') });
    } finally {
      setOcupado(false);
      document.querySelector('main .overflow-auto')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const abrirImagem = async (rota: string) => {
    const r = await fetch(`/api.php?route=${rota}`, {
      headers: { Authorization: `Bearer ${obterToken() ?? ''}` },
    });
    if (r.ok) setAmpliar(URL.createObjectURL(await r.blob()));
  };

  const trocarAba = (a: Aba) => {
    setAba(a);
    setCardIaAbertoId(null);
    setFiltros({ ...filtros, p: 1 });
  };

  const totais = dados?.totais ?? { pendente: 0, aprovado: 0, rejeitado: 0 };
  const regsBrutos = dados?.registros ?? [];
  const contaCpf = regsBrutos.reduce<Record<string, number>>((m, p) => {
    if (p.cpf) m[p.cpf] = (m[p.cpf] ?? 0) + 1;
    return m;
  }, {});

  const qtdConcluidosIa = regsBrutos.filter((p) => p.ia_triagem_status === 'concluido_ia').length;
  const qtdEmAndamentoIa = regsBrutos.filter(
    (p) => p.ia_triagem_status === 'aguardando_morador' || p.ia_triagem_status === 'em_conversa_ia',
  ).length;
  const qtdNaoConsta = regsBrutos.filter((p) => !Number(p.consta_lista)).length;

  const regs =
    aba === 'aguardando' && ehGestao
      ? regsBrutos.filter((p) => {
          if (filtroIa === 'concluido_ia') return p.ia_triagem_status === 'concluido_ia';
          if (filtroIa === 'em_andamento_ia')
            return p.ia_triagem_status === 'aguardando_morador' || p.ia_triagem_status === 'em_conversa_ia';
          if (filtroIa === 'nao_consta') return !Number(p.consta_lista);
          return true;
        })
      : regsBrutos;

  const ABAS: [Aba, string, React.ReactNode, number][] = [
    ['aguardando', 'Aguardando', <Clock size={14} />, totais.pendente],
    ['aprovados', 'Aprovados', <CheckCircle size={14} />, totais.aprovado],
    ['rejeitados', 'Rejeitados', <XCircle size={14} />, totais.rejeitado],
    ['links', 'Links', <Link2 size={14} />, dados?.links.length ?? 0],
  ];

  const paginacao = dados && dados.paginas > 1 && (
    <div className="flex justify-center gap-1.5 mt-5 items-center">
      {filtros.p > 1 && (
        <button
          onClick={() => setFiltros({ ...filtros, p: filtros.p - 1 })}
          className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-600"
        >
          « Anterior
        </button>
      )}
      <span className="px-2.5 text-sm text-slate-500">
        Página <b>{filtros.p}</b> de {dados.paginas}
      </span>
      {filtros.p < dados.paginas && (
        <button
          onClick={() => setFiltros({ ...filtros, p: filtros.p + 1 })}
          className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-600"
        >
          Próxima »
        </button>
      )}
    </div>
  );

  const colunasTabela =
    aba === 'aprovados'
      ? ehGestao
        ? ['Nome', 'Tipo', 'CPF / Validação', 'Unidade', 'Placa(s)', 'Documentos', 'Data', 'WhatsApp']
        : ['Nome', 'Tipo', 'CPF / Validação', 'Unidade', 'Placa(s)', 'Data', 'WhatsApp']
      : ['Nome', 'Tipo', 'CPF / Validação', 'Placa(s)', 'Data'];

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8 space-y-5">
      {aviso && (
        <div
          className={`border-l-4 px-4 py-3 rounded-lg text-sm font-semibold flex justify-between gap-3 ${CORES[aviso.tipo]}`}
        >
          <span>{aviso.mensagem}</span>
          <button onClick={() => setAviso(null)} aria-label="Fechar aviso">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {ABAS.map(([id, rot, ic, n]) => (
          <button
            key={id}
            onClick={() => trocarAba(id)}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold border ${
              aba === id
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {ic} {rot}
            {n > 0 && (
              <span className="bg-red-500 text-white text-[0.65em] px-1.5 py-0.5 rounded-full font-bold ml-1">
                {n}
              </span>
            )}
          </button>
        ))}
      </div>

      {aba !== 'links' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setFiltros({ ...filtros, q: busca, p: 1 });
          }}
          className="flex gap-2.5 flex-wrap items-center bg-white p-3 rounded-xl shadow-sm"
        >
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, CPF ou unidade..."
            className="flex-1 min-w-[200px] px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
          <select
            value={filtros.ordem}
            onChange={(e) => setFiltros({ ...filtros, ordem: e.target.value, p: 1 })}
            className="px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-sm"
          >
            <option value="recentes">Mais Recentes</option>
            <option value="antigos">Mais Antigos</option>
            <option value="az">Ordem Alfabética (A-Z)</option>
            <option value="za">Ordem Alfabética (Z-A)</option>
          </select>
          <select
            value={filtros.limite}
            onChange={(e) => setFiltros({ ...filtros, limite: Number(e.target.value), p: 1 })}
            className="px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-sm"
          >
            <option value={20}>20 por página</option>
            <option value={50}>50 por página</option>
            <option value={100}>100 por página</option>
          </select>
          <button className="px-4 py-2 rounded-lg border border-slate-300 bg-white font-bold text-sm">
            Filtrar
          </button>
        </form>
      )}

      {aba === 'aguardando' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
              <Clock size={18} /> Pré-cadastros Aguardando Aprovação
            </div>

            {ehGestao && regsBrutos.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setFiltroIa('todos')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold border cursor-pointer transition ${
                    filtroIa === 'todos'
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Todos ({regsBrutos.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroIa('concluido_ia')}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-extrabold border cursor-pointer transition ${
                    filtroIa === 'concluido_ia'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  <Sparkles size={12} /> Prontos pela IA ({qtdConcluidosIa})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroIa('em_andamento_ia')}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-extrabold border cursor-pointer transition ${
                    filtroIa === 'em_andamento_ia'
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-violet-50 text-violet-800 border-violet-200 hover:bg-violet-100'
                  }`}
                >
                  <Bot size={12} /> Em Coleta IA ({qtdEmAndamentoIa})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroIa('nao_consta')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold border cursor-pointer transition ${
                    filtroIa === 'nao_consta'
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  ⚠ Não Consta ({qtdNaoConsta})
                </button>
              </div>
            )}
          </div>

          {regs.length === 0 ? (
            <div className="text-center text-slate-400 py-12">
              <CheckCircle size={36} className="mx-auto mb-2" strokeWidth={1.5} />
              {filtroIa !== 'todos'
                ? 'Nenhum pré-cadastro neste filtro no momento.'
                : 'Nenhum pré-cadastro pendente. Tudo em dia!'}
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              {regs.map((p) => {
                const temp = p.tipo === 'temporada';
                const dup = !!p.cpf && (contaCpf[p.cpf] ?? 1) > 1;
                const consta = !!Number(p.consta_lista);
                const cpfOk = p.cpf_valido ?? (p.cpf ? validarCpfModulo11(p.cpf) : false);
                const ufCpf = p.cpf_regiao || (p.cpf && cpfOk ? regiaoFiscalCpf(p.cpf) : '');
                const stIa = p.ia_triagem_status ?? 'nenhum';
                const docs = p.documentos ?? [];
                const painelAberto = cardIaAbertoId === p.id;

                const cor = !cpfOk
                  ? 'border-rose-500 bg-rose-50/60'
                  : dup
                    ? 'border-red-500 bg-red-50'
                    : stIa === 'concluido_ia'
                      ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-200'
                      : stIa === 'aguardando_morador' || stIa === 'em_conversa_ia'
                        ? 'border-violet-400 bg-violet-50/25'
                        : temp
                          ? 'border-cyan-600 bg-cyan-50/40'
                          : consta
                            ? 'border-emerald-500 bg-green-50'
                            : 'border-slate-200 bg-white';

                return (
                  <div key={p.id} className={`rounded-2xl p-4 relative border-2 transition ${cor}`}>
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
                      {dup && (
                        <span className="bg-red-50 text-red-700 px-2.5 py-0.5 rounded-full text-[0.72em] font-extrabold border border-red-200">
                          ⚠️ Duplicado ({contaCpf[p.cpf!]} envios)
                        </span>
                      )}
                      {temp && <BadgeTemporada />}
                      {consta ? (
                        <span className="bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full text-[0.72em] font-bold">
                          ✓ Na Planilha
                        </span>
                      ) : (
                        <span className="bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full text-[0.72em] font-bold">
                          ⚠ Não Consta
                        </span>
                      )}
                      {ehGestao && stIa === 'concluido_ia' && (
                        <span className="bg-emerald-600 text-white px-2.5 py-0.5 rounded-full text-[0.72em] font-extrabold shadow-2xs inline-flex items-center gap-1">
                          <Sparkles size={11} /> Triagem IA Concluída!
                        </span>
                      )}
                      {ehGestao && (stIa === 'aguardando_morador' || stIa === 'em_conversa_ia') && (
                        <span className="bg-violet-600 text-white px-2.5 py-0.5 rounded-full text-[0.72em] font-extrabold inline-flex items-center gap-1">
                          <Bot size={11} /> IA Aguardando Retorno
                        </span>
                      )}
                    </div>

                    <div className="flex gap-3.5 items-start">
                      <button
                        type="button"
                        onClick={() =>
                          p.tem_foto &&
                          abrirImagem(
                            `foto_registro&tipo=precadastro&id=${p.id}&v=${versaoFoto}_${encodeURIComponent(p.ia_atualizado_em || '')}`,
                          )
                        }
                        title="Ampliar foto facial"
                      >
                        <FotoUsuario
                          rota={`foto_registro&tipo=precadastro&id=${p.id}&v=${versaoFoto}_${encodeURIComponent(p.ia_atualizado_em || '')}`}
                          temFoto={p.tem_foto}
                          tamanho={70}
                          redonda
                        />
                      </button>

                      <div className="flex-1 min-w-0 sm:pr-40">
                        <div className="font-extrabold text-slate-900 mb-1 flex items-center gap-2 flex-wrap">
                          <span>{p.nome}</span>
                          {p.relacao === 'Inquilino' && (
                            <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 text-[0.72em] font-extrabold border border-blue-200">
                              🔑 Inquilino(a)
                            </span>
                          )}
                          {p.biometria && (
                            <span
                              className={`px-2 py-0.5 rounded-md text-[0.72em] font-extrabold border ${classesFaixaBiometria(p.biometria.faixa)}`}
                              title={`Selfie x Foto do Documento (IA): ${p.biometria.mensagem}`}
                            >
                              🪪 {p.biometria.faixa_rotulo}
                              {p.biometria.similaridade_pct !== null ? ` • ${p.biometria.similaridade_pct}%` : ''}
                            </span>
                          )}
                        </div>

                        <div className="text-[0.83em] text-slate-600 leading-relaxed">
                          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                            <span>
                              CPF: <b className="font-mono text-slate-800">{fmtCpf(p.cpf)}</b>
                            </span>
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
                            <b>{rotuloRelacao(p.relacao)}</b>
                            {p.unidade_info && (
                              <>
                                {' '}
                                · Unid: <b>{p.unidade_info}</b>
                              </>
                            )}
                            {p.telefone && (
                              <>
                                <br />
                                {p.telefone}
                              </>
                            )}
                            {temp && p.periodo_inicio && (
                              <>
                                <br />
                                <span className="text-cyan-600 font-semibold">
                                  📅 Período: {fmtData(p.periodo_inicio)} →{' '}
                                  {p.periodo_fim ? fmtData(p.periodo_fim) : '?'}
                                </span>
                              </>
                            )}
                          </div>

                          {/* Dica automática de quem consta na planilha desta unidade quando "Não Consta" */}
                          {ehGestao &&
                            !consta &&
                            (p.nomes_planilha_unidade?.length ?? 0) > 0 && (
                              <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-950 text-xs font-semibold">
                                <span>📋 Na planilha desta unidade consta:</span>
                                <b className="font-extrabold">
                                  {p.nomes_planilha_unidade!.join(', ')}
                                </b>
                              </div>
                            )}
                        </div>

                        {p.placa1 && (
                          <div className="flex gap-1.5 flex-wrap mt-2 items-center">
                            <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-mono text-sm font-bold">
                              {icone(p.tipo_veiculo1)} {p.placa1}
                            </span>
                            {(p.marca1 || p.modelo1) && (
                              <span className="text-xs text-slate-600">
                                {`${p.marca1 ?? ''} ${p.modelo1 ?? ''}`.trim()}
                                {p.cor1 ? ` · ${p.cor1}` : ''}
                              </span>
                            )}
                            {p.placa2 && (
                              <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-mono text-sm font-bold ml-2">
                                {icone(p.tipo_veiculo2)} {p.placa2}
                              </span>
                            )}
                            {p.placa2 && (p.marca2 || p.modelo2) && (
                              <span className="text-xs text-slate-600">
                                {`${p.marca2 ?? ''} ${p.modelo2 ?? ''}`.trim()}
                                {p.cor2 ? ` · ${p.cor2}` : ''}
                              </span>
                            )}
                          </div>
                        )}

                        {p.vagas_conflito && (
                          <div className="mt-2 bg-amber-100 border border-amber-300 text-amber-900 rounded-lg px-3 py-2 text-xs font-bold">
                            ⚠️ Limite de vagas atingido nesta unidade ({p.vagas_ocupadas ?? 0} de{' '}
                            {p.vagas_limite ?? 1} vaga(s) já ocupada(s)). Você pode aprovar apenas o
                            cadastro/facial sem o veículo excedente.
                          </div>
                        )}

                        {temp && p.tem_documento && (
                          <button
                            type="button"
                            onClick={() => abrirImagem(`foto_registro&tipo=precadastro&campo=documento&id=${p.id}`)}
                            className="mt-2 text-xs font-bold text-cyan-700 underline"
                          >
                            Documento Temporada: ver imagem
                          </button>
                        )}

                        {/* Documentos vinculados (Contrato de Locação, Escritura, RG/CNH...) - Visível apenas para Gestão */}
                        {ehGestao && docs.length > 0 && (
                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-extrabold text-slate-500 uppercase">
                              📂 Anexos:
                            </span>
                            {docs.map((d) => (
                              <button
                                key={d.id}
                                type="button"
                                onClick={() => {
                                  abrirDocumentoProtegido(d).catch((err) =>
                                    setAviso({
                                      tipo: 'erro',
                                      mensagem: err instanceof Error ? err.message : 'Erro ao abrir documento.',
                                    }),
                                  );
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 text-xs font-extrabold cursor-pointer transition"
                                title="Clique para abrir o documento"
                              >
                                <FileText size={12} className="text-blue-600" />
                                <span>{d.categoria_rotulo}</span>
                                {d.origem === 'whatsapp_ia' && (
                                  <span className="px-1 py-0.2 rounded bg-violet-200 text-violet-900 text-[9px]">
                                    IA
                                  </span>
                                )}
                                <Eye size={11} className="opacity-70" />
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Resumo automático da Triagem conduzida pela IA */}
                        {ehGestao && stIa !== 'nenhum' && (
                          <div
                            className={`mt-2.5 rounded-xl p-3 border text-xs ${
                              stIa === 'concluido_ia'
                                ? 'bg-emerald-100/80 border-emerald-400 text-emerald-950'
                                : 'bg-violet-50 border-violet-200 text-violet-950'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap font-extrabold mb-1">
                              <span className="inline-flex items-center gap-1.5">
                                {stIa === 'concluido_ia' ? (
                                  <>
                                    <Sparkles size={14} className="text-emerald-700" />
                                    ✅ Documentação / Informações Coletadas pela IA — Pronto para Aprovar!
                                  </>
                                ) : (
                                  <>
                                    <Bot size={14} className="text-violet-700" />
                                    🤖 Triagem Automática IA em andamento no WhatsApp
                                  </>
                                )}
                              </span>
                              <button
                                type="button"
                                onClick={() => setCardIaAbertoId(painelAberto ? null : p.id)}
                                className="underline text-[11px] cursor-pointer"
                              >
                                {painelAberto ? 'Ocultar conversa' : 'Ver conversa / detalhes →'}
                              </button>
                            </div>
                            {p.ia_resumo_retorno && (
                              <div className="font-semibold mb-1.5">💬 Resumo: {p.ia_resumo_retorno}</div>
                            )}
                            {(p.ia_pendencias?.length ?? 0) > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {p.ia_pendencias!.map((item) => (
                                  <span
                                    key={item.codigo}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[11px] border ${
                                      item.concluido
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                        : 'bg-white text-slate-700 border-slate-300'
                                    }`}
                                  >
                                    {item.concluido ? '✅' : '⏳'} {item.rotulo}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="text-[0.73em] text-slate-400 mt-1.5">
                          Enviado em: {fmtData(p.criado_em, true)}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-3 pt-2.5 border-t border-slate-100 justify-end flex-wrap">
                      {ehGestao && (
                        <>
                          <button
                            type="button"
                            onClick={() => setModalDocsPre(p)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 cursor-pointer"
                          >
                            <FolderOpen size={14} /> Documentos{docs.length > 0 ? ` (${docs.length})` : ''}
                          </button>

                          {p.telefone && (
                            <button
                              type="button"
                              onClick={() => setCardIaAbertoId(painelAberto ? null : p.id)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold border cursor-pointer transition ${
                                painelAberto
                                  ? 'bg-violet-700 text-white border-violet-700'
                                  : 'bg-violet-50 hover:bg-violet-100 text-violet-900 border-violet-300'
                              }`}
                            >
                              <Bot size={14} />
                              {stIa === 'nenhum' ? 'Solicitar Info c/ IA' : 'Acompanhar IA / Checks'}
                            </button>
                          )}
                        </>
                      )}

                      <button
                        onClick={() => setEditando(p)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-300 text-slate-700 cursor-pointer"
                      >
                        <Pencil size={14} /> Editar
                      </button>

                      {p.vagas_conflito && (
                        <button
                          disabled={ocupado}
                          onClick={() =>
                            window.confirm(
                              'Aprovar apenas o morador e reconhecimento facial, ignorando o veículo excedente?',
                            ) && executar('precadastro_aprovar', { id: p.id, sem_veiculos: 1 })
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 text-white disabled:opacity-60 cursor-pointer"
                        >
                          <Check size={14} /> Aprovar Sem Veículo
                        </button>
                      )}

                      <button
                        disabled={ocupado}
                        onClick={() => {
                          const msgConfirm = !cpfOk
                            ? 'ATENÇÃO: Este CPF é matematicamente INVÁLIDO pela Receita Federal! Deseja aprovar mesmo assim?'
                            : 'Aprovar o pré-cadastro?';
                          if (window.confirm(msgConfirm)) executar('precadastro_aprovar', { id: p.id });
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-60 cursor-pointer"
                      >
                        <Check size={14} /> Aprovar
                      </button>

                      <button
                        disabled={ocupado}
                        onClick={() =>
                          window.confirm('Rejeitar o pré-cadastro?') &&
                          executar('precadastro_rejeitar', { id: p.id })
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-600 border border-red-200 disabled:opacity-60 cursor-pointer"
                      >
                        <X size={14} /> Rejeitar
                      </button>
                    </div>

                    {/* Gaveta Expansível Inline: Checklist de 1 Clique + Conversa Autônoma da IA */}
                    {ehGestao && painelAberto && (
                      <PainelTriagemIaCard
                        pre={p}
                        onDisparado={async (msgOk) => {
                          setAviso({ tipo: 'ok', mensagem: msgOk });
                          await carregar(true);
                        }}
                        onAtualizadoCard={async () => {
                          setVersaoFoto((v) => v + 1);
                          await carregar(true);
                        }}
                        onFechar={() => setCardIaAbertoId(null)}
                      />
                    )}
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
          <div className="flex items-center gap-2 text-lg font-extrabold text-slate-900 mb-4">
            {aba === 'aprovados' ? (
              <>
                <CheckCircle size={18} /> Pré-cadastros Aprovados
              </>
            ) : (
              <>
                <XCircle size={18} /> Pré-cadastros Rejeitados
              </>
            )}
          </div>
          {regs.length === 0 ? (
            <div className="text-center text-slate-400 py-12">
              {aba === 'aprovados' ? 'Nenhum aprovado ainda.' : 'Nenhum rejeitado.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    {colunasTabela.map((h) => (
                      <th key={h} className={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {regs.map((p) => {
                    const cpfOk = p.cpf_valido ?? (p.cpf ? validarCpfModulo11(p.cpf) : false);
                    const docsCount = p.documentos?.length ?? 0;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className={td}>
                          <b>{p.nome}</b>
                          {p.telefone && <div className="text-xs text-slate-500 font-mono">{p.telefone}</div>}
                        </td>
                        <td className={td}>
                          {p.tipo === 'temporada' && <BadgeTemporada />}
                          {aba === 'aprovados' && (!p.tipo || p.tipo === 'morador') && (
                            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[0.72em] font-bold">
                              {rotuloRelacao(p.relacao)}
                            </span>
                          )}
                        </td>
                        <td className={td}>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono">{fmtCpf(p.cpf)}</span>
                            {p.cpf &&
                              (cpfOk ? (
                                <span
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[0.7em] font-bold"
                                  title={p.cpf_regiao || regiaoFiscalCpf(p.cpf)}
                                >
                                  <ShieldCheck size={11} /> Válido
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[0.7em] font-bold">
                                  <ShieldAlert size={11} /> Inválido
                                </span>
                              ))}
                          </div>
                        </td>
                        {aba === 'aprovados' && <td className={td}>{p.unidade_info || '-'}</td>}
                        <td className={td}>
                          {aba === 'aprovados' ? (
                            <>
                              {p.placa1 && (
                                <span className="font-mono font-bold text-blue-600">
                                  {icone(p.tipo_veiculo1)} {p.placa1}
                                </span>
                              )}
                              {p.placa2 && (
                                <>
                                  {' '}
                                  /{' '}
                                  <span className="font-mono font-bold text-blue-600">
                                    {icone(p.tipo_veiculo2)} {p.placa2}
                                  </span>
                                </>
                              )}
                            </>
                          ) : (
                            p.placa1 && <span className="font-mono">{p.placa1}</span>
                          )}
                        </td>
                        {aba === 'aprovados' && ehGestao && (
                          <td className={td}>
                            <button
                              type="button"
                              onClick={() => setModalDocsPre(p)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-bold cursor-pointer"
                            >
                              <FolderOpen size={12} /> {docsCount > 0 ? `Docs (${docsCount})` : 'Anexar'}
                            </button>
                          </td>
                        )}
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
        <ModalEditar
          p={editando}
          blocos={dados.blocos}
          onFechar={() => setEditando(null)}
          onSalvar={(corpo) => executar('precadastro_editar', corpo, () => setEditando(null))}
          ocupado={ocupado}
        />
      )}

      {ehGestao && modalDocsPre && (
        <ModalDocumentosCadastro
          nomePessoa={modalDocsPre.nome}
          subtituloUnidade={modalDocsPre.unidade_info}
          relacaoSugerida={modalDocsPre.relacao}
          precadastroId={modalDocsPre.id}
          onFechar={() => setModalDocsPre(null)}
          onAlterado={() => void carregar(true)}
        />
      )}

      {ampliar && (
        <div
          onClick={() => setAmpliar(null)}
          className="fixed inset-0 bg-black/80 z-[99] flex items-center justify-center cursor-zoom-out"
        >
          <img src={ampliar} alt="" className="max-w-[90vw] max-h-[85vh] rounded-2xl" />
        </div>
      )}
    </div>
  );
}

/**
 * Painel inline dentro do card de Pré-cadastro para marcar os checks e deixar a IA conduzir
 * 100% da conversa no WhatsApp (com espelhamento em tempo real das mensagens e documentos recebidos).
 */
function PainelTriagemIaCard({
  pre,
  onDisparado,
  onAtualizadoCard,
  onFechar,
}: {
  pre: Pre;
  onDisparado: (mensagemOk: string) => Promise<void>;
  onAtualizadoCard: () => Promise<void>;
  onFechar: () => void;
}) {
  const [selecionados, setSelecionados] = useState<string[]>(() => {
    const existentes = (pre.ia_pendencias ?? [])
      .filter((x) => !x.concluido && x.codigo !== 'pergunta_especifica')
      .map((x) => x.codigo);
    if (existentes.length > 0) return existentes;
    const sug: string[] = [];
    if (pre.relacao === 'Inquilino') sug.push('contrato_locacao');
    if (!Number(pre.consta_lista)) sug.push('confirmar_vinculo');
    return sug;
  });
  const [obsExtra, setObsExtra] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erroLocal, setErroLocal] = useState('');
  const [mensagens, setMensagens] = useState<MensagemIaPrecad[]>([]);
  const [carregandoChat, setCarregandoChat] = useState(true);

  const carregarDetalhes = useCallback(async () => {
    try {
      const r = await api<{
        mensagens: MensagemIaPrecad[];
        ia_triagem_status: string;
      }>('precadastro_ia_detalhes', { query: { precadastro_id: pre.id } });
      setMensagens(r.mensagens ?? []);
    } catch {
      // Silencioso durante polling
    } finally {
      setCarregandoChat(false);
    }
  }, [pre.id]);

  useEffect(() => {
    void carregarDetalhes();
    const timer = window.setInterval(() => {
      void carregarDetalhes();
    }, 6000);
    return () => window.clearInterval(timer);
  }, [carregarDetalhes]);

  const alternarCheck = (cod: string) => {
    setSelecionados((atu) => (atu.includes(cod) ? atu.filter((x) => x !== cod) : [...atu, cod]));
  };

  const dispararSolicitacaoIa = async () => {
    if (selecionados.length === 0 && !obsExtra.trim()) {
      setErroLocal('Marque pelo menos um item no checklist ou escreva uma solicitação adicional.');
      return;
    }
    setEnviando(true);
    setErroLocal('');
    try {
      const r = await api<{ mensagem: string }>('precadastro_solicitar_ia', {
        corpo: {
          precadastro_id: pre.id,
          checks: selecionados,
          observacao_extra: obsExtra.trim(),
        },
      });
      setObsExtra('');
      await carregarDetalhes();
      await onDisparado(r.mensagem);
    } catch (e) {
      setErroLocal(msgErro(e));
    } finally {
      setEnviando(false);
    }
  };

  const promoverMidiaChat = async (
    mensagemId: number,
    acao: 'foto_facial' | 'documento',
    categoria = 'contrato_locacao',
  ) => {
    try {
      const r = await api<{ mensagem: string }>('precadastro_usar_midia_whatsapp', {
        corpo: { precadastro_id: pre.id, mensagem_id: mensagemId, acao, categoria },
      });
      await onAtualizadoCard();
      window.alert(`✅ ${r.mensagem}`);
    } catch (e) {
      setErroLocal(msgErro(e));
    }
  };

  return (
    <div className="mt-3.5 pt-3.5 border-t-2 border-violet-200 bg-violet-50/50 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0">
            <Bot size={17} />
          </div>
          <div>
            <div className="text-xs sm:text-sm font-extrabold text-violet-950">
              Solicitação &amp; Coleta Autônoma por IA no WhatsApp ({pre.telefone})
            </div>
            <div className="text-[11px] text-violet-800">
              Marque o que falta abaixo: a IA envia na hora, tira dúvidas do morador e anexa sozinha o PDF/foto quando ele responder!
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onFechar}
          className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-500 border border-slate-200 cursor-pointer"
          title="Fechar painel"
        >
          <X size={14} />
        </button>
      </div>

      {erroLocal && (
        <div className="bg-rose-50 border border-rose-300 text-rose-800 rounded-lg px-3 py-2 text-xs font-bold">
          ⚠️ {erroLocal}
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-4">
        {/* Coluna Esquerda: Checks de 1 Clique + Observação Extra */}
        <div className="lg:col-span-7 space-y-3 bg-white rounded-xl p-3.5 border border-violet-200">
          <div className="text-xs font-extrabold text-slate-700 uppercase tracking-wide">
            1. O que a IA deve solicitar e validar?
          </div>

          <div className="grid sm:grid-cols-2 gap-2">
            {OPCOES_CHECKS_IA.map((op) => {
              const ativo = selecionados.includes(op.codigo);
              return (
                <label
                  key={op.codigo}
                  className={`flex items-start gap-2 p-2.5 rounded-xl border text-left cursor-pointer transition ${
                    ativo
                      ? 'bg-violet-50 border-violet-500 ring-1 ring-violet-400'
                      : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={ativo}
                    onChange={() => alternarCheck(op.codigo)}
                    className="w-4 h-4 accent-violet-600 mt-0.5 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-extrabold text-slate-900 leading-snug">{op.rotulo}</div>
                    <div className="text-[10px] text-slate-500 leading-tight mt-0.5">{op.dica}</div>
                  </div>
                </label>
              );
            })}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">
              2. Pergunta ou instrução específica adicional (Opcional)
            </label>
            <textarea
              rows={2}
              value={obsExtra}
              onChange={(e) => setObsExtra(e.target.value)}
              placeholder="Ex.: Informe também o nome da imobiliária ou data de início da locação..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs outline-none focus:border-violet-500"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={enviando}
              onClick={() => void dispararSolicitacaoIa()}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-extrabold shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <Send size={14} />
              {enviando
                ? 'Disparando no WhatsApp...'
                : pre.ia_triagem_status && pre.ia_triagem_status !== 'nenhum'
                  ? 'Atualizar & Reenviar Solicitação IA'
                  : 'Enviar no WhatsApp (IA assume a conversa)'}
            </button>
          </div>
        </div>

        {/* Coluna Direita: Espelho em Tempo Real da Conversa IA <-> Morador */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 flex flex-col max-h-[360px]">
          <div className="px-3.5 py-2.5 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-700">
              💬 Conversa no WhatsApp ({mensagens.length})
            </span>
            <button
              type="button"
              onClick={() => void carregarDetalhes()}
              className="text-slate-500 hover:text-violet-700 p-1 rounded cursor-pointer"
              title="Atualizar histórico"
            >
              <RefreshCw size={13} />
            </button>
          </div>

          <div className="p-3 space-y-2 overflow-y-auto flex-1 bg-slate-50/70">
            {carregandoChat ? (
              <div className="text-center text-xs text-slate-400 py-8">Carregando histórico...</div>
            ) : mensagens.length === 0 ? (
              <div className="text-center text-xs text-slate-400 py-8 px-3">
                Nenhuma mensagem trocada ainda. Marque os itens ao lado e clique em enviar para a IA iniciar o atendimento!
              </div>
            ) : (
              mensagens.map((m) => {
                const deSaida = m.direcao === 'out';
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${deSaida ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[90%] rounded-xl px-3 py-2 text-xs shadow-2xs ${
                        deSaida
                          ? 'bg-emerald-100 text-slate-900 border border-emerald-200'
                          : 'bg-white text-slate-800 border border-slate-200'
                      }`}
                    >
                      <div className="text-[10px] font-extrabold text-slate-500 mb-0.5 flex items-center justify-between gap-2">
                        <span>{deSaida ? '🤖 Assistente IA / Sistema' : `👤 ${pre.nome.split(' ')[0]}`}</span>
                        <span>{m.hora_fmt}</span>
                      </div>

                      {m.midia_url && (
                        <div className="my-1.5 space-y-1.5">
                          {m.midia_tipo === 'document' || m.midia_url.toLowerCase().endsWith('.pdf') ? (
                            <a
                              href={m.midia_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 font-bold text-xs"
                            >
                              <FileText size={13} /> Abrir PDF Recebido
                            </a>
                          ) : (
                            <a href={m.midia_url} target="_blank" rel="noreferrer">
                              <img
                                src={m.midia_url}
                                alt="Anexo WhatsApp"
                                className="max-h-36 rounded-lg border border-slate-200 object-cover"
                              />
                            </a>
                          )}

                          {!deSaida && (
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {m.midia_tipo === 'image' && (
                                <button
                                  type="button"
                                  onClick={() => void promoverMidiaChat(m.id, 'foto_facial')}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold cursor-pointer"
                                >
                                  <Camera size={10} /> Usar como Facial
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  void promoverMidiaChat(
                                    m.id,
                                    'documento',
                                    pre.relacao === 'Inquilino' ? 'contrato_locacao' : 'documento_pessoal',
                                  )
                                }
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600 text-white text-[10px] font-bold cursor-pointer"
                              >
                                <FolderOpen size={10} /> Salvar nos Documentos
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="whitespace-pre-wrap break-words leading-relaxed">{m.conteudo}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AbaLinks({
  dados,
  ocupado,
  executar,
}: {
  dados: Resposta;
  ocupado: boolean;
  executar: (r: string, c: Record<string, unknown>) => void;
}) {
  const padraoSegundo = (dados.limite_veiculos_padrao ?? 2) <= 1 ? '0' : '1';
  const [geral, setGeral] = useState({
    perfil: 'Geral',
    bloco_id: '',
    unidade_numero: '',
    validade_horas: '72',
    permite_segundo: padraoSegundo,
  });
  const [temp, setTemp] = useState({
    bloco_id: '',
    unidade_numero: '',
    validade_horas: '72',
    permite_segundo: padraoSegundo,
  });
  const validade = (v: string, set: (x: string) => void, cor = '') => (
    <select value={v} onChange={(e) => set(e.target.value)} className={`${campo} ${cor}`}>
      <option value="24">24 horas</option>
      <option value="72">3 dias</option>
      <option value="168">7 dias</option>
      <option value="720">30 dias</option>
    </select>
  );
  const blocos = (v: string, set: (x: string) => void, vazio: string, cor = '') => (
    <select value={v} onChange={(e) => set(e.target.value)} className={`${campo} ${cor}`}>
      <option value="">{vazio}</option>
      {dados.blocos.map((b) => (
        <option key={b.id} value={b.id}>
          {b.nome}
        </option>
      ))}
    </select>
  );
  const rot = 'block text-sm font-bold text-slate-600 mb-1.5';
  const copiar = (t: string) => navigator.clipboard?.writeText(t);

  return (
    <>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="bg-white rounded-2xl border border-slate-200 border-t-4 border-t-blue-600 p-6 shadow-sm">
          <div className="flex items-center gap-2 text-lg font-extrabold text-blue-700 mb-1">
            <Users size={18} /> Link Geral de Pré-cadastro
          </div>
          <p className="text-sm text-slate-500 mb-3.5">
            Para moradores que vão morar no condomínio. O porteiro analisa e aprova o acesso.
          </p>
          <div className="space-y-3">
            <div>
              <label className={rot}>Perfil / Tipo de Morador</label>
              <select
                value={geral.perfil}
                onChange={(e) => setGeral({ ...geral, perfil: e.target.value })}
                className={campo}
              >
                <option value="Geral">Geral (Moradores)</option>
                <option value="Prestadores">Prestadores de Serviço</option>
                <option value="Funcionários">Funcionários</option>
                <option value="Inquilinos">Inquilinos</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className={rot}>Travar Bloco (Opcional)</label>
                {blocos(geral.bloco_id, (x) => setGeral({ ...geral, bloco_id: x }), 'Deixar morador escolher...')}
              </div>
              <div>
                <label className={rot}>Travar Unidade (Opcional)</label>
                <input
                  value={geral.unidade_numero}
                  onChange={(e) => setGeral({ ...geral, unidade_numero: e.target.value })}
                  placeholder="Ex: 101"
                  className={campo}
                />
              </div>
            </div>
            <div>
              <label className={rot}>Validade do Link</label>
              {validade(geral.validade_horas, (x) => setGeral({ ...geral, validade_horas: x }))}
            </div>
            <div>
              <label className={rot}>Vagas Liberadas</label>
              <select
                value={geral.permite_segundo}
                onChange={(e) => setGeral({ ...geral, permite_segundo: e.target.value })}
                className={campo}
              >
                <option value="1">Permitir até 2 Veículos (Carros ou Motos)</option>
                <option value="0">Apenas 1 Veículo (Carro ou Moto)</option>
              </select>
            </div>
          </div>
          <button
            disabled={ocupado}
            onClick={() => executar('precadastro_link_gerar', { tipo_link: 'geral', ...geral })}
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-60"
          >
            <Link2 size={15} /> Gerar Link Geral
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 border-t-4 border-t-cyan-600 p-6 shadow-sm">
          <div className="flex items-center gap-2 text-lg font-extrabold text-cyan-700 mb-1">
            <CalendarDays size={18} /> Link de Aluguel de Temporada
          </div>
          <p className="text-sm text-slate-500 mb-3.5">
            Para inquilinos de temporada. Pede documentos (CNH/RG) e período de estadia.
          </p>
          <div className="space-y-3">
            <div>
              <label className={rot}>Travar Bloco / Unidade (Opcional)</label>
              <div className="grid grid-cols-2 gap-2.5">
                {blocos(
                  temp.bloco_id,
                  (x) => setTemp({ ...temp, bloco_id: x }),
                  'Deixar inquilino escolher...',
                  'border-cyan-600',
                )}
                <input
                  value={temp.unidade_numero}
                  onChange={(e) => setTemp({ ...temp, unidade_numero: e.target.value })}
                  placeholder="Ex: Apto 204"
                  className={`${campo} border-cyan-600`}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className={rot}>Validade do Link</label>
                {validade(temp.validade_horas, (x) => setTemp({ ...temp, validade_horas: x }))}
              </div>
              <div>
                <label className={rot}>Vagas Liberadas</label>
                <select
                  value={temp.permite_segundo}
                  onChange={(e) => setTemp({ ...temp, permite_segundo: e.target.value })}
                  className={campo}
                >
                  <option value="1">Permitir até 2 Veículos</option>
                  <option value="0">Apenas 1 Veículo</option>
                </select>
              </div>
            </div>
          </div>
          <button
            disabled={ocupado}
            onClick={() => executar('precadastro_link_gerar', { tipo_link: 'temporada', ...temp })}
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-600 text-white font-bold disabled:opacity-60"
          >
            <CalendarDays size={15} /> Gerar Link de Temporada
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center gap-2 text-lg font-extrabold text-slate-900 mb-4">
          <Link2 size={18} /> Links Criados
        </div>
        {dados.links.length === 0 ? (
          <div className="text-center text-slate-400 py-12">Nenhum link gerado ainda.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {['Tipo', 'Link para Compartilhar', 'Vagas', 'Usos', 'Expira', 'Ação'].map((h) => (
                    <th key={h} className={`${th} ${h === 'Ação' ? 'text-right' : ''}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dados.links.map((l) => {
                  const url = linkUrl(l.token);
                  const exp = l.expira_em ? new Date(l.expira_em.replace(' ', 'T')).getTime() : null;
                  const expirado = exp !== null && exp < Date.now();
                  const resta = exp !== null && !expirado ? Math.round((exp - Date.now()) / 3600000) : null;
                  const isTemp = l.tipo === 'temporada';
                  const wa = isTemp
                    ? `Olá! Você tem uma reserva no nosso condomínio. Preencha seu cadastro de temporada neste link: ${url}`
                    : `Clique neste link para fazer seu pré-cadastro no condomínio: ${url}`;
                  return (
                    <tr key={l.id} className={expirado ? 'opacity-50' : ''}>
                      <td className={td}>
                        {isTemp ? (
                          <span className="bg-cyan-100 text-cyan-700 px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap">
                            🏖️ Temporada
                            {l.unidade_info && (
                              <>
                                <br />
                                <small className="font-medium">{l.unidade_info}</small>
                              </>
                            )}
                          </span>
                        ) : (
                          <span className="bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full text-xs font-bold">
                            {l.perfil ?? 'Geral'}
                          </span>
                        )}
                      </td>
                      <td className={td}>
                        <div className="flex gap-1.5 items-center">
                          <input
                            readOnly
                            value={url}
                            onClick={(e) => {
                              (e.target as HTMLInputElement).select();
                              copiar(url);
                            }}
                            className="text-xs flex-1 p-1.5 border border-slate-200 rounded-md cursor-pointer bg-slate-50 min-w-0"
                          />
                          <a
                            href={`https://api.whatsapp.com/send?text=${encodeURIComponent(wa)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="bg-[#25D366] text-white px-2.5 py-1.5 rounded-md shrink-0"
                          >
                            <Phone size={14} />
                          </a>
                        </div>
                      </td>
                      <td className={`${td} text-center font-bold`}>
                        {Number(l.permite_segundo) === 1 ? '🚗🚗 (2)' : '🚗 (1)'}
                      </td>
                      <td className={`${td} text-center font-bold`}>{l.usos}</td>
                      <td className={`${td} whitespace-nowrap`}>
                        {!l.expira_em ? (
                          <span className="text-slate-500 text-xs">Sem validade</span>
                        ) : expirado ? (
                          <span className="text-red-500 text-xs font-semibold">Expirado</span>
                        ) : (
                          <span className="text-emerald-600 text-xs font-semibold">{resta}h restantes</span>
                        )}
                      </td>
                      <td className={`${td} text-right`}>
                        <button
                          disabled={ocupado}
                          onClick={() =>
                            window.confirm('Remover este link?') &&
                            executar('precadastro_link_excluir', { id: l.id })
                          }
                          className="p-2 rounded-lg bg-red-50 text-red-600 border border-red-200 disabled:opacity-60"
                        >
                          <Trash2 size={13} />
                        </button>
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

function ModalEditar({
  p,
  blocos,
  onFechar,
  onSalvar,
  ocupado,
}: {
  p: Pre;
  blocos: { id: number; nome: string }[];
  onFechar: () => void;
  onSalvar: (c: Record<string, unknown>) => void;
  ocupado: boolean;
}) {
  const [f, setF] = useState({
    nome: p.nome,
    cpf: p.cpf ?? '',
    bloco_id: p.bloco_id ? String(p.bloco_id) : '',
    unidade_numero: p.unidade_numero ?? '',
    placa1: p.placa1 ?? '',
    placa2: p.placa2 ?? '',
    vaga_garagem1: p.vaga_garagem1 ?? '',
    vaga_garagem2: p.vaga_garagem2 ?? '',
  });
  const m = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });
  const rot = 'block text-sm font-bold text-slate-600 mb-1.5';
  return (
    <Modal
      titulo={
        <>
          <span className="bg-indigo-100 text-indigo-600 p-2 rounded-xl">
            <Pencil size={18} />
          </span>{' '}
          Editar Pré-cadastro
        </>
      }
      borda="border-t-indigo-500"
      onFechar={onFechar}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSalvar({ id: p.id, ...f });
        }}
        className="space-y-3"
      >
        <div>
          <label className={rot}>Nome Completo *</label>
          <input required value={f.nome} onChange={m('nome')} className={`${campo} font-semibold`} />
        </div>
        <div>
          <label className={rot}>CPF (apenas números) *</label>
          <input required maxLength={14} value={f.cpf} onChange={m('cpf')} className={campo} />
          <ValidadorCpf
            cpf={f.cpf}
            onNomeEncontrado={(nome) => {
              if (!f.nome.trim()) setF((prev) => ({ ...prev, nome }));
            }}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={rot}>Bloco *</label>
            <select required value={f.bloco_id} onChange={m('bloco_id')} className={campo}>
              <option value="">Selecione...</option>
              {blocos.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={rot}>Número da Unidade *</label>
            <input
              required
              value={f.unidade_numero}
              onChange={m('unidade_numero')}
              placeholder="Ex: 101"
              className={campo}
            />
          </div>
        </div>
        <div className="text-xs font-extrabold text-slate-500 uppercase pt-1">Veículos (Opcional)</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <input
              value={f.placa1}
              onChange={m('placa1')}
              placeholder="Placa 1"
              className={`${campo} font-mono uppercase`}
            />
            <input
              value={f.vaga_garagem1}
              onChange={m('vaga_garagem1')}
              placeholder="Vaga da Placa 1"
              className={campo}
            />
          </div>
          <div className="space-y-2">
            <input
              value={f.placa2}
              onChange={m('placa2')}
              placeholder="Placa 2"
              className={`${campo} font-mono uppercase`}
            />
            <input
              value={f.vaga_garagem2}
              onChange={m('vaga_garagem2')}
              placeholder="Vaga da Placa 2"
              className={campo}
            />
          </div>
        </div>
        <div className="flex gap-3 pt-3">
          <button
            type="button"
            onClick={onFechar}
            className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold"
          >
            Cancelar
          </button>
          <button
            disabled={ocupado}
            className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-300 bg-white font-bold disabled:opacity-60"
          >
            <Save size={16} /> Salvar Alterações
          </button>
        </div>
      </form>
    </Modal>
  );
}
