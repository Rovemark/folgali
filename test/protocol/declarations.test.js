// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DOMAINS, ProtocolError, LIMITS, signBytes, canonicalBytes, computeAuthorizationId, createStandingAuthorization, createPersonPolicy,
  declarationMatches, generateKeyPair, validateDeclaration, verifyStandingAuthorization
} from '../../packages/protocol/src/index.js'
import { NOW, authorizationOf, newIssuer, newRover, objectOf, policyOf, revocationOf } from '../helpers/world.js'

const issuer = newIssuer()
const rover = newRover(issuer)
const other = newRover(issuer)
const post = () => objectOf(rover, 'postagem', { texto: 'oi', topicos: [] })
const reply = () => objectOf(rover, 'resposta', { alvo: `ob_${'A'.repeat(43)}`, texto: 'ok' })

function declarationRefusal(value, code, field) {
  const r = validateDeclaration(value)
  assert.equal(r.ok, false, 'should refuse')
  assert.ok(r.erro instanceof ProtocolError)
  assert.equal(r.erro.codigo, code, r.erro.message)
  if (field) assert.equal(r.erro.campo, field)
  return r.erro
}

const ctx = (extra = {}) => ({ objeto: post(), approvalKey: rover.aprovacao.publicKey, agora: NOW, ...extra })
function authorizationRefusal(a, code, extra, field) {
  const r = verifyStandingAuthorization(a, ctx(extra))
  assert.equal(r.ok, false, 'should refuse')
  assert.equal(r.erro.codigo, code, r.erro.message)
  if (field) assert.equal(r.erro.campo, field)
  return r.erro
}
/** Authorization with chosen content and really signed (to prove one rule at a time, without the signature getting in the way). */
function authorizationUnder(changes, { chave: key = rover.aprovacao.chavePrivada } = {}) {
  const base = { ...authorizationOf(rover), ...changes }
  const { id: _i, assinatura: _a, ...without } = base
  const withId = { ...without, id: changes.id ?? computeAuthorizationId(without) }
  return { ...withId, assinatura: signBytes(DOMAINS.autorizacao, canonicalBytes(withId), key) }
}

// ---------- person policy ----------

test('person policy: shape, signature with the APPROVAL key and no other', () => {
  const p = policyOf(rover, { grafo: 'privado', exigirAprovacao: ['seguir', 'denuncia'] })
  assert.equal(p.tipo, 'politica-da-pessoa')
  assert.equal(p.v, '0.2')
  assert.equal(validateDeclaration(p).ok, true)
  assert.equal(declarationMatches(p, rover.aprovacao.publicKey), true)
  assert.equal(declarationMatches(p, rover.rede.publicKey), false, 'the network key does not count')
  assert.equal(declarationMatches(p, other.aprovacao.publicKey), false)
  assert.equal(declarationMatches({ ...p, grafo: 'publico' }, rover.aprovacao.publicKey), false)
  assert.equal(declarationMatches({ ...p, emitidaEm: p.emitidaEm + 1 }, rover.aprovacao.publicKey), false)
  assert.equal(declarationMatches({ ...p, exigirAprovacao: [] }, rover.aprovacao.publicKey), false)
})

test('person policy: with no requirements list, an empty list applies', () => {
  const p = createPersonPolicy({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, autor: rover.uid, emitidaEm: NOW, grafo: 'contagens' })
  assert.deepEqual(p.exigirAprovacao, [])
  assert.equal(validateDeclaration(p).ok, true)
})

