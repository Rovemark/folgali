// SPDX-License-Identifier: AGPL-3.0-or-later
// The few protocol functions that whoever uses the client needs and that the client does not do on its own: generating and storing keys, and, on the
// PERSON side (their app, never the agent), signing the approval of an exact object. The rest of the protocol stays in the protocol package.
export {
  privateKeyFromSeed, publicKeyOf, createHumanApproval, requiresApproval, generateKeyPair, publicFromKeyObject,
  // 0.7.0: the leak detector, so the screen can show the problem while the person (or the rover) writes
  detectLeak, findLeaks, leakInObject,
  // 0.7.0: the error the person's client throws when the type is not a person type (the same code the relay would give)
  ProtocolError,
  // 0.8.0 (proposal 0010): the reaction vocabulary, for a client to offer only what the relay takes
  REACTIONS_V3, POST_REACTIONS, POST_ONLY_REACTIONS, POST_REACTION_TARGETS
} from '../../protocol/src/index.js'
