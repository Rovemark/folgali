// The relay's short card gains `imagem: { hash, formato }` (2026-11-26) when the rover has an image portrait. The site's client keeps it on
// the author's face (`rosto.imagem`), so every screen that draws a portrait from a card shows the same photo as the profile. A relay from
// before (no field) leaves the face exactly as it was; a crooked field never becomes an address.
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HttpClient } from '@/lib/http-client'
import { demoId } from '@/lib/domain/ids'
import { roverSummary, socialProfile } from '@/lib/social/sanitize-social'
import { sanitizeSummary } from '@/lib/sanitize'
import { sanitizePortraitPhoto } from '@/lib/images'

const uid = (n: string) => demoId('rvr', n)
const ob = (n: string) => demoId('ob', n)
const HASH = 'c3'.repeat(32)
const T0 = 1_793_000_000
const portrait = { corpo: 'bolinha', cor: 'ceu', veste: 'bandana', acessorio: 'chapeu' }
const card = (extra: Record<string, unknown> = {}) => ({ uid: uid('pipa'), handle: 'pipa', nome: 'Pipa', retrato: portrait, especie: 'rover', ...extra })

const CROOKED: unknown[] = [
  { hash: 'javascript:alert(1)', formato: 'png' },
  { hash: `../../v1/admin/${HASH}`, formato: 'png' },
  { hash: HASH.toUpperCase(), formato: 'png' },
  { hash: HASH, formato: 'svg' },
  { hash: HASH, formato: 'png ' },
  { hash: 7, formato: 'png' },
  'https://fora.exemplo/x.png',
  [HASH, 'png'],
  null,
]

describe('the card portrait image, sanitized', () => {
  it('a new relay card keeps only hash and format on the face', () => {
    const s = roverSummary(card({ imagem: { hash: HASH, formato: 'webp', alt: 'ignored', url: 'https://fora.exemplo/x' } }))
    expect(s.rosto.imagem).toEqual({ hash: HASH, formato: 'webp' })
    // the plush fields stay, so a fallback can still draw it
    expect(s.rosto.corpo).toBe('bolinha')
  })
  it('an older relay card (no field) gives the same face as before', () => {
    const s = roverSummary(card())
    expect('imagem' in s.rosto).toBe(false)
    expect(s).toEqual(roverSummary(card({ imagem: undefined })))
  })
  it('what does not conform is dropped', () => {
    for (const bad of CROOKED) {
      expect(sanitizePortraitPhoto(bad), JSON.stringify(bad)).toBeNull()
      expect('imagem' in roverSummary(card({ imagem: bad })).rosto, JSON.stringify(bad)).toBe(false)
    }
  })
  it('the profile carries it from `retratoImagem`, so the paired rover sees its own photo in the menu too', () => {
    const p = socialProfile({ ...card(), descricao: 'Oi.', retratoImagem: { id: ob('img'), hash: HASH, formato: 'png', largura: 512, altura: 512, bytes: 900, alt: '', ordem: null } })
    expect(p.rosto.imagem).toEqual({ hash: HASH, formato: 'png' })
    expect(p.retratoImagem?.hash).toBe(HASH)
  })
  it('the second sanitizing pass (the post author) keeps a valid one and drops a crooked one, also for a person', () => {
    const face = { corpo: 'oval', cor: '#94dcb6', acessorios: [] }
    expect(sanitizeSummary({ uid: uid('pipa'), handle: 'pipa', nome: 'Pipa', rosto: { ...face, imagem: { hash: HASH, formato: 'jpeg' } } }).rosto.imagem).toEqual({ hash: HASH, formato: 'jpeg' })
    expect(sanitizeSummary({ uid: uid('bia'), handle: 'bia', nome: 'Bia', rosto: { corpo: 'pessoa', cor: '#ff9fc4', imagem: { hash: HASH, formato: 'png' } } }).rosto.imagem).toEqual({ hash: HASH, formato: 'png' })
    for (const bad of CROOKED) expect('imagem' in sanitizeSummary({ uid: uid('pipa'), handle: 'pipa', nome: 'Pipa', rosto: { ...face, imagem: bad } }).rosto).toBe(false)
  })
})

let server: Server
let base = ''
let respond: (url: string) => { status?: number; corpo?: unknown } = () => ({})

beforeEach(async () => {
  respond = () => ({})
  server = createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      const r = respond(req.url ?? '')
      res.statusCode = r.status ?? 200
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(r.corpo ?? {}))
    })
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => {
  await new Promise((ok) => server.close(ok))
})

const item = (author: Record<string, unknown>) => ({
  envelope: { objeto: { v: '0.3', id: ob('post'), tipo: 'postagem', autor: uid('pipa'), criadoEm: T0, corpo: { texto: 'Uma folga.', topicos: [] } } },
  autor: author,
  contagens: { respostas: 0, reacoes: { curtir: 0, util: 0 } },
  minhaReacao: null,
})

describe('through the HTTP client', () => {
  const serve = (author: Record<string, unknown>) => (url: string) => {
    if (url === '/v1/info') return { corpo: { protocolo: ['0.3'], social: true, recursos: ['lista-completa', 'postagem-detalhe', 'midia', 'midia-de-perfil'] } }
    if (url.includes('/respostas')) return { corpo: { itens: [] } }
    if (url === `/v1/postagens/${ob('post')}`) return { corpo: item(author) }
    return { status: 404, corpo: { erro: { codigo: 'nao_encontrado' } } }
  }
  it('new relay: the post author has the photo', async () => {
    respond = serve(card({ imagem: { hash: HASH, formato: 'png' } }))
    const { postagem: post } = await new HttpClient({ base }).getObject(ob('post'))
    expect(post.autor.rosto.imagem).toEqual({ hash: HASH, formato: 'png' })
  })
  it('old relay: the post author is the plush, with no photo field', async () => {
    respond = serve(card())
    const { postagem: post } = await new HttpClient({ base }).getObject(ob('post'))
    expect('imagem' in post.autor.rosto).toBe(false)
  })
})
