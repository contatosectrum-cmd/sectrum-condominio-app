import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { api, ErroApi } from '../../lib/api';
import { desbloquearContextoAudioConversa } from '../../lib/interfoneAudio';
import { lerChamadaAtendidaNativa } from '../../lib/nativo';
import {
  PainelInterfoneDigitalMorador,
  ModalConversaApartamento,
  ModalChamadaInterfoneRecebida,
  desbloquearAudioInterfone,
  iniciarPulsoChamando,
  pararPulsoChamando,
  sincronizarWebPushInterfone,
  type PainelInterfoneDados,
  type SessaoChamadaApartamento,
  type ChamadaInterfone,
} from './MoradorHome';

export default function MoradorInterfone() {
  const [dadosInterfone, setDadosInterfone] = useState<PainelInterfoneDados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [discando, setDiscando] = useState(false);
  const [sessaoAptAtiva, setSessaoAptAtiva] = useState<SessaoChamadaApartamento | null>(null);
  const [chamadaTocando, setChamadaTocando] = useState<ChamadaInterfone | null>(null);
  const [abrindoDireto, setAbrindoDireto] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const chamadasIgnoradasRef = useRef<Set<string>>(new Set());

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await api<PainelInterfoneDados>('morador_interfone_painel');
      setDadosInterfone(r);
    } catch (e) {
      setMsg({
        tipo: 'erro',
        texto: e instanceof ErroApi ? e.message : 'Erro ao carregar o interfone.',
      });
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    sincronizarWebPushInterfone();
  }, [carregar]);

  // Monitora chamadas de saída e de entrada enquanto o morador está na tela do Interfone Digital
  useEffect(() => {
    let cancelado = false;

    const verificarInterfone = async () => {
      if (cancelado) return;
      try {
        const r = await api<{
          chamada: ChamadaInterfone | null;
          chamada_sainte?: {
            call_id: string;
            status: string;
            destino_nome: string;
            destino_codigo: string;
          } | null;
        }>('morador_interfone_status');
        if (cancelado) return;

        if (r.chamada_sainte) {
          const cs = r.chamada_sainte;
          setSessaoAptAtiva((atual) => {
            if (!atual || atual.call_id !== cs.call_id) return atual;
            if (atual.status !== cs.status) {
              return { ...atual, status: cs.status };
            }
            return atual;
          });
        }

        const c = r.chamada;
        if (
          c &&
          c.status === 'ringing' &&
          !chamadasIgnoradasRef.current.has(c.call_id) &&
          sessaoAptAtiva?.call_id !== c.call_id
        ) {
          setChamadaTocando(c);
        } else if (!c || c.status !== 'ringing') {
          setChamadaTocando((atual) => {
            if (atual) carregar();
            return null;
          });
        }
      } catch {
        // Ignora oscilações de rede
      }
    };

    const aoMensagemSw = (ev: MessageEvent) => {
      if (ev.data && ev.data.type === 'SECTRUM_PUSH_INTERFONE') {
        verificarInterfone();
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', aoMensagemSw);
    }
    document.addEventListener('visibilitychange', verificarInterfone);

    verificarInterfone();
    const timer = window.setInterval(verificarInterfone, 1200);
    return () => {
      cancelado = true;
      window.clearInterval(timer);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', aoMensagemSw);
      }
      document.removeEventListener('visibilitychange', verificarInterfone);
    };
  }, [sessaoAptAtiva?.call_id, carregar]);

  // iOS: chamada atendida na tela nativa (CallKit) ou recusada nela -> sincroniza a tela do app.
  // Ao atender com o iPhone desbloqueado, o iOS abre o app e espera que ele mostre a ligação em andamento.
  useEffect(() => {
    const aoAtendidaNativa = (ev: Event) => {
      const d = lerChamadaAtendidaNativa(ev);
      if (!d) return;
      chamadasIgnoradasRef.current.add(d.call_id);
      setChamadaTocando(null);
      setSessaoAptAtiva((atual) =>
        atual?.call_id === d.call_id
          ? atual
          : {
              call_id: d.call_id,
              status: 'answered',
              direcao: 'recebida',
              contraparte_nome: d.origem_nome || 'Interfone',
              device_id: d.device_id || 'APT:0',
            },
      );
    };
    const aoRecusadaNativa = (ev: Event) => {
      const cid = (ev as CustomEvent<{ call_id?: string } | undefined>)?.detail?.call_id;
      if (cid) {
        chamadasIgnoradasRef.current.add(cid);
        setChamadaTocando(null);
      }
    };
    window.addEventListener('sectrum-callkit-atendida-nativa', aoAtendidaNativa);
    window.addEventListener('sectrum-callkit-recusar', aoRecusadaNativa);
    return () => {
      window.removeEventListener('sectrum-callkit-atendida-nativa', aoAtendidaNativa);
      window.removeEventListener('sectrum-callkit-recusar', aoRecusadaNativa);
    };
  }, []);

  const discarParaApartamento = async (params: { unidade_id?: number; codigo?: string }) => {
    desbloquearAudioInterfone();
    desbloquearContextoAudioConversa();
    iniciarPulsoChamando();
    sincronizarWebPushInterfone();
    setDiscando(true);
    setMsg(null);
    try {
      const r = await api<{
        tipo: string;
        mensagem: string;
        chamada: {
          call_id: string;
          status: string;
          destino_unidade_id: number;
          destino_nome: string;
          destino_codigo: string;
        };
      }>('morador_interfone_discar', {
        corpo: params,
      });
      setSessaoAptAtiva({
        call_id: r.chamada.call_id,
        status: 'ringing',
        direcao: 'realizada',
        contraparte_nome: r.chamada.destino_nome,
        contraparte_codigo: r.chamada.destino_codigo,
        device_id: `APT:${r.chamada.destino_unidade_id}`,
      });
      carregar();
    } catch (e) {
      pararPulsoChamando();
      setMsg({
        tipo: 'erro',
        texto: e instanceof ErroApi ? e.message : 'Não foi possível chamar o apartamento.',
      });
    } finally {
      setDiscando(false);
    }
  };

  const encerrarChamadaApartamento = async () => {
    pararPulsoChamando();
    const atual = sessaoAptAtiva;
    setSessaoAptAtiva(null);
    if (atual) {
      await api('morador_interfone_sinalizar', {
        corpo: {
          call_id: atual.call_id,
          device_id: atual.device_id || 'APT:0',
          acao: atual.status === 'ringing' && atual.direcao === 'realizada' ? 'cancel' : 'hangUp',
        },
      }).catch(() => undefined);
      carregar();
    }
  };

  const atenderChamadaInterfone = async (c: ChamadaInterfone) => {
    desbloquearContextoAudioConversa();
    chamadasIgnoradasRef.current.add(c.call_id);
    setChamadaTocando(null);

    api('morador_interfone_sinalizar', {
      corpo: {
        call_id: c.call_id,
        device_id: c.device_id,
        acao: 'answer',
      },
    }).catch(() => undefined);

    setSessaoAptAtiva({
      call_id: c.call_id,
      status: 'answered',
      direcao: 'recebida',
      contraparte_nome: c.origem_nome || c.nome_portaria,
      device_id: c.device_id,
    });
  };

  const recusarChamadaInterfone = async (c: ChamadaInterfone) => {
    chamadasIgnoradasRef.current.add(c.call_id);
    setChamadaTocando(null);
    await api('morador_interfone_sinalizar', {
      corpo: {
        call_id: c.call_id,
        device_id: c.device_id,
        acao: 'reject',
      },
    }).catch(() => undefined);
    carregar();
  };

  const abrirPortaDiretoDoInterfone = async (c: ChamadaInterfone) => {
    setAbrindoDireto(c.porta);
    try {
      await api('morador_interfone_sinalizar', {
        corpo: {
          call_id: c.call_id,
          device_id: c.device_id,
          acao: 'answer',
        },
      }).catch(() => undefined);
      const r = await api<{ tipo: 'ok' | 'erro'; mensagem: string }>('morador_abrir_porta', {
        corpo: { comando_abertura: c.porta },
      });
      chamadasIgnoradasRef.current.add(c.call_id);
      setChamadaTocando(null);
      setMsg({
        tipo: r.tipo,
        texto: `${r.mensagem} (${c.nome_portaria})`,
      });
      carregar();
    } catch (e) {
      setMsg({
        tipo: 'erro',
        texto: e instanceof ErroApi ? e.message : 'Falha ao abrir porta.',
      });
    } finally {
      setAbrindoDireto(null);
    }
  };

  return (
    <div className="max-w-[680px] mx-auto px-2.5 sm:px-4 py-3 space-y-3">
      {chamadaTocando && !sessaoAptAtiva && (
        <ModalChamadaInterfoneRecebida
          chamada={chamadaTocando}
          onAtender={() => atenderChamadaInterfone(chamadaTocando)}
          onRecusar={() => recusarChamadaInterfone(chamadaTocando)}
          onAbrirDireto={() => abrirPortaDiretoDoInterfone(chamadaTocando)}
          abrindoDireto={abrindoDireto === chamadaTocando.porta}
        />
      )}

      {sessaoAptAtiva && (
        <ModalConversaApartamento
          sessao={sessaoAptAtiva}
          onEncerrar={encerrarChamadaApartamento}
          onStatusMudou={(novoStatus) =>
            setSessaoAptAtiva((atual) => (atual ? { ...atual, status: novoStatus } : null))
          }
        />
      )}

      {msg && (
        <div
          className={`border-l-4 px-4 py-2.5 rounded-lg text-sm font-semibold flex justify-between items-center gap-3 ${
            msg.tipo === 'ok'
              ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
              : 'bg-rose-50 border-rose-500 text-rose-800'
          }`}
        >
          <span>{msg.texto}</span>
          <button onClick={() => setMsg(null)} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
      )}

      <PainelInterfoneDigitalMorador
        dadosInterfone={dadosInterfone}
        carregando={carregando}
        discando={discando}
        onDiscarUnidade={(u) => discarParaApartamento({ unidade_id: u.unidade_id })}
        onDiscarCodigo={(codigo) => discarParaApartamento({ codigo })}
        onAtualizar={carregar}
      />
    </div>
  );
}
