// A imagem de compartilhamento de chinês, japonês e coreano usa fontes RECORTADAS do repositório (src/fontes/og). Este teste lê a
// tabela cmap de cada arquivo e exige que todo caractere que a imagem pode desenhar neste idioma esteja nela: sem isso o glifo
// que falta sai como quadrado vazio. Mudou um título ou a frase da marca? Rode `node scripts/fontes-og.mjs` de novo (ver docs/IDIOMAS.md).
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PACOTES } from '@/i18n/pacotes'

const DIR = path.resolve(__dirname, '../../src/fontes/og')

/** Os pontos de código que a fonte cobre (cmap formatos 4 e 12, o que o recorte grava). */
function cobertura(arq: string): Set<number> {
  const b = fs.readFileSync(arq)
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const n = dv.getUint16(4)
  let cmap = -1
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16
    if (b.toString('latin1', o, o + 4) === 'cmap') cmap = dv.getUint32(o + 8)
  }
  if (cmap < 0) throw new Error(`${arq}: sem tabela cmap`)
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
      const fim = t + 14, ini = fim + segs * 2 + 2
      for (let j = 0; j < segs; j++) for (let c = dv.getUint16(ini + j * 2); c <= dv.getUint16(fim + j * 2); c++) if (c !== 0xffff) out.add(c)
    }
  }
  return out
}

/** Todo texto que a imagem desenha: o título de cada rota, a marca e a nota (src/app/og/[lang]/[id]/route.tsx). */
const texto = (l: 'zh' | 'ja' | 'ko') => {
  const inst = PACOTES[l].inst as unknown as { meta: Record<string, { titulo: string }> }
  return [...Object.values(inst.meta).map((m) => m.titulo), PACOTES[l].rodape.marca.titulo, PACOTES[l].rodape.marca.nota].join('')
}

describe('fontes recortadas da imagem de compartilhamento', () => {
  for (const l of ['zh', 'ja', 'ko'] as const) {
    for (const peso of [400, 700]) {
      it(`${l}-${peso}.ttf cobre todo caractere que a imagem desenha`, () => {
        const cov = cobertura(path.join(DIR, `${l}-${peso}.ttf`))
        const falta = [...new Set(texto(l))].filter((c) => c.trim() && !cov.has(c.codePointAt(0)!))
        expect(falta, `${l}-${peso}: glifos que faltam`).toEqual([])
      })
    }
  }
  it('a verificação morde: um texto com caractere fora da fonte é acusado', () => {
    const cov = cobertura(path.join(DIR, 'ko-400.ttf'))
    expect(cov.has('한'.codePointAt(0)!)).toBe(true)
    expect(cov.has('龘'.codePointAt(0)!)).toBe(false)
  })
})
