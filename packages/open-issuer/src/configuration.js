// SPDX-License-Identifier: AGPL-3.0-or-later
// The configuration of the open issuer service, read from environment variables. Fails closed: anything missing or extra stops the service from
// starting, with a message for the operator that never echoes a secret. No secret goes to the command line or to the log.
//   ISSUER_KEY           required. Seed (32 bytes, hex) of the key that signs the agents' attestations
//   ISSUER_SECRET         required. 32 bytes in hex, different from the key: derives each agent's approval key and the owners' HMAC
//   ISSUER_OWNERS           required. Public keys of the owner issuers (the Rovemark login), comma-separated
//   ISSUER_LINK            required. The claim page, https, ending in `/` (the link's secret goes after it)
//   ISSUER_RELAY            required. The root of the relay this issuer serves (https://folgali.com). http only for 127.0.0.1 and localhost
//   ISSUER_DB           SQLite file (default /dados/emissor-aberto.sqlite)
//   ISSUER_PORT / ISSUER_ADDRESS   listening (default 4848 on 127.0.0.1; the image sets 0.0.0.0)
//   ISSUER_TRUST_PROXY   `sim`: the origin of each request is the last X-Forwarded-For. Only behind a proxy of your own
//   ISSUER_CLOUDFLARE      `sim` (requires ISSUER_TRUST_PROXY=sim): when the last X-Forwarded-For is a Cloudflare edge, the origin is
//                           Cf-Connecting-Ip (coming from outside Cloudflare, it is ignored). See packages/protocol/src/cloudflare.js
//   ISSUER_CLOUDFLARE_RANGES   optional, only with ISSUER_CLOUDFLARE=sim: replaces the built-in list of ranges (CIDR, comma-separated)
//   ISSUER_DELIVERY_INTERVAL_S   seconds between attempts to deliver what stayed in the queue (default 60)
import { privateKeyFromSeed } from '../../protocol/src/index.js'
import { readCloudflareConfig } from '../../protocol/src/cloudflare.js'

const YES_NO = ['', undefined, 'sim', 'nao']
const LOOPBACK = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?$/

export function readConfig(env) {
  const hex32 = (name) => {
    if (!/^[0-9a-f]{64}$/i.test(env[name] ?? '')) throw new Error(`Defina ${name} com 32 bytes em hexadecimal (64 caracteres).`)
    return Buffer.from(env[name], 'hex')
  }
  const seed = hex32('ISSUER_KEY')
  const secret = hex32('ISSUER_SECRET')
  if (seed.equals(secret)) throw new Error('ISSUER_SECRET precisa ser diferente de ISSUER_KEY.')
  const owners = (env.ISSUER_OWNERS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!owners.length || owners.some((d) => !/^[A-Za-z0-9_-]{43}$/.test(d))) {
    throw new Error('Defina ISSUER_OWNERS com as chaves públicas (43 caracteres) dos emissores de donos, por vírgula.')
  }
  const link = env.ISSUER_LINK ?? ''
  if (!/^https:\/\/[^\s/?#@]+(\/[^\s?#@]*)?\/$/.test(link)) {
    throw new Error('Defina ISSUER_LINK com a página de reivindicação, https, sem usuário nem consulta, terminando em /.')
  }
  const relay = (env.ISSUER_RELAY ?? '').replace(/\/+$/, '')
  if (!/^https:\/\/[^\s/?#@]+$/.test(relay) && !LOOPBACK.test(relay)) {
    throw new Error('Defina ISSUER_RELAY com a raiz do relé (https://dominio, sem caminho; http só para 127.0.0.1 ou localhost).')
  }
  if (!YES_NO.includes(env.ISSUER_TRUST_PROXY)) throw new Error('ISSUER_TRUST_PROXY aceita só `sim` ou `nao` (ou fique de fora).')
  const cloudflare = readCloudflareConfig(env, 'ISSUER')
  const integer = (name, defaultValue, min, max) => {
    if (env[name] === undefined || env[name] === '') return defaultValue
    if (!/^\d{1,6}$/.test(env[name]) || Number(env[name]) < min || Number(env[name]) > max) throw new Error(`${name} precisa ser um inteiro de ${min} a ${max}.`)
    return Number(env[name])
  }
  return {
    chavePrivada: privateKeyFromSeed(seed),
    segredo: secret,
    ownerIssuers: owners,
    claimLink: link,
    rele: relay,
    banco: env.ISSUER_DB || '/dados/emissor-aberto.sqlite',
    porta: integer('ISSUER_PORT', 4848, 1, 65535),
    endereco: env.ISSUER_ADDRESS || '127.0.0.1',
    trustProxy: env.ISSUER_TRUST_PROXY === 'sim',
    cloudflare,
    deliveryIntervalS: integer('ISSUER_DELIVERY_INTERVAL_S', 60, 5, 86400)
  }
}
