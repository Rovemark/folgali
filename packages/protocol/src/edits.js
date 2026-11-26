// SPDX-License-Identifier: AGPL-3.0-or-later
// Revision 0.11.0 (proposal 0013): editing what was published. One object type, `edicao`, signed by the author of the target, for the
// four things a person rewrites: a post, a reply, a forum topic and a forum reply.
//
//   corpo = { alvo, titulo, texto, tags, adulto? }
//
// The body is the WHOLE new content (never a patch): whoever reads the edit knows what the publication says now without replaying
// anything. The original object is never rewritten (its id is the hash of its content and its signature covers it): the relay keeps
// the original and every edit, shows the last one as the current content with the mark "editado", and serves the list of versions
// to whoever can read the publication. The history is PUBLIC by design: an edit does not make the earlier text disappear.
//
// What each target takes is the same as when it was published (the limits of that type), and nothing more:
//   postagem        titulo or null, texto, tags (the `topicos` of the post), adulto
//   resposta        texto                       (titulo null, tags empty)
//   topico          titulo, texto, tags
//   resposta-forum  texto                       (titulo null, tags empty)
// The schema below is closed and takes the widest of the four; `checkEdit` applies the limits of the real target, which only
// who knows the target (the relay, or the client that read it) can do.
import { failure, list, literal, closedObject, optional, or_null, defaultValue, text } from './schema.js'
import { LIMITS, SOCIAL_LIMITS as L } from './limits.js'

const ID_RE = /^ob_[A-Za-z0-9_-]{43}$/
const TAG_RE = /^[a-z0-9][a-z0-9-]{1,23}$/
const id = defaultValue(ID_RE, 'um id de objeto (ob_ e 43 caracteres)')
const tag = defaultValue(TAG_RE, 'uma tag (a-z, 0-9 e hífen, 2 a 24 caracteres)')
const oneLine = (limits) => text({ ...limits, multilinha: false, v3: true })
const multiline = (limits, links) => text({ ...limits, multilinha: true, urls: links, v3: true })
const tags = (max) => list(tag, { max, unique: true })
const ADULT = optional(literal(true))
const NULLABLE = (reason) => (v, path) => (v === null ? null : failure(path, reason))
const EMPTY = (reason) => (v, path) => (Array.isArray(v) && v.length === 0 ? null : failure(path, reason))

export const FEATURE_EDIT = 'edicao'
/** What can be edited. Each one keeps, edited, the limits it had when it was published. */
export const EDIT_TARGETS = Object.freeze(['postagem', 'resposta', 'topico', 'resposta-forum'])
export const EDIT_LIMITS = Object.freeze({
  // edits of the same publication inside one hour (the rate of the type, per author, is in RATE_PER_TYPE)
  porAlvoPorHora: 5,
  // versions the relay keeps for one publication (the original and the edits); the next edit is refused
  versoesPorAlvo: 50
})

const longestText = Math.max(LIMITS.postagem.max, LIMITS.resposta.max, L.topicoTexto.max, L.respostaForum.max)
const moreTags = Math.max(LIMITS.topicsPerPost, L.topicTags)

/** The closed schema of the body: the widest of the four targets. */
export const EDIT_BODY = closedObject({
  alvo: id,
  titulo: or_null(oneLine({ min: 1, max: Math.max(LIMITS.titulo.max, L.topicoTitulo.max) })),
  texto: multiline({ min: 1, max: longestText }, 2),
  tags: tags(moreTags),
  adulto: ADULT
})

const withoutTitle = NULLABLE('este tipo não tem título: use null')
const withoutTags = EMPTY('este tipo não tem tags: use uma lista vazia')
const withoutAdult = (v, path) => (v === undefined ? null : failure(path, 'a marca +18 só existe na postagem'))
const PER_TARGET = Object.freeze({
  postagem: { titulo: or_null(oneLine(LIMITS.titulo)), texto: multiline(LIMITS.postagem, LIMITS.urlsPerText), tags: tags(LIMITS.topicsPerPost), adulto: () => null },
  resposta: { titulo: withoutTitle, texto: multiline(LIMITS.resposta, LIMITS.urlsPerText), tags: withoutTags, adulto: withoutAdult },
  topico: { titulo: oneLine(L.topicoTitulo), texto: multiline(L.topicoTexto, 2), tags: tags(L.topicTags), adulto: withoutAdult },
  'resposta-forum': { titulo: withoutTitle, texto: multiline(L.respostaForum, 2), tags: withoutTags, adulto: withoutAdult }
})

/**
 * The limits of the real target over an `edicao` body that already passed the closed schema.
 * @param {string} targetType  one of EDIT_TARGETS
 * @param {{ titulo: string | null, texto: string, tags: string[], adulto?: true }} corpo
 * @returns {{ caminho: string, mensagem: string } | null}
 */
export function checkEdit(targetType, body) {
  const rules = PER_TARGET[targetType]
  if (!rules) return failure('objeto.corpo.alvo', `só se edita um destes: ${EDIT_TARGETS.join(', ')}`)
  for (const field of ['titulo', 'texto', 'tags', 'adulto']) {
    const f = rules[field](body[field], `objeto.corpo.${field}`)
    if (f) return f
  }
  return null
}

/**
 * What the publication says in one version, in the same four fields whatever the type: the original object or an `edicao`.
 * @param {{ tipo: string, corpo: Record<string, unknown> }} objeto
 * @returns {{ titulo: string | null, texto: string, tags: string[], adulto: boolean }}
 */
export function versionContent(object) {
  const c = object.corpo
  const tagsOf = object.tipo === 'postagem' ? c.topicos : c.tags
  return { titulo: c.titulo ?? null, texto: c.texto, tags: Array.isArray(tagsOf) ? [...tagsOf] : [], adulto: c.adulto === true }
}

/** The body of an `edicao` for a target, from the new content. */
export const editBody = (target, { titulo: title = null, texto: newText, tags: newTags = [], adulto: adult = false }) => ({
  alvo: target, titulo: title, texto: newText, tags: newTags, ...(adult ? { adulto: true } : {})
})
