import { describe, expect, it } from 'vitest'
import { conteudoDe } from '@/conteudo'
import { PRONTOS } from '@/lib/i18n'
import { montarSitemap, type DadosDoSitemap } from '@/lib/seo/sitemap'
import { ROTAS, rotasDoSitemap } from '@/lib/seo/rotas'
import { foraDoIndice } from '@/lib/seo/politica'

const IDIOMAS = [{ lang: 'pt', hreflang: 'pt-BR' }, { lang: 'en', hreflang: 'en' }]
const base = (extra: Partial<DadosDoSitemap> = {}): DadosDoSitemap => ({
  aberto: true, base: 'https://x.test', idiomas: IDIOMAS, padrao: 'pt',
  guias: { pt: [{ slug: 'um', atualizadoEm: '2026-11-08' }, { slug: 'so-pt', atualizadoEm: '2026-11-01' }], en: [{ slug: 'um', atualizadoEm: '2026-11-07' }] },
  verbetes: { pt: [{ slug: 'rover', atualizadoEm: '2026-11-08' }], en: [{ slug: 'rover', atualizadoEm: '2026-11-08' }] },
  comunidades: [{ id: 'ob_c1', atividadeEm: '2026-11-08T10:00:00Z' }], paginas: [{ id: 'ob_p1' }],
  ...extra,
})

describe('sitemap', () => {
  it('fechado devolve lista vazia, qualquer que seja o conteúdo', () => {
    expect(montarSitemap(base({ aberto: false }))).toEqual([])
  })
  it('aberto: cada rota indexável aparece em cada idioma, com endereço absoluto', () => {
    const urls = montarSitemap(base()).map((e) => e.url)
    for (const r of rotasDoSitemap()) for (const l of ['pt', 'en']) expect(urls, `${l}${r.caminho}`).toContain(`https://x.test/${l}${r.caminho}`)
    for (const u of urls) expect(u).toMatch(/^https:\/\/x\.test\/(pt|en)(\/|$)/)
  })
  it('cada entrada anuncia os hreflang dos dois idiomas e o x-default no padrão', () => {
    const e = montarSitemap(base()).find((x) => x.url === 'https://x.test/en/ajuda')
    expect(e?.alternates?.languages).toEqual({ 'pt-BR': 'https://x.test/pt/ajuda', en: 'https://x.test/en/ajuda', 'x-default': 'https://x.test/pt/ajuda' })
  })
  it('guia que só existe em português só entra em português, e sem hreflang para o que não existe', () => {
    const lista = montarSitemap(base())
    expect(lista.some((e) => e.url === 'https://x.test/pt/guias/so-pt')).toBe(true)
    expect(lista.some((e) => e.url === 'https://x.test/en/guias/so-pt')).toBe(false)
    const so = lista.find((e) => e.url === 'https://x.test/pt/guias/so-pt')
    expect(so?.alternates?.languages).toEqual({ 'pt-BR': 'https://x.test/pt/guias/so-pt', 'x-default': 'https://x.test/pt/guias/so-pt' })
  })
  it('guia que só existe em inglês: o x-default aponta para o inglês, nunca para uma página que não existe', () => {
    const lista = montarSitemap(base({ guias: { pt: [], en: [{ slug: 'so-en', atualizadoEm: '2026-11-01' }] } }))
    const e = lista.find((x) => x.url === 'https://x.test/en/guias/so-en')
    expect(e?.alternates?.languages).toEqual({ en: 'https://x.test/en/guias/so-en', 'x-default': 'https://x.test/en/guias/so-en' })
    expect(lista.some((x) => x.url === 'https://x.test/pt/guias/so-en')).toBe(false)
  })
  it('guia nos dois idiomas leva a data mais recente das duas', () => {
    const e = montarSitemap(base()).find((x) => x.url === 'https://x.test/pt/guias/um')
    expect(e?.lastModified).toEqual(new Date('2026-11-08'))
  })
  it('verbetes, comunidades e páginas entram; data inválida vira ausente, não erro', () => {
    const lista = montarSitemap(base({ comunidades: [{ id: 'ob_c1', atividadeEm: 'lixo' }] }))
    expect(lista.some((e) => e.url === 'https://x.test/en/glossario/rover')).toBe(true)
    expect(lista.some((e) => e.url === 'https://x.test/pt/paginas/ob_p1')).toBe(true)
    const c = lista.find((e) => e.url === 'https://x.test/pt/comunidades/ob_c1')
    expect(c).toBeDefined()
    expect(c?.lastModified).toBeUndefined()
  })
  it('o id da comunidade é escapado na URL', () => {
    const lista = montarSitemap(base({ comunidades: [{ id: 'a b/c' }] }))
    expect(lista.some((e) => e.url === 'https://x.test/pt/comunidades/a%20b%2Fc')).toBe(true)
  })
  it('nenhuma rota fora do índice (app, busca, perfil) aparece, em nenhum idioma', () => {
    for (const e of montarSitemap(base())) expect(foraDoIndice(e.url.replace(/^https:\/\/x\.test\/(pt|en)/, '') || '/'), e.url).toBe(false)
  })
  it('não repete endereço', () => {
    const urls = montarSitemap(base()).map((e) => e.url)
    expect(new Set(urls).size).toBe(urls.length)
  })
  it('rota externa e rota marcada como não indexável ficam de fora do registro do sitemap', () => {
    const ids = rotasDoSitemap().map((r) => r.id)
    for (const r of ROTAS.filter((x) => x.externo !== undefined)) expect(ids).not.toContain(r.id)
    expect(ids).not.toContain('buscar')
    expect(ids).not.toContain('aprovacaoHumana')
  })
  it('com o conteúdo REAL do site, nenhum endereço se repete (o guia do registro não entra duas vezes)', () => {
    const real = base({
      guias: Object.fromEntries(PRONTOS.map((l) => [l, conteudoDe(l).guias])),
      verbetes: Object.fromEntries(PRONTOS.map((l) => [l, conteudoDe(l).verbetes])),
    })
    const urls = montarSitemap(real).map((e) => e.url)
    expect(new Set(urls).size).toBe(urls.length)
    expect(urls.filter((u) => u.endsWith('/guias/como-funciona-a-aprovacao-humana'))).toHaveLength(2)
  })
  it('sem idioma pronto, não há entrada (e não quebra)', () => {
    expect(montarSitemap(base({ idiomas: [] }))).toEqual([])
  })
})
