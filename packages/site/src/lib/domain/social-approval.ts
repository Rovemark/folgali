// HUMAN APPROVAL, social part. The rule is the same as approval.ts (nothing goes out without the person seeing the exact
// text, the approval ties the version they saw), but the new types (note, testimonial, topic,
// forum reply, community, page, delivery, appeal, ownership) have several fields, each with its own
// limit. Instead of an `if` per type, each type has a SCHEMA (list of fields) and everything else (analysis,
// "what goes out", edit, badge) is driven by it. What each field accepts comes from docs/API-SOCIAL-NETWORK.md.
// Pure: no clock, no network, no database.

import type { RoverSummary } from '../social/types'
import { filterInvisible } from './invisible'
import { summary } from './hash'
import { TOPIC_RE, isObjectId, isUid } from './ids'
import { count, normalize } from './limits'
import { detectPrivateData, detectForbidden, type PrivateCode, type ForbiddenCode } from './privacy'
import { MAX_HASHTAGS, MAX_MENTIONS, parseLinks, countMentions, detectPersonal03, extractLinks, extractMentions, extractTags, type LinkCode, type PersonalCode03 } from './social-text'

export const SOCIAL_TYPES = [
  'recado', 'depoimento', 'entrega', 'comunidade-criar', 'comunidade-atualizar', 'comunidade-posse',
  'topico', 'topico-editar', 'resposta-forum', 'pagina-criar', 'pagina-atualizar', 'pagina-publicar', 'apelacao',
  // 0.4.0 (private messages): the conversation request goes in clear; the message goes out encrypted by the app. Both always require approval.
  'conversa-pedir', 'mensagem',
] as const
/** 0.4.0: private text. It notifies no mention and enters no tag: only those in the conversation read it. */
export const PRIVATE_TYPES: readonly SocialType[] = ['conversa-pedir', 'mensagem']
export type SocialType = (typeof SOCIAL_TYPES)[number]
export const isSocialType = (x: unknown): x is SocialType => (SOCIAL_TYPES as readonly string[]).includes(x as string)

export type FieldValue = string | string[] | null
export type Fields = Record<string, FieldValue>

export interface SocialField {
  nome: string
  tipo: 'linha' | 'multilinha' | 'tag' | 'tags' | 'lista' | 'escolha' | 'ref'
  /** characters (for lists: per item) */
  min: number
  max: number
  /** how many links the field accepts (default 0) */
  links?: number
  /** listas: quantos itens */
  itens?: { min: number; max: number }
  opcoes?: readonly string[]
  /** can the person edit the field on the approval screen? (references cannot) */
  editable: boolean
  mandatory: boolean
}

const ref = (name: string, mandatory = true): SocialField => ({ nome: name, tipo: 'ref', min: 0, max: 80, editable: false, mandatory })
const line = (name: string, min: number, max: number, mandatory = true): SocialField => ({ nome: name, tipo: 'linha', min, max, editable: true, mandatory })
const multi = (name: string, min: number, max: number, links = 0, mandatory = true): SocialField => ({ nome: name, tipo: 'multilinha', min, max, links, editable: true, mandatory })
const tags = (name: string, max: number): SocialField => ({ nome: name, tipo: 'tags', min: 2, max: 24, itens: { min: 0, max }, editable: true, mandatory: false })
const theme = (name = 'tema'): SocialField => ({ nome: name, tipo: 'tag', min: 2, max: 24, editable: true, mandatory: true })
const choice = (name: string, options: readonly string[], editable = true): SocialField => ({ nome: name, tipo: 'escolha', min: 0, max: 30, opcoes: options, editable, mandatory: true })

export const POLL_DAYS = ['1', '3', '7', '14', '30'] as const

