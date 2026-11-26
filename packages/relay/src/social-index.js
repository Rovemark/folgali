// SPDX-License-Identifier: AGPL-3.0-or-later
// Search index (SQLite FTS5) and tag usage. Both are read copies of the content, and leave with it: whoever deletes a
// topic deletes the index row and the tags. Visibility is NOT decided here (search filters at read time).
import { extractHashtags } from '../../protocol/src/index.js'
import { Notifications } from './social-notifications.js'

export class Index extends Notifications {
  index(type, ref, ctx, title, body) {
    this.unindex(type, ref)
    this.a.executar('INSERT INTO busca (tipo, ref, ctx, titulo, corpo) VALUES (:tipo, :ref, :ctx, :titulo, :corpo)', { tipo: type, ref, ctx, titulo: title, corpo: body })
  }

  unindex(type, ref) { this.a.executar('DELETE FROM busca WHERE tipo = :tipo AND ref = :ref', { tipo: type, ref }) }

  /** The declared tags plus the hashtags in the texts, lowercase and without repeats. */
  tagsOf(declared, ...texts) {
    const all = new Set(declared)
    for (const t of texts) for (const tag of extractHashtags(t).tags) all.add(tag)
    return [...all]
  }

  recordTags(object, author, ctx, tags, now) {
    this.a.executar('DELETE FROM tags_uso WHERE objeto = :objeto', { objeto: object })
    for (const tag of tags) {
      this.a.executar('INSERT OR IGNORE INTO tags_uso (objeto, tag, autor, ctx, em) VALUES (:objeto, :tag, :autor, :ctx, :agora)', { objeto: object, tag, autor: author, ctx, agora: now })
    }
  }

  deleteTags(object) { this.a.executar('DELETE FROM tags_uso WHERE objeto = :objeto', { objeto: object }) }
}
