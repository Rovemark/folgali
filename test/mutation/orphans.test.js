// SPDX-License-Identifier: AGPL-3.0-or-later
// Mutation testing leaves no orphan process. Each mutant runs in its own process group, and the end of the mutant (by time
// or by completion) kills the whole group: `node --test` opens a child per test file, and a defect that makes the code spin
// used to leave that grandchild alive, with PPID 1, when only the direct child got the SIGKILL. Here a toy test leaves a grandchild on purpose.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runMeter } from '../../mutation/mutator.mjs'

const alive = (brand) => spawnSync('ps', ['-axo', 'pid,command'], { encoding: 'utf8' }).stdout.split('\n').filter((l) => l.includes(brand) && !l.includes('grep'))

test('after running mutation testing, no test grandchild stays alive, not even one that spins forever (a mutant that becomes a loop)', async () => {
  const brand = `rn-orfao-${randomBytes(6).toString('hex')}`
  const root = mkdtempSync(join(tmpdir(), 'rn-med-'))
  try {
    mkdirSync(join(root, 'src'))
    mkdirSync(join(root, 't'))
    writeFileSync(join(root, 'package.json'), '{"type":"module"}')
    // the target: `n < 3` becomes `n < 4`, `n > 3`... and the `3->4` mutation makes the test loop spin forever
    writeFileSync(join(root, 'src', 'a.js'), 'export function soma(a, b) {\n  return a + b\n}\nexport const LIMITE = 3\n')
    // the test leaves a grandchild alive and, with the constant changed, enters an endless loop
    writeFileSync(join(root, 't', 'a.test.js'), [
      "import test from 'node:test'",
      "import assert from 'node:assert/strict'",
      "import { spawn } from 'node:child_process'",
      "import { soma, LIMITE } from '../src/a.js'",
      `test('soma e limite', () => {`,
      `  const neto = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', '${brand}'], { stdio: 'ignore' })`,
      '  neto.unref()',
      '  if (LIMITE !== 3) { for (;;) { /* gira para sempre */ } }',
      '  assert.equal(soma(1, 2), 3)',
      '})'
    ].join('\n'))
    // inside a `node --test`, a child `node --test` does not speak TAP (the parent runner expects it in another format): mutation testing needs TAP
    const context = process.env.NODE_TEST_CONTEXT
    delete process.env.NODE_TEST_CONTEXT
    const t0 = Date.now()
    await runMeter({
      rotulo: 'orfaos', raiz: root, copiar: ['package.json', 'src', 't'], alvos: [{ arquivo: 'src/a.js' }], testes: ['t/a.test.js'],
      equivalentes: new Map(), parallel: 1, timeoutMs: 6000
    }).catch(() => {}).finally(() => { if (context !== undefined) process.env.NODE_TEST_CONTEXT = context })
    assert.ok(Date.now() - t0 < 120_000)
    // gives the system a moment to reap the dead processes
    await new Promise((ok) => setTimeout(ok, 500))
    assert.deepEqual(alive(brand), [], 'no test grandchild stayed alive')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
