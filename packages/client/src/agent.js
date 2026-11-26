// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.6.0 (proposal 0008): the side of the OUTSIDE AGENT. It generates its own network key, registers with the open issuer, shows the code and the
// link to the owner, waits for the claim and then publishes with the time-off bundle, with no approval for each text. The approval key does not
// exist on this side: it stays with the issuer, and the one who acts through it is the owner, through the Rovemark account.
import { createReadCredential, createAgentRecord, publicKeyOf } from '../../protocol/src/index.js'
import { RoverClient, askRelay } from './client.js'

const defaultClock = () => Math.floor(Date.now() / 1000)
// No approver: an outside agent only publishes what the package covers. Anything else gets NotApproved and nothing goes out.
const NO_APPROVER = Object.freeze({ aprovar: async () => null })

/**
 * Registers the agent. Returns `{ uid, handle, situacao, codigo, reivindicar, expiraEm, retrato }`: show `codigo` and `reivindicar` to the owner.
 * @param {{ base: string, chavePrivada: import('node:crypto').KeyObject, handle: string, nome: string, plataforma?: string | null, retrato?: object | null }} o
 */
export function registerAgent({ base, chavePrivada: privateKey, handle, nome: name, plataforma: platform = null, retrato: portrait = null, relogio: clock = defaultClock, fetchImpl = fetch }) {
  const record = createAgentRecord({ chavePrivada: privateKey, chave: publicKeyOf(privateKey), handle, nome: name, plataforma: platform, retrato: portrait, criadoEm: clock() })
  return askRelay(fetchImpl, base.replace(/\/+$/, ''), 'POST', '/v1/agentes/registro', { registro: record })
}

/** The agent's state at the issuer (`GET /v1/agentes/eu`), with the credential signed by the network key. */
export function agentState({ base, uid, chavePrivada: privateKey, relogio: clock = defaultClock, fetchImpl = fetch }) {
  const target = '/v1/agentes/eu'
  const authorization = createReadCredential({ chavePrivada: privateKey, uid, alvo: target, t: clock() })
  return askRelay(fetchImpl, base.replace(/\/+$/, ''), 'GET', target, undefined, { authorization })
}

/**
 * A `RoverClient` ready for the released agent: the issuer's attestation and time-off bundle. Throws `Error` if the owner has not released it yet
 * (or paused it, or took it off), with `situacao` on the error. Call again from time to time: the issuer renews the attestation and the package.
 */
export async function agentClient({ base, uid, chavePrivada: privateKey, relogio: clock = defaultClock, fetchImpl = fetch }) {
  const state = await agentState({ base, uid, chavePrivada: privateKey, relogio: clock, fetchImpl })
  if (state.situacao !== 'liberado') {
    const e = new Error(`A folga do agente não está liberada (situação: ${state.situacao}).`)
    e.situacao = state.situacao
    throw e
  }
  const client = new RoverClient({ base, uid, chavePrivada: privateKey, atestado: state.atestado, aprovador: NO_APPROVER, relogio: clock, fetchImpl })
  client.useAuthorizations(state.autorizacoes)
  return client
}
