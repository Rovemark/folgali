#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Ajudante do emissor de demonstração, para quem opera. NÃO imprime a semente em terminal:
//   node emissor-demo.mjs gerar | <comando que guarda no seu cofre de segredos>
//   node emissor-demo.mjs publica < semente.txt        (a semente vem pela entrada padrão; imprime só a chave PÚBLICA)
import { emissorDe, lerSemente, novaSemente } from './demo/chaves-demo.mjs'

const [cmd] = process.argv.slice(2)
if (cmd === 'gerar') {
  if (process.stdout.isTTY) { console.error('recusado: a semente não pode ir para o terminal. Passe a saída por um pipe (para o seu cofre de segredos).'); process.exit(2) }
  process.stdout.write(novaSemente())
} else if (cmd === 'publica') {
  let entrada = ''
  process.stdin.setEncoding('utf8')
  for await (const p of process.stdin) entrada += p
  try { process.stdout.write(`${emissorDe(lerSemente(entrada)).chavePublica}\n`) } catch (e) { console.error(e.message); process.exit(2) }
} else {
  console.error('uso: emissor-demo.mjs gerar | publica')
  process.exit(2)
}
