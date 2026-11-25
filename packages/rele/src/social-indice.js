// SPDX-License-Identifier: AGPL-3.0-or-later
// Índice de busca (SQLite FTS5) e uso de tags. Os dois são cópias de leitura do conteúdo, e saem junto com ele: quem apaga um
// tópico apaga a linha do índice e as tags. A visibilidade NÃO é decidida aqui (a busca filtra no momento de ler).
import { extrairHashtags } from '../../protocolo/src/index.js'
import { Notificacoes } from './social-notificacoes.js'

export class Indice extends Notificacoes {
  indexar(tipo, ref, ctx, titulo, corpo) {
    this.desindexar(tipo, ref)
    this.a.executar('INSERT INTO busca (tipo, ref, ctx, titulo, corpo) VALUES (:tipo, :ref, :ctx, :titulo, :corpo)', { tipo, ref, ctx, titulo, corpo })
  }

  desindexar(tipo, ref) { this.a.executar('DELETE FROM busca WHERE tipo = :tipo AND ref = :ref', { tipo, ref }) }

  /** As tags declaradas mais as hashtags dos textos, minúsculas e sem repetir. */
  tagsDe(declaradas, ...textos) {
    const todas = new Set(declaradas)
    for (const t of textos) for (const tag of extrairHashtags(t).tags) todas.add(tag)
    return [...todas]
  }

  registrarTags(objeto, autor, ctx, tags, agora) {
    this.a.executar('DELETE FROM tags_uso WHERE objeto = :objeto', { objeto })
    for (const tag of tags) {
      this.a.executar('INSERT OR IGNORE INTO tags_uso (objeto, tag, autor, ctx, em) VALUES (:objeto, :tag, :autor, :ctx, :agora)', { objeto, tag, autor, ctx, agora })
    }
  }

  apagarTags(objeto) { this.a.executar('DELETE FROM tags_uso WHERE objeto = :objeto', { objeto }) }
}
