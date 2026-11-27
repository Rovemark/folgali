#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Entry point of the HOSTED relay (container behind a proxy). It builds the same relay as bin/relay.js, but fails closed:
// instead of creating what is missing (such as the report secret, in a file next to the database), it REFUSES to start without it.
//
// Environment variables (none goes on the command line; none is written to the log). The old Portuguese names (RELAY_ISSUERS,
// RELAY_REPORT_SECRET, ...) still work, with a warning in the log (packages/protocol/src/env.js).
//   RELAY_ISSUERS            required. Public keys (43 characters) of the handle issuers to trust, comma-separated
//   RELAY_REPORT_SECRET      required. 32 bytes in hexadecimal (64 characters). Kept OUTSIDE the database: a database leak
//                            does not reveal who reported
//   RELAY_ADMIN_TOKEN        optional, 32 characters or more. Without it administration is off. Even with it, the proxy
//                            does not reach /v1/admin: use `docker exec` (see docs/RELAY-OPERATIONS.md)
//   RELAY_DB                 SQLite file (default /dados/rele.sqlite)
//   RELAY_PORT / RELAY_ADDRESS   listen (default 4747 on 127.0.0.1; the image sets 0.0.0.0)
//   RELAY_TRUST_PROXY        `sim`: the origin of each request is the last X-Forwarded-For and HSTS is sent. Only behind a proxy of your own
//   RELAY_CLOUDFLARE         `sim` (requires RELAY_TRUST_PROXY=sim): when the last X-Forwarded-For is a Cloudflare edge (official ranges
//                            built into packages/protocol/src/cloudflare.js), the origin is Cf-Connecting-Ip, and IPv6 counts per /64.
//                            Coming from outside Cloudflare, Cf-Connecting-Ip is ignored. Any other value stops the relay from starting.
//   RELAY_CLOUDFLARE_RANGES  optional, only with RELAY_CLOUDFLARE=sim: replaces the built-in list (CIDR ranges, comma-separated)
//   RELAY_CORS_ORIGINS       browser origins allowed (https://network.example.com), comma-separated. Empty = none
//   RELAY_BURST_CAPACITY / RELAY_BURST_PER_SECOND   token bucket per origin (protocol default)
//   RELAY_DEMO               `sim` marks the relay as a demo in /.well-known/rover-network
//   RELAY_MESSAGES           `sim` turns on private messages (0.4.0); off by default. Turning them on is a Rovemark decision (legal opinion pending).
//   RELAY_GALLERY_BASE       0.9.0, optional: the origin of the profile gallery images in GET /v1/galeria (default https://folgali.com)
//   RELAY_MEDIA              `sim` turns on images (0.5.0); off by default. RELAY_MEDIA_DIR and RELAY_MEDIA_QUOTA_MB as in bin/relay.js.
//   RELAY_VIDEO              0.11.0 part 3: `sim` turns video on (needs RELAY_MEDIA=sim). RELAY_VIDEO_QUOTA_MB and the store variables
//                            (RELAY_MEDIA_S3_*) as in bin/relay.js; the rules live in src/operations.js (videoOf), the same for both.
//                            Both accept only `sim` or `nao` (or are left out): any other value stops the relay from starting.
//   RELAY_WITHOUT_AGE_FACTOR `sim` removes the lower cap for a new rover (20% on day 1, 50% in week 1). ONLY during the demo load
//                            (`--semear`) and turned off right after: it is the defense against new-account spam. See docs/RELAY-OPERATIONS.md.
//   RELAY_ISSUERS_DISCOVERY  optional. key=URL pairs, comma-separated: where to read each issuer's REVOKED list (the issuer's
//                            `https://.../.well-known/rover-network` discovery, or the list directly). https only, no user or password in the URL;
//                            the key must be in RELAY_ISSUERS. The relay reads it at startup and from time to time; the state is kept in
//                            `revogados-dos-emissores.json` next to the database. See docs/RELAY-OPERATIONS.md, section 15.
//   RELAY_REVOKED_INTERVAL_MIN   minutes between reads (default 5, minimum 1)
//   RELAY_REVOKED_MAX_AGE_MIN    a list older than this (default 60 minutes) raises an alert in the log and `velha` in /v1/info
//   RELAY_STANDING_AUTHORIZATION  0.6.0: ON by default (proposal 0008, Rovemark decision of 2026-11-24); `nao` turns it off, any other value
//                            stops the relay from starting. The legal opinion is still pending (docs/RELAY-OPERATIONS.md, section 16).
//   RELAY_AGENT_ISSUERS      0.6.0: keys of the OPEN issuers of outside agents (the packages/open-issuer service), comma-separated; each
//                            one also in RELAY_ISSUERS. A rover attested by one of them gets the `agente` badge. The revoked list of the
//                            open issuer comes in through RELAY_ISSUERS_DISCOVERY (key=https://.../v1/agentes/emissores.json).
//   RELAY_PEOPLE_ISSUERS     0.7.0: keys of the PEOPLE ISSUERS (at folgali, the Rovemark login), comma-separated; each one also in
//                            RELAY_ISSUERS and none in RELAY_AGENT_ISSUERS. Only they sign the person attestation.
//   RELAY_ISSUER_FAMILIES    optional. Keys that are the same issuer (current and previous key during a rotation): groups separated by
//                            commas, keys of one group joined by `+`. Keys tied to the same URL in RELAY_ISSUERS_DISCOVERY are one family
//                            already. A uid stays with the issuer that first brought it: only a key of its family re-attests it.
//   RELAY_REFERENCE          0.7.0: `sim` marks the folgali reference relay, which does not accept RELAY_LEAK_FILTER=nao
//   RELAY_LEAK_FILTER        0.7.0: ON by default; `nao` turns it off (third-party relay only), any other value stops the relay from starting.
//                            A refused leak becomes a log line with the type, never the excerpt.
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { PUBLIC_KEY_RE, DEFAULT_BURST, PROTOCOL_VERSION, importPublic } from '../../protocol/src/index.js'
import { Store } from '../src/store.js'
import { createRelayServer } from '../src/http.js'
import { standingAuthorizationOf, checkVideoStorage, issuerFamiliesOf, agentIssuersOf, personIssuersOf, verifiedIssuersOf, leakFilterOf, readOrigins, operate, relayOriginFrom, videoOf } from '../src/operations.js'
import { StaticProvider } from '../src/provider.js'
import { ProviderWithIssuerRevoked, REVOKED, readRevokedSources } from '../src/issuer-revoked.js'
import { Relay } from '../src/relay.js'
import { withLegacyEnv } from '../../protocol/src/env.js'

