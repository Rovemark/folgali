// SPDX-License-Identifier: AGPL-3.0-or-later
// Revision 0.3.1 (proposal 0006): additive fields and routes. Each test says what 0.3 did not give, proves what it gives now and proves
// that privacy and compatibility held (private graph, closed community, banned rover, what the reader cannot see).
import test from 'node:test'
import assert from 'node:assert/strict'
import { codeOf, fresh } from '../helpers/network.js'
import { policyOf } from '../helpers/world.js'

function forum() {
  const x = fresh()
  const owner = x.rover()
  const mod = x.rover()
  const [ana, beto, caio] = [x.rover(), x.rover(), x.rover()]
  const c = x.comunidade(owner, { categorias: ['Geral'] })
  for (const r of [mod, ana, beto, caio]) { x.entra(r, c, { wait: false }); x.advance(1) }
  x.gestao(owner, c, mod, 'promover')
  x.advance(3601)
  return Object.assign(x, { dono: owner, mod, ana, beto, caio, c })
}
const notices = (x, r) => x.s.listar(r.uid, { limite: 50 }, x.m.relogio.agora).itens

// ---------- perfil and notices ----------

test('perfilId: the id of the current perfil object, so the perfil can be reported; absent when the rover has not published one yet', () => {
  const x = fresh()
  const [a, b] = [x.rover(), x.rover()]
  const p = x.s.paginaDoRover(a.uid, {})
  assert.match(p.rover.perfilId, /^ob_/)
  assert.equal(x.rele.perfil(a.uid).perfilId, p.rover.perfilId)
  assert.equal(x.does(b, 'denuncia', { alvo: p.rover.perfilId, motivo: 'spam' }).estado, 'recebida', 'the id works as a report target')
})

test('voce: amigoDesde, contaDesde and selosQueDei only exist for a reader with a credential and only talk about the reader', () => {
  const x = fresh()
  const [a, b, c] = [x.rover(), x.rover(), x.rover()]
  assert.equal(x.s.paginaDoRover(a.uid, {}).voce, null, 'no credential, no voce')
  let v = x.s.paginaDoRover(a.uid, { credencial: x.como(b) }).voce
  assert.equal(v.amigoDesde, null)
  assert.equal(v.contaDesde, x.rele.store.rover(b.uid).criado_em)
  assert.deepEqual(v.selosQueDei, [])
  const when = x.m.relogio.agora
  x.amigos(a, b, 8)
  v = x.s.paginaDoRover(a.uid, { credencial: x.como(b) }).voce
  assert.equal(v.amigoDesde, when, 'the friendship became active at the moment of acceptance')
  x.ok(b, 'selo', { alvo: a.uid, selo: 'confiavel' })
  assert.deepEqual(x.s.paginaDoRover(a.uid, { credencial: x.como(b) }).voce.selosQueDei, ['confiavel'])
  assert.deepEqual(x.s.paginaDoRover(a.uid, { credencial: x.como(c) }).voce.selosQueDei, [], 'the selo from b does not show for c')
  assert.deepEqual(x.s.paginaDoRover(b.uid, { credencial: x.como(a) }).voce.selosQueDei, [], 'and the person who received does not see "dei"')
  assert.equal(x.s.paginaDoRover(a.uid, { credencial: x.como(c) }).voce.amigoDesde, null)
})

test('contagens.seguidores and seguindo: the same graph rules as contagens.amigos', () => {
  const x = fresh()
  const [a, b, c] = [x.rover(), x.rover(), x.rover()]
  x.ok(b, 'seguir', { alvo: a.uid })
  x.ok(a, 'seguir', { alvo: c.uid })
  const isPublic = x.s.paginaDoRover(a.uid, {}).contagens
  assert.equal(isPublic.seguidores, 1)
  assert.equal(isPublic.seguindo, 1)
  const reserved = x.rover({ grafo: 'privado' })
  x.ok(b, 'seguir', { alvo: reserved.uid })
  assert.equal(x.s.paginaDoRover(reserved.uid, {}).contagens.seguidores, null, 'a private graph shows no count to anyone but the rover')
  assert.equal(x.s.paginaDoRover(reserved.uid, {}).contagens.seguindo, null)
  assert.equal(x.s.paginaDoRover(reserved.uid, { credencial: x.como(b) }).contagens.seguidores, null)
  assert.equal(x.s.paginaDoRover(reserved.uid, { credencial: x.como(reserved) }).contagens.seguidores, 1, 'the rover itself sees it')
})

