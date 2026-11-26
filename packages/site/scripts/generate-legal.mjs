#!/usr/bin/env node
// The legal texts of the site come from ONE source: the Lex package in `docs/legal/` (version 1.0-beta). That pack is the legal team's
// internal working material: it is not in the public export, so this script only runs in the working repository, and the public
// repository carries its output (src/legal/sources and src/legal/generated).
//
//   1. Portuguese and English: this script reads `docs/legal/NN-*.pt-BR.md` and `NN-*.en.md`, cuts everything below
//      `<!-- FIM DO TEXTO PUBLICÁVEL -->` (or `<!-- END OF PUBLISHABLE TEXT -->`), removes the internal note at the top, the line that points to
//      the file of the other language, the validity sentence (the page shows its own) and replaces `[A PREENCHER ...]` with "(a informar)"
//      (`[TO FILL IN ...]` with "(to be provided)"). Writes to `src/legal/sources/{pt,en}/<page>.md`.
//   2. The other 10 languages are MACHINE TRANSLATION of the English, written by hand (by an agent) in `sources/<language>/<page>.md`, and
//      do not go through this script. The lock `test/legal.test.tsx` checks that each translation has the same structure as the
//      English (headings, numbered items, links, e-mails, numbers).
//   3. All the .md files become one module per language in `src/legal/generated/<language>.ts` (the site does not read files outside
//      its own folder at run time). Never edit the generated ones.
//
//   node scripts/generate-legal.mjs             writes pt/en and the modules
//   node scripts/generate-legal.mjs --conferir  only checks; exits with 1 if anything is out of date
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = resolve(SITE, '..', '..')
const SOURCES = join(SITE, 'src/legal/sources')
const GENERATED = join(SITE, 'src/legal/generated')

/** Site page -> number of the Lex document. The order is the footer's. */
export const DOCUMENTS = [
  { pagina: 'termos', n: '01' },
  { pagina: 'privacidade', n: '02' },
  { pagina: 'regras', n: '03' },
  { pagina: 'moderacao', n: '04' },
  { pagina: 'responsabilidade-por-agentes', n: '05' },
  { pagina: 'cookies', n: '06' },
  { pagina: 'desenvolvedores-termos', n: '08' },
  { pagina: 'direitos-autorais', n: '09' },
  { pagina: 'idade', n: '10' },
]

export const LANGUAGES = ['pt', 'en', 'es', 'fr', 'de', 'it', 'ja', 'ko', 'zh', 'ru', 'ar', 'nl']

function lexFile(n, language) {
  const suffix = language === 'pt' ? '.pt-BR.md' : '.en.md'
  const name = readdirSync(join(REPO, 'docs/legal')).find((f) => f.startsWith(`${n}-`) && f.endsWith(suffix))
  if (!name) throw new Error(`documento ${n} (${language}) não encontrado em docs/legal`)
  return join(REPO, 'docs/legal', name)
}

/** Replaces a `[A PREENCHER ...]` (with nested brackets or not) with the "to be provided" text. */
function swapFill(text, brand, by) {
  let output = ''
  let i = 0
  for (;;) {
    const ini = text.indexOf(`[${brand}`, i)
    if (ini < 0) { output += text.slice(i); break }
    output += text.slice(i, ini)
    let background = 0
    let j = ini
    for (; j < text.length; j++) {
      if (text[j] === '[') background++
      else if (text[j] === ']') { background--; if (background === 0) break }
    }
    output += by
    i = j + 1
  }
  return output
}

