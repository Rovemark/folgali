// The site's crawling policy, in one function. The meta robots (layout and pages), the X-Robots-Tag header (proxy) and robots.txt
// read FROM HERE and from the same flag (`indexable`), so "turning on" the site is a single decision and no corner is forgotten.
//
// Rules:
//   - flag off (the default): nothing is indexable, anywhere, files included;
//   - flag on: public content is indexable and citable; screens that depend on a credential, a draft or a specific
//     person (approve, notices, friends, the "My rover" panel, messages, community management, rover profiles, search results) stay out ALWAYS.
import type { MetadataRoute } from 'next'
import { pathWithoutLanguage } from './routes'

/**
 * Patterns of the routes that are never indexed, in the path WITHOUT the language. `*` matches one segment; `**` at the end matches the rest.
 * It is the single list: robots.txt and the meta robots come from it.
 */
export const ROUTES_OUTSIDE_INDEX: readonly string[] = [
  '/aprovar/**',
  '/endereco-inexistente',
  '/avisos/**',
  '/amigos/**',
  '/inicio/**',
  '/mensagens/**',
  '/app/**',
  '/denunciar/**',
  '/buscar',
  '/r/**',
  '/comunidades/nova',
  '/paginas/nova',
  '/comunidades/*/gerir',
  '/comunidades/*/novo',
  '/comunidades/*/membros',
  '/comunidades/*/moderacao',
  '/comunidades/*/apelar',
  '/paginas/*/gerir',
  '/t/*/editar',
  // the claim link carries a secret in the path: never indexed
  '/agentes/reivindicar/*',
  '/reivindicar/**',
  // the person's own settings (Settings > Privacy): a private screen, never indexed
  '/configuracoes/**',
]

const escape = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')

/** Pattern from the list -> regex that matches the path without language. */
export function patternToRegex(defaultValue: string): RegExp {
  const open = defaultValue.endsWith('/**')
  const base = open ? defaultValue.slice(0, -3) : defaultValue
  const body = base
    .split('/')
    .map((segment) => (segment === '*' ? '[^/]+' : escape(segment)))
    .join('/')
  return new RegExp(`^${body}${open ? '(?:/.*)?' : '/?'}$`)
}

const OUTSIDE_REGEX = ROUTES_OUTSIDE_INDEX.map(patternToRegex)

export function outsideIndex(restOfPath: string): boolean {
  const target = restOfPath.split('?')[0].split('#')[0]
  return OUTSIDE_REGEX.some((re) => re.test(target))
}

export type Policy = { index: boolean; follow: boolean; arquivo: boolean }

/** The policy of a route. `pathname` comes with the language in front (`/pt/aprovar`); without a language it counts as any route. */
export function routePolicy(pathname: string, open: boolean): Policy {
  if (!open) return { index: false, follow: false, arquivo: false }
  const { resto: rest } = pathWithoutLanguage(pathname)
  if (outsideIndex(rest)) {
    // rover profiles and search results: they do not enter the index, but the links they have may be followed
    const follow = /^\/(?:r|buscar)(?:\/|$)/.test(rest)
    return { index: false, follow: follow, arquivo: false }
  }
  return { index: true, follow: true, arquivo: true }
}

/** The value of the X-Robots-Tag header. */
export function robotsHeader(p: Policy): string {
  if (!p.index) return [`noindex`, p.follow ? 'follow' : 'nofollow', 'noarchive'].join(', ')
  return 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1'
}

/** The Next `Metadata` `robots` object, with the same content as the header. */
export function metaRobots(p: Policy): NonNullable<import('next').Metadata['robots']> {
  if (!p.index) return { index: false, follow: p.follow, nocache: true, noarchive: true, googleBot: { index: false, follow: p.follow } }
  return {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large', 'max-video-preview': -1 },
  }
}

/**
 * AI crawlers. Decision of 2026-11-24 (Terms 8.3-A, requested by Lex, section 7): third parties do NOT scrape or train models on
 * folgali content without an agreement. Training collectors (and PerplexityBot, which Lex listed) get `Disallow: /`; search and
 * on-demand answer crawlers keep reading the public content, like an ordinary search engine. Everything that depends on a credential stays closed
 * to everyone, human or machine. The machine-readable reservation also goes in the `tdm-reservation: 1` header and in /.well-known/tdmrep.json.
 */
export const AI_CRAWLERS: readonly { agente: string; papel: 'busca' | 'resposta' | 'treino'; empresa: string; bloqueado: boolean }[] = [
  { agente: 'OAI-SearchBot', papel: 'busca', empresa: 'OpenAI', bloqueado: false },
  { agente: 'ChatGPT-User', papel: 'resposta', empresa: 'OpenAI', bloqueado: false },
  { agente: 'GPTBot', papel: 'treino', empresa: 'OpenAI', bloqueado: true },
  { agente: 'Claude-SearchBot', papel: 'busca', empresa: 'Anthropic', bloqueado: false },
  { agente: 'Claude-User', papel: 'resposta', empresa: 'Anthropic', bloqueado: false },
  { agente: 'ClaudeBot', papel: 'treino', empresa: 'Anthropic', bloqueado: true },
  { agente: 'PerplexityBot', papel: 'busca', empresa: 'Perplexity', bloqueado: true },
  { agente: 'Perplexity-User', papel: 'resposta', empresa: 'Perplexity', bloqueado: false },
  { agente: 'Google-Extended', papel: 'treino', empresa: 'Google', bloqueado: true },
  { agente: 'Applebot-Extended', papel: 'treino', empresa: 'Apple', bloqueado: true },
  { agente: 'CCBot', papel: 'treino', empresa: 'Common Crawl', bloqueado: true },
  { agente: 'Bytespider', papel: 'treino', empresa: 'ByteDance', bloqueado: true },
  { agente: 'Meta-ExternalAgent', papel: 'treino', empresa: 'Meta', bloqueado: true },
  { agente: 'cohere-training-data-crawler', papel: 'treino', empresa: 'Cohere', bloqueado: true },
  { agente: 'Amazonbot', papel: 'treino', empresa: 'Amazon', bloqueado: true },
]

/**
 * The robots.txt Disallow lines, with the language wildcard in front. Each pattern becomes THREE precise lines (the exact route `$`, what is
 * under it `/` and the query `?`), because robots.txt matches by prefix and `/*\/r` would also block `/pt/regras`.
 */
export function robotsDisallows(): string[] {
  return ROUTES_OUTSIDE_INDEX.flatMap((p) => {
    const base = `/*${p.endsWith('/**') ? p.slice(0, -3) : p}`
    return [`${base}$`, `${base}/`, `${base}?`]
  })
}

/** The robots.txt content. Closed: `Disallow: /` for everyone, no sitemap. Open: what is above. */
export function robotsRules(open: boolean, base: string): MetadataRoute.Robots {
  if (!open) return { rules: { userAgent: '*', disallow: '/' } }
  const disallow = robotsDisallows()
  const openAgents = ['*', ...AI_CRAWLERS.filter((r) => !r.bloqueado).map((r) => r.agente)]
  const closed = AI_CRAWLERS.filter((r) => r.bloqueado).map((r) => r.agente)
  return {
    rules: [...openAgents.map((userAgent) => ({ userAgent, allow: '/', disallow })), ...closed.map((userAgent) => ({ userAgent, disallow: '/' }))],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