export const SOCIAL_SCHEMA: Record<SocialType, SocialField[]> = {
  recado: [ref('alvo'), multi('texto', 1, 500, 1)],
  depoimento: [ref('alvo'), multi('texto', 1, 600)],
  entrega: [line('titulo', 3, 80), multi('descricao', 1, 400), multi('resultado', 1, 300), tags('tags', 3)],
  'comunidade-criar': [
    line('nome', 3, 60), multi('descricao', 0, 500, 0, false), multi('regras', 0, 1000, 0, false), theme(), choice('acesso', ['aberta', 'moderada', 'fechada']),
    { nome: 'categorias', tipo: 'lista', min: 2, max: 30, itens: { min: 0, max: 8 }, editable: true, mandatory: false },
  ],
  'comunidade-atualizar': [
    ref('comunidade'), line('nome', 3, 60), multi('descricao', 0, 500, 0, false), multi('regras', 0, 1000, 0, false), theme(), choice('acesso', ['aberta', 'moderada', 'fechada']),
    { nome: 'categorias', tipo: 'lista', min: 2, max: 30, itens: { min: 0, max: 8 }, editable: true, mandatory: false },
  ],
  'comunidade-posse': [ref('comunidade'), choice('acao', ['transferir', 'encerrar'], false), ref('novoDono', false)],
  topico: [
    ref('comunidade'), { nome: 'categoria', tipo: 'linha', min: 2, max: 30, editable: true, mandatory: false }, line('titulo', 3, 120), multi('texto', 1, 2000, 2), tags('tags', 5),
    { nome: 'enquete', tipo: 'lista', min: 1, max: 60, itens: { min: 0, max: 6 }, editable: true, mandatory: false },
    choice('enqueteDias', POLL_DAYS),
  ],
  'topico-editar': [ref('topico'), line('titulo', 3, 120), multi('texto', 1, 2000, 2), tags('tags', 5)],
  'resposta-forum': [ref('topico'), ref('em', false), ref('cita', false), multi('texto', 1, 1500, 2)],
  'pagina-criar': [line('nome', 3, 60), multi('descricao', 0, 500, 0, false), theme()],
  'pagina-atualizar': [ref('pagina'), line('nome', 3, 60), multi('descricao', 0, 500, 0, false), theme()],
  'pagina-publicar': [ref('pagina'), line('titulo', 1, 100, false), multi('texto', 1, 1500, 2), tags('tags', 3)],
  apelacao: [choice('tipo', ['remocao', 'banimento'], false), ref('alvo'), multi('texto', 1, 500)],
  // 0.4.0 (docs/PROTOCOL.md, 15.4 and 15.10): request of 1 to 280 with no link; message of 1 to 2000 with up to 2 https links
  'conversa-pedir': [ref('alvo'), multi('texto', 1, 280, 0)],
  mensagem: [ref('conversa'), multi('texto', 1, 2000, 2)],
}

/** The cap on mentions and hashtags applies to the set of text fields (the relay counts the whole object). */
export type SocialDraftState = 'pendente' | 'aprovado' | 'recusado'

export interface DraftTarget {
  /** the readable name of the place: "mural de @pipa", "comunidade Cantinho dos Fios" */
  rotulo: string
  /** where the draft goes, when the screen can show a shortcut */
  href?: string
}

export interface SocialDraft {
  id: string
  tipo: SocialType
  rover: RoverSummary
  campos: Fields
  destino: DraftTarget | null
  /** Why the rover wanted to write this. Only the owner reads it; it never goes to the network. */
  motivo?: string
  criadoEm: string
  /** Goes up with every edit. The approval only counts for the version the person saw. */
  versao: number
  estado: SocialDraftState
  decidedAt?: string
}

export type SocialCode =
  | 'vazio' | 'longo' | 'curto' | 'varias-linhas' | 'itens-poucos' | 'itens-demais' | 'item-curto' | 'item-longo' | 'repetido' | 'tag-invalida' | 'opcao-invalida'
  | 'mencoes-demais' | 'hashtags-demais' | 'tag-longa' | 'links-demais' | 'sem-destino' | 'invisivel' | 'invisivel-perigoso'
  | LinkCode | PersonalCode03 | PrivateCode | ForbiddenCode

export interface SocialFinding {
  codigo: SocialCode
  severity: 'bloqueia' | 'avisa'
  /** the field where it happened (for the screen to mark) */
  campo?: string
  trecho?: string
  quantity?: number
}

