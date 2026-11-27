// Memories (relay `GET /v1/rovers/:uid/lembrancas`, addition of 2026-11-26): the site's client asks the right path, turns each full item into
// the post the screens show (reply included), keeps only the known windows in the agreed order, drops a broken item alone, and reads a 404
// (unknown rover, rover gone, older relay without the route) as "nothing to remember". The fake client computes the same windows.
import { describe, expect, it } from 'vitest'
import { HttpClient } from '@/lib/http-client'
import { FakeClient } from '@/lib/fake-client'
import { demoId } from '@/lib/domain/ids'
import { MEMORY_WINDOWS, groupMemories, memoriesFrom, sanitizeMemories, type RoverMemories } from '@/lib/memories'
import { faceByUid } from '@/lib/domain/expression'
import type { Post } from '@/lib/types'

const uid = (n: string) => demoId('rvr', n)
const ob = (n: string) => demoId('ob', n)
const T0 = 1_900_000_000
const author = { uid: uid('pipa'), handle: 'pipa', nome: 'Pipa', retrato: null, especie: 'rover' }
const item = (id: string, extra: Record<string, unknown> = {}, body: Record<string, unknown> = {}) => ({
  tipo: extra.tipo ?? 'postagem',
  envelope: { objeto: { v: '0.3', tipo: extra.tipo ?? 'postagem', id, autor: author.uid, criadoEm: T0, corpo: { texto: `Texto ${id.slice(-4)}`, topicos: [], ...body } } },
  autor: author,
  pagina: null,
  contagens: { respostas: 1, reacoes: { curtir: 2, util: 0 } },
  minhaReacao: null,
})
const answer = (windows: Record<string, unknown[]>) => ({
  rover: author.uid,
  agora: T0 + 129_600,
  desde: T0,
  janelas: MEMORY_WINDOWS.map((janela) => ({ janela, de: 0, ate: 0, itens: windows[janela] ?? [] })),
})

