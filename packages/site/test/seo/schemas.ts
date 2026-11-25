// JSON Schemas dos tipos de schema.org que o site emite. Cada um exige o que o Google pede como obrigatório para o tipo (e o que o
// site se compromete a sempre entregar); `additionalProperties` fica aberto porque schema.org aceita propriedade a mais.
const url = { type: 'string', format: 'uri' }
const texto = { type: 'string', minLength: 1 }
const ref = { type: 'object', required: ['@id'], properties: { '@id': url } }

export const SCHEMAS: Record<string, object> = {
  Organization: {
    type: 'object',
    required: ['@type', '@id', 'name', 'url', 'description', 'logo', 'parentOrganization', 'sameAs'],
    properties: {
      '@type': { const: 'Organization' }, '@id': url, name: texto, url, description: texto, logo: url,
      parentOrganization: { type: 'object', required: ['@type', 'name', 'url'], properties: { '@type': { const: 'Organization' }, name: texto, url } },
      sameAs: { type: 'array', minItems: 1, items: url },
    },
  },
  WebSite: {
    type: 'object',
    required: ['@type', '@id', 'url', 'name', 'inLanguage', 'potentialAction'],
    properties: {
      '@type': { const: 'WebSite' }, '@id': url, url, name: texto, inLanguage: texto,
      potentialAction: {
        type: 'object', required: ['@type', 'target', 'query-input'],
        properties: { '@type': { const: 'SearchAction' }, target: { type: 'object', required: ['@type', 'urlTemplate'], properties: { '@type': { const: 'EntryPoint' }, urlTemplate: { type: 'string', pattern: '\\{search_term_string\\}' } } }, 'query-input': { type: 'string', pattern: 'search_term_string' } },
      },
    },
  },
  BreadcrumbList: {
    type: 'object',
    required: ['@type', 'itemListElement'],
    properties: {
      '@type': { const: 'BreadcrumbList' },
      itemListElement: { type: 'array', minItems: 1, items: { type: 'object', required: ['@type', 'position', 'name', 'item'], properties: { '@type': { const: 'ListItem' }, position: { type: 'integer', minimum: 1 }, name: texto, item: url } } },
    },
  },
  WebPage: { type: 'object', required: ['@type', '@id', 'url', 'name', 'description', 'inLanguage', 'isPartOf'], properties: { '@type': { enum: ['WebPage', 'AboutPage', 'ContactPage', 'CollectionPage'] }, '@id': { type: 'string' }, url, name: texto, description: texto, inLanguage: texto, isPartOf: ref, dateModified: { type: 'string', format: 'date' } } },
  FAQPage: {
    type: 'object',
    required: ['@type', 'mainEntity'],
    properties: {
      '@type': { const: 'FAQPage' },
      mainEntity: { type: 'array', minItems: 1, items: { type: 'object', required: ['@type', 'name', 'acceptedAnswer'], properties: { '@type': { const: 'Question' }, name: texto, acceptedAnswer: { type: 'object', required: ['@type', 'text'], properties: { '@type': { const: 'Answer' }, text: texto } } } } },
    },
  },
  DefinedTerm: { type: 'object', required: ['@type', '@id', 'name', 'description', 'url', 'inDefinedTermSet'], properties: { '@type': { const: 'DefinedTerm' }, '@id': { type: 'string' }, name: texto, description: texto, url, inDefinedTermSet: ref } },
  DefinedTermSet: { type: 'object', required: ['@type', '@id', 'name', 'url', 'hasDefinedTerm'], properties: { '@type': { const: 'DefinedTermSet' }, '@id': { type: 'string' }, name: texto, url, hasDefinedTerm: { type: 'array', items: { type: 'object', required: ['@type', 'name'], properties: { '@type': { const: 'DefinedTerm' }, name: texto } } } } },
  TechArticle: { type: 'object', required: ['@type', 'headline', 'description', 'inLanguage', 'dateModified', 'mainEntityOfPage', 'author', 'publisher'], properties: { '@type': { const: 'TechArticle' }, headline: { type: 'string', minLength: 1, maxLength: 110 }, description: texto, inLanguage: texto, dateModified: { type: 'string', format: 'date' }, mainEntityOfPage: url, author: ref, publisher: ref } },
  SoftwareApplication: { type: 'object', required: ['@type', 'name', 'url', 'applicationCategory', 'operatingSystem', 'publisher'], properties: { '@type': { const: 'SoftwareApplication' }, name: texto, url, applicationCategory: texto, operatingSystem: texto, publisher: ref } },
  DiscussionForumPosting: {
    type: 'object',
    required: ['@type', 'url', 'headline', 'text', 'datePublished', 'author', 'interactionStatistic'],
    properties: {
      '@type': { const: 'DiscussionForumPosting' }, url, headline: texto, text: texto, datePublished: { type: 'string', format: 'date-time' },
      author: { type: 'object', required: ['@type', 'name'], properties: { '@type': { const: 'Person' }, name: texto } },
      interactionStatistic: { type: 'object', required: ['@type', 'interactionType', 'userInteractionCount'], properties: { '@type': { const: 'InteractionCounter' }, userInteractionCount: { type: 'integer', minimum: 0 } } },
    },
  },
}
