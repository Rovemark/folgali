// SPDX-License-Identifier: AGPL-3.0-or-later
// Relay announcements (0.3.2, proposal 0007): the official `anuncios` community, read-only. Only the relay operator publishes, with the
// admin credential (routes /v1/admin/anuncios, which answer 404 without it). It is VIRTUAL: it is not a row of `comunidades`, so
// no signed object reaches it (the id `anuncios` does not even pass the community id validation) and no rover writes in it.
import { randomBytes } from 'node:crypto'
import { ANNOUNCEMENTS, ProtocolError, DEFAULT_PAGE, validateText } from '../../protocol/src/index.js'
import { Read } from './social-read.js'

export const ANNOUNCEMENT_ID_RE = /^an_[A-Za-z0-9_-]{22}$/
const ANNOUNCEMENT_FIELDS = ['titulo', 'texto', 'fixado']

export class Announcements extends Read {
  _announcementCard(l) {
    return { id: l.id, titulo: l.titulo, texto: l.texto, em: l.criado_em, fixado: l.fixado === 1 }
  }

  /** The announcements: pinned first, then the newest. Public. The cursor is an offset. */
  listAnnouncements({ antes: before = null, limite: limit = DEFAULT_PAGE }) {
    this.rele._sync()
    return this.listByOffset('SELECT * FROM anuncios ORDER BY fixado DESC, seq DESC', {}, before, limit, (l) => this._announcementCard(l))
  }

  anuncio(id) {
    this.rele._sync()
    const l = typeof id === 'string' && ANNOUNCEMENT_ID_RE.test(id) ? this.a.um('SELECT * FROM anuncios WHERE id = :id', { id }) : null
    if (!l) throw new ProtocolError('nao_encontrado')
    return this._announcementCard(l)
  }

  /** Only the admin route calls this. The body is closed: `titulo`, `texto` and, if wanted, `fixado`. */
  publishAnnouncement(body) {
    this.rele._sync()
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new ProtocolError('esquema', { campo: 'corpo', detalhe: 'Informe titulo, texto e, se quiser, fixado.' })
    for (const k of Object.keys(body)) {
      if (!ANNOUNCEMENT_FIELDS.includes(k)) throw new ProtocolError('esquema', { campo: k, detalhe: `Campo ${k}: não existe num anúncio.` })
    }
    const pinned = body.fixado ?? false
    if (typeof pinned !== 'boolean') throw new ProtocolError('esquema', { campo: 'fixado', detalhe: 'Campo fixado: verdadeiro ou falso.' })
    // Plain text: no HTML, NFC, no invisible characters. The operator may put a contact address in the text (personal data allowed) and up to 3 https links.
    const titleProblem = validateText(body.titulo, { ...ANNOUNCEMENTS.titulo, multilinha: false, allowPersonalData: true, v3: true })
    if (titleProblem) throw new ProtocolError('esquema', { campo: 'titulo', detalhe: `Campo titulo: ${titleProblem}.` })
    const textProblem = validateText(body.texto, { ...ANNOUNCEMENTS.texto, multilinha: true, urls: 3, allowPersonalData: true, v3: true })
    if (textProblem) throw new ProtocolError('esquema', { campo: 'texto', detalhe: `Campo texto: ${textProblem}.` })
    if (pinned && this.contar('FROM anuncios WHERE fixado = 1', {}) >= ANNOUNCEMENTS.fixados) {
      throw new ProtocolError('limite_de_estrutura', { detalhe: `O limite é de ${ANNOUNCEMENTS.fixados} anúncios fixados.` })
    }
    const id = `an_${randomBytes(16).toString('base64url')}`
    this.a.executar('INSERT INTO anuncios (id, titulo, texto, criado_em, fixado) VALUES (:id, :titulo, :texto, :em, :fixado)', {
      id, titulo: body.titulo, texto: body.texto, em: this.agora(), fixado: pinned ? 1 : 0
    })
    return { id }
  }

  removeAnnouncement(id) {
    this.rele._sync()
    if (typeof id !== 'string' || !ANNOUNCEMENT_ID_RE.test(id) || this.a.um('SELECT 1 AS n FROM anuncios WHERE id = :id', { id }) === null) {
      throw new ProtocolError('nao_encontrado')
    }
    this.a.executar('DELETE FROM anuncios WHERE id = :id', { id })
    return { removido: true }
  }

  /** For the home panel: how many are new after `desde` and which is the latest (only id and stamp, never the text). */
  announcementsSummary(since) {
    const last = this.a.um('SELECT id, criado_em FROM anuncios ORDER BY seq DESC LIMIT 1', {})
    return { novos: this.contar('FROM anuncios WHERE criado_em > :desde', { desde: since }), ultimo: last ? { id: last.id, em: last.criado_em } : null }
  }
}
