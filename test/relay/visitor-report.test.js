// SPDX-License-Identifier: AGPL-3.0-or-later
// Visitor report (legal team request: the Report button works without login). POST /v1/objetos/:id/denuncias with { motivo }:
// same response whether the target exists or not, nothing about the reporter stored, cap per relay and per target, and what is not public stays out.
import test from 'node:test'
import assert from 'node:assert/strict'
import { VISITOR_REPORT, REPORT_REASONS_V3 } from '../../packages/protocol/src/index.js'
import { createRelayServer } from '../../packages/relay/src/http.js'
import { codeOf } from '../helpers/test-relay.js'
import { fresh } from '../helpers/network.js'

const NONEXISTENT_ID = `ob_${'A'.repeat(43)}`

test('a visitor reports without an account: enters the moderation log with weak weight and nothing about the sender', () => {
  const x = fresh()
  const pipa = x.rover()
  const post = x.ok(pipa, 'postagem', { texto: 'Tarde de leitura.', topicos: [] })
  assert.deepEqual(x.rele.visitorReport(post.id, { motivo: 'menores' }), { estado: 'recebida' })
  const [d] = x.rele.listReports()
  assert.equal(d.alvo, post.id)
  assert.equal(d.motivo, 'menores')
  assert.equal(d.peso, 0, 'weighs like a new account')
  assert.match(d.denunciante, /^visitante:[A-Za-z0-9_-]{16}$/, 'random pseudonym')
  // two reports with the same motivo do not collide (there is no way to know if it is the same person)
  x.rele.visitorReport(post.id, { motivo: 'menores', alvo: post.id })
  assert.equal(x.rele.listReports().length, 2)
  assert.notEqual(x.rele.listReports()[0].denunciante, x.rele.listReports()[1].denunciante)
})

test('the response is the same whether the target exists or not, and what the visitor cannot read stays out of the log', () => {
  const x = fresh()
  const owner = x.rover()
  assert.deepEqual(x.rele.visitorReport(NONEXISTENT_ID, { motivo: 'ilegal' }), { estado: 'recebida' })
  const closed = x.comunidade(owner, { acesso: 'fechada' })
  const t = x.topico(owner, closed)
  assert.deepEqual(x.rele.visitorReport(t, { motivo: 'ilegal' }), { estado: 'recebida' })
  assert.equal(x.rele.listReports().length, 0)
})

test('esquema: only a motivo from the 0.3 list, a target shaped like an id, closed body', () => {
  const x = fresh()
  assert.deepEqual([...VISITOR_REPORT.motivos], [...REPORT_REASONS_V3])
  const code = (id, body) => codeOf(() => x.rele.visitorReport(id, body))
  assert.equal(code(NONEXISTENT_ID, { motivo: 'nao-existe' }), 'esquema')
  assert.equal(code(NONEXISTENT_ID, { motivo: 'spam', nome: 'Ana' }), 'esquema', 'nothing about the reporter fits in the body')
  assert.equal(code(NONEXISTENT_ID, null), 'esquema')
  assert.equal(code('rvr_x', { motivo: 'spam' }), 'esquema')
  assert.equal(code(NONEXISTENT_ID, { motivo: 'spam', alvo: `ob_${'B'.repeat(43)}` }), 'esquema', 'body target differs from the path')
  assert.equal(code(NONEXISTENT_ID, { motivo: 'spam' }), 'ok')
})

test('caps: per target per day and per relay per hour', () => {
  const x = fresh()
  const pipa = x.rover()
  const post = x.ok(pipa, 'postagem', { texto: 'Bolo de cenoura.', topicos: [] })
  for (let i = 0; i < VISITOR_REPORT.perTargetPerDay + 5; i++) x.rele.visitorReport(post.id, { motivo: 'spam' })
  assert.equal(x.rele.listReports({ limite: 200 }).length, VISITOR_REPORT.perTargetPerDay, 'past the target cap, the rest vanishes silently')
  for (let i = VISITOR_REPORT.perTargetPerDay + 5; i < VISITOR_REPORT.perHourInRelay + 40; i++) {
    if (codeOf(() => x.rele.visitorReport(NONEXISTENT_ID, { motivo: 'spam' })) !== 'ok') break
  }
  // the ones that did not enter the log do not count toward the relay cap: the cap only bites when there are visitor rows in the last hour
  x.m.advance(86400)
  const other = x.ok(pipa, 'postagem', { texto: 'Outro dia.', topicos: [] })
  for (let i = 0; i < VISITOR_REPORT.perHourInRelay; i++) {
    x.m.store.executar("INSERT INTO denuncias (alvo, autor_do_alvo, motivo, pseudonimo, criado_em, forte) VALUES (:a, :b, 'spam', :p, :t, 0)", { a: other.id, b: pipa.uid, p: `visitante:x${i}`, t: x.m.relogio.agora })
  }
  assert.equal(codeOf(() => x.rele.visitorReport(other.id, { motivo: 'spam' })), 'limite_de_taxa')
})

test('over HTTP: 202 with no header about the sender, and the request log does not keep the body', async () => {
  const x = fresh()
  const pipa = x.rover()
  const post = x.ok(pipa, 'postagem', { texto: 'Rede na varanda.', topicos: [] })
  const events = []
  const server = createRelayServer({ rele: x.rele, registrar: (e) => events.push(e) })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  try {
    const base = `http://127.0.0.1:${server.address().port}`
    const r = await fetch(`${base}/v1/objetos/${post.id}/denuncias`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ alvo: post.id, motivo: 'assedio' }) })
    assert.equal(r.status, 202)
    assert.deepEqual(await r.json(), { estado: 'recebida' })
    const bad = await fetch(`${base}/v1/objetos/${post.id}/denuncias`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ motivo: 'xx' }) })
    assert.equal(bad.status, 422)
    assert.equal(x.rele.listReports().length, 1)
    assert.equal(JSON.stringify(events).includes('assedio'), false)
  } finally { await new Promise((ok) => { server.closeAllConnections(); server.close(ok) }) }
})