test('notices with names: lugar and topico only when the reader can see them; the text stays out of the notice', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { titulo: 'Qual a melhor planilha?' })
  const r = x.replies(x.beto, t, 'uma resposta secreta')
  const n = notices(x, x.ana).find((a) => a.objeto === r)
  assert.deepEqual(n.topico, { id: t, titulo: 'Qual a melhor planilha?' })
  assert.deepEqual(n.lugar, { tipo: 'comunidade', id: x.c, nome: x.s.comunidade(x.c).nome })
  assert.equal(JSON.stringify(n).includes('secreta'), false, 'only the topic title and the place name, never the reply text')
  x.ok(x.mod, 'remocao-por-responsavel', { alvo: r, motivo: 'spam' })
  const after = notices(x, x.ana).find((a) => a.seq === n.seq)
  assert.equal(after.topico, null, 'reply removed: the notice leads nowhere')
  assert.equal(after.objeto, null)
})

test('notices with names: page, and a closed community the person left or was banned from does not show', () => {
  const x = fresh()
  const [owner, segment] = [x.rover(), x.rover()]
  const page = x.ok(owner, 'pagina-criar', { nome: 'Página dos avisos', descricao: '', tema: 'rovers' }).id
  x.ok(segment, 'pagina-seguir', { pagina: page, acao: 'seguir' })
  const n = notices(x, owner).find((a) => a.tipo === 'novo-seguidor')
  assert.deepEqual(n.lugar, { tipo: 'pagina', id: page, nome: 'Página dos avisos' })
  assert.equal(n.topico, null)
  const closed = x.comunidade(owner, { acesso: 'fechada', nome: 'Fechada dos avisos' })
  x.gestao(owner, closed, segment, 'convidar')
  const invite = notices(x, segment).find((a) => a.tipo === 'convite-comunidade')
  assert.equal(invite.lugar.nome, 'Fechada dos avisos', 'an invited person sees the name (the minimal card already showed it)')
  x.ok(segment, 'comunidade-adesao', { comunidade: closed, acao: 'aceitar-convite' })
  x.gestao(owner, closed, segment, 'banir', 'spam')
  const banned = notices(x, segment).find((a) => a.tipo === 'banido')
  assert.equal(banned.comunidade, null, 'someone banned from a closed community no longer sees it')
  assert.equal(banned.lugar, null, 'and the name goes away too')
})

test('depoimentos?estado=enviados: the author reads what they wrote that still awaits a decision; only the author', () => {
  const x = fresh()
  const [a, b, c] = [x.rover(), x.rover(), x.rover()]
  x.amigos(a, b, 8)
  const dep = x.ok(a, 'depoimento', { alvo: b.uid, texto: 'Trabalha com capricho e entrega no prazo.' })
  const list = x.s.depoimentos(a.uid, { estado: 'enviados', credencial: x.como(a) })
  assert.equal(list.itens.length, 1)
  assert.equal(list.itens[0].alvo.uid, b.uid)
  assert.equal(list.itens[0].estado, 'pendente')
  assert.equal(list.itens[0].envelope.objeto.id, dep.id)
  assert.equal(codeOf(() => x.s.depoimentos(a.uid, { estado: 'enviados', credencial: x.como(b) })), 'sem_permissao')
  assert.equal(codeOf(() => x.s.depoimentos(a.uid, { estado: 'enviados', credencial: x.como(c) })), 'sem_permissao')
  assert.equal(codeOf(() => x.s.depoimentos(a.uid, { estado: 'enviados', credencial: null })), 'leitura_nao_autorizada')
  assert.equal(codeOf(() => x.s.depoimentos(a.uid, { estado: 'todos', credencial: x.como(a) })), 'esquema')
  assert.deepEqual(x.s.depoimentos(b.uid, { estado: 'enviados', credencial: x.como(b) }).itens, [], 'the recipient has no "enviados"')
  x.ok(b, 'depoimento-decisao', { depoimento: dep.id, decisao: 'aceitar' })
  assert.deepEqual(x.s.depoimentos(a.uid, { estado: 'enviados', credencial: x.como(a) }).itens, [], 'decided, stops waiting')
})

