// Os 12 idiomas da Rovemark (pt, en, es, fr, de, it, nl, ru, ar, zh, ja, ko) têm de ter o MESMO site: mesmas chaves, mesmos marcadores,
// mesmos números, mesmo conteúdo editorial, sem travessão, e texto próprio (não a cópia do inglês). Roda para todo idioma declarado,
// pronto ou não: um idioma só vira `pronto` no seletor quando este arquivo passa para ele.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { conteudoDe } from '@/conteudo'
import { LOCALES, META, PRONTOS, dict, type Locale } from '@/lib/i18n'
import { instDict, rodapeDict } from '@/lib/i18n-extra'
import { PACOTES } from '@/i18n/pacotes'

const DIR = path.resolve(__dirname, '../../src/i18n')
const OUTROS = LOCALES.filter((l): l is Exclude<Locale, 'pt'> => l !== 'pt')
const NOVOS = LOCALES.filter((l) => l !== 'pt' && l !== 'en')

/** Todas as folhas de texto de um objeto, com o caminho. */
function folhas(o: unknown, caminho = ''): [string, string][] {
  if (typeof o === 'string') return [[caminho, o]]
  if (Array.isArray(o)) return o.flatMap((x, i) => folhas(x, `${caminho}[${i}]`))
  if (o && typeof o === 'object') return Object.entries(o).flatMap(([k, v]) => folhas(v, caminho ? `${caminho}.${k}` : k))
  return []
}
const marcadores = (s: string) => [...s.matchAll(/\{[^{}]*\}|`[^`]*`|<\/?[a-zA-Z][^>]*>|https?:\/\/(?:[\w-]+(?:\.[\w-]+)*(?:\/[^\s)"'.,;]*[^\s)"'.,;])?)?|%[sd]/g)].map((m) => m[0]).sort().join('|')
const formasSemOrdem = (o: unknown, caminho = ''): string[] => {
  if (Array.isArray(o)) return [`${caminho}[${o.length}]`, ...o.flatMap((x, i) => formasSemOrdem(x, `${caminho}[${i}]`))]
  if (o && typeof o === 'object') return Object.entries(o).flatMap(([k, v]) => formasSemOrdem(v, caminho ? `${caminho}.${k}` : k))
  return [`${caminho}:${typeof o}`]
}
/** A ordem das chaves no arquivo não importa, só o conjunto. */
const formas = (o: unknown): string[] => formasSemOrdem(o).sort()

const PARTES = ['base', 'casa', 'entrar', 'inst', 'rodape'] as const

/**
 * Chaves novas que, nos dez idiomas traduzidos por máquina, ainda estão com o texto do inglês, à espera de tradução. Cada frente que
 * acrescenta texto deixa a lista em `docs/PEDIDOS-DE-TRADUCAO-<frente>.md` (em packages/site) e marca as chaves aqui; quem integra
 * traduz e tira daqui. Caminho no formato de `folhas([PACOTES[l], conteudoDe(l)])`.
 */
const PENDENTES_SKILL: readonly string[] = []

/**
 * Exceção TEMPORÁRIA da frente de mensagens privadas (revisão 0.4.0): chaves novas que ainda estão com o texto em inglês nos dez
 * idiomas, à espera da tradução (lista em docs/PEDIDOS-DE-TRADUCAO-dm.md, na raiz do repositório). Quem traduz tira a linha daqui, e a
 * régua de 95% volta a valer para elas. A última entrada veio da mescla com a mídia (o item de mensagem privada do guia de comparação).
 */
const PENDENTES_MENSAGENS: readonly RegExp[] = []
const pendenteMensagens = (caminho: string) => PENDENTES_MENSAGENS.some((re) => re.test(caminho))

/**
 * Exceção TEMPORÁRIA da integração da revisão 0.5.0 no site (10/11/2026), com o pedido em docs/PEDIDOS-DE-TRADUCAO-integracao.md.
 * `novas`: folhas que entraram em pt e en (as linhas 0.4.0 e 0.5.0 do histórico de versões e as cinco novidades do topo) e estão com o
 * inglês copiado nos dez idiomas; ficam fora da conta de "cópia do inglês".
 * `faqMudadas`: respostas do FAQ cujo texto em pt mudou (a revisão passou de 0.3.2 para 0.5.0, com as mensagens privadas e as imagens)
 * e que nos dez idiomas ainda têm o texto anterior; ficam fora da conferência de números até a tradução.
 * Quem traduz esvazia as duas listas. Uma pendência já resolvida faz o teste de pendências falhar, para sair daqui.
 */
const PENDENTES_INTEGRACAO: { pedido: string; novas: readonly RegExp[]; faqMudadas: readonly (readonly [string, 'respostaCurta' | 'resposta'])[] } = {
  pedido: 'docs/PEDIDOS-DE-TRADUCAO-integracao.md',
  novas: [],
  faqMudadas: [],
}
const pendenteIntegracao = (caminho: string) => PENDENTES_INTEGRACAO.novas.some((re) => re.test(caminho))
const faqMudada = (id: string, campo: 'respostaCurta' | 'resposta') => PENDENTES_INTEGRACAO.faqMudadas.some(([i, c]) => i === id && c === campo)
/** Os números e versões de um texto que a tradução tem de manter iguais. */
const numerosDe = (texto: string) => texto.replace(/\d{2}\/\d{2}\/(\d{4})/g, '$1').match(/\d+(?:\.\d+)+|\d{2,}/g) ?? []


describe('12 idiomas: mesma forma, mesmos marcadores', () => {
  it('o idioma de cada seletor existe, com direção e rótulo', () => {
    expect(LOCALES).toHaveLength(12)
    for (const l of LOCALES) {
      expect(META[l].nativo, l).toBeTruthy()
      expect(META[l].dir, l).toBe(l === 'ar' ? 'rtl' : 'ltr')
    }
  })
  for (const l of OUTROS) {
    it(`${l}: dicionários com a mesma forma do português (chaves, listas e tipos)`, () => {
      for (const parte of PARTES) expect(formas(PACOTES[l][parte]), `${l}.${parte}`).toEqual(formas(PACOTES.pt[parte]))
      expect(formas(PACOTES[l].social), `${l}.social`).toEqual(formas(PACOTES.pt.social))
    })
    it(`${l}: cada texto guarda os mesmos marcadores do português ({n}, \`código\`, URL, tag)`, () => {
      for (const parte of [...PARTES, 'social'] as const) {
        const pt = new Map(folhas(PACOTES.pt[parte]))
        for (const [c, t] of folhas(PACOTES[l][parte])) {
          if (c.endsWith('_fonte')) continue
          expect(marcadores(t), `${l}.${parte}.${c}`).toBe(marcadores(pt.get(c) ?? ''))
        }
      }
    })
    it(`${l}: sem travessão nem meia-risca em nenhum texto`, () => {
      const tudo = JSON.stringify([PACOTES[l], conteudoDe(l)])
      expect(tudo).not.toMatch(/[—–]/)
    })
  }
})

