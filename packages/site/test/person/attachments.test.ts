// Attachments of a publication and refusals that say how long is left (protocol 0.11.0, `midia-livre` and `recusas-com-prazo`), away
// from the screen: how a picked picture is reduced before it leaves, how a wait reads in the 12 languages, which sentence each relay
// refusal becomes, that the site's own routes hand the relay's refusal to the browser untouched, what the sanitizers keep of what
// the relay sends on a post, a reply, a forum topic and a forum reply, and that the new texts exist in the 12 languages.
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))

import { PUT as mediaRoute } from '@/app/api/person/media/[hash]/route'
import { POST as publishRoute } from '@/app/api/person/publish/route'
import { message } from '@/components/person/PersonWriter'
import { photoRefusal } from '@/components/person/PhotoUpload'
import { ATTACH_TEXTS } from '@/i18n/attach'
import { PERSON_TEXTS } from '@/i18n/person'
import { PHOTO_TEXTS } from '@/i18n/photo'
import { gateAdult } from '@/lib/adult'
import { _forget, recordConsent, saveSession } from '@/lib/folgali/vault'
import { SESSION_COOKIE, seal } from '@/lib/folgali/login'
import { LOCALES } from '@/lib/i18n-base'
import { attachmentsOf, sanitizeRemovedAttachments } from '@/lib/images'
import { PersonError, refusalOf } from '@/lib/person/client'
import { ATTACH_MAX, ATTACH_MAX_SIDE, ATTACH_QUALITIES, PHOTO_MAX_BYTES, altProblem, checkPickedFile, fitInside, prepareAttachment, sha256Hex, type JpegEncoder } from '@/lib/person/media'
import { formatWait, limitOf, refusalText, waitOf } from '@/lib/person/refusal'
import { sanitizePost } from '@/lib/sanitize'
import { forumReply, topic } from '@/lib/social/sanitize-social'

const SECRET = 'segredo-de-teste-da-sessao-com-mais-de-32-caracteres'
const PERSON = 'p_lumi1234567890abcdefg'
const UID = 'rvr_' + 'P'.repeat(22)
const AT = `rmapp_at_${'a'.repeat(43)}`
const RELAY = 'http://127.0.0.1:4700'
const HASH = 'a'.repeat(64)
const protocolPath = fileURLToPath(new URL('../../../protocol/src/index.js', import.meta.url))

