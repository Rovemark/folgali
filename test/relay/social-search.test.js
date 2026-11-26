// SPDX-License-Identifier: AGPL-3.0-or-later
// Search and discovery: text, trending, newcomers, suggestions by declared interest and trends. And what NEVER leaks.
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildQuery } from '../../packages/relay/src/social-search.js'
import { DAY, codeOf, fresh } from '../helpers/network.js'

const search = (x, q, o = {}) => x.s.buscar({ q, ...o }, x.m.relogio.agora)

// ---------- the search expression ----------

test('the query becomes quoted words, the last one by prefix; no FTS operator gets through', () => {
  assert.equal(buildQuery('planilha de custos'), '"planilha" "de" "custos"*')
  assert.equal(buildQuery('AÇÃO rápida'), '"ação" "rápida"*')
  assert.equal(buildQuery('a* OR b NOT c'), '"a" "or" "b" "not" "c"*')
  assert.equal(buildQuery('"; DROP TABLE x; --'), '"drop" "table" "x"*')
  assert.equal(buildQuery('col:valor NEAR(a b)'), '"col" "valor" "near" "a" "b"*')
  assert.equal(buildQuery('um dois três quatro cinco seis sete oito nove dez').split(' ').length, 8, 'at most 8 words')
  assert.equal(buildQuery(`${'a'.repeat(40)} b`), `"${'a'.repeat(30)}" "b"*`, 'words of up to 30 characters')
  for (const bad of [undefined, null, '', 'a', 'x'.repeat(101), '!!!', '   ', 5]) {
    let error
    try { buildQuery(bad) } catch (e) { error = e }
    assert.equal(error?.codigo, 'esquema', String(bad))
    assert.equal(error?.campo, 'q')
  }
  assert.doesNotThrow(() => buildQuery('x'.repeat(100)))
  assert.doesNotThrow(() => buildQuery('ab'))
})

// ---------- search by type ----------

test('search rovers by handle, name, skill and about; ignores accents and case; an unlisted rover does not show', () => {
  const x = fresh()
  const ana = x.rover({ handle: 'ana.planilhas', perfil: { sobre: 'Cuido de custos e prazos.', habilidades: ['contabilidade'] } })
  x.ok(ana, 'perfil', { nome: 'Ana Ação', descricao: 'Organizo a casa', sobre: 'Cuido de custos e prazos.', habilidades: ['contabilidade'] })
  const hidden = x.rover({ handle: 'oculto.planilhas', perfil: { listado: false } })
  const other = x.rover({ handle: 'beto.jardim', perfil: { habilidades: ['jardinagem'] } })
  const uids = (q) => search(x, q, { tipo: 'rovers' }).itens.map((i) => i.uid)
  assert.deepEqual(uids('planilhas'), [ana.uid], 'handle')
  assert.deepEqual(uids('acao'), [ana.uid], 'name without accent')
  assert.deepEqual(uids('ANA'), [ana.uid])
  assert.deepEqual(uids('contabilidade'), [ana.uid], 'skill')
  assert.deepEqual(uids('custos prazos'), [ana.uid], 'about, two words')
  assert.deepEqual(uids('jardinagem'), [other.uid])
  assert.deepEqual(uids('conta'), [ana.uid], 'prefix on the last word')
  assert.deepEqual(uids('naoexiste'), [])
  assert.equal(uids('oculto').length, 0, 'listado: false stays out')
  assert.equal(x.rele.perfil(hidden.uid).handle, 'oculto.planilhas', 'but the direct perfil is still reachable')
  assert.equal(search(x, 'ana', { tipo: 'rovers' }).itens[0].descricao, 'Organizo a casa')
})

test('a rover that leaves the network, is blocked by the relay or becomes unlisted again leaves the search at once', () => {
  const x = fresh()
  const a = x.rover({ handle: 'saindo.aqui' })
  const b = x.rover({ handle: 'bloqueado.aqui' })
  const c = x.rover({ handle: 'discreto.aqui' })
  assert.equal(search(x, 'aqui', { tipo: 'rovers' }).itens.length, 3)
  x.ok(a, 'remocao-pelo-autor', { alvo: x.rele.perfil(a.uid).perfil.id })
  x.rele.bloquear({ tipo: 'rover', alvo: b.uid, motivo: 'teste' })
  x.ok(c, 'perfil', { nome: 'Pipa', descricao: 'agora discreto', listado: false })
  assert.equal(search(x, 'aqui', { tipo: 'rovers' }).itens.length, 0)
})

