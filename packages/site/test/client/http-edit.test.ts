// Protocol 0.11.0 part 2 (`edicao`) seen by the site's HTTP client: an edited post, reply, forum topic and forum reply carry
// `edicao: { id, em, versoes, titulo, texto, tags, adulto }` next to the original envelope. The client shows what it says NOW and
// keeps the mark "edited"; a crooked field is ignored (the original shows, as before 0.11.0). The public history
// (`GET /v1/objetos/:id/edicoes`) is read only when the relay announces `edicao`. And the body the editor signs is always whole.
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HttpClient } from '@/lib/http-client'
import { draftProblem, editBody, readEdit, sameContent } from '@/lib/domain/edit'
import { demoId } from '@/lib/domain/ids'
import { FakeClient } from '@/lib/fake-client'
import { NetworkError } from '@/lib/types'

let server: Server
let base = ''
let requests: string[] = []
let respond: (url: string) => { status?: number; corpo?: unknown } = () => ({})

const uid = (n: string) => demoId('rvr', n)
const ob = (n: string) => demoId('ob', n)
const T0 = 1_793_000_000
const portrait = { corpo: 'bolinha', cor: 'ceu', veste: 'bandana', acessorio: 'chapeu' }
const summary = (n = 'ana') => ({ uid: uid(n), handle: n, nome: n[0].toUpperCase() + n.slice(1), retrato: portrait, especie: 'pessoa' })
const edit = (extra: Record<string, unknown> = {}) => ({ id: ob('ed1'), em: T0 + 600, versoes: 3, titulo: null, texto: 'Texto novo.', tags: [], adulto: false, ...extra })
const item = (id: string, type: 'postagem' | 'resposta', extra: Record<string, unknown> = {}) => ({
  envelope: { objeto: { v: '0.3', id, tipo: type, autor: uid('ana'), criadoEm: T0, corpo: type === 'resposta' ? { texto: 'Original da resposta.', alvo: ob('post') } : { titulo: 'Título velho', texto: 'Original.', topicos: ['velho'] } } },
  autor: summary(),
  contagens: { respostas: 1, reacoes: { curtir: 0, util: 0 } },
  minhaReacao: null,
  ...extra,
})
const resources = (...r: string[]) => ({ corpo: { protocolo: ['0.3'], social: true, recursos: r } })