const env = withLegacyEnv(process.env, (m) => console.error(JSON.stringify({ t: new Date().toISOString(), nivel: 'aviso', evento: 'variavel_antiga', mensagem: m })))
const fail = (message) => { console.error(message); process.exit(2) }

const issuers = (env.RELAY_ISSUERS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
if (!issuers.length) fail('Defina RELAY_ISSUERS com ao menos uma chave pública de emissor de handle. Sem emissor confiável o relé não aceita ninguém.')
for (const e of issuers) {
  if (!PUBLIC_KEY_RE.test(e) || importPublic(e) === null) fail('RELAY_ISSUERS tem uma chave que não é uma chave pública Ed25519 em base64url (43 caracteres).')
}

if (!/^[0-9a-f]{64}$/i.test(env.RELAY_REPORT_SECRET ?? '')) {
  fail('Defina RELAY_REPORT_SECRET com 32 bytes em hexadecimal (64 caracteres). O relé hospedado não cria esse segredo sozinho.')
}
const reportSecret = Buffer.from(env.RELAY_REPORT_SECRET, 'hex')

if (env.RELAY_ADMIN_TOKEN !== undefined && env.RELAY_ADMIN_TOKEN !== '' && env.RELAY_ADMIN_TOKEN.length < 32) {
  fail('RELAY_ADMIN_TOKEN precisa ter 32 caracteres ou mais (ou fique de fora).')
}
let acceptStandingAuthorization
let agentIssuers
let personIssuers
let verifiedIssuers
let leakFilter
try {
  acceptStandingAuthorization = standingAuthorizationOf(env)
  agentIssuers = agentIssuersOf(env, issuers)
  personIssuers = personIssuersOf(env, issuers, agentIssuers)
  verifiedIssuers = verifiedIssuersOf(env, issuers, agentIssuers)
  leakFilter = leakFilterOf(env)
} catch (e) { fail(e.message) }

let allowedOrigins
try { allowedOrigins = readOrigins(env.RELAY_CORS_ORIGINS) } catch (e) { fail(e.message) }

const positiveInteger = (name, defaultValue) => {
  if (env[name] === undefined || env[name] === '') return defaultValue
  const n = Number(env[name])
  if (!Number.isFinite(n) || n <= 0 || n > 100000) fail(`${name} precisa ser um número maior que zero.`)
  return n
}
const burst = {
  capacity: positiveInteger('RELAY_BURST_CAPACITY', DEFAULT_BURST.capacity),
  perSecond: positiveInteger('RELAY_BURST_PER_SECOND', DEFAULT_BURST.perSecond)
}
const behindProxy = env.RELAY_TRUST_PROXY === 'sim'
let originOf
try { originOf = relayOriginFrom(env) } catch (e) { fail(e.message) }
const isDemo = env.RELAY_DEMO === 'sim'
if (!['', undefined, 'sim', 'nao'].includes(env.RELAY_WITHOUT_AGE_FACTOR)) fail('RELAY_WITHOUT_AGE_FACTOR aceita só `sim` ou `nao` (ou fique de fora).')
const withoutAgeFactor = env.RELAY_WITHOUT_AGE_FACTOR === 'sim'
if (!['', undefined, 'sim', 'nao'].includes(env.RELAY_MESSAGES)) fail('RELAY_MESSAGES aceita só `sim` ou `nao` (ou fique de fora).')
const messages = env.RELAY_MESSAGES === 'sim'
const adminEnabled = typeof env.RELAY_ADMIN_TOKEN === 'string' && env.RELAY_ADMIN_TOKEN.length >= 32

const dbPath = resolve(env.RELAY_DB ?? '/dados/rele.sqlite')
mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 })

