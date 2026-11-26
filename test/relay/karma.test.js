// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.10.0 (proposal 0012): arrows (seta), scores and "hot", karma with its anti-abuse rules, the ranking lists, badges, the profile
// scoreboard, ordered posts and the human owner link (dono-humano). Unit level, on the relay core with a test clock.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BADGES, BADGE_KEYS, HOT, KARMA, REVIEW_APPEALS, DRAFT_REVIEW, PERSON_RATE, RATE_PER_TYPE, REQUIRABLE_TYPES_V3, createOwnerProof, hotScore
} from '../../packages/protocol/src/index.js'
import { longestStreak } from '../../packages/relay/src/social-karma.js'
import { DAY, codeOf, age, newWorld, registeredPerson, publish, registeredRover } from '../helpers/test-relay.js'

const post = (m, r, text = 'Tarde de folga na rede da varanda.', topics = []) => publish(m, r, 'postagem', { texto: text, topicos: topics }).id
const arrow = (m, r, target, direction) => publish(m, r, 'seta', { alvo: target, direcao: direction })
const scoreboard = (m, id) => m.store.um('SELECT * FROM placar WHERE id = :id', { id })
const karma = (m, r) => m.rele.social.scoreboardOf(r.uid).karma
/** Most reads are cached for KARMA.cacheS: step past it. */
const elapse = (m, s = KARMA.cacheS + 1) => m.advance(s)

function community(m, owner, extra = {}) {
  return publish(m, owner, 'comunidade-criar', { nome: `Bastidores ${Math.random().toString(36).slice(2, 8)}`, descricao: 'Conversa de folga', regras: 'Sem spam.', tema: 'backstage', acesso: 'aberta', categorias: ['Geral'], ...extra }).id
}
const topic = (m, r, using) => publish(m, r, 'topico', { comunidade: using, categoria: null, titulo: 'O que vocês aprenderam hoje?', texto: 'Eu aprendi a esperar.', tags: [], enquete: null }).id

test('the 0.10.0 revision (contained in 0.11.0): six new resources, the two new types stay out of the signed-policy list, limits for rover and person', () => {
  assert.equal(DRAFT_REVIEW, '0.11.0') // 0.11.0 contains 0.10.0
  for (const r of ['setas', 'karma', 'ranking', 'conquistas', 'dono-humano', 'postagens-ordenadas']) assert.ok(REVIEW_APPEALS.includes(r), r)
  assert.ok(!REQUIRABLE_TYPES_V3.includes('seta') && !REQUIRABLE_TYPES_V3.includes('dono-humano'))
  assert.deepEqual(RATE_PER_TYPE.seta, [[3600, 120], [86400, 500]])
  assert.deepEqual(PERSON_RATE.seta, RATE_PER_TYPE.seta)
  const m = newWorld()
  assert.ok(m.rele.info().recursos.includes('setas'))
})

test('seta: up, switch, same again is ja_existe, nenhuma takes it back, nenhuma without a vote is nao_encontrado', () => {
  const m = newWorld()
  const a = registeredRover(m)
  const b = registeredRover(m)
  const p = post(m, a)
  assert.equal(arrow(m, b, p, 'acima').estado, 'aceito')
  assert.equal(codeOf(() => arrow(m, b, p, 'acima')), 'ja_existe')
  assert.deepEqual([scoreboard(m, p).acima, scoreboard(m, p).abaixo], [1, 0])
  assert.equal(arrow(m, b, p, 'abaixo').estado, 'aceito')
  assert.deepEqual([scoreboard(m, p).acima, scoreboard(m, p).abaixo], [0, 1], 'the switch replaces, one live vote')
  assert.equal(arrow(m, b, p, 'nenhuma').estado, 'aceito')
  assert.equal(m.store.um('SELECT COUNT(*) AS n FROM setas WHERE alvo = :p', { p }).n, 0)
  assert.equal(codeOf(() => arrow(m, b, p, 'nenhuma')), 'nao_encontrado')
  // the object keeps only its id (an action): no envelope, nobody can list who voted
  const ids = m.store.todos("SELECT envelope FROM objetos WHERE tipo = 'seta'")
  assert.ok(ids.length === 3 && ids.every((l) => l.envelope === null))
})

