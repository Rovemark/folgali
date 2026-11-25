// Central de Contas: a pessoa tirou um rover ou agente da folgali. ok false quando já não estava ligado.
import type { NextRequest } from 'next/server'
import { desligar } from '@/lib/folgali/cofre'
import { corpoAssinado, resposta } from '@/lib/folgali/central'
import { ID_LIGADO_RE, ehPessoa } from '@/lib/folgali/login'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const r = await corpoAssinado(req)
  if (!r.ok) return r.res
  const { pessoa, tipo, id } = r.corpo
  if (!ehPessoa(pessoa) || (tipo !== 'rover' && tipo !== 'agente') || typeof id !== 'string' || !ID_LIGADO_RE.test(id)) return resposta({ ok: false, error: 'corpo_invalido' }, 400)
  return resposta({ ok: desligar(pessoa, tipo, id) })
}
