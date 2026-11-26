// SPDX-License-Identifier: AGPL-3.0-or-later
// Test helpers: keys generated on the spot (no fixed key in the repository), test issuer and test rovers.
import {
  createHumanApproval, createHandleAttestation, createStandingAuthorization, createObject, createPersonPolicy,
  createAuthorizationRevocation, generateKeyPair, toB64u
} from '../../packages/protocol/src/index.js'
import { randomBytes } from 'node:crypto'

export const NOW = 1_900_000_000

export function newIssuer() {
  const pair = generateKeyPair()
  return { publicKey: pair.publicKey, chavePrivada: pair.chavePrivada }
}

export const newUid = () => `rvr_${toB64u(randomBytes(16))}`

let counter = 0
export const newHandle = () => `rover.t${(counter++).toString(36)}${randomBytes(2).toString('hex')}`

/** A complete test rover: uid, network key, approval key and attestation issued by `emissor`. */
export function newRover(issuer, { agora: now = NOW, handle = newHandle(), validadeS: validityS = 30 * 86400, uid = newUid() } = {}) {
  const network = generateKeyPair()
  const approval = generateKeyPair()
  const attestation = createHandleAttestation({
    issuerPrivateKey: issuer.chavePrivada,
    emissor: issuer.publicKey,
    uid,
    handle,
    chave: network.publicKey,
    chaveAprovacao: approval.publicKey,
    emitidoEm: now - 10,
    expiraEm: now - 10 + validityS
  })
  return { uid, handle, rede: network, aprovacao: approval, atestado: attestation, emissor: issuer }
}

// The 0.2 profile carries a graph and a requirement. Tests that only want "a profile" write a name and description, and the helper fills in
// the protocol defaults (public graph, nothing required). Whoever tests the policy passes the fields and they win.
export const DEFAULT_PROFILE = Object.freeze({ grafo: 'publico', exigirAprovacao: [] })

export function objectOf(rover, type, body, { criadoEm: createdAt = NOW, previo: previous = null, v } = {}) {
  const complete = type === 'perfil' && v === undefined ? { ...DEFAULT_PROFILE, ...body } : body
  return createObject({ tipo: type, autor: rover.uid, criadoEm: createdAt, previo: previous, corpo: complete, chavePrivada: rover.rede.chavePrivada, ...(v === undefined ? {} : { v }) })
}

export function approve(rover, object, { aprovadoEm: approvedAt = NOW, validadeS: validityS = 300, nonce } = {}) {
  return createHumanApproval({
    chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, objeto: object.id, autor: rover.uid, aprovadoEm: approvedAt, validadeS: validityS, nonce
  })
}

// ---------- person declarations (always with the APPROVAL key, never the network one) ----------

// These helpers create 0.2 declarations by default (the 0.2 battery still counts as compatibility proof); pass `v: '0.3'`
// for 0.3, which adds requirable and authorizable types.
export const policyOf = (rover, { grafo: graph = 'publico', exigirAprovacao: requireApproval = [], emitidaEm: issuedAt = NOW, v = '0.2' } = {}) =>
  createPersonPolicy({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, autor: rover.uid, emitidaEm: issuedAt, grafo: graph, exigirAprovacao: requireApproval, v })

export const authorizationOf = (rover, { emitidaEm: issuedAt = NOW, validadeS: validityS = 86400, tipos: types = ['postagem', 'resposta'], maxPorHora: maxPerHour = 5, maxPorDia: maxPerDay = 20, v = '0.2' } = {}) =>
  createStandingAuthorization({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, autor: rover.uid, emitidaEm: issuedAt, validadeS: validityS, tipos: types, maxPorHora: maxPerHour, maxPorDia: maxPerDay, v })

export const revocationOf = (rover, target, { revogadaEm: revokedAt = NOW, v = '0.2' } = {}) =>
  createAuthorizationRevocation({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, autor: rover.uid, alvo: target, revogadaEm: revokedAt, v })