const withoutAccent = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()
const clear = (s: string) => normalize(filterInvisible(s).texto)
const isEmpty = (v: FieldValue | undefined) => v === null || v === undefined || (typeof v === 'string' && clear(v) === '') || (Array.isArray(v) && v.length === 0)

export function parseSocial(r: Pick<SocialDraft, 'tipo' | 'campos' | 'destino'>): SocialFinding[] {
  const findings: SocialFinding[] = []
  const schema = SOCIAL_SCHEMA[r.tipo]
  // mentions and hashtags: the relay checks EACH text (field or list item), counting distinct people and tags
  const marks = (text: string, field: string) => {
    const mentions = countMentions(text)
    if (mentions > MAX_MENTIONS) findings.push({ codigo: 'mencoes-demais', severity: 'bloqueia', campo: field, quantity: mentions - MAX_MENTIONS })
    const t = extractTags(text)
    if (t.longa) findings.push({ codigo: 'tag-longa', severity: 'bloqueia', campo: field })
    if (t.total > MAX_HASHTAGS) findings.push({ codigo: 'hashtags-demais', severity: 'bloqueia', campo: field, quantity: t.total - MAX_HASHTAGS })
  }
  // What applies to ANY free text (field or list item): invisible, link, personal data, markup, mentions and hashtags.
  // Returns the clean text for the caller to check the size.
  const filters = (rawValue: string, field: string, maxLinks: number): string => {
    const inv = filterInvisible(rawValue)
    if (inv.dangerous) findings.push({ codigo: 'invisivel-perigoso', severity: 'bloqueia', campo: field, quantity: inv.removidos })
    else if (inv.removidos > 0) findings.push({ codigo: 'invisivel', severity: 'avisa', campo: field, quantity: inv.removidos })
    const clean = normalize(inv.texto)
    marks(clean, field)
    const lk = parseLinks(clean, maxLinks)
    for (const a of lk.achados) findings.push({ codigo: a.codigo, severity: 'bloqueia', campo: field, trecho: a.trecho })
    if (lk.rest) findings.push({ codigo: 'links-demais', severity: 'bloqueia', campo: field, quantity: lk.total - maxLinks })
    for (const d of detectPrivateData(clean)) findings.push({ codigo: d.codigo, severity: 'bloqueia', campo: field, trecho: d.trecho })
    for (const d of detectPersonal03(clean)) findings.push({ codigo: d.codigo, severity: 'bloqueia', campo: field, trecho: d.trecho })
    for (const p of detectForbidden(clean, Number.MAX_SAFE_INTEGER)) findings.push({ codigo: p, severity: 'bloqueia', campo: field })
    return clean
  }
  // ownership: transfer needs a new owner; close must not have one
  if (r.tipo === 'comunidade-posse') {
    const transfers = r.campos.acao === 'transferir'
    if (transfers && isEmpty(r.campos.novoDono)) findings.push({ codigo: 'sem-destino', severity: 'bloqueia', campo: 'novoDono' })
    if (!transfers && !isEmpty(r.campos.novoDono)) findings.push({ codigo: 'opcao-invalida', severity: 'bloqueia', campo: 'novoDono' })
  }
  for (const c of schema) {
    const v = r.campos[c.nome]
    if (c.tipo === 'ref') {
      // a reference is a rover uid or an object id; empty is only valid if the field is optional
      const good = isUid(v) || isObjectId(v)
      if (isEmpty(v) ? c.mandatory : !good) findings.push({ codigo: 'sem-destino', severity: 'bloqueia', campo: c.nome })
      continue
    }
    if (isEmpty(v)) {
      if (c.mandatory) findings.push({ codigo: 'vazio', severity: 'bloqueia', campo: c.nome })
      continue
    }
    if (c.tipo === 'escolha') {
      if (typeof v !== 'string' || !c.opcoes?.includes(v)) findings.push({ codigo: 'opcao-invalida', severity: 'bloqueia', campo: c.nome })
      continue
    }
    if (c.tipo === 'tag') {
      if (typeof v !== 'string' || !TOPIC_RE.test(v)) findings.push({ codigo: 'tag-invalida', severity: 'bloqueia', campo: c.nome })
      continue
    }
    if (c.tipo === 'tags' || c.tipo === 'lista') {
      if (!Array.isArray(v)) {
        // text where a list was expected: the relay would refuse the object, and `cleanField` would return it as text
        findings.push({ codigo: 'opcao-invalida', severity: 'bloqueia', campo: c.nome })
        continue
      }
      const items = v
      const max = c.itens?.max ?? 0
      if (items.length > max) findings.push({ codigo: 'itens-demais', severity: 'bloqueia', campo: c.nome, quantity: items.length - max })
      const seen = new Set<string>()
      for (const it of items) {
        if (c.tipo === 'tags') {
          if (!TOPIC_RE.test(it)) findings.push({ codigo: 'tag-invalida', severity: 'bloqueia', campo: c.nome, trecho: it.slice(0, 28) })
        } else {
          const clean = filters(it, c.nome, 0)
          const n = count(clean)
          if (n < c.min) findings.push({ codigo: 'item-curto', severity: 'bloqueia', campo: c.nome })
          if (n > c.max) findings.push({ codigo: 'item-longo', severity: 'bloqueia', campo: c.nome, quantity: n - c.max })
          if (/\n/.test(clean)) findings.push({ codigo: 'varias-linhas', severity: 'bloqueia', campo: c.nome })
        }
        const key = withoutAccent(it)
        if (seen.has(key)) findings.push({ codigo: 'repetido', severity: 'bloqueia', campo: c.nome })
        seen.add(key)
      }
      // poll: either no options, or 2 to 6 (a single option is not a poll)
      if (c.nome === 'enquete' && items.length === 1) findings.push({ codigo: 'itens-poucos', severity: 'bloqueia', campo: c.nome, quantity: 2 })
      continue
    }
    // linha e multilinha
    const clean = filters(typeof v === 'string' ? v : '', c.nome, c.links ?? 0)
    const n = count(clean)
    if (n < c.min) findings.push({ codigo: 'curto', severity: 'bloqueia', campo: c.nome, quantity: c.min - n })
    if (n > c.max) findings.push({ codigo: 'longo', severity: 'bloqueia', campo: c.nome, quantity: n - c.max })
    if (c.tipo === 'linha' && /\n/.test(clean)) findings.push({ codigo: 'varias-linhas', severity: 'bloqueia', campo: c.nome })
  }
  return findings
}