describe('12 idiomas: o conteúdo editorial tem os mesmos itens', () => {
  const pt = conteudoDe('pt')
  for (const l of OUTROS) {
    it(`${l}: mesmos ids de FAQ, slugs de verbete e guia, novidades, relacionados e perguntas citadas`, () => {
      const c = conteudoDe(l)
      expect(c.faq.map((f) => f.id)).toEqual(pt.faq.map((f) => f.id))
      expect(c.verbetes.map((v) => v.slug)).toEqual(pt.verbetes.map((v) => v.slug))
      expect(c.guias.map((g) => g.slug)).toEqual(pt.guias.map((g) => g.slug))
      expect(c.novidades.map((n) => n.id)).toEqual(pt.novidades.map((n) => n.id))
      c.verbetes.forEach((v, i) => expect(v.relacionados ?? [], v.slug).toEqual(pt.verbetes[i].relacionados ?? []))
      c.guias.forEach((g, i) => expect(g.perguntas ?? [], g.slug).toEqual(pt.guias[i].perguntas ?? []))
      c.guias.forEach((g, i) => expect(g.secoes.length, g.slug).toBe(pt.guias[i].secoes.length))
      // o bloco de código não se traduz: nos idiomas traduzidos é idêntico ao do português
      if (l !== 'en') c.guias.forEach((g, i) => g.secoes.forEach((s, j) => expect(s.codigo, `${g.slug}#${j}`).toEqual(pt.guias[i].secoes[j].codigo)))
      c.faq.forEach((f, i) => expect(f.atualizadoEm).toBe(pt.faq[i].atualizadoEm))
    })
    it(`${l}: todo número de duas casas ou mais e toda versão do português aparece igual na resposta`, () => {
      const c = conteudoDe(l)
      // número de um dígito pode virar palavra ("1 hora" vira "ساعة واحدة"), então só se exige o que é dado: 14, 500, 0.3.2, 25519...
      c.faq.forEach((f, i) => {
        // a resposta em pt que mudou e ainda espera tradução (PENDENTES_INTEGRACAO.faqMudadas) fica de fora até ser traduzida
        const ptTxt = (['respostaCurta', 'resposta'] as const).filter((campo) => !faqMudada(pt.faq[i].id, campo)).map((campo) => pt.faq[i][campo]).join(' ')
        const txt = `${f.respostaCurta} ${f.resposta}`
        // datas dd/mm/aaaa mudam de forma em cada idioma (05/11/2026 vira "2026年11月5日"): só o ano é dado
        for (const n of numerosDe(ptTxt)) expect(txt, `${l} ${f.id}: falta ${n}`).toContain(n)
      })
    })
    it(`${l}: a resposta curta cabe na regra de tamanho da escrita (palavras no alfabeto latino, cirílico e árabe; caracteres em chinês, japonês e coreano)`, () => {
      const c = conteudoDe(l)
      const cjk = l === 'zh' || l === 'ja' || l === 'ko'
      for (const f of c.faq) {
        if (cjk) {
          expect(f.respostaCurta.length, f.id).toBeGreaterThanOrEqual(30)
          expect(f.respostaCurta.length, f.id).toBeLessThanOrEqual(260)
        } else {
          const palavras = f.respostaCurta.trim().split(/\s+/).length
          expect(palavras, `${l} ${f.id}: ${palavras} palavras`).toBeGreaterThanOrEqual(28)
          expect(palavras, `${l} ${f.id}: ${palavras} palavras`).toBeLessThanOrEqual(80)
        }
      }
    })
  }
})

