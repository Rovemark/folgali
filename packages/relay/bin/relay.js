#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Reference relay of the Rover Network. It is a DRAFT for study and testing: it is not in production anywhere.
//
// Configuration by environment variable (no secret goes on the command line or into the log). The old Portuguese names
// (RELAY_ISSUERS, RELAY_DB, ...) still work, with a warning in the log (packages/protocol/src/env.js).
//   RELAY_ISSUERS            public keys of the handle issuers to trust, comma-separated (required)
//   RELAY_DB                 SQLite file (default ./dados/rele.sqlite)
//   RELAY_PORT               port (default 4747)
//   RELAY_ADDRESS            listen address (default 127.0.0.1; only change it behind a proxy you control)
//   RELAY_ADMIN_TOKEN        admin credential, 32 characters or more; without it the /v1/admin routes stay off
//   RELAY_REPORT_SECRET      secret (32 bytes in hexadecimal) for the pseudonym of whoever reports; if missing, it is created
//                            in a file next to the database, with permission 0600
//   RELAY_STANDING_AUTHORIZATION  0.6.0: ON by default (protocol section 6.6, proposal 0008); `nao` turns it off; any other value stops startup
//   RELAY_AGENT_ISSUERS      0.6.0: keys of the open issuers of outside agents (a separate service), also in RELAY_ISSUERS
//   RELAY_PEOPLE_ISSUERS     0.7.0: keys of the people issuers (the Rovemark login at folgali), also in RELAY_ISSUERS
//   RELAY_ISSUER_FAMILIES    optional: keys that are the same issuer (key rotation), groups separated by commas, keys joined by `+`
//   RELAY_REFERENCE          0.7.0: `sim` marks the folgali reference relay, which does not accept RELAY_LEAK_FILTER=nao
//   RELAY_LEAK_FILTER        0.7.0: ON by default; `nao` turns it off (third-party relay only); any other value stops startup
//   RELAY_MESSAGES           0.4.0: only the value `sim` turns on private messages (protocol section 15); `nao` or empty leave them off,
//                            and any other value stops the relay from starting. When off, there is no messages route or resource.
//   RELAY_GALLERY_BASE       0.9.0, optional: the origin of the profile gallery images in GET /v1/galeria (default https://folgali.com)
//   RELAY_MEDIA              0.5.0: only `sim` turns on images (portrait and post attachment). Off is the default: there is no scan
//                            for illegal content and no legal review
//   RELAY_MEDIA_DIR          images folder (default: midia/ next to the database)
//   RELAY_MEDIA_QUOTA_MB     total cap for images on disk, in MiB (default 1024)
//   RELAY_VIDEO              0.11.0 part 3: only `sim` turns video on (it needs RELAY_MEDIA=sim); `nao` or absent keep it off
//   RELAY_VIDEO_QUOTA_MB     ceiling of all the video kept, in MiB (default 20480)
//   RELAY_MEDIA_S3_ENDPOINT, _BUCKET, _KEY, _SECRET, _REGION, _PREFIX, _PUBLIC_URL, _SIGNED_URL_S
//                            where the video lives: without them, on disk (<RELAY_MEDIA_DIR>/video); with the first four, in an
//                            S3-compatible store (MinIO), signed with SigV4 (src/storage.js)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { Store } from '../src/store.js'
import { createRelayServer } from '../src/http.js'
import { standingAuthorizationOf, checkVideoStorage, issuerFamiliesOf, agentIssuersOf, personIssuersOf, verifiedIssuersOf, leakFilterOf, videoOf } from '../src/operations.js'
import { StaticProvider } from '../src/provider.js'
import { Relay } from '../src/relay.js'
import { withLegacyEnv } from '../../protocol/src/env.js'

const env = withLegacyEnv(process.env, (m) => console.error(JSON.stringify({ t: new Date().toISOString(), nivel: 'aviso', evento: 'variavel_antiga', mensagem: m })))
const issuers = (env.RELAY_ISSUERS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
if (!issuers.length) {
  console.error('Defina RELAY_ISSUERS com ao menos uma chave pública de emissor de handle. Sem emissor confiável o relé não aceita ninguém.')
  process.exit(2)
}
if (!['', undefined, 'sim', 'nao'].includes(env.RELAY_MESSAGES)) {
  console.error('RELAY_MESSAGES aceita só `sim` ou `nao` (ou fique de fora).')
  process.exit(2)
}
const dbPath = resolve(env.RELAY_DB ?? './dados/rele.sqlite')
mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 })

