// Dados estruturados (schema.org em JSON-LD), tipados e sem efeito colateral. Cada construtor devolve um objeto puro; o teste valida a
// forma de cada um contra um JSON Schema (test/seo/schemas.ts) e a serialização contra injeção em <script>.
//
// Regras do que se afirma: só entra aqui o que o site pode provar. Nada de preço, de nota, de número de usuários, de sistema operacional
// que ainda não existe. A entidade é sempre a mesma (nome, empresa, sameAs), em todas as páginas, para as máquinas não duvidarem dela.
import type { Faq, Guia, Verbete } from '@/conteudo/tipos'
import { ENTIDADE } from '@/lib/site'

export type JsonLd = Record<string, unknown>
const CONTEXTO = 'https://schema.org'

const idOrg = (base: string) => `${base}/#organizacao`
const idSite = (base: string) => `${base}/#site`
const idEmpresa = () => `${ENTIDADE.urlEmpresa}/#organizacao`

/** A folgali como organização, filha da Rovemark. O mesmo bloco serve de referência (`@id`) para o resto. */
export function organizacao(base: string, descricao: string): JsonLd {
  return {
    '@type': 'Organization',
    '@id': idOrg(base),
    name: ENTIDADE.nome,
    url: base,
    description: descricao,
    logo: `${base}/marca/icone.svg`,
    parentOrganization: { '@type': 'Organization', '@id': idEmpresa(), name: ENTIDADE.empresa, url: ENTIDADE.urlEmpresa },
    sameAs: [ENTIDADE.urlEmpresa, ENTIDADE.urlProdutoIrmao],
  }
}

/** O site, com a busca. A busca existe de verdade em `/buscar?q=`. */
export function website(base: string, lang: string, nome: string, descricao: string): JsonLd {
  return {
    '@type': 'WebSite',
    '@id': idSite(base),
    url: `${base}/${lang}`,
    name: nome,
    description: descricao,
    inLanguage: lang,
    publisher: { '@id': idOrg(base) },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${base}/${lang}/buscar?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  }
}

export type Migalha = { nome: string; url: string }

export function migalhas(itens: readonly Migalha[]): JsonLd {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: itens.map((m, i) => ({ '@type': 'ListItem', position: i + 1, name: m.nome, item: m.url })),
  }
}

/** A página como `WebPage` (ou um subtipo), ligada ao site e à organização. */
export function pagina(base: string, o: { tipo?: 'WebPage' | 'AboutPage' | 'ContactPage' | 'CollectionPage'; url: string; titulo: string; descricao: string; lang: string; atualizadoEm?: string }): JsonLd {
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

/** FAQPage. A resposta que vai ao dado estruturado é a MESMA que está na página: o Google exige que o texto esteja visível. */
export function faq(itens: readonly Pick<Faq, 'pergunta' | 'respostaCurta' | 'resposta'>[]): JsonLd {
  return {
    '@type': 'FAQPage',
    mainEntity: itens.map((f) => ({
      '@type': 'Question',
      name: f.pergunta,
      acceptedAnswer: { '@type': 'Answer', text: `${f.respostaCurta} ${f.resposta}`.trim() },
    })),
  }
}

export function termoDefinido(base: string, lang: string, v: Verbete, idConjunto: string): JsonLd {
  return {
    '@type': 'DefinedTerm',
    '@id': `${base}/${lang}/glossario/${v.slug}#termo`,
    name: v.termo,
    description: v.definicaoCurta,
    url: `${base}/${lang}/glossario/${v.slug}`,
    inDefinedTermSet: { '@id': idConjunto },
  }
}

export function conjuntoDeTermos(base: string, lang: string, nome: string, descricao: string, verbetes: readonly Verbete[]): JsonLd {
  const id = `${base}/${lang}/glossario#conjunto`
  return {
    '@type': 'DefinedTermSet',
    '@id': id,
    name: nome,
    description: descricao,
    url: `${base}/${lang}/glossario`,
    inLanguage: lang,
    hasDefinedTerm: verbetes.map((v) => termoDefinido(base, lang, v, id)),
  }
}

export function artigoTecnico(base: string, lang: string, g: Pick<Guia, 'slug' | 'titulo' | 'descricao' | 'atualizadoEm'>): JsonLd {
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

/** O Rover Hangar, o app que a pessoa usa para ter o rover. Só os sistemas em que ele existe hoje. */
export function aplicativo(base: string): JsonLd {
  return {
    '@type': 'SoftwareApplication',
    '@id': `${ENTIDADE.urlProdutoIrmao}/#aplicativo`,
    name: ENTIDADE.produtoIrmao,
    url: ENTIDADE.urlProdutoIrmao,
    applicationCategory: 'ProductivityApplication',
    operatingSystem: 'macOS, Windows, Linux',
    publisher: { '@id': idEmpresa() },
    isRelatedTo: { '@id': idOrg(base) },
  }
}

export type TopicoPublico = { url: string; titulo: string; texto: string; autor: string; criadoEm: string; respostas: number; lang: string }

/** Tópico de comunidade aberta. Só o site indexável chama isto: a página decide, não este construtor. */
export function postagemDeForum(t: TopicoPublico): JsonLd {
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

/** Junta vários blocos num grafo só, tirando o `@context` de cada um. */
export function grafo(...blocos: JsonLd[]): JsonLd {
  return { '@context': CONTEXTO, '@graph': blocos.map((b) => Object.fromEntries(Object.entries(b).filter(([k]) => k !== '@context'))) }
}

/**
 * Serializa para dentro de um <script type="application/ld+json">. Texto de gente (título de tópico, nome de comunidade) pode conter
 * `</script>`, então os caracteres que fecham a tag ou quebram a linha saem como escape unicode.
 */
export function serializar(json: JsonLd): string {
  return JSON.stringify(json)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
