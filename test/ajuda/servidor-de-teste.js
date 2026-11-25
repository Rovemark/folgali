// SPDX-License-Identifier: AGPL-3.0-or-later
// Sobe o relé em HTTP de verdade, numa porta livre, com um mundo de teste por trás.
import { randomBytes } from 'node:crypto'
import { criarServidor } from '../../packages/rele/src/http.js'
import { novoMundo } from './rele-de-teste.js'

export const TOKEN = `admin-${randomBytes(24).toString('hex')}`

export async function subir({ mundo, ...opcoes } = {}) {
  const m = novoMundo(mundo)
  const logs = []
  const servidor = criarServidor({ rele: m.rele, registrar: (e) => logs.push(e), tokenAdmin: TOKEN, ...opcoes })
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${servidor.address().port}`
  const chamar = async (metodo, caminho, { corpo, cabecalhos = {}, bruto } = {}) => {
    const init = { method: metodo, headers: { ...cabecalhos } }
    if (corpo !== undefined) { init.body = JSON.stringify(corpo); init.headers['content-type'] ??= 'application/json' }
    if (bruto !== undefined) init.body = bruto
    const res = await fetch(base + caminho, init)
    const texto = await res.text()
    let json = null
    try { json = JSON.parse(texto) } catch { /* corpo não JSON */ }
    return { status: res.status, json, texto, cab: res.headers }
  }
  return { m, logs, servidor, base, chamar, fechar: () => new Promise((ok) => { servidor.closeAllConnections(); servidor.close(ok) }) }
}