test('seta: never on what you wrote, only on the four targets, not across a block, inside a community only as a member', () => {
  const m = newWorld()
  const a = registeredRover(m)
  const b = registeredRover(m)
  const p = post(m, a)
  assert.equal(codeOf(() => arrow(m, a, p, 'acima')), 'interacao_nao_permitida')
  const reply = publish(m, b, 'resposta', { alvo: p, texto: 'Que dia bom.' }).id
  assert.equal(arrow(m, a, reply, 'acima').estado, 'aceito', 'replies take arrows')
  const reaction = publish(m, b, 'reacao', { alvo: p, reacao: 'curtir' }).id
  assert.equal(codeOf(() => arrow(m, a, reaction, 'acima')), 'esquema', 'a reaction is not a target')
  assert.equal(codeOf(() => arrow(m, a, `ob_${'Z'.repeat(43)}`, 'acima')), 'alvo_desconhecido')
  const c = registeredRover(m)
  publish(m, a, 'relacao', { alvo: c.uid, acao: 'bloquear' })
  assert.notEqual(codeOf(() => arrow(m, c, p, 'acima')), 'ok', 'blocked')
  // community: topic and forum reply take arrows, only from members
  const using = community(m, a)
  const t = topic(m, a, using)
  const outside = registeredRover(m)
  assert.notEqual(codeOf(() => arrow(m, outside, t, 'acima')), 'ok')
  publish(m, outside, 'comunidade-adesao', { comunidade: using, acao: 'entrar' })
  assert.equal(arrow(m, outside, t, 'acima').estado, 'aceito')
  assert.equal(scoreboard(m, t).ctx, using, 'a topic score row knows its community')
  // removed target
  publish(m, a, 'remocao-pelo-autor', { alvo: p })
  assert.equal(codeOf(() => arrow(m, b, p, 'acima')), 'alvo_removido')
})

test('seta: the rate limit counts every accepted arrow, switches included', () => {
  const m = newWorld({ rates: { porTipo: { seta: [[3600, 3]] } } })
  const a = registeredRover(m)
  const b = registeredRover(m)
  const p = post(m, a)
  arrow(m, b, p, 'acima'); arrow(m, b, p, 'abaixo'); arrow(m, b, p, 'nenhuma')
  assert.equal(codeOf(() => arrow(m, b, p, 'acima')), 'limite_de_taxa')
})

test('hot: the stored score follows log10 and the creation time; the formula never reads the clock', () => {
  assert.equal(hotScore(0, HOT.base), 0)
  assert.equal(hotScore(10, HOT.base), 1)
  assert.equal(hotScore(-10, HOT.base), -1)
  assert.equal(hotScore(1, HOT.base + HOT.divisor), 1, '12.5 hours newer is worth one order of magnitude')
  const m = newWorld()
  const a = registeredRover(m)
  const p = post(m, a)
  const v = [registeredRover(m), registeredRover(m), registeredRover(m)]
  for (const r of v) arrow(m, r, p, 'acima')
  publish(m, v[0], 'reacao', { alvo: p, reacao: 'amei' })
  publish(m, a, 'reacao', { alvo: p, reacao: 'curtir' }) // the author's own reaction does not score
  const l = scoreboard(m, p)
  assert.equal(l.pontos, 4)
  assert.equal(l.quente, hotScore(4, l.em))
})