/** The publishable text of a Lex document. Pure: the test calls it with the text read. */
export function publishable(rawValue, language) {
  const brand = language === 'pt' ? '<!-- FIM DO TEXTO PUBLICÁVEL -->' : '<!-- END OF PUBLISHABLE TEXT -->'
  const end = rawValue.indexOf(brand)
  if (end < 0) throw new Error(`sem a linha ${brand}`)
  const lines = rawValue.slice(0, end).split('\n')
  const outside = /^(Tradução em inglês|Fonte em português|Portuguese source|English translation|Versão em inglês|Texto em inglês)\b/
  const note = language === 'pt' ? /^> \*\*Nota interna/ : /^> \*\*Internal note/
  const output = []
  for (let k = 0; k < lines.length; k++) {
    let l = lines[k]
    if (outside.test(l)) continue
    if (note.test(l)) {
      // the internal note is a quote block: skip to the first line that does not start with ">"
      while (k + 1 < lines.length && lines[k + 1].startsWith('>')) k++
      continue
    }
    if (/^(Versão|Version) \d+\.\d+-beta/.test(l)) {
      // the page shows the version and validity at the top: only what comes after stays here (e.g. "Part of the [Termos de uso](/termos).")
      // the validity may still be a placeholder ("[A PREENCHER: ...]") or already carry the date ("Vale a partir de 25 de novembro de 2026.")
      l = l.replace(/^(Versão|Version) \d+\.\d+-beta[^.]*\.(\s*(Vale a partir de|Em vigor desde|Effective from|In effect since) (\[[^\]]*\]|[^.[\]]+)\.)?\s*/, '')
      if (!l.trim()) continue
    }
    output.push(l)
  }
  let text = output.join('\n')
  text = language === 'pt' ? swapFill(text, 'A PREENCHER', '(a informar)') : swapFill(text, 'TO FILL IN', '(to be provided)')
  return withoutInternalNote(text).replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/**
 * Removes the reference to the internal notes ("[ver nota A5]", "[see note A2]" and the same thing in any language): the notes stay below the
 * end line and do not go to the site. It also applies to the translations (the generator cleans them all before building the modules). 
 */
export const withoutInternalNote = (text) => text.replace(/[ \u3000]?[\[［][^\[\]［］\n]{0,40}?\bA\d{1,2}\b[^\[\]［］\n]{0,20}[\]］](?!\()/g, '')

const readSource = (language, page) => {
  const f = join(SOURCES, language, `${page}.md`)
  return existsSync(f) ? readFileSync(f, 'utf8') : null
}

/** The generated module of a language: only the pages that exist in it (the missing ones fall back to English, with a notice, on the page). */
export function languageModule(language, texts) {
  const lines = [
    `// GENERATED by scripts/generate-legal.mjs from src/legal/sources/${language}/. Do not edit: edit the source and run the script.`,
    `import type { LegalTexts } from '../types'`,
    '',
    `export const TEXTS: LegalTexts = {`,
  ]
  for (const { pagina: page } of DOCUMENTS) {
    if (texts[page] != null) lines.push(`  ${JSON.stringify(page)}: ${JSON.stringify(texts[page])},`)
  }
  lines.push('}', '')
  return lines.join('\n')
}

/** The version of each page, read from the line "Versão N.N-beta, de ..." of the Portuguese document. */
export function versionOf(rawValue) {
  const m = /^Versão (\d+\.\d+-beta), de ([^.]+?)\./m.exec(rawValue)
  if (!m) throw new Error('documento sem a linha "Versão N.N-beta, de ..."')
  return m[1]
}

export function expected() {
  const files = new Map()
  const versions = {}
  for (const { pagina: page, n } of DOCUMENTS) versions[page] = versionOf(readFileSync(lexFile(n, 'pt'), 'utf8'))
  files.set(join(GENERATED, 'versions.ts'), [
    '// GENERATED by scripts/generate-legal.mjs from the legal pack (the "Versão N.N-beta" line). Do not edit.',
    `export const VERSIONS: Record<string, string> = ${JSON.stringify(versions, null, 2)}`,
    '',
  ].join('\n'))
  for (const language of ['pt', 'en']) {
    for (const { pagina: page, n } of DOCUMENTS) {
      files.set(join(SOURCES, language, `${page}.md`), publishable(readFileSync(lexFile(n, language), 'utf8'), language))
    }
  }
  for (const language of LANGUAGES) {
    const texts = {}
    for (const { pagina: page } of DOCUMENTS) {
      const f = join(SOURCES, language, `${page}.md`)
      const read = files.get(f) ?? readSource(language, page)
      texts[page] = read == null ? null : withoutInternalNote(read)
    }
    files.set(join(GENERATED, `${language}.ts`), languageModule(language, texts))
  }
  return files
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--conferir')
  let bad = 0
  for (const [file, text] of expected()) {
    if (check) {
      const current = existsSync(file) ? readFileSync(file, 'utf8') : null
      if (current !== text) { bad++; console.error(`desatualizado: ${file.slice(SITE.length + 1)}`) }
    } else {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, text)
    }
  }
  if (!check) console.log('textos jurídicos gerados')
  process.exitCode = bad ? 1 : 0
}
