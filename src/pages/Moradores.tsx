import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Users, Plus, Trash2, Search, Home, CreditCard, Phone, Car, Pencil, Lock, Unlock, RotateCcw, User, X, AlertTriangle, RefreshCw, FolderOpen, FileText, UserX, Building2 } from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import { selecionarCondominio, useSessao } from '../lib/useSessao';
import { FormNovoMorador, ModalConfirmacao, ModalEditar, ModalSync, type Apoio, type Aviso, type TipoConfirmacao } from './moradores/AcoesMorador';
import ModalDocumentosCadastro, { abrirDocumentoProtegido, type DocumentoCadastro } from '../components/ModalDocumentosCadastro';

// Paridade com src/views/consulta_pessoas.php (modulo unificado de moradores).
// Listagem (abas, filtro por bloco, busca, paginacao 25, cards por bloco, veiculos, foto) +
// acoes: cadastrar, editar (com veiculos/reset de senha), bloquear/liberar, excluir, restaurar,
// excluir definitivo e sincronizar catracas (em lote). Componentes das acoes em ./moradores/AcoesMorador.tsx.

interface Veiculo { id: number; placa: string; marca: string | null; modelo: string | null; vaga_garagem: string | null }
export interface VinculadoUnidade {
  id: number;
  unidade_id: number;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  relacao: string | null;
  ativo: boolean;
  foto_base64: string | null;
  tem_arquivo_foto?: boolean;
  observacao: string | null;
  grupo_acesso_id: number | null;
  terminais_acesso: number[];
}
export interface Morador {
  id: number;
  condominio_id?: number | null;
  condominio_nome?: string | null;
  nome: string;
  cpf: string | null;
  relacao: string | null;
  ativo: boolean;
  telefone: string | null;
  email: string | null;
  foto_base64: string | null;
  observacao: string | null;
  excluido: boolean | null;
  unidade_id: number | null;
  unidade_numero: string | null;
  bloco_id: number | null;
  bloco_nome: string | null;
  ramal?: string | null;
  ramal_custom?: string | null;
  ramal_automatico?: string | null;
  codigos_interfone?: string[];
  grupo_acesso_id: number | null;
  terminais_acesso: number[];
  veiculos: Veiculo[];
  documentos?: DocumentoCadastro[];
  vinculados?: VinculadoUnidade[];
  importado_leitor?: boolean;
  cpf_pendente?: boolean;
  id_leitor_facial?: string | null;
}
interface ResumoFiltros {
  todos?: number;
  titulares?: number;
  inquilinos: number;
  conjuges: number;
  dependentes?: number;
  funcionarios?: number;
  com_docs: number;
  inquilinos_sem_contrato: number;
}
interface ResumoCondominioItem {
  id: number;
  nome: string;
  ativo: boolean;
  total_pessoas: number;
  total_lixeira: number;
  total_unidades: number;
}
interface Pagina {
  visao_geral?: boolean;
  moradores: Morador[];
  total_itens: number;
  total_paginas: number;
  pag_atual: number;
  total_sem_cpf?: number;
  total_ativos_geral?: number;
  total_lixeira_geral?: number;
  total_app_ativo?: number;
  total_equipe_gestao?: number;
  total_sistema_moradores?: number;
  total_sistema_lixeira?: number;
  por_condominio?: ResumoCondominioItem[];
  resumo_filtros?: ResumoFiltros;
}

type Aba = 'lista' | 'lixeira' | 'novo';
type FiltroRapido =
  | ''
  | 'titulares'
  | 'inquilinos'
  | 'conjuges'
  | 'dependentes'
  | 'funcionarios'
  | 'com_docs'
  | 'inquilinos_sem_contrato';
type AcaoCard = 'editar' | 'documentos' | TipoConfirmacao;