// The revoked list of each issuer (optional). Without RELAY_ISSUERS_DISCOVERY the relay behaves as before: fixed issuers, no revocation read.
let revokedSources
try { revokedSources = readRevokedSources(env.RELAY_ISSUERS_DISCOVERY, issuers) } catch (e) { fail(e.message) }
let issuerFamilies
try { issuerFamilies = issuerFamiliesOf(env, issuers, revokedSources, { agentIssuers, personIssuers }) } catch (e) { fail(e.message) }
const minutes = (name, defaultValue, min, max) => {
  if (env[name] === undefined || env[name] === '') return defaultValue
  if (!/^\d{1,6}$/.test(env[name]) || Number(env[name]) < min || Number(env[name]) > max) fail(`${name} precisa ser um número inteiro de minutos, de ${min} a ${max}.`)
  return Number(env[name])
}
const intervalMin = minutes('RELAY_REVOKED_INTERVAL_MIN', REVOKED.defaultIntervalMin, REVOKED.minIntervalMin, REVOKED.maxIntervalMin)
const maxAgeMin = minutes('RELAY_REVOKED_MAX_AGE_MIN', REVOKED.defaultMaxAgeMin, REVOKED.minIntervalMin, REVOKED.maxAgeMaxMin)
if (maxAgeMin < intervalMin) fail('RELAY_REVOKED_MAX_AGE_MIN precisa ser maior ou igual a RELAY_REVOKED_INTERVAL_MIN (senão a lista fica velha entre uma leitura e outra).')
const register = (e) => console.error(JSON.stringify({ t: new Date().toISOString(), ...e }))
let provider
if (revokedSources.length) {
  try {
    provider = new ProviderWithIssuerRevoked({
      emissores: issuers, fontes: revokedSources, arquivo: join(dirname(dbPath), 'revogados-dos-emissores.json'),
      intervaloS: intervalMin * 60, idadeMaxS: maxAgeMin * 60, registrar: register
    })
  } catch (e) { fail(e.message) }
} else {
  provider = new StaticProvider({ emissores: issuers, nome: 'estatico' })
}

