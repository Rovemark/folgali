// Monta, a partir dos textos e do conteúdo, as entradas que os geradores puros pedem. Sem rede e sem `server-only`, para os testes usarem.
import { conteudoDe } from '@/conteudo'
import { META, PADRAO, PRONTOS, type Pronto } from '@/lib/i18n'
import { instDict, paginaDe, rodapeDict } from '@/lib/i18n-extra'
import { urlBase } from '@/lib/site'
import type { DadosLlms, Skill, TextosDeIdioma } from './llms'
import { SKILL } from './skill'
import type { DadosDoRss } from './rss'

/** Os rótulos de seção do llms.txt ficam em inglês: é o idioma que as ferramentas esperam ler nos cabeçalhos. */
const ROTULOS_LLMS: TextosDeIdioma['rotulos'] = {
  guias: 'Guides',
  glossario: 'Glossary',
  ajuda: 'Help and FAQ',
  novidades: 'News feed',
  paginas: 'Pages',
  fatos: 'Key facts',
  comoCitar: 'How to cite',
  licenca: 'License',
  rastreio: 'Crawling policy',
  feeds: 'Feeds and indexes',
}

export function textosDeIdioma(lang: Pronto): TextosDeIdioma {
  const i = instDict(lang)
  return {
    lang,
    nome: META[lang].nativo,
    entidade: i.entidade,
    meta: i.meta as TextosDeIdioma['meta'],
    // normaliza: as páginas de listagem (ajuda, glossário, guias, novidades) não têm seções no JSON
    paginas: Object.fromEntries(Object.keys(i.paginas).map((id) => [id, paginaDe(lang, id)])),
    rotulos: ROTULOS_LLMS,
    conteudo: conteudoDe(lang),
  }
}

/** Português primeiro (idioma padrão), depois os outros prontos. */
const ordem = (): Pronto[] => [PADRAO, ...PRONTOS.filter((l) => l !== PADRAO)]

/** O skill para agentes existe só em português e em inglês: uma linha para cada, no idioma dele. */
export function skillsDoSite(base: string): Skill[] {
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

export function dadosLlms(env: Readonly<Record<string, string | undefined>> = process.env): DadosLlms {
  const base = urlBase(env)
  return { base, idiomas: ordem().map(textosDeIdioma), skills: skillsDoSite(base) }
}

export function dadosRss(lang: Pronto, env: Readonly<Record<string, string | undefined>> = process.env): DadosDoRss {
  const i = instDict(lang)
  return { base: urlBase(env), lang: META[lang].html, titulo: `${rodapeDict(lang).marca.titulo}: ${i.meta.novidades.titulo}`, descricao: i.meta.novidades.descricao, novidades: conteudoDe(lang).novidades }
}
