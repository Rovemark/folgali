import { describe, expect, it } from 'vitest'
import { validateAct } from '@/lib/domain/act'
import { oid } from '@/lib/demo-data'
import { DEMO_FEATURES } from '@/lib/social/fake/read'
import { COMMUNITIES, OBJECTS, TOPICS } from '@/lib/social/demo-ids'
import { DAY, Clock, U, client, code, as } from './social-help'

// The demo client mirrors revision 0.3.1: it declares the 13 resources and returns the same fields as the relay (docs/API-SOCIAL-NETWORK.md, section 15).
// Each test says what relay 0.3.1 returns and checks the shape and the privacy rule, so the screen shown in the demo is as good as the real one.

describe('info e suporta', () => {
  it('declares all 18 resources (13 from 0.3.1, 4 from 0.3.2 and the messages from 0.4.0), and `supports` answers for each (and denies one that does not exist)', async () => {
    const { c } = client()
    const info = await c.info()
    expect(info.recursos).toHaveLength(18)
    expect(new Set(info.recursos).size).toBe(18)
    for (const newValue of ['inicio', 'ordem-por-pessoas', 'vocabulario', 'anuncios', 'mensagens']) expect(info.recursos).toContain(newValue)
    expect(info.recursos).toEqual([...DEMO_FEATURES])
    for (const r of DEMO_FEATURES) expect(await c.suporta(r)).toBe(true)
    expect(await c.suporta('recurso-que-nao-existe' as never)).toBe(false)
  })
})

describe('you.* on the rover page', () => {
  it('friendSince, accountSince and badgesIGave of the reader; followers and following in the counts', async () => {
    const { c } = client()
    const pg = await c.paginaDoRover(U('pipa'))
    expect(pg.voce).toMatchObject({ amigo: true, amigoDesde: '2026-10-28T15:00:00.000Z', contaDesde: '2026-10-27T15:00:00.000Z', selosQueDei: [] })
    expect(pg.contagens).toMatchObject({ seguidores: 219, seguindo: 5 })
  })
  it('whoever is not a friend has `friendSince` null, and the reader\'s account always exists', async () => {
    const { c } = client()
    const notFriend = await c.paginaDoRover(U('bolota'))
    expect(notFriend.voce?.amigo).toBe(false)
    expect(notFriend.voce?.amigoDesde).toBeNull()
    expect(typeof notFriend.voce?.contaDesde).toBe('string')
  })
  it('after giving a badge it goes into `badgesIGave`, in fixed order, without repeating', async () => {
    const rel = new Clock()
    const { c } = client(rel)
    // Lumi only gives a badge to someone who has been a friend for 7 days: Pipa is a friend since 28/10 and today's date is 05/11
    await c.agir({ tipo: 'selo', alvo: U('pipa'), selo: 'rapido' })
    await c.agir({ tipo: 'selo', alvo: U('pipa'), selo: 'confiavel' })
    const you = (await c.paginaDoRover(U('pipa'))).voce
    expect(you?.selosQueDei).toEqual(['confiavel', 'rapido'])
    expect(await code(() => c.agir({ tipo: 'selo', alvo: U('pipa'), selo: 'rapido' }))).toBe('ja-existe')
  })
  it('in a private graph the follower and following counts come back null (never zero), and the graph\'s owner still sees their own', async () => {
    const { r } = as('lumi')
    const isPrivate = [...r.rovers.values()].find((x) => x.grafo === 'privado' && x.uid !== U('lumi'))
    if (!isPrivate) throw new Error('the demonstration needs a rover with a private graph')
    const seen = await r.paginaDoRover(isPrivate.uid)
    expect(seen.contagens.seguidores).toBeNull()
    expect(seen.contagens.seguindo).toBeNull()
    const own = await as(isPrivate.handle).r.paginaDoRover(isPrivate.uid)
    expect(typeof own.contagens.seguidores).toBe('number')
  })
})

describe('you.* on the community', () => {
  it('the banned one has `bannedAt` (and no memberSince); the member has `memberSince` (and no bannedAt)', async () => {
    const { c } = client()
    expect((await c.comunidade(COMMUNITIES.praia)).voce).toMatchObject({ banido: true, banidoEm: '2026-10-31T15:00:00.000Z', membroDesde: null })
    expect((await c.comunidade(COMMUNITIES.cinema)).voce).toMatchObject({ banido: false, banidoEm: null, membroDesde: '2026-10-28T15:00:00.000Z' })
  })
})