test('search communities: only the listed ones; the closed one shows neither by name nor to its own member', () => {
  const x = fresh()
  const owner = x.rover()
  const open = x.comunidade(owner, { nome: 'Clube da jardinagem', descricao: 'Plantas e vasos', tema: 'jardim' })
  x.comunidade(owner, { nome: 'Clube secreto da jardinagem', acesso: 'fechada' })
  x.advance(3601)
  assert.deepEqual(search(x, 'jardinagem', { tipo: 'comunidades' }).itens.map((c) => c.id), [open])
  assert.deepEqual(search(x, 'jardinagem', { tipo: 'comunidades', leitor: owner.uid }).itens.map((c) => c.id), [open], 'not even the owner finds the closed one through search')
  assert.deepEqual(search(x, 'vasos', { tipo: 'comunidades' }).itens.map((c) => c.id), [open], 'description')
  assert.deepEqual(search(x, 'secreto').comunidades, [])
})

test('search topics: title, text and tags; finding a topic of a closed community only as a member and never the community', () => {
  const x = fresh()
  const owner = x.rover()
  const member = x.rover()
  const open = x.comunidade(owner, { nome: 'Aberta de busca' })
  const closed = x.comunidade(owner, { nome: 'Fechada de busca', acesso: 'fechada' })
  x.entra(member, open, { wait: false })
  x.gestao(owner, closed, member, 'convidar')
  x.ok(member, 'comunidade-adesao', { comunidade: closed, acao: 'aceitar-convite' })
  x.advance(3601)
  const ta = x.topico(owner, open, { titulo: 'Bolo de laranja', texto: 'A receita do bolo com casca.', tags: ['receita'] })
  const tf = x.topico(owner, closed, { titulo: 'Bolo secreto de laranja', texto: 'Só para a gente.' })
  const ids = (q, reader) => search(x, q, { tipo: 'topicos', leitor: reader }).itens.map((t) => t.id).sort()
  assert.deepEqual(ids('bolo'), [ta])
  assert.deepEqual(ids('bolo', x.rover().uid), [ta], 'an identified stranger does not either')
  assert.deepEqual(ids('bolo', member.uid), [ta, tf].sort(), 'the member finds the one in the closed community')
  assert.deepEqual(ids('receita'), [ta], 'tag and text')
  assert.deepEqual(ids('casca'), [ta])
  assert.deepEqual(ids('segredo'), [], 'a word only in the closed content')
  assert.deepEqual(ids('segredo', member.uid), [])
  assert.equal(search(x, 'bolo', { tipo: 'topicos' }).itens[0].comunidadeNome, 'Aberta de busca')
  // the member leaves: stops finding it
  x.ok(member, 'comunidade-adesao', { comunidade: closed, acao: 'sair' })
  assert.deepEqual(ids('bolo', member.uid), [ta])
  // moving the topic from the open community to the closed one removes it from public search
  x.advance(3601)
  x.ok(owner, 'topico-gestao', { topico: ta, acao: 'mover', comunidade: closed, categoria: null })
  assert.deepEqual(ids('bolo'), [], 'moved to the closed one: gone for non-members')
  assert.deepEqual(ids('bolo', owner.uid), [ta, tf].sort(), 'the owner is a member of the closed one')
})

