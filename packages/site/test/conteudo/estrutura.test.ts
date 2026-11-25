// O conteúdo editorial (FAQ, glossário, guias e entidade) vira citação de buscador e de IA, então um erro vira fato errado
// espalhado. Este teste prova a forma e as regras de texto: tipos, contagens, os dois idiomas com os mesmos ids, resposta curta
// de 35 a 60 palavras, referências que existem, fontes em https, e nenhum travessão nem cacoete de texto de máquina.
import { describe, expect, it } from 'vitest'
import { entidade, faqEn, faqPt, guiasEn, guiasPt, verbetesEn, verbetesPt } from '@/conteudo'
import type { Faq, Guia, Verbete } from '@/conteudo'

const IDIOMAS = [
  { nome: 'pt', faq: faqPt, verbetes: verbetesPt, guias: guiasPt },
  { nome: 'en', faq: faqEn, verbetes: verbetesEn, guias: guiasEn },
] as const

// A mesma regra de texto de test/conteudo.test.ts, mais os cacoetes da casa. Nada que a pessoa lê pode casar.
const PROIBIDAS = [
  /—/, /–/,
  /não apenas.*mas também/i, /mergulhe/i, /desbloqueie/i, /potencializ/i, /alavanc/i, /robust[oa]/i, /sem esforço/i,
  /solução inovadora/i, /revolucionári/i, /poderos[oa]/i, /em constante evolução/i, /no mundo de hoje/i, /na era da ia/i,
  /divisor de águas/i, /experiência única/i, /^além disso,/i,
  /\bseamless/i, /\bdelve\b/i, /\bunlock/i, /\bleverage/i, /\bpowerful/i, /game[- ]changer/i, /in today's world/i, /\brobust\b/i,
  /\bnot just\b.*\bbut\b/i, /\bin the age of ai\b/i, /\bcutting[- ]edge\b/i, /\bgroundbreaking\b/i, /\brevolutionary\b/i,
]
const EMOJI = /\p{Extended_Pictographic}/u
const palavras = (t: string) => t.trim().split(/\s+/).filter(Boolean).length

/** Todo texto que a pessoa lê, com um rótulo de onde veio. O código dos guias entra: também não pode ter travessão. */
function textos(): Array<[string, string]> {
  const lista: Array<[string, string]> = []
  for (const { nome, faq, verbetes, guias } of IDIOMAS) {
    for (const f of faq) lista.push([`faq.${nome}.${f.id}.pergunta`, f.pergunta], [`faq.${nome}.${f.id}.curta`, f.respostaCurta], [`faq.${nome}.${f.id}.resposta`, f.resposta], [`faq.${nome}.${f.id}.grupo`, f.grupo])
    for (const v of verbetes) lista.push([`verbete.${nome}.${v.slug}.termo`, v.termo], [`verbete.${nome}.${v.slug}.curta`, v.definicaoCurta], [`verbete.${nome}.${v.slug}.definicao`, v.definicao])
    for (const g of guias) {
      lista.push([`guia.${nome}.${g.slug}.titulo`, g.titulo], [`guia.${nome}.${g.slug}.descricao`, g.descricao], [`guia.${nome}.${g.slug}.curta`, g.respostaCurta])
      g.secoes.forEach((s, i) => {
        lista.push([`guia.${nome}.${g.slug}.s${i}.titulo`, s.titulo])
        s.paragrafos.forEach((p, j) => lista.push([`guia.${nome}.${g.slug}.s${i}.p${j}`, p]))
        ;(s.lista ?? []).forEach((l, j) => lista.push([`guia.${nome}.${g.slug}.s${i}.l${j}`, l]))
        if (s.codigo) lista.push([`guia.${nome}.${g.slug}.s${i}.codigo`, s.codigo.texto])
      })
      for (const fonte of g.fontes ?? []) lista.push([`guia.${nome}.${g.slug}.fonte`, fonte.titulo])
    }
  }
  const dupla = (rotulo: string, d: { pt: string; en: string }) => lista.push([`${rotulo}.pt`, d.pt], [`${rotulo}.en`, d.en])
  dupla('entidade.umaFrase', entidade.umaFrase)
  dupla('entidade.tresFrases', entidade.tresFrases)
  dupla('entidade.paragrafo', entidade.paragrafo)
  dupla('entidade.contato', entidade.contato.observacao)
  for (const l of ['pt', 'en'] as const) {
    entidade.oQueE[l].forEach((t, i) => lista.push([`entidade.oQueE.${l}.${i}`, t]))
    entidade.oQueNaoE[l].forEach((t, i) => lista.push([`entidade.oQueNaoE.${l}.${i}`, t]))
  }
  for (const f of entidade.fatos) { dupla(`entidade.fato.${f.fonte}.rotulo`, f.rotulo); dupla(`entidade.fato.${f.fonte}.valor`, f.valor) }
  return lista
}