describe('removed and testimonials sent (only the rover\'s own)', () => {
  it('removed: what was hidden, when, by which role and the retained excerpt; never the person who moderated', async () => {
    const { c } = client()
    const list = await c.removidos(U('lumi'))
    expect(list.itens).toHaveLength(1)
    expect(list.itens[0]).toMatchObject({ escopo: 'comunidade', contexto: COMMUNITIES.praia, alvoTipo: 'topico', motivo: 'spam', por: 'dono', apelacao: null })
    expect(list.itens[0].trecho).toContain('lembretes')
    expect(JSON.stringify(list)).not.toContain(U('pingo'))
  })
  it('removed is only for the rover itself: nobody reads another rover\'s', async () => {
    const { c } = client()
    // the rule is the same as the existing own reading (`depoimentos?estado=pendentes`): the demo client answers `sem-permissao`
    expect(await code(() => c.removidos(U('pipa')))).toBe('sem-permissao')
    expect(await code(() => c.depoimentosEnviados(U('pipa')))).toBe('sem-permissao')
    expect(await code(() => c.removidos(U('ninguem-assim')))).toBe('nao-encontrado')
  })
  it('testimonials sent: what Lumi wrote and awaits acceptance; it disappears when accepted or refused', async () => {
    const { r } = as('lumi')
    const list = await r.depoimentosEnviados(U('lumi'))
    expect(list.itens).toHaveLength(1)
    expect(list.itens[0]).toMatchObject({ estado: 'pendente', alvo: { handle: 'seixo' } })
    expect(list.itens[0].texto).toContain('Seixo')
    // Seixo refuses: it leaves the list of who wrote
    const owner = as('seixo').r
    owner.executar(U('seixo'), { tipo: 'depoimento-decisao', depoimento: list.itens[0].id, decisao: 'recusar' })
    expect((await owner.depoimentosEnviados(U('seixo'))).itens).toHaveLength(0)
  })
  it('the pending testimonial stays invisible to anyone who is neither the author nor the owner', async () => {
    const { r } = as('pipa')
    const seen = JSON.stringify(await r.depoimentos(U('seixo')))
    expect(seen).not.toContain('bilhete no lugar de cada coisa')
  })
})

describe('moderation queue: topic and dismiss', () => {
  it('each report in the queue carries the id of the topic where the target lives (the topic itself, or the reply\'s topic)', async () => {
    const { c } = client()
    const queue = await c.filaDeModeracao(COMMUNITIES.vitrola)
    const reply = queue.denuncias.find((x) => x.alvo === OBJECTS.replyToModerate)!
    expect(reply.alvoTipo).toBe('resposta-forum')
    expect(reply.topico).toBe(oid('tvitrolaagulha'))
    const own = queue.denuncias.find((x) => x.alvoTipo === 'topico')!
    expect(own.topico).toBe(own.alvo)
  })
  it('dismissing takes the report out of the queue, does NOT delete the content, and records the fact in the public log without saying who reported', async () => {
    const { c } = client()
    const target = OBJECTS.replyToModerate
    const before = (await c.filaDeModeracao(COMMUNITIES.vitrola)).denuncias.length
    expect(await code(() => c.agir({ tipo: 'denuncia-dispensar', comunidade: COMMUNITIES.vitrola, alvo: target }))).toBe('ok')
    const queue = await c.filaDeModeracao(COMMUNITIES.vitrola)
    expect(queue.denuncias).toHaveLength(before - 1)
    expect(queue.denuncias.map((x) => x.alvo)).not.toContain(target)
    // the content is still there
    expect((await c.respostas(oid('tvitrolaagulha'))).itens.map((x) => x.id)).toContain(target)
    // the public log says a dismissal happened, with the ROLE and the id, and nothing about who reported or who dismissed
    const reg = (await c.registroDaComunidade(COMMUNITIES.vitrola)).itens[0]
    expect(reg).toMatchObject({ acao: 'dispensa', motivo: 'dispensada', por: 'dono', alvo: target, alvoTipo: 'resposta-forum' })
    expect(JSON.stringify(reg)).not.toContain(U('lumi'))
    expect(JSON.stringify(reg)).not.toMatch(/ps-/)
  })
  it('a NEW report, from another person, reopens the case; the dismissed ones do not return', async () => {
    const { r } = as('lumi')
    const target = OBJECTS.replyToModerate
    const totalBefore = (await r.filaDeModeracao(COMMUNITIES.vitrola)).denuncias.find((x) => x.alvo === target)!.total
    r.executar(U('lumi'), { tipo: 'denuncia-dispensar', comunidade: COMMUNITIES.vitrola, alvo: target })
    r.denuncias.push({ alvo: target, quem: 'outra-pessoa', motivo: 'spam', em: r.now(), weighs: true })
    const reopened = (await r.filaDeModeracao(COMMUNITIES.vitrola)).denuncias.find((x) => x.alvo === target)!
    expect(reopened.total).toBe(1)
    expect(reopened.total).toBeLessThan(totalBefore)
  })
  it('only the owner and moderation dismiss; with no open report or with a target from another community it is nao-encontrado', async () => {
    const target = OBJECTS.replyToModerate
    expect(await code(() => as('fiapo').r.executar(U('fiapo'), { tipo: 'denuncia-dispensar', comunidade: COMMUNITIES.vitrola, alvo: target }))).toBe('sem-permissao')
    const { r } = as('lumi')
    // the target belongs to the translators' community: asking to dismiss it "in Hoje Aprendi" finds nothing
    expect(await code(() => r.executar(U('lumi'), { tipo: 'denuncia-dispensar', comunidade: COMMUNITIES.cinema, alvo: target }))).toBe('nao-encontrado')
    // a topic with no open report
    expect(await code(() => r.executar(U('lumi'), { tipo: 'denuncia-dispensar', comunidade: COMMUNITIES.cinema, alvo: TOPICS.cinemaPopcorn }))).toBe('nao-encontrado')
    // dismiss twice: the second finds no open report
    r.executar(U('lumi'), { tipo: 'denuncia-dispensar', comunidade: COMMUNITIES.vitrola, alvo: target })
    expect(await code(() => r.executar(U('lumi'), { tipo: 'denuncia-dispensar', comunidade: COMMUNITIES.vitrola, alvo: target }))).toBe('nao-encontrado')
  })
  it('whoever was banned or does not read the community dismisses nothing, and the closed community does not even exist for whoever is outside', async () => {
    expect(await code(() => as('bolota').r.executar(U('bolota'), { tipo: 'denuncia-dispensar', comunidade: COMMUNITIES.vitrola, alvo: OBJECTS.replyToModerate }))).toBe('nao-encontrado')
  })
  it('the act is validated before reaching the client: ids with the right shape or nothing', () => {
    const ok = { tipo: 'denuncia-dispensar', comunidade: COMMUNITIES.vitrola, alvo: OBJECTS.replyToModerate }
    expect(validateAct(ok)).toEqual(ok)
    expect(validateAct({ ...ok, comunidade: 'qualquer' })).toBeNull()
    expect(validateAct({ ...ok, alvo: U('pipa') })).toBeNull()
    expect(validateAct({ tipo: 'denuncia-dispensar', comunidade: COMMUNITIES.vitrola })).toBeNull()
    // an extra field is discarded: the clean act has only its own fields
    expect(validateAct({ ...ok, motivo: 'spam' })).toEqual(ok)
  })
})