// ---------- comunidades and forum ----------

test('voce.banidoEm and voce.membroDesde: the reader own dates', () => {
  const x = forum()
  const before = x.m.relogio.agora
  const v = x.s.communityDetail(x.c, { credencial: x.como(x.ana) }).voce
  assert.ok(v.membroDesde < before && v.membroDesde > before - 3700, 'the date ana joined')
  assert.equal(v.banidoEm, null)
  const when = x.m.relogio.agora
  x.gestao(x.dono, x.c, x.caio, 'banir', 'spam')
  const b = x.s.communityDetail(x.c, { credencial: x.como(x.caio) }).voce
  assert.equal(b.banidoEm, when)
  assert.equal(b.membroDesde, null, 'a banned person stopped being a member')
  assert.equal(x.s.communityDetail(x.c, { credencial: x.como(x.beto) }).voce.banidoEm, null, 'the ban of caio does not show for beto')
})

test('removidos: the author reads what moderation removed from their writing; nobody else', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { titulo: 'Conteúdo a remover' })
  const other = x.topico(x.beto, x.c, { titulo: 'Conteúdo do beto' })
  x.ok(x.mod, 'remocao-por-responsavel', { alvo: t, motivo: 'spam' })
  const list = x.s.removedOf(x.ana.uid, { credencial: x.como(x.ana) })
  assert.equal(list.itens.length, 1)
  const i = list.itens[0]
  assert.equal(i.alvo, t)
  assert.equal(i.alvoTipo, 'topico')
  assert.equal(i.por, 'moderador')
  assert.equal(i.motivo, 'spam')
  assert.equal(i.apelacao, null)
  assert.equal(i.envelope.objeto.corpo.titulo, 'Conteúdo a remover', 'the author sees what was removed, so they can appeal')
  assert.equal(JSON.stringify(list).includes(other), false, 'the one from beto does not show in the list of ana')
  assert.equal(codeOf(() => x.s.removedOf(x.ana.uid, { credencial: x.como(x.beto) })), 'sem_permissao')
  assert.equal(codeOf(() => x.s.removedOf(x.ana.uid, { credencial: null })), 'leitura_nao_autorizada')
  assert.deepEqual(x.s.removedOf(x.beto.uid, { credencial: x.como(x.beto) }).itens, [])
})

test('queue: each report carries the topic where the target lives (the topic itself, or the topic of the reply)', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { titulo: 'Tópico denunciado' })
  const r = x.replies(x.caio, t, 'resposta denunciada')
  x.does(x.beto, 'denuncia', { alvo: t, motivo: 'spam' })
  x.does(x.beto, 'denuncia', { alvo: r, motivo: 'spam' })
  const queue = x.s.communityQueue(x.c, { credencial: x.como(x.mod) })
  const by = Object.fromEntries(queue.denuncias.map((d) => [d.alvo, d]))
  assert.equal(by[t].topico, t)
  assert.equal(by[r].topico, t)
  assert.equal(by[r].alvoTipo, 'resposta-forum')
})

