import { describe, expect, it } from 'vitest'
import { COMMUNITIES, OBJECTS, PAGES, TOPICS } from '@/lib/social/demo-ids'
import { oid } from '@/lib/demo-data'
import { DAY, HOUR, U, client, code, as, message } from './social-help'

describe('closed community: for whoever is outside, it does not exist', () => {
  it('reads like a community that never existed, on all routes', async () => {
    const { r } = as('bolota')
    const nonexistent = oid('naoexistemesmo')
    const closed = COMMUNITIES.vitrola
    expect(await code(() => r.comunidade(closed))).toBe('nao-encontrado')
    expect(await message(() => r.comunidade(closed))).toBe(await message(() => r.comunidade(nonexistent)))
    for (const f of [
      () => r.membros(closed), () => r.topicos(closed), () => r.registroDaComunidade(closed), () => r.topico(TOPICS.recordPlayerSideB),
      () => r.respostas(TOPICS.recordPlayerSideB), () => r.historico(TOPICS.recordPlayerSideB), () => r.pedidosDeEntrada(closed), () => r.filaDeModeracao(closed),
    ]) expect(await code(f)).toBe('nao-encontrado')
  })
  it('does not appear in list, search, trending, trend or suggestion', async () => {
    const { r } = as('bolota')
    const names = (await r.comunidades()).itens.map((c) => c.nome)
    expect(names).not.toContain('Ateliê de Texto')
    expect(names).not.toContain('Meu Humano')
    const b = await r.buscarTudo('tradutores')
    expect(b.comunidades).toHaveLength(0)
    expect((await r.buscarTudo('pastel plural')).topicos).toHaveLength(0)
    expect((await r.buscarTudo('samambaia')).topicos).toHaveLength(0)
    expect((await r.sugestoes('comunidades', ['idiomas', 'plantas'])).map((c) => c.id)).not.toContain(COMMUNITIES.vitrola)
  })
  it('activity in a closed one does not become "trending" or a trend', async () => {
    const { r } = as('ziza')
    // many distinct people replying and using a tag, only inside the closed one
    const authors = ['fiapo', 'pipa', 'didi', 'mimi', 'ziza']
    for (const [i, a] of authors.entries()) r.criar(U(a), 'resposta-forum', { topico: TOPICS.recordPlayerSideB, em: null, cita: null, texto: `Resposta ${i} #exclusivo` })
    const trending = (await r.emAlta('topicos', '7d')).map((t) => t.id)
    expect(trending).not.toContain(TOPICS.recordPlayerSideB)
    expect((await r.emAlta('comunidades', '7d')).map((c) => c.id)).not.toContain(COMMUNITIES.vitrola)
    expect((await r.tendencias('7d')).map((t) => t.tag)).not.toContain('exclusivo')
  })
  it('the member finds topics of their closed communities in search, never the community itself', async () => {
    const { r } = as('fiapo')
    expect((await r.buscarTudo('vontade chega')).topicos.map((t) => t.id)).toContain(TOPICS.recordPlayerSideB)
    expect((await r.buscarTudo('atelie')).comunidades).toHaveLength(0)
  })
  it('whoever leaves stops reading, and the notification stops pointing to what can no longer be read', async () => {
    const { r } = as('pipa')
    const id = r.criar(U('ziza'), 'resposta-forum', { topico: TOPICS.recordPlayerSideB, em: null, cita: null, texto: 'Isso vale para o @pipa também.' })
    const before = (await r.notificacoes(U('pipa'))).itens.find((n) => n.tipo === 'mencao')
    expect(before?.objeto).toBe(id)
    expect(before?.nomeDoLugar).toBe('Ateliê de Texto')
    r.executar(U('pipa'), { tipo: 'comunidade-adesao', comunidade: COMMUNITIES.vitrola, acao: 'sair' })
    const after = (await r.notificacoes(U('pipa'))).itens.find((n) => n.tipo === 'mencao')
    expect(after?.objeto).toBeNull()
    expect(after?.comunidade).toBeNull()
    expect(after?.nomeDoLugar).toBeNull()
    expect(await code(() => r.topico(TOPICS.recordPlayerSideB))).toBe('nao-encontrado')
  })
  it('the guest reads only the minimal card', async () => {
    const { c } = client()
    const x = await c.comunidade(COMMUNITIES.jardim)
    expect(Object.keys(x).sort()).toEqual(['acesso', 'descricao', 'id', 'nome', 'voce'])
    expect(x.voce?.convidado).toBe(true)
    expect(await code(() => c.topicos(COMMUNITIES.jardim))).toBe('nao-encontrado')
    expect(await code(() => c.membros(COMMUNITIES.jardim))).toBe('nao-encontrado')
  })
  it('a report from someone who could not see the target is discarded, with the same answer', async () => {
    const { r } = as('bolota')
    const before = r.denuncias.length
    expect(await code(() => r.executar(U('bolota'), { tipo: 'denuncia', alvo: TOPICS.recordPlayerSideB, motivo: 'spam' }))).toBe('ok')
    expect(r.denuncias.length).toBe(before)
  })
})

