import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, UserCog, Pencil, Power, LogIn, X, CheckCircle2, AlertTriangle,
  Sliders, PhoneCall, Calendar, Wrench, Vote, Megaphone, Key, Package, Video, Check, Siren, BellRing,
} from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import { selecionarCondominio } from '../lib/useSessao';

// Paridade com src/views/condominios.php + Gestão Comercial de Módulos SaaS por Condomínio:
// O Super Admin pode habilitar/desabilitar individualmente cada módulo cobrado à parte.
interface Cliente {
  id: number;
  nome: string;
  cnpj: string | null;
  ativo: boolean;
  app_habilitado: number;
  portaria_autonoma: number;
  cameras_morador_ativo?: number;
  permite_temporada?: number;
  modulo_airbnb?: number;
  modulo_interfone?: number;
  modulo_reservas?: number;
  modulo_ocorrencias?: number;
  modulo_enquetes?: number;
  modulo_avisos?: number;
  modulo_encomendas?: number;
  modulo_emergencia?: number;
  emergencia_furar_nao_perturbe?: number;
  tipo_portaria?: string;
  nome_sindico: string | null;
  email_sindico: string | null;
  total_usuarios: number;
  total_unidades: number;
}

interface Form {
  id?: number;
  nome: string;
  cnpj: string;
  app_habilitado: boolean;
  portaria_autonoma: boolean;
  cameras_morador_ativo: boolean;
  permite_temporada: boolean;
  modulo_interfone: boolean;
  modulo_reservas: boolean;
  modulo_ocorrencias: boolean;
  modulo_enquetes: boolean;
  modulo_avisos: boolean;
  modulo_encomendas: boolean;
  modulo_emergencia: boolean;
  emergencia_furar_nao_perturbe: boolean;
  nome_sindico: string;
  email_sindico: string;
  senha_sindico: string;
}

type ChaveModulo =
  | 'modulo_emergencia'
  | 'emergencia_furar_nao_perturbe'
  | 'modulo_interfone'
  | 'modulo_reservas'
  | 'modulo_ocorrencias'
  | 'modulo_enquetes'
  | 'modulo_avisos'
  | 'permite_temporada'
  | 'modulo_encomendas'
  | 'cameras_morador_ativo';

interface DefinicaoModulo {
  chave: ChaveModulo;
  titulo: string;
  curto: string;
  descricao: string;
  icone: typeof PhoneCall;
  corAtivo: string;
  badgeClasses: string;
}

