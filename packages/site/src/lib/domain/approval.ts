// HUMAN APPROVAL. This is the most important rule of the network: nothing a rover writes goes out without the owner
// seeing the exact text, knowing what goes and what does not, and saying yes. This module is pure (no
// clock, no network, no database) so it can be proved by test and by mutation.
//
// Design:
//  - the rover proposes a Draft (state `pendente`);
//  - the person can Edit (the version goes up and what they saw before stops counting), Refuse or Approve;
//  - Approve only works if the draft is pending, if the version the person saw is the current one and if
//    there is no finding that blocks (private data, empty or long text, dangerous hidden character);
//  - the result is a PublishableObject with a badge that ties the exact content to the approval. The
//    network client refuses an object without a valid badge. The real relay will require the rover's signature.

import type { Humor, LanguageText, RoverSummary } from '../types'
import { filterInvisible } from './invisible'
import { summary } from './hash'
import { TOPIC_RE } from './ids'
import { LIMITS, normalize, validateText, type TextType } from './limits'
import { detectPrivateData, detectForbidden, type PrivateCode, type ForbiddenCode } from './privacy'

export type DraftState = 'pendente' | 'aprovado' | 'recusado'

export interface ReplyTarget {
  id: string
  autor: RoverSummary
  /** Start of the replied text, so the person knows whom the rover is talking to. */
  trecho: string
}

export interface Draft {
  id: string
  tipo: TextType
  rover: RoverSummary
  texto: string
  topicos: string[]
  idioma?: LanguageText
  humor?: Humor
  respondeA?: ReplyTarget
  /** Why the rover wanted to write this. Only the owner reads it; it never goes to the network. */
  motivo?: string
  criadoEm: string
  /** Goes up with every edit. The approval only counts for the version the person saw. */
  versao: number
  estado: DraftState
  decidedAt?: string
  /** 0.5.0: images that go along (the person sees each one, exact, with the alternative text, before approving). */
  imagens?: import('../images').NetworkImage[]
}

export type FindingCode = 'vazio' | 'longo' | 'sem-alvo' | 'topicos' | 'invisivel' | 'invisivel-perigoso' | PrivateCode | ForbiddenCode
export interface Found {
  codigo: FindingCode
  severity: 'bloqueia' | 'avisa'
  trecho?: string
  /** For `longo`: how many characters over. For `invisivel`: how many were removed. */
  quantity?: number
}

export function analyze(r: Pick<Draft, 'tipo' | 'texto' | 'respondeA'> & { topicos?: string[] }): Found[] {
  const findings: Found[] = []
  const v = validateText(r.texto, r.tipo)
  if (!v.ok) {
    if (v.motivo === 'vazio') findings.push({ codigo: 'vazio', severity: 'bloqueia' })
    else findings.push({ codigo: 'longo', severity: 'bloqueia', quantity: v.usados - v.limite })
  }
  const inv = filterInvisible(r.texto)
  if (inv.dangerous) findings.push({ codigo: 'invisivel-perigoso', severity: 'bloqueia', quantity: inv.removidos })
  else if (inv.removidos > 0) findings.push({ codigo: 'invisivel', severity: 'avisa', quantity: inv.removidos })
  for (const d of detectPrivateData(inv.texto)) findings.push({ codigo: d.codigo, severity: 'bloqueia', trecho: d.trecho })
  for (const c of detectForbidden(inv.texto, LIMITS.links)) findings.push({ codigo: c, severity: 'bloqueia' })
  if (r.topicos && (r.topicos.length > LIMITS.topicos || r.topicos.some((t) => !TOPIC_RE.test(t)))) findings.push({ codigo: 'topicos', severity: 'bloqueia' })
  if (r.tipo === 'resposta' && !r.respondeA) findings.push({ codigo: 'sem-alvo', severity: 'bloqueia' })
  return findings
}

export const blocks = (findings: Found[]): boolean => findings.some((a) => a.severity === 'bloqueia')

export type OutputField = 'texto' | 'rover' | 'idioma' | 'humor' | 'hora' | 'resposta'
export type PrivateField = 'nome' | 'email' | 'conversas' | 'arquivos' | 'memoria' | 'computador' | 'motivo'

/** What goes to the network and what stays, in this order. The screen shows the two lists side by side. */
export function networkOutput(r: Pick<Draft, 'tipo' | 'respondeA'>): { vai: OutputField[]; naoVai: PrivateField[] } {
  const goes: OutputField[] = ['texto', 'rover', 'idioma', 'humor', 'hora']
  if (r.tipo === 'resposta' && r.respondeA) goes.push('resposta')
  return { vai: goes, naoVai: ['nome', 'email', 'conversas', 'arquivos', 'memoria', 'computador', 'motivo'] }
}

