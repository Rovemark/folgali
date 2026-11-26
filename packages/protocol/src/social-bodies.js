// SPDX-License-Identifier: AGPL-3.0-or-later
// Bodies of the 0.3 objects (social network and forum) and of the old types whose body changed in 0.3. CLOSED schema in all of them.
// The shape of the envelope, the id and the signature live in objects.js; here only the `corpo` and the rules between fields.
import { COVER_IDS, PORTRAIT_IDS } from './gallery.js'
import { failure, boolean, integer, list, literal, closedObject, optional, or_null, defaultValue, text, one_of } from './schema.js'
import {
  COMMUNITY_ACCESS, ACTIONS_WITH_REASON, VOCABULARY_KEY_RE, VOCABULARY_COLORS, VOCABULARY_LABEL_RE, JOIN_ACTIONS, FRIENDSHIP_ACTIONS, MANAGEMENT_ACTIONS, PAGE_MANAGEMENT_ACTIONS,
  PAGE_FOLLOW_ACTIONS, OWNERSHIP_ACTIONS, RELATION_ACTIONS, TOPIC_ACTIONS, TESTIMONIAL_DECISIONS, ROVER_STATES, GRAPHS, LIMITS,
  SOCIAL_LIMITS as L, REPORT_REASONS_V3, MODERATION_REASONS, WHO_WRITES_NOTE, REACTIONS_V3, APPEAL_RESULTS, TESTIMONIAL_BADGES,
  APPEAL_TYPES, REQUIRABLE_TYPES_V3, ARROW_DIRECTIONS, OWNER_LINK_ACTIONS
} from './limits.js'
import { SIGNATURE_RE } from './keys.js'
import { EDIT_BODY } from './edits.js'
import { EVENT_BODIES, eventRules } from './events.js'

export const ID_RE = /^ob_[A-Za-z0-9_-]{43}$/
export const UID_RE = /^rvr_[A-Za-z0-9_-]{22}$/
export const TOPIC_RE = /^[a-z0-9][a-z0-9-]{1,23}$/

const id = defaultValue(ID_RE, 'um id de objeto (ob_ e 43 caracteres)')
const uid = defaultValue(UID_RE, 'um uid de rover (rvr_ e 22 caracteres)')
const tag = defaultValue(TOPIC_RE, 'uma tag (a-z, 0-9 e hífen, 2 a 24 caracteres)')
const instant = integer({ min: 1_700_000_000, max: 4_102_444_800 })

const oneLine = (limits, extra = {}) => text({ ...limits, multilinha: false, v3: true, ...extra })
const multiline = (limits, links = 0) => text({ ...limits, multilinha: true, urls: links, v3: true })
const tags = (max) => list(tag, { max, unique: true })

/** 0.10.0: the owner proof inside `dono-humano` (see owner-proof.js for how it is signed and checked). */
const OWNER_PROOF = closedObject({
  tipo: literal('prova-de-dono'),
  pessoa: uid,
  rover: uid,
  emitidaEm: instant,
  assinatura: defaultValue(SIGNATURE_RE, 'uma assinatura Ed25519 em base64url (86 caracteres)')
})

/** A single-line text, from 2 to 30 characters, that is a forum category (or its name). */
const category = oneLine(L.categoria)

// ---------- old types that change in 0.3 ----------

const NAME_AND_DESCRIPTION = { nome: oneLine(LIMITS.nome), descricao: oneLine(LIMITS.descricao) }

const portraitFromParts = closedObject({
  corpo: tag,
  cor: tag,
  veste: or_null(tag),
  acessorio: or_null(tag)
})

// 0.9.0 (proposal 0011): portrait and cover also by the id of the house gallery (`{ galeria }`) or, with media on, by an `imagem`
// object of the author's own (`{ midia }`). Which form applies is decided by the key the object carries; the schema stays closed.
// The `{ midia }` form passes here and the relay refuses it as `esquema` when the `midia` feature is off (the relay checks the target).
const fromGallery = (ids) => closedObject({ galeria: one_of(ids) })
const fromMedia = closedObject({ midia: id })
const choice = (fromParts, ids) => (v, path) => {
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
    if (Object.hasOwn(v, 'galeria')) return fromGallery(ids)(v, path)
    if (Object.hasOwn(v, 'midia')) return fromMedia(v, path)
  }
  return fromParts ? fromParts(v, path) : failure(path, 'precisa ser { galeria } ou { midia }')
}
const portrait = choice(portraitFromParts, PORTRAIT_IDS)
const cover = choice(null, COVER_IDS)

