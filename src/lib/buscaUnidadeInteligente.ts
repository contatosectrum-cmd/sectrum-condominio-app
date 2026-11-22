// Utilitário de Busca Inteligente e Agrupamento Rápido de Unidades / Ruas / Blocos / Moradores para a Portaria

export interface MoradorBuscaMin {
  id: number;
  nome: string;
  telefone?: string | null;
  tem_app?: boolean;
}

export interface UnidadeBuscaMin {
  id: number;
  numero: string;
  bloco_nome: string;
  label: string;
  codigo_discagem?: string;
  moradores: MoradorBuscaMin[];
}

export interface GrupoUnidadeFiltro {
  chave: string;
  label: string;
  total: number;
}

const collatorNatural = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

/** Remove acentos, converte pontuação (- / . _) em espaços e descola prefixos comuns como "rua2" -> "rua 2", "ap002" -> "ap 002". */
export function normalizarTextoBuscaPortaria(valor: string): string {
  if (!valor) return '';
  let s = valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  // Descola palavras-chave coladas em números (ex.: "rua2" -> "rua 2", "bloco1a" -> "bloco 1a", "apto002" -> "apto 002")
  // Cuidado para NÃO separar "1a", "5b", "20a" (dígito seguido de letra de bloco).
  s = s.replace(/\b(rua|r|quadra|qd|setor|bloco|bl|torre|tr|apto|apartamento|ap|casa|cs|unid|unidade|lote|lt)(\d)/g, '$1 $2');
  s = s.replace(/[^a-z0-9]+/g, ' ');
  return s.trim().replace(/\s+/g, ' ');
}

function semZerosEsquerda(digitos: string): string {
  return digitos.replace(/^0+/, '') || '0';
}

/**
 * Extrai o grupo macro de localização da unidade para botões rápidos de 1 clique:
 * - Ex.: "Rua-1 Bloco 1A" -> "Rua 1"
 * - Ex.: "Quadra 3 Lote 10" -> "Quadra 3"
 * - Ex.: "Bloco A" -> "Bloco A"
 */
export function extrairGrupoMacroUnidade(blocoNome: string): string {
  const limpo = (blocoNome || '').trim();
  if (!limpo) return '';

  const mRua = limpo.match(/^(rua|quadra|setor|alameda|vila|etapa|condominio|modulo)[\s\-_.]*([0-9a-z]+)/i);
  if (mRua) {
    const tipo = mRua[1].charAt(0).toUpperCase() + mRua[1].slice(1).toLowerCase();
    return `${tipo} ${mRua[2].toUpperCase()}`;
  }

  const mTorreOuBloco = limpo.match(/^(torre|bloco)[\s\-_.]*([0-9a-z]+)/i);
  if (mTorreOuBloco) {
    const tipo = mTorreOuBloco[1].charAt(0).toUpperCase() + mTorreOuBloco[1].slice(1).toLowerCase();
    return `${tipo} ${mTorreOuBloco[2].toUpperCase()}`;
  }

  return limpo;
}

/** Retorna a lista ordenada de grupos (ex.: Rua 1, Rua 2 ... Rua 7) para exibir pílulas de filtro rápido quando houver >= 2 grupos. */
export function listarGruposMacroUnidades<T extends UnidadeBuscaMin>(unidades: T[]): GrupoUnidadeFiltro[] {
  const mapa = new Map<string, GrupoUnidadeFiltro>();
  for (const u of unidades) {
    const label = extrairGrupoMacroUnidade(u.bloco_nome);
    if (!label) continue;
    const chave = normalizarTextoBuscaPortaria(label);
    const atual = mapa.get(chave);
    if (atual) {
      atual.total += 1;
    } else {
      mapa.set(chave, { chave, label, total: 1 });
    }
  }
  const lista = Array.from(mapa.values());
  lista.sort((a, b) => collatorNatural.compare(a.label, b.label));
  // Se houver muitos subgrupos (> 18 blocos soltos sem rua), ainda é útil em barra horizontal rolável até 24 itens
  return lista.length >= 2 ? lista.slice(0, 24) : [];
}

/**
 * Pesquisa inteligente e tolerante para a Portaria:
 * - "rua 2", "rua2", "r2" -> lista estritamente todas as unidades da Rua 2 (mesmo gravada como "Rua-2")
 * - "1A 002", "1a 2", "5b 010" -> encontra imediatamente Bloco + Unidade ignorando hífens e zeros à esquerda
 * - Nome/sobrenome de morador (sem acento), telefone ou código de discagem
 */
