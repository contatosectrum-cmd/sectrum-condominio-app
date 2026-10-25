import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { api, ErroApi } from '../lib/api';

// Paridade com src/views/importar_moradores.php + ImportarMoradoresController.php:
// Importa planilha CSV nos 2 formatos suportados (Nome;CPF;Unidade ou Bloco;Apto;Vaga;Morador 1;Morador 2...),
// permite substituir ou adicionar a lista existente e lista os primeiros 100 registros da base.

interface ItemLista {
  id: number;
  nome: string;
  cpf: string | null;
  unidade: string | null;
  importado_em: string;
}

interface RespLista {
  total: number;
  lista: ItemLista[];
}

interface Msg {
  tipo: 'ok' | 'erro';
  mensagem: string;
}

function formatarCpf(cpf: string | null): string {
  const c = (cpf ?? '').replace(/\D/g, '');
  if (c.length === 11) {
    return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9, 11)}`;
  }
  return c || '—';
}

function formatarData(s: string): string {
  const d = new Date(s.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return s;
  return d
    .toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(',', '');
}

export default function ImportarMoradores() {
  const [dados, setDados] = useState<RespLista>({ total: 0, lista: [] });
  const [apagarLista, setApagarLista] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [processando, setProcessando] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await api<RespLista>('importar_moradores_listar');
      setDados({ total: r.total ?? 0, lista: r.lista ?? [] });
    } catch (e) {
      setMsg({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro ao carregar a lista importada.' });
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const processarImportacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!arquivo) {
      setMsg({ tipo: 'erro', mensagem: 'Nenhum arquivo enviado ou erro no upload.' });
      return;
    }

    setProcessando(true);
    setMsg(null);
    try {
      const buffer = await arquivo.arrayBuffer();
      // Decodifica UTF-8 ou fallback Windows-1252 se houver acentos em ANSI do Excel
      let conteudo = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
      if (conteudo.includes('\uFFFD')) {
        conteudo = new TextDecoder('windows-1252').decode(buffer);
      }

      const r = await api<{ mensagem: string }>('importar_moradores_processar', {
        corpo: {
          nome_arquivo: arquivo.name,
          conteudo,
          apagar_lista: apagarLista,
        },
      });

      setMsg({ tipo: 'ok', mensagem: r.mensagem });
      setArquivo(null);
      setApagarLista(false);
      if (inputRef.current) inputRef.current.value = '';
      await carregar();
    } catch (e) {
      setMsg({ tipo: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Erro ao processar a importação.' });
    } finally {
      setProcessando(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-8 space-y-6">
      {msg && (
        <div
          className={`border-l-4 px-4 py-3 rounded-lg text-sm font-semibold flex justify-between items-center gap-3 ${
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

      {/* CARD 1: FORMULÁRIO DE IMPORTAÇÃO */}
      <div className="bg-white rounded-2xl border border-slate-200 border-t-4 border-t-blue-600 p-6 shadow-sm">
        <div className="text-lg font-extrabold text-slate-900 mb-4">📂 Importar Lista Oficial de Moradores</div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 text-sm text-blue-900 leading-relaxed">
          <b>📋 Dois formatos de Planilha CSV suportados:</b>
          <div className="mt-2">
            <b>1️⃣ Formato Simples:</b>{' '}
            <code className="bg-white/80 px-1.5 py-0.5 rounded border border-blue-200 font-mono text-xs">
              Nome;CPF;Bloco/Unidade
            </code>
            <br />
            Exemplo:{' '}
            <code className="bg-white/80 px-1.5 py-0.5 rounded border border-blue-200 font-mono text-xs">
              João da Silva;12345678900;Bloco A / 302
            </code>
          </div>
          <div className="mt-2">
            <b>2️⃣ Formato por Vagas (Sem CPF):</b>{' '}
            <code className="bg-white/80 px-1.5 py-0.5 rounded border border-blue-200 font-mono text-xs">
              Bloco;Apto;Vaga;Morador 1;Morador 2;Morador 3...
            </code>
            <br />
            Exemplo:{' '}
            <code className="bg-white/80 px-1.5 py-0.5 rounded border border-blue-200 font-mono text-xs">
              1;104;120;LARISSA DE SOUSA ALMEIDA;;
            </code>
          </div>
          <p className="mt-3">
            O sistema detecta o formato automaticamente pelo cabeçalho (a primeira linha deve conter a palavra
            &quot;nome&quot; ou &quot;bloco&quot;).
          </p>
        </div>

        <form onSubmit={processarImportacao} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">
              Arquivo CSV (.csv)
            </label>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.txt"
              required
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
            />
          </div>

          <div className="bg-orange-50 p-3.5 rounded-lg border border-orange-200 flex items-start gap-2.5">
            <input
              type="checkbox"
              id="apagar_lista"
              checked={apagarLista}
              onChange={(e) => setApagarLista(e.target.checked)}
              className="w-[18px] h-[18px] cursor-pointer mt-0.5 accent-amber-600 shrink-0"
            />
            <label htmlFor="apagar_lista" className="cursor-pointer text-sm text-amber-900 leading-relaxed">
              <b>Substituir lista existente</b> — apaga os {dados.total.toLocaleString('pt-BR')} registo(s) atual(is)
              antes de importar a nova lista. Desmarque para <b>adicionar</b> à lista existente.
            </label>
          </div>

          <button
            type="submit"
            disabled={processando}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-xs transition disabled:opacity-60"
          >
            {processando ? '⏳ Processando...' : '📤 Processar Importação'}
          </button>
        </form>
      </div>

      {/* CARD 2: LISTA IMPORTADA */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center gap-2 text-lg font-extrabold text-slate-900 mb-4">
          <span>📋 Lista Importada</span>
          <span className="ml-auto text-sm font-medium text-slate-500">
            {dados.total.toLocaleString('pt-BR')} morador(es) na base
          </span>
        </div>

        {dados.total === 0 ? (
          <div className="text-center py-12 px-4 text-slate-400 text-sm">
            <span className="text-4xl block mb-3 opacity-60">📭</span>
            Nenhum morador importado ainda.
            <br />
            <small className="text-slate-400">Importe um arquivo CSV para cruzar com os pré-cadastros.</small>
          </div>
        ) : (
          <>
            {dados.total > 100 && (
              <div className="bg-slate-50 px-4 py-2.5 rounded-lg mb-4 text-xs text-slate-500 font-medium">
                Exibindo os primeiros 100 de {dados.total.toLocaleString('pt-BR')} registos.
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[600px] border-collapse bg-white">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left text-xs font-bold uppercase tracking-wide text-slate-500 px-4 py-3">
                      Nome
                    </th>
                    <th className="text-left text-xs font-bold uppercase tracking-wide text-slate-500 px-4 py-3">
                      CPF
                    </th>
                    <th className="text-left text-xs font-bold uppercase tracking-wide text-slate-500 px-4 py-3">
                      Bloco / Unidade
                    </th>
                    <th className="text-left text-xs font-bold uppercase tracking-wide text-slate-500 px-4 py-3">
                      Importado em
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {dados.lista.map((m) => (
                    <tr key={m.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70">
                      <td className="px-4 py-3 text-sm font-bold text-slate-900">{m.nome}</td>
                      <td className="px-4 py-3 text-sm font-mono text-slate-600">{formatarCpf(m.cpf)}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{m.unidade || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{formatarData(m.importado_em)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