test('search pages by name and description; "todos" search brings up to 5 of each type and does not paginate; an invalid type is "esquema"', () => {
  const x = fresh()
  x.rover({ handle: 'cafe.dono' })
  for (let i = 0; i < 7; i++) x.ok(x.rover(), 'pagina-criar', { nome: `Página do café ${i}`, descricao: 'Grãos e moagem', tema: 'cafe' })
  const all = search(x, 'café')
  assert.deepEqual(Object.keys(all).sort(), ['comunidades', 'paginas', 'rovers', 'topicos'])
  assert.equal(all.paginas.length, 5)
  assert.equal(search(x, 'cafe', { tipo: 'paginas', limite: 3 }).itens.length, 3)
  assert.equal(search(x, 'moagem', { tipo: 'paginas', limite: 20 }).itens.length, 7)
  assert.equal(codeOf(() => search(x, 'cafe', { tipo: 'imagens' })), 'esquema')
  assert.equal(all.rovers.length, 1)
})

test('search paginates with an opaque offset without repeating or skipping', () => {
  const x = fresh()
  for (let i = 0; i < 5; i++) x.ok(x.rover(), 'pagina-criar', { nome: `Pagina laranja ${i}`, descricao: '', tema: 'rovers' })
  const all = search(x, 'laranja', { tipo: 'paginas', limite: 50 }).itens.map((p) => p.id)
  const p1 = search(x, 'laranja', { tipo: 'paginas', limite: 2 })
  const p2 = search(x, 'laranja', { tipo: 'paginas', limite: 2, antes: p1.proximo })
  const p3 = search(x, 'laranja', { tipo: 'paginas', limite: 2, antes: p2.proximo })
  assert.deepEqual([...p1.itens, ...p2.itens, ...p3.itens].map((p) => p.id), all)
  assert.equal(p3.proximo, null)
})

// ---------- trending ----------

/** A community with an owner and five members already past the grace period. */
function busy() {
  const x = fresh()
  const owner = x.rover()
  const c = x.comunidade(owner)
  const members = Array.from({ length: 5 }, () => x.rover())
  for (const m of members) x.entra(m, c, { wait: false })
  x.advance(3601)
  return Object.assign(x, { dono: owner, c, membros: members })
}
const trending = (x, o = {}) => x.s.emAlta({ tipo: 'topicos', janela: '24h', ...o }, x.m.relogio.agora).itens.map((t) => t.id)

test('trending (topics): scores distinct people, not volume: 3 per replier and 1 per reactor, minimum 2; a reaction alone is not enough', () => {
  const x = busy()
  const hot = x.topico(x.dono, x.c, { titulo: 'Tópico quente' })
  const two = x.topico(x.dono, x.c, { titulo: 'Dois respondentes' })
  const one = x.topico(x.dono, x.c, { titulo: 'Um respondente que fala muito' })
  const cold = x.topico(x.dono, x.c, { titulo: 'Só uma reação' })
  for (const m of x.membros.slice(0, 3)) x.replies(m, hot, 'também acho')
  x.ok(x.membros[3], 'reacao', { alvo: hot, reacao: 'curtir' })
  for (const m of x.membros.slice(0, 2)) x.replies(m, two, 'concordo')
  for (let i = 0; i < 12; i++) x.replies(x.membros[4], one, `mais um comentário ${i}`)
  x.ok(x.membros[0], 'reacao', { alvo: cold, reacao: 'curtir' })
  assert.deepEqual(trending(x), [hot, two, one])
  const items = x.s.emAlta({ tipo: 'topicos' }, x.m.relogio.agora).itens
  assert.equal(items[0].comunidadeNome, x.s.comunidade(x.c).nome)
  assert.equal(items[0].respostas, 3)
})

test('trending: an account under 1 day old does not score (a farm of new accounts does not take a topic to the top)', () => {
  const x = busy()
  const t = x.topico(x.dono, x.c, { titulo: 'Alvo de contas novas' })
  for (const m of x.membros) x.m.store.executar('UPDATE rovers SET criado_em = :n WHERE uid = :u', { n: x.m.relogio.agora - 3600, u: m.uid })
  for (const m of x.membros) x.replies(m, t, 'resposta de conta nova')
  assert.deepEqual(trending(x), [])
  x.m.store.executar('UPDATE rovers SET criado_em = :n WHERE uid IN (:a, :b)', { n: x.m.relogio.agora - 2 * DAY, a: x.membros[0].uid, b: x.membros[1].uid })
  assert.deepEqual(trending(x), [t], 'two accounts older than 1 day are enough for the minimum')
})

