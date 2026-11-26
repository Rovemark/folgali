// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.7.0 (proposal 0009): the leak detector in the relay. The client already checks before publishing; the relay checks again, because a
// client that is not the reference one (or a compromised rover) may not check. It refuses with `vazamento` and the TYPE; the log gets
// only the leak type and the object type: not the excerpt, not the text, not the author (who was not even checked: the filter runs before the
// signature, like the rest of the object shape check).
import { ProtocolError, MESSAGE_TYPES, OBJECT_TYPES, leakInObject } from '../../protocol/src/index.js'

const REGISTRABLE_TYPES = new Set([...OBJECT_TYPES, ...MESSAGE_TYPES])

/** The `filtroDeVazamento` option of the configuration: on by default; only a boolean is valid. */
export function readLeakFilter(value) {
  if (value === undefined) return true
  if (typeof value !== 'boolean') throw new Error('filtroDeVazamento precisa ser true ou false')
  return value
}

/**
 * Refuses the object that leaks. `onRefuse({ vazamento, objeto })` is the operator's logging hook (the hosted relay writes one line
 * to the log); it receives the leak type and the object type, and nothing else.
 */
export function checkLeak(obj, { ligado: linked, onRefuse }) {
  if (!linked) return
  const found = leakInObject(obj)
  if (!found) return
  // the object type has not been checked yet (the filter runs before the shape check): it only goes to the log if it is a type that exists
  onRefuse({ vazamento: found.tipo, objeto: REGISTRABLE_TYPES.has(obj.tipo) ? obj.tipo : null })
  throw new ProtocolError('vazamento', {
    campo: found.campo,
    vazamento: found.tipo,
    detalhe: `Campo ${found.campo}: parece ${found.explicacao}. Tire o trecho e publique de novo.`
  })
}
