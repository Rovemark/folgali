// SPDX-License-Identifier: AGPL-3.0-or-later
// Os comandos do package.json apontam para arquivos que existem. `npm run mutacao` apontava para um arquivo que não existia
// (medidor/rodar-tudo.mjs) e ninguém notou, porque o medidor sempre foi rodado módulo a módulo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const raiz = new URL('../../', import.meta.url)
const pacote = JSON.parse(readFileSync(new URL('package.json', raiz), 'utf8'))

test('todo script do package.json que roda um arquivo .js ou .mjs aponta para um arquivo que existe', () => {
  const nomes = Object.keys(pacote.scripts)
  assert.ok(nomes.includes('test') && nomes.includes('mutacao') && nomes.includes('rele'))
  let conferidos = 0
  for (const [nome, comando] of Object.entries(pacote.scripts)) {
    for (const caminho of comando.match(/(?<![\w./*-])[\w./-]+\.(?:mjs|js)\b/g) ?? []) {
      assert.ok(existsSync(fileURLToPath(new URL(caminho, raiz))), `o script "${nome}" aponta para ${caminho}, que não existe`)
      conferidos++
    }
  }
  assert.ok(conferidos >= 2)
})
