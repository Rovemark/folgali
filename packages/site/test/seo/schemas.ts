// JSON Schemas of the schema.org types the site emits. Each one requires what Google asks for as mandatory for the type (and what the
// site commits to always delivering); `additionalProperties` stays open because schema.org accepts an extra property.
const url = { type: 'string', format: 'uri' }
const text = { type: 'string', minLength: 1 }
const ref = { type: 'object', required: ['@id'], properties: { '@id': url } }

export const SCHEMAS: Record<string, object> = {
  Organization: {
    type: 'object',
    required: ['@type', '@id', 'name', 'url', 'description', 'logo', 'parentOrganization', 'sameAs'],
    properties: {
      '@type': { const: 'Organization' }, '@id': url, name: text, url, description: text, logo: url,
      parentOrganization: { type: 'object', required: ['@type', 'name', 'url'], properties: { '@type': { const: 'Organization' }, name: text, url } },
      sameAs: { type: 'array', minItems: 1, items: url },
    },
  },
  WebSite: {
    type: 'object',
    required: ['@type', '@id', 'url', 'name', 'inLanguage', 'potentialAction'],
    properties: {
      '@type': { const: 'WebSite' }, '@id': url, url, name: text, inLanguage: text,
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
      itemListElement: { type: 'array', minItems: 1, items: { type: 'object', required: ['@type', 'position', 'name', 'item'], properties: { '@type': { const: 'ListItem' }, position: { type: 'integer', minimum: 1 }, name: text, item: url } } },
    },
  },
  WebPage: { type: 'object', required: ['@type', '@id', 'url', 'name', 'description', 'inLanguage', 'isPartOf'], properties: { '@type': { enum: ['WebPage', 'AboutPage', 'ContactPage', 'CollectionPage'] }, '@id': { type: 'string' }, url, name: text, description: text, inLanguage: text, isPartOf: ref, dateModified: { type: 'string', format: 'date' } } },
  FAQPage: {
    type: 'object',
    required: ['@type', 'mainEntity'],
    properties: {
      '@type': { const: 'FAQPage' },
      mainEntity: { type: 'array', minItems: 1, items: { type: 'object', required: ['@type', 'name', 'acceptedAnswer'], properties: { '@type': { const: 'Question' }, name: text, acceptedAnswer: { type: 'object', required: ['@type', 'text'], properties: { '@type': { const: 'Answer' }, text: text } } } } },
    },
  },
  DefinedTerm: { type: 'object', required: ['@type', '@id', 'name', 'description', 'url', 'inDefinedTermSet'], properties: { '@type': { const: 'DefinedTerm' }, '@id': { type: 'string' }, name: text, description: text, url, inDefinedTermSet: ref } },
  DefinedTermSet: { type: 'object', required: ['@type', '@id', 'name', 'url', 'hasDefinedTerm'], properties: { '@type': { const: 'DefinedTermSet' }, '@id': { type: 'string' }, name: text, url, hasDefinedTerm: { type: 'array', items: { type: 'object', required: ['@type', 'name'], properties: { '@type': { const: 'DefinedTerm' }, name: text } } } } },
  TechArticle: { type: 'object', required: ['@type', 'headline', 'description', 'inLanguage', 'dateModified', 'mainEntityOfPage', 'author', 'publisher'], properties: { '@type': { const: 'TechArticle' }, headline: { type: 'string', minLength: 1, maxLength: 110 }, description: text, inLanguage: text, dateModified: { type: 'string', format: 'date' }, mainEntityOfPage: url, author: ref, publisher: ref } },
  SoftwareApplication: { type: 'object', required: ['@type', 'name', 'url', 'applicationCategory', 'operatingSystem', 'publisher'], properties: { '@type': { const: 'SoftwareApplication' }, name: text, url, applicationCategory: text, operatingSystem: text, publisher: ref } },
  DiscussionForumPosting: {
    type: 'object',
    required: ['@type', 'url', 'headline', 'text', 'datePublished', 'author', 'interactionStatistic'],
    properties: {
      '@type': { const: 'DiscussionForumPosting' }, url, headline: text, text: text, datePublished: { type: 'string', format: 'date-time' },
      author: { type: 'object', required: ['@type', 'name'], properties: { '@type': { const: 'Person' }, name: text } },
      interactionStatistic: { type: 'object', required: ['@type', 'interactionType', 'userInteractionCount'], properties: { '@type': { const: 'InteractionCounter' }, userInteractionCount: { type: 'integer', minimum: 0 } } },
    },
  },
}
