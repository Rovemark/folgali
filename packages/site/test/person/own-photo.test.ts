// The person's own profile photo (decision of 25/11/2026) on the site: the browser cleans the JPEG exactly
// as the relay does (same hash), signs the upload credential the relay accepts, refuses GIF, SVG, animation and oversized files before
// decoding, and the site route only carries uploads of an adult, signed-in person, as herself, up to 1 MiB. The display name is free.
import { createPrivateKey, webcrypto } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))

import { PUT as mediaRoute } from '@/app/api/person/media/[hash]/route'
import { POST as publishRoute } from '@/app/api/person/publish/route'
import { checkPicked, photoError } from '@/components/person/PhotoUpload'
import { nameLeak } from '@/components/person/ProfileEditor'
import { _forget, recordConsent, saveSession } from '@/lib/folgali/vault'
import { SESSION_COOKIE, seal } from '@/lib/folgali/login'
import { PersonError } from '@/lib/person/client'
import { cleanJpeg, cropRect, isAnimatedWebp, sha256Hex, signUpload, sniffFormat } from '@/lib/person/media'
import { findLeaks } from '@/lib/leak-detector'

const SECRET = 'segredo-de-teste-da-sessao-com-mais-de-32-caracteres'
const PERSON = 'p_lumi1234567890abcdefg'
const UID = 'rvr_' + 'P'.repeat(22)
const AT = `rmapp_at_${'a'.repeat(43)}`
const RELAY = 'http://127.0.0.1:4700'
const HASH = 'a'.repeat(64)
const protocolPath = fileURLToPath(new URL('../../../protocol/src/index.js', import.meta.url))
const OG = fileURLToPath(new URL('../../public/marca/folgali/og', import.meta.url))
const jpegs = readdirSync(OG).filter((f) => f.endsWith('.jpg')).slice(0, 6).map((f) => new Uint8Array(readFileSync(join(OG, f))))

