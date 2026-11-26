// `HttpClient.imagem` and the site's `/midia/<hash>.<ext>` route against the REAL REFERENCE RELAY (`npm run relay`), not against a
// fake server: a temporary database on a free port, with `RELAY_MEDIA=sim`, a rover that publishes its portrait image through the reference
// client, and the site reading those bytes. Then the same database comes up with the feature off and the same image must give 404.
// The relay starts in its own process group (`npm` opens a `node` child); at the end only that group is killed.

import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { HttpClient } from '@/lib/http-client'
import { allDemoImages } from '@/lib/social/fake/images'
import { GET } from '@/app/midia/[arquivo]/route'

// the protocol and the reference client are plain JavaScript from the same repository
// @ts-expect-error JS module without types
import { createHandleAttestation, generateKeyPair, cleanImage } from '../../../protocol/src/index.js'
// @ts-expect-error JS module without types
import { TestApprover, RoverClient } from '../../../client/src/index.js'

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const has = existsSync(join(ROOT, 'packages/relay/bin/relay.js'))

const freePort = () => new Promise<number>((ok, failure) => {
  const s = createServer()
  s.on('error', failure)
  s.listen(0, '127.0.0.1', () => {
    const { port } = s.address() as { port: number }
    s.close(() => ok(port))
  })
})

type Relay = { process_: ChildProcess; base: string; log: () => string }

/** Starts `npm run relay` in its own process group and waits for the log's `ouvindo`. */
async function startRelay(dbPath: string, issuer: string, media: boolean): Promise<Relay> {
  const port = await freePort()
  const process_ = spawn('npm', ['run', '--silent', 'relay'], {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, RELAY_ISSUERS: issuer, RELAY_DB: dbPath, RELAY_PORT: String(port), RELAY_ADDRESS: '127.0.0.1', RELAY_MEDIA: media ? 'sim' : 'nao', RELAY_MEDIA_DIR: '' },
  })
  let log = ''
  process_.stderr!.on('data', (d: Buffer) => { log += d.toString() })
  const deadline = Date.now() + 20_000
  while (!/"evento":"ouvindo"/.test(log)) {
    if (process_.exitCode !== null || Date.now() > deadline) throw new Error(`the relay did not start:\n${log}`)
    await new Promise((ok) => setTimeout(ok, 50))
  }
  expect(log).toContain(`"midia":${media}`)
  return { process_, base: `http://127.0.0.1:${port}`, log: () => log }
}

/** Kills the group THIS test created (npm and the child node), and only it; waits for exit. */
async function stopRelay(r: Relay | undefined) {
  if (!r?.process_.pid || r.process_.exitCode !== null) return
  const left = new Promise((ok) => r.process_.once('exit', ok))
  try { process.kill(-r.process_.pid, 'SIGTERM') } catch { /* the group has already ended */ }
  const deadline = setTimeout(() => { try { process.kill(-r.process_.pid!, 'SIGKILL') } catch { /* already ended */ } }, 5000)
  await left
  clearTimeout(deadline)
}

const callRoute = (file: string) => GET(new Request(`http://site/midia/${file}`), { params: Promise.resolve({ arquivo: file }) })

/** The site route reads the client from the environment variable; switching relay = switching the stored client. */
function pointSiteTo(base: string) {
  process.env.FOLGALI_CLIENT = 'http'
  process.env.FOLGALI_RELAY_URL = base
  delete (globalThis as { __folgaliNetwork?: unknown }).__folgaliNetwork
}

