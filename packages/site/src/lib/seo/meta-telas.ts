// Metadados das telas que não têm texto institucional próprio: as telas do app (aprovar, avisos, amigos, gestão) e as páginas
// dinâmicas (comunidade, página, tópico, rover). A política decide se entram no índice: as do app NUNCA entram (politica.ts).
import type { Metadata } from 'next'
import { ehPronto, type Pronto } from '@/lib/i18n'
import { instDict } from '@/lib/i18n-extra'
import { metaDaPagina } from './metadata'

const idioma = (lang: string): Pronto => (ehPronto(lang) ? lang : 'pt')

/**
 * `titulo` é o que a tela já usava. `descricao` é um texto próprio da página quando existe (a descrição de uma comunidade); sem ele, a
 * descrição é o título seguido da frase da entidade, o que mantém cada página com uma descrição diferente.
 */
export function metaTela(lang: string, caminho: string, titulo: string, descricao?: string): Metadata {
  const l = idioma(lang)
  const propria = descricao?.replace(/\s+/g, ' ').trim()
  return metaDaPagina({ lang: l, caminho, titulo, descricao: propria ? propria : `${titulo}. ${instDict(l).entidade.descricaoCurta}` })
}
