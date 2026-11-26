#!/usr/bin/env node
// The "shape" of a legal text in Markdown, to check that a translation lost nothing and invented nothing that matters:
// the sequence of headings, the numbered items (1.1., 6.3.), the lists, the rows and columns of tables, the link targets,
// the e-mails, the code spans and the numbers. The text itself changes language; the shape does not.
//
//   node scripts/legal-structure.mjs <language>        checks sources/<language>/*.md against sources/en/*.md
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCES = join(SITE, 'src/legal/sources')
export const PAGES = ['termos', 'privacidade', 'regras', 'moderacao', 'responsabilidade-por-agentes', 'cookies', 'desenvolvedores-termos', 'direitos-autorais', 'idade']

/** Digits of any script count as the ASCII ones (Arabic may use ٠-٩). */
const normalizeDigits = (s) => s.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660)).replace(/[０-９]/g, (c) => String(c.charCodeAt(0) - 0xFF10))

export function structure(md) {
  const lines = md.split('\n')
  const titles = []
  const clauses = []
  let items = 0
  let numbered = 0
  const tables = []
  const links = []
  const emails = []
  const codes = []
  let citations = 0
  for (const raw of lines) {
    const l = normalizeDigits(raw)
    const t = /^(#{1,6})\s/.exec(l)
    if (t) { titles.push(t[1].length); const n = /^#{1,6}\s+(\d+(?:\.\d+)*)[.)]?\s/.exec(l); if (n) clauses.push(`#${n[1]}`) }
    const c = /^(?:\*\*)?(\d+\.\d+(?:\.\d+)*)\.(?:\*\*)?\s/.exec(l)
    if (c) clauses.push(c[1])
    if (/^\s*[-*]\s/.test(l)) items++
    if (/^\s*\d+\.\s/.test(l) && !c) numbered++
    if (/^\|/.test(l.trim())) tables.push(l.trim().replace(/\\\|/g, '').split('|').length)
    if (/^>/.test(l)) citations++
    for (const m of l.matchAll(/\]\(([^)]+)\)/g)) links.push(m[1])
    for (const m of l.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) emails.push(m[0])
    for (const m of l.matchAll(/`([^`]+)`/g)) codes.push(/^\[[^\]]+\]$/.test(m[1]) ? '[…]' : m[1]) // the [TOPIC] of the model rules is translated
  }
  return { titles, clauses, itens: items, numbered, tables, citations, links, emails, codes }
}

/** Differences of shape between the translation and the English; empty when they match. */
export function differences(en, translation) {
  const a = structure(en)
  const b = structure(translation)
  const errors = []
  for (const k of Object.keys(a)) {
    const x = JSON.stringify(a[k])
    const y = JSON.stringify(b[k])
    if (x !== y) errors.push(`${k}: inglês ${x.slice(0, 300)} | tradução ${y.slice(0, 300)}`)
  }
  if (/—/.test(translation)) errors.push('travessão (—) proibido (REGRA 0.7)')
  if (/\[(A PREENCHER|TO FILL IN)/.test(translation)) errors.push('colchete de preencher cru')
  return errors
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const language = process.argv[2]
  if (!language) { console.error('uso: node scripts/legal-structure.mjs <idioma>'); process.exit(2) }
  let bad = 0
  for (const p of PAGES) {
    const f = join(SOURCES, language, `${p}.md`)
    if (!existsSync(f)) { console.log(`falta: ${p}`); bad++; continue }
    const d = differences(readFileSync(join(SOURCES, 'en', `${p}.md`), 'utf8'), readFileSync(f, 'utf8'))
    if (d.length) { bad++; console.log(`${p}:\n  ${d.join('\n  ')}`) } else console.log(`${p}: ok`)
  }
  process.exitCode = bad ? 1 : 0
}