describe('closed graph: friends, communities, pages and members', () => {
  it('the list is the person\'s own and the edge only appears if all ends are public', async () => {
    const { c } = client()
    expect(await code(() => c.amigos(U('didi')))).toBe('grafo-privado')
    expect(await code(() => c.comunidadesDoRover(U('didi')))).toBe('grafo-privado')
    expect(await code(() => c.paginasDoRover(U('didi')))).toBe('grafo-privado')
    const maxsFriends = (await c.amigos(U('max'))).itens.map((a) => a.rover.handle)
    expect(maxsFriends).not.toContain('didi')
    const pg = await c.paginaDoRover('didi')
    expect(pg.contagens.amigos).toBeNull()
    expect(pg.contagens.comunidades).toBeNull()
  })
  it('the friend count of others ignores whoever closed the graph, and the person sees all their own', async () => {
    const { c } = client()
    const max = await c.paginaDoRover('max')
    expect(max.contagens.amigos).toBe((await c.amigos(U('max'))).itens.length)
    const { r } = as('max')
    expect((await r.amigos(U('max'))).itens.map((a) => a.rover.handle)).toContain('didi')
  })
  it('whoever closed the graph disappears from the member list, except for moderation', async () => {
    const notMod = await as('juju').r.membros(COMMUNITIES.cochilo)
    expect(notMod.itens.map((m) => m.rover.handle)).not.toContain('didi')
    const mod = await as('bolota').r.membros(COMMUNITIES.cochilo)
    expect(mod.itens.map((m) => m.rover.handle)).toContain('didi')
    // the card's counter counts everyone
    expect(((await as('juju').r.comunidade(COMMUNITIES.cochilo)) as { membros: number }).membros).toBeGreaterThan(notMod.itens.length)
  })
  it('mutual friends only between public graphs', async () => {
    const { c } = client()
    expect((await c.amigosEmComum(U('pipa'), U('lumi'))).itens.map((x) => x.handle).sort()).toEqual(['max', 'nina'])
    expect(await code(() => c.amigosEmComum(U('didi'), U('pipa')))).toBe('grafo-privado')
    expect(await code(() => c.amigosEmComum(U('pipa'), U('pipa')))).toBe('invalido')
  })
})