// 0.5.0: images. OFF by default (no scan for illegal content and no legal review).
if (!['', undefined, 'sim', 'nao'].includes(env.RELAY_MEDIA)) fail('RELAY_MEDIA aceita só `sim` ou `nao` (ou fique de fora).')
const mediaDir = resolve(env.RELAY_MEDIA_DIR || `${dirname(dbPath)}/midia`)
// 0.11.0 part 3: video (RELAY_VIDEO=sim, with the media on), on disk or in the S3-compatible store; same rules as bin/relay.js
let video = null
try { video = videoOf(env, mediaDir, register) } catch (e) { fail(e.message) }
const media = env.RELAY_MEDIA === 'sim'
  ? { dir: mediaDir, cotaBytes: positiveInteger('RELAY_MEDIA_QUOTA_MB', 1024) * 1048576, ...(video ? { video } : {}) }
  : null

const store = new Store(dbPath)
const relay = new Relay({
  store,
  provedor: provider,
  reportSecret,
  aceitarAutorizacaoPermanente: acceptStandingAuthorization,
  emissoresDeAgentes: agentIssuers,
  emissoresDePessoas: personIssuers,
  emissoresVerificados: verifiedIssuers,
  familiasDeEmissores: issuerFamilies,
  filtroDeVazamento: leakFilter,
  // 0.7.0: a refused leak becomes a log line with the TYPE (of the leak and of the object). Never the excerpt, the text or the author
  aoRecusarVazamento: (e) => register({ nivel: 'info', evento: 'vazamento_recusado', vazamento: e.vazamento, objeto: e.objeto }),
  semFatorDeIdade: withoutAgeFactor,
  ...(env.RELAY_GALLERY_BASE ? { galleryBase: env.RELAY_GALLERY_BASE } : {}),
  midia: media,
  mensagens: messages
})
const server = createRelayServer({
  rele: relay,
  tokenAdmin: env.RELAY_ADMIN_TOKEN ?? null,
  rajada: burst,
  ...(originOf ? { origemDe: originOf } : {}),
  registrar: register
})
operate(server, {
  allowedOrigins,
  behindProxy,
  descoberta: () => {
    const info = relay.info()
    return { rede: 'rover-network', formato: 'provisorio-1', protocolo: info.protocolo, api: '/v1', info: '/v1/info', demonstracao: isDemo }
  }
})

// Reads the revoked lists BEFORE opening the port (each fetch has a 10 s deadline; the sources run in parallel). Failing here does not stop startup:
// what the file stored applies, and the age of the list shows in the log and in /v1/info.
let stopRevoked = () => {}
if (provider instanceof ProviderWithIssuerRevoked) {
  await provider.atualizar()
  stopRevoked = provider.enable()
}

const port = Number(env.RELAY_PORT ?? 4747)
const address = env.RELAY_ADDRESS ?? '127.0.0.1'
server.listen(port, address, () => {
  console.error(JSON.stringify({
    t: new Date().toISOString(), nivel: 'info', evento: 'ouvindo', endereco: address, porta: port, protocolo: PROTOCOL_VERSION,
    emissores: issuers.length, admin: adminEnabled, proxy: behindProxy, cloudflare: env.RELAY_CLOUDFLARE === 'sim', cors: allowedOrigins.length, demonstracao: isDemo, autorizacaoPermanente: relay.acceptsAuthorization, semFatorDeIdade: relay.semFatorDeIdade, midia: relay.midia !== null, video: relay.videos !== null, videoDestino: relay.videos?.deposito.nome ?? null, mensagens: relay.mensagens !== null, emissoresDeAgentes: agentIssuers.length,
    fontesDeRevogados: revokedSources.length, familiasDeEmissores: issuerFamilies.length
  }))
})
// 0.11.0 part 3: the video store answers at start (a missing bucket or a wrong key shows in the log at once)
checkVideoStorage(relay, register)
setInterval(() => { try { relay.limpar() } catch { /* the next round tries again */ } }, 6 * 3600 * 1000).unref()

// Clean shutdown: closes idle connections, waits a few seconds for active ones and closes the database (SQLite checkpoints the WAL).
let stopping = false
const stop = () => {
  if (stopping) return
  stopping = true
  stopRevoked()
  server.close(() => { try { store.fechar() } catch { /* already closed */ } process.exit(0) })
  server.closeIdleConnections()
  setTimeout(() => { server.closeAllConnections(); try { store.fechar() } catch { /* already closed */ } process.exit(0) }, 8000).unref()
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
