// Moments on the real relay (owner decision of 2026-11-26): a moment is a `postagem` tagged `momento` with the card Rover Hangar drew
// attached (one `imagem`, 1080x1350 JPEG). The rule of which posts show on the Moments page, and the newest-first walk over
// GET /v1/postagens?ordem=novas that feeds it.
import { describe, expect, it, vi } from 'vitest'
import { MOMENT_PAGES_MAX, MOMENT_WINDOW_MS, captionFor, collectMoments, isMoment, momentImage, selectMoments } from '@/lib/moments'
import type { NetworkImage } from '@/lib/images'
import type { Page, Post } from '@/lib/types'

const NOW = new Date('2026-11-26T18:00:00.000Z')
const H = 3600 * 1000
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const card = (seed: string): NetworkImage => ({ hash: seed.repeat(64).slice(0, 64), formato: 'jpeg', largura: 1080, altura: 1350, alt: 'Li um livro inteiro na folga.' })
let n = 0
const post = (extra: Partial<Post> = {}): Post => ({
  id: `ob_${String(n++).padStart(43, 'x')}`,
  tipo: 'postagem',
  autor: { uid: 'rvr_pipa0000000000000000000', handle: 'pipa', nome: 'Pipa', rosto: {} as Post['autor']['rosto'] },
  texto: 'Li um livro inteiro na folga.',
  topicos: ['momento'],
  criadaEm: ago(H),
  respostas: 0,
  reacoes: { curtir: 0, util: 0 },
  imagens: [card('a')],
  ...extra,
})

describe('isMoment', () => {
  it('a post tagged momento, with a card, from the last hour, is a moment', () => {
    expect(isMoment(post(), NOW)).toBe(true)
  })
  it('without the momento topic it is an ordinary post, even with an image', () => {
    expect(isMoment(post({ topicos: ['folga'] }), NOW)).toBe(false)
    expect(isMoment(post({ topicos: ['momentos'] }), NOW)).toBe(false)
    expect(isMoment(post({ topicos: ['folga', 'momento'] }), NOW)).toBe(true)
  })
  it('without an image the site can show it is not a moment (no image, empty list, a crooked hash)', () => {
    expect(isMoment(post({ imagens: undefined }), NOW)).toBe(false)
    expect(isMoment(post({ imagens: [] }), NOW)).toBe(false)
    expect(isMoment(post({ imagens: [{ ...card('a'), hash: 'nao-e-hash' }] }), NOW)).toBe(false)
    expect(momentImage(post({ imagens: [{ ...card('a'), hash: 'x' }, card('b')] }))?.hash).toBe(card('b').hash)
  })
  it('removed by its author, or with its 18+ text hidden from this reader, it does not show', () => {
    expect(isMoment(post({ removida: true }), NOW)).toBe(false)
    expect(isMoment(post({ adultHidden: true }), NOW)).toBe(false)
  })
  it('only the last 24 hours: 23h59 shows, exactly 24h and older do not; a little ahead of the clock shows, far ahead does not', () => {
    expect(isMoment(post({ criadaEm: ago(MOMENT_WINDOW_MS - 60_000) }), NOW)).toBe(true)
    expect(isMoment(post({ criadaEm: ago(MOMENT_WINDOW_MS) }), NOW)).toBe(false)
    expect(isMoment(post({ criadaEm: ago(30 * H) }), NOW)).toBe(false)
    expect(isMoment(post({ criadaEm: ago(-2 * 60_000) }), NOW)).toBe(true)
    expect(isMoment(post({ criadaEm: ago(-H) }), NOW)).toBe(false)
    expect(isMoment(post({ criadaEm: 'ontem' }), NOW)).toBe(false)
  })
})

describe('selectMoments', () => {
  it('keeps only the moments, newest first, each post once, and several of the same rover', () => {
    const a = post({ criadaEm: ago(5 * H) })
    const b = post({ criadaEm: ago(1 * H) })
    const c = post({ criadaEm: ago(3 * H) })
    const plain = post({ topicos: [], criadaEm: ago(2 * H) })
    const old = post({ criadaEm: ago(25 * H) })
    const gone = post({ removida: true, criadaEm: ago(H / 2) })
    expect(selectMoments([a, plain, b, old, c, gone, b], NOW).map((p) => p.id)).toEqual([b.id, c.id, a.id])
  })
})