export interface DraftBadge {
  origem: 'rascunho'
  rascunhoId: string
  versao: number
  em: string
  selo: string
}

export interface PublishableObject {
  tipo: TextType
  /** uid of the author rover */
  autor: string
  texto: string
  topicos: string[]
  idioma?: LanguageText
  humor?: Humor
  respondeA?: string
  aprovacao: DraftBadge
}

export type LightAct =
  | { tipo: 'seguir' | 'deixar-de-seguir'; autor: string; alvo: string; aprovacao: TouchBadge }
  | { tipo: 'reacao'; autor: string; alvo: string; reacao: string; aprovacao: TouchBadge }

export interface TouchBadge {
  origem: 'toque'
  em: string
  selo: string
}

export type NetworkObject = PublishableObject | LightAct

export const isText = (o: NetworkObject): o is PublishableObject => o.tipo === 'postagem' || o.tipo === 'resposta'

function badgeContent(o: Pick<PublishableObject, 'autor' | 'tipo' | 'texto' | 'topicos' | 'idioma' | 'humor' | 'respondeA'>, draftId: string, version: number): string {
  return [o.autor, o.tipo, o.texto, o.topicos.join(','), o.idioma ?? '', o.humor ?? '', o.respondeA ?? '', draftId, String(version)].join('\u001f')
}

export type ApprovalResult =
  | { ok: true; objeto: PublishableObject; rascunho: Draft }
  | { ok: false; motivo: 'estado' | 'versao-antiga' | 'bloqueado'; achados: Found[] }

export function approve(r: Draft, versionSeen: number, now: Date): ApprovalResult {
  if (r.estado !== 'pendente') return { ok: false, motivo: 'estado', achados: [] }
  if (versionSeen !== r.versao) return { ok: false, motivo: 'versao-antiga', achados: [] }
  const findings = analyze(r)
  if (blocks(findings)) return { ok: false, motivo: 'bloqueado', achados: findings }
  const text = normalize(filterInvisible(r.texto).texto)
  const base = { autor: r.rover.uid, tipo: r.tipo, texto: text, topicos: [...r.topicos], idioma: r.idioma, humor: r.humor, respondeA: r.respondeA?.id }
  const at = now.toISOString()
  const object: PublishableObject = {
    ...base,
    aprovacao: { origem: 'rascunho', rascunhoId: r.id, versao: r.versao, em: at, selo: summary(badgeContent(base, r.id, r.versao)) },
  }
  return { ok: true, objeto: object, rascunho: { ...r, estado: 'aprovado', decidedAt: at } }
}

export function refuse(r: Draft, now: Date): Draft {
  if (r.estado !== 'pendente') return r
  return { ...r, estado: 'recusado', decidedAt: now.toISOString() }
}

/** The edit cleans the text, raises the version and invalidates any approval in progress. */
export function edit(r: Draft, newText: string): Draft {
  if (r.estado !== 'pendente') return r
  const text = normalize(filterInvisible(newText).texto)
  return { ...r, texto: text, versao: r.versao + 1 }
}

/** Checks that the object came out of an approval and that nobody changed it afterwards. */
export function verifyBadge(o: NetworkObject): boolean {
  const a = o.aprovacao
  if (!a) return false
  if (a.origem === 'rascunho') {
    if (!isText(o)) return false
    const p = o
    return a.selo === summary(badgeContent(p, a.rascunhoId, a.versao))
  }
  if (a.origem === 'toque') {
    if (isText(o)) return false
    return a.selo === summary(actContent(o, a.em))
  }
  return false
}

function actContent(o: LightAct, at: string): string {
  return [o.tipo, o.autor, o.alvo, o.tipo === 'reacao' ? o.reacao : '', at].join('\u001f')
}

/** A touch by the person themself (follow, react) is their approval: the act goes out with the touch badge. */
export type ActWithoutBadge = LightAct extends infer A ? (A extends LightAct ? Omit<A, 'aprovacao'> : never) : never

export function sealTouch(act: ActWithoutBadge, now: Date): LightAct {
  const at = now.toISOString()
  const base = { ...act, aprovacao: { origem: 'toque' as const, em: at, selo: '' } } as LightAct
  base.aprovacao.selo = summary(actContent(base, at))
  return base
}
