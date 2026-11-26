// All the text the site shows and machines read: coverage (each route has a title, description and label, in both languages), parity
// between pt and en, size, internal links and hygiene (no em dash, no AI tic, no wrong claim).
import { describe, expect, it } from 'vitest'
import { FAQ_GROUPS, REQUIRED_GUIDES, REQUIRED_GLOSSARY_ENTRIES } from '@/content/required'
import { contentOf, entity } from '@/content'
import { READY, type Ready } from '@/lib/i18n'
import { instDict, metaOf, pageOf, footerDict, labelOf } from '@/lib/i18n-extra'
import { FOOTER_COLUMNS, ROUTES, MAP_SECTIONS } from '@/lib/seo/routes'

/** Chinese, Japanese and Korean say in a few characters what Latin script says in many: the minimum sizes are smaller (maximums too). */
const cjk = (l: string) => l === 'zh' || l === 'ja' || l === 'ko'

const internal = ROUTES.filter((r) => r.externo === undefined && r.id !== 'aprovacaoHumana')
// `myRover` (/inicio) is an app screen, like approve and notices: it has a title and description (for the metadata), but no institutional text page
// the legal pages show Lex's text (src/legal), not the institutional page format; the report is a form
// `roverHangar` (/rover-hangar) is a showcase, like the cover: the text lives in showcase.<language>.json, not in the institutional file
const LEGAL = ['termos', 'privacidade', 'regras', 'cookies', 'moderacaoPolitica', 'direitosAutorais', 'idade', 'termosDesenvolvedores', 'responsabilidadeAgentes', 'denunciar']
// `ranking` and `badges` (0.10.0) are app screens like `descobrir`: title and description, no institutional page text
const withText = internal.filter((r) => !['inicio', 'linha', 'descobrir', 'comunidades', 'paginas', 'buscar', 'ranking', 'badges', 'sobre', 'registroPublico', 'entrar', 'entrarPessoa', 'entrarAgente', 'meuRover', 'roverHangar', ...LEGAL].includes(r.id))

const keys = (o: unknown, prefix = ''): string[] =>
  o !== null && typeof o === 'object' && !Array.isArray(o) ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => keys(v, `${prefix}${k}.`)) : [prefix.slice(0, -1)]

