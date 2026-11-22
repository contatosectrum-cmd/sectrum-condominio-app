import { useCallback, useEffect, useState } from 'react';
import {
  Home, Users, Car, FileText, Package, Calendar, Wrench, ShieldCheck,
  Mail, Phone, Save, X, ScanFace, Building2, Eye, FolderOpen, AlertTriangle,
} from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import ModalDocumentosCadastro, { abrirDocumentoProtegido, type DocumentoCadastro } from './ModalDocumentosCadastro';

interface DadosUnidade360 {
  id: number;
  numero: string;
  bloco_id: number;
  bloco_nome: string;
  fracao_ideal: number;
  area_m2: number | null;
  limite_vagas: number | null;
  grupo_acesso_id: number | null;
  grupo_acesso_efetivo_id: number | null;
  grupo_acesso_nome: string | null;
  proprietario_nome: string | null;
  proprietario_cpf: string | null;
  proprietario_rg: string | null;
  proprietario_telefone: string | null;
  proprietario_celular: string | null;
  proprietario_email: string | null;
  inquilino_nome: string | null;
  imobiliaria_nome: string | null;
  tipo_ocupacao: 'proprietario' | 'alugado' | 'vazio' | string;
  id_externo_superlogica: number | null;
}

interface PessoaUnidade {
  id: number;
  nome: string;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  relacao: string;
  ativo: boolean;
  tem_biometria_facial: boolean;
  importado_leitor: boolean;
  observacao: string | null;
}

interface VeiculoUnidade {
  id: number;
  placa: string;
  marca: string | null;
  modelo: string | null;
  cor: string | null;
  tipo: string | null;
  vaga_garagem: string | null;
  status: string;
  responsavel_nome: string | null;
}

interface EncomendaUnidade {
  id: number;
  destinatario_nome: string | null;
  codigo_rastreio: string | null;
  transportadora: string | null;
  status: string;
  data_recebimento: string | null;
  data_retirada: string | null;
  retirado_por_nome: string | null;
}

interface ReservaUnidade {
  id: number;
  titulo_evento: string;
  data_reserva: string;
  hora_inicio: string;
  hora_fim: string;
  status: string;
  valor_total: number;
  area_nome: string;
  solicitante_nome: string | null;
}

interface OcorrenciaUnidade {
  id: number;
  categoria: string;
  prioridade: string;
  titulo: string;
  descricao: string;
  status: string;
  resposta_sindico: string | null;
  criado_em: string;
  autor_nome: string | null;
}

interface ItemListaOficial {
  id: number;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  unidade: string | null;
}

interface RespFicha360 {
  unidade: DadosUnidade360;
  pessoas: PessoaUnidade[];
  veiculos: VeiculoUnidade[];
  documentos: DocumentoCadastro[];
  encomendas: EncomendaUnidade[];
  reservas: ReservaUnidade[];
  ocorrencias: OcorrenciaUnidade[];
  lista_oficial: ItemListaOficial[];
}

interface Props {
  unidadeId: number;
  limiteVagasCondominio: number;
  onFechar: () => void;
  onSalvo?: () => void;
}

type Aba360 = 'titularidade' | 'pessoas' | 'veiculos' | 'documentos' | 'historico';

