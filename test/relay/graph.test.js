// SPDX-License-Identifier: AGPL-3.0-or-later
// Follow graph: public by default; the person or the rover close it; the most restrictive wins; nothing leaks through another route.
import test from 'node:test'
import assert from 'node:assert/strict'
import { GRAPHS, mostRestrictive } from '../../packages/protocol/src/index.js'
import { policyOf } from '../helpers/world.js'
import { codeOf, credentialOf, errorOf, newWorld, publish, registeredRover } from '../helpers/test-relay.js'

const post = (text) => ({ texto: text, topicos: [] })
const follow = (m, from, to) => publish(m, from, 'seguir', { alvo: to.uid })
const declare = (m, rover, options) => m.rele.acceptDeclaration({ declaracao: policyOf(rover, { emitidaEm: m.relogio.agora, ...options }) })
const uids = (page) => page.itens.map((e) => e.objeto.corpo.alvo)
const authors = (page) => page.itens.map((e) => e.objeto.autor)

/** a follows b and c; d follows b. All with the graph at the default. */
function network(optionsOfA = {}) {
  const m = newWorld()
  const a = registeredRover(m, optionsOfA)
  const b = registeredRover(m)
  const c = registeredRover(m)
  const d = registeredRover(m)
  const s1 = follow(m, a, b)
  const s2 = follow(m, a, c)
  follow(m, d, b)
  publish(m, b, 'postagem', post('postagem de b'))
  publish(m, c, 'postagem', post('postagem de c'))
  return { m, a, b, c, d, s1, s2 }
}

test('default: the graph is public, with lists, counts and the home timeline for anyone', () => {
  const { m, a, b, c, d } = network()
  const pa = m.rele.perfil(a.uid)
  assert.equal(pa.grafo, 'publico')
  assert.deepEqual(pa.exigirAprovacao, [])
  assert.equal(pa.seguindo, 2)
  assert.equal(pa.seguidores, 0)
  assert.equal(m.rele.perfil(b.uid).seguidores, 2)
  assert.deepEqual(uids(m.rele.seguindo(a.uid)).sort(), [b.uid, c.uid].sort())
  assert.deepEqual(authors(m.rele.seguidores(b.uid)).sort(), [a.uid, d.uid].sort())
  assert.equal(m.rele.homeTimeline(a.uid).itens.length, 2)
  // the lists carry the signed object: whoever reads can verify on their own
  assert.equal(m.rele.seguindo(a.uid).itens[0].objeto.tipo, 'seguir')
})

test('following and follower lists: from newest to oldest, paged without repeating or skipping', () => {
  const m = newWorld()
  const a = registeredRover(m)
  const targets = [registeredRover(m), registeredRover(m), registeredRover(m)]
  for (const x of targets) follow(m, a, x)
  const p1 = m.rele.seguindo(a.uid, { limite: 2 })
  assert.deepEqual(uids(p1), [targets[2].uid, targets[1].uid])
  assert.ok(p1.proximo)
  const p2 = m.rele.seguindo(a.uid, { limite: 2, antes: p1.proximo })
  assert.deepEqual(uids(p2), [targets[0].uid])
  assert.equal(p2.proximo, null)
  const target = targets[0]
  const others = [registeredRover(m), registeredRover(m), registeredRover(m)]
  for (const x of others) follow(m, x, target)
  const q1 = m.rele.seguidores(target.uid, { limite: 2 })
  assert.deepEqual(authors(q1), [others[2].uid, others[1].uid])
  assert.deepEqual(authors(m.rele.seguidores(target.uid, { limite: 2, antes: q1.proximo })), [others[0].uid, a.uid])
  assert.equal(m.rele.seguidores(target.uid, { limite: 4 }).proximo, null)
})

test('without "limite", the list page has 20 items and says there are more', () => {
  const m = newWorld()
  const a = registeredRover(m)
  const targets = Array.from({ length: 21 }, () => registeredRover(m))
  for (const x of targets) follow(m, a, x)
  const p = m.rele.seguindo(a.uid)
  assert.equal(p.itens.length, 20)
  assert.ok(p.proximo)
  assert.equal(m.rele.seguindo(a.uid, { antes: p.proximo }).itens.length, 1)
  const target = registeredRover(m)
  const followers = Array.from({ length: 21 }, () => registeredRover(m))
  for (const x of followers) follow(m, x, target)
  const q = m.rele.seguidores(target.uid)
  assert.equal(q.itens.length, 20)
  assert.ok(q.proximo)
  assert.equal(m.rele.seguidores(target.uid, { antes: q.proximo }).itens.length, 1)
})