/**
 * Chaves novas que chegaram com o texto em pt e en e ainda esperam a tradução dos outros dez idiomas. Nesses dez, o arquivo tem o
 * inglês copiado, só para a suíte compilar. TEMPORÁRIO: quem integra traduz, tira a entrada daqui e o teste volta a cobrar texto
 * próprio. Cada entrada aponta o pedido com a lista das chaves (docs/PEDIDOS-DE-TRADUCAO-<frente>.md).
 */
const PENDENTES_PAINEL: readonly { frente: string; pedido: string; chaves: RegExp }[] = [
  // os dois avisos de conversa (0.4.0) na tela de avisos
]
const pendentePainel = (caminho: string) => PENDENTES_PAINEL.some((p) => p.chaves.test(caminho))

describe('12 idiomas: traduções pendentes (exceção temporária)', () => {
  it('cada pendência tem o pedido escrito, e o pedido existe', () => {
    for (const p of PENDENTES_PAINEL) expect(fs.existsSync(path.resolve(__dirname, '../..', p.pedido)), p.pedido).toBe(true)
  })
  for (const p of PENDENTES_PAINEL) {
    it(`${p.frente}: a exceção só cobre chaves que existem em pt e en`, () => {
      expect(folhas([PACOTES.pt]).filter(([c]) => p.chaves.test(c)).length).toBeGreaterThan(0)
      expect(folhas([PACOTES.en]).filter(([c]) => p.chaves.test(c)).length).toBe(folhas([PACOTES.pt]).filter(([c]) => p.chaves.test(c)).length)
    })
  }
})

/**
 * Exceção TEMPORÁRIA: folhas novas ou mudadas pela frente de mídia (revisão 0.5.0) que estão em inglês nos dez idiomas até o
 * integrador traduzir (lista em docs/PEDIDOS-DE-TRADUCAO-midia.md). Ficam fora da conta de "cópia do inglês". Esvazie ao traduzir.
 */