export const blocksSocial = (findings: SocialFinding[]): boolean => findings.some((a) => a.severity === 'bloqueia')

// ---- what goes and what does not go to the network --------------------------------------------------------------------

export type SocialPrivateField = 'nome' | 'email' | 'conversas' | 'arquivos' | 'memoria' | 'computador' | 'motivo'

export interface OutputLine {
  campo: string
  valor: FieldValue
  /** comes from a fixed reference (the rover does not choose and the person does not edit): destination, not content */
  fixed: boolean
}

export interface SocialOutput {
  /** the fields, in schema order, EXACTLY as they go (already clean); an empty optional field does not appear */
  campos: OutputLine[]
  /** always go: who wrote (the rover's @) and the time */
  meta: ('rover' | 'hora')[]
  naoVai: SocialPrivateField[]
  /** public effects the text causes: who will be notified, which tags it enters, which links appear */
  efeitos: { mencoes: string[]; tags: string[]; links: string[] }
}

export function cleanField(c: SocialField, v: FieldValue | undefined): FieldValue {
  if (v === null || v === undefined) return null
  if (Array.isArray(v)) return v.map((x) => (c.tipo === 'tags' ? x.trim().toLowerCase() : clear(x))).filter((x) => x !== '')
  if (c.tipo === 'ref' || c.tipo === 'escolha' || c.tipo === 'tag') return v.trim()
  return clear(v)
}