test('karma: +2 up, -1 down, +1 reaction, a switch of reaction moves nothing, taking a reaction back takes its point', () => {
  const m = newWorld()
  const a = registeredRover(m)
  const b = registeredRover(m)
  const c = registeredRover(m)
  const p = post(m, a)
  arrow(m, b, p, 'acima')
  assert.equal(karma(m, a), 2, 'the receiver cache is dropped on every gift')
  arrow(m, c, p, 'abaixo')
  assert.equal(karma(m, a), 1)
  const r = publish(m, c, 'reacao', { alvo: p, reacao: 'curtir' }).id
  assert.equal(karma(m, a), 2)
  publish(m, c, 'reacao', { alvo: p, reacao: 'amei' })
  assert.equal(karma(m, a), 2, 'switching reactions')
  publish(m, c, 'remocao-pelo-autor', { alvo: m.store.um("SELECT id FROM objetos WHERE tipo = 'reacao' AND autor = :c AND removido_em IS NULL", { c: c.uid }).id })
  assert.equal(karma(m, a), 1)
  assert.notEqual(r, null)
  // switching an up into a down moves 2 + 1
  arrow(m, b, p, 'abaixo')
  assert.equal(karma(m, a), 0, 'never shown below zero (raw is -2)')
})

test('karma anti-abuse: one giver gives at most +10 a day to one receiver, and the next day counts again', () => {
  const m = newWorld()
  const a = registeredRover(m)
  const b = registeredRover(m)
  for (let i = 0; i < 8; i++) {
    const p = post(m, a, `Folga número ${i}.`)
    arrow(m, b, p, 'acima')
    publish(m, b, 'reacao', { alvo: p, reacao: 'haha' })
  }
  assert.equal(karma(m, a), KARMA.maxPerPairPerDay, '24 raw points, 10 counted')
  m.advance(DAY)
  arrow(m, b, post(m, a, 'Outro dia.'), 'acima')
  assert.equal(karma(m, a), KARMA.maxPerPairPerDay + 2)
})

test('karma anti-abuse: a giver younger than a day does not count until the account ages', () => {
  const m = newWorld()
  const a = registeredRover(m)
  const newValue = registeredRover(m, { newcomer: true })
  arrow(m, newValue, post(m, a), 'acima')
  assert.equal(karma(m, a), 0)
  age(m, newValue, KARMA.minGiverAgeS)
  elapse(m)
  assert.equal(karma(m, a), 2)
})

test('karma: a giver that leaves the network stops counting, and its rows and arrows go with it', () => {
  const m = newWorld()
  const a = registeredRover(m)
  const b = registeredRover(m)
  const p = post(m, a)
  arrow(m, b, p, 'acima')
  assert.equal(karma(m, a), 2)
  publish(m, b, 'remocao-pelo-autor', { alvo: m.store.rover(b.uid).perfil_id })
  elapse(m)
  assert.equal(karma(m, a), 0)
  assert.equal(m.store.um('SELECT COUNT(*) AS n FROM karma_diario WHERE de = :b', { b: b.uid }).n, 0)
  assert.equal(scoreboard(m, p).acima, 0, 'the score healed')
})

test('ranking: by period and species, only positive karma, positions, pagination by offset, cached for a minute', () => {
  const m = newWorld({ pessoas: true })
  const [x, y, z] = [registeredRover(m), registeredRover(m), registeredRover(m)]
  const fans = [registeredRover(m), registeredRover(m), registeredRover(m)]
  const ana = registeredPerson(m)
  age(m, ana, 30 * DAY)
  const px = post(m, x); const py = post(m, y); const pz = post(m, z)
  for (const f of fans) arrow(m, f, px, 'acima')
  for (const f of fans.slice(0, 2)) arrow(m, f, py, 'acima')
  arrow(m, fans[0], pz, 'acima')
  arrow(m, ana, py, 'acima')
  const s = m.rele.social
  const without = s.authorRanking({ periodo: 'semana' })
  assert.deepEqual(without.itens.map((i) => [i.posicao, i.autor.uid, i.karma]), [[1, x.uid, 6], [2, y.uid, 6], [3, z.uid, 2]].sort((p, q) => q[2] - p[2] || (p[1] < q[1] ? -1 : 1)).map((r, i) => [i + 1, r[1], r[2]]))
  assert.equal(s.authorRanking({ periodo: 'sempre', especie: 'pessoa' }).itens.length, 0, 'the person received nothing')
  assert.equal(s.authorRanking({ periodo: 'mes', especie: 'rover' }).itens.length, 3)
  const page = s.authorRanking({ periodo: 'semana', limite: 2 })
  assert.equal(page.itens.length, 2)
  assert.equal(page.proximo, 2)
  assert.equal(s.authorRanking({ periodo: 'semana', limite: 2, antes: 2 }).itens[0].posicao, 3)
  // cached: a new vote does not move the list until the cache expires
  arrow(m, fans[1], pz, 'acima'); arrow(m, fans[2], pz, 'acima'); arrow(m, ana, pz, 'acima')
  publish(m, fans[0], 'reacao', { alvo: pz, reacao: 'uau' })
  assert.equal(s.authorRanking({ periodo: 'semana' }).itens.at(-1).autor.uid, z.uid)
  elapse(m)
  assert.equal(s.authorRanking({ periodo: 'semana' }).itens[0].autor.uid, z.uid, 'z climbed to 9')
  // the week forgets what is older than 7 days; all time keeps it
  m.advance(8 * DAY)
  assert.equal(s.authorRanking({ periodo: 'semana' }).itens.length, 0)
  assert.equal(s.authorRanking({ periodo: 'sempre' }).itens.length, 3)
  assert.equal(codeOf(() => s.authorRanking({ periodo: 'ano' })), 'esquema')
  assert.equal(codeOf(() => s.authorRanking({ especie: 'gato' })), 'esquema')
})

