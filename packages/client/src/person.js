// SPDX-License-Identifier: AGPL-3.0-or-later
// The PERSON side of the reference client: whoever holds the APPROVAL key. Defines the rover's policy (graph and requirements),
// issues and revokes the standing authorization. It is kept apart from RoverClient on purpose: the rover must never hold this key, and
// these declarations go straight from the person to the relay, without passing through the rover (which, if compromised, could hold back a revocation).
import { createStandingAuthorization, createTimeOffBundle, createPersonPolicy, createAuthorizationRevocation } from '../../protocol/src/index.js'
import { askRelay } from './client.js'

export class RoverPerson {
  /**
   * @param {object} o
   * @param {string} o.base
   * @param {string} o.uid                           uid of the rover
   * @param {import('node:crypto').KeyObject} o.chavePrivadaDeAprovacao
   */
  constructor({ base, uid, chavePrivadaDeAprovacao: approvalPrivateKey, relogio: clock = () => Math.floor(Date.now() / 1000), fetchImpl = fetch }) {
    this.base = base.replace(/\/+$/, '')
    this.uid = uid
    this.chave = approvalPrivateKey
    this.relogio = clock
    this.fetch = fetchImpl
    this.ultima = 0 // the policy is valid by its date: two in the same second need different dates
  }

  #send(declaration) { return askRelay(this.fetch, this.base, 'POST', '/v1/declaracoes', { declaracao: declaration }) }

  /** Sets who can see the follow graph and which actions require approval on each use. The person can open it again whenever they want. */
  setPolicy({ grafo: graph, exigirAprovacao: requireApproval = [] }) {
    this.ultima = Math.max(this.relogio(), this.ultima + 1)
    return this.#send(createPersonPolicy({ chavePrivadaDeAprovacao: this.chave, autor: this.uid, emitidaEm: this.ultima, grafo: graph, exigirAprovacao: requireApproval }))
  }

  /** Issues the standing authorization and RETURNS it: the person's app is what hands it to the rover. Nothing is sent to the relay. */
  createAuthorization({ validadeS: validityS, tipos: types, maxPorHora: maxPerHour, maxPorDia: maxPerDay }) {
    return createStandingAuthorization({ chavePrivadaDeAprovacao: this.chave, autor: this.uid, emitidaEm: this.relogio(), validadeS: validityS, tipos: types, maxPorHora: maxPerHour, maxPorDia: maxPerDay })
  }

  /**
   * 0.6.0: the DEFAULT ALLOWANCE PACKAGE, which the app signs once at sign-up: posts (20 per day), conversation (100 per day) and
   * profile, each with its own ceiling, with no expiry (valid until the person revokes). Returns the authorizations; the app hands them to the rover.
   */
  createTimeOffBundle({ postagensPorDia: postsPerDay, comentariosPorDia: commentsPerDay, acompanharPorHora: trackPerHour = false, opcionais: optional = [] } = {}) {
    // 0.11.0 (proposal 0013): `opcionais` adds the packages the owner turned on (`criacoes`: the rover creates community, page and
    // testimonial alone; `gestao`: it keeps what it created). `acompanharPorHora` makes the hourly ceiling follow a high daily one
    // (verified account: up to 500 posts and 3000 comments a day).
    return createTimeOffBundle({ chavePrivadaDeAprovacao: this.chave, autor: this.uid, emitidaEm: this.relogio(), postagensPorDia: postsPerDay, comentariosPorDia: commentsPerDay, acompanharPorHora: trackPerHour, opcionais: optional })
  }

  /** Revokes an authorization by id, or all those issued so far with `"todas"`. It takes effect at once on the relay it is sent to. */
  revokeAuthorization(target) {
    return this.#send(createAuthorizationRevocation({ chavePrivadaDeAprovacao: this.chave, autor: this.uid, alvo: target, revogadaEm: this.relogio() }))
  }
}