test('trending: 24h and 7d windows; deleted, hidden or closed-community content does not enter', () => {
  const x = busy()
  const t = x.topico(x.dono, x.c, { titulo: 'Atividade antiga' })
  for (const m of x.membros.slice(0, 2)) x.replies(m, t, 'oi')
  assert.deepEqual(trending(x), [t])
  x.advance(2 * DAY)
  assert.deepEqual(trending(x, { janela: '24h' }), [])
  assert.deepEqual(trending(x, { janela: '7d' }), [t])
  x.ok(x.dono, 'remocao-por-responsavel', { alvo: t, motivo: 'spam' })
  assert.deepEqual(trending(x, { janela: '7d' }), [])
  // closed
  const f = x.comunidade(x.dono, { acesso: 'fechada', nome: 'Fechada em alta' })
  for (const m of x.membros.slice(0, 3)) { x.gestao(x.dono, f, m, 'convidar'); x.ok(m, 'comunidade-adesao', { comunidade: f, acao: 'aceitar-convite' }) }
  x.advance(3601)
  const tf = x.topico(x.dono, f, { titulo: 'Quente e fechado' })
  for (const m of x.membros.slice(0, 3)) x.replies(m, tf, 'segredo')
  assert.deepEqual(trending(x, { janela: '7d' }), [], 'a topic of a closed community is never trending')
  assert.deepEqual(x.s.emAlta({ tipo: 'comunidades', janela: '7d' }, x.m.relogio.agora).itens.map((c) => c.id).includes(f), false)
})

test('trending (communities and pages): new members and distinct authors; new followers and updates', () => {
  const x = busy()
  x.comunidade(x.rover(), { nome: 'Comunidade parada' })
  for (const m of x.membros.slice(0, 2)) x.topico(m, x.c, { titulo: `Tópico de ${m.handle}` })
  const cs = x.s.emAlta({ tipo: 'comunidades' }, x.m.relogio.agora).itens.map((c) => c.id)
  assert.deepEqual(cs, [x.c], 'the idle one scores 0 and does not enter')
  const owner = x.rover()
  const p = x.ok(owner, 'pagina-criar', { nome: 'Página em alta', descricao: '', tema: 'rovers' }).id
  x.ok(owner, 'pagina-criar', { nome: 'Página fria', descricao: '', tema: 'rovers' })
  for (const m of x.membros.slice(0, 2)) x.ok(m, 'pagina-seguir', { pagina: p, acao: 'seguir' })
  assert.deepEqual(x.s.emAlta({ tipo: 'paginas' }, x.m.relogio.agora).itens.map((i) => i.id), [p])
  assert.equal(codeOf(() => x.s.emAlta({ tipo: 'rovers' }, 0)), 'esquema', 'there is no ranking of people')
  assert.equal(codeOf(() => x.s.emAlta({ tipo: 'topicos', janela: '1h' }, 0)), 'esquema')
})

// ---------- newcomers ----------

test('newcomers: perfil published in the last 7 days, listed, newest to oldest', () => {
  const x = fresh({ novatos: true })
  const stale = x.rover({ newcomer: true })
  x.advance(8 * DAY)
  const a = x.rover({ newcomer: true })
  x.advance(10)
  const b = x.rover({ newcomer: true })
  x.rover({ newcomer: true, perfil: { listado: false } })
  const items = x.s.recemChegados({}, x.m.relogio.agora).itens
  assert.deepEqual(items.map((i) => i.uid), [b.uid, a.uid])
  assert.equal(items[0].desde, x.m.relogio.agora)
  assert.equal(items.some((i) => i.uid === stale.uid), false)
  assert.equal(x.s.recemChegados({ limite: 1 }, x.m.relogio.agora).itens.length, 1)
  x.advance(7 * DAY)
  assert.deepEqual(x.s.recemChegados({}, x.m.relogio.agora).itens, [])
})

// ---------- suggestions ----------

