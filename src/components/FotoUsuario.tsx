import { useEffect, useRef, useState } from 'react';
import { User } from 'lucide-react';
import { obterToken } from '../lib/sessao';

// Foto carregada sob demanda (só quando aparece na tela), por uma rota protegida da API.
// Padrão: foto_usuario&id=N. Para visitas/pré-cadastros, passe `rota` (ex.: "foto_registro&tipo=visita&id=5").
// Evita trazer todas as fotos em base64 de uma vez em listas grandes.

const cache = new Map<string, string>();

interface Props {
  id?: number;
  rota?: string;
  temFoto: boolean;
  tamanho?: number;
  largura?: number;
  altura?: number;
  redonda?: boolean;
}

export default function FotoUsuario({ id, rota, temFoto, tamanho = 48, largura, altura, redonda }: Props) {
  const chave = rota ?? `foto_usuario&id=${id}`;
  const [url, setUrl] = useState<string | null>(cache.get(chave) ?? null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUrl(cache.get(chave) ?? null);
  }, [chave]);

  useEffect(() => {
    if (!temFoto || url || !ref.current) return;
    let cancelado = false;
    const obs = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      try {
        const r = await fetch(`/api.php?route=${chave}`, { headers: { Authorization: `Bearer ${obterToken() ?? ''}` } });
        if (!r.ok) return;
        const u = URL.createObjectURL(await r.blob());
        cache.set(chave, u);
        if (!cancelado) setUrl(u);
      } catch {
        // sem foto: mantém o ícone
      }
    }, { rootMargin: '200px' });
    obs.observe(ref.current);
    return () => { cancelado = true; obs.disconnect(); };
  }, [chave, temFoto, url]);

  const estilo = { width: largura ?? tamanho, height: altura ?? tamanho };
  const forma = redonda ? 'rounded-full' : 'rounded-lg';
  return url ? (
    <img src={url} alt="" style={estilo} className={`${forma} object-cover border border-slate-200 shrink-0`} />
  ) : (
    <div ref={ref} style={estilo} className={`${forma} bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0`}>
      <User size={Math.round(Math.min(largura ?? tamanho, altura ?? tamanho) / 2)} />
    </div>
  );
}
