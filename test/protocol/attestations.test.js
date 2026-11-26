// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createHandleAttestation, createHumanApproval, generateKeyPair, approvalId, toB64u,
  verifyHumanApproval, verifyHandleAttestation
} from '../../packages/protocol/src/index.js'
import { NOW, approve, newIssuer, newRover, newUid, objectOf } from '../helpers/world.js'

const issuer = newIssuer()
const trusted = [issuer.publicKey]
const ctx = (extra = {}) => ({ agora: NOW, trustedIssuers: trusted, ...extra })

function attestationRefusal(a, code, extra, field) {
  const r = verifyHandleAttestation(a, ctx(extra))
  assert.equal(r.ok, false)
  assert.equal(r.erro.codigo, code, r.erro.message)
  if (field) assert.equal(r.erro.campo, field)
}

test('valid handle attestation', () => {
  const r = newRover(issuer)
  const v = verifyHandleAttestation(r.atestado, ctx())
  assert.equal(v.ok, true)
  assert.equal(v.atestado.uid, r.uid)
  assert.match(r.atestado.assinatura, /^[A-Za-z0-9_-]{86}$/)
})

test('issuer not on the list, swapped signature and altered field', () => {
  const r = newRover(issuer)
  attestationRefusal(r.atestado, 'emissor_desconhecido', { trustedIssuers: [] }, 'atestado.emissor')
  attestationRefusal(r.atestado, 'emissor_desconhecido', { trustedIssuers: [generateKeyPair().publicKey] })
  attestationRefusal({ ...r.atestado, handle: 'outro.nome' }, 'atestado_invalido', {}, 'atestado.assinatura')
  attestationRefusal({ ...r.atestado, uid: newUid() }, 'atestado_invalido', {}, 'atestado.assinatura')
  const fake = newIssuer()
  const forged = createHandleAttestation({
    issuerPrivateKey: fake.chavePrivada, emissor: issuer.publicKey, uid: r.uid, handle: r.handle,
    chave: r.rede.publicKey, chaveAprovacao: r.aprovacao.publicKey, emitidoEm: NOW - 10, expiraEm: NOW + 1000
  })
  attestationRefusal(forged, 'atestado_invalido', {}, 'atestado.assinatura')
})

test('closed schema of the attestation', () => {
  const r = newRover(issuer)
  attestationRefusal({ ...r.atestado, extra: 1 }, 'esquema', {}, 'atestado.extra')
  const { handle: _h, ...without } = r.atestado
  attestationRefusal(without, 'esquema', {}, 'atestado.handle')
  attestationRefusal({ ...r.atestado, handle: 'Maiúsculo' }, 'esquema', {}, 'atestado.handle')
  attestationRefusal({ ...r.atestado, handle: 'ab' }, 'esquema', {}, 'atestado.handle')
  attestationRefusal({ ...r.atestado, uid: 'rvr_x' }, 'esquema', {}, 'atestado.uid')
  attestationRefusal(null, 'atestado_invalido')
  attestationRefusal('x', 'atestado_invalido')
})

