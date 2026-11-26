// Builds, from the texts and the content, the entries the pure generators ask for. No network and no `server-only`, so the tests can use it.
import '@/lib/legacy-env'
import { showcase } from '@/i18n/showcase'
import { contentOf } from '@/content'
import { META, DEFAULT, READY, type Ready } from '@/lib/i18n'
import { instDict, pageOf, footerDict } from '@/lib/i18n-extra'
import { urlBase } from '@/lib/site'
import type { LlmsData, Skill, LanguageTexts } from './llms'
import { SKILL } from './skill'
import type { RssData } from './rss'

/** The llms.txt section labels stay in English: it is the language the tools expect to read in the headings. */
const LLMS_LABELS: LanguageTexts['rotulos'] = {
  guias: 'Guides',
  glossario: 'Glossary',
  ajuda: 'Help and FAQ',
  novidades: 'News feed',
  paginas: 'Pages',
  fatos: 'Key facts',
  comoCitar: 'How to cite',
  licenca: 'License',
  tracking: 'Crawling policy',
  feeds: 'Feeds and indexes',
}

export function languageTexts(lang: Ready): LanguageTexts {
  const i = instDict(lang)
  return {
    lang,
    nome: META[lang].native,
    entidade: i.entidade,
    // the showcase routes (/rover-hangar) have title and description in showcase.<language>.json
    meta: { ...showcase(lang).meta, ...i.meta } as LanguageTexts['meta'],
    // normalizes: the listing pages (help, glossary, guides, news) have no sections in the JSON
    paginas: Object.fromEntries(Object.keys(i.paginas).map((id) => [id, pageOf(lang, id)])),
    rotulos: LLMS_LABELS,
    conteudo: contentOf(lang),
  }
}

/** Portuguese first (default language), then the other ready ones. */
const order = (): Ready[] => [DEFAULT, ...READY.filter((l) => l !== DEFAULT)]

/** The skill for agents exists only in Portuguese and English: one line for each, in its own language. */
export function siteSkills(base: string): Skill[] {
  return [
    {
      titulo: 'Skill para agentes (Português)',
      url: `${base}${SKILL.pt}`,
      descricao: 'Para um agente de IA ler: o que ele pode fazer na rede hoje (ler), o que exige a aprovação de uma pessoa e como entrar quando o registro de agentes de fora abrir.',
    },
    {
      titulo: 'Skill for agents (English)',
      url: `${base}${SKILL.en}`,
      descricao: "For an AI agent to read: what it can do on the network today (read), what needs a person's approval and how to join once registration for outside agents opens. The site's other ten languages point here.",
    },
  ]
}

export function llmsData(env: Readonly<Record<string, string | undefined>> = process.env): LlmsData {
  const base = urlBase(env)
  return { base, idiomas: order().map(languageTexts), skills: siteSkills(base) }
}

export function rssData(lang: Ready, env: Readonly<Record<string, string | undefined>> = process.env): RssData {
  const i = instDict(lang)
  return { base: urlBase(env), lang: META[lang].html, titulo: `${footerDict(lang).marca.titulo}: ${i.meta.novidades.titulo}`, descricao: i.meta.novidades.descricao, novidades: contentOf(lang).novidades }
}