test('denuncia-dispensar: takes it off the queue without deleting the content, enters the public log and does not expose the reporter', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { titulo: 'Tópico em dúvida' })
  const r = x.replies(x.caio, t, 'uma resposta em dúvida')
  x.does(x.beto, 'denuncia', { alvo: r, motivo: 'spam' })
  x.does(x.ana, 'denuncia', { alvo: r, motivo: 'fora-do-tema' })
  assert.equal(x.s.communityQueue(x.c, { credencial: x.como(x.mod) }).denuncias[0].total, 2)
  // who can: only owner and moderator; and an open report must exist in that community
  assert.equal(x.code(x.ana, 'denuncia-dispensar', { comunidade: x.c, alvo: r }), 'sem_permissao')
  assert.equal(x.code(x.rover(), 'denuncia-dispensar', { comunidade: x.c, alvo: r }), 'nao_e_membro')
  assert.equal(x.code(x.mod, 'denuncia-dispensar', { comunidade: x.c, alvo: t }), 'nao_encontrado', 'the topic was not reported')
  const act = x.ok(x.mod, 'denuncia-dispensar', { comunidade: x.c, alvo: r })
  assert.deepEqual(x.s.communityQueue(x.c, { credencial: x.como(x.mod) }).denuncias, [], 'left the queue')
  assert.ok(x.s.repliesOf(t, {}).itens.some((i) => i.id === r), 'the content stays visible')
  assert.equal(x.code(x.mod, 'denuncia-dispensar', { comunidade: x.c, alvo: r }), 'nao_encontrado', 'there is no open report anymore')
  const reg = x.s.registroDaComunidade(x.c, {}).itens[0]
  assert.equal(reg.acao, 'dispensa')
  assert.equal(reg.alvo, r)
  assert.equal(reg.alvoTipo, 'resposta-forum')
  assert.equal(reg.por, 'moderador')
  const isPublic = JSON.stringify(x.s.registroDaComunidade(x.c, {}))
  for (const who of [x.beto, x.ana]) {
    assert.equal(isPublic.includes(who.uid), false, 'the log never says who reported')
    assert.equal(isPublic.includes(x.rele._pseudonym(who.uid)), false)
  }
  assert.equal(x.does(x.beto, 'denuncia', { alvo: r, motivo: 'spam' }).estado, 'recebida')
  assert.deepEqual(x.s.communityQueue(x.c, { credencial: x.como(x.mod) }).denuncias, [], 'someone who already reported does not reopen the case')
  x.does(x.rover(), 'denuncia', { alvo: r, motivo: 'assedio' })
  const reopened = x.s.communityQueue(x.c, { credencial: x.como(x.mod) }).denuncias
  assert.equal(reopened.length, 1, 'a new report, from another person, reopens it')
  assert.equal(reopened[0].total, 1)
  assert.equal(codeOf(() => x.rele.objeto(act.id)), 'nao_encontrado', 'it is an action: the relay does not keep the envelope')
})

test('reactions on a topic: reacoes and minhaReacao in the detail', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  x.ok(x.beto, 'reacao', { alvo: t, reacao: 'curtir' })
  x.ok(x.caio, 'reacao', { alvo: t, reacao: 'util' })
  let d = x.s.topicDetail(t, { credencial: x.como(x.beto) })
  assert.deepEqual(d.reacoes, { curtir: 1, util: 1 })
  assert.equal(d.minhaReacao, 'curtir')
  d = x.s.topicDetail(t, {})
  assert.deepEqual(d.reacoes, { curtir: 1, util: 1 })
  assert.equal(d.minhaReacao, null, 'no credential, no minhaReacao')
  assert.equal(x.s.topicDetail(t, { credencial: x.como(x.mod) }).minhaReacao, null, 'someone who did not react')
  assert.equal(JSON.stringify(d).includes(x.beto.uid), false, 'never the list of who reacted')
})

test('categoria=-: only the topics without a category', () => {
  const x = forum()
  const without = x.topico(x.ana, x.c, { titulo: 'Sem categoria' })
  const using = x.topico(x.beto, x.c, { titulo: 'Com categoria', categoria: 'Geral' })
  assert.deepEqual(x.s.topicsOf(x.c, { categoria: '-' }).itens.map((i) => i.id), [without])
  assert.deepEqual(x.s.topicsOf(x.c, { categoria: 'Geral' }).itens.map((i) => i.id), [using])
  assert.deepEqual(x.s.topicsOf(x.c, {}).itens.map((i) => i.id).sort(), [without, using].sort(), 'without the filter, both')
})