function formatarCpf(cpf: string | null) {
  const d = (cpf ?? '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : cpf || null;
}

function Paginacao({ atual, total, ir }: { atual: number; total: number; ir: (p: number) => void }) {
  if (total <= 1) return null;
  const paginas: number[] = [];
  for (let p = Math.max(1, atual - 2); p <= Math.min(total, atual + 2); p++) paginas.push(p);
  const btn = 'min-w-9 h-9 px-2 rounded-lg text-sm font-bold border';
  return (
    <div className="flex justify-center gap-1.5 mt-8 flex-wrap">
      <button disabled={atual === 1} onClick={() => ir(atual - 1)} className={`${btn} bg-white border-slate-200 disabled:opacity-40`}>‹</button>
      {paginas[0] > 1 && <><button onClick={() => ir(1)} className={`${btn} bg-white border-slate-200`}>1</button><span className="px-1 self-center">…</span></>}
      {paginas.map((p) => (
        <button key={p} onClick={() => ir(p)} className={`${btn} ${p === atual ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-700'}`}>{p}</button>
      ))}
      {paginas[paginas.length - 1] < total && <><span className="px-1 self-center">…</span><button onClick={() => ir(total)} className={`${btn} bg-white border-slate-200`}>{total}</button></>}
      <button disabled={atual === total} onClick={() => ir(atual + 1)} className={`${btn} bg-white border-slate-200 disabled:opacity-40`}>›</button>
    </div>
  );
}

function portasLiberadasNoApp(m: Morador, apoio: Apoio): string[] {
  const ehRemota = (apoio.condominio?.portaria_autonoma ?? 0) === 1;
  let explicito: number[] = (m.terminais_acesso ?? []).map(Number);
  if (m.grupo_acesso_id) {
    const grp = apoio.grupos_acesso.find((g) => g.id === m.grupo_acesso_id);
    if (grp?.terminais_acesso) {
      try { explicito = (JSON.parse(grp.terminais_acesso) as (string | number)[]).map(Number); } catch { explicito = []; }
    }
  }
  return apoio.controladores
    .filter((c) => {
      const ehBlocoDele = m.bloco_id !== null && c.bloco_id !== null && Number(c.bloco_id) === Number(m.bloco_id);
      const ehGeral = c.bloco_id === null || c.tipo_acesso === 'geral_pedestre' || c.tipo_acesso === 'geral_veiculo';
      const marcado = explicito.includes(Number(c.id));
      return ehBlocoDele || marcado || (ehGeral && ehRemota);
    })
    .map((c) => c.nome);
}

function CardMorador({ m, apoio, lixeira, temBlacklist, onFoto, onAcao }: { m: Morador; apoio: Apoio; lixeira: boolean; temBlacklist: boolean; onFoto: (src: string, nome: string) => void; onAcao: (a: AcaoCard, m: Morador) => void }) {
  const bloqueado = !m.ativo;
  const cpf = formatarCpf(m.cpf);
  const semCpf = Boolean(m.cpf_pendente || !cpf);
  const estilo = lixeira
    ? 'border-red-400 bg-red-50/60 grayscale-[50%]'
    : bloqueado
      ? 'border-red-500 bg-red-50 ring-2 ring-red-100'
      : semCpf
        ? 'border-amber-400 bg-amber-50/20 ring-2 ring-amber-100'
        : 'border-slate-200 bg-white';
  const portasApp = m.ativo && !lixeira ? portasLiberadasNoApp(m, apoio) : [];

  return (
    <div className={`rounded-2xl border p-5 flex flex-col h-full transition-all hover:shadow-lg hover:-translate-y-0.5 ${estilo}`}>
      <div className="flex gap-4 items-start">
        {m.foto_base64 ? (
          <img src={m.foto_base64} alt={`Foto de ${m.nome}`} title="Ver foto em tela cheia" onClick={() => onFoto(m.foto_base64!, m.nome)}
            className="w-16 h-16 rounded-full object-cover border-[3px] border-slate-50 shadow cursor-pointer hover:scale-105 hover:border-blue-500 transition shrink-0" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-slate-100 border-[3px] border-dashed border-slate-300 flex items-center justify-center text-slate-400 shrink-0"><User size={28} /></div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[1.05rem] font-extrabold text-slate-900 leading-tight mb-2 break-words" title={m.nome}>
            {m.nome}{bloqueado && !lixeira && <span className="ml-1 text-xs text-red-600" title="Morador Bloqueado">⚠️</span>}
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {m.relacao === 'Funcionario' ? (
              <span className="text-[0.7rem] font-extrabold px-2 py-1 rounded-md border bg-indigo-50 text-indigo-700 border-indigo-200">
                👷 Funcionário do Apto
              </span>
            ) : m.relacao === 'Dependente' ? (
              <span className="text-[0.7rem] font-extrabold px-2 py-1 rounded-md border bg-violet-50 text-violet-700 border-violet-200">
                👶 Filho(a) / Dependente
              </span>
            ) : m.relacao === 'Conjuge' ? (
              <span className="text-[0.7rem] font-extrabold px-2 py-1 rounded-md border bg-pink-50 text-pink-700 border-pink-200">
                💑 Cônjuge / Esposo(a)
              </span>
            ) : m.relacao === 'Inquilino' ? (
              <span className="text-[0.7rem] font-extrabold px-2 py-1 rounded-md border bg-blue-50 text-blue-800 border-blue-200">
                🔑 Inquilino(a)
              </span>
            ) : m.relacao === 'Sindico' ? (
              <span className="text-[0.7rem] font-extrabold px-2 py-1 rounded-md border bg-amber-50 text-amber-800 border-amber-300">
                👔 Síndico(a)
              </span>
            ) : m.relacao === 'Subsindico' ? (
              <span className="text-[0.7rem] font-extrabold px-2 py-1 rounded-md border bg-amber-50 text-amber-800 border-amber-300">
                🛡️ Subsíndico(a)
              </span>
            ) : (
              <span className="text-[0.7rem] font-bold px-2 py-1 rounded-md border bg-slate-50 text-slate-600 border-slate-200">
                {m.relacao || 'Titular'}
              </span>
            )}
            {m.ativo ? (
              <span className="text-[0.7rem] font-bold px-2 py-1 rounded-md border bg-green-50 text-green-600 border-green-200">
                {m.relacao === 'Funcionario' || (m.relacao === 'Dependente' && m.observacao?.includes('Termo de Responsabilidade'))
                  ? 'Facial Ativo'
                  : semCpf
                    ? 'Facial Ativo (App aguarda CPF)'
                    : 'App Ativo'}
              </span>
            ) : (
              <span className="text-[0.7rem] font-bold px-2 py-1 rounded-md border bg-red-50 text-red-600 border-red-200">
                {m.relacao === 'Funcionario' || (m.relacao === 'Dependente' && m.observacao?.includes('Termo de Responsabilidade'))
                  ? 'Facial Pausado'
                  : 'Sem App'}
              </span>
            )}
            {m.importado_leitor && (
              <span className="text-[0.7rem] font-extrabold px-2 py-1 rounded-md border bg-sky-50 text-sky-800 border-sky-200">
                📥 Importado do Leitor
              </span>
            )}
            {semCpf && !lixeira && (
              <span className="text-[0.7rem] font-extrabold px-2 py-1 rounded-md border bg-amber-100 text-amber-900 border-amber-300">
                ⚠️ Sem CPF{m.id_leitor_facial ? ` (ID Leitor: #${m.id_leitor_facial})` : ''}
              </span>
            )}
            {m.relacao === 'Inquilino' && !lixeira && !(m.documentos ?? []).some((d) => d.categoria === 'contrato_locacao' || d.categoria === 'autorizacao_proprietario') && (
              <button
                type="button"
                onClick={() => onAcao('documentos', m)}
                title="Clique para anexar o Contrato de Locação ou Autorização do Proprietário"
                className="text-[0.7rem] font-extrabold px-2 py-1 rounded-md border bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 cursor-pointer"
              >
                📎 Sem Contrato (Anexar)
              </button>
            )}
          </div>
        </div>
      </div>

      {m.observacao && (
        <div
          className={`px-3 py-2 rounded-lg text-sm font-semibold mb-3 border border-dashed whitespace-pre-line ${
            m.relacao === 'Funcionario'
              ? 'bg-blue-50 text-blue-800 border-blue-200'
              : m.observacao.includes('Declaração de Coabitação')
                ? 'bg-pink-50 text-pink-900 border-pink-200'
                : m.relacao === 'Dependente' && m.observacao.includes('Responsável Legal')
                  ? 'bg-violet-50 text-violet-900 border-violet-200'
                  : 'bg-red-100 text-red-800 border-red-300'
          }`}
        >
          <span
            className={`block text-[0.7rem] uppercase mb-0.5 ${
              m.relacao === 'Funcionario'
                ? 'text-blue-600'
                : m.observacao.includes('Declaração de Coabitação')
                  ? 'text-pink-700'
                  : m.relacao === 'Dependente' && m.observacao.includes('Responsável Legal')
                    ? 'text-violet-700'
                    : 'text-red-600'
            }`}
          >
            {m.relacao === 'Funcionario'
              ? '🏠 Vínculo com o Apartamento'
              : m.observacao.includes('Declaração de Coabitação')
                ? '💍 Vínculo Familiar / Coabitação'
                : m.relacao === 'Dependente' && m.observacao.includes('Responsável Legal')
                  ? '🛡️ Responsável Legal / Termo Parental'
                  : '📝 Observação'}
          </span>
          {m.observacao}
        </div>
      )}

      <div className={`rounded-xl p-3.5 border flex flex-col gap-2.5 mb-4 text-sm text-slate-600 ${bloqueado || lixeira ? 'bg-white border-red-100' : 'bg-slate-50 border-slate-100'}`}>
        {m.condominio_nome && (
          <div className="flex items-center gap-1.5 text-xs font-extrabold text-indigo-700 bg-indigo-50/80 border border-indigo-200/80 px-2.5 py-1 rounded-lg w-fit">
            <Building2 size={13} className="shrink-0" />
            <span className="truncate">{m.condominio_nome}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Home size={15} className="text-blue-500 shrink-0" />
            <span className="font-semibold text-slate-900"><b className="text-blue-600">{m.bloco_nome ?? '—'}</b> / Apto {m.unidade_numero ?? '—'}</span>
          </div>
          {m.ramal && (
            <button
              type="button"
              onClick={() => !lixeira && onAcao('editar', m)}
              title={!lixeira ? 'Clique para editar o Ramal do Interfone deste apartamento' : `Ramal do Interfone: ${m.ramal}`}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-extrabold border transition ${
                m.ramal_custom
                  ? 'bg-indigo-100 text-indigo-800 border-indigo-300 hover:bg-indigo-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
              } ${!lixeira ? 'cursor-pointer' : ''}`}
            >
              <span>📞 Ramal: <b className="font-mono">{m.ramal}</b></span>
              {!lixeira && <Pencil size={10} className="opacity-70" />}
            </button>
          )}
        </div>
        {cpf ? (
          <div className="flex items-center gap-2"><CreditCard size={15} className="opacity-60" /><span className="font-mono font-semibold text-slate-800">{cpf}</span></div>
        ) : !lixeira ? (
          <button
            type="button"
            onClick={() => onAcao('editar', m)}
            className="flex items-center justify-between gap-2 w-full px-3 py-2 rounded-lg bg-amber-100 hover:bg-amber-200/80 border border-amber-300 text-amber-950 text-xs font-extrabold transition cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-amber-700 shrink-0" />
              CPF Pendente {m.id_leitor_facial ? `(ID Leitor: #${m.id_leitor_facial})` : ''}
            </span>
            <span className="underline text-amber-800">Informar CPF →</span>
          </button>
        ) : null}
        {m.telefone && (
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Phone size={15} className="text-emerald-500" />
              <span>{m.telefone}</span>
            </div>
            {!lixeira && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const r = await api<{ mensagem: string }>('whatsapp_enviar_boas_vindas', {
                      corpo: { usuario_id: m.id },
                    });
                    window.alert(`✅ ${r.mensagem}`);
                  } catch (e) {
                    window.alert(`⚠️ ${e instanceof ErroApi ? e.message : 'Falha ao enviar WhatsApp.'}`);
                  }
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-extrabold shadow-2xs cursor-pointer"
                title="Enviar mensagem de Boas-Vindas, Login, Senha e Ramal via WhatsApp (Evolution API)"
              >
                <Phone size={11} /> Enviar Acesso no Zap
              </button>
            )}
          </div>
        )}
        {portasApp.length > 0 && m.relacao !== 'Funcionario' && (
          <div className="pt-2 border-t border-slate-200/80 text-xs">
            <span className="font-bold text-slate-500 block mb-1">📱 Portas no App do celular:</span>
            <div className="flex flex-wrap gap-1">
              {portasApp.map((nomePorta) => (
                <span key={nomePorta} className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-md font-bold text-[0.7rem]">
                  {nomePorta}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {m.veiculos.length > 0 && !lixeira && (
        <div className="flex flex-col gap-2 mb-4">
          <span className="text-[0.68rem] font-extrabold text-slate-400 uppercase tracking-wide flex items-center gap-1"><Car size={12} /> Veículos Registrados</span>
          {m.veiculos.map((v) => (
            <div key={v.id} className={`flex items-center justify-between bg-white border rounded-lg px-2 py-1.5 ${bloqueado ? 'border-red-200' : 'border-slate-200'}`}>
              <span className="bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-mono text-sm font-extrabold">{v.placa}</span>
              <div className="flex gap-1.5 items-center justify-end flex-1 min-w-0">
                {v.modelo && <span className="text-xs text-slate-500 font-semibold truncate">{`${v.marca ?? ''} ${v.modelo ?? ''}`.trim()}</span>}
                {v.vaga_garagem && <span className="bg-green-50 text-green-600 px-1.5 py-0.5 rounded text-xs font-extrabold">Vaga {v.vaga_garagem}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {(m.vinculados?.length ?? 0) > 0 && !lixeira && (
        <div className="flex flex-col gap-2 mb-4">
          <span className="text-[0.68rem] font-extrabold text-violet-700 uppercase tracking-wide flex items-center justify-between">
            <span className="flex items-center gap-1"><Users size={12} /> Filhos / Dependentes &amp; Funcionários Vinculados</span>
            <span className="bg-violet-100 text-violet-800 px-1.5 py-0.5 rounded-full text-[0.65rem]">{m.vinculados!.length}</span>
          </span>
          {m.vinculados!.map((v) => {
            const ehFunc = v.relacao === 'Funcionario';
            const temTermo = (v.observacao ?? '').includes('Termo de Responsabilidade');
            const mNasc = (v.observacao ?? '').match(/Nasc\.:\s*(\d{2}\/\d{2}\/\d{4})/);
            const mFunc = (v.observacao ?? '').match(/^Função:\s*([^\n(]+)/);
            const subRotulo = ehFunc
              ? (mFunc ? mFunc[1].trim() : 'Funcionário(a)')
              : (mNasc ? `Nasc.: ${mNasc[1]}` : 'Dependente da Unidade');
            const cpfVinc = v.cpf?.startsWith('99') ? 'Menor s/ CPF' : formatarCpf(v.cpf);
            const comoMorador: Morador = {
              id: v.id,
              condominio_id: m.condominio_id,
              condominio_nome: m.condominio_nome,
              nome: v.nome,
              cpf: v.cpf,
              relacao: v.relacao,
              ativo: v.ativo,
              telefone: v.telefone,
              email: null,
              foto_base64: v.foto_base64,
              observacao: v.observacao,
              excluido: false,
              unidade_id: v.unidade_id,
              unidade_numero: m.unidade_numero,
              bloco_id: m.bloco_id,
              bloco_nome: m.bloco_nome,
              ramal: m.ramal,
              ramal_custom: m.ramal_custom,
              ramal_automatico: m.ramal_automatico,
              codigos_interfone: m.codigos_interfone,
              grupo_acesso_id: v.grupo_acesso_id,
              terminais_acesso: v.terminais_acesso ?? [],
              veiculos: [],
            };
            return (
              <div
                key={v.id}
                className={`rounded-xl border p-2.5 flex flex-col gap-1.5 ${
                  ehFunc ? 'bg-indigo-50/50 border-indigo-200' : 'bg-violet-50/60 border-violet-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {v.foto_base64 ? (
                    <img
                      src={v.foto_base64}
                      alt={v.nome}
                      title="Clique para ampliar a foto"
                      onClick={() => onFoto(v.foto_base64!, v.nome)}
                      className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-xs cursor-pointer hover:scale-105 transition shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                      <User size={18} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-extrabold text-slate-900 truncate">{v.nome}</span>
                      <span className={`text-[0.62rem] font-extrabold px-1.5 py-0.5 rounded border ${
                        ehFunc ? 'bg-indigo-100 text-indigo-800 border-indigo-200' : 'bg-violet-100 text-violet-800 border-violet-200'
                      }`}>
                        {ehFunc ? '👷 Funcionário' : '👶 Filho/Dep.'}
                      </span>
                      <span className={`text-[0.62rem] font-bold px-1.5 py-0.5 rounded ${
                        v.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}>
                        {v.ativo ? 'Ativo' : 'Bloqueado'}
                      </span>
                    </div>
                    <div className="text-[0.68rem] text-slate-600 font-medium flex flex-wrap gap-x-2 mt-0.5">
                      <span>{subRotulo}</span>
                      {cpfVinc && <span className="font-mono">• {cpfVinc}</span>}
                      {temTermo && <span className="text-violet-700 font-bold" title={v.observacao ?? ''}>• ✓ Termo Parental Assinado</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      title="Editar este dependente/funcionário"
                      onClick={() => onAcao('editar', comoMorador)}
                      className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      title={v.ativo ? 'Bloquear acesso' : 'Liberar acesso'}
                      onClick={() => onAcao('bloquear', comoMorador)}
                      className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
                    >
                      {v.ativo ? <Lock size={12} className="text-red-600" /> : <Unlock size={12} className="text-green-600" />}
                    </button>
                    {temBlacklist && (
                      <Link
                        to={`/lista-restricao?importar_usuario=${v.id}`}
                        title="Incluir este vinculado em Suspeitos / Blacklist"
                        className="p-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-600 hover:text-white transition"
                      >
                        <UserX size={12} />
                      </Link>
                    )}
                    <button
                      type="button"
                      title="Excluir cadastro"
                      onClick={() => onAcao('excluir', comoMorador)}
                      className="p-1.5 rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(m.documentos?.length ?? 0) > 0 && !lixeira && (
        <div className="flex flex-col gap-1.5 mb-4">
          <span className="text-[0.68rem] font-extrabold text-blue-700 uppercase tracking-wide flex items-center justify-between">
            <span className="flex items-center gap-1"><FolderOpen size={12} /> Documentos Vinculados</span>
            <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full text-[0.65rem]">{m.documentos!.length}</span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {m.documentos!.map((doc) => {
              const vencido = doc.validade_contrato && new Date(`${doc.validade_contrato}T23:59:59`).getTime() < Date.now();
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => { abrirDocumentoProtegido(doc).catch(() => onAcao('documentos', m)); }}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition ${
                    vencido
                      ? 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'
                      : 'bg-blue-50/80 text-blue-900 border-blue-200 hover:bg-blue-100'
                  }`}
                  title={`${doc.titulo} — Clique para abrir`}
                >
                  <FileText size={11} className="shrink-0" />
                  <span className="truncate max-w-[165px]">{doc.categoria_rotulo}</span>
                  {vencido && <span className="text-[9px] bg-rose-200 text-rose-900 px-1 rounded">Vencido</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className={`flex gap-2 pt-4 mt-auto border-t border-dashed flex-wrap ${bloqueado || lixeira ? 'border-red-200' : 'border-slate-200'}`}>
        {lixeira ? (
          <>
            <button onClick={() => onAcao('restaurar', m)} className="flex-1 inline-flex justify-center items-center gap-1.5 text-sm font-bold py-2.5 rounded-xl bg-blue-600 text-white cursor-pointer"><RotateCcw size={16} /> Restaurar</button>
            <button onClick={() => onAcao('definitivo', m)} className="flex-1 inline-flex justify-center items-center gap-1.5 text-sm font-bold py-2.5 rounded-xl bg-red-500 text-white cursor-pointer"><Trash2 size={16} /> Excluir</button>
            {temBlacklist && (
              <Link
                to={`/lista-restricao?importar_usuario=${m.id}`}
                title="Incluir esta pessoa em Suspeitos / Blacklist nos leitores faciais"
                className="w-full inline-flex justify-center items-center gap-1.5 text-xs font-extrabold py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-300 transition"
              >
                <UserX size={14} /> Incluir em Suspeitos / Blacklist
              </Link>
            )}
          </>
        ) : (
          <>
            <button onClick={() => onAcao('documentos', m)} className="flex-1 min-w-[76px] inline-flex justify-center items-center gap-1 text-xs font-bold py-2.5 px-2 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 cursor-pointer" title="Gerenciar Contratos de Locação, Escrituras e Documentos">
              <FolderOpen size={14} /> Docs{(m.documentos?.length ?? 0) > 0 ? ` (${m.documentos!.length})` : ''}
            </button>
            <button onClick={() => onAcao('editar', m)} className="flex-1 min-w-[70px] inline-flex justify-center items-center gap-1 text-xs font-bold py-2.5 px-2 rounded-xl bg-white border border-slate-300 text-slate-700 cursor-pointer"><Pencil size={14} /> Editar</button>
            <button onClick={() => onAcao('bloquear', m)} className="flex-1 min-w-[76px] inline-flex justify-center items-center gap-1 text-xs font-bold py-2.5 px-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 cursor-pointer">
              {m.ativo ? <><Lock size={14} className="text-red-600" /> Bloquear</> : <><Unlock size={14} className="text-green-600" /> Liberar</>}
            </button>
            <button onClick={() => onAcao('excluir', m)} className="flex-1 min-w-[70px] inline-flex justify-center items-center gap-1 text-xs font-bold py-2.5 px-2 rounded-xl bg-red-50 border border-red-200 text-red-600 cursor-pointer"><Trash2 size={14} /> Excluir</button>
            {temBlacklist && (
              <Link
                to={`/lista-restricao?importar_usuario=${m.id}`}
                title="Importar foto e dados deste morador direto para Suspeitos / Blacklist"
                className="w-full inline-flex justify-center items-center gap-1.5 text-xs font-extrabold py-2 px-3 rounded-xl bg-rose-50/90 hover:bg-rose-600 text-rose-800 hover:text-white border border-rose-200 hover:border-rose-600 transition"
              >
                <UserX size={14} /> Colocar como Suspeito / Blacklist
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function Moradores() {
  const { usuario } = useSessao();
  const [searchParams, setSearchParams] = useSearchParams();
  const [aba, setAba] = useState<Aba>('lista');
  const [apoio, setApoio] = useState<Apoio>({ blocos: [], unidades: [], controladores: [], grupos_acesso: [] });
  const blocos = apoio.blocos;
  const [blocoId, setBlocoId] = useState('');
  const [condFiltroId, setCondFiltroId] = useState('');
  const [busca, setBusca] = useState(() => searchParams.get('busca') ?? '');
  const [apenasSemCpf, setApenasSemCpf] = useState(() => searchParams.get('sem_cpf') === '1');
  const [filtroRapido, setFiltroRapido] = useState<FiltroRapido>('');
  const [filtro, setFiltro] = useState(() => ({ busca: searchParams.get('busca') ?? '', bloco: '' })); // filtro aplicado (botao Filtrar, igual ao legado)
  const [pag, setPag] = useState(1);
  const [dados, setDados] = useState<Pagina | null>(null);
  const [erro, setErro] = useState('');
  const [foto, setFoto] = useState<{ src: string; nome: string } | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null); // equivalente ao flash() do legado
  const [acao, setAcao] = useState<{ tipo: AcaoCard; m: Morador } | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [salvandoModo, setSalvandoModo] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const cidAnteriorRef = useRef<number | null | undefined>(usuario?.condominio_id);

  useEffect(() => {
    api<Apoio>('moradores_apoio')
      .then(setApoio)
      .catch(() => setApoio({ blocos: [], unidades: [], controladores: [], grupos_acesso: [] }));
  }, [usuario?.condominio_id]);

  // Quando o Super Admin troca o condomínio (ou muda para "Visão geral (todos)") no seletor do topo, reseta filtros de bloco e página
  useEffect(() => {
    if (cidAnteriorRef.current === usuario?.condominio_id) return;
    cidAnteriorRef.current = usuario?.condominio_id;
    setBlocoId('');
    setCondFiltroId('');
    setFiltro((ant) => ({ ...ant, bloco: '' }));
    setPag(1);
    if (!usuario?.condominio_id && aba === 'novo') {
      setAba('lista');
    }
  }, [usuario?.condominio_id, aba]);

  useEffect(() => {
    const qUrl = searchParams.get('busca');
    if (qUrl !== null && qUrl !== busca) {
      setBusca(qUrl);
      setFiltro((ant) => ({ ...ant, busca: qUrl }));
      setPag(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const alternarModoPortaria = async (autonoma: number) => {
    const atual = Number(apoio.condominio?.portaria_autonoma ?? 0) === 1 || apoio.condominio?.tipo_portaria === 'remota' ? 1 : 0;
    if (autonoma === atual || salvandoModo) return;
    setSalvandoModo(true);
    try {
      const r = await api<{ mensagem: string; condominio: Apoio['condominio'] }>('condominio_modo_portaria', { corpo: { portaria_autonoma: autonoma } });
      setApoio((ant) => ({ ...ant, condominio: r.condominio }));
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro ao alterar modo da portaria.' });
    } finally {
      setSalvandoModo(false);
    }
  };

  const alternarModoTemporada = async (permitir: number) => {
    const atual = Number(apoio.condominio?.permite_temporada ?? 1) === 1 ? 1 : 0;
    if (permitir === atual || salvandoModo) return;
    setSalvandoModo(true);
    try {
      const r = await api<{ mensagem: string; condominio: Apoio['condominio'] }>('condominio_modo_temporada', { corpo: { permite_temporada: permitir } });
      setApoio((ant) => ({ ...ant, condominio: r.condominio }));
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro ao alterar permissão de temporada.' });
    } finally {
      setSalvandoModo(false);
    }
  };

  const alternarModoEmergencia = async (somenteAdmin: number) => {
    const atual = Number(apoio.condominio?.emergencia_somente_administracao ?? 0) === 1 ? 1 : 0;
    if (somenteAdmin === atual || salvandoModo) return;
    setSalvandoModo(true);
    try {
      const r = await api<{ mensagem: string; condominio: Apoio['condominio'] }>('condominio_modo_emergencia', {
        corpo: { emergencia_somente_administracao: somenteAdmin },
      });
      setApoio((ant) => ({ ...ant, condominio: r.condominio }));
      setAviso({ tipo: 'ok', mensagem: r.mensagem });
    } catch (e) {
      setAviso({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro ao alterar modo do botão de emergência.' });
    } finally {
      setSalvandoModo(false);
    }
  };

  const carregar = useCallback(() => {
    if (aba === 'novo') return;
    setDados(null);
    setErro('');
    api<Pagina>('listar_moradores', {
      query: {
        tab: aba,
        busca: aba === 'lista' ? filtro.busca : '',
        bloco_id: aba === 'lista' ? filtro.bloco : '',
        condominio_id: !usuario?.condominio_id && condFiltroId ? condFiltroId : '',
        sem_cpf: aba === 'lista' && apenasSemCpf ? 1 : '',
        filtro_rapido: aba === 'lista' ? filtroRapido : '',
        pag,
      },
    })
      .then(setDados)
      .catch((e) => setErro(e instanceof ErroApi ? e.message : 'Erro ao carregar moradores.'));
    // recarga: forca nova busca apos uma acao
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, filtro, condFiltroId, usuario?.condominio_id, apenasSemCpf, filtroRapido, pag, recarga]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const b = busca.trim();
      setFiltro((ant) => {
        if (ant.busca === b && ant.bloco === blocoId) return ant;
        setPag(1);
        return { busca: b, bloco: blocoId };
      });
    }, 300);
    return () => window.clearTimeout(t);
  }, [busca, blocoId]);

  const trocarAba = (a: Aba) => { setAba(a); setPag(1); setAviso(null); };
  const filtrar = (e: React.FormEvent) => { e.preventDefault(); setPag(1); setFiltro({ busca: busca.trim(), bloco: blocoId }); };
  const limpar = () => {
    setBusca('');
    setBlocoId('');
    setCondFiltroId('');
    setApenasSemCpf(false);
    setFiltroRapido('');
    if (searchParams.has('sem_cpf')) {
      searchParams.delete('sem_cpf');
      setSearchParams(searchParams, { replace: true });
    }
    setPag(1);
    setFiltro({ busca: '', bloco: '' });
  };
  const rolarTopo = () => document.querySelector('main .overflow-auto')?.scrollTo({ top: 0, behavior: 'smooth' });
  const irPara = (p: number) => { setPag(p); rolarTopo(); };

  /** Abre modal de ação do card; se estiver na Visão Geral, entra automaticamente no condomínio do morador para carregar os dados de apoio. */
  const abrirAcaoCard = async (tipo: AcaoCard, mm: Morador) => {
    if (!usuario?.condominio_id && mm.condominio_id) {
      try {
        cidAnteriorRef.current = mm.condominio_id;
        await selecionarCondominio(mm.condominio_id);
        const novoApoio = await api<Apoio>('moradores_apoio');
        setApoio(novoApoio);
      } catch {
        // segue tentativa
      }
    }
    setAcao({ tipo, m: mm });
  };

  /** Depois de uma acao: mostra o aviso e volta para a aba que o legado redirecionava. */
  const concluirAcao = (a: Aviso, abaDestino?: Aba) => {
    setAcao(null);
    setAviso(a);
    api<Apoio>('moradores_apoio').then(setApoio).catch(() => {});
    window.dispatchEvent(new CustomEvent('sectrum:atualizar-contadores'));
    if (abaDestino && abaDestino !== aba) { setAba(abaDestino); setPag(1); } else setRecarga((n) => n + 1);
    rolarTopo();
  };

  const lixeira = aba === 'lixeira';
  const emVisaoGeral = !usuario?.condominio_id;
  const totalMoradoresAba = dados?.total_ativos_geral ?? dados?.resumo_filtros?.todos;
  const totalLixeiraAba = dados?.total_lixeira_geral;
  const portariaRemota = Number(apoio.condominio?.portaria_autonoma ?? 0) === 1 || apoio.condominio?.tipo_portaria === 'remota';
  const permiteTemporada = Number(apoio.condominio?.permite_temporada ?? 1) === 1;
  const emergenciaSomenteAdmin = Number(apoio.condominio?.emergencia_somente_administracao ?? 0) === 1;
  const subAba = (ativa: boolean, cor = '') =>
    `inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold border transition cursor-pointer ${ativa ? 'bg-blue-600 text-white border-blue-600' : `bg-white border-slate-200 text-slate-600 hover:bg-slate-50 ${cor}`}`;
  const corAviso = { ok: 'bg-emerald-50 border-emerald-500 text-emerald-800', aviso: 'bg-amber-50 border-amber-500 text-amber-800', erro: 'bg-rose-50 border-rose-500 text-rose-800' };

  // Agrupa por bloco (ou por Condomínio + Bloco quando na Visão Geral)
  let blocoAtual: string | null = null;

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8">
      {/* Sub-navegacao */}
      <div className="flex gap-2.5 items-center border-b border-slate-200 pb-3 mb-5 flex-wrap">
        <button onClick={() => trocarAba('lista')} className={subAba(aba === 'lista')}>
          <Users size={16} />
          <span>Moradores</span>
          {totalMoradoresAba !== undefined && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-extrabold ${aba === 'lista' ? 'bg-white/25 text-white' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
              {totalMoradoresAba.toLocaleString('pt-BR')}
            </span>
          )}
        </button>
        {!emVisaoGeral && (
          <button onClick={() => trocarAba('novo')} className={subAba(aba === 'novo')}><Plus size={16} /> Cadastrar Novo</button>
        )}
        {usuario?.modulo_seguranca_facial && !emVisaoGeral && (
          <Link
            to="/lista-restricao"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-extrabold border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-600 hover:text-white hover:border-rose-600 transition shadow-2xs"
            title="Abrir tela de Suspeitos / Blacklist (Lista de Restrição Facial)"
          >
            <UserX size={16} /> Suspeitos / Blacklist
          </Link>
        )}
        <div className="ml-auto flex gap-2.5">
          {!emVisaoGeral && (
            <button onClick={() => setSincronizando(true)} className={subAba(false)}><RefreshCw size={16} /> Sincronizar Catracas</button>
          )}
          <button onClick={() => trocarAba('lixeira')} className={lixeira ? subAba(true) : subAba(false, '!text-red-600 !border-red-300')}>
            <Trash2 size={16} />
            <span>Lixeira</span>
            {totalLixeiraAba !== undefined && totalLixeiraAba > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-extrabold ${lixeira ? 'bg-white/25 text-white' : 'bg-red-100 text-red-700'}`}>
                {totalLixeiraAba.toLocaleString('pt-BR')}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Configuracoes rapidas do Sindico para o App do Morador (Portaria e Aluguel de Temporada) */}
      {apoio.condominio && !lixeira && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-5">
          <div className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-4 shadow-sm ${portariaRemota ? 'bg-indigo-50/70 border-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
            <div className="min-w-[220px] flex-1">
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-600">
                <span>📱 Abertura pelo Celular</span>
                <span className={`px-2 py-0.5 rounded-full text-[0.68rem] font-extrabold ${portariaRemota ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white'}`}>
                  {portariaRemota ? '🤖 PORTARIA REMOTA' : '🏢 PORTARIA HUMANA'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                {portariaRemota
                  ? 'Moradores abrem pelo celular a porta do próprio Bloco + portões da Portaria.'
                  : 'Cada morador abre pelo celular apenas a porta do próprio Bloco dele.'}
              </p>
            </div>
            <div className="inline-flex bg-white p-1 rounded-xl border border-slate-200 shadow-xs">
              <button
                type="button"
                disabled={salvandoModo}
                onClick={() => alternarModoPortaria(0)}
                className={`px-3 py-2 rounded-lg text-xs font-extrabold transition cursor-pointer ${!portariaRemota ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                🏢 Só Bloco
              </button>
              <button
                type="button"
                disabled={salvandoModo}
                onClick={() => alternarModoPortaria(1)}
                className={`px-3 py-2 rounded-lg text-xs font-extrabold transition cursor-pointer ${portariaRemota ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                🤖 Bloco + Portaria
              </button>
            </div>
          </div>

          <div className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-4 shadow-sm ${permiteTemporada ? 'bg-emerald-50/60 border-emerald-200' : 'bg-rose-50/60 border-rose-200'}`}>
            <div className="min-w-[220px] flex-1">
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-600">
                <span>🏖️ Aluguel de Temporada (Airbnb)</span>
                <span className={`px-2 py-0.5 rounded-full text-[0.68rem] font-extrabold ${permiteTemporada ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
                  {permiteTemporada ? '✅ HABILITADO NO APP' : '🚫 DESABILITADO NO APP'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                {permiteTemporada
                  ? 'A opção "Aluguel Temporada" está visível e liberada no App dos moradores.'
                  : 'Opção ocultada automaticamente do menu no App dos moradores deste condomínio.'}
              </p>
            </div>
            <div className="inline-flex bg-white p-1 rounded-xl border border-slate-200 shadow-xs">
              <button
                type="button"
                disabled={salvandoModo}
                onClick={() => alternarModoTemporada(1)}
                className={`px-3 py-2 rounded-lg text-xs font-extrabold transition cursor-pointer ${permiteTemporada ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                ✅ Habilitar no App
              </button>
              <button
                type="button"
                disabled={salvandoModo}
                onClick={() => alternarModoTemporada(0)}
                className={`px-3 py-2 rounded-lg text-xs font-extrabold transition cursor-pointer ${!permiteTemporada ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                🚫 Desabilitar
              </button>
            </div>
          </div>

          <div className={`xl:col-span-2 p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-4 shadow-sm ${emergenciaSomenteAdmin ? 'bg-amber-50/70 border-amber-300' : 'bg-rose-50/50 border-rose-200'}`}>
            <div className="min-w-[240px] flex-1">
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-700 flex-wrap">
                <span>🚨 Destinatários do Botão de Emergência (SOS)</span>
                <span className={`px-2.5 py-0.5 rounded-full text-[0.68rem] font-extrabold ${emergenciaSomenteAdmin ? 'bg-amber-600 text-white' : 'bg-rose-600 text-white'}`}>
                  {emergenciaSomenteAdmin ? '🛡️ SOMENTE ADMINISTRAÇÃO (PORTARIA, SÍNDICO E SUBSÍNDICO)' : '🏢 BLOCO + ADMINISTRAÇÃO'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                {emergenciaSomenteAdmin
                  ? 'Marcado: Quando um morador aciona o Botão de Emergência, o alarme toca somente para Portaria, Síndico e Subsíndico (sem disparar sirene para os demais vizinhos).'
                  : 'Padrão: Quando um morador aciona o Botão de Emergência, o alarme avisa os vizinhos do mesmo Bloco + Portaria, Síndico e Subsíndico.'}
              </p>
            </div>
            <label className="inline-flex items-center gap-2.5 bg-white px-4 py-2.5 rounded-xl border border-slate-300 shadow-xs cursor-pointer select-none">
              <input
                type="checkbox"
                disabled={salvandoModo}
                checked={emergenciaSomenteAdmin}
                onChange={(e) => alternarModoEmergencia(e.target.checked ? 1 : 0)}
                className="w-4 h-4 accent-amber-600"
              />
              <span className="text-xs font-extrabold text-slate-800">
                Avisar somente Administração (Portaria, Síndico e Subsíndico)
              </span>
            </label>
          </div>
        </div>
      )}

      {aviso && (
        <div className={`border-l-4 px-4 py-3 rounded-lg text-sm font-semibold mb-5 flex justify-between gap-3 ${corAviso[aviso.tipo]}`}>
          <span>{aviso.mensagem}</span>
          <button onClick={() => setAviso(null)} aria-label="Fechar aviso"><X size={16} /></button>
        </div>
      )}

      {aba === 'novo' && <FormNovoMorador apoio={apoio} onConcluido={(a) => concluirAcao(a, 'lista')} />}

      {aba !== 'novo' && (<>
      {(dados?.total_sem_cpf ?? 0) > 0 && !lixeira && (
        <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-4 mb-5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start gap-3 flex-1 min-w-[240px]">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle size={20} />
            </div>
            <div>
              <div className="text-sm sm:text-base font-extrabold text-amber-950 flex items-center gap-2 flex-wrap">
                <span>⚠️ Atenção Síndico: {dados!.total_sem_cpf} morador(es) importado(s) do leitor facial estão sem CPF!</span>
                <span className="text-[0.68rem] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-extrabold">
                  Atualização de CPF Pendente
                </span>
              </div>
              <p className="text-xs sm:text-sm text-amber-900 mt-0.5">
                Estes cadastros foram importados diretamente da memória do controle de acesso facial com ID numérico provisório. Clique em <b>Editar</b> no cartão do morador para informar o CPF, revisar a unidade e liberar o acesso ao Aplicativo.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const novo = !apenasSemCpf;
              setApenasSemCpf(novo);
              setPag(1);
              if (novo) {
                setSearchParams({ sem_cpf: '1' }, { replace: true });
              } else {
                searchParams.delete('sem_cpf');
                setSearchParams(searchParams, { replace: true });
              }
            }}
            className={`px-4 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm transition cursor-pointer shrink-0 ${
              apenasSemCpf
                ? 'bg-slate-800 hover:bg-slate-900 text-white'
                : 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs'
            }`}
          >
            {apenasSemCpf ? '✕ Mostrar Todos os Moradores' : `🔍 Filtrar Apenas Sem CPF (${dados!.total_sem_cpf})`}
          </button>
        </div>
      )}
      {/* PAINEL CONSOLIDADO DO SISTEMA INTEIRO (quando Super Admin seleciona "Visão geral (todos)") */}
      {emVisaoGeral && dados && (
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white rounded-2xl p-5 mb-5 shadow-md border border-blue-800/40 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300 shrink-0">
                <Users size={26} />
              </div>
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-blue-300">
                  🌎 Visão Geral de Todos os Condomínios (Sistema Completo)
                </div>
                <div className="flex items-baseline gap-2.5 flex-wrap mt-0.5">
                  <span className="text-3xl font-extrabold tracking-tight text-white">
                    {(dados.total_sistema_moradores ?? dados.total_ativos_geral ?? 0).toLocaleString('pt-BR')}
                  </span>
                  <span className="text-sm font-bold text-blue-100">pessoas cadastradas ativas nas unidades</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-bold">
              {(dados.total_equipe_gestao ?? 0) > 0 && (
                <span className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 text-blue-100" title="Contas administrativas sem unidade (Síndicos, Portaria e Super Admin)">
                  🛡️ +{(dados.total_equipe_gestao ?? 0).toLocaleString('pt-BR')} equipe/gestão ={' '}
                  <b className="text-white">
                    {((dados.total_sistema_moradores ?? 0) + (dados.total_equipe_gestao ?? 0)).toLocaleString('pt-BR')} contas totais
                  </b>
                </span>
              )}
              {(dados.total_sistema_lixeira ?? 0) > 0 && (
                <span className="px-3 py-1.5 rounded-xl bg-rose-500/20 border border-rose-400/30 text-rose-200">
                  🗑️ {(dados.total_sistema_lixeira ?? 0).toLocaleString('pt-BR')} na lixeira
                </span>
              )}
            </div>
          </div>

          {(dados.por_condominio?.length ?? 0) > 0 && (
            <div className="pt-3 border-t border-white/10">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-blue-200/80 mb-2">
                Quantidade por Condomínio (clique para filtrar ou entrar):
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { setCondFiltroId(''); setPag(1); }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
                    condFiltroId === ''
                      ? 'bg-white text-slate-900 border-white shadow-xs'
                      : 'bg-white/10 hover:bg-white/20 text-white border-white/15'
                  }`}
                >
                  <span>🌎 Todos</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${condFiltroId === '' ? 'bg-blue-600 text-white' : 'bg-white/20 text-white'}`}>
                    {(dados.total_sistema_moradores ?? 0).toLocaleString('pt-BR')}
                  </span>
                </button>
                {dados.por_condominio!.map((c) => {
                  const ativoCond = condFiltroId === String(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCondFiltroId(ativoCond ? '' : String(c.id));
                        setPag(1);
                      }}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        ativoCond
                          ? 'bg-emerald-400 text-slate-950 border-emerald-300 font-extrabold shadow-xs'
                          : 'bg-white/10 hover:bg-white/20 text-white/90 border-white/15'
                      }`}
                      title={`${c.nome}: ${c.total_pessoas} pessoa(s) em ${c.total_unidades} unidade(s)`}
                    >
                      <span className="truncate max-w-[190px]">{c.nome}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${ativoCond ? 'bg-slate-900 text-white' : 'bg-white/20 text-white'}`}>
                        {c.total_pessoas.toLocaleString('pt-BR')}
                      </span>
                    </button>
                  );
                })}
                {condFiltroId !== '' && (
                  <button
                    type="button"
                    onClick={() => selecionarCondominio(Number(condFiltroId))}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-blue-500 hover:bg-blue-400 text-white border border-blue-400 cursor-pointer ml-auto"
                  >
                    <Building2 size={13} /> Abrir painel deste condomínio →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {lixeira ? (
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl mb-6 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <AlertTriangle size={24} className="shrink-0" />
            <div>
              <h4 className="font-extrabold">Lixeira de Moradores</h4>
              <p className="text-sm opacity-80">Moradores listados aqui não têm acesso ao aplicativo e não constam na catraca, mas os registros deles foram guardados. Você pode restaurá-los.</p>
            </div>
          </div>
          {dados && (
            <span className="px-3 py-1.5 rounded-xl bg-red-100 border border-red-300 text-red-900 text-xs font-extrabold">
              🗑️ {dados.total_itens.toLocaleString('pt-BR')} registro(s) na lixeira
            </span>
          )}
        </div>
      ) : (
        <form onSubmit={filtrar} className="mb-6 bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-3.5">
          {/* Faixa superior de resumo imediato da quantidade de pessoas cadastradas */}
          {dados && !emVisaoGeral && (
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs sm:text-sm font-extrabold">
                  <Users size={15} className="text-blue-600" />
                  Total cadastrado: {(dados.total_ativos_geral ?? dados.total_itens).toLocaleString('pt-BR')} pessoa(s)
                </span>
                {dados.total_app_ativo !== undefined && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                    📱 {dados.total_app_ativo.toLocaleString('pt-BR')} ativos
                  </span>
                )}
                {(dados.total_lixeira_geral ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => trocarAba('lixeira')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold cursor-pointer transition"
                  >
                    🗑️ {dados.total_lixeira_geral!.toLocaleString('pt-BR')} na lixeira
                  </button>
                )}
              </div>
              {filtro.bloco && (
                <span className="text-xs font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg">
                  🏢 Neste bloco: {(dados.resumo_filtros?.todos ?? dados.total_itens).toLocaleString('pt-BR')} pessoa(s)
                </span>
              )}
            </div>
          )}

          <div className="flex gap-3 flex-wrap items-end">
            {!emVisaoGeral && (
              <div className="flex-1 min-w-[180px]">
                <label className="text-[0.72rem] tracking-wide font-extrabold text-slate-500 mb-1.5 block">🏢 FILTRAR POR BLOCO</label>
                <select value={blocoId} onChange={(e) => setBlocoId(e.target.value)} className="w-full bg-slate-50 border border-slate-300 px-3 py-2.5 rounded-lg outline-none font-semibold text-slate-900">
                  <option value="">Todos os blocos</option>
                  {blocos.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
                </select>
              </div>
            )}
            <div className="flex-[2] min-w-[200px]">
              <label className="text-[0.72rem] tracking-wide font-extrabold text-slate-500 mb-1.5 block">
                🔍 {emVisaoGeral ? 'BUSCAR POR NOME, CPF, APTO, RAMAL OU CONDOMÍNIO' : 'BUSCAR POR NOME, CPF, APTO OU RAMAL'}
              </label>
              <div className="relative">
                <Search size={18} className="absolute left-3.5 top-3 text-slate-400" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder={emVisaoGeral ? 'Digite nome, CPF, apto, placa ou nome do condomínio...' : 'Digite nome, CPF, apto ou ramal (ex: 0101)...'}
                  className="w-full pl-11 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-2.5">
              <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2.5 rounded-xl cursor-pointer">Filtrar</button>
              {(filtro.busca || filtro.bloco || filtroRapido || condFiltroId || apenasSemCpf) && (
                <button type="button" onClick={limpar} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-xl cursor-pointer">✕ Limpar</button>
              )}
            </div>
          </div>

          {/* Filtros rápidos com badge numérico em TODOS os itens (incluindo "Todos") */}
          <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-slate-100">
            <span className="text-[0.7rem] font-extrabold uppercase tracking-wider text-slate-400 mr-1">Filtro rápido:</span>
            {([
              { id: '' as FiltroRapido, label: '👥 Todos', qtd: dados?.resumo_filtros?.todos, corAtiva: 'bg-slate-900 text-white border-slate-900' },
              { id: 'titulares' as FiltroRapido, label: '🏠 Titulares', qtd: dados?.resumo_filtros?.titulares, corAtiva: 'bg-slate-700 text-white border-slate-700' },
              { id: 'inquilinos' as FiltroRapido, label: '🔑 Só Inquilinos', qtd: dados?.resumo_filtros?.inquilinos, corAtiva: 'bg-blue-600 text-white border-blue-600' },
              { id: 'conjuges' as FiltroRapido, label: '💑 Cônjuges', qtd: dados?.resumo_filtros?.conjuges, corAtiva: 'bg-pink-600 text-white border-pink-600' },
              { id: 'dependentes' as FiltroRapido, label: '👶 Dependentes', qtd: dados?.resumo_filtros?.dependentes, corAtiva: 'bg-violet-600 text-white border-violet-600' },
              { id: 'funcionarios' as FiltroRapido, label: '👷 Funcionários', qtd: dados?.resumo_filtros?.funcionarios, corAtiva: 'bg-teal-600 text-white border-teal-600' },
              { id: 'com_docs' as FiltroRapido, label: '📄 Com Contratos / Docs', qtd: dados?.resumo_filtros?.com_docs, corAtiva: 'bg-indigo-600 text-white border-indigo-600' },
              { id: 'inquilinos_sem_contrato' as FiltroRapido, label: '⚠️ Inquilinos s/ Contrato', qtd: dados?.resumo_filtros?.inquilinos_sem_contrato, corAtiva: 'bg-amber-600 text-white border-amber-600' },
            ]).map((fItem) => {
              const ativo = filtroRapido === fItem.id;
              return (
                <button
                  key={fItem.id || 'todos'}
                  type="button"
                  onClick={() => {
                    setFiltroRapido(ativo && fItem.id !== '' ? '' : fItem.id);
                    setPag(1);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold border transition cursor-pointer ${
                    ativo ? fItem.corAtiva : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  <span>{fItem.label}</span>
                  {fItem.qtd !== null && fItem.qtd !== undefined && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${ativo ? 'bg-white/25 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}>
                      {fItem.qtd.toLocaleString('pt-BR')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </form>
      )}

      {erro && <div className="bg-rose-50 border-l-4 border-rose-500 text-rose-800 px-4 py-3 rounded-lg text-sm mb-4">⚠ {erro}</div>}

      {!dados && !erro && <div className="text-center text-slate-400 py-16">Carregando moradores...</div>}

      {dados && dados.moradores.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <span className="inline-block bg-slate-100 p-5 rounded-full mb-4"><Users size={40} className="text-slate-500" /></span>
          <div className="text-lg text-slate-700 font-semibold">{filtro.busca || filtroRapido ? 'Nenhum morador encontrado para este filtro.' : lixeira ? 'A lixeira está vazia.' : 'Nenhum morador cadastrado ainda.'}</div>
        </div>
      )}

      {dados && dados.moradores.length > 0 && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2 text-sm text-slate-600 mb-3">
            <div>
              {!lixeira && dados.total_ativos_geral !== undefined && dados.total_itens !== dados.total_ativos_geral ? (
                <span>
                  Exibindo <b className="text-slate-900">{dados.total_itens.toLocaleString('pt-BR')}</b> de{' '}
                  <b className="text-slate-900">{dados.total_ativos_geral.toLocaleString('pt-BR')}</b> pessoa(s) cadastrada(s) · página {dados.pag_atual} de {dados.total_paginas}
                </span>
              ) : (
                <span>
                  <b className="text-slate-900">{dados.total_itens.toLocaleString('pt-BR')}</b> morador(es) / pessoa(s) · página {dados.pag_atual} de {dados.total_paginas}
                </span>
              )}
            </div>
          </div>
          <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))' }}>
            {dados.moradores.map((m) => {
              const nomeBloco = emVisaoGeral && m.condominio_nome
                ? `${m.condominio_nome} — ${m.bloco_nome ?? 'Sem Bloco'}`
                : (m.bloco_nome ?? 'Sem Bloco');
              const cabecalho = nomeBloco !== blocoAtual;
              blocoAtual = nomeBloco;
              return (
                <div key={m.id} className="contents">
                  {cabecalho && (
                    <div className="col-span-full mt-2 pb-2 border-b-2 border-slate-200 text-xl font-extrabold text-slate-900 flex items-center gap-2 flex-wrap">
                      <Home size={20} className="text-blue-500" /> {nomeBloco}
                      {filtro.bloco && !lixeira && <span className="text-xs bg-indigo-100 text-indigo-600 px-2.5 py-1 rounded-xl ml-2 font-extrabold border border-indigo-200">Total: {dados.total_itens.toLocaleString('pt-BR')} pessoa(s)</span>}
                    </div>
                  )}
                  <CardMorador m={m} apoio={apoio} lixeira={lixeira} temBlacklist={Boolean(usuario?.modulo_seguranca_facial)} onFoto={(src, nome) => setFoto({ src, nome })} onAcao={abrirAcaoCard} />
                </div>
              );
            })}
          </div>
          <Paginacao atual={dados.pag_atual} total={dados.total_paginas} ir={irPara} />
        </>
      )}
      </>)}

      {/* Lightbox da foto */}
      {foto && (
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-5 cursor-zoom-out backdrop-blur" onClick={() => setFoto(null)}>
          <button className="absolute top-5 right-5 text-white/80"><X size={28} /></button>
          <img src={foto.src} alt={foto.nome} className="max-w-[min(440px,90vw)] max-h-[80vh] rounded-2xl object-contain shadow-2xl border-2 border-white/10" />
          <div className="fixed bottom-8 inset-x-0 text-center text-white font-bold text-lg drop-shadow">{foto.nome}</div>
        </div>
      )}

      {/* Modais de acao (mesmos destinos de redirect do legado: restaurar/definitivo voltam para a lixeira) */}
      {acao?.tipo === 'editar' && (
        <ModalEditar
          m={acao.m}
          apoio={apoio}
          onFechar={() => setAcao(null)}
          onConcluido={(a) => concluirAcao(a, 'lista')}
          onAbrirDocumentos={() => setAcao({ tipo: 'documentos', m: acao.m })}
          onVerDocumento={(doc) => {
            abrirDocumentoProtegido(doc).catch(() => setAcao({ tipo: 'documentos', m: acao.m }));
          }}
        />
      )}
      {acao?.tipo === 'documentos' && (
        <ModalDocumentosCadastro
          nomePessoa={acao.m.nome}
          subtituloUnidade={`${acao.m.bloco_nome ?? 'Bloco'} / Apto ${acao.m.unidade_numero ?? '—'}`}
          relacaoSugerida={acao.m.relacao}
          usuarioId={acao.m.id}
          unidadeId={acao.m.unidade_id}
          onFechar={() => setAcao(null)}
          onAlterado={() => setRecarga((n) => n + 1)}
        />
      )}
      {acao && acao.tipo !== 'editar' && acao.tipo !== 'documentos' && (
        <ModalConfirmacao tipo={acao.tipo} m={acao.m} onFechar={() => setAcao(null)}
          onConcluido={(a) => concluirAcao(a, acao.tipo === 'restaurar' || acao.tipo === 'definitivo' ? 'lixeira' : 'lista')} />
      )}
      {sincronizando && <ModalSync onFechar={() => { setSincronizando(false); setRecarga((n) => n + 1); }} />}
    </div>
  );
}
