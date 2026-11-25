// Imagens da rede (revisão 0.5.0 do protocolo, proposta 0005): retrato do perfil e até 4 anexos por postagem. Este módulo é leve
// e pode ir ao navegador: só o tipo, o endereço e a conferência do que veio de fora.
//
// Regra do site: o `src` de uma imagem da rede é SEMPRE o mesmo domínio do site (`/midia/<hash>.<ext>`), montado só a partir do
// hash conferido. Nunca um endereço de terceiro, nunca um endereço que veio pronto de fora. Quem atende `/midia/...` é a rota do
// próprio site, que busca no cliente da rede (falso ou relé).

export const FORMATOS_DE_IMAGEM = ['jpeg', 'png', 'webp'] as const
export type FormatoDeImagem = (typeof FORMATOS_DE_IMAGEM)[number]

export const EXTENSAO: Record<FormatoDeImagem, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' }
export const TIPO_MIME: Record<FormatoDeImagem, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

/** Os mesmos limites do protocolo (packages/protocolo/src/limites.js, LIMITES_DE_MIDIA). */
export const LIMITES_DE_IMAGEM = { bytesMax: 1048576, ladoMaxPx: 4096, anexosPorPostagem: 4, altMax: 280 } as const

export const HASH_RE = /^[0-9a-f]{64}$/
/** O nome do arquivo na rota do site: o hash e a extensão do formato. */
export const ARQUIVO_RE = /^([0-9a-f]{64})\.(jpg|png|webp)$/

export interface ImagemDaRede {
  /** SHA-256 dos bytes limpos, em hexadecimal: o endereço da imagem no relé. */
  hash: string
  formato: FormatoDeImagem
  largura: number
  altura: number
  /** Texto alternativo, obrigatório, aprovado pela pessoa junto com a imagem. */
  alt: string
}

/** O endereço da imagem no próprio site, ou null se o hash ou o formato não forem válidos. */
export function urlDaImagem(i: Pick<ImagemDaRede, 'hash' | 'formato'>): string | null {
  if (typeof i.hash !== 'string' || !HASH_RE.test(i.hash) || !(FORMATOS_DE_IMAGEM as readonly string[]).includes(i.formato)) return null
  return `/midia/${i.hash}.${EXTENSAO[i.formato]}`
}

const inteiroEntre = (v: unknown, min: number, max: number): v is number => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max

/** Confere uma imagem que veio do relé. O que não bate com o protocolo vira null (a tela não mostra). */
export function sanearImagem(x: unknown): ImagemDaRede | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  if (typeof o.hash !== 'string' || !HASH_RE.test(o.hash)) return null
  if (typeof o.formato !== 'string' || !(FORMATOS_DE_IMAGEM as readonly string[]).includes(o.formato)) return null
  if (!inteiroEntre(o.largura, 1, LIMITES_DE_IMAGEM.ladoMaxPx) || !inteiroEntre(o.altura, 1, LIMITES_DE_IMAGEM.ladoMaxPx)) return null
  if (typeof o.alt !== 'string') return null
  const alt = o.alt.trim()
  if (!alt || [...alt].length > LIMITES_DE_IMAGEM.altMax) return null
  return { hash: o.hash, formato: o.formato as FormatoDeImagem, largura: o.largura, altura: o.altura, alt }
}

/** Uma lista de anexos do relé: no máximo 4, só os que conferem. */
export function sanearImagens(x: unknown): ImagemDaRede[] {
  if (!Array.isArray(x)) return []
  return x.slice(0, LIMITES_DE_IMAGEM.anexosPorPostagem).map(sanearImagem).filter((i): i is ImagemDaRede => i !== null)
}
