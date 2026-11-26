#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Entry point of the open issuer SERVICE for outside agents (a container behind a proxy). Fails closed: without the full configuration
// (see src/configuration.js), it does not start. No secret goes to the command line or to the log.
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { OpenIssuer } from '../src/issuer.js'
import { createIssuerServer, issuerOriginFrom } from '../src/http.js'
import { readConfig } from '../src/configuration.js'
import { relayHttp } from '../src/relay.js'
import { withLegacyEnv } from '../../protocol/src/env.js'

const register = (e) => console.error(JSON.stringify({ t: new Date().toISOString(), ...e }))
let config
try { config = readConfig(withLegacyEnv(process.env, (m) => console.error(JSON.stringify({ t: new Date().toISOString(), nivel: 'aviso', evento: 'variavel_antiga', mensagem: m })))) } catch (e) { console.error(e.message); process.exit(2) }

const dbPath = resolve(config.banco)
mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 })
const issuer = new OpenIssuer({ ...config, banco: dbPath, rele: relayHttp(config.rele) })
const server = createIssuerServer(issuer, { registrar: register, origemDe: issuerOriginFrom(config) })

// What stayed in the queue (the relay did not answer) is tried again from time to time.
const deliveries = setInterval(() => {
  issuer.deliverPending().then((r) => { if (r.delivered || r.pendentes) register({ nivel: 'info', evento: 'entregas', ...r }) }, () => {})
}, config.deliveryIntervalS * 1000)
deliveries.unref()

server.listen(config.porta, config.endereco, () => {
  register({ nivel: 'info', evento: 'ouvindo', endereco: config.endereco, porta: config.porta, emissor: issuer.publicKey, donos: config.ownerIssuers.length, proxy: config.trustProxy, cloudflare: config.cloudflare !== null })
})

let stopping = false
const stop = () => {
  if (stopping) return
  stopping = true
  clearInterval(deliveries)
  server.close(() => { try { issuer.fechar() } catch { /* already closed */ } process.exit(0) })
  server.closeIdleConnections()
  setTimeout(() => { server.closeAllConnections(); try { issuer.fechar() } catch { /* already closed */ } process.exit(0) }, 8000).unref()
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
