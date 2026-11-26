// Protocol 0.11.0 (`midia-livre`) seen by the site's HTTP client: the relay sends `imagens` (each with the id of its `imagem` object,
// which is what a report targets) and `anexosRemovidos` on a post, on each reply, on a forum topic and on each forum reply. The client
// keeps what conforms, and a relay that does not announce the resource (or sends nothing) leaves every item exactly as it was.
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HttpClient } from '@/lib/http-client'
import { demoId } from '@/lib/domain/ids'

let server: Server
let base = ''
let respond: (url: string) => { status?: number; corpo?: unknown } = () => ({})

const uid = (n: string) => demoId('rvr', n)
const ob = (n: string) => demoId('ob', n)
const T0 = 1_793_000_000
const portrait = { corpo: 'bolinha', cor: 'ceu', veste: 'bandana', acessorio: 'chapeu' }
const summary = (n = 'pipa') => ({ uid: uid(n), handle: n, nome: n[0].toUpperCase() + n.slice(1), retrato: portrait })
const image = (n: number, alt = '') => ({ id: ob(`img${n}`), hash: String(n).repeat(64), formato: 'jpeg', largura: 1200, altura: 800, bytes: 4000, alt, ordem: n })
const clean = (n: number, alt = '') => ({ id: ob(`img${n}`), hash: String(n).repeat(64), formato: 'jpeg', largura: 1200, altura: 800, alt })
const item = (id: string, type: 'postagem' | 'resposta', extra: Record<string, unknown> = {}) => ({
  envelope: { objeto: { v: '0.3', id, tipo: type, autor: uid('pipa'), criadoEm: T0, corpo: type === 'resposta' ? { texto: 'Olha.', alvo: ob('post') } : { texto: 'Fotos da folga.', topicos: [] } } },
  autor: summary(),
  contagens: { respostas: 0, reacoes: { curtir: 0, util: 0 } },
  minhaReacao: null,
  ...extra,
})
const resources = (...r: string[]) => ({ corpo: { protocolo: ['0.3'], social: true, recursos: r } })

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

describe('attachments read from the relay', () => {
  it('`midia-livre` is a resource the client asks about by name', async () => {
    respond = () => resources('midia', 'midia-de-perfil', 'midia-livre')
    expect(await new HttpClient({ base }).suporta('midia-livre')).toBe(true)
    respond = () => resources('midia', 'midia-de-perfil')
    expect(await new HttpClient({ base }).suporta('midia-livre')).toBe(false)
  })
  it('a post and each of its replies carry their images, in order, and how many the moderation removed', async () => {
    respond = (url) => {
      if (url === '/v1/info') return resources('lista-completa', 'postagem-detalhe', 'midia', 'midia-livre')
      if (url.startsWith(`/v1/postagens/${ob('post')}/respostas`)) return { corpo: { itens: [item(ob('r1'), 'resposta', { imagens: [image(3, 'A praça.')] }), item(ob('r2'), 'resposta', { anexosRemovidos: 1 }), item(ob('r3'), 'resposta')] } }
      if (url === `/v1/postagens/${ob('post')}`) return { corpo: item(ob('post'), 'postagem', { imagens: [image(1), image(2, 'Um gato.')], anexosRemovidos: 2 }) }
      return { status: 404, corpo: { erro: { codigo: 'nao_encontrado' } } }
    }
    const { postagem: post, respostas: replies } = await new HttpClient({ base }).getObject(ob('post'))
    expect(post.imagens).toEqual([clean(1), clean(2, 'Um gato.')])
    expect(post.anexosRemovidos).toBe(2)
    expect(replies.map((r) => [r.imagens, r.anexosRemovidos])).toEqual([[[clean(3, 'A praça.')], undefined], [undefined, 1], [undefined, undefined]])
    // a reply with no attachment is the object it always was
    expect('imagens' in replies[2] || 'anexosRemovidos' in replies[2]).toBe(false)
  })
  it('what does not conform is dropped, never shown: an address from outside, a format out of the list, a count that is not a number', async () => {
    respond = (url) => {
      if (url === '/v1/info') return resources('lista-completa', 'postagem-detalhe', 'midia', 'midia-livre')
      if (url.includes('/respostas')) return { corpo: { itens: [] } }
      return { corpo: item(ob('post'), 'postagem', { imagens: [{ ...image(1), hash: 'https://fora.exemplo/x.jpg' }, { ...image(2), formato: 'gif' }, image(3), { ...image(4), id: 'nao-e-id' }], anexosRemovidos: 'muitos' }) }
    }
    const { postagem: post } = await new HttpClient({ base }).getObject(ob('post'))
    // the fourth keeps the picture and loses the id it could not prove: it shows, it just cannot be reported by id
    expect(post.imagens).toEqual([clean(3), { hash: '4'.repeat(64), formato: 'jpeg', largura: 1200, altura: 800, alt: '' }])
    expect(post.anexosRemovidos).toBeUndefined()
  })
  it('a forum topic and each forum reply carry theirs', async () => {
    const T = ob('topico')
    const topic = { id: T, comunidade: ob('com'), comunidadeNome: 'Fotos', categoria: null, titulo: 'Fotos da folga', trecho: 'Olha.', texto: 'Olha.', autor: summary(), criadoEm: T0, atividadeEm: T0, respostas: 2, fixado: false, trancado: false, resolvido: false, tags: [], enquete: null, editado: false, versoes: 1, resolvidoPor: null }
    const fr = (n: string, extra: Record<string, unknown> = {}) => ({ id: ob(n), envelope: { objeto: { v: '0.3', id: ob(n), tipo: 'resposta-forum', autor: uid('pipa'), criadoEm: T0, corpo: { topico: T, texto: 'Aqui.' } } }, autor: summary(), criadoEm: T0, em: null, cita: null, filhas: 0, resolveu: false, reacoes: { curtir: 0, util: 0 }, ...extra })
    respond = (url) => {
      if (url === '/v1/info') return resources('midia', 'midia-livre')
      if (url.startsWith(`/v1/topicos/${T}/respostas`)) return { corpo: { itens: [fr('fr1', { imagens: [image(5)], anexosRemovidos: 1 }), fr('fr2')] } }
      if (url === `/v1/topicos/${T}`) return { corpo: { ...topic, imagens: [image(4, 'O mapa.')], anexosRemovidos: 1 } }
      return { status: 404, corpo: { erro: { codigo: 'nao_encontrado' } } }
    }
    const client = new HttpClient({ base })
    const t = await client.topico(T)
    expect([t.imagens, t.anexosRemovidos]).toEqual([[clean(4, 'O mapa.')], 1])
    const r = await client.respostas(T)
    expect(r.itens.map((x) => [x.imagens, x.anexosRemovidos])).toEqual([[[clean(5)], 1], [undefined, undefined]])
  })
})
