import { useCallback, useEffect, useState } from 'react';
import {
  PawPrint, Plus, Pencil, Trash2, AlertTriangle, CheckCircle2,
  ShieldCheck, Syringe, Cpu, Sparkles, X, Radio,
} from 'lucide-react';
import { api, ErroApi } from '../../lib/api';
import ModalCadastroPet from '../../components/ModalCadastroPet';
import {
  calcularIdadeLegivelPet,
  emojiEspeciePet,
  infoVacinaAntirrabica,
  resolverUrlFotoPet,
  tempoPerdidoLegivel,
  type PetItem,
} from '../../lib/petsUtils';

export default function MoradorPets() {
  const [pets, setPets] = useState<PetItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupadoId, setOcupadoId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  // Modal de Cadastro / Edição
  const [modalAberto, setModalAberto] = useState(false);
  const [petEdicao, setPetEdicao] = useState<PetItem | null>(null);

  // Confirmação de Alerta de Fuga
  const [petConfirmarFuga, setPetConfirmarFuga] = useState<PetItem | null>(null);

  // Modal de Baixa / Soft Delete ('mudou' | 'falecido')
  const [petRemover, setPetRemover] = useState<PetItem | null>(null);
  const [motivoRemocao, setMotivoRemocao] = useState<'mudou' | 'falecido'>('mudou');

  // Zoom da foto
  const [fotoZoom, setFotoZoom] = useState<{ url: string; nome: string } | null>(null);

  const carregarPets = useCallback(async () => {
    try {
      const r = await api<{ pets: PetItem[] }>('pets_listar');
      setPets(r.pets ?? []);
    } catch (e) {
      setMsg({
        tipo: 'erro',
        texto: e instanceof ErroApi ? e.message : 'Erro ao carregar seus pets.',
      });
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregarPets();
  }, [carregarPets]);

  const alternarStatusPerdido = async (pet: PetItem, novoStatus: 'ativo' | 'perdido') => {
    setOcupadoId(pet.id);
    setPetConfirmarFuga(null);
    setMsg(null);
    try {
      const r = await api<{ mensagem: string; pet: PetItem }>('pets_status_perdido', {
        metodo: 'PATCH',
        query: { id: pet.id },
        corpo: { status: novoStatus },
      });
      setMsg({ tipo: 'ok', texto: r.mensagem });
      window.dispatchEvent(new CustomEvent('sectrum:pets-atualizados'));
      await carregarPets();
    } catch (e) {
      setMsg({
        tipo: 'erro',
        texto: e instanceof ErroApi ? e.message : 'Não foi possível alterar o alerta do pet.',
      });
    } finally {
      setOcupadoId(null);
    }
  };

  const confirmarRemocao = async () => {
    if (!petRemover) return;
    setOcupadoId(petRemover.id);
    setMsg(null);
    try {
      const r = await api<{ mensagem: string }>('pets_excluir', {
        metodo: 'DELETE',
        query: { id: petRemover.id, motivo: motivoRemocao },
        corpo: { motivo: motivoRemocao },
      });
      setMsg({ tipo: 'ok', texto: r.mensagem });
      setPetRemover(null);
      window.dispatchEvent(new CustomEvent('sectrum:pets-atualizados'));
      await carregarPets();
    } catch (e) {
      setMsg({
        tipo: 'erro',
        texto: e instanceof ErroApi ? e.message : 'Erro ao atualizar situação do pet.',
      });
    } finally {
      setOcupadoId(null);
    }
  };

  const abrirNovo = () => {
    setPetEdicao(null);
    setModalAberto(true);
  };

  const abrirEdicao = (pet: PetItem) => {
    setPetEdicao(pet);
    setModalAberto(true);
  };

  const qtdPerdidos = pets.filter((p) => p.status === 'perdido').length;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Cabeçalho Mobile-First */}
      <div className="bg-white rounded-3xl border border-slate-200 border-t-4 border-t-blue-600 p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <PawPrint size={26} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">Meus Pets</h1>
              <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                {pets.length} {pets.length === 1 ? 'cadastrado' : 'cadastrados'}
              </span>
              {qtdPerdidos > 0 && (
                <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-rose-600 text-white animate-pulse">
                  🚨 {qtdPerdidos} alerta ativo
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Mantenha a foto e a carteira de vacinação atualizadas. Em caso de fuga, avise a Portaria e a Zeladoria em 1 toque.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={abrirNovo}
          className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-extrabold flex items-center justify-center gap-2 shadow-sm shrink-0 cursor-pointer"
        >
          <Plus size={18} /> Cadastrar Pet
        </button>
      </div>

      {/* Feedback de Ação */}
      {msg && (
        <div
          className={`border-l-4 px-4 py-3.5 rounded-xl text-sm font-semibold flex items-center justify-between gap-3 shadow-xs ${
            msg.tipo === 'ok'
              ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
              : 'bg-rose-50 border-rose-500 text-rose-900'
          }`}
        >
          <span>{msg.texto}</span>
          <button type="button" onClick={() => setMsg(null)} aria-label="Fechar aviso" className="cursor-pointer">
            <X size={17} />
          </button>
        </div>
      )}

      {/* Listagem em Cards */}
      {carregando ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-500 font-semibold">
          Carregando pets da sua unidade...
        </div>
      ) : pets.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-10 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center mx-auto">
            <PawPrint size={32} />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-slate-800">Nenhum pet cadastrado na sua unidade</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
              Cadastre seus cães, gatos ou outros animais de estimação para rápida identificação visual nas câmeras da portaria em caso de emergência.
            </p>
          </div>
          <button
            type="button"
            onClick={abrirNovo}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-extrabold shadow-sm cursor-pointer"
          >
            <Plus size={18} /> Cadastrar Meu Primeiro Pet
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {pets.map((pet) => {
            const emFuga = pet.status === 'perdido';
            const fotoSrc = resolverUrlFotoPet(pet.foto_url);
            const idadeTxt = calcularIdadeLegivelPet(pet.data_nascimento, pet.idade_estimada_meses);
            const vacina = infoVacinaAntirrabica(pet.vacina_antirrabica_validade);
            const ocupado = ocupadoId === pet.id;

            return (
              <div
                key={pet.id}
                className={`rounded-3xl transition-all overflow-hidden flex flex-col justify-between ${
                  emFuga
                    ? 'bg-rose-50/90 border-2 border-rose-500 ring-4 ring-rose-500/20 shadow-lg'
                    : 'bg-white border border-slate-200 shadow-xs hover:shadow-md'
                }`}
              >
                {/* Faixa pulsante quando status === 'perdido' */}
                {emFuga && (
                  <div className="bg-rose-600 text-white px-4 py-2 text-xs font-black uppercase tracking-wide flex items-center justify-between gap-2 animate-pulse">
                    <span className="flex items-center gap-1.5">
                      <Radio size={15} /> Alerta de Fuga Ativo na Portaria
                    </span>
                    <span className="text-[11px] font-bold bg-white/20 px-2 py-0.5 rounded-full">
                      {tempoPerdidoLegivel(pet.perdido_em)}
                    </span>
                  </div>
                )}

                <div className="p-5 space-y-4">
                  {/* Cabeçalho do Card: Foto + Dados Principais */}
                  <div className="flex items-start gap-4">
                    <button
                      type="button"
                      onClick={() => fotoSrc && setFotoZoom({ url: fotoSrc, nome: pet.nome })}
                      className={`w-24 h-24 rounded-2xl overflow-hidden shrink-0 border-2 shadow-xs flex items-center justify-center bg-slate-100 cursor-pointer ${
                        emFuga ? 'border-rose-500 ring-2 ring-rose-300' : 'border-slate-200'
                      }`}
                      title="Ampliar foto"
                    >
                      {fotoSrc ? (
                        <img src={fotoSrc} alt={pet.nome} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-3xl">{emojiEspeciePet(pet.especie)}</span>
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h2 className="text-lg font-black text-slate-900 truncate flex items-center gap-1.5">
                            <span>{emojiEspeciePet(pet.especie)}</span>
                            <span>{pet.nome}</span>
                          </h2>
                          <p className="text-xs font-bold text-slate-600 mt-0.5">
                            {pet.especie} {pet.raca ? `• ${pet.raca}` : '• SRD / Não informada'}
                          </p>
                        </div>

                        {/* Ações secundárias: Editar / Remover */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => abrirEdicao(pet)}
                            title="Editar dados do pet"
                            className="p-2 rounded-xl text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMotivoRemocao('mudou');
                              setPetRemover(pet);
                            }}
                            title="Remover ou alterar situação"
                            className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      {/* Porte, Cor e Idade */}
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-extrabold">
                          Porte {pet.porte}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-lg bg-indigo-50 text-indigo-800 text-[11px] font-extrabold">
                          Cor: {pet.pelagem_cor}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-lg bg-blue-50 text-blue-800 text-[11px] font-bold">
                          🎂 {idadeTxt}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Badge de Vacina Antirrábica + Regras */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span
                      title={vacina.detalhe}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-extrabold ${vacina.classeBadge}`}
                    >
                      <Syringe size={13} />
                      <span>{vacina.rotulo}</span>
                      {pet.vacina_antirrabica_validade && (
                        <span className="opacity-80 font-semibold">({vacina.detalhe.replace('Válida até ', '').replace('Venceu em ', '')})</span>
                      )}
                    </span>

                    {pet.castrado && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-teal-50 text-teal-800 border border-teal-200 text-[11px] font-bold">
                        <ShieldCheck size={12} /> Castrado
                      </span>
                    )}

                    {pet.microchip && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold">
                        <Cpu size={12} /> Chip: {pet.microchip}
                      </span>
                    )}

                    {pet.comportamento !== 'Dócil' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 text-[11px] font-extrabold">
                        ⚠️ {pet.comportamento}
                      </span>
                    )}

                    {pet.usa_focinheira && (
                      <span className="px-2.5 py-1 rounded-full bg-orange-100 text-orange-900 text-[11px] font-extrabold">
                        🦮 Usa focinheira
                      </span>
                    )}

                    {pet.somente_elevador_servico && (
                      <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">
                        🛗 Elevador de serviço
                      </span>
                    )}
                  </div>

                  {pet.observacoes && (
                    <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2">
                      <span className="font-bold text-slate-700">Obs:</span> {pet.observacoes}
                    </p>
                  )}
                </div>

                {/* Rodapé de Ação: Reportar Fuga / Já Encontrei */}
                <div className={`px-5 pb-5 pt-1`}>
                  {emFuga ? (
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => alternarStatusPerdido(pet, 'ativo')}
                      className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black flex items-center justify-center gap-2 shadow-md disabled:opacity-60 cursor-pointer"
                    >
                      <CheckCircle2 size={19} />
                      <span>{ocupado ? 'Encerrando alerta...' : 'Já encontrei — Encerrar Alerta'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => setPetConfirmarFuga(pet)}
                      className="w-full py-3 px-4 rounded-2xl bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-300 hover:border-rose-600 text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition disabled:opacity-60 cursor-pointer"
                    >
                      <AlertTriangle size={17} />
                      <span>{ocupado ? 'Enviando alerta...' : 'Reportar Fuga / Pet Perdido'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dica Educativa */}
      <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-blue-900">
        <Sparkles size={18} className="text-blue-600 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong>Como funciona o Alerta de Fuga?</strong> Ao acionar <em>"Reportar Fuga / Pet Perdido"</em>, um banner vermelho é fixado em tempo real no painel da <strong>Portaria Remota</strong> com a foto e características do seu pet, além de disparar notificação via WhatsApp para a equipe/zeladoria do condomínio.
        </p>
      </div>

      {/* Modal de Confirmação de Fuga */}
      {petConfirmarFuga && (
        <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border-2 border-rose-500 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center shrink-0">
                <AlertTriangle size={26} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Reportar Fuga de {petConfirmarFuga.nome}?</h3>
                <p className="text-xs font-bold text-rose-600">Acionamento imediato da Portaria e Zeladoria</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Confirmando este alerta, a foto de <strong>{petConfirmarFuga.nome}</strong> ({petConfirmarFuga.especie}, cor {petConfirmarFuga.pelagem_cor}) aparecerá em destaque vermelho na central da Portaria e será enviada no WhatsApp operacional do condomínio.
            </p>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPetConfirmarFuga(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => alternarStatusPerdido(petConfirmarFuga, 'perdido')}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-extrabold shadow-md cursor-pointer"
              >
                🚨 Emitir Alerta Agora
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Soft Delete ('mudou' | 'falecido') */}
      {petRemover && (
        <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-lg font-extrabold text-slate-900">
              Atualizar situação de {petRemover.nome}
            </h3>
            <p className="text-xs text-slate-500">
              Selecione o motivo para retirar o pet da lista ativa da sua unidade:
            </p>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="motivo_pet"
                  checked={motivoRemocao === 'mudou'}
                  onChange={() => setMotivoRemocao('mudou')}
                  className="accent-blue-600"
                />
                <div>
                  <div className="text-sm font-bold text-slate-800">Mudou-se / Não vive mais na unidade</div>
                  <div className="text-xs text-slate-500">Desativa o cadastro mantendo o histórico</div>
                </div>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="motivo_pet"
                  checked={motivoRemocao === 'falecido'}
                  onChange={() => setMotivoRemocao('falecido')}
                  className="accent-blue-600"
                />
                <div>
                  <div className="text-sm font-bold text-slate-800">Falecimento</div>
                  <div className="text-xs text-slate-500">Encerra o cadastro e notificações de vacina</div>
                </div>
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPetRemover(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarRemocao}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-extrabold cursor-pointer"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Zoom de Foto */}
      {fotoZoom && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setFotoZoom(null)}
        >
          <div className="relative max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={fotoZoom.url}
              alt={fotoZoom.nome}
              className="w-full rounded-3xl shadow-2xl border-2 border-white/20"
            />
            <button
              type="button"
              onClick={() => setFotoZoom(null)}
              className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Modal/Drawer de Cadastro e Edição */}
      <ModalCadastroPet
        aberto={modalAberto}
        petEdicao={petEdicao}
        onFechar={() => setModalAberto(false)}
        onSalvo={(texto) => {
          setModalAberto(false);
          setMsg({ tipo: 'ok', texto });
          void carregarPets();
        }}
      />
    </div>
  );
}
