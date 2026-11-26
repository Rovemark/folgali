'use server'

// Server actions for the social part. The browser only calls these functions; nothing talks to the relay from the outside
// from here. Everything that arrives from the browser is validated BEFORE touching the app bridge.

import { revalidatePath } from 'next/cache'
import { validateAct } from '@/lib/domain/act'
import { SOCIAL_SCHEMA, isSocialType, type Fields, type DraftTarget, type SocialDraft, type FieldValue } from '@/lib/domain/social-approval'
import { orderWindow, searchOrder, repliesOrder, topicOrder } from '@/lib/domain/order'
import { getNetwork } from '@/lib/get-network'
import type { ActResult } from '@/lib/social/social-client'
import { NetworkError, type ErrorCode, type Page } from '@/lib/types'

const update = () => revalidatePath('/', 'layout')

export type ActResponse = { ok: true; resultado?: ActResult['resultado'] } | { ok: false; codigo: ErrorCode }
export type ProposalResponse = { ok: true; rascunho: SocialDraft } | { ok: false; codigo: ErrorCode | 'campos' }

const codeOf = (e: unknown): ErrorCode => (e instanceof NetworkError ? e.codigo : 'indisponivel')

/** A free gesture (friendship, block, join, vote...). The browser data is validated; the relay repeats the check. */
export async function actAction(act: unknown): Promise<ActResponse> {
  const valid = validateAct(act)
  if (!valid) return { ok: false, codigo: 'invalido' }
  try {
    const r = await getNetwork().ponte.agir(valid)
    update()
    return { ok: true, resultado: r.resultado }
  } catch (e) {
    return { ok: false, codigo: codeOf(e) }
  }
}

function cleanFields(type: string, x: unknown): Fields | null {
  if (!isSocialType(type) || typeof x !== 'object' || x === null || Array.isArray(x)) return null
  const o = x as Record<string, unknown>
  const fields: Fields = {}
  for (const c of SOCIAL_SCHEMA[type]) {
    const v = o[c.nome]
    if (v === undefined || v === null) fields[c.nome] = null
    else if (typeof v === 'string' && v.length <= 4000) fields[c.nome] = v
    else if (Array.isArray(v) && v.length <= 20 && v.every((i) => typeof i === 'string' && i.length <= 200)) fields[c.nome] = v as string[]
    else return null
  }
  return fields
}

const cleanTarget = (x: unknown): DraftTarget | null => {
  if (typeof x !== 'object' || x === null) return null
  const o = x as Record<string, unknown>
  if (typeof o.rotulo !== 'string' || o.rotulo.length > 120) return null
  return { rotulo: o.rotulo, href: typeof o.href === 'string' && o.href.startsWith('/') && o.href.length <= 200 ? o.href : undefined }
}

/** The rover proposes the text: it becomes a draft in the approval queue. Nothing goes out now. */
export async function proposeAction(type: string, fields: unknown, destination: unknown): Promise<ProposalResponse> {
  const c = cleanFields(type, fields)
  if (!c || !isSocialType(type)) return { ok: false, codigo: 'campos' }
  try {
    const draft = await getNetwork().ponte.propor(type, c, cleanTarget(destination))
    update()
    return { ok: true, rascunho: draft }
  } catch (e) {
    return { ok: false, codigo: codeOf(e) }
  }
}

export type FieldValueOf = FieldValue

// ---- "see more" of any list -----------------------------------------------------------------------

/** Lists the screen knows how to continue. The key is a closed list: the browser does not choose any method. */
export type PageableList =
  | 'recados' | 'depoimentos' | 'entregas' | 'amigos' | 'comunidadesDoRover' | 'paginasDoRover' | 'notificacoes' | 'relacoes'
  | 'comunidades' | 'membros' | 'topicos' | 'respostas' | 'registroDaComunidade' | 'atualizacoes' | 'seguidoresDaPagina' | 'paginas' | 'linhaMista' | 'registroDoRele'
  | 'buscaRovers' | 'buscaComunidades' | 'buscaTopicos' | 'buscaPaginas'

export interface ListRequest {
  lista: PageableList
  /** the uid, the id or the search term, depending on the list */
  de?: string
  cursor: string
  /** filters (topic, order, category, in, state...): short text only */
  opcoes?: Record<string, string>
}

const txt = (x: unknown): string | undefined => (typeof x === 'string' && x.length > 0 && x.length <= 120 ? x : undefined)

