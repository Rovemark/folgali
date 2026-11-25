// llms.txt e llms-full.txt, gerados do conteúdo (nunca escritos à mão, para não desatualizar).
//
// llms.txt: o índice que uma IA lê primeiro. Quem somos em duas frases, os fatos que podem ser citados, como citar, a licença, a
// política de rastreadores e um link com uma linha para cada página canônica, em cada idioma.
// llms-full.txt: o texto das mesmas páginas, em Markdown, para quem quer ler tudo numa só requisição.
import type { ConteudoDeIdioma, Guia, SecaoDeGuia } from '@/conteudo/tipos'
import { ENTIDADE, urlAbsoluta } from '@/lib/site'
import { RASTREADORES_DE_IA } from './politica'
import { rotasDoSitemap } from './rotas'

export type TextosDeIdioma = {
  lang: string
  /** Nome do idioma para o título das seções. */
  nome: string
  entidade: { descricaoCurta: string; fatos: readonly string[]; comoCitar: string }
  meta: Readonly<Record<string, { titulo: string; descricao: string }>>
  paginas: Readonly<Record<string, { respostaCurta: string; atualizadoEm: string; secoes: readonly SecaoDeGuia[] }>>
  rotulos: { guias: string; glossario: string; ajuda: string; novidades: string; paginas: string; fatos: string; comoCitar: string; licenca: string; rastreio: string; feeds: string }
  conteudo: ConteudoDeIdioma
}

/** Um arquivo para agentes de IA (o skill), com o endereço absoluto e uma frase. Só existe nos idiomas em que foi escrito. */
export type Skill = { titulo: string; url: string; descricao: string }

export type DadosLlms = { base: string; idiomas: readonly TextosDeIdioma[]; skills?: readonly Skill[] }

const linha = (texto: string, url: string, descricao: string) => `- [${texto}](${url}): ${descricao}`

/** A seção do skill: um link e uma frase por idioma em que ele existe. Vazia quando não há skill. */
function secaoDoSkill(d: DadosLlms): string[] {
  if (!d.skills || d.skills.length === 0) return []
  return ['## Skill for agents', '', ...d.skills.map((s) => linha(s.titulo, s.url, s.descricao)), '']
}

function secoesEmMarkdown(secoes: readonly SecaoDeGuia[], nivel: string): string[] {
  const saida: string[] = []
  for (const s of secoes) {
    saida.push(`${nivel} ${s.titulo}`, '')
    for (const p of s.paragrafos) saida.push(p, '')
    if (s.lista && s.lista.length > 0) saida.push(...s.lista.map((i) => `- ${i}`), '')
    if (s.codigo) saida.push('```' + s.codigo.linguagem, s.codigo.texto, '```', '')
  }
  return saida
}

export function gerarLlmsTxt(d: DadosLlms): string {
  const principal = d.idiomas[0]
  const out: string[] = [`# ${ENTIDADE.nome}`, '', `> ${principal.entidade.descricaoCurta}`, '']
  for (const t of d.idiomas.slice(1)) out.push(t.entidade.descricaoCurta, '')
  out.push(`## ${principal.rotulos.fatos}`, '', ...principal.entidade.fatos.map((f) => `- ${f}`), '')
  out.push(`## ${principal.rotulos.comoCitar}`, '', `${principal.entidade.comoCitar} ${d.base}`, '')
  out.push(`## ${principal.rotulos.licenca}`, '', `- Code: ${ENTIDADE.licenca} (${ENTIDADE.urlLicenca}).`, `- Art and brand: ${ENTIDADE.empresa}, all rights reserved, not under the AGPL.`, '')
  const permitidos = RASTREADORES_DE_IA.map((r) => r.agente).join(', ')
  out.push(`## ${principal.rotulos.rastreio}`, '', `Public content pages may be crawled and cited by search and answer engines and AI crawlers (${permitidos}). Pages that need a login or belong to one person are closed to everyone. See ${d.base}/robots.txt.`, '')
  for (const t of d.idiomas) {
    out.push(`## ${t.rotulos.paginas} (${t.nome})`, '')
    for (const r of rotasDoSitemap()) {
      const m = t.meta[r.id]
      if (!m) continue
      out.push(linha(m.titulo, urlAbsoluta(d.base, t.lang, r.caminho), m.descricao))
    }
    out.push('')
    if (t.conteudo.guias.length > 0) {
      out.push(`### ${t.rotulos.guias} (${t.nome})`, '')
      for (const g of t.conteudo.guias) out.push(linha(g.titulo, urlAbsoluta(d.base, t.lang, `/guias/${g.slug}`), g.respostaCurta))
      out.push('')
    }
    if (t.conteudo.verbetes.length > 0) {
      out.push(`### ${t.rotulos.glossario} (${t.nome})`, '')
      for (const v of t.conteudo.verbetes) out.push(linha(v.termo, urlAbsoluta(d.base, t.lang, `/glossario/${v.slug}`), v.definicaoCurta))
      out.push('')
    }
  }
  out.push(...secaoDoSkill(d))
  out.push(`## ${principal.rotulos.feeds}`, '')
  for (const t of d.idiomas) out.push(linha(`${t.rotulos.novidades} (${t.nome})`, urlAbsoluta(d.base, t.lang, '/rss.xml'), 'RSS 2.0'))
  out.push(linha('Sitemap', `${d.base}/sitemap.xml`, 'XML'), linha('Full text', `${d.base}/llms-full.txt`, 'Markdown'), '')
  return out.join('\n')
}

const guiaEmMarkdown = (g: Guia): string[] => [`### ${g.titulo}`, '', `**${g.respostaCurta}**`, '', ...secoesEmMarkdown(g.secoes, '####')]

export function gerarLlmsFull(d: DadosLlms): string {
  const out: string[] = [`# ${ENTIDADE.nome}: full text`, '', ...secaoDoSkill(d)]
  for (const t of d.idiomas) {
    out.push(`## ${t.nome}`, '', t.entidade.descricaoCurta, '', ...t.entidade.fatos.map((f) => `- ${f}`), '')
    for (const r of rotasDoSitemap()) {
      const p = t.paginas[r.id]
      const m = t.meta[r.id]
      if (!p || !m) continue
      out.push(`### ${m.titulo}`, '', `Source: ${urlAbsoluta(d.base, t.lang, r.caminho)}`, '', `**${p.respostaCurta}**`, '', ...secoesEmMarkdown(p.secoes, '####'))
    }
    if (t.conteudo.faq.length > 0) {
      out.push(`### ${t.rotulos.ajuda}`, '')
      for (const f of t.conteudo.faq) out.push(`#### ${f.pergunta}`, '', `**${f.respostaCurta}**`, '', f.resposta, '')
    }
    if (t.conteudo.verbetes.length > 0) {
      out.push(`### ${t.rotulos.glossario}`, '')
      for (const v of t.conteudo.verbetes) out.push(`#### ${v.termo}`, '', `**${v.definicaoCurta}**`, '', v.definicao, '')
    }
    for (const g of t.conteudo.guias) out.push(...guiaEmMarkdown(g))
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
