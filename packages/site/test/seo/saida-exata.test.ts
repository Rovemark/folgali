import { describe, expect, it } from 'vitest'
import { gerarLlmsFull, gerarLlmsTxt, type DadosLlms } from '@/lib/seo/llms'
import { montarRss } from '@/lib/seo/rss'

// Saída EXATA de um fixture mínimo, conferida linha a linha por uma pessoa em 08/11/2026. Existe para pegar o que um "contém" deixa
// passar: título de seção trocado, linha em branco a menos, item de lista esquecido, atributo do feed sumido.
const d: DadosLlms = { base: 'https://x.test', idiomas: [{
    lang: 'pt', nome: 'Português',
    entidade: { descricaoCurta: 'Desc curta.', fatos: ['Fato A.', 'Fato B.'], comoCitar: 'Cite assim.' },
    meta: { ajuda: { titulo: 'Ajuda', descricao: 'Perguntas.' } },
    paginas: { ajuda: { respostaCurta: 'Resp ajuda.', atualizadoEm: '2026-11-08', secoes: [{ titulo: 'Sec', paragrafos: ['Par 1.', 'Par 2.'], lista: ['i1', 'i2'], codigo: { linguagem: 'bash', texto: 'echo oi' } }] } },
    rotulos: { guias: 'Guias', glossario: 'Glossário', ajuda: 'Ajuda', novidades: 'Novidades', paginas: 'Páginas', fatos: 'Fatos', comoCitar: 'Como citar', licenca: 'Licença', rastreio: 'Rastreio', feeds: 'Feeds' },
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

Public content pages may be crawled and cited by search and answer engines and AI crawlers (OAI-SearchBot, ChatGPT-User, GPTBot, Claude-SearchBot, Claude-User, ClaudeBot, PerplexityBot, Perplexity-User, Google-Extended, Applebot-Extended). Pages that need a login or belong to one person are closed to everyone. See https://x.test/robots.txt.

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

describe('saída exata', () => {
  it('llms.txt', () => {
    expect(gerarLlmsTxt(d)).toBe(TXT)
  })
  it('llms-full.txt', () => {
    expect(gerarLlmsFull(d)).toBe(FULL)
  })
  it('rss.xml, com os itens do mais novo para o mais antigo e a data do feed igual à do item mais novo', () => {
    const novidades = [
      { id: 'n0', data: '2026-11-01', titulo: 'Velha', resumo: 'R0' },
      { id: 'n1', data: '2026-11-08', titulo: 'Nov', resumo: 'Res.', itens: ['a', 'b'] },
    ]
    expect(montarRss({ base: 'https://x.test', lang: 'pt', titulo: 'T', descricao: 'D', novidades })).toBe(RSS)
  })
  it('llms com o skill: a seção vem antes dos feeds no llms.txt e logo depois do título no llms-full.txt, um link e uma frase por idioma', () => {
    const comSkill: DadosLlms = { ...d, skills: [{ titulo: 'Skill PT', url: 'https://x.test/skill.md', descricao: 'Frase pt.' }, { titulo: 'Skill EN', url: 'https://x.test/skill.en.md', descricao: 'Sentence en.' }] }
    const secao = '## Skill for agents\n\n- [Skill PT](https://x.test/skill.md): Frase pt.\n- [Skill EN](https://x.test/skill.en.md): Sentence en.\n\n'
    expect(gerarLlmsTxt(comSkill)).toBe(TXT.replace('## Feeds\n', `${secao}## Feeds\n`))
    expect(gerarLlmsFull(comSkill)).toBe(FULL.replace('# folgali: full text\n\n', `# folgali: full text\n\n${secao}`))
  })
  it('llms sem faq, sem verbetes, sem guias e sem novidades não escreve seções vazias', () => {
    const vazio = { ...d, idiomas: [{ ...d.idiomas[0], conteudo: { faq: [], verbetes: [], guias: [], novidades: [] } }] } as DadosLlms
    const t = gerarLlmsTxt(vazio)
    const f = gerarLlmsFull(vazio)
    expect(t).not.toContain('### Guias')
    expect(t).not.toContain('### Glossário')
    expect(f.match(/### Ajuda/g)).toHaveLength(1) // só a página, sem a seção de perguntas
    expect(f).not.toContain('### Glossário')
    expect(f).not.toContain('### Novidades')
  })
  it('lista vazia numa seção ou numa novidade não deixa linha em branco sobrando', () => {
    const base = d.idiomas[0]
    const semListas = {
      ...d,
      idiomas: [{
        ...base,
        paginas: { ajuda: { ...base.paginas.ajuda, secoes: [{ titulo: 'Sec', paragrafos: ['Par'], lista: [] }] } },
        conteudo: { ...base.conteudo, novidades: [{ id: 'n1', data: '2026-11-08', titulo: 'Nov', resumo: 'Res.', itens: [] }] },
      }],
    } as DadosLlms
    const f = gerarLlmsFull(semListas)
    expect(f).not.toContain('\n\n\n')
    expect(f).toContain('#### Sec\n\nPar\n\n### Ajuda')
    expect(f.endsWith('Res.\n')).toBe(true)
  })
  it('rss: novidade com a lista de itens vazia não deixa espaço sobrando na descrição; datas iguais mantêm a ordem de entrada', () => {
    const n = (id: string, data: string, itens?: string[]) => ({ id, data, titulo: id, resumo: 'R', ...(itens ? { itens } : {}) })
    const r = montarRss({ base: 'https://x.test', lang: 'pt', titulo: 't', descricao: 'd', novidades: [n('a', '2026-11-08', []), n('b', '2026-11-08')] })
    expect(r).toContain('<description>R</description>')
    expect(r).not.toContain('<description>R </description>')
    expect(r.indexOf('<title>a</title>')).toBeLessThan(r.indexOf('<title>b</title>'))
  })
})