test('a list only has those still followed: unfollowing removes from the list and the count', () => {
  const { m, a, b, c } = network()
  publish(m, a, 'deixar-de-seguir', { alvo: b.uid })
  assert.deepEqual(uids(m.rele.seguindo(a.uid)), [c.uid])
  assert.equal(m.rele.perfil(a.uid).seguindo, 1)
  assert.deepEqual(authors(m.rele.seguidores(b.uid)).length, 1)
  assert.equal(m.rele.perfil(b.uid).seguidores, 1)
})

test('a blocked rover, or one that left, disappears from the lists and counts of the others', () => {
  const { m, a, b, c, d } = network()
  m.rele.bloquear({ tipo: 'rover', alvo: d.uid, motivo: 'teste' })
  assert.deepEqual(authors(m.rele.seguidores(b.uid)), [a.uid])
  assert.equal(m.rele.perfil(b.uid).seguidores, 1)
  m.rele.bloquear({ tipo: 'rover', alvo: c.uid, motivo: 'teste' })
  assert.deepEqual(uids(m.rele.seguindo(a.uid)), [b.uid])
  assert.equal(m.rele.perfil(a.uid).seguindo, 1)
  assert.equal(codeOf(() => m.rele.seguindo(c.uid)), 'nao_encontrado')
  assert.equal(codeOf(() => m.rele.seguidores(d.uid)), 'nao_encontrado')
})

test('unknown rover or malformed uid: 404 on the lists, with no hint', () => {
  const { m } = network()
  for (const bad of ['rvr_curto', '', "rvr_' OR 1=1 --", `rvr_${'A'.repeat(22)}`]) {
    assert.equal(codeOf(() => m.rele.seguindo(bad)), 'nao_encontrado', bad)
    assert.equal(codeOf(() => m.rele.seguidores(bad)), 'nao_encontrado', bad)
  }
})

// ---------- closing the graph ----------

for (const level of ['contagens', 'privado']) {
  test(`grafo "${level}" chosen by the rover: no list, not through the home timeline, not through the seguir id`, () => {
    const { m, a, b, s1 } = network({ grafo: level })
    const pa = m.rele.perfil(a.uid)
    assert.equal(pa.grafo, level)
    assert.equal(codeOf(() => m.rele.seguindo(a.uid)), 'grafo_privado')
    assert.equal(codeOf(() => m.rele.seguidores(a.uid)), 'grafo_privado')
    assert.equal(codeOf(() => m.rele.homeTimeline(a.uid)), 'grafo_privado')
    // alternative route: the `seguir` object is the graph; by id it does not show up either (not even as removed)
    assert.equal(codeOf(() => m.rele.objeto(s1.id)), 'nao_encontrado')
    // what the graph does not cover stays public
    assert.equal(m.rele.perfil(a.uid).nome, 'Pipa')
    assert.equal(m.rele.postsOf(b.uid).itens.length, 1)
    // who the rover follows: it disappears from the alvo's follower list, and from the count, at any closed level
    assert.deepEqual(authors(m.rele.seguidores(b.uid)), [m.rele.seguidores(b.uid).itens[0].objeto.autor])
    assert.equal(authors(m.rele.seguidores(b.uid)).includes(a.uid), false)
    assert.equal(m.rele.perfil(b.uid).seguidores, 1)
  })
}

test('counts: the "contagens" level shows the numbers and hides the lists; "privado" hides both', () => {
  const c1 = network({ grafo: 'contagens' })
  const p1 = c1.m.rele.perfil(c1.a.uid)
  assert.equal(p1.seguindo, 2)
  assert.equal(p1.seguidores, 0)
  const c2 = network({ grafo: 'privado' })
  const p2 = c2.m.rele.perfil(c2.a.uid)
  assert.equal(p2.seguindo, null)
  assert.equal(p2.seguidores, null)
  assert.equal('seguindo' in p2 && 'seguidores' in p2, true, 'the field exists and comes as null')
  // followers of the closed rover: who follows it is public on each follower's profile, not on its own
  const c3 = network({ grafo: 'contagens' })
  follow(c3.m, c3.b, c3.a)
  assert.equal(c3.m.rele.perfil(c3.a.uid).seguidores, 1)
  assert.equal(codeOf(() => c3.m.rele.seguidores(c3.a.uid)), 'grafo_privado')
})

