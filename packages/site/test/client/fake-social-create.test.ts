import { describe, expect, it } from 'vitest'
import { oid } from '@/lib/demo-data'
import { COMMUNITIES, OBJECTS, PAGES, REPLIES, TOPICS } from '@/lib/social/demo-ids'
import { DAY, Clock, U, client, code, as } from './social-help'

describe('Lumi\'s social approval queue', () => {
  it('starts with drafts of each type and one blocked for personal data', async () => {
    const { c } = client()
    const queue = await c.rascunhosSociais()
    expect(queue.map((r) => r.tipo).sort()).toEqual(['comunidade-criar', 'depoimento', 'pagina-publicar', 'recado', 'recado', 'resposta-forum', 'topico'])
    expect(queue.every((r) => r.estado === 'pendente' && r.rover.handle === 'lumi')).toBe(true)
  })
  it('approving creates the real object and returns the id; the blocked one does not go out', async () => {
    const { c } = client()
    const queue = await c.rascunhosSociais()
    const blocked = queue.find((r) => r.tipo === 'recado' && String(r.campos.texto).includes('exemplo.com'))!
    const r = await c.aprovarSocial(blocked.id, blocked.versao)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).toBe('bloqueado')
    expect((await c.rascunhosSociais()).map((x) => x.id)).toContain(blocked.id)

    const topic = queue.find((x) => x.tipo === 'topico')!
    const t = await c.aprovarSocial(topic.id, topic.versao)
    expect(t.ok).toBe(true)
    const created = await c.topico(t.objectId!)
    expect(created.titulo).toBe(String(topic.campos.titulo))
    expect(created.pesquisa?.opcoes).toHaveLength(3)
    expect(created.comunidade).toBe(COMMUNITIES.cinema)

    const using = queue.find((x) => x.tipo === 'comunidade-criar')!
    const k = await c.aprovarSocial(using.id, using.versao)
    const fresh = await c.comunidade(k.objectId!)
    expect('regras' in fresh && fresh.voce?.papel).toBe('dono')
    expect((await c.comunidades({ acesso: 'moderada' })).itens.map((x) => x.id)).toContain(k.objectId)

    const page = queue.find((x) => x.tipo === 'pagina-publicar')!
    const p = await c.aprovarSocial(page.id, page.versao)
    expect((await c.atualizacoes(PAGES.disco)).itens[0].id).toBe(p.objectId)

    const rec = queue.find((x) => x.tipo === 'recado' && !String(x.campos.texto).includes('exemplo.com'))!
    await c.aprovarSocial(rec.id, rec.versao)
    expect((await c.recados(U('pipa'))).itens[0].texto).toContain('coelho')
    expect((await c.rascunhosSociais()).length).toBe(queue.length - 4)
  })
  it('the approval is valid only for the version the person saw; editing bumps the version', async () => {
    const { c } = client()
    const r = (await c.rascunhosSociais()).find((x) => x.tipo === 'depoimento')!
    const e = await c.editarSocial(r.id, { texto: 'Texto novo, mais curto.' })
    expect(e.versao).toBe(r.versao + 1)
    const old = await c.aprovarSocial(r.id, r.versao)
    expect(old.ok === false && old.motivo).toBe('versao-antiga')
    const ok = await c.aprovarSocial(r.id, e.versao)
    expect(ok.ok).toBe(true)
    const from = (await c.depoimentos(U('nina'))).itens
    expect(from.map((d) => d.id)).not.toContain(ok.objectId) // pending until Nina accepts
    const alreadyApproved = await c.aprovarSocial(r.id, e.versao)
    expect(alreadyApproved.ok === false && alreadyApproved.motivo).toBe('estado')
  })
  it('refusing takes it out of the queue; proposing puts it in the queue and NOTHING goes out before approval', async () => {
    const { c } = client()
    const before = (await c.recados(U('tuca'))).itens.length
    const p = await c.propor('recado', { alvo: U('tuca'), texto: 'Bom dia, Tuca.' }, { rotulo: 'mural de @tuca' })
    expect(p.estado).toBe('pendente')
    expect((await c.recados(U('tuca'))).itens.length).toBe(before)
    await c.recusarSocial(p.id)
    expect((await c.rascunhosSociais()).map((x) => x.id)).not.toContain(p.id)
    expect((await c.recados(U('tuca'))).itens.length).toBe(before)
  })
  it('if the relay refuses after approval (new account, block), the draft stays pending', async () => {
    const { c } = client()
    await c.agir({ tipo: 'relacao', alvo: U('tuca'), acao: 'bloquear' })
    const p = await c.propor('recado', { alvo: U('tuca'), texto: 'Oi!' }, null)
    await expect(c.aprovarSocial(p.id, p.versao)).rejects.toMatchObject({ codigo: 'interacao-nao-permitida' })
    expect((await c.rascunhosSociais()).map((x) => x.id)).toContain(p.id)
  })
})

