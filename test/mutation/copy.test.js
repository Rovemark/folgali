// SPDX-License-Identifier: AGPL-3.0-or-later
// The temporary copy used by mutation testing leaves out node_modules and .next: with the site node_modules really copied, each copy
// went over 500 MB, times 8 copies per module, and filled the machine disk on 2026-11-17.
import test from 'node:test'
import assert from 'node:assert/strict'
import { OUTSIDE_THE_COPY } from '../../mutation/mutator.mjs'

test('the copy filter: node_modules and .next are left out, at any level; code and similar names go in', () => {
  for (const outside of ['/r/packages/site/node_modules', '/r/packages/site/node_modules/next/x.js', '/r/packages/site/.next', '/r/packages/site/.next/dev/a.js', 'C:\\r\\packages\\site\\node_modules']) {
    assert.equal(OUTSIDE_THE_COPY.test(outside), true, outside)
  }
  for (const inside of ['/r/packages/relay/src/backup.js', '/r/packages/site/src/next.config.ts', '/r/test/node_modules_falso.test.js', '/r/packages/x/node_modulesx/a.js', '/r/package.json']) {
    assert.equal(OUTSIDE_THE_COPY.test(inside), false, inside)
  }
})
