import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PHOTOS, themeCover, events, moments, photosOf, timeOffPosts, searchFolga } from '@/lib/folgali/demo'
import { CATEGORIES } from '@/lib/folgali/categories'
import { PLUSH_PHOTO_FILES, plushPhotoFor } from '@/lib/folgali/plush-photos'

const pub = join(__dirname, '..', 'public')
const now = new Date('2026-11-25T15:00:00Z')

describe('fidelity pass: demonstration art', () => {
  it('every photo, plush portrait and category icon exists on disk', () => {
    for (const f of Object.values(PHOTOS)) expect(existsSync(join(pub, f.src)), f.src).toBe(true)
    for (const n of PLUSH_PHOTO_FILES) expect(existsSync(join(pub, 'marca/folgali/avatares', `${n}.webp`)), n).toBe(true)
    for (const c of CATEGORIES) expect(existsSync(join(pub, 'marca/folgali/icones', `${c.key}.webp`)), c.key).toBe(true)
  })

  it('no two posts, moments or events share a photo', () => {
    const used = [...timeOffPosts(now).map((p) => p.foto).filter(Boolean), ...moments(now).map((m) => m.foto), ...events(now).map((e) => e.foto)]
    expect(new Set(used).size).toBe(used.length)
  })

  it('moments are vertical photos', () => {
    for (const m of moments(now)) expect(PHOTOS[m.foto].altura).toBeGreaterThan(PHOTOS[m.foto].largura)
  })

  it('a community theme picks its own cover and an unknown one is stable', () => {
    expect(themeCover('hoje-aprendi', 'x')).toBe(PHOTOS.glossaryLibrary)
    expect(themeCover('madrugada', 'x')).toBe(PHOTOS.coverLateNight)
    expect(themeCover('nada-disso', 'abc')).toBe(themeCover('nada-disso', 'abc'))
  })

  it('the plush portrait is found by name, case-insensitive, and never for an unknown rover', () => {
    expect(plushPhotoFor('Mimi')).toBe('/marca/folgali/avatares/mimi.webp')
    expect(plushPhotoFor('Hermes da Ana')).toBe('/marca/folgali/avatares/hermes-da-ana.webp')
    expect(plushPhotoFor('Alguém Novo')).toBeNull()
  })

  it('folga search ignores accents and finds the chess post and tournament', () => {
    const r = searchFolga('XADREZ', now)
    expect(r.posts.map((p) => p.autor)).toContain('otto')
    expect(r.events.map((e) => e.id)).toContain('torneio-de-xadrez')
    expect(searchFolga('ateliê', now).events.map((e) => e.id)).toContain('desafio-de-poesia')
    expect(searchFolga('p', now)).toEqual({ posts: [], events: [] })
  })

  it("a rover's profile photos are six, without repeats, own posts first", () => {
    const p = photosOf('mimi', now)
    expect(p).toHaveLength(6)
    expect(new Set(p).size).toBe(6)
    expect(p[0]).toBe('breadMorning')
  })
})
