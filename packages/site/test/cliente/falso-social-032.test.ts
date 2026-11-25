import { describe, expect, it } from 'vitest'
import { COMUNIDADES, TOPICOS } from '@/lib/social/demo-ids'
import { DIA, U, cliente, como } from './ajuda-social'

// O cliente de demonstração espelha a 0.3.2: ordem por PESSOAS distintas, vocabulário, marcas, anúncios e o painel de início.

const novoTopico = (r: ReturnType<typeof como>['r'], id: string, autor: string, em: number) =>
  r.bdTopicos.set(id, { id, comunidade: COMUNIDADES.cinema, categoria: null, autor: U(autor), em, titulo: `T ${id}`, texto: 'corpo', tags: [], fixado: false, trancado: false, enquete: null, resolvidoPor: null, versoes: [{ versao: 1, titulo: 'x', texto: 'x', tags: [], em }], reatores: new Map() })
const resp = (r: ReturnType<typeof como>['r'], id: string, topico: string, autor: string, em: number, paiId: string | null = null) =>
  r.bdRespostas.set(id, { id, topico, autor: U(autor), texto: 'r', em, paiId, cita: null, reatores: new Map() })
const ids = (l: { itens: { id: string }[] }) => l.itens.map((i) => i.id)
/** Todas as páginas de uma lista de tópicos (a demonstração pagina de 10 em 10). */
async function todos(r: { topicos: (id: string, o: Record<string, unknown>) => Promise<{ itens: { id: string }[]; proximo?: string }> }, o: Record<string, unknown>): Promise<string[]> {
  const out: string[] = []
  let cursor: string | undefined
  do {
    const p = await r.topicos(COMUNIDADES.cinema, { ...o, cursor })
    out.push(...ids(p))
    cursor = p.proximo
  } while (cursor)
  return out
}

describe('ordem por pessoas distintas', () => {
  it('quem responde 25 vezes vale uma pessoa; três pessoas valem mais, e a lista nunca traz a nota', async () => {
    const { r, rel } = como('lumi')
    const agora = rel.t
    novoTopico(r, 'A', 'seixo', agora - 3600_000)
    novoTopico(r, 'B', 'seixo', agora - 7200_000)
    for (let i = 0; i < 25; i++) resp(r, `a${i}`, 'A', 'nina', agora - 3000_000 + i)
    for (const [i, quem] of ['pipa', 'max', 'tuca'].entries()) resp(r, `b${i}`, 'B', quem, agora - 3000_000 + i)
    const l = await todos(r, { ordem: 'melhores' })
    expect(l.indexOf('B')).toBeLessThan(l.indexOf('A'))
    expect(JSON.stringify(await r.topicos(COMUNIDADES.cinema, { ordem: 'melhores' }))).not.toMatch(/pontos|nota|score/)
    // por tempo, A (mais novo) vem antes de B
    const rec = await todos(r, { ordem: 'recentes' })
    expect(rec.indexOf('A')).toBeLessThan(rec.indexOf('B'))
  })
  it('o autor não pontua em si mesmo, e conta nova (menos de um dia) não pontua', async () => {
    const { r, rel } = como('lumi')
    novoTopico(r, 'S', 'seixo', rel.t - 3600_000)
    for (let i = 0; i < 5; i++) resp(r, `s${i}`, 'S', 'seixo', rel.t - 1000 - i)
    r.rovers.set(U('recem'), { ...r.rovers.get(U('pipa'))!, uid: U('recem'), handle: 'recem', desde: rel.t - 3600_000 })
    resp(r, 'sr', 'S', 'recem', rel.t - 500)
    novoTopico(r, 'Z', 'seixo', rel.t - 7200_000)
    resp(r, 'z0', 'Z', 'pipa', rel.t - 400)
    const l = await todos(r, { ordem: 'melhores' })
    expect(l.indexOf('Z')).toBeLessThan(l.indexOf('S'))
  })
  it('em-alta olha só a janela; 7d traz de volta o que passou de 24h', async () => {
    const { r, rel } = como('lumi')
    novoTopico(r, 'V', 'seixo', rel.t - 5 * DIA)
    for (const [i, q] of ['pipa', 'max', 'tuca'].entries()) resp(r, `v${i}`, 'V', q, rel.t - 4 * DIA + i)
    novoTopico(r, 'N', 'seixo', rel.t - 3600_000)
    resp(r, 'n0', 'N', 'pipa', rel.t - 1800_000)
    const m = await todos(r, { ordem: 'melhores' })
    expect(m.indexOf('V')).toBeLessThan(m.indexOf('N'))
    const h24 = await todos(r, { ordem: 'em-alta' })
    expect(h24.indexOf('N')).toBeLessThan(h24.indexOf('V'))
    const d7 = await todos(r, { ordem: 'em-alta', janela: '7d' })
    expect(d7.indexOf('V')).toBeLessThan(d7.indexOf('N'))
  })
  it('fixados só na primeira página e a paginação por pontos não repete item', async () => {
    const { c } = cliente()
    const p1 = await c.topicos(COMUNIDADES.cinema, { ordem: 'melhores' })
    expect(p1.fixados).toBeDefined()
    if (p1.proximo) {
      const p2 = await c.topicos(COMUNIDADES.cinema, { ordem: 'melhores', cursor: p1.proximo })
      expect(p2.fixados).toBeUndefined()
      expect(ids(p2).filter((x) => ids(p1).includes(x))).toEqual([])
    }
  })
  it('respostas: melhores pelas pessoas que responderam a elas; recentes por tempo; antigas é o padrão', async () => {
    const { r, rel } = como('lumi')
    novoTopico(r, 'R', 'seixo', rel.t - DIA)
    resp(r, 'r1', 'R', 'pipa', rel.t - 5000)
    resp(r, 'r2', 'R', 'max', rel.t - 4000)
    resp(r, 'f1', 'R', 'nina', rel.t - 3000, 'r2')
    resp(r, 'f2', 'R', 'tuca', rel.t - 2000, 'r2')
    expect(ids(await r.respostas('R'))).toEqual(['r1', 'r2'])
    expect(ids(await r.respostas('R', { ordem: 'melhores' }))).toEqual(['r2', 'r1'])
    expect(ids(await r.respostas('R', { ordem: 'recentes' }))).toEqual(['r2', 'r1'])
    expect(ids(await r.respostas('R', { ordem: 'em-alta' }))[0]).toBe('r2')
  })
  it('busca de tópicos aceita recentes e melhores sem mudar o conjunto', async () => {
    const { c } = cliente()
    const base = ids(await c.buscarTipo('pipoca', 'topicos'))
    expect(base.length).toBeGreaterThan(0)
    for (const ordem of ['recentes', 'melhores', 'em-alta'] as const) expect(ids(await c.buscarTipo('pipoca', 'topicos', undefined, { ordem })).sort()).toEqual([...base].sort())
  })
})

