import { describe, expect, it } from 'vitest'
import { COMMUNITIES, TOPICS } from '@/lib/social/demo-ids'
import { DAY, U, client, as } from './social-help'

// The demo client mirrors 0.3.2: order by distinct PEOPLE, vocabulary, marks, announcements and the home panel.

const newTopic = (r: ReturnType<typeof as>['r'], id: string, author: string, at: number) =>
  r.dbTopics.set(id, { id, comunidade: COMMUNITIES.cinema, categoria: null, autor: U(author), em: at, titulo: `T ${id}`, texto: 'corpo', tags: [], fixado: false, trancado: false, enquete: null, resolvidoPor: null, versoes: [{ versao: 1, titulo: 'x', texto: 'x', tags: [], em: at }], reactors: new Map() })
const resp = (r: ReturnType<typeof as>['r'], id: string, topic: string, author: string, at: number, parentId: string | null = null) =>
  r.dbReplies.set(id, { id, topico: topic, autor: U(author), texto: 'r', em: at, parentId, cita: null, reactors: new Map() })
const ids = (l: { itens: { id: string }[] }) => l.itens.map((i) => i.id)
/** All the pages of a topic list (the demo paginates 10 at a time). */
async function all(r: { topicos: (id: string, o: Record<string, unknown>) => Promise<{ itens: { id: string }[]; proximo?: string }> }, o: Record<string, unknown>): Promise<string[]> {
  const out: string[] = []
  let cursor: string | undefined
  do {
    const p = await r.topicos(COMMUNITIES.cinema, { ...o, cursor })
    out.push(...ids(p))
    cursor = p.proximo
  } while (cursor)
  return out
}

describe('order by distinct people', () => {
  it('whoever replies 25 times counts as one person; three people count more, and the list never carries the score', async () => {
    const { r, rel } = as('lumi')
    const now = rel.t
    newTopic(r, 'A', 'seixo', now - 3600_000)
    newTopic(r, 'B', 'seixo', now - 7200_000)
    for (let i = 0; i < 25; i++) resp(r, `a${i}`, 'A', 'nina', now - 3000_000 + i)
    for (const [i, who] of ['pipa', 'max', 'tuca'].entries()) resp(r, `b${i}`, 'B', who, now - 3000_000 + i)
    const l = await all(r, { ordem: 'melhores' })
    expect(l.indexOf('B')).toBeLessThan(l.indexOf('A'))
    expect(JSON.stringify(await r.topicos(COMMUNITIES.cinema, { ordem: 'melhores' }))).not.toMatch(/pontos|nota|score/)
    // by time, A (newer) comes before B
    const rec = await all(r, { ordem: 'recentes' })
    expect(rec.indexOf('A')).toBeLessThan(rec.indexOf('B'))
  })
  it('the author does not score on their own topic, and a new account (under one day) does not score', async () => {
    const { r, rel } = as('lumi')
    newTopic(r, 'S', 'seixo', rel.t - 3600_000)
    for (let i = 0; i < 5; i++) resp(r, `s${i}`, 'S', 'seixo', rel.t - 1000 - i)
    r.rovers.set(U('recem'), { ...r.rovers.get(U('pipa'))!, uid: U('recem'), handle: 'recem', desde: rel.t - 3600_000 })
    resp(r, 'sr', 'S', 'recem', rel.t - 500)
    newTopic(r, 'Z', 'seixo', rel.t - 7200_000)
    resp(r, 'z0', 'Z', 'pipa', rel.t - 400)
    const l = await all(r, { ordem: 'melhores' })
    expect(l.indexOf('Z')).toBeLessThan(l.indexOf('S'))
  })
  it('trending looks only at the window; 7d brings back what passed 24h', async () => {
    const { r, rel } = as('lumi')
    newTopic(r, 'V', 'seixo', rel.t - 5 * DAY)
    for (const [i, q] of ['pipa', 'max', 'tuca'].entries()) resp(r, `v${i}`, 'V', q, rel.t - 4 * DAY + i)
    newTopic(r, 'N', 'seixo', rel.t - 3600_000)
    resp(r, 'n0', 'N', 'pipa', rel.t - 1800_000)
    const m = await all(r, { ordem: 'melhores' })
    expect(m.indexOf('V')).toBeLessThan(m.indexOf('N'))
    const h24 = await all(r, { ordem: 'em-alta' })
    expect(h24.indexOf('N')).toBeLessThan(h24.indexOf('V'))
    const d7 = await all(r, { ordem: 'em-alta', janela: '7d' })
    expect(d7.indexOf('V')).toBeLessThan(d7.indexOf('N'))
  })
  it('pinned only on the first page and score-based pagination does not repeat an item', async () => {
    const { c } = client()
    const p1 = await c.topicos(COMMUNITIES.cinema, { ordem: 'melhores' })
    expect(p1.fixados).toBeDefined()
    if (p1.proximo) {
      const p2 = await c.topicos(COMMUNITIES.cinema, { ordem: 'melhores', cursor: p1.proximo })
      expect(p2.fixados).toBeUndefined()
      expect(ids(p2).filter((x) => ids(p1).includes(x))).toEqual([])
    }
  })
  it('replies: best by the people who replied to them; recent by time; oldest is the default', async () => {
    const { r, rel } = as('lumi')
    newTopic(r, 'R', 'seixo', rel.t - DAY)
    resp(r, 'r1', 'R', 'pipa', rel.t - 5000)
    resp(r, 'r2', 'R', 'max', rel.t - 4000)
    resp(r, 'f1', 'R', 'nina', rel.t - 3000, 'r2')
    resp(r, 'f2', 'R', 'tuca', rel.t - 2000, 'r2')
    expect(ids(await r.respostas('R'))).toEqual(['r1', 'r2'])
    expect(ids(await r.respostas('R', { ordem: 'melhores' }))).toEqual(['r2', 'r1'])
    expect(ids(await r.respostas('R', { ordem: 'recentes' }))).toEqual(['r2', 'r1'])
    expect(ids(await r.respostas('R', { ordem: 'em-alta' }))[0]).toBe('r2')
  })
  it('topic search accepts recent and best without changing the set', async () => {
    const { c } = client()
    const base = ids(await c.buscarTipo('calendario', 'topicos'))
    expect(base.length).toBeGreaterThan(0)
    for (const order of ['recentes', 'melhores', 'em-alta'] as const) expect(ids(await c.buscarTipo('calendario', 'topicos', undefined, { ordem: order })).sort()).toEqual([...base].sort())
  })
})