const CATALOGO_MODULOS: DefinicaoModulo[] = [
  {
    chave: 'modulo_emergencia',
    titulo: 'Botão de Emergência SOS (Médica & Pânico)',
    curto: '🚨 Botão SOS',
    descricao: 'Botão de socorro médico e segurança no App do Morador com alerta instantâneo para o Bloco, Portaria e Síndico.',
    icone: Siren,
    corAtivo: 'border-red-500 bg-red-50/70 ring-red-500/15',
    badgeClasses: 'bg-red-50 text-red-700 border-red-200',
  },
  {
    chave: 'emergencia_furar_nao_perturbe',
    titulo: 'Alarme Defesa Civil (Furar Não Perturbe)',
    curto: '🔊 Furar Não Perturbe',
    descricao: 'Aciona sirene padrão Defesa Civil (853Hz+960Hz) furando o modo Silencioso e o pacote Não Perturbe (iPhone e Android).',
    icone: BellRing,
    corAtivo: 'border-rose-600 bg-rose-50/80 ring-rose-600/20',
    badgeClasses: 'bg-rose-100 text-rose-800 border-rose-300',
  },
  {
    chave: 'modulo_interfone',
    titulo: 'Módulo Interfone Digital',
    curto: '📞 Interfone',
    descricao: 'Chamadas de vídeo da portaria para o celular, interfone entre apartamentos e transbordo.',
    icone: PhoneCall,
    corAtivo: 'border-emerald-500 bg-emerald-50/70 ring-emerald-500/15',
    badgeClasses: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    chave: 'modulo_reservas',
    titulo: 'Módulo Reserva de Espaços',
    curto: '📅 Reservas',
    descricao: 'Salão de festas, churrasqueira e quadra integrados à Lista de Convidados com convite facial.',
    icone: Calendar,
    corAtivo: 'border-blue-500 bg-blue-50/70 ring-blue-500/15',
    badgeClasses: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    chave: 'modulo_enquetes',
    titulo: 'Módulo Enquetes & Votação',
    curto: '🗳️ Enquetes',
    descricao: 'Votações oficiais no App (1 voto auditado por apartamento/unidade) com relatório em tempo real.',
    icone: Vote,
    corAtivo: 'border-violet-500 bg-violet-50/70 ring-violet-500/15',
    badgeClasses: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  {
    chave: 'modulo_ocorrencias',
    titulo: 'Módulo Livro de Ocorrências',
    curto: '🛠️ Ocorrências',
    descricao: 'Abertura de chamados de manutenção e ocorrências com foto pelo morador e resposta do síndico.',
    icone: Wrench,
    corAtivo: 'border-amber-500 bg-amber-50/70 ring-amber-500/15',
    badgeClasses: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  {
    chave: 'modulo_avisos',
    titulo: 'Módulo Mural de Avisos',
    curto: '📢 Avisos',
    descricao: 'Comunicados oficiais da administração/síndico direto no aplicativo dos moradores.',
    icone: Megaphone,
    corAtivo: 'border-sky-500 bg-sky-50/70 ring-sky-500/15',
    badgeClasses: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  {
    chave: 'permite_temporada',
    titulo: 'Módulo Airbnb / Temporada',
    curto: '🔑 Airbnb',
    descricao: 'Autorização de locação por temporada com link de check-in facial automático para hóspedes.',
    icone: Key,
    corAtivo: 'border-rose-500 bg-rose-50/70 ring-rose-500/15',
    badgeClasses: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  {
    chave: 'modulo_encomendas',
    titulo: 'Módulo Gestão de Encomendas',
    curto: '📦 Encomendas',
    descricao: 'Registro de pacotes na portaria, previsão de entregas pelo morador e baixa de retirada.',
    icone: Package,
    corAtivo: 'border-teal-500 bg-teal-50/70 ring-teal-500/15',
    badgeClasses: 'bg-teal-50 text-teal-700 border-teal-200',
  },
  {
    chave: 'cameras_morador_ativo',
    titulo: 'Módulo Câmeras no App',
    curto: '📹 Câmeras App',
    descricao: 'Exibe as câmeras selecionadas do condomínio ao vivo na tela inicial do App do Morador.',
    icone: Video,
    corAtivo: 'border-indigo-500 bg-indigo-50/70 ring-indigo-500/15',
    badgeClasses: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
];

const VAZIO: Form = {
  nome: '',
  cnpj: '',
  app_habilitado: true,
  portaria_autonoma: false,
  cameras_morador_ativo: false,
  permite_temporada: true,
  modulo_interfone: true,
  modulo_reservas: true,
  modulo_ocorrencias: true,
  modulo_enquetes: true,
  modulo_avisos: true,
  modulo_encomendas: true,
  modulo_emergencia: true,
  emergencia_furar_nao_perturbe: true,
  nome_sindico: '',
  email_sindico: '',
  senha_sindico: '',
};

const campo = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 text-sm';
const rotulo = 'block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5';

function clienteParaForm(c: Cliente): Form {
  const remota = Number(c.portaria_autonoma ?? 0) === 1 || c.tipo_portaria === 'remota';
  return {
    id: c.id,
    nome: c.nome,
    cnpj: c.cnpj ?? '',
    app_habilitado: Number(c.app_habilitado ?? 1) === 1,
    portaria_autonoma: remota,
    cameras_morador_ativo: Number(c.cameras_morador_ativo ?? 0) === 1,
    permite_temporada: Number(c.permite_temporada ?? c.modulo_airbnb ?? 1) === 1,
    modulo_interfone: Number(c.modulo_interfone ?? 1) === 1,
    modulo_reservas: Number(c.modulo_reservas ?? 1) === 1,
    modulo_ocorrencias: Number(c.modulo_ocorrencias ?? 1) === 1,
    modulo_enquetes: Number(c.modulo_enquetes ?? 1) === 1,
    modulo_avisos: Number(c.modulo_avisos ?? 1) === 1,
    modulo_encomendas: Number(c.modulo_encomendas ?? 1) === 1,
    modulo_emergencia: Number(c.modulo_emergencia ?? 1) === 1,
    emergencia_furar_nao_perturbe: Number(c.emergencia_furar_nao_perturbe ?? 1) === 1,
    nome_sindico: c.nome_sindico ?? '',
    email_sindico: c.email_sindico ?? '',
    senha_sindico: '',
  };
}

function SeletorModulosComerciais({
  f,
  set,
}: {
  f: Form;
  set: (novo: Form) => void;
}) {
  const totalAtivos = CATALOGO_MODULOS.filter((m) => Boolean(f[m.chave])).length;

  const marcarTodos = (valor: boolean) => {
    set({
      ...f,
      modulo_emergencia: valor,
      emergencia_furar_nao_perturbe: valor,
      modulo_interfone: valor,
      modulo_reservas: valor,
      modulo_ocorrencias: valor,
      modulo_enquetes: valor,
      modulo_avisos: valor,
      permite_temporada: valor,
      modulo_encomendas: valor,
      cameras_morador_ativo: valor,
    });
  };

  return (
    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <div className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
            <Sliders size={17} className="text-blue-600" />
            Módulos Contratados pelo Condomínio ({totalAtivos}/{CATALOGO_MODULOS.length} ativos)
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Ative ou desative cada módulo vendido separadamente. Módulos desmarcados ficam ocultos para o Síndico, Portaria e Moradores deste condomínio.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => marcarTodos(true)}
            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 cursor-pointer"
          >
            Liberar Todos
          </button>
          <button
            type="button"
            onClick={() => marcarTodos(false)}
            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 cursor-pointer"
          >
            Apenas Controle de Acesso
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {CATALOGO_MODULOS.map((m) => {
          const Icone = m.icone;
          const ativo = Boolean(f[m.chave]);
          return (
            <label
              key={m.chave}
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition select-none ${
                ativo
                  ? `${m.corAtivo} ring-2`
                  : 'bg-white border-slate-200 opacity-75 hover:opacity-100'
              }`}
            >
              <input
                type="checkbox"
                className="mt-1 w-4 h-4 accent-blue-600 shrink-0"
                checked={ativo}
                onChange={(e) => set({ ...f, [m.chave]: e.target.checked })}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-extrabold text-slate-800 flex items-center gap-1.5">
                    <Icone size={15} className={ativo ? 'text-blue-600' : 'text-slate-400'} />
                    {m.titulo}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                      ativo
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {ativo ? 'Habilitado' : 'Inativo'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">{m.descricao}</p>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function CamposCondominio({ f, set, edicao }: { f: Form; set: (f: Form) => void; edicao: boolean }) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={rotulo}>Nome do Condomínio / Residencial *</label>
          <input required className={campo} placeholder="Ex: Residencial Eco Urbanismo" value={f.nome} onChange={(e) => set({ ...f, nome: e.target.value })} />
        </div>
        <div>
          <label className={rotulo}>CNPJ (Opcional)</label>
          <input className={campo} placeholder="00.000.000/0000-00" value={f.cnpj} onChange={(e) => set({ ...f, cnpj: e.target.value })} />
        </div>
      </div>

      <div className="mt-4">
        <label className={rotulo}>Modo de Operação da Portaria (Abertura pelo App do Morador) *</label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${!f.portaria_autonoma ? 'bg-emerald-50/70 border-emerald-500 ring-2 ring-emerald-500/15' : 'bg-slate-50 border-slate-200'}`}>
            <input type="radio" name="modo_portaria" className="mt-1" checked={!f.portaria_autonoma} onChange={() => set({ ...f, portaria_autonoma: false })} />
            <div>
              <div className="text-sm font-bold text-slate-800">🏢 Portaria Humana (Presencial)</div>
              <div className="text-xs text-slate-500 mt-0.5">Pelo celular, o morador abre apenas a porta do próprio Bloco (portões de Pedestre/Veículo só se liberados na ficha dele).</div>
            </div>
          </label>
          <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${f.portaria_autonoma ? 'bg-indigo-50/70 border-indigo-500 ring-2 ring-indigo-500/15' : 'bg-slate-50 border-slate-200'}`}>
            <input type="radio" name="modo_portaria" className="mt-1" checked={f.portaria_autonoma} onChange={() => set({ ...f, portaria_autonoma: true })} />
            <div>
              <div className="text-sm font-bold text-slate-800">🤖 Portaria Remota (Autônoma)</div>
              <div className="text-xs text-slate-500 mt-0.5">Pelo celular, todos os moradores abrem a porta do próprio Bloco + os portões gerais de Entrada (Pedestre e Veículo).</div>
            </div>
          </label>
        </div>
      </div>

      <label className="flex items-center gap-2 mt-4 font-semibold text-slate-700 cursor-pointer">
        <input type="checkbox" className="w-5 h-5" checked={f.app_habilitado} onChange={(e) => set({ ...f, app_habilitado: e.target.checked })} />
        Habilitar Acesso Geral ao App para Moradores
      </label>
      <p className="text-xs text-slate-500 ml-7 mt-1">Se desmarcado, os moradores serão bloqueados ao tentar fazer login. Apenas o síndico terá acesso ao painel.</p>

      {/* PAINEL DE MÓDULOS COMERCIAIS CONTRATADOS */}
      <SeletorModulosComerciais f={f} set={set} />

      <hr className="my-5 border-slate-200" />
      <div className="flex items-center gap-2 text-slate-600 font-semibold text-sm mb-3">
        <UserCog size={18} /> {edicao ? 'Dados do Síndico Principal' : 'Acesso Administrativo (Síndico / Gestor)'}
      </div>
      <div className={`grid grid-cols-1 ${edicao ? 'md:grid-cols-3' : 'md:grid-cols-3'} gap-4`}>
        <div>
          <label className={rotulo}>Nome do Síndico {edicao ? '' : '*'}</label>
          <input required={!edicao} className={campo} placeholder="Ex: João Silva" value={f.nome_sindico} onChange={(e) => set({ ...f, nome_sindico: e.target.value })} />
        </div>
        <div>
          <label className={rotulo}>E-mail de Acesso {edicao ? '' : '*'}</label>
          <input required={!edicao} type="text" className={campo} placeholder="sindico@condominio.com" value={f.email_sindico} onChange={(e) => set({ ...f, email_sindico: e.target.value })} />
        </div>
        <div>
          <label className={rotulo}>{edicao ? 'Nova Senha (em branco = manter)' : 'Senha Inicial *'}</label>
          <input required={!edicao} type="password" autoComplete="new-password" className={campo} placeholder="••••••••" value={f.senha_sindico} onChange={(e) => set({ ...f, senha_sindico: e.target.value })} />
        </div>
      </div>
    </>
  );
}

export default function Condominios() {
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [novo, setNovo] = useState<Form>(VAZIO);
  const [edicao, setEdicao] = useState<Form | null>(null);
  const [modalModulos, setModalModulos] = useState<Form | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const navigate = useNavigate();

  const carregar = () =>
    api<{ condominios: Cliente[] }>('listar_condominios')
      .then((r) => setClientes(r.condominios))
      .catch((e) => setAviso({ tipo: 'erro', msg: e instanceof ErroApi ? e.message : 'Erro ao carregar.' }));

  useEffect(() => {
    carregar();
  }, []);

  const salvar = async (f: Form, aoConcluir: () => void) => {
    setSalvando(true);
    setAviso(null);
    try {
      const r = await api<{ mensagem: string }>('salvar_condominio', {
        corpo: {
          ...f,
          modulo_airbnb: f.permite_temporada,
        },
      });
      setAviso({ tipo: 'ok', msg: r.mensagem });
      aoConcluir();
      carregar();
    } catch (e) {
      setAviso({ tipo: 'erro', msg: e instanceof ErroApi ? e.message : 'Erro ao salvar.' });
    } finally {
      setSalvando(false);
    }
  };

  const salvarApenasModulos = async (f: Form) => {
    if (!f.id) return;
    setSalvando(true);
    setAviso(null);
    try {
      const r = await api<{ mensagem: string }>('salvar_modulos_condominio', {
        corpo: {
          id: f.id,
          app_habilitado: f.app_habilitado,
          cameras_morador_ativo: f.cameras_morador_ativo,
          permite_temporada: f.permite_temporada,
          modulo_airbnb: f.permite_temporada,
          modulo_interfone: f.modulo_interfone,
          modulo_reservas: f.modulo_reservas,
          modulo_ocorrencias: f.modulo_ocorrencias,
          modulo_enquetes: f.modulo_enquetes,
          modulo_avisos: f.modulo_avisos,
          modulo_encomendas: f.modulo_encomendas,
          modulo_emergencia: f.modulo_emergencia,
          emergencia_furar_nao_perturbe: f.emergencia_furar_nao_perturbe,
        },
      });
      setAviso({ tipo: 'ok', msg: r.mensagem });
      setModalModulos(null);
      carregar();
    } catch (e) {
      setAviso({ tipo: 'erro', msg: e instanceof ErroApi ? e.message : 'Erro ao salvar módulos.' });
    } finally {
      setSalvando(false);
    }
  };

  const alternarStatus = async (c: Cliente) => {
    if (!confirm('Alterar status deste cliente no sistema SaaS?')) return;
    try {
      const r = await api<{ mensagem: string }>('alternar_status_condominio', { corpo: { id: c.id } });
      setAviso({ tipo: 'ok', msg: r.mensagem });
      carregar();
    } catch (e) {
      setAviso({ tipo: 'erro', msg: e instanceof ErroApi ? e.message : 'Erro.' });
    }
  };

  const acessar = async (c: Cliente) => {
    await selecionarCondominio(c.id);
    navigate('/');
  };

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8 space-y-6">
      {aviso && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm border-l-4 ${aviso.tipo === 'ok' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-rose-50 border-rose-500 text-rose-800'}`}>
          {aviso.tipo === 'ok' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />} {aviso.msg}
        </div>
      )}

      {/* CADASTRO NOVO */}
      <form
        onSubmit={(e) => { e.preventDefault(); salvar(novo, () => setNovo(VAZIO)); }}
        className="bg-white rounded-2xl p-6 border border-slate-200 border-t-4 border-t-blue-600 shadow-sm"
      >
        <h2 className="text-lg font-bold text-blue-700 mb-5 flex items-center gap-2"><Building2 size={20} /> Cadastrar Novo Condomínio (Cliente)</h2>
        <CamposCondominio f={novo} set={setNovo} edicao={false} />
        <button disabled={salvando} className="mt-5 bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-lg disabled:opacity-60 cursor-pointer">
          Salvar Cliente e Gerar Acesso
        </button>
      </form>

      {/* CARTEIRA DE CLIENTES */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Carteira de Clientes Ativos no SaaS</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
                <th className="py-3 pr-3">ID</th>
                <th className="py-3 pr-3">Nome do Condomínio</th>
                <th className="py-3 pr-3">Portaria</th>
                <th className="py-3 pr-3">Módulos Contratados</th>
                <th className="py-3 pr-3">Síndico Principal</th>
                <th className="py-3 pr-3">Unidades</th>
                <th className="py-3 pr-3">App Morador</th>
                <th className="py-3 pr-3">Status SaaS</th>
                <th className="py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {clientes?.map((c) => {
                const remota = Number(c.portaria_autonoma ?? 0) === 1 || c.tipo_portaria === 'remota';
                const fCliente = clienteParaForm(c);
                const modulosAtivos = CATALOGO_MODULOS.filter((m) => Boolean(fCliente[m.chave]));
                return (
                <tr key={c.id} className="border-b border-slate-50 last:border-0 align-top">
                  <td className="py-3 pr-3 text-slate-500">#{c.id}</td>
                  <td className="py-3 pr-3 font-bold text-slate-800">
                    {c.nome}
                    <div className="text-xs font-normal text-slate-400">{c.cnpj || 'Sem CNPJ'}</div>
                  </td>
                  <td className="py-3 pr-3">
                    {remota
                      ? <span className="px-2 py-1 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">🤖 Remota</span>
                      : <span className="px-2 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">🏢 Humana</span>}
                  </td>
                  <td className="py-3 pr-3 max-w-[300px]">
                    <div className="flex flex-wrap gap-1">
                      {modulosAtivos.map((m) => (
                        <span
                          key={m.chave}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${m.badgeClasses}`}
                          title={m.titulo}
                        >
                          {m.curto}
                        </span>
                      ))}
                      {modulosAtivos.length === 0 && (
                        <span className="text-xs text-slate-400 italic">Apenas Controle de Acesso</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setModalModulos(fCliente)}
                      className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                    >
                      <Sliders size={12} /> Configurar módulos ({modulosAtivos.length}/{CATALOGO_MODULOS.length})
                    </button>
                  </td>
                  <td className="py-3 pr-3 text-slate-600">{c.nome_sindico || 'Sem cadastro'}<div className="text-xs text-slate-400">{c.email_sindico}</div></td>
                  <td className="py-3 pr-3">
                    <span className="bg-slate-100 px-2 py-1 rounded-md font-semibold text-slate-700" title={`${c.total_usuarios} usuários cadastrados`}>
                      {c.total_unidades} unid. / {c.total_usuarios} usu.
                    </span>
                  </td>
                  <td className="py-3 pr-3">
                    {c.app_habilitado ? <span className="text-xs font-semibold text-emerald-700">Liberado</span> : <span className="text-xs font-semibold text-amber-700">Bloqueado</span>}
                  </td>
                  <td className="py-3 pr-3">
                    {c.ativo
                      ? <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">🟢 Ativo</span>
                      : <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">🔴 Suspenso</span>}
                  </td>
                  <td className="py-3">
                    <div className="flex gap-1.5 flex-wrap">
                      <button onClick={() => acessar(c)} className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"><LogIn size={14} /> Acessar</button>
                      <button
                        onClick={() => setModalModulos(fCliente)}
                        className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 cursor-pointer"
                        title="Habilitar ou desabilitar módulos comerciais deste condomínio"
                      ><Sliders size={14} /> Módulos</button>
                      <button
                        onClick={() => setEdicao(fCliente)}
                        className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                      ><Pencil size={14} /> Editar</button>
                      <button onClick={() => alternarStatus(c)} className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg cursor-pointer ${c.ativo ? 'bg-rose-50 text-rose-700 hover:bg-rose-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
                        <Power size={14} /> {c.ativo ? 'Suspender SaaS' : 'Reativar SaaS'}
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
              {clientes && clientes.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-slate-400">Nenhum condomínio cadastrado ainda.</td></tr>}
              {!clientes && <tr><td colSpan={9} className="py-10 text-center text-slate-400">Carregando...</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL RÁPIDO DE MÓDULOS COMERCIAIS */}
      {modalModulos && (
        <div className="fixed inset-0 bg-slate-900/55 z-50 flex items-center justify-center p-4" onClick={() => setModalModulos(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl p-6 w-full max-w-3xl border-t-4 border-t-indigo-600 shadow-2xl max-h-[92vh] overflow-y-auto"
          >
            <div className="flex justify-between items-start gap-3 mb-2">
              <div>
                <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
                  <Sliders size={20} className="text-indigo-600" />
                  Módulos Contratados — {modalModulos.nome}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ligue ou desligue cada módulo comercial para este condomínio. As alterações entram em vigor imediatamente no Painel do Síndico, Portaria e App dos Moradores.
                </p>
              </div>
              <button type="button" onClick={() => setModalModulos(null)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"><X size={20} /></button>
            </div>

            <label className="flex items-center gap-2 mt-3 font-semibold text-slate-700 cursor-pointer bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
              <input
                type="checkbox"
                className="w-5 h-5 accent-emerald-600"
                checked={modalModulos.app_habilitado}
                onChange={(e) => setModalModulos({ ...modalModulos, app_habilitado: e.target.checked })}
              />
              <div>
                <div className="text-sm font-bold text-slate-800">📱 Habilitar Acesso ao App para Moradores</div>
                <div className="text-xs font-normal text-slate-500">Se desmarcado, nenhum morador deste condomínio consegue acessar o aplicativo.</div>
              </div>
            </label>

            <SeletorModulosComerciais f={modalModulos} set={setModalModulos} />

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setModalModulos(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 font-bold text-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={salvando}
                onClick={() => salvarApenasModulos(modalModulos)}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 font-bold text-white hover:bg-indigo-700 disabled:opacity-60 inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check size={18} />
                {salvando ? 'Salvando...' : 'Salvar Módulos Contratados'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE EDIÇÃO COMPLETA */}
      {edicao && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4" onClick={() => setEdicao(null)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); salvar(edicao, () => setEdicao(null)); }}
            className="bg-white rounded-2xl p-6 w-full max-w-3xl border-t-4 border-t-amber-500 shadow-2xl max-h-[92vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Pencil size={18} /> Editar Condomínio &amp; Módulos</h2>
              <button type="button" onClick={() => setEdicao(null)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"><X size={20} /></button>
            </div>
            <CamposCondominio f={edicao} set={setEdicao} edicao />
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setEdicao(null)} className="flex-1 py-2.5 rounded-lg bg-slate-100 font-bold text-slate-700 hover:bg-slate-200 cursor-pointer">Cancelar</button>
              <button disabled={salvando} className="flex-1 py-2.5 rounded-lg bg-amber-500 font-bold text-white hover:bg-amber-600 disabled:opacity-60 cursor-pointer">Salvar Alterações</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