describe('vocabulário e marcas', () => {
  it('o Cinema de Sofá define o seu; o Clube do Tabuleiro usa o padrão (padrao: true); a marca só aparece no tópico marcado', async () => {
    const { c } = cliente()
    const of = await c.comunidade(COMUNIDADES.cinema)
    expect('vocabulario' in of && of.vocabulario!.padrao).toBe(false)
    const rev = await c.comunidade(COMUNIDADES.tabuleiro)
    expect('vocabulario' in rev && rev.vocabulario!.padrao).toBe(true)
    expect('vocabulario' in rev && rev.vocabulario!.status.map((s) => s.chave)).toEqual(['aberto', 'em-andamento', 'fechado'])
    const l = await c.topicos(COMUNIDADES.cinema)
    const pipoca = [...l.itens, ...(l.fixados ?? [])].find((t) => t.id === TOPICOS.cinemaPipoca)
    expect(pipoca?.marcas).toEqual({ etiquetas: ['pipoca', 'sessao'], status: 'respondido' })
    expect(l.itens.some((t) => !('marcas' in t))).toBe(true)
  })
  it('filtra por status e por etiqueta; chave que ninguém usa dá lista vazia', async () => {
    const { c } = cliente()
    expect(ids(await c.topicos(COMUNIDADES.cinema, { status: 'respondido' }))).toEqual([TOPICOS.cinemaPipoca])
    expect((await c.topicos(COMUNIDADES.cinema, { etiqueta: 'indicacao' })).itens).toHaveLength(1)
    expect((await c.topicos(COMUNIDADES.cinema, { etiqueta: 'indicacao', status: 'encerrado' })).itens).toHaveLength(0)
    expect((await c.topicos(COMUNIDADES.cinema, { status: 'inexistente' })).itens).toHaveLength(0)
  })
})

describe('anúncios do relé e painel de início', () => {
  it('fixado primeiro, depois o mais novo; só texto, id no formato', async () => {
    const { c } = cliente()
    const p = await c.anuncios()
    expect(p.itens.map((a) => a.fixado)).toEqual([true, false])
    for (const a of p.itens) expect(a.id).toMatch(/^an_[A-Za-z0-9_-]{22}$/)
  })
  it('o painel traz só ids, contagens e carimbos; `desde` filtra; ninguém tem texto lá dentro', async () => {
    const { c, rel } = cliente()
    const tudo = (await c.inicio())!
    expect(tudo.avisos.total).toBeGreaterThan(0)
    expect(tudo.anuncios.novos).toBe(2)
    expect(tudo.atestadoExpiraEm).toBeGreaterThan(tudo.agora)
    const json = JSON.stringify(tudo)
    for (const texto of ['Como a rede ordena', 'Pipoca de sábado', 'Cinema de Sofá']) expect(json).not.toContain(texto)
    const depois = (await c.inicio(Math.floor(rel.t / 1000) + 10))!
    expect(depois.avisos.total).toBe(0)
    expect(depois.anuncios).toEqual({ novos: 0, ultimo: null })
    expect(tudo.moderacao.length).toBeGreaterThan(0)
  })
})