test('the rover itself can still read its own graph and its own timeline, signing the request with the NETWORK key', () => {
  const { m, a, b, c, d } = network({ grafo: 'privado' })
  follow(m, d, a)
  const t = (target, extra) => ({ header: credentialOf(m, a, target), metodo: 'GET', alvo: target, ...extra })
  const targetFollowing = `/v1/rovers/${a.uid}/seguindo?limite=5`
  assert.deepEqual(uids(m.rele.seguindo(a.uid, { limite: 5, credencial: t(targetFollowing) })).sort(), [b.uid, c.uid].sort())
  const targetFollowers = `/v1/rovers/${a.uid}/seguidores`
  assert.deepEqual(authors(m.rele.seguidores(a.uid, { credencial: t(targetFollowers) })), [d.uid])
  const targetTimeline = `/v1/linha/inicio?rover=${a.uid}`
  assert.equal(m.rele.homeTimeline(a.uid, { credencial: t(targetTimeline) }).itens.length, 2)
})

test(`another rover's credential does not open the closed graph of someone else`, () => {
  const { m, a, b } = network({ grafo: 'privado' })
  const target = `/v1/rovers/${a.uid}/seguindo`
  // b has a valid credential, but it is b, not a
  assert.equal(codeOf(() => m.rele.seguindo(a.uid, { credencial: { header: credentialOf(m, b, target), metodo: 'GET', alvo: target } })), 'grafo_privado')
  assert.equal(codeOf(() => m.rele.seguidores(a.uid, { credencial: { header: credentialOf(m, b, `/v1/rovers/${a.uid}/seguidores`), metodo: 'GET', alvo: `/v1/rovers/${a.uid}/seguidores` } })), 'grafo_privado')
  const targetTimeline = `/v1/linha/inicio?rover=${a.uid}`
  assert.equal(codeOf(() => m.rele.homeTimeline(a.uid, { credencial: { header: credentialOf(m, b, targetTimeline), metodo: 'GET', alvo: targetTimeline } })), 'grafo_privado')
  // b reads its own public graph without problem
  assert.equal(m.rele.seguidores(b.uid).itens.length, 1)
})

test('invalid credential for the closed graph: 401, and only when the graph is closed', () => {
  const { m, a, b } = network({ grafo: 'privado' })
  const target = `/v1/rovers/${a.uid}/seguindo`
  const good = credentialOf(m, a, target)
  const readWith = (header, extra = {}) => codeOf(() => m.rele.seguindo(a.uid, { credencial: { header, metodo: 'GET', alvo: target, ...extra } }))
  assert.equal(readWith(good), 'ok')
  assert.equal(readWith(good, { metodo: 'POST' }), 'leitura_nao_autorizada')
  assert.equal(readWith(good, { alvo: `${target}?limite=7` }), 'leitura_nao_autorizada')
  assert.equal(readWith(credentialOf(m, a, target, { t: m.relogio.agora - 121 })), 'leitura_nao_autorizada')
  assert.equal(readWith(credentialOf(m, a, target, { t: m.relogio.agora + 121 })), 'leitura_nao_autorizada')
  assert.equal(readWith(credentialOf(m, a, target, { t: m.relogio.agora - 120 })), 'ok')
  assert.equal(readWith('Bearer abc'), 'leitura_nao_autorizada')
  assert.equal(readWith(''), 'leitura_nao_autorizada')
  assert.equal(readWith(good.replace(a.uid, b.uid)), 'leitura_nao_autorizada')
  // wrong key: signed by someone who is not a's network key
  assert.equal(readWith(credentialOf(m, { ...a, rede: b.rede }, target)), 'leitura_nao_autorizada')
  // uid the relay does not know
  assert.equal(readWith(good.replace(a.uid, `rvr_${'B'.repeat(22)}`)), 'leitura_nao_autorizada')
  // the APPROVAL key does not work as a read credential
  assert.equal(readWith(credentialOf(m, { ...a, rede: a.aprovacao }, target)), 'leitura_nao_autorizada')
  // a public graph ignores the header, even a malformed one: there is nothing to protect
  assert.equal(codeOf(() => m.rele.seguindo(b.uid, { credencial: { header: 'lixo', metodo: 'GET', alvo: '/x' } })), 'ok')
  assert.equal(codeOf(() => m.rele.seguidores(b.uid, { credencial: { header: 'lixo', metodo: 'GET', alvo: '/x' } })), 'ok')
  assert.equal(codeOf(() => m.rele.homeTimeline(b.uid, { credencial: { header: 'lixo', metodo: 'GET', alvo: '/x' } })), 'ok')
})

