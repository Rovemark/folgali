// Account Center: the Rovemark account was deleted. Deletes everything that belongs to the person here: sessions and what they connected.
import type { NextRequest } from 'next/server'
import { deletePerson } from '@/lib/folgali/vault'
import { signedBody, reply } from '@/lib/folgali/central'
import { isPerson } from '@/lib/folgali/login'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const r = await signedBody(req)
  if (!r.ok) return r.res
  if (!isPerson(r.corpo.pessoa)) return reply({ ok: false, error: 'pessoa_invalida' }, 400)
  deletePerson(r.corpo.pessoa)
  return reply({ ok: true })
}