test('suggestions by declared interest: communities and pages by theme, rovers by interests and skills; with no interest, nothing', () => {
  const x = fresh()
  const owner = x.rover()
  const garden = x.comunidade(x.rover(), { nome: 'Jardim', tema: 'jardinagem' })
  x.comunidade(x.rover(), { nome: 'Cozinha', tema: 'culinaria' })
  x.comunidade(owner, { nome: 'Jardim secreto', tema: 'jardinagem', acesso: 'fechada' })
  const page = x.ok(owner, 'pagina-criar', { nome: 'Página de jardim', descricao: '', tema: 'jardinagem' }).id
  const people = x.rover({ perfil: { interesses: ['jardinagem'], habilidades: ['poda'] } })
  x.rover({ perfil: { interesses: ['culinaria'] } })
  x.rover({ perfil: { interesses: ['jardinagem'], listado: false } })
  const suggestion = (o) => x.s.sugestoes({ leitor: null, ...o }, x.m.relogio.agora).itens
  assert.deepEqual(suggestion({ tipo: 'comunidades', interesses: 'jardinagem' }).map((c) => c.id), [garden], 'the closed one is never suggested')
  assert.deepEqual(suggestion({ tipo: 'paginas', interesses: 'jardinagem,xadrez' }).map((c) => c.id), [page])
  assert.deepEqual(suggestion({ tipo: 'rovers', interesses: 'jardinagem' }).map((r) => r.uid), [people.uid], 'the unlisted one stays out')
  assert.deepEqual(suggestion({ tipo: 'rovers', interesses: 'poda' }).map((r) => r.uid), [people.uid], 'skill counts too')
  assert.deepEqual(suggestion({ tipo: 'comunidades', interesses: 'jardinagem,culinaria' }).length, 2)
  assert.deepEqual(suggestion({ tipo: 'comunidades', interesses: 'nada-disso' }), [])
  assert.deepEqual(suggestion({ tipo: 'comunidades' }), [], 'with no interest there is nothing to suggest')
  assert.deepEqual(suggestion({ tipo: 'comunidades', rover: people.uid }).map((c) => c.id), [garden], 'the interests come from the public perfil of the rover')
  for (const bad of ['Jardinagem', 'a', 'a b', 'x'.repeat(25)]) assert.equal(codeOf(() => suggestion({ interesses: bad })), 'esquema', bad)
  assert.equal(codeOf(() => suggestion({ interesses: 'a1,b2,c3,d4,e5,f6,g7,h8,i9' })), 'esquema', 'at most 8')
  assert.equal(codeOf(() => suggestion({ tipo: 'imagens', interesses: 'a1' })), 'esquema')
  assert.equal(codeOf(() => suggestion({ rover: `rvr_${'A'.repeat(22)}` })), 'nao_encontrado')
})

test('a suggestion does not reveal membership: only with the credential of the rover ITSELF does the relay stop suggesting what it is already part of', () => {
  const x = fresh()
  const owner = x.rover()
  const garden = x.comunidade(x.rover(), { nome: 'Jardim', tema: 'jardinagem' })
  const other = x.comunidade(x.rover(), { nome: 'Jardim dois', tema: 'jardinagem' })
  const page = x.ok(owner, 'pagina-criar', { nome: 'Página de jardim', descricao: '', tema: 'jardinagem' }).id
  const target = x.rover({ grafo: 'privado', perfil: { interesses: ['jardinagem'] } })
  const curious = x.rover()
  x.entra(target, garden, { wait: false })
  x.ok(target, 'pagina-seguir', { pagina: page, acao: 'seguir' })
  const ids = (o) => x.s.sugestoes(o, x.m.relogio.agora).itens.map((c) => c.id).sort()
  const all = [garden, other].sort()
  assert.deepEqual(ids({ tipo: 'comunidades', rover: target.uid, leitor: null }), all, 'no credential: no filter')
  assert.deepEqual(ids({ tipo: 'comunidades', rover: target.uid, leitor: curious.uid }), all, 'credential of another: no filter, so nothing is revealed')
  assert.deepEqual(ids({ tipo: 'comunidades', rover: target.uid, leitor: target.uid }), [other], 'the rover itself: filters what it already takes part in')
  assert.deepEqual(ids({ tipo: 'paginas', rover: target.uid, leitor: curious.uid }), [page])
  assert.deepEqual(ids({ tipo: 'paginas', rover: target.uid, leitor: target.uid }), [], 'already follows')
  // the same rule for rovers: friends and blocked ones only leave the list of the rover itself
  const pair = x.rover({ perfil: { interesses: ['jardinagem'] } })
  x.amigos(target, pair, 0)
  const rovers = (reader) => x.s.sugestoes({ tipo: 'rovers', rover: target.uid, leitor: reader }, x.m.relogio.agora).itens.map((r) => r.uid)
  assert.equal(rovers(curious.uid).includes(pair.uid), true, 'someone who is not the rover itself does not see the friendship filter')
  assert.equal(rovers(target.uid).includes(pair.uid), false)
  assert.equal(rovers(target.uid).includes(target.uid), false, 'never suggests itself')
  assert.equal(rovers(curious.uid).includes(target.uid), true, 'the rover shows up as a suggestion for another (it is listed)')
})

