import { describe, expect, it } from 'vitest'
import { PRONTOS } from '@/lib/i18n'
import { metaDe } from '@/lib/i18n-extra'
import { metaDaPagina, metaDaRota, resumir } from '@/lib/seo/metadata'
import { metaTela } from '@/lib/seo/meta-telas'
import { ROTAS } from '@/lib/seo/rotas'

const FECHADO = {}
const ABERTO = { ROVER_NETWORK_INDEXAVEL: 'sim' }
const E = { lang: 'pt' as const, caminho: '/ajuda', titulo: 'Ajuda', descricao: 'Respostas curtas.' }

describe('metaDaPagina', () => {
  it('canonical absoluto, sem consulta, e hreflang nos 12 idiomas com x-default', () => {
    const m = metaDaPagina(E, FECHADO)
    expect(m.alternates?.canonical).toBe('https://folgali.com/pt/ajuda')
    expect(m.alternates?.languages).toEqual({
      'pt-BR': 'https://folgali.com/pt/ajuda', en: 'https://folgali.com/en/ajuda', es: 'https://folgali.com/es/ajuda', fr: 'https://folgali.com/fr/ajuda',
      de: 'https://folgali.com/de/ajuda', it: 'https://folgali.com/it/ajuda', ja: 'https://folgali.com/ja/ajuda', ko: 'https://folgali.com/ko/ajuda',
      'zh-Hans': 'https://folgali.com/zh/ajuda', ru: 'https://folgali.com/ru/ajuda', ar: 'https://folgali.com/ar/ajuda', nl: 'https://folgali.com/nl/ajuda',
      'x-default': 'https://folgali.com/pt/ajuda',
    })
  })
  it('usa a URL-base do ambiente', () => {
    expect(metaDaPagina(E, { ROVER_NETWORK_URL_BASE: 'https://outro.org' }).alternates?.canonical).toBe('https://outro.org/pt/ajuda')
  })
  it('Open Graph e Twitter card completos, com a imagem gerada e o locale no formato idioma_TERRITÓRIO', () => {
    const m = metaDaPagina({ ...E, imagemId: 'ajuda' }, FECHADO)
    expect(m.openGraph).toMatchObject({ type: 'website', url: 'https://folgali.com/pt/ajuda', siteName: 'folgali', locale: 'pt_BR', alternateLocale: ['en_US', 'es_ES', 'fr_FR', 'de_DE', 'it_IT', 'ja_JP', 'ko_KR', 'zh_CN', 'ru_RU', 'ar_AR', 'nl_NL'], title: 'Ajuda', description: 'Respostas curtas.' })
    expect((m.openGraph as { images: { url: string; width: number; height: number }[] }).images[0]).toMatchObject({ url: 'https://folgali.com/og/pt/ajuda', width: 1200, height: 630 })
    expect(m.twitter).toMatchObject({ card: 'summary_large_image', title: 'Ajuda', images: ['https://folgali.com/og/pt/ajuda'] })
    expect(metaDaPagina({ ...E, lang: 'en' }, FECHADO).openGraph).toMatchObject({ locale: 'en_US', alternateLocale: ['pt_BR', 'es_ES', 'fr_FR', 'de_DE', 'it_IT', 'ja_JP', 'ko_KR', 'zh_CN', 'ru_RU', 'ar_AR', 'nl_NL'] })
  })
  it('sem imagemId vale a imagem padrão', () => {
    expect((metaDaPagina(E, FECHADO).openGraph as { images: { url: string }[] }).images[0].url).toBe('https://folgali.com/og/pt/padrao')
  })
  it('o início usa o título absoluto (sem o sufixo do template); as outras, o título simples', () => {
    expect(metaDaPagina({ ...E, caminho: '' }, FECHADO).title).toEqual({ absolute: 'Ajuda' })
    expect(metaDaPagina(E, FECHADO).title).toBe('Ajuda')
  })
  it('robots: fechado por padrão; aberto só com a flag; tela de app nunca', () => {
    expect(metaDaPagina(E, FECHADO).robots).toMatchObject({ index: false, follow: false })
    expect(metaDaPagina(E, ABERTO).robots).toMatchObject({ index: true, follow: true })
    expect(metaDaPagina({ ...E, caminho: '/aprovar' }, ABERTO).robots).toMatchObject({ index: false })
    expect(metaDaPagina({ ...E, caminho: '/r/max' }, ABERTO).robots).toMatchObject({ index: false, follow: true })
  })
  it('conteúdo que só existe num idioma não anuncia o outro, e o x-default vai para o que existe', () => {
    const m = metaDaPagina({ ...E, lang: 'en', idiomas: ['en'] }, FECHADO)
    expect(m.alternates?.canonical).toBe('https://folgali.com/en/ajuda')
    expect(m.alternates?.languages).toEqual({ en: 'https://folgali.com/en/ajuda', 'x-default': 'https://folgali.com/en/ajuda' })
    expect(m.openGraph).toMatchObject({ locale: 'en_US', alternateLocale: [] })
  })
  it('feed RSS vira link alternate', () => {
    expect(metaDaPagina({ ...E, feed: 'https://x.test/pt/rss.xml' }, FECHADO).alternates?.types).toEqual({ 'application/rss+xml': 'https://x.test/pt/rss.xml' })
    expect(metaDaPagina(E, FECHADO).alternates).not.toHaveProperty('types')
  })
  it('a descrição é cortada em 155 caracteres', () => {
    const m = metaDaPagina({ ...E, descricao: 'palavra '.repeat(60) }, FECHADO)
    expect((m.description as string).length).toBeLessThanOrEqual(155)
  })
})

