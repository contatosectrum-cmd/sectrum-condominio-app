import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PhoneCall,
  Copy,
  Check,
  RefreshCw,
  KeyRound,
  Edit2,
  Printer,
  Download,
  Search,
  Building2,
  BookOpen,
  ShieldCheck,
  Wifi,
  AlertTriangle,
  Monitor,
  HelpCircle,
  CheckCircle2,
  X,
  RotateCcw,
  Share2,
} from 'lucide-react';
import { api, ErroApi } from '../lib/api';

interface ServidorSipCfg {
  dominio: string;
  ip_direto: string;
  porta: number;
  transporte: string;
  realm: string;
  codec_primario: string;
  codec_secundario: string;
  keep_alive_seg: number;
  expiracao_seg: number;
}

interface PortariaSipItem {
  condominio_id: number;
  condominio_nome: string;
  ramal_sip: string;
  usuario_sip: string;
  senha_sip: string;
  ativo: boolean;
  total_unidades?: number;
  registrado_online: boolean;
  ip_remoto: string | null;
  porta_remota: number | null;
  user_agent: string | null;
  ultimo_registro: string | null;
  em_chamada_sip: boolean;
}

interface MoradorUnidadeItem {
  id: number;
  nome: string;
  telefone: string | null;
  tem_app: boolean;
  canal: string;
}

interface UnidadeRamalItem {
  id: number;
  bloco_id: number | null;
  bloco_nome: string;
  numero: string;
  label: string;
  ramal_custom: string;
  ramal_principal: string;
  atalhos_aceitos: string[];
  qtd_moradores: number;
  tem_app: boolean;
  moradores: MoradorUnidadeItem[];
}

interface RespostaPainelRamais {
  super: boolean;
  pode_editar: boolean;
  condominio_id: number;
  servidor_sip: ServidorSipCfg;
  condominios: { id: number; nome: string; portaria_autonoma: number; modulo_interfone: number }[];
  portaria_atual: PortariaSipItem | null;
  portarias_rede: PortariaSipItem[];
  blocos: { id: number; nome: string }[];
  unidades_ramais: UnidadeRamalItem[];
}

type MarcaAparelho = 'intelbras' | 'yealink' | 'grandstream' | 'fanvil' | 'microsip';