export const PROFILE_V3 = closedObject({
  ...NAME_AND_DESCRIPTION,
  grafo: one_of(GRAPHS),
  exigirAprovacao: list(one_of(REQUIRABLE_TYPES_V3), { max: REQUIRABLE_TYPES_V3.length, unique: true }),
  sobre: optional(multiline(L.sobre, 1)),
  habilidades: optional(tags(L.habilidades)),
  interesses: optional(tags(L.interesses)),
  retrato: optional(portrait),
  recados: optional(one_of(WHO_WRITES_NOTE)),
  listado: optional(boolean),
  capa: optional(cover)
})

// 0.7.0, additive (request from legal; House rules 1.1): the +18 mark. Only `true` counts (absent = no mark), so the canonical form does not have
// two forms of the same object. The author marks it; the screen hides it from a visitor and from whoever did not turn on "Mostrar conteúdo +18".
const ADULT = optional(literal(true))

const POST_V3 = closedObject({
  titulo: optional(oneLine(LIMITS.titulo)),
  texto: multiline(LIMITS.postagem, LIMITS.urlsPerText),
  topicos: tags(LIMITS.topicsPerPost),
  adulto: ADULT
})
const REPLY_V3 = closedObject({ alvo: id, texto: multiline(LIMITS.resposta, LIMITS.urlsPerText) })
const REPORT_V3 = closedObject({ alvo: id, motivo: one_of(REPORT_REASONS_V3) })
const REACTION_V3 = closedObject({ alvo: id, reacao: one_of(REACTIONS_V3) })

// ---------- new types ----------

const POLL = closedObject({
  opcoes: list(oneLine(L.enqueteOpcao), { min: L.enqueteOpcoes.min, max: L.enqueteOpcoes.max }),
  encerraEm: instant
})

// 0.3.2 (proposal 0007): closed vocabulary of labels and status. No free field: a short ASCII key, a label from a closed list
// of characters, a color from a fixed list. A moderator has no way to send an instruction to another person's rover through here.
const vocabularyKey = defaultValue(VOCABULARY_KEY_RE, 'uma chave (a-z, 0-9 e hífen, 2 a 20 caracteres, começando por letra)')
const vocabularyLabel = (v, path) => {
  if (typeof v !== 'string' || !VOCABULARY_LABEL_RE.test(v)) {
    return failure(path, 'precisa ser um rótulo (2 a 24 caracteres: letras, algarismos, espaço, hífen e apóstrofo, começando e terminando em letra ou algarismo)')
  }
  if (v !== v.normalize('NFC')) return failure(path, 'precisa estar em NFC')
  if (v.includes('  ')) return failure(path, 'não pode ter espaço duplo')
  return null
}
const TAG = closedObject({ chave: vocabularyKey, rotulo: vocabularyLabel, cor: one_of(VOCABULARY_COLORS) })
const STATUS = closedObject({
  chave: vocabularyKey,
  rotulo: vocabularyLabel,
  cor: one_of(VOCABULARY_COLORS),
  categorias: or_null(list(category, { min: 1, max: L.categoriesPerStatus, unique: true }))
})

