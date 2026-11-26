// RSS 2.0 of the news. Pure function: data in, XML out. All text goes through `xml()`, which escapes what breaks the document.
import type { NewsItem } from '@/content/types'
import { ENTITY, absoluteUrl } from '@/lib/site'

export const xml = (s: string): string =>
  s
    // control characters forbidden in XML 1.0 are dropped; tab, line break and return stay
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

/** ISO date (`2026-11-08`) to the RSS format (RFC 822), always at noon UTC. */
export function dataRfc822(iso: string): string {
  const t = new Date(`${iso.length === 10 ? `${iso}T12:00:00Z` : iso}`)
  return Number.isNaN(t.getTime()) ? new Date(0).toUTCString() : t.toUTCString()
}

export type RssData = { base: string; lang: string; titulo: string; descricao: string; novidades: readonly NewsItem[] }

export function buildRss(d: RssData): string {
  const page = absoluteUrl(d.base, d.lang, '/novidades')
  const items = [...d.novidades]
    .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0))
    .map((n) => {
      const list = n.itens && n.itens.length > 0 ? ` ${n.itens.join(' ')}` : ''
      return [
        '    <item>',
        `      <title>${xml(n.titulo)}</title>`,
        `      <link>${xml(`${page}#${n.id}`)}</link>`,
        `      <guid isPermaLink="true">${xml(`${page}#${n.id}`)}</guid>`,
        `      <pubDate>${dataRfc822(n.data)}</pubDate>`,
        `      <description>${xml(`${n.resumo}${list}`)}</description>`,
        '    </item>',
      ].join('\n')
    })
  const last = d.novidades.length > 0 ? dataRfc822([...d.novidades].map((n) => n.data).sort().at(-1) as string) : new Date(0).toUTCString()
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${xml(d.titulo)}</title>`,
    `    <link>${xml(page)}</link>`,
    `    <description>${xml(d.descricao)}</description>`,
    `    <language>${xml(d.lang)}</language>`,
    `    <generator>${xml(ENTITY.nome)}</generator>`,
    `    <lastBuildDate>${last}</lastBuildDate>`,
    `    <atom:link href="${xml(absoluteUrl(d.base, d.lang, '/rss.xml'))}" rel="self" type="application/rss+xml" />`,
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n')
}
