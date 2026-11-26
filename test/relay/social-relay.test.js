// SPDX-License-Identifier: AGPL-3.0-or-later
// Points of the relay that 0.3 changed: reacao and resposta target by version, reacao context, new-account cap and report weight.
import test from 'node:test'
import assert from 'node:assert/strict'
import { TIMES } from '../../packages/protocol/src/index.js'
import { errorOf, fresh } from '../helpers/network.js'

function withTopic() {
  const x = fresh()
  const owner = x.rover()
  const m = x.rover()
  const c = x.comunidade(owner)
  x.entra(m, c)
  const t = x.topico(m, c)
  return { x, dono: owner, m, c, t }
}

test('resposta (old type) only targets postagem or resposta, in any version; the 0.3 reacao also targets the rest', () => {
  const { x, dono: owner, m, c, t } = withTopic()
  const r03 = errorOf(() => x.ok(m, 'resposta', { alvo: t, texto: 'respondendo um tópico' }))
  assert.equal(r03.codigo, 'esquema')
  assert.match(r03.message, /postagem ou uma resposta\.$/)
  const r02 = errorOf(() => x.ok(m, 'reacao', { alvo: t, reacao: 'curtir' }, { v: '0.2' }))
  assert.equal(r02.codigo, 'esquema')
  assert.match(r02.message, /postagem ou uma resposta\.$/, 'reacao 0.2 does not reach a topic')
  const outside = errorOf(() => x.ok(m, 'reacao', { alvo: c, reacao: 'curtir' }))
  assert.equal(outside.codigo, 'esquema')
  assert.match(outside.message, /tópico, resposta de fórum, atualização de página ou entrega\.$/)
  assert.equal(x.does(owner, 'reacao', { alvo: t, reacao: 'curtir' }).estado, 'aceito', 'reacao 0.3 on a topic')
})

test('the reacao keeps its context: the topic, when the target is the topic or a reply to it; none, on a postagem', () => {
  const { x, dono: owner, m, t } = withTopic()
  const resp = x.replies(m, t)
  const inTopic = x.ok(owner, 'reacao', { alvo: t, reacao: 'curtir' })
  const inReply = x.ok(owner, 'reacao', { alvo: resp, reacao: 'util' })
  assert.equal(x.m.store.objeto(inTopic.objeto.id).ctx, t)
  assert.equal(x.m.store.objeto(inReply.objeto.id).ctx, t)
  const post = x.ok(m, 'postagem', { texto: 'uma postagem comum', topicos: [] })
  const inPost = x.ok(owner, 'reacao', { alvo: post.objeto.id, reacao: 'curtir' })
  assert.equal(x.m.store.objeto(inPost.objeto.id).ctx, null)
})

test('perfil has no reduced new-account cap: six per hour, not one more and not one less', () => {
  const x = fresh({ novatos: true })
  const r = x.rover({ newcomer: true }) // registration already published a perfil
  for (let i = 0; i < 5; i++) assert.equal(x.does(r, 'perfil', { nome: `Pipa ${i}`, descricao: '' }).estado, 'aceito', `perfil ${i + 2}`)
  assert.equal(errorOf(() => x.ok(r, 'perfil', { nome: 'Pipa demais', descricao: '' })).codigo, 'limite_de_taxa')
})

test('the issuer cap does not shrink because the account is new', () => {
  const x = fresh({ novatos: true, rates: { emissor: [[3600, 6]], total: [[3600, 1000]], porTipo: { postagem: [[3600, 1000]] } } })
  const r = x.rover({ newcomer: true }) // the registration perfil counts 1 for the issuer
  let accepted = 0
  for (let i = 0; i < 10; i++) {
    const e = (() => { try { return x.does(r, 'postagem', { texto: `postagem ${i}`, topicos: [] }) } catch (err) { return err } })()
    if (e.estado === 'aceito') accepted++
    else { assert.equal(e.codigo, 'limite_de_taxa'); assert.match(e.message, /emissor/); break }
  }
  assert.equal(accepted, 5)
})

test('whoever leaves the discovery list leaves the search index; whoever comes back, is back', () => {
  const x = fresh()
  const r = x.rover({ handle: 'indice.teste' })
  const indexed = () => x.m.store.todos("SELECT ref FROM busca WHERE tipo = 'rover' AND ref = :uid", { uid: r.uid }).length
  assert.equal(indexed(), 1)
  x.ok(r, 'perfil', { nome: 'Pipa', descricao: '', listado: false })
  assert.equal(indexed(), 0)
  const hidden = x.rover({ perfil: { listado: false } })
  assert.equal(x.m.store.todos("SELECT ref FROM busca WHERE tipo = 'rover' AND ref = :uid", { uid: hidden.uid }).length, 0, 'someone never listed never got in')
  x.ok(r, 'perfil', { nome: 'Pipa', descricao: '', listado: true })
  assert.equal(indexed(), 1)
})

test('report from an account exactly 7 days old weighs as strong; one second less, it does not', () => {
  const x = fresh()
  const [author, stale, almost] = [x.rover(), x.rover(), x.rover()]
  const p1 = x.ok(author, 'postagem', { texto: 'primeira postagem', topicos: [] }).objeto.id
  const p2 = x.ok(author, 'postagem', { texto: 'segunda postagem', topicos: [] }).objeto.id
  const now = x.m.relogio.agora
  x.m.store.executar('UPDATE rovers SET criado_em = :c WHERE uid = :u', { c: now - TIMES.minAccountForReportWeightS, u: stale.uid })
  x.m.store.executar('UPDATE rovers SET criado_em = :c WHERE uid = :u', { c: now - TIMES.minAccountForReportWeightS + 1, u: almost.uid })
  x.does(stale, 'denuncia', { alvo: p1, motivo: 'spam' })
  x.does(almost, 'denuncia', { alvo: p2, motivo: 'spam' })
  const strong = (target) => x.m.store.um('SELECT forte FROM denuncias WHERE alvo = :a', { a: target }).forte
  assert.equal(strong(p1), 1)
  assert.equal(strong(p2), 0)
})
