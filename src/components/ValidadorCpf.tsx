import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Search, CheckCircle2, RefreshCw } from 'lucide-react';
import {
  limparCpf,
  validarCpfModulo11,
  regiaoFiscalCpf,
  consultarCpfReceita,
  type RespostaConsultaCpf,
} from '../lib/cpf';

interface Props {
  cpf: string;
  onNomeEncontrado?: (nome: string) => void;
  autoConsultar?: boolean;
  compacto?: boolean;
}

export default function ValidadorCpf({
  cpf,
  onNomeEncontrado,
  autoConsultar = true,
  compacto = false,
}: Props) {
  const digitos = limparCpf(cpf);
  const [consultando, setConsultando] = useState(false);
  const [dadosApi, setDadosApi] = useState<RespostaConsultaCpf | null>(null);

  const tem11 = digitos.length === 11;
  const validoMat = tem11 ? validarCpfModulo11(digitos) : false;
  const ufEmissao = tem11 && validoMat ? regiaoFiscalCpf(digitos) : '';

  useEffect(() => {
    setDadosApi(null);
    if (!tem11 || !validoMat || !autoConsultar) return;

    let ativo = true;
    setConsultando(true);
    consultarCpfReceita(digitos, false)
      .then((res) => {
        if (!ativo) return;
        setDadosApi(res);
        if (res.nome_sugerido && onNomeEncontrado) {
          onNomeEncontrado(res.nome_sugerido);
        }
      })
      .catch(() => {
        // Silencioso no auto-check; mantém validação Módulo 11 local
      })
      .finally(() => {
        if (ativo) setConsultando(false);
      });

    return () => {
      ativo = false;
    };
  }, [digitos, tem11, validoMat, autoConsultar]);

  const consultarManual = async () => {
    if (!tem11 || !validoMat) return;
    setConsultando(true);
    try {
      const res = await consultarCpfReceita(digitos, true);
      setDadosApi(res);
      if (res.nome_sugerido && onNomeEncontrado) {
        onNomeEncontrado(res.nome_sugerido);
      }
    } catch {
      // mantém estado atual
    } finally {
      setConsultando(false);
    }
  };

  if (digitos.length === 0) return null;

  // Enquanto digita (< 11 dígitos)
  if (!tem11) {
    if (compacto) return null;
    return (
      <div className="mt-1 text-[0.72rem] font-semibold text-slate-400">
        Digitando CPF: {digitos.length}/11 dígitos...
      </div>
    );
  }

  // 11 dígitos mas inválido pelo cálculo oficial da Receita Federal (Módulo 11)
  if (!validoMat) {
    return (
      <div className="mt-1.5 px-3 py-2 rounded-lg bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold flex items-center gap-2">
        <ShieldAlert size={16} className="text-rose-600 shrink-0" />
        <span>
          CPF INVÁLIDO: Os dígitos verificadores não conferem com o cálculo oficial da Receita Federal (erro de digitação ou número falso).
        </span>
      </div>
    );
  }

  const situacaoIrregular = dadosApi && !dadosApi.valido;

  if (situacaoIrregular) {
    return (
      <div className="mt-1.5 px-3 py-2 rounded-lg bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <ShieldAlert size={16} className="text-rose-600 shrink-0" />
          <span>
            Alerta Receita Federal: <b>{dadosApi.situacao_cadastral}</b> — {dadosApi.mensagem}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-1.5 px-3 py-2 rounded-lg bg-emerald-50/90 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-2 min-w-0">
        {dadosApi?.confirmado_governo ? (
          <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
        ) : (
          <ShieldCheck size={15} className="text-emerald-600 shrink-0" />
        )}
        <div className="leading-snug">
          <span className="font-extrabold text-emerald-800">
            {dadosApi?.confirmado_governo
              ? `Confirmado na Receita Federal (${dadosApi.situacao_cadastral})`
              : 'CPF Válido (Padrão Receita Federal • Módulo 11)'}
          </span>
          {ufEmissao && (
            <span className="ml-1.5 text-[0.7rem] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
              Emissão: {ufEmissao}
            </span>
          )}
          {dadosApi?.nome_sugerido && (
            <span className="block text-[0.73rem] text-emerald-700 font-semibold mt-0.5">
              Titular identificado: <b>{dadosApi.nome_sugerido}</b>
              {dadosApi.origem_local ? ` (${dadosApi.origem_local})` : ''}
              {dadosApi.data_nascimento ? ` • Nasc: ${dadosApi.data_nascimento}` : ''}
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={consultarManual}
        disabled={consultando}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-[0.7rem] transition cursor-pointer shrink-0 disabled:opacity-60"
        title="Consultar / revalidar situação cadastral na base"
      >
        {consultando ? <RefreshCw size={12} className="animate-spin" /> : <Search size={12} />}
        {consultando ? 'Verificando...' : dadosApi?.confirmado_governo ? 'Revalidar RFB' : 'Confirmar Base'}
      </button>
    </div>
  );
}
