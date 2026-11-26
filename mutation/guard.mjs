// SPDX-License-Identifier: AGPL-3.0-or-later
// Guards for the mutation tool. A meter that cannot prove it is alive is worthless: if the test does not even load the file in the copy
// (wrong path, swapped import), EVERY planted defect "dies" and a 100% score proves nothing.
//
// Two guards, run BEFORE the first defect, on the same copy that will be used:
//   1. baseline: the test WITHOUT a defect must pass and must have run at least one test;
//   2. lethal defect: a `throw` at the top of the target file MUST make the test fail. If it passes, the test does not
//      exercise that file in the copy and the mutation run is blind.
// A failing guard exits with code 2 and says why. The decision comes AFTER the copies are cleaned up (process.exit does not run `finally`).
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const LETHAL = "throw new Error('mutacao-letal: defeito sabidamente letal plantado pela guarda do mutation')\n"

export const testsThatRan = (output) => {
  const m = /^# pass (\d+)/m.exec(output ?? '')
  return m ? Number(m[1]) : 0
}

/** Plants the lethal defect at the top of the file. Returns the original content. */
export function plantLethal(file) {
  const original = readFileSync(file, 'utf8')
  writeFileSync(file, LETHAL + original)
  return original
}

function abortar(label, reason, r) {
  console.log(`\nMEDIDOR SEM VALOR (${label}): ${reason}`)
  const s = `${r?.stdout ?? ''}\n${r?.stderr ?? ''}`
    .split('\n')
    .filter((l) => /^# (tests|pass|fail)|^not ok|Error|ERR_|Cannot find/.test(l))
    .slice(0, 12)
    .join('\n')
  if (s) console.log(s)
  process.exit(2)
}

/**
 * @param {{ rotulo: string, copiar: () => string, rodar: (pasta: string) => { status: number|null, stdout?: string, stderr?: string }, lethalTarget: string }} o
 */
export function requireLiveMeter({ rotulo: label, copiar: copy, rodar: run, lethalTarget }) {
  let dir = copy()
  let r
  try { r = run(dir) } finally { rmSync(dir, { recursive: true, force: true }) }
  if (r.status !== 0) abortar(label, 'o teste SEM defeito não passa na cópia; nenhum "pego" valeria.', r)
  const n = testsThatRan(r.stdout)
  if (n === 0) abortar(label, 'o teste SEM defeito passou mas não rodou nenhum teste.', r)
  console.log(`base      o teste sem defeito passa na cópia (${n} testes)`)
  dir = copy()
  try {
    plantLethal(join(dir, lethalTarget))
    r = run(dir)
  } finally { rmSync(dir, { recursive: true, force: true }) }
  if (r.status === 0) abortar(label, `um defeito sabidamente letal em ${lethalTarget} passou: o teste não carrega esse arquivo na cópia, o mutation está cego.`, r)
  console.log(`letal     o defeito letal em ${lethalTarget} é pego`)
  return n
}
