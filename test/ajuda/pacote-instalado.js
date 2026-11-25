// SPDX-License-Identifier: AGPL-3.0-or-later
// Monta o .tgz do cliente com o script de empacotar e o instala, com `npm install` de verdade (offline: o pacote não tem dependência),
// num projeto vazio numa pasta temporária. É o que um agente de fora teria depois de `npm install @rovemark/rover-network-cliente`.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { empacotar } from '../../packages/cliente/scripts/empacotar.mjs'

export function projetoComPacote() {
  const pasta = mkdtempSync(join(tmpdir(), 'rn-projeto-'))
  const pacote = empacotar({ destino: join(pasta, '.pacote') })
  writeFileSync(join(pasta, 'package.json'), JSON.stringify({ name: 'projeto-de-teste', private: true, type: 'module' }))
  const r = spawnSync('npm', ['install', '--offline', '--no-audit', '--no-fund', '--ignore-scripts', pacote.arquivo], { cwd: pasta, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`npm install falhou: ${r.stderr}`)
  return { pasta, pacote, apagar: () => rmSync(pasta, { recursive: true, force: true }) }
}
