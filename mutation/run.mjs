// SPDX-License-Identifier: AGPL-3.0-or-later
// Runs the mutation tool for one module or for all of them: `node mutation/run.mjs [label ...]`.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMeter } from './mutator.mjs'
import { MODULES } from './modules.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const requests = process.argv.slice(2)
const targets = requests.length ? MODULES.filter((m) => requests.includes(m.rotulo)) : MODULES
if (requests.length && targets.length !== requests.length) {
  console.error(`rótulo desconhecido. Disponíveis: ${MODULES.map((m) => m.rotulo).join(', ')}`)
  process.exit(2)
}

const totals = { plantados: 0, invalidos: 0, validos: 0, pegos: 0, equivalentes: 0, holes: 0 }
const base = ['package.json', 'packages', 'test']
for (const m of targets) {
  console.log(`\n=== ${m.rotulo} ===`)
  const r = await runMeter({ raiz: root, copiar: base, parallel: 8, ...m })
  for (const k of ['plantados', 'invalidos', 'validos', 'pegos', 'equivalentes']) totals[k] += r[k]
  totals.holes += r.holes.length
}
console.log(`\nTOTAL: ${totals.plantados} defeitos plantados, ${totals.invalidos} descartados (não compilam), ${totals.validos} válidos: ${totals.pegos} pegos, ${totals.equivalentes} equivalentes documentados, ${totals.holes} NÃO pegos`)
process.exit(totals.holes ? 1 : 0)