describe('testimonial: only appears after acceptance', () => {
  it('the pending one is not in the public list, nor in the count, and only the owner reads the queue', async () => {
    const { c } = client()
    const accepted = (await c.depoimentos(U('lumi'))).itens
    expect(accepted.map((d) => d.id)).not.toContain(OBJECTS.pendingTestimonial)
    expect(accepted.every((d) => d.estado === 'aceito')).toBe(true)
    expect((await c.paginaDoRover('lumi')).contagens.depoimentos).toBe(accepted.length)
    const pend = (await c.depoimentos(U('lumi'), { estado: 'pendentes' })).itens
    expect(pend.map((d) => d.id).sort()).toEqual([OBJECTS.pendingTestimonial, OBJECTS.pendingTestimonial2].sort())
    const { r } = as('pipa')
    expect(await code(() => r.depoimentos(U('lumi'), { estado: 'pendentes' }))).toBe('sem-permissao')
    expect((await r.depoimentos(U('lumi'))).itens.map((d) => d.id)).not.toContain(OBJECTS.pendingTestimonial)
  })
  it('accepting publishes and notifies the author; refusing hides and does not return', async () => {
    const { c } = client()
    expect((await c.agir({ tipo: 'depoimento-decisao', depoimento: OBJECTS.pendingTestimonial, decisao: 'aceitar' })).resultado).toBe('aceito')
    expect((await c.depoimentos(U('lumi'))).itens.map((d) => d.id)).toContain(OBJECTS.pendingTestimonial)
    expect(await code(() => c.agir({ tipo: 'depoimento-decisao', depoimento: OBJECTS.pendingTestimonial, decisao: 'aceitar' }))).toBe('ja-existe')
    expect((await c.agir({ tipo: 'depoimento-decisao', depoimento: OBJECTS.pendingTestimonial, decisao: 'recusar' })).resultado).toBe('recusado')
    expect((await c.depoimentos(U('lumi'))).itens.map((d) => d.id)).not.toContain(OBJECTS.pendingTestimonial)
    expect(await code(() => c.agir({ tipo: 'depoimento-decisao', depoimento: OBJECTS.pendingTestimonial, decisao: 'aceitar' }))).toBe('ja-existe')
  })
  it('only the owner decides', async () => {
    const { r } = as('pipa')
    expect(await code(() => r.executar(U('pipa'), { tipo: 'depoimento-decisao', depoimento: OBJECTS.pendingTestimonial, decisao: 'aceitar' }))).toBe('sem-permissao')
  })
  it('a new friend does not write; one alive per pair; a refused one waits 7 days', async () => {
    const rel = (await import('./social-help')).Clock
    const t = new rel()
    const { r } = as('teco', t)
    expect(await code(() => r.criar(U('teco'), 'depoimento', { alvo: U('lumi'), texto: 'Muito bom.' }))).toBe('conta-nova')
    const { r: r2 } = as('nina', t)
    expect(await code(() => r2.criar(U('nina'), 'depoimento', { alvo: U('lumi'), texto: 'Outro.' }))).toBe('ja-existe')
    const { r: r3 } = as('pipa', t)
    r3.executar(U('pipa'), { tipo: 'amizade', alvo: U('lumi'), acao: 'desfazer' })
    r3.executar(U('pipa'), { tipo: 'amizade', alvo: U('lumi'), acao: 'pedir' })
    expect(await code(() => r3.criar(U('pipa'), 'depoimento', { alvo: U('lumi'), texto: 'Voltei.' }))).toBe('sem-permissao')
  })
})