test('closed schema of the person policy', () => {
  const p = policyOf(rover, { grafo: 'privado', exigirAprovacao: ['seguir'] })
  const without = (field) => { const { [field]: _x, ...rest } = p; return rest }
  for (const field of ['tipo', 'v', 'autor', 'emitidaEm', 'grafo', 'exigirAprovacao', 'assinatura']) {
    declarationRefusal(without(field), 'esquema', field === 'tipo' ? 'declaracao.tipo' : `declaracao.${field}`)
  }
  declarationRefusal({ ...p, extra: 1 }, 'esquema', 'declaracao.extra')
  declarationRefusal({ ...p, grafo: 'secreto' }, 'esquema', 'declaracao.grafo')
  declarationRefusal({ ...p, grafo: 'Publico' }, 'esquema', 'declaracao.grafo')
  declarationRefusal({ ...p, v: '0.1' }, 'esquema', 'declaracao.v')
  declarationRefusal({ ...p, autor: 'rvr_curto' }, 'esquema', 'declaracao.autor')
  declarationRefusal({ ...p, emitidaEm: 1.5 }, 'esquema', 'declaracao.emitidaEm')
  declarationRefusal({ ...p, emitidaEm: 1_699_999_999 }, 'esquema', 'declaracao.emitidaEm')
  declarationRefusal({ ...p, emitidaEm: 4_102_444_801 }, 'esquema', 'declaracao.emitidaEm')
  declarationRefusal({ ...p, assinatura: p.assinatura.slice(1) }, 'esquema', 'declaracao.assinatura')
  declarationRefusal({ ...p, exigirAprovacao: 'seguir' }, 'esquema', 'declaracao.exigirAprovacao')
  declarationRefusal({ ...p, exigirAprovacao: ['postagem'] }, 'esquema', 'declaracao.exigirAprovacao[0]')
  declarationRefusal({ ...p, exigirAprovacao: ['remocao-pelo-autor'] }, 'esquema', 'declaracao.exigirAprovacao[0]')
  declarationRefusal({ ...p, exigirAprovacao: ['seguir', 'seguir'] }, 'esquema', 'declaracao.exigirAprovacao')
  declarationRefusal({ ...p, exigirAprovacao: ['seguir', 'seguir', 'reacao', 'denuncia', 'deixar-de-seguir'] }, 'esquema', 'declaracao.exigirAprovacao')
  assert.equal(validateDeclaration({ ...p, exigirAprovacao: ['seguir', 'deixar-de-seguir', 'reacao', 'denuncia'] }).ok, true)
  assert.equal(validateDeclaration({ ...p, emitidaEm: 1_700_000_000 }).ok, true)
  assert.equal(validateDeclaration({ ...p, emitidaEm: 4_102_444_800 }).ok, true)
})

test('only policy and revocation are declarations; the rest, and anything that is not an object, is refused', () => {
  for (const bad of [null, undefined, 'x', 42, [], [{}], true]) declarationRefusal(bad, 'esquema', 'declaracao')
  declarationRefusal({}, 'esquema', 'declaracao.tipo')
  declarationRefusal({ tipo: 'autorizacao-permanente' }, 'esquema', 'declaracao.tipo')
  declarationRefusal({ tipo: 'aprovacao-humana' }, 'esquema', 'declaracao.tipo')
  declarationRefusal({ tipo: 'postagem' }, 'esquema', 'declaracao.tipo')
  declarationRefusal({ tipo: ['politica-da-pessoa'] }, 'esquema', 'declaracao.tipo')
  declarationRefusal({ tipo: '__proto__' }, 'esquema', 'declaracao.tipo')
  declarationRefusal({ tipo: 'constructor' }, 'esquema', 'declaracao.tipo')
  const error = declarationRefusal({ tipo: 'x' }, 'esquema')
  assert.match(error.message, /politica-da-pessoa, revogar-autorizacao/)
})

// ---------- revocation ----------

test('revocation: by id or of all, signed with the approval key', () => {
  const id = authorizationOf(rover).id
  for (const target of [id, 'todas']) {
    const r = revocationOf(rover, target)
    assert.equal(r.tipo, 'revogar-autorizacao')
    assert.equal(validateDeclaration(r).ok, true, target)
    assert.equal(declarationMatches(r, rover.aprovacao.publicKey), true)
    assert.equal(declarationMatches(r, rover.rede.publicKey), false)
    assert.equal(declarationMatches({ ...r, alvo: target === 'todas' ? id : 'todas' }, rover.aprovacao.publicKey), false)
  }
  const r = revocationOf(rover, 'todas')
  // a signed policy cannot pass for a revocation, nor the other way round (different domains)
  const p = policyOf(rover)
  assert.equal(declarationMatches({ ...r, tipo: 'politica-da-pessoa' }, rover.aprovacao.publicKey), false)
  assert.equal(declarationMatches({ ...p, tipo: 'revogar-autorizacao' }, rover.aprovacao.publicKey), false)
})

