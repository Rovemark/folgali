// SPDX-License-Identifier: AGPL-3.0-or-later
// O medidor de mutação não deixa processo órfão. Cada mutante roda em grupo de processos próprio, e o fim do mutante (por tempo
// ou por término) mata o grupo inteiro: o `node --test` abre um filho por arquivo de teste, e um defeito que faz o código girar
// deixava esse neto vivo, de PPID 1, quando só o filho direto levava o SIGKILL. Aqui um teste de brinquedo deixa um neto de propósito.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rodarMedidor } from '../../medidor/mutador.mjs'

const vivos = (marca) => spawnSync('ps', ['-axo', 'pid,command'], { encoding: 'utf8' }).stdout.split('\n').filter((l) => l.includes(marca) && !l.includes('grep'))

test('depois de rodar o medidor, nenhum neto de teste fica vivo, nem o que gira para sempre (mutante que vira laço)', async () => {
  const marca = `rn-orfao-${randomBytes(6).toString('hex')}`
  const raiz = mkdtempSync(join(tmpdir(), 'rn-med-'))
  try {
    mkdirSync(join(raiz, 'src'))
    mkdirSync(join(raiz, 't'))
    writeFileSync(join(raiz, 'package.json'), '{"type":"module"}')
    // o alvo: `n < 3` vira `n < 4`, `n > 3`... e a mutação `3->4` faz o laço do teste girar para sempre
    writeFileSync(join(raiz, 'src', 'a.js'), 'export function soma(a, b) {\n  return a + b\n}\nexport const LIMITE = 3\n')
    // o teste deixa um neto vivo e, com a constante mudada, entra em laço sem fim
    writeFileSync(join(raiz, 't', 'a.test.js'), [
      "import test from 'node:test'",
      "import assert from 'node:assert/strict'",
      "import { spawn } from 'node:child_process'",
      "import { soma, LIMITE } from '../src/a.js'",
      `test('soma e limite', () => {`,
      `  const neto = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', '${marca}'], { stdio: 'ignore' })`,
      '  neto.unref()',
      '  if (LIMITE !== 3) { for (;;) { /* gira para sempre */ } }',
      '  assert.equal(soma(1, 2), 3)',
      '})'
    ].join('\n'))
    // dentro de um `node --test`, um `node --test` filho não fala TAP (o runner pai o espera em outro formato): o medidor precisa do TAP
    const contexto = process.env.NODE_TEST_CONTEXT
    delete process.env.NODE_TEST_CONTEXT
    const t0 = Date.now()
    await rodarMedidor({
      rotulo: 'orfaos', raiz, copiar: ['package.json', 'src', 't'], alvos: [{ arquivo: 'src/a.js' }], testes: ['t/a.test.js'],
      equivalentes: new Map(), paralelo: 1, tempoLimiteMs: 6000
    }).catch(() => {}).finally(() => { if (contexto !== undefined) process.env.NODE_TEST_CONTEXT = contexto })
    assert.ok(Date.now() - t0 < 120_000)
    // dá um instante para o sistema recolher os processos mortos
    await new Promise((ok) => setTimeout(ok, 500))
    assert.deepEqual(vivos(marca), [], 'nenhum neto de teste ficou vivo')
  } finally {
    rmSync(raiz, { recursive: true, force: true })
  }
})
