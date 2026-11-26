// The browser side of events for a signed-in person: her own answer to one event (a read the device signs, carried by
// /api/person/events), the communities she may create an event in, and the four event types she signs and publishes with the
// device key (src/lib/person/client.ts, `publish`). No approval: the relay takes events from a person on her own signature.
import { PersonError, publish } from '@/lib/person/client'
import { signReadCredential, storedDevice } from '@/lib/person/device'
import type { EventContent } from './body'
import { createBody, editBody } from './body'
import { isRsvp, type Rsvp } from './types'

const ID = /^ob_[A-Za-z0-9_-]{43}$/
export const eventPath = (id: string) => `/v1/eventos/${id}`

/**
 * The person's own answer to the event, read from the relay AS her: the device signs a read credential for the exact path and this
 * site's route carries it. Null for a visitor, when this browser never signed, or when another device published last.
 */
export async function myRsvp(eventId: string): Promise<Rsvp | null> {
  if (!ID.test(eventId)) return null
  const device = await storedDevice().catch(() => null)
  const uid = device?.attestation?.uid
  if (!device || !uid) return null
  const path = eventPath(eventId)
  try {
    const credential = await signReadCredential(device.privateKey, { uid, path, t: Math.floor(Date.now() / 1000) })
    const r = await fetch('/api/person/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ path, credential }),
      credentials: 'same-origin',
    })
    if (!r.ok) return null
    const j = (await r.json().catch(() => ({}))) as { minhaPresenca?: unknown }
    return isRsvp(j.minhaPresenca) ? j.minhaPresenca : null
  } catch {
    return null
  }
}

export interface MyCommunity {
  id: string
  nome: string
}

/** The communities the signed-in person is in (where she may create an event). Empty on any failure: the event goes on its own. */
export async function myCommunities(): Promise<MyCommunity[]> {
  try {
    const r = await fetch('/api/person/events', { method: 'GET', headers: { accept: 'application/json' }, credentials: 'same-origin' })
    if (!r.ok) return []
    const j = (await r.json().catch(() => ({}))) as { comunidades?: unknown }
    if (!Array.isArray(j.comunidades)) return []
    return j.comunidades.filter((c): c is MyCommunity => typeof c === 'object' && c !== null && ID.test((c as MyCommunity).id) && typeof (c as MyCommunity).nome === 'string').slice(0, 100)
  } catch {
    return []
  }
}

export const createEvent = (c: EventContent, community: string | null) => publish('evento-criar', createBody(c, community))
export const editEvent = (c: EventContent, event: string) => publish('evento-editar', editBody(c, event))
export const cancelEvent = (event: string) => publish('evento-cancelar', { evento: event })

/**
 * Answers the event. The same answer again (`ja_existe`) is not a failure: the relay already holds it, so it counts as done.
 */
export async function answerEvent(event: string, reply: Rsvp): Promise<void> {
  try {
    await publish('evento-presenca', { evento: event, resposta: reply })
  } catch (e) {
    if (e instanceof PersonError && e.code === 'ja_existe') return
    throw e
  }
}