describe('resumir', () => {
  it('não mexe no que cabe, junta espaços e corta em palavra inteira com reticências', () => {
    expect(resumir('  oi   mundo  ')).toBe('oi mundo')
    const r = resumir('um dois três quatro cinco seis sete oito nove dez', 30)
    expect(r.length).toBeLessThanOrEqual(30)
    expect(r.endsWith('…')).toBe(true)
    expect(r).not.toMatch(/\s…$/)
    expect(r.slice(0, -1).split(' ').every((p) => ['um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'].includes(p))).toBe(true)
  })
  it('sem espaço para cortar, corta no limite', () => {
    expect(resumir('a'.repeat(200), 50)).toHaveLength(50)
  })
})

describe('metaDaRota e metaTela', () => {
  const internas = ROTAS.filter((r) => r.externo === undefined && r.id !== 'aprovacaoHumana')
  it('toda rota do registro tem título e descrição únicos em cada idioma', () => {
    for (const l of PRONTOS) {
      const titulos = new Set<string>()
      const descricoes = new Set<string>()
      for (const r of internas) {
        const m = metaDe(l, r.id)
        titulos.add(m.titulo)
        descricoes.add(m.descricao)
      }
      expect(titulos.size, `títulos únicos em ${l}`).toBe(internas.length)
      expect(descricoes.size, `descrições únicas em ${l}`).toBe(internas.length)
    }
  })
  it('rota desconhecida ou externa é erro de programação', () => {
    expect(() => metaDaRota('pt', 'nao-existe')).toThrow()
    expect(() => metaDaRota('pt', 'rovemark')).toThrow()
  })
  it('metaTela sem descrição própria usa título + frase da entidade (cada página, uma descrição)', () => {
    const a = metaTela('pt', '/amigos', 'Amigos')
    const b = metaTela('pt', '/avisos', 'Avisos')
    expect(a.description).not.toBe(b.description)
    expect(a.description).toMatch(/^Amigos\./)
  })
  it('metaTela com descrição própria usa a própria (comunidade, página) e idioma desconhecido cai no pt', () => {
    expect(metaTela('pt', '/comunidades/ob_x', 'Mesa', 'Uma mesa de gente.').description).toBe('Uma mesa de gente.')
    expect(metaTela('xx', '/amigos', 'Amigos').alternates?.canonical).toBe('https://folgali.com/pt/amigos')
  })
})