test('respostas?ordem=recentes: newest to oldest, with the cursor; the default stays antigas', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  const ids = []
  for (let i = 0; i < 5; i++) { ids.push(x.replies(x.beto, t, `resposta ${i}`)); x.advance(1) }
  assert.deepEqual(x.s.repliesOf(t, { limite: 50 }).itens.map((i) => i.id), ids, 'default: antigas')
  assert.deepEqual(x.s.repliesOf(t, { limite: 50, ordem: 'antigas' }).itens.map((i) => i.id), ids)
  const p1 = x.s.repliesOf(t, { limite: 2, ordem: 'recentes' })
  assert.deepEqual(p1.itens.map((i) => i.id), [ids[4], ids[3]])
  const p2 = x.s.repliesOf(t, { limite: 2, ordem: 'recentes', antes: p1.proximo })
  assert.deepEqual(p2.itens.map((i) => i.id), [ids[2], ids[1]])
  const p3 = x.s.repliesOf(t, { limite: 2, ordem: 'recentes', antes: p2.proximo })
  assert.deepEqual(p3.itens.map((i) => i.id), [ids[0]])
  assert.equal(p3.proximo, null)
  assert.equal(codeOf(() => x.s.repliesOf(t, { ordem: 'aleatoria' })), 'esquema')
})

// ---------- pages, search and timeline ----------

test('full list: author, page, counts and the reader reacao; without the option the list is the 0.3 one', () => {
  const x = fresh()
  const [a, b, c] = [x.rover(), x.rover(), x.rover()]
  const post = x.ok(a, 'postagem', { texto: 'uma postagem com resposta', topicos: [] }).id
  x.ok(b, 'reacao', { alvo: post, reacao: 'curtir' })
  x.ok(c, 'resposta', { alvo: post, texto: 'concordo' })
  const complete = x.rele.postsOf(a.uid, { completo: true, credencial: x.como(b) })
  assert.equal(complete.itens.length, 1)
  const i = complete.itens[0]
  assert.equal(i.tipo, 'postagem')
  assert.equal(i.envelope.objeto.id, post)
  assert.equal(i.autor.uid, a.uid)
  assert.equal(i.pagina, null)
  assert.deepEqual(i.contagens, { respostas: 1, reacoes: { curtir: 1, util: 0 } })
  assert.equal(i.minhaReacao, 'curtir')
  assert.equal(x.rele.postsOf(a.uid, { completo: true }).itens[0].minhaReacao, null, 'no credential')
  const old = x.rele.postsOf(a.uid, {})
  assert.equal(old.itens[0].objeto.id, post, 'without the option the list still holds envelopes, as in 0.3')
  assert.deepEqual(Object.keys(old.itens[0]).sort(), Object.keys(x.rele.postsOf(a.uid, { completo: false }).itens[0]).sort())
})

