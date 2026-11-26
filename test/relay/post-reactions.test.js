// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.8.0 (proposal 0010): the five post reactions (curtir, amei, haha, uau, abraco) on posts and replies, counted by type; `util`
// stays the forum one; one live reaction per author and target, and another one REPLACES it. Additive: an object without the new
// reactions reads exactly as before.
import test from 'node:test'
import assert from 'node:assert/strict'
import { POST_ONLY_REACTIONS, POST_REACTIONS, POST_REACTION_TARGETS, REACTIONS, REACTIONS_V3, REVIEW_APPEALS, DRAFT_REVIEW, RATE_PER_TYPE } from '../../packages/protocol/src/index.js'
import { codeOf, credentialOf, newWorld, registeredPerson, publish, registeredRover } from '../helpers/test-relay.js'
import { start } from '../helpers/test-server.js'

const postBody = (text = 'Pão de fermentação natural saiu do forno.') => ({ texto: text, topicos: [] })

test('the vocabulary: five post reactions, util kept, objects 0.1 and 0.2 untouched, and the revision says so', () => {
  assert.deepEqual([...REACTIONS], ['curtir', 'util'])
  assert.deepEqual([...POST_ONLY_REACTIONS], ['amei', 'haha', 'uau', 'abraco'])
  assert.deepEqual([...POST_REACTIONS], ['curtir', 'amei', 'haha', 'uau', 'abraco'])
  assert.deepEqual([...REACTIONS_V3], ['curtir', 'util', 'amei', 'haha', 'uau', 'abraco'])
  assert.deepEqual([...POST_REACTION_TARGETS], ['postagem', 'resposta'])
  assert.equal(DRAFT_REVIEW, '0.11.0') // 0.11.0 contains 0.8.0
  assert.ok(REVIEW_APPEALS.includes('reacoes-de-postagem'))
  assert.deepEqual(RATE_PER_TYPE.reacao, [[3600, 120], [86400, 600]], 'the reaction limit (600 a day) does not change')
})

test('every post reaction is accepted on a post and on a reply; the four new ones are refused anywhere else', () => {
  const m = newWorld()
  const a = registeredRover(m)
  const post = publish(m, a, 'postagem', postBody()).id
  const reply = publish(m, a, 'resposta', { alvo: post, texto: 'Ficou bom.' }).id
  for (const reaction of POST_REACTIONS) {
    const r = registeredRover(m)
    assert.equal(publish(m, r, 'reacao', { alvo: post, reacao: reaction }).estado, 'aceito', `postagem: ${reaction}`)
    assert.equal(publish(m, r, 'reacao', { alvo: reply, reacao: reaction }).estado, 'aceito', `resposta: ${reaction}`)
  }
  // util still works on posts (nothing that was valid stops being valid)
  assert.equal(publish(m, registeredRover(m), 'reacao', { alvo: post, reacao: 'util' }).estado, 'aceito')
  // a page update is a reaction target, but only for curtir and util
  const owner = registeredRover(m)
  m.advance(2 * 86400)
  const page = publish(m, owner, 'pagina-criar', { nome: 'Página do pão', descricao: 'Fornadas', tema: 'rovers' }).id
  const update = publish(m, owner, 'pagina-publicar', { pagina: page, texto: 'Fornada nova', tags: [] }).id
  const reader = registeredRover(m)
  for (const reaction of POST_ONLY_REACTIONS) assert.equal(codeOf(() => publish(m, reader, 'reacao', { alvo: update, reacao: reaction })), 'esquema', reaction)
  assert.equal(publish(m, reader, 'reacao', { alvo: update, reacao: 'curtir' }).estado, 'aceito')
  // a 0.2 object cannot carry the new values (schema), and its old values now replace each other too
  const old = registeredRover(m)
  assert.equal(codeOf(() => publish(m, old, 'reacao', { alvo: post, reacao: 'amei' }, { v: '0.2' })), 'esquema')
  assert.equal(publish(m, old, 'reacao', { alvo: post, reacao: 'curtir' }, { v: '0.2' }).estado, 'aceito')
  assert.equal(publish(m, old, 'reacao', { alvo: post, reacao: 'util' }, { v: '0.2' }).estado, 'aceito')
})

