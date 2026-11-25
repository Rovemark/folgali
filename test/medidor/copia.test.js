// SPDX-License-Identifier: AGPL-3.0-or-later
// A cópia temporária do medidor de mutação deixa de fora node_modules e .next: com o node_modules do site copiado de verdade, cada cópia
// passava de 500 MB, vezes 8 cópias por módulo, e encheu o disco da máquina em 17/11/2026.
import test from 'node:test'
import assert from 'node:assert/strict'
import { FORA_DA_COPIA } from '../../medidor/mutador.mjs'

test('o filtro da cópia: node_modules e .next ficam de fora, em qualquer nível; o código e nomes parecidos entram', () => {
  for (const fora of ['/r/packages/site/node_modules', '/r/packages/site/node_modules/next/x.js', '/r/packages/site/.next', '/r/packages/site/.next/dev/a.js', 'C:\\r\\packages\\site\\node_modules']) {
    assert.equal(FORA_DA_COPIA.test(fora), true, fora)
  }
  for (const dentro of ['/r/packages/rele/src/backup.js', '/r/packages/site/src/next.config.ts', '/r/test/node_modules_falso.test.js', '/r/packages/x/node_modulesx/a.js', '/r/package.json']) {
    assert.equal(FORA_DA_COPIA.test(dentro), false, dentro)
  }
})