test('full list of the timeline and of the page updates: the mixed item says the type and the page name', () => {
  const x = fresh()
  const [owner, segment, friend] = [x.rover(), x.rover(), x.rover()]
  const page = x.ok(owner, 'pagina-criar', { nome: 'Página da linha', descricao: '', tema: 'rovers' }).id
  x.ok(segment, 'pagina-seguir', { pagina: page, acao: 'seguir' })
  x.ok(segment, 'seguir', { alvo: friend.uid })
  const post = x.ok(friend, 'postagem', { texto: 'postagem do amigo', topicos: [] }).id
  x.advance(1)
  const upd = x.ok(owner, 'pagina-publicar', { pagina: page, texto: 'novidade da página', tags: [] }).id
  x.ok(segment, 'reacao', { alvo: upd, reacao: 'util' })
  const line = x.rele.homeTimeline(segment.uid, { tipos: ['postagem', 'pagina-publicar'], completo: true, credencial: x.como(segment) })
  assert.deepEqual(line.itens.map((i) => i.tipo), ['pagina-publicar', 'postagem'], 'newest to oldest, both types in the same array')
  assert.deepEqual(line.itens[0].pagina, { id: page, nome: 'Página da linha' })
  assert.equal(line.itens[0].minhaReacao, 'util')
  assert.deepEqual(line.itens[0].contagens, { respostas: 0, reacoes: { curtir: 0, util: 1 } })
  assert.equal(line.itens[1].pagina, null)
  assert.equal(line.itens[1].envelope.objeto.id, post)
  const updated = x.s.communityUpdates(page, { completo: true, credencial: x.como(segment) })
  assert.equal(updated.itens.length, 1)
  assert.equal(updated.itens[0].tipo, 'pagina-publicar')
  assert.equal(updated.itens[0].minhaReacao, 'util')
  assert.equal(x.s.communityUpdates(page, {}).itens[0].objeto.id, upd, 'without the option, only the envelope')
  const closed = x.rover({ grafo: 'privado' })
  assert.equal(codeOf(() => x.rele.homeTimeline(closed.uid, { completo: true })), 'grafo_privado', 'the timeline of someone who hides the graph stays theirs alone')
})

test('page themes: the themes of open pages, most used to least', () => {
  const x = fresh()
  const [a, b] = [x.rover(), x.rover()]
  const p1 = x.ok(a, 'pagina-criar', { nome: 'Uma', descricao: '', tema: 'planilhas' }).id
  x.ok(b, 'pagina-criar', { nome: 'Duas', descricao: '', tema: 'planilhas' })
  x.ok(a, 'pagina-criar', { nome: 'Tres', descricao: '', tema: 'receitas' })
  assert.deepEqual(x.s.temasDePaginas().itens, [{ tema: 'planilhas', paginas: 2 }, { tema: 'receitas', paginas: 1 }])
  x.rele.bloquear({ tipo: 'objeto', alvo: p1, motivo: 'teste' })
  assert.deepEqual(x.s.temasDePaginas().itens, [{ tema: 'planilhas', paginas: 1 }, { tema: 'receitas', paginas: 1 }], 'a page blocked by the operator does not count (tie: by theme)')
})

test('trending: distinct people who moved the item, never the list; someone who replies 3 times counts 1', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { titulo: 'Tópico em alta' })
  for (let i = 0; i < 3; i++) x.replies(x.beto, t, `resposta ${i}`)
  x.replies(x.caio, t, 'outra pessoa')
  x.ok(x.mod, 'reacao', { alvo: t, reacao: 'curtir' })
  const item = x.s.emAlta({ tipo: 'topicos' }, x.m.relogio.agora).itens.find((i) => i.id === t)
  assert.equal(item.pessoas, 3, 'beto, caio and the moderator who reacted: people, not volume')
  assert.equal(JSON.stringify(item).includes(x.beto.uid), false, 'the item does not say who')
  const using = x.s.emAlta({ tipo: 'comunidades', janela: '7d' }, x.m.relogio.agora).itens.find((i) => i.id === x.c)
  assert.ok(using.pessoas >= 2, 'communities carry people too')
  const owner = x.rover()
  const p = x.ok(owner, 'pagina-criar', { nome: 'Página em alta', descricao: '', tema: 'rovers' }).id
  for (const s of [x.beto, x.caio]) x.ok(s, 'pagina-seguir', { pagina: p, acao: 'seguir' })
  x.ok(owner, 'pagina-publicar', { pagina: p, texto: 'novidade', tags: [] })
  assert.equal(x.s.emAlta({ tipo: 'paginas' }, x.m.relogio.agora).itens.find((i) => i.id === p).pessoas, 2)
  assert.equal(codeOf(() => x.s.emAlta({ tipo: 'rovers' }, x.m.relogio.agora)), 'esquema', 'the relay does not rank people (a 0.3 decision that 0.3.1 keeps)')
})

// ---------- postagens ----------

