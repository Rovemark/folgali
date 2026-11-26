// Rovemark forwards, signed (x-rvm-assinatura, RVM_FOLGALI_SECRET), the COMPLETE list of the person's Rover Hangar rovers that
// are on folgali: { pessoa: "p_...", rovers: [{ uid, handle, name }] } (Rover Hangar contract 0.24.0, rovemark-platform
// server/hangar-folgali.mjs). The list replaces the previous one; the Account Center and "Meu rover" show it.
import type { NextRequest } from 'next/server'
import { setHangarRovers } from '@/lib/folgali/vault'
import { signedBody, reply } from '@/lib/folgali/central'
import { isPerson } from '@/lib/folgali/login'

export const dynamic = 'force-dynamic'

const MAX = 200

export async function POST(req: NextRequest) {
  const r = await signedBody(req)
  if (!r.ok) return r.res
  const { pessoa: person, rovers } = r.corpo
  if (!isPerson(person) || !Array.isArray(rovers) || rovers.length > MAX) return reply({ ok: false, error: 'corpo_invalido' }, 400)
  const seen = new Set<string>()
  const clean: { uid: string; handle: string; name: string }[] = []
  for (const x of rovers as unknown[]) {
    const o = (x ?? {}) as Record<string, unknown>
    if (typeof x !== 'object' || x === null || Object.keys(o).some((k) => !['uid', 'handle', 'name'].includes(k))) return reply({ ok: false, error: 'corpo_invalido' }, 400)
    const { uid, handle, name } = o
    if (typeof uid !== 'string' || !/^rvr_[A-Za-z0-9_-]{22}$/.test(uid) || seen.has(uid)) return reply({ ok: false, error: 'corpo_invalido' }, 400)
    if (typeof handle !== 'string' || !/^[a-z0-9._]{3,30}$/.test(handle)) return reply({ ok: false, error: 'corpo_invalido' }, 400)
    if (typeof name !== 'string' || name.length < 1 || name.length > 40 || /[\u0000-\u001f\u007f<>]/.test(name)) return reply({ ok: false, error: 'corpo_invalido' }, 400)
    seen.add(uid)
    clean.push({ uid, handle, name })
  }
  return reply({ ok: true, rovers: setHangarRovers(person, clean) })
}
