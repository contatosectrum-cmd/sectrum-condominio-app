import { useCallback, useEffect, useState } from 'react';
import { Settings, Save, Building, ShieldCheck, Clock, Users, X, Landmark, KeyRound, Siren, BellRing } from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import { mascaraCpf } from '../lib/cpf';
import ValidadorCpf from '../components/ValidadorCpf';

interface ConfigData {
  condominio_id?: number;
  nome_condominio: string;
  cnpj: string;
  email_contato: string;
  limite_veiculos: number;
  foto_obrigatoria: boolean;
  validade_qrcode_horas: number;
  modulo_emergencia: boolean;
  emergencia_furar_nao_perturbe: boolean;
}

interface CpfReceitaCfg {
  provedor: 'modulo11' | 'serpro' | 'cpfcnpj' | 'hubdev';
  api_key_configurada: boolean;
  api_secret_configurada: boolean;
  pacote_id: string;
  ativo: boolean;
}

interface CondominioItem {
  id: number;
  nome: string;
}

interface RespConfig {
  configuracoes: ConfigData;
  condominios?: CondominioItem[];
  cpf_receita?: CpfReceitaCfg;
}

interface Msg {
  tipo: 'ok' | 'erro';
  mensagem: string;
}

export default function Configuracoes() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingCpf, setSavingCpf] = useState(false);
  const [condominios, setCondominios] = useState<CondominioItem[]>([]);
  const [condId, setCondId] = useState<number | undefined>(undefined);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [formData, setFormData] = useState<ConfigData>({
    nome_condominio: '',
    cnpj: '',
    email_contato: '',
    limite_veiculos: 2,
    foto_obrigatoria: true,
    validade_qrcode_horas: 24,
    modulo_emergencia: true,
    emergencia_furar_nao_perturbe: true,
  });

  const [cpfCfg, setCpfCfg] = useState<CpfReceitaCfg>({
    provedor: 'modulo11',
    api_key_configurada: false,
    api_secret_configurada: false,
    pacote_id: '1',
    ativo: true,
  });
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiSecretInput, setApiSecretInput] = useState('');
  const [cpfTeste, setCpfTeste] = useState('');

  const carregarDados = useCallback(async (cid?: number) => {
    setLoading(true);
    try {
      const r = await api<RespConfig>('configuracoes_listar', {
        query: cid ? { condominio_id: cid } : undefined,
      });
      if (r.condominios) {
        setCondominios(r.condominios);
      }
      if (r.configuracoes) {
        setCondId(r.configuracoes.condominio_id);
        setFormData({
          condominio_id: r.configuracoes.condominio_id,
          nome_condominio: r.configuracoes.nome_condominio || '',
          cnpj: r.configuracoes.cnpj || '',
          email_contato: r.configuracoes.email_contato || '',
          limite_veiculos: r.configuracoes.limite_veiculos ?? 2,
          foto_obrigatoria: r.configuracoes.foto_obrigatoria ?? true,
          validade_qrcode_horas: r.configuracoes.validade_qrcode_horas || 24,
          modulo_emergencia: r.configuracoes.modulo_emergencia ?? true,
          emergencia_furar_nao_perturbe: r.configuracoes.emergencia_furar_nao_perturbe ?? true,
        });
      }
      if (r.cpf_receita) {
        setCpfCfg(r.cpf_receita);
      }
    } catch (e) {
      setMsg({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro ao carregar configurações.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const r = await api<{ mensagem: string }>('configuracoes_salvar', {
        corpo: { ...formData, condominio_id: condId },
      });
      setMsg({ tipo: 'ok', mensagem: r.mensagem });
    } catch (e) {
      setMsg({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro ao salvar configurações.' });
    } finally {
      setSaving(false);
    }
  };

  const handleSalvarCpfConfig = async () => {
    setSavingCpf(true);
    setMsg(null);
    try {
      const r = await api<{ mensagem: string }>('cpf_config_salvar', {
        corpo: {
          provedor: cpfCfg.provedor,
          api_key: apiKeyInput,
          api_secret: apiSecretInput,
          pacote_id: cpfCfg.pacote_id,
          ativo: cpfCfg.ativo ? 1 : 0,
        },
      });
      setMsg({ tipo: 'ok', mensagem: r.mensagem });
      setApiKeyInput('');
      setApiSecretInput('');
      await carregarDados(condId);
    } catch (e) {
      setMsg({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro ao salvar configuração de CPF.' });
    } finally {
      setSavingCpf(false);
    }
  };

  if (loading) {
    return <div className="p-10 text-center text-slate-500 font-bold">Carregando configurações...</div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-6 lg:p-8 pb-10">
      {msg && (
        <div
          className={`border-l-4 px-4 py-3 rounded-lg text-sm font-semibold mb-6 flex justify-between items-center gap-3 ${
            msg.tipo === 'ok'
              ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
              : 'bg-rose-50 border-rose-500 text-rose-800'
          }`}
        >
          <span>{msg.mensagem}</span>
          <button onClick={() => setMsg(null)} aria-label="Fechar aviso">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 flex items-center gap-3">
            <Settings className="text-slate-500" size={28} /> Configurações do Sistema
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Gerencie os dados da propriedade, regras operacionais e limites globais.
          </p>
        </div>
        {condominios.length > 0 && (
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Condomínio</label>
            <select
              value={condId ?? ''}
              onChange={(e) => {
                const novo = Number(e.target.value);
                setCondId(novo);
                carregarDados(novo);
              }}
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 outline-none focus:border-blue-500"
            >
              {condominios.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <form onSubmit={handleSalvar} className="space-y-8">
        {/* BLOCO: DADOS GERAIS */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
            <Building className="text-blue-600" size={24} />
            <h2 className="text-xl font-bold text-slate-800">Dados do Condomínio</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Nome de Exibição do Condomínio</label>
              <input
                type="text"
                value={formData.nome_condominio}
                onChange={(e) => setFormData({ ...formData, nome_condominio: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-colors"
                placeholder="Ex: Village das Árvores"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">CNPJ (Opcional)</label>
              <input
                type="text"
                value={formData.cnpj}
                onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-colors"
                placeholder="00.000.000/0001-00"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-1">
                E-mail de Contato (Para Envios Automáticos)
              </label>
              <input
                type="email"
                value={formData.email_contato}
                onChange={(e) => setFormData({ ...formData, email_contato: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-colors"
                placeholder="contato@condominio.com.br"
              />
            </div>
          </div>
        </div>

        {/* BLOCO: REGRAS E LIMITES */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
            <ShieldCheck className="text-emerald-600" size={24} />
            <h2 className="text-xl font-bold text-slate-800">Regras &amp; Limites Operacionais</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Limite de Veículos */}
            <div className="flex gap-4">
              <div className="mt-1">
                <Users className="text-slate-400" size={24} />
              </div>
              <div>
                <label className="block text-base font-bold text-slate-800 mb-1">Limite de Veículos por Unidade</label>
                <p className="text-sm text-slate-500 mb-3">
                  Define o número máximo de vagas/veículos permitidos no pré-cadastro do morador.
                </p>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={formData.limite_veiculos}
                  onChange={(e) => setFormData({ ...formData, limite_veiculos: parseInt(e.target.value, 10) || 0 })}
                  className="w-24 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 text-center font-bold"
                />
              </div>
            </div>

            {/* Validade do QR Code */}
            <div className="flex gap-4">
              <div className="mt-1">
                <Clock className="text-slate-400" size={24} />
              </div>
              <div>
                <label className="block text-base font-bold text-slate-800 mb-1">
                  Validade Padrão de Convites (Horas)
                </label>
                <p className="text-sm text-slate-500 mb-3">
                  O tempo de expiração sugerido ao gerar um link ou QR Code para visitantes na portaria.
                </p>
                <select
                  value={formData.validade_qrcode_horas}
                  onChange={(e) => setFormData({ ...formData, validade_qrcode_horas: parseInt(e.target.value, 10) })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 font-bold"
                >
                  <option value={12}>12 horas (Visita Rápida)</option>
                  <option value={24}>24 horas (1 Dia inteiro)</option>
                  <option value={48}>48 horas (Fim de semana)</option>
                  <option value={168}>168 horas (7 dias / Locação)</option>
                </select>
              </div>
            </div>

            {/* Foto Obrigatória */}
            <div className="md:col-span-2 flex items-center justify-between p-5 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <label className="block text-base font-bold text-slate-800 mb-1">
                  Foto Facial Obrigatória no Pré-Cadastro
                </label>
                <p className="text-sm text-slate-500">
                  Se ativo, os moradores não poderão enviar o formulário público sem bater a foto na câmera do celular
                  para o reconhecimento facial (Hikvision).
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={formData.foto_obrigatoria}
                  onChange={(e) => setFormData({ ...formData, foto_obrigatoria: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-14 h-7 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>

            {/* Botão de Emergência SOS no App do Morador */}
            <div className="md:col-span-2 flex items-center justify-between p-5 bg-red-50/60 rounded-xl border border-red-200">
              <div className="pr-4">
                <label className="text-base font-bold text-slate-800 mb-1 flex items-center gap-2">
                  <Siren className="text-red-600 shrink-0" size={20} />
                  Habilitar Botão de Emergência (Médica e Pânico — SOS) neste Condomínio
                </label>
                <p className="text-sm text-slate-600">
                  Exibe o card de Emergência Médica e Segurança/Pânico no App dos Moradores, disparando alerta em tempo
                  real para os vizinhos do mesmo bloco, Portaria e Síndico.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={formData.modulo_emergencia}
                  onChange={(e) => setFormData({ ...formData, modulo_emergencia: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-14 h-7 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-red-600"></div>
              </label>
            </div>

            {/* Furar Pacote Não Perturbe / Modo Defesa Civil */}
            <div
              className={`md:col-span-2 flex items-center justify-between p-5 rounded-xl border transition ${
                formData.modulo_emergencia
                  ? 'bg-rose-50/80 border-rose-300'
                  : 'bg-slate-100 border-slate-200 opacity-60'
              }`}
            >
              <div className="pr-4">
                <label className="text-base font-bold text-slate-800 mb-1 flex items-center gap-2">
                  <BellRing className="text-rose-600 shrink-0" size={20} />
                  Alarme Estilo Defesa Civil — Furar Pacote &ldquo;Não Perturbe&rdquo; e Silencioso (iPhone &amp; Android)
                </label>
                <p className="text-sm text-slate-600">
                  Quando ativado para este condomínio, mantém canal prioritário de mídia e rajada rotativa de alertas
                  para tocar a sirene oficial da Defesa Civil (853 Hz + 960 Hz) no volume máximo mesmo com a chave
                  Silencioso ligada ou no modo &ldquo;Não Perturbe&rdquo;.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  disabled={!formData.modulo_emergencia}
                  checked={formData.emergencia_furar_nao_perturbe}
                  onChange={(e) => setFormData({ ...formData, emergencia_furar_nao_perturbe: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-14 h-7 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-rose-600"></div>
              </label>
            </div>
          </div>
        </div>

        {/* BARRA DE AÇÕES DO CONDOMÍNIO */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-slate-800 hover:bg-slate-900 text-white px-8 py-4 rounded-xl font-bold flex items-center gap-3 transition-colors shadow-lg disabled:opacity-70"
          >
            <Save size={20} />
            {saving ? 'Salvando...' : 'Salvar Configurações do Condomínio'}
          </button>
        </div>
      </form>

      {/* BLOCO: VALIDAÇÃO DE CPF NA BASE DO GOVERNO (RECEITA FEDERAL) */}
      <div className="mt-10 bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <Landmark className="text-indigo-600" size={24} />
            <div>
              <h2 className="text-xl font-bold text-slate-800">
                Confirmação de CPF — Base do Governo (Receita Federal)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Validação matemática oficial (Módulo 11 + Região Fiscal) ativa em todo o sistema e integração opcional
                com SERPRO / Receita Federal para consulta de Nome Oficial e Situação Cadastral.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800">
            <ShieldCheck size={14} /> Algoritmo Oficial RFB Ativo
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">
              Modo de Consulta / Provedor Governamental
            </label>
            <select
              value={cpfCfg.provedor}
              onChange={(e) =>
                setCpfCfg({
                  ...cpfCfg,
                  provedor: e.target.value as CpfReceitaCfg['provedor'],
                })
              }
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-bold text-slate-800"
            >
              <option value="modulo11">
                Padrão Gratuito — Algoritmo Oficial Receita Federal (Módulo 11 + UF Fiscal + Base Local)
              </option>
              <option value="serpro">
                SERPRO Conecta Gov.br — API Oficial Consulta CPF Receita Federal (Nome + Situação + Óbito)
              </option>
              <option value="cpfcnpj">
                CPF.CNPJ.com.br — Gateway Receita Federal (Nome Completo + Situação Cadastral)
              </option>
              <option value="hubdev">
                Hub do Desenvolvedor — Consulta Receita Federal (Nome + Situação Cadastral)
              </option>
            </select>
            <p className="text-xs text-slate-500 mt-1.5">
              Todas as consultas na Receita Federal ficam salvas em cache local por 90 dias para evitar cobrança
              duplicada do mesmo CPF.
            </p>
          </div>

          {cpfCfg.provedor !== 'modulo11' && (
            <>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <KeyRound size={15} className="text-indigo-600" />
                  {cpfCfg.provedor === 'serpro' ? 'Consumer Key (SERPRO) ou Bearer Token' : 'Token de API'}
                  {cpfCfg.api_key_configurada && (
                    <span className="ml-2 px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-extrabold">
                      JÁ CONFIGURADO
                    </span>
                  )}
                </label>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={
                    cpfCfg.api_key_configurada
                      ? '•••••••••••• (deixe em branco para manter a chave atual)'
                      : 'Cole aqui o Token ou Consumer Key...'
                  }
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 text-sm"
                />
              </div>

              {cpfCfg.provedor === 'serpro' && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">
                    Consumer Secret (SERPRO OAuth2)
                    {cpfCfg.api_secret_configurada && (
                      <span className="ml-2 px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-extrabold">
                        JÁ CONFIGURADO
                      </span>
                    )}
                  </label>
                  <input
                    type="password"
                    value={apiSecretInput}
                    onChange={(e) => setApiSecretInput(e.target.value)}
                    placeholder={
                      cpfCfg.api_secret_configurada
                        ? '•••••••••••• (deixe em branco para manter o secret atual)'
                        : 'Opcional se usar Bearer Token direto'
                    }
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 text-sm"
                  />
                </div>
              )}

              {cpfCfg.provedor === 'cpfcnpj' && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">
                    ID do Pacote CPF.CNPJ (1 = Nome Simples, 2 = Situação RFB, 8 = Completo)
                  </label>
                  <input
                    type="text"
                    value={cpfCfg.pacote_id}
                    onChange={(e) => setCpfCfg({ ...cpfCfg, pacote_id: e.target.value })}
                    className="w-40 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-bold"
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={handleSalvarCpfConfig}
            disabled={savingCpf}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-sm disabled:opacity-70"
          >
            <Save size={18} />
            {savingCpf ? 'Salvando Provedor...' : 'Salvar Configuração de Validação de CPF'}
          </button>
        </div>

        {/* TESTADOR AO VIVO DE CPF */}
        <div className="mt-8 pt-6 border-t border-slate-200">
          <label className="block text-sm font-extrabold text-slate-800 mb-2">
            Simulador / Testador de CPF em Tempo Real
          </label>
          <div className="max-w-md">
            <input
              type="text"
              value={cpfTeste}
              onChange={(e) => setCpfTeste(mascaraCpf(e.target.value))}
              placeholder="Digite um CPF para testar (000.000.000-00)"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:border-indigo-500 font-mono text-sm font-bold"
            />
            <ValidadorCpf cpf={cpfTeste} />
          </div>
        </div>
      </div>
    </div>
  );
}