test('validity: expired, in the future, too long, inverted', () => {
  const r = newRover(issuer, { validadeS: 100 })
  const base = { uid: r.uid, handle: r.handle, chave: r.rede.publicKey, chaveAprovacao: r.aprovacao.publicKey, issuerPrivateKey: issuer.chavePrivada, emissor: issuer.publicKey }
  attestationRefusal(r.atestado, 'atestado_vencido', { agora: NOW + 1000 }, 'atestado.expiraEm')
  attestationRefusal(r.atestado, 'atestado_vencido', { agora: r.atestado.expiraEm })
  assert.equal(verifyHandleAttestation(r.atestado, ctx({ agora: r.atestado.expiraEm - 1 })).ok, true)
  attestationRefusal(createHandleAttestation({ ...base, emitidoEm: NOW + 500, expiraEm: NOW + 900 }), 'atestado_invalido', {}, 'atestado.emitidoEm')
  assert.equal(verifyHandleAttestation(createHandleAttestation({ ...base, emitidoEm: NOW + 120, expiraEm: NOW + 900 }), ctx()).ok, true)
  attestationRefusal(createHandleAttestation({ ...base, emitidoEm: NOW - 10, expiraEm: NOW - 10 + 90 * 86400 + 1 }), 'atestado_invalido', {}, 'atestado.expiraEm')
  const long = verifyHandleAttestation(createHandleAttestation({ ...base, emitidoEm: NOW - 10, expiraEm: NOW - 10 + 90 * 86400 + 1 }), ctx())
  assert.match(long.erro.message, /no máximo 90 dias/)
  assert.equal(verifyHandleAttestation(createHandleAttestation({ ...base, emitidoEm: NOW - 10, expiraEm: NOW - 10 + 90 * 86400 }), ctx()).ok, true)
  attestationRefusal(createHandleAttestation({ ...base, emitidoEm: NOW - 10, expiraEm: NOW - 10 }), 'atestado_invalido', {}, 'atestado.expiraEm')
  attestationRefusal(createHandleAttestation({ ...base, emitidoEm: NOW - 10, expiraEm: NOW + 5000 }), 'atestado_invalido', { validadeMaxS: 1000 }, 'atestado.expiraEm')
})

test('the approval key must differ from the network key', () => {
  const r = newRover(issuer)
  const equal = createHandleAttestation({
    issuerPrivateKey: issuer.chavePrivada, emissor: issuer.publicKey, uid: r.uid, handle: r.handle,
    chave: r.rede.publicKey, chaveAprovacao: r.rede.publicKey, emitidoEm: NOW - 10, expiraEm: NOW + 1000
  })
  attestationRefusal(equal, 'atestado_invalido', {}, 'atestado.chaveAprovacao')
})

test('a small-order key is refused in both positions', () => {
  const r = newRover(issuer)
  const identity = Buffer.alloc(32); identity[0] = 1
  const weak = toB64u(identity)
  const mk = (key, approvalKey) => createHandleAttestation({
    issuerPrivateKey: issuer.chavePrivada, emissor: issuer.publicKey, uid: r.uid, handle: r.handle,
    chave: key, chaveAprovacao: approvalKey, emitidoEm: NOW - 10, expiraEm: NOW + 1000
  })
  attestationRefusal(mk(weak, r.aprovacao.publicKey), 'chave_fraca', {}, 'atestado.chave')
  attestationRefusal(mk(r.rede.publicKey, weak), 'chave_fraca', {}, 'atestado.chaveAprovacao')
})

// ---------- human approval ----------

function approvalRefusal(approval, object, rover, code, extra, field) {
  const r = verifyHumanApproval(approval, { objeto: object, approvalKey: rover.aprovacao.publicKey, agora: NOW, ...extra })
  assert.equal(r.ok, false)
  assert.equal(r.erro.codigo, code, r.erro.message)
  if (field) assert.equal(r.erro.campo, field)
}

test('valid human approval with identifiable use', () => {
  const r = newRover(issuer)
  const o = objectOf(r, 'postagem', { texto: 'oi', topicos: [] })
  const a = approve(r, o)
  assert.equal(verifyHumanApproval(a, { objeto: o, approvalKey: r.aprovacao.publicKey, agora: NOW }).ok, true)
  assert.equal(approvalId(a), approvalId(JSON.parse(JSON.stringify(a))))
  assert.notEqual(approvalId(a), approvalId(approve(r, o, { nonce: toB64u(Buffer.alloc(16, 7)) })))
  assert.match(a.nonce, /^[A-Za-z0-9_-]{22}$/)
})

