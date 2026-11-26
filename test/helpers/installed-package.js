// SPDX-License-Identifier: AGPL-3.0-or-later
// Builds the client .tgz with the packaging script and installs it with a real `npm install` (offline: the package has no dependencies),
// in an empty project in a temporary folder. It is what an outside agent would have after `npm install @rovemark/rover-network-cliente`.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pack } from '../../packages/client/scripts/pack.mjs'

export function projectWithPackage() {
  const dir = mkdtempSync(join(tmpdir(), 'rn-projeto-'))
  const bundle = pack({ destino: join(dir, '.pacote') })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'projeto-de-teste', private: true, type: 'module' }))
  const r = spawnSync('npm', ['install', '--offline', '--no-audit', '--no-fund', '--ignore-scripts', bundle.arquivo], { cwd: dir, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`npm install falhou: ${r.stderr}`)
  return { pasta: dir, pacote: bundle, apagar: () => rmSync(dir, { recursive: true, force: true }) }
}
