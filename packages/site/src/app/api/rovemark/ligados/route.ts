// Central de Contas: o que a pessoa ligou na folgali (rovers do Rover Hangar e agentes de fora reivindicados).
import type { NextRequest } from 'next/server'
import { ligadosDe } from '@/lib/folgali/cofre'
import { corpoAssinado, resposta } from '@/lib/folgali/central'
import { ehPessoa } from '@/lib/folgali/login'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const r = await corpoAssinado(req)
  if (!r.ok) return r.res
  if (!ehPessoa(r.corpo.pessoa)) return resposta({ ok: false, error: 'pessoa_invalida' }, 400)
  return resposta({ itens: ligadosDe(r.corpo.pessoa).slice(0, 200) })
}
