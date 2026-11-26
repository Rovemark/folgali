import { describe, expect, it } from 'vitest'
import { generateLlmsFull, generateLlmsTxt, type LlmsData } from '@/lib/seo/llms'
import { buildRss } from '@/lib/seo/rss'

// EXACT output of a minimal fixture, checked line by line by a person on 2026-11-08. It exists to catch what a "contains" lets
// pass: a swapped section title, one blank line fewer, a forgotten list item, a missing feed attribute.
const d: LlmsData = { base: 'https://x.test', idiomas: [{
    lang: 'pt', nome: 'Português',
    entidade: { descricaoCurta: 'Desc curta.', fatos: ['Fato A.', 'Fato B.'], comoCitar: 'Cite assim.' },
    meta: { ajuda: { titulo: 'Ajuda', descricao: 'Perguntas.' } },
    paginas: { ajuda: { respostaCurta: 'Resp ajuda.', atualizadoEm: '2026-11-08', secoes: [{ titulo: 'Sec', paragrafos: ['Par 1.', 'Par 2.'], lista: ['i1', 'i2'], codigo: { linguagem: 'bash', texto: 'echo oi' } }] } },
    rotulos: { guias: 'Guias', glossario: 'Glossário', ajuda: 'Ajuda', novidades: 'Novidades', paginas: 'Páginas', fatos: 'Fatos', comoCitar: 'Como citar', licenca: 'Licença', tracking: 'Rastreio', feeds: 'Feeds' },
    conteudo: {
      faq: [{ id: 'f1', grupo: 'comeco', pergunta: 'P?', respostaCurta: 'RC.', resposta: 'R longa.', atualizadoEm: '2026-11-08' }],
      verbetes: [{ slug: 'rover', termo: 'Rover', definicaoCurta: 'DC.', definicao: 'D longa.', atualizadoEm: '2026-11-08' }],
      guias: [{ slug: 'g1', titulo: 'Guia 1', descricao: 'dg', respostaCurta: 'RCG.', atualizadoEm: '2026-11-08', secoes: [{ titulo: 'S1', paragrafos: ['p'] }] }],
      novidades: [{ id: 'n1', data: '2026-11-08', titulo: 'Nov', resumo: 'Res.', itens: ['a', 'b'] }],
    },
  } as never] }

const TXT = `# folgali

> Desc curta.

## Fatos

- Fato A.
- Fato B.

## Como citar

Cite assim. https://x.test

## Licença

- Code: AGPL-3.0 (https://www.gnu.org/licenses/agpl-3.0.html).
- Art and brand: Rovemark, all rights reserved, not under the AGPL.

## Rastreio

Public content pages may be crawled and cited by search engines and by AI search and answer crawlers (OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User, Perplexity-User). Text and data mining and AI training by third parties are reserved (tdm-reservation: 1): training crawlers are blocked (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Applebot-Extended, CCBot, Bytespider, Meta-ExternalAgent, cohere-training-data-crawler, Amazonbot). Pages that need a login or belong to one person are closed to everyone. See https://x.test/robots.txt.

## Páginas (Português)

- [Ajuda](https://x.test/pt/ajuda): Perguntas.

### Guias (Português)

- [Guia 1](https://x.test/pt/guias/g1): RCG.

### Glossário (Português)

- [Rover](https://x.test/pt/glossario/rover): DC.

## Feeds

- [Novidades (Português)](https://x.test/pt/rss.xml): RSS 2.0
- [Sitemap](https://x.test/sitemap.xml): XML
- [Full text](https://x.test/llms-full.txt): Markdown
`
const FULL = `# folgali: full text

## Português

Desc curta.

- Fato A.
- Fato B.

### Ajuda

Source: https://x.test/pt/ajuda

**Resp ajuda.**

#### Sec

Par 1.

Par 2.

- i1
- i2

\`\`\`bash
echo oi
\`\`\`

### Ajuda

#### P?

**RC.**

R longa.

### Glossário

#### Rover

**DC.**

D longa.

### Guia 1

**RCG.**

#### S1

p

### Novidades

#### Nov (2026-11-08)

Res.

- a
- b
`
const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>T</title>
    <link>https://x.test/pt/novidades</link>
    <description>D</description>
    <language>pt</language>
    <generator>folgali</generator>
    <lastBuildDate>Sun, 08 Nov 2026 12:00:00 GMT</lastBuildDate>
    <atom:link href="https://x.test/pt/rss.xml" rel="self" type="application/rss+xml" />
    <item>
      <title>Nov</title>
      <link>https://x.test/pt/novidades#n1</link>
      <guid isPermaLink="true">https://x.test/pt/novidades#n1</guid>
      <pubDate>Sun, 08 Nov 2026 12:00:00 GMT</pubDate>
      <description>Res. a b</description>
    </item>
    <item>
      <title>Velha</title>
      <link>https://x.test/pt/novidades#n0</link>
      <guid isPermaLink="true">https://x.test/pt/novidades#n0</guid>
      <pubDate>Sun, 01 Nov 2026 12:00:00 GMT</pubDate>
      <description>R0</description>
    </item>
  </channel>