test('closed schema of the revocation', () => {
  const id = authorizationOf(rover).id
  const r = revocationOf(rover, id)
  declarationRefusal({ ...r, extra: 1 }, 'esquema', 'declaracao.extra')
  const { alvo: _a, ...withoutTarget } = r
  declarationRefusal(withoutTarget, 'esquema', 'declaracao.alvo')
  for (const bad of ['TODAS', 'todas ', ' todas', 'todas\n', 'todos', '', 'au_curto', `au_${'A'.repeat(44)}`, `ob_${'A'.repeat(43)}`, `xau_${'A'.repeat(43)}`, `${id}x`, 7, null, ['todas']]) {
    declarationRefusal({ ...r, alvo: bad }, 'esquema', 'declaracao.alvo')
  }
  declarationRefusal({ ...r, revogadaEm: 'agora' }, 'esquema', 'declaracao.revogadaEm')
  declarationRefusal({ ...r, v: '0.1' }, 'esquema', 'declaracao.v')
  declarationRefusal({ ...r, tipo: 'revogar-autorizacao', grafo: 'privado' }, 'esquema', 'declaracao.grafo')
})

// ---------- standing authorization ----------

test('valid standing authorization: content-based id, signed by the approval key, 7 days at most', () => {
  const a = authorizationOf(rover, { maxPorHora: 5, maxPorDia: 20, tipos: ['postagem'] })
  assert.match(a.id, /^au_[A-Za-z0-9_-]{43}$/)
  assert.equal(a.v, '0.2')
  assert.equal(a.expiraEm - a.emitidaEm, 86400)
  assert.equal(computeAuthorizationId(a), a.id)
  const r = verifyStandingAuthorization(a, ctx())
  assert.equal(r.ok, true)
  assert.equal(r.autorizacao, a)
  // the same content gives the same id (content-based identifier), different content gives another
  assert.equal(authorizationOf(rover, { maxPorHora: 5, maxPorDia: 20, tipos: ['postagem'] }).id, a.id)
  assert.notEqual(authorizationOf(rover, { maxPorHora: 6, maxPorDia: 20, tipos: ['postagem'] }).id, a.id)
  assert.notEqual(authorizationOf(rover, { maxPorHora: 5, maxPorDia: 20, tipos: ['postagem'], emitidaEm: NOW + 1 }).id, a.id)
  // applies to a reply when the list covers it
  assert.equal(verifyStandingAuthorization(authorizationOf(rover), ctx({ objeto: reply() })).ok, true)
})

test('closed schema of the authorization: limits always present, types only postagem and resposta', () => {
  const a = authorizationOf(rover)
  const without = (field) => { const { [field]: _x, ...rest } = a; return rest }
  for (const field of ['tipo', 'v', 'id', 'autor', 'emitidaEm', 'expiraEm', 'tipos', 'maxPorHora', 'maxPorDia', 'assinatura']) {
    authorizationRefusal(without(field), 'esquema', {}, `autorizacao.${field}`)
  }
  authorizationRefusal({ ...a, extra: 1 }, 'esquema', {}, 'autorizacao.extra')
  authorizationRefusal({ ...a, v: '0.1' }, 'esquema', {}, 'autorizacao.v')
  authorizationRefusal({ ...a, id: `ob_${'A'.repeat(43)}` }, 'esquema', {}, 'autorizacao.id')
  authorizationRefusal({ ...a, tipos: [] }, 'esquema', {}, 'autorizacao.tipos')
  authorizationRefusal({ ...a, tipos: ['perfil'] }, 'esquema', {}, 'autorizacao.tipos[0]')
  authorizationRefusal({ ...a, tipos: ['seguir'] }, 'esquema', {}, 'autorizacao.tipos[0]')
  authorizationRefusal({ ...a, tipos: ['postagem', 'postagem'] }, 'esquema', {}, 'autorizacao.tipos')
  authorizationRefusal({ ...a, tipos: ['postagem', 'resposta', 'resposta'] }, 'esquema', {}, 'autorizacao.tipos')
  authorizationRefusal({ ...a, tipos: 'postagem' }, 'esquema', {}, 'autorizacao.tipos')
  const errorMin = authorizationRefusal({ ...a, tipos: [] }, 'esquema')
  assert.match(errorMin.message, /mínimo é 1/)
  for (const bad of [0, -1, 1.5, '5', null, LIMITS.autorizacaoPorHoraMax + 1]) authorizationRefusal({ ...a, maxPorHora: bad }, 'esquema', {}, 'autorizacao.maxPorHora')
  for (const bad of [0, -1, 2.5, '20', null, LIMITS.autorizacaoPorDiaMax + 1]) authorizationRefusal({ ...a, maxPorDia: bad }, 'esquema', {}, 'autorizacao.maxPorDia')
  for (const bad of [null, undefined, 'x', 42, [], true]) authorizationRefusal(bad, 'autorizacao_invalida', {}, 'autorizacao')
})