beforeEach(() => {
  vi.stubEnv('FOLGALI_DATA_DIR', mkdtempSync(join(tmpdir(), 'folgali-anexos-')))
  vi.stubEnv('FOLGALI_SESSION_SECRET', SECRET)
  vi.stubEnv('FOLGALI_ROVEMARK_API', 'https://api.rovemark.co')
  vi.stubEnv('FOLGALI_CLIENT', 'http')
  vi.stubEnv('FOLGALI_RELAY_URL', RELAY)
  _forget()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

/** A JPEG as a canvas writes it, with `scan` bytes of image data, an EXIF block, a comment and bytes after the end. */
function jpegOf(scan: number, { extras = false }: { extras?: boolean } = {}): Uint8Array {
  const exif = new TextEncoder().encode('Exif\0\0GPS -23.5505,-46.6333')
  const parts = [
    Uint8Array.of(0xff, 0xd8),
    ...(extras ? [Uint8Array.of(0xff, 0xe1, 0, exif.length + 2, ...exif), Uint8Array.of(0xff, 0xfe, 0, 7, ...new TextEncoder().encode('hello'))] : []),
    Uint8Array.of(0xff, 0xdb, 0, 3, 0),
    Uint8Array.of(0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0),
    Uint8Array.of(0xff, 0xda, 0, 2),
    new Uint8Array(scan),
    Uint8Array.of(0xff, 0xd9),
    ...(extras ? [new TextEncoder().encode('<html>after the end</html>')] : []),
  ]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
/** The fixed bytes a clean JPEG of this helper has around its image data. */
const CLEAN_OVERHEAD = jpegOf(0).length

describe('an attachment before it leaves the device', () => {
  it('keeps the proportion, limits the longest side to 2048 px and never enlarges', () => {
    expect(ATTACH_MAX_SIDE).toBe(2048)
    expect(fitInside(4000, 3000)).toEqual({ width: 2048, height: 1536 })
    expect(fitInside(3000, 4000)).toEqual({ width: 1536, height: 2048 })
    expect(fitInside(2048, 2048)).toEqual({ width: 2048, height: 2048 })
    expect(fitInside(800, 600)).toEqual({ width: 800, height: 600 })
    // a panorama keeps at least 1 px on the short side
    expect(fitInside(40000, 10)).toEqual({ width: 2048, height: 1 })
    expect(() => fitInside(0, 10)).toThrow()
  })
  it('re-encodes as JPEG at the reduced size, strips what a file hides, and the hash is of the cleaned bytes', async () => {
    const calls: [number, number, number][] = []
    const encode: JpegEncoder = async (w, h, q) => {
      calls.push([w, h, q])
      return jpegOf(5000, { extras: true })
    }
    const p = await prepareAttachment({ width: 4000, height: 3000 }, encode)
    expect(calls).toEqual([[2048, 1536, ATTACH_QUALITIES[0]]])
    expect([p.width, p.height]).toEqual([2048, 1536])
    const text = Buffer.from(p.bytes).toString('latin1')
    expect(text).not.toContain('Exif')
    expect(text).not.toContain('GPS')
    expect(text).not.toContain('hello')
    expect(text).not.toContain('<html>')
    expect(p.bytes.length).toBe(CLEAN_OVERHEAD + 5000)
    expect(p.hash).toBe(await sha256Hex(p.bytes))
    expect(p.hash).toMatch(/^[0-9a-f]{64}$/)
  })
  it('steps the quality down until the file is at most 1 MiB, and takes exactly 1 MiB', async () => {
    expect(PHOTO_MAX_BYTES).toBe(1048576)
    const tried: number[] = []
    const p = await prepareAttachment({ width: 1000, height: 1000 }, async (_w, _h, q) => {
      tried.push(q)
      // two qualities over the limit by one byte, then exactly at the limit
      return jpegOf(PHOTO_MAX_BYTES - CLEAN_OVERHEAD + (tried.length < 3 ? 1 : 0))
    })
    expect(tried).toEqual(ATTACH_QUALITIES.slice(0, 3))
    expect(p.bytes.length).toBe(PHOTO_MAX_BYTES)
  })
  it('when no quality fits, halves the picture once; when that does not fit either, says it is too big', async () => {
    const sizes: string[] = []
    const p = await prepareAttachment({ width: 4000, height: 2000 }, async (w, h) => {
      sizes.push(`${w}x${h}`)
      return jpegOf(w > 1024 ? 2 * PHOTO_MAX_BYTES : 1000)
    })
    expect([p.width, p.height]).toEqual([1024, 512])
    expect(sizes).toEqual([...ATTACH_QUALITIES.map(() => '2048x1024'), '1024x512'])
    let n = 0
    await expect(prepareAttachment({ width: 4000, height: 2000 }, async () => { n++; return jpegOf(2 * PHOTO_MAX_BYTES) })).rejects.toThrow('too_big')
    expect(n).toBe(2 * ATTACH_QUALITIES.length)
    // a browser that cannot encode at all is the same refusal, never a broken upload
    await expect(prepareAttachment({ width: 10, height: 10 }, async () => null)).rejects.toThrow('too_big')
  })
  it('what is checked before decoding: 15 MB, the format by the first bytes, no animation', async () => {
    const riff = (flags: number) => new Uint8Array([...new TextEncoder().encode('RIFF'), 0, 0, 0, 0, ...new TextEncoder().encode('WEBPVP8X'), 10, 0, 0, 0, flags, 0, 0, 0])
    expect(await checkPickedFile(new Blob([new Uint8Array(15 * 1048576 + 1)]))).toBe('big')
    expect(await checkPickedFile(new Blob([new TextEncoder().encode('GIF89a....')]))).toBe('type')
    expect(await checkPickedFile(new Blob([new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')]))).toBe('type')
    expect(await checkPickedFile(new Blob([riff(0x02) as BlobPart]))).toBe('animated')
    expect(await checkPickedFile(new Blob([riff(0x00) as BlobPart]))).toBeNull()
    expect(await checkPickedFile(new Blob([jpegOf(10) as BlobPart]))).toBeNull()
    expect(ATTACH_MAX).toBe(4)
  })
  it('the alternative text is optional; an address, a line break or more than 280 characters stop it', () => {
    expect(altProblem('')).toBeNull()
    expect(altProblem('Um gato dormindo no teclado.')).toBeNull()
    expect(altProblem('veja em https://exemplo.com/foto')).toBe('url')
    expect(altProblem('veja em www.exemplo.com')).toBe('url')
    expect(altProblem('linha um\nlinha dois')).toBe('line')
    expect(altProblem('a'.repeat(280))).toBeNull()
    expect(altProblem('a'.repeat(281))).toBe('long')
  })
})

describe('a wait in words', () => {
  it('reads naturally in Portuguese and English, rounding up like the relay', () => {
    expect(formatWait(45, 'pt')).toBe('45 segundos')
    expect(formatWait(1, 'pt')).toBe('1 segundo')
    expect(formatWait(0, 'pt')).toBe('1 segundo')
    expect(formatWait(60, 'pt')).toBe('1 minuto')
    expect(formatWait(61, 'pt')).toBe('2 minutos')
    expect(formatWait(720, 'pt')).toBe('12 minutos')
    expect(formatWait(3600, 'pt')).toBe('1 hora')
    expect(formatWait(11100, 'pt')).toBe('3 horas e 5 minutos')
    expect(formatWait(86400, 'pt')).toBe('1 dia')
    expect(formatWait(187200, 'pt')).toBe('2 dias e 4 horas')
    expect(formatWait(720, 'en')).toBe('12 minutes')
    expect(formatWait(11100, 'en')).toBe('3 hours and 5 minutes')
    expect(formatWait(187200, 'en')).toBe('2 days and 4 hours')
  })
  it.skipIf(!existsSync(protocolPath))('in Portuguese it is word for word the sentence the relay writes (esperaEmPalavras)', async () => {
    const P = (await import(/* @vite-ignore */ protocolPath)) as { waitInWords: (s: number) => string }
    for (const s of [1, 2, 59, 60, 61, 119, 120, 719, 3599, 3600, 3601, 3660, 7199, 7200, 11100, 86399, 86400, 86401, 90000, 172800, 187200, 31 * 86400]) {
      expect(formatWait(s, 'pt'), String(s)).toBe(P.waitInWords(s))
    }
  })
  it('the 12 languages each write their own words', () => {
    const minutes = Object.fromEntries(LOCALES.map((l) => [l, formatWait(720, l).replace(/[\u00a0\u202f]/g, ' ')]))
    expect(minutes).toMatchObject({ es: '12 minutos', fr: '12 minutes', de: '12 Minuten', it: '12 minuti', nl: '12 minuten', ru: '12 минут', zh: '12分钟', ko: '12분' })
    expect(minutes.ja).toMatch(/^12\s?分$/)
    expect(minutes.ar).toContain('دقيقة')
    // French puts a no-break space between the number and the unit: right on the screen, plain here for the comparison
    const two = Object.fromEntries(LOCALES.map((l) => [l, formatWait(11100, l).replace(/[\u00a0\u202f]/g, ' ')]))
    expect(two).toMatchObject({ es: '3 horas y 5 minutos', fr: '3 heures et 5 minutes', de: '3 Stunden und 5 Minuten', it: '3 ore e 5 minuti', nl: '3 uur en 5 minuten' })
    for (const l of LOCALES) {
      expect(two[l], l).toMatch(/3/)
      expect(two[l], l).toMatch(/5/)
      expect(two[l], l).not.toMatch(/[—–]/)
    }
    // ten distinct ways of saying it besides Portuguese and English, never the English copied
    expect(new Set(Object.values(two)).size).toBe(12)
  })
  it('a wait is only believed when it is a positive number of at most a year', () => {
    const e = (retryAfterS: unknown) => new PersonError(429, 'limite_de_taxa', { retryAfterS })
    expect(waitOf(e(720))).toBe(720)
    expect(waitOf(e(0.2))).toBe(1)
    for (const bad of [0, -5, '720', null, undefined, Number.NaN, Number.POSITIVE_INFINITY, 400 * 86400]) expect(waitOf(e(bad)), String(bad)).toBeNull()
    expect(waitOf(new Error('x'))).toBeNull()
    expect(limitOf(new PersonError(429, 'limite_de_taxa', { limite: { max: 10, janelaS: 60 } }))).toEqual({ max: 10, windowS: 60 })
    expect(limitOf(new PersonError(429, 'limite_de_taxa', { limite: { max: '10', janelaS: 60 } }))).toBeNull()
    expect(limitOf(new PersonError(429, 'limite_de_taxa'))).toBeNull()
  })
})

describe('which sentence a refusal becomes', () => {
  const r = ATTACH_TEXTS.pt.refusals
  const t = PERSON_TEXTS.pt
  const limit = (s?: number) => new PersonError(429, 'limite_de_taxa', s === undefined ? {} : { retryAfterS: s, limite: { max: 10, janelaS: 60 }, libera: 'Espere o tempo de `retryAfterS`.' })
  it('a limit says what was counted and when it unblocks', () => {
    expect(refusalText(limit(720), r, 'pt', 'posts')).toBe('Você chegou ao limite de postagens. Libera em 12 minutos.')
    expect(refusalText(limit(11100), r, 'pt', 'images')).toBe('Você chegou ao limite de imagens. Libera em 3 horas e 5 minutos.')
    expect(refusalText(limit(86400), r, 'pt', 'photos')).toBe('Você chegou ao limite de trocas de foto do perfil. Libera em 1 dia.')
    expect(refusalText(limit(720), ATTACH_TEXTS.en.refusals, 'en', 'posts')).toBe('You reached the post limit. It unlocks in 12 minutes.')
    // the owner's authorization ran out (a rover's ceiling): the same sentence
    expect(refusalText(new PersonError(429, 'autorizacao_esgotada', { retryAfterS: 60 }), r, 'pt', 'posts')).toBe('Você chegou ao limite de postagens. Libera em 1 minuto.')
    // no wait in the answer (an older relay): the sentence never invents one
    expect(refusalText(limit(), r, 'pt', 'posts')).toBe('Você chegou ao limite de postagens. Tente de novo mais tarde.')
  })
  it('new account, no media space, a file the moderation removed, more than 4 images', () => {
    expect(refusalText(new PersonError(403, 'conta_nova', { retryAfterS: 72000 }), r, 'pt', 'images')).toBe('A sua conta ainda é nova para enviar imagens. Libera em 20 horas.')
    expect(refusalText(new PersonError(403, 'conta_nova'), r, 'pt', 'images')).toBe('A sua conta ainda é nova para enviar imagens. Tente de novo mais tarde.')
    expect(refusalText(new PersonError(507, 'cota_de_midia'), r, 'pt', 'images')).toBe('A folgali está sem espaço para imagens agora. Tente mais tarde.')
    expect(refusalText(new PersonError(410, 'midia_recusada'), r, 'pt', 'images')).toBe('Esta imagem foi removida pela moderação e não volta.')
    expect(refusalText(new PersonError(409, 'limite_de_estrutura'), r, 'pt', 'images')).toBe('Cada publicação leva até 4 imagens.')
    // any other code is not this module's: the screen keeps its own text
    for (const code of ['vazamento', 'previo_incorreto', 'sem_sessao', 'erro', '']) expect(refusalText(new PersonError(400, code), r, 'pt', 'posts'), code).toBeNull()
    expect(refusalText(new Error('x'), r, 'pt', 'posts')).toBeNull()
  })
  it('the composer: the limit with its wait, and the texts it already had for everything else', () => {
    const with_ = { t: r, lang: 'pt', counted: 'posts' as const }
    expect(message(t, limit(720), with_)).toBe('Você chegou ao limite de postagens. Libera em 12 minutos.')
    expect(message(t, new PersonError(507, 'cota_de_midia'), { ...with_, counted: 'images' })).toBe(r.quota)
    expect(message(t, new PersonError(401, 'sem_sessao'), with_)).toBe(t.errors.signed_out)
    expect(message(t, new PersonError(403, 'atestado_revogado'), with_)).toBe(t.errors.revoked)
    expect(message(t, new PersonError(500, 'erro'), with_)).toBe(t.errors.generic)
    // the first profile counts nothing: the sentence it had, plus the wait when the relay says it
    expect(message(t, limit(720), { t: r, lang: 'pt' })).toBe(`${t.errors.rate} Libera em 12 minutos.`)
    expect(message(t, limit(), { t: r, lang: 'pt' })).toBe(t.errors.rate)
    expect(message(t, limit(720))).toBe(t.errors.rate)
  })
  it('the photo uploader: with a wait the sentence says it; without one, the texts of the photo screen', () => {
    const p = PHOTO_TEXTS.pt
    expect(photoRefusal(limit(10800), p, r, 'pt')).toBe('Você chegou ao limite de trocas de foto do perfil. Libera em 3 horas.')
    expect(photoRefusal(new PersonError(403, 'conta_nova', { retryAfterS: 3600 }), p, r, 'pt')).toBe('A sua conta ainda é nova para enviar imagens. Libera em 1 hora.')
    expect(photoRefusal(limit(), p, r, 'pt')).toBe(p.errors.limit)
    expect(photoRefusal(new PersonError(403, 'conta_nova'), p, r, 'pt')).toBe(p.errors.young)
    expect(photoRefusal(new PersonError(507, 'cota_de_midia'), p, r, 'pt')).toBe(r.quota)
    expect(photoRefusal(new PersonError(410, 'midia_recusada'), p, r, 'pt')).toBe(r.refused)
    expect(photoRefusal(new PersonError(415, 'formato_nao_aceito'), p, r, 'pt')).toBe(p.errors.type)
    expect(photoRefusal(new PersonError(403, 'minor'), p, r, 'pt')).toBe(p.errors.minor)
    expect(photoRefusal(new Error('too_big'), p, r, 'pt')).toBe(p.errors.big)
    // without the 0.11.0 texts (an older caller) nothing changes
    expect(photoRefusal(limit(10800), p)).toBe(p.errors.limit)
  })
})

describe('the refusal reaches the browser as the relay wrote it', () => {
  const refusal = { erro: { codigo: 'limite_de_taxa', mensagem: 'Muitos pedidos em pouco tempo. Limite de postagens: 10 por minuto. Libera em 42 segundos.', campo: 'objeto.tipo', libera: 'Espere o tempo de `retryAfterS`.', retryAfterS: 42, limite: { max: 10, janelaS: 60 } } }
  const signedIn = () => {
    saveSession('sid-1', { pessoa: PERSON, nome: 'Ana', fichas: { at: AT, rt: `rmapp_rt_${'r'.repeat(43)}` }, venceEm: Date.now() + 10 * 60_000 }, SECRET)
    recordConsent(PERSON)
    return `${SESSION_COOKIE}=${seal({ sid: 'sid-1' }, SECRET)}`
  }
  const relay = (status: number, body: unknown) =>
    vi.stubGlobal('fetch', async (url: string) => (String(url).startsWith('https://api.rovemark.co') ? Response.json({ ok: true, uid: UID, handle: 'ana', adult: true }) : Response.json(body, { status })))

  it('publishing: status, code, retryAfterS, limite and libera pass through /api/person/publish', async () => {
    const cookie = signedIn()
    relay(429, refusal)
    const object = { v: '0.3', tipo: 'postagem', autor: UID, criadoEm: 1_900_000_000, previo: null, corpo: { texto: 'oi', topicos: [] }, id: `ob_${'I'.repeat(43)}`, assinatura: 'S'.repeat(86) }
    const r = await publishRoute(new NextRequest('https://folgali.com/api/person/publish', { method: 'POST', body: JSON.stringify({ objeto: object }), headers: { 'content-type': 'application/json', cookie } }))
    expect(r.status).toBe(429)
    expect(await r.json()).toEqual(refusal)
  })
  it('uploading: the same through /api/person/media, and the browser keeps every field in the PersonError', async () => {
    const cookie = signedIn()
    const young = { erro: { codigo: 'conta_nova', mensagem: 'A conta ainda não tem a idade mínima para esta ação.', libera: 'Espere o tempo de `retryAfterS`.', retryAfterS: 72000 } }
    relay(403, young)
    const auth = `Rover-Envio uid=${UID}, t=1900000000, a=${'A'.repeat(86)}`
    const r = await mediaRoute(new NextRequest(`https://folgali.com/api/person/media/${HASH}`, { method: 'PUT', body: jpegOf(10) as BodyInit, headers: { 'x-rover-envio': auth, 'content-length': String(jpegOf(10).length), cookie } }), { params: Promise.resolve({ hash: HASH }) })
    expect(r.status).toBe(403)
    const copy = r.clone()
    expect(await r.json()).toEqual(young)
    const e = await refusalOf(copy)
    expect([e.status, e.code]).toEqual([403, 'conta_nova'])
    expect(e.extra).toEqual({ libera: young.erro.libera, retryAfterS: 72000 })
    expect(refusalText(e, ATTACH_TEXTS.pt.refusals, 'pt', 'images')).toBe('A sua conta ainda é nova para enviar imagens. Libera em 20 horas.')
    // an answer that is not JSON still becomes a refusal the screen can show
    expect((await refusalOf(new Response('<html>', { status: 502 }))).code).toBe('erro')
  })
})

describe('what the site keeps of the attachments the relay sends', () => {
  const ID = (c: string) => `ob_${c.repeat(43)}`
  const author = { uid: `rvr_${'A'.repeat(22)}`, handle: 'ana', nome: 'Ana', rosto: { corpo: 'marshmallow', cor: '#f2e8d6' } }
  const image = (n: number, alt = '') => ({ id: ID(String(n)), hash: String(n).repeat(64), formato: 'jpeg', largura: 1200, altura: 800, bytes: 4000, alt, ordem: n })
  const clean = (n: number, alt = '') => ({ id: ID(String(n)), hash: String(n).repeat(64), formato: 'jpeg', largura: 1200, altura: 800, alt })
  const post = (extra: Record<string, unknown>) => ({ id: ID('p'), tipo: 'postagem', autor: author, texto: 'oi', topicos: [], criadaEm: '2026-11-25T12:00:00.000Z', respostas: 0, reacoes: {}, ...extra })

  it('a post and a reply: up to 4 images in order, an empty alt is valid, and how many the moderation removed', () => {
    const p = sanitizePost(post({ imagens: [image(1, 'Um gato.'), image(2)], anexosRemovidos: 1 }))
    expect(p.imagens).toEqual([clean(1, 'Um gato.'), clean(2)])
    expect(p.anexosRemovidos).toBe(1)
    const r = sanitizePost(post({ tipo: 'resposta', respondeA: ID('q'), imagens: [image(3)] }))
    expect(r.imagens).toEqual([clean(3)])
    expect(r.anexosRemovidos).toBeUndefined()
    // every attachment gone: the post still says so
    expect(sanitizePost(post({ anexosRemovidos: 2 }))).toMatchObject({ anexosRemovidos: 2 })
    expect(sanitizePost(post({ anexosRemovidos: 2 })).imagens).toBeUndefined()
    // a post the author deleted shows neither
    const gone = sanitizePost(post({ removida: true, imagens: [image(1)], anexosRemovidos: 1 }))
    expect([gone.imagens, gone.anexosRemovidos]).toEqual([undefined, undefined])
  })
  it('the count of removed attachments is a whole number from 1 to 4, anything else is none', () => {
    expect([1, 2, 4, 9].map(sanitizeRemovedAttachments)).toEqual([1, 2, 4, 4])
    for (const bad of [0, -1, 1.5, '2', null, undefined, {}, Number.NaN]) expect(sanitizeRemovedAttachments(bad), String(bad)).toBe(0)
    expect(attachmentsOf({})).toEqual({})
    expect(attachmentsOf({ imagens: [{ hash: 'https://fora.exemplo/x.png' }], anexosRemovidos: 'muitos' })).toEqual({})
    expect(attachmentsOf({ imagens: [1, 2, 3, 4, 5, 6].map((n) => image(n)) }).imagens).toHaveLength(4)
  })
  it('a forum topic and a forum reply carry their own', () => {
    const envelope = { v: '0.3', id: ID('r'), tipo: 'resposta-forum', autor: author.uid, criadoEm: 1_900_000_000, corpo: { texto: 'Olha a foto.' } }
    const fr = forumReply({ id: ID('r'), envelope, autor: author, em: null, cita: null, filhas: 0, resolveu: false, reacoes: { curtir: 0, util: 0 }, imagens: [image(1, 'A praça.'), image(2)], anexosRemovidos: 3 })
    expect(fr.imagens).toEqual([clean(1, 'A praça.'), clean(2)])
    expect(fr.anexosRemovidos).toBe(3)
    const plain = forumReply({ id: ID('r'), envelope, autor: author, em: null, cita: null, filhas: 0, resolveu: false, reacoes: { curtir: 0, util: 0 } })
    expect('imagens' in plain || 'anexosRemovidos' in plain).toBe(false)
    const base = { id: ID('t'), comunidade: ID('c'), comunidadeNome: 'Fotos', categoria: null, titulo: 'Fotos da folga', trecho: 'Olha.', texto: 'Olha.', autor: author, criadoEm: '2026-11-25T12:00:00.000Z', respostas: 0, fixado: false, trancado: false, resolvido: false, tags: [], enquete: null, editado: false, versoes: 1, resolvidoPor: null }
    const tp = topic({ ...base, imagens: [image(4)], anexosRemovidos: 1 })
    expect(tp.imagens).toEqual([clean(4)])
    expect(tp.anexosRemovidos).toBe(1)
    expect('imagens' in topic(base)).toBe(false)
  })
  it('the attachments of an 18+ post go with its text: who cannot see 18+ receives neither', () => {
    const adult = { ...post({ adulto: true, imagens: [clean(1)] }) }
    const hidden = gateAdult({ postagem: adult }, false).postagem as Record<string, unknown>
    expect(hidden.adultHidden).toBe(true)
    expect(hidden.texto).toBe('')
    expect('imagens' in hidden).toBe(false)
    // in a list the whole item goes
    expect(gateAdult({ itens: [adult, post({})] }, false).itens).toHaveLength(1)
    expect((gateAdult({ postagem: adult }, true).postagem as Record<string, unknown>).imagens).toEqual([clean(1)])
  })
})

describe('the texts exist in the 12 languages', () => {
  const leaves = (o: unknown, path = ''): [string, string][] =>
    typeof o === 'string' ? [[path, o]] : Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k))
  const marks = (s: string) => [...s.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort().join('|')
  const pt = leaves(ATTACH_TEXTS.pt)

  it('same keys, same placeholders, nothing empty, no dash, the brand in lowercase', () => {
    expect(Object.keys(ATTACH_TEXTS).sort()).toEqual([...LOCALES].sort())
    expect(pt.length).toBeGreaterThan(45)
    for (const l of LOCALES) {
      const own = leaves(ATTACH_TEXTS[l])
      expect(own.map(([k]) => k), l).toEqual(pt.map(([k]) => k))
      for (const [i, [k, v]] of own.entries()) {
        expect(v.trim().length, `${l}.${k}`).toBeGreaterThan(0)
        expect(marks(v), `${l}.${k}`).toBe(marks(pt[i][1]))
        expect(v, `${l}.${k}`).not.toMatch(/[—–]/)
        expect(v, `${l}.${k}`).not.toMatch(/Folgali|FOLGALI/)
      }
    }
  })
  it('each language has its own words: none is the Portuguese or the English copied', () => {
    const en = leaves(ATTACH_TEXTS.en)
    for (const l of LOCALES.filter((x) => x !== 'pt' && x !== 'en')) {
      const own = leaves(ATTACH_TEXTS[l])
      const copied = own.filter(([, v], i) => v === en[i][1] || v === pt[i][1]).map(([k]) => k)
      expect(copied, l).toEqual([])
    }
    expect(leaves(ATTACH_TEXTS.en).filter(([, v], i) => v === pt[i][1]).map(([k]) => k)).toEqual([])
  })
  it('the numbers a sentence states are the same in every language (4 images, 15 MB)', () => {
    const numbers = (s: string) => (s.match(/\d+/g) ?? []).sort().join(',')
    for (const l of LOCALES) for (const [i, [k, v]] of leaves(ATTACH_TEXTS[l]).entries()) {
      // one image, in words in some languages and as a digit in others
      if (k === 'gallery.removedOne') continue
      expect(numbers(v), `${l}.${k}`).toBe(numbers(pt[i][1]))
    }
  })
})
