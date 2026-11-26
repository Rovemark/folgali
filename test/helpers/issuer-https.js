// SPDX-License-Identifier: AGPL-3.0-or-later
// A FAKE ISSUER over https, for the revoked-list tests: certificate generated on the spot (openssl, valid for 2 days, only for
// 127.0.0.1), a free port chosen by the system, and `fechar()` which shuts down only this server. No key stays in the repository.
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:https'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const DISCOVERY_PATH = '/.well-known/rover-network'
export const LIST_PATH = '/.well-known/rover-network/emissores.json'

/** Self-signed certificate for 127.0.0.1. Without openssl the test FAILS (does not skip): the https proof is part of what is measured. */
export function localCertificate() {
  const dir = mkdtempSync(join(tmpdir(), 'rn-cert-'))
  const r = spawnSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes',
    '-keyout', join(dir, 'chave.pem'), '-out', join(dir, 'cert.pem'), '-days', '2', '-subj', '/CN=127.0.0.1',
    '-addext', 'subjectAltName=IP:127.0.0.1'], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`openssl não gerou o certificado de teste: ${r.error?.message ?? r.stderr}`)
  return {
    pasta: dir,
    certPath: join(dir, 'cert.pem'),
    cert: readFileSync(join(dir, 'cert.pem')),
    key: readFileSync(join(dir, 'chave.pem')),
    apagar: () => rmSync(dir, { recursive: true, force: true })
  }
}

/** The list in the format of the Rover Hangar issuer (contract 0.17.0, validarListaDeEmissores). */
export const issuerList = ({ geradoEm: generatedAt, emissores: issuers, revogados: revoked = [] }) => ({
  versao: 1, protocolo: '0.3', geradoEm: generatedAt, validadeMaxS: 259200,
  emissores: issuers.map((key, i) => ({ chave: key, estado: i === 0 ? 'atual' : 'anterior' })), revogados: revoked
})

/** The issuer discovery document (provisional format of contract 0.17.0). */
export const issuerDiscovery = ({ emissores: issuers, lista: list = LIST_PATH }) => ({
  rede: 'rover-network', formato: 'provisorio-1', papel: 'emissor', protocolo: '0.3',
  emissores: issuers.map((key, i) => ({ chave: key, estado: i === 0 ? 'atual' : 'anterior' })), lista: list
})

const json = (res, status, body, headers = {}) => {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text), ...headers })
  res.end(text)
}

/**
 * Starts the fake issuer. `rotas` is a path -> (req, res) map that the test swaps freely; by default, discovery and list
 * answer from `estado` (also mutable). `pedidos` counts how many times each path was requested.
 */
export async function startFakeIssuer(certificate, state) {
  const requests = new Map()
  const routes = new Map()
  routes.set(DISCOVERY_PATH, (req, res) => json(res, 200, issuerDiscovery({ emissores: state.emissores })))
  routes.set(LIST_PATH, (req, res) => {
    if (state.fail) return json(res, state.fail, { ok: false })
    json(res, 200, issuerList(state))
  })
  const server = createServer({ cert: certificate.cert, key: certificate.key }, (req, res) => {
    const path = new URL(req.url, 'https://x').pathname
    requests.set(path, (requests.get(path) ?? 0) + 1)
    const route = routes.get(path)
    if (!route) return json(res, 404, { ok: false })
    route(req, res)
  })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const base = `https://127.0.0.1:${server.address().port}`
  return {
    base,
    descoberta: base + DISCOVERY_PATH,
    lista: base + LIST_PATH,
    rotas: routes,
    pedidos: requests,
    fechar: () => new Promise((ok) => { server.closeAllConnections(); server.close(() => ok()) })
  }
}
