// SPDX-License-Identifier: AGPL-3.0-or-later
// Person declarations in 0.3: policy, standing authorization and revocation, each under the prefix of its own version.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LIMITS, AUTHORIZABLE_TYPES_V2, AUTHORIZABLE_TYPES_V3, REQUIRABLE_TYPES_V2, REQUIRABLE_TYPES_V3, PROTOCOL_VERSION, DECLARATION_VERSIONS,
  signBytes, canonicalBytes, computeAuthorizationId, declarationMatches, domainOf, authorizableTypesOf, requirableTypesOf, validateDeclaration,
  verifyStandingAuthorization
} from '../../packages/protocol/src/index.js'
import { NOW, newIssuer, newRover, authorizationOf, policyOf, revocationOf } from '../helpers/world.js'

const rover = newRover(newIssuer())
const other = newRover(newIssuer())
const object = { autor: rover.uid, tipo: 'postagem', criadoEm: NOW }
const ctx = (extra = {}) => ({ objeto: object, approvalKey: rover.aprovacao.publicKey, agora: NOW, ...extra })

test('the current version is 0.3 and the declarations exist in 0.2 and 0.3', () => {
  assert.equal(PROTOCOL_VERSION, '0.3')
  assert.deepEqual([...DECLARATION_VERSIONS], ['0.2', '0.3'])
  assert.deepEqual([...requirableTypesOf('0.2')], [...REQUIRABLE_TYPES_V2])
  assert.deepEqual([...requirableTypesOf('0.3')], [...REQUIRABLE_TYPES_V3])
  assert.deepEqual([...authorizableTypesOf('0.2')], [...AUTHORIZABLE_TYPES_V2])
  assert.deepEqual([...authorizableTypesOf('0.3')], [...AUTHORIZABLE_TYPES_V3])
  assert.equal(requirableTypesOf('0.1').length, 4, 'any version other than 0.3 uses the old list')
})

for (const v of ['0.2', '0.3']) {
  test(`policy ${v}: signed under the ${v} prefix with the approval key; the network key, the neighboring prefix and another author do not count`, () => {
    const p = policyOf(rover, { grafo: 'privado', exigirAprovacao: ['seguir'], v })
    assert.equal(p.v, v)
    assert.equal(validateDeclaration(p).ok, true)
    assert.equal(declarationMatches(p, rover.aprovacao.publicKey), true)
    assert.equal(declarationMatches(p, rover.rede.publicKey), false)
    assert.equal(declarationMatches(p, other.aprovacao.publicKey), false)
    const otherVersion = v === '0.2' ? '0.3' : '0.2'
    const without = (({ assinatura: _a, ...r }) => r)(p)
    const withNeighborPrefix = { ...p, assinatura: signBytes(domainOf(otherVersion, 'politica-da-pessoa'), canonicalBytes(without), rover.aprovacao.chavePrivada) }
    assert.equal(declarationMatches(withNeighborPrefix, rover.aprovacao.publicKey), false)
    const withRevocationPrefix = { ...p, assinatura: signBytes(domainOf(v, 'revogar-autorizacao'), canonicalBytes(without), rover.aprovacao.chavePrivada) }
    assert.equal(declarationMatches(withRevocationPrefix, rover.aprovacao.publicKey), false)
    // swapped label, same signature
    assert.equal(declarationMatches({ ...p, v: otherVersion }, rover.aprovacao.publicKey), false)
  })

  test(`revocation ${v}: id or "todas", version prefix, closed schema`, () => {
    const targetId = `au_${'A'.repeat(43)}`
    for (const target of [targetId, 'todas']) {
      const r = revocationOf(rover, target, { v })
      assert.equal(r.v, v)
      assert.equal(validateDeclaration(r).ok, true)
      assert.equal(declarationMatches(r, rover.aprovacao.publicKey), true)
      assert.equal(declarationMatches({ ...r, v: v === '0.2' ? '0.3' : '0.2' }, rover.aprovacao.publicKey), false)
    }
    assert.equal(validateDeclaration({ ...revocationOf(rover, 'todas', { v }), alvo: 'tudo' }).ok, false)
    assert.equal(validateDeclaration({ ...revocationOf(rover, 'todas', { v }), extra: 1 }).ok, false)
  })

  test(`authorization ${v}: only the version types, content-based id, version prefix`, () => {
    const list = authorizableTypesOf(v)
    const a = authorizationOf(rover, { tipos: [...list], v, maxPorHora: 5, maxPorDia: 20 })
    assert.equal(a.v, v)
    assert.equal(verifyStandingAuthorization(a, ctx()).ok, true, verifyStandingAuthorization(a, ctx()).erro?.message)
    assert.equal(a.id, computeAuthorizationId(a))
    const outside = v === '0.2' ? 'recado' : 'depoimento'
    const without = (({ id: _i, assinatura: _a, ...r }) => r)(a)
    const issue = (body, domain = domainOf(v, 'autorizacao-permanente')) => {
      const base = { ...without, ...body }
      const withId = { ...base, id: computeAuthorizationId(base) }
      return { ...withId, assinatura: signBytes(domain, canonicalBytes(withId), rover.aprovacao.chavePrivada) }
    }
    const r = verifyStandingAuthorization(issue({ tipos: [outside] }), ctx())
    assert.equal(r.ok, false)
    assert.equal(r.erro.codigo, 'esquema')
    assert.equal(r.erro.campo, 'autorizacao.tipos[0]')
    const otherVersion = v === '0.2' ? '0.3' : '0.2'
    const neighborPrefix = verifyStandingAuthorization(issue({}, domainOf(otherVersion, 'autorizacao-permanente')), ctx())
    assert.equal(neighborPrefix.erro.codigo, 'autorizacao_invalida')
    assert.equal(neighborPrefix.erro.campo, 'autorizacao.assinatura')
  })
}

