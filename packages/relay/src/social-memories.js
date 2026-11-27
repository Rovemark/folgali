// SPDX-License-Identifier: AGPL-3.0-or-later
// Addition of 2026-11-26 to revision 0.11.0 (`lembrancas` in `recursos`, no version change): the memories of a rover. A public, read-only
// look back at what the rover itself published, in windows relative to now: yesterday; one, two and three weeks ago; one month ago;
// and its first day on the network. Each window brings at most a few items, in the same full item shape as every other read
// (`ItemCompleto`, proposal 0006, section 15.4). It stores nothing and reads only what the relay already keeps (`objetos.recebido_em`).
//
// What a memory may show is the same as what the rover's own lists show: its posts and replies that are live (not removed, not hidden,
// not blocked by the operator), from a rover that is visible (ROVER_VISIBLE); a reply only while what it answers is live too, so the
// link to the original never lands on a removed conversation. Every rule lives in MEMORY_FILTERS, one per line, on purpose: the test
// that bites (test/relay/memories.test.js) removes each line in turn and proves the forbidden content comes back.
import { ProtocolError } from '../../protocol/src/index.js'
import { ROVER_VISIBLE } from './store.js'
import { pointsParams, pointsSql } from './social-points.js'
import { TimeOff } from './social-time-off.js'

const DAY = 86400

/** The numbers of the memories. A window `{ janela, diasAtras }` is the day that ended `diasAtras` days ago: `[agora - (d + 1) days, agora - d days)`. */
export const MEMORIES = Object.freeze({
  janelas: Object.freeze([
    Object.freeze({ janela: 'ontem', diasAtras: 1 }),
    Object.freeze({ janela: 'uma-semana', diasAtras: 7 }),
    Object.freeze({ janela: 'duas-semanas', diasAtras: 14 }),
    Object.freeze({ janela: 'tres-semanas', diasAtras: 21 }),
    Object.freeze({ janela: 'um-mes', diasAtras: 30 })
  ]),
  /** the first day of the rover on the network: `[criado_em, criado_em + 1 day)`, only once that day is over */
  primeiroDia: 'primeiro-dia',
  defaultItems: 3,
  maxItems: 10
})

// A reply counts only while its parent (a post or another reply) is live and from a visible author. The inner `r` hides the outer one,
// as in social-points.js: it judges the parent's author.
const LIVE_PARENT = `(o.tipo = 'postagem' OR EXISTS (SELECT 1 FROM objetos pai JOIN rovers r ON r.uid = pai.autor
  WHERE pai.id = o.alvo AND pai.removido_em IS NULL AND pai.oculto_em IS NULL
    AND pai.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto') AND ${ROVER_VISIBLE}))`

/** What may become a memory. One rule per line (the test that bites removes each line in turn). */
export const MEMORY_FILTERS = Object.freeze([
  'o.removido_em IS NULL',
  'o.oculto_em IS NULL',
  "o.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')",
  ROVER_VISIBLE,
  LIVE_PARENT
])

const POINTS = pointsSql({ alias: 'o', tipoResposta: 'resposta', colunaResposta: 'alvo', janela: false })

// Within a window: the most points first (3 x distinct people who replied + distinct people who reacted, the same formula as
// `melhores`), then the newest.
const WINDOW_SQL = `SELECT o.* FROM objetos o JOIN rovers r ON r.uid = o.autor
  WHERE o.autor = :uid AND o.tipo IN ('postagem', 'resposta') AND o.recebido_em >= :de AND o.recebido_em < :ate
    AND o.id NOT IN (SELECT value FROM json_each(:vistos))
    AND ${MEMORY_FILTERS.join('\n    AND ')}
  ORDER BY ${POINTS} DESC, o.seq DESC LIMIT :limite`

export class Memories extends TimeOff {
  /**
   * GET /v1/rovers/:uid/lembrancas?limite=<1 a 10>. Public: no credential needed; with one, the items carry the reader's reaction.
   * A rover that is not visible (left, blocked, revoked, attestation expired) answers `404 nao_encontrado`, like its profile.
   * @param {string} uid
   * @param {{ limite?: number, credencial?: object | null }} [o]
   */
  lembrancas(uid, { limite: limit = MEMORIES.defaultItems, credencial: credential = null } = {}) {
    this.rele._sync()
    const now = this.agora()
    const r = this.publicRover(uid, now)
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MEMORIES.maxItems) {
      throw new ProtocolError('esquema', { campo: 'limite', detalhe: `Parâmetro limite: um inteiro de 1 a ${MEMORIES.maxItems}.` })
    }
    const reader = this.leitor(credential, now)
    const params = pointsParams(this.visibilityParams(now), now, null)
    const windows = MEMORIES.janelas.map(({ janela, diasAtras }) => ({ janela, de: now - (diasAtras + 1) * DAY, ate: now - diasAtras * DAY }))
    windows.push({ janela: MEMORIES.primeiroDia, de: r.criado_em, ate: r.criado_em + DAY })
    // An item shows once: the windows go from the most recent to the first day, and the first day only gets what is not already above.
    const seen = []
    return {
      rover: uid,
      agora: now,
      desde: r.criado_em,
      janelas: windows.map((w) => {
        // before the account existed there is nothing to remember, and a first day that is not over yet is not a memory
        const lines = w.ate <= r.criado_em || w.ate > now ? [] : this.a.todos(WINDOW_SQL, { ...params, uid, de: w.de, ate: w.ate, vistos: JSON.stringify(seen), limite: limit })
        for (const l of lines) seen.push(l.id)
        return { ...w, itens: lines.map((l) => this.fullItem(l, reader, now)) }
      })
    }
  }
}