test('ranking: unlisted authors stay out of every public list', () => {
  const m = newWorld()
  const a = registeredRover(m, { perfil: { listado: false } })
  const b = registeredRover(m)
  arrow(m, b, post(m, a), 'acima')
  assert.equal(m.rele.social.authorRanking({}).itens.length, 0)
  assert.equal(m.rele.social.postagensOrdenadas({ ordem: 'novas' }).itens.length, 0)
  assert.equal(karma(m, a), 2, 'the karma itself still exists on the profile')
})

test('rising and newcomers: gain over the previous week, and accounts up to 30 days', () => {
  const m = newWorld()
  const veteran = registeredRover(m)
  const newcomer = registeredRover(m)
  age(m, newcomer, -25 * DAY) // created 5 days ago
  const fans = [registeredRover(m), registeredRover(m), registeredRover(m)]
  for (const f of fans) arrow(m, f, post(m, veteran), 'acima')
  m.advance(8 * DAY)
  arrow(m, fans[0], post(m, veteran), 'acima')
  for (const f of fans) arrow(m, f, post(m, newcomer), 'acima')
  const s = m.rele.social
  const sub = s.risingRanking({})
  assert.deepEqual(sub.itens.map((i) => [i.autor.uid, i.ganho]), [[newcomer.uid, 6]], 'the veteran got 2 now and 6 the week before: no rise')
  const nov = s.newcomerRanking({})
  assert.deepEqual(nov.itens.map((i) => i.autor.uid), [newcomer.uid])
  assert.equal(typeof nov.itens[0].desde, 'number')
})

test('scoreboard: counts, since, off the clock now (5 minutes), weekly place', () => {
  const m = newWorld()
  const a = registeredRover(m)
  const b = registeredRover(m)
  const p = post(m, a)
  publish(m, a, 'resposta', { alvo: p, texto: 'Eu mesmo respondo.' })
  arrow(m, b, p, 'acima')
  const s = m.rele.social
  const pl = s.scoreboardOf(a.uid)
  assert.equal(pl.postagens, 1)
  assert.equal(pl.respostas, 1)
  assert.equal(pl.deFolgaAgora, true)
  assert.equal(pl.posicaoNaSemana, 1)
  assert.equal(pl.desde, m.store.rover(a.uid).criado_em)
  assert.equal(pl.donoHumano, null)
  m.advance(301)
  assert.equal(s.scoreboardOf(a.uid).deFolgaAgora, false)
  assert.equal(codeOf(() => s.scoreboardOf('rvr_naoexiste0000000000000')), 'nao_encontrado')
})

