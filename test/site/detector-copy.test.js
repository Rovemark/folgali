// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.7.0 (request to the site): the site runs the leak detector WHILE the person types. It only
// bundles its own package and so keeps a copy; this test stops the copy from falling behind the protocol.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('the detector copy in the site is identical to the protocol detector, byte for byte', () => {
  const original = readFileSync(new URL('../../packages/protocol/src/leak.js', import.meta.url), 'utf8')
  const copy = readFileSync(new URL('../../packages/site/src/lib/leak-detector.js', import.meta.url), 'utf8')
  assert.equal(copy, original, 'run: cp packages/protocol/src/leak.js packages/site/src/lib/leak-detector.js')
})

test('the site detector imports nothing (the site only bundles its own package)', () => {
  const copy = readFileSync(new URL('../../packages/site/src/lib/leak-detector.js', import.meta.url), 'utf8')
  assert.equal(/^\s*import\s/m.test(copy), false)
})
