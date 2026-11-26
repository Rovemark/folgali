// SPDX-License-Identifier: AGPL-3.0-or-later
// The package.json commands point to files that exist. `npm run mutation` pointed to a file that did not exist
// (mutation/rodar-tudo.mjs) and nobody noticed, because mutation testing was always run module by module.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../../', import.meta.url)
const bundle = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))

test('every package.json script that runs a .js or .mjs file points to a file that exists', () => {
  const names = Object.keys(bundle.scripts)
  assert.ok(names.includes('test') && names.includes('mutation') && names.includes('relay'))
  let checked = 0
  for (const [name, command] of Object.entries(bundle.scripts)) {
    for (const path of command.match(/(?<![\w./*-])[\w./-]+\.(?:mjs|js)\b/g) ?? []) {
      assert.ok(existsSync(fileURLToPath(new URL(path, root))), `o script "${name}" points to ${path}, which does not exist`)
      checked++
    }
  }
  assert.ok(checked >= 2)
})
