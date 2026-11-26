import { describe, expect, it } from 'vitest'
import { READY } from '@/lib/i18n'
import { metaOf } from '@/lib/i18n-extra'
import { pageMeta, routeMeta, summarize } from '@/lib/seo/metadata'
import { screenMeta } from '@/lib/seo/meta-screens'
import { ROUTES } from '@/lib/seo/routes'

const CLOSED = {}
const OPEN = { FOLGALI_INDEXABLE: 'sim' }
const E = { lang: 'pt' as const, caminho: '/ajuda', titulo: 'Ajuda', descricao: 'Respostas curtas.' }

describe('metaDaPagina', () => {
  it('absolute canonical, without a query, and hreflang in the 12 languages with x-default', () => {
    const m = pageMeta(E, CLOSED)
    expect(m.alternates?.canonical).toBe('https://folgali.com/pt/ajuda')
    expect(m.alternates?.languages).toEqual({
      'pt-BR': 'https://folgali.com/pt/ajuda', en: 'https://folgali.com/en/ajuda', es: 'https://folgali.com/es/ajuda', fr: 'https://folgali.com/fr/ajuda',
      de: 'https://folgali.com/de/ajuda', it: 'https://folgali.com/it/ajuda', ja: 'https://folgali.com/ja/ajuda', ko: 'https://folgali.com/ko/ajuda',
      'zh-Hans': 'https://folgali.com/zh/ajuda', ru: 'https://folgali.com/ru/ajuda', ar: 'https://folgali.com/ar/ajuda', nl: 'https://folgali.com/nl/ajuda',
      'x-default': 'https://folgali.com/pt/ajuda',
    })
  })
  it('uses the environment\'s base URL', () => {
    expect(pageMeta(E, { FOLGALI_BASE_URL: 'https://outro.org' }).alternates?.canonical).toBe('https://outro.org/pt/ajuda')
  })
  it('complete Open Graph and Twitter card, with the generated image and the locale in the language_TERRITORY format', () => {
    const m = pageMeta({ ...E, imageId: 'ajuda' }, CLOSED)
    expect(m.openGraph).toMatchObject({ type: 'website', url: 'https://folgali.com/pt/ajuda', siteName: 'folgali', locale: 'pt_BR', alternateLocale: ['en_US', 'es_ES', 'fr_FR', 'de_DE', 'it_IT', 'ja_JP', 'ko_KR', 'zh_CN', 'ru_RU', 'ar_AR', 'nl_NL'], title: 'Ajuda', description: 'Respostas curtas.' })
    expect((m.openGraph as { images: { url: string; width: number; height: number }[] }).images[0]).toMatchObject({ url: 'https://folgali.com/og/pt/ajuda', width: 1200, height: 630 })
    expect(m.twitter).toMatchObject({ card: 'summary_large_image', title: 'Ajuda', images: ['https://folgali.com/og/pt/ajuda'] })
    expect(pageMeta({ ...E, lang: 'en' }, CLOSED).openGraph).toMatchObject({ locale: 'en_US', alternateLocale: ['pt_BR', 'es_ES', 'fr_FR', 'de_DE', 'it_IT', 'ja_JP', 'ko_KR', 'zh_CN', 'ru_RU', 'ar_AR', 'nl_NL'] })
  })
  it('without imageId the default image applies', () => {
    expect((pageMeta(E, CLOSED).openGraph as { images: { url: string }[] }).images[0].url).toBe('https://folgali.com/og/pt/padrao')
  })
  it('the home page uses the absolute title (without the template suffix); the others, the plain title', () => {
    expect(pageMeta({ ...E, caminho: '' }, CLOSED).title).toEqual({ absolute: 'Ajuda' })
    expect(pageMeta(E, CLOSED).title).toBe('Ajuda')
  })
  it('robots: closed by default; open only with the flag; an app screen never', () => {
    expect(pageMeta(E, CLOSED).robots).toMatchObject({ index: false, follow: false })
    expect(pageMeta(E, OPEN).robots).toMatchObject({ index: true, follow: true })
    expect(pageMeta({ ...E, caminho: '/aprovar' }, OPEN).robots).toMatchObject({ index: false })
    expect(pageMeta({ ...E, caminho: '/r/max' }, OPEN).robots).toMatchObject({ index: false, follow: true })
  })
  it('content that exists in only one language does not announce the other, and the x-default goes to the one that exists', () => {
    const m = pageMeta({ ...E, lang: 'en', idiomas: ['en'] }, CLOSED)
    expect(m.alternates?.canonical).toBe('https://folgali.com/en/ajuda')
    expect(m.alternates?.languages).toEqual({ en: 'https://folgali.com/en/ajuda', 'x-default': 'https://folgali.com/en/ajuda' })
    expect(m.openGraph).toMatchObject({ locale: 'en_US', alternateLocale: [] })
  })
  it('an RSS feed becomes an alternate link', () => {
    expect(pageMeta({ ...E, feed: 'https://x.test/pt/rss.xml' }, CLOSED).alternates?.types).toEqual({ 'application/rss+xml': 'https://x.test/pt/rss.xml' })
    expect(pageMeta(E, CLOSED).alternates).not.toHaveProperty('types')
  })
  it('the description is cut at 155 characters', () => {
    const m = pageMeta({ ...E, descricao: 'palavra '.repeat(60) }, CLOSED)
    expect((m.description as string).length).toBeLessThanOrEqual(155)
  })
})