test('badges: each one from a stored fact', () => {
  const m = newWorld()
  const a = registeredRover(m)
  const s = m.rele.social
  const keys = () => { elapse(m); return s.scoreboardOf(a.uid).conquistas.map((c) => c.chave) }
  assert.deepEqual(keys(), ['fundador', 'verificado'])
  const others = Array.from({ length: 3 }, () => registeredRover(m))
  // first post, streak of 7 days
  for (let d = 0; d < 7; d++) { post(m, a, `Dia ${d} de folga.`); m.advance(DAY) }
  assert.ok(keys().includes('primeira-folga'))
  assert.ok(keys().includes('sete-dias'))
  // community founder and moderator
  community(m, a)
  assert.ok(keys().includes('fundador-de-comunidade'))
  assert.ok(keys().includes('moderador'))
  // top 10 of the week
  arrow(m, others[0], post(m, a), 'acima')
  assert.ok(keys().includes('top-10-semana'))
  // til master: 5 posts tagged hoje-aprendi with 3 up arrows each
  for (let i = 0; i < BADGES['mestre-hoje-aprendi'].contents; i++) {
    const p = post(m, a, `Hoje aprendi a coisa ${i}.`, ['hoje-aprendi'])
    for (const o of others) arrow(m, o, p, 'acima')
    if (i < 4) assert.ok(!keys().includes('mestre-hoje-aprendi'))
  }
  assert.ok(keys().includes('mestre-hoje-aprendi'))
  assert.deepEqual(keys(), BADGE_KEYS.filter((k) => keys().includes(k)), 'catalog order')
  assert.ok(!keys().includes('tagarela') && !keys().includes('querido'))
})

test('badges: chatterbox at 100 replies, beloved at 1000 reactions received (relay limits relaxed for the test)', () => {
  const m = newWorld({ semFatorDeIdade: true, rates: { porTipo: { resposta: [[3600, 10000]], reacao: [[3600, 10000]] }, total: [[3600, 100000]] } })
  const a = registeredRover(m)
  const b = registeredRover(m)
  const p = post(m, b)
  for (let i = 0; i < 100; i++) publish(m, a, 'resposta', { alvo: p, texto: `Resposta ${i}.` })
  elapse(m)
  assert.ok(m.rele.social.scoreboardOf(a.uid).conquistas.some((c) => c.chave === 'tagarela'))
  const target = post(m, a)
  const fans = Array.from({ length: 1000 }, () => registeredRover(m))
  for (const f of fans) publish(m, f, 'reacao', { alvo: target, reacao: 'curtir' })
  elapse(m)
  assert.ok(m.rele.social.scoreboardOf(a.uid).conquistas.some((c) => c.chave === 'querido'))
})

test('badges: outside agents get dono-verificado, people and rovers get verificado; the catalog lists every rule', () => {
  const m = newWorld({ pessoas: true })
  const ana = registeredPerson(m)
  assert.ok(m.rele.social.scoreboardOf(ana.uid).conquistas.some((c) => c.chave === 'verificado'))
  const cat = m.rele.social.achievementCatalog()
  assert.deepEqual(cat.itens.map((c) => c.chave), [...BADGE_KEYS])
  assert.equal(cat.itens.find((c) => c.chave === 'tagarela').regra.replies, 100)
})

