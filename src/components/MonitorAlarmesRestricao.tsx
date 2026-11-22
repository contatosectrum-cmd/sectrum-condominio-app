import { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldAlert, CheckCircle2, Camera, UserX, Clock, DoorClosed, Eye } from 'lucide-react';
import { api, ErroApi } from '../lib/api';

// Tela global de Alarme da Lista de Restrição Facial (Segurança Facial IA).
// Exibida para Portaria, Admin (Supervisor) e Síndico do condomínio em uso, em qualquer tela do sistema,
// com sirene contínua até alguém registrar "Ciente".

interface AlarmeResumo {
  id: number;
  restricao_id: number | null;
  restricao_nome: string;
  nivel: 'critico' | 'atencao' | string;
  modo: 'bloquear' | 'alerta_silencioso' | string;
  controlador_id: number | null;
  controlador_nome: string | null;
  evento_em: string;
  criado_em: string;
}

interface AlarmeDetalhe extends AlarmeResumo {
  foto_camera: string | null;
  foto_cadastro: string | null;
  motivo: string | null;
  documento: string | null;
}

let wavSireneCache: string | null = null;
let audioSireneEl: HTMLAudioElement | null = null;

/** Sirene bitonal sintetizada (sem arquivo externo), em loop até o alarme ser tratado. */
function obterSirene(): HTMLAudioElement {
  if (!wavSireneCache) {
    const sampleRate = 16000;
    const dur = 2.0;
    const n = Math.floor(sampleRate * dur);
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const w = (o: number, s: string) => {
      for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
    };
    w(0, 'RIFF');
    v.setUint32(4, 36 + n * 2, true);
    w(8, 'WAVE');
    w(12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, sampleRate, true);
    v.setUint32(28, sampleRate * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    w(36, 'data');
    v.setUint32(40, n * 2, true);
    let fase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      const freq = t % 1 < 0.5 ? 960 : 770;
      fase += (2 * Math.PI * freq) / sampleRate;
      v.setInt16(44 + i * 2, Math.floor(Math.sin(fase) * 0.8 * 32767), true);
    }
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
    wavSireneCache = 'data:audio/wav;base64,' + window.btoa(bin);
  }
  if (!audioSireneEl) {
    audioSireneEl = new Audio(wavSireneCache);
    audioSireneEl.loop = true;
    audioSireneEl.volume = 1.0;
  }
  return audioSireneEl;
}

