// The folgali identity guard (docs/DESIGN-FOLGALI.md). It replaces the design v2 one. It proves in code what the brand asks for:
// only the palette (nine codes, in one place), headings in the local Nunito, the official logotype in both versions, the brand always in
// lowercase, no em dash in the new texts, no rover with the mascot's aviator cap and no "Aprovar" on the screen.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { withoutHelmet } from '@/lib/folgali/plush'

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const withoutComment = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '')
const files = (dir: string, re: RegExp): string[] =>
  readdirSync(join(root, dir)).flatMap((n) => {
    const p = join(dir, n)
    return statSync(join(root, p)).isDirectory() ? files(p, re) : re.test(n) ? [p] : []
  })
const css = files('src/app', /\.css$/)

export const PALETTE = {
  'azul-hangar': '#3455E8',
  grafite: '#111318',
  marfim: '#F4F1EA',
  ceu: '#DFEAFF',
  manga: '#FFCD52',
  rosa: '#FF9FC4',
  menta: '#94DCB6',
  lilas: '#B49CFF',
  laranja: '#FF9A5C',
}

describe('color: only the folgali palette', () => {
  it('the nine codes are declared as tokens in :root, with the brand\'s values', () => {
    const g = read('src/app/globals.css')
    for (const [name, hex] of Object.entries(PALETTE)) expect(g, name).toContain(`--${name}: ${hex};`)
  })
  it('no loose color code in any CSS: the hexadecimal only appears in the nine declarations', () => {
    const loose = css.flatMap((p) => {
      const lines = withoutComment(read(p)).split('\n')
      return lines.flatMap((l, i) => {
        const findings = l.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
        const isToken = p.endsWith('globals.css') && /^\s*--[a-z-]+: #[0-9A-F]{6};\s*$/.test(l) && Object.values(PALETTE).some((h) => l.includes(h))
        return findings.length && !isToken ? [`${p}:${i + 1}: ${l.trim()}`] : []
      })
    })
    expect(loose).toEqual([])
  })
  it('folgali\'s CSS does not invent color: no literal rgb(), hsl() or oklch(), only palette names and mixes of them', () => {
    for (const p of ['src/app/folgali.css', 'src/app/folgali-screens.css']) {
      expect(withoutComment(read(p)), p).not.toMatch(/\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/)
    }
  })
  it('the dark theme exists and swaps background, text and action', () => {
    const g = read('src/app/globals.css')
    const dark = g.slice(g.indexOf(":root[data-tema='escuro'] {"))
    for (const v of ['--fundo:', '--tinta:', '--acao:', '--superficie:']) expect(dark, v).toContain(v)
  })
})