test('postagem by id: contagens and minhaReacao; what the reader cannot see does not exist for them', () => {
  const x = fresh()
  const [a, b, c] = [x.rover(), x.rover(), x.rover()]
  const post = x.ok(a, 'postagem', { texto: 'uma postagem para ver', topicos: [] }).id
  x.ok(b, 'reacao', { alvo: post, reacao: 'util' })
  x.ok(c, 'resposta', { alvo: post, texto: 'primeira' })
  x.advance(1)
  x.ok(b, 'resposta', { alvo: post, texto: 'segunda' })
  const d = x.s.postDetail(post, { credencial: x.como(b) })
  assert.deepEqual(Object.keys(d).sort(), ['autor', 'contagens', 'envelope', 'minhaReacao'])
  assert.deepEqual(d.contagens, { respostas: 2, reacoes: { curtir: 0, util: 1 } })
  assert.equal(d.minhaReacao, 'util')
  assert.equal(x.s.postDetail(post, {}).minhaReacao, null)
  const note = x.ok(a, 'recado', { alvo: b.uid, texto: 'um recado qualquer' }).id
  assert.equal(codeOf(() => x.s.postDetail(note, {})), 'nao_encontrado', 'only postagem')
  assert.equal(codeOf(() => x.s.postDetail('ob_' + 'A'.repeat(43), {})), 'nao_encontrado')
  assert.equal(codeOf(() => x.s.postDetail('x', {})), 'nao_encontrado')
  x.ok(c, 'remocao-pelo-autor', { alvo: x.s.postReplies(post, {}).itens.find((i) => i.autor.uid === c.uid).envelope.objeto.id })
  assert.equal(x.s.postDetail(post, {}).contagens.respostas, 1, 'a removed reply does not count')
  x.ok(a, 'remocao-pelo-autor', { alvo: post })
  assert.equal(codeOf(() => x.s.postDetail(post, {})), 'removido')
  const other = x.ok(a, 'postagem', { texto: 'outra postagem', topicos: [] }).id
  x.rele.bloquear({ tipo: 'objeto', alvo: other, motivo: 'teste' })
  assert.equal(codeOf(() => x.s.postDetail(other, {})), 'nao_encontrado', 'blocked by the operator')
})

test('replies of a postagem: order, cursor, counts and the reader reacao', () => {
  const x = fresh()
  const [a, b, c] = [x.rover(), x.rover(), x.rover()]
  const post = x.ok(a, 'postagem', { texto: 'postagem com respostas', topicos: [] }).id
  const ids = []
  for (const [author, text] of [[b, 'um'], [c, 'dois'], [b, 'tres']]) { ids.push(x.ok(author, 'resposta', { alvo: post, texto: text }).id); x.advance(1) }
  x.ok(c, 'reacao', { alvo: ids[0], reacao: 'curtir' })
  const newItems = x.s.postReplies(post, { limite: 2, credencial: x.como(c) })
  assert.deepEqual(newItems.itens.map((i) => i.envelope.objeto.id), [ids[2], ids[1]], 'the default is newest to oldest')
  const rest = x.s.postReplies(post, { limite: 2, antes: newItems.proximo, credencial: x.como(c) })
  assert.deepEqual(rest.itens.map((i) => i.envelope.objeto.id), [ids[0]])
  assert.deepEqual(rest.itens[0].contagens, { respostas: 0, reacoes: { curtir: 1, util: 0 } })
  assert.equal(rest.itens[0].minhaReacao, 'curtir')
  assert.equal(rest.itens[0].autor.uid, b.uid)
  assert.deepEqual(x.s.postReplies(post, { limite: 5, ordem: 'antigas' }).itens.map((i) => i.envelope.objeto.id), ids)
  assert.equal(codeOf(() => x.s.postReplies(post, { ordem: 'aleatoria' })), 'esquema')
  assert.equal(codeOf(() => x.s.postReplies('x', {})), 'nao_encontrado')
})

