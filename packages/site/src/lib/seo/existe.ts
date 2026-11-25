import { conteudoDe } from '@/conteudo'
import { ehPronto } from '@/lib/i18n'

/**
 * `true` quando o endereço é de um verbete ou de um guia que NÃO existe no idioma. As telas do app passam por um esqueleto de
 * carregamento que já manda o status 200 antes de a página descobrir que não há nada ali (soft 404); o proxy usa isto para
 * responder 404 de verdade, antes de a transmissão começar.
 */
export function conteudoInexistente(pathname: string): boolean {
  const m = /^\/([^/]+)\/(glossario|guias)\/([^/]+)\/?$/.exec(pathname)
  if (!m || !ehPronto(m[1])) return false
  const c = conteudoDe(m[1])
  const lista = m[2] === 'glossario' ? c.verbetes : c.guias
  let slug = m[3]
  try {
    slug = decodeURIComponent(slug)
  } catch {
    return true
  }
  return !lista.some((x) => x.slug === slug)
}
