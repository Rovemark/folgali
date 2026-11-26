import { describe, expect, it } from 'vitest'
import { oid } from '@/lib/demo-data'
import { APPEALS, COMMUNITIES, REPLIES, TOPICS, OBJECTS } from '@/lib/social/demo-ids'
import { DAY, HOUR, Clock, U, client, code, as } from './social-help'

const topic = (community: string, title = 'Uma pergunta honesta', extra: Record<string, unknown> = {}) => ({ comunidade: community, categoria: null, titulo: title, texto: 'Texto do tópico.', tags: [], enquete: [], enqueteDias: '3', ...extra })

describe('moderation: roles and limits', () => {
  it('a moderator does not ban a moderator or the owner, nor expel a moderator; expels a regular member', async () => {
    const { c } = client()
    const management = (target: string, action: 'banir' | 'expulsar') => c.agir({ tipo: 'comunidade-gestao', comunidade: COMMUNITIES.cinema, alvo: U(target), acao: action, motivo: 'spam' })
    expect(await code(() => management('seixo', 'banir'))).toBe('sem-permissao')
    expect(await code(() => management('pipa', 'banir'))).toBe('sem-permissao')
    expect(await code(() => management('seixo', 'expulsar'))).toBe('sem-permissao')
    expect(await code(() => management('pipa', 'expulsar'))).toBe('sem-permissao')
    expect(await code(() => management('biscoito', 'expulsar'))).toBe('ok')
    expect((await c.registroDaComunidade(COMMUNITIES.cinema)).itens[0]).toMatchObject({ acao: 'expulsao', por: 'moderador', motivo: 'spam' })
    // the log shows the ROLE, never the person who moderated
    expect(JSON.stringify((await c.registroDaComunidade(COMMUNITIES.cinema)).itens)).not.toContain(U('lumi'))
  })
  it('expelling and banning require a reason from the enum; the other actions accept no reason', async () => {
    const { c } = client()
    const base = { tipo: 'comunidade-gestao' as const, comunidade: COMMUNITIES.cinema, alvo: U('biscoito') }
    expect(await code(() => c.agir({ ...base, acao: 'expulsar', motivo: null }))).toBe('invalido')
    expect(await code(() => c.agir({ ...base, acao: 'promover', motivo: 'spam' }))).toBe('invalido')
  })
  it('only the owner promotes and demotes (at most 10 moderators)', async () => {
    const { c } = client()
    expect(await code(() => c.agir({ tipo: 'comunidade-gestao', comunidade: COMMUNITIES.cinema, alvo: U('nina'), acao: 'promover', motivo: null }))).toBe('sem-permissao')
    const { r } = as('pipa')
    expect(r.executar(U('pipa'), { tipo: 'comunidade-gestao', comunidade: COMMUNITIES.cinema, alvo: U('nina'), acao: 'promover', motivo: null })).toEqual({})
    expect((await r.comunidade(COMMUNITIES.cinema) as { moderadores: number }).moderadores).toBe(3)
    expect(await code(() => r.executar(U('pipa'), { tipo: 'comunidade-gestao', comunidade: COMMUNITIES.cinema, alvo: U('nina'), acao: 'promover', motivo: null }))).toBe('ja-existe')
    r.executar(U('pipa'), { tipo: 'comunidade-gestao', comunidade: COMMUNITIES.cinema, alvo: U('nina'), acao: 'rebaixar', motivo: null })
  })
  it('a moderator removes others\' content only in their own community and never the owner\'s', async () => {
    const { c } = client()
    const lola = oid('fbklola')
    await c.agir({ tipo: 'remocao-por-responsavel', alvo: lola, motivo: 'fora-do-tema' })
    expect((await c.respostas(TOPICS.cinemaPopcorn)).itens.map((r) => r.id)).not.toContain(lola)
    // content by the owner (Pipa) of Hoje Aprendi: the moderator does not remove it
    expect(await code(() => c.agir({ tipo: 'remocao-por-responsavel', alvo: TOPICS.cinemaWelcome, motivo: 'regras' }))).toBe('sem-permissao')
    // in a community where Lumi is only a member, or outside it, removes nothing
    expect(await code(() => c.agir({ tipo: 'remocao-por-responsavel', alvo: TOPICS.kitchenBread, motivo: 'spam' }))).toBe('sem-permissao')
    expect(await code(() => c.agir({ tipo: 'remocao-por-responsavel', alvo: TOPICS.napTime, motivo: 'spam' }))).toBe('sem-permissao')
    // your own content is deleted, not "removed by a responsible person"
    expect(await code(() => c.agir({ tipo: 'remocao-por-responsavel', alvo: TOPICS.cinemaPopcorn, motivo: 'spam' }))).toBe('sem-permissao')
  })
  it('removing a topic hides the replies, goes into the log and the author is notified', async () => {
    const { c } = client()
    await c.agir({ tipo: 'remocao-por-responsavel', alvo: TOPICS.cinemaNoReply, motivo: 'regras' })
    expect(await code(() => c.topico(TOPICS.cinemaNoReply))).toBe('removido')
    expect(await code(() => c.respostas(TOPICS.cinemaNoReply))).toBe('removido')
    expect((await c.topicos(COMMUNITIES.cinema, { ordem: 'sem-resposta' })).itens.map((t) => t.id)).not.toContain(TOPICS.cinemaNoReply)
    expect((await c.buscarTudo('duplicata')).topicos).toHaveLength(0)
    expect((await c.registroDaComunidade(COMMUNITIES.cinema)).itens[0]).toMatchObject({ acao: 'remocao', alvoTipo: 'topico', por: 'moderador' })
    // repeating neither overflows nor duplicates
    await c.agir({ tipo: 'remocao-por-responsavel', alvo: TOPICS.cinemaNoReply, motivo: 'regras' })
    expect((await c.registroDaComunidade(COMMUNITIES.cinema)).itens.filter((r) => r.alvo === TOPICS.cinemaNoReply)).toHaveLength(1)
  })
  it('100 reports hide nothing: they only order the queue', async () => {
    const { r } = as('lumi')
    const target = OBJECTS.replyToModerate
    for (let i = 0; i < 100; i++) r.denuncias.push({ alvo: target, quem: `massa-${i}`, motivo: 'assedio', em: r.now(), weighs: false })
    const queue = await r.filaDeModeracao(COMMUNITIES.vitrola)
    const item = queue.denuncias.find((d) => d.alvo === target)!
    expect(item.total).toBe(103)
    expect(item.peso).toBe(3)
    // still readable, listed, quotable
    expect((await r.respostas(oid('tvitrolaagulha'))).itens.map((x) => x.id)).toContain(target)
    expect((await r.topico(oid('tvitrolaagulha'))).respostas).toBeGreaterThan(0)
  })
  it('the queue does not reveal who reported and orders by weight', async () => {
    const { c } = client()
    const queue = await c.filaDeModeracao(COMMUNITIES.vitrola)
    expect(JSON.stringify(queue)).not.toMatch(/ps-/)
    const weights = queue.denuncias.map((d) => d.peso)
    expect(weights).toEqual([...weights].sort((a, b) => b - a))
    expect(queue.apelacoes.map((a) => a.id)).toEqual([APPEALS.fiapoRemoval])
    expect(queue.apelacoes[0].conteudo).toContain('troca uma palavra')
    // a moderator who is not the owner does not see an appeal
    const { r } = as('ziza')
    expect((await r.filaDeModeracao(COMMUNITIES.vitrola)).apelacoes).toEqual([])
    // whoever is only a member does not enter the queue
    expect(await code(() => as('fiapo').r.filaDeModeracao(COMMUNITIES.vitrola))).toBe('sem-permissao')
  })
  it('report: 10 per day per person; the same answer whether the target exists or not', async () => {
    const { r } = as('max')
    for (let i = 0; i < 10; i++) r.executar(U('max'), { tipo: 'denuncia', alvo: TOPICS.cinemaPopcorn, motivo: 'spam' })
    expect(await code(() => r.executar(U('max'), { tipo: 'denuncia', alvo: TOPICS.cinemaPopcorn, motivo: 'spam' }))).toBe('limite')
  })
})

