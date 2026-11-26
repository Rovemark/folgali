// SPDX-License-Identifier: AGPL-3.0-or-later
// The Rovemark site is rovemark.co (correction by Rovemark on 2026-11-24). No text or code in the repository may point to the
// .com domain, which does not belong to Rovemark: a wrong link in a footer or a skill sends people and agents to the wrong place. Only a
// rovemark.com.br written in full (if it ever exists) passes.
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = new URL('../../', import.meta.url).pathname
const WRONG = /rovemark\.com(?!\.br)(?![a-z])/i
const THIS = 'test/site/rovemark-domain.test.js'

const TEXT = /\.(?:[cm]?[jt]sx?|json|md|txt|css|html|ya?ml|env|exemplo|example|sh)$/
/** Every file on disk, for a tree without git (an exported copy): generated and installed folders stay out. */
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return ['node_modules', '.next', '.git'].includes(e.name) ? [] : walk(join(dir, e.name))
    return [relative(root, join(dir, e.name))]
  })
}
/** The text files git knows about (what goes to the public repository), or every file when the tree is an export without git. */
function files() {
  const all = existsSync(join(root, '.git'))
    ? execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0')
    : walk(root)
  return all.filter((f) => f && f !== THIS && TEXT.test(f))
}

test('no file in the repository points to rovemark.com: the Rovemark site is rovemark.co', () => {
  const findings = []
  for (const f of files()) {
    let text
    try { text = readFileSync(join(root, f), 'utf8') } catch { continue }
    text.split('\n').forEach((line, i) => { if (WRONG.test(line)) findings.push(`${f}:${i + 1}`) })
  }
  assert.deepEqual(findings, [])
})

test('the guard bites: .com is flagged; .co, .com.br and another domain pass', () => {
  for (const bad of ['https://rovemark.com', 'o contato está em rovemark.com.', 'ROVEMARK.COM/contato']) assert.ok(WRONG.test(bad), bad)
  for (const good of ['https://rovemark.co', 'rovemark.com.br', 'app.rovemark.co/contas', 'rovemark.co.', 'rovemark.company']) assert.ok(!WRONG.test(good), good)
})
