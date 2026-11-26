// SPDX-License-Identifier: AGPL-3.0-or-later
// Mutation meter per module. Plants ONE defect at a time in a temporary copy of the repository and requires the module's
// test suite to fail. Operators: comparison (=== !== < <= > >=), logical (&& ||), arithmetic (+ - *), integers (+1 and -1),
// booleans (true false), negation (`!x` becomes `x`), the condition of `if (...) {` forced to true and to false, and the one-line guard
// (`if (...) return|throw|continue|break` becomes `if (false)`). It only touches CODE: its own scanner separates comments,
// strings and regexes from code.
//
// Before the first defect, the two guards from guard.mjs run (live baseline and lethal defect). Each defect is checked with
// `node --check`: one that does not even compile is discarded and counted apart (dying of a SyntaxError proves nothing about the tests).
// A survivor goes into `equivalentes` (with the reason: no test can tell the difference) or is a test hole to fix.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { requireLiveMeter } from './guard.mjs'

/** What never goes into the temporary mutation copy. */
export const OUTSIDE_THE_COPY = /[\\/](node_modules|\.next)([\\/]|$)/

const WORDS_BEFORE_REGEX = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'else'])

/** 1 where there is code, 0 where there is a comment, string or regex. */
export function classify(text) {
  const code = new Uint8Array(text.length)
  const stack = [] // 'tpl' or { expr: brace depth }
  let i = 0
  let last = '' // last code character that is not whitespace
  let lastWord = ''
  const isSpace = (c) => c === ' ' || c === '\n' || c === '\t' || c === '\r'
  const mark = (a, b) => { for (let k = a; k < b; k++) code[k] = 1 }
  while (i < text.length) {
    const top = stack[stack.length - 1]
    if (top === 'tpl') {
      const c = text[i]
      if (c === '\\') { i += 2; continue }
      if (c === '`') { stack.pop(); i++; last = '`'; continue }
      if (c === '$' && text[i + 1] === '{') { stack.push({ expr: 0 }); i += 2; last = '{'; continue }
      i++
      continue
    }
    const c = text[i]
    const n = text[i + 1]
    if (isSpace(c)) { code[i] = 1; i++; continue }
    if (c === '/' && n === '/') { while (i < text.length && text[i] !== '\n') i++; continue }
    if (c === '/' && n === '*') { const f = text.indexOf('*/', i + 2); i = f < 0 ? text.length : f + 2; continue }
    if (c === '"' || c === "'") {
      i++
      while (i < text.length && text[i] !== c && text[i] !== '\n') i += text[i] === '\\' ? 2 : 1
      i++
      last = c
      continue
    }
    if (c === '`') { stack.push('tpl'); i++; continue }
    if (c === '/') {
      const regex = last === '' || '(,=:[!&|?{};'.includes(last) || WORDS_BEFORE_REGEX.has(lastWord)
      if (regex) {
        i++
        let kind = false
        while (i < text.length && text[i] !== '\n') {
          const d = text[i]
          if (d === '\\') { i += 2; continue }
          if (d === '[') kind = true
          else if (d === ']') kind = false
          else if (d === '/' && !kind) break
          i++
        }
        i++
        while (i < text.length && /[a-z]/.test(text[i])) i++
        last = '/'
        lastWord = ''
        continue
      }
    }
    if (c === '{' && top && typeof top === 'object') top.expr++
    if (c === '}' && top && typeof top === 'object') {
      if (top.expr === 0) { stack.pop(); i++; continue }
      top.expr--
    }
    mark(i, i + 1)
    if (/[\w$]/.test(c)) {
      let j = i
      while (j < text.length && /[\w$]/.test(text[j])) { code[j] = 1; j++ }
      lastWord = text.slice(i, j)
      last = text[j - 1]
      i = j
      continue
    }
    last = c
    lastWord = ''
    i++
  }
  return code
}

const allCode = (code, a, b) => { for (let k = a; k < b; k++) if (!code[k]) return false; return true }

const SWAPS = [
  ['===', '!=='], ['!==', '==='], ['&&', '||'], ['||', '&&'],
  ['<=', '<'], ['>=', '>'], [' < ', ' <= '], [' > ', ' >= '],
  [' + ', ' - '], [' - ', ' + '], [' * ', ' / '],
  ['true', 'false'], ['false', 'true']
]