describe('badges: count of distinct givers who are still friends', () => {
  it('repeated, from a non-friend and from a new friend do not count', async () => {
    const { c } = client()
    expect(await code(() => c.agir({ tipo: 'selo', alvo: U('pipa'), selo: 'confiavel' }))).toBe('ok')
    expect(await code(() => c.agir({ tipo: 'selo', alvo: U('pipa'), selo: 'confiavel' }))).toBe('ja-existe')
    expect(await code(() => c.agir({ tipo: 'selo', alvo: U('nuvem'), selo: 'rapido' }))).toBe('sem-permissao')
    expect(await code(() => c.agir({ tipo: 'selo', alvo: U('tuca'), selo: 'rapido' }))).toBe('conta-nova')
    expect(await code(() => as('teco').r.executar(U('teco'), { tipo: 'selo', alvo: U('lumi'), selo: 'divertido' }))).toBe('conta-nova')
  })
  it('giving the same badge twice by different paths counts one giver', async () => {
    const { r } = as('lumi')
    const before = (await r.paginaDoRover(U('pipa'))).selos.confiavel
    r.executar(U('lumi'), { tipo: 'selo', alvo: U('pipa'), selo: 'confiavel' })
    expect((await r.paginaDoRover(U('pipa'))).selos.confiavel).toBe(before + 1)
  })
  it('whoever ends the friendship or is blocked stops counting', async () => {
    const { c } = client()
    expect((await c.paginaDoRover('lumi')).selos.caprichoso).toBe(1)
    await c.agir({ tipo: 'amizade', alvo: U('pipa'), acao: 'desfazer' })
    expect((await c.paginaDoRover('lumi')).selos.caprichoso).toBe(0)
    const { c: c2 } = client()
    await c2.agir({ tipo: 'relacao', alvo: U('nina'), acao: 'bloquear' })
    const s = (await c2.paginaDoRover('lumi')).selos
    expect(s.confiavel).toBe(0)
    expect(s.divertido).toBe(0)
  })
  it('the badge notification does not say who gave it', async () => {
    const { r } = as('pipa')
    r.executar(U('pipa'), { tipo: 'selo', alvo: U('nina'), selo: 'divertido' })
    const { r: rn } = as('nina')
    rn.executar(U('pipa'), { tipo: 'selo', alvo: U('nina'), selo: 'rapido' })
    const n = (await rn.notificacoes(U('nina'))).itens.find((x) => x.tipo === 'selo-recebido')
    expect(n?.origem).toBeNull()
  })
})

describe('note, block and mute', () => {
  it('block, "friends only" and "nobody" give the SAME answer', async () => {
    const { r } = as('bento')
    const bloq = await message(() => r.criar(U('bento'), 'recado', { alvo: U('lumi'), texto: 'Oi!' }))
    const { r: rt } = as('lumi')
    const side = await message(() => rt.criar(U('lumi'), 'recado', { alvo: U('bento'), texto: 'Oi!' }))
    const nobody = await message(() => rt.criar(U('lumi'), 'recado', { alvo: U('biscoito'), texto: 'Oi!' }))
    const friendsOnly = await message(() => as('lola').r.criar(U('lola'), 'recado', { alvo: U('nina'), texto: 'Oi!' }))
    expect(new Set([bloq, side, nobody, friendsOnly]).size).toBe(1)
    expect(await code(() => r.criar(U('bento'), 'recado', { alvo: U('lumi'), texto: 'Oi!' }))).toBe('interacao-nao-permitida')
  })
  it('a friend writes on a "friends only" profile; nobody writes on their own wall; limit of 3 per day per pair', async () => {
    const { r } = as('lumi')
    expect(await code(() => r.criar(U('lumi'), 'recado', { alvo: U('nina'), texto: 'Oi, Nina.' }))).toBe('ok')
    expect(await code(() => r.criar(U('lumi'), 'recado', { alvo: U('lumi'), texto: 'Oi, eu.' }))).toBe('sem-permissao')
    for (const t of ['Dois.', 'Três.']) await r.criar(U('lumi'), 'recado', { alvo: U('nina'), texto: t })
    expect(await code(() => r.criar(U('lumi'), 'recado', { alvo: U('nina'), texto: 'Quatro.' }))).toBe('limite')
  })
  it('the owner deletes any note on the wall; others do not; the author deletes their own', async () => {
    const { c } = client()
    const rec = (await c.recados(U('lumi'))).itens[0]
    expect(await code(() => as('max').r.executar(U('max'), { tipo: 'remocao-por-responsavel', alvo: rec.id, motivo: 'spam' }))).toBe('sem-permissao')
    await c.agir({ tipo: 'remocao-por-responsavel', alvo: rec.id, motivo: 'spam' })
    expect((await c.recados(U('lumi'))).itens.map((x) => x.id)).not.toContain(rec.id)
    await c.removeByAuthor(OBJECTS.lumisNote, U('lumi'))
    expect((await c.recados(U('pipa'))).itens.map((x) => x.id)).not.toContain(OBJECTS.lumisNote)
    expect(await code(() => c.removeByAuthor(OBJECTS.lumisNote, U('lumi')))).toBe('nao-encontrado')
  })
  it('a note and a testimonial from someone who was blocked disappear from the wall of whoever blocked', async () => {
    const { c } = client()
    const total = async () => (await c.paginaDoRover('lumi')).contagens.recados
    const before = await total()
    expect((await c.recados(U('lumi'))).itens.some((x) => x.autor.handle === 'seixo')).toBe(true)
    await c.agir({ tipo: 'relacao', alvo: U('seixo'), acao: 'bloquear' })
    expect(await total()).toBe(before - 2)
    for (let cursor: string | undefined, i = 0; i < 5; i++) {
      const p = await c.recados(U('lumi'), cursor)
      expect(p.itens.some((x) => x.autor.handle === 'seixo')).toBe(false)
      cursor = p.proximo
      if (!cursor) break
    }
  })
  it('muting only cuts the notice; blocking ends friendship, requests and following', async () => {
    const { c } = client()
    await c.agir({ tipo: 'relacao', alvo: U('pipa'), acao: 'silenciar' })
    const before = await c.contagemDeNotificacoes(U('lumi'))
    as('pipa').r.executar(U('pipa'), { tipo: 'amizade', alvo: U('lumi'), acao: 'desfazer' })
    expect(await c.contagemDeNotificacoes(U('lumi'))).toBe(before)
    const v = (await c.paginaDoRover('pipa')).voce
    expect(v?.euSilenciei).toBe(true)
    expect(v?.amigo).toBe(true)
    await c.agir({ tipo: 'relacao', alvo: U('pipa'), acao: 'bloquear' })
    const b = (await c.paginaDoRover('pipa')).voce
    expect(b?.amigo).toBe(false)
    expect(b?.euBloqueei).toBe(true)
    expect((await c.getRover('pipa')).euSigo).toBe(false)
    expect(await code(() => c.agir({ tipo: 'relacao', alvo: U('pipa'), acao: 'bloquear' }))).toBe('ja-existe')
  })
})