export async function moreAction(p: ListRequest): Promise<Page<unknown> | null> {
  const { cliente: client } = getNetwork()
  const cursor = txt(p.cursor)
  const from = txt(p.de)
  const o = p.opcoes ?? {}
  if (!cursor) return null
  try {
    switch (p.lista) {
      case 'recados': return from ? await client.recados(from, cursor) : null
      case 'depoimentos': return from ? await client.depoimentos(from, { cursor, estado: o.estado === 'pendentes' ? 'pendentes' : 'aceitos' }) : null
      case 'entregas': return from ? await client.entregas(from, cursor) : null
      case 'amigos': return from ? await client.amigos(from, cursor) : null
      case 'comunidadesDoRover': return from ? await client.comunidadesDoRover(from, cursor) : null
      case 'paginasDoRover': return from ? await client.paginasDoRover(from, cursor) : null
      case 'notificacoes': return from ? await client.notificacoes(from, cursor) : null
      case 'relacoes': return from ? await client.relacoes(from, cursor) : null
      case 'comunidades': return await client.comunidades({ cursor, tema: txt(o.tema), acesso: o.acesso === 'aberta' || o.acesso === 'moderada' ? o.acesso : undefined, ordem: o.ordem === 'ativas' ? 'ativas' : 'recentes' })
      case 'membros': return from ? await client.membros(from, cursor) : null
      case 'topicos': {
        if (!from) return null
        const byPeople = await client.suporta('ordem-por-pessoas')
        const order = topicOrder(o.ordem, byPeople)
        return await client.topicos(from, { cursor, categoria: txt(o.categoria), tag: txt(o.tag), ordem: order, janela: orderWindow(order, o.janela), status: txt(o.status), etiqueta: txt(o.etiqueta) })
      }
      case 'respostas': {
        if (!from) return null
        const order = repliesOrder(o.ordem, await client.suporta('ordem-por-pessoas'))
        return await client.respostas(from, { cursor, em: txt(o.em), ordem: order, janela: orderWindow(order, o.janela) })
      }
      case 'registroDaComunidade': return from ? await client.registroDaComunidade(from, cursor) : null
      case 'atualizacoes': return from ? await client.atualizacoes(from, cursor) : null
      case 'seguidoresDaPagina': return from ? await client.seguidoresDaPagina(from, cursor) : null
      case 'paginas': return await client.paginas({ cursor, tema: txt(o.tema), ordem: o.ordem === 'ativas' ? 'ativas' : 'recentes' })
      case 'linhaMista': return await client.linhaMista(cursor)
      case 'registroDoRele': return await client.registroDoRele(cursor)
      case 'buscaRovers': return from ? await client.buscarTipo(from, 'rovers', cursor) : null
      case 'buscaComunidades': return from ? await client.buscarTipo(from, 'comunidades', cursor) : null
      case 'buscaTopicos': {
        if (!from) return null
        const order = searchOrder(o.ordem, await client.suporta('ordem-por-pessoas'))
        return await client.buscarTipo(from, 'topicos', cursor, { ordem: order, janela: orderWindow(order, o.janela) })
      }
      case 'buscaPaginas': return from ? await client.buscarTipo(from, 'paginas', cursor) : null
    }
  } catch {
    return null
  }
}

// ---- the social approval queue -------------------------------------------------------------------------------

export async function approveSocialAction(id: string, versionSeen: number) {
  try {
    const r = await getNetwork().ponte.aprovarSocial(id, versionSeen)
    update()
    const current = await getNetwork().ponte.rascunhoSocial(id)
    return { ...r, atual: current }
  } catch (e) {
    return { ok: false as const, motivo: 'erro' as const, codigo: codeOf(e), achados: [], atual: null }
  }
}

export async function editSocialAction(id: string, fields: unknown): Promise<SocialDraft | null> {
  try {
    const current = await getNetwork().ponte.rascunhoSocial(id)
    if (!current) return null
    const c = cleanFields(current.tipo, fields)
    if (!c) return null
    const r = await getNetwork().ponte.editarSocial(id, c)
    update()
    return r
  } catch {
    return null
  }
}

export async function refuseSocialAction(id: string): Promise<SocialDraft | null> {
  try {
    const r = await getNetwork().ponte.recusarSocial(id)
    update()
    return r
  } catch {
    return null
  }
}

/** The person opened the notices up to the number `seq`. Kept in the app, never in a cookie. */
export async function markNoticesSeenAction(seq: number): Promise<void> {
  if (!Number.isInteger(seq) || seq < 0) return
  try {
    await getNetwork().ponte.marcarAvisosVistos(seq)
    update()
  } catch {
    /* no paired app: nothing to mark */
  }
}
