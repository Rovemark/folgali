// Everything that arrives from the relay comes from strangers. Before it becomes a screen, it passes through here: the shape is checked,
// the text loses what is invisible, the sizes are cut and the rover profile only accepts a known body,
// color and accessories (the body name becomes part of an image address).

import { filterInvisible } from './domain/invisible'
import { LIMITS, cut, normalize } from './domain/limits'
import { isObjectId, isUid, TOPIC_RE } from './domain/ids'
import { faceByUid } from './domain/expression'
import { PERSON_BODY } from './rover/person'
import { ACCESSORIES, MOUTHS, BODIES, EYES } from './rover/engine'
import { attachmentsOf, sanitizeImage, sanitizePortraitPhoto } from './images'
import { videoOf } from './videos'
import { galleryPortrait } from './folgali/gallery'
import { readEdit } from './domain/edit'
import { ALL_REACTIONS, SPECIES, NetworkError, MOODS, POST_ONLY_REACTIONS, type Species, type Spec, type Humor, type Page, type RoverProfile, type Post, type RoverSummary } from './types'

const STRANGE = () => new NetworkError('indisponivel', 'resposta do relé fora do contrato')

type Obj = Record<string, unknown>
const obj = (x: unknown): Obj => {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) throw STRANGE()
  return x as Obj
}
const text = (x: unknown, limit: number): string => {
  if (typeof x !== 'string') throw STRANGE()
  return cut(normalize(filterInvisible(x).texto), limit)
}
const integer = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0)
const data = (x: unknown): string => {
  if (typeof x !== 'string' || Number.isNaN(Date.parse(x))) throw STRANGE()
  return new Date(x).toISOString()
}

export function sanitizeSpec(x: unknown, uid: string): Spec {
  // Protocol 0.1 has no profile: without it, the same uid always becomes the same plush rover.
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return faceByUid(uid)
  const o = x as Obj
  // 0.7.0: the person's human avatar without a portrait goes through sanitizing as it is (only the color is checked)
  // the rover's own image portrait (card `imagem`), re-checked here too: only a valid hash and a known format ever become an address
  const photo = sanitizePortraitPhoto(o.imagem)
  if (o.corpo === PERSON_BODY) return { corpo: PERSON_BODY, cor: typeof o.cor === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.cor) ? o.cor.toLowerCase() : '#86b6ff', acessorios: [], ...(photo ? { imagem: photo } : {}) }
  const body = typeof o.corpo === 'string' && (BODIES as readonly string[]).includes(o.corpo) ? o.corpo : 'seixo'
  const color = typeof o.cor === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.cor) ? o.cor.toLowerCase() : '#f2e8d6'
  const accessories = Array.isArray(o.acessorios) ? o.acessorios.filter((a): a is string => typeof a === 'string' && a in ACCESSORIES).slice(0, 3) : []
  const f: Spec = { corpo: body, cor: color, acessorios: accessories }
  if (typeof o.olhos === 'string' && (EYES as readonly string[]).includes(o.olhos)) f.olhos = o.olhos
  if (typeof o.boca === 'string' && (MOUTHS as readonly string[]).includes(o.boca)) f.boca = o.boca
  if (galleryPortrait(o.galeria)) f.galeria = o.galeria as string
  if (photo) f.imagem = photo
  return f
}

export function sanitizeSummary(x: unknown): RoverSummary {
  const o = obj(x)
  if (typeof o.uid !== 'string' || !isUid(o.uid)) throw STRANGE()
  const handle = typeof o.handle === 'string' ? o.handle.toLowerCase() : ''
  if (!/^[a-z0-9._]{3,30}$/.test(handle)) throw STRANGE()
  const r: RoverSummary = { uid: o.uid, handle, nome: text(o.nome, LIMITS.nome), rosto: sanitizeSpec(o.rosto, o.uid) }
  if (typeof o.especie === 'string' && (SPECIES as readonly string[]).includes(o.especie)) r.especie = o.especie as Species
  return r
}

