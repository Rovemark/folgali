// SPDX-License-Identifier: AGPL-3.0-or-later
// Declarations from the person on the relay: policy and revocation. They come directly from the person, signed with the APPROVAL key.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { LIMITS, signBytes, canonicalBytes, DOMAINS, toB64u } from '../../packages/protocol/src/index.js'
import { authorizationOf, policyOf, revocationOf } from '../helpers/world.js'
import { codeOf, errorOf, newWorld, publish, registeredRover } from '../helpers/test-relay.js'

const newAuthorizationId = () => `au_${toB64u(randomBytes(32)).slice(0, 43)}`
const send = (m, declaration) => m.rele.acceptDeclaration({ declaracao: declaration })
const policy = (m, r, extra = {}) => policyOf(r, { emitidaEm: m.relogio.agora, ...extra })
const revocation = (m, r, target, extra = {}) => revocationOf(r, target, { revogadaEm: m.relogio.agora, ...extra })

test('person policy: accepted, shows up on the profile, and resending the same one is "duplicada" with no effect', () => {
  const m = newWorld()
  const r = registeredRover(m)
  const p = policy(m, r, { grafo: 'contagens', exigirAprovacao: ['reacao', 'seguir'] })
  assert.deepEqual(send(m, p), { estado: 'aceita' })
  const profile = m.rele.perfil(r.uid)
  assert.equal(profile.grafo, 'contagens')
  assert.deepEqual(profile.exigirAprovacao, ['reacao', 'seguir'])
  assert.deepEqual(send(m, p), { estado: 'duplicada' })
  assert.equal(m.store.politica(r.uid).emitida_em, p.emitidaEm)
  // the relay stores the whole signed declaration, for whoever audits it
  assert.deepEqual(JSON.parse(m.store.politica(r.uid).declaracao), p)
})

test('a newer policy replaces; same date but different, or older, is "declaracao_antiga"', () => {
  const m = newWorld()
  const r = registeredRover(m)
  send(m, policy(m, r, { grafo: 'privado' }))
  const sameDateOtherContent = policy(m, r, { grafo: 'publico' })
  assert.equal(errorOf(() => send(m, sameDateOtherContent)).codigo, 'declaracao_antiga')
  assert.equal(errorOf(() => send(m, sameDateOtherContent)).campo, 'declaracao.emitidaEm')
  assert.equal(codeOf(() => send(m, policy(m, r, { grafo: 'publico', emitidaEm: m.relogio.agora - 1 }))), 'declaracao_antiga')
  assert.equal(m.rele.perfil(r.uid).grafo, 'privado', 'the refused one changed nothing')
  assert.equal(send(m, policy(m, r, { grafo: 'publico', emitidaEm: m.relogio.agora + 1 })).estado, 'aceita')
  assert.equal(m.rele.perfil(r.uid).grafo, 'publico')
  assert.equal(m.store.politica(r.uid).emitida_em, m.relogio.agora + 1)
  // an old declaration resent after the new one (replay) does not undo the new one
  assert.equal(codeOf(() => send(m, sameDateOtherContent)), 'declaracao_antiga')
  assert.equal(m.rele.perfil(r.uid).grafo, 'publico')
})

test('declaration clock: up to 2 minutes in the future, and not one second more', () => {
  const m = newWorld()
  const r = registeredRover(m)
  assert.equal(errorOf(() => send(m, policy(m, r, { emitidaEm: m.relogio.agora + 121 }))).codigo, 'relogio')
  assert.equal(errorOf(() => send(m, policy(m, r, { emitidaEm: m.relogio.agora + 121 }))).campo, 'declaracao')
  assert.equal(send(m, policy(m, r, { emitidaEm: m.relogio.agora + 120 })).estado, 'aceita')
  assert.equal(codeOf(() => send(m, revocation(m, r, 'todas', { revogadaEm: m.relogio.agora + 121 }))), 'relogio')
  assert.equal(send(m, revocation(m, r, 'todas', { revogadaEm: m.relogio.agora + 120 })).estado, 'aceita')
  // from the past, any date is valid: an offline person may send what they signed days ago
  assert.equal(send(m, revocation(m, r, newAuthorizationId(), { revogadaEm: m.relogio.agora - 5 * 86400 })).estado, 'aceita')
})

