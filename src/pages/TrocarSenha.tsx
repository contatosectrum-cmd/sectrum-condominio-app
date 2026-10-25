import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { KeyRound, AlertTriangle, LogOut } from 'lucide-react';
import { sair, trocarSenha, useSessao } from '../lib/useSessao';
import { ErroApi } from '../lib/api';

// Paridade com TrocarSenhaController (legado): minimo 6 caracteres, confirmacao igual,
// zera primeiro_acesso e leva o usuario para a pagina inicial do perfil.
export default function TrocarSenha() {
  const { usuario } = useSessao();
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const navigate = useNavigate();

  if (!usuario) return <Navigate to="/login" replace />;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    if (nova.length < 6) return setErro('A nova senha deve ter pelo menos 6 caracteres.');
    if (nova !== confirma) return setErro('As senhas não coincidem.');
    setSalvando(true);
    try {
      const r = await trocarSenha(nova, confirma);
      navigate(r.destino ?? '/', { replace: true });
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : 'Erro de conexão.');
    } finally {
      setSalvando(false);
    }
  };

  const campo =
    'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-medium text-slate-800';

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-10">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-6">
          <KeyRound size={28} />
        </div>
        <h1 className="text-2xl font-bold text-slate-800">Definição de Senha</h1>
        <p className="text-slate-500 text-sm mt-1 mb-6">
          Olá, <strong>{usuario.nome}</strong>. {usuario.primeiro_acesso === 1 ? 'Este é o seu primeiro acesso: defina uma nova senha para continuar.' : 'Defina sua nova senha.'}
        </p>

        {erro && (
          <div className="mb-5 flex items-start gap-2 bg-rose-50 border-l-4 border-rose-500 text-rose-800 text-sm px-4 py-3 rounded-lg">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <span>{erro}</span>
          </div>
        )}

        <form onSubmit={enviar} className="space-y-4">
          <div>
            <label htmlFor="nova" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Nova senha</label>
            <input id="nova" type="password" autoComplete="new-password" minLength={6} required value={nova} onChange={(e) => setNova(e.target.value)} className={campo} autoFocus />
          </div>
          <div>
            <label htmlFor="confirma" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Confirmar nova senha</label>
            <input id="confirma" type="password" autoComplete="new-password" minLength={6} required value={confirma} onChange={(e) => setConfirma(e.target.value)} className={campo} />
          </div>
          <button type="submit" disabled={salvando} className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 transition-all disabled:opacity-70">
            {salvando ? 'Salvando...' : 'Salvar nova senha'}
          </button>
        </form>

        <button onClick={sair} className="mt-6 w-full flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-slate-700">
          <LogOut size={16} /> Sair
        </button>
      </div>
    </div>
  );
}
