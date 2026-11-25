// SPDX-License-Identifier: AGPL-3.0-or-later
// O site da Rovemark é rovemark.co (correção do Arquiteto de 24/11/2026). Nenhum texto nem código do repositório pode apontar para o
// domínio .com, que não é da Rovemark: um link errado num rodapé ou num skill manda gente e agente para o lugar errado. Só um
// rovemark.com.br escrito por extenso (se um dia existir) passa.
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const raiz = new URL('../../', import.meta.url).pathname
const ERRADO = /rovemark\.com(?!\.br)(?![a-z])/i
const ESTE = 'test/site/dominio-rovemark.test.js'

/** Os arquivos de texto que o git conhece (o que vai para o repositório público). */
function arquivos() {
  const saida = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: raiz, encoding: 'utf8', maxBuffer: 1 << 28 })
  return saida.split('\0').filter((f) => f && f !== ESTE && /\.(?:[cm]?[jt]sx?|json|md|txt|css|html|ya?ml|env|exemplo|sh)$/.test(f))
}

test('nenhum arquivo do repositório aponta para rovemark.com: o site da Rovemark é rovemark.co', () => {
  const achados = []
  for (const f of arquivos()) {
    let texto
    try { texto = readFileSync(join(raiz, f), 'utf8') } catch { continue }
    texto.split('\n').forEach((linha, i) => { if (ERRADO.test(linha)) achados.push(`${f}:${i + 1}`) })
  }
  assert.deepEqual(achados, [])
})

test('a trava morde: .com é acusado; .co, .com.br e outro domínio passam', () => {
  for (const ruim of ['https://rovemark.com', 'o contato está em rovemark.com.', 'ROVEMARK.COM/contato']) assert.ok(ERRADO.test(ruim), ruim)
  for (const bom of ['https://rovemark.co', 'rovemark.com.br', 'app.rovemark.co/contas', 'rovemark.co.', 'rovemark.company']) assert.ok(!ERRADO.test(bom), bom)
})