test('count privacy: a rover blocked by the operator does not count, and the postagem of an invisible rover disappears', () => {
  const x = fresh()
  const [a, b, c] = [x.rover(), x.rover(), x.rover()]
  const post = x.ok(a, 'postagem', { texto: 'postagem com contagens', topicos: [] }).id
  x.ok(b, 'reacao', { alvo: post, reacao: 'curtir' })
  x.ok(c, 'resposta', { alvo: post, texto: 'uma resposta' })
  assert.deepEqual(x.s.postDetail(post, {}).contagens, { respostas: 1, reacoes: { curtir: 1, util: 0 } })
  x.rele.bloquear({ tipo: 'rover', alvo: b.uid, motivo: 'teste' })
  x.rele.bloquear({ tipo: 'rover', alvo: c.uid, motivo: 'teste' })
  assert.deepEqual(x.s.postDetail(post, {}).contagens, { respostas: 0, reacoes: { curtir: 0, util: 0 } }, 'someone not visible does not enter the count')
  assert.deepEqual(x.s.postReplies(post, {}).itens, [])
  x.rele.bloquear({ tipo: 'rover', alvo: a.uid, motivo: 'teste' })
  assert.equal(codeOf(() => x.s.postDetail(post, {})), 'nao_encontrado', 'the author stopped being visible: the postagem does not exist for the reader')
  assert.equal(codeOf(() => x.s.postReplies(post, {})), 'nao_encontrado')
})

test('compatibility of the person declarations: the new type is not in the list they can require, as on a 0.3 relay', () => {
  const x = fresh()
  const a = x.rover()
  const using = policyOf(a, { v: '0.3', exigirAprovacao: ['denuncia-dispensar'] })
  assert.equal(codeOf(() => x.rele.acceptDeclaration({ declaracao: using })), 'esquema', 'the closed 0.3 list still holds: the 0.3.1 relay refuses what a 0.3 relay would refuse')
  const normal = policyOf(a, { v: '0.3', exigirAprovacao: ['comunidade-gestao'] })
  assert.equal(x.rele.acceptDeclaration({ declaracao: normal }).estado, 'aceita', 'the earlier policy still holds')
})

test('the full list paginates like the envelope list: limite, proximo and antes; with exactly "limite" items there is no next page', () => {
  const x = fresh()
  const a = x.rover()
  const ids = []
  for (let i = 0; i < 3; i++) { ids.push(x.ok(a, 'postagem', { texto: `postagem ${i} da paginação`, topicos: [] }).id); x.advance(1) }
  const order = (page) => page.itens.map((i) => i.envelope.objeto.id)
  const p1 = x.rele.postsOf(a.uid, { completo: true, limite: 2 })
  assert.deepEqual(order(p1), [ids[2], ids[1]], 'newest to oldest')
  assert.notEqual(p1.proximo, null, 'one postagem was left over')
  const p2 = x.rele.postsOf(a.uid, { completo: true, limite: 2, antes: p1.proximo })
  assert.deepEqual(order(p2), [ids[0]], 'the cursor continues exactly where the first page stopped')
  assert.equal(p2.proximo, null)
  const exact = x.rele.postsOf(a.uid, { completo: true, limite: 3 })
  assert.deepEqual(order(exact), [ids[2], ids[1], ids[0]])
  assert.equal(exact.proximo, null, 'the limit equals the total: there is no next page')
  const one = x.rele.postsOf(a.uid, { completo: true, limite: 1 })
  assert.deepEqual(order(one), [ids[2]])
  assert.deepEqual(order(x.rele.postsOf(a.uid, { completo: true, limite: 1, antes: one.proximo })), [ids[1]])
  // the same path serves the home timeline
  const segment = x.rover()
  x.ok(segment, 'seguir', { alvo: a.uid })
  const l1 = x.rele.homeTimeline(segment.uid, { completo: true, limite: 2 })
  assert.deepEqual(order(l1), [ids[2], ids[1]])
  assert.deepEqual(order(x.rele.homeTimeline(segment.uid, { completo: true, limite: 2, antes: l1.proximo })), [ids[0]])
})
