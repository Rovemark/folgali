// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPair, verifyHandleAttestation } from '../../packages/protocol/src/index.js'
import { AttestationProvider, StaticProvider } from '../../packages/relay/src/provider.js'
import { TestProvider } from '../../packages/relay/src/test-provider.js'
import { NOW, newUid } from '../helpers/world.js'

test('the base interface does not work on its own: whoever implements it must fill everything in', () => {
  const base = new AttestationProvider()
  assert.throws(() => base.nome, /não implementado/)
  assert.throws(() => base.trustedIssuers(), /não implementado/)
  assert.throws(() => base.revogados(), /não implementado/)
  assert.throws(() => base.versao, /não implementado/)
})

test('static provider: issuer list, revocation and a version that goes up on every change', () => {
  const a = generateKeyPair().publicKey
  const b = generateKeyPair().publicKey
  const p = new StaticProvider({ emissores: [a, b], nome: 'meu' })
  assert.equal(p.nome, 'meu')
  assert.deepEqual(p.trustedIssuers(), [a, b])
  const v0 = p.versao
  const uid = newUid()
  p.revoke(a, uid)
  assert.equal(p.versao, v0 + 1)
  assert.deepEqual(p.revogados(), [{ emissor: a, uid }])
  p.undoRevocation(a, uid)
  assert.equal(p.versao, v0 + 2)
  assert.deepEqual(p.revogados(), [])
  p.stopTrusting(a)
  assert.equal(p.versao, v0 + 3)
  assert.deepEqual(p.trustedIssuers(), [b])
})

test('what the provider returns is a copy: changing it does not change the configuration', () => {
  const a = generateKeyPair().publicKey
  const p = new StaticProvider({ emissores: [a], revogados: [{ emissor: a, uid: newUid() }] })
  p.trustedIssuers().push('intruso')
  p.revogados()[0].uid = 'outro'
  p.revogados().push({ emissor: a, uid: 'mais um' })
  assert.deepEqual(p.trustedIssuers(), [a])
  assert.equal(p.revogados().length, 1)
  assert.notEqual(p.revogados()[0].uid, 'outro')
})

test('undoing the revocation of one rover does not release the revocation of another', () => {
  const a = generateKeyPair().publicKey
  const u1 = newUid()
  const u2 = newUid()
  const p = new StaticProvider({ emissores: [a], revogados: [{ emissor: a, uid: u1 }, { emissor: a, uid: u2 }] })
  p.undoRevocation(a, u1)
  assert.deepEqual(p.revogados(), [{ emissor: a, uid: u2 }])
  p.undoRevocation(generateKeyPair().publicKey, u2) // another issuer does not undo it
  assert.equal(p.revogados().length, 1)
})

test('the test provider issues attestations that the protocol accepts', () => {
  const p = new TestProvider()
  const network = generateKeyPair()
  const approval = generateKeyPair()
  const at = p.issue({ uid: newUid(), handle: 'quem.quer', chave: network.publicKey, chaveAprovacao: approval.publicKey, emitidoEm: NOW, validadeS: 100 })
  assert.equal(at.expiraEm - at.emitidoEm, 100)
  assert.equal(verifyHandleAttestation(at, { agora: NOW, trustedIssuers: p.trustedIssuers() }).ok, true)
  const defaultValue = p.issue({ uid: newUid(), handle: 'quem.quer', chave: network.publicKey, chaveAprovacao: approval.publicKey, emitidoEm: NOW })
  assert.equal(defaultValue.expiraEm - defaultValue.emitidoEm, 30 * 86400)
  assert.equal(p.nome, 'teste')
})