test('approval bound to the object and to the rover', () => {
  const r = newRover(issuer)
  const other = newRover(issuer)
  const o1 = objectOf(r, 'postagem', { texto: 'um', topicos: [] })
  const o2 = objectOf(r, 'postagem', { texto: 'dois', topicos: [] })
  approvalRefusal(approve(r, o1), o2, r, 'aprovacao_invalida', {}, 'aprovacao.objeto')
  const fromOther = createHumanApproval({ chavePrivadaDeAprovacao: other.aprovacao.chavePrivada, objeto: o1.id, autor: other.uid, aprovadoEm: NOW })
  approvalRefusal(fromOther, o1, r, 'aprovacao_invalida', {}, 'aprovacao.autor')
  // with the right uid but signed by another rover approval key
  const stolen = createHumanApproval({ chavePrivadaDeAprovacao: other.aprovacao.chavePrivada, objeto: o1.id, autor: r.uid, aprovadoEm: NOW })
  approvalRefusal(stolen, o1, r, 'aprovacao_invalida', {}, 'aprovacao.assinatura')
  // the rover NETWORK key cannot approve: it belongs to the rover, not the person
  const ofRover = createHumanApproval({ chavePrivadaDeAprovacao: r.rede.chavePrivada, objeto: o1.id, autor: r.uid, aprovadoEm: NOW })
  approvalRefusal(ofRover, o1, r, 'aprovacao_invalida', {}, 'aprovacao.assinatura')
  // content altered after signing
  const a = approve(r, o1)
  approvalRefusal({ ...a, expiraEm: a.expiraEm + 1 }, o1, r, 'aprovacao_invalida', {}, 'aprovacao.assinatura')
})

test('approval window: expired, future, earlier than the object, too long', () => {
  const r = newRover(issuer)
  const o = objectOf(r, 'postagem', { texto: 'oi', topicos: [] }, { criadoEm: NOW })
  const a = approve(r, o, { aprovadoEm: NOW, validadeS: 300 })
  approvalRefusal(a, o, r, 'aprovacao_vencida', { agora: NOW + 301 }, 'aprovacao.expiraEm')
  assert.equal(verifyHumanApproval(a, { objeto: o, approvalKey: r.aprovacao.publicKey, agora: NOW + 300 }).ok, true)
  approvalRefusal(approve(r, o, { aprovadoEm: NOW + 500 }), o, r, 'aprovacao_invalida', {}, 'aprovacao.aprovadoEm')
  assert.equal(verifyHumanApproval(approve(r, o, { aprovadoEm: NOW + 120 }), { objeto: o, approvalKey: r.aprovacao.publicKey, agora: NOW }).ok, true)
  approvalRefusal(approve(r, o, { aprovadoEm: NOW - 1 }), o, r, 'aprovacao_invalida', {}, 'aprovacao.aprovadoEm')
  approvalRefusal(approve(r, o, { validadeS: 601 }), o, r, 'aprovacao_invalida', {}, 'aprovacao.expiraEm')
  const long = verifyHumanApproval(approve(r, o, { validadeS: 601 }), { objeto: o, approvalKey: r.aprovacao.publicKey, agora: NOW })
  assert.match(long.erro.message, /no máximo 10 minutos/)
  assert.equal(verifyHumanApproval(approve(r, o, { validadeS: 600 }), { objeto: o, approvalKey: r.aprovacao.publicKey, agora: NOW }).ok, true)
  approvalRefusal(approve(r, o, { validadeS: 0 }), o, r, 'aprovacao_invalida', {}, 'aprovacao.expiraEm')
})

test('outside live mode (replica) the receiver clock does not count, the window itself still applies', () => {
  const r = newRover(issuer)
  const o = objectOf(r, 'postagem', { texto: 'oi', topicos: [] })
  const a = approve(r, o)
  assert.equal(verifyHumanApproval(a, { objeto: o, approvalKey: r.aprovacao.publicKey, agora: NOW + 10 ** 6, aoVivo: false }).ok, true)
  approvalRefusal(approve(r, o, { validadeS: 9999 }), o, r, 'aprovacao_invalida', { aoVivo: false }, 'aprovacao.expiraEm')
})