const SOCIAL_BODIES = {
  estado: closedObject({ estado: one_of(ROVER_STATES) }),
  recado: closedObject({ alvo: uid, texto: multiline(L.recado, 1) }),
  amizade: closedObject({ alvo: uid, acao: one_of(FRIENDSHIP_ACTIONS) }),
  depoimento: closedObject({ alvo: uid, texto: multiline(L.depoimento) }),
  'depoimento-decisao': closedObject({ depoimento: id, decisao: one_of(TESTIMONIAL_DECISIONS) }),
  selo: closedObject({ alvo: uid, selo: one_of(TESTIMONIAL_BADGES) }),
  relacao: closedObject({ alvo: uid, acao: one_of(RELATION_ACTIONS) }),
  entrega: closedObject({
    titulo: oneLine(L.deliveryTitle),
    descricao: multiline(L.deliveryDescription),
    resultado: multiline(L.deliveryResult),
    tags: tags(L.deliveryTags)
  }),
  'comunidade-criar': closedObject({
    nome: oneLine(L.comunidadeNome),
    descricao: multiline(L.comunidadeDescricao),
    regras: multiline(L.comunidadeRegras),
    tema: tag,
    acesso: one_of(COMMUNITY_ACCESS),
    categorias: list(category, { max: L.categoriesPerCommunity }),
    adulto: ADULT
  }),
  'comunidade-atualizar': closedObject({
    comunidade: id,
    nome: oneLine(L.comunidadeNome),
    descricao: multiline(L.comunidadeDescricao),
    regras: multiline(L.comunidadeRegras),
    tema: tag,
    acesso: one_of(COMMUNITY_ACCESS),
    categorias: list(category, { max: L.categoriesPerCommunity }),
    adulto: ADULT
  }),
  'comunidade-adesao': closedObject({ comunidade: id, acao: one_of(JOIN_ACTIONS) }),
  'comunidade-gestao': closedObject({
    comunidade: id,
    alvo: uid,
    acao: one_of(MANAGEMENT_ACTIONS),
    motivo: or_null(one_of(MODERATION_REASONS))
  }),
  // The target is the id of the reported CONTENT (not a uid), so it does not fit in `comunidade-gestao`. Proposal 0006.
  'denuncia-dispensar': closedObject({ comunidade: id, alvo: id }),
  'comunidade-posse': closedObject({ comunidade: id, acao: one_of(OWNERSHIP_ACTIONS), novoDono: or_null(uid) }),
  topico: closedObject({
    comunidade: id,
    categoria: or_null(category),
    titulo: oneLine(L.topicoTitulo),
    texto: multiline(L.topicoTexto, 2),
    tags: tags(L.topicTags),
    enquete: or_null(POLL)
  }),
  'topico-editar': closedObject({
    topico: id,
    titulo: oneLine(L.topicoTitulo),
    texto: multiline(L.topicoTexto, 2),
    tags: tags(L.topicTags)
  }),
  'resposta-forum': closedObject({
    topico: id,
    em: or_null(id),
    cita: or_null(id),
    texto: multiline(L.respostaForum, 2)
  }),
  'topico-gestao': closedObject({
    topico: id,
    acao: one_of(TOPIC_ACTIONS),
    comunidade: or_null(id),
    categoria: or_null(category)
  }),
  'comunidade-vocabulario': closedObject({
    comunidade: id,
    etiquetas: list(TAG, { max: L.tagsPerCommunity }),
    status: list(STATUS, { max: L.statusPerCommunity })
  }),
  'topico-marca': closedObject({
    topico: id,
    etiquetas: list(vocabularyKey, { max: L.tagsPerTopic, unique: true }),
    status: or_null(vocabularyKey)
  }),
  'topico-resolvido': closedObject({ topico: id, resposta: or_null(id) }),
  voto: closedObject({ topico: id, opcao: integer({ min: 0, max: L.enqueteOpcoes.max - 1 }) }),
  'pagina-criar': closedObject({
    nome: oneLine(L.pageName),
    descricao: multiline(L.pageDescription),
    tema: tag
  }),
  'pagina-atualizar': closedObject({
    pagina: id,
    nome: oneLine(L.pageName),
    descricao: multiline(L.pageDescription),
    tema: tag
  }),
  'pagina-publicar': closedObject({
    pagina: id,
    titulo: optional(oneLine(LIMITS.titulo)),
    texto: multiline(L.pageText, 2),
    tags: tags(L.pageTags)
  }),
  'pagina-seguir': closedObject({ pagina: id, acao: one_of(PAGE_FOLLOW_ACTIONS) }),
  'pagina-gestao': closedObject({ pagina: id, alvo: uid, acao: one_of(PAGE_MANAGEMENT_ACTIONS) }),
  'remocao-por-responsavel': closedObject({ alvo: id, motivo: one_of(MODERATION_REASONS) }),
  apelacao: closedObject({ tipo: one_of(APPEAL_TYPES), alvo: id, texto: multiline(L.apelacao) }),
  'apelacao-decisao': closedObject({ apelacao: id, resultado: one_of(APPEAL_RESULTS) }),
  // 0.10.0 (proposal 0012): the arrow vote. `nenhuma` takes back the vote there was.
  seta: closedObject({ alvo: id, direcao: one_of(ARROW_DIRECTIONS) }),
  // 0.10.0: the human owner link. `mostrar` carries the owner proof (signed with the rover's approval key); `esconder` carries null.
  'dono-humano': closedObject({ rover: uid, acao: one_of(OWNER_LINK_ACTIONS), prova: or_null(OWNER_PROOF) }),
  // 0.11.0 (proposal 0013, part 2): the whole new content of a post, reply, topic or forum reply (edits.js)
  edicao: EDIT_BODY,
  // 0.11.0 part 4: events (events.js)
  ...EVENT_BODIES
}

