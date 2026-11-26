#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// A DEMO relay to develop and photograph the site, WITHOUT a server, with no stored secret and without waiting a week: it starts the reference relay
// on a local port, with an in-memory database, and seeds the whole catalog by walking the RELAY CLOCK through the calendar that the
// real relay imposes (day 0, 1 day, 10 minutes later, 3 days, 7 days). When it ends, the clock goes back to the real one and the relay
// stays up. The issuer is generated on the spot and disappears when the process ends. Use it for nothing beyond local testing.
//   node --disable-warning=ExperimentalWarning packages/relay/scripts/relay-local-demo.mjs [--porta 4747] [--log]   (--log shows every request the relay records)
//   (another terminal, in packages/site)  FOLGALI_CLIENT=http FOLGALI_RELAY_URL=http://127.0.0.1:4747 npm run preview
import { randomBytes } from 'node:crypto'
import { Store } from '../src/store.js'
import { createRelayServer } from '../src/http.js'
import { StaticProvider } from '../src/provider.js'
import { Relay } from '../src/relay.js'
import { issuerOf } from './demo/demo-keys.mjs'
import { newLedger, seedNetwork } from './demo/seeder.mjs'

const args = process.argv.slice(2)
const value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const port = Number(value('--porta') ?? 4747)
if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error('--porta precisa ser um número de porta'); process.exit(2) }

const DAY = 86400
const STEPS = [0, DAY + 60, 660, 3 * DAY, 7 * DAY] // the age the relay asks for, one step per round
const total = STEPS.reduce((a, b) => a + b, 0)
const realNow = () => Math.floor(Date.now() / 1000)
let delay = total + 600 // the relay clock starts far back and is pulled forward until it catches up with the real one
const clock = () => realNow() - delay

const seed = randomBytes(32)
const issuer = issuerOf(seed)
const relay = new Relay({
  store: new Store(':memory:'),
  provedor: new StaticProvider({ emissores: [issuer.publicKey], nome: 'demonstracao-local' }),
  relogio: clock, reportSecret: randomBytes(32), semFatorDeIdade: true
})
const register = args.includes('--log') ? (e) => console.error(JSON.stringify(e)) : () => {}
const server = createRelayServer({ rele: relay, registrar: register, rajada: { capacity: 100_000, perSecond: 100_000 } })
await new Promise((ok) => server.listen(port, '127.0.0.1', ok))
const url = `http://127.0.0.1:${port}`
console.error(`relé local em ${url}, semeando pelo calendário do relé real...`)

const ledger = newLedger()
for (const step of STEPS) {
  delay -= step
  const r = await seedNetwork({ url, semente: seed, intervalMs: 0, relogio: clock, ledger })
  console.error(JSON.stringify({ etapa: `+${(step / 3600).toFixed(1)}h`, criados: Object.values(r.criados).reduce((a, b) => a + b, 0), adiados: r.adiados.length }))
}
delay = 0 // from here on the clock is the real one
console.error(`pronto: ${url}  (Ctrl+C encerra e apaga tudo)`)
process.on('SIGINT', () => server.close(() => process.exit(0)))
process.on('SIGTERM', () => server.close(() => process.exit(0)))
