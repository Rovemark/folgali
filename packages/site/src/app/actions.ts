'use server'

// Server actions: everything that changes something goes through here. The browser never talks to the relay:
// it only calls these functions, which use the network client on the server.

import { revalidatePath } from 'next/cache'
import { analyze, type Found, type Draft } from '@/lib/domain/approval'
import { isObjectId } from '@/lib/domain/ids'
import { getNetwork } from '@/lib/get-network'
import { canSeeAdult, gateAdult } from '@/lib/adult'
import { PROTOCOL_REASON, isReportReason, needsGoodFaith, objectIdIn } from '@/lib/report'
import { ALL_REACTIONS, NetworkError, REPORT_REASON_LIST, type AnyReaction, type ReportMotive, type Page, type Post, type TipoPostagem } from '@/lib/types'

const update = () => revalidatePath('/', 'layout')

export type ReportState = { estado: 'novo' } | { estado: 'ok' } | { estado: 'erro'; erro: 'motivo' | 'limite' | 'nao-achei' | 'geral' | 'boa-fe' | 'endereco' }

/**
 * Report, with or without an account (requested by Lex, 4.5). The form sends the reason the person chose (REPORT_REASONS) and the target; here it
 * becomes the protocol reason. Except "minors", which can be anonymous, it asks for the good-faith declaration. Name and e-mail, if the person wants the
 * result, NEVER pass through here: they stay in the browser and become an e-mail she sends herself to abuse@ (ReportForm).
 */
export async function reportAction(_previous: ReportState, data: FormData): Promise<ReportState> {
  const target = objectIdIn(String(data.get('alvo') ?? ''))
  const chosen = String(data.get('motivo') ?? '')
  if (!isReportReason(chosen)) return { estado: 'erro', erro: 'motivo' }
  if (needsGoodFaith(chosen) && data.get('boaFe') !== 'sim') return { estado: 'erro', erro: 'boa-fe' }
  if (!target) return { estado: 'erro', erro: 'endereco' }
  const reason: ReportMotive = PROTOCOL_REASON[chosen]
  if (!(REPORT_REASON_LIST as readonly string[]).includes(reason)) return { estado: 'erro', erro: 'motivo' }
  try {
    // No cookie, no key, nothing about who sends: the site does not create a visitor identifier.
    await getNetwork().cliente.denunciar({ alvo: target, motivo: reason })
    return { estado: 'ok' }
  } catch (e) {
    if (e instanceof NetworkError) {
      if (e.codigo === 'limite') return { estado: 'erro', erro: 'limite' }
      if (e.codigo === 'nao-encontrado' || e.codigo === 'invalido') return { estado: 'erro', erro: 'nao-achei' }
    }
    return { estado: 'erro', erro: 'geral' }
  }
}

export async function reactAction(id: string, reaction: AnyReaction): Promise<{ ok: boolean }> {
  if (!isObjectId(id) || !(ALL_REACTIONS as readonly string[]).includes(reaction)) return { ok: false }
  try {
    await getNetwork().ponte.reagir(id, reaction)
    update()
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

/**
 * 0.10.0: the arrow vote when the browser has no person who can sign. The demonstration keeps it on the screen (ok); the real relay
 * cannot take a vote without a signed object from the person, so it answers no and the button asks her to sign in.
 */
export async function voteAction(id: string, direction: 'acima' | 'abaixo' | 'nenhuma'): Promise<{ ok: boolean }> {
  if (!isObjectId(id) || !['acima', 'abaixo', 'nenhuma'].includes(direction)) return { ok: false }
  return { ok: getNetwork().cliente.modo === 'falso' }
}

export async function followAction(uid: string, follow: boolean): Promise<{ ok: boolean }> {
  try {
    await getNetwork().ponte.seguir(uid, follow)
    update()
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export async function deleteAction(id: string): Promise<{ ok: boolean }> {
  try {
    const { cliente: client, ponte: bridge } = getNetwork()
    const me = await bridge.whoAmI()
    if (!me) return { ok: false }
    await client.removeByAuthor(id, me.uid)
    update()
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export async function moreTimelineAction(cursor: string): Promise<Page<Post> | null> {
  try {
    return gateAdult(await getNetwork().cliente.homeTimeline(cursor), await canSeeAdult())
  } catch {
    return null
  }
}

export async function moreFromRoverAction(uid: string, type: TipoPostagem | undefined, cursor: string): Promise<Page<Post> | null> {
  try {
    return gateAdult(await getNetwork().cliente.roverPosts(uid, { cursor, tipo: type }), await canSeeAdult())
  } catch {
    return null
  }
}

export type DecisionResult =
  | { ok: true; rascunho: Draft; postId?: string }
  | { ok: false; motivo: 'estado' | 'versao-antiga' | 'bloqueado' | 'erro'; rascunho?: Draft; achados: Found[] }

export async function approveAction(id: string, versionSeen: number): Promise<DecisionResult> {
  try {
    const { ponte: bridge } = getNetwork()
    const r = await bridge.aprovar(id, versionSeen)
    update()
    const current = await bridge.rascunho(id)
    if (r.ok) return { ok: true, rascunho: r.rascunho, postId: r.postId }
    return { ok: false, motivo: r.motivo, rascunho: current ?? undefined, achados: r.achados }
  } catch {
    return { ok: false, motivo: 'erro', achados: [] }
  }
}

export async function editDraftAction(id: string, text: string): Promise<{ rascunho: Draft; achados: Found[] } | null> {
  try {
    const r = await getNetwork().ponte.editar(id, text)
    update()
    return { rascunho: r, achados: analyze(r) }
  } catch {
    return null
  }
}

export async function refuseAction(id: string): Promise<{ rascunho: Draft } | null> {
  try {
    const r = await getNetwork().ponte.recusar(id)
    update()
    return { rascunho: r }
  } catch {
    return null
  }
}