const achar = <T extends { id?: string; slug?: string }>(lista: readonly T[], chave: string) => lista.find((x) => (x.id ?? x.slug) === chave)

describe('contagens e forma', () => {
  it('há o mínimo pedido em cada idioma: 40 perguntas, 30 verbetes e 9 guias', () => {
    for (const { nome, faq, verbetes, guias } of IDIOMAS) {
      expect(faq.length, `faq ${nome}`).toBeGreaterThanOrEqual(40)
      expect(verbetes.length, `verbetes ${nome}`).toBeGreaterThanOrEqual(30)
      expect(guias.length, `guias ${nome}`).toBeGreaterThanOrEqual(9)
    }
  })

  it('o FAQ cobre os oito grupos pedidos, em cada idioma', () => {
    for (const { nome, faq } of IDIOMAS) expect(new Set(faq.map((f) => f.grupo)).size, nome).toBe(8)
  })

  it('os campos são texto não vazio e a data é uma data de verdade', () => {
    const dataOk = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`))
    for (const { nome, faq, verbetes, guias } of IDIOMAS) {
      for (const f of faq) {
        for (const c of ['id', 'grupo', 'pergunta', 'respostaCurta', 'resposta'] as const) expect(f[c].trim().length, `${nome} ${f.id}.${c}`).toBeGreaterThan(0)
        expect(dataOk(f.atualizadoEm), `${nome} ${f.id} data`).toBe(true)
        expect(f.pergunta.trim().endsWith('?'), `${nome} ${f.id} termina em ?`).toBe(true)
      }
      for (const v of verbetes) {
        for (const c of ['slug', 'termo', 'definicaoCurta', 'definicao'] as const) expect(v[c].trim().length, `${nome} ${v.slug}.${c}`).toBeGreaterThan(0)
        expect(dataOk(v.atualizadoEm), `${nome} ${v.slug} data`).toBe(true)
        expect(v.definicao.length, `${nome} ${v.slug} a definição completa não é menor que a curta`).toBeGreaterThanOrEqual(v.definicaoCurta.length)
      }
      for (const g of guias) {
        for (const c of ['slug', 'titulo', 'descricao', 'respostaCurta'] as const) expect(g[c].trim().length, `${nome} ${g.slug}.${c}`).toBeGreaterThan(0)
        expect(dataOk(g.atualizadoEm), `${nome} ${g.slug} data`).toBe(true)
        expect(g.secoes.length, `${nome} ${g.slug} seções`).toBeGreaterThanOrEqual(4)
        for (const s of g.secoes) { expect(s.titulo.trim().length).toBeGreaterThan(0); expect(s.paragrafos.length, `${nome} ${g.slug} ${s.titulo}`).toBeGreaterThanOrEqual(1) }
        expect(g.descricao.length, `${nome} ${g.slug} a descrição cabe em um resultado de busca`).toBeLessThanOrEqual(200)
      }
    }
  })

  it('o slug e o id são únicos e só têm letras minúsculas, números e hífen', () => {
    for (const { nome, faq, verbetes, guias } of IDIOMAS) {
      for (const [rotulo, chaves] of [['faq', faq.map((f) => f.id)], ['verbetes', verbetes.map((v) => v.slug)], ['guias', guias.map((g) => g.slug)]] as const) {
        expect(new Set(chaves).size, `${rotulo} ${nome} tem repetido`).toBe(chaves.length)
        for (const c of chaves) expect(c, `${rotulo} ${nome}`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      }
    }
  })
})

describe('os dois idiomas dizem a mesma coisa', () => {
  it('têm os mesmos ids de FAQ, na mesma ordem e no mesmo grupo', () => {
    expect(faqEn.map((f) => f.id)).toEqual(faqPt.map((f) => f.id))
    const grupos = (l: Faq[]) => { const vistos: string[] = []; return l.map((f) => { if (!vistos.includes(f.grupo)) vistos.push(f.grupo); return vistos.indexOf(f.grupo) }) }
    expect(grupos(faqEn)).toEqual(grupos(faqPt))
  })
  it('têm os mesmos slugs de verbete e de guia, na mesma ordem', () => {
    expect(verbetesEn.map((v) => v.slug)).toEqual(verbetesPt.map((v) => v.slug))
    expect(guiasEn.map((g) => g.slug)).toEqual(guiasPt.map((g) => g.slug))
  })
  it('cada guia tem as mesmas perguntas, o mesmo número de seções e as mesmas fontes nos dois idiomas', () => {
    guiasPt.forEach((g, i) => {
      const e = guiasEn[i]
      expect(e.perguntas ?? [], g.slug).toEqual(g.perguntas ?? [])
      expect(e.secoes.length, g.slug).toBe(g.secoes.length)
      expect((e.fontes ?? []).map((f) => f.url), g.slug).toEqual((g.fontes ?? []).map((f) => f.url))
      expect(e.secoes.map((s) => Boolean(s.codigo)), g.slug).toEqual(g.secoes.map((s) => Boolean(s.codigo)))
    })
  })
  it('o código dos guias é o mesmo nos dois idiomas, tirando comentários e textos de exemplo', () => {
    guiasPt.forEach((g, i) => {
      g.secoes.forEach((s, j) => {
        const a = s.codigo, b = guiasEn[i].secoes[j].codigo
        if (!a || !b) return
        expect(b.linguagem, g.slug).toBe(a.linguagem)
        const esqueleto = (t: string) => t.split('\n').map((l) => l.trim()).filter((l) => !l.startsWith('//')).map((l) => l.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""').replace(/\/\/.*$/, '').trim()).join('\n')
        expect(esqueleto(b.texto), `${g.slug} secao ${j}`).toBe(esqueleto(a.texto))
      })
    })
  })
})

describe('resposta curta de 35 a 60 palavras (AEO)', () => {
  it('toda pergunta do FAQ e todo guia abre com uma resposta curta nessa faixa', () => {
    const fora: string[] = []
    for (const { nome, faq, guias } of IDIOMAS) {
      for (const f of faq) if (palavras(f.respostaCurta) < 35 || palavras(f.respostaCurta) > 60) fora.push(`faq.${nome}.${f.id}: ${palavras(f.respostaCurta)} palavras`)
      for (const g of guias) if (palavras(g.respostaCurta) < 35 || palavras(g.respostaCurta) > 60) fora.push(`guia.${nome}.${g.slug}: ${palavras(g.respostaCurta)} palavras`)
    }
    expect(fora).toEqual([])
  })
  it('a resposta completa traz mais do que a curta repete', () => {
    for (const { nome, faq } of IDIOMAS) for (const f of faq) expect(palavras(f.resposta), `${nome} ${f.id}`).toBeGreaterThan(40)
  })
})

describe('referências que existem', () => {
  it('todo relacionado de verbete aponta um slug que existe e não aponta o próprio verbete', () => {
    for (const { nome, verbetes } of IDIOMAS) {
      const slugs = new Set(verbetes.map((v) => v.slug))
      for (const v of verbetes) for (const r of v.relacionados ?? []) { expect(slugs.has(r), `${nome} ${v.slug} -> ${r}`).toBe(true); expect(r).not.toBe(v.slug) }
    }
  })
  it('toda pergunta citada por um guia existe no FAQ do mesmo idioma', () => {
    for (const { nome, faq, guias } of IDIOMAS) {
      const ids = new Set(faq.map((f) => f.id))
      for (const g of guias) for (const p of g.perguntas ?? []) expect(ids.has(p), `${nome} ${g.slug} -> ${p}`).toBe(true)
    }
  })
  it('toda fonte tem título e uma URL https bem formada', () => {
    for (const { nome, faq, guias } of IDIOMAS) {
      const fontes = [...faq.flatMap((f) => f.fontes ?? []), ...guias.flatMap((g) => g.fontes ?? [])]
      for (const f of fontes) {
        expect(f.titulo.trim().length, nome).toBeGreaterThan(0)
        const u = new URL(f.url)
        expect(u.protocol, `${nome} ${f.url}`).toBe('https:')
        expect(u.hostname.includes('.'), f.url).toBe(true)
      }
    }
  })
  it('o comparativo com o Moltbook cita as fontes e só fala de terceiros com URL', () => {
    for (const { nome, guias } of IDIOMAS) {
      const g = guias.find((x) => x.slug === 'rover-network-e-moltbook')!
      expect((g.fontes ?? []).length, nome).toBeGreaterThanOrEqual(2)
      expect((g.fontes ?? []).some((f) => f.url === 'https://www.moltbook.com/skill.md'), nome).toBe(true)
    }
  })
  it('os nomes das entidades são sempre os mesmos: nenhuma variação de grafia', () => {
    const todos = textos().map(([, t]) => t).join('\n')
    expect(todos).not.toMatch(/Rover-Network|RoverNetwork|Rover network\b|rover network\b|Rover Hanger|RoverHangar|Rovermark|Rove Mark/)
  })
})

describe('texto limpo: nenhum travessão, nenhum cacoete de máquina, nenhum emoji', () => {
  it('nada do que a pessoa lê casa com uma regra proibida', () => {
    const falhas: string[] = []
    for (const [onde, t] of textos()) {
      for (const re of PROIBIDAS) if (re.test(t)) falhas.push(`${onde}: ${re} em "${t.slice(0, 60)}"`)
      if (EMOJI.test(t)) falhas.push(`${onde}: emoji`)
    }
    expect(falhas).toEqual([])
  })
  it('nenhum parágrafo abre com "Além disso,"', () => {
    for (const [onde, t] of textos()) expect(/^além disso,/i.test(t.trim()), onde).toBe(false)
  })
  it('o detector morde: planta um travessão, um clichê e um emoji e acusa cada um', () => {
    const acusa = (t: string) => PROIBIDAS.some((re) => re.test(t)) || EMOJI.test(t)
    expect(acusa('uma coisa — outra')).toBe(true)
    expect(acusa('de 1 – 2')).toBe(true)
    expect(acusa('Mergulhe nesta solução inovadora')).toBe(true)
    expect(acusa('a seamless experience')).toBe(true)
    expect(acusa('pronto ✅')).toBe(true)
    expect(acusa('um texto limpo e direto')).toBe(false)
  })
})

describe('a regra de voz: nada que serviria a qualquer outra empresa do setor', () => {
  it('toda resposta curta nomeia pelo menos um substantivo concreto do produto', () => {
    const concretos = /rover|relé|relay|protocolo|protocol|aprova|approv|handle|@|comunidade|communit|fórum|forum|grafo|graph|emissor|issuer|moderaç|moderat|rede|network|Rovemark|Hangar|chave|key|selo|badge|página|page|tópico|topic|denúncia|report|apela|appeal|recado|wall note|depoimento|testimonial/i
    const sem: string[] = []
    for (const { nome, faq, guias } of IDIOMAS) {
      for (const f of faq) if (!concretos.test(f.respostaCurta)) sem.push(`faq.${nome}.${f.id}`)
      for (const g of guias) if (!concretos.test(g.respostaCurta)) sem.push(`guia.${nome}.${g.slug}`)
    }
    expect(sem).toEqual([])
  })
})

describe('entidade canônica', () => {
  it('tem a descrição de 1 frase, de 3 frases e de 1 parágrafo, nos dois idiomas, e a de 3 frases tem 3 frases', () => {
    for (const l of ['pt', 'en'] as const) {
      expect(entidade.umaFrase[l].split(/(?<=\.)\s/).length, `uma frase ${l}`).toBe(1)
      expect(entidade.tresFrases[l].split(/(?<=\.)\s/).length, `três frases ${l}`).toBe(3)
      expect(palavras(entidade.paragrafo[l]), `parágrafo ${l}`).toBeGreaterThan(100)
      expect(entidade.oQueE[l].length).toBeGreaterThanOrEqual(3)
      expect(entidade.oQueNaoE[l].length).toBeGreaterThanOrEqual(4)
    }
  })
  it('nunca inventa o endereço do repositório e declara a licença e o contato', () => {
    expect(entidade.repositorio).toBeNull()
    expect(entidade.licenca).toBe('AGPL-3.0-or-later')
    expect(entidade.contato.seguranca).toBe('security@roverhangar.com')
    expect(entidade.demonstracao.startsWith('https://')).toBe(true)
  })
  it('cada fato aponta o arquivo do repositório de onde vem', () => {
    for (const f of entidade.fatos) expect(f.fonte).toMatch(/\.(md|js)|LICENSE/)
    expect(entidade.fatos.length).toBeGreaterThanOrEqual(6)
  })
  it('o que a rede NÃO é diz que não está aberta ao público e que não mexe com dinheiro', () => {
    expect(entidade.oQueNaoE.pt.join(' ')).toMatch(/não é uma rede aberta ao público/i)
    expect(entidade.oQueNaoE.pt.join(' ')).toMatch(/dinheiro/i)
    expect(entidade.oQueNaoE.en.join(' ')).toMatch(/not open to the public/i)
    expect(entidade.oQueNaoE.en.join(' ')).toMatch(/money/i)
  })
  it('não afirma conformidade legal em nenhum texto', () => {
    const afirma = /em conformidade com a lgpd|compliant with|totalmente conforme|aprovado pelo jur[ií]dico|legally compliant|gdpr[- ]compliant|lgpd[- ]compliant/i
    for (const [onde, t] of textos()) expect(afirma.test(t), onde).toBe(false)
  })
  it('nenhum texto promete data de lançamento, preço, cliente ou estatística de uso', () => {
    const promessa = /\b(lançamos|lança em|vai lançar|launches? in|launching in|will launch)\b|US\$|R\$\s?\d|\d+\s?(mil|milhões)\s+(usuários|pessoas|rovers)|\b\d+\s?(thousand|million)\s+(users|people|rovers)\b/i
    for (const [onde, t] of textos()) expect(promessa.test(t), `${onde}: "${t.slice(0, 80)}"`).toBe(false)
  })
})

describe('o teste de forma morde', () => {
  it('uma resposta curta de 20 palavras, um id repetido e um relacionado inexistente seriam acusados', () => {
    expect(palavras('uma duas três quatro cinco seis sete oito nove dez onze doze treze catorze quinze dezesseis dezessete dezoito dezenove vinte')).toBe(20)
    const curta: Faq = { ...faqPt[0], respostaCurta: 'curta demais' }
    expect(palavras(curta.respostaCurta) < 35).toBe(true)
    const ids = [...faqPt.map((f) => f.id), faqPt[0].id]
    expect(new Set(ids).size).not.toBe(ids.length)
    const v: Verbete = { ...verbetesPt[0], relacionados: ['nao-existe'] }
    expect(new Set(verbetesPt.map((x) => x.slug)).has(v.relacionados![0])).toBe(false)
    const g: Guia = { ...guiasPt[0], perguntas: ['nao-existe'] }
    expect(new Set(faqPt.map((f) => f.id)).has(g.perguntas![0])).toBe(false)
    expect(achar(faqPt, 'nao-existe')).toBeUndefined()
  })
})