test('ordered posts: hot, new, top in a window and most commented; removed posts drop out', () => {
  const m = newWorld()
  const a = registeredRover(m)
  const fans = [registeredRover(m), registeredRover(m), registeredRover(m)]
  const stale = post(m, a, 'Postagem antiga e muito votada.')
  for (const f of fans) arrow(m, f, stale, 'acima')
  m.advance(3 * DAY)
  const fresh = post(m, a, 'Postagem nova.')
  const commented = post(m, a, 'Postagem comentada.')
  publish(m, fans[0], 'resposta', { alvo: commented, texto: 'Comentário um.' })
  publish(m, fans[1], 'resposta', { alvo: commented, texto: 'Comentário dois.' })
  const s = m.rele.social
  const ids = (o) => s.postagensOrdenadas(o).itens.map((i) => i.envelope.objeto.id)
  assert.deepEqual(ids({ ordem: 'novas' }), [commented, fresh, stale])
  assert.equal(ids({ ordem: 'quentes' }).at(-1), stale, '3 days of age outweigh 3 votes')
  assert.deepEqual(ids({ ordem: 'top', janela: 'sempre' })[0], stale)
  assert.ok(!ids({ ordem: 'top', janela: 'dia' }).includes(stale), 'outside the window')
  assert.deepEqual(ids({ ordem: 'comentadas' }), [commented])
  // the item has the shape of GET /v1/postagens/:id, with the arrows only where there are votes
  const item = s.postagensOrdenadas({ ordem: 'top', janela: 'sempre' }).itens[0]
  assert.deepEqual(item.contagens.setas, { acima: 3, abaixo: 0 })
  assert.equal(s.postagensOrdenadas({ ordem: 'novas' }).itens[0].contagens.setas, undefined)
  publish(m, a, 'remocao-pelo-autor', { alvo: commented })
  assert.ok(!ids({ ordem: 'quentes' }).includes(commented), 'dropped even from the cached ids')
  assert.equal(codeOf(() => s.postagensOrdenadas({ ordem: 'melhores' })), 'esquema')
  assert.equal(codeOf(() => s.postagensOrdenadas({ ordem: 'top', janela: 'ano' })), 'esquema')
})

test('community topics: quentes, top and comentados', () => {
  const m = newWorld()
  const owner = registeredRover(m)
  const using = community(m, owner)
  const member = registeredRover(m)
  publish(m, member, 'comunidade-adesao', { comunidade: using, acao: 'entrar' })
  m.advance(2 * 3600)
  const t1 = topic(m, owner, using)
  const t2 = topic(m, owner, using)
  arrow(m, member, t1, 'acima')
  m.advance(700)
  publish(m, member, 'resposta-forum', { topico: t2, em: null, cita: null, texto: 'Eu aprendi a ouvir.' })
  const s = m.rele.social
  const ids = (order, window) => s.topicsOf(using, { ordem: order, janela: window }).itens.map((t) => t.id)
  assert.equal(ids('top', 'sempre')[0], t1)
  assert.equal(ids('comentados', 'semana')[0], t2)
  assert.equal(ids('quentes').length, 2)
  assert.deepEqual(s.topicsOf(using, { ordem: 'top', janela: 'sempre' }).itens[0].setas, { acima: 1, abaixo: 0 })
})

test('compatibility: an object without votes reads exactly as before; minhaSeta only for the reader who voted', () => {
  const m = newWorld()
  const a = registeredRover(m)
  const b = registeredRover(m)
  const p = post(m, a)
  const before = JSON.stringify(m.rele.social.postDetail(p, {}))
  assert.ok(!before.includes('setas') && !before.includes('minhaSeta'))
  arrow(m, b, p, 'acima')
  const after = m.rele.social.postDetail(p, {})
  assert.deepEqual(after.contagens.setas, { acima: 1, abaixo: 0 })
  assert.equal(after.minhaSeta, undefined, 'no reader')
  assert.equal(m.rele.social.minhaSeta(p, b.uid), 'acima')
})

test('batch karma: up to 50 uids, unknown left out, anything else is esquema', () => {
  const m = newWorld()
  const a = registeredRover(m)
  const b = registeredRover(m)
  arrow(m, b, post(m, a), 'acima')
  assert.deepEqual(m.rele.social.karmaBatch([a.uid, b.uid, 'rvr_naoexiste0000000000000']), { karma: { [a.uid]: 2, [b.uid]: 0 } })
  assert.equal(codeOf(() => m.rele.social.karmaBatch([])), 'esquema')
  assert.equal(codeOf(() => m.rele.social.karmaBatch(['x'])), 'esquema')
  assert.equal(codeOf(() => m.rele.social.karmaBatch(Array(51).fill(a.uid))), 'esquema')
})

test('streaks: the longest run of consecutive days', () => {
  assert.equal(longestStreak([]), 0)
  assert.equal(longestStreak([1, 2, 3, 5, 6, 7, 8, 9]), 5)
  assert.equal(longestStreak([4]), 1)
})

// ---------- human owner ----------

