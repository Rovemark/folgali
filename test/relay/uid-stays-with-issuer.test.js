// SPDX-License-Identifier: AGPL-3.0-or-later
// A uid stays with the issuer that first brought it to the relay (relay.js, `_resolveAttestation` and `sameIssuer`). Before this rule, a
// newer attestation from ANY trusted issuer replaced the key, the approval key, the handle and the issuer of an existing uid: whoever held
// one trusted issuer key could take over every rover of another issuer. The issuer key rotation (current and previous key of the same
// issuer) still works, but only when the operator declares the family: RELAY_ISSUER_FAMILIES, or both keys tied to the same discovery URL.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createHandleAttestation, createHumanApproval, createObject, generateKeyPair } from '../../packages/protocol/src/index.js'
import { Store } from '../../packages/relay/src/store.js'
import { Relay } from '../../packages/relay/src/relay.js'
import { StaticProvider } from '../../packages/relay/src/provider.js'
import { issuerFamiliesOf } from '../../packages/relay/src/operations.js'
import { readIssuerFamilies } from '../../packages/relay/src/people.js'
import { NOW, newIssuer, newUid } from '../helpers/world.js'

const codeOf = (fn) => {
  try { return fn().estado } catch (e) { if (e?.codigo) return e.codigo; throw e }
}

function world({ families = [] } = {}) {
  const A = newIssuer()
  const B = newIssuer()
  const C = newIssuer()
  const fams = families.map((f) => f.map((name) => ({ A, B, C })[name].publicKey))
  const relay = new Relay({
    store: new Store(':memory:'), provedor: new StaticProvider({ emissores: [A.publicKey, B.publicKey, C.publicKey] }),
    reportSecret: randomBytes(32), relogio: () => NOW, familiasDeEmissores: fams
  })
  return { A, B, C, relay }
}

/** An attestation of `issuer` for `uid`, with fresh keys (the attacker's, when the issuer is another one). */
function attest(issuer, uid, handle, emitidoEm) {
  const network = generateKeyPair()
  const approval = generateKeyPair()
  const atestado = createHandleAttestation({
    issuerPrivateKey: issuer.chavePrivada, emissor: issuer.publicKey, uid, handle, chave: network.publicKey,
    chaveAprovacao: approval.publicKey, emitidoEm, expiraEm: emitidoEm + 86400
  })
  return { network, approval, atestado }
}

function profile(relay, uid, who, previo, createdAt, name) {
  const objeto = createObject({
    tipo: 'perfil', autor: uid, criadoEm: createdAt, previo, v: '0.2',
    corpo: { nome: name, descricao: 'Rover de teste.', grafo: 'publico', exigirAprovacao: [] }, chavePrivada: who.network.chavePrivada
  })
  const aprovacao = createHumanApproval({ chavePrivadaDeAprovacao: who.approval.chavePrivada, objeto: objeto.id, autor: uid, aprovadoEm: createdAt })
  return { estado: codeOf(() => relay.aceitar({ objeto, atestado: who.atestado, aprovacao })), id: objeto.id }
}

// The PoC of the security review (F-01): the victim publishes with issuer A, issuer B attests the SAME uid with its own keys and handle.
test('F-01: another trusted issuer cannot re-attest a uid and take over the account', () => {
  const { A, B, relay } = world()
  const uid = newUid()
  const victim = attest(A, uid, 'vitima.hangar', NOW - 100)
  const first = profile(relay, uid, victim, null, NOW - 50, 'vitima')
  assert.equal(first.estado, 'aceito')
  const attacker = attest(B, uid, 'tomado.pelo.b', NOW - 10)
  assert.equal(profile(relay, uid, attacker, first.id, NOW - 5, 'atacante').estado, 'atestado_invalido')
  const p = relay.perfil(uid)
  assert.equal(p.emissor, A.publicKey)
  assert.equal(p.handle, 'vitima.hangar')
  assert.equal(p.chave, victim.network.publicKey)
  // the refused attempt took nothing: the victim keeps publishing with its stored attestation
  assert.equal(profile(relay, uid, { ...victim, atestado: undefined }, first.id, NOW - 4, 'vitima de novo').estado, 'aceito')
})

test('F-01: the same issuer still renews its own uid (new key and new handle)', () => {
  const { A, relay } = world()
  const uid = newUid()
  const first = profile(relay, uid, attest(A, uid, 'pipa.um', NOW - 100), null, NOW - 50, 'Pipa')
  const renewed = attest(A, uid, 'pipa.dois', NOW - 10)
  assert.equal(profile(relay, uid, renewed, first.id, NOW - 5, 'Pipa').estado, 'aceito')
  assert.equal(relay.perfil(uid).handle, 'pipa.dois')
  assert.equal(relay.perfil(uid).chave, renewed.network.publicKey)
})

