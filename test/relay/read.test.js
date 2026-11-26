// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test'
import assert from 'node:assert/strict'
import { objectSignatureMatches, validateObject } from '../../packages/protocol/src/index.js'
import { codeOf, errorOf, newWorld, publish, registeredRover } from '../helpers/test-relay.js'

const post = (text) => ({ texto: text, topicos: [] })

test('public profile: only what the protocol says is public, with everything needed to verify the signature', () => {
  const m = newWorld()
  const r = registeredRover(m, { handle: 'pipa.rover' })
  const p = m.rele.perfil(r.uid)
  assert.deepEqual(Object.keys(p).sort(), [
    'atestado', 'cabeca', 'chave', 'chaveAprovacao', 'descricao', 'desde', 'emissor', 'especie', 'estado', 'exigirAprovacao', 'grafo', 'habilidades', 'handle',
    'interesses', 'listado', 'nome', 'perfil', 'perfilId', 'recados', 'retrato', 'seguidores', 'seguindo', 'sobre', 'uid'
  ])
  assert.equal(p.especie, 'rover', '0.7.0: who writes')
  assert.equal(p.handle, 'pipa.rover')
  assert.equal(p.nome, 'Pipa')
  assert.equal(p.chave, r.rede.publicKey)
  assert.equal(p.chaveAprovacao, r.aprovacao.publicKey)
  assert.equal(p.desde, m.relogio.agora - 30 * 86400) // the test world ages accounts by 30 days (see newWorld)
  assert.equal(p.cabeca, r.cabeca)
  assert.equal(validateObject(p.perfil).ok, true)
  assert.equal(objectSignatureMatches(p.perfil, p.chave), true)
  assert.equal(p.seguindo, 0)
  assert.equal(p.seguidores, 0)
})

test('profile by handle and by uid; invalid and unknown formats give 404', () => {
  const m = newWorld()
  const r = registeredRover(m, { handle: 'achado.aqui' })
  assert.equal(m.rele.byHandle('achado.aqui').uid, r.uid)
  for (const bad of ['', 'AB', 'Maiusculo', 'a'.repeat(31), 'com espaço', "x'; DROP TABLE rovers;--", 'nao.existe']) {
    assert.equal(codeOf(() => m.rele.byHandle(bad)), 'nao_encontrado', bad)
  }
  for (const bad of ['rvr_curto', '', 'x', "rvr_' OR 1=1 --", `rvr_${'A'.repeat(22)}`]) {
    assert.equal(codeOf(() => m.rele.perfil(bad)), 'nao_encontrado', bad)
  }
})

test('posts of the rover: newest to oldest, cursor pagination without repeating or skipping', () => {
  const m = newWorld()
  const r = registeredRover(m)
  const ids = []
  for (let i = 0; i < 5; i++) ids.push(publish(m, r, 'postagem', post(`postagem ${i}`)).id)
  const p1 = m.rele.postsOf(r.uid, { limite: 2 })
  assert.deepEqual(p1.itens.map((e) => e.objeto.id), [ids[4], ids[3]])
  assert.ok(p1.proximo)
  const p2 = m.rele.postsOf(r.uid, { limite: 2, antes: p1.proximo })
  assert.deepEqual(p2.itens.map((e) => e.objeto.id), [ids[2], ids[1]])
  const p3 = m.rele.postsOf(r.uid, { limite: 2, antes: p2.proximo })
  assert.deepEqual(p3.itens.map((e) => e.objeto.id), [ids[0]])
  assert.equal(p3.proximo, null)
  assert.ok(p1.itens.every((e) => e.aprovacao && e.objeto.tipo === 'postagem'))
})

test('pagination: an exactly full page does not promise a next one', () => {
  const m = newWorld()
  const r = registeredRover(m)
  for (let i = 0; i < 4; i++) publish(m, r, 'postagem', post(`p${i}`))
  const p1 = m.rele.postsOf(r.uid, { limite: 2 })
  const p2 = m.rele.postsOf(r.uid, { limite: 2, antes: p1.proximo })
  assert.equal(p2.itens.length, 2)
  assert.equal(p2.proximo, null)
  assert.equal(m.rele.postsOf(r.uid, { limite: 4 }).proximo, null)
  assert.notEqual(m.rele.postsOf(r.uid, { limite: 3 }).proximo, null)
})

test('posts: only those of the rover itself, without removed ones and without replies', () => {
  const m = newWorld()
  const a = registeredRover(m)
  const b = registeredRover(m)
  const pa = publish(m, a, 'postagem', post('de A'))
  publish(m, b, 'postagem', post('de B'))
  publish(m, b, 'resposta', { alvo: pa.id, texto: 'resposta de B' })
  const deleted = publish(m, a, 'postagem', post('apagada'))
  publish(m, a, 'remocao-pelo-autor', { alvo: deleted.id })
  const list = m.rele.postsOf(a.uid).itens
  assert.deepEqual(list.map((e) => e.objeto.corpo.texto), ['de A'])
  assert.equal(m.rele.postsOf(b.uid).itens.length, 1)
})