describe.skipIf(!has)('images through the real reference relay (npm run relay, RELAY_MEDIA=sim)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rn-site-midia-'))
  const dbPath = join(dir, 'rele.sqlite')
  const issuer = generateKeyPair()
  const sample = allDemoImages()[0]
  const clean = cleanImage(Buffer.from(sample.bytes))
  const envBefore = { cliente: process.env.FOLGALI_CLIENT, url: process.env.FOLGALI_RELAY_URL }
  let relay: Relay | undefined

  beforeAll(async () => {
    relay = await startRelay(dbPath, issuer.publicKey, true)
    // a real rover: the issuer's attestation the relay trusts, the profile, and the portrait image through the reference client
    const network = generateKeyPair()
    const approval = generateKeyPair()
    const now = Math.floor(Date.now() / 1000)
    const uid = `rvr_${randomBytes(16).toString('base64url')}`
    const attestation = createHandleAttestation({
      issuerPrivateKey: issuer.chavePrivada, emissor: issuer.publicKey, uid, handle: `pipa.t${randomBytes(3).toString('hex')}`,
      chave: network.publicKey, chaveAprovacao: approval.publicKey, emitidoEm: now - 10, expiraEm: now + 30 * 86400,
    })
    const client = new RoverClient({ base: relay.base, uid, chavePrivada: network.chavePrivada, atestado: attestation, aprovador: new TestApprover({ chavePrivadaDeAprovacao: approval.chavePrivada }) })
    expect((await client.perfil({ nome: 'Pipa' })).estado).toBe('aceito')
    // an image requires an account that is 1 day old; the relay measures age from the first object seen, so the account is aged in the database (the relay stays up)
    const db = new DatabaseSync(dbPath)
    db.exec('PRAGMA busy_timeout = 5000')
    db.prepare('UPDATE rovers SET criado_em = criado_em - 172800 WHERE uid = ?').run(uid)
    db.close()
    expect((await client.setPortraitImage(Buffer.from(sample.bytes), { alt: sample.alt })).estado).toBe('aceito')
  }, 30_000)

  afterAll(async () => {
    await stopRelay(relay)
    process.env.FOLGALI_CLIENT = envBefore.cliente
    process.env.FOLGALI_RELAY_URL = envBefore.url
    if (envBefore.cliente === undefined) delete process.env.FOLGALI_CLIENT
    if (envBefore.url === undefined) delete process.env.FOLGALI_RELAY_URL
    delete (globalThis as { __folgaliNetwork?: unknown }).__folgaliNetwork
    rmSync(dir, { recursive: true, force: true })
  })

  it('the relay serves the image with its own security headers (control: what the site passes along comes from here)', async () => {
    const res = await fetch(`${relay!.base}/v1/midia/${clean.hash}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-security-policy')).toMatch(/default-src 'none'/)
    expect(res.headers.get('cache-control')).toBe('public, max-age=300')
  })

  it('HttpClient.imagem returns the exact clean bytes and the format', async () => {
    const found = await new HttpClient({ base: relay!.base }).imagem(clean.hash)
    expect(found?.formato).toBe('png')
    expect(Buffer.compare(Buffer.from(found!.bytes), clean.bytes)).toBe(0)
    // a hash the relay does not have, and text that is not even a hash (this one does not even leave the computer)
    expect(await new HttpClient({ base: relay!.base }).imagem('0'.repeat(64))).toBeNull()
    expect(await new HttpClient({ base: relay!.base }).imagem('../v1/info')).toBeNull()
  })

  it('the site\'s /midia route in http mode serves the relay\'s bytes with nosniff, CSP sandbox and immutable cache', async () => {
    pointSiteTo(relay!.base)
    const res = await callRoute(`${clean.hash}.png`)
    expect(res.status).toBe(200)
    expect(Buffer.compare(Buffer.from(await res.arrayBuffer()), clean.bytes)).toBe(0)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('content-length')).toBe(String(clean.bytes.length))
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox")
    expect(res.headers.get('cache-control')).toBe('public, max-age=300')
    expect(res.headers.get('etag')).toBe(`"${clean.hash}"`)
    expect(res.headers.get('content-disposition')).toBe('inline')
  })

  it('on the route, an extension that does not match the format and an unknown hash give 404 with no cache and with nosniff', async () => {
    pointSiteTo(relay!.base)
    for (const file of [`${clean.hash}.jpg`, `${'0'.repeat(64)}.png`, `${clean.hash}.svg`, 'nada.png']) {
      const res = await callRoute(file)
      expect(res.status, file).toBe(404)
      expect(res.headers.get('x-content-type-options'), file).toBe('nosniff')
      expect(res.headers.get('cache-control'), file).toBe('no-store')
      expect(res.headers.get('content-type'), file).toMatch(/^text\/plain/)
    }
  })

  it('the SAME database with the feature off: the relay answers 404 and so does the site route, with no cache', async () => {
    await stopRelay(relay)
    relay = await startRelay(dbPath, issuer.publicKey, false)
    const direct = await fetch(`${relay.base}/v1/midia/${clean.hash}`)
    expect(direct.status).toBe(404)
    expect(await new HttpClient({ base: relay.base }).imagem(clean.hash)).toBeNull()
    pointSiteTo(relay.base)
    const res = await callRoute(`${clean.hash}.png`)
    expect(res.status).toBe(404)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('content-security-policy')).toBeNull()
  }, 30_000)
})