test('policy 0.2 requires only the 4 old actions; 0.3 requires any of the 18 free ones and refuses the rest', () => {
  assert.equal(validateDeclaration(policyOf(rover, { exigirAprovacao: [...REQUIRABLE_TYPES_V2] })).ok, true)
  for (const newValue of REQUIRABLE_TYPES_V3.filter((t) => !REQUIRABLE_TYPES_V2.includes(t))) {
    assert.equal(validateDeclaration(policyOf(rover, { exigirAprovacao: [newValue] })).ok, false, `0.2 does not know ${newValue}`)
    assert.equal(validateDeclaration(policyOf(rover, { exigirAprovacao: [newValue], v: '0.3' })).ok, true, `0.3 knows ${newValue}`)
  }
  assert.equal(validateDeclaration(policyOf(rover, { exigirAprovacao: [...REQUIRABLE_TYPES_V3], v: '0.3' })).ok, true, 'all 18 at once')
  for (const never of ['perfil', 'postagem', 'recado', 'topico', 'remocao-pelo-autor', 'denuncia-falsa']) {
    assert.equal(validateDeclaration(policyOf(rover, { exigirAprovacao: [never], v: '0.3' })).ok, false, never)
  }
  assert.equal(validateDeclaration(policyOf(rover, { exigirAprovacao: ['selo', 'selo'], v: '0.3' })).ok, false)
})

test('a declaration with an unknown or missing version is "esquema" on the version field', () => {
  const p = policyOf(rover, { v: '0.3' })
  for (const v of ['0.1', '0.4', '', null, 0.3]) {
    const r = validateDeclaration({ ...p, v })
    assert.equal(r.ok, false, String(v))
    assert.equal(r.erro.codigo, 'esquema')
    assert.equal(r.erro.campo, 'declaracao.v')
  }
  const { v: _v, ...withoutV } = p
  assert.equal(validateDeclaration(withoutV).erro.campo, 'declaracao.v')
  assert.equal(validateDeclaration({ ...p, tipo: 'outra' }).erro.campo, 'declaracao.tipo')
})

test('authorization 0.3 keeps the caps and the 7-day validity; an unknown version is "esquema" (not "autorizacao_invalida")', () => {
  const ofNote = ctx({ objeto: { ...object, tipo: 'recado' } })
  const a = authorizationOf(rover, { tipos: ['recado'], v: '0.3', validadeS: LIMITS.autorizacaoValidadeMaxS })
  assert.equal(verifyStandingAuthorization(a, ofNote).ok, true)
  assert.equal(verifyStandingAuthorization(a, ctx()).erro.campo, 'autorizacao.tipos', 'does not cover post')
  const long = authorizationOf(rover, { tipos: ['recado'], v: '0.3', validadeS: LIMITS.autorizacaoValidadeMaxS + 1 })
  assert.equal(verifyStandingAuthorization(long, ofNote).erro.campo, 'autorizacao.expiraEm')
  const r = verifyStandingAuthorization({ ...a, v: '0.4' }, ofNote)
  assert.equal(r.erro.codigo, 'esquema')
  assert.equal(r.erro.campo, 'autorizacao.v')
  assert.equal(verifyStandingAuthorization({}, ctx()).erro.codigo, 'esquema')
  assert.equal(verifyStandingAuthorization(null, ctx()).erro.codigo, 'autorizacao_invalida')
})
