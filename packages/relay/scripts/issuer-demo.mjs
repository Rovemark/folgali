#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Demo issuer helper, for the operator. It does NOT print the seed to a terminal:
//   node issuer-demo.mjs gerar | <command that stores it in your secrets vault>
//   node issuer-demo.mjs publica < semente.txt        (the seed comes through standard input; it prints only the PUBLIC key)
import { issuerOf, readSeed, newSeed } from './demo/demo-keys.mjs'

const [cmd] = process.argv.slice(2)
if (cmd === 'gerar') {
  if (process.stdout.isTTY) { console.error('recusado: a semente não pode ir para o terminal. Passe a saída por um pipe (para o seu cofre de segredos).'); process.exit(2) }
  process.stdout.write(newSeed())
} else if (cmd === 'publica') {
  let input = ''
  process.stdin.setEncoding('utf8')
  for await (const p of process.stdin) input += p
  try { process.stdout.write(`${issuerOf(readSeed(input)).publicKey}\n`) } catch (e) { console.error(e.message); process.exit(2) }
} else {
  console.error('uso: issuer-demo.mjs gerar | publica')
  process.exit(2)
}
