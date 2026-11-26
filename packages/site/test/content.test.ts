import { describe, expect, it } from 'vitest'
import { seed } from '@/lib/demo-data'
import { LOCALES, META, READY, dict, pickLanguage, fmt, plural, relativeTime } from '@/lib/i18n'

// The final dictionaries: pt.json and en.json plus house.pt.json and house.en.json (house rule and About), already merged.
const pt = dict('pt')
const en = dict('en')

function texts(x: unknown, path = ''): Array<[string, string]> {
  if (typeof x === 'string') return [[path, x]]
  if (Array.isArray(x)) return x.flatMap((v, i) => texts(v, `${path}[${i}]`))
  if (x && typeof x === 'object') return Object.entries(x).flatMap(([k, v]) => texts(v, path ? `${path}.${k}` : k))
  return []
}

// Project rule: no em dashes and no machine-text tics in anything the person reads.
const FORBIDDEN = [
  /—/, /–/,
  /não apenas.*mas também/i, /mergulhe/i, /desbloqueie/i, /potencializ/i, /alavanc/i, /robust[oa]/i, /sem esforço/i,
  /solução inovadora/i, /revolucionári/i, /poderos[oa]/i, /em constante evolução/i, /no mundo de hoje/i, /na era da ia/i,
  /divisor de águas/i, /experiência única/i, /^além disso,/i,
  /\bseamless/i, /\bdelve\b/i, /\bunlock/i, /\bleverage/i, /\bpowerful/i, /game[- ]changer/i, /in today's world/i, /\brobust\b/i, /\bnot just\b.*\bbut\b/i,
]
const EMOJI = /\p{Extended_Pictographic}/u

const run = (list: Array<[string, string]>) => {
  const failures: string[] = []
  for (const [where, t] of list) {
    for (const re of FORBIDDEN) if (re.test(t)) failures.push(`${where}: ${re} em "${t.slice(0, 60)}"`)
    if (EMOJI.test(t)) failures.push(`${where}: emoji em "${t.slice(0, 60)}"`)
  }
  return failures
}

describe('text the person reads', () => {
  it('the screens in pt and en have no em dash, no AI tic and no emoji', () => {
    expect(run(texts(pt, 'pt'))).toEqual([])
    expect(run(texts(en, 'en'))).toEqual([])
  })
  it('the demo data neither', () => {
    const d = seed(new Date('2026-11-04T12:00:00Z'))
    const list: Array<[string, string]> = [
      ...d.rovers.flatMap((r): Array<[string, string]> => [[`${r.handle}.apresentacao`, r.apresentacao], ...r.sabeFazer.map((s, i): [string, string] => [`${r.handle}.sabe${i}`, s]), [`${r.handle}.nome`, r.nome]]),
      ...d.postagens.map((p): [string, string] => [`post ${p.id}`, p.texto]),
      ...d.rascunhos.flatMap((r): Array<[string, string]> => [[`rascunho ${r.id}`, r.texto], [`motivo ${r.id}`, r.motivo ?? '']]),
    ]
    expect(list.length).toBeGreaterThan(80)
    expect(run(list)).toEqual([])
  })
  it('the tic detector bites: plants an em dash and a cliche and accuses', () => {
    expect(run([['x', 'uma coisa — outra']]).length).toBe(1)
    expect(run([['x', 'Mergulhe nesta experiência única']]).length).toBe(2)
    expect(run([['x', 'texto limpo e direto']])).toEqual([])
  })
  it('the demo has no data that looks real: only example e-mail and DEMO uids', () => {
    const d = seed(new Date())
    const all = JSON.stringify(d)
    expect((all.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? []).map((e) => e.replace(/\.$/, ''))).toEqual(['maria.souza@exemplo.com'])
    expect(d.rovers.every((r) => r.uid.startsWith('rvr_DEMO') && r.sintetico)).toBe(true)
  })
})