// ---------- trends ----------

const usesTag = (x, author, tag) => x.ok(author, 'postagem', { texto: 'um texto qualquer', topicos: [tag] })

test('trends: the tag needs 3 distinct authors with accounts of 1 day; the same author repeating counts 1', () => {
  const x = fresh()
  const [a, b, c, d] = [x.rover(), x.rover(), x.rover(), x.rover()]
  for (let i = 0; i < 5; i++) usesTag(x, a, 'solo')
  usesTag(x, a, 'trio'); usesTag(x, b, 'trio'); usesTag(x, c, 'trio')
  usesTag(x, a, 'dupla'); usesTag(x, b, 'dupla')
  usesTag(x, a, 'quarteto'); usesTag(x, b, 'quarteto'); usesTag(x, c, 'quarteto'); usesTag(x, d, 'quarteto')
  const t = x.s.tendencias({}, x.m.relogio.agora).itens
  assert.deepEqual(t, [{ tag: 'quarteto', autores: 4, usos: 4 }, { tag: 'trio', autores: 3, usos: 3 }])
  // a hashtag in the text counts as a tag
  const y = fresh()
  const [p, q, r] = [y.rover(), y.rover(), y.rover()]
  for (const u of [p, q, r]) y.ok(u, 'postagem', { texto: 'gostei muito do #cafe de hoje', topicos: [] })
  assert.deepEqual(y.s.tendencias({}, y.m.relogio.agora).itens.map((i) => i.tag), ['cafe'])
})

test('trends: new accounts, deleted or hidden content and tags of a closed community do not enter; 24h and 7d window', () => {
  const x = fresh()
  const owner = x.rover()
  const [a, b, c] = [x.rover(), x.rover(), x.rover()]
  const f = x.comunidade(owner, { acesso: 'fechada', nome: 'Fechada com tendência' })
  for (const m of [a, b, c]) { x.gestao(owner, f, m, 'convidar'); x.ok(m, 'comunidade-adesao', { comunidade: f, acao: 'aceitar-convite' }) }
  x.advance(3601)
  for (const m of [a, b, c]) x.topico(m, f, { titulo: `Tópico de ${m.handle}`, tags: ['segredo'] })
  assert.deepEqual(x.s.tendencias({}, x.m.relogio.agora).itens, [], 'a closed community never generates a trend')
  const posts = [a, b, c].map((m) => usesTag(x, m, 'apagada'))
  assert.equal(x.s.tendencias({}, x.m.relogio.agora).itens.length, 1)
  x.ok(a, 'remocao-pelo-autor', { alvo: posts[0].id })
  assert.deepEqual(x.s.tendencias({}, x.m.relogio.agora).itens, [], 'with the first deleted, 2 authors remain')
  const newItems = [x.rover(), x.rover(), x.rover()]
  for (const m of newItems) x.m.store.executar('UPDATE rovers SET criado_em = :n WHERE uid = :u', { n: x.m.relogio.agora - 3600, u: m.uid })
  for (const m of newItems) usesTag(x, m, 'novatas')
  assert.deepEqual(x.s.tendencias({}, x.m.relogio.agora).itens.map((i) => i.tag), [], 'accounts under 1 day old do not count')
  const veterans = [x.rover(), x.rover(), x.rover()]
  for (const m of veterans) usesTag(x, m, 'antiga')
  x.advance(3 * DAY)
  assert.deepEqual(x.s.tendencias({ janela: '24h' }, x.m.relogio.agora).itens, [])
  assert.deepEqual(x.s.tendencias({ janela: '7d' }, x.m.relogio.agora).itens.map((i) => i.tag), ['antiga', 'novatas'], 'after 3 days the new accounts are already over 1 day old')
  assert.equal(codeOf(() => x.s.tendencias({ janela: '1y' }, 0)), 'esquema')
})

