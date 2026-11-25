// Sair: revoga a família na Rovemark, apaga a sessão do cofre e o cookie. POST (formulário), para link não derrubar ninguém.
import { NextResponse, type NextRequest } from 'next/server'
import { apagarSessao, fichasDa, lerSessao } from '@/lib/folgali/cofre'
import { configLogin, revogar } from '@/lib/folgali/login'
import { apagarNaResposta, lerDoPedido } from '@/lib/folgali/sessao'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const c = configLogin()
  const lang = /^[a-z]{2}$/.test(req.nextUrl.searchParams.get('lang') ?? '') ? req.nextUrl.searchParams.get('lang')! : 'pt'
  const res = NextResponse.redirect(new URL(`/${lang}`, req.url), 303)
  if (c) {
    const sid = lerDoPedido(req, c).sid
    const s = sid ? lerSessao(sid) : null
    const f = s ? fichasDa(s, c.segredo) : null
    if (f) await revogar(c, f.rt)
    if (sid) apagarSessao(sid)
  }
  apagarNaResposta(res)
  return res
}
