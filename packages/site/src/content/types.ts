// Types of the editorial content of folgali (FAQ, glossary and guides), as plain data.
// Whoever builds the pages, the JSON-LD, the sitemap and llms.txt consumes these types. Nothing here imports React.
// All text is written to be cited by search engines and by AIs: a statement checked against the repository, no invented number.

export type Language = import('@/lib/i18n').Locale

export type Source = { titulo: string; url: string }

/** A question with a self-contained short answer (35 to 60 words) and the full answer. */
export type Faq = {
  id: string
  grupo: string
  pergunta: string
  respostaCurta: string
  resposta: string
  atualizadoEm: string
  fontes?: Source[]
}

/** A glossary term, with a short definition (first citable sentence) and a full definition. */
export type GlossaryEntry = {
  slug: string
  termo: string
  definicaoCurta: string
  definicao: string
  relacionados?: string[]
  atualizadoEm: string
}

export type GuideSection = {
  titulo: string
  paragrafos: string[]
  lista?: string[]
  codigo?: { linguagem: string; texto: string }
}

/** A long guide. `perguntas` (questions) are FAQ ids that the guide answers (they become links and the questions block of the page). */
export type Guide = {
  slug: string
  titulo: string
  descricao: string
  respostaCurta: string
  secoes: GuideSection[]
  perguntas?: string[]
  atualizadoEm: string
  fontes?: Source[]
}

/** News of the site and the protocol (the RSS comes from here). Written by whoever works on the product, not by the content agent. */
export type NewsItem = {
  id: string
  data: string
  titulo: string
  resumo: string
  itens?: string[]
}

export type LanguageContent = {
  faq: readonly Faq[]
  verbetes: readonly GlossaryEntry[]
  guias: readonly Guide[]
  novidades: readonly NewsItem[]
}