</rss>
`

describe('exact output', () => {
  it('llms.txt', () => {
    expect(generateLlmsTxt(d)).toBe(TXT)
  })
  it('llms-full.txt', () => {
    expect(generateLlmsFull(d)).toBe(FULL)
  })
  it('rss.xml, with the items from newest to oldest and the feed date equal to the newest item\'s', () => {
    const news = [
      { id: 'n0', data: '2026-11-01', titulo: 'Velha', resumo: 'R0' },
      { id: 'n1', data: '2026-11-08', titulo: 'Nov', resumo: 'Res.', itens: ['a', 'b'] },
    ]
    expect(buildRss({ base: 'https://x.test', lang: 'pt', titulo: 'T', descricao: 'D', novidades: news })).toBe(RSS)
  })
  it('llms with the skill: the section comes before the feeds in llms.txt and right after the title in llms-full.txt, one link and one sentence per language', () => {
    const withSkill: LlmsData = { ...d, skills: [{ titulo: 'Skill PT', url: 'https://x.test/skill.md', descricao: 'Frase pt.' }, { titulo: 'Skill EN', url: 'https://x.test/skill.en.md', descricao: 'Sentence en.' }] }
    const section = '## Skill for agents\n\n- [Skill PT](https://x.test/skill.md): Frase pt.\n- [Skill EN](https://x.test/skill.en.md): Sentence en.\n\n'
    expect(generateLlmsTxt(withSkill)).toBe(TXT.replace('## Feeds\n', `${section}## Feeds\n`))
    expect(generateLlmsFull(withSkill)).toBe(FULL.replace('# folgali: full text\n\n', `# folgali: full text\n\n${section}`))
  })
  it('llms without faq, glossary, guides and news does not write empty sections', () => {
    const empty = { ...d, idiomas: [{ ...d.idiomas[0], conteudo: { faq: [], verbetes: [], guias: [], novidades: [] } }] } as LlmsData
    const t = generateLlmsTxt(empty)
    const f = generateLlmsFull(empty)
    expect(t).not.toContain('### Guias')
    expect(t).not.toContain('### Glossário')
    expect(f.match(/### Ajuda/g)).toHaveLength(1) // only the page, without the questions section
    expect(f).not.toContain('### Glossário')
    expect(f).not.toContain('### Novidades')
  })
  it('an empty list in a section or in a news item leaves no stray blank line', () => {
    const base = d.idiomas[0]
    const withoutLists = {
      ...d,
      idiomas: [{
        ...base,
        paginas: { ajuda: { ...base.paginas.ajuda, secoes: [{ titulo: 'Sec', paragrafos: ['Par'], lista: [] }] } },
        conteudo: { ...base.conteudo, novidades: [{ id: 'n1', data: '2026-11-08', titulo: 'Nov', resumo: 'Res.', itens: [] }] },
      }],
    } as LlmsData
    const f = generateLlmsFull(withoutLists)
    expect(f).not.toContain('\n\n\n')
    expect(f).toContain('#### Sec\n\nPar\n\n### Ajuda')
    expect(f.endsWith('Res.\n')).toBe(true)
  })
  it('rss: a news item with an empty item list leaves no extra space in the description; equal dates keep the input order', () => {
    const n = (id: string, data: string, items?: string[]) => ({ id, data, titulo: id, resumo: 'R', ...(items ? { itens: items } : {}) })
    const r = buildRss({ base: 'https://x.test', lang: 'pt', titulo: 't', descricao: 'd', novidades: [n('a', '2026-11-08', []), n('b', '2026-11-08')] })
    expect(r).toContain('<description>R</description>')
    expect(r).not.toContain('<description>R </description>')
    expect(r.indexOf('<title>a</title>')).toBeLessThan(r.indexOf('<title>b</title>'))
  })
})
