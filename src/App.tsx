import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MoradorLayout from './components/MoradorLayout';
import MoradorHome, { MonitorGlobalInterfone } from './pages/morador/MoradorHome';
import MoradorInterfone from './pages/morador/MoradorInterfone';
import MoradorConvites from './pages/morador/MoradorConvites';
import MoradorBiometria from './pages/morador/MoradorBiometria';
import MoradorVisitantes from './pages/morador/MoradorVisitantes';
import MoradorDependentes from './pages/morador/MoradorDependentes';
import MoradorFuncionarios from './pages/morador/MoradorFuncionarios';
import MoradorVeiculos from './pages/morador/MoradorVeiculos';
import MoradorPets from './pages/morador/MoradorPets';
import MoradorAluguel from './pages/morador/MoradorAluguel';
import MoradorEncomendas from './pages/morador/MoradorEncomendas';
import MoradorAvisos from './pages/morador/MoradorAvisos';
import MoradorBoletos from './pages/morador/MoradorBoletos';
import ConviteExterno from './pages/ConviteExterno';
import ConviteTemporada from './pages/ConviteTemporada';
import Layout from './components/Layout';
import ProtegerRota from './components/ProtegerRota';
import Dashboard from './pages/Dashboard';
import Portaria from './pages/Portaria';
// Pessoas.tsx (fase anterior) fica guardado: webcam/silhueta e importacao serao reaproveitadas no cadastro
import Moradores from './pages/Moradores';
import PreCadastroExterno from './pages/PreCadastroExterno';
import Precadastros from './pages/Precadastros';
import Visitas from './pages/Visitas';
import Encomendas from './pages/Encomendas';
import Avisos from './pages/Avisos';
import Estrutura from './pages/Estrutura';
import Terminais from './pages/Terminais';
import Cameras from './pages/Cameras';
import Configuracoes from './pages/Configuracoes';
import Auditoria from './pages/Auditoria';
import Login from './pages/Login';
import TrocarSenha from './pages/TrocarSenha';
import Usuarios from './pages/Usuarios';
import Condominios from './pages/Condominios';
import GruposAcesso from './pages/GruposAcesso';
import Acessos from './pages/Acessos';
import RelatorioVoip from './pages/RelatorioVoip';
import Veiculos from './pages/Veiculos';
import ConsultaPlaca from './pages/ConsultaPlaca';
import Backup from './pages/Backup';
import ImportarMoradores from './pages/ImportarMoradores';
import LogsSistema from './pages/LogsSistema';
import ReservasAreas from './pages/ReservasAreas';
import Ocorrencias from './pages/Ocorrencias';
import Enquetes from './pages/Enquetes';
import Mudancas from './pages/Mudancas';
import Manutencoes from './pages/Manutencoes';
import Financeiro from './pages/Financeiro';
import Transparencia from './pages/Transparencia';
import WhatsappCentral from './pages/WhatsappCentral';
import ListaRestricao from './pages/ListaRestricao';
import VisaoFacialIA from './pages/VisaoFacialIA';
import GestaoPets from './pages/GestaoPets';

const EmConstrucao = ({ titulo }: { titulo: string }) => (
  <div className="m-8 bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center min-h-[400px]">
    <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mb-4">
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>
    </div>
    <h3 className="text-xl font-bold text-slate-800 mb-2">Módulo {titulo}</h3>
    <p className="text-slate-500 max-w-md">
      Esta tela ainda está sendo migrada do sistema legado (PHP) para React.
    </p>
  </div>
);

/**
 * Compatibilidade com links do legado já enviados por WhatsApp (ex.: /?acao=precadastro_externo&t=TOKEN):
 * antes do roteador ler a URL, troca pelo caminho novo equivalente, mantendo o token.
 */
const ROTAS_LEGADAS: Record<string, string> = {
  precadastro_externo: '/precadastro',
  convite_externo: '/convite',
  convite_temporada: '/temporada',
  login: '/login',
};
(() => {
  const q = new URLSearchParams(window.location.search);
  const destino = ROTAS_LEGADAS[q.get('acao') ?? ''];
  if (window.location.pathname === '/' && destino) {
    const t = q.get('t');
    window.history.replaceState(null, '', destino + (t ? `?t=${encodeURIComponent(t)}` : ''));
  }
})();

