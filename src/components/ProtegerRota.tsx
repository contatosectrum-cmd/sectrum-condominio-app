// Protecao de rotas no frontend (espelho das barreiras do index.php do legado):
// 1) sem login -> /login; 2) primeiro acesso -> /trocar-senha;
// 3) morador so ve o app do morador; equipe nao entra no app do morador;
// 4) perfil sem permissao para a tela -> pagina inicial do perfil.
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSessao } from '../lib/useSessao';
import { inicioDoPerfil, itemDoCaminho, podeVer } from '../lib/menu';

interface Props {
  area: 'equipe' | 'morador';
}

export default function ProtegerRota({ area }: Props) {
  const { usuario } = useSessao();
  const local = useLocation();

  if (!usuario) return <Navigate to="/login" replace state={{ de: local.pathname }} />;
  if (usuario.primeiro_acesso === 1) return <Navigate to="/trocar-senha" replace />;

  const ehMorador = usuario.perfil === 'morador';
  if (area === 'equipe' && ehMorador) return <Navigate to="/morador" replace />;
  if (area === 'morador' && !ehMorador) return <Navigate to={inicioDoPerfil(usuario)} replace />;

  const item = itemDoCaminho(local.pathname);
  if (item && !podeVer(item, usuario)) {
    const inicio = inicioDoPerfil(usuario);
    // Evita laco caso a propria pagina inicial nao seja permitida
    if (inicio !== local.pathname) return <Navigate to={inicio} replace />;
  }
  return <Outlet />;
}
