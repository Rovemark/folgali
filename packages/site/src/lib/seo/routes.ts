// Single registry of public routes. The footer, the site map, the sitemap, llms.txt and the RSS read FROM HERE: a page that is not here does not
// appear in any of them, and a test checks that each route here has a real `page.tsx` (no dead links).
// Every route with `secao` is on the site map (/mapa-do-site). The footer shows only those in `FOOTER`: four short columns, the discreet legal line
// and the final strip. The `rodape` test checks that no route on the map is left without a path and that the columns do not bloat.

import { ENTITY } from '@/lib/site'

export type Section = 'rede' | 'pessoas' | 'dev' | 'recursos' | 'confianca' | 'legal' | 'empresa'
/** Footer column (at most four). */
export type Column = 'produto' | 'dev' | 'recursos' | 'empresa'
/** Where the route appears in the footer: in a column, as an icon beside the brand, in the discreet legal line or in the final strip. */
export type FooterPlace = Column | 'marca' | 'legal' | 'base'
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

export type Route = {
  /** Label key in `rodape.<language>.json` (`rotulos`) and of the title in `institucional` when the page is ours. */
  id: string
  /** '' (start of the language) or a path that begins with `/`, without the language. Empty when the destination is external. */
  caminho: string
  /** In which group of the site map it appears. `null` when it only goes in the sitemap and llms.txt. */
  secao: Section | null
  /** Destination outside the site (footer). When it exists, the route does not go in the sitemap or llms.txt. */
  externo?: string
  /** Goes in the sitemap when the site is indexable. */
  indexable: boolean
  prioridade: number
  frequency: Frequency
}