test('the credential of a blocked rover or one outside the relay opens nothing', () => {
  const { m, a, b } = network({ grafo: 'privado' })
  const target = `/v1/rovers/${a.uid}/seguindo`
  m.rele.bloquear({ tipo: 'rover', alvo: a.uid, motivo: 'teste' })
  // with a blocked, the rover is not even visible: 404 before any credential
  assert.equal(codeOf(() => m.rele.seguindo(a.uid, { credencial: { header: credentialOf(m, a, target), metodo: 'GET', alvo: target } })), 'nao_encontrado')
  m.rele.desbloquear('rover', a.uid)
  m.rele.bloquear({ tipo: 'rover', alvo: b.uid, motivo: 'teste' })
  const targetB = `/v1/rovers/${a.uid}/seguidores`
  assert.equal(codeOf(() => m.rele.seguidores(a.uid, { credencial: { header: credentialOf(m, b, targetB), metodo: 'GET', alvo: targetB } })), 'leitura_nao_autorizada')
})

test('removed: with a public graph the deleted seguir is "removido"; with a closed graph it stays "não encontrado"', () => {
  const { m, a, b, s1 } = network()
  assert.equal(m.rele.objeto(s1.id).objeto.tipo, 'seguir')
  publish(m, a, 'remocao-pelo-autor', { alvo: s1.id })
  assert.equal(codeOf(() => m.rele.objeto(s1.id)), 'removido')
  const f = network({ grafo: 'privado' })
  publish(f.m, f.a, 'remocao-pelo-autor', { alvo: f.s1.id })
  assert.equal(codeOf(() => f.m.rele.objeto(f.s1.id)), 'nao_encontrado')
  // `deixar-de-seguir` keeps no content and never reveals the alvo
  const u = publish(f.m, f.a, 'deixar-de-seguir', { alvo: f.c.uid })
  assert.equal(f.m.store.objeto(u.id).envelope, null)
})

test('with a public graph the seguir by id shows up; the reacao and postagem of someone who closed the graph stay public', () => {
  const { m, a, b, s1 } = network({ grafo: 'privado' })
  const p = publish(m, a, 'postagem', post('olá'))
  assert.equal(m.rele.objeto(p.id).objeto.corpo.texto, 'olá')
  const r = publish(m, a, 'reacao', { alvo: m.rele.postsOf(b.uid).itens[0].objeto.id, reacao: 'curtir' })
  assert.equal(m.rele.objeto(r.id).objeto.tipo, 'reacao')
  assert.equal(codeOf(() => m.rele.objeto(s1.id)), 'nao_encontrado')
})

// ---------- the person closes; the rover does not reopen ----------

test('the person closes the graph without the rover: it applies at once, and the rover cannot reopen it by publishing another profile', () => {
  const { m, a, b, s1 } = network()
  assert.equal(m.rele.seguidores(b.uid).itens.length, 2)
  assert.equal(declare(m, a, { grafo: 'privado' }).estado, 'aceita')
  const pa = m.rele.perfil(a.uid)
  assert.equal(pa.grafo, 'privado')
  assert.equal(pa.seguindo, null)
  assert.equal(codeOf(() => m.rele.seguindo(a.uid)), 'grafo_privado')
  assert.equal(codeOf(() => m.rele.homeTimeline(a.uid)), 'grafo_privado')
  assert.equal(codeOf(() => m.rele.objeto(s1.id)), 'nao_encontrado')
  assert.equal(m.rele.perfil(b.uid).seguidores, 1)
  // the rover tries to reopen: new profile, approved, with a public graph
  publish(m, a, 'perfil', { nome: 'Pipa', descricao: 'reaberto', grafo: 'publico', exigirAprovacao: [] })
  assert.equal(m.rele.perfil(a.uid).grafo, 'privado')
  assert.equal(codeOf(() => m.rele.seguindo(a.uid)), 'grafo_privado')
  assert.equal(m.rele.perfil(a.uid).descricao, 'reaberto', 'the rest of the profile was updated')
  // and tries through the 0.1 profile, which does not even have the field
  publish(m, a, 'perfil', { nome: 'Pipa', descricao: 'de novo' }, { })
  assert.equal(m.rele.perfil(a.uid).grafo, 'privado')
})

