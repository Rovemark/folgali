// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { Relay } from '../../packages/relay/src/relay.js'
import { codeOf, errorOf, newWorld, publish, registeredRover } from '../helpers/test-relay.js'

const post = (text) => ({ texto: text, topicos: [] })

test('report: accepted without revealing who reported, in any table', () => {
  const m = newWorld()
  const author = registeredRover(m)
  const reporter = registeredRover(m)
  const p = publish(m, author, 'postagem', post('conteúdo problemático'))
  const r = publish(m, reporter, 'denuncia', { alvo: p.id, motivo: 'spam' })
  assert.equal(r.estado, 'recebida')
  const queue = m.rele.listReports()
  assert.equal(queue.length, 1)
  assert.equal(queue[0].alvo, p.id)
  assert.equal(queue[0].autorDoAlvo, author.uid)
  assert.equal(queue[0].motivo, 'spam')
  assert.match(queue[0].denunciante, /^[A-Za-z0-9_-]{22}$/)
  // the reporter's uid and key do not appear anywhere in what was stored
  const all = JSON.stringify([
    m.store.todos('SELECT * FROM denuncias'),
    m.store.todos("SELECT * FROM objetos WHERE tipo = 'denuncia'"),
    queue
  ])
  assert.ok(!all.includes(reporter.uid))
  assert.ok(!all.includes(reporter.rede.publicKey))
  assert.ok(!all.includes(r.id), 'the signed report object itself is not stored')
  assert.equal(m.store.objeto(r.id), null)
  // the reporter's chain does not record the report
  assert.equal(m.rele.perfil(reporter.uid).cabeca, reporter.cabeca)
})

test('report: same response for a target that exists, one that does not, and one that belongs to the reporter', () => {
  const m = newWorld()
  const a = registeredRover(m)
  const b = registeredRover(m)
  const his = publish(m, a, 'postagem', post('de A'))
  const mine = publish(m, b, 'postagem', post('de B'))
  const r1 = publish(m, b, 'denuncia', { alvo: his.id, motivo: 'golpe' })
  const r2 = publish(m, b, 'denuncia', { alvo: `ob_${'Z'.repeat(43)}`, motivo: 'golpe' })
  const r3 = publish(m, b, 'denuncia', { alvo: mine.id, motivo: 'golpe' })
  for (const r of [r1, r2, r3]) assert.equal(r.estado, 'recebida')
  assert.equal(m.rele.listReports().length, 1) // only the report on an existing target that is not the reporter's own
})

test('a report repeated by the same reporter counts once; another reporter adds', () => {
  const m = newWorld()
  const a = registeredRover(m)
  const b = registeredRover(m)
  const c = registeredRover(m)
  const p = publish(m, a, 'postagem', post('x'))
  publish(m, b, 'denuncia', { alvo: p.id, motivo: 'spam' })
  publish(m, b, 'denuncia', { alvo: p.id, motivo: 'assedio' })
  assert.equal(m.rele.listReports().length, 1)
  publish(m, c, 'denuncia', { alvo: p.id, motivo: 'spam' })
  const queue = m.rele.listReports()
  assert.equal(queue.length, 2)
  assert.notEqual(queue[0].denunciante, queue[1].denunciante)
  // the pseudonym is stable for the same reporter and changes with the relay secret
  const otherRelay = new Relay({ store: m.store, provedor: m.provedor, relogio: () => m.relogio.agora, reportSecret: randomBytes(32) })
  assert.notEqual(otherRelay._pseudonym(b.uid), m.rele._pseudonym(b.uid))
  assert.equal(m.rele._pseudonym(b.uid), m.rele._pseudonym(b.uid))
})

test('report: ten per day per reporter, the eleventh is refused; the next day it works again', () => {
  const m = newWorld()
  const a = registeredRover(m)
  const d = registeredRover(m)
  for (let i = 0; i < 10; i++) {
    const p = publish(m, a, 'postagem', post(`alvo ${i}`), { criadoEm: m.relogio.agora })
    assert.equal(publish(m, d, 'denuncia', { alvo: p.id, motivo: 'spam' }).estado, 'recebida')
    if (i % 9 === 8) continue
    m.advance(400) // space out A's posts so they do not hit the post rate limit
  }
  const extra = publish(m, a, 'postagem', post('mais um'))
  const e = errorOf(() => publish(m, d, 'denuncia', { alvo: extra.id, motivo: 'spam' }))
  assert.equal(e.codigo, 'limite_de_taxa')
  m.advance(86400 + 1)
  assert.equal(publish(m, d, 'denuncia', { alvo: extra.id, motivo: 'spam' }).estado, 'recebida')
})

test('a report is subject to the signature, the attestation and the clock like any object', () => {
  const m = newWorld()
  const a = registeredRover(m)
  const d = registeredRover(m)
  const p = publish(m, a, 'postagem', post('x'))
  assert.equal(codeOf(() => publish(m, d, 'denuncia', { alvo: p.id, motivo: 'spam' }, { criadoEm: m.relogio.agora - 5000 })), 'relogio')
  m.provedor.revoke(m.provedor.publicKey, d.uid)
  assert.equal(codeOf(() => publish(m, d, 'denuncia', { alvo: p.id, motivo: 'spam' })), 'atestado_revogado')
  assert.equal(m.rele.listReports().length, 0)
})

test('a report about content removed by its author leaves the queue; whoever leaves takes their reports along', () => {
  const m = newWorld()
  const a = registeredRover(m)
  const d = registeredRover(m)
  const p1 = publish(m, a, 'postagem', post('um'))
  const p2 = publish(m, a, 'postagem', post('dois'))
  publish(m, d, 'denuncia', { alvo: p1.id, motivo: 'spam' })
  publish(m, d, 'denuncia', { alvo: p2.id, motivo: 'spam' })
  publish(m, a, 'remocao-pelo-autor', { alvo: p1.id })
  assert.deepEqual(m.rele.listReports().map((x) => x.alvo), [p2.id])
  publish(m, a, 'remocao-pelo-autor', { alvo: m.store.rover(a.uid).perfil_id })
  assert.equal(m.rele.listReports().length, 0)
})