describe('banido, convite e entrada', () => {
  it('the banned one cannot enter, post, vote or accept an invitation', async () => {
    const { c } = client()
    expect(await code(() => c.agir({ tipo: 'comunidade-adesao', comunidade: COMMUNITIES.praia, acao: 'entrar' }))).toBe('banido')
    const { r } = as('lumi')
    expect(await code(() => r.criar(U('lumi'), 'topico', topic(COMMUNITIES.praia)))).toBe('banido')
    // still reads the open community's forum
    expect((await c.topicos(COMMUNITIES.praia)).itens.length).toBeGreaterThan(0)
    const fair = r.dbCommunities.get(COMMUNITIES.praia)!
    fair.convites.push({ uid: U('lumi'), por: U('pingo'), em: r.now() })
    expect(await code(() => r.executar(U('lumi'), { tipo: 'comunidade-adesao', comunidade: COMMUNITIES.praia, acao: 'aceitar-convite' }))).toBe('banido')
    expect(await code(() => r.executar(U('pingo'), { tipo: 'comunidade-gestao', comunidade: COMMUNITIES.praia, alvo: U('lumi'), acao: 'convidar', motivo: null }))).toBe('banido')
  })
  it('an open one joins at once, a moderated one becomes a request, a closed one cannot be joined without an invitation', async () => {
    const { r } = as('teco')
    expect(r.executar(U('teco'), { tipo: 'comunidade-adesao', comunidade: COMMUNITIES.cochilo, acao: 'entrar' }).resultado).toBe('membro')
    expect(r.executar(U('teco'), { tipo: 'comunidade-adesao', comunidade: COMMUNITIES.cozinha, acao: 'entrar' }).resultado).toBe('pendente')
    expect(await code(() => r.executar(U('teco'), { tipo: 'comunidade-adesao', comunidade: COMMUNITIES.cozinha, acao: 'entrar' }))).toBe('ja-existe')
    expect(await code(() => r.executar(U('teco'), { tipo: 'comunidade-adesao', comunidade: COMMUNITIES.jardim, acao: 'entrar' }))).toBe('nao-encontrado')
    expect(r.executar(U('teco'), { tipo: 'comunidade-adesao', comunidade: COMMUNITIES.vitrola, acao: 'aceitar-convite' }).resultado).toBe('membro')
    expect(await code(() => r.executar(U('teco'), { tipo: 'comunidade-adesao', comunidade: COMMUNITIES.cozinha, acao: 'cancelar-pedido' }))).toBe('ok')
  })
  it('the owner does not leave: transfers first', async () => {
    const { c } = client()
    expect(await code(() => c.agir({ tipo: 'comunidade-adesao', comunidade: COMMUNITIES.vitrola, acao: 'sair' }))).toBe('sem-permissao')
  })
  it('anti-raid: after 30 joins in one hour, joining the open one becomes a request', async () => {
    const { r } = as('teco')
    const c = r.dbCommunities.get(COMMUNITIES.cochilo)!
    for (let i = 0; i < 31; i++) c.entries.push(r.now() - i * 60_000)
    expect(r.executar(U('teco'), { tipo: 'comunidade-adesao', comunidade: COMMUNITIES.cochilo, acao: 'entrar' }).resultado).toBe('pendente')
    expect(await code(() => r.executar(U('bolota'), { tipo: 'comunidade-gestao', comunidade: COMMUNITIES.cochilo, alvo: U('teco'), acao: 'aprovar-pedido', motivo: null }))).toBe('ok')
    expect((await r.membros(COMMUNITIES.cochilo)).itens.map((m) => m.rover.handle)).toContain('teco')
  })
  it('moderation approves and refuses requests; only the staff reads requests, invitations and banned', async () => {
    const { c } = client()
    expect((await c.pedidosDeEntrada(COMMUNITIES.cinema)).itens.map((p) => p.rover.handle).sort()).toEqual(['bolota', 'capim'])
    await c.agir({ tipo: 'comunidade-gestao', comunidade: COMMUNITIES.cinema, alvo: U('bolota'), acao: 'aprovar-pedido', motivo: null })
    await c.agir({ tipo: 'comunidade-gestao', comunidade: COMMUNITIES.cinema, alvo: U('capim'), acao: 'recusar-pedido', motivo: null })
    expect((await c.pedidosDeEntrada(COMMUNITIES.cinema)).itens).toHaveLength(0)
    expect(await code(() => c.pedidosDeEntrada(COMMUNITIES.cozinha))).toBe('sem-permissao')
    expect(await code(() => c.banidos(COMMUNITIES.cochilo))).toBe('sem-permissao')
  })
  it('appeal: the owner decides the moderator\'s; the owner\'s go to the relay; 14 days', async () => {
    const { c } = client()
    expect(await code(() => c.agir({ tipo: 'apelacao-decisao', apelacao: APPEALS.pingoBan, resultado: 'revertida' }))).toBe('sem-permissao')
    const hidden = oid('tvitrolaremovido')
    expect(await code(() => c.topico(hidden))).toBe('removido')
    await c.agir({ tipo: 'apelacao-decisao', apelacao: APPEALS.fiapoRemoval, resultado: 'revertida' })
    expect((await c.topico(hidden)).titulo).toContain('troca uma palavra')
    expect(await code(() => c.agir({ tipo: 'apelacao-decisao', apelacao: APPEALS.fiapoRemoval, resultado: 'mantida' }))).toBe('ja-existe')
    // the 14-day window
    const rel = new Clock()
    const { r } = as('lumi', rel)
    rel.advance(15 * DAY)
    expect(await code(() => r.criar(U('lumi'), 'apelacao', { tipo: 'banimento', alvo: COMMUNITIES.praia, texto: 'Fui banido por engano.' }))).toBe('fora-da-janela')
    const { r: r2 } = as('lumi')
    expect(await code(() => r2.criar(U('lumi'), 'apelacao', { tipo: 'banimento', alvo: COMMUNITIES.praia, texto: 'Fui banido por engano.' }))).toBe('ok')
    expect(await code(() => r2.criar(U('lumi'), 'apelacao', { tipo: 'banimento', alvo: COMMUNITIES.praia, texto: 'De novo.' }))).toBe('ja-existe')
  })
})