describe('tipografia', () => {
  it('headings in Nunito, served from the site itself (no third-party font)', () => {
    const f = read('src/lib/fonts.ts')
    expect(f).toContain('nunito-variable.ttf')
    expect(f).toContain("variable: '--fonte-titulo'")
    expect(existsSync(join(root, 'src/fonts/nunito-variable.ttf'))).toBe(true)
    expect(existsSync(join(root, 'src/fonts/Nunito-OFL.txt'))).toBe(true)
    for (const p of css) expect(read(p), p).not.toMatch(/fonts\.googleapis|@import\s+url\(/)
  })
})

describe('marca', () => {
  it('the official logotype is in the bar, in both versions (light and dark), and the files exist', () => {
    const m = read('src/components/Brand.tsx')
    expect(m).toContain('/marca/folgali/logo-principal.webp')
    expect(m).toContain('/marca/folgali/logo-escuro.webp')
    for (const a of ['logo-principal.webp', 'logo-escuro.webp', 'icone-32.png', 'icone-180.png', 'icone-192.png', 'icone-512.png', 'logo-og.png']) {
      expect(existsSync(join(root, 'public/marca/folgali', a)), a).toBe(true)
    }
    expect(read('src/app/[lang]/layout.tsx')).toContain('<Brand')
    const f = read('src/app/folgali.css')
    expect(f).toMatch(/:root\[data-tema='escuro'\] \.brand-light \{ display: none; \}/)
  })
  it('the brand is always "folgali", in lowercase, in the Portuguese and English texts', () => {
    const json = files('src/i18n', /\.(pt|en)\.json$|^(pt|en)\.json$/)
    const uppercase = json.filter((p) => /\bFolgali\b|\bFOLGALI\b/.test(read(p)))
    expect(uppercase).toEqual([])
    expect(read('src/lib/site.ts')).toContain("nome: 'folgali'")
  })
  it('no folgali text has an em dash or en dash', () => {
    const texts = ['src/i18n/social/folgali.pt.json', 'src/i18n/social/folgali.en.json', 'src/lib/folgali/demo.ts']
    for (const p of texts) expect(read(p), p).not.toMatch(/[—–]/)
  })
  it('the manifest and the icons come from the app icon', () => {
    const m = read('src/app/manifest.ts')
    expect(m).toContain("name: 'folgali'")
    expect(m).toContain('icone-512.png')
  })
})

describe('community and page without an initials logotype', () => {
  it('the emblem is a time-off photo, never the initials of the name', () => {
    const e = read('src/components/social/Emblem.tsx')
    expect(e).not.toMatch(/initialsOf/)
    expect(e).toMatch(/themeCover\(/)
    expect(e).toMatch(/<img /)
  })
  it('the cover and the community card already show the large photo: no emblem on top', () => {
    for (const p of ['src/components/communities/CommunityHeader.tsx', 'src/components/communities/CommunityCard.tsx']) expect(read(p), p).not.toMatch(/<Emblem/)
  })
})

describe('gender agreement by rover', () => {
  it('"Hoje na vida da Lumi", "do Otto", "de" for someone with no known gender; outside Portuguese, the plain name', async () => {
    const { fromName, GENDER } = await import('@/lib/folgali/gender')
    const f = Object.entries(GENDER).find(([, g]) => g === 'f')
    const m = Object.entries(GENDER).find(([, g]) => g === 'm')
    expect(f && m, 'the demo gender map must have rovers of both').toBeTruthy()
    expect(fromName('X', f![0], 'pt')).toBe('da X')
    expect(fromName('X', m![0], 'pt')).toBe('do X')
    expect(fromName('X', 'ninguem_conhecido', 'pt')).toBe('de X')
    expect(fromName('X', f![0], 'en')).toBe('X')
    const pt = JSON.parse(read('src/i18n/social/folgali.pt.json')).socFolgali
    for (const k of ['hoje', 'pausado', 'humorDesc']) expect(pt.meuRover[k], k).toContain('{deNome}')
    expect(pt.lembrancas.titulo).toContain('{deNome}')
    expect(JSON.stringify(pt)).not.toMatch(/ d[oa] \{nome\}| [oa] \{nome\} /)
  })
})

describe('mascot rule', () => {
  it('the aviator cap (the "touca" piece) is Luna\'s: no rover appears with it', () => {
    expect(withoutHelmet({ corpo: 'pera', cor: '#ffcd52', acessorios: ['touca'] }).acessorios).toEqual(['laco'])
    expect(withoutHelmet({ corpo: 'pera', cor: '#ffcd52', acessorios: ['touca', 'laco', 'oculos'] }).acessorios).toEqual(['laco', 'oculos'])
    const without = { corpo: 'seixo', cor: '#f2e8d6', acessorios: ['fone'] }
    expect(withoutHelmet(without)).toBe(without)
    for (const p of ['src/components/Portrait.tsx', 'src/components/Rover.tsx']) expect(read(p), p).toContain('withoutHelmet(')
  })
})

describe('no approval to post', () => {
  it('the approve screen and the approve island no longer exist', () => {
    for (const p of ['src/app/[lang]/aprovar', 'src/app/[lang]/app/aprovar', 'src/components/TelaAprovar.tsx', 'src/components/aprovar']) expect(existsSync(join(root, p)), p).toBe(false)
  })
  it('no component or page leads to /aprovar', () => {
    const tsx = [...files('src/components', /\.tsx$/), ...files('src/app', /\.tsx$/)]
    const findings = tsx.filter((p) => /\/aprovar\b/.test(read(p)))
    expect(findings).toEqual([])
  })
})
