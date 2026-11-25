// Começa o "Entrar com a Rovemark": gera verificador PKCE e estado, guarda os dois no cookie lacrado e manda para a Rovemark.
// `?tela=criar` abre a página já em "Criar conta"; `?destino=/pt/...` é para onde voltar depois de entrar.
import { NextResponse, type NextRequest } from 'next/server'
import { configLogin, desafioS256, destinoSeguro, novoEstado, novoVerificador, urlDeInicio } from '@/lib/folgali/login'
import { gravarNaResposta, lerDoPedido } from '@/lib/folgali/sessao'

export const dynamic = 'force-dynamic'

export function GET(req: NextRequest) {
  const c = configLogin()
  const lang = /^[a-z]{2}$/.test(req.nextUrl.searchParams.get('lang') ?? '') ? req.nextUrl.searchParams.get('lang')! : 'pt'
  if (!c) return NextResponse.redirect(new URL(`/${lang}/entrar`, req.url), 303)
  const verificador = novoVerificador()
  const estado = novoEstado()
  const destino = destinoSeguro(req.nextUrl.searchParams.get('destino'), lang)
  const res = NextResponse.redirect(urlDeInicio(c, desafioS256(verificador), estado, req.nextUrl.searchParams.get('tela') === 'criar'), 302)
  gravarNaResposta(res, { ...lerDoPedido(req, c), login: { verificador, estado, destino, em: Date.now() } }, c)
  res.headers.set('cache-control', 'no-store')
  return res
}