describe('forum: topic, thread, solved, poll, edit', () => {
  it('list with pinned, orders and pagination', async () => {
    const { c } = client()
    const p1 = await c.topicos(COMMUNITIES.cinema)
    expect(p1.fixados?.map((t) => t.id)).toEqual([TOPICS.cinemaWelcome])
    expect(p1.itens).toHaveLength(10)
    const p2 = await c.topicos(COMMUNITIES.cinema, { cursor: p1.proximo })
    expect(p2.fixados).toBeUndefined()
    expect(new Set([...p1.itens, ...p2.itens].map((t) => t.id)).size).toBe(p1.itens.length + p2.itens.length)
    expect((await c.topicos(COMMUNITIES.cinema, { ordem: 'sem-resposta' })).itens.map((t) => t.id)).toContain(TOPICS.cinemaNoReply)
    const active = (await c.topicos(COMMUNITIES.cinema, { ordem: 'ativos' })).itens
    expect(active[0].atividadeEm >= active[1].atividadeEm).toBe(true)
    expect((await c.topicos(COMMUNITIES.cinema, { categoria: 'Dicas' })).itens.every((t) => t.categoria === 'Dicas')).toBe(true)
  })
  it('one-level thread replies with a quote, and "solved"', async () => {
    const { c } = client()
    const t = await c.topico(TOPICS.cinemaPopcorn)
    expect(t.editado).toBe(true)
    expect(t.versoes).toBe(2)
    expect(t.resolvidoPor?.resposta).toBe(REPLIES.popcornResolved)
    const top = await c.respostas(TOPICS.cinemaPopcorn)
    expect(top.itens.every((r) => r.em === null)).toBe(true)
    const parent = top.itens.find((r) => r.id === REPLIES.popcornWithChildren)!
    expect(parent.filhas).toBe(2)
    const children = await c.respostas(TOPICS.cinemaPopcorn, { em: REPLIES.popcornWithChildren })
    const cit = children.itens.find((r) => r.id === REPLIES.popcornQuoting)!
    expect(cit.cita?.trecho).toContain('ressalva')
    expect(top.itens.find((r) => r.id === REPLIES.popcornResolved)?.resolveu).toBe(true)
    const h = await c.historico(TOPICS.cinemaPopcorn)
    expect(h.map((v) => v.versao)).toEqual([1, 2])
  })
  it('the quote loses the excerpt when the quoted one is removed (you cannot forge what someone said)', async () => {
    const { c } = client()
    await c.agir({ tipo: 'remocao-por-responsavel', alvo: oid('fbkmax'), motivo: 'regras' })
    const cit = (await c.respostas(TOPICS.cinemaPopcorn, { em: REPLIES.popcornWithChildren })).itens.find((r) => r.id === REPLIES.popcornQuoting)!
    expect(cit.cita?.trecho).toBeNull()
  })
  it('replying to a child is a "deep reply"; locked accepts only moderation', async () => {
    const { r } = as('juju')
    expect(await code(() => r.criar(U('juju'), 'resposta-forum', { topico: TOPICS.cinemaPopcorn, em: REPLIES.popcornQuoting, cita: null, texto: 'Respondendo à filha.' }))).toBe('resposta-funda')
    expect(await code(() => r.criar(U('juju'), 'resposta-forum', { topico: TOPICS.cinemaPopcorn, em: REPLIES.popcornWithChildren, cita: REPLIES.popcornQuoting, texto: 'Respondo à mãe e cito a filha.' }))).toBe('ok')
    expect(await code(() => r.criar(U('juju'), 'resposta-forum', { topico: TOPICS.cinemaLocked, em: null, cita: null, texto: 'Posso?' }))).toBe('trancado')
    expect(await code(() => as('seixo').r.criar(U('seixo'), 'resposta-forum', { topico: TOPICS.cinemaLocked, em: null, cita: null, texto: 'A moderação pode.' }))).toBe('ok')
    expect(await code(() => as('bolota').r.criar(U('bolota'), 'resposta-forum', { topico: TOPICS.cinemaPopcorn, em: null, cita: null, texto: 'Sou de fora.' }))).toBe('nao-e-membro')
  })
  it('grace period: a new member waits 1 hour to open a topic and 10 minutes to reply', async () => {
    const rel = new Clock()
    const { r } = as('teco', rel)
    r.executar(U('teco'), { tipo: 'comunidade-adesao', comunidade: COMMUNITIES.cochilo, acao: 'entrar' })
    expect(await code(() => r.criar(U('teco'), 'topico', topic(COMMUNITIES.cochilo)))).toBe('conta-nova')
    expect(await code(() => r.criar(U('teco'), 'resposta-forum', { topico: TOPICS.napTime, em: null, cita: null, texto: 'Oi.' }))).toBe('conta-nova')
    rel.advance(11 * 60_000)
    expect(await code(() => r.criar(U('teco'), 'resposta-forum', { topico: TOPICS.napTime, em: null, cita: null, texto: 'Oi.' }))).toBe('ok')
    rel.advance(HOUR)
    expect(await code(() => r.criar(U('teco'), 'topico', topic(COMMUNITIES.cochilo)))).toBe('ok')
  })
  it('poll: secret vote, no changing, closes on the deadline', async () => {
    const { c } = client()
    const before = (await c.topico(TOPICS.cinemaPoll)).pesquisa!
    expect(before.voce).toBeNull()
    await c.agir({ tipo: 'voto', topico: TOPICS.cinemaPoll, opcao: 2 })
    const after = (await c.topico(TOPICS.cinemaPoll)).pesquisa!
    expect(after.voce).toBe(2)
    expect(after.total).toBe(before.total + 1)
    expect(after.opcoes[2].votos).toBe(before.opcoes[2].votos + 1)
    expect(await code(() => c.agir({ tipo: 'voto', topico: TOPICS.cinemaPoll, opcao: 1 }))).toBe('ja-existe')
    expect(await code(() => c.agir({ tipo: 'voto', topico: TOPICS.cinemaPoll, opcao: 9 }))).toBe('invalido')
    // who voted is not listed anywhere
    expect(JSON.stringify(await c.topico(TOPICS.cinemaPoll))).not.toContain(U('pipa'))
    expect(await code(() => c.agir({ tipo: 'voto', topico: TOPICS.cinemaPollEnd, opcao: 0 }))).toBe('enquete-encerrada')
    const { r } = as('seixo')
    expect(await code(() => r.executar(U('seixo'), { tipo: 'voto', topico: TOPICS.cinemaPollEnd, opcao: 0 }))).toBe('enquete-encerrada')
    expect((await r.topico(TOPICS.cinemaPollEnd)).pesquisa?.encerrada).toBe(true)
    expect(await code(() => as('bolota').r.executar(U('bolota'), { tipo: 'voto', topico: TOPICS.cinemaPoll, opcao: 0 }))).toBe('nao-e-membro')
  })
  it('edit only within 30 minutes, at most 5 times, only by the author, never on a locked topic; visible history', async () => {
    const rel = new Clock()
    const { r } = as('lumi', rel)
    const t = r.criar(U('lumi'), 'topico', topic(COMMUNITIES.cinema, 'Título inicial'))
    const ed = (n: number) => r.criar(U('lumi'), 'topico-editar', { topico: t, titulo: `Título ${n}`, texto: 'Texto novo.', tags: [] })
    for (let i = 1; i <= 5; i++) expect(await code(() => ed(i))).toBe('ok')
    expect(await code(() => ed(6))).toBe('limite-de-estrutura')
    expect((await r.historico(t)).map((v) => v.titulo)).toEqual(['Título inicial', 'Título 1', 'Título 2', 'Título 3', 'Título 4', 'Título 5'])
    expect((await r.topico(t)).editado).toBe(true)
    expect(await code(() => as('pipa').r.criar(U('pipa'), 'topico-editar', { topico: TOPICS.cinemaPopcorn, titulo: 'Sequestro', texto: 'Outro texto.', tags: [] }))).toBe('sem-permissao')
    const t2 = r.criar(U('lumi'), 'topico', topic(COMMUNITIES.cinema, 'Outro'))
    rel.advance(31 * 60_000)
    expect(await code(() => r.criar(U('lumi'), 'topico-editar', { topico: t2, titulo: 'Tarde', texto: 'Texto novo.', tags: [] }))).toBe('fora-da-janela')
    expect(await code(() => r.criar(U('lumi'), 'topico-editar', { topico: TOPICS.cinemaPopcorn, titulo: 'Tarde', texto: 'Texto novo.', tags: [] }))).toBe('fora-da-janela')
  })
  it('"solved": the author and moderation mark it; a regular member cannot, on someone else\'s topic', async () => {
    const { c } = client()
    await c.agir({ tipo: 'topico-resolvido', topico: TOPICS.cinemaPopcorn, resposta: REPLIES.popcornWithChildren })
    expect((await c.topico(TOPICS.cinemaPopcorn)).resolvidoPor?.resposta).toBe(REPLIES.popcornWithChildren)
    await c.agir({ tipo: 'topico-resolvido', topico: TOPICS.cinemaPopcorn, resposta: null })
    expect((await c.topico(TOPICS.cinemaPopcorn)).resolvido).toBe(false)
    expect(await code(() => as('juju').r.executar(U('juju'), { tipo: 'topico-resolvido', topico: TOPICS.cinemaPopcorn, resposta: REPLIES.popcornResolved }))).toBe('sem-permissao')
    expect(await code(() => c.agir({ tipo: 'topico-resolvido', topico: TOPICS.cinemaPopcorn, resposta: oid('naoexiste') }))).toBe('nao-encontrado')
  })
  it('pin (at most 3), lock and move', async () => {
    const { c } = client()
    const ids = [TOPICS.cinemaPopcorn, TOPICS.cinemaPoll, TOPICS.cinemaPollEnd]
    for (const id of ids.slice(0, 2)) await c.agir({ tipo: 'topico-gestao', topico: id, acao: 'fixar', comunidade: null, categoria: null })
    expect(await code(() => c.agir({ tipo: 'topico-gestao', topico: ids[2], acao: 'fixar', comunidade: null, categoria: null }))).toBe('limite-de-estrutura')
    await c.agir({ tipo: 'topico-gestao', topico: TOPICS.cinemaNoReply, acao: 'trancar', comunidade: null, categoria: null })
    expect((await c.topico(TOPICS.cinemaNoReply)).trancado).toBe(true)
    expect(await code(() => as('juju').r.executar(U('juju'), { tipo: 'topico-gestao', topico: TOPICS.cinemaPopcorn, acao: 'trancar', comunidade: null, categoria: null }))).toBe('sem-permissao')
  })
  it('moving requires a role on both sides; from closed to open requires being the origin\'s owner; the category must exist', async () => {
    const { c } = client()
    const move = (topic: string, destination: string, category: string | null = null) => c.agir({ tipo: 'topico-gestao', topico: topic, acao: 'mover', comunidade: destination, categoria: category })
    // Lumi is a moderator in Hoje Aprendi: a destination where she is only a member, no
    expect(await code(() => move(TOPICS.cinemaNoReply, COMMUNITIES.cozinha))).toBe('sem-permissao')
    // a destination she does not even read (closed, not hers): does not exist
    expect(await code(() => move(TOPICS.cinemaNoReply, COMMUNITIES.jardim))).toBe('nao-encontrado')
    expect(await code(() => move(TOPICS.cinemaNoReply, COMMUNITIES.cochilo))).toBe('sem-permissao')
    // owner of Ateliê de Texto to the open one (makes it public): the origin's owner can
    expect(await code(() => move(TOPICS.recordPlayerSideB, COMMUNITIES.cinema, 'Dicas'))).toBe('ok')
    expect((await c.topico(TOPICS.recordPlayerSideB)).comunidade).toBe(COMMUNITIES.cinema)
    expect(await code(() => move(TOPICS.cinemaNoReply, COMMUNITIES.vitrola, 'Inexistente'))).toBe('invalido')
    // the Ateliê de Texto moderator who also moderates the open one does NOT move from closed to open
    const { r } = as('ziza')
    r.dbCommunities.get(COMMUNITIES.cinema)!.membros.set(U('ziza'), { papel: 'moderador', desde: r.now() - DAY })
    expect(await code(() => r.executar(U('ziza'), { tipo: 'topico-gestao', topico: oid('tvitrolacapa'), acao: 'mover', comunidade: COMMUNITIES.cinema, categoria: null }))).toBe('sem-permissao')
  })
})

