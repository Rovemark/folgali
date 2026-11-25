// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { conteudoDe } from '@/conteudo'
import { dataRfc822, montarRss, xml } from '@/lib/seo/rss'

const doc = (s: string) => new DOMParser().parseFromString(s, 'text/xml')

describe('xml()', () => {
  it('escapa os cinco caracteres e tira os de controle proibidos', () => {
    expect(xml(`a & b < c > d " e ' f`)).toBe('a &amp; b &lt; c &gt; d &quot; e &apos; f')
    expect(xml('a\u0000b\u0008c\u000Bd\u001Fe')).toBe('abcde')
    expect(xml('tab\tquebra\nretorno\r')).toBe('tab\tquebra\nretorno\r')
  })
})

describe('dataRfc822', () => {
  it('converte a data ISO para o formato do RSS, ao meio-dia UTC', () => {
    expect(dataRfc822('2026-11-08')).toBe('Sun, 08 Nov 2026 12:00:00 GMT')
    expect(dataRfc822('2026-11-08T10:30:00Z')).toBe('Sun, 08 Nov 2026 10:30:00 GMT')
  })
  it('data inválida não quebra o feed', () => {
    expect(dataRfc822('lixo')).toBe(new Date(0).toUTCString())
  })
})

describe('montarRss', () => {
  const novidades = conteudoDe('pt').novidades
  const rss = montarRss({ base: 'https://x.test', lang: 'pt-BR', titulo: 'Rover Network: Novidades', descricao: 'Mudanças.', novidades })
  it('é um XML bem formado, RSS 2.0, com um item por novidade', () => {
    const d = doc(rss)
    expect(d.querySelector('parsererror')).toBeNull()
    expect(d.documentElement.getAttribute('version')).toBe('2.0')
    expect(d.querySelectorAll('item')).toHaveLength(novidades.length)
  })
  it('a ordem de entrada não importa: mesmo com a lista do mais antigo para o mais novo, o feed sai do mais novo para o mais antigo', () => {
    const n = (id: string, data: string) => ({ id, data, titulo: id, resumo: 'r' })
    const d = doc(montarRss({ base: 'https://x.test', lang: 'pt', titulo: 't', descricao: 'd', novidades: [n('velha', '2026-11-01'), n('nova', '2026-11-08'), n('meio', '2026-11-05')] }))
    expect([...d.querySelectorAll('item > title')].map((t) => t.textContent)).toEqual(['nova', 'meio', 'velha'])
  })
  it('os itens saem da mais nova para a mais antiga', () => {
    const datas = [...doc(rss).querySelectorAll('item pubDate')].map((n) => new Date(n.textContent ?? '').getTime())
    expect(datas).toEqual([...datas].sort((a, b) => b - a))
  })
  it('cada item tem título, link com âncora, guid e descrição', () => {
    const d = doc(rss)
    for (const item of d.querySelectorAll('item')) {
      expect(item.querySelector('title')?.textContent).toBeTruthy()
      expect(item.querySelector('link')?.textContent).toMatch(/^https:\/\/x\.test\/pt-BR\/novidades#/)
      expect(item.querySelector('guid')?.textContent).toBe(item.querySelector('link')?.textContent)
      expect(item.querySelector('description')?.textContent).toBeTruthy()
    }
  })
  it('anuncia o próprio endereço (atom:link self) e o idioma', () => {
    const d = doc(rss)
    expect(d.querySelector('language')?.textContent).toBe('pt-BR')
    expect(rss).toContain('<atom:link href="https://x.test/pt-BR/rss.xml" rel="self" type="application/rss+xml" />')
  })
  it('texto com & e < não quebra o documento', () => {
    const r = montarRss({ base: 'https://x.test', lang: 'pt', titulo: 'A & B', descricao: '<x>', novidades: [{ id: 'a', data: '2026-11-08', titulo: 'T & <b>', resumo: 'R "x"', itens: ['i & j'] }] })
    const d = doc(r)
    expect(d.querySelector('parsererror')).toBeNull()
    expect(d.querySelector('item title')?.textContent).toBe('T & <b>')
    expect(d.querySelector('item description')?.textContent).toBe('R "x" i & j')
  })
  it('sem novidade, o feed continua válido', () => {
    const d = doc(montarRss({ base: 'https://x.test', lang: 'pt', titulo: 't', descricao: 'd', novidades: [] }))
    expect(d.querySelector('parsererror')).toBeNull()
    expect(d.querySelectorAll('item')).toHaveLength(0)
  })
})
