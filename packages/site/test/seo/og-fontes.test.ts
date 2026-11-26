// The share image for Chinese, Japanese and Korean uses CUT fonts from the repository (src/fonts/og). This test reads the
// cmap table of each file and requires that every character the image may draw in this language is in it: without that the missing
// glyph comes out as an empty square. Changed a title or the brand sentence? Run `node scripts/og-fonts.mjs` again (see docs/LANGUAGES.md).
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PACKS } from '@/i18n/packages'

const DIR = path.resolve(__dirname, '../../src/fonts/og')

/** The code points the font covers (cmap formats 4 and 12, what the cut writes). */
function coverage(file: string): Set<number> {
  const b = fs.readFileSync(file)
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const n = dv.getUint16(4)
  let cmap = -1
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16
    if (b.toString('latin1', o, o + 4) === 'cmap') cmap = dv.getUint32(o + 8)
  }
  if (cmap < 0) throw new Error(`${file}: no cmap table`)
  const subs = dv.getUint16(cmap + 2)
  const out = new Set<number>()
  for (let i = 0; i < subs; i++) {
    const t = cmap + dv.getUint32(cmap + 4 + i * 8 + 4)
    const fmt = dv.getUint16(t)
    if (fmt === 12) {
      const g = dv.getUint32(t + 12)
      for (let j = 0; j < g; j++) {
        const o = t + 16 + j * 12
        for (let c = dv.getUint32(o); c <= dv.getUint32(o + 4); c++) out.add(c)
      }
    } else if (fmt === 4) {
      const segs = dv.getUint16(t + 6) / 2
      const end = t + 14, ini = end + segs * 2 + 2
      for (let j = 0; j < segs; j++) for (let c = dv.getUint16(ini + j * 2); c <= dv.getUint16(end + j * 2); c++) if (c !== 0xffff) out.add(c)
    }
  }
  return out
}

/** All the text the image draws: each route's title, the brand and the note (src/app/og/[lang]/[id]/route.tsx). */
const text = (l: 'zh' | 'ja' | 'ko') => {
  const inst = PACKS[l].inst as unknown as { meta: Record<string, { titulo: string }> }
  return [...Object.values(inst.meta).map((m) => m.titulo), PACKS[l].rodape.marca.titulo, PACKS[l].rodape.marca.nota].join('')
}

describe('cut fonts of the share image', () => {
  for (const l of ['zh', 'ja', 'ko'] as const) {
    for (const weight of [400, 700]) {
      it(`${l}-${weight}.ttf covers every character the image draws`, () => {
        const cov = coverage(path.join(DIR, `${l}-${weight}.ttf`))
        const missing = [...new Set(text(l))].filter((c) => c.trim() && !cov.has(c.codePointAt(0)!))
        expect(missing, `${l}-${weight}: missing glyphs`).toEqual([])
      })
    }
  }
  it('the check bites: a text with a character outside the font is flagged', () => {
    const cov = coverage(path.join(DIR, 'ko-400.ttf'))
    expect(cov.has('한'.codePointAt(0)!)).toBe(true)
    expect(cov.has('龘'.codePointAt(0)!)).toBe(false)
  })
})