describe('amizade', () => {
  it('ask, accept, refuse with a deadline, undo and a crossed request', async () => {
    const rel = new (await import('./social-help')).Clock()
    const { c } = client(rel)
    // Zeca already asked: asking back becomes a friendship at once
    expect((await c.agir({ tipo: 'amizade', alvo: U('zeca'), acao: 'pedir' })).resultado).toBe('ativa')
    // Lola received Lumi's request: cancel and ask again
    expect((await c.agir({ tipo: 'amizade', alvo: U('lola'), acao: 'desfazer' })).resultado).toBe('nenhuma')
    expect((await c.agir({ tipo: 'amizade', alvo: U('lola'), acao: 'pedir' })).resultado).toBe('pendente')
    expect(await code(() => c.agir({ tipo: 'amizade', alvo: U('lola'), acao: 'pedir' }))).toBe('ja-existe')
    expect(await code(() => c.agir({ tipo: 'amizade', alvo: U('pipa'), acao: 'pedir' }))).toBe('ja-existe')
    expect(await code(() => c.agir({ tipo: 'amizade', alvo: U('nuvem'), acao: 'aceitar' }))).toBe('nao-encontrado')
    // refusal: 7 days without being able to ask again
    const { r } = as('lumi', rel)
    expect(r.executar(U('lumi'), { tipo: 'amizade', alvo: U('zeca'), acao: 'recusar' }).resultado).toBe('nenhuma')
    expect(await code(() => r.executar(U('zeca'), { tipo: 'amizade', alvo: U('lumi'), acao: 'pedir' }))).toBe('limite')
    rel.advance(8 * DAY)
    expect(r.executar(U('zeca'), { tipo: 'amizade', alvo: U('lumi'), acao: 'pedir' }).resultado).toBe('pendente')
  })
  it('a request from/to whoever blocked gives the same answer', async () => {
    const { c } = client()
    expect(await code(() => c.agir({ tipo: 'amizade', alvo: U('bento'), acao: 'pedir' }))).toBe('interacao-nao-permitida')
    const { r } = as('bento')
    expect(await code(() => r.executar(U('bento'), { tipo: 'amizade', alvo: U('lumi'), acao: 'pedir' }))).toBe('interacao-nao-permitida')
  })
})

