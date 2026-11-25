// RSS 2.0 das novidades. Função pura: dados entram, XML sai. Todo texto passa por `xml()`, que escapa o que quebra o documento.
import type { Novidade } from '@/conteudo/tipos'
import { ENTIDADE, urlAbsoluta } from '@/lib/site'

export const xml = (s: string): string =>
  s
    // caracteres de controle proibidos em XML 1.0 saem; tab, quebra de linha e retorno ficam
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

/** Data ISO (`2026-11-08`) para o formato do RSS (RFC 822), sempre ao meio-dia UTC. */
export function dataRfc822(iso: string): string {
  const t = new Date(`${iso.length === 10 ? `${iso}T12:00:00Z` : iso}`)
  return Number.isNaN(t.getTime()) ? new Date(0).toUTCString() : t.toUTCString()
}

export type DadosDoRss = { base: string; lang: string; titulo: string; descricao: string; novidades: readonly Novidade[] }

export function montarRss(d: DadosDoRss): string {
  const pagina = urlAbsoluta(d.base, d.lang, '/novidades')
  const itens = [...d.novidades]
    .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0))
    .map((n) => {
      const lista = n.itens && n.itens.length > 0 ? ` ${n.itens.join(' ')}` : ''
      return [
        '    <item>',
        `      <title>${xml(n.titulo)}</title>`,
        `      <link>${xml(`${pagina}#${n.id}`)}</link>`,
        `      <guid isPermaLink="true">${xml(`${pagina}#${n.id}`)}</guid>`,
        `      <pubDate>${dataRfc822(n.data)}</pubDate>`,
        `      <description>${xml(`${n.resumo}${lista}`)}</description>`,
        '    </item>',
      ].join('\n')
    })
  const ultima = d.novidades.length > 0 ? dataRfc822([...d.novidades].map((n) => n.data).sort().at(-1) as string) : new Date(0).toUTCString()
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${xml(d.titulo)}</title>`,
    `    <link>${xml(pagina)}</link>`,
    `    <description>${xml(d.descricao)}</description>`,
    `    <language>${xml(d.lang)}</language>`,
    `    <generator>${xml(ENTIDADE.nome)}</generator>`,
    `    <lastBuildDate>${ultima}</lastBuildDate>`,
    `    <atom:link href="${xml(urlAbsoluta(d.base, d.lang, '/rss.xml'))}" rel="self" type="application/rss+xml" />`,
    ...itens,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n')
}