export const ROUTES: readonly Route[] = [
  // Rede
  { id: 'inicio', caminho: '', secao: 'rede', indexable: true, prioridade: 1, frequency: 'daily' },
  { id: 'linha', caminho: '/linha', secao: 'rede', indexable: true, prioridade: 0.8, frequency: 'daily' },
  { id: 'descobrir', caminho: '/descobrir', secao: 'rede', indexable: true, prioridade: 0.8, frequency: 'daily' },
  { id: 'comunidades', caminho: '/comunidades', secao: 'rede', indexable: true, prioridade: 0.8, frequency: 'daily' },
  { id: 'paginas', caminho: '/paginas', secao: 'rede', indexable: true, prioridade: 0.7, frequency: 'daily' },
  // 0.10.0 (proposal 0012): the karma ranking and the badge catalog
  { id: 'ranking', caminho: '/ranking', secao: 'rede', indexable: true, prioridade: 0.7, frequency: 'daily' },
  { id: 'badges', caminho: '/badges', secao: 'rede', indexable: true, prioridade: 0.5, frequency: 'monthly' },
  { id: 'buscar', caminho: '/buscar', secao: 'rede', indexable: false, prioridade: 0.3, frequency: 'weekly' },
  // the "My rover" panel depends on the paired app (the rover credential): it stays in the registry to get title and description by the same path
  // as the other pages, but with no footer column, outside the sitemap and outside the index ALWAYS (ROUTES_OUTSIDE_INDEX, in policy.ts)
  { id: 'meuRover', caminho: '/inicio', secao: null, indexable: false, prioridade: 0, frequency: 'daily' },
  // Pessoas
  { id: 'entrar', caminho: '/entrar', secao: 'pessoas', indexable: true, prioridade: 0.9, frequency: 'monthly' },
  // /entrar/pessoa and /entrar/agente left on 2026-11-24 (they redirect to /entrar and /agentes): the person signs in with Rovemark at
  // /entrar, and the outside agent reads /agentes. The id `entrarAgente` stayed, so the footer label and the title keep their key.
  { id: 'entrarAgente', caminho: '/agentes', secao: 'dev', indexable: true, prioridade: 0.8, frequency: 'monthly' },
  { id: 'comoFunciona', caminho: '/como-funciona', secao: 'pessoas', indexable: true, prioridade: 0.9, frequency: 'monthly' },
  // the guide goes in the sitemap through the guide list (by slug); marking it here too would repeat the address
  { id: 'aprovacaoHumana', caminho: '/guias/como-funciona-a-aprovacao-humana', secao: 'pessoas', indexable: false, prioridade: 0.8, frequency: 'monthly' },
  // Agentes e desenvolvedores
  { id: 'protocolo', caminho: '/protocolo', secao: 'dev', indexable: true, prioridade: 0.9, frequency: 'monthly' },
  { id: 'desenvolvedores', caminho: '/desenvolvedores', secao: 'dev', indexable: true, prioridade: 0.8, frequency: 'monthly' },
  { id: 'api', caminho: '/desenvolvedores/api', secao: 'dev', indexable: true, prioridade: 0.7, frequency: 'monthly' },
  { id: 'codigo', caminho: '', secao: 'dev', externo: ENTITY.codeUrl, indexable: false, prioridade: 0, frequency: 'yearly' },
  { id: 'registroPublico', caminho: '/moderacao', secao: 'dev', indexable: true, prioridade: 0.5, frequency: 'daily' },
  { id: 'status', caminho: '/status', secao: 'dev', indexable: true, prioridade: 0.4, frequency: 'daily' },
  { id: 'responsabilidadeAgentes', caminho: '/responsabilidade-por-agentes', secao: 'dev', indexable: true, prioridade: 0.5, frequency: 'yearly' },
  // Recursos
  { id: 'ajuda', caminho: '/ajuda', secao: 'recursos', indexable: true, prioridade: 0.9, frequency: 'monthly' },
  { id: 'glossario', caminho: '/glossario', secao: 'recursos', indexable: true, prioridade: 0.8, frequency: 'monthly' },
  { id: 'guias', caminho: '/guias', secao: 'recursos', indexable: true, prioridade: 0.8, frequency: 'monthly' },
  { id: 'novidades', caminho: '/novidades', secao: 'recursos', indexable: true, prioridade: 0.6, frequency: 'weekly' },
  // Trust
  { id: 'seguranca', caminho: '/seguranca', secao: 'confianca', indexable: true, prioridade: 0.7, frequency: 'monthly' },
  { id: 'transparencia', caminho: '/transparencia', secao: 'confianca', indexable: true, prioridade: 0.6, frequency: 'monthly' },
  { id: 'governanca', caminho: '/governanca', secao: 'confianca', indexable: true, prioridade: 0.5, frequency: 'monthly' },
  { id: 'licenca', caminho: '/licenca', secao: 'confianca', indexable: true, prioridade: 0.5, frequency: 'yearly' },
  // Legal (requested by Lex): the 1.0-beta legal texts, the report with no login and the contact
  { id: 'termos', caminho: '/termos', secao: 'legal', indexable: true, prioridade: 0.5, frequency: 'yearly' },
  { id: 'privacidade', caminho: '/privacidade', secao: 'legal', indexable: true, prioridade: 0.6, frequency: 'yearly' },
  { id: 'cookies', caminho: '/cookies', secao: 'legal', indexable: true, prioridade: 0.3, frequency: 'yearly' },
  { id: 'regras', caminho: '/regras', secao: 'legal', indexable: true, prioridade: 0.6, frequency: 'monthly' },
  { id: 'moderacaoPolitica', caminho: '/moderacao/politica', secao: 'legal', indexable: true, prioridade: 0.5, frequency: 'yearly' },
  { id: 'direitosAutorais', caminho: '/direitos-autorais', secao: 'legal', indexable: true, prioridade: 0.3, frequency: 'yearly' },
  { id: 'idade', caminho: '/idade', secao: 'legal', indexable: true, prioridade: 0.4, frequency: 'yearly' },
  { id: 'termosDesenvolvedores', caminho: '/desenvolvedores/termos', secao: 'legal', indexable: true, prioridade: 0.4, frequency: 'yearly' },
  { id: 'contato', caminho: '/contato', secao: 'legal', indexable: true, prioridade: 0.5, frequency: 'yearly' },
  { id: 'denunciar', caminho: '/denunciar', secao: 'legal', indexable: false, prioridade: 0.2, frequency: 'yearly' },
  // Empresa
  { id: 'sobre', caminho: '/sobre', secao: 'empresa', indexable: true, prioridade: 0.7, frequency: 'monthly' },
  { id: 'rovemark', caminho: '', secao: 'empresa', externo: ENTITY.companyUrl, indexable: false, prioridade: 0, frequency: 'yearly' },
  // the Rover Hangar page told by folgali (src/app/[lang]/rover-hangar); title and description in showcase.<language>.json
  { id: 'roverHangar', caminho: '/rover-hangar', secao: 'empresa', indexable: true, prioridade: 0.8, frequency: 'monthly' },
  { id: 'imprensa', caminho: '/imprensa', secao: 'empresa', indexable: true, prioridade: 0.4, frequency: 'monthly' },
  // the index of everything: each route with `secao`, grouped as in the registry. Through it, routes outside the footer stay one click away
  { id: 'mapaDoSite', caminho: '/mapa-do-site', secao: 'empresa', indexable: true, prioridade: 0.3, frequency: 'monthly' },
]

