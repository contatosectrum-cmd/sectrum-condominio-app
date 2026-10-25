import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

// Impede que o erro de uma tela derrube o app inteiro (tela branca). Mostra aviso e permite tentar de novo.
interface Props { children: ReactNode; chave?: string }
interface Estado { erro: Error | null }

export default class LimiteErro extends Component<Props, Estado> {
  state: Estado = { erro: null };

  static getDerivedStateFromError(erro: Error): Estado {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('Erro na tela:', erro, info.componentStack);
  }

  componentDidUpdate(anterior: Props) {
    // Ao navegar para outra tela, limpa o erro
    if (anterior.chave !== this.props.chave && this.state.erro) this.setState({ erro: null });
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="m-8 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-8 text-center">
        <AlertTriangle size={36} className="mx-auto mb-3 text-rose-500" />
        <h3 className="text-lg font-bold">Esta tela encontrou um erro</h3>
        <p className="text-sm mt-1 font-mono">{this.state.erro.message}</p>
        <button onClick={() => this.setState({ erro: null })} className="mt-4 px-4 py-2 bg-rose-600 text-white rounded-lg font-bold text-sm hover:bg-rose-700">
          Tentar novamente
        </button>
      </div>
    );
  }
}
