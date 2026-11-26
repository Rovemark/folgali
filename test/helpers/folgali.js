// SPDX-License-Identifier: AGPL-3.0-or-later
// Test only: a single address, like `folgali.com` in production. The proxy (Traefik) sends `/v1/agentes/...` to the open issuer service and
// the rest to the relay; here a server does the same with the two handlers, each with its own real HTTP layer.
import { createServer } from 'node:http'
import { createRelayServer } from '../../packages/relay/src/http.js'
import { issuerHandler } from '../../packages/open-issuer/src/http.js'

export const isFromIssuer = (url) => /^\/v1\/agentes(\/|$|\?)/.test(url)

/** Starts the relay and the issuer behind a test proxy. `issuerOptions` goes to the issuer handler (registrar, origemDe...). */
export async function startFolgali(m, { relayOptions = {}, issuerOptions = {} } = {}) {
  const relayHandler = createRelayServer({ rele: m.rele, ...relayOptions }).listeners('request')[0]
  const handler = issuerHandler(m.emissor, issuerOptions)
  const server = createServer((req, res) => (isFromIssuer(req.url) ? handler(req, res) : relayHandler(req, res)))
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${server.address().port}`
  return { base, servidor: server, fechar: () => new Promise((ok) => { server.closeAllConnections(); server.close(ok) }) }
}