test(`signature: only the rover's APPROVAL key counts, not the network key, not another rover's key, and not tampered content`, () => {
  const m = newWorld()
  const r = registeredRover(m)
  const other = registeredRover(m)
  const p = policy(m, r, { grafo: 'privado' })
  const hers = (key) => ({ ...p, assinatura: signBytes(DOMAINS.politica, canonicalBytes((({ assinatura: _a, ...x }) => x)(p)), key) })
  for (const fake of [hers(r.rede.chavePrivada), hers(other.aprovacao.chavePrivada), hers(other.rede.chavePrivada), { ...p, grafo: 'publico' }, { ...p, emitidaEm: p.emitidaEm + 1 }]) {
    const e = errorOf(() => send(m, fake))
    assert.equal(e.codigo, 'assinatura_invalida')
    assert.equal(e.campo, 'declaracao.assinatura')
  }
  assert.equal(m.rele.perfil(r.uid).grafo, 'publico')
  assert.equal(m.store.politica(r.uid), null)
  // a revocation forged by the rover (network key) is not valid either
  const rev = revocation(m, r, 'todas')
  const forged = { ...rev, assinatura: signBytes(DOMAINS.revogacao, canonicalBytes((({ assinatura: _a, ...x }) => x)(rev)), r.rede.chavePrivada) }
  assert.equal(codeOf(() => send(m, forged)), 'assinatura_invalida')
  assert.equal(m.store.um('SELECT COUNT(*) AS n FROM autorizacoes_revogadas').n, 0)
})

test('a policy does not count as a revocation nor the other way around: the signature domain is different', () => {
  const m = newWorld()
  const r = registeredRover(m)
  const p = policy(m, r)
  const rev = revocation(m, r, 'todas')
  assert.equal(codeOf(() => send(m, { ...rev, tipo: 'politica-da-pessoa' })), 'esquema')
  assert.equal(codeOf(() => send(m, { ...p, tipo: 'revogar-autorizacao' })), 'esquema')
})

test('validation order: envelope, shape, known rover, signature, clock', () => {
  const m = newWorld()
  const r = registeredRover(m)
  const unknown = registeredRover(newWorld()) // exists on another relay, not on this one
  // closed envelope
  assert.equal(errorOf(() => m.rele.acceptDeclaration({ declaracao: policy(m, r), extra: 1 })).campo, 'envelope.extra')
  assert.equal(errorOf(() => m.rele.acceptDeclaration({})).campo, 'envelope.declaracao')
  for (const bad of [null, 'x', [], 7]) assert.equal(codeOf(() => m.rele.acceptDeclaration(bad)), 'esquema')
  // shape before anything else (the rover is not even looked up)
  assert.equal(codeOf(() => send(m, { ...policy(m, unknown), grafo: 'x' })), 'esquema')
  // rover known before the signature
  const withoutSigning = { ...policy(m, unknown), assinatura: 'A'.repeat(86) }
  assert.equal(codeOf(() => send(m, withoutSigning)), 'nao_encontrado')
  // signature before the clock
  const futureAndFake = { ...policy(m, r, { emitidaEm: m.relogio.agora + 9999 }), assinatura: 'A'.repeat(86) }
  assert.equal(codeOf(() => send(m, futureAndFake)), 'assinatura_invalida')
  // clock before the type rule
  send(m, policy(m, r))
  assert.equal(codeOf(() => send(m, policy(m, r, { emitidaEm: m.relogio.agora + 9999 }))), 'relogio')
})

test('unknown rover, or one that left: "não encontrado", with no hint', () => {
  const m = newWorld()
  const r = registeredRover(m)
  const strange = { ...r, uid: `rvr_${'Q'.repeat(22)}` }
  assert.equal(codeOf(() => send(m, policy(m, strange))), 'nao_encontrado')
  publish(m, r, 'remocao-pelo-autor', { alvo: m.rele.perfil(r.uid).perfil.id })
  assert.equal(codeOf(() => send(m, policy(m, r, { emitidaEm: m.relogio.agora + 1 }))), 'nao_encontrado')
  assert.equal(codeOf(() => send(m, revocation(m, r, 'todas'))), 'nao_encontrado')
})

test('expired attestation, blocked rover and revoked issuer can still receive a policy and a revocation (they only protect)', () => {
  const m = newWorld()
  const r = registeredRover(m)
  m.rele.bloquear({ tipo: 'rover', alvo: r.uid, motivo: 'teste' })
  assert.equal(send(m, policy(m, r, { grafo: 'privado' })).estado, 'aceita')
  assert.equal(send(m, revocation(m, r, 'todas')).estado, 'aceita')
  m.rele.desbloquear('rover', r.uid)
  m.advance(40 * 86400) // the 30 day attestation expired
  assert.equal(codeOf(() => m.rele.perfil(r.uid)), 'nao_encontrado')
  assert.equal(send(m, policy(m, r, { grafo: 'contagens', emitidaEm: m.relogio.agora })).estado, 'aceita')
})

// ---------- revocation ----------

