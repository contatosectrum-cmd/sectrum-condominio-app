// components/ModalExcluirConta.tsx
// Exclusão da conta pelo próprio usuário (exigência da Apple, regra 5.1.1(v), e direito do titular na LGPD).
import { useState } from 'react';
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import { sair } from '../lib/useSessao';

interface RespostaExclusao {
  tipo: string;
  excluida: boolean;
  mensagem: string;
}

export default function ModalExcluirConta({ perfil, onFechar }: { perfil: string; onFechar: () => void }) {
  const [senha, setSenha] = useState('');
  const [confirmo, setConfirmo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState<RespostaExclusao | null>(null);
  const ehMorador = perfil === 'morador';

  const excluir = async () => {
    setErro('');
    if (!senha.trim()) {
      setErro('Digite a sua senha para confirmar.');
      return;
    }
    setEnviando(true);
    try {
      const r = await api<RespostaExclusao>('excluir_minha_conta', { corpo: { senha } });
      setResultado(r);
      if (r.excluida) {
        // Conta excluída: apaga a sessão guardada no aparelho (o servidor já recusa novos acessos desta conta)
        try {
          localStorage.removeItem('sectrum_interfone_token');
          localStorage.removeItem('sectrum_interfone_usuario');
        } catch {
          // Ignora
        }
        try {
          window.SectrumAndroid?.limparSessaoNativa?.();
        } catch {
          // Ignora
        }
      }
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível excluir a conta agora. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2 text-rose-600">
            <Trash2 size={20} />
            <h2 className="text-base font-black">Excluir minha conta</h2>
          </div>
          {!resultado?.excluida && (
            <button type="button" onClick={onFechar} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Fechar">
              <X size={20} />
            </button>
          )}
        </div>

        {resultado ? (
          <div className="space-y-4 px-5 py-5">
            <p className="text-sm text-slate-700">{resultado.mensagem}</p>
            <button
              type="button"
              onClick={() => (resultado.excluida ? sair() : onFechar())}
              className="w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white"
            >
              {resultado.excluida ? 'Sair do aplicativo' : 'Fechar'}
            </button>
          </div>
        ) : (
          <div className="space-y-4 px-5 py-5">
            <div className="flex gap-3 rounded-xl bg-rose-50 p-3 text-rose-800">
              <AlertTriangle size={20} className="mt-0.5 shrink-0" />
              <div className="text-xs leading-relaxed">
                {ehMorador ? (
                  <>
                    <p className="font-bold">Esta ação não pode ser desfeita.</p>
                    <ul className="mt-1 list-disc pl-4">
                      <li>Seu acesso ao aplicativo termina imediatamente;</li>
                      <li>Seu cadastro facial é removido das catracas e leitores do condomínio;</li>
                      <li>A administração do condomínio é avisada e conclui a exclusão dos dados restantes.</li>
                    </ul>
                  </>
                ) : (
                  <p>
                    Sua conta é da equipe do condomínio. O pedido de exclusão será enviado à administração, que concluirá a
                    exclusão e confirmará com você.
                  </p>
                )}
              </div>
            </div>

            <label className="block">
              <span className="text-xs font-bold text-slate-600">Confirme com a sua senha</span>
              <input
                type="password"
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
                placeholder="Sua senha"
              />
            </label>

            <label className="flex items-start gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} className="mt-0.5" />
              <span>{ehMorador ? 'Entendo que minha conta será excluída.' : 'Quero solicitar a exclusão da minha conta.'}</span>
            </label>

            {erro && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{erro}</p>}

            <div className="flex gap-2">
              <button type="button" onClick={onFechar} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-600">
                Cancelar
              </button>
              <button
                type="button"
                disabled={!confirmo || enviando}
                onClick={excluir}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {enviando && <Loader2 size={16} className="animate-spin" />}
                {ehMorador ? 'Excluir conta' : 'Solicitar exclusão'}
              </button>
            </div>

            <p className="text-center text-[11px] text-slate-400">
              Saiba mais na{' '}
              <a href="/politica-de-privacidade.html" className="underline">
                Política de Privacidade
              </a>
              .
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