/** Defects for ONE line. `code` is the line's mask (same length). */
export function lineMutants(line, code) {
  const out = []
  if (!line.trim()) return out
  for (const [from, to] of SWAPS) {
    let i = -1
    while ((i = line.indexOf(from, i + 1)) !== -1) {
      if (!allCode(code, i, i + from.length)) continue
      const ident = /[\w$]/
      if (/^[a-z]/.test(from) && (ident.test(line[i - 1] ?? '') || ident.test(line[i + from.length] ?? ''))) continue
      out.push([`${from.trim()}->${to.trim()}@${i}`, line.slice(0, i) + to + line.slice(i + from.length)])
    }
  }
  // negation: `!x` becomes `x` (does not touch `!=`, `!==` or `!!`)
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '!' && code[i] && line[i + 1] !== '=' && line[i + 1] !== '!' && line[i - 1] !== '!') {
      out.push([`!-removido@${i}`, line.slice(0, i) + line.slice(i + 1)])
    }
  }
  // integers
  const re = /(?<![\w$.])(\d+)(?![\w.])/g
  let m
  while ((m = re.exec(line))) {
    if (!allCode(code, m.index, m.index + m[1].length)) continue
    const n = Number(m[1])
    out.push([`${n}->${n + 1}@${m.index}`, line.slice(0, m.index) + (n + 1) + line.slice(m.index + m[1].length)])
    if (n > 0) out.push([`${n}->${n - 1}@${m.index}`, line.slice(0, m.index) + (n - 1) + line.slice(m.index + m[1].length)])
  }
  // forced `if (...) {` condition
  const cond = /^(\s*(?:\}\s*else\s+)?if \()(.*)(\) \{\s*)$/.exec(line)
  if (cond && code[cond[1].length - 4]) {
    out.push(['if-sempre-falso', `${cond[1]}false${cond[3]}`])
    out.push(['if-sempre-verdadeiro', `${cond[1]}true${cond[3]}`])
  }
  const g = /^(\s*)if \((.*)\) (return\b.*|throw\b.*|continue\b.*|break\b.*)$/.exec(line)
  if (g && code[g[1].length]) out.push(['guarda-desligada', `${g[1]}if (false) ${g[3]}`])
  return out
}

/** Functions that kill the process group of each running mutant; the mutation run calls them on exit so no orphan is left behind. */
const liveGroups = new Set()
const clearGroups = () => { for (const kill of [...liveGroups]) kill() }
process.on('exit', clearGroups)
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => { clearGroups(); process.exit(128) })

/**
 * @param {object} o
 * @param {string} o.rotulo
 * @param {string} o.raiz                    repository root
 * @param {string[]} o.copiar                files and folders (relative to the root) that the test needs in the copy
 * @param {Array<{ arquivo: string, desde?: string, ate?: string }>} o.alvos
 * @param {string[]} o.testes                test files of the module's suite (relative to the root)
 * @param {Map<string,string>} [o.equivalentes]  `${arquivo}:${linha.trim()}|${operador}` -> motivo
 * @param {Array<[string, string, string, string]>} [o.extras]  hand-made defects where no operator reaches: [name, file, snippet, replacement]
 * @param {number} [o.paralelo]
 * @param {boolean} [o.sequencial]           one test file at a time, stopping at the first that fails (the order of `testes` matters)
 * @param {number} [o.timeoutMs]         time limit for each mutant (default 60000); past it, the whole process group is killed
 */
