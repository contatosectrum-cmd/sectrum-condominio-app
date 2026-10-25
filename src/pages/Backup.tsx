import { useState } from 'react';
import { X } from 'lucide-react';
import { obterToken } from '../lib/sessao';

// Paridade com src/views/backup.php + BackupController.php ("Cópia de Segurança Geral (Sectrum)"):
// Exclusivo para Super Admin. Gera em tempo real um pacote .ZIP com todos os arquivos do servidor e inicia o download.

export default function Backup() {
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState('');

  const baixarBackup = async () => {
    setBaixando(true);
    setErro('');
    try {
      const resp = await fetch('/api.php?route=backup_baixar', {
        headers: {
          Authorization: `Bearer ${obterToken() ?? ''}`,
        },
      });

      if (!resp.ok) {
        let msg = `Erro ${resp.status} ao gerar o arquivo de backup.`;
        try {
          const j = await resp.json();
          if (j?.mensagem) msg = String(j.mensagem);
        } catch {
          // resposta nao era JSON
        }
        throw new Error(msg);
      }

      const blob = await resp.blob();
      const disp = resp.headers.get('Content-Disposition') ?? '';
      const match = disp.match(/filename="?([^"]+)"?/i);
      const nomeArquivo = match?.[1] ?? `Sectrum_Backup_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.zip`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nomeArquivo;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro inesperado ao baixar o backup.');
    } finally {
      setBaixando(false);
    }
  };

  return (
    <div className="p-6 lg:p-8">
      {erro && (
        <div className="max-w-[600px] mx-auto mb-4 border-l-4 px-4 py-3 rounded-lg text-sm font-semibold flex justify-between items-center gap-3 bg-rose-50 border-rose-500 text-rose-800">
          <span>{erro}</span>
          <button onClick={() => setErro('')} aria-label="Fechar erro">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 border-t-4 border-t-amber-500 p-6 shadow-sm max-w-[600px] mx-auto">
        <div className="text-lg font-extrabold text-amber-600 mb-4">💾 Cópia de Segurança Geral (Sectrum)</div>

        <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg mb-5 leading-relaxed text-amber-800 text-sm">
          ⚠️ <b>Atenção do Desenvolvedor:</b>
          <br />
          Este botão compila em tempo real <b>todos os arquivos de código PHP, regras do roteador, views e uploads</b>{' '}
          contidos no servidor e gera um arquivo compactado instantâneo.
          <br />
          <br />O processamento pode demorar alguns segundos dependendo do volume total de imagens de visitantes salvas
          em disco.
        </div>

        <div className="text-center py-5">
          <button
            type="button"
            disabled={baixando}
            onClick={baixarBackup}
            className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-[1.05rem] px-7 py-3.5 rounded-lg inline-block shadow-[0_4px_12px_rgba(245,158,11,0.25)] transition disabled:opacity-60 cursor-pointer"
          >
            {baixando ? '⏳ Compactando arquivos, aguarde...' : '📦 Compactar e Baixar Código (.ZIP)'}
          </button>
        </div>

        <div className="text-xs text-slate-400 text-center mt-2.5">
          O arquivo gerado será apagado do servidor automaticamente após a conclusão do download.
        </div>
      </div>
    </div>
  );
}