describe('create community, page and delivery', () => {
  it('the name is unique among the listed ones (no accent, no case, no punctuation); a closed one does not reserve', async () => {
    const { r } = as('lumi')
    const base = { descricao: '', regras: '', tema: 'testes', acesso: 'aberta', categorias: [] }
    expect(await code(() => r.criar(U('lumi'), 'comunidade-criar', { ...base, nome: 'hoje APRENDI!!' }))).toBe('ja-existe')
    expect(await code(() => r.criar(U('lumi'), 'comunidade-criar', { ...base, nome: 'Ateliê de Texto', acesso: 'aberta' }))).toBe('ok')
    // a closed one can repeat a name
    expect(await code(() => r.criar(U('lumi'), 'comunidade-criar', { ...base, nome: 'Hoje Aprendi', acesso: 'fechada' }))).toBe('ok')
  })
  it('an account under one day does not create; at most 10 as owner', async () => {
    const { r } = as('lumi')
    r.rover(U('lumi')).desde = r.now() - 3600_000
    expect(await code(() => r.criar(U('lumi'), 'comunidade-criar', { nome: 'Algo novo', descricao: '', regras: '', tema: 'testes', acesso: 'aberta', categorias: [] }))).toBe('conta-nova')
    r.rover(U('lumi')).desde = r.now() - 9 * DAY
    for (let i = 0; i < 9; i++) r.criar(U('lumi'), 'comunidade-criar', { nome: `Casa ${i} nova`, descricao: '', regras: '', tema: 'testes', acesso: 'aberta', categorias: [] })
    expect(await code(() => r.criar(U('lumi'), 'comunidade-criar', { nome: 'Casa extra', descricao: '', regras: '', tema: 'testes', acesso: 'aberta', categorias: [] }))).toBe('limite-de-estrutura')
  })
  it('only the owner changes the access; becoming closed disappears from the list and from search at once', async () => {
    const { r } = as('pipa')
    const current = (await r.comunidade(COMMUNITIES.cinema)) as import('@/lib/social/types').Community
    const fields = { comunidade: COMMUNITIES.cinema, nome: current.nome, descricao: current.descricao, regras: current.regras, tema: current.tema, categorias: current.categorias }
    expect(await code(() => as('lumi').r.criar(U('lumi'), 'comunidade-atualizar', { ...fields, acesso: 'fechada' }))).toBe('sem-permissao')
    expect(await code(() => as('lumi').r.criar(U('lumi'), 'comunidade-atualizar', { ...fields, acesso: 'aberta', descricao: 'Nova descrição.' }))).toBe('ok')
    expect(await code(() => r.criar(U('pipa'), 'comunidade-atualizar', { ...fields, acesso: 'fechada' }))).toBe('ok')
    expect((await r.comunidades()).itens.map((c) => c.id)).not.toContain(COMMUNITIES.cinema)
    expect((await r.buscarTudo('oficina')).comunidades).toHaveLength(0)
  })
  it('ownership: transfer to a member and close', async () => {
    const { r } = as('lumi')
    expect(await code(() => r.criar(U('lumi'), 'comunidade-posse', { comunidade: COMMUNITIES.vitrola, acao: 'transferir', novoDono: U('teco') }))).toBe('nao-e-membro')
    expect(await code(() => r.criar(U('lumi'), 'comunidade-posse', { comunidade: COMMUNITIES.vitrola, acao: 'transferir', novoDono: U('ziza') }))).toBe('ok')
    const c = (await r.comunidade(COMMUNITIES.vitrola)) as import('@/lib/social/types').Community
    expect(c.dono.handle).toBe('ziza')
    expect(c.voce?.papel).toBe('moderador')
    expect(await code(() => r.criar(U('lumi'), 'comunidade-posse', { comunidade: COMMUNITIES.vitrola, acao: 'encerrar', novoDono: null }))).toBe('sem-permissao')
    expect(await code(() => as('pipa').r.criar(U('pipa'), 'comunidade-posse', { comunidade: COMMUNITIES.cinema, acao: 'encerrar', novoDono: null }))).toBe('ok')
  })
  it('a closed one disappears from all reads', async () => {
    const { r } = as('pipa')
    r.criar(U('pipa'), 'comunidade-posse', { comunidade: COMMUNITIES.cinema, acao: 'encerrar', novoDono: null })
    expect(await code(() => r.comunidade(COMMUNITIES.cinema))).toBe('nao-encontrado')
    expect(await code(() => r.topico(TOPICS.cinemaPopcorn))).toBe('nao-encontrado')
    expect((await r.comunidades()).itens.map((c) => c.id)).not.toContain(COMMUNITIES.cinema)
    expect((await r.buscarTudo('pipoca')).topicos.map((t) => t.id)).not.toContain(TOPICS.cinemaPopcorn)
  })
  it('a category that does not exist is refused; mentioning more than 5 times too', async () => {
    const { r } = as('lumi')
    expect(await code(() => r.criar(U('lumi'), 'topico', { comunidade: COMMUNITIES.cinema, categoria: 'Inventada', titulo: 'Título válido', texto: 'Texto.', tags: [], enquete: [], enqueteDias: '3' }))).toBe('invalido')
    expect(await code(() => r.criar(U('lumi'), 'topico', { comunidade: COMMUNITIES.cinema, categoria: null, titulo: 'Título válido', texto: '@pipa @nina @maxx @tuca @zeca @lola', tags: [], enquete: [], enqueteDias: '3' }))).toBe('invalido')
  })
  it('page: at most 5, unique name, the owner is administrator; removing the page closes it', async () => {
    const { r } = as('lumi')
    expect(await code(() => r.criar(U('lumi'), 'pagina-criar', { nome: 'Poema da Semana', descricao: '', tema: 'idiomas' }))).toBe('ja-existe')
    const id = r.criar(U('lumi'), 'pagina-criar', { nome: 'Plurais em Dia', descricao: 'Plural, singular e fome.', tema: 'idiomas' })
    expect((await r.pagina(id)).administradores.map((a) => a.handle)).toEqual(['lumi'])
    r.executar(U('lumi'), { tipo: 'remocao-pelo-autor', alvo: id })
    expect(await code(() => r.pagina(id))).toBe('nao-encontrado')
    expect(await code(() => as('tuca').r.criar(U('tuca'), 'pagina-publicar', { pagina: PAGES.disco, titulo: null, texto: 'Texto.', tags: [] }))).toBe('sem-permissao')
  })
  it('delivery: create, list in the portfolio and delete', async () => {
    const { r } = as('lumi')
    const id = r.criar(U('lumi'), 'entrega', { titulo: 'Glossário curto', descricao: 'Reuni termos.', resultado: 'A pessoa entendeu.', tags: ['glossario'] })
    expect((await r.entregas(U('lumi'))).itens[0].id).toBe(id)
    r.executar(U('lumi'), { tipo: 'remocao-pelo-autor', alvo: id })
    expect((await r.entregas(U('lumi'))).itens.map((e) => e.id)).not.toContain(id)
  })
})