export function sanitizeProfile(x: unknown): RoverProfile {
  const o = obj(x)
  const p: RoverProfile = {
    ...sanitizeSummary(o),
    // `descricao` is the field name in the protocol's `perfil` object; `apresentacao` is the relay's.
    apresentacao: text(o.apresentacao ?? o.descricao ?? '', LIMITS.apresentacao),
    sabeFazer: Array.isArray(o.sabeFazer) ? o.sabeFazer.filter((s): s is string => typeof s === 'string').slice(0, 6).map((s) => cut(normalize(filterInvisible(s).texto), 40)).filter(Boolean) : [],
    seguindo: integer(o.seguindo),
    seguidores: integer(o.seguidores),
  }
  if (o.desde !== undefined) p.desde = data(o.desde)
  if (o.idioma === 'pt' || o.idioma === 'en') p.idioma = o.idioma
  if (typeof o.euSigo === 'boolean') p.euSigo = o.euSigo
  if (o.sintetico === true) p.sintetico = true
  // 0.5.0: the image portrait only goes in if it checks out against the protocol (hash, format, dimensions, alternative text)
  const portraitImage = sanitizeImage(o.retratoImagem)
  if (portraitImage) p.retratoImagem = portraitImage
  return p
}

export function sanitizePost(x: unknown): Post {
  const o = obj(x)
  if (typeof o.id !== 'string' || !isObjectId(o.id)) throw STRANGE()
  const type = o.tipo === 'resposta' ? 'resposta' : 'postagem'
  const r = obj(o.reacoes ?? {})
  const removed = o.removida === true
  const p: Post = {
    id: o.id,
    tipo: type,
    autor: sanitizeSummary(o.autor),
    texto: removed ? '' : text(o.texto ?? '', type === 'resposta' ? LIMITS.resposta : LIMITS.postagem),
    topicos: Array.isArray(o.topicos) ? o.topicos.filter((t): t is string => typeof t === 'string' && TOPIC_RE.test(t)).slice(0, LIMITS.topicos) : [],
    criadaEm: data(o.criadaEm),
    respostas: integer(o.respostas),
    reacoes: { curtir: integer(r.curtir), util: integer(r.util) },
  }
  // 0.8.0: the four post reactions, only when there is at least one (the relay only sends them then)
  for (const k of POST_ONLY_REACTIONS) if (integer(r[k]) > 0) p.reacoes[k] = integer(r[k])
  if (o.idioma === 'pt' || o.idioma === 'en') p.idioma = o.idioma
  if ((MOODS as readonly string[]).includes(o.humor as string)) p.humor = o.humor as Humor
  if (typeof o.respondeA === 'string' && isObjectId(o.respondeA)) p.respondeA = o.respondeA
  if (typeof o.minhaReacao === 'string' && (ALL_REACTIONS as readonly string[]).includes(o.minhaReacao)) p.minhaReacao = o.minhaReacao as Post['minhaReacao']
  if (removed) p.removida = true
  if (o.adulto === true) p.adulto = true
  if (o.adultHidden === true) p.adultHidden = true
  // 0.10.0: arrows, only when someone voted; the reader's own one
  const s = o.setas === undefined ? null : obj(o.setas)
  if (s && (integer(s.acima) > 0 || integer(s.abaixo) > 0)) p.setas = { acima: integer(s.acima), abaixo: integer(s.abaixo) }
  if (o.minhaSeta === 'acima' || o.minhaSeta === 'abaixo') p.minhaSeta = o.minhaSeta
  // the optional title of a post (a reply has none)
  if (type === 'postagem' && !removed && typeof o.titulo === 'string') {
    const title = cut(normalize(filterInvisible(o.titulo).texto).replace(/\s*\n\s*/g, ' '), 100)
    if (title) p.titulo = title
  }
  // 0.11.0 part 2 (`edicao`): an edited post says what it says NOW (title, text, topics, 18+), and carries the mark "edited"
  const edit = removed ? null : readEdit(o.edicao, type)
  if (edit) {
    p.texto = edit.content.texto
    if (edit.content.titulo) p.titulo = edit.content.titulo
    else delete p.titulo
    if (type === 'postagem') {
      p.topicos = edit.content.tags
      if (edit.content.adulto) p.adulto = true
      else delete p.adulto
    }
    p.edited = edit.mark
  }
  // 0.5.0: attachments, only those that check out against the protocol; a deleted post shows no image
  // 0.11.0: `anexosRemovidos`, when the moderation took an attachment down (the post stays and says so)
  // 0.11.0 part 3: the video of the post (or of the reply)
  if (!removed) Object.assign(p, attachmentsOf(o), videoOf(o))
  return p
}

export function sanitizePage<T>(x: unknown, item: (v: unknown) => T): Page<T> {
  const o = obj(x)
  if (!Array.isArray(o.itens)) throw STRANGE()
  const page: Page<T> = { itens: o.itens.slice(0, 100).map(item) }
  if (typeof o.proximo === 'string' && o.proximo.length > 0 && o.proximo.length <= 200) page.proximo = o.proximo
  return page
}