function horaCurta(iso: string): string {
  const d = new Date(String(iso).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function MonitorAlarmesRestricao({ condominioId }: { condominioId: number | null }) {
  const [pendentes, setPendentes] = useState<AlarmeResumo[]>([]);
  const [detalhe, setDetalhe] = useState<AlarmeDetalhe | null>(null);
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [silenciado, setSilenciado] = useState(false);
  const detalheIdRef = useRef<number | null>(null);

  const verificar = useCallback(async () => {
    if (!condominioId) {
      setPendentes([]);
      return;
    }
    try {
      const r = await api<{ ativo: boolean; alarmes: AlarmeResumo[] }>('alarmes_restricao_pendentes');
      setPendentes(r.ativo ? r.alarmes ?? [] : []);
    } catch {
      // Ignora falhas transitórias de rede
    }
  }, [condominioId]);

  useEffect(() => {
    void verificar();
    const t = window.setInterval(verificar, 3000);
    return () => window.clearInterval(t);
  }, [verificar]);

  // Abre automaticamente o alarme mais antigo pendente (fila) e carrega fotos
  const alvo = pendentes.length > 0 ? pendentes[pendentes.length - 1] : null;
  useEffect(() => {
    if (!alvo) {
      detalheIdRef.current = null;
      setDetalhe(null);
      return;
    }
    if (detalheIdRef.current === alvo.id) return;
    detalheIdRef.current = alvo.id;
    setObservacao('');
    setErro('');
    setSilenciado(false);
    setDetalhe({ ...alvo, foto_camera: null, foto_cadastro: null, motivo: null, documento: null });
    api<{ alarme: AlarmeDetalhe }>('alarme_restricao_detalhe', { query: { id: alvo.id } })
      .then((r) => {
        if (detalheIdRef.current === alvo.id) setDetalhe(r.alarme);
      })
      .catch(() => undefined);
  }, [alvo]);

  // Sirene contínua enquanto houver alarme não tratado (pode ser silenciada sem fechar o alarme)
  useEffect(() => {
    const el = obterSirene();
    if (!detalhe || silenciado) {
      el.pause();
      el.currentTime = 0;
      return;
    }
    el.play().catch(() => undefined);
    return () => {
      el.pause();
    };
  }, [detalhe, silenciado]);

  const registrarCiente = async () => {
    if (!detalhe) return;
    setSalvando(true);
    setErro('');
    try {
      await api('alarme_restricao_ciente', { corpo: { id: detalhe.id, observacao: observacao.trim() } });
      setPendentes((p) => p.filter((a) => a.id !== detalhe.id));
      detalheIdRef.current = null;
      setDetalhe(null);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Falha ao registrar.');
      void verificar();
    } finally {
      setSalvando(false);
    }
  };

  if (!detalhe) return null;

  const critico = detalhe.nivel === 'critico';
  const bloqueado = detalhe.modo === 'bloquear';

  return (
    <div className="fixed inset-0 z-[10000] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div
        className={`w-full max-w-3xl rounded-3xl overflow-hidden shadow-2xl border-4 bg-slate-950 text-white ${
          critico ? 'border-red-600 animate-[pulse_1.4s_ease-in-out_infinite]' : 'border-amber-500'
        }`}
      >
        {/* Cabeçalho do alarme */}
        <div className={`px-5 py-4 flex items-center justify-between gap-3 ${critico ? 'bg-red-700' : 'bg-amber-600'}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
              <ShieldAlert size={28} className="animate-bounce" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-white/85">
                {critico ? '🚨 Alerta Crítico' : '⚠️ Alerta de Atenção'} — Lista de Restrição Facial
              </div>
              <div className="text-lg sm:text-2xl font-black leading-tight truncate">{detalhe.restricao_nome}</div>
            </div>
          </div>
          {pendentes.length > 1 && (
            <span className="px-3 py-1 rounded-full bg-black/35 text-xs font-extrabold shrink-0">
              +{pendentes.length - 1} na fila
            </span>
          )}
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {/* Situação do acesso */}
          <div
            className={`rounded-2xl px-4 py-3 flex items-center gap-3 text-sm font-extrabold ${
              bloqueado ? 'bg-red-950/70 border border-red-600/60 text-red-100' : 'bg-amber-950/60 border border-amber-500/60 text-amber-100'
            }`}
          >
            {bloqueado ? <DoorClosed size={20} className="shrink-0" /> : <Eye size={20} className="shrink-0" />}
            <span>
              {bloqueado
                ? 'Entrada BLOQUEADA pelo leitor facial. Pessoa reconhecida tentando acessar.'
                : 'ALERTA SILENCIOSO: o acesso foi liberado normalmente. Acompanhe a pessoa discretamente.'}
            </span>
          </div>

          {/* Fotos: cadastro x câmera do leitor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-900 border border-slate-700 overflow-hidden">
              <div className="px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-1.5 bg-slate-800/80">
                <UserX size={13} /> Foto da Lista de Restrição
              </div>
              <div className="aspect-[3/4] bg-black flex items-center justify-center">
                {detalhe.foto_cadastro ? (
                  <img src={detalhe.foto_cadastro} alt="Cadastro" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs text-slate-500">Carregando...</span>
                )}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-900 border border-slate-700 overflow-hidden">
              <div className="px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-1.5 bg-slate-800/80">
                <Camera size={13} /> Câmera do Leitor no Momento
              </div>
              <div className="aspect-[3/4] bg-black flex items-center justify-center">
                {detalhe.foto_camera ? (
                  <img src={detalhe.foto_camera} alt="Câmera do leitor" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs text-slate-500 px-4 text-center">
                    {detalhe.foto_cadastro ? 'Foto da câmera indisponível neste leitor.' : 'Carregando...'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Ficha */}
          <div className="rounded-2xl bg-slate-900 border border-slate-700 p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:text-sm">
            <div>
              <span className="text-slate-400">Leitor:</span> <b>{detalhe.controlador_nome || '—'}</b>
            </div>
            <div className="flex items-center gap-1">
              <Clock size={13} className="text-slate-400" />
              <span className="text-slate-400">Horário:</span> <b>{horaCurta(detalhe.evento_em)}</b>
            </div>
            {detalhe.documento && (
              <div>
                <span className="text-slate-400">Documento:</span> <b>{detalhe.documento}</b>
              </div>
            )}
            {detalhe.motivo && (
              <div className="sm:col-span-2">
                <span className="text-slate-400">Motivo da restrição:</span> <b className="text-amber-200">{detalhe.motivo}</b>
              </div>
            )}
          </div>

          {erro && <div className="rounded-xl bg-rose-500/20 border border-rose-400 text-rose-100 px-3 py-2 text-xs font-bold">{erro}</div>}

          <div className="space-y-2.5">
            <input
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Observação da ocorrência (opcional) — ex.: acionado o síndico / pessoa saiu do local"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-600 text-sm text-white placeholder:text-slate-500 outline-none focus:border-emerald-500"
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setSilenciado((s) => !s)}
                className="py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-sm font-extrabold cursor-pointer"
              >
                {silenciado ? '🔊 Reativar Som' : '🔇 Silenciar Sirene'}
              </button>
              <button
                type="button"
                disabled={salvando}
                onClick={registrarCiente}
                className="sm:col-span-2 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 text-sm sm:text-base font-black flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/30"
              >
                <CheckCircle2 size={19} /> {salvando ? 'Registrando...' : 'Ciente — Registrar Ocorrência'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