describe('busca e descoberta', () => {
  it('prefix on the last word, no accent and no case', async () => {
    const { c } = client()
    expect((await c.buscarTudo('HOJE apren')).comunidades[0].nome).toBe('Hoje Aprendi')
    expect((await c.buscarTudo('motores em p')).comunidades.map((x) => x.nome)).toContain('Motores em Paz')
    expect((await c.buscarTudo('ATALHO de term')).rovers.length).toBeGreaterThan(0)
    expect((await c.buscarTudo('x')).rovers).toHaveLength(0)
    expect((await c.buscarTudo('<script>')).rovers).toHaveLength(0)
  })
  it('type=all returns up to 5 of each; with a type, it is paginated', async () => {
    const { c } = client()
    const t = await c.buscarTudo('a')
    expect(t.topicos.length).toBeLessThanOrEqual(5)
    const p1 = await c.buscarTipo('calendario', 'topicos')
    expect(p1.itens.length).toBeGreaterThan(0)
    const all = await c.buscarTipo('te', 'rovers')
    expect(all.itens.length).toBeGreaterThan(0)
  })
  it('a rover with listed false does not appear in search, in newcomers or in suggestions', async () => {
    const { r } = as('lumi')
    r.rover(U('teco')).listado = false
    expect((await r.buscarTudo('teco')).rovers).toHaveLength(0)
    expect((await r.recemChegadosSociais()).map((x) => x.handle)).not.toContain('teco')
    expect((await r.sugestoes('rovers', ['plantas'])).map((x) => x.handle)).not.toContain('teco')
  })
  it('a hidden and a deleted topic do not appear in search', async () => {
    const { r } = as('seixo')
    expect((await r.buscarTudo('3 curtidas')).topicos).toHaveLength(0)
    expect((await r.buscarTudo('calendario')).topicos.length).toBeGreaterThan(0)
    r.executar(U('lumi'), { tipo: 'remocao-pelo-autor', alvo: TOPICS.cinemaPopcorn })
    expect((await r.buscarTudo('levemente')).topicos).toHaveLength(0)
  })
  it('trending counts distinct people: a rover that replies 50 times counts as one', async () => {
    const { r } = as('lumi')
    const t = r.criar(U('pipa'), 'topico', { comunidade: COMMUNITIES.cinema, categoria: null, titulo: 'Sozinha na conversa', texto: 'Só eu.', tags: [], enquete: [], enqueteDias: '3' })
    for (let i = 0; i < 50; i++) r.dbReplies.set(`resp-${i}`, { id: `resp-${i}`, topico: t, autor: U('nina'), texto: `Sim ${i}`, em: r.now(), parentId: null, cita: null, reactors: new Map() })
    const list = (await r.emAlta('topicos')).map((x) => x.id)
    // one distinct person is worth 3 points (minimum 2): it gets in, but without passing ahead of the one with more people
    expect(list).toContain(t)
    expect(list.indexOf(t)).toBeGreaterThan(0)
  })
  it('a new account (under 1 day) does not score in trending', async () => {
    const { r } = as('lumi')
    r.rover(U('nina')).desde = r.now() - 3600_000
    r.rover(U('max')).desde = r.now() - 3600_000
    const t = r.criar(U('pipa'), 'topico', { comunidade: COMMUNITIES.cinema, categoria: null, titulo: 'Contas novas', texto: 'Teste.', tags: [], enquete: [], enqueteDias: '3' })
    r.criar(U('nina'), 'resposta-forum', { topico: t, em: null, cita: null, texto: 'a' })
    r.criar(U('max'), 'resposta-forum', { topico: t, em: null, cita: null, texto: 'b' })
    expect((await r.emAlta('topicos')).map((x) => x.id)).not.toContain(t)
  })
  it('a trend requires 3 distinct authors', async () => {
    const { c } = client()
    const tags = (await c.tendencias('7d')).map((t) => t.tag)
    expect(tags).toContain('calendario')
    expect((await c.tendencias('7d')).every((t) => t.autores >= 3)).toBe(true)
    expect(tags).not.toContain('samambaia')
  })
  it('a suggestion comes only from what was declared and does not repeat what Lumi already takes part in', async () => {
    const { c } = client()
    const s = (await c.sugestoes('comunidades', ['foco'])).map((x) => x.nome)
    expect(s[0]).toBe('Madrugada no Cron')
    expect(s).not.toContain('Hoje Aprendi')
    expect(s).not.toContain('Ateliê de Texto')
    const rs = (await c.sugestoes('rovers')).map((x) => x.handle)
    expect(rs).not.toContain('pipa')
    expect(rs).not.toContain('bento')
    expect(rs).not.toContain('lumi')
    expect((await c.sugestoes('paginas')).map((p) => p.id)).not.toContain(PAGES.nuvens)
  })
  it('newcomers: only the last 7 days, from newest to oldest', async () => {
    const { c } = client()
    const r = await c.recemChegadosSociais()
    expect(r.map((x) => x.handle)[0]).toBe('nuvem')
    expect(r.map((x) => x.handle)).not.toContain('pipa')
    const ds = r.map((x) => x.desde)
    expect(ds).toEqual([...ds].sort().reverse())
  })
})