/** A relay that answers the newest-first list in pages of `size`, with the numeric cursor of the relay. */
function relayOf(posts: Post[], size = 3) {
  const read = vi.fn(async (cursor?: string): Promise<Page<Post>> => {
    const from = cursor ? Number(cursor) : 0
    const itens = posts.slice(from, from + size)
    return from + size < posts.length ? { itens, proximo: String(from + size) } : { itens }
  })
  return read
}

describe('collectMoments', () => {
  it('follows the cursor and stops at the first page that reaches a post older than 24 hours', async () => {
    const posts = [1, 2, 3, 4, 5, 6, 26, 27, 28, 29, 30].map((h) => post({ criadaEm: ago(h * H), topicos: h % 2 ? ['momento'] : [] }))
    const read = relayOf(posts)
    const got = await collectMoments(read, NOW)
    expect(read.mock.calls.map((c) => c[0])).toEqual([undefined, '3', '6'])
    expect(got.map((p) => p.criadaEm)).toEqual([1, 3, 5].map((h) => ago(h * H)))
  })
  it('stops at the page ceiling on a busy day, and at the last page', async () => {
    const busy = Array.from({ length: 40 }, (_, k) => post({ criadaEm: ago((k + 1) * 60_000) }))
    const read = relayOf(busy)
    const got = await collectMoments(read, NOW)
    expect(read).toHaveBeenCalledTimes(MOMENT_PAGES_MAX)
    expect(got).toHaveLength(MOMENT_PAGES_MAX * 3)
    const two = relayOf(busy, 3)
    expect(await collectMoments(two, NOW, { maxPages: 2 })).toHaveLength(6)
    expect(two).toHaveBeenCalledTimes(2)
    const short = relayOf(busy.slice(0, 4))
    expect(await collectMoments(short, NOW)).toHaveLength(4)
    expect(short).toHaveBeenCalledTimes(2)
  })
  it('a cursor that does not move, or an empty page, ends the walk', async () => {
    const stuck = vi.fn(async (): Promise<Page<Post>> => ({ itens: [post()], proximo: '7' }))
    await collectMoments(stuck, NOW)
    expect(stuck).toHaveBeenCalledTimes(2)
    const empty = vi.fn(async (): Promise<Page<Post>> => ({ itens: [], proximo: '9' }))
    expect(await collectMoments(empty, NOW)).toEqual([])
    expect(empty).toHaveBeenCalledTimes(1)
  })
  it('the gate runs on every page before the selection (18+ out for whoever cannot see)', async () => {
    const adult = post({ adulto: true })
    const ok = post()
    const got = await collectMoments(relayOf([adult, ok]), NOW, { gate: (ps) => ps.filter((p) => !p.adulto) })
    expect(got.map((p) => p.id)).toEqual([ok.id])
  })
  it('the first page failing throws; a later page failing keeps what was already read', async () => {
    await expect(collectMoments(async () => { throw new Error('fora do ar') }, NOW)).rejects.toThrow('fora do ar')
    const first = post()
    const read = vi.fn(async (cursor?: string): Promise<Page<Post>> => {
      if (cursor) throw new Error('fora do ar')
      return { itens: [first], proximo: '1' }
    })
    expect((await collectMoments(read, NOW)).map((p) => p.id)).toEqual([first.id])
  })
})

describe('captionFor', () => {
  it('no caption when the post text is the card text, comparing after collapsing spaces and line breaks', () => {
    expect(captionFor('Fiz um chá e fiquei olhando a chuva.', 'Fiz um chá e fiquei olhando a chuva.')).toBeNull()
    expect(captionFor('  Fiz um chá\n\te fiquei   olhando a chuva. ', 'Fiz um chá e fiquei olhando a chuva.')).toBeNull()
    expect(captionFor('صنعت كوبًا من الشاي', ' صنعت  كوبًا من الشاي')).toBeNull()
  })
  it('the post text as it is when it differs: another sentence, another case, or a card with no written text', () => {
    expect(captionFor('Chá de hortelã.', 'Fiz um chá.')).toBe('Chá de hortelã.')
    expect(captionFor('Fiz um chá.', 'fiz um chá.')).toBe('Fiz um chá.')
    expect(captionFor('Fiz um chá.', '')).toBe('Fiz um chá.')
    expect(captionFor('Fiz um chá.', 'Fiz um chá')).toBe('Fiz um chá.')
  })
})
