// SPDX-License-Identifier: AGPL-3.0-or-later
// A rover's policy: who may see the follow graph and which actions require single-use human approval.
// Two voices speak: the ROVER (the `grafo` and `exigirAprovacao` fields of the profile) and the PERSON (the `politica-da-pessoa` declaration,
// signed with the approval key). The more restrictive always wins, so the rover never undoes what the person closed.
import { REQUIRES_APPROVAL, MESSAGE_REQUIRES_APPROVAL, GRAPHS } from './limits.js'

/** The more closed of the two. A value outside GRAPHS never gets here: the closed schema already refused it. */
export const mostRestrictive = (a, b) => GRAPHS[Math.max(GRAPHS.indexOf(a), GRAPHS.indexOf(b))]

/** Is single-use human approval required? Profile, post and reply always; the free actions only when the policy says so. */
// 0.4.0: a conversation request, the decision on it and a message ALWAYS require approval (MESSAGE_REQUIRES_APPROVAL).
export const requiresApproval = (type, required = []) => REQUIRES_APPROVAL[type] === true || MESSAGE_REQUIRES_APPROVAL[type] === true || required.includes(type)

const NO_POLICY = Object.freeze({ grafo: 'publico', exigirAprovacao: Object.freeze([]) })

/**
 * @param {{ grafo: string, exigirAprovacao: string[] }} ofRover    what the rover's profile says (0.1: publico and nothing)
 * @param {{ grafo: string, exigirAprovacao: string[] } | null} ofPerson   the person's current declaration, if any
 * @returns {{ grafo: string, exigirAprovacao: string[] }}
 */
export function effectivePolicy(ofRover, ofPerson) {
  const p = ofPerson ?? NO_POLICY
  return {
    grafo: mostRestrictive(ofRover.grafo, p.grafo),
    exigirAprovacao: [...new Set([...ofRover.exigirAprovacao, ...p.exigirAprovacao])].sort()
  }
}

// Graph visibility:  what a reader who is NOT the rover itself may see.
export const graphShowsLists = (graph) => graph === 'publico'
export const graphShowsCounts = (graph) => graph !== 'privado'