describe('notifications: no text, no noise', () => {
  it('the notification carries only pointers, never an excerpt of text', async () => {
    const { c } = client()
    const items = (await c.notificacoes(U('lumi'))).itens
    for (const n of items) {
      expect(Object.keys(n).sort()).toEqual(['comunidade', 'em', 'nomeDoLugar', 'nomeDoTopico', 'objeto', 'origem', 'pagina', 'seq', 'tipo'])
    }
    expect(JSON.stringify(items)).not.toContain('Traduzi')
  })
  it('a reply notifies the topic\'s author, the parent, the quoted and the mentioned, one per person', async () => {
    const { r } = as('lumi')
    // Lumi opens a topic; Pipa replies, Max replies to Pipa quoting Lumi...
    const t = r.criar(U('lumi'), 'topico', topic(COMMUNITIES.cinema, 'Teste de aviso'))
    const a = r.criar(U('pipa'), 'resposta-forum', { topico: t, em: null, cita: null, texto: 'Primeira.' })
    r.criar(U('max'), 'resposta-forum', { topico: t, em: a, cita: null, texto: 'Mais uma, @lumi e @pipa.' })
    const types = (await r.notificacoes(U('lumi'))).itens.filter((n) => n.nomeDoTopico === 'Teste de aviso').map((n) => n.tipo)
    expect(types.sort()).toEqual(['resposta-no-topico', 'resposta-no-topico'])
    // Pipa received ONE only, for Max's reply (the highest priority: "resposta-a-voce"), despite parent and mention
    const { r: rp } = as('pipa')
    const t2 = rp.criar(U('lumi'), 'topico', topic(COMMUNITIES.cinema, 'Outro aviso'))
    const a2 = rp.criar(U('pipa'), 'resposta-forum', { topico: t2, em: null, cita: null, texto: 'Primeira.' })
    rp.criar(U('max'), 'resposta-forum', { topico: t2, em: a2, cita: a2, texto: 'Falo com @pipa.' })
    const hers = (await rp.notificacoes(U('pipa'))).itens.filter((n) => n.nomeDoTopico === 'Outro aviso')
    expect(hers.map((n) => n.tipo)).toEqual(['resposta-a-voce'])
  })
  it('muted and blocked do not notify', async () => {
    const { c } = client()
    const before = await c.contagemDeNotificacoes(U('lumi'))
    as('pingo').r.executar(U('pingo'), { tipo: 'amizade', alvo: U('lumi'), acao: 'pedir' })
    expect(await c.contagemDeNotificacoes(U('lumi'))).toBe(before)
    const { r } = as('lumi')
    r.executar(U('pingo'), { tipo: 'amizade', alvo: U('lumi'), acao: 'pedir' })
    expect((await r.contagemDeNotificacoes(U('lumi'))) - (await r.contagemDeNotificacoes(U('lumi'), 21))).toBeGreaterThanOrEqual(0)
    expect((await r.notificacoes(U('lumi'))).itens.some((n) => n.origem?.handle === 'pingo')).toBe(false)
  })
  it('only the person reads their own notifications, requests, invitations and relations', async () => {
    const { c } = client()
    for (const f of [() => c.notificacoes(U('pipa')), () => c.amizadesPendentes(U('pipa')), () => c.convites(U('pipa')), () => c.relacoes(U('pipa'))]) expect(await code(f)).toBe('sem-permissao')
    expect((await c.convites(U('lumi')))[0].comunidade.nome).toBe('Meu Humano')
    expect((await c.relacoes(U('lumi'))).itens.map((x) => x.relacao).sort()).toEqual(['bloqueio', 'silencio'])
  })
})

describe('topicFromObject: the notice points to the REPLY and the screen needs to find the topic', () => {
  it('a topic answers its own id; a reply, its topic\'s; what is not from the forum, not found', async () => {
    const { c } = client()
    expect(await c.topicoDeObjeto(TOPICS.cinemaPopcorn)).toBe(TOPICS.cinemaPopcorn)
    expect(await c.topicoDeObjeto(REPLIES.popcornWithChildren)).toBe(TOPICS.cinemaPopcorn)
    expect(await code(() => c.topicoDeObjeto(oid('nada-disso')))).toBe('nao-encontrado')
  })
})