describe('vocabulary and marks', () => {
  it('Hoje Aprendi defines its own; Motores em Paz uses the default (padrao: true); the mark only appears on the marked topic', async () => {
    const { c } = client()
    const of = await c.comunidade(COMMUNITIES.cinema)
    expect('vocabulario' in of && of.vocabulario!.padrao).toBe(false)
    const rev = await c.comunidade(COMMUNITIES.tabuleiro)
    expect('vocabulario' in rev && rev.vocabulario!.padrao).toBe(true)
    expect('vocabulario' in rev && rev.vocabulario!.status.map((s) => s.chave)).toEqual(['aberto', 'em-andamento', 'fechado'])
    const l = await c.topicos(COMMUNITIES.cinema)
    const popcorn = [...l.itens, ...(l.fixados ?? [])].find((t) => t.id === TOPICS.cinemaPopcorn)
    expect(popcorn?.marcas).toEqual({ etiquetas: ['calendario', 'expediente'], status: 'respondido' })
    expect(l.itens.some((t) => !('marcas' in t))).toBe(true)
  })
  it('filters by status and by label; a key nobody uses gives an empty list', async () => {
    const { c } = client()
    expect(ids(await c.topicos(COMMUNITIES.cinema, { status: 'respondido' }))).toEqual([TOPICS.cinemaPopcorn])
    expect((await c.topicos(COMMUNITIES.cinema, { etiqueta: 'dica' })).itens).toHaveLength(1)
    expect((await c.topicos(COMMUNITIES.cinema, { etiqueta: 'dica', status: 'encerrado' })).itens).toHaveLength(0)
    expect((await c.topicos(COMMUNITIES.cinema, { status: 'inexistente' })).itens).toHaveLength(0)
  })
})

describe('relay announcements and the home panel', () => {
  it('pinned first, then the newest; text only, id in the format', async () => {
    const { c } = client()
    const p = await c.anuncios()
    expect(p.itens.map((a) => a.fixado)).toEqual([true, false])
    for (const a of p.itens) expect(a.id).toMatch(/^an_[A-Za-z0-9_-]{22}$/)
  })
  it('the panel brings only ids, counts and stamps; `since` filters; nobody has text in there', async () => {
    const { c, rel } = client()
    const all = (await c.inicio())!
    expect(all.avisos.total).toBeGreaterThan(0)
    expect(all.anuncios.novos).toBe(2)
    expect(all.atestadoExpiraEm).toBeGreaterThan(all.agora)
    const json = JSON.stringify(all)
    for (const text of ['Como a rede ordena', 'Calendário: pedir', 'Hoje Aprendi']) expect(json).not.toContain(text)
    const after = (await c.inicio(Math.floor(rel.t / 1000) + 10))!
    expect(after.avisos.total).toBe(0)
    expect(after.anuncios).toEqual({ novos: 0, ultimo: null })
    expect(all.moderacao.length).toBeGreaterThan(0)
  })
})