describe('cobertura', () => {
  it('every internal route has a title and description, in each language, at metadata size', () => {
    for (const l of READY) {
      for (const r of internal) {
        const m = metaOf(l, r.id)
        expect(m.titulo.length, `${l} ${r.id} title`).toBeGreaterThanOrEqual(cjk(l) ? 2 : 3)
        expect(m.titulo.length, `${l} ${r.id} title`).toBeLessThanOrEqual(60)
        expect(m.descricao.length, `${l} ${r.id} description`).toBeGreaterThanOrEqual(cjk(l) ? 20 : 50)
        expect(m.descricao.length, `${l} ${r.id} description`).toBeLessThanOrEqual(cjk(l) ? 120 : 190)
      }
    }
  })
  it('every site map item has a label, every map group and every footer column has a title', () => {
    for (const l of READY) {
      for (const r of ROUTES.filter((x) => x.secao !== null)) expect(labelOf(l, r.id).length, `${l} ${r.id}`).toBeGreaterThanOrEqual(cjk(l) ? 1 : 2)
      for (const s of MAP_SECTIONS) expect((footerDict(l).secoes as Record<string, string>)[s], `${l} ${s}`).toBeTruthy()
      for (const c of FOOTER_COLUMNS) expect((footerDict(l).colunas as Record<string, string>)[c], `${l} ${c}`).toBeTruthy()
    }
  })
  it('the seven map groups exist and none is empty', () => {
    for (const s of MAP_SECTIONS) expect(ROUTES.filter((r) => r.secao === s).length, s).toBeGreaterThan(0)
  })
  it('the text pages have a short answer of one or two sentences (up to 360 characters) and an ISO date', () => {
    for (const l of READY) {
      for (const r of withText) {
        const p = pageOf(l, r.id)
        expect(p.respostaCurta.length, `${l} ${r.id}`).toBeGreaterThan(cjk(l) ? 20 : 40)
        expect(p.respostaCurta.length, `${l} ${r.id}`).toBeLessThanOrEqual(360)
        expect(p.atualizadoEm, `${l} ${r.id}`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      }
    }
  })
  it('every "see also" points to a route that exists and has a label', () => {
    for (const l of READY) {
      for (const r of withText) {
        for (const id of pageOf(l, r.id).ver) {
          expect(ROUTES.some((x) => x.id === id), `${l} ${r.id} -> ${id}`).toBe(true)
          expect(() => labelOf(l, id)).not.toThrow()
        }
      }
    }
  })
})

describe('parity between the languages', () => {
  it('pt and en have exactly the same keys, in the three files', () => {
    const pt = keys(instDict('pt')).filter((k) => !/\.\d+(\.|$)/.test(k))
    const en = keys(instDict('en')).filter((k) => !/\.\d+(\.|$)/.test(k))
    expect(en).toEqual(pt)
    expect(keys(footerDict('en'))).toEqual(keys(footerDict('pt')))
  })
  it('the lists (sections, items, API routes) have the same size in both languages', () => {
    for (const r of withText) {
      const [a, b] = [pageOf('pt', r.id), pageOf('en', r.id)]
      expect(b.secoes.length, r.id).toBe(a.secoes.length)
      a.secoes.forEach((s, i) => expect(b.secoes[i].lista?.length ?? 0, `${r.id} #${i}`).toBe(s.lista?.length ?? 0))
    }
    const [pa, ea] = [instDict('pt').paginas.api, instDict('en').paginas.api]
    expect(ea.grupos.map((g) => g.rotas.length)).toEqual(pa.grupos.map((g) => g.rotas.length))
    // the route (column 1) is the same in both languages, only the explanation changes
    expect(ea.grupos.flatMap((g) => g.rotas.map((x) => x[0]))).toEqual(pa.grupos.flatMap((g) => g.rotas.map((x) => x[0])))
  })
})

describe('editorial content: what the rest of the site assumes', () => {
  it('the required guides and glossary entries exist, in each language', () => {
    for (const l of READY) {
      const c = contentOf(l)
      for (const s of REQUIRED_GUIDES) expect(c.guias.some((g) => g.slug === s), `${l} guia ${s}`).toBe(true)
      for (const s of REQUIRED_GLOSSARY_ENTRIES) expect(c.verbetes.some((v) => v.slug === s), `${l} verbete ${s}`).toBe(true)
    }
  })
  it('slugs and ids do not repeat, and the guides and glossary entries have the same slugs in both languages (hreflang)', () => {
    for (const l of READY) {
      const c = contentOf(l)
      for (const list of [c.guias.map((g) => g.slug), c.verbetes.map((v) => v.slug), c.faq.map((f) => f.id), c.novidades.map((n) => n.id)]) expect(new Set(list).size, l).toBe(list.length)
    }
    expect(contentOf('en').guias.map((g) => g.slug).sort()).toEqual(contentOf('pt').guias.map((g) => g.slug).sort())
    expect(contentOf('en').verbetes.map((g) => g.slug).sort()).toEqual(contentOf('pt').verbetes.map((g) => g.slug).sort())
  })
  it('the questions cited by a guide exist, and the FAQ groups are known', () => {
    for (const l of READY) {
      const c = contentOf(l)
      for (const g of c.guias) for (const id of g.perguntas ?? []) expect(c.faq.some((f) => f.id === id), `${l} ${g.slug} -> ${id}`).toBe(true)
      // pt and en have the groups named in FAQ_GROUPS; in the other ten languages the group is the translation of the same Portuguese group,
      // so the position counts: question N falls in the group of the same order of appearance as in Portuguese.
      if (l === 'pt' || l === 'en') for (const f of c.faq) expect((FAQ_GROUPS as readonly string[]).includes(f.grupo), `${l} ${f.id} grupo ${f.grupo}`).toBe(true)
      else {
        const order = (list: readonly { grupo: string }[]) => list.map((f) => f.grupo).filter((g, i, a) => a.indexOf(g) === i)
        const pt = contentOf('pt').faq
        const gpt = order(pt), gl = order(c.faq)
        expect(gl.length, `${l} number of groups`).toBe(gpt.length)
        for (const f of c.faq) expect(gl.indexOf(f.grupo), `${l} ${f.id}`).toBe(gpt.indexOf(pt.find((x) => x.id === f.id)!.grupo))
      }
      for (const v of c.verbetes) for (const rel of v.relacionados ?? []) expect(c.verbetes.some((x) => x.slug === rel), `${l} ${v.slug} -> ${rel}`).toBe(true)
    }
  })
  it('dates in ISO; guide titles within the TechArticle\'s 110-character limit', () => {
    for (const l of READY) {
      const c = contentOf(l)
      for (const d of [...c.faq.map((f) => f.atualizadoEm), ...c.verbetes.map((v) => v.atualizadoEm), ...c.guias.map((g) => g.atualizadoEm), ...c.novidades.map((n) => n.data)]) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      for (const g of c.guias) expect(g.titulo.length, g.slug).toBeLessThanOrEqual(110)
    }
  })
  it('the short answer of each FAQ and each guide has 40 to 360 characters, and the short definition of each glossary entry is one sentence', () => {
    for (const l of READY) {
      const c = contentOf(l)
      for (const f of c.faq) {
        expect(f.respostaCurta.length, f.id).toBeGreaterThan(cjk(l) ? 20 : 40)
        expect(f.respostaCurta.length, f.id).toBeLessThanOrEqual(360)
      }
      for (const g of c.guias) expect(g.respostaCurta.length, g.slug).toBeGreaterThan(cjk(l) ? 20 : 40)
      for (const v of c.verbetes) expect(v.definicaoCurta.length, v.slug).toBeLessThanOrEqual(220)
    }
  })
})

describe('text hygiene', () => {
  const all = (l: Ready) => JSON.stringify([instDict(l), footerDict(l), contentOf(l)])
  it('no em dash or en dash, in both languages', () => {
    for (const l of READY) expect(all(l)).not.toMatch(/[—–]/)
  })
  it('no machine-text tics', () => {
    const forbidden = [/mergulh/i, /desbloque/i, /potencializ/i, /alaveng/i, /robust[oa]/i, /sem esforço/i, /solução inovadora/i, /revolucion[aá]ri/i, /poderos[oa]/i, /em constante evolução/i, /no mundo de hoje/i, /na era da ia/i, /divisor de águas/i, /experiência única/i, /\bnão apenas\b.*\bmas também\b/i, /\bdelve\b/i, /\bseamless/i, /\bunlock/i, /\brobust\b/i, /cutting-edge/i, /game[- ]chang/i, /in today's/i]
    // the list is of Portuguese cliches (and the English equivalent where it exists); in Spanish "desbloquear" is an ordinary word, so only pt and en
    for (const l of READY.filter((x) => x === 'pt' || x === 'en')) for (const re of forbidden) expect(all(l), `${l} ${re}`).not.toMatch(re)
    for (const l of READY.filter((x) => x === 'pt' || x === 'en')) expect(all(l), l).not.toMatch(/^\s*Além disso,/m)
  })
  it('no emoji in the text', () => {
    // the real emoji ranges; the footer's © does not count
    for (const l of READY) expect(all(l)).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{FE0F}]/u)
  })
  it('does not claim the network is live for the public, nor that there is open sign-up, nor that there is a mobile app', () => {
    for (const l of READY) {
      const t = all(l)
      expect(t).not.toMatch(/cadastre-se agora|sign up now|baixe na app store|download on the app store|disponível no google play/i)
    }
  })
  it('the claims the text repeats match the protocol (version, size, windows)', () => {
    for (const l of READY) {
      const t = all(l)
      expect(t).toContain('0.3.1')
      expect(t).toContain('12288')
      expect(t).toMatch(/14(?!\d)/)
      expect(t).toContain('120')
    }
    // the revision the site declares, in the format "versão 0.3, revisão X" (pt and en; the ten languages go up in the translation step)
    const r = entity.draftReview
    expect(all('pt')).toContain(`versão 0.3, revisão ${r}`)
    expect(all('en')).toContain(`version 0.3, revision ${r}`)
    expect(all('pt')).not.toMatch(/está na versão 0\.3\.\d/)
    expect(all('en')).not.toMatch(/is (?:open and )?at version 0\.3\.\d/)
  })
  it('does not promise a public repository that does not exist', () => {
    for (const l of READY) expect(all(l)).not.toMatch(/github\.com\/(rovemark|rover)/i)
  })
})
