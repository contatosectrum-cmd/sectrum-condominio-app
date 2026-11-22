import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, X, ArrowRight, Building2, Users, Car, Package, Wrench, FileCheck2,
  Wallet, Sparkles, Truck, CornerDownLeft, Loader2, Eye,
} from 'lucide-react';
import { api } from '../lib/api';
import type { Usuario } from '../lib/sessao';
import { pesquisarTelasIndexadas } from '../lib/menu';

export interface ResultadoServidor {
  id: string;
  categoria: string;
  titulo: string;
  subtitulo: string;
  badge: string;
  caminho: string;
  unidade_ficha_id?: number | null;
  icone: 'unidade' | 'pessoa' | 'veiculo' | 'encomenda' | 'ocorrencia' | 'mudanca' | 'documento' | 'financeiro' | 'condominio' | string;
}

interface Props {
  aberto: boolean;
  usuario: Usuario;
  onFechar: () => void;
  onAbrirFichaUnidade360?: (unidadeId: number) => void;
}

function iconeDoResultado(tipo: string) {
  switch (tipo) {
    case 'unidade':
    case 'condominio':
      return Building2;
    case 'pessoa':
      return Users;
    case 'veiculo':
      return Car;
    case 'encomenda':
      return Package;
    case 'mudanca':
      return Truck;
    case 'documento':
      return FileCheck2;
    case 'financeiro':
      return Wallet;
    default:
      return Wrench;
  }
}