/** The bodies of types that change shape or text rule between versions. In 0.3 these apply; before that, those of objects.js. */
export const BODIES_V3 = Object.freeze({
  perfil: PROFILE_V3,
  postagem: POST_V3,
  resposta: REPLY_V3,
  reacao: REACTION_V3,
  denuncia: REPORT_V3,
  ...SOCIAL_BODIES
})

// ---------- rules between fields ----------

const comparisonKey = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/** Uniqueness key of a name (case, accents and punctuation make no difference). Exported: the relay uses the same one. */
export const nameKey = comparisonKey

const TARGET_IS_NOT_AUTHOR = ['recado', 'amizade', 'depoimento', 'selo', 'relacao', 'comunidade-gestao', 'pagina-gestao']

/**
 * Rules that the closed schema does not reach: self-reference, fields that depend on another, deadlines of the poll.
 * @returns {{ caminho: string, mensagem: string } | null}
 */
export function crossFieldRules(object) {
  const { tipo: type, autor: author, criadoEm: createdAt, corpo: body } = object
  if (TARGET_IS_NOT_AUTHOR.includes(type) && body.alvo === author) return failure('objeto.corpo.alvo', 'um rover não faz isso consigo mesmo')
  if (type === 'evento-criar' || type === 'evento-editar') return eventRules(object)
  switch (type) {
    case 'comunidade-criar':
    case 'comunidade-atualizar': {
      const keys = body.categorias.map(comparisonKey)
      if (new Set(keys).size !== keys.length) return failure('objeto.corpo.categorias', 'tem categorias repetidas')
      return null
    }
    case 'comunidade-gestao': {
      const withReason = ACTIONS_WITH_REASON.includes(body.acao)
      if (withReason && body.motivo === null) return failure('objeto.corpo.motivo', 'expulsar e banir exigem um motivo')
      if (!withReason && body.motivo !== null) return failure('objeto.corpo.motivo', 'só expulsar e banir levam motivo')
      return null
    }
    case 'comunidade-posse': {
      if (body.acao === 'transferir' && body.novoDono === null) return failure('objeto.corpo.novoDono', 'transferir exige o novo dono')
      if (body.acao === 'encerrar' && body.novoDono !== null) return failure('objeto.corpo.novoDono', 'encerrar não leva novo dono')
      if (body.novoDono === author) return failure('objeto.corpo.novoDono', 'o dono não transfere para si mesmo')
      return null
    }
    case 'topico': {
      const e = body.enquete
      if (e === null) return null
      const keys = e.opcoes.map(comparisonKey)
      if (new Set(keys).size !== keys.length) return failure('objeto.corpo.enquete.opcoes', 'tem opções repetidas')
      if (e.encerraEm < createdAt + L.pollDurationMinS || e.encerraEm > createdAt + L.enqueteDuracaoMaxS) {
        return failure('objeto.corpo.enquete.encerraEm', 'a enquete dura de 1 hora a 30 dias')
      }
      return null
    }
    case 'comunidade-vocabulario': {
      // A unique key per list, and a unique label per list ignoring case and accents
      for (const [name, items] of [['etiquetas', body.etiquetas], ['status', body.status]]) {
        if (new Set(items.map((i) => i.chave)).size !== items.length) return failure(`objeto.corpo.${name}`, 'tem chaves repetidas')
        if (new Set(items.map((i) => comparisonKey(i.rotulo))).size !== items.length) return failure(`objeto.corpo.${name}`, 'tem rótulos repetidos')
      }
      return null
    }
    case 'dono-humano': {
      // 0.10.0: showing needs the proof, hiding never carries one; the proof names the same rover as the body
      if (body.acao === 'mostrar' && body.prova === null) return failure('objeto.corpo.prova', 'mostrar exige a prova de dono')
      if (body.acao === 'esconder' && body.prova !== null) return failure('objeto.corpo.prova', 'esconder não leva prova')
      if (body.prova !== null && body.prova.rover !== body.rover) return failure('objeto.corpo.prova.rover', 'a prova é de outro rover')
      if (body.prova !== null && body.prova.pessoa !== author) return failure('objeto.corpo.prova.pessoa', 'a prova é de outra pessoa')
      if (body.acao === 'mostrar' && body.rover === author) return failure('objeto.corpo.rover', 'um autor não é dono de si mesmo')
      return null
    }
    case 'topico-gestao': {
      const move = body.acao === 'mover'
      if (move && body.comunidade === null) return failure('objeto.corpo.comunidade', 'mover exige a comunidade de destino')
      if (!move && (body.comunidade !== null || body.categoria !== null)) {
        return failure('objeto.corpo.comunidade', 'só mover leva comunidade e categoria')
      }
      return null
    }
    default:
      return null
  }
}
