// Central de Contas: a conta Rovemark foi apagada. Apaga tudo o que é da pessoa aqui: sessões e o que ela ligou.
import type { NextRequest } from 'next/server'
import { apagarPessoa } from '@/lib/folgali/cofre'
import { corpoAssinado, resposta } from '@/lib/folgali/central'
import { ehPessoa } from '@/lib/folgali/login'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const r = await corpoAssinado(req)
  if (!r.ok) return r.res
  if (!ehPessoa(r.corpo.pessoa)) return resposta({ ok: false, error: 'pessoa_invalida' }, 400)
  apagarPessoa(r.corpo.pessoa)
  return resposta({ ok: true })
}
