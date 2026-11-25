import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { rotuloDe } from '@/lib/i18n-extra'
import { ROTAS } from '@/lib/seo/rotas'

const fonte = readFileSync('src/app/[lang]/not-found.tsx', 'utf8')
const sugestoes = [...(/const SUGESTOES = \[([^\]]+)\]/.exec(fonte)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])

describe('404 útil', () => {
  it('sugere pelo menos quatro partes do site', () => {
    expect(sugestoes.length).toBeGreaterThanOrEqual(4)
  })
  it.each(sugestoes)('a sugestão %s existe no registro de rotas, é interna e tem rótulo nos dois idiomas', (id) => {
    const r = ROTAS.find((x) => x.id === id)
    expect(r, `rota ${id}`).toBeDefined()
    expect(r!.caminho.startsWith('/')).toBe(true)
    expect(rotuloDe('pt', id).length).toBeGreaterThan(0)
    expect(rotuloDe('en', id).length).toBeGreaterThan(0)
  })
  it('endereço inexistente num idioma válido responde 404 de verdade, noindex, com os caminhos principais', async () => {
    const { GET } = await import('@/app/[lang]/[...resto]/route')
    for (const lang of ['pt', 'en']) {
      const r = await GET(new Request(`http://x/${lang}/nada/aqui`), { params: Promise.resolve({ lang }) })
      const html = await r.text()
      expect(r.status).toBe(404)
      expect(html).toContain('name="robots" content="noindex"')
      expect(html).toContain(`href="/${lang}/ajuda"`)
      expect(html).toContain(`href="/${lang}"`)
      expect(html).not.toContain('—')
    }
  })
  it('idioma desconhecido cai no padrão em vez de quebrar', async () => {
    const { GET } = await import('@/app/[lang]/[...resto]/route')
    const r = await GET(new Request('http://x/xx/y'), { params: Promise.resolve({ lang: 'xx' }) })
    expect(r.status).toBe(404)
    expect(await r.text()).toContain('lang="pt-BR"')
  })
})