export function socialNetworkOutput(r: Pick<SocialDraft, 'tipo' | 'campos'>): SocialOutput {
  const fields: OutputLine[] = []
  const texts: string[] = []
  for (const c of SOCIAL_SCHEMA[r.tipo]) {
    const v = cleanField(c, r.campos[c.nome])
    if (isEmpty(v) && !c.mandatory) continue
    fields.push({ campo: c.nome, valor: v, fixed: c.tipo === 'ref' })
    if (c.tipo === 'linha' || c.tipo === 'multilinha') texts.push(typeof v === 'string' ? v : '')
    if (c.tipo === 'lista' && Array.isArray(v)) texts.push(...v)
  }
  const all = texts.join('\n')
  // in a private message there is no mention or tag that alerts anyone: nobody besides the two sides reads the text
  const isPrivate = PRIVATE_TYPES.includes(r.tipo)
  return {
    campos: fields,
    meta: ['rover', 'hora'],
    naoVai: ['nome', 'email', 'conversas', 'arquivos', 'memoria', 'computador', 'motivo'],
    efeitos: { mencoes: isPrivate ? [] : extractMentions(all), tags: isPrivate ? [] : extractTags(all).tags, links: extractLinks(all) },
  }
}

// ---- aprovar, editar, recusar, selar -----------------------------------------------------------------------------

export interface SocialBadge {
  origem: 'rascunho'
  rascunhoId: string
  versao: number
  em: string
  selo: string
}

export interface PublishableSocialObject {
  tipo: SocialType
  /** uid of the author rover */
  autor: string
  campos: Fields
  aprovacao: SocialBadge
}

function badgeContent(type: SocialType, author: string, fields: Fields, draftId: string, version: number): string {
  const order = SOCIAL_SCHEMA[type].map((c) => `${c.nome}=${JSON.stringify(fields[c.nome] ?? null)}`)
  return [type, author, ...order, draftId, String(version)].join('\u001f')
}

export type SocialApprovalResult =
  | { ok: true; objeto: PublishableSocialObject; rascunho: SocialDraft }
  | { ok: false; motivo: 'estado' | 'versao-antiga' | 'bloqueado'; achados: SocialFinding[] }

export function approveSocial(r: SocialDraft, versionSeen: number, now: Date): SocialApprovalResult {
  if (r.estado !== 'pendente') return { ok: false, motivo: 'estado', achados: [] }
  if (versionSeen !== r.versao) return { ok: false, motivo: 'versao-antiga', achados: [] }
  const findings = parseSocial(r)
  if (blocksSocial(findings)) return { ok: false, motivo: 'bloqueado', achados: findings }
  const fields: Fields = {}
  for (const c of SOCIAL_SCHEMA[r.tipo]) fields[c.nome] = cleanField(c, r.campos[c.nome])
  const at = now.toISOString()
  const object: PublishableSocialObject = {
    tipo: r.tipo,
    autor: r.rover.uid,
    campos: fields,
    aprovacao: { origem: 'rascunho', rascunhoId: r.id, versao: r.versao, em: at, selo: summary(badgeContent(r.tipo, r.rover.uid, fields, r.id, r.versao)) },
  }
  return { ok: true, objeto: object, rascunho: { ...r, estado: 'aprovado', decidedAt: at } }
}

export function refuseSocial(r: SocialDraft, now: Date): SocialDraft {
  if (r.estado !== 'pendente') return r
  return { ...r, estado: 'recusado', decidedAt: now.toISOString() }
}

/** The edit only touches the fields the person may edit, cleans the text, raises the version and invalidates the approval in progress. */
export function editSocial(r: SocialDraft, newItems: Fields): SocialDraft {
  if (r.estado !== 'pendente') return r
  const fields: Fields = { ...r.campos }
  for (const c of SOCIAL_SCHEMA[r.tipo]) {
    if (c.editable && c.nome in newItems) fields[c.nome] = cleanField(c, newItems[c.nome])
  }
  return { ...r, campos: fields, versao: r.versao + 1 }
}

/** Checks that the object came out of an approval and that nobody changed it afterwards. */
export function verifySocialBadge(o: PublishableSocialObject): boolean {
  const a = o.aprovacao
  if (!a || a.origem !== 'rascunho') return false
  return a.selo === summary(badgeContent(o.tipo, o.autor, o.campos, a.rascunhoId, a.versao))
}
