#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Seeds the DEMO relay with eighteen invented plush rovers and their social network and forum, through the HTTP API, as a
// real client would.
//   node --disable-warning=ExperimentalWarning packages/relay/scripts/seed-demo.mjs --relay https://folgali.com \
//        --semente-arquivo /path/to/seed [--estado FILE] [--simular] [--geracao 1] [--intervalo-ms 130] [--aceitar-sem-estado]
// The demo issuer seed comes from a FILE (a 0600 temporary file that the operator writes from the vault and deletes afterwards).
//
// THE RELAY SETS THE TIME: community and page only with a 1-day account, testimonial with a 3-day friendship, badge with 7, reply and vote
// after the waiting period in the community. The seeder publishes what it already can and DEFERS the rest; at the end it says when to run again. Run
// again on the dates it indicates (see the calendar in docs/RELAY-OPERATIONS.md). Each round only does what is missing.
//
// THE STATE (the ledger of what has already been published) lives in a file on the operator's computer, OUTSIDE the repository. Without it, a new
// round does not know what it already did and may repeat content: do not delete it. Default: ~/.rover-network/semeadura-<host>-g<geracao>.json (0600).
// It never prints the seed or a private key.
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { readSeed } from './demo/demo-keys.mjs'
import { newLedger, seedNetwork } from './demo/seeder.mjs'

const args = process.argv.slice(2)
const value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const relay = value('--relay')
const file = value('--semente-arquivo')
if (!relay || !file) {
  console.error('uso: seed-demo.mjs --relay <url> --semente-arquivo <arquivo> [--estado ARQUIVO] [--simular] [--geracao N] [--intervalo-ms N] [--aceitar-sem-estado]')
  process.exit(2)
}
let url
try { url = new URL(relay) } catch { console.error('--relay não é um endereço válido'); process.exit(2) }
const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
if (url.protocol !== 'https:' && !local) { console.error('--relay precisa ser https (http só em 127.0.0.1)'); process.exit(2) }

let seed
try { seed = readSeed(readFileSync(file, 'utf8')) } catch (e) { console.error(e.message); process.exit(2) }

const generation = Number(value('--geracao') ?? 1)
const statePath = value('--estado') ?? join(homedir(), '.rover-network', `semeadura-${url.host.replace(/[^\w.-]/g, '_')}-g${generation}.json`)

function readState() {
  if (!existsSync(statePath)) return newLedger()
  let l
  try { l = JSON.parse(readFileSync(statePath, 'utf8')) } catch { l = null }
  const object = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
  if (!object(l) || l.versao !== 1 || !object(l.itens) || !object(l.rovers)) {
    console.error(`o arquivo de estado ${statePath} não é um registro de semeadura válido; não vou sobrescrever. Conserte ou mova o arquivo.`)
    process.exit(2)
  }
  return l
}
const ledger = readState()
const simulate = args.includes('--simular')

/** Writes through a temporary file and a rename: a crash in the middle never leaves the log half written. */
function write(l) {
  if (simulate) return
  mkdirSync(dirname(statePath), { recursive: true, mode: 0o700 })
  const tmp = `${statePath}.novo`
  writeFileSync(tmp, JSON.stringify(l), { mode: 0o600 })
  renameSync(tmp, statePath)
  try { chmodSync(statePath, 0o600) } catch { /* system without chmod */ }
}

const when = (s) => (s ? new Date(s * 1000).toISOString() : null)
try {
  const r = await seedNetwork({
    url: url.origin, semente: seed, simulate, geracao: generation, acceptWithoutLedger: args.includes('--aceitar-sem-estado'), intervalMs: Number(value('--intervalo-ms') ?? 130), ledger, onProgress: write,
    registrar: (e) => console.error(JSON.stringify(e))
  })
  const deferred = {}
  for (const a of r.adiados) deferred[a.phase] = (deferred[a.phase] ?? 0) + 1
  console.log(JSON.stringify({
    relay: url.origin, simulado: r.simulado, criados: r.criados, existentes: r.existentes, pulados: r.pulados, rovers: r.rovers.length,
    adiados: deferred, totalAdiado: r.adiados.length, proximaRodada: when(r.proximaRodada), estado: simulate ? null : statePath
  }))
  if (r.adiados.length) {
    console.error(`${r.adiados.length} item(ns) esperam o tempo que o relé exige. ${r.proximaRodada ? `Rode de novo a partir de ${when(r.proximaRodada)}.` : 'Rode de novo em alguns dias (amizades novas ainda não dão depoimento nem selo).'}`)
  }
} catch (e) {
  console.error(`semeadura interrompida: ${e.message}`)
  process.exit(1)
}
