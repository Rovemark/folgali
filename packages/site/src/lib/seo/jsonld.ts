// Structured data (schema.org in JSON-LD), typed and with no side effects. Each builder returns a pure object; the test validates the
// shape of each against a JSON Schema (test/seo/schemas.ts) and the serialization against injection in <script>.
//
// Rules for what is claimed: only what the site can prove goes in here. No price, rating, user count, or operating system
// that does not exist yet. The entity is always the same (name, company, sameAs), on every page, so machines do not doubt it.
import type { Faq, Guide, GlossaryEntry } from '@/content/types'
import { ENTITY } from '@/lib/site'

export type JsonLd = Record<string, unknown>
const CONTEXT = 'https://schema.org'

const idOrg = (base: string) => `${base}/#organizacao`
const idSite = (base: string) => `${base}/#site`
const companyId = () => `${ENTITY.companyUrl}/#organizacao`

/** folgali as an organization, a child of Rovemark. The same block serves as a reference (`@id`) for the rest. */
export function organization(base: string, description: string): JsonLd {
  return {
    '@type': 'Organization',
    '@id': idOrg(base),
    name: ENTITY.nome,
    url: base,
    description: description,
    logo: `${base}/marca/icone.svg`,
    parentOrganization: { '@type': 'Organization', '@id': companyId(), name: ENTITY.empresa, url: ENTITY.companyUrl },
    sameAs: [ENTITY.companyUrl, ENTITY.siblingProductUrl],
  }
}

/** The site, with search. Search really exists at `/buscar?q=`. */
export function website(base: string, lang: string, name: string, description: string): JsonLd {
  return {
    '@type': 'WebSite',
    '@id': idSite(base),
    url: `${base}/${lang}`,
    name: name,
    description: description,
    inLanguage: lang,
    publisher: { '@id': idOrg(base) },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${base}/${lang}/buscar?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  }
}

export type Breadcrumb = { nome: string; url: string }

export function breadcrumbs(items: readonly Breadcrumb[]): JsonLd {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((m, i) => ({ '@type': 'ListItem', position: i + 1, name: m.nome, item: m.url })),
  }
}

/** The page as `WebPage` (or a subtype), linked to the site and to the organization. */
export function page(base: string, o: { tipo?: 'WebPage' | 'AboutPage' | 'ContactPage' | 'CollectionPage'; url: string; titulo: string; descricao: string; lang: string; atualizadoEm?: string }): JsonLd {
  return {
    '@type': o.tipo ?? 'WebPage',
    '@id': `${o.url}#pagina`,
    url: o.url,
    name: o.titulo,
    description: o.descricao,
    inLanguage: o.lang,
    isPartOf: { '@id': idSite(base) },
    publisher: { '@id': idOrg(base) },
    ...(o.atualizadoEm ? { dateModified: o.atualizadoEm } : {}),
  }
}

/** FAQPage. The answer that goes into the structured data is the SAME one on the page: Google requires the text to be visible. */
export function faq(items: readonly Pick<Faq, 'pergunta' | 'respostaCurta' | 'resposta'>[]): JsonLd {
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.pergunta,
      acceptedAnswer: { '@type': 'Answer', text: `${f.respostaCurta} ${f.resposta}`.trim() },
    })),
  }
}

export function definedTerm(base: string, lang: string, v: GlossaryEntry, setId: string): JsonLd {
  return {
    '@type': 'DefinedTerm',
    '@id': `${base}/${lang}/glossario/${v.slug}#termo`,
    name: v.termo,
    description: v.definicaoCurta,
    url: `${base}/${lang}/glossario/${v.slug}`,
    inDefinedTermSet: { '@id': setId },
  }
}

export function termSet(base: string, lang: string, name: string, description: string, glossaryEntries: readonly GlossaryEntry[]): JsonLd {
  const id = `${base}/${lang}/glossario#conjunto`
  return {
    '@type': 'DefinedTermSet',
    '@id': id,
    name: name,
    description: description,
    url: `${base}/${lang}/glossario`,
    inLanguage: lang,
    hasDefinedTerm: glossaryEntries.map((v) => definedTerm(base, lang, v, id)),
  }
}

export function technicalArticle(base: string, lang: string, g: Pick<Guide, 'slug' | 'titulo' | 'descricao' | 'atualizadoEm'>): JsonLd {
  const url = `${base}/${lang}/guias/${g.slug}`
  return {
    '@type': 'TechArticle',
    '@id': `${url}#artigo`,
    headline: g.titulo,
    description: g.descricao,
    inLanguage: lang,
    dateModified: g.atualizadoEm,
    mainEntityOfPage: url,
    author: { '@id': idOrg(base) },
    publisher: { '@id': idOrg(base) },
  }
}

/** Rover Hangar, the app the person uses to have the rover. Only the systems where it exists today. */
export function application(base: string): JsonLd {
  return {
    '@type': 'SoftwareApplication',
    '@id': `${ENTITY.siblingProductUrl}/#aplicativo`,
    name: ENTITY.siblingProduct,
    url: ENTITY.siblingProductUrl,
    applicationCategory: 'ProductivityApplication',
    operatingSystem: 'macOS, Windows, Linux',
    publisher: { '@id': companyId() },
    isRelatedTo: { '@id': idOrg(base) },
  }
}

export type PublicTopic = { url: string; titulo: string; texto: string; autor: string; criadoEm: string; respostas: number; lang: string }

/** Open community topic. Only the indexable site calls this: the page decides, not this builder. */
export function forumPost(t: PublicTopic): JsonLd {
  return {
    '@type': 'DiscussionForumPosting',
    '@id': `${t.url}#topico`,
    url: t.url,
    headline: t.titulo,
    text: t.texto,
    inLanguage: t.lang,
    datePublished: t.criadoEm,
    author: { '@type': 'Person', name: t.autor },
    interactionStatistic: { '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: t.respostas },
  }
}

/** Joins several blocks into a single graph, removing the `@context` of each. */
export function graph(...blocks: JsonLd[]): JsonLd {
  return { '@context': CONTEXT, '@graph': blocks.map((b) => Object.fromEntries(Object.entries(b).filter(([k]) => k !== '@context'))) }
}

/**
 * Serializes into a <script type="application/ld+json">. Text from people (topic title, community name) may contain
 * `</script>`, so the characters that close the tag or break the line come out as unicode escapes.
 */
export function serialize(json: JsonLd): string {
  return JSON.stringify(json)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