export default function ModalFichaUnidade360({ unidadeId, limiteVagasCondominio, onFechar, onSalvo }: Props) {
  const [dados, setDados] = useState<RespFicha360 | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [aba, setAba] = useState<Aba360>('titularidade');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [abrirModalUploadDoc, setAbrirModalUploadDoc] = useState(false);

  // Campos editáveis de Titularidade Legal & Parâmetros da Unidade
  const [tipoOcupacao, setTipoOcupacao] = useState<'proprietario' | 'alugado' | 'vazio'>('proprietario');
  const [propNome, setPropNome] = useState('');
  const [propCpf, setPropCpf] = useState('');
  const [propRg, setPropRg] = useState('');
  const [propCelular, setPropCelular] = useState('');
  const [propTelefone, setPropTelefone] = useState('');
  const [propEmail, setPropEmail] = useState('');
  const [inqNome, setInqNome] = useState('');
  const [imobNome, setImobNome] = useState('');
  const [fracaoIdeal, setFracaoIdeal] = useState('0');
  const [areaM2, setAreaM2] = useState('');
  const [limiteVagas, setLimiteVagas] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await api<RespFicha360>('unidade_ficha_360', { query: { unidade_id: unidadeId } });
      setDados(r);
      const u = r.unidade;
      setTipoOcupacao((u.tipo_ocupacao as 'proprietario' | 'alugado' | 'vazio') || 'proprietario');
      setPropNome(u.proprietario_nome ?? '');
      setPropCpf(u.proprietario_cpf ?? '');
      setPropRg(u.proprietario_rg ?? '');
      setPropCelular(u.proprietario_celular ?? '');
      setPropTelefone(u.proprietario_telefone ?? '');
      setPropEmail(u.proprietario_email ?? '');
      setInqNome(u.inquilino_nome ?? '');
      setImobNome(u.imobiliaria_nome ?? '');
      setFracaoIdeal(String(u.fracao_ideal ?? 0));
      setAreaM2(u.area_m2 !== null && u.area_m2 !== undefined ? String(u.area_m2) : '');
      setLimiteVagas(u.limite_vagas !== null && u.limite_vagas !== undefined ? String(u.limite_vagas) : '');
    } catch (e) {
      setAviso({ tipo: 'erro', texto: e instanceof ErroApi ? e.message : 'Erro ao carregar a Ficha 360º da unidade.' });
    } finally {
      setCarregando(false);
    }
  }, [unidadeId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const salvarTitularidade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dados) return;
    setSalvando(true);
    setAviso(null);
    try {
      const r = await api<{ mensagem: string }>('estrutura_editar_unidade', {
        corpo: {
          id: dados.unidade.id,
          bloco_id: dados.unidade.bloco_id,
          numero: dados.unidade.numero,
          tipo_ocupacao: tipoOcupacao,
          proprietario_nome: propNome,
          proprietario_cpf: propCpf,
          proprietario_rg: propRg,
          proprietario_celular: propCelular,
          proprietario_telefone: propTelefone,
          proprietario_email: propEmail,
          inquilino_nome: inqNome,
          imobiliaria_nome: imobNome,
          fracao_ideal: fracaoIdeal,
          area_m2: areaM2,
          limite_vagas: limiteVagas,
        },
      });
      setAviso({ tipo: 'ok', texto: r.mensagem });
      await carregar();
      onSalvo?.();
    } catch (err) {
      setAviso({ tipo: 'erro', texto: err instanceof ErroApi ? err.message : 'Erro ao salvar os dados da unidade.' });
    } finally {
      setSalvando(false);
    }
  };

  const u = dados?.unidade;
  const rotuloUnidade = u ? `${u.bloco_nome || 'Bloco'} — Apto ${u.numero}` : `Unidade #${unidadeId}`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 border-t-4 border-t-indigo-600 shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* CABEÇALHO 360º */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
              <Home size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-extrabold text-slate-900">{rotuloUnidade}</h2>
                {u?.tipo_ocupacao === 'alugado' ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
                    🔑 Imóvel Alugado (Inquilino)
                  </span>
                ) : u?.tipo_ocupacao === 'vazio' ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-slate-200 text-slate-700">
                    Unidade Vazia
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    🏠 Proprietário Residente
                  </span>
                )}
                {u && u.fracao_ideal > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Fração: {u.fracao_ideal.toFixed(6).replace('.', ',')}%
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Ficha 360º da Unidade — Titularidade Legal, Moradores no App, Veículos, Contratos e Histórico Operacional
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer"
            aria-label="Fechar Ficha 360"
          >
            <X size={20} />
          </button>
        </div>

        {/* BARRA DE ABAS */}
        <div className="px-6 pt-3 bg-white border-b border-slate-200 flex gap-2 overflow-x-auto">
          {(
            [
              { id: 'titularidade', rotulo: 'Titularidade & Fração', icone: Building2, badge: null },
              { id: 'pessoas', rotulo: 'Pessoas & Facial', icone: Users, badge: dados?.pessoas.length ?? 0 },
              { id: 'veiculos', rotulo: 'Veículos & Vagas', icone: Car, badge: dados?.veiculos.length ?? 0 },
              { id: 'documentos', rotulo: 'Contratos & Documentos', icone: FileText, badge: dados?.documentos.length ?? 0 },
              {
                id: 'historico',
                rotulo: 'Encomendas, Reservas & Ocorrências',
                icone: Package,
                badge: (dados?.encomendas.length ?? 0) + (dados?.reservas.length ?? 0) + (dados?.ocorrencias.length ?? 0),
              },
            ] as const
          ).map((t) => {
            const Icone = t.icone;
            const ativa = aba === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setAba(t.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 border-b-2 text-xs font-extrabold whitespace-nowrap transition cursor-pointer ${
                  ativa
                    ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-lg'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icone size={14} />
                {t.rotulo}
                {t.badge !== null && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                      ativa ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* CONTEÚDO */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {aviso && (
            <div
              className={`border-l-4 px-4 py-3 rounded-lg text-xs font-bold flex justify-between items-center gap-2 ${
                aviso.tipo === 'ok'
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                  : 'bg-rose-50 border-rose-500 text-rose-800'
              }`}
            >
              <span>{aviso.texto}</span>
              <button type="button" onClick={() => setAviso(null)}>
                <X size={14} />
              </button>
            </div>
          )}

          {carregando || !dados ? (
            <div className="text-center py-14 text-slate-400 text-sm">Carregando dossiê 360º da unidade...</div>
          ) : aba === 'titularidade' ? (
            <form onSubmit={salvarTitularidade} className="space-y-5">
              {/* Modo de ocupação */}
              <div className="grid sm:grid-cols-3 gap-3">
                {(
                  [
                    {
                      id: 'proprietario',
                      titulo: '🏠 Proprietário Residente',
                      desc: 'O próprio dono mora na unidade e responde pelas cobranças e acessos.',
                    },
                    {
                      id: 'alugado',
                      titulo: '🔑 Imóvel Alugado (Inquilino)',
                      desc: 'Possui Proprietário (Titular Legal) e Inquilino (Morador Residente).',
                    },
                    {
                      id: 'vazio',
                      titulo: '🚪 Unidade Desocupada / Vazia',
                      desc: 'Sem moradores residentes no momento (apenas proprietário responsável).',
                    },
                  ] as const
                ).map((op) => (
                  <label
                    key={op.id}
                    onClick={() => setTipoOcupacao(op.id)}
                    className={`p-3.5 rounded-xl border-2 cursor-pointer transition ${
                      tipoOcupacao === op.id
                        ? 'border-indigo-600 bg-indigo-50/50'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="text-xs font-extrabold text-slate-900">{op.titulo}</div>
                    <div className="text-[11px] text-slate-500 mt-1 leading-snug">{op.desc}</div>
                  </label>
                ))}
              </div>

              {/* Card Proprietário Legal */}
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                    👤 Dados do Proprietário (Titular Legal do Imóvel)
                  </div>
                  {dados.unidade.id_externo_superlogica && (
                    <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
                      ID Superlógica #{dados.unidade.id_externo_superlogica}
                    </span>
                  )}
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-600 mb-1">Nome Completo do Proprietário</label>
                    <input
                      value={propNome}
                      onChange={(e) => setPropNome(e.target.value)}
                      placeholder="Ex.: TEREZINHA DE JESUS MAFRA FERREIRA"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">CPF / CNPJ do Proprietário</label>
                    <input
                      value={propCpf}
                      onChange={(e) => setPropCpf(e.target.value)}
                      placeholder="000.000.000-00"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Celular / WhatsApp</label>
                    <div className="relative">
                      <Phone size={14} className="absolute left-3 top-2.5 text-slate-400" />
                      <input
                        value={propCelular}
                        onChange={(e) => setPropCelular(e.target.value)}
                        placeholder="+55 98 98445-8164"
                        className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Telefone Secundário</label>
                    <input
                      value={propTelefone}
                      onChange={(e) => setPropTelefone(e.target.value)}
                      placeholder="+55 98 98126-2520"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">RG / Documento</label>
                    <input
                      value={propRg}
                      onChange={(e) => setPropRg(e.target.value)}
                      placeholder="RG"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-bold text-slate-600 mb-1">E-mail para Boletos, Editais e Comunicados</label>
                    <div className="relative">
                      <Mail size={14} className="absolute left-3 top-2.5 text-slate-400" />
                      <input
                        value={propEmail}
                        onChange={(e) => setPropEmail(e.target.value)}
                        placeholder="email@exemplo.com"
                        className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Card Inquilino & Imobiliária */}
              <div className="bg-amber-50/50 rounded-2xl border border-amber-200 p-4 space-y-3">
                <div className="text-xs font-extrabold uppercase tracking-wider text-amber-900">
                  🔑 Locação: Inquilino / Co-Responsável &amp; Imobiliária
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nome do Inquilino / Morador Responsável (se alugado)
                    </label>
                    <input
                      value={inqNome}
                      onChange={(e) => {
                        setInqNome(e.target.value);
                        if (e.target.value.trim() !== '' && tipoOcupacao === 'proprietario') {
                          setTipoOcupacao('alugado');
                        }
                      }}
                      placeholder="Deixe em branco se o proprietário residir no imóvel"
                      className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm bg-white font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Imobiliária / Administradora da Locação (Opcional)
                    </label>
                    <input
                      value={imobNome}
                      onChange={(e) => setImobNome(e.target.value)}
                      placeholder="Ex.: Imobiliária São Luís / Direto com Proprietário"
                      className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Parâmetros Físicos e Rateio */}
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-3">
                  📐 Parâmetros de Rateio (Fração Ideal), Área &amp; Garagem
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Fração Ideal (%)</label>
                    <input
                      type="number"
                      step="0.00000001"
                      value={fracaoIdeal}
                      onChange={(e) => setFracaoIdeal(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Área Privativa (m²)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={areaM2}
                      onChange={(e) => setAreaM2(e.target.value)}
                      placeholder="Ex.: 54.50"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Limite de Vagas de Garagem</label>
                    <select
                      value={limiteVagas}
                      onChange={(e) => setLimiteVagas(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white font-semibold"
                    >
                      <option value="">Padrão do Condomínio ({limiteVagasCondominio} vaga(s))</option>
                      <option value="0">0 (Sem vaga)</option>
                      <option value="1">1 vaga</option>
                      <option value="2">2 vagas</option>
                      <option value="3">3 vagas</option>
                      <option value="4">4 vagas</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onFechar}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold cursor-pointer disabled:opacity-50"
                >
                  <Save size={15} /> {salvando ? 'Salvando...' : 'Salvar Dados da Unidade'}
                </button>
              </div>
            </form>
          ) : aba === 'pessoas' ? (
            <div className="space-y-5">
              {/* Moradores ativos no App e Terminais Faciais */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                    📱 Moradores, Dependentes e Funcionários Cadastrados no App / Leitores Faciais ({dados.pessoas.length})
                  </div>
                  {dados.unidade.grupo_acesso_nome && (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200">
                      <ShieldCheck size={13} /> Grupo: {dados.unidade.grupo_acesso_nome}
                    </span>
                  )}
                </div>

                {dados.pessoas.length === 0 ? (
                  <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-6 text-center text-xs text-slate-500">
                    Nenhum morador com conta ativa no aplicativo/leitor facial para esta unidade ainda.
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {dados.pessoas.map((p) => (
                      <div key={p.id} className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-start justify-between gap-3 shadow-2xs">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-extrabold text-slate-900 truncate">{p.nome}</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                p.relacao === 'Inquilino'
                                  ? 'bg-amber-100 text-amber-800'
                                  : p.relacao === 'Dependente'
                                    ? 'bg-sky-100 text-sky-800'
                                    : p.relacao === 'Funcionario'
                                      ? 'bg-purple-100 text-purple-800'
                                      : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {p.relacao}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 space-y-0.5">
                            {p.cpf && <div>CPF: <span className="font-mono">{p.cpf}</span></div>}
                            {p.telefone && <div>Tel: {p.telefone}</div>}
                            {p.email && <div className="truncate">E-mail: {p.email}</div>}
                          </div>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-1">
                          {p.tem_biometria_facial ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-extrabold">
                              <ScanFace size={11} /> Facial OK
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">
                              Sem Selfie
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Lista Oficial de Conferência da Administradora */}
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wider text-slate-600 mb-2">
                  📋 Registro na Base Oficial da Administradora / Superlógica ({dados.lista_oficial.length})
                </div>
                {dados.lista_oficial.length === 0 ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-500">
                    Nenhum registro nominal na tabela de conferência (`lista_moradores`) para esta unidade.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dados.lista_oficial.map((lo) => (
                      <div key={lo.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-extrabold text-slate-900">{lo.nome}</span>
                          {lo.cpf && <span className="ml-2 font-mono text-slate-500">CPF: {lo.cpf}</span>}
                        </div>
                        <div className="text-slate-500 flex gap-3">
                          {lo.telefone && <span>📞 {lo.telefone}</span>}
                          {lo.email && <span>✉️ {lo.email}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : aba === 'veiculos' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                  🚗 Frota Vinculada à Unidade ({dados.veiculos.length})
                </div>
                <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                  Ocupação: {dados.veiculos.length} / {dados.unidade.limite_vagas ?? limiteVagasCondominio} vaga(s)
                </span>
              </div>
              {dados.veiculos.length === 0 ? (
                <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center text-xs text-slate-500">
                  Nenhum veículo cadastrado nesta unidade.
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {dados.veiculos.map((v) => (
                    <div key={v.id} className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between">
                      <div>
                        <div className="inline-block bg-slate-900 text-white font-mono font-extrabold text-sm px-2.5 py-0.5 rounded-md tracking-wider">
                          {v.placa}
                        </div>
                        <div className="text-xs font-bold text-slate-800 mt-1">
                          {[v.marca, v.modelo, v.cor].filter(Boolean).join(' • ') || 'Veículo'}
                        </div>
                        {v.responsavel_nome && (
                          <div className="text-[11px] text-slate-500">Resp.: {v.responsavel_nome}</div>
                        )}
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                        {v.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : aba === 'documentos' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                  📂 Contratos de Locação, Escrituras e Documentos da Unidade ({dados.documentos.length})
                </div>
                <button
                  type="button"
                  onClick={() => setAbrirModalUploadDoc(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold cursor-pointer"
                >
                  <FolderOpen size={14} /> Gerenciar / Anexar Documento
                </button>
              </div>

              {dados.unidade.tipo_ocupacao === 'alugado' &&
                !dados.documentos.some((d) => ['contrato_locacao', 'autorizacao_proprietario'].includes(d.categoria)) && (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center gap-2.5">
                    <AlertTriangle size={18} className="text-amber-600 shrink-0" />
                    <div>
                      <b>Atenção:</b> Esta unidade está marcada como <b>Alugada</b>, mas ainda não possui <b>Contrato de Locação</b> ou{' '}
                      <b>Autorização do Proprietário</b> anexado.
                    </div>
                  </div>
                )}

              {dados.documentos.length === 0 ? (
                <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center text-xs text-slate-500">
                  Nenhum documento anexado a esta unidade. Clique em &quot;Gerenciar / Anexar Documento&quot; para adicionar Contratos de Locação, Escrituras ou RGs.
                </div>
              ) : (
                <div className="space-y-2">
                  {dados.documentos.map((d) => (
                    <div key={d.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-extrabold text-slate-900">{d.titulo}</span>
                          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-extrabold">
                            {d.categoria_rotulo}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {d.nome_original} • {d.criado_em}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void abrirDocumentoProtegido(d)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
                      >
                        <Eye size={13} /> Abrir
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-4">
              {/* Encomendas */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800">
                  <Package size={14} className="text-blue-600" /> Encomendas ({dados.encomendas.length})
                </div>
                {dados.encomendas.length === 0 ? (
                  <div className="text-xs text-slate-400 py-4 text-center">Sem encomendas registradas.</div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {dados.encomendas.map((e) => (
                      <div key={e.id} className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs">
                        <div className="font-bold text-slate-800">{e.destinatario_nome || 'Encomenda'}</div>
                        <div className="text-[11px] text-slate-500">{e.transportadora || e.codigo_rastreio || 'Portaria'}</div>
                        <span
                          className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            e.status === 'retirada' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          {e.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Reservas */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800">
                  <Calendar size={14} className="text-indigo-600" /> Reservas de Espaços ({dados.reservas.length})
                </div>
                {dados.reservas.length === 0 ? (
                  <div className="text-xs text-slate-400 py-4 text-center">Nenhuma reserva realizada.</div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {dados.reservas.map((r) => (
                      <div key={r.id} className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs">
                        <div className="font-bold text-slate-800">{r.area_nome}</div>
                        <div className="text-[11px] text-slate-500">
                          Data: {r.data_reserva} ({r.hora_inicio} - {r.hora_fim})
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Ocorrências */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800">
                  <Wrench size={14} className="text-amber-600" /> Ocorrências / Chamados ({dados.ocorrencias.length})
                </div>
                {dados.ocorrencias.length === 0 ? (
                  <div className="text-xs text-slate-400 py-4 text-center">Nenhuma ocorrência registrada.</div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {dados.ocorrencias.map((o) => (
                      <div key={o.id} className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs">
                        <div className="font-bold text-slate-800">{o.titulo}</div>
                        <div className="text-[11px] text-slate-500 line-clamp-2">{o.descricao}</div>
                        <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                          {o.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {abrirModalUploadDoc && dados && (
        <ModalDocumentosCadastro
          nomePessoa={dados.unidade.proprietario_nome || rotuloUnidade}
          subtituloUnidade={rotuloUnidade}
          relacaoSugerida={dados.unidade.tipo_ocupacao === 'alugado' ? 'Inquilino' : 'Proprietario'}
          unidadeId={dados.unidade.id}
          onFechar={() => setAbrirModalUploadDoc(false)}
          onAlterado={() => {
            void carregar();
            onSalvo?.();
          }}
        />
      )}
    </div>
  );
}
