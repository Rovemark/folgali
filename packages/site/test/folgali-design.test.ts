// A trava da identidade da folgali (docs/DESIGN-FOLGALI.md). Substitui a do design v2. Prova no código o que a marca pede:
// só a paleta (nove códigos, num lugar só), títulos na Nunito local, o logotipo oficial nas duas versões, a marca sempre em
// minúsculas, nenhum travessão nos textos novos, nenhum rover com o capacete de aviador da mascote e nenhum "Aprovar" na tela.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { semCapacete } from '@/lib/folgali/pelucia'

const raiz = join(__dirname, '..')
const ler = (p: string) => readFileSync(join(raiz, p), 'utf8')
const semComentario = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '')
const arquivos = (dir: string, re: RegExp): string[] =>
  readdirSync(join(raiz, dir)).flatMap((n) => {
    const p = join(dir, n)
    return statSync(join(raiz, p)).isDirectory() ? arquivos(p, re) : re.test(n) ? [p] : []
  })
const css = arquivos('src/app', /\.css$/)

export const PALETA = {
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

describe('cor: só a paleta da folgali', () => {
  it('os nove códigos estão declarados como tokens em :root, com os valores da marca', () => {
    const g = ler('src/app/globals.css')
    for (const [nome, hex] of Object.entries(PALETA)) expect(g, nome).toContain(`--${nome}: ${hex};`)
  })
  it('nenhum código de cor solto em CSS nenhum: o hexadecimal só aparece nas nove declarações', () => {
    const soltos = css.flatMap((p) => {
      const linhas = semComentario(ler(p)).split('\n')
      return linhas.flatMap((l, i) => {
        const achados = l.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
        const ehToken = p.endsWith('globals.css') && /^\s*--[a-z-]+: #[0-9A-F]{6};\s*$/.test(l) && Object.values(PALETA).some((h) => l.includes(h))
        return achados.length && !ehToken ? [`${p}:${i + 1}: ${l.trim()}`] : []
      })
    })
    expect(soltos).toEqual([])
  })
  it('o CSS da folgali não inventa cor: sem rgb(), hsl() nem oklch() literais, só nomes da paleta e mistura deles', () => {
    for (const p of ['src/app/folgali.css', 'src/app/folgali-telas.css']) {
      expect(semComentario(ler(p)), p).not.toMatch(/\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/)
    }
  })
  it('o tema escuro existe e troca fundo, texto e ação', () => {
    const g = ler('src/app/globals.css')
    const escuro = g.slice(g.indexOf(":root[data-tema='escuro'] {"))
    for (const v of ['--fundo:', '--tinta:', '--acao:', '--superficie:']) expect(escuro, v).toContain(v)
  })
})

describe('tipografia', () => {
  it('títulos na Nunito, servida do próprio site (sem fonte de terceiros)', () => {
    const f = ler('src/lib/fontes.ts')
    expect(f).toContain('nunito-variable.ttf')
    expect(f).toContain("variable: '--fonte-titulo'")
    expect(existsSync(join(raiz, 'src/fontes/nunito-variable.ttf'))).toBe(true)
    expect(existsSync(join(raiz, 'src/fontes/Nunito-OFL.txt'))).toBe(true)
    for (const p of css) expect(ler(p), p).not.toMatch(/fonts\.googleapis|@import\s+url\(/)
  })
})

describe('marca', () => {
  it('o logotipo oficial está na barra, nas duas versões (claro e escuro), e os arquivos existem', () => {
    const m = ler('src/components/Marca.tsx')
    expect(m).toContain('/marca/folgali/logo-principal.webp')
    expect(m).toContain('/marca/folgali/logo-escuro.webp')
    for (const a of ['logo-principal.webp', 'logo-escuro.webp', 'icone-32.png', 'icone-180.png', 'icone-192.png', 'icone-512.png', 'logo-og.png']) {
      expect(existsSync(join(raiz, 'public/marca/folgali', a)), a).toBe(true)
    }
    expect(ler('src/app/[lang]/layout.tsx')).toContain('<Marca')
    const f = ler('src/app/folgali.css')
    expect(f).toMatch(/:root\[data-tema='escuro'\] \.marca-claro \{ display: none; \}/)
  })
  it('a marca é sempre "folgali", em minúsculas, nos textos de português e inglês', () => {
    const json = arquivos('src/i18n', /\.(pt|en)\.json$|^(pt|en)\.json$/)
    const maiuscula = json.filter((p) => /\bFolgali\b|\bFOLGALI\b/.test(ler(p)))
    expect(maiuscula).toEqual([])
    expect(ler('src/lib/site.ts')).toContain("nome: 'folgali'")
  })
  it('nenhum texto da folgali tem travessão ou meia-risca', () => {
    const textos = ['src/i18n/social/folgali.pt.json', 'src/i18n/social/folgali.en.json', 'src/lib/folgali/demo.ts']
    for (const p of textos) expect(ler(p), p).not.toMatch(/[—–]/)
  })
  it('o manifesto e os ícones vêm do ícone do app', () => {
    const m = ler('src/app/manifest.ts')
    expect(m).toContain("name: 'folgali'")
    expect(m).toContain('icone-512.png')
  })
})

describe('comunidade e página sem logotipo de iniciais', () => {
  it('o emblema é uma foto de folga, nunca as iniciais do nome', () => {
    const e = ler('src/components/social/Emblema.tsx')
    expect(e).not.toMatch(/iniciaisDe/)
    expect(e).toMatch(/capaDoTema\(/)
    expect(e).toMatch(/<img /)
  })
  it('a capa e o cartão de comunidade já mostram a foto grande: sem emblema por cima', () => {
    for (const p of ['src/components/comunidades/CabecalhoComunidade.tsx', 'src/components/comunidades/CartaoComunidade.tsx']) expect(ler(p), p).not.toMatch(/<Emblema/)
  })
})

describe('concordância de gênero pelo rover', () => {
  it('"Hoje na vida da Lumi", "do Otto", "de" quem não tem gênero conhecido; fora do português, o nome puro', async () => {
    const { deNome, GENERO } = await import('@/lib/folgali/genero')
    const f = Object.entries(GENERO).find(([, g]) => g === 'f')
    const m = Object.entries(GENERO).find(([, g]) => g === 'm')
    expect(f && m, 'o mapa de gênero da demonstração tem de ter rovers dos dois').toBeTruthy()
    expect(deNome('X', f![0], 'pt')).toBe('da X')
    expect(deNome('X', m![0], 'pt')).toBe('do X')
    expect(deNome('X', 'ninguem_conhecido', 'pt')).toBe('de X')
    expect(deNome('X', f![0], 'en')).toBe('X')
    const pt = JSON.parse(ler('src/i18n/social/folgali.pt.json')).socFolgali
    for (const k of ['hoje', 'pausado', 'humorDesc']) expect(pt.meuRover[k], k).toContain('{deNome}')
    expect(pt.lembrancas.titulo).toContain('{deNome}')
    expect(JSON.stringify(pt)).not.toMatch(/ d[oa] \{nome\}| [oa] \{nome\} /)
  })
})

describe('regra da mascote', () => {
  it('o capacete de aviador (peça "touca") é da Luna: nenhum rover aparece com ele', () => {
    expect(semCapacete({ corpo: 'pera', cor: '#ffcd52', acessorios: ['touca'] }).acessorios).toEqual(['laco'])
    expect(semCapacete({ corpo: 'pera', cor: '#ffcd52', acessorios: ['touca', 'laco', 'oculos'] }).acessorios).toEqual(['laco', 'oculos'])
    const sem = { corpo: 'seixo', cor: '#f2e8d6', acessorios: ['fone'] }
    expect(semCapacete(sem)).toBe(sem)
    for (const p of ['src/components/Retrato.tsx', 'src/components/Rover.tsx']) expect(ler(p), p).toContain('semCapacete(')
  })
})

describe('sem aprovação para postar', () => {
  it('não existem mais a tela de aprovar nem a ilha de aprovar', () => {
    for (const p of ['src/app/[lang]/aprovar', 'src/app/[lang]/app/aprovar', 'src/components/TelaAprovar.tsx', 'src/components/aprovar']) expect(existsSync(join(raiz, p)), p).toBe(false)
  })
  it('nenhum componente ou página leva a /aprovar', () => {
    const tsx = [...arquivos('src/components', /\.tsx$/), ...arquivos('src/app', /\.tsx$/)]
    const achados = tsx.filter((p) => /\/aprovar\b/.test(ler(p)))
    expect(achados).toEqual([])
  })
})
