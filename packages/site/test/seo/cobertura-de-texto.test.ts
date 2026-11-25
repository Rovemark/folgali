// Todo texto que o site mostra e as máquinas leem: cobertura (cada rota tem título, descrição e rótulo, nos dois idiomas), paridade
// entre pt e en, tamanho, ligações internas e higiene (sem travessão, sem cacoete de IA, sem a afirmação errada).
import { describe, expect, it } from 'vitest'
import { GRUPOS_DE_FAQ, GUIAS_OBRIGATORIOS, VERBETES_OBRIGATORIOS } from '@/conteudo/obrigatorios'
import { conteudoDe, entidade } from '@/conteudo'
import { PRONTOS, type Pronto } from '@/lib/i18n'
import { instDict, metaDe, paginaDe, rodapeDict, rotuloDe } from '@/lib/i18n-extra'
import { ROTAS, SECOES_DO_RODAPE } from '@/lib/seo/rotas'

/** Chinês, japonês e coreano dizem em poucos caracteres o que o latino diz em muitos: os mínimos de tamanho são menores (máximos também). */
const cjk = (l: string) => l === 'zh' || l === 'ja' || l === 'ko'

const internas = ROTAS.filter((r) => r.externo === undefined && r.id !== 'aprovacaoHumana')
// `meuRover` (/inicio) é tela do app, como aprovar e avisos: tem título e descrição (para o metadado), mas não tem página de texto institucional
const comTexto = internas.filter((r) => !['inicio', 'linha', 'descobrir', 'comunidades', 'paginas', 'buscar', 'sobre', 'registroPublico', 'entrar', 'entrarPessoa', 'entrarAgente', 'meuRover'].includes(r.id))

const chaves = (o: unknown, prefixo = ''): string[] =>
  o !== null && typeof o === 'object' && !Array.isArray(o) ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => chaves(v, `${prefixo}${k}.`)) : [prefixo.slice(0, -1)]