test('closed schema of the approval', () => {
  const r = newRover(issuer)
  const o = objectOf(r, 'postagem', { texto: 'oi', topicos: [] })
  const a = approve(r, o)
  approvalRefusal({ ...a, extra: 1 }, o, r, 'esquema', {}, 'aprovacao.extra')
  approvalRefusal({ ...a, nonce: 'curto' }, o, r, 'esquema', {}, 'aprovacao.nonce')
  approvalRefusal(null, o, r, 'aprovacao_invalida')
  approvalRefusal([], o, r, 'aprovacao_invalida')
})

test('an approval created without explicit validity lasts 5 minutes', () => {
  const r = newRover(issuer)
  const o = objectOf(r, 'postagem', { texto: 'oi', topicos: [] })
  const a = createHumanApproval({ chavePrivadaDeAprovacao: r.aprovacao.chavePrivada, objeto: o.id, autor: r.uid, aprovadoEm: NOW })
  assert.equal(a.expiraEm - a.aprovadoEm, 300)
})

// ---------- 0.1 and 0.2 compatibility ----------

test('handle attestations 0.1 and 0.2 stay valid, signed under their own version prefix; 0.4 does not exist', () => {
  const r = newRover(issuer)
  const base = {
    issuerPrivateKey: issuer.chavePrivada, emissor: issuer.publicKey, uid: r.uid, handle: r.handle,
    chave: r.rede.publicKey, chaveAprovacao: r.aprovacao.publicKey, emitidoEm: NOW - 10, expiraEm: NOW + 1000
  }
  const old = createHandleAttestation({ ...base, v: '0.1' })
  assert.equal(old.v, '0.1')
  assert.equal(verifyHandleAttestation(old, ctx()).ok, true)
  assert.equal(createHandleAttestation(base).v, '0.3')
  const v02 = createHandleAttestation({ ...base, v: '0.2' })
  assert.equal(verifyHandleAttestation(v02, ctx()).ok, true)
  // changing the version label without re-signing breaks the signature (the domain prefix follows the version)
  attestationRefusal({ ...old, v: '0.2' }, 'atestado_invalido', {}, 'atestado.assinatura')
  attestationRefusal({ ...old, v: '0.3' }, 'atestado_invalido', {}, 'atestado.assinatura')
  attestationRefusal({ ...createHandleAttestation(base), v: '0.1' }, 'atestado_invalido', {}, 'atestado.assinatura')
  attestationRefusal({ ...v02, v: '0.3' }, 'atestado_invalido', {}, 'atestado.assinatura')
  attestationRefusal({ ...old, v: '0.4' }, 'esquema', {}, 'atestado.v')
})

test('human approval 0.1 stays valid, signed under the 0.1 prefix', () => {
  const r = newRover(issuer)
  const o = objectOf(r, 'postagem', { texto: 'oi', topicos: [] })
  const v = (approval) => verifyHumanApproval(approval, { objeto: o, approvalKey: r.aprovacao.publicKey, agora: NOW })
  const stale = createHumanApproval({ chavePrivadaDeAprovacao: r.aprovacao.chavePrivada, objeto: o.id, autor: r.uid, aprovadoEm: NOW, v: '0.1' })
  assert.equal(stale.v, '0.1')
  assert.equal(v(stale).ok, true)
  assert.equal(approve(r, o).v, '0.3')
  assert.equal(v({ ...stale, v: '0.2' }).erro.codigo, 'aprovacao_invalida')
  assert.equal(v({ ...stale, v: '0.3' }).erro.codigo, 'aprovacao_invalida')
  assert.equal(v({ ...approve(r, o), v: '0.1' }).erro.codigo, 'aprovacao_invalida')
  assert.equal(v({ ...stale, v: '0.4' }).erro.codigo, 'esquema')
})
