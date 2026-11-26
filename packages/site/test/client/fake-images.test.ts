// 0.5.0: the demo images are GENERATED in code and go through the SAME protocol cleaning without changing a byte (they are born
// clean), with the protocol hash; they are small; the alt text follows the text rules; and the fake client delivers them.
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { FakeClient } from '@/lib/fake-client'
import { demoId } from '@/lib/domain/ids'
import { sanitizeImage, sanitizeImages, imageUrl } from '@/lib/images'
import { allDemoImages } from '@/lib/social/fake/images'
import { GET } from '@/app/midia/[arquivo]/route'

// the protocol is plain JavaScript from the same repository: the demo is checked by the real function
// @ts-expect-error JS module without types
import { cleanImage, validateText } from '../../../protocol/src/index.js'

describe('generated demo images', () => {
  const all = allDemoImages()
  it('they exist, are small PNGs (up to 8 KB) and already clean: the protocol cleaning returns the same bytes and the same hash', () => {
    expect(all.length).toBeGreaterThanOrEqual(5)
    for (const i of all) {
      expect(i.bytes.length).toBeLessThanOrEqual(8192)
      const r = cleanImage(i.bytes)
      expect(r.ok, i.alt).toBe(true)
      expect(r.hash).toBe(i.hash)
      expect(Buffer.compare(r.bytes, i.bytes)).toBe(0)
      expect([r.formato, r.largura, r.altura]).toEqual([i.formato, i.largura, i.altura])
    }
  })
  it('the alt text of each one passes the protocol text rules (one line, up to 280, no link)', () => {
    for (const i of all) expect(validateText(i.alt, { min: 1, max: 280, multilinha: false, urls: 0, v3: true }), i.alt).toBeNull()
  })
  it('the fake client delivers the images: Pipa\'s and Didi\'s attachments, Pipa\'s portrait, Lumi\'s draft, and the bytes by hash', async () => {
    const c = new FakeClient()
    const p02 = (await c.getObject(demoId('ob', 'p02'))).postagem
    expect(p02.imagens).toHaveLength(1)
    const p04 = (await c.getObject(demoId('ob', 'p04'))).postagem
    expect(p04.imagens).toHaveLength(2)
    expect((await c.getObject(demoId('ob', 'p01'))).postagem.imagens).toBeUndefined()
    expect((await c.getRover('pipa')).retratoImagem?.formato).toBe('png')
    expect((await c.paginaDoRover(demoId('rvr', 'pipa'))).rover.retratoImagem?.alt).toMatch(/cesta de lembranças/)
    expect((await c.rascunho('rsc_demo_01'))?.imagens).toHaveLength(1)
    const bytes = await c.imagem(p02.imagens![0].hash)
    expect(bytes?.formato).toBe('png')
    expect(await c.imagem('0'.repeat(64))).toBeNull()
  })
})

describe('the site\'s own /midia/<hash>.<ext> route', () => {
  const call = (file: string) => GET(new Request(`http://site/midia/${file}`), { params: Promise.resolve({ arquivo: file }) })
  it('serves the image with the relay headers: fixed type, nosniff, CSP sandbox, immutable cache', async () => {
    const i = allDemoImages()[0]
    const r = await call(`${i.hash}.png`)
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toBe('image/png')
    expect(r.headers.get('x-content-type-options')).toBe('nosniff')
    expect(r.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox")
    expect(r.headers.get('cache-control')).toBe('public, max-age=300')
    expect(Buffer.compare(Buffer.from(await r.arrayBuffer()), i.bytes)).toBe(0)
  })
  it('extension that does not match the format, unknown hash or name outside the format: 404', async () => {
    const i = allDemoImages()[0]
    for (const bad of [`${i.hash}.jpg`, `${i.hash}.svg`, `${'0'.repeat(64)}.png`, '..%2F..%2Fetc.png', `${i.hash.toUpperCase()}.png`, i.hash]) {
      expect((await call(bad)).status, bad).toBe(404)
    }
  })
})

describe('what comes from the relay goes through the check', () => {
  const ok = { hash: 'd'.repeat(64), formato: 'webp', largura: 10, altura: 20, alt: ' Um texto. ' }
  it('a valid image passes, with the alt trimmed; imageUrl only builds from the hash', () => {
    expect(sanitizeImage(ok)).toEqual({ ...ok, alt: 'Um texto.' })
    expect(imageUrl({ hash: ok.hash, formato: 'webp' })).toBe(`/midia/${ok.hash}.webp`)
  })
  it('what does not check out becomes null; the list keeps at most 4 and only the good ones', () => {
    for (const bad of [null, 'x', { ...ok, hash: 'z'.repeat(64) }, { ...ok, formato: 'gif' }, { ...ok, largura: 4097 }, { ...ok, altura: 0 }, { ...ok, alt: 'a'.repeat(281) }, { ...ok, alt: 7 }, { ...ok, alt: undefined }, { ...ok, src: 'https://outro.exemplo/x.png', hash: undefined }]) {
      expect(sanitizeImage(bad)).toBeNull()
    }
    // 0.11.0: the alternative text is optional. Empty (or only spaces) passes, as empty: the screen names the image (NetworkImage)
    expect(sanitizeImage({ ...ok, alt: '' })).toEqual({ ...ok, alt: '' })
    expect(sanitizeImage({ ...ok, alt: '   ' })).toEqual({ ...ok, alt: '' })
    expect(sanitizeImages([ok, { ...ok, formato: 'svg' }, ok, ok, ok, ok])).toHaveLength(3)
    expect(sanitizeImages('nada')).toEqual([])
  })
})
