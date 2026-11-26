// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.11.0 (proposal 0013): the two destinations of a video (disk and S3) answer the same gestures, and the operator picks by variable.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DiskStorage, S3Storage, videoStorageOf, readRange } from '../../packages/relay/src/storage.js'
import { S3 } from '../../packages/relay/src/s3.js'
import { startS3 } from '../helpers/test-s3.js'

const all = async (body) => { const p = []; for await (const x of body) p.push(x); return Buffer.concat(p) }

test('the Range header: one range in bytes, clipped to the file; anything else means the whole file', () => {
  assert.deepEqual(readRange('bytes=0-99', 1000), { inicio: 0, fim: 99 })
  assert.deepEqual(readRange('bytes=900-', 1000), { inicio: 900, fim: 999 })
  assert.deepEqual(readRange('bytes=-100', 1000), { inicio: 900, fim: 999 })
  assert.deepEqual(readRange('bytes=-5000', 1000), { inicio: 0, fim: 999 })
  assert.deepEqual(readRange('bytes=500-99999', 1000), { inicio: 500, fim: 999 })
  assert.deepEqual(readRange(' bytes=0-0 ', 1000), { inicio: 0, fim: 0 })
  assert.equal(readRange('bytes=1000-', 1000), 'insatisfazivel')
  assert.equal(readRange('bytes=5-2', 1000), 'insatisfazivel')
  assert.equal(readRange('bytes=-0', 1000), 'insatisfazivel')
  for (const nothing of [undefined, '', 'bytes=-', 'bytes=0-9,20-29', 'itens=0-9', 'bytes=a-b', 'bytes=0x10-20']) assert.equal(readRange(nothing, 1000), null, String(nothing))
})

for (const destination of ['disco', 's3']) {
  test(`${destination}: keep, read whole and by range, delete; an address that is not a hash never becomes a path`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rn-deposito-'))
    const s = destination === 's3' ? await startS3() : null
    try {
      const storage = s
        ? new S3Storage({ s3: new S3({ endpoint: s.endpoint, bucket: s.bucket, chave: s.chave, segredo: s.segredo }) })
        : new DiskStorage({ dir: join(dir, 'video') })
      assert.equal(storage.nome, destination)
      await storage.check()
      const bytes = randomBytes(70_000)
      const hash = createHash('sha256').update(bytes).digest('hex')
      const temporary = join(dir, 'envio.tmp')
      writeFileSync(temporary, bytes)
      assert.equal(await storage.existe(hash), false)
      await storage.guardar(hash, { caminho: temporary, tamanho: bytes.length, tipo: 'video/mp4' })
      assert.equal(existsSync(temporary), false, 'the upload file is gone from the temporary place')
      assert.equal(await storage.existe(hash), true)
      if (s) assert.deepEqual([...s.objetos.keys()], [`video/${hash.slice(0, 2)}/${hash}`])
      assert.ok((await all((await storage.abrir(hash)).corpo)).equals(bytes))
      assert.ok((await all((await storage.abrir(hash, { inicio: 10, fim: 109 })).corpo)).equals(bytes.subarray(10, 110)))
      assert.equal(storage.readUrl(hash), null, 'no public address: the relay carries the bytes')
      await storage.apagar(hash)
      assert.equal(await storage.existe(hash), false)
      assert.equal(await storage.abrir(hash), null)
      await storage.apagar(hash)
      for (const bad of ['../../etc/passwd', 'A'.repeat(64), hash.slice(1), '']) await assert.rejects(storage.existe(bad), /hash de mídia inválido/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      await s?.fechar()
    }
  })
}

test('the operator picks by variable: nothing is the disk, the four S3 variables together are the S3, half of them is an error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rn-deposito-env-'))
  try {
    const disk = videoStorageOf({}, dir)
    assert.deepEqual(disk.descricao(), { destino: 'disco' })
    assert.equal(disk.dir, join(dir, 'video'))
    const env = { RELAY_MEDIA_S3_ENDPOINT: 'https://s3.folgali.exemplo', RELAY_MEDIA_S3_BUCKET: 'folgali-midia', RELAY_MEDIA_S3_KEY: 'chave', RELAY_MEDIA_S3_SECRET: 'segredo-longo-o-bastante' }
    assert.deepEqual(videoStorageOf(env, dir).descricao(), { destino: 's3', bucket: 'folgali-midia', prefixo: 'video/', leitura: 'pelo-rele' })
    const withUrl = videoStorageOf({ ...env, RELAY_MEDIA_S3_PUBLIC_URL: 'https://midia.folgali.exemplo', RELAY_MEDIA_S3_PREFIX: 'v/', RELAY_MEDIA_S3_REGION: 'sa-east-1' }, dir)
    assert.deepEqual(withUrl.descricao(), { destino: 's3', bucket: 'folgali-midia', prefixo: 'v/', leitura: 'url-assinada' })
    assert.equal(withUrl.s3.regiao, 'sa-east-1')
    assert.match(withUrl.readUrl('a'.repeat(64)), /^https:\/\/midia\.folgali\.exemplo\/folgali-midia\/v\/aa\/a{64}\?X-Amz-Algorithm=/)
    assert.equal(videoStorageOf({ ...env, RELAY_MEDIA_S3_PUBLIC_URL: 'https://midia.folgali.exemplo', RELAY_MEDIA_S3_SIGNED_URL_S: '0' }, dir).descricao().leitura, 'pelo-rele')
    const { RELAY_MEDIA_S3_SECRET: _outside, ...withoutSecret } = env
    assert.throws(() => videoStorageOf(withoutSecret, dir), /faltam: RELAY_MEDIA_S3_SECRET\. Sem nenhuma delas o vídeo fica no disco\./)
    assert.throws(() => videoStorageOf({ RELAY_MEDIA_S3_PREFIX: 'v/' }, dir), /só vale junto/)
    assert.throws(() => videoStorageOf({ ...env, RELAY_MEDIA_S3_PREFIX: '../fora/' }, dir), /prefixo/)
    assert.throws(() => videoStorageOf({ ...env, RELAY_MEDIA_S3_SIGNED_URL_S: 'muito' }, dir), /inteiro/)
    assert.throws(() => videoStorageOf({ ...env, RELAY_MEDIA_S3_SIGNED_URL_S: '99999' }, dir), /3600/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