describe('resumir', () => {
  it('does not touch what fits, collapses spaces and cuts at a whole word with an ellipsis', () => {
    expect(summarize('  oi   mundo  ')).toBe('oi mundo')
    const r = summarize('um dois três quatro cinco seis sete oito nove dez', 30)
    expect(r.length).toBeLessThanOrEqual(30)
    expect(r.endsWith('…')).toBe(true)
    expect(r).not.toMatch(/\s…$/)
    expect(r.slice(0, -1).split(' ').every((p) => ['um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'].includes(p))).toBe(true)
  })
  it('with no space to cut at, cuts at the limit', () => {
    expect(summarize('a'.repeat(200), 50)).toHaveLength(50)
  })
})

describe('metaDaRota e metaTela', () => {
  const internal = ROUTES.filter((r) => r.externo === undefined && r.id !== 'aprovacaoHumana')
  it('every route in the registry has a unique title and description in each language', () => {
    for (const l of READY) {
      const titles = new Set<string>()
      const descriptions = new Set<string>()
      for (const r of internal) {
        const m = metaOf(l, r.id)
        titles.add(m.titulo)
        descriptions.add(m.descricao)
      }
      expect(titles.size, `unique titles in ${l}`).toBe(internal.length)
      expect(descriptions.size, `unique descriptions in ${l}`).toBe(internal.length)
    }
  })
  it('an unknown or external route is a programming error', () => {
    expect(() => routeMeta('pt', 'nao-existe')).toThrow()
    expect(() => routeMeta('pt', 'rovemark')).toThrow()
  })
  it('screenMeta without its own description uses title + the entity\'s sentence (each page, one description)', () => {
    const a = screenMeta('pt', '/amigos', 'Amigos')
    const b = screenMeta('pt', '/avisos', 'Avisos')
    expect(a.description).not.toBe(b.description)
    expect(a.description).toMatch(/^Amigos\./)
  })
  it('screenMeta with its own description uses its own (community, page) and an unknown language falls to pt', () => {
    expect(screenMeta('pt', '/comunidades/ob_x', 'Mesa', 'Uma mesa de gente.').description).toBe('Uma mesa de gente.')
    expect(screenMeta('xx', '/amigos', 'Amigos').alternates?.canonical).toBe('https://folgali.com/pt/amigos')
  })
})