beforeEach(async () => {
  requests = []
  respond = () => ({})
  server = createServer((req, res) => {
    requests.push(req.url ?? '')
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

describe('an edited item says what it says now', () => {
  it('a post: title, text, topics and 18+ come from `edicao`; the mark keeps the id, the instant and the versions', async () => {
    respond = (url) => {
      if (url === '/v1/info') return resources('lista-completa', 'postagem-detalhe', 'edicao')
      if (url.startsWith(`/v1/postagens/${ob('post')}/respostas`)) return { corpo: { itens: [item(ob('r1'), 'resposta', { edicao: edit({ texto: 'Resposta corrigida.', versoes: 2 }) }), item(ob('r2'), 'resposta')] } }
      if (url === `/v1/postagens/${ob('post')}`) return { corpo: item(ob('post'), 'postagem', { edicao: edit({ titulo: 'Título novo', tags: ['novo', 'folga'], adulto: true }) }) }
      return { status: 404, corpo: { erro: { codigo: 'nao_encontrado' } } }
    }
    const { postagem: post, respostas: replies } = await new HttpClient({ base }).getObject(ob('post'))
    expect(post).toMatchObject({ titulo: 'Título novo', texto: 'Texto novo.', topicos: ['novo', 'folga'], adulto: true })
    expect(post.edited).toEqual({ id: ob('ed1'), em: new Date((T0 + 600) * 1000).toISOString(), versoes: 3 })
    expect(replies[0]).toMatchObject({ texto: 'Resposta corrigida.', edited: { versoes: 2 } })
    expect(replies[0].titulo).toBeUndefined()
    // never edited: the original, and no mark
    expect(replies[1]).toMatchObject({ texto: 'Original da resposta.' })
    expect(replies[1].edited).toBeUndefined()
  })
  it('an edit that took the title and the 18+ mark away takes them away on the screen too', async () => {
    respond = (url) => {
      if (url === '/v1/info') return resources('lista-completa', 'postagem-detalhe', 'edicao')
      if (url === `/v1/postagens/${ob('post')}`) return { corpo: item(ob('post'), 'postagem', { envelope: { objeto: { v: '0.3', id: ob('post'), tipo: 'postagem', autor: uid('ana'), criadoEm: T0, corpo: { titulo: 'Velho', texto: 'Velho.', topicos: [], adulto: true } } }, edicao: edit() }) }
      return { corpo: { itens: [] } }
    }
    const { postagem: post } = await new HttpClient({ base }).getObject(ob('post'))
    expect(post.texto).toBe('Texto novo.')
    expect(post.titulo).toBeUndefined()
    expect(post.adulto).toBeUndefined()
  })
  it('a crooked `edicao` is ignored: the original shows and the page does not break', async () => {
    for (const crooked of [{ ...edit(), id: 'x' }, { ...edit(), em: 'ontem' }, { ...edit(), texto: 7 }, { ...edit(), texto: '   ' }, 'editado', null]) {
      respond = (url) => {
        if (url === '/v1/info') return resources('lista-completa', 'postagem-detalhe', 'edicao')
        if (url === `/v1/postagens/${ob('post')}`) return { corpo: item(ob('post'), 'postagem', { edicao: crooked }) }
        return { corpo: { itens: [] } }
      }
      const { postagem: post } = await new HttpClient({ base }).getObject(ob('post'))
      expect(post.texto).toBe('Original.')
      expect(post.edited).toBeUndefined()
    }
  })
  it('a forum topic keeps the title and text the relay already serves, with the mark; a forum reply reads its text from `edicao`', async () => {
    const T = ob('topico')
    const topic = { id: T, comunidade: ob('com'), comunidadeNome: 'Fotos', categoria: null, titulo: 'Título atual', trecho: 'Atual.', texto: 'Atual.', autor: summary(), criadoEm: T0, atividadeEm: T0, respostas: 1, fixado: false, trancado: false, resolvido: false, tags: [], enquete: null, editado: true, versoes: 2, resolvidoPor: null, edicao: edit({ titulo: 'Título atual', texto: 'Atual.', versoes: 2 }) }
    const fr = { id: ob('fr1'), envelope: { objeto: { v: '0.3', id: ob('fr1'), tipo: 'resposta-forum', autor: uid('ana'), criadoEm: T0, corpo: { topico: T, em: null, cita: null, texto: 'Antes.' } } }, autor: summary(), criadoEm: T0, em: null, cita: null, filhas: 0, resolveu: false, reacoes: { curtir: 0, util: 0 }, edicao: edit({ texto: 'Depois.' }) }
    respond = (url) => {
      if (url === '/v1/info') return resources('edicao')
      if (url.startsWith(`/v1/topicos/${T}/respostas`)) return { corpo: { itens: [fr] } }
      if (url === `/v1/topicos/${T}`) return { corpo: topic }
      return { status: 404, corpo: {} }
    }
    const client = new HttpClient({ base })
    const t = await client.topico(T)
    expect(t).toMatchObject({ titulo: 'Título atual', texto: 'Atual.', edited: { id: ob('ed1'), versoes: 2 } })
    const r = await client.respostas(T)
    expect(r.itens[0]).toMatchObject({ texto: 'Depois.', edited: { versoes: 3 } })
  })
})

describe('the public history', () => {
  const history = {
    alvo: ob('fr1'),
    tipo: 'resposta-forum',
    autor: summary(),
    itens: [
      { versao: 1, id: ob('fr1'), criadoEm: T0, titulo: null, texto: 'Antes.', tags: [], adulto: false, envelope: { objeto: { tipo: 'resposta-forum', corpo: { topico: ob('topico'), texto: 'Antes.' } } } },
      { versao: 2, id: ob('ed1'), criadoEm: T0 + 60, titulo: null, texto: 'Depois.', tags: [], adulto: false, envelope: { objeto: { tipo: 'edicao' } } },
      { versao: 3, id: 'torto', criadoEm: T0 + 120, titulo: null, texto: 'Sem id.', tags: [], adulto: false },
    ],
  }
  it('is read only when the relay announces `edicao`, oldest first, with where the publication lives', async () => {
    respond = (url) => (url === '/v1/info' ? resources('edicao') : url === `/v1/objetos/${ob('fr1')}/edicoes` ? { corpo: history } : { status: 404, corpo: {} })
    const h = await new HttpClient({ base }).edicoes(ob('fr1'))
    expect(h.tipo).toBe('resposta-forum')
    expect(h.dentroDe).toBe(ob('topico'))
    // the crooked version leaves the list instead of taking the page down
    expect(h.itens.map((v) => [v.versao, v.texto])).toEqual([[1, 'Antes.'], [2, 'Depois.']])
    expect(h.itens[1].criadoEm).toBe(new Date((T0 + 60) * 1000).toISOString())
  })
  it('a relay without `edicao` is not even asked: "not found"', async () => {
    respond = (url) => (url === '/v1/info' ? resources('midia-livre') : { corpo: history })
    await expect(new HttpClient({ base }).edicoes(ob('fr1'))).rejects.toMatchObject({ codigo: 'nao-encontrado' })
    expect(requests.some((p) => p.includes('/edicoes'))).toBe(false)
  })
  it('the demonstration has no history and does not break', async () => {
    await expect(new FakeClient().edicoes(ob('fr1'))).rejects.toBeInstanceOf(NetworkError)
    expect(await new FakeClient().suporta('edicao')).toBe(false)
  })
})

describe('the body an edit signs', () => {
  const c = { titulo: '  Novo título ', texto: ' Texto inteiro. ', tags: ['a1', 'b2', 'c3', 'd4'], adulto: true }
  it('is always the whole content, with only what each type takes', () => {
    expect(editBody(ob('p'), 'postagem', c)).toEqual({ alvo: ob('p'), titulo: 'Novo título', texto: 'Texto inteiro.', tags: ['a1', 'b2', 'c3'], adulto: true })
    expect(editBody(ob('p'), 'postagem', { ...c, titulo: '  ', adulto: false })).toEqual({ alvo: ob('p'), titulo: null, texto: 'Texto inteiro.', tags: ['a1', 'b2', 'c3'] })
    expect(editBody(ob('r'), 'resposta', c)).toEqual({ alvo: ob('r'), titulo: null, texto: 'Texto inteiro.', tags: [] })
    expect(editBody(ob('t'), 'topico', c)).toEqual({ alvo: ob('t'), titulo: 'Novo título', texto: 'Texto inteiro.', tags: ['a1', 'b2', 'c3', 'd4'] })
    expect(editBody(ob('f'), 'resposta-forum', c)).toEqual({ alvo: ob('f'), titulo: null, texto: 'Texto inteiro.', tags: [] })
  })
  it('the limits of the target: empty, too long, a topic needs a title of 3 or more', () => {
    expect(draftProblem('resposta', '', '   ')).toBe('empty')
    expect(draftProblem('resposta', '', 'x'.repeat(1001))).toBe('long')
    expect(draftProblem('resposta-forum', '', 'x'.repeat(1001))).toBeNull()
    expect(draftProblem('postagem', '', 'ok')).toBeNull()
    expect(draftProblem('topico', '', 'ok')).toBe('title')
    expect(draftProblem('topico', 'ab', 'ok')).toBe('title')
    expect(draftProblem('topico', 'abc', 'ok')).toBeNull()
  })
  it('the same content twice is "nothing changed"', () => {
    expect(sameContent({ titulo: null, texto: 'a', tags: ['x'], adulto: false }, { titulo: null, texto: 'a', tags: ['x'], adulto: false })).toBe(true)
    expect(sameContent({ titulo: null, texto: 'a', tags: ['x'], adulto: false }, { titulo: null, texto: 'a', tags: ['y'], adulto: false })).toBe(false)
  })
  it('the reader keeps the protocol limits of each type', () => {
    expect(readEdit({ ...edit({ texto: 'x'.repeat(2000) }) }, 'resposta')?.content.texto).toHaveLength(1000)
    expect(readEdit({ ...edit({ titulo: 'Sim', tags: ['ok', 'NAO', 'ok'] }) }, 'resposta')?.content).toMatchObject({ titulo: null, tags: [] })
    expect(readEdit({ ...edit({ tags: ['ok', 'NAO', 'ok', 'b2'] }) }, 'postagem')?.content.tags).toEqual(['ok', 'b2'])
    expect(readEdit({ ...edit({ adulto: true }) }, 'topico')?.content.adulto).toBe(false)
  })
})