test('rover and person disagreeing: the most restrictive wins, in all nine combinations', () => {
  for (const ofRover of GRAPHS) {
    for (const ofPerson of GRAPHS) {
      const { m, a, b } = network({ grafo: ofRover })
      assert.equal(declare(m, a, { grafo: ofPerson }).estado, 'aceita')
      const expected = mostRestrictive(ofRover, ofPerson)
      const name = `${ofRover}+${ofPerson}`
      assert.equal(m.rele.perfil(a.uid).grafo, expected, name)
      assert.equal(codeOf(() => m.rele.seguindo(a.uid)), expected === 'publico' ? 'ok' : 'grafo_privado', name)
      assert.equal(codeOf(() => m.rele.homeTimeline(a.uid)), expected === 'publico' ? 'ok' : 'grafo_privado', name)
      assert.equal(m.rele.perfil(a.uid).seguindo, expected === 'privado' ? null : 2, name)
      // the closed follower disappears from the target's list and count, matching what its profile says
      assert.equal(m.rele.seguidores(b.uid).itens.some((e) => e.objeto.autor === a.uid), expected === 'publico', name)
      assert.equal(m.rele.perfil(b.uid).seguidores, expected === 'publico' ? 2 : 1, name)
    }
  }
})

test(`the person reopens the graph whenever they want, and only they: the rover's open profile does not cancel the closed policy`, () => {
  const { m, a } = network({ grafo: 'privado' })
  m.advance(5)
  declare(m, a, { grafo: 'publico' })
  // the rover chose private and the person public: it stays private (the most restrictive)
  assert.equal(m.rele.perfil(a.uid).grafo, 'privado')
  // the rover opens its own, approved by the person on the profile: now both are public
  publish(m, a, 'perfil', { nome: 'Pipa', descricao: 'aberto', grafo: 'publico', exigirAprovacao: [] })
  assert.equal(m.rele.perfil(a.uid).grafo, 'publico')
  assert.equal(m.rele.seguindo(a.uid).itens.length, 2)
  // the person closes it again
  m.advance(5)
  declare(m, a, { grafo: 'contagens' })
  assert.equal(m.rele.perfil(a.uid).grafo, 'contagens')
  m.advance(5)
  declare(m, a, { grafo: 'publico' })
  assert.equal(m.rele.perfil(a.uid).grafo, 'publico')
})

test(`a 0.1 profile means a public graph; a 0.1 published after a closed 0.2 reopens the rover's one (the person approved that profile)`, () => {
  const m = newWorld()
  const a = registeredRover(m, { grafo: 'privado', exigirAprovacao: ['seguir'] })
  assert.equal(m.rele.perfil(a.uid).grafo, 'privado')
  assert.deepEqual(m.rele.perfil(a.uid).exigirAprovacao, ['seguir'])
  const old = publish(m, a, 'perfil', { nome: 'Velho', descricao: '' }, { v: '0.1' })
  assert.equal(old.objeto.v, '0.1')
  assert.equal(m.rele.perfil(a.uid).grafo, 'publico')
  assert.deepEqual(m.rele.perfil(a.uid).exigirAprovacao, [])
  assert.equal(m.rele.perfil(a.uid).nome, 'Velho')
  // a rover that was 0.1 from the start is also born public
  const b = (() => { const r = registeredRover(m); return r })()
  assert.equal(m.rele.perfil(b.uid).grafo, 'publico')
})

test(`whoever closed the graph (rover or person) returns to other people's lists on reopening`, () => {
  const { m, a, b } = network()
  declare(m, a, { grafo: 'contagens' })
  assert.equal(authors(m.rele.seguidores(b.uid)).includes(a.uid), false)
  m.advance(3)
  declare(m, a, { grafo: 'publico' })
  assert.equal(authors(m.rele.seguidores(b.uid)).includes(a.uid), true)
  assert.equal(m.rele.perfil(b.uid).seguidores, 2)
})

test(`leaving the network deletes the person's policy; the uid does not come back`, () => {
  const { m, a } = network()
  declare(m, a, { grafo: 'privado' })
  assert.ok(m.store.politica(a.uid))
  const profileId = m.rele.perfil(a.uid).perfil.id
  publish(m, a, 'remocao-pelo-autor', { alvo: profileId })
  assert.equal(m.store.politica(a.uid), null)
  assert.equal(codeOf(() => m.rele.perfil(a.uid)), 'nao_encontrado')
  assert.equal(errorOf(() => m.rele.acceptDeclaration({ declaracao: policyOf(a, { emitidaEm: m.relogio.agora + 1 }) })).codigo, 'nao_encontrado')
})