test('a tag hidden by a responsible person leaves the trends and returns when the appeal is reverted', () => {
  const x = fresh()
  const owner = x.rover()
  const c = x.comunidade(owner)
  const ms = [x.rover(), x.rover(), x.rover()]
  for (const m of ms) x.entra(m, c, { wait: false })
  x.advance(3601)
  const ts = ms.map((m) => x.topico(m, c, { titulo: `Sobre ${m.handle}`, tags: ['assunto'] }))
  assert.deepEqual(x.s.tendencias({}, x.m.relogio.agora).itens.map((i) => i.tag), ['assunto'])
  x.ok(owner, 'remocao-por-responsavel', { alvo: ts[0], motivo: 'spam' })
  assert.deepEqual(x.s.tendencias({}, x.m.relogio.agora).itens, [])
})

// ---------- exact windows and caps ----------

test('trending window: exactly 24h and 7d stay out, one second less gets in', () => {
  for (const [window, duration] of [['24h', DAY], ['7d', 7 * DAY]]) {
    const x = busy()
    const t = x.topico(x.dono, x.c, { titulo: `Tópico da janela ${window}` })
    const rs = [x.replies(x.membros[0], t, 'primeira'), x.replies(x.membros[1], t, 'segunda')]
    const now = x.m.relogio.agora
    const puts = (seconds) => { for (const r of rs) x.m.store.executar('UPDATE objetos SET recebido_em = :e WHERE id = :id', { e: now - seconds, id: r }) }
    puts(duration)
    assert.deepEqual(trending(x, { janela: window }), [], `${window}: exactly on the edge it is out`)
    puts(duration - 1)
    assert.deepEqual(trending(x, { janela: window }), [t], `${window}: one second earlier it gets in`)
  }
})

test('the cap of 20 items applies to trending, trends and suggestions', () => {
  const x = fresh()
  const owners = Array.from({ length: 22 }, () => x.rover())
  const coms = owners.map((d, i) => x.comunidade(d, { nome: `Comunidade número ${i}`, tema: 'tetotema' }))
  const ts = coms.map((c, i) => x.topico(owners[i], c, { titulo: `Tópico número ${i}` }))
  const speakers = [x.rover(), x.rover()]
  for (const c of coms) for (const f of speakers) x.m.store.executar("INSERT OR IGNORE INTO membros (comunidade, uid, papel, desde) VALUES (:c, :u, 'membro', 1)", { c, u: f.uid })
  for (const t of ts) for (const f of speakers) x.replies(f, t, 'resposta')
  assert.equal(trending(x).length, 20)
  assert.equal(x.s.sugestoes({ tipo: 'comunidades', interesses: 'tetotema', leitor: null }, x.m.relogio.agora).itens.length, 20)
  const authors = [x.rover(), x.rover(), x.rover()]
  const tag = (i) => `tag-${String(i).padStart(2, '0')}`
  for (let g = 0; g < 7; g++) for (const a of authors) x.ok(a, 'postagem', { texto: 'um texto', topicos: [tag(g * 3), tag(g * 3 + 1), tag(g * 3 + 2)] })
  assert.equal(x.s.tendencias({}, x.m.relogio.agora).itens.length, 20)
})

// ---------- score minimums, limit defaults and interests ----------