function client(status: number, body: unknown) {
  const calls: string[] = []
  const buscar = (async (url: string) => {
    calls.push(url)
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
  return { c: new HttpClient({ base: 'http://rele.teste', buscar }), calls }
}

describe('HttpClient.lembrancas', () => {
  it('asks the rover path and maps each window and item, a reply with what it answers', async () => {
    const reply = item(ob('resp'), { tipo: 'resposta' }, { alvo: ob('pai') })
    const { c, calls } = client(200, answer({ ontem: [item(ob('ontem')), reply], 'primeiro-dia': [item(ob('prim'), {}, { titulo: 'Primeiro dia' })] }))
    const r = await c.lembrancas(author.uid)
    expect(calls).toEqual([`http://rele.teste/v1/rovers/${author.uid}/lembrancas`])
    expect(r?.rover).toBe(author.uid)
    expect(r?.janelas.map((w) => w.janela)).toEqual([...MEMORY_WINDOWS])
    expect(r?.janelas[0].itens.map((p) => [p.id, p.tipo, p.respondeA ?? null])).toEqual([[ob('ontem'), 'postagem', null], [ob('resp'), 'resposta', ob('pai')]])
    expect(r?.janelas[0].itens[0]).toMatchObject({ texto: `Texto ${ob('ontem').slice(-4)}`, respostas: 1, autor: { handle: 'pipa', nome: 'Pipa' } })
    expect(r?.janelas[5].itens[0].titulo).toBe('Primeiro dia')
    expect(r?.janelas.slice(1, 5).every((w) => w.itens.length === 0)).toBe(true)
  })
  it('a 404 is null; an invalid uid never leaves the server', async () => {
    const gone = client(404, { erro: { codigo: 'nao_encontrado', mensagem: 'x' } })
    expect(await gone.c.lembrancas(author.uid)).toBeNull()
    const bad = client(200, answer({}))
    expect(await bad.c.lembrancas('../admin')).toBeNull()
    expect(bad.calls).toEqual([])
  })
  it('another relay error goes up (the page then shows the empty state for that rover only)', async () => {
    const { c } = client(503, { erro: { codigo: 'indisponivel', mensagem: 'x' } })
    await expect(c.lembrancas(author.uid)).rejects.toThrow()
  })
})

describe('the answer, checked', () => {
  const toPost = (x: unknown): Post => {
    const o = x as { id?: string }
    if (!o?.id || o.id === 'quebrado') throw new Error('fora do contrato')
    return { id: o.id, tipo: 'postagem', autor: { uid: author.uid, handle: 'pipa', nome: 'Pipa', rosto: faceByUid(author.uid) }, texto: 'x', topicos: [], criadaEm: new Date(T0 * 1000).toISOString(), respostas: 0, reacoes: { curtir: 0, util: 0 } }
  }
  it('unknown and repeated windows are dropped, the order is the agreed one, a broken item goes alone', () => {
    const r = sanitizeMemories({
      rover: author.uid,
      janelas: [
        { janela: 'primeiro-dia', itens: [{ id: 'b' }] },
        { janela: 'amanha', itens: [{ id: 'x' }] },
        { janela: 'ontem', itens: [{ id: 'a' }, { id: 'quebrado' }, 7, { id: 'a' }] },
        { janela: 'ontem', itens: [{ id: 'c' }] },
      ],
    }, toPost)
    expect(r?.janelas.map((w) => w.janela)).toEqual([...MEMORY_WINDOWS])
    expect(r?.janelas[0].itens.map((p) => p.id)).toEqual(['a'])
    expect(r?.janelas[5].itens.map((p) => p.id)).toEqual(['b'])
    expect(sanitizeMemories({ rover: author.uid, janelas: [{ janela: 'ontem', itens: Array.from({ length: 30 }, (_, i) => ({ id: `i${i}` })) }] }, toPost)?.janelas[0].itens).toHaveLength(10)
    for (const bad of [null, {}, { rover: 7, janelas: [] }, { rover: author.uid }, 'x']) expect(sanitizeMemories(bad, toPost)).toBeNull()
  })
  it('the groups follow the window order, skip empty windows, removed or hidden 18+ items and an item seen in another rover', () => {
    const p = (id: string, extra: Partial<Post> = {}) => ({ ...toPost({ id }), ...extra })
    const mem = (rover: string, w: Partial<Record<(typeof MEMORY_WINDOWS)[number], Post[]>>): RoverMemories => ({ rover, janelas: MEMORY_WINDOWS.map((janela) => ({ janela, itens: w[janela] ?? [] })) })
    const groups = groupMemories([
      mem('a', { 'primeiro-dia': [p('a1')], ontem: [p('a2'), p('a3', { removida: true })] }),
      null,
      mem('b', { ontem: [p('b1'), p('a2')], 'um-mes': [p('b2', { adultHidden: true })] }),
    ])
    expect(groups.map((g) => [g.janela, g.itens.map((x) => x.id)])).toEqual([['ontem', ['a2', 'b1']], ['primeiro-dia', ['a1']]])
    expect(groupMemories([null, mem('c', {})])).toEqual([])
  })
})

describe('the fake client, by the same windows', () => {
  it('yesterday, a week ago and the first day only once it is over; nothing from today or from another rover', () => {
    const now = new Date(Date.UTC(2026, 10, 26, 12))
    const at = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString()
    const mk = (id: string, hoursAgo: number, who = author.uid): Post => ({ id, tipo: 'postagem', autor: { uid: who, handle: 'x', nome: 'X', rosto: faceByUid(who) }, texto: id, topicos: [], criadaEm: at(hoursAgo), respostas: 0, reacoes: { curtir: 0, util: 0 } })
    const posts = [mk('hoje', 2), mk('ontem', 36), mk('semana', 7.5 * 24), mk('primeiro', 39 * 24), mk('outro', 36, uid('ana'))]
    const r = memoriesFrom(author.uid, posts, now, new Date(at(39.5 * 24)))
    const ids = Object.fromEntries(r.janelas.map((w) => [w.janela, w.itens.map((x) => x.id)]))
    expect(ids).toEqual({ ontem: ['ontem'], 'uma-semana': ['semana'], 'duas-semanas': [], 'tres-semanas': [], 'um-mes': [], 'primeiro-dia': ['primeiro'] })
    // a rover 10 hours old: its first day is not a memory yet
    expect(memoriesFrom(author.uid, [mk('cedo', 5)], now, new Date(at(10))).janelas.every((w) => w.itens.length === 0)).toBe(true)
  })
  it('FakeClient.lembrancas answers the six windows for a known rover and null for an unknown one', async () => {
    const fake = new FakeClient(() => new Date('2026-11-26T15:00:00.000Z'))
    const someone = (await fake.homeTimeline()).itens[0].autor.uid
    const r = await fake.lembrancas(someone)
    expect(r?.janelas.map((w) => w.janela)).toEqual([...MEMORY_WINDOWS])
    expect(await fake.lembrancas(uid('ninguem'))).toBeNull()
  })
})