export default function PainelRamaisSipAdmin({
  abaModo,
  condominioFiltroExterno,
  aoTrocarabaModo,
}: {
  abaModo: 'ramais' | 'guia';
  condominioFiltroExterno?: number;
  aoTrocarabaModo?: (nova: 'ramais' | 'guia') => void;
}) {
  const [condSel, setCondSel] = useState<number>(condominioFiltroExterno && condominioFiltroExterno > 0 ? condominioFiltroExterno : 0);
  const [dados, setDados] = useState<RespostaPainelRamais | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [copiadoChave, setCopiadoChave] = useState<string>('');
  const [mostrarSenha, setMostrarSenha] = useState(false);

  // Edição do Ramal/Senha da Portaria
  const [editandoPortaria, setEditandoPortaria] = useState(false);
  const [formRamalPortaria, setFormRamalPortaria] = useState('');
  const [formSenhaPortaria, setFormSenhaPortaria] = useState('');
  const [salvandoPortaria, setSalvandoPortaria] = useState(false);

  // Filtros e edição inline da Lista de Ramais das Unidades
  const [buscaUnid, setBuscaUnid] = useState('');
  const [blocoFil, setBlocoFil] = useState('');
  const [appFil, setAppFil] = useState<'todos' | 'com_app' | 'sem_app'>('todos');
  const [unidadeEditId, setUnidadeEditId] = useState<number | null>(null);
  const [valorRamalUnid, setValorRamalUnid] = useState('');
  const [salvandoUnidId, setSalvandoUnidId] = useState<number | null>(null);

  // Marca selecionada no Guia Passo a Passo
  const [marcaGuia, setMarcaGuia] = useState<MarcaAparelho>('intelbras');

  useEffect(() => {
    if (condominioFiltroExterno && condominioFiltroExterno > 0) {
      setCondSel(condominioFiltroExterno);
    }
  }, [condominioFiltroExterno]);

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCarregando(true);
      try {
        const r = await api<RespostaPainelRamais>('voip_painel_ramais', {
          query: condSel > 0 ? { cond_id: condSel } : {},
        });
        setDados(r);
        if (condSel === 0 && r.condominio_id > 0) {
          setCondSel(r.condominio_id);
        }
      } catch (e) {
        setAviso({
          tipo: 'erro',
          texto: e instanceof ErroApi ? e.message : 'Erro ao carregar o painel de ramais SIP.',
        });
      } finally {
        if (!silencioso) setCarregando(false);
      }
    },
    [condSel],
  );

  useEffect(() => {
    carregar(false);
  }, [carregar]);

  useEffect(() => {
    const iv = window.setInterval(() => carregar(true), 12000);
    return () => window.clearInterval(iv);
  }, [carregar]);

  const copiarTexto = (chave: string, texto: string, msgFeedback?: string) => {
    navigator.clipboard?.writeText(texto);
    setCopiadoChave(chave);
    if (msgFeedback) {
      setAviso({ tipo: 'ok', texto: msgFeedback });
    }
    window.setTimeout(() => {
      setCopiadoChave((atual) => (atual === chave ? '' : atual));
    }, 2000);
  };

  const regenerarSenhaPortaria = async () => {
    if (!dados?.portaria_atual) return;
    if (
      !window.confirm(
        `Gerar uma nova senha SIP para a portaria de "${dados.portaria_atual.condominio_nome}"? Caso já exista um aparelho registrado, será preciso atualizar a senha nele.`,
      )
    ) {
      return;
    }
    setSalvandoPortaria(true);
    try {
      const r = await api<{ mensagem: string; senha_sip: string }>('voip_salvar_ramal_portaria', {
        metodo: 'POST',
        corpo: { condominio_id: dados.portaria_atual.condominio_id, acao: 'regenerar_senha' },
      });
      setAviso({ tipo: 'ok', texto: r.mensagem });
      setMostrarSenha(true);
      carregar(true);
    } catch (e) {
      setAviso({ tipo: 'erro', texto: e instanceof ErroApi ? e.message : 'Falha ao regenerar senha.' });
    } finally {
      setSalvandoPortaria(false);
    }
  };

  const salvarPortariaCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dados?.portaria_atual) return;
    setSalvandoPortaria(true);
    try {
      const r = await api<{ mensagem: string }>('voip_salvar_ramal_portaria', {
        metodo: 'POST',
        corpo: {
          condominio_id: dados.portaria_atual.condominio_id,
          acao: 'salvar',
          ramal_sip: formRamalPortaria.trim(),
          senha_sip: formSenhaPortaria.trim(),
        },
      });
      setAviso({ tipo: 'ok', texto: r.mensagem });
      setEditandoPortaria(false);
      carregar(true);
    } catch (err) {
      setAviso({ tipo: 'erro', texto: err instanceof ErroApi ? err.message : 'Erro ao salvar ramal SIP.' });
    } finally {
      setSalvandoPortaria(false);
    }
  };

  const salvarRamalUnidade = async (u: UnidadeRamalItem, novoValor: string) => {
    if (!dados) return;
    setSalvandoUnidId(u.id);
    try {
      const r = await api<{
        mensagem: string;
        ramal_custom: string;
        ramal_principal: string;
        atalhos_aceitos: string[];
      }>('voip_salvar_ramal_unidade', {
        metodo: 'POST',
        corpo: {
          condominio_id: dados.condominio_id,
          unidade_id: u.id,
          ramal: novoValor.trim(),
        },
      });
      setAviso({ tipo: 'ok', texto: r.mensagem });
      setDados((ant) =>
        ant
          ? {
              ...ant,
              unidades_ramais: ant.unidades_ramais.map((it) =>
                it.id === u.id
                  ? {
                      ...it,
                      ramal_custom: r.ramal_custom,
                      ramal_principal: r.ramal_principal,
                      atalhos_aceitos: r.atalhos_aceitos,
                    }
                  : it,
              ),
            }
          : ant,
      );
      setUnidadeEditId(null);
    } catch (err) {
      setAviso({ tipo: 'erro', texto: err instanceof ErroApi ? err.message : 'Erro ao salvar ramal da unidade.' });
    } finally {
      setSalvandoUnidId(null);
    }
  };

  const unidadesFiltradas = useMemo(() => {
    const lista = dados?.unidades_ramais ?? [];
    const q = buscaUnid.trim().toLowerCase();
    return lista.filter((u) => {
      if (blocoFil && String(u.bloco_id ?? '') !== blocoFil) return false;
      if (appFil === 'com_app' && !u.tem_app) return false;
      if (appFil === 'sem_app' && u.tem_app) return false;
      if (!q) return true;
      const morTxt = u.moradores.map((m) => m.nome.toLowerCase()).join(' ');
      const atTxt = u.atalhos_aceitos.join(' ').toLowerCase();
      return (
        u.label.toLowerCase().includes(q) ||
        u.ramal_principal.toLowerCase().includes(q) ||
        morTxt.includes(q) ||
        atTxt.includes(q)
      );
    });
  }, [dados?.unidades_ramais, buscaUnid, blocoFil, appFil]);

  const copiarFichaWhatsApp = () => {
    if (!dados?.portaria_atual) return;
    const p = dados.portaria_atual;
    const srv = dados.servidor_sip;
    const texto = [
      `☎️ *CONFIGURAÇÃO TELEFONE IP — ${p.condominio_nome.toUpperCase()}*`,
      ``,
      `• *Servidor SIP / Host:* ${srv.dominio}`,
      `• *IP Alternativo (sem DNS):* ${srv.ip_direto}`,
      `• *Porta SIP:* ${srv.porta}`,
      `• *Transporte:* ${srv.transporte}`,
      `• *Ramal / Usuário SIP:* ${p.usuario_sip}`,
      `• *ID de Autenticação (Auth ID):* ${p.usuario_sip}`,
      `• *Senha SIP:* ${p.senha_sip}`,
      `• *Codec Prioritário (1º):* PCMU (G.711 u-law 8000 Hz)`,
      `• *NAT Keep-Alive:* Ativado (${srv.keep_alive_seg}s) + RPort Ativado`,
      `• *Expiração Registro:* ${srv.expiracao_seg}s`,
      ``,
      `📞 *Como testar:* tire do gancho, digite o ramal do apartamento e aperte *#*`,
    ].join('\n');
    copiarTexto('ficha_zap', texto, 'Ficha técnica copiada! Pronta para colar no WhatsApp do instalador.');
  };

  const exportarListaRamaisCsv = () => {
    if (!dados?.portaria_atual) return;
    const cab = ['Bloco', 'Unidade', 'Ramal Principal (Discar)', 'Atalhos Aceitos', 'Moradores', 'App VoIP Ativo'];
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const linhas = unidadesFiltradas.map((u) =>
      [
        u.bloco_nome || '—',
        u.numero,
        u.ramal_principal,
        u.atalhos_aceitos.join(' / '),
        u.moradores.map((m) => m.nome).join(', ') || 'Sem morador vinculado',
        u.tem_app ? 'Sim' : 'Não',
      ]
        .map(esc)
        .join(';'),
    );
    const csv = '\uFEFF' + [cab.map(esc).join(';'), ...linhas].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lista-ramais-${dados.portaria_atual.condominio_nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const imprimirListaGuarita = () => {
    if (!dados?.portaria_atual) return;
    const p = dados.portaria_atual;
    const win = window.open('', '_blank', 'width=920,height=760');
    if (!win) return;
    const linhasHtml = unidadesFiltradas
      .map(
        (u) => `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-weight:700;">${u.label}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:15px;font-weight:900;color:#0f172a;">${u.ramal_principal}#</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:12px;color:#475569;">${u.atalhos_aceitos.join(', ') || '—'}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;">${u.moradores.map((m) => m.nome).join(', ') || '—'}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:700;color:${u.tem_app ? '#047857' : '#94a3b8'};">${u.tem_app ? 'App Ativo' : 'Sem App'}</td>
        </tr>`,
      )
      .join('');

    win.document.write(`<!doctype html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Lista de Ramais — ${p.condominio_nome}</title>
        <style>
          body { font-family: Arial, Helvetica, sans-serif; margin: 24px; color: #0f172a; }
          h1 { margin: 0 0 4px 0; font-size: 20px; }
          .sub { font-size: 12px; color: #475569; margin-bottom: 16px; }
          .dica { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 10px 14px; border-radius: 8px; font-size: 12px; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; }
          th { text-align: left; font-size: 11px; text-transform: uppercase; background: #0f172a; color: #fff; padding: 8px 10px; }
          @media print { .no-print { display: none; } body { margin: 10px; } }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom:14px;text-align:right;">
          <button onclick="window.print()" style="padding:8px 16px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-weight:bold;cursor:pointer;">🖨️ Imprimir Folha da Guarita</button>
        </div>
        <h1>☎️ Lista Oficial de Ramais — ${p.condominio_nome}</h1>
        <div class="sub">Ramal SIP da Portaria: <strong>${p.ramal_sip}</strong> • Total listado: <strong>${unidadesFiltradas.length} unidades</strong></div>
        <div class="dica">
          <strong>Como ligar pelo Telefone IP da Guarita:</strong> Tire o fone do gancho, digite o <strong>Ramal Principal</strong> da unidade desejada e pressione a tecla <strong>#</strong> (ou botão Discar/Send).
        </div>
        <table>
          <thead>
            <tr>
              <th>Bloco / Unidade</th>
              <th>Discar no Telefone IP</th>
              <th>Atalhos Alternativos</th>
              <th>Moradores Cadastrados</th>
              <th>Status App</th>
            </tr>
          </thead>
          <tbody>${linhasHtml}</tbody>
        </table>
      </body>
      </html>`);
    win.document.close();
  };

  const pAtual = dados?.portaria_atual;
  const srv = dados?.servidor_sip;
  const onlineRede = (dados?.portarias_rede ?? []).filter((x) => x.registrado_online).length;

  return (
    <div className="space-y-6">
      {aviso && (
        <div
          className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-sm font-semibold ${
            aviso.tipo === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {aviso.tipo === 'ok' ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
            <span>{aviso.texto}</span>
          </div>
          <button type="button" onClick={() => setAviso(null)} className="cursor-pointer opacity-75 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── SELETOR DE CONDOMÍNIO E VISÃO DE REDE (SUPER ADMIN) ────────────── */}
      {dados?.super && dados.portarias_rede.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-700 flex items-center gap-2">
                <Building2 size={16} className="text-blue-600" />
                Visão Geral das Portarias SIP da Rede ({onlineRede}/{dados.portarias_rede.length} telefones IP online)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Clique em qualquer condomínio abaixo para carregar suas credenciais SIP, lista de ramais de unidades e guia passo a passo pré-preenchido.
              </p>
            </div>
            <button
              type="button"
              onClick={() => carregar(false)}
              disabled={carregando}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 cursor-pointer shrink-0"
            >
              <RefreshCw size={14} className={carregando ? 'animate-spin text-blue-600' : ''} />
              Atualizar Status SIP
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {dados.portarias_rede.map((pr) => {
              const sel = pr.condominio_id === condSel;
              return (
                <button
                  key={pr.condominio_id}
                  type="button"
                  onClick={() => setCondSel(pr.condominio_id)}
                  className={`text-left p-3.5 rounded-xl border transition cursor-pointer ${
                    sel
                      ? 'bg-blue-50/90 border-blue-500 ring-2 ring-blue-200'
                      : 'bg-slate-50/70 hover:bg-slate-100 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-xs text-slate-900 truncate">{pr.condominio_nome}</span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold shrink-0 ${
                        pr.registrado_online
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-slate-200/70 text-slate-600'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          pr.registrado_online ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                        }`}
                      />
                      {pr.registrado_online ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-slate-500">
                      Ramal Portaria: <strong className="font-mono text-slate-900">{pr.ramal_sip}</strong>
                    </span>
                    <span className="text-[11px] text-slate-500">{pr.total_unidades ?? 0} unid.</span>
                  </div>
                  {pr.registrado_online && pr.ip_remoto && (
                    <div className="mt-1 text-[10.5px] text-emerald-700 font-mono truncate">
                      IP: {pr.ip_remoto}:{pr.porta_remota}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── CARD DINÂMICO DE CREDENCIAIS SIP DA PORTARIA SELECIONADA ───────── */}
      {pAtual && srv && (
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-5 sm:p-6 shadow-lg border border-slate-700/70 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${
                  pAtual.registrado_online
                    ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                    : 'bg-blue-500/20 border-blue-400/30 text-blue-300'
                }`}
              >
                <PhoneCall size={24} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-black tracking-tight">
                    Conta SIP da Portaria — {pAtual.condominio_nome}
                  </h2>
                  {pAtual.registrado_online ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
                      <Wifi size={13} /> Telefone IP Conectado ({pAtual.ip_remoto}:{pAtual.porta_remota})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-200 border border-amber-400/30">
                      ⚪ Aguardando Registro do Aparelho na Porta 5060
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  {pAtual.registrado_online && pAtual.user_agent
                    ? `Aparelho identificado: ${pAtual.user_agent} • Último sinal: ${pAtual.ultimo_registro || 'agora'}`
                    : 'Use os dados abaixo para registrar qualquer Telefone IP físico (Intelbras, Yealink, Grandstream, Fanvil) ou Softphone no PC da guarita.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={copiarFichaWhatsApp}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold shadow transition cursor-pointer"
              >
                {copiadoChave === 'ficha_zap' ? <Check size={14} /> : <Share2 size={14} />}
                Copiar Ficha p/ Instalador
              </button>

              {abaModo === 'ramais' && aoTrocarabaModo && (
                <button
                  type="button"
                  onClick={() => aoTrocarabaModo('guia')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold shadow transition cursor-pointer"
                >
                  <BookOpen size={14} />
                  Ver Passo a Passo Completo
                </button>
              )}

              {dados.pode_editar && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setFormRamalPortaria(pAtual.ramal_sip);
                      setFormSenhaPortaria(pAtual.senha_sip);
                      setEditandoPortaria((v) => !v);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-100 text-xs font-bold border border-white/15 cursor-pointer"
                  >
                    <Edit2 size={13} />
                    Personalizar Ramal
                  </button>
                  <button
                    type="button"
                    disabled={salvandoPortaria}
                    onClick={regenerarSenhaPortaria}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-bold border border-amber-400/30 cursor-pointer disabled:opacity-50"
                  >
                    <KeyRound size={13} />
                    Nova Senha
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Grade de Parâmetros Prontos para Copiar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              {
                id: 'srv',
                rotulo: 'Servidor SIP (Host / Domínio)',
                valor: srv.dominio,
                sub: `Ou IP direto: ${srv.ip_direto}`,
              },
              {
                id: 'porta',
                rotulo: 'Porta SIP & Transporte',
                valor: `${srv.porta}`,
                sub: `Protocolo: ${srv.transporte} • Realm: ${srv.realm}`,
              },
              {
                id: 'user',
                rotulo: 'Ramal / Usuário / Auth ID',
                valor: pAtual.usuario_sip,
                sub: 'Usar o mesmo em User ID e Auth ID',
                destaque: 'text-emerald-300',
              },
              {
                id: 'codec',
                rotulo: 'Codec de Áudio (1ª Opção)',
                valor: 'PCMU (G.711u)',
                sub: '8000 Hz • NAT Keep-Alive: 25s',
              },
            ].map((item) => (
              <div
                key={item.id}
                className="bg-white/5 border border-white/10 rounded-xl p-3.5 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10.5px] uppercase font-bold text-slate-400">{item.rotulo}</span>
                  <button
                    type="button"
                    onClick={() => copiarTexto(item.id, item.valor)}
                    className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 cursor-pointer"
                    title="Copiar valor"
                  >
                    {copiadoChave === item.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  </button>
                </div>
                <div className={`font-mono font-black text-base mt-1 ${item.destaque || 'text-white'}`}>
                  {item.valor}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">{item.sub}</div>
              </div>
            ))}

            {/* Card Senha SIP */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10.5px] uppercase font-bold text-slate-400">Senha SIP (Password)</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setMostrarSenha((v) => !v)}
                    className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-bold text-slate-200 cursor-pointer"
                  >
                    {mostrarSenha ? 'Ocultar' : 'Ver'}
                  </button>
                  <button
                    type="button"
                    onClick={() => copiarTexto('pass', pAtual.senha_sip, 'Senha SIP copiada!')}
                    className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 cursor-pointer"
                    title="Copiar senha SIP"
                  >
                    {copiadoChave === 'pass' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  </button>
                </div>
              </div>
              <div className="font-mono font-black text-base mt-1 text-amber-300 break-all">
                {mostrarSenha ? pAtual.senha_sip : '••••••••••••'}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">Autenticação Digest MD5</div>
            </div>
          </div>

          {/* Formulário Inline de Edição do Ramal/Senha SIP da Portaria */}
          {editandoPortaria && dados.pode_editar && (
            <form
              onSubmit={salvarPortariaCustom}
              className="bg-slate-950/70 border border-slate-700 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
            >
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-300 mb-1">
                  Número do Ramal / Usuário SIP da Portaria
                </label>
                <input
                  type="text"
                  required
                  value={formRamalPortaria}
                  onChange={(e) => setFormRamalPortaria(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white font-mono text-sm outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-300 mb-1">
                  Senha SIP Personalizada
                </label>
                <input
                  type="text"
                  required
                  value={formSenhaPortaria}
                  onChange={(e) => setFormSenhaPortaria(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-amber-300 font-mono text-sm outline-none focus:border-blue-400"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={salvandoPortaria}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold cursor-pointer disabled:opacity-50"
                >
                  {salvandoPortaria ? 'Salvando...' : 'Salvar Conta SIP'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditandoPortaria(false)}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODO 1: LISTA COMPLETA E EDITÁVEL DE RAMAIS DAS UNIDADES
         ═══════════════════════════════════════════════════════════════════════ */}
      {abaModo === 'ramais' && pAtual && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                📋 Lista de Ramais das Unidades — {pAtual.condominio_nome} ({unidadesFiltradas.length} unidades)
              </h3>
              <p className="text-xs text-slate-500">
                Estes são os números exatos para discar no <b>Telefone IP da Portaria</b> (seguido de <code className="font-mono font-bold">#</code>), nos <b>Leitores Faciais</b> ou no <b>App do Morador</b>.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={imprimirListaGuarita}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                <Printer size={14} />
                Imprimir Lista p/ Guarita
              </button>
              <button
                type="button"
                onClick={exportarListaRamaisCsv}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
              >
                <Download size={14} />
                Baixar CSV
              </button>
            </div>
          </div>

          {/* Barra de Pesquisa e Filtros */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
            <div className="lg:col-span-6 relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={buscaUnid}
                onChange={(e) => setBuscaUnid(e.target.value)}
                placeholder="Pesquisar por bloco, unidade, ramal ou nome do morador..."
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div className="lg:col-span-3">
              <select
                value={blocoFil}
                onChange={(e) => setBlocoFil(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500"
              >
                <option value="">Todos os Blocos / Torres</option>
                {(dados?.blocos ?? []).map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-3">
              <select
                value={appFil}
                onChange={(e) => setAppFil(e.target.value as 'todos' | 'com_app' | 'sem_app')}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500"
              >
                <option value="todos">Todas as Unidades</option>
                <option value="com_app">🟢 Com App VoIP Ativo</option>
                <option value="sem_app">⚪ Sem App Instalado</option>
              </select>
            </div>
          </div>

          {/* Tabela de Ramais */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {[
                    'Bloco / Unidade',
                    'Ramal Principal (Discar)',
                    'Atalhos Aceitos',
                    'Moradores Vinculados',
                    'Status App VoIP',
                    ...(dados?.pode_editar ? ['Personalizar'] : []),
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left text-[11px] font-extrabold uppercase tracking-wide text-slate-500 px-3.5 py-3 border-b border-slate-200 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {unidadesFiltradas.map((u) => {
                  const emEdicao = unidadeEditId === u.id;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/90 transition-colors">
                      <td className="px-3.5 py-3 border-b border-slate-100 text-sm font-extrabold text-slate-900 whitespace-nowrap">
                        {u.label}
                      </td>

                      <td className="px-3.5 py-3 border-b border-slate-100 whitespace-nowrap">
                        {emEdicao ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={valorRamalUnid}
                              onChange={(e) => setValorRamalUnid(e.target.value)}
                              placeholder="Ex.: 101"
                              className="w-28 px-2.5 py-1 border border-blue-400 rounded-lg font-mono text-sm font-bold outline-none"
                            />
                            <button
                              type="button"
                              disabled={salvandoUnidId === u.id}
                              onClick={() => salvarRamalUnidade(u, valorRamalUnid)}
                              className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-xs font-bold cursor-pointer"
                            >
                              Salvar
                            </button>
                            <button
                              type="button"
                              onClick={() => setUnidadeEditId(null)}
                              className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-2">
                            <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-emerald-300 font-mono text-sm font-black">
                              {u.ramal_principal}#
                            </span>
                            {u.ramal_custom && (
                              <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-200">
                                Fixo
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => copiarTexto(`u_${u.id}`, u.ramal_principal)}
                              className="p-1 rounded hover:bg-slate-200 text-slate-500 cursor-pointer"
                              title="Copiar ramal"
                            >
                              {copiadoChave === `u_${u.id}` ? (
                                <Check size={13} className="text-emerald-600" />
                              ) : (
                                <Copy size={13} />
                              )}
                            </button>
                          </div>
                        )}
                      </td>

                      <td className="px-3.5 py-3 border-b border-slate-100 text-xs font-mono text-slate-500">
                        {u.atalhos_aceitos.length > 0 ? u.atalhos_aceitos.join(', ') : '—'}
                      </td>

                      <td className="px-3.5 py-3 border-b border-slate-100 text-xs text-slate-700">
                        {u.moradores.length === 0 ? (
                          <span className="text-slate-400 italic">Sem morador cadastrado</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {u.moradores.map((m) => (
                              <span
                                key={m.id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-semibold"
                              >
                                {m.nome}
                                <span
                                  className={`text-[10px] px-1 rounded ${
                                    m.tem_app ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-500'
                                  }`}
                                >
                                  {m.canal}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      <td className="px-3.5 py-3 border-b border-slate-100 whitespace-nowrap">
                        {u.tem_app ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 size={12} /> Toca no App
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500">
                            Aguardando App
                          </span>
                        )}
                      </td>

                      {dados?.pode_editar && (
                        <td className="px-3.5 py-3 border-b border-slate-100 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setUnidadeEditId(u.id);
                                setValorRamalUnid(u.ramal_custom || u.ramal_principal);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-xs font-bold text-slate-700 cursor-pointer"
                            >
                              <Edit2 size={12} /> Editar
                            </button>
                            {u.ramal_custom && (
                              <button
                                type="button"
                                disabled={salvandoUnidId === u.id}
                                onClick={() => salvarRamalUnidade(u, '')}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                title="Restaurar cálculo automático"
                              >
                                <RotateCcw size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}

                {unidadesFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-sm text-slate-400">
                      Nenhuma unidade encontrada para o filtro informado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODO 2: PASSO A PASSO DINÂMICO DE CONFIGURAÇÃO (POR MARCA DE APARELHO)
         ═══════════════════════════════════════════════════════════════════════ */}
      {abaModo === 'guia' && pAtual && srv && (
        <div className="space-y-5">
          {/* Seletor de Marca / Modelo */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <BookOpen size={19} className="text-blue-600" />
                Passo a Passo de Configuração — Pré-preenchido para {pAtual.condominio_nome}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Escolha abaixo a marca do Telefone IP (ou computador Windows) que será instalado na portaria para ver exatamente onde preencher cada campo:
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
              {[
                { id: 'intelbras', titulo: 'Intelbras', sub: 'TIP 125i • TIP 200 • TIP 300' },
                { id: 'yealink', titulo: 'Yealink', sub: 'SIP-T19P • T21P • T30 • T31P' },
                { id: 'grandstream', titulo: 'Grandstream', sub: 'GXP1610 • GXP1625 • GRP2601' },
                { id: 'fanvil', titulo: 'Fanvil / Padrão SIP', sub: 'X1S • X3U • Outras Marcas' },
                { id: 'microsip', titulo: 'PC Windows (Grátis)', sub: 'Softphone MicroSIP + Headset' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMarcaGuia(m.id as MarcaAparelho)}
                  className={`p-3.5 rounded-xl border text-left transition cursor-pointer ${
                    marcaGuia === m.id
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                  }`}
                >
                  <div className="font-extrabold text-sm flex items-center gap-1.5">
                    {m.id === 'microsip' ? <Monitor size={15} /> : <PhoneCall size={15} />}
                    {m.titulo}
                  </div>
                  <div className={`text-[11px] mt-0.5 ${marcaGuia === m.id ? 'text-blue-100' : 'text-slate-500'}`}>
                    {m.sub}
                  </div>
                </button>
              ))}
            </div>

            {/* Passo a Passo Específico da Marca Selecionada */}
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-4">
              {marcaGuia === 'intelbras' && (
                <>
                  <h4 className="font-black text-slate-900 text-sm uppercase tracking-wide">
                     Roteiro Oficial — Telefones IP Intelbras (TIP 125i / TIP 200 / TIP 300)
                  </h4>
                  <ol className="space-y-3 text-sm text-slate-700 list-decimal list-inside">
                    <li>
                      Conecte o cabo de rede no aparelho e pressione a tecla <b>OK</b> (ou botão central) no telefone físico para ver o <b>Endereço IP</b> dele (ex.: <code className="font-mono bg-white px-1.5 py-0.5 rounded border">192.168.1.50</code>).
                    </li>
                    <li>
                      Abra esse IP no navegador do computador da portaria e faça login no aparelho (padrão de fábrica Intelbras: usuário <code className="font-mono font-bold">admin</code> / senha <code className="font-mono font-bold">admin</code>).
                    </li>
                    <li>
                      Acesse o menu superior <b>Conta</b> &rarr; <b>Básico</b> (Conta 1) e preencha:
                      <ul className="mt-2 ml-5 space-y-1.5 list-disc text-xs bg-white p-3.5 rounded-xl border border-slate-200">
                        <li><b>Ativar Conta:</b> <span className="font-bold text-emerald-700">Habilitado</span></li>
                        <li><b>Nome de Exibição / Rótulo:</b> <code className="font-mono font-bold">Portaria</code></li>
                        <li><b>Usuário / Conta:</b> <code className="font-mono font-bold text-blue-700">{pAtual.usuario_sip}</code></li>
                        <li><b>ID de Autenticação:</b> <code className="font-mono font-bold text-blue-700">{pAtual.usuario_sip}</code></li>
                        <li><b>Senha:</b> <code className="font-mono font-bold text-amber-700">{pAtual.senha_sip}</code></li>
                        <li><b>Servidor SIP 1:</b> <code className="font-mono font-bold">{srv.dominio}</code> (ou <code className="font-mono">{srv.ip_direto}</code>) • <b>Porta:</b> <code className="font-mono font-bold">{srv.porta}</code></li>
                        <li><b>Transporte:</b> <code className="font-mono font-bold">UDP</code> • <b>Período de Registro:</b> <code className="font-mono font-bold">120</code></li>
                      </ul>
                    </li>
                    <li>
                      No menu lateral <b>Conta</b> &rarr; <b>Codec</b>: deixe habilitados apenas <b>PCMU (G.711U)</b> em 1º lugar e <b>PCMA (G.711A)</b> em 2º lugar.
                    </li>
                    <li>
                      No menu lateral <b>Conta</b> &rarr; <b>Avançado</b>: marque <b>Keep Alive = Habilitado</b> (Intervalo <code className="font-mono">25</code>s) e <b>RPort = Habilitado</b>. Clique em <b>Salvar</b>. Em até 5 segundos o status mudará para <b>Registrado</b>!
                    </li>
                  </ol>
                </>
              )}

              {marcaGuia === 'yealink' && (
                <>
                  <h4 className="font-black text-slate-900 text-sm uppercase tracking-wide">
                    Roteiro Oficial — Telefones IP Yealink (SIP-T19P / T21P / T30 / T31P / T33G)
                  </h4>
                  <ol className="space-y-3 text-sm text-slate-700 list-decimal list-inside">
                    <li>
                      Aperte a tecla <b>OK</b> uma vez no aparelho Yealink para descobrir o IP local na tela e acesse-o no navegador (padrão: <code className="font-mono font-bold">admin</code> / <code className="font-mono font-bold">admin</code>).
                    </li>
                    <li>
                      Clique na aba <b>Account (Conta)</b> &rarr; <b>Register (Registro)</b> em <b>Account 1</b> e preencha:
                      <ul className="mt-2 ml-5 space-y-1.5 list-disc text-xs bg-white p-3.5 rounded-xl border border-slate-200">
                        <li><b>Line Active:</b> <span className="font-bold text-emerald-700">Enabled</span></li>
                        <li><b>Label / Display Name:</b> <code className="font-mono font-bold">Portaria</code></li>
                        <li><b>Register Name (Auth ID):</b> <code className="font-mono font-bold text-blue-700">{pAtual.usuario_sip}</code></li>
                        <li><b>User Name:</b> <code className="font-mono font-bold text-blue-700">{pAtual.usuario_sip}</code></li>
                        <li><b>Password:</b> <code className="font-mono font-bold text-amber-700">{pAtual.senha_sip}</code></li>
                        <li><b>Server Host 1:</b> <code className="font-mono font-bold">{srv.dominio}</code> • <b>Port:</b> <code className="font-mono font-bold">{srv.porta}</code> • <b>Transport:</b> <code className="font-mono font-bold">UDP</code></li>
                        <li><b>Server Expires:</b> <code className="font-mono font-bold">120</code> • <b>NAT:</b> <code className="font-mono font-bold">UDP Keep-Alive</code></li>
                      </ul>
                    </li>
                    <li>
                      Vá em <b>Account</b> &rarr; <b>Codec</b> e deixe <b>PCMU</b> no topo da coluna <i>Enabled Codecs</i>. Clique em <b>Confirm</b>.
                    </li>
                  </ol>
                </>
              )}

              {marcaGuia === 'grandstream' && (
                <>
                  <h4 className="font-black text-slate-900 text-sm uppercase tracking-wide">
                    Roteiro Oficial — Telefones IP Grandstream (GXP1610 / GXP1625 / GRP2601 / GRP2602)
                  </h4>
                  <ol className="space-y-3 text-sm text-slate-700 list-decimal list-inside">
                    <li>
                      Veja o IP no visor do aparelho Grandstream e acesse pelo navegador.
                    </li>
                    <li>
                      Vá em <b>Accounts</b> &rarr; <b>Account 1</b> &rarr; <b>General Settings</b>:
                      <ul className="mt-2 ml-5 space-y-1.5 list-disc text-xs bg-white p-3.5 rounded-xl border border-slate-200">
                        <li><b>Account Active:</b> <span className="font-bold text-emerald-700">Yes</span></li>
                        <li><b>SIP Server:</b> <code className="font-mono font-bold">{srv.dominio}:5060</code></li>
                        <li><b>SIP User ID:</b> <code className="font-mono font-bold text-blue-700">{pAtual.usuario_sip}</code></li>
                        <li><b>Authenticate ID:</b> <code className="font-mono font-bold text-blue-700">{pAtual.usuario_sip}</code></li>
                        <li><b>Authenticate Password:</b> <code className="font-mono font-bold text-amber-700">{pAtual.senha_sip}</code></li>
                      </ul>
                    </li>
                    <li>
                      Em <b>Account 1 &rarr; Network Settings</b>: marque <b>NAT Traversal = Keep-Alive</b>. Em <b>Audio Settings</b>: escolha <b>choice 1 = PCMU</b>. Clique em <b>Save and Apply</b>.
                    </li>
                  </ol>
                </>
              )}

              {marcaGuia === 'fanvil' && (
                <>
                  <h4 className="font-black text-slate-900 text-sm uppercase tracking-wide">
                    Roteiro Oficial — Fanvil (X1S / X3U) e Outros Aparelhos SIP Padrão RFC 3261
                  </h4>
                  <ol className="space-y-3 text-sm text-slate-700 list-decimal list-inside">
                    <li>
                      Acesse a página web do aparelho IP e abra <b>Line (Linha) &rarr; SIP &rarr; Line 1</b>.
                    </li>
                    <li>
                      Preencha <b>Server Address =</b> <code className="font-mono font-bold">{srv.dominio}</code>, <b>Server Port =</b> <code className="font-mono font-bold">5060</code>, <b>Transport =</b> <code className="font-mono font-bold">UDP</code>.
                    </li>
                    <li>
                      Preencha <b>Username =</b> <code className="font-mono font-bold text-blue-700">{pAtual.usuario_sip}</code>, <b>Authentication User =</b> <code className="font-mono font-bold text-blue-700">{pAtual.usuario_sip}</code> e <b>Authentication Password =</b> <code className="font-mono font-bold text-amber-700">{pAtual.senha_sip}</code>.
                    </li>
                    <li>
                      Marque <b>Activate = Enabled</b>, codec <b>G.711U (PCMU)</b> em 1º lugar e <b>Keep-Alive = Enabled</b>. Clique em <b>Apply</b>.
                    </li>
                  </ol>
                </>
              )}

              {marcaGuia === 'microsip' && (
                <>
                  <h4 className="font-black text-slate-900 text-sm uppercase tracking-wide">
                    Roteiro Oficial — Softphone MicroSIP no Computador Windows da Portaria
                  </h4>
                  <ol className="space-y-3 text-sm text-slate-700 list-decimal list-inside">
                    <li>
                      Baixe e instale o <b>MicroSIP</b> gratuito no PC da portaria (<code className="font-mono">microsip.org/downloads</code>) e conecte um headset/fone com microfone.
                    </li>
                    <li>
                      Clique na setinha do canto superior direito do MicroSIP &rarr; <b>Adicionar Conta (Add Account)</b> e preencha:
                      <ul className="mt-2 ml-5 space-y-1.5 list-disc text-xs bg-white p-3.5 rounded-xl border border-slate-200">
                        <li><b>Nome da Conta:</b> <code className="font-mono font-bold">Portaria {pAtual.condominio_nome}</code></li>
                        <li><b>Servidor SIP:</b> <code className="font-mono font-bold">{srv.dominio}:5060</code></li>
                        <li><b>Domínio:</b> <code className="font-mono font-bold">{srv.realm}</code></li>
                        <li><b>Usuário:</b> <code className="font-mono font-bold text-blue-700">{pAtual.usuario_sip}</code> • <b>Login:</b> <code className="font-mono font-bold text-blue-700">{pAtual.usuario_sip}</code></li>
                        <li><b>Senha:</b> <code className="font-mono font-bold text-amber-700">{pAtual.senha_sip}</code></li>
                        <li><b>Transporte:</b> <code className="font-mono font-bold">UDP</code> • <b>Manter Ativo (Keep-Alive):</b> <code className="font-mono font-bold">25</code></li>
                      </ul>
                    </li>
                    <li>
                      Clique em <b>Salvar</b>: o rodapé do MicroSIP ficará verde (<b>Online</b>) na mesma hora!
                    </li>
                  </ol>
                </>
              )}
            </div>
          </div>

          {/* Como Operar na Guarita + Solução de Problemas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
              <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <ShieldCheck size={18} className="text-emerald-600" />
                Como Usar no Dia a Dia da Guarita
              </h4>
              <ul className="space-y-2.5 text-xs text-slate-700">
                <li className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <b>1. Ligar da Portaria para qualquer Apartamento/Casa:</b> tire o fone do gancho, digite o <b>Ramal Principal</b> da unidade (consulte na aba <i>Painel de Ramais</i> ou na folha impressa) e aperte <b>#</b>. O celular dos moradores toca imediatamente (CallKit nativo no iPhone e tela cheia no Android).
                </li>
                <li className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <b>2. Receber chamadas de Moradores ou Transbordo do Leitor Facial:</b> quando um morador ligar para a Portaria pelo App (ou quando ninguém atender no apartamento em 20s no leitor facial), o Telefone IP físico toca na guarita mostrando no visor quem está chamando!
                </li>
                <li className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <b>3. Uso simultâneo com o Navegador:</b> o Telefone IP físico não desativa o painel web da Portaria — o porteiro pode atender tanto tirando o fone do gancho quanto clicando na tela do computador.
                </li>
              </ul>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
              <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <HelpCircle size={18} className="text-amber-600" />
                Diagnóstico Rápido (Caso Não Registre ou Fique sem Áudio)
              </h4>
              <ul className="space-y-2.5 text-xs text-slate-700">
                <li className="p-3 rounded-xl bg-amber-50/60 border border-amber-200/80">
                  <b>⚠️ Desative o &ldquo;SIP ALG&rdquo; no roteador da operadora:</b> modems de fibra (Claro, Vivo, Oi, Brisanet) costumam alterar pacotes na porta 5060. Desmarcar <i>SIP ALG</i> nas configurações de NAT/Firewall do roteador resolve 95% dos casos de falha de áudio ou registro.
                </li>
                <li className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <b>🌐 Falha de DNS na rede da guarita:</b> se o aparelho exibir <i>Register Failed</i> usando <code className="font-mono">{srv.dominio}</code>, troque o campo Servidor SIP diretamente pelo IP fixo <code className="font-mono font-bold">{srv.ip_direto}</code> (mantendo o Domínio/Realm como <code className="font-mono">{srv.realm}</code>).
                </li>
                <li className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <b>🔊 Ligação conecta mas fica muda:</b> confirme que o codec <b>PCMU (G.711 u-law • 8000 Hz)</b> está como <b>1ª opção</b> na lista de codecs da conta e que <b>RPort / Keep-Alive</b> estão ativados.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