beforeEach(() => {
  vi.stubEnv('FOLGALI_DATA_DIR', mkdtempSync(join(tmpdir(), 'folgali-foto-')))
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

/** A JPEG with an EXIF segment carrying a GPS-looking text and a comment, and bytes after the end: all of it must go. */
function withExtras(jpeg: Uint8Array): Uint8Array {
  const text = new TextEncoder().encode('Exif\0\0GPS -23.5505,-46.6333 secret')
  const app1 = new Uint8Array([0xff, 0xe1, 0, text.length + 2, ...text])
  const using = new Uint8Array([0xff, 0xfe, 0, 7, ...new TextEncoder().encode('hello')])
  const tail = new TextEncoder().encode('<html>polyglot</html>')
  return new Uint8Array([...jpeg.subarray(0, 2), ...app1, ...using, ...jpeg.subarray(2), ...tail])
}

describe.skipIf(!existsSync(protocolPath))('the browser does what the relay does', async () => {
  const P = await import(/* @vite-ignore */ protocolPath)
  it('cleanJpeg gives the same bytes (and the same hash) as the protocol limparImagem, and drops EXIF, comments and trailing bytes', async () => {
    expect(jpegs.length).toBeGreaterThan(2)
    for (const j of jpegs) {
      for (const input of [j, withExtras(j)]) {
        const theirs = P.cleanImage(input)
        expect(theirs.ok).toBe(true)
        const mine = cleanJpeg(input)
        expect(Buffer.from(mine).equals(theirs.bytes)).toBe(true)
        expect(await sha256Hex(mine, webcrypto.subtle as unknown as SubtleCrypto)).toBe(theirs.hash)
        expect(Buffer.from(mine).includes(Buffer.from('GPS'))).toBe(false)
        expect(Buffer.from(mine).includes(Buffer.from('polyglot'))).toBe(false)
      }
    }
  })
  it('the upload credential the device signs is the protocol one and only covers PUT of that hash', async () => {
    const pair = (await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
    const pkcs8 = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', pair.privateKey))
    const pub = Buffer.from(await webcrypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url')
    const target = `/v1/midia/${HASH}`
    const mine = await signUpload(pair.privateKey, UID, target, 1_900_000_000, webcrypto.subtle as unknown as SubtleCrypto)
    expect(mine).toBe(P.createSendCredential({ chavePrivada: createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' }), uid: UID, alvo: target, t: 1_900_000_000 }))
    const c = P.readUploadCredential(mine)
    expect(P.uploadCredentialMatches(c, { metodo: 'PUT', alvo: target, chave: pub, agora: 1_900_000_010 })).toBe(true)
    expect(P.uploadCredentialMatches(c, { metodo: 'PUT', alvo: `/v1/midia/${'b'.repeat(64)}`, chave: pub, agora: 1_900_000_010 })).toBe(false)
    expect(P.readReadCredential(mine.replace('Rover-Envio', 'Rover-Assinatura'))).not.toBeNull()
    expect(P.readCredentialMatches(P.readReadCredential(mine.replace('Rover-Envio', 'Rover-Assinatura')), { metodo: 'GET', alvo: target, chave: pub, agora: 1_900_000_010 })).toBe(false)
  })
})

describe('what the screen refuses before decoding', () => {
  const gif = new TextEncoder().encode('GIF89a....')
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
  const animated = new Uint8Array([...new TextEncoder().encode('RIFF'), 0, 0, 0, 0, ...new TextEncoder().encode('WEBPVP8X'), 10, 0, 0, 0, 0x02, 0, 0, 0])
  it('format by the first bytes: JPEG, PNG and WebP yes; GIF, SVG and the rest no; animated WebP is caught', () => {
    expect(sniffFormat(jpegs[0])).toBe('jpeg')
    expect(sniffFormat(gif)).toBeNull()
    expect(sniffFormat(svg)).toBeNull()
    expect(isAnimatedWebp(animated)).toBe(true)
  })
  it('checkPicked: over 15 MB, not an image, animated', async () => {
    expect(await checkPicked(new Blob([new Uint8Array(15 * 1048576 + 1)]))).toBe('big')
    expect(await checkPicked(new Blob([gif]))).toBe('type')
    expect(await checkPicked(new Blob([svg]))).toBe('type')
    expect(await checkPicked(new Blob([animated]))).toBe('animated')
    expect(await checkPicked(new Blob([jpegs[0] as BlobPart]))).toBeNull()
  })
  it('the relay refusals become the right message', () => {
    expect(photoError(new PersonError(415, 'formato_nao_aceito'))).toBe('type')
    expect(photoError(new PersonError(413, 'imagem_grande'))).toBe('big')
    expect(photoError(new PersonError(403, 'conta_nova'))).toBe('young')
    expect(photoError(new PersonError(429, 'limite_de_taxa'))).toBe('limit')
    expect(photoError(new PersonError(403, 'minor'))).toBe('minor')
    expect(photoError(new PersonError(404, 'nao_encontrado'))).toBe('off')
    expect(photoError(new Error('x'))).toBe('generic')
  })
  it('the crop keeps the shape and stays inside the picture', () => {
    const square = cropRect(4000, 3000, 1, { zoom: 1, x: 0.5, y: 0.5 })
    expect(square).toEqual({ sx: 500, sy: 0, sw: 3000, sh: 3000 })
    const cover = cropRect(4000, 3000, 3, { zoom: 2, x: 1, y: 0 })
    expect(cover.sw / cover.sh).toBeCloseTo(3)
    expect(cover.sx + cover.sw).toBeLessThanOrEqual(4000)
    expect(cover.sy).toBe(0)
  })
})

describe('the display name is free', () => {
  it('names and surnames pass, with particles, accents, apostrophes, hyphens and nicknames', () => {
    for (const n of ['Marina Costa', 'Mariana Luíza Conceição de Oliveira Mendonça', "Ana-Clara D'Ávila", 'Maria José dos Santos Oliveira', 'Dra. Fernanda Lima', 'Marina (ela/dela)', 'Wolfeschlegelsteinhausenberger', '李小龙', 'Марина Костова']) {
      expect(nameLeak(n), n).toBeUndefined()
      expect(findLeaks(n), n).toEqual([])
    }
  })
  it('a key, a password, a token, an e-mail, a phone number or a document in the name still stop it', () => {
    for (const n of ['marina@example.com', '+55 11 98765-4321', '123.456.789-09', 'senha: hunter2hunter2', 'sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAA']) {
      expect(nameLeak(n), n).toBeDefined()
    }
  })
})

describe('the upload route', () => {
  const signedIn = () => {
    saveSession('sid-1', { pessoa: PERSON, nome: 'Ana', fichas: { at: AT, rt: `rmapp_rt_${'r'.repeat(43)}` }, venceEm: Date.now() + 10 * 60_000 }, SECRET)
    recordConsent(PERSON)
    return `${SESSION_COOKIE}=${seal({ sid: 'sid-1' }, SECRET)}`
  }
  const auth = (uid = UID) => `Rover-Envio uid=${uid}, t=1900000000, a=${'A'.repeat(86)}`
  const put = (bytes: Uint8Array, { cookie, credential = auth(), hash = HASH }: { cookie?: string; credential?: string; hash?: string } = {}) =>
    mediaRoute(new NextRequest(`https://folgali.com/api/person/media/${hash}`, { method: 'PUT', body: bytes as BodyInit, headers: { 'x-rover-envio': credential, 'content-length': String(bytes.length), ...(cookie ? { cookie } : {}) } }), { params: Promise.resolve({ hash }) })
  function relay(adult: boolean | null) {
    const calls: { url: string; auth: string | null; bytes: number }[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      if (String(url).startsWith('https://api.rovemark.co')) return Response.json({ ok: true, uid: UID, handle: 'ana', adult })
      calls.push({ url: String(url), auth: new Headers(init.headers).get('authorization'), bytes: (init.body as Uint8Array).length })
      return Response.json({ estado: 'recebida', hash: HASH }, { status: 201 })
    })
    return calls
  }
  it('signed out 401; a minor 403; another uid 403; over 1 MiB 413; a bad hash 400; the adult\'s own upload goes to the relay as is', async () => {
    const calls = relay(true)
    expect((await put(jpegs[0])).status).toBe(401)
    const cookie = signedIn()
    expect((await put(jpegs[0], { cookie, hash: 'nao-e-hash' })).status).toBe(400)
    expect((await put(jpegs[0], { cookie, credential: 'Bearer x' })).status).toBe(400)
    expect((await put(new Uint8Array(1048577), { cookie })).status).toBe(413)
    expect((await put(jpegs[0], { cookie, credential: auth('rvr_' + 'Q'.repeat(22)) })).status).toBe(403)
    const ok = await put(jpegs[0], { cookie })
    expect(ok.status).toBe(201)
    expect(calls).toEqual([{ url: `${RELAY}/v1/midia/${HASH}`, auth: auth(), bytes: jpegs[0].length }])
    relay(false)
    const minor = await put(jpegs[0], { cookie })
    expect(minor.status).toBe(403)
    expect((await minor.json()).erro.codigo).toBe('minor')
    relay(null)
    expect((await put(jpegs[0], { cookie })).status).toBe(403)
  })
  it('publishing an `imagem` object also needs an account Rovemark says is 18 or over', async () => {
    const cookie = signedIn()
    relay(false)
    const object = { v: '0.3', tipo: 'imagem', autor: UID, criadoEm: 1_900_000_000, previo: null, corpo: {}, id: `ob_${'I'.repeat(43)}`, assinatura: 'S'.repeat(86) }
    const r = await publishRoute(new NextRequest('https://folgali.com/api/person/publish', { method: 'POST', body: JSON.stringify({ objeto: object }), headers: { 'content-type': 'application/json', cookie } }))
    expect(r.status).toBe(403)
    expect((await r.json()).erro.codigo).toBe('minor')
  })
})
