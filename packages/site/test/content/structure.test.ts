// The editorial content (FAQ, glossary, guides and entity) becomes citation for search engines and AIs, so one error becomes a wrong fact
// spread around. This test proves the shape and the text rules: types, counts, the two languages with the same ids, a short answer
// of 35 to 60 words, references that exist, sources in https, and no em dash or machine-text tic.
import { describe, expect, it } from 'vitest'
import { entity, faqEn, faqPt, guidesEn, guidesPt, glossaryEn, glossaryEntriesPt } from '@/content'
import type { Faq, Guide, GlossaryEntry } from '@/content'

const LANGUAGES = [
  { nome: 'pt', faq: faqPt, verbetes: glossaryEntriesPt, guias: guidesPt },
  { nome: 'en', faq: faqEn, verbetes: glossaryEn, guias: guidesEn },
] as const

// The same text rule as test/content.test.ts, plus the house tics. Nothing the person reads may match.
const FORBIDDEN = [
  /—/, /–/,
  /não apenas.*mas também/i, /mergulhe/i, /desbloqueie/i, /potencializ/i, /alavanc/i, /robust[oa]/i, /sem esforço/i,
  /solução inovadora/i, /revolucionári/i, /poderos[oa]/i, /em constante evolução/i, /no mundo de hoje/i, /na era da ia/i,
  /divisor de águas/i, /experiência única/i, /^além disso,/i,
  /\bseamless/i, /\bdelve\b/i, /\bunlock/i, /\bleverage/i, /\bpowerful/i, /game[- ]changer/i, /in today's world/i, /\brobust\b/i,
  /\bnot just\b.*\bbut\b/i, /\bin the age of ai\b/i, /\bcutting[- ]edge\b/i, /\bgroundbreaking\b/i, /\brevolutionary\b/i,
]
const EMOJI = /\p{Extended_Pictographic}/u
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length

/** All text the person reads, with a label of where it came from. The guides' code is included: it cannot have an em dash either. */
function texts(): Array<[string, string]> {
  const list: Array<[string, string]> = []
  for (const { nome: name, faq, verbetes: glossaryEntries, guias: guides } of LANGUAGES) {
    for (const f of faq) list.push([`faq.${name}.${f.id}.pergunta`, f.pergunta], [`faq.${name}.${f.id}.curta`, f.respostaCurta], [`faq.${name}.${f.id}.resposta`, f.resposta], [`faq.${name}.${f.id}.grupo`, f.grupo])
    for (const v of glossaryEntries) list.push([`verbete.${name}.${v.slug}.termo`, v.termo], [`verbete.${name}.${v.slug}.curta`, v.definicaoCurta], [`verbete.${name}.${v.slug}.definicao`, v.definicao])
    for (const g of guides) {
      list.push([`guia.${name}.${g.slug}.titulo`, g.titulo], [`guia.${name}.${g.slug}.descricao`, g.descricao], [`guia.${name}.${g.slug}.curta`, g.respostaCurta])
      g.secoes.forEach((s, i) => {
        list.push([`guia.${name}.${g.slug}.s${i}.titulo`, s.titulo])
        s.paragrafos.forEach((p, j) => list.push([`guia.${name}.${g.slug}.s${i}.p${j}`, p]))
        ;(s.lista ?? []).forEach((l, j) => list.push([`guia.${name}.${g.slug}.s${i}.l${j}`, l]))
        if (s.codigo) list.push([`guia.${name}.${g.slug}.s${i}.codigo`, s.codigo.texto])
      })
      for (const source of g.fontes ?? []) list.push([`guia.${name}.${g.slug}.fonte`, source.titulo])
    }
  }
  const double = (label: string, d: { pt: string; en: string }) => list.push([`${label}.pt`, d.pt], [`${label}.en`, d.en])
  double('entidade.umaFrase', entity.oneSentence)
  double('entidade.tresFrases', entity.threeSentences)
  double('entidade.paragrafo', entity.paragraph)
  double('entidade.contato', entity.contato.remark)
  for (const l of ['pt', 'en'] as const) {
    entity.whatItIs[l].forEach((t, i) => list.push([`entidade.oQueE.${l}.${i}`, t]))
    entity.whatItIsNot[l].forEach((t, i) => list.push([`entidade.oQueNaoE.${l}.${i}`, t]))
  }
  for (const f of entity.fatos) { double(`entidade.fato.${f.fonte}.rotulo`, f.rotulo); double(`entidade.fato.${f.fonte}.valor`, f.valor) }
  return list
}

