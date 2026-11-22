import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, PhoneCall, MessageCircle, CheckCircle2, Radio, ExternalLink, X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useSessao } from '../lib/useSessao';
import {
  emojiEspeciePet,
  gerarLinkWhatsappTutor,
  resolverUrlFotoPet,
  tempoPerdidoLegivel,
  type PetItem,
} from '../lib/petsUtils';

interface Props {
  /** Callback direta quando já estamos na tela da Portaria (dispara o Interfone WebRTC sem recarregar). */
  onLigarInterfoneUnidade?: (unidadeId: number) => void;
  /** Oculta o botão de ir para /pets quando o banner já está sendo renderizado dentro de /pets. */
  ocultarLinkModulo?: boolean;
}

export default function BannerAlertaPetsPerdidos({
  onLigarInterfoneUnidade,
  ocultarLinkModulo = false,
}: Props) {
  const { usuario } = useSessao();
  const navigate = useNavigate();
  const [alertas, setAlertas] = useState<PetItem[]>([]);
  const [encerrandoId, setEncerrandoId] = useState<number | null>(null);
  const [fotoAmpliada, setFotoAmpliada] = useState<{ url: string; nome: string } | null>(null);

  const carregarAlertas = useCallback(async () => {
    if (!usuario?.condominio_id) {
      setAlertas([]);
      return;
    }
    try {
      const r = await api<{ alertas: PetItem[] }>('pets_alertas_ativos');
      setAlertas(r.alertas ?? []);
    } catch {
      // Ignora falhas transitórias de rede no polling silencioso
    }
  }, [usuario?.condominio_id]);

  useEffect(() => {
    void carregarAlertas();
    const timer = window.setInterval(carregarAlertas, 6000);
    const onAtualizado = () => {
      void carregarAlertas();
    };
    window.addEventListener('sectrum:pets-atualizados', onAtualizado);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('sectrum:pets-atualizados', onAtualizado);
    };
  }, [carregarAlertas]);

  if (alertas.length === 0) return null;

  const acionarInterfone = (unidadeId: number) => {
    if (onLigarInterfoneUnidade) {
      onLigarInterfoneUnidade(unidadeId);
    } else {
      navigate(`/portaria?ligar_unidade=${unidadeId}`);
    }
  };

  const marcarEncontrado = async (pet: PetItem) => {
    if (!window.confirm(`Confirmar que o pet "${pet.nome}" (${pet.unidade_label}) foi encontrado e encerrar o alerta?`)) {
      return;
    }
    setEncerrandoId(pet.id);
    try {
      await api('pets_status_perdido', {
        metodo: 'PATCH',
        query: { id: pet.id },
        corpo: { status: 'ativo' },
      });
      window.dispatchEvent(new CustomEvent('sectrum:pets-atualizados'));
      await carregarAlertas();
    } catch {
      // Recarrega o estado real
      await carregarAlertas();
    } finally {
      setEncerrandoId(null);
    }
  };

  return (
    <div className="bg-rose-600 rounded-2xl border-2 border-rose-700 shadow-lg overflow-hidden text-white">
      {/* Cabeçalho do Banner Vermelho */}
      <div className="px-4 py-2.5 bg-rose-700/90 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs sm:text-sm font-black uppercase tracking-wide">
          <span className="inline-flex w-2.5 h-2.5 rounded-full bg-white animate-ping" />
          <Radio size={16} />
          <span>
            🚨 Alerta Ativo de Pet Perdido no Condomínio ({alertas.length}) — Atenção às Câmeras CFTV e Portões!
          </span>
        </div>
        {!ocultarLinkModulo && (
          <Link
            to="/pets"
            className="inline-flex items-center gap-1 text-xs font-extrabold bg-white/15 hover:bg-white/25 px-3 py-1 rounded-full transition"
          >
            <span>Achados e Perdidos</span>
            <ExternalLink size={13} />
          </Link>
        )}
      </div>

      {/* Lista de Pets Perdidos */}
      <div className="p-3.5 sm:p-4 space-y-3">
        {alertas.map((pet) => {
          const fotoSrc = resolverUrlFotoPet(pet.foto_url);
          const linkZap = gerarLinkWhatsappTutor(pet);
          const encerrando = encerrandoId === pet.id;

          return (
            <div
              key={pet.id}
              className="bg-white text-slate-900 rounded-xl p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-sm"
            >
              <div className="flex items-start sm:items-center gap-3.5">
                <button
                  type="button"
                  onClick={() => fotoSrc && setFotoAmpliada({ url: fotoSrc, nome: pet.nome })}
                  className="w-20 h-20 rounded-xl overflow-hidden border-2 border-rose-500 bg-slate-100 shrink-0 flex items-center justify-center cursor-pointer"
                  title="Clique para ampliar foto"
                >
                  {fotoSrc ? (
                    <img src={fotoSrc} alt={pet.nome} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl">{emojiEspeciePet(pet.especie)}</span>
                  )}
                </button>

                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base sm:text-lg font-black text-rose-700">
                      {emojiEspeciePet(pet.especie)} {pet.nome}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-xs font-extrabold">
                      {pet.unidade_label}
                    </span>
                    <span className="text-[11px] font-bold text-slate-500">
                      • {tempoPerdidoLegivel(pet.perdido_em)}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 text-xs font-bold">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800">
                      {pet.especie}{pet.raca ? ` (${pet.raca})` : ''}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800">
                      Porte: {pet.porte}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-900 border border-indigo-200">
                      Cor/Pelagem: {pet.pelagem_cor}
                    </span>
                    {pet.comportamento !== 'Dócil' && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 flex items-center gap-1">
                        <AlertTriangle size={12} /> {pet.comportamento}
                      </span>
                    )}
                    {pet.usa_focinheira && (
                      <span className="px-2 py-0.5 rounded-md bg-orange-100 text-orange-900">
                        🦮 Usa focinheira
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600">
                    <strong>Tutor(a):</strong> {pet.tutor_nome}
                    {pet.tutor_telefone ? ` • Tel: ${pet.tutor_telefone}` : ''}
                    {pet.observacoes ? ` • Obs: ${pet.observacoes}` : ''}
                  </p>
                </div>
              </div>

              {/* Botões de Acionamento Rápido do Tutor */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => acionarInterfone(pet.unidade_id)}
                  className="px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <PhoneCall size={15} />
                  <span>Interfone WebRTC</span>
                </button>

                {linkZap && (
                  <a
                    href={linkZap}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs"
                  >
                    <MessageCircle size={15} />
                    <span>WhatsApp Tutor</span>
                  </a>
                )}

                <button
                  type="button"
                  disabled={encerrando}
                  onClick={() => marcarEncontrado(pet)}
                  className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
                  title="Encerrar alerta caso o pet já tenha sido localizado"
                >
                  <CheckCircle2 size={15} className="text-emerald-600" />
                  <span>{encerrando ? 'Aguarde...' : 'Encontrado'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de ampliação da foto para conferência visual no CFTV */}
      {fotoAmpliada && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setFotoAmpliada(null)}
        >
          <div className="relative max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={fotoAmpliada.url}
              alt={fotoAmpliada.nome}
              className="w-full rounded-3xl shadow-2xl border-2 border-white/25"
            />
            <button
              type="button"
              onClick={() => setFotoAmpliada(null)}
              className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/65 text-white flex items-center justify-center cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