export default function ModalPesquisaInteligente({
  aberto,
  usuario,
  onFechar,
  onAbrirFichaUnidade360,
}: Props) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [termo, setTermo] = useState('');
  const [buscandoRemoto, setBuscandoRemoto] = useState(false);
  const [remotos, setRemotos] = useState<ResultadoServidor[]>([]);
  const [indiceAtivo, setIndiceAtivo] = useState(0);

  useEffect(() => {
    if (aberto) {
      setIndiceAtivo(0);
      const t = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(t);
    } else {
      setTermo('');
      setRemotos([]);
    }
  }, [aberto]);

  const telasLocais = useMemo(() => pesquisarTelasIndexadas(termo, usuario), [termo, usuario]);

  // Busca inteligente assíncrona no servidor com debounce de 200ms
  useEffect(() => {
    if (!aberto) return;
    const q = termo.trim();
    if (q.length < 2) {
      setRemotos([]);
      setBuscandoRemoto(false);
      return;
    }

    let cancelado = false;
    setBuscandoRemoto(true);
    const timer = window.setTimeout(() => {
      api<{ resultados: ResultadoServidor[] }>('pesquisa_inteligente', { query: { q } })
        .then((r) => {
          if (!cancelado) {
            setRemotos(r.resultados ?? []);
          }
        })
        .catch(() => {
          if (!cancelado) setRemotos([]);
        })
        .finally(() => {
          if (!cancelado) setBuscandoRemoto(false);
        });
    }, 200);

    return () => {
      cancelado = true;
      window.clearTimeout(timer);
    };
  }, [termo, aberto]);

  // Lista linear unificada para navegação com setas ↑ ↓ e Enter
  const listaLinear = useMemo(() => {
    const itens: Array<
      | { tipo: 'tela'; id: string; caminho: string }
      | { tipo: 'remoto'; id: string; item: ResultadoServidor }
    > = [];
    for (const t of telasLocais) {
      itens.push({ tipo: 'tela', id: `tela:${t.id}`, caminho: t.caminho });
    }
    for (const r of remotos) {
      itens.push({ tipo: 'remoto', id: `rem:${r.id}`, item: r });
    }
    return itens;
  }, [telasLocais, remotos]);

  useEffect(() => {
    setIndiceAtivo(0);
  }, [termo, remotos.length]);

  const executarItem = (entrada: (typeof listaLinear)[number]) => {
    if (!entrada) return;
    if (entrada.tipo === 'tela') {
      onFechar();
      navigate(entrada.caminho);
      return;
    }
    const r = entrada.item;
    if (r.icone === 'unidade' && r.unidade_ficha_id && onAbrirFichaUnidade360) {
      onFechar();
      onAbrirFichaUnidade360(r.unidade_ficha_id);
      return;
    }
    onFechar();
    navigate(r.caminho);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onFechar();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (listaLinear.length > 0) {
        setIndiceAtivo((i) => (i + 1) % listaLinear.length);
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (listaLinear.length > 0) {
        setIndiceAtivo((i) => (i - 1 + listaLinear.length) % listaLinear.length);
      }
      return;
    }
    if (e.key === 'Enter') {
      if (listaLinear[indiceAtivo]) {
        e.preventDefault();
        executarItem(listaLinear[indiceAtivo]);
      }
    }
  };

  // Agrupa resultados remotos por categoria preservando a ordem
  const remotosPorCategoria = useMemo(() => {
    const grupos: { categoria: string; itens: { dado: ResultadoServidor; idxGlobal: number }[] }[] = [];
    const offsetBase = telasLocais.length;
    remotos.forEach((r, idx) => {
      let grp = grupos.find((g) => g.categoria === r.categoria);
      if (!grp) {
        grp = { categoria: r.categoria, itens: [] };
        grupos.push(grp);
      }
      grp.itens.push({ dado: r, idxGlobal: offsetBase + idx });
    });
    return grupos;
  }, [remotos, telasLocais.length]);

  if (!aberto) return null;

  const sugestoesRapidas =
    usuario.perfil === 'morador'
      ? ['PIX / Boleto', 'Emitir CND', 'Convite Visita', 'Encomendas', 'Reservar Salão', 'Regimento Interno']
      : usuario.perfil === 'portaria'
        ? ['Bloco 1A', 'Encomendas', 'Mudança', 'Placa', 'Visitante', 'Pré-cadastros']
        : ['Bloco 1A 101', 'Rateio PIX', 'Emitir CND', 'Notas Fiscais', 'Assembleia Ata', 'Manutenções'];

  return (
    <div
      className="fixed inset-0 z-[350] bg-slate-950/65 backdrop-blur-xs flex items-start justify-center p-3 sm:pt-[8vh] overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div
        onKeyDown={onKeyDown}
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[84vh]"
      >
        {/* Barra de Pesquisa Principal */}
        <div className="px-4 py-3.5 border-b border-slate-200 flex items-center gap-3 bg-slate-50/70">
          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            {buscandoRemoto ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
          </div>
          <input
            ref={inputRef}
            type="text"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder={
              usuario.perfil === 'morador'
                ? 'Pesquise funções, boletos PIX, CND, encomendas, reservas ou documentos...'
                : 'Pesquise telas, apto (ex: 1A 101), morador, CPF, placa, encomenda, NF ou documento...'
            }
            className="flex-1 bg-transparent text-slate-900 placeholder:text-slate-400 text-sm sm:text-base font-semibold outline-none min-w-0"
          />
          {termo && (
            <button
              type="button"
              onClick={() => {
                setTermo('');
                inputRef.current?.focus();
              }}
              className="px-2 py-1 rounded-lg bg-slate-200/80 hover:bg-slate-300 text-slate-600 text-xs font-bold cursor-pointer"
            >
              Limpar
            </button>
          )}
          <button
            type="button"
            onClick={onFechar}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 cursor-pointer"
            title="Fechar (ESC)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Chips de Sugestões Inteligentes */}
        <div className="px-4 py-2 bg-white border-b border-slate-100 flex items-center gap-1.5 overflow-x-auto">
          <span className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase text-indigo-600 shrink-0 mr-1">
            <Sparkles size={12} /> Busca rápida:
          </span>
          {sugestoesRapidas.map((sug) => (
            <button
              key={sug}
              type="button"
              onClick={() => {
                setTermo(sug);
                inputRef.current?.focus();
              }}
              className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-blue-50 hover:text-blue-700 border border-slate-200/80 text-slate-600 text-xs font-bold whitespace-nowrap transition cursor-pointer"
            >
              {sug}
            </button>
          ))}
        </div>

        {/* Corpo de Resultados */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {/* 1. Telas & Módulos Indexados */}
          {telasLocais.length > 0 && (
            <div>
              <div className="px-2.5 pb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>{termo.trim() === '' ? '⚡ Acessos Rápidos' : '🧭 Módulos & Funções do Sistema'}</span>
                <span>{telasLocais.length} opção(ões)</span>
              </div>
              <div className="space-y-1">
                {telasLocais.map((t, idx) => {
                  const Icone = t.icone;
                  const selecionado = indiceAtivo === idx;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onMouseEnter={() => setIndiceAtivo(idx)}
                      onClick={() => executarItem({ tipo: 'tela', id: `tela:${t.id}`, caminho: t.caminho })}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition cursor-pointer ${
                        selecionado
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'hover:bg-slate-100 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                            selecionado ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-600'
                          }`}
                        >
                          <Icone size={18} />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-extrabold truncate">{t.nome}</span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                selecionado
                                  ? 'bg-white/20 text-white'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {t.grupoTitulo}
                            </span>
                          </div>
                          <div
                            className={`text-xs truncate ${
                              selecionado ? 'text-blue-100' : 'text-slate-500'
                            }`}
                          >
                            {t.descricao}
                          </div>
                        </div>
                      </div>
                      <ArrowRight
                        size={16}
                        className={`shrink-0 ${selecionado ? 'text-white' : 'text-slate-300'}`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. Resultados Inteligentes do Banco de Dados */}
          {remotosPorCategoria.map((grupo) => (
            <div key={grupo.categoria}>
              <div className="px-2.5 pb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-indigo-600 flex items-center justify-between">
                <span>🔎 {grupo.categoria}</span>
                <span>{grupo.itens.length} encontrado(s)</span>
              </div>
              <div className="space-y-1">
                {grupo.itens.map(({ dado, idxGlobal }) => {
                  const Icone = iconeDoResultado(dado.icone);
                  const selecionado = indiceAtivo === idxGlobal;
                  return (
                    <div
                      key={dado.id}
                      onMouseEnter={() => setIndiceAtivo(idxGlobal)}
                      onClick={() => executarItem({ tipo: 'remoto', id: `rem:${dado.id}`, item: dado })}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition cursor-pointer ${
                        selecionado
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'hover:bg-slate-100 text-slate-800 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                            selecionado ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-600'
                          }`}
                        >
                          <Icone size={18} />
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-extrabold truncate">{dado.titulo}</div>
                          <div
                            className={`text-xs truncate ${
                              selecionado ? 'text-indigo-100' : 'text-slate-500'
                            }`}
                          >
                            {dado.subtitulo}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {dado.unidade_ficha_id && onAbrirFichaUnidade360 && dado.icone !== 'unidade' && (
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              onFechar();
                              onAbrirFichaUnidade360(dado.unidade_ficha_id!);
                            }}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-extrabold border cursor-pointer ${
                              selecionado
                                ? 'bg-white text-indigo-700 border-white'
                                : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                            }`}
                            title="Abrir Dossiê 360º desta Unidade"
                          >
                            <Eye size={12} /> Ficha 360º
                          </button>
                        )}
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${
                            selecionado
                              ? 'bg-white/20 text-white'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {dado.badge}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Estado Vazio */}
          {termo.trim().length >= 2 && !buscandoRemoto && telasLocais.length === 0 && remotos.length === 0 && (
            <div className="py-12 text-center space-y-2">
              <Search size={30} className="mx-auto text-slate-300" />
              <div className="text-sm font-extrabold text-slate-700">
                Nenhum resultado encontrado para &quot;{termo}&quot;
              </div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Tente buscar pelo número do bloco/apartamento (ex.: <b>1A 101</b>), nome do morador, placa de veículo ou nome da funcionalidade (ex.: <b>PIX</b>, <b>CND</b>, <b>Ata</b>).
              </p>
            </div>
          )}
        </div>

        {/* Rodapé com dicas de atalhos */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-300 font-mono text-[10px] font-bold">↑↓</kbd>
              Navegar
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-300 font-mono text-[10px] font-bold inline-flex items-center">
                <CornerDownLeft size={10} />
              </kbd>
              Abrir
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-300 font-mono text-[10px] font-bold">ESC</kbd>
              Fechar
            </span>
          </div>
          <span className="font-semibold text-slate-400 hidden sm:inline">
            Atalho global: <b className="text-slate-600">Ctrl + K</b>
          </span>
        </div>
      </div>
    </div>
  );
}