const find = <T extends { id?: string; slug?: string }>(list: readonly T[], key: string) => list.find((x) => (x.id ?? x.slug) === key)

describe('contagens e forma', () => {
  it('there is the requested minimum in each language: 40 questions, 30 glossary entries and 9 guides', () => {
    for (const { nome: name, faq, verbetes: glossaryEntries, guias: guides } of LANGUAGES) {
      expect(faq.length, `faq ${name}`).toBeGreaterThanOrEqual(40)
      expect(glossaryEntries.length, `verbetes ${name}`).toBeGreaterThanOrEqual(30)
      expect(guides.length, `guias ${name}`).toBeGreaterThanOrEqual(9)
    }
  })

  it('the FAQ covers the eight requested groups, in each language', () => {
    for (const { nome: name, faq } of LANGUAGES) expect(new Set(faq.map((f) => f.grupo)).size, name).toBe(8)
  })

  it('the fields are non-empty text and the date is a real date', () => {
    const dataOk = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`))
    for (const { nome: name, faq, verbetes: glossaryEntries, guias: guides } of LANGUAGES) {
      for (const f of faq) {
        for (const c of ['id', 'grupo', 'pergunta', 'respostaCurta', 'resposta'] as const) expect(f[c].trim().length, `${name} ${f.id}.${c}`).toBeGreaterThan(0)
        expect(dataOk(f.atualizadoEm), `${name} ${f.id} data`).toBe(true)
        expect(f.pergunta.trim().endsWith('?'), `${name} ${f.id} ends with ?`).toBe(true)
      }
      for (const v of glossaryEntries) {
        for (const c of ['slug', 'termo', 'definicaoCurta', 'definicao'] as const) expect(v[c].trim().length, `${name} ${v.slug}.${c}`).toBeGreaterThan(0)
        expect(dataOk(v.atualizadoEm), `${name} ${v.slug} data`).toBe(true)
        expect(v.definicao.length, `${name} ${v.slug} the full definition is not shorter than the short one`).toBeGreaterThanOrEqual(v.definicaoCurta.length)
      }
      for (const g of guides) {
        for (const c of ['slug', 'titulo', 'descricao', 'respostaCurta'] as const) expect(g[c].trim().length, `${name} ${g.slug}.${c}`).toBeGreaterThan(0)
        expect(dataOk(g.atualizadoEm), `${name} ${g.slug} data`).toBe(true)
        expect(g.secoes.length, `${name} ${g.slug} sections`).toBeGreaterThanOrEqual(4)
        for (const s of g.secoes) { expect(s.titulo.trim().length).toBeGreaterThan(0); expect(s.paragrafos.length, `${name} ${g.slug} ${s.titulo}`).toBeGreaterThanOrEqual(1) }
        expect(g.descricao.length, `${name} ${g.slug} the description fits in a search result`).toBeLessThanOrEqual(200)
      }
    }
  })

  it('the slug and the id are unique and only have lowercase letters, numbers and hyphen', () => {
    for (const { nome: name, faq, verbetes: glossaryEntries, guias: guides } of LANGUAGES) {
      for (const [label, keys] of [['faq', faq.map((f) => f.id)], ['verbetes', glossaryEntries.map((v) => v.slug)], ['guias', guides.map((g) => g.slug)]] as const) {
        expect(new Set(keys).size, `${label} ${name} has a duplicate`).toBe(keys.length)
        for (const c of keys) expect(c, `${label} ${name}`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      }
    }
  })
})

describe('the two languages say the same thing', () => {
  it('have the same FAQ ids, in the same order and in the same group', () => {
    expect(faqEn.map((f) => f.id)).toEqual(faqPt.map((f) => f.id))
    const groups = (l: Faq[]) => { const seen: string[] = []; return l.map((f) => { if (!seen.includes(f.grupo)) seen.push(f.grupo); return seen.indexOf(f.grupo) }) }
    expect(groups(faqEn)).toEqual(groups(faqPt))
  })
  it('have the same glossary and guide slugs, in the same order', () => {
    expect(glossaryEn.map((v) => v.slug)).toEqual(glossaryEntriesPt.map((v) => v.slug))
    expect(guidesEn.map((g) => g.slug)).toEqual(guidesPt.map((g) => g.slug))
  })
  it('each guide has the same questions, the same number of sections and the same sources in both languages', () => {
    guidesPt.forEach((g, i) => {
      const e = guidesEn[i]
      expect(e.perguntas ?? [], g.slug).toEqual(g.perguntas ?? [])
      expect(e.secoes.length, g.slug).toBe(g.secoes.length)
      expect((e.fontes ?? []).map((f) => f.url), g.slug).toEqual((g.fontes ?? []).map((f) => f.url))
      expect(e.secoes.map((s) => Boolean(s.codigo)), g.slug).toEqual(g.secoes.map((s) => Boolean(s.codigo)))
    })
  })
  it('the guides\' code is the same in both languages, apart from comments and example text', () => {
    guidesPt.forEach((g, i) => {
      g.secoes.forEach((s, j) => {
        const a = s.codigo, b = guidesEn[i].secoes[j].codigo
        if (!a || !b) return
        expect(b.linguagem, g.slug).toBe(a.linguagem)
        const skeleton = (t: string) => t.split('\n').map((l) => l.trim()).filter((l) => !l.startsWith('//')).map((l) => l.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""').replace(/\/\/.*$/, '').trim()).join('\n')
        expect(skeleton(b.texto), `${g.slug} secao ${j}`).toBe(skeleton(a.texto))
      })
    })
  })
})

describe('short answer of 35 to 60 words (AEO)', () => {
  it('every FAQ question and every guide opens with a short answer in that range', () => {
    const outside: string[] = []
    for (const { nome: name, faq, guias: guides } of LANGUAGES) {
      for (const f of faq) if (words(f.respostaCurta) < 35 || words(f.respostaCurta) > 60) outside.push(`faq.${name}.${f.id}: ${words(f.respostaCurta)} palavras`)
      for (const g of guides) if (words(g.respostaCurta) < 35 || words(g.respostaCurta) > 60) outside.push(`guia.${name}.${g.slug}: ${words(g.respostaCurta)} palavras`)
    }
    expect(outside).toEqual([])
  })
  it('the full answer brings more than the short one repeats', () => {
    for (const { nome: name, faq } of LANGUAGES) for (const f of faq) expect(words(f.resposta), `${name} ${f.id}`).toBeGreaterThan(40)
  })
})

describe('references that exist', () => {
  it('every related glossary entry points to a slug that exists and does not point to itself', () => {
    for (const { nome: name, verbetes: glossaryEntries } of LANGUAGES) {
      const slugs = new Set(glossaryEntries.map((v) => v.slug))
      for (const v of glossaryEntries) for (const r of v.relacionados ?? []) { expect(slugs.has(r), `${name} ${v.slug} -> ${r}`).toBe(true); expect(r).not.toBe(v.slug) }
    }
  })
  it('every question cited by a guide exists in the FAQ of the same language', () => {
    for (const { nome: name, faq, guias: guides } of LANGUAGES) {
      const ids = new Set(faq.map((f) => f.id))
      for (const g of guides) for (const p of g.perguntas ?? []) expect(ids.has(p), `${name} ${g.slug} -> ${p}`).toBe(true)
    }
  })
  it('every source has a title and a well-formed https URL', () => {
    for (const { nome: name, faq, guias: guides } of LANGUAGES) {
      const sources = [...faq.flatMap((f) => f.fontes ?? []), ...guides.flatMap((g) => g.fontes ?? [])]
      for (const f of sources) {
        expect(f.titulo.trim().length, name).toBeGreaterThan(0)
        const u = new URL(f.url)
        expect(u.protocol, `${name} ${f.url}`).toBe('https:')
        expect(u.hostname.includes('.'), f.url).toBe(true)
      }
    }
  })
  it('the comparison with Moltbook cites the sources and only talks about third parties with a URL', () => {
    for (const { nome: name, guias: guides } of LANGUAGES) {
      const g = guides.find((x) => x.slug === 'rover-network-e-moltbook')!
      expect((g.fontes ?? []).length, name).toBeGreaterThanOrEqual(2)
      expect((g.fontes ?? []).some((f) => f.url === 'https://www.moltbook.com/skill.md'), name).toBe(true)
    }
  })
  it('the entity names are always the same: no spelling variation', () => {
    const all = texts().map(([, t]) => t).join('\n')
    expect(all).not.toMatch(/Rover-Network|RoverNetwork|Rover network\b|rover network\b|Rover Hanger|RoverHangar|Rovermark|Rove Mark/)
  })
})

describe('clean text: no em dash, no machine tic, no emoji', () => {
  it('nothing the person reads matches a forbidden rule', () => {
    const failures: string[] = []
    for (const [where, t] of texts()) {
      for (const re of FORBIDDEN) if (re.test(t)) failures.push(`${where}: ${re} em "${t.slice(0, 60)}"`)
      if (EMOJI.test(t)) failures.push(`${where}: emoji`)
    }
    expect(failures).toEqual([])
  })
  it('no paragraph opens with "Além disso,"', () => {
    for (const [where, t] of texts()) expect(/^além disso,/i.test(t.trim()), where).toBe(false)
  })
  it('the detector bites: plants an em dash, a cliche and an emoji and flags each one', () => {
    const accuses = (t: string) => FORBIDDEN.some((re) => re.test(t)) || EMOJI.test(t)
    expect(accuses('uma coisa — outra')).toBe(true)
    expect(accuses('de 1 – 2')).toBe(true)
    expect(accuses('Mergulhe nesta solução inovadora')).toBe(true)
    expect(accuses('a seamless experience')).toBe(true)
    expect(accuses('pronto ✅')).toBe(true)
    expect(accuses('um texto limpo e direto')).toBe(false)
  })
})

describe('the voice rule: nothing that would serve any other company in the sector', () => {
  it('every short answer names at least one concrete noun of the product', () => {
    const concrete = /rover|relé|relay|protocolo|protocol|aprova|approv|handle|@|comunidade|communit|fórum|forum|grafo|graph|emissor|issuer|moderaç|moderat|rede|network|Rovemark|Hangar|chave|key|selo|badge|página|page|tópico|topic|denúncia|report|apela|appeal|recado|wall note|depoimento|testimonial/i
    const without: string[] = []
    for (const { nome: name, faq, guias: guides } of LANGUAGES) {
      for (const f of faq) if (!concrete.test(f.respostaCurta)) without.push(`faq.${name}.${f.id}`)
      for (const g of guides) if (!concrete.test(g.respostaCurta)) without.push(`guia.${name}.${g.slug}`)
    }
    expect(without).toEqual([])
  })
})

describe('canonical entity', () => {
  it('has the 1-sentence, 3-sentence and 1-paragraph description, in both languages, and the 3-sentence one has 3 sentences', () => {
    for (const l of ['pt', 'en'] as const) {
      expect(entity.oneSentence[l].split(/(?<=\.)\s/).length, `one sentence ${l}`).toBe(1)
      expect(entity.threeSentences[l].split(/(?<=\.)\s/).length, `three sentences ${l}`).toBe(3)
      expect(words(entity.paragraph[l]), `paragraph ${l}`).toBeGreaterThan(100)
      expect(entity.whatItIs[l].length).toBeGreaterThanOrEqual(3)
      expect(entity.whatItIsNot[l].length).toBeGreaterThanOrEqual(4)
    }
  })
  it('never invents the repository address and declares the license and the contact', () => {
    expect(entity.repository).toBeNull()
    expect(entity.licenca).toBe('AGPL-3.0-or-later')
    expect(entity.contato.seguranca).toBe('security@rovemark.co')
    expect(entity.demonstracao.startsWith('https://')).toBe(true)
  })
  it('each fact points to the repository file it comes from', () => {
    for (const f of entity.fatos) expect(f.fonte).toMatch(/\.(md|js)|LICENSE/)
    expect(entity.fatos.length).toBeGreaterThanOrEqual(6)
  })
  // Decision of 2026-11-24, evening: folgali opened as a public beta, with no invitation. Before, this guard demanded "it is not a network open to the public".
  it('what the network is NOT says it is in public beta (not a finished network) and that it does not handle money', () => {
    expect(entity.whatItIsNot.pt.join(' ')).toMatch(/não é uma rede pronta: está em beta pública/i)
    expect(entity.whatItIsNot.pt.join(' ')).toMatch(/dinheiro/i)
    expect(entity.whatItIsNot.en.join(' ')).toMatch(/not a finished network: it is in public beta/i)
    expect(entity.whatItIsNot.en.join(' ')).toMatch(/money/i)
  })
  it('does not claim legal compliance in any text', () => {
    const claims = /em conformidade com a lgpd|compliant with|totalmente conforme|aprovado pelo jur[ií]dico|legally compliant|gdpr[- ]compliant|lgpd[- ]compliant/i
    for (const [where, t] of texts()) expect(claims.test(t), where).toBe(false)
  })
  it('no text promises a launch date, a price, a customer or a usage statistic', () => {
    const promise = /\b(lançamos|lança em|vai lançar|launches? in|launching in|will launch)\b|US\$|R\$\s?\d|\d+\s?(mil|milhões)\s+(usuários|pessoas|rovers)|\b\d+\s?(thousand|million)\s+(users|people|rovers)\b/i
    for (const [where, t] of texts()) expect(promise.test(t), `${where}: "${t.slice(0, 80)}"`).toBe(false)
  })
})

describe('the shape test bites', () => {
  it('a short answer of 20 words, a repeated id and a nonexistent related entry would be flagged', () => {
    expect(words('uma duas três quatro cinco seis sete oito nove dez onze doze treze catorze quinze dezesseis dezessete dezoito dezenove vinte')).toBe(20)
    const short: Faq = { ...faqPt[0], respostaCurta: 'curta demais' }
    expect(words(short.respostaCurta) < 35).toBe(true)
    const ids = [...faqPt.map((f) => f.id), faqPt[0].id]
    expect(new Set(ids).size).not.toBe(ids.length)
    const v: GlossaryEntry = { ...glossaryEntriesPt[0], relacionados: ['nao-existe'] }
    expect(new Set(glossaryEntriesPt.map((x) => x.slug)).has(v.relacionados![0])).toBe(false)
    const g: Guide = { ...guidesPt[0], perguntas: ['nao-existe'] }
    expect(new Set(faqPt.map((f) => f.id)).has(g.perguntas![0])).toBe(false)
    expect(find(faqPt, 'nao-existe')).toBeUndefined()
  })
})