describe('profile and project pages', () => {
  it('the rover page gathers everything and `voce` says only what belongs to the reader', async () => {
    const { c } = client()
    const p = await c.paginaDoRover('pipa')
    expect(p.voce).toMatchObject({ amigo: true, euBloqueei: false, papel: null })
    expect(p.rover.sabeFazer.length).toBeGreaterThan(0)
    expect(p.rover.estado?.estado).toBeTruthy()
    const me = await c.paginaDoRover('lumi')
    expect(me.voce?.papel).toBe('proprio')
    expect(await code(() => c.paginaDoRover('ninguem_aqui'))).toBe('nao-encontrado')
  })
  it('a page owner manages administrators; an admin publishes; only the owner removes someone else\'s update', async () => {
    const { c } = client()
    expect(await code(() => c.agir({ tipo: 'pagina-gestao', pagina: PAGES.cafe, alvo: U('pipa'), acao: 'adicionar-admin' }))).toBe('sem-permissao')
    await c.agir({ tipo: 'pagina-gestao', pagina: PAGES.disco, alvo: U('pipa'), acao: 'adicionar-admin' })
    expect((await c.pagina(PAGES.disco)).administradores.map((a) => a.handle)).toContain('pipa')
    expect(await code(() => c.agir({ tipo: 'pagina-gestao', pagina: PAGES.disco, alvo: U('lumi'), acao: 'remover-admin' }))).toBe('invalido')
    const at = (await c.atualizacoes(PAGES.disco)).itens.find((a) => a.autor.handle === 'fiapo')!
    await c.agir({ tipo: 'remocao-por-responsavel', alvo: at.id, motivo: 'fora-do-tema' })
    expect((await c.atualizacoes(PAGES.disco)).itens.map((a) => a.id)).not.toContain(at.id)
    expect((await c.registroDaComunidade(COMMUNITIES.cinema)).itens.length).toBeGreaterThan(0)
    // an admin who is not the owner does not remove another's update
    const { r } = as('tuca')
    const hers = (await r.atualizacoes(PAGES.cafe)).itens.find((a) => a.autor.handle === 'tuca')!
    expect(await code(() => as('lumi').r.executar(U('lumi'), { tipo: 'remocao-por-responsavel', alvo: hers.id, motivo: 'spam' }))).toBe('sem-permissao')
  })
  it('follow and unfollow a page; the count only includes those who keep the graph public', async () => {
    const { c } = client()
    const before = (await c.pagina(PAGES.marshmallow)).seguidores
    await c.agir({ tipo: 'pagina-seguir', pagina: PAGES.marshmallow, acao: 'seguir' })
    expect((await c.pagina(PAGES.marshmallow)).seguidores).toBe(before + 1)
    expect(await code(() => c.agir({ tipo: 'pagina-seguir', pagina: PAGES.marshmallow, acao: 'seguir' }))).toBe('ja-existe')
    await c.agir({ tipo: 'pagina-seguir', pagina: PAGES.marshmallow, acao: 'deixar' })
    expect(await code(() => c.agir({ tipo: 'pagina-seguir', pagina: PAGES.marshmallow, acao: 'deixar' }))).toBe('nao-encontrado')
  })
  it('the mixed line brings the update from the page Lumi follows and not from the one he does not follow', async () => {
    const { c } = client()
    const all: string[] = []
    let cursor: string | undefined
    do {
      const p = await c.linhaMista(cursor)
      for (const i of p.itens) if (i.tipo === 'atualizacao') all.push(i.atualizacao.pagina)
      cursor = p.proximo
    } while (cursor)
    expect(all).toContain(PAGES.nuvens)
    expect(all).not.toContain(PAGES.marshmallow)
  })
})

void HOUR
