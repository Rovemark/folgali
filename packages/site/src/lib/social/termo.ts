// O termo de busca da rede social (seção 7.5 da especificação): de 2 a 100 caracteres, até 8 palavras de até
// 30 caracteres, sem acento e sem diferença de maiúscula (o relé faz isso; aqui só limpamos o que a pessoa
// digitou antes de mandar e decidimos o que mostrar). `#tag` vira busca pela tag.

export interface TermoDeBusca {
  /** o que vai para o relé, ou '' se não há o que buscar */
  termo: string
  /** quando a pessoa digitou `#alguma-tag` */
  tag: string | null
  /** digitou algo, mas curto demais (menos de 2 caracteres) */
  curto: boolean
}

const semAcento = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

export function normalizarBusca(bruto: string | null | undefined): TermoDeBusca {
  const limpo = (bruto ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  const ehTag = limpo.startsWith('#')
  // até 100 caracteres; depois, até 8 palavras de até 30 letras (o que não é letra nem número separa)
  const palavras = Array.from(limpo)
    .slice(0, 100)
    .join('')
    .split(/[^\p{L}\p{N}]/u)
    .filter(Boolean)
    .slice(0, 8)
    .map((p) => Array.from(p).slice(0, 30).join(''))
  const termo = palavras.join(' ')
  // com menos de 2 caracteres não há o que buscar; "curto" só se a pessoa digitou alguma coisa
  if (Array.from(termo).length < 2) return { termo: '', tag: null, curto: limpo !== '' }
  return { termo, tag: ehTag ? semAcento(palavras[0]).replace(/[^a-z0-9]/g, '').slice(0, 24) || null : null, curto: false }
}

export interface Trecho {
  t: string
  /** este pedaço casa com o termo */
  h: boolean
}

/**
 * Parte um texto para destacar o termo SEM HTML: cada palavra do texto que começa com uma das palavras
 * do termo (sem acento, sem diferença de maiúscula) tem o começo marcado. A tela desenha `<mark>`.
 */
export function destacar(texto: string, termo: string): Trecho[] {
  const tokens = termo
    .split(/[^\p{L}\p{N}]/u)
    .filter(Boolean)
    .map(semAcento)
  const saida: Trecho[] = []
  let fim = 0
  for (const m of texto.matchAll(/[\p{L}\p{N}]+/gu)) {
    const palavra = m[0]
    const norm = semAcento(palavra)
    const token = tokens.find((t) => norm.startsWith(t))
    if (!token) continue
    // quantas letras do original cobrem o token (letra acentuada vale uma)
    let usados = 0
    let cobertos = 0
    for (const ch of Array.from(palavra)) {
      if (cobertos >= token.length) break
      cobertos += semAcento(ch).length
      usados += ch.length
    }
    const ini = m.index
    if (ini > fim) saida.push({ t: texto.slice(fim, ini), h: false })
    saida.push({ t: texto.slice(ini, ini + usados), h: true })
    fim = ini + usados
  }
  if (fim < texto.length) saida.push({ t: texto.slice(fim), h: false })
  // texto vazio: nada foi empurrado, e a tela ainda recebe um pedaço
  return saida.length ? saida : [{ t: texto, h: false }]
}

/** Corta um texto longo em volta do primeiro trecho que casa, para o resultado mostrar o porquê de ter aparecido. */
export function trechoEmVolta(texto: string, termo: string, max = 150): string {
  const chars = Array.from(texto)
  // onde começa o primeiro pedaço que casa (em caracteres); sem casamento, o começo do texto
  const partes = destacar(texto, termo)
  const primeiro = partes.findIndex((p) => p.h)
  const pos = partes.slice(0, Math.max(primeiro, 0)).reduce((n, p) => n + Array.from(p.t).length, 0)
  const ini = Math.max(0, Math.min(pos - 30, chars.length - max))
  const corte = chars.slice(ini, ini + max).join('')
  return `${ini > 0 ? '…' : ''}${corte}${ini + max < chars.length ? '…' : ''}`
}