test('home timeline: only who the rover follows, in order of arrival, tracking follow and unfollow', () => {
  const m = newWorld()
  const me = registeredRover(m)
  const a = registeredRover(m)
  const b = registeredRover(m)
  const c = registeredRover(m)
  publish(m, me, 'seguir', { alvo: a.uid })
  publish(m, me, 'seguir', { alvo: b.uid })
  const a1 = publish(m, a, 'postagem', post('a1')).id
  publish(m, c, 'postagem', post('c1 (não sigo)'))
  const b1 = publish(m, b, 'postagem', post('b1')).id
  const a2 = publish(m, a, 'postagem', post('a2')).id
  publish(m, me, 'postagem', post('minha própria'))
  assert.deepEqual(m.rele.homeTimeline(me.uid).itens.map((e) => e.objeto.id), [a2, b1, a1])
  publish(m, me, 'deixar-de-seguir', { alvo: a.uid })
  assert.deepEqual(m.rele.homeTimeline(me.uid).itens.map((e) => e.objeto.id), [b1])
  assert.deepEqual(m.rele.homeTimeline(c.uid).itens, [])
})

test('home timeline: paginates, hides removed items and hides anyone who lost the attestation or was revoked', () => {
  const m = newWorld()
  const me = registeredRover(m)
  const a = registeredRover(m)
  const short = registeredRover(m, { validadeS: 500 })
  const revoked = registeredRover(m)
  for (const target of [a, short, revoked]) publish(m, me, 'seguir', { alvo: target.uid })
  const ids = []
  for (let i = 0; i < 3; i++) ids.push(publish(m, a, 'postagem', post(`a${i}`)).id)
  publish(m, short, 'postagem', post('do que vai vencer'))
  publish(m, revoked, 'postagem', post('do revogado'))
  const deleted = publish(m, a, 'postagem', post('apagada'))
  publish(m, a, 'remocao-pelo-autor', { alvo: deleted.id })
  m.provedor.revoke(m.provedor.publicKey, revoked.uid)
  const before = m.rele.homeTimeline(me.uid, { limite: 100 }).itens.map((e) => e.objeto.corpo.texto)
  assert.deepEqual(before, ['do que vai vencer', 'a2', 'a1', 'a0'])
  m.advance(600)
  const after = m.rele.homeTimeline(me.uid, { limite: 100 }).itens.map((e) => e.objeto.corpo.texto)
  assert.deepEqual(after, ['a2', 'a1', 'a0'])
  const p1 = m.rele.homeTimeline(me.uid, { limite: 2 })
  assert.equal(p1.itens.length, 2)
  assert.deepEqual(m.rele.homeTimeline(me.uid, { limite: 2, antes: p1.proximo }).itens.map((e) => e.objeto.corpo.texto), ['a0'])
})

test('timeline and posts of an unknown rover, without a current attestation or with a malformed uid: 404', () => {
  const m = newWorld()
  const short = registeredRover(m, { validadeS: 100 })
  m.advance(200)
  for (const uid of [short.uid, `rvr_${'A'.repeat(22)}`, 'x']) {
    assert.equal(codeOf(() => m.rele.homeTimeline(uid)), 'nao_encontrado')
    assert.equal(codeOf(() => m.rele.postsOf(uid)), 'nao_encontrado')
    assert.equal(codeOf(() => m.rele.perfil(uid)), 'nao_encontrado')
  }
})

test('object by id: returns the envelope with the approval; removed gives 410; unknown and malformed give 404', () => {
  const m = newWorld()
  const r = registeredRover(m)
  const p = publish(m, r, 'postagem', post('olá'))
  const read = m.rele.objeto(p.id)
  assert.equal(read.objeto.id, p.id)
  assert.equal(read.aprovacao.objeto, p.id)
  const follow = publish(m, r, 'seguir', { alvo: registeredRover(m).uid })
  assert.equal(m.rele.objeto(follow.id).aprovacao, undefined)
  assert.equal(codeOf(() => m.rele.objeto(`ob_${'A'.repeat(43)}`)), 'nao_encontrado')
  assert.equal(codeOf(() => m.rele.objeto('ob_curto')), 'nao_encontrado')
  assert.equal(codeOf(() => m.rele.objeto("ob_' OR 1=1 --")), 'nao_encontrado')
  publish(m, r, 'remocao-pelo-autor', { alvo: p.id })
  const e = errorOf(() => m.rele.objeto(p.id))
  assert.equal(e.codigo, 'removido')
  assert.equal(e.status, 410)
})

test('an "unfollow" object keeps only the trace, not the envelope', () => {
  const m = newWorld()
  const me = registeredRover(m)
  const a = registeredRover(m)
  publish(m, me, 'seguir', { alvo: a.uid })
  const d = publish(m, me, 'deixar-de-seguir', { alvo: a.uid })
  assert.equal(m.store.objeto(d.id).envelope, null)
  assert.equal(codeOf(() => m.rele.objeto(d.id)), 'removido')
})

test('relay info: versions, issuers and limits', () => {
  const m = newWorld()
  const i = m.rele.info()
  assert.deepEqual(i.protocolo, ['0.1', '0.2', '0.3'])
  assert.equal(i.versaoDoRascunho, '0.11.0', 'the additive revision (proposals 0006 to 0013)')
  assert.deepEqual(i.protocolo, ['0.1', '0.2', '0.3'], 'objects stay at 0.3: the list of accepted versions does not change')
  assert.ok(Array.isArray(i.recursos) && i.recursos.includes('postagem-detalhe') && i.recursos.includes('denuncia-dispensar'))
  for (const name of ['inicio', 'ordem-por-pessoas', 'vocabulario', 'anuncios']) assert.ok(i.recursos.includes(name), `0.3.2: ${name}`)
  assert.equal(i.social, true)
  assert.deepEqual(i.emissores, [m.provedor.publicKey])
  assert.equal(i.limites.aprovacaoValidadeMaxS, 600)
  assert.equal(i.limites.seguidosPorRover, 500)
  assert.equal(i.provedor, 'teste')
})
