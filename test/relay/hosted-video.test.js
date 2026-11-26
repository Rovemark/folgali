// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.11.0 part 3: the HOSTED relay binary (the one production runs) turns video on with RELAY_VIDEO=sim, on disk or in an S3-compatible
// store, with the same rules as bin/relay.js, and says so in /v1/info and in the "ouvindo" log line (never the key nor the secret).
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateKeyPair } from '../../packages/protocol/src/index.js'
import { startS3 } from '../helpers/test-s3.js'

const BIN = new URL('../../packages/relay/bin/hosted-relay.js', import.meta.url).pathname
const NODE = ['--disable-warning=ExperimentalWarning']
const base = { PATH: process.env.PATH, HOME: process.env.HOME }
const cleanups = []
after(async () => { for (const f of cleanups.reverse()) await f() })
const freePort = () => new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)) }) })
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))

function baseEnvironment(dir) {
  return { ...base, RELAY_ISSUERS: generateKeyPair().publicKey, RELAY_REPORT_SECRET: randomBytes(32).toString('hex'), RELAY_DB: join(dir, 'dados', 'rele.sqlite') }
}

async function start(extra) {
  const dir = mkdtempSync(join(tmpdir(), 'rn-hosp-video-'))
  const port = await freePort()
  const child = spawn(process.execPath, [...NODE, BIN], { env: { ...baseEnvironment(dir), RELAY_PORT: String(port), ...extra }, stdio: ['ignore', 'ignore', 'pipe'] })
  let log = ''
  child.stderr.on('data', (d) => { log += d })
  cleanups.push(async () => { child.kill('SIGKILL'); rmSync(dir, { recursive: true, force: true }) })
  const home = Date.now()
  while (!log.includes('"ouvindo"')) {
    if (Date.now() - home > 15_000) throw new Error(`o relé hospedado não subiu: ${log}`)
    await sleep(40)
  }
  return { url: `http://127.0.0.1:${port}`, log: () => log }
}

const line = (log, event) => JSON.parse(log.split('\n').find((l) => l.includes(`"evento":"${event}"`)))

test('hosted binary, disk: RELAY_VIDEO=sim announces video in /v1/info and the log says video:true and the destination', async () => {
  const h = await start({ RELAY_MEDIA: 'sim', RELAY_VIDEO: 'sim', RELAY_VIDEO_QUOTA_MB: '10' })
  const info = await (await fetch(`${h.url}/v1/info`)).json()
  assert.ok(info.recursos.includes('video'), info.recursos.join(','))
  assert.deepEqual({ destino: info.video.destino, cotaBytes: info.video.cotaBytes }, { destino: 'disco', cotaBytes: 10 * 1048576 })
  const listening = line(h.log(), 'ouvindo')
  assert.deepEqual({ video: listening.video, videoDestino: listening.videoDestino }, { video: true, videoDestino: 'disco' })
})

test('hosted binary, S3: the store variables are read, the bucket is checked at start, and no secret reaches the log', async () => {
  const s3 = await startS3()
  cleanups.push(() => s3.fechar())
  const h = await start({ RELAY_MEDIA: 'sim', RELAY_VIDEO: 'sim', RELAY_MEDIA_S3_ENDPOINT: s3.endpoint, RELAY_MEDIA_S3_BUCKET: s3.bucket, RELAY_MEDIA_S3_KEY: s3.chave, RELAY_MEDIA_S3_SECRET: s3.segredo })
  assert.equal((await (await fetch(`${h.url}/v1/info`)).json()).video.destino, 's3')
  const home = Date.now()
  while (!h.log().includes('video_deposito_ok')) {
    if (Date.now() - home > 10_000) throw new Error(`o depósito não foi conferido: ${h.log()}`)
    await sleep(40)
  }
  assert.equal(line(h.log(), 'ouvindo').videoDestino, 's3')
  assert.equal(h.log().includes(s3.segredo), false)
  assert.equal(h.log().includes(s3.chave), false)
})

test('hosted binary refuses a bad video configuration and does not start; without RELAY_VIDEO nothing of video exists', async () => {
  const run = (extra) => {
    const dir = mkdtempSync(join(tmpdir(), 'rn-hosp-video-x-'))
    try { return spawnSync(process.execPath, [...NODE, BIN], { env: { ...baseEnvironment(dir), ...extra }, encoding: 'utf8', timeout: 20_000 }) } finally { rmSync(dir, { recursive: true, force: true }) }
  }
  for (const [extra, excerpt] of [
    [{ RELAY_VIDEO: 'sim' }, 'RELAY_MEDIA=sim'],
    [{ RELAY_MEDIA: 'sim', RELAY_VIDEO: 'talvez' }, 'RELAY_VIDEO'],
    [{ RELAY_MEDIA: 'sim', RELAY_VIDEO: 'sim', RELAY_MEDIA_S3_ENDPOINT: 'http://127.0.0.1:9' }, 'faltam'],
    [{ RELAY_MEDIA: 'sim', RELAY_VIDEO: 'sim', RELAY_VIDEO_QUOTA_MB: 'muito' }, 'RELAY_VIDEO_QUOTA_MB']
  ]) {
    const r = run(extra)
    assert.notEqual(r.status, 0, JSON.stringify(extra))
    assert.match(r.stderr, new RegExp(excerpt), r.stderr)
  }
  const h = await start({ RELAY_MEDIA: 'sim' })
  const info = await (await fetch(`${h.url}/v1/info`)).json()
  assert.equal(info.recursos.includes('video'), false)
  assert.equal(line(h.log(), 'ouvindo').video, false)
})