test('revocation by id: accepted, duplicada if equal or older, updates if newer', () => {
  const m = newWorld()
  const r = registeredRover(m)
  const id = newAuthorizationId()
  assert.deepEqual(send(m, revocation(m, r, id)), { estado: 'aceita' })
  assert.deepEqual(send(m, revocation(m, r, id)), { estado: 'duplicada' })
  assert.deepEqual(send(m, revocation(m, r, id, { revogadaEm: m.relogio.agora - 10 })), { estado: 'duplicada' })
  assert.deepEqual(send(m, revocation(m, r, id, { revogadaEm: m.relogio.agora + 10 })), { estado: 'aceita' })
  const line = m.store.um('SELECT * FROM autorizacoes_revogadas WHERE autor = :a AND alvo = :id', { a: r.uid, id })
  assert.equal(line.em, m.relogio.agora + 10)
  assert.equal(line.recebida_em, m.relogio.agora)
  assert.equal(m.store.um('SELECT COUNT(*) AS n FROM autorizacoes_revogadas').n, 1)
})

test('revoking "todas" and revoking by id are separate lines; "todas" does not count toward the cap', () => {
  const m = newWorld()
  const r = registeredRover(m)
  assert.equal(send(m, revocation(m, r, 'todas')).estado, 'aceita')
  assert.equal(send(m, revocation(m, r, newAuthorizationId())).estado, 'aceita')
  assert.equal(m.store.um('SELECT COUNT(*) AS n FROM autorizacoes_revogadas').n, 2)
  assert.equal(m.store.revokedAuthorization(r.uid, 'au_qualquer', m.relogio.agora), true)
  assert.equal(m.store.revokedAuthorization(r.uid, 'au_qualquer', m.relogio.agora + 1), false)
})

test('revocation cap per rover: 200 by id; the 201st asks for "todas"; replacing an existing one and "todas" stay free', () => {
  assert.equal(LIMITS.revocationsPerRover, 200)
  const m = newWorld()
  const r = registeredRover(m)
  const other = registeredRover(m)
  const ids = Array.from({ length: LIMITS.revocationsPerRover }, newAuthorizationId)
  for (const id of ids) send(m, revocation(m, r, id))
  const e = errorOf(() => send(m, revocation(m, r, newAuthorizationId())))
  assert.equal(e.codigo, 'limite_de_taxa')
  assert.match(e.message, /200 revogações/)
  assert.equal(send(m, revocation(m, r, ids[0], { revogadaEm: m.relogio.agora + 5 })).estado, 'aceita')
  assert.equal(send(m, revocation(m, r, 'todas')).estado, 'aceita')
  // the cap is per rover
  assert.equal(send(m, revocation(m, other, newAuthorizationId())).estado, 'aceita')
  // 199 still lets the 200th through
  const m2 = newWorld()
  const r2 = registeredRover(m2)
  for (const id of ids.slice(0, 199)) send(m2, revocation(m2, r2, id))
  assert.equal(send(m2, revocation(m2, r2, ids[199])).estado, 'aceita')
})

test(`one rover's revocation does not apply to another rover with the same authorization id`, () => {
  const m = newWorld()
  const r = registeredRover(m)
  const other = registeredRover(m)
  const id = newAuthorizationId()
  send(m, revocation(m, r, id))
  assert.equal(m.store.revokedAuthorization(r.uid, id, 0), true)
  assert.equal(m.store.revokedAuthorization(other.uid, id, 0), false)
  assert.equal(m.store.revokedAuthorization(other.uid, 'todas', 0), false)
})

// 0.6.0: the "0.6" authorization does not expire, so the revocation can never be forgotten (before, it vanished after 7 days and 2 minutes)
test('retention: the revocation does not vanish with time; ten years later, the revoked authorization is still refused', () => {
  const m = newWorld()
  const r = registeredRover(m)
  send(m, revocation(m, r, newAuthorizationId()))
  send(m, revocation(m, r, 'todas'))
  m.advance(10 * 365 * 86400)
  assert.equal(m.rele.limpar(), 0)
  assert.equal(m.store.um('SELECT COUNT(*) AS n FROM autorizacoes_revogadas').n, 2)
})

test(`leaving the network deletes the rover's revocations, and only its own`, () => {
  const m = newWorld()
  const r = registeredRover(m)
  const other = registeredRover(m)
  send(m, revocation(m, r, 'todas'))
  send(m, revocation(m, other, 'todas'))
  publish(m, r, 'remocao-pelo-autor', { alvo: m.rele.perfil(r.uid).perfil.id })
  assert.equal(m.store.um('SELECT COUNT(*) AS n FROM autorizacoes_revogadas WHERE autor = :a', { a: r.uid }).n, 0)
  assert.equal(m.store.um('SELECT COUNT(*) AS n FROM autorizacoes_revogadas WHERE autor = :a', { a: other.uid }).n, 1)
})

test('a standing authorization is not a declaration: it is not registered, it travels in the object', () => {
  const m = newWorld()
  const r = registeredRover(m)
  assert.equal(errorOf(() => send(m, authorizationOf(r))).campo, 'declaracao.tipo')
})