export function filtrarUnidadesInteligente<T extends UnidadeBuscaMin>(
  unidades: T[],
  termoBruto: string,
  grupoChaveAtivo = '',
  priorizarComMoradorQuandoVazio = false,
): T[] {
  const baseGrupo = grupoChaveAtivo
    ? unidades.filter((u) => normalizarTextoBuscaPortaria(extrairGrupoMacroUnidade(u.bloco_nome)) === grupoChaveAtivo)
    : unidades;

  const norm = normalizarTextoBuscaPortaria(termoBruto);
  if (!norm) {
    if (!priorizarComMoradorQuandoVazio) {
      return [...baseGrupo].sort((a, b) => collatorNatural.compare(a.label, b.label));
    }
    return [...baseGrupo].sort((a, b) => {
      const diffMor = (b.moradores.length > 0 ? 1 : 0) - (a.moradores.length > 0 ? 1 : 0);
      return diffMor !== 0 ? diffMor : collatorNatural.compare(a.label, b.label);
    });
  }

  let resto = ` ${norm} `;
  let exigirRua: string | null = null;
  let exigirBloco: string | null = null;
  let exigirUnid: string | null = null;

  // 1. Captura qualificador explícito "rua X" / "r X"
  const mRua = resto.match(/\s(?:rua|r)\s+([0-9]+[a-z]?)\s/);
  if (mRua) {
    exigirRua = semZerosEsquerda(mRua[1]);
    resto = resto.replace(mRua[0], ' ');
  }

  // 2. Captura qualificador explícito "bloco X" / "bl X" / "torre X"
  const mBloco = resto.match(/\s(?:bloco|bl|torre|tr)\s+([0-9a-z]+)\s/);
  if (mBloco) {
    exigirBloco = /^\d+$/.test(mBloco[1]) ? semZerosEsquerda(mBloco[1]) : mBloco[1];
    resto = resto.replace(mBloco[0], ' ');
  }

  // 3. Captura qualificador explícito "apto X" / "ap X" / "casa X" / "unid X"
  const mApto = resto.match(/\s(?:apto|apartamento|ap|casa|cs|unid|unidade)\s+([0-9a-z]+)\s/);
  if (mApto) {
    exigirUnid = /^\d+$/.test(mApto[1]) ? semZerosEsquerda(mApto[1]) : mApto[1];
    resto = resto.replace(mApto[0], ' ');
  }

  const STOPWORDS = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'bloco', 'bl', 'rua', 'apto', 'apartamento', 'ap', 'unid', 'unidade', 'casa']);
  const tokensLivres = resto
    .trim()
    .split(/\s+/)
    .filter((tk) => tk.length > 0 && !STOPWORDS.has(tk));

  const avaliados: { item: T; score: number }[] = [];

  for (const u of baseGrupo) {
    const blocoNorm = normalizarTextoBuscaPortaria(u.bloco_nome);
    const numNorm = normalizarTextoBuscaPortaria(u.numero);
    const codNorm = normalizarTextoBuscaPortaria(u.codigo_discagem || '');
    const tokensBloco = blocoNorm ? blocoNorm.split(' ') : [];
    const numSemZero = /^\d+$/.test(numNorm) ? semZerosEsquerda(numNorm) : numNorm;

    // Verifica "rua X" estrito no nome do bloco
    if (exigirRua !== null) {
      const mRuaCand = blocoNorm.match(/\brua\s+0*([0-9]+[a-z]?)\b/);
      if (!mRuaCand || semZerosEsquerda(mRuaCand[1]) !== exigirRua) {
        continue;
      }
    }

    // Verifica "bloco X" estrito no nome do bloco
    if (exigirBloco !== null) {
      const achouBl = tokensBloco.some((tb) => {
        if (tb === 'rua' || tb === 'bloco' || tb === 'torre') return false;
        const tbCmp = /^\d+$/.test(tb) ? semZerosEsquerda(tb) : tb;
        return tbCmp === exigirBloco;
      });
      if (!achouBl) continue;
    }

    // Verifica "apto X" estrito no número da unidade
    if (exigirUnid !== null) {
      if (numSemZero !== exigirUnid && numNorm !== exigirUnid) {
        continue;
      }
    }

    let score = 10;
    if (exigirRua !== null) score += 15;
    if (exigirBloco !== null) score += 20;
    if (exigirUnid !== null) score += 25;

    // Todos os tokens livres precisam casar com pelo menos um atributo da unidade (bloco, número, ramal ou morador/telefone)
    let todosTokensBateram = true;
    if (tokensLivres.length > 0) {
      const nomesMoradoresNorm = u.moradores.map((m) => normalizarTextoBuscaPortaria(m.nome));
      const telsMoradores = u.moradores.map((m) => (m.telefone || '').replace(/\D/g, '')).filter(Boolean);

      for (const tk of tokensLivres) {
        const tkEhDigito = /^\d+$/.test(tk);
        const tkSemZero = tkEhDigito ? semZerosEsquerda(tk) : tk;
        let ptsToken = 0;

        // a) Casa com número da unidade (ex.: "002" ou "2" -> "002")
        if (tk === numNorm) {
          ptsToken = Math.max(ptsToken, 30);
        } else if (tkEhDigito && tkSemZero === numSemZero) {
          ptsToken = Math.max(ptsToken, 24);
        } else if (numNorm.startsWith(tk) && tk.length >= 2) {
          ptsToken = Math.max(ptsToken, 12);
        }

        // b) Casa com código de discagem / ramal (ex.: "1102")
        if (codNorm && tk === codNorm) {
          ptsToken = Math.max(ptsToken, 28);
        } else if (codNorm && tk.length >= 3 && codNorm.startsWith(tk)) {
          ptsToken = Math.max(ptsToken, 10);
        }

        // c) Casa com token do bloco (ex.: "1a", "5b", "10a")
        for (let i = 0; i < tokensBloco.length; i++) {
          const tb = tokensBloco[i];
          if (tb === 'rua' || tb === 'bloco' || tb === 'quadra' || tb === 'torre') continue;
          // Evita que um número solto "2" (quando não escreveu "rua 2") case apenas com o "2" de "Rua-2" se não bater em mais nada?
          // Se a pessoa digitou só "2", mostrar aptos 002 no topo (pts 24) e Rua 2 abaixo (pts 6) é ótimo!
          const ehNumeroDaRua = i > 0 && tokensBloco[i - 1] === 'rua';
          const tbSemZero = /^\d+$/.test(tb) ? semZerosEsquerda(tb) : tb;
          if (tb === tk) {
            ptsToken = Math.max(ptsToken, ehNumeroDaRua ? 8 : 22);
          } else if (tkEhDigito && tbSemZero === tkSemZero) {
            ptsToken = Math.max(ptsToken, ehNumeroDaRua ? 7 : 18);
          } else if (!tkEhDigito && tb.startsWith(tk) && tk.length >= 2) {
            ptsToken = Math.max(ptsToken, 14);
          }
        }

        // d) Casa com nome ou telefone de morador
        for (const nm of nomesMoradoresNorm) {
          const palavras = nm.split(' ');
          if (palavras.some((p) => p === tk)) {
            ptsToken = Math.max(ptsToken, 26);
          } else if (palavras.some((p) => p.startsWith(tk))) {
            ptsToken = Math.max(ptsToken, 19);
          } else if (tk.length >= 3 && nm.includes(tk)) {
            ptsToken = Math.max(ptsToken, 12);
          }
        }
        if (tkEhDigito && tk.length >= 4 && telsMoradores.some((tel) => tel.includes(tk))) {
          ptsToken = Math.max(ptsToken, 20);
        }

        if (ptsToken === 0) {
          todosTokensBateram = false;
          break;
        }
        score += ptsToken;
      }
    }

    if (!todosTokensBateram) continue;
    if (u.moradores.length > 0) score += 1;

    avaliados.push({ item: u, score });
  }

  avaliados.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return collatorNatural.compare(a.item.label, b.item.label);
  });

  return avaliados.map((x) => x.item);
}

/** Busca textual tolerante (sem acentos e sem hífens) para filtrar filas de Visitantes e Encomendas. */
export function textoCasaBuscaInteligente(textoAlvo: string, termoBusca: string): boolean {
  const q = normalizarTextoBuscaPortaria(termoBusca);
  if (!q) return true;
  const alvo = normalizarTextoBuscaPortaria(textoAlvo);
  const tokensAlvo = alvo.split(' ');
  const tokensBusca = q.split(' ');
  return tokensBusca.every((tk) => {
    const tkSemZero = /^\d+$/.test(tk) ? semZerosEsquerda(tk) : tk;
    return (
      alvo.includes(tk) ||
      tokensAlvo.some((ta) => (/^\d+$/.test(ta) ? semZerosEsquerda(ta) : ta) === tkSemZero)
    );
  });
}