test('retention: a report disappears after the deadline', () => {
  const m = newWorld()
  const a = registeredRover(m)
  const d = registeredRover(m)
  const p = publish(m, a, 'postagem', post('x'))
  publish(m, d, 'denuncia', { alvo: p.id, motivo: 'ilegal' })
  m.advance(179 * 86400)
  assert.equal(m.rele.limpar(), 0)
  assert.equal(m.rele.listReports().length, 1)
  m.advance(2 * 86400)
  assert.equal(m.rele.limpar(), 1)
  assert.equal(m.rele.listReports().length, 0)
})

test('block rover: disappears from reads and can no longer publish; unblocking restores it', () => {
  const m = newWorld()
  const r = registeredRover(m)
  const other = registeredRover(m)
  publish(m, r, 'postagem', post('antes do bloqueio'))
  publish(m, other, 'seguir', { alvo: r.uid })
  m.rele.bloquear({ tipo: 'rover', alvo: r.uid, motivo: 'abuso comprovado' })
  assert.equal(codeOf(() => m.rele.perfil(r.uid)), 'nao_encontrado')
  assert.equal(codeOf(() => m.rele.postsOf(r.uid)), 'nao_encontrado')
  assert.equal(m.rele.homeTimeline(other.uid).itens.length, 0)
  assert.equal(codeOf(() => publish(m, r, 'postagem', post('depois'))), 'bloqueado')
  assert.equal(codeOf(() => publish(m, other, 'seguir', { alvo: r.uid })), 'alvo_desconhecido') // the blocked rover stops being a valid target
  assert.equal(codeOf(() => publish(m, other, 'reacao', { alvo: m.store.rover(r.uid).cabeca_id, reacao: 'curtir' })), 'alvo_desconhecido')
  assert.deepEqual(m.rele.listBlocks().map((b) => [b.tipo, b.alvo, b.motivo]), [['rover', r.uid, 'abuso comprovado']])
  m.rele.desbloquear('rover', r.uid)
  assert.equal(m.rele.perfil(r.uid).uid, r.uid)
  assert.equal(publish(m, r, 'postagem', post('de volta')).estado, 'aceito')
})

test('block object: disappears from reads and targets; block issuer: nobody from it gets in or shows up', () => {
  const m = newWorld()
  const r = registeredRover(m)
  const other = registeredRover(m)
  const bad = publish(m, r, 'postagem', post('ruim'))
  const good = publish(m, r, 'postagem', post('bom'))
  publish(m, other, 'seguir', { alvo: r.uid })
  m.rele.bloquear({ tipo: 'objeto', alvo: bad.id, motivo: 'conteúdo ilegal' })
  assert.deepEqual(m.rele.postsOf(r.uid).itens.map((e) => e.objeto.id), [good.id])
  assert.deepEqual(m.rele.homeTimeline(other.uid).itens.map((e) => e.objeto.id), [good.id])
  assert.equal(codeOf(() => m.rele.objeto(bad.id)), 'nao_encontrado')
  assert.equal(codeOf(() => publish(m, other, 'resposta', { alvo: bad.id, texto: 'oi' })), 'alvo_desconhecido')
  assert.equal(m.rele.objeto(good.id).objeto.id, good.id)

  m.rele.bloquear({ tipo: 'emissor', alvo: m.provedor.publicKey, motivo: 'emissor comprometido' })
  assert.equal(codeOf(() => publish(m, r, 'postagem', post('x'))), 'bloqueado')
  assert.equal(codeOf(() => m.rele.perfil(r.uid)), 'nao_encontrado')
  m.rele.desbloquear('emissor', m.provedor.publicKey)
  assert.equal(m.rele.perfil(r.uid).uid, r.uid)
})

test('block: input validation and unblocking something that does not exist', () => {
  const m = newWorld()
  const r = registeredRover(m)
  const bad = [
    { tipo: 'pessoa', alvo: r.uid, motivo: 'x' },
    { tipo: 'rover', alvo: 'rvr_curto', motivo: 'x' },
    { tipo: 'objeto', alvo: r.uid, motivo: 'x' },
    { tipo: 'emissor', alvo: 'curta', motivo: 'x' },
    { tipo: 'rover', alvo: r.uid, motivo: '' },
    { tipo: 'rover', alvo: r.uid, motivo: 'x'.repeat(201) },
    { tipo: 'rover', alvo: r.uid, motivo: '<b>html</b>' },
    { tipo: 'rover', alvo: 5, motivo: 'x' }
  ]
  for (const b of bad) assert.equal(codeOf(() => m.rele.bloquear(b)), 'esquema', JSON.stringify(b))
  assert.equal(codeOf(() => m.rele.desbloquear('rover', r.uid)), 'nao_encontrado')
  m.rele.bloquear({ tipo: 'rover', alvo: r.uid, motivo: 'um' })
  m.rele.bloquear({ tipo: 'rover', alvo: r.uid, motivo: 'dois' }) // repeating replaces the reason, it does not duplicate
  assert.deepEqual(m.rele.listBlocks().map((b) => b.motivo), ['dois'])
})

test('a short or missing report secret does not let the relay start', () => {
  const m = newWorld()
  for (const secret of [undefined, Buffer.alloc(16), 'x'.repeat(40)]) {
    assert.throws(() => new Relay({ store: m.store, provedor: m.provedor, reportSecret: secret }), /32 bytes/)
  }
})