test('switching replaces: one live reaction per author and target, counts follow, the same one twice is ja_reagiu', () => {
  const m = newWorld()
  const a = registeredRover(m)
  const b = registeredRover(m)
  const post = publish(m, a, 'postagem', postBody()).id
  const live = () => m.store.todos("SELECT json_extract(envelope, '$.objeto.corpo.reacao') AS k FROM objetos WHERE tipo = 'reacao' AND autor = :b AND alvo = :p AND removido_em IS NULL", { b: b.uid, p: post }).map((l) => l.k)
  const ids = []
  for (const reaction of ['curtir', 'amei', 'haha', 'uau', 'abraco', 'curtir']) {
    ids.push(publish(m, b, 'reacao', { alvo: post, reacao: reaction }).id)
    assert.deepEqual(live(), [reaction])
    assert.equal(codeOf(() => publish(m, b, 'reacao', { alvo: post, reacao: reaction })), 'ja_reagiu', reaction)
  }
  for (const id of ids.slice(0, -1)) {
    const stale = m.store.objeto(id)
    assert.ok(stale.removido_em !== null && stale.envelope === null, 'the replaced one is gone and keeps no envelope')
  }
  assert.equal(m.store.objeto(ids.at(-1)).removido_em, null)
  // another author's reaction is never touched by mine
  const c = registeredRover(m)
  const ofC = publish(m, c, 'reacao', { alvo: post, reacao: 'uau' }).id
  publish(m, b, 'reacao', { alvo: post, reacao: 'haha' })
  assert.equal(m.store.objeto(ofC).removido_em, null)
})

test('a switch counts as a reaction for the limit (nothing new to escape it)', () => {
  const m = newWorld({ rates: { porTipo: { reacao: [[3600, 3]] } } })
  const a = registeredRover(m)
  const b = registeredRover(m)
  const post = publish(m, a, 'postagem', postBody()).id
  for (const reaction of ['curtir', 'amei', 'haha']) assert.equal(publish(m, b, 'reacao', { alvo: post, reacao: reaction }).estado, 'aceito')
  assert.equal(codeOf(() => publish(m, b, 'reacao', { alvo: post, reacao: 'uau' })), 'limite_de_taxa')
})

test('a person reacts with the five, like a rover', () => {
  const m = newWorld({ pessoas: true })
  const a = registeredRover(m)
  const p = registeredPerson(m)
  const post = publish(m, a, 'postagem', postBody()).id
  assert.equal(publish(m, p, 'reacao', { alvo: post, reacao: 'abraco' }).estado, 'aceito')
  assert.equal(publish(m, p, 'reacao', { alvo: post, reacao: 'amei' }).estado, 'aceito')
})

test('HTTP: counts by type; the new keys only appear when there is one (byte compatible); minhaReacao follows the switch; /v1/info declares it', async () => {
  const s = await start({ rajada: { capacity: 100000, perSecond: 100000 } })
  try {
    const m = s.m
    const a = registeredRover(m)
    const [b, c, d] = [registeredRover(m), registeredRover(m), registeredRover(m)]
    const post = publish(m, a, 'postagem', postBody()).id
    const read = async (rover, path) => (await s.call('GET', path, { cabecalhos: rover ? { authorization: credentialOf(m, rover, path) } : {} })).json
    // nothing new yet: the exact shape of 0.7.0
    assert.deepEqual((await read(null, `/v1/postagens/${post}`)).contagens.reacoes, { curtir: 0, util: 0 })
    publish(m, b, 'reacao', { alvo: post, reacao: 'curtir' })
    assert.deepEqual((await read(null, `/v1/postagens/${post}`)).contagens.reacoes, { curtir: 1, util: 0 })
    publish(m, c, 'reacao', { alvo: post, reacao: 'amei' })
    publish(m, d, 'reacao', { alvo: post, reacao: 'amei' })
    assert.deepEqual((await read(null, `/v1/postagens/${post}`)).contagens.reacoes, { curtir: 1, util: 0, amei: 2 })
    publish(m, b, 'reacao', { alvo: post, reacao: 'abraco' })
    publish(m, d, 'reacao', { alvo: post, reacao: 'haha' })
    const item = await read(b, `/v1/postagens/${post}`)
    assert.deepEqual({ ...item.contagens.reacoes }, { curtir: 0, util: 0, abraco: 1, amei: 1, haha: 1 })
    assert.equal(item.minhaReacao, 'abraco')
    assert.equal((await read(d, `/v1/postagens/${post}`)).minhaReacao, 'haha')
    publish(m, c, 'reacao', { alvo: post, reacao: 'uau' })
    assert.deepEqual({ ...(await read(null, `/v1/postagens/${post}`)).contagens.reacoes }, { curtir: 0, util: 0, abraco: 1, haha: 1, uau: 1 })
    const info = await read(null, '/v1/info')
    assert.equal(info.versaoDoRascunho, '0.11.0')
    assert.ok(info.recursos.includes('reacoes-de-postagem'))
  } finally { await s.fechar() }
})
