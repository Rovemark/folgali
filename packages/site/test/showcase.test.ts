// The showcase (home page, /rover-hangar, the booth on /agentes): texts in 12 languages with the same shape, no dashes, the brand in
// lowercase, the mascot rule in every rover the showcase draws, every image it points to exists, and nothing loaded from elsewhere.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LOCALES } from '@/lib/i18n-base'
import { metaOf } from '@/lib/i18n-extra'
import { ROUTES } from '@/lib/seo/routes'

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const dict = (l: string) => JSON.parse(read(`src/i18n/showcase.${l}.json`))
const shape = (o: unknown): unknown =>
  Array.isArray(o) ? o.map(shape) : o !== null && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v)])) : typeof o
const strings = (o: unknown): string[] =>
  typeof o === 'string' ? [o] : Array.isArray(o) ? o.flatMap(strings) : o !== null && typeof o === 'object' ? Object.values(o).flatMap(strings) : []
const showcaseCode = [
  ...readdirSync(join(root, 'src/components/showcase')).map((f) => `src/components/showcase/${f}`),
  'src/app/[lang]/page.tsx',
  'src/app/[lang]/rover-hangar/page.tsx',
  'src/app/[lang]/agentes/page.tsx',
  'src/app/showcase.css',
]

describe('showcase texts', () => {
  it('the 12 languages have exactly the shape of Portuguese', () => {
    const pt = shape(dict('pt'))
    for (const l of LOCALES) expect(shape(dict(l)), l).toEqual(pt)
  })
  it('no em dash or en dash, and the brand is always "folgali" in lowercase', () => {
    for (const l of LOCALES) {
      const all = strings(dict(l)).join('\n')
      expect(all, l).not.toMatch(/[—–]/)
      expect(all, l).not.toMatch(/\bFolgali\b|\bFOLGALI\b/)
    }
  })
  it('the values that are data, not text, stay the same in every language', () => {
    const pt = dict('pt')
    for (const l of LOCALES) {
      const d = dict(l)
      expect(d.hero.feed.map((p: { author: string; photo: string }) => [p.author, p.photo]), l).toEqual(pt.hero.feed.map((p: { author: string; photo: string }) => [p.author, p.photo]))
      expect(d.hangar.tabs.map((x: { id: string }) => x.id), l).toEqual(pt.hangar.tabs.map((x: { id: string }) => x.id))
      expect(d.hangar.day.map((x: { time: string; kind: string }) => x.time + x.kind), l).toEqual(pt.hangar.day.map((x: { time: string; kind: string }) => x.time + x.kind))
      expect(d.proof.items.map((x: { value: string }) => x.value), l).toEqual(pt.proof.items.map((x: { value: string }) => x.value))
    }
  })
  it('/rover-hangar is in the route registry with a title and description in every language', () => {
    const r = ROUTES.find((x) => x.id === 'roverHangar')
    expect(r?.caminho).toBe('/rover-hangar')
    expect(r?.externo).toBeUndefined()
    for (const l of LOCALES) expect(metaOf(l, 'roverHangar').titulo.length, l).toBeGreaterThan(1)
    expect(existsSync(join(root, 'src/app/[lang]/rover-hangar/page.tsx'))).toBe(true)
  })
})

describe('showcase art and code', () => {
  it('every image the showcase points to exists in public/', () => {
    const refs = showcaseCode.flatMap((p) => [...read(p).matchAll(/['"`(](\/marca\/[^'"`)\s]+?\.webp)/g)].map((m) => m[1]))
    const parts = ['booth-robot', 'booth-cabin', 'booth-plush'].map((x) => `/marca/folgali/showcase/${x}.webp`)
    const tabs = dict('pt').hangar.tabs.map((x: { id: string }) => `/marca/rover-hangar/app/${x.id}.webp`)
    const scenes = ['scene-work', 'scene-clock-out', 'scene-flight', 'scene-arrival', 'plush-booth'].flatMap((n) => [`/marca/folgali/showcase/${n}.webp`, `/marca/folgali/showcase/${n}-768.webp`])
    for (const r of [...refs.filter((r) => !r.includes('${')), ...parts, ...tabs, ...scenes]) expect(existsSync(join(root, 'public', r)), r).toBe(true)
  })
  it('mascot rule: no rover drawn by the showcase wears the aviator helmet ("touca")', () => {
    for (const p of showcaseCode.filter((p) => p.endsWith('.tsx') || p.endsWith('.ts'))) expect(read(p), p).not.toMatch(/['"]touca['"]/)
  })
  it('nothing is loaded from another domain at runtime (no CDN, no third-party script or font)', () => {
    for (const p of showcaseCode) {
      const s = read(p)
      expect(s, p).not.toMatch(/<script[^>]+src=|@import\s+url\(|fonts\.googleapis|cdn\.|unpkg|jsdelivr/)
    }
  })
  it('the CSS only uses palette names: no hex, rgb() or hsl() literals', () => {
    const css = read('src/app/showcase.css').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/)
  })
  it('what moves on its own follows "reduce motion" and stops off screen; the CSS has the reduced motion branch', () => {
    for (const p of ['LiveHero', 'PlushBooth', 'LiveBoard', 'AgentPortal']) {
      const s = read(`src/components/showcase/${p}.tsx`)
      expect(s, p).toMatch(/useReducedMotion\(\)/)
      expect(s, p).toMatch(/useInView\(/)
    }
    expect(read('src/app/showcase.css')).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
  })
  it('the animated rover only stands ("parado"): the poses that swing the arms show the seam between arm and body', () => {
    for (const p of showcaseCode) expect(read(p), p).not.toMatch(/estado=\{|estado="(?!parado")/)
    expect(existsSync(join(root, 'src/components/showcase/RoverBuilder.tsx'))).toBe(false)
  })
  it('/agentes is a public, full-width page (own top bar, no app shell)', () => {
    const s = read('src/app/[lang]/agentes/page.tsx')
    expect(s).toContain('public-page')
    expect(s).toContain('<PublicTop')
  })
})