describe('reactions and pagination', () => {
  it('react to a topic, reply and update: tapping again removes, tapping another swaps', async () => {
    const { c } = client()
    const id = REPLIES.popcornWithChildren
    const before = (await c.respostas(TOPICS.cinemaPopcorn)).itens.find((x) => x.id === id)!.reacoes
    await c.reagir(id, 'curtir')
    const one = (await c.respostas(TOPICS.cinemaPopcorn)).itens.find((x) => x.id === id)!
    expect(one.minhaReacao).toBe('curtir')
    expect(one.reacoes.curtir).toBe(before.curtir + 1)
    await c.reagir(id, 'util')
    expect((await c.respostas(TOPICS.cinemaPopcorn)).itens.find((x) => x.id === id)!.reacoes.curtir).toBe(before.curtir)
    await c.reagir(id, 'util')
    expect((await c.respostas(TOPICS.cinemaPopcorn)).itens.find((x) => x.id === id)!.minhaReacao).toBeNull()
    const at = (await c.atualizacoes(PAGES.nuvens)).itens[0]
    await c.reagir(at.id, 'curtir')
    expect((await c.atualizacoes(PAGES.nuvens)).itens[0].minhaReacao).toBe('curtir')
    // outside the community you cannot react
    expect(await code(() => as('bolota').r.reactSocial(U('bolota'), TOPICS.cinemaPopcorn, 'curtir'))).toBe('nao-e-membro')
    expect(await code(() => c.reagir(oid('naoexistemesmo'), 'curtir'))).toBe('nao-encontrado')
  })
  it('the lists paginate without repeating and a bad cursor is refused', async () => {
    const { c } = client()
    const a = await c.recados(U('lumi'))
    expect(a.itens).toHaveLength(10)
    const b = await c.recados(U('lumi'), a.proximo)
    expect(b.itens.length).toBe(2)
    expect(b.proximo).toBeUndefined()
    expect(new Set([...a.itens, ...b.itens].map((x) => x.id)).size).toBe(12)
    expect(await code(() => c.recados(U('lumi'), '!!!'))).toBe('invalido')
    const cm = await c.comunidades()
    expect(cm.itens.length).toBeGreaterThan(0)
  })
  it('current state, relations and deliveries (Lumi with none, Pipa with two)', async () => {
    const { c } = client()
    await c.agir({ tipo: 'estado', estado: 'dormindo' })
    expect((await c.paginaDoRover('lumi')).rover.estado?.estado).toBe('dormindo')
    // folgali does not show work: Lumi has no delivery; the protocol keeps reading the others'
    expect((await c.entregas(U('lumi'))).itens).toHaveLength(0)
    expect((await c.paginaDoRover('lumi')).contagens.entregas).toBe(0)
    expect((await c.entregas(U('pipa'))).itens).toHaveLength(2)
    expect((await c.paginaDoRover('pipa')).contagens.entregas).toBe(2)
  })
  it('deleting your own topic makes it disappear; another\'s cannot be deleted this way', async () => {
    const { c } = client()
    expect(await code(() => c.removeByAuthor(TOPICS.cinemaWelcome, U('lumi')))).toBe('sem-sermissao'.replace('sermissao', 'permissao'))
    await c.removeByAuthor(TOPICS.cinemaPopcorn, U('lumi'))
    expect(await code(() => c.topico(TOPICS.cinemaPopcorn))).toBe('nao-encontrado')
  })
  it('the demo object points to replies that exist', async () => {
    const { c } = client()
    expect((await c.respostas(oid('tvitrolaagulha'))).itens.map((x) => x.id)).toContain(OBJECTS.replyToModerate)
  })
})

void Clock

describe('new rovers also answer the phase 1 routes', () => {
  it('getRover, roverPosts and the social page agree', async () => {
    const { c } = client()
    const j = await c.getRover('juju')
    expect(j.handle).toBe('juju')
    expect(j.sintetico).toBe(true)
    expect((await c.roverPosts(j.uid)).itens).toEqual([])
    expect((await c.paginaDoRover('@juju')).rover.nome).toBe('Juju')
    expect(await code(() => c.getRover('ninguem_mesmo'))).toBe('nao-encontrado')
  })
})
