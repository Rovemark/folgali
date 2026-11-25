// SPDX-License-Identifier: AGPL-3.0-or-later
// Roda o medidor de mutação de um módulo ou de todos: `node medidor/rodar.mjs [rotulo ...]`.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rodarMedidor } from './mutador.mjs'
import { MODULOS } from './modulos.mjs'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const pedidos = process.argv.slice(2)
const alvos = pedidos.length ? MODULOS.filter((m) => pedidos.includes(m.rotulo)) : MODULOS
if (pedidos.length && alvos.length !== pedidos.length) {
  console.error(`rótulo desconhecido. Disponíveis: ${MODULOS.map((m) => m.rotulo).join(', ')}`)
  process.exit(2)
}

const totais = { plantados: 0, invalidos: 0, validos: 0, pegos: 0, equivalentes: 0, furos: 0 }
const base = ['package.json', 'packages', 'test']
for (const m of alvos) {
  console.log(`\n=== ${m.rotulo} ===`)
  const r = await rodarMedidor({ raiz, copiar: base, paralelo: 8, ...m })
  for (const k of ['plantados', 'invalidos', 'validos', 'pegos', 'equivalentes']) totais[k] += r[k]
  totais.furos += r.furos.length
}
console.log(`\nTOTAL: ${totais.plantados} defeitos plantados, ${totais.invalidos} descartados (não compilam), ${totais.validos} válidos: ${totais.pegos} pegos, ${totais.equivalentes} equivalentes documentados, ${totais.furos} NÃO pegos`)
process.exit(totais.furos ? 1 : 0)