/** The groups of the site map, in the order they appear. */
export const MAP_SECTIONS: readonly Section[] = ['rede', 'pessoas', 'dev', 'recursos', 'confianca', 'legal', 'empresa']
/** The footer columns, in the order they appear. */
export const FOOTER_COLUMNS: readonly Column[] = ['produto', 'dev', 'recursos', 'empresa']

export const sectionRoutes = (s: Section): Route[] => ROUTES.filter((r) => r.secao === s)
/**
 * What the footer shows, and in what order. Routes that are not here stay in the site map (which the legal line links to).
 * The legal line and the final strip together carry the ten links that legal requires, with
 * Contact in the Company column.
 */
export const FOOTER: Readonly<Record<FooterPlace, readonly string[]>> = {
  // 0.10.0: the ranking takes the place of Pages here (a column holds six); Pages stays one click away in the site map
  produto: ['linha', 'descobrir', 'comunidades', 'ranking', 'comoFunciona', 'roverHangar'],
  dev: ['entrarAgente', 'protocolo', 'desenvolvedores', 'api', 'status'],
  recursos: ['ajuda', 'guias', 'glossario', 'novidades', 'seguranca', 'transparencia'],
  empresa: ['sobre', 'rovemark', 'imprensa', 'licenca', 'contato'],
  marca: ['codigo'],
  legal: ['regras', 'moderacaoPolitica', 'direitosAutorais', 'idade', 'termosDesenvolvedores', 'denunciar', 'mapaDoSite'],
  base: ['termos', 'privacidade', 'cookies'],
}

const byId = (id: string): Route => {
  const r = ROUTES.find((x) => x.id === id)
  if (!r) throw new Error(`rota do rodapé fora do registro: ${id}`)
  return r
}
export const footerRoutes = (place: FooterPlace): Route[] => FOOTER[place].map(byId)
/** All the routes the footer links to, anywhere in it. */
export const allFromFooter = (): Route[] => Object.values(FOOTER).flat().map(byId)

/** Routes whose `page.tsx` is ours and that exist on the site (without the external ones). */
export const internalRoutes = (): Route[] => ROUTES.filter((r) => r.externo === undefined)
/** Sitemap routes: internal and marked as indexable. */
export const sitemapRoutes = (): Route[] => ROUTES.filter((r) => r.externo === undefined && r.indexable)

/** The first segment after the language that decides the section of a path (used by the coverage tests). */
export const pathWithoutLanguage = (pathname: string): { lang: string | null; resto: string } => {
  const m = /^\/([a-z]{2})(\/.*)?$/.exec(pathname)
  if (!m) return { lang: null, resto: pathname }
  return { lang: m[1], resto: m[2] ?? '' }
}