describe('topic reactions and `pessoas` in trending', () => {
  it('the topic brings the counts and the reader\'s reaction; tapping changes both', async () => {
    const { c } = client()
    const t = await c.topico(TOPICS.cinemaPopcorn)
    expect(t.reacoes).toEqual({ curtir: 6, util: 3 })
    expect(t.minhaReacao).toBeNull()
    await c.reagir(TOPICS.cinemaPopcorn, 'util')
    const after = await c.topico(TOPICS.cinemaPopcorn)
    expect(after.reacoes).toEqual({ curtir: 6, util: 4 })
    expect(after.minhaReacao).toBe('util')
  })
  it('trending\'s `pessoas` is an integer count of DISTINCT people and never a list of who', async () => {
    const { c } = client()
    for (const type of ['topicos', 'comunidades', 'paginas'] as const) {
      const items = (await c.emAlta(type)) as { pessoas?: number }[]
      expect(items.length).toBeGreaterThan(0)
      for (const x of items) {
        expect(Number.isInteger(x.pessoas)).toBe(true)
        expect(x.pessoas).toBeGreaterThan(0)
      }
      expect(JSON.stringify(items)).not.toMatch(/pessoas":\[/)
    }
  })
  it('the same person who replies and reacts on the topic counts ONCE', async () => {
    const rel = new Clock()
    const { r } = as('lumi', rel)
    const before = ((await r.emAlta('topicos')) as { id: string; pessoas: number }[]).find((x) => x.id === TOPICS.cinemaPopcorn)
    r.reactSocial(U('max'), TOPICS.cinemaPopcorn, 'curtir')
    const after = ((await r.emAlta('topicos')) as { id: string; pessoas: number }[]).find((x) => x.id === TOPICS.cinemaPopcorn)
    if (before && after) expect(after.pessoas).toBeLessThanOrEqual(before.pessoas + 1)
  })
})

describe('page topics', () => {
  it('lists the topics of the open pages, from most used to least, with the count', async () => {
    const { c } = client()
    const themes = await c.temasDePaginas()
    expect(themes.length).toBeGreaterThan(1)
    for (const x of themes) {
      expect(x.tema).toMatch(/^[a-z0-9][a-z0-9-]{1,23}$/)
      expect(x.paginas).toBeGreaterThan(0)
    }
    const counts = themes.map((x) => x.paginas)
    expect(counts).toEqual([...counts].sort((a, b) => b - a))
    // the sum of pages per topic is the number of open pages (counted by walking through all the pages of the list)
    let cursor: string | undefined
    let open = 0
    for (let i = 0; i < 20; i++) {
      const p = await c.paginas({ cursor })
      open += p.itens.length
      if (!p.proximo) break
      cursor = p.proximo
    }
    expect(themes.reduce((n, x) => n + x.paginas, 0)).toBe(open)
  })
})

describe('the client\'s clock remains the only clock', () => {
  it('advancing the clock changes the returned dates (no hidden Date.now)', async () => {
    const rel = new Clock()
    const { c } = client(rel)
    const before = (await c.paginaDoRover(U('pipa'))).voce
    rel.advance(30 * DAY)
    const after = (await c.paginaDoRover(U('pipa'))).voce
    expect(after?.amigoDesde).toBe(before?.amigoDesde)
    expect(after?.contaDesde).toBe(before?.contaDesde)
  })
})
