// What a relay refusal means for the person, when the answer says how long is left (protocol 0.11.0, `recusas-com-prazo`): every
// refusal is `{ erro: { codigo, mensagem, libera, retryAfterS?, limite? } }`. The relay's own sentences are never shown (they are in
// Portuguese and written for a client developer): the site reads the code and the wait, and writes its own text in the page language.
// Light on purpose: it goes to the browser.
import type { AttachTexts } from '@/i18n/attach'

/** A wait longer than this is not believed (a broken or hostile relay): the screen then says "try again later". */
const MAX_WAIT_S = 366 * 86400

/** The wait a refusal carries, in whole seconds, or null when it carries none (or one that makes no sense). */
export function waitOf(e: unknown): number | null {
  const extra = typeof e === 'object' && e !== null && 'extra' in e ? (e as { extra?: unknown }).extra : null
  const v = typeof extra === 'object' && extra !== null ? (extra as Record<string, unknown>).retryAfterS : null
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= MAX_WAIT_S ? Math.ceil(v) : null
}

/** The limit a refusal names (`limite: { max, janelaS }`), or null. */
export function limitOf(e: unknown): { max: number; windowS: number } | null {
  const extra = typeof e === 'object' && e !== null && 'extra' in e ? (e as { extra?: unknown }).extra : null
  const l = typeof extra === 'object' && extra !== null ? (extra as Record<string, unknown>).limite : null
  if (typeof l !== 'object' || l === null) return null
  const { max, janelaS: windowS } = l as Record<string, unknown>
  return Number.isSafeInteger(max) && Number.isSafeInteger(windowS) && (max as number) > 0 && (windowS as number) > 0 ? { max: max as number, windowS: windowS as number } : null
}

const unit = (n: number, u: 'second' | 'minute' | 'hour' | 'day', lang: string) => new Intl.NumberFormat(lang, { style: 'unit', unit: u, unitDisplay: 'long' }).format(n)
const both = (a: string, b: string, lang: string) => new Intl.ListFormat(lang, { style: 'long', type: 'conjunction' }).format([a, b])

/**
 * A wait in words a person reads, in the page language: "45 segundos", "12 minutos", "3 horas e 5 minutos", "2 dias e 4 horas".
 * The same rounding as the protocol (`esperaEmPalavras`): always up, so the screen never promises a moment before the relay allows.
 */
export function formatWait(seconds: number, lang: string): string {
  const s = Math.max(1, Math.ceil(Number(seconds) || 0))
  if (s < 60) return unit(s, 'second', lang)
  const minutes = Math.ceil(s / 60)
  if (minutes < 60) return unit(minutes, 'minute', lang)
  if (minutes < 1440) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m ? both(unit(h, 'hour', lang), unit(m, 'minute', lang), lang) : unit(h, 'hour', lang)
  }
  const hours = Math.ceil(minutes / 60)
  const d = Math.floor(hours / 24)
  const h = hours % 24
  return h ? both(unit(d, 'day', lang), unit(h, 'hour', lang), lang) : unit(d, 'day', lang)
}

/** What was being counted when a limit was reached: the screen knows which step it was on. */
export type Counted = 'posts' | 'images' | 'photos'

const RATE: Record<Counted, 'ratePosts' | 'rateImages' | 'ratePhotos'> = { posts: 'ratePosts', images: 'rateImages', photos: 'ratePhotos' }
const LIMIT_CODES = new Set(['limite_de_taxa', 'limite', 'autorizacao_esgotada'])

/**
 * The sentence for the refusals of 0.11.0 that have their own text: a limit that was reached and when it unblocks, an account still
 * too new for media, the relay out of media space, a file the moderation removed, and more than 4 images on one publication.
 * Null for any other code: the caller keeps the text it already had.
 */
export function refusalText(e: unknown, t: AttachTexts['refusals'], lang: string, counted: Counted): string | null {
  const code = typeof e === 'object' && e !== null && 'code' in e && typeof (e as { code?: unknown }).code === 'string' ? (e as { code: string }).code : ''
  const wait = waitOf(e)
  const when = wait === null ? t.later : t.unlocksIn.replace('{espera}', formatWait(wait, lang))
  if (LIMIT_CODES.has(code)) return `${t[RATE[counted]]} ${when}`
  if (code === 'conta_nova') return `${t.young} ${when}`
  if (code === 'cota_de_midia') return t.quota
  if (code === 'midia_recusada') return t.refused
  if (code === 'limite_de_estrutura') return t.structure
  return null
}
