// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { contentOf } from '@/content'
import { dataRfc822, buildRss, xml } from '@/lib/seo/rss'

const doc = (s: string) => new DOMParser().parseFromString(s, 'text/xml')

describe('xml()', () => {
  it('escapes the five characters and removes the forbidden control ones', () => {
    expect(xml(`a & b < c > d " e ' f`)).toBe('a &amp; b &lt; c &gt; d &quot; e &apos; f')
    expect(xml('a\u0000b\u0008c\u000Bd\u001Fe')).toBe('abcde')
    expect(xml('tab\tquebra\nretorno\r')).toBe('tab\tquebra\nretorno\r')
  })
})

describe('dataRfc822', () => {
  it('converts the ISO date to the RSS format, at noon UTC', () => {
    expect(dataRfc822('2026-11-08')).toBe('Sun, 08 Nov 2026 12:00:00 GMT')
    expect(dataRfc822('2026-11-08T10:30:00Z')).toBe('Sun, 08 Nov 2026 10:30:00 GMT')
  })
  it('an invalid date does not break the feed', () => {
    expect(dataRfc822('lixo')).toBe(new Date(0).toUTCString())
  })
})

describe('montarRss', () => {
  const news = contentOf('pt').novidades
  const rss = buildRss({ base: 'https://x.test', lang: 'pt-BR', titulo: 'Rover Network: Novidades', descricao: 'Mudanças.', novidades: news })
  it('is well-formed XML, RSS 2.0, with one item per news entry', () => {
    const d = doc(rss)
    expect(d.querySelector('parsererror')).toBeNull()
    expect(d.documentElement.getAttribute('version')).toBe('2.0')
    expect(d.querySelectorAll('item')).toHaveLength(news.length)
  })
  it('the input order does not matter: even with the list from oldest to newest, the feed comes out from newest to oldest', () => {
    const n = (id: string, data: string) => ({ id, data, titulo: id, resumo: 'r' })
    const d = doc(buildRss({ base: 'https://x.test', lang: 'pt', titulo: 't', descricao: 'd', novidades: [n('velha', '2026-11-01'), n('nova', '2026-11-08'), n('meio', '2026-11-05')] }))
    expect([...d.querySelectorAll('item > title')].map((t) => t.textContent)).toEqual(['nova', 'meio', 'velha'])
  })
  it('the items come out from newest to oldest', () => {
    const dates = [...doc(rss).querySelectorAll('item pubDate')].map((n) => new Date(n.textContent ?? '').getTime())
    expect(dates).toEqual([...dates].sort((a, b) => b - a))
  })
  it('each item has a title, a link with an anchor, a guid and a description', () => {
    const d = doc(rss)
    for (const item of d.querySelectorAll('item')) {
      expect(item.querySelector('title')?.textContent).toBeTruthy()
      expect(item.querySelector('link')?.textContent).toMatch(/^https:\/\/x\.test\/pt-BR\/novidades#/)
      expect(item.querySelector('guid')?.textContent).toBe(item.querySelector('link')?.textContent)
      expect(item.querySelector('description')?.textContent).toBeTruthy()
    }
  })
  it('announces its own address (atom:link self) and the language', () => {
    const d = doc(rss)
    expect(d.querySelector('language')?.textContent).toBe('pt-BR')
    expect(rss).toContain('<atom:link href="https://x.test/pt-BR/rss.xml" rel="self" type="application/rss+xml" />')
  })
  it('text with & and < does not break the document', () => {
    const r = buildRss({ base: 'https://x.test', lang: 'pt', titulo: 'A & B', descricao: '<x>', novidades: [{ id: 'a', data: '2026-11-08', titulo: 'T & <b>', resumo: 'R "x"', itens: ['i & j'] }] })
    const d = doc(r)
    expect(d.querySelector('parsererror')).toBeNull()
    expect(d.querySelector('item title')?.textContent).toBe('T & <b>')
    expect(d.querySelector('item description')?.textContent).toBe('R "x" i & j')
  })
  it('with no news, the feed stays valid', () => {
    const d = doc(buildRss({ base: 'https://x.test', lang: 'pt', titulo: 't', descricao: 'd', novidades: [] }))
    expect(d.querySelector('parsererror')).toBeNull()
    expect(d.querySelectorAll('item')).toHaveLength(0)
  })
})