test('F-01: the issuer key rotation declared by the operator keeps working (previous key -> current key)', () => {
  const { A, B, C, relay } = world({ families: [['A', 'B']] })
  const uid = newUid()
  const first = profile(relay, uid, attest(A, uid, 'pipa.rotacao', NOW - 100), null, NOW - 50, 'Pipa')
  const rotated = attest(B, uid, 'pipa.rotacao', NOW - 10)
  const second = profile(relay, uid, rotated, first.id, NOW - 5, 'Pipa')
  assert.equal(second.estado, 'aceito')
  assert.equal(relay.perfil(uid).emissor, B.publicKey)
  // and back, inside the family (a rollback of the rotation)
  assert.equal(profile(relay, uid, attest(A, uid, 'pipa.rotacao', NOW - 3), second.id, NOW - 2, 'Pipa').estado, 'aceito')
  // a key outside the family still cannot
  const third = relay.perfil(uid)
  assert.equal(third.emissor, A.publicKey)
  assert.equal(profile(relay, uid, attest(C, uid, 'tomado.pelo.c', NOW - 1), relay.store.rover(uid).cabeca_id, NOW, 'Atacante').estado, 'atestado_invalido')
  assert.equal(relay.perfil(uid).emissor, A.publicKey)
})

test('F-01: a handle taken by a revoked rover is released to the same issuer family only', () => {
  const { A, B, C, relay } = world({ families: [['A', 'B']] })
  const uidOld = newUid()
  profile(relay, uidOld, attest(A, uidOld, 'ameixa.prova', NOW - 100), null, NOW - 50, 'Velho')
  relay.provedor.revoke(A.publicKey, uidOld)
  const uidOther = newUid()
  assert.equal(profile(relay, uidOther, attest(C, uidOther, 'ameixa.prova', NOW - 10), null, NOW - 5, 'Outro').estado, 'handle_em_uso')
  const uidNew = newUid()
  assert.equal(profile(relay, uidNew, attest(B, uidNew, 'ameixa.prova', NOW - 10), null, NOW - 5, 'Novo').estado, 'aceito')
  assert.equal(relay.perfil(uidNew).handle, 'ameixa.prova')
})

test('issuer families: RELAY_ISSUER_FAMILIES and keys that share a discovery URL', () => {
  const [k1, k2, k3, k4] = [newIssuer(), newIssuer(), newIssuer(), newIssuer()].map((i) => i.publicKey)
  const issuers = [k1, k2, k3, k4]
  assert.deepEqual(issuerFamiliesOf({}, issuers), [])
  assert.deepEqual(issuerFamiliesOf({ RELAY_ISSUER_FAMILIES: `${k1}+${k2}` }, issuers), [[k1, k2]])
  const url = 'https://emissor.exemplo.test/.well-known/rover-network'
  assert.deepEqual(issuerFamiliesOf({}, issuers, [{ emissor: k3, url }, { emissor: k4, url }]), [[k3, k4]])
  // one source per key does not make a family
  assert.deepEqual(issuerFamiliesOf({}, issuers, [{ emissor: k3, url }, { emissor: k4, url: `${url}/outra` }]), [])
  // a key in the variable and in a shared URL merges into one family
  assert.deepEqual(issuerFamiliesOf({ RELAY_ISSUER_FAMILIES: `${k1}+${k2}` }, issuers, [{ emissor: k2, url }, { emissor: k3, url }]).map((f) => f.sort()), [[k1, k2, k3].sort()])
  assert.throws(() => issuerFamiliesOf({ RELAY_ISSUER_FAMILIES: k1 }, issuers), /duas chaves/)
  assert.throws(() => issuerFamiliesOf({ RELAY_ISSUER_FAMILIES: `${k1}+${newIssuer().publicKey}` }, issuers), /RELAY_ISSUERS/)
  assert.throws(() => issuerFamiliesOf({ RELAY_ISSUER_FAMILIES: `${k1}+abc` }, issuers), /base64url/)
  assert.throws(() => issuerFamiliesOf({ RELAY_ISSUER_FAMILIES: `${k1}+${k2}` }, issuers, [], { agentIssuers: [k1] }), /misture/)
  assert.throws(() => issuerFamiliesOf({ RELAY_ISSUER_FAMILIES: `${k1}+${k2}` }, issuers, [], { personIssuers: [k2] }), /misture/)
  assert.throws(() => readIssuerFamilies([[k1, k2], [k2, k3]]), /duas famílias/)
  assert.throws(() => readIssuerFamilies('x'), /lista de listas/)
})
