#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Smoke test of the VIDEO store against the REAL S3-compatible store (on folgali, its MinIO), with the same variables the relay reads:
//
//   RELAY_MEDIA_S3_ENDPOINT=https://s3.exemplo.com RELAY_MEDIA_S3_BUCKET=folgali-midia \
//   RELAY_MEDIA_S3_KEY=... RELAY_MEDIA_S3_SECRET=... [RELAY_MEDIA_S3_REGION=us-east-1] [RELAY_MEDIA_S3_PREFIX=video/] \
//   [RELAY_MEDIA_S3_PUBLIC_URL=https://midia.exemplo.com] node packages/relay/scripts/smoke-s3.mjs
//
// It checks the bucket, stores a 3 MB object under the same key shape a video gets, reads it whole and by range, reads it through a
// presigned URL when a public address is configured, deletes it and confirms it is gone. It prints one line per step and exits 1 at
// the first failure. It never prints the key or the secret, and it removes what it wrote even when a step fails.
import { createHash, randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { S3Storage, videoStorageOf } from '../src/storage.js'

const step = async (name, fn) => {
  const home = Date.now()
  try {
    const detail = await fn()
    console.log(`ok    ${name}${detail ? `: ${detail}` : ''} (${Date.now() - home} ms)`)
  } catch (e) {
    console.log(`FALHA ${name}: ${e?.message ?? e}`)
    throw Object.assign(e instanceof Error ? e : new Error(String(e)), { alreadySaid: true })
  }
}
const all = async (body) => { const p = []; for await (const x of body) p.push(x); return Buffer.concat(p) }

const dir = mkdtempSync(join(tmpdir(), 'fumaca-s3-'))
let storage = null
let hash = null
let code = 0
try {
  storage = videoStorageOf(process.env, dir)
  if (!(storage instanceof S3Storage)) throw new Error('Nenhuma variável RELAY_MEDIA_S3_* foi dada: sem elas o vídeo fica no disco e não há o que testar aqui.')
  console.log(`alvo  ${JSON.stringify(storage.descricao())}`)
  const bytes = randomBytes(3 * 1048576)
  hash = createHash('sha256').update(bytes).digest('hex')
  const file = join(dir, 'envio.tmp')
  writeFileSync(file, bytes)
  await step('o bucket existe e a chave alcança', () => storage.check())
  await step('guardar 3 MB', () => storage.guardar(hash, { caminho: file, tamanho: bytes.length, tipo: 'video/mp4' }))
  await step('existe', async () => { if (!(await storage.existe(hash))) throw new Error('o objeto não apareceu') })
  await step('ler inteiro', async () => {
    const read = await all((await storage.abrir(hash)).corpo)
    if (!read.equals(bytes)) throw new Error('os bytes lidos não são os enviados')
    return `${read.length} bytes`
  })
  await step('ler uma faixa (Range)', async () => {
    const read = await all((await storage.abrir(hash, { inicio: 1_000_000, fim: 1_000_099 })).corpo)
    if (!read.equals(bytes.subarray(1_000_000, 1_000_100))) throw new Error('a faixa lida não confere')
    return '100 bytes a partir de 1 000 000'
  })
  const url = storage.readUrl(hash)
  if (url) {
    await step('ler pela URL assinada, com Range, como um navegador', async () => {
      const r = await fetch(url, { headers: { range: 'bytes=0-99' } })
      if (r.status !== 206) throw new Error(`a URL assinada respondeu ${r.status} (esperado 206)`)
      if (!Buffer.from(await r.arrayBuffer()).equals(bytes.subarray(0, 100))) throw new Error('os bytes da URL assinada não conferem')
      return `206, ${new URL(url).host}`
    })
    await step('a URL sem assinatura é recusada', async () => {
      const r = await fetch(url.split('?')[0])
      if (r.status < 400) throw new Error(`o objeto está público sem assinatura (status ${r.status}): feche a política do bucket`)
      return String(r.status)
    })
  } else console.log('pulo  URL assinada: sem RELAY_MEDIA_S3_PUBLIC_URL o relé carrega os bytes ele mesmo')
  await step('um SHA-256 errado é recusado pelo armazenamento', async () => {
    const other = join(dir, 'outro.tmp')
    writeFileSync(other, Buffer.from('conteudo que nao bate com o hash'))
    const wrong = 'f'.repeat(64)
    try {
      await storage.guardar(wrong, { caminho: other, tamanho: 32, tipo: 'video/mp4' })
    } catch {
      return 'recusado'
    }
    await storage.apagar(wrong)
    throw new Error('o armazenamento aceitou bytes que não conferem com o SHA-256 assinado')
  })
} catch (e) {
  code = 1
  if (!e?.alreadySaid) console.log(`FALHA ${e?.message ?? e}`)
} finally {
  if (storage instanceof S3Storage && hash) {
    try {
      await storage.apagar(hash)
      console.log((await storage.existe(hash)) ? 'FALHA apagar: o objeto continua lá' : 'ok    apagar e conferir que saiu')
    } catch (e) {
      code = 1
      console.log(`FALHA apagar: ${e?.message ?? e}`)
    }
  }
  rmSync(dir, { recursive: true, force: true })
}
console.log(code === 0 ? 'FUMAÇA S3: passou' : 'FUMAÇA S3: FALHOU')
process.exit(code)