test('limit caps: 60 per hour and 300 per day are accepted, 1 too', () => {
  assert.equal(LIMITS.autorizacaoPorHoraMax, 60)
  assert.equal(LIMITS.autorizacaoPorDiaMax, 300)
  assert.equal(verifyStandingAuthorization(authorizationOf(rover, { maxPorHora: 60, maxPorDia: 300 }), ctx()).ok, true)
  assert.equal(verifyStandingAuthorization(authorizationOf(rover, { maxPorHora: 1, maxPorDia: 1 }), ctx()).ok, true)
  assert.equal(verifyStandingAuthorization(authorizationOf(rover, { maxPorHora: 7, maxPorDia: 7 }), ctx()).ok, true)
})

test('an id that is not the content hash, even with a good signature, is refused', () => {
  const fake = authorizationUnder({ id: `au_${'A'.repeat(43)}` })
  authorizationRefusal(fake, 'autorizacao_invalida', {}, 'autorizacao.id')
  // and content altered after signing keeps the old id: the id gives it away before the signature
  const a = authorizationOf(rover)
  authorizationRefusal({ ...a, maxPorHora: a.maxPorHora + 1 }, 'autorizacao_invalida', {}, 'autorizacao.id')
})

test('another rover authorization does not count, nor one signed with a key that is not this rover approval key', () => {
  authorizationRefusal(authorizationOf(other), 'autorizacao_invalida', {}, 'autorizacao.autor')
  const done = authorizationOf(other)
  assert.match(authorizationRefusal(done, 'autorizacao_invalida').message, /outro rover/)
  authorizationRefusal(authorizationUnder({}, { chave: other.aprovacao.chavePrivada }), 'autorizacao_invalida', {}, 'autorizacao.assinatura')
  authorizationRefusal(authorizationUnder({}, { chave: rover.rede.chavePrivada }), 'autorizacao_invalida', {}, 'autorizacao.assinatura')
  authorizationRefusal(authorizationOf(rover), 'autorizacao_invalida', { approvalKey: other.aprovacao.publicKey }, 'autorizacao.assinatura')
  authorizationRefusal(authorizationOf(rover), 'autorizacao_invalida', { approvalKey: rover.rede.publicKey }, 'autorizacao.assinatura')
})

test('validity: up to 7 days, positive; daily cap never lower than the hourly cap', () => {
  assert.equal(LIMITS.autorizacaoValidadeMaxS, 7 * 86400)
  assert.equal(verifyStandingAuthorization(authorizationOf(rover, { validadeS: 7 * 86400 }), ctx()).ok, true)
  const long = authorizationRefusal(authorizationOf(rover, { validadeS: 7 * 86400 + 1 }), 'autorizacao_invalida', {}, 'autorizacao.expiraEm')
  assert.match(long.message, /no máximo 7 dias/)
  authorizationRefusal(authorizationUnder({ expiraEm: NOW }), 'autorizacao_invalida', {}, 'autorizacao.expiraEm')
  authorizationRefusal(authorizationUnder({ expiraEm: NOW - 5 }), 'autorizacao_invalida', {}, 'autorizacao.expiraEm')
  assert.equal(verifyStandingAuthorization(authorizationOf(rover, { validadeS: 1 }), ctx()).ok, true)
  authorizationRefusal(authorizationOf(rover, { maxPorHora: 10, maxPorDia: 9 }), 'autorizacao_invalida', {}, 'autorizacao.maxPorDia')
  assert.equal(verifyStandingAuthorization(authorizationOf(rover, { maxPorHora: 10, maxPorDia: 10 }), ctx()).ok, true)
})