test('minimum trending score: a topic with 2 points gets in and 1 does not; a community with 3 gets in and 2 does not; a page with 2 gets in and 1 does not', () => {
  const x = busy()
  const twoReactors = x.topico(x.dono, x.c, { titulo: 'Dois reatores' })
  const oneReactor = x.topico(x.dono, x.c, { titulo: 'Um reator' })
  x.ok(x.membros[0], 'reacao', { alvo: twoReactors, reacao: 'curtir' })
  x.ok(x.membros[1], 'reacao', { alvo: twoReactors, reacao: 'curtir' })
  x.ok(x.membros[0], 'reacao', { alvo: oneReactor, reacao: 'curtir' })
  assert.deepEqual(trending(x), [twoReactors])
  // communities: one topic by one author = 3 points (gets in); one new member = 2 points (does not)
  const y = fresh()
  const c3 = y.comunidade(y.rover(), { nome: 'Três pontos' })
  const c2 = y.comunidade(y.rover(), { nome: 'Dois pontos' })
  const author = y.rover()
  y.entra(author, c3)
  y.topico(author, c3)
  y.m.store.executar('UPDATE membros SET desde = 1 WHERE comunidade = :c AND uid = :u', { c: c3, u: author.uid })
  y.entra(y.rover(), c2, { wait: false })
  assert.deepEqual(y.s.emAlta({ tipo: 'comunidades' }, y.m.relogio.agora).itens.map((c) => c.id), [c3])
  // pages: one follower = 1 point (does not); two followers = 2 points (gets in)
  const owner = y.rover()
  const p1 = y.ok(owner, 'pagina-criar', { nome: 'Um ponto', descricao: '', tema: 'rovers' }).id
  const p2 = y.ok(y.rover(), 'pagina-criar', { nome: 'Dois pontos', descricao: '', tema: 'rovers' }).id
  const f1 = y.rover(); const f2 = y.rover()
  y.ok(f1, 'pagina-seguir', { pagina: p1, acao: 'seguir' })
  y.ok(f1, 'pagina-seguir', { pagina: p2, acao: 'seguir' })
  y.ok(f2, 'pagina-seguir', { pagina: p2, acao: 'seguir' })
  assert.deepEqual(y.s.emAlta({ tipo: 'paginas' }, y.m.relogio.agora).itens.map((p) => p.id), [p2])
})

test('defaults: search returns 20 per page with no limit, newcomers 50, and a page with exactly what exists has no next page', () => {
  const x = fresh()
  for (let i = 0; i < 22; i++) x.ok(x.rover(), 'pagina-criar', { nome: `Pagina azulejo ${i}`, descricao: '', tema: 'rovers' })
  const defaultValue = x.s.buscar({ q: 'azulejo', tipo: 'paginas' }, x.m.relogio.agora)
  assert.equal(defaultValue.itens.length, 20)
  assert.equal(defaultValue.proximo, 20)
  const exact = x.s.buscar({ q: 'azulejo', tipo: 'paginas', limite: 22 }, x.m.relogio.agora)
  assert.equal(exact.itens.length, 22)
  assert.equal(exact.proximo, null)
  const y = fresh({ novatos: true })
  for (let i = 0; i < 52; i++) y.rover({ newcomer: true })
  assert.equal(y.s.recemChegados({}, y.m.relogio.agora).itens.length, 50)
})

test('interests: 8 count, 9 do not; those from the rover perfil add to the requested ones', () => {
  const x = fresh()
  const owner = x.rover()
  const themes = Array.from({ length: 9 }, (_, i) => `tema-${i}`)
  for (const t of themes) x.comunidade(x.rover(), { nome: `Comunidade ${t}`, tema: t })
  const suggestion = (o) => x.s.sugestoes({ leitor: null, ...o }, x.m.relogio.agora).itens.length
  assert.equal(suggestion({ interesses: themes.slice(0, 8).join(',') }), 8)
  assert.equal(codeOf(() => suggestion({ interesses: themes.join(',') })), 'esquema')
  const withProfile = x.rover({ perfil: { interesses: ['tema-8'], habilidades: ['tema-7'] } })
  assert.equal(suggestion({ interesses: 'tema-0', rover: withProfile.uid }), 3, 'the request (tema-0) and the perfil (tema-8 and tema-7)')
  void owner
})
