import 'server-only'
// As rotas que a Central de Contas da Rovemark chama (servidor a servidor), todas assinadas com x-rvm-assinatura.
import { NextResponse, type NextRequest } from 'next/server'
import { assinaturaValida, segredoDaCentral } from './login'

const resposta = (corpo: unknown, status = 200) => NextResponse.json(corpo, { status, headers: { 'cache-control': 'no-store' } })

/** Lê o corpo cru, confere a assinatura e devolve o JSON; ou a resposta de erro pronta (503 sem segredo, 401 assinatura, 400 corpo). */
export async function corpoAssinado(req: NextRequest): Promise<{ ok: true; corpo: Record<string, unknown> } | { ok: false; res: NextResponse }> {
  const segredo = segredoDaCentral()
  if (!segredo) return { ok: false, res: resposta({ ok: false, error: 'indisponivel' }, 503) }
  const cru = await req.text()
  if (cru.length > 16_384) return { ok: false, res: resposta({ ok: false, error: 'grande_demais' }, 413) }
  if (!assinaturaValida(req.headers.get('x-rvm-assinatura'), cru, segredo)) return { ok: false, res: resposta({ ok: false, error: 'assinatura_invalida' }, 401) }
  try {
    const corpo = JSON.parse(cru) as unknown
    if (typeof corpo !== 'object' || corpo === null || Array.isArray(corpo)) throw new Error('corpo')
    return { ok: true, corpo: corpo as Record<string, unknown> }
  } catch {
    return { ok: false, res: resposta({ ok: false, error: 'corpo_invalido' }, 400) }
  }
}

export { resposta }
