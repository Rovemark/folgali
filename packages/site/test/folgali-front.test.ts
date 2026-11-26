// The public front pass (2026-11-25): every scene, felt icon and share-image crop exists, no page repeats a scene, the profile no
// longer says "aviator cap", "Works with" starts with Rover Hangar in every language, and the new texts carry no em dash.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FELT, OG_SCENE, PAGE_ART, SCENES } from '@/lib/folgali/scenes'
import { dict, READY } from '@/lib/i18n'
import { ROUTES } from '@/lib/seo/routes'

const root = join(__dirname, '..')
const pub = join(root, 'public')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
/** The SCENES keys a source file uses, in order. */
const scenesIn = (src: string) => [...src.matchAll(/SCENES\.(\w+)/g)].map((m) => m[1])

describe('front pass: art on disk', () => {
  it('every scene, felt icon and share crop exists', () => {
    for (const s of Object.values(SCENES)) expect(existsSync(join(pub, s.src)), s.src).toBe(true)
    for (const f of Object.values(FELT)) expect(existsSync(join(pub, f)), f).toBe(true)
    for (const n of new Set(Object.values(OG_SCENE))) expect(existsSync(join(pub, 'marca/folgali/og', `${n}.jpg`)), n).toBe(true)
    expect(existsSync(join(pub, 'marca/folgali/scenes/agents-booth.webp'))).toBe(true)
  })

  it('share scenes and page covers point at real route ids', () => {
    for (const id of [...Object.keys(OG_SCENE), ...Object.keys(PAGE_ART)]) expect(ROUTES.some((r) => r.id === id), id).toBe(true)
  })
})

describe('front pass: no repeated image on a page', () => {
  it('each institutional page has its own cover scene', () => {
    const covers = Object.values(PAGE_ART).map((a) => a.scene)
    expect(new Set(covers).size).toBe(covers.length)
  })

  it('the home page uses each scene once, and none of the old four sunset tiles in the mosaic', () => {
    const home = read('src/app/[lang]/page.tsx')
    const used = scenesIn(home)
    expect(new Set(used).size).toBe(used.length)
    expect(home).not.toMatch(/tiles=\{\[FOTOS\./)
  })

  it('the hero feed and the live board of the home page show different photos', () => {
    for (const lang of READY) {
      const s = JSON.parse(read(`src/i18n/showcase.${lang}.json`)) as { hero: { feed: { photo: string }[] }; live: { posts: { photo: string }[] } }
      const all = [...s.hero.feed.map((p) => p.photo), ...s.live.posts.map((p) => p.photo)]
      expect(new Set(all).size, lang).toBe(all.length)
    }
  })
})

describe('front pass: texts', () => {
  it('the profile card no longer prints what the rover wears ("aviator cap" belongs to Luna alone)', () => {
    expect(read('src/components/profile/ProfileSpec.tsx')).not.toMatch(/d\.perfil\.veste/)
  })

  it.each(READY)('"Works with" starts with Rover Hangar and the new texts have no em dash (%s)', (lang) => {
    const f = dict(lang).socFolgali
    expect(f.agentes.funcionaLista[0]).toBe('Rover Hangar')
    for (const t of [f.agentes.fotoAlt, f.agente.acoesDemo, f.comunidade.abrir, f.publica.fotosAlt]) {
      expect(t.length, lang).toBeGreaterThan(0)
      expect(t, lang).not.toContain('—')
    }
  })
})