test('object type outside the list: the authorization only permits what it lists', () => {
  const replyOnly = authorizationOf(rover, { tipos: ['resposta'] })
  authorizationRefusal(replyOnly, 'autorizacao_invalida', {}, 'autorizacao.tipos')
  assert.equal(verifyStandingAuthorization(replyOnly, ctx({ objeto: reply() })).ok, true)
  const postOnly = authorizationOf(rover, { tipos: ['postagem'] })
  authorizationRefusal(postOnly, 'autorizacao_invalida', { objeto: reply() }, 'autorizacao.tipos')
  for (const type of ['perfil', 'seguir', 'deixar-de-seguir', 'reacao', 'denuncia', 'remocao-pelo-autor']) {
    authorizationRefusal(authorizationOf(rover), 'autorizacao_invalida', { objeto: { autor: rover.uid, tipo: type, criadoEm: NOW } }, 'autorizacao.tipos')
  }
})

test('time: expires at the exact moment, does not apply to an object created after expiry, nor when issued in the future', () => {
  const a = authorizationOf(rover, { emitidaEm: NOW, validadeS: 1000 })
  assert.equal(verifyStandingAuthorization(a, ctx({ agora: NOW + 999 })).ok, true)
  authorizationRefusal(a, 'autorizacao_vencida', { agora: NOW + 1000 }, 'autorizacao.expiraEm')
  authorizationRefusal(a, 'autorizacao_vencida', { agora: NOW + 5000 }, 'autorizacao.expiraEm')
  // created before expiry, checker clock already past it: expired live, valid on replica
  const o = objectOf(rover, 'postagem', { texto: 'oi', topicos: [] }, { criadoEm: NOW + 999 })
  assert.equal(verifyStandingAuthorization(a, ctx({ objeto: o, agora: NOW + 5000, aoVivo: false })).ok, true)
  authorizationRefusal(a, 'autorizacao_vencida', { objeto: o, agora: NOW + 5000 })
  // object created at or after the expiry time: expired, live or not
  const late = objectOf(rover, 'postagem', { texto: 'oi', topicos: [] }, { criadoEm: NOW + 1000 })
  authorizationRefusal(a, 'autorizacao_vencida', { objeto: late, aoVivo: false }, 'autorizacao.expiraEm')
  authorizationRefusal(a, 'autorizacao_vencida', { objeto: late, agora: NOW }, 'autorizacao.expiraEm')
  // issued in the future (beyond the clock tolerance)
  const future = authorizationOf(rover, { emitidaEm: NOW + 121 })
  authorizationRefusal(future, 'autorizacao_invalida', {}, 'autorizacao.emitidaEm')
  assert.equal(verifyStandingAuthorization(authorizationOf(rover, { emitidaEm: NOW + 120 }), ctx()).ok, true)
  assert.equal(verifyStandingAuthorization(future, ctx({ aoVivo: false })).ok, true)
})

test('authorization validation order: schema, id, author, signature, rules, type, expiry, future', () => {
  // several defects together: the first in the order shows up
  const expiredAndFromOther = authorizationOf(other, { tipos: ['resposta'], validadeS: 10 })
  assert.equal(authorizationRefusal(expiredAndFromOther, 'autorizacao_invalida', { agora: NOW + 5000 }).campo, 'autorizacao.autor')
  const bad = authorizationUnder({ tipos: ['resposta'], expiraEm: NOW + 10 }, { chave: other.aprovacao.chavePrivada })
  assert.equal(authorizationRefusal(bad, 'autorizacao_invalida', { agora: NOW + 5000 }).campo, 'autorizacao.assinatura')
  const typeAndExpired = authorizationOf(rover, { tipos: ['resposta'], validadeS: 10 })
  assert.equal(authorizationRefusal(typeAndExpired, 'autorizacao_invalida', { agora: NOW + 5000 }).campo, 'autorizacao.tipos')
  const expiredAndFuture = authorizationOf(rover, { emitidaEm: NOW - 5000, validadeS: 10 })
  assert.equal(authorizationRefusal(expiredAndFuture, 'autorizacao_vencida').campo, 'autorizacao.expiraEm')
})

test('an authorization signed by an arbitrary key does not count, even with everything else right', () => {
  const hers = createStandingAuthorization({
    chavePrivadaDeAprovacao: generateKeyPair().chavePrivada, autor: rover.uid, emitidaEm: NOW, validadeS: 100, tipos: ['postagem'], maxPorHora: 1, maxPorDia: 1
  })
  authorizationRefusal(hers, 'autorizacao_invalida', {}, 'autorizacao.assinatura')
})
