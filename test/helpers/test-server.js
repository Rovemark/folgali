// SPDX-License-Identifier: AGPL-3.0-or-later
// Starts the relay on real HTTP, on a free port, with a test world behind it.
import { randomBytes } from 'node:crypto'
import { createRelayServer } from '../../packages/relay/src/http.js'
import { newWorld } from './test-relay.js'

export const TOKEN = `admin-${randomBytes(24).toString('hex')}`

export async function start({ mundo: world, ...options } = {}) {
  const m = newWorld(world)
  const logs = []
  const server = createRelayServer({ rele: m.rele, registrar: (e) => logs.push(e), tokenAdmin: TOKEN, ...options })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${server.address().port}`
  const call = async (method, path, { corpo: body, cabecalhos: headers = {}, bruto: rawValue } = {}) => {
    const init = { method: method, headers: { ...headers } }
    if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] ??= 'application/json' }
    if (rawValue !== undefined) init.body = rawValue
    const res = await fetch(base + path, init)
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* body is not JSON */ }
    return { status: res.status, json, texto: text, cab: res.headers }
  }
  return { m, logs, servidor: server, base, call, fechar: () => new Promise((ok) => { server.closeAllConnections(); server.close(ok) }) }
}