function loadSecret() {
  if (env.RELAY_REPORT_SECRET) {
    const s = Buffer.from(env.RELAY_REPORT_SECRET, 'hex')
    if (s.length < 32) { console.error('RELAY_REPORT_SECRET precisa ter 32 bytes em hexadecimal (64 caracteres).'); process.exit(2) }
    return s
  }
  const file = `${dbPath}.segredo-denuncias`
  if (existsSync(file)) return Buffer.from(readFileSync(file, 'utf8').trim(), 'hex')
  const newValue = randomBytes(32)
  writeFileSync(file, `${newValue.toString('hex')}\n`, { mode: 0o600 })
  return newValue
}

let acceptStandingAuthorization
let agentIssuers
let personIssuers
let verifiedIssuers
let leakFilter
let issuerFamilies
try {
  acceptStandingAuthorization = standingAuthorizationOf(env)
  agentIssuers = agentIssuersOf(env, issuers)
  personIssuers = personIssuersOf(env, issuers, agentIssuers)
  verifiedIssuers = verifiedIssuersOf(env, issuers, agentIssuers)
  leakFilter = leakFilterOf(env)
  issuerFamilies = issuerFamiliesOf(env, issuers, [], { agentIssuers, personIssuers })
} catch (e) {
  console.error(e.message)
  process.exit(2)
}
const writeLog = (e) => console.error(JSON.stringify({ t: new Date().toISOString(), ...e }))
function mediaFrom(dir) {
  const media = { dir, cotaBytes: Math.max(1, Math.floor(Number(env.RELAY_MEDIA_QUOTA_MB ?? 1024))) * 1048576 }
  let video
  try {
    video = videoOf(env, dir, writeLog)
  } catch (e) {
    console.error(e.message)
    process.exit(2)
  }
  return video ? { ...media, video } : media
}
// (RELAY_VIDEO without RELAY_MEDIA is refused even when the media is off)
try { if (env.RELAY_MEDIA !== 'sim') videoOf(env, '') } catch (e) { console.error(e.message); process.exit(2) }
const relay = new Relay({
  store: new Store(dbPath),
  provedor: new StaticProvider({ emissores: issuers, nome: 'estatico' }),
  reportSecret: loadSecret(),
  aceitarAutorizacaoPermanente: acceptStandingAuthorization,
  emissoresDeAgentes: agentIssuers,
  emissoresDePessoas: personIssuers,
  emissoresVerificados: verifiedIssuers,
  familiasDeEmissores: issuerFamilies,
  filtroDeVazamento: leakFilter,
  ...(env.RELAY_GALLERY_BASE ? { galleryBase: env.RELAY_GALLERY_BASE } : {}),
  midia: env.RELAY_MEDIA === 'sim' ? mediaFrom(resolve(env.RELAY_MEDIA_DIR || `${dirname(dbPath)}/midia`)) : null,
  mensagens: env.RELAY_MESSAGES === 'sim'
})
const server = createRelayServer({
  rele: relay,
  tokenAdmin: env.RELAY_ADMIN_TOKEN ?? null,
  registrar: (e) => console.error(JSON.stringify({ t: new Date().toISOString(), ...e }))
})
const port = Number(env.RELAY_PORT ?? 4747)
const address = env.RELAY_ADDRESS ?? '127.0.0.1'
server.listen(port, address, () => {
  console.error(JSON.stringify({ t: new Date().toISOString(), nivel: 'info', evento: 'ouvindo', endereco: address, porta: port, emissores: issuers.length, admin: Boolean(env.RELAY_ADMIN_TOKEN && env.RELAY_ADMIN_TOKEN.length >= 32), autorizacaoPermanente: relay.acceptsAuthorization, emissoresDeAgentes: relay.emissoresDeAgentes.length, midia: relay.midia !== null, video: relay.videos !== null, videoDestino: relay.videos?.deposito.nome ?? null, mensagens: relay.mensagens !== null }))
})
// 0.11.0 part 3: the video store answers at start (an S3 bucket that does not exist, or a wrong key, shows in the log at once)
checkVideoStorage(relay, writeLog)
setInterval(() => { try { relay.limpar() } catch { /* the next round tries again */ } }, 6 * 3600 * 1000).unref()
const stop = () => server.close(() => process.exit(0))
process.on('SIGINT', stop)
process.on('SIGTERM', stop)

setInterval(() => { try { relay.limpar() } catch { /* the next round tries again */ } }, 6 * 3600 * 1000).unref()