function App() {
  return (
    <BrowserRouter>
      <MonitorGlobalInterfone />
      <Routes>
        {/* Rotas públicas */}
        <Route path="/login" element={<Login />} />
        <Route path="/trocar-senha" element={<TrocarSenha />} />
        {/* Formulários públicos por link com token e atalhos curtos */}
        <Route path="/precadastro" element={<PreCadastroExterno />} />
        <Route path="/praiasbelas" element={<Navigate to="/precadastro?t=96404600d9c55e11a6c0af233cc8548a" replace />} />
        <Route path="/convite" element={<ConviteExterno />} />
        <Route path="/temporada" element={<ConviteTemporada />} />

        {/* App do morador */}
        <Route element={<ProtegerRota area="morador" />}>
          <Route path="/morador" element={<MoradorLayout />}>
            <Route index element={<MoradorHome />} />
            <Route path="boletos" element={<MoradorBoletos />} />
            <Route path="transparencia" element={<Transparencia />} />
            <Route path="interfone" element={<MoradorInterfone />} />
            <Route path="reservas" element={<ReservasAreas />} />
            <Route path="convites" element={<MoradorConvites />} />
            <Route path="visitantes" element={<MoradorVisitantes />} />
            <Route path="dependentes" element={<MoradorDependentes />} />
            <Route path="funcionarios" element={<MoradorFuncionarios />} />
            <Route path="veiculos" element={<MoradorVeiculos />} />
            <Route path="pets" element={<MoradorPets />} />
            <Route path="aluguel" element={<MoradorAluguel />} />
            <Route path="mudancas" element={<Mudancas />} />
            <Route path="encomendas" element={<MoradorEncomendas />} />
            <Route path="ocorrencias" element={<Ocorrencias />} />
            <Route path="enquetes" element={<Enquetes />} />
            <Route path="avisos" element={<MoradorAvisos />} />
            <Route path="biometria" element={<MoradorBiometria />} />
            <Route path="*" element={<Navigate to="/morador" replace />} />
          </Route>
        </Route>

        {/* Sistema interno (equipe: superadmin, síndico, portaria) */}
        <Route element={<ProtegerRota area="equipe" />}>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />

            {/* Visão geral / SaaS */}
            <Route path="financeiro" element={<Financeiro />} />
            <Route path="transparencia" element={<Transparencia />} />
            <Route path="whatsapp" element={<WhatsappCentral />} />
            <Route path="avisos" element={<Avisos />} />
            <Route path="reservas" element={<ReservasAreas />} />
            <Route path="mudancas" element={<Mudancas />} />
            <Route path="ocorrencias" element={<Ocorrencias />} />
            <Route path="manutencoes" element={<Manutencoes />} />
            <Route path="enquetes" element={<Enquetes />} />
            <Route path="condominios" element={<Condominios />} />
            <Route path="backup" element={<Backup />} />
            <Route path="configuracoes" element={<Configuracoes />} />

            {/* Operação (Portaria) */}
            <Route path="portaria" element={<Portaria />} />
            <Route path="painel-portaria" element={<Encomendas />} />
            <Route path="encomendas" element={<Encomendas />} />
            <Route path="visitas" element={<Visitas />} />
            <Route path="precadastros" element={<Precadastros />} />
            <Route path="consulta-placa" element={<ConsultaPlaca />} />
            <Route path="pets" element={<GestaoPets />} />

            {/* Cadastros */}
            <Route path="pessoas" element={<Moradores />} />
            <Route path="visao-facial" element={<VisaoFacialIA />} />
            <Route path="lista-restricao" element={<ListaRestricao />} />
            <Route path="pessoas/importar" element={<ImportarMoradores />} />
            <Route path="veiculos" element={<Veiculos />} />
            <Route path="estrutura" element={<Estrutura />} />

            {/* Dispositivos */}
            <Route path="terminais" element={<Terminais />} />
            <Route path="cameras" element={<Cameras />} />

            {/* Administração & Logs */}
            <Route path="acessos" element={<Acessos />} />
            <Route path="relatorio-voip" element={<RelatorioVoip />} />
            <Route path="auditoria" element={<Auditoria />} />
            <Route path="logs-sistema" element={<LogsSistema />} />
            <Route path="usuarios" element={<Usuarios />} />
            <Route path="grupos-acesso" element={<GruposAcesso />} />

            <Route path="*" element={<EmConstrucao titulo="Não Encontrada" />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
