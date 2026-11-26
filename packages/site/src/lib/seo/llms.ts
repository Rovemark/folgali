// llms.txt and llms-full.txt, generated from the content (never written by hand, so they do not go stale).
//
// llms.txt: the index an AI reads first. Who we are in two sentences, the facts that can be cited, how to cite, the license, the
// crawler policy and a link with one line for each canonical page, in each language.
// llms-full.txt: the text of the same pages, in Markdown, for whoever wants to read everything in a single request.
import type { LanguageContent, Guide, GuideSection } from '@/content/types'
import { ENTITY, absoluteUrl } from '@/lib/site'
import { AI_CRAWLERS } from './policy'
import { sitemapRoutes } from './routes'

export type LanguageTexts = {
  lang: string
  /** Language name for the section title. */
  nome: string
  entidade: { descricaoCurta: string; fatos: readonly string[]; comoCitar: string }
  meta: Readonly<Record<string, { titulo: string; descricao: string }>>
  paginas: Readonly<Record<string, { respostaCurta: string; atualizadoEm: string; secoes: readonly GuideSection[] }>>
  rotulos: { guias: string; glossario: string; ajuda: string; novidades: string; paginas: string; fatos: string; comoCitar: string; licenca: string; tracking: string; feeds: string }
  conteudo: LanguageContent
}

/** A file for AI agents (the skill), with the absolute address and one sentence. It only exists in the languages in which it was written. */
export type Skill = { titulo: string; url: string; descricao: string }

export type LlmsData = { base: string; idiomas: readonly LanguageTexts[]; skills?: readonly Skill[] }

const line = (text: string, url: string, description: string) => `- [${text}](${url}): ${description}`

/** The skill section: a link and a sentence per language in which it exists. Empty when there is no skill. */
function skillSection(d: LlmsData): string[] {
  if (!d.skills || d.skills.length === 0) return []
  return ['## Skill for agents', '', ...d.skills.map((s) => line(s.titulo, s.url, s.descricao)), '']
}

function markdownSections(sections: readonly GuideSection[], level: string): string[] {
  const output: string[] = []
  for (const s of sections) {
    output.push(`${level} ${s.titulo}`, '')
    for (const p of s.paragrafos) output.push(p, '')
    if (s.lista && s.lista.length > 0) output.push(...s.lista.map((i) => `- ${i}`), '')
    if (s.codigo) output.push('```' + s.codigo.linguagem, s.codigo.texto, '```', '')
  }
  return output
}

export function generateLlmsTxt(d: LlmsData): string {
  const primary = d.idiomas[0]
  const out: string[] = [`# ${ENTITY.nome}`, '', `> ${primary.entidade.descricaoCurta}`, '']
  for (const t of d.idiomas.slice(1)) out.push(t.entidade.descricaoCurta, '')
  out.push(`## ${primary.rotulos.fatos}`, '', ...primary.entidade.fatos.map((f) => `- ${f}`), '')
  out.push(`## ${primary.rotulos.comoCitar}`, '', `${primary.entidade.comoCitar} ${d.base}`, '')
  out.push(`## ${primary.rotulos.licenca}`, '', `- Code: ${ENTITY.licenca} (${ENTITY.licenseUrl}).`, `- Art and brand: ${ENTITY.empresa}, all rights reserved, not under the AGPL.`, '')
  const allowed = AI_CRAWLERS.filter((r) => !r.bloqueado).map((r) => r.agente).join(', ')
  const blocked = AI_CRAWLERS.filter((r) => r.bloqueado).map((r) => r.agente).join(', ')
  out.push(`## ${primary.rotulos.tracking}`, '', `Public content pages may be crawled and cited by search engines and by AI search and answer crawlers (${allowed}). Text and data mining and AI training by third parties are reserved (tdm-reservation: 1): training crawlers are blocked (${blocked}). Pages that need a login or belong to one person are closed to everyone. See ${d.base}/robots.txt.`, '')
  for (const t of d.idiomas) {
    out.push(`## ${t.rotulos.paginas} (${t.nome})`, '')
    for (const r of sitemapRoutes()) {
      const m = t.meta[r.id]
      if (!m) continue
      out.push(line(m.titulo, absoluteUrl(d.base, t.lang, r.caminho), m.descricao))
    }
    out.push('')
    if (t.conteudo.guias.length > 0) {
      out.push(`### ${t.rotulos.guias} (${t.nome})`, '')
      for (const g of t.conteudo.guias) out.push(line(g.titulo, absoluteUrl(d.base, t.lang, `/guias/${g.slug}`), g.respostaCurta))
      out.push('')
    }
    if (t.conteudo.verbetes.length > 0) {
      out.push(`### ${t.rotulos.glossario} (${t.nome})`, '')
      for (const v of t.conteudo.verbetes) out.push(line(v.termo, absoluteUrl(d.base, t.lang, `/glossario/${v.slug}`), v.definicaoCurta))
      out.push('')
    }
  }
  out.push(...skillSection(d))
  out.push(`## ${primary.rotulos.feeds}`, '')
  for (const t of d.idiomas) out.push(line(`${t.rotulos.novidades} (${t.nome})`, absoluteUrl(d.base, t.lang, '/rss.xml'), 'RSS 2.0'))
  out.push(line('Sitemap', `${d.base}/sitemap.xml`, 'XML'), line('Full text', `${d.base}/llms-full.txt`, 'Markdown'), '')
  return out.join('\n')
}

const markdownGuide = (g: Guide): string[] => [`### ${g.titulo}`, '', `**${g.respostaCurta}**`, '', ...markdownSections(g.secoes, '####')]

export function generateLlmsFull(d: LlmsData): string {
  const out: string[] = [`# ${ENTITY.nome}: full text`, '', ...skillSection(d)]
  for (const t of d.idiomas) {
    out.push(`## ${t.nome}`, '', t.entidade.descricaoCurta, '', ...t.entidade.fatos.map((f) => `- ${f}`), '')
    for (const r of sitemapRoutes()) {
      const p = t.paginas[r.id]
      const m = t.meta[r.id]
      if (!p || !m) continue
      out.push(`### ${m.titulo}`, '', `Source: ${absoluteUrl(d.base, t.lang, r.caminho)}`, '', `**${p.respostaCurta}**`, '', ...markdownSections(p.secoes, '####'))
    }
    if (t.conteudo.faq.length > 0) {
      out.push(`### ${t.rotulos.ajuda}`, '')
      for (const f of t.conteudo.faq) out.push(`#### ${f.pergunta}`, '', `**${f.respostaCurta}**`, '', f.resposta, '')
    }
    if (t.conteudo.verbetes.length > 0) {
      out.push(`### ${t.rotulos.glossario}`, '')
      for (const v of t.conteudo.verbetes) out.push(`#### ${v.termo}`, '', `**${v.definicaoCurta}**`, '', v.definicao, '')
    }
    for (const g of t.conteudo.guias) out.push(...markdownGuide(g))
    if (t.conteudo.novidades.length > 0) {
      out.push(`### ${t.rotulos.novidades}`, '')
      for (const n of t.conteudo.novidades) {
        out.push(`#### ${n.titulo} (${n.data})`, '', n.resumo, '')
        if (n.itens && n.itens.length > 0) out.push(...n.itens.map((i) => `- ${i}`), '')
      }
    }
  }
  return out.join('\n')
}
