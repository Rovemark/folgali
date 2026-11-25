import { describe, expect, it } from 'vitest'
import { semente } from '@/lib/demo-dados'
import { LOCALES, META, PRONTOS, dict, escolherIdioma, fmt, plural, tempoRelativo } from '@/lib/i18n'

// Os dicionários finais: pt.json e en.json mais casa.pt.json e casa.en.json (regra da casa e Sobre), já juntos.
const pt = dict('pt')
const en = dict('en')

function textos(x: unknown, caminho = ''): Array<[string, string]> {
  if (typeof x === 'string') return [[caminho, x]]
  if (Array.isArray(x)) return x.flatMap((v, i) => textos(v, `${caminho}[${i}]`))
  if (x && typeof x === 'object') return Object.entries(x).flatMap(([k, v]) => textos(v, caminho ? `${caminho}.${k}` : k))
  return []
}

// Regra do projeto: nada de travessão nem de cacoete de texto de máquina em nada que a pessoa lê.
const PROIBIDAS = [
  /—/, /–/,
  /não apenas.*mas também/i, /mergulhe/i, /desbloqueie/i, /potencializ/i, /alavanc/i, /robust[oa]/i, /sem esforço/i,
  /solução inovadora/i, /revolucionári/i, /poderos[oa]/i, /em constante evolução/i, /no mundo de hoje/i, /na era da ia/i,
  /divisor de águas/i, /experiência única/i, /^além disso,/i,
  /\bseamless/i, /\bdelve\b/i, /\bunlock/i, /\bleverage/i, /\bpowerful/i, /game[- ]changer/i, /in today's world/i, /\brobust\b/i, /\bnot just\b.*\bbut\b/i,
]
const EMOJI = /\p{Extended_Pictographic}/u

const rodar = (lista: Array<[string, string]>) => {
  const falhas: string[] = []
  for (const [onde, t] of lista) {
    for (const re of PROIBIDAS) if (re.test(t)) falhas.push(`${onde}: ${re} em "${t.slice(0, 60)}"`)
    if (EMOJI.test(t)) falhas.push(`${onde}: emoji em "${t.slice(0, 60)}"`)
  }
  return falhas
}

describe('texto que a pessoa lê', () => {
  it('as telas em pt e en não têm travessão, cacoete de IA nem emoji', () => {
    expect(rodar(textos(pt, 'pt'))).toEqual([])
    expect(rodar(textos(en, 'en'))).toEqual([])
  })
  it('os dados de demonstração também não', () => {
    const d = semente(new Date('2026-11-04T12:00:00Z'))
    const lista: Array<[string, string]> = [
      ...d.rovers.flatMap((r): Array<[string, string]> => [[`${r.handle}.apresentacao`, r.apresentacao], ...r.sabeFazer.map((s, i): [string, string] => [`${r.handle}.sabe${i}`, s]), [`${r.handle}.nome`, r.nome]]),
      ...d.postagens.map((p): [string, string] => [`post ${p.id}`, p.texto]),
      ...d.rascunhos.flatMap((r): Array<[string, string]> => [[`rascunho ${r.id}`, r.texto], [`motivo ${r.id}`, r.motivo ?? '']]),
    ]
    expect(lista.length).toBeGreaterThan(80)
    expect(rodar(lista)).toEqual([])
  })
  it('o detector de cacoete morde: planta um travessão e um clichê e acusa', () => {
    expect(rodar([['x', 'uma coisa — outra']]).length).toBe(1)
    expect(rodar([['x', 'Mergulhe nesta experiência única']]).length).toBe(2)
    expect(rodar([['x', 'texto limpo e direto']])).toEqual([])
  })
  it('a demonstração não tem dado que pareça real: só e-mail de exemplo e uids DEMO', () => {
    const d = semente(new Date())
    const todo = JSON.stringify(d)
    expect((todo.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? []).map((e) => e.replace(/\.$/, ''))).toEqual(['maria.souza@exemplo.com'])
    expect(d.rovers.every((r) => r.uid.startsWith('rvr_DEMO') && r.sintetico)).toBe(true)
  })
})

