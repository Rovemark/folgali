import Link from 'next/link'
import type { ReactNode } from 'react'

// A small Markdown renderer for the legal texts (src/legal/sources). It covers exactly what Lex's documents use: headings, paragraphs,
// bullet and numbered lists, tables, block quotes, bold, italics, code and links. Nothing is rendered as raw HTML: every piece of text
// becomes a React text node, so a translation cannot inject markup.

const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

/** Internal links of the documents use the path without language (`/termos`); the site prefixes the language. */
export type LinkMap = (path: string) => string

/** The anchor of a heading: numbered sections get `s<number>` (stable across languages); the rest a slug of the text. */
export function headingId(text: string): string {
  const n = /^(\d+(?:\.\d+)*)[.)]?\s/.exec(text)
  if (n) return `s${n[1].replace(/\./g, '-')}`
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return slug ? `t-${slug.slice(0, 60)}` : 't'
}

function inline(text: string, link: LinkMap, key = 'i'): ReactNode[] {
  const out: ReactNode[] = []
  // order matters: code first (its content is literal), then links, bold, italics
  const re = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const k = `${key}-${i++}`
    if (m[1] !== undefined) {
      const c = m[1]
      out.push(EMAIL.test(c) ? <a key={k} href={`mailto:${c}`}><code>{c}</code></a> : <code key={k}>{c}</code>)
    } else if (m[2] !== undefined) {
      const href = m[3]
      const label = inline(m[2], link, k)
      if (href.startsWith('/')) out.push(<Link key={k} href={link(href)}>{label}</Link>)
      else if (/^https:\/\//.test(href)) out.push(<a key={k} href={href} rel="noopener">{label}</a>)
      else if (/^mailto:/.test(href)) out.push(<a key={k} href={href}>{label}</a>)
      else out.push(<span key={k}>{label}</span>)
    } else if (m[4] !== undefined) {
      out.push(<strong key={k}>{inline(m[4], link, k)}</strong>)
    } else if (m[5] !== undefined) {
      out.push(<em key={k}>{inline(m[5], link, k)}</em>)
    }
    last = re.lastIndex
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const cells = (row: string): string[] => {
  const t = row.trim().replace(/^\|/, '').replace(/\|$/, '')
  return t.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'))
}

export type Heading = { level: number; text: string; id: string }

/** The `##` headings of a document, for the table of contents. */
export function headingsOf(md: string): Heading[] {
  return md
    .split('\n')
    .map((l) => /^(#{2})\s+(.+)$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ level: m[1].length, text: m[2].trim(), id: headingId(m[2].trim()) }))
}

/** The `#` title of a document (its first line). */
export const titleOf = (md: string): string => /^#\s+(.+)$/m.exec(md)?.[1].trim() ?? ''

/** Renders a legal document, without its `#` title (the page shows it). */
export default function LegalMarkdown({ md, link }: { md: string; link: LinkMap }) {
  const lines = md.split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let n = 0
  const isBlockStart = (l: string) => /^(#{1,6}\s|[-*]\s|\d+\.\s|>|\|)/.test(l) || l.trim() === ''
  while (i < lines.length) {
    const line = lines[i]
    const k = `b${n++}`
    if (line.trim() === '') { i++; continue }
    const h = /^(#{1,6})\s+(.+)$/.exec(line)
    if (h) {
      const level = h[1].length
      const text = h[2].trim()
      if (level === 1) { i++; continue }
      const Tag = (`h${Math.min(level, 4)}`) as 'h2' | 'h3' | 'h4'
      blocks.push(<Tag key={k} id={headingId(text)}>{inline(text, link, k)}</Tag>)
      i++
      continue
    }
    if (line.startsWith('|')) {
      const rows: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++])
      const [head, , ...body] = rows
      blocks.push(
        <table key={k}>
          <thead><tr>{cells(head).map((c, j) => <th key={j} scope="col">{inline(c, link, `${k}h${j}`)}</th>)}</tr></thead>
          <tbody>{body.map((r, ri) => <tr key={ri}>{cells(r).map((c, j) => <td key={j}>{inline(c, link, `${k}${ri}-${j}`)}</td>)}</tr>)}</tbody>
        </table>,
      )
      continue
    }
    if (line.startsWith('>')) {
      const q: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) q.push(lines[i++].replace(/^>\s?/, ''))
      blocks.push(<blockquote key={k}>{q.filter((x) => x.trim()).map((x, j) => <p key={j}>{inline(x, link, `${k}q${j}`)}</p>)}</blockquote>)
      continue
    }
    const bullet = /^[-*]\s+(.*)$/
    const numbered = /^\d+\.\s+(.*)$/
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line) && !bullet.test(line)
      const re = ordered ? numbered : bullet
      const items: string[] = []
      while (i < lines.length && re.test(lines[i])) {
        let item = re.exec(lines[i++])![1]
        // continuation lines (indented) belong to the item
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !re.test(lines[i].trim())) item += ` ${lines[i++].trim()}`
        items.push(item)
      }
      const List = ordered ? 'ol' : 'ul'
      blocks.push(<List key={k}>{items.map((t, j) => <li key={j}>{inline(t, link, `${k}l${j}`)}</li>)}</List>)
      continue
    }
    const to: string[] = [line]
    i++
    while (i < lines.length && !isBlockStart(lines[i])) to.push(lines[i++])
    blocks.push(<p key={k}>{inline(to.join(' '), link, k)}</p>)
  }
  return <div className="legal-text">{blocks}</div>
}