describe('idiomas', () => {
  const keys = (x: unknown, p = ''): string[] =>
    x && typeof x === 'object' && !Array.isArray(x) ? Object.entries(x).flatMap(([k, v]) => keys(v, p ? `${p}.${k}` : k)) : [p]
  const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

  it('en has exactly the same keys and variables as pt', () => {
    expect(keys(en).sort()).toEqual(keys(pt).sort())
    const t = new Map(texts(pt))
    for (const [k, v] of texts(en)) expect(vars(v), k).toEqual(vars(t.get(k)!))
  })
  it('no empty text', () => {
    for (const [k, v] of [...texts(pt), ...texts(en)]) expect(v.trim().length, k).toBeGreaterThan(0)
  })
  it('there are 12 languages, all ready, and Arabic is right to left', () => {
    expect(LOCALES).toHaveLength(12)
    expect([...READY].sort()).toEqual([...LOCALES].sort())
    expect(LOCALES.filter((l) => META[l].dir === 'rtl')).toEqual(['ar'])
    expect(META.pt.html).toBe('pt-BR')
    expect(META.zh.html).toBe('zh-Hans')
  })
  it('pickLanguage follows Accept-Language among the ready ones and falls back to pt', () => {
    expect(pickLanguage('en-US,en;q=0.9')).toBe('en')
    expect(pickLanguage('es-ES,es;q=0.9,en;q=0.5')).toBe('es')
    expect(pickLanguage('fr;q=0.9,pt-BR;q=0.8')).toBe('fr')
    expect(pickLanguage('zh-CN,zh;q=0.9')).toBe('zh')
    expect(pickLanguage('ar-SA,ar;q=0.9')).toBe('ar')
    expect(pickLanguage('sv-SE,sv;q=0.9,de;q=0.5')).toBe('de')
    expect(pickLanguage('sv,fi;q=0.9')).toBe('pt')
    expect(pickLanguage('en;q=0.2,pt;q=0.9')).toBe('pt')
    expect(pickLanguage('')).toBe('pt')
    expect(pickLanguage(null)).toBe('pt')
    expect(pickLanguage('xx, ;q=abc')).toBe('pt')
  })
  it('dict returns the language\'s dictionary', () => {
    expect(dict('pt').nav.linha).toBe('Linha')
    expect(dict('en').nav.linha).toBe('Thread')
  })
})

describe('fmt, plural e tempo', () => {
  it('fmt swaps variables and leaves the missing one visible', () => {
    expect(fmt('{a} e {b}', { a: 1, b: 'dois' })).toBe('1 e dois')
    expect(fmt('{a} e {b}', { a: 1 })).toBe('1 e {b}')
  })
  it('plural chooses zero, one and others', () => {
    const p = { zero: 'nada', um: 'um {nome}', outros: '{n} {nome}s' }
    expect(plural(p, 0, { nome: 'x' })).toBe('nada')
    expect(plural(p, 1, { nome: 'x' })).toBe('um x')
    expect(plural(p, 5, { nome: 'x' })).toBe('5 xs')
    expect(plural({ um: 'um', outros: '{n} vários' }, 0)).toBe('0 vários')
  })
  it('tempoRelativo covers now, minutes, hours and days', () => {
    const d = dict('pt')
    const now = new Date('2026-11-04T12:00:00Z')
    const before = (s: number) => new Date(now.getTime() - s * 1000).toISOString()
    expect(relativeTime(before(30), d, now)).toBe('agora')
    expect(relativeTime(before(59), d, now)).toBe('agora')
    expect(relativeTime(before(60), d, now)).toBe('há 1 min')
    expect(relativeTime(before(3599), d, now)).toBe('há 59 min')
    expect(relativeTime(before(3600), d, now)).toBe('há 1 h')
    expect(relativeTime(before(86399), d, now)).toBe('há 23 h')
    expect(relativeTime(before(86400 * 3), d, now)).toBe('há 3 d')
    expect(relativeTime(before(-500), d, now)).toBe('agora')
  })
})
