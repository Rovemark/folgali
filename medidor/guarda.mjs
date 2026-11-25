// SPDX-License-Identifier: AGPL-3.0-or-later
// Guardas do medidor de mutação. Medidor que não se prova vivo não vale: se o teste nem carrega o arquivo na cópia
// (caminho errado, import trocado), TODO defeito plantado "morre" e o placar de 100% não prova nada.
//
// Duas guardas, rodadas ANTES do primeiro defeito, na mesma cópia que será usada:
//   1. linha de base: o teste SEM defeito tem de passar e de ter rodado pelo menos um teste;
//   2. defeito letal: um `throw` no topo do arquivo-alvo TEM de derrubar o teste. Se passar, o teste não
//      exercita aquele arquivo na cópia e o medidor está cego.
// Quem reprova sai com código 2 e diz por quê. A decisão sai DEPOIS da limpeza das cópias (process.exit não roda `finally`).
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const LETAL = "throw new Error('mutacao-letal: defeito sabidamente letal plantado pela guarda do medidor')\n"

export const testesQueRodaram = (saida) => {
  const m = /^# pass (\d+)/m.exec(saida ?? '')
  return m ? Number(m[1]) : 0
}

/** Planta o defeito letal no topo do arquivo. Devolve o conteúdo original. */
export function plantarLetal(arquivo) {
  const original = readFileSync(arquivo, 'utf8')
  writeFileSync(arquivo, LETAL + original)
  return original
}

function abortar(rotulo, motivo, r) {
  console.log(`\nMEDIDOR SEM VALOR (${rotulo}): ${motivo}`)
  const s = `${r?.stdout ?? ''}\n${r?.stderr ?? ''}`
    .split('\n')
    .filter((l) => /^# (tests|pass|fail)|^not ok|Error|ERR_|Cannot find/.test(l))
    .slice(0, 12)
    .join('\n')
  if (s) console.log(s)
  process.exit(2)
}

/**
 * @param {{ rotulo: string, copiar: () => string, rodar: (pasta: string) => { status: number|null, stdout?: string, stderr?: string }, alvoLetal: string }} o
 */
export function exigirMedidorVivo({ rotulo, copiar, rodar, alvoLetal }) {
  let pasta = copiar()
  let r
  try { r = rodar(pasta) } finally { rmSync(pasta, { recursive: true, force: true }) }
  if (r.status !== 0) abortar(rotulo, 'o teste SEM defeito não passa na cópia; nenhum "pego" valeria.', r)
  const n = testesQueRodaram(r.stdout)
  if (n === 0) abortar(rotulo, 'o teste SEM defeito passou mas não rodou nenhum teste.', r)
  console.log(`base      o teste sem defeito passa na cópia (${n} testes)`)
  pasta = copiar()
  try {
    plantarLetal(join(pasta, alvoLetal))
    r = rodar(pasta)
  } finally { rmSync(pasta, { recursive: true, force: true }) }
  if (r.status === 0) abortar(rotulo, `um defeito sabidamente letal em ${alvoLetal} passou: o teste não carrega esse arquivo na cópia, o medidor está cego.`, r)
  console.log(`letal     o defeito letal em ${alvoLetal} é pego`)
  return n
}