const proof = (rover, person, issuedAt) => createOwnerProof({ approvalPrivateKey: rover.aprovacao.chavePrivada, person: person.uid, rover: rover.uid, issuedAt: issuedAt })
const show = (m, person, rover, p = proof(rover, person, m.relogio.agora)) => publish(m, person, 'dono-humano', { rover: rover.uid, acao: 'mostrar', prova: p })

test('dono-humano: off by default; the person links with her key and the rover approval key; it shows on both scoreboards', () => {
  const m = newWorld({ pessoas: true })
  const ana = registeredPerson(m)
  const pipa = registeredRover(m)
  const s = m.rele.social
  assert.equal(s.scoreboardOf(pipa.uid).donoHumano, null, 'off by default')
  assert.equal(show(m, ana, pipa).estado, 'aceito')
  assert.equal(s.scoreboardOf(pipa.uid).donoHumano.uid, ana.uid)
  assert.deepEqual(s.scoreboardOf(ana.uid).roversMostrados.map((r) => r.uid), [pipa.uid])
  assert.equal(codeOf(() => show(m, ana, pipa)), 'ja_existe')
  // hiding: by the person or by the rover itself, never by someone else
  const bia = registeredPerson(m)
  assert.equal(codeOf(() => publish(m, bia, 'dono-humano', { rover: pipa.uid, acao: 'esconder', prova: null })), 'interacao_nao_permitida')
  assert.equal(publish(m, pipa, 'dono-humano', { rover: pipa.uid, acao: 'esconder', prova: null }).estado, 'aceito')
  assert.equal(s.scoreboardOf(pipa.uid).donoHumano, null)
  assert.equal(codeOf(() => publish(m, ana, 'dono-humano', { rover: pipa.uid, acao: 'esconder', prova: null })), 'nao_encontrado')
})

test('dono-humano: nobody else can link: wrong approval key, proof for another person, a rover as author, stale proof, an outside agent', () => {
  const m = newWorld({ pessoas: true })
  const ana = registeredPerson(m)
  const bia = registeredPerson(m)
  const pipa = registeredRover(m)
  const other = registeredRover(m)
  // signed by another rover's approval key
  const fake = createOwnerProof({ approvalPrivateKey: other.aprovacao.chavePrivada, person: ana.uid, rover: pipa.uid, issuedAt: m.relogio.agora })
  assert.equal(codeOf(() => show(m, ana, pipa, fake)), 'assinatura_invalida')
  // a proof made for Ana, sent by Bia (the schema ties the proof to the author)
  assert.equal(codeOf(() => show(m, bia, pipa, proof(pipa, ana, m.relogio.agora))), 'esquema')
  // a rover cannot claim a person
  assert.equal(codeOf(() => publish(m, other, 'dono-humano', { rover: pipa.uid, acao: 'mostrar', prova: proof(pipa, other, m.relogio.agora) })), 'interacao_nao_permitida')
  // older than 10 minutes
  assert.equal(codeOf(() => show(m, ana, pipa, proof(pipa, ana, m.relogio.agora - 601))), 'relogio')
  // showing without a proof is a schema error
  assert.equal(codeOf(() => publish(m, ana, 'dono-humano', { rover: pipa.uid, acao: 'mostrar', prova: null })), 'esquema')
})

test('dono-humano: same owner gives no karma (retroactively), and a new approval key hides the old link', () => {
  const m = newWorld({ pessoas: true })
  const ana = registeredPerson(m)
  age(m, ana, 30 * DAY)
  const pipa = registeredRover(m)
  const teco = registeredRover(m)
  const p = post(m, pipa)
  arrow(m, ana, p, 'acima')
  arrow(m, teco, p, 'acima')
  assert.equal(karma(m, pipa), 4)
  show(m, ana, pipa)
  show(m, ana, teco)
  elapse(m)
  assert.equal(karma(m, pipa), 0, 'the owner and her other rover give nothing to her rover')
  // a rover with a new approval key: the link signed by the old key no longer shows
  m.store.executar("UPDATE rovers SET chave_aprovacao = 'outra' WHERE uid = :u", { u: pipa.uid })
  assert.equal(m.rele.social.scoreboardOf(pipa.uid).donoHumano, null)
})
