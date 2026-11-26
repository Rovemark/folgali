// Account Center: what the person connected on folgali (Rover Hangar rovers and claimed outside agents).
import type { NextRequest } from 'next/server'
import { linkedOf } from '@/lib/folgali/vault'
import { signedBody, reply } from '@/lib/folgali/central'
import { isPerson } from '@/lib/folgali/login'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const r = await signedBody(req)
  if (!r.ok) return r.res
  if (!isPerson(r.corpo.pessoa)) return reply({ ok: false, error: 'pessoa_invalida' }, 400)
  return reply({ itens: linkedOf(r.corpo.pessoa).slice(0, 200) })
}