export async function runMeter(o) {
  const equivalents = o.equivalentes ?? new Map()
  const nodeArgs = ['--disable-warning=ExperimentalWarning', '--test', '--test-reporter=tap', ...o.testes]
  const copy = () => {
    const tmp = mkdtempSync(join(tmpdir(), `rn-mutacao-${o.rotulo.replace(/\W+/g, '-')}-`))
    for (const f of o.copiar) {
      mkdirSync(dirname(join(tmp, f)), { recursive: true })
      // The site's node_modules and .next never enter the copy: no mutation suite uses them, and with node_modules copied for real
      // (not by link) each copy went over 500 MB, times 8 copies per module; that is what filled the disk on 2026-11-17
      cpSync(join(o.raiz, f), join(tmp, f), { recursive: true, filter: (origin) => !OUTSIDE_THE_COPY.test(origin) })
    }
    return tmp
  }
  // the guards (baseline and lethal defect) also run in their own group and the group is killed at the end: a test that leaves a child alive does not leak
  const run = (tmp) => {
    const r = spawnSync(process.execPath, nodeArgs, { cwd: tmp, encoding: 'utf8', timeout: 120_000, detached: true })
    try { process.kill(-r.pid, 'SIGKILL') } catch { /* the group has already ended */ }
    return r
  }
  requireLiveMeter({ rotulo: o.rotulo, copiar: copy, rodar: run, lethalTarget: o.alvos[0].arquivo })

  const mutants = []
  for (const { arquivo: file, desde: since, ate: until } of o.alvos) {
    const text = readFileSync(join(o.raiz, file), 'utf8')
    const code = classify(text)
    const lines = text.split('\n')
    let ini = 0
    let end = lines.length
    if (since) { ini = lines.findIndex((l) => l.includes(since)); if (ini < 0) throw new Error(`início não achado em ${file}: ${since}`) }
    if (until) { const f = lines.findIndex((l, i) => i > ini && l.includes(until)); if (f < 0) throw new Error(`fim não achado em ${file}: ${until}`); end = f + 1 }
    let offset = 0
    for (let i = 0; i < lines.length; i++) {
      if (i >= ini && i < end) {
        for (const [op, fresh] of lineMutants(lines[i], code.subarray(offset, offset + lines[i].length))) {
          mutants.push({ arquivo: file, linha: i, op, nova: fresh, original: lines[i] })
        }
      }
      offset += lines[i].length + 1
    }
  }
  for (const [name, file, from, to] of o.extras ?? []) {
    const lines = readFileSync(join(o.raiz, file), 'utf8').split('\n')
    const i = lines.findIndex((l) => l.includes(from))
    if (i < 0) throw new Error(`defeito manual "${name}": trecho não achado em ${file} (o código mudou?): ${from}`)
    mutants.push({ arquivo: file, linha: i, op: name, nova: lines[i].replace(from, () => to), original: lines[i] })
  }
  const slice = process.env.MUTACAO_FATIA ? process.env.MUTACAO_FATIA.split('/').map(Number) : null
  const mine = slice ? mutants.filter((_, k) => k % slice[1] === slice[0] - 1) : mutants
  console.log(`${mine.length} defeitos a plantar${slice ? ` (fatia ${slice[0]} de ${slice[1]}, de ${mutants.length})` : ''}`)

  const n = Math.max(1, Math.min(o.parallel ?? 6, mine.length))
  const copies = Array.from({ length: n }, () => copy())
  const originals = new Map()
  const res = { pegos: 0, equivalentes: 0, invalidos: 0, holes: [], done: 0 }
  let next = 0
  // Each mutant runs in its OWN PROCESS GROUP (detached): `node --test` opens one child per test file and a defect that
  // makes the code spin would leave that grandchild alive (orphaned, PPID 1) if only the direct child got the SIGKILL. The time limit and the end
  // of the mutant kill the whole group (kill(-pgid)), and the end of the run (finish, Ctrl+C, SIGTERM) kills the groups still standing.
  const timeoutMs = o.timeoutMs ?? 60_000
  const runFiles = (tmp, files) => new Promise((ok) => {
    const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', '--test', '--test-reporter=tap', ...files], { cwd: tmp, stdio: 'ignore', detached: true })
    const killGroup = () => { try { process.kill(-child.pid, 'SIGKILL') } catch { /* the group has already ended */ } }
    liveGroups.add(killGroup)
    const end = (code) => { clearTimeout(t); killGroup(); liveGroups.delete(killGroup); ok(code) }
    const t = setTimeout(() => { killGroup() }, timeoutMs)
    child.on('close', (code) => end(code ?? 1))
    child.on('error', () => end(1))
  })
  // `sequencial`: runs one test file at a time, in the given order, and stops at the first that fails. A defect that dies early costs little;
  // one that survives runs all the files, and it is the same verdict as running the whole suite at once.
  const runAsync = async (tmp) => {
    if (!o.sequential) return runFiles(tmp, o.testes)
    for (const file of o.testes) {
      const code = await runFiles(tmp, [file])
      if (code !== 0) return code
    }
    return 0
  }
  const compiles = (tmp, file) => spawnSync(process.execPath, ['--check', join(tmp, file)], { stdio: 'ignore' }).status === 0
  const worker = async (tmp) => {
    for (;;) {
      const k = next++
      if (k >= mine.length) return
      const { arquivo: file, linha: line, op, nova: fresh, original } = mine[k]
      const target = join(tmp, file)
      const orig = originals.get(file) ?? readFileSync(join(o.raiz, file), 'utf8')
      originals.set(file, orig)
      const ls = orig.split('\n')
      ls[line] = fresh
      writeFileSync(target, ls.join('\n'))
      let code = null
      let valid = true
      try {
        valid = compiles(tmp, file)
        if (valid) code = await runAsync(tmp)
      } finally { writeFileSync(target, orig) }
      res.done++
      if (!valid) { res.invalidos++; continue }
      const key = `${file}:${original.trim()}|${op}`
      if (code !== 0) { res.pegos++; continue }
      if (equivalents.has(key)) { res.equivalentes++; console.log(`EQUIV    ${file}:${line + 1} ${op}: ${equivalents.get(key)}`); continue }
      res.holes.push(key)
      console.log(`PASSOU   ${file}:${line + 1} ${op}\n         ${original.trim().slice(0, 170)}\n      -> ${fresh.trim().slice(0, 170)}`)
    }
  }
  try { await Promise.all(copies.map(worker)) } finally { for (const c of copies) rmSync(c, { recursive: true, force: true }) }
  const valid = res.done - res.invalidos
  console.log(`\n[${o.rotulo}] ${res.done} defeitos plantados, ${res.invalidos} descartados por não compilar, ${valid} válidos: ${res.pegos} pegos, ${res.equivalentes} equivalentes, ${res.holes.length} NÃO pegos`)
  return { rotulo: o.rotulo, plantados: res.done, invalidos: res.invalidos, validos: valid, pegos: res.pegos, equivalentes: res.equivalentes, holes: res.holes }
}
