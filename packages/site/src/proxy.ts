import { NextResponse, type NextRequest } from 'next/server'
import { ehLocale, ehPronto, escolherIdioma } from '@/lib/i18n'
import { conteudoInexistente } from '@/lib/seo/existe'
import { cabecalhoRobots, politicaDaRota } from '@/lib/seo/politica'
import { indexavel } from '@/lib/site'

// Todo endereço de página leva o idioma na frente. Sem idioma, escolhe pelo navegador. Idioma ainda sem texto (pendente) cai no inglês.
// O cabeçalho X-Robots-Tag sai AQUI, da mesma política do meta robots e do robots.txt (src/lib/seo/politica.ts): fechado por padrão,
// aberto só com ROVER_NETWORK_INDEXAVEL=sim e mesmo assim fechado nas telas que dependem de credencial.

/** Endereços que não levam idioma: a API (login pela Rovemark e as chamadas da Central de Contas), arquivos para máquinas, imagens e a verificação de saúde. */
const SEM_IDIOMA = /^\/(?:api\/|entrar(?:\.en)?\.md$|og\/|marca\/|saude$|sitemap\.xml$|robots\.txt$|llms(?:-full)?\.txt$|skill(?:\.en)?\.md$|manifest\.webmanifest$|favicon|icone|.*\.(?:svg|png|jpg|webp|ico|woff2)$)/

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const primeiro = pathname.split('/')[1] ?? ''
  let res: NextResponse
  if (SEM_IDIOMA.test(pathname)) {
    res = NextResponse.next()
  } else if (ehPronto(primeiro) && conteudoInexistente(pathname)) {
    // Verbete ou guia que não existe: cai na rota de 404 de verdade (status 404, noindex), com o endereço do pedido intacto no navegador.
    const url = req.nextUrl.clone()
    url.pathname = `/${primeiro}/__nao-encontrado`
    res = NextResponse.rewrite(url, { status: 404 })
    res.headers.set('X-Robots-Tag', 'noindex, nofollow')
    return res
  } else if (ehPronto(primeiro)) {
    const cab = new Headers(req.headers)
    cab.set('x-pathname', pathname)
    res = NextResponse.next({ request: { headers: cab } })
  } else {
    const url = req.nextUrl.clone()
    if (ehLocale(primeiro)) url.pathname = `/en${pathname.slice(primeiro.length + 1)}`
    else url.pathname = `/${escolherIdioma(req.headers.get('accept-language'))}${pathname === '/' ? '' : pathname}`
    res = NextResponse.redirect(url, 307)
  }
  res.headers.set('X-Robots-Tag', cabecalhoRobots(politicaDaRota(pathname, indexavel())))
  return res
}

export const config = {
  matcher: ['/((?!_next/).*)'],
}