describe('idiomas', () => {
  const chaves = (x: unknown, p = ''): string[] =>
    x && typeof x === 'object' && !Array.isArray(x) ? Object.entries(x).flatMap(([k, v]) => chaves(v, p ? `${p}.${k}` : k)) : [p]
  const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

  it('en tem exatamente as mesmas chaves e variáveis que pt', () => {
    expect(chaves(en).sort()).toEqual(chaves(pt).sort())
    const t = new Map(textos(pt))
    for (const [k, v] of textos(en)) expect(vars(v), k).toEqual(vars(t.get(k)!))
  })
  it('nenhum texto vazio', () => {
    for (const [k, v] of [...textos(pt), ...textos(en)]) expect(v.trim().length, k).toBeGreaterThan(0)
  })
  it('são 12 idiomas, todos prontos, e o árabe é da direita para a esquerda', () => {
    expect(LOCALES).toHaveLength(12)
    expect([...PRONTOS].sort()).toEqual([...LOCALES].sort())
    expect(LOCALES.filter((l) => META[l].dir === 'rtl')).toEqual(['ar'])
    expect(META.pt.html).toBe('pt-BR')
    expect(META.zh.html).toBe('zh-Hans')
  })
  it('escolherIdioma segue Accept-Language entre os prontos e cai em pt', () => {
    expect(escolherIdioma('en-US,en;q=0.9')).toBe('en')
    expect(escolherIdioma('es-ES,es;q=0.9,en;q=0.5')).toBe('es')
    expect(escolherIdioma('fr;q=0.9,pt-BR;q=0.8')).toBe('fr')
    expect(escolherIdioma('zh-CN,zh;q=0.9')).toBe('zh')
    expect(escolherIdioma('ar-SA,ar;q=0.9')).toBe('ar')
    expect(escolherIdioma('sv-SE,sv;q=0.9,de;q=0.5')).toBe('de')
    expect(escolherIdioma('sv,fi;q=0.9')).toBe('pt')
    expect(escolherIdioma('en;q=0.2,pt;q=0.9')).toBe('pt')
    expect(escolherIdioma('')).toBe('pt')
    expect(escolherIdioma(null)).toBe('pt')
    expect(escolherIdioma('xx, ;q=abc')).toBe('pt')
  })
  it('dict devolve o dicionário do idioma', () => {
    expect(dict('pt').nav.linha).toBe('Linha')
    expect(dict('en').nav.linha).toBe('Thread')
  })
})

describe('fmt, plural e tempo', () => {
  it('fmt troca variáveis e deixa a que falta visível', () => {
    expect(fmt('{a} e {b}', { a: 1, b: 'dois' })).toBe('1 e dois')
    expect(fmt('{a} e {b}', { a: 1 })).toBe('1 e {b}')
  })
  it('plural escolhe zero, um e outros', () => {
    const p = { zero: 'nada', um: 'um {nome}', outros: '{n} {nome}s' }
    expect(plural(p, 0, { nome: 'x' })).toBe('nada')
    expect(plural(p, 1, { nome: 'x' })).toBe('um x')
    expect(plural(p, 5, { nome: 'x' })).toBe('5 xs')
    expect(plural({ um: 'um', outros: '{n} vários' }, 0)).toBe('0 vários')
  })
  it('tempoRelativo cobre agora, minutos, horas e dias', () => {
    const d = dict('pt')
    const agora = new Date('2026-11-04T12:00:00Z')
    const antes = (s: number) => new Date(agora.getTime() - s * 1000).toISOString()
    expect(tempoRelativo(antes(30), d, agora)).toBe('agora')
    expect(tempoRelativo(antes(59), d, agora)).toBe('agora')
    expect(tempoRelativo(antes(60), d, agora)).toBe('há 1 min')
    expect(tempoRelativo(antes(3599), d, agora)).toBe('há 59 min')
    expect(tempoRelativo(antes(3600), d, agora)).toBe('há 1 h')
    expect(tempoRelativo(antes(86399), d, agora)).toBe('há 23 h')
    expect(tempoRelativo(antes(86400 * 3), d, agora)).toBe('há 3 d')
    expect(tempoRelativo(antes(-500), d, agora)).toBe('agora')
  })
})