const PENDENTES_MIDIA: readonly string[] = []

describe('12 idiomas: texto próprio, não cópia do inglês', () => {
  for (const l of NOVOS) {
    it(`${l}: ao menos 80% das folhas de texto diferem do inglês (idioma pronto: 95%)`, () => {
      const en = new Map(folhas([PACOTES.en, conteudoDe('en')]))
      const proprio = folhas([PACOTES[l], conteudoDe(l)]).filter(([c, t]) => /\p{L}{3}/u.test(t) && !/^[\w./:@#%+=-]+$/.test(t) && !c.endsWith('_fonte') && !pendentePainel(c) && !pendenteMensagens(c) && !PENDENTES_SKILL.includes(c) && !PENDENTES_MIDIA.includes(c) && !pendenteIntegracao(c))
      const iguais = proprio.filter(([c, t]) => en.get(c) === t).length
      const minimo = (PRONTOS as readonly Locale[]).includes(l) ? 0.95 : 0.8
      expect(1 - iguais / proprio.length, `${l}: ${iguais} de ${proprio.length} iguais ao inglês`).toBeGreaterThanOrEqual(minimo)
    })
  }
})

describe('12 idiomas: pendências de tradução', () => {
  it('toda chave pendente existe em todos os idiomas (uma pendência velha, de chave apagada, sai da lista)', () => {
    for (const l of NOVOS) {
      const caminhos = new Set(folhas([PACOTES[l], conteudoDe(l)]).map(([c]) => c))
      for (const c of PENDENTES_SKILL) expect(caminhos.has(c), `${l}: ${c}`).toBe(true)
    }
  })
  it('integração 0.5.0: o pedido existe, cada regra de chave nova acha folhas em pt, en e nos dez, e cada FAQ mudada existe', () => {
    expect(fs.existsSync(path.resolve(__dirname, '../..', PENDENTES_INTEGRACAO.pedido)), PENDENTES_INTEGRACAO.pedido).toBe(true)
    for (const re of PENDENTES_INTEGRACAO.novas) {
      const n = folhas([PACOTES.pt, conteudoDe('pt')]).filter(([c]) => re.test(c)).length
      expect(n, String(re)).toBeGreaterThan(0)
      for (const l of OUTROS) expect(folhas([PACOTES[l], conteudoDe(l)]).filter(([c]) => re.test(c)).length, `${l} ${re}`).toBe(n)
    }
    for (const [id] of PENDENTES_INTEGRACAO.faqMudadas) expect(conteudoDe('pt').faq.some((f) => f.id === id), id).toBe(true)
  })
  it('integração 0.5.0: uma FAQ mudada que já foi traduzida (todos os números do pt em todos os idiomas) sai da lista', () => {
    const pt = conteudoDe('pt')
    for (const [id, campo] of PENDENTES_INTEGRACAO.faqMudadas) {
      const i = pt.faq.findIndex((f) => f.id === id)
      const faltando = NOVOS.some((l) => { const f = conteudoDe(l).faq[i]; return numerosDe(pt.faq[i][campo]).some((n) => !`${f.respostaCurta} ${f.resposta}`.includes(n)) })
      expect(faltando, `${id}.${campo} já está traduzida: tire de PENDENTES_INTEGRACAO.faqMudadas`).toBe(true)
    }
  })
})

describe('12 idiomas: idioma pronto', () => {
  it('cada idioma pronto monta o dicionário, o rodapé, o institucional e o conteúdo sem lançar erro', () => {
    for (const l of PRONTOS) {
      expect(dict(l).nav.linha, l).toBeTruthy()
      expect(rodapeDict(l).marca.titulo, l).toBeTruthy()
      expect(instDict(l).meta.inicio.titulo, l).toBeTruthy()
      expect(conteudoDe(l).faq.length, l).toBeGreaterThan(40)
    }
  })
  it('os arquivos de cada idioma existem em disco', () => {
    for (const l of LOCALES) for (const f of [`${l}.json`, `casa.${l}.json`, `entrar.${l}.json`, `institucional.${l}.json`, `rodape.${l}.json`]) expect(fs.existsSync(path.join(DIR, f)), f).toBe(true)
  })
})
