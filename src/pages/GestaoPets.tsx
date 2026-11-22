import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PawPrint, Search, Filter, PhoneCall, MessageCircle, Plus, Pencil,
  FileSpreadsheet, Printer, Syringe, AlertTriangle, CheckCircle2,
  BarChart3, Camera, Send, X, RotateCcw, Building2,
} from 'lucide-react';
import { api, ErroApi } from '../lib/api';
import { useSessao } from '../lib/useSessao';
import BannerAlertaPetsPerdidos from '../components/BannerAlertaPetsPerdidos';
import ModalCadastroPet, { type UnidadeOpcaoPet } from '../components/ModalCadastroPet';
import {
  calcularIdadeLegivelPet,
  emojiEspeciePet,
  formatarDataBr,
  gerarLinkWhatsappTutor,
  infoVacinaAntirrabica,
  resolverUrlFotoPet,
  type KpisCensoPet,
  type PetItem,
  type UnidadeCensoPet,
} from '../lib/petsUtils';

interface BlocoOpcao {
  id: number;
  nome: string;
}

export default function GestaoPets() {
  const { usuario } = useSessao();
  const navigate = useNavigate();
  const ehGestor = usuario?.perfil === 'superadmin' || usuario?.perfil === 'admin' || usuario?.perfil === 'sindico';

  const [aba, setAba] = useState<'busca_visual' | 'censo'>('busca_visual');

  // Dados principais
  const [pets, setPets] = useState<PetItem[]>([]);
  const [blocos, setBlocos] = useState<BlocoOpcao[]>([]);
  const [unidades, setUnidades] = useState<UnidadeOpcaoPet[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  // Filtros rápidos da Busca Visual ("Achados e Perdidos")
  const [filtroEspecie, setFiltroEspecie] = useState<string>('todos');
  const [filtroPorte, setFiltroPorte] = useState<string>('todos');
  const [filtroCor, setFiltroCor] = useState<string>('');
  const [filtroBlocoId, setFiltroBlocoId] = useState<string>('');
  const [filtroUnidadeTexto, setFiltroUnidadeTexto] = useState<string>('');
  const [filtroStatus, setFiltroStatus] = useState<string>('ativos');
  const [filtroVacina, setFiltroVacina] = useState<string>('todas');

  // Dados do Relatório / Censo Pet (Síndico)
  const [kpis, setKpis] = useState<KpisCensoPet | null>(null);
  const [censoUnidades, setCensoUnidades] = useState<UnidadeCensoPet[]>([]);
  const [somenteVacinaPendenteCenso, setSomenteVacinaPendenteCenso] = useState(false);
  const [grupoZapJid, setGrupoZapJid] = useState('');
  const [salvandoCanal, setSalvandoCanal] = useState(false);

  // Modal de Cadastro / Edição e Zoom
  const [modalCadastroAberto, setModalCadastroAberto] = useState(false);
  const [petEdicao, setPetEdicao] = useState<PetItem | null>(null);
  const [fotoZoom, setFotoZoom] = useState<{ url: string; nome: string } | null>(null);
  const [ocupadoPetId, setOcupadoPetId] = useState<number | null>(null);

  const carregarListaPets = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await api<{
        pets: PetItem[];
        blocos: BlocoOpcao[];
        unidades: UnidadeOpcaoPet[];
      }>('pets_listar', {
        query: {
          especie: filtroEspecie !== 'todos' ? filtroEspecie : undefined,
          porte: filtroPorte !== 'todos' ? filtroPorte : undefined,
          cor: filtroCor.trim() || undefined,
          bloco_id: filtroBlocoId || undefined,
          unidade: filtroUnidadeTexto.trim() || undefined,
          status: filtroStatus !== 'ativos' ? filtroStatus : undefined,
          vacina: filtroVacina !== 'todas' ? filtroVacina : undefined,
        },
      });
      setPets(r.pets ?? []);
      setBlocos(r.blocos ?? []);
      setUnidades(r.unidades ?? []);
    } catch (e) {
      setMsg({
        tipo: 'erro',
        texto: e instanceof ErroApi ? e.message : 'Erro ao consultar cadastro de pets.',
      });
    } finally {
      setCarregando(false);
    }
  }, [filtroEspecie, filtroPorte, filtroCor, filtroBlocoId, filtroUnidadeTexto, filtroStatus, filtroVacina]);

  const carregarCenso = useCallback(async () => {
    try {
      const r = await api<{
        kpis: KpisCensoPet;
        por_unidade: UnidadeCensoPet[];
        grupo_avisos_pets_jid: string;
      }>('pets_censo');
      setKpis(r.kpis);
      setCensoUnidades(r.por_unidade ?? []);
      setGrupoZapJid(r.grupo_avisos_pets_jid ?? '');
    } catch {
      // Silencioso caso sem condomínio selecionado
    }
  }, []);

  useEffect(() => {
    void carregarListaPets();
  }, [carregarListaPets]);

  useEffect(() => {
    void carregarCenso();
    const onAtualizado = () => {
      void carregarListaPets();
      void carregarCenso();
    };
    window.addEventListener('sectrum:pets-atualizados', onAtualizado);
    return () => window.removeEventListener('sectrum:pets-atualizados', onAtualizado);
  }, [carregarListaPets, carregarCenso]);

  // Cores mais frequentes para chips rápidos de filtro CFTV
  const coresDisponiveis = useMemo(() => {
    const mapa = new Map<string, string>();
    pets.forEach((p) => {
      const c = p.pelagem_cor.trim();
      if (c && !mapa.has(c.toLowerCase())) {
        mapa.set(c.toLowerCase(), c);
      }
    });
    return Array.from(mapa.values()).slice(0, 10);
  }, [pets]);

  const limparFiltros = () => {
    setFiltroEspecie('todos');
    setFiltroPorte('todos');
    setFiltroCor('');
    setFiltroBlocoId('');
    setFiltroUnidadeTexto('');
    setFiltroStatus('ativos');
    setFiltroVacina('todas');
  };

  const alternarAlertaFuga = async (pet: PetItem) => {
    const novoStatus = pet.status === 'perdido' ? 'ativo' : 'perdido';
    const pergunta =
      novoStatus === 'perdido'
        ? `Ativar alerta de fuga para "${pet.nome}" (${pet.unidade_label}) e notificar equipe via WhatsApp?`
        : `Confirmar que "${pet.nome}" foi encontrado e encerrar o alerta?`;
    if (!window.confirm(pergunta)) return;

    setOcupadoPetId(pet.id);
    try {
      const r = await api<{ mensagem: string }>('pets_status_perdido', {
        metodo: 'PATCH',
        query: { id: pet.id },
        corpo: { status: novoStatus },
      });
      setMsg({ tipo: 'ok', texto: r.mensagem });
      window.dispatchEvent(new CustomEvent('sectrum:pets-atualizados'));
    } catch (e) {
      setMsg({
        tipo: 'erro',
        texto: e instanceof ErroApi ? e.message : 'Falha ao atualizar status do pet.',
      });
    } finally {
      setOcupadoPetId(null);
    }
  };

  const salvarCanalWhatsapp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvandoCanal(true);
    try {
      const r = await api<{ mensagem: string }>('pets_salvar_canal_avisos', {
        corpo: { grupo_avisos_pets_jid: grupoZapJid.trim() },
      });
      setMsg({ tipo: 'ok', texto: r.mensagem });
    } catch (err) {
      setMsg({
        tipo: 'erro',
        texto: err instanceof ErroApi ? err.message : 'Erro ao salvar destino de alertas.',
      });
    } finally {
      setSalvandoCanal(false);
    }
  };

  // Lista filtrada para a tabela de Censo / Vacinação
  const petsRelatorio = useMemo(() => {
    if (!somenteVacinaPendenteCenso) return pets;
    return pets.filter((p) => p.vacina_status !== 'em_dia');
  }, [pets, somenteVacinaPendenteCenso]);

  const unidadesRelatorio = useMemo(() => {
    if (!somenteVacinaPendenteCenso) return censoUnidades;
    return censoUnidades.filter((u) => Number(u.vacinas_vencidas) > 0 || Number(u.vacinas_sem_data) > 0);
  }, [censoUnidades, somenteVacinaPendenteCenso]);

  // Exportação CSV (compatível com Excel PT-BR via UTF-8 BOM + separador ';')
  const exportarCsvCenso = () => {
    const cabecalho = [
      'Bloco',
      'Unidade',
      'Tutor',
      'Telefone Tutor',
      'Nome do Pet',
      'Espécie',
      'Raça',
      'Porte',
      'Cor / Pelagem',
      'Idade',
      'Castrado',
      'Vacina Antirrábica',
      'Situação Vacinal',
      'Comportamento',
      'Usa Focinheira',
      'Elevador Serviço',
      'Microchip',
      'Status',
    ];

    const esc = (v: string | number | null | undefined) => {
      const txt = String(v ?? '').replace(/"/g, '""');
      return `"${txt}"`;
    };

    const linhas = petsRelatorio.map((p) => {
      const vac = infoVacinaAntirrabica(p.vacina_antirrabica_validade);
      return [
        esc(p.bloco_nome ?? '—'),
        esc(p.unidade_numero ?? p.unidade_label),
        esc(p.tutor_nome),
        esc(p.tutor_telefone ?? ''),
        esc(p.nome),
        esc(p.especie),
        esc(p.raca ?? ''),
        esc(p.porte),
        esc(p.pelagem_cor),
        esc(calcularIdadeLegivelPet(p.data_nascimento, p.idade_estimada_meses)),
        esc(p.castrado ? 'Sim' : 'Não'),
        esc(formatarDataBr(p.vacina_antirrabica_validade)),
        esc(vac.rotulo),
        esc(p.comportamento),
        esc(p.usa_focinheira ? 'Sim' : 'Não'),
        esc(p.somente_elevador_servico ? 'Sim' : 'Não'),
        esc(p.microchip ?? ''),
        esc(p.status.toUpperCase()),
      ].join(';');
    });

    const conteudo = '\uFEFF' + [cabecalho.map(esc).join(';'), ...linhas].join('\r\n');
    const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `censo_pet_${(usuario?.condominio_nome ?? 'condominio').replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Exportação PDF / Impressão Oficial formatada
  const exportarPdfCenso = () => {
    const win = window.open('', '_blank', 'width=1024,height=768');
    if (!win) {
      alert('Permita pop-ups para gerar o PDF do Censo Pet.');
      return;
    }
    const escHtml = (s: string | number | null | undefined) =>
      String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const linhasUnidades = unidadesRelatorio
      .map(
        (u) => `
        <tr>
          <td>${escHtml(u.bloco_nome)}</td>
          <td><strong>${escHtml(u.unidade_numero)}</strong></td>
          <td>${escHtml(u.tutor_principal || '—')}</td>
          <td style="text-align:center"><strong>${u.total_pets}</strong></td>
          <td>${escHtml(u.resumo_animais)}</td>
          <td style="color:${Number(u.vacinas_vencidas) > 0 ? '#be123c' : Number(u.vacinas_sem_data) > 0 ? '#b45309' : '#047857'};font-weight:bold">
            ${
              Number(u.vacinas_vencidas) > 0
                ? `${u.vacinas_vencidas} vencida(s)`
                : Number(u.vacinas_sem_data) > 0
                  ? `${u.vacinas_sem_data} não informada(s)`
                  : 'Em dia'
            }
          </td>
        </tr>`,
      )
      .join('');

    const linhasAnimais = petsRelatorio
      .map((p) => {
        const vac = infoVacinaAntirrabica(p.vacina_antirrabica_validade);
        return `
        <tr>
          <td>${escHtml(p.unidade_label)}</td>
          <td><strong>${escHtml(p.nome)}</strong></td>
          <td>${escHtml(p.especie)}${p.raca ? ` (${escHtml(p.raca)})` : ''}</td>
          <td>${escHtml(p.porte)} • ${escHtml(p.pelagem_cor)}</td>
          <td>${escHtml(p.tutor_nome)}</td>
          <td>${escHtml(vac.rotulo)} (${escHtml(formatarDataBr(p.vacina_antirrabica_validade))})</td>
          <td>${escHtml(p.comportamento)}${p.usa_focinheira ? ' • Focinheira' : ''}</td>
        </tr>`;
      })
      .join('');

    win.document.write(`<!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Relatório Censo Pet — ${escHtml(usuario?.condominio_nome ?? 'Condomínio')}</title>
        <style>
          body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 28px; font-size: 12px; }
          h1 { margin: 0 0 4px; font-size: 20px; color: #1e3a8a; }
          h2 { margin: 22px 0 8px; font-size: 14px; color: #334155; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; }
          .sub { color: #64748b; margin-bottom: 16px; font-size: 11px; }
          .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
          .kpi { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; background: #f8fafc; }
          .kpi strong { display: block; font-size: 18px; color: #0f172a; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border: 1px solid #cbd5e1; padding: 7px 8px; text-align: left; font-size: 11px; }
          th { background: #f1f5f9; font-weight: bold; text-transform: uppercase; font-size: 10px; }
          @media print { body { margin: 12px; } }
        </style>
      </head>
      <body>
        <h1>🐾 Relatório Oficial — Censo Pet Condominial</h1>
        <div class="sub">
          Condomínio: <strong>${escHtml(usuario?.condominio_nome ?? 'Sectrum')}</strong> •
          Gerado em: ${new Date().toLocaleString('pt-BR')}
          ${somenteVacinaPendenteCenso ? ' • <strong>Filtro: Somente Vacinação Vencida/Pendente</strong>' : ''}
        </div>
        <div class="kpis">
          <div class="kpi">Total de Pets Ativos<strong>${kpis?.total_ativos ?? pets.length}</strong></div>
          <div class="kpi">Unidades com Pets<strong>${kpis?.unidades_com_pets ?? unidadesRelatorio.length}</strong></div>
          <div class="kpi">Vacinas em Dia<strong>${kpis?.vacinas_em_dia ?? 0}</strong></div>
          <div class="kpi">Vacinas Vencidas / Sem Data<strong>${(kpis?.vacinas_vencidas ?? 0) + (kpis?.vacinas_nao_informadas ?? 0)}</strong></div>
        </div>
        <h2>1. Resumo por Bloco / Unidade (${unidadesRelatorio.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Bloco</th><th>Unidade</th><th>Tutor</th><th>Qtd</th><th>Animais</th><th>Vacinação</th>
            </tr>
          </thead>
          <tbody>${linhasUnidades || '<tr><td colspan="6">Nenhum registro encontrado.</td></tr>'}</tbody>
        </table>
        <h2>2. Relação Detalhada de Animais (${petsRelatorio.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Unidade</th><th>Pet</th><th>Espécie / Raça</th><th>Porte / Cor</th><th>Tutor</th><th>Vacina Antirrábica</th><th>Regras / Manejo</th>
            </tr>
          </thead>
          <tbody>${linhasAnimais || '<tr><td colspan="7">Nenhum animal listado.</td></tr>'}</tbody>
        </table>
        <script>window.onload = function(){ window.print(); };</script>
      </body>
      </html>`);
    win.document.close();
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Banner Vermelho Fixo de Alerta Ativo */}
      <BannerAlertaPetsPerdidos ocultarLinkModulo />

      {/* Cabeçalho e Abas */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <PawPrint size={26} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900">
              Gestão Pet & Achados e Perdidos
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Identificação visual imediata para câmeras CFTV da portaria, alertas de fuga e censo vacinal por unidade.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de Abas */}
          <div className="inline-flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => setAba('busca_visual')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer ${
                aba === 'busca_visual' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Camera size={15} />
              <span>Achados e Perdidos (CFTV)</span>
            </button>

            <button
              type="button"
              onClick={() => setAba('censo')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer ${
                aba === 'censo' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 size={15} />
              <span>Relatório / Censo Pet</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setPetEdicao(null);
              setModalCadastroAberto(true);
            }}
            className="px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus size={16} /> Novo Pet
          </button>
        </div>
      </div>

      {/* Aviso de Feedback */}
      {msg && (
        <div
          className={`border-l-4 px-4 py-3 rounded-xl text-sm font-semibold flex items-center justify-between gap-3 ${
            msg.tipo === 'ok'
              ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
              : 'bg-rose-50 border-rose-500 text-rose-900'
          }`}
        >
          <span>{msg.texto}</span>
          <button type="button" onClick={() => setMsg(null)} className="cursor-pointer">
            <X size={16} />
          </button>
        </div>
      )}

      {/* =====================================================================
          ABA 1: BUSCA VISUAL RÁPIDA ("ACHADOS E PERDIDOS" — PORTARIA / CFTV)
         ===================================================================== */}
      {aba === 'busca_visual' && (
        <div className="space-y-5">
          {/* Barra de Filtros Rápidos para Operador CFTV */}
          <div className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-700">
                <Filter size={15} className="text-indigo-600" />
                <span>Filtros Visuais Rápidos (Identificação por Câmera CFTV)</span>
              </div>
              <button
                type="button"
                onClick={limparFiltros}
                className="text-xs font-bold text-slate-500 hover:text-blue-600 inline-flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw size={13} /> Limpar filtros
              </button>
            </div>

            {/* Linha 1: Chips de Espécie + Porte */}
            <div className="flex flex-wrap items-center gap-2">
              {[
                { v: 'todos', l: '🐾 Todas Espécies' },
                { v: 'Cachorro', l: '🐶 Cachorro' },
                { v: 'Gato', l: '🐱 Gato' },
                { v: 'Ave', l: '🦜 Ave' },
                { v: 'Outro', l: '🐾 Outro' },
              ].map((op) => (
                <button
                  key={op.v}
                  type="button"
                  onClick={() => setFiltroEspecie(op.v)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
                    filtroEspecie === op.v
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {op.l}
                </button>
              ))}

              <span className="h-5 w-px bg-slate-200 mx-1 hidden sm:inline-block" />

              {[
                { v: 'todos', l: 'Qualquer Porte' },
                { v: 'Pequeno', l: 'Pequeno' },
                { v: 'Médio', l: 'Médio' },
                { v: 'Grande', l: 'Grande' },
              ].map((op) => (
                <button
                  key={op.v}
                  type="button"
                  onClick={() => setFiltroPorte(op.v)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
                    filtroPorte === op.v
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {op.l}
                </button>
              ))}
            </div>

            {/* Linha 2: Inputs de Cor, Bloco, Unidade e Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="relative">
                <Search size={15} className="text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cor / Pelagem (ex: caramelo, preto...)"
                  value={filtroCor}
                  onChange={(e) => setFiltroCor(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold outline-none focus:border-blue-600"
                />
              </div>

              <select
                value={filtroBlocoId}
                onChange={(e) => setFiltroBlocoId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold outline-none focus:border-blue-600"
              >
                <option value="">Todos os Blocos / Torres</option>
                {blocos.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nome}
                  </option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Unidade / Apto (ex: 102, Bloco A...)"
                value={filtroUnidadeTexto}
                onChange={(e) => setFiltroUnidadeTexto(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold outline-none focus:border-blue-600"
              />

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={filtroStatus}
                  onChange={(e) => setFiltroStatus(e.target.value)}
                  className="w-full px-2.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold outline-none focus:border-blue-600"
                >
                  <option value="ativos">Ativos + Perdidos</option>
                  <option value="perdido">🚨 Só Perdidos</option>
                  <option value="todos">Histórico Completo</option>
                </select>

                <select
                  value={filtroVacina}
                  onChange={(e) => setFiltroVacina(e.target.value)}
                  className="w-full px-2.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold outline-none focus:border-blue-600"
                >
                  <option value="todas">Vacina: Todas</option>
                  <option value="vencida">Vacina Vencida</option>
                  <option value="pendente_ou_vencida">Pendente/Vencida</option>
                  <option value="em_dia">Vacina em Dia</option>
                </select>
              </div>
            </div>

            {/* Chips das cores existentes para filtro em 1 clique */}
            {coresDisponiveis.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] font-bold text-slate-400 mr-1">Cores rápidas:</span>
                {coresDisponiveis.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFiltroCor(filtroCor.toLowerCase() === c.toLowerCase() ? '' : c)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition cursor-pointer ${
                      filtroCor.toLowerCase() === c.toLowerCase()
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Grid Visual de Resultados */}
          {carregando ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center text-slate-500 font-semibold">
              Consultando base visual de pets do condomínio...
            </div>
          ) : pets.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center space-y-2">
              <PawPrint size={34} className="mx-auto text-slate-400" />
              <h3 className="text-base font-extrabold text-slate-700">
                Nenhum pet encontrado para os filtros selecionados
              </h3>
              <p className="text-xs text-slate-500">
                Ajuste a cor, porte ou espécie para ampliar a busca nas unidades do condomínio.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {pets.map((pet) => {
                const fotoSrc = resolverUrlFotoPet(pet.foto_url);
                const vacina = infoVacinaAntirrabica(pet.vacina_antirrabica_validade);
                const linkZap = gerarLinkWhatsappTutor(pet);
                const emFuga = pet.status === 'perdido';

                return (
                  <div
                    key={pet.id}
                    className={`rounded-3xl overflow-hidden flex flex-col justify-between transition ${
                      emFuga
                        ? 'bg-rose-50/90 border-2 border-rose-500 shadow-md ring-2 ring-rose-400/30'
                        : 'bg-white border border-slate-200 shadow-xs hover:shadow-md'
                    }`}
                  >
                    <div className="p-4 space-y-3.5">
                      <div className="flex items-start gap-3.5">
                        <button
                          type="button"
                          onClick={() => fotoSrc && setFotoZoom({ url: fotoSrc, nome: pet.nome })}
                          className={`w-24 h-24 rounded-2xl overflow-hidden shrink-0 border-2 bg-slate-100 flex items-center justify-center cursor-pointer ${
                            emFuga ? 'border-rose-500' : 'border-slate-200'
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
                          <div className="flex items-start justify-between gap-1">
                            <div>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 text-[11px] font-black">
                                <Building2 size={11} /> {pet.unidade_label}
                              </span>
                              <h3 className="text-base font-black text-slate-900 mt-1 truncate">
                                {emojiEspeciePet(pet.especie)} {pet.nome}
                              </h3>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setPetEdicao(pet);
                                setModalCadastroAberto(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
                              title="Editar cadastro"
                            >
                              <Pencil size={15} />
                            </button>
                          </div>

                          <p className="text-xs font-semibold text-slate-600">
                            {pet.especie} {pet.raca ? `• ${pet.raca}` : ''} •{' '}
                            {calcularIdadeLegivelPet(pet.data_nascimento, pet.idade_estimada_meses)}
                          </p>
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            Tutor: <strong className="text-slate-700">{pet.tutor_nome}</strong>
                          </p>
                        </div>
                      </div>

                      {/* Destaques Visuais para Portaria */}
                      <div className="flex flex-wrap gap-1.5">
                        <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-900 border border-indigo-200 text-xs font-extrabold">
                          🎨 {pet.pelagem_cor}
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 text-xs font-extrabold">
                          📏 Porte {pet.porte}
                        </span>
                        <span className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold ${vacina.classeBadge}`}>
                          <Syringe size={11} className="inline mr-1" />
                          {vacina.rotulo}
                        </span>
                      </div>

                      {/* Alertas de Comportamento / Regras */}
                      {(pet.comportamento !== 'Dócil' || pet.usa_focinheira || pet.somente_elevador_servico) && (
                        <div className="flex flex-wrap gap-1.5">
                          {pet.comportamento !== 'Dócil' && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[11px] font-extrabold flex items-center gap-1">
                              <AlertTriangle size={11} /> {pet.comportamento}
                            </span>
                          )}
                          {pet.usa_focinheira && (
                            <span className="px-2 py-0.5 rounded-md bg-orange-100 text-orange-900 text-[11px] font-extrabold">
                              🦮 Focinheira obrigatória
                            </span>
                          )}
                          {pet.somente_elevador_servico && (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-semibold">
                              🛗 Elevador de serviço
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Ações Operacionais Rápidas: Interfone WebRTC / WhatsApp / Alerta */}
                    <div className="px-4 pb-4 pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/portaria?ligar_unidade=${pet.unidade_id}`)}
                        className="flex-1 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <PhoneCall size={14} /> Interfone
                      </button>

                      {linkZap && (
                        <a
                          href={linkZap}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5"
                        >
                          <MessageCircle size={14} /> WhatsApp
                        </a>
                      )}

                      <button
                        type="button"
                        disabled={ocupadoPetId === pet.id}
                        onClick={() => alternarAlertaFuga(pet)}
                        className={`py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1 border cursor-pointer ${
                          emFuga
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                            : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                        }`}
                        title={emFuga ? 'Encerrar alerta de fuga' : 'Reportar pet avistado solto / perdido'}
                      >
                        {emFuga ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                        <span>{emFuga ? 'Encontrado' : 'Fuga'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          ABA 2: RELATÓRIO / CENSO PET & VACINAÇÃO (SÍNDICO / ADMINISTRAÇÃO)
         ===================================================================== */}
      {aba === 'censo' && (
        <div className="space-y-6">
          {/* KPIs do Condomínio */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 border-l-4 border-l-blue-600 p-4 shadow-xs">
              <div className="text-xs font-bold uppercase text-slate-500">Total de Pets Ativos</div>
              <div className="text-2xl font-black text-slate-900 mt-1">{kpis?.total_ativos ?? 0}</div>
              <div className="text-[11px] text-slate-500 mt-1">
                🐶 {kpis?.total_cachorros ?? 0} cães • 🐱 {kpis?.total_gatos ?? 0} gatos • 🦜 {(kpis?.total_aves ?? 0) + (kpis?.total_outros ?? 0)} outros
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 border-l-4 border-l-indigo-600 p-4 shadow-xs">
              <div className="text-xs font-bold uppercase text-slate-500">Unidades com Pets</div>
              <div className="text-2xl font-black text-slate-900 mt-1">{kpis?.unidades_com_pets ?? 0}</div>
              <div className="text-[11px] text-slate-500 mt-1">Apartamentos / lotes com animais</div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 border-l-4 border-l-emerald-600 p-4 shadow-xs">
              <div className="text-xs font-bold uppercase text-slate-500">Vacina em Dia</div>
              <div className="text-2xl font-black text-emerald-700 mt-1">{kpis?.vacinas_em_dia ?? 0}</div>
              <div className="text-[11px] text-slate-500 mt-1">Antirrábica dentro da validade</div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 border-l-4 border-l-rose-600 p-4 shadow-xs">
              <div className="text-xs font-bold uppercase text-slate-500">Vacina Vencida / Sem Data</div>
              <div className="text-2xl font-black text-rose-600 mt-1">
                {(kpis?.vacinas_vencidas ?? 0) + (kpis?.vacinas_nao_informadas ?? 0)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {kpis?.vacinas_vencidas ?? 0} vencidas • {kpis?.vacinas_nao_informadas ?? 0} não informadas
              </div>
            </div>
          </div>

          {/* Configuração do Grupo / Canal Evolution API (visível para Síndico/Admin) */}
          {ehGestor && (
            <form
              onSubmit={salvarCanalWhatsapp}
              className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-end justify-between gap-4"
            >
              <div className="flex-1 space-y-1">
                <label className="text-xs font-extrabold uppercase tracking-wide text-slate-700 flex items-center gap-1.5">
                  <Send size={14} className="text-emerald-600" />
                  Grupo / Canal WhatsApp de Avisos & Zeladoria (Evolution API)
                </label>
                <p className="text-xs text-slate-500">
                  Informe o JID do grupo do condomínio (ex: <code className="bg-slate-100 px-1 rounded">12036304...@g.us</code>) ou telefone da zeladoria para receber automaticamente foto e dados quando um morador reportar fuga.
                </p>
                <input
                  type="text"
                  placeholder="Ex: 1203630495839485@g.us ou 5598988887777"
                  value={grupoZapJid}
                  onChange={(e) => setGrupoZapJid(e.target.value)}
                  className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-semibold outline-none focus:border-blue-600"
                />
              </div>
              <button
                type="submit"
                disabled={salvandoCanal}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shrink-0 cursor-pointer disabled:opacity-60"
              >
                {salvandoCanal ? 'Salvando...' : 'Salvar Canal Evolution'}
              </button>
            </form>
          )}

          {/* Barra de Ferramentas do Censo: Filtro Vacinal + Exportação CSV / PDF */}
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-base font-extrabold text-slate-900">
                  Censo de Animais por Bloco / Unidade
                </h2>
                <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-extrabold text-rose-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={somenteVacinaPendenteCenso}
                    onChange={(e) => setSomenteVacinaPendenteCenso(e.target.checked)}
                    className="w-4 h-4 rounded accent-rose-600"
                  />
                  <span>Filtrar apenas vacinação vencida / pendente</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={exportarCsvCenso}
                  className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet size={15} /> Exportar CSV
                </button>
                <button
                  type="button"
                  onClick={exportarPdfCenso}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer size={15} /> Exportar PDF
                </button>
              </div>
            </div>

            {/* Tabela Resumida por Unidade */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 uppercase font-extrabold border-b border-slate-200">
                    <th className="py-3 px-4">Bloco / Torre</th>
                    <th className="py-3 px-4">Unidade</th>
                    <th className="py-3 px-4">Tutor Principal</th>
                    <th className="py-3 px-4 text-center">Total Pets</th>
                    <th className="py-3 px-4">Animais Cadastrados</th>
                    <th className="py-3 px-4">Situação Vacinal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {unidadesRelatorio.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 font-semibold">
                        Nenhuma unidade encontrada com os critérios atuais.
                      </td>
                    </tr>
                  ) : (
                    unidadesRelatorio.map((u) => {
                      const venc = Number(u.vacinas_vencidas);
                      const semData = Number(u.vacinas_sem_data);
                      return (
                        <tr key={u.unidade_id} className="hover:bg-slate-50/80">
                          <td className="py-3 px-4 font-semibold text-slate-700">{u.bloco_nome}</td>
                          <td className="py-3 px-4 font-black text-slate-900">{u.unidade_numero}</td>
                          <td className="py-3 px-4 text-slate-700">{u.tutor_principal || '—'}</td>
                          <td className="py-3 px-4 text-center">
                            <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 font-extrabold">
                              {u.total_pets}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-600">{u.resumo_animais}</td>
                          <td className="py-3 px-4">
                            {venc > 0 ? (
                              <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 font-extrabold">
                                ⚠️ {venc} vencida(s)
                              </span>
                            ) : semData > 0 ? (
                              <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-extrabold">
                                {semData} não informada(s)
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold">
                                ✓ Todas em dia
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Zoom da Foto */}
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

      {/* Modal de Cadastro / Edição */}
      <ModalCadastroPet
        aberto={modalCadastroAberto}
        petEdicao={petEdicao}
        modoGestao
        unidades={unidades}
        onFechar={() => setModalCadastroAberto(false)}
        onSalvo={(texto) => {
          setModalCadastroAberto(false);
          setMsg({ tipo: 'ok', texto });
          void carregarListaPets();
          void carregarCenso();
        }}
      />
    </div>
  );
}