describe('cobertura', () => {
  it('toda rota interna tem título e descrição, em cada idioma, com tamanho de metadado', () => {
    for (const l of PRONTOS) {
      for (const r of internas) {
        const m = metaDe(l, r.id)
        expect(m.titulo.length, `${l} ${r.id} título`).toBeGreaterThanOrEqual(cjk(l) ? 2 : 3)
        expect(m.titulo.length, `${l} ${r.id} título`).toBeLessThanOrEqual(60)
        expect(m.descricao.length, `${l} ${r.id} descrição`).toBeGreaterThanOrEqual(cjk(l) ? 20 : 50)
        expect(m.descricao.length, `${l} ${r.id} descrição`).toBeLessThanOrEqual(cjk(l) ? 120 : 190)
      }
    }
  })
  it('todo item do rodapé tem rótulo, e toda coluna tem título', () => {
    for (const l of PRONTOS) {
      for (const r of ROTAS.filter((x) => x.secao !== null)) expect(rotuloDe(l, r.id).length, `${l} ${r.id}`).toBeGreaterThanOrEqual(cjk(l) ? 1 : 2)
      for (const s of SECOES_DO_RODAPE) expect((rodapeDict(l).secoes as Record<string, string>)[s], `${l} ${s}`).toBeTruthy()
    }
  })
  it('as seis colunas existem e nenhuma está vazia', () => {
    for (const s of SECOES_DO_RODAPE) expect(ROTAS.filter((r) => r.secao === s).length, s).toBeGreaterThan(0)
  })
  it('as páginas de texto têm resposta curta de uma ou duas frases (até 360 caracteres) e data ISO', () => {
    for (const l of PRONTOS) {
      for (const r of comTexto) {
        const p = paginaDe(l, r.id)
        expect(p.respostaCurta.length, `${l} ${r.id}`).toBeGreaterThan(cjk(l) ? 20 : 40)
        expect(p.respostaCurta.length, `${l} ${r.id}`).toBeLessThanOrEqual(360)
        expect(p.atualizadoEm, `${l} ${r.id}`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      }
    }
  })
  it('todo "veja também" aponta para uma rota que existe e tem rótulo', () => {
    for (const l of PRONTOS) {
      for (const r of comTexto) {
        for (const id of paginaDe(l, r.id).ver) {
          expect(ROTAS.some((x) => x.id === id), `${l} ${r.id} -> ${id}`).toBe(true)
          expect(() => rotuloDe(l, id)).not.toThrow()
        }
      }
    }
  })
})

describe('paridade entre os idiomas', () => {
  it('pt e en têm exatamente as mesmas chaves, nos três arquivos', () => {
    const pt = chaves(instDict('pt')).filter((k) => !/\.\d+(\.|$)/.test(k))
    const en = chaves(instDict('en')).filter((k) => !/\.\d+(\.|$)/.test(k))
    expect(en).toEqual(pt)
    expect(chaves(rodapeDict('en'))).toEqual(chaves(rodapeDict('pt')))
  })
  it('as listas (seções, itens, rotas da API) têm o mesmo tamanho nos dois idiomas', () => {
    for (const r of comTexto) {
      const [a, b] = [paginaDe('pt', r.id), paginaDe('en', r.id)]
      expect(b.secoes.length, r.id).toBe(a.secoes.length)
      a.secoes.forEach((s, i) => expect(b.secoes[i].lista?.length ?? 0, `${r.id} #${i}`).toBe(s.lista?.length ?? 0))
    }
    const [pa, ea] = [instDict('pt').paginas.api, instDict('en').paginas.api]
    expect(ea.grupos.map((g) => g.rotas.length)).toEqual(pa.grupos.map((g) => g.rotas.length))
    // a rota (coluna 1) é a mesma nos dois idiomas, só a explicação muda
    expect(ea.grupos.flatMap((g) => g.rotas.map((x) => x[0]))).toEqual(pa.grupos.flatMap((g) => g.rotas.map((x) => x[0])))
  })
})

describe('conteúdo editorial: o que o resto do site pressupõe', () => {
  it('existem os guias e os verbetes obrigatórios, em cada idioma', () => {
    for (const l of PRONTOS) {
      const c = conteudoDe(l)
      for (const s of GUIAS_OBRIGATORIOS) expect(c.guias.some((g) => g.slug === s), `${l} guia ${s}`).toBe(true)
      for (const s of VERBETES_OBRIGATORIOS) expect(c.verbetes.some((v) => v.slug === s), `${l} verbete ${s}`).toBe(true)
    }
  })
  it('slugs e ids não repetem, e os guias e verbetes têm os mesmos slugs nos dois idiomas (hreflang)', () => {
    for (const l of PRONTOS) {
      const c = conteudoDe(l)
      for (const lista of [c.guias.map((g) => g.slug), c.verbetes.map((v) => v.slug), c.faq.map((f) => f.id), c.novidades.map((n) => n.id)]) expect(new Set(lista).size, l).toBe(lista.length)
    }
    expect(conteudoDe('en').guias.map((g) => g.slug).sort()).toEqual(conteudoDe('pt').guias.map((g) => g.slug).sort())
    expect(conteudoDe('en').verbetes.map((g) => g.slug).sort()).toEqual(conteudoDe('pt').verbetes.map((g) => g.slug).sort())
  })
  it('as perguntas citadas por um guia existem, e os grupos de FAQ são conhecidos', () => {
    for (const l of PRONTOS) {
      const c = conteudoDe(l)
      for (const g of c.guias) for (const id of g.perguntas ?? []) expect(c.faq.some((f) => f.id === id), `${l} ${g.slug} -> ${id}`).toBe(true)
      // pt e en têm os grupos nomeados em GRUPOS_DE_FAQ; nos outros dez idiomas o grupo é a tradução do mesmo grupo do português,
      // então vale a posição: a pergunta N cai no grupo de mesma ordem de aparição que no português.
      if (l === 'pt' || l === 'en') for (const f of c.faq) expect((GRUPOS_DE_FAQ as readonly string[]).includes(f.grupo), `${l} ${f.id} grupo ${f.grupo}`).toBe(true)
      else {
        const ordem = (lista: readonly { grupo: string }[]) => lista.map((f) => f.grupo).filter((g, i, a) => a.indexOf(g) === i)
        const pt = conteudoDe('pt').faq
        const gpt = ordem(pt), gl = ordem(c.faq)
        expect(gl.length, `${l} número de grupos`).toBe(gpt.length)
        for (const f of c.faq) expect(gl.indexOf(f.grupo), `${l} ${f.id}`).toBe(gpt.indexOf(pt.find((x) => x.id === f.id)!.grupo))
      }
      for (const v of c.verbetes) for (const rel of v.relacionados ?? []) expect(c.verbetes.some((x) => x.slug === rel), `${l} ${v.slug} -> ${rel}`).toBe(true)
    }
  })
  it('datas em ISO; títulos de guia dentro do limite de 110 caracteres do TechArticle', () => {
    for (const l of PRONTOS) {
      const c = conteudoDe(l)
      for (const d of [...c.faq.map((f) => f.atualizadoEm), ...c.verbetes.map((v) => v.atualizadoEm), ...c.guias.map((g) => g.atualizadoEm), ...c.novidades.map((n) => n.data)]) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      for (const g of c.guias) expect(g.titulo.length, g.slug).toBeLessThanOrEqual(110)
    }
  })
  it('a resposta curta de cada FAQ e de cada guia tem de 40 a 360 caracteres, e a definição curta de cada verbete é uma frase', () => {
    for (const l of PRONTOS) {
      const c = conteudoDe(l)
      for (const f of c.faq) {
        expect(f.respostaCurta.length, f.id).toBeGreaterThan(cjk(l) ? 20 : 40)
        expect(f.respostaCurta.length, f.id).toBeLessThanOrEqual(360)
      }
      for (const g of c.guias) expect(g.respostaCurta.length, g.slug).toBeGreaterThan(cjk(l) ? 20 : 40)
      for (const v of c.verbetes) expect(v.definicaoCurta.length, v.slug).toBeLessThanOrEqual(220)
    }
  })
})

describe('higiene do texto', () => {
  const tudo = (l: Pronto) => JSON.stringify([instDict(l), rodapeDict(l), conteudoDe(l)])
  it('sem travessão nem meia-risca, nos dois idiomas', () => {
    for (const l of PRONTOS) expect(tudo(l)).not.toMatch(/[—–]/)
  })
  it('sem os cacoetes de texto de máquina', () => {
    const proibidos = [/mergulh/i, /desbloque/i, /potencializ/i, /alaveng/i, /robust[oa]/i, /sem esforço/i, /solução inovadora/i, /revolucion[aá]ri/i, /poderos[oa]/i, /em constante evolução/i, /no mundo de hoje/i, /na era da ia/i, /divisor de águas/i, /experiência única/i, /\bnão apenas\b.*\bmas também\b/i, /\bdelve\b/i, /\bseamless/i, /\bunlock/i, /\brobust\b/i, /cutting-edge/i, /game[- ]chang/i, /in today's/i]
    // a lista é de clichê em português (e o equivalente em inglês onde existe); em espanhol "desbloquear" é palavra comum, então só pt e en
    for (const l of PRONTOS.filter((x) => x === 'pt' || x === 'en')) for (const re of proibidos) expect(tudo(l), `${l} ${re}`).not.toMatch(re)
    for (const l of PRONTOS.filter((x) => x === 'pt' || x === 'en')) expect(tudo(l), l).not.toMatch(/^\s*Além disso,/m)
  })
  it('nenhum emoji no texto', () => {
    // as faixas de emoji de verdade; o © do rodapé não conta
    for (const l of PRONTOS) expect(tudo(l)).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{FE0F}]/u)
  })
  it('não afirma que a rede está no ar para o público, nem que há cadastro aberto, nem que há app de celular', () => {
    for (const l of PRONTOS) {
      const t = tudo(l)
      expect(t).not.toMatch(/cadastre-se agora|sign up now|baixe na app store|download on the app store|disponível no google play/i)
    }
  })
  it('as afirmações que o texto repete batem com o protocolo (versão, tamanho, janelas)', () => {
    for (const l of PRONTOS) {
      const t = tudo(l)
      expect(t).toContain('0.3.1')
      expect(t).toContain('12288')
      expect(t).toMatch(/14(?!\d)/)
      expect(t).toContain('120')
    }
    // a revisão que o site declara, no formato "versão 0.3, revisão X" (pt e en; os dez idiomas sobem na etapa de tradução)
    const r = entidade.revisaoDoRascunho
    expect(tudo('pt')).toContain(`versão 0.3, revisão ${r}`)
    expect(tudo('en')).toContain(`version 0.3, revision ${r}`)
    expect(tudo('pt')).not.toMatch(/está na versão 0\.3\.\d/)
    expect(tudo('en')).not.toMatch(/is (?:open and )?at version 0\.3\.\d/)
  })
  it('não promete repositório público que não existe', () => {
    for (const l of PRONTOS) expect(tudo(l)).not.toMatch(/github\.com\/(rovemark|rover)/i)
  })
})
