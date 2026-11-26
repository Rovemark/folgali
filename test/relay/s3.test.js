// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.11.0 (proposal 0013): the S3 client of the media store. Signature Version 4 is checked against the examples AWS publishes, and
// every operation runs against a local S3 double that verifies the signature of each request (test/helpers/test-s3.js).
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { S3Error, EMPTY_HASH, S3, signV4, signedUrlV4 } from '../../packages/relay/src/s3.js'
import { startS3 } from '../helpers/test-s3.js'

const sha = (b) => createHash('sha256').update(b).digest('hex')
const all = async (body) => { const p = []; for await (const x of body) p.push(x); return Buffer.concat(p) }

// "Examples of the complete Signature Version 4 signing process" and "Authenticating requests: using query parameters", from the
// Amazon S3 API reference. The key pair is the documented example one, not a real credential.
const AWS = { host: 'examplebucket.s3.amazonaws.com', regiao: 'us-east-1', chave: 'AKIAIOSFODNN7EXAMPLE', segredo: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', data: new Date('2013-05-24T00:00:00Z') }
const signatureOf = (headers) => /Signature=([0-9a-f]{64})$/.exec(headers.authorization)[1]

test('Signature Version 4: the five published examples come out exact', () => {
  assert.equal(signatureOf(signV4({ ...AWS, metodo: 'GET', caminho: '/test.txt', cabecalhos: { range: 'bytes=0-9' }, bodyHash: EMPTY_HASH })),
    'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41')
  assert.equal(signatureOf(signV4({
    ...AWS, metodo: 'PUT', caminho: '/test$file.text', cabecalhos: { date: 'Fri, 24 May 2013 00:00:00 GMT', 'x-amz-storage-class': 'REDUCED_REDUNDANCY' },
    bodyHash: sha('Welcome to Amazon S3.')
  })), '98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd')
  assert.equal(signatureOf(signV4({ ...AWS, metodo: 'GET', caminho: '/', consulta: [['lifecycle', '']], bodyHash: EMPTY_HASH })),
    'fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543')
  assert.equal(signatureOf(signV4({ ...AWS, metodo: 'GET', caminho: '/', consulta: [['prefix', 'J'], ['max-keys', '2']], bodyHash: EMPTY_HASH })),
    '34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7')
  assert.equal(signedUrlV4({ ...AWS, base: 'https://examplebucket.s3.amazonaws.com', caminho: '/test.txt', expiresS: 86400 }),
    'https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404')
})

test('put from a file, get whole and by range, size, delete: every request signed and accepted by the store', async () => {
  const s = await startS3()
  const dir = mkdtempSync(join(tmpdir(), 'rn-s3-'))
  try {
    const s3 = new S3({ endpoint: s.endpoint, bucket: s.bucket, chave: s.chave, segredo: s.segredo })
    await s3.check()
    const bytes = randomBytes(300_000)
    const file = join(dir, 'v.bin')
    writeFileSync(file, bytes)
    await s3.por('video/ab/abc123', { caminho: file, tamanho: bytes.length, sha256: sha(bytes), tipo: 'video/mp4' })
    assert.ok(s.objetos.get('video/ab/abc123').bytes.equals(bytes))
    assert.equal(s.objetos.get('video/ab/abc123').tipo, 'video/mp4')
    assert.equal(await s3.sizeOf('video/ab/abc123'), bytes.length)
    assert.equal(await s3.sizeOf('video/ab/nao-existe'), null)
    const integer = await s3.abrir('video/ab/abc123')
    assert.deepEqual([integer.status, integer.tamanho, integer.faixa], [200, bytes.length, null])
    assert.ok((await all(integer.corpo)).equals(bytes))
    const chunk = await s3.abrir('video/ab/abc123', { faixa: 'bytes=100-199' })
    assert.deepEqual([chunk.status, chunk.tamanho, chunk.faixa], [206, 100, `bytes 100-199/${bytes.length}`])
    assert.ok((await all(chunk.corpo)).equals(bytes.subarray(100, 200)))
    const end = await s3.abrir('video/ab/abc123', { faixa: 'bytes=-10' })
    assert.ok((await all(end.corpo)).equals(bytes.subarray(-10)))
    // bytes in memory too (the smoke script uses it)
    await s3.por('fumaca/x', { bytes: Buffer.from('oi'), tamanho: 2, sha256: sha('oi'), tipo: 'text/plain' })
    assert.equal(s.objetos.get('fumaca/x').bytes.toString(), 'oi')
    await s3.apagar('video/ab/abc123')
    assert.equal(s.objetos.has('video/ab/abc123'), false)
    await s3.apagar('video/ab/abc123') // deleting what is gone is not an error
    await assert.rejects(s3.abrir('video/ab/abc123'), (e) => e instanceof S3Error && e.status === 404 && e.operacao === 'GET')
  } finally {
    rmSync(dir, { recursive: true, force: true })
    await s.fechar()
  }
})

test('the store refuses what is wrong: another secret, bytes that are not the announced ones, a clock far away, a store that is down', async () => {
  const s = await startS3()
  try {
    const good = { endpoint: s.endpoint, bucket: s.bucket, chave: s.chave, segredo: s.segredo }
    const data = Buffer.from('conteudo')
    await assert.rejects(new S3({ ...good, segredo: 'outro-segredo-qualquer' }).por('a/b', { bytes: data, tamanho: data.length, sha256: sha(data), tipo: 'x/y' }), (e) => e.status === 403)
    await assert.rejects(new S3(good).por('a/b', { bytes: data, tamanho: data.length, sha256: sha('outra coisa'), tipo: 'x/y' }), (e) => e.status === 403)
    await assert.rejects(new S3({ ...good, agora: () => new Date(Date.now() - 3_600_000) }).sizeOf('a/b'), (e) => e.status === 403)
    await assert.rejects(new S3({ ...good, bucket: 'outro-balde' }).check(), (e) => e.status === 404)
    assert.equal(s.objetos.size, 0, 'nothing got in')
    s.failWith(507)
    await assert.rejects(new S3(good).por('a/b', { bytes: data, tamanho: data.length, sha256: sha(data), tipo: 'x/y' }), (e) => e instanceof S3Error && e.status === 507)
    s.failWith(null)
    // a store that does not answer
    await s.fechar()
    await assert.rejects(new S3(good).sizeOf('a/b'))
  } finally {
    await s.fechar().catch(() => {})
  }
})

test('presigned read: valid on the public address for its time, refused after it, absent without a public address', async () => {
  const clock = { t: Date.now() }
  const s = await startS3({ agora: () => clock.t })
  try {
    const base = { endpoint: s.endpoint, bucket: s.bucket, chave: s.chave, segredo: s.segredo, agora: () => new Date(clock.t) }
    assert.equal(new S3(base).readUrl('video/ab/abc', 300), null)
    const s3 = new S3({ ...base, publicAddress: s.endpoint })
    const data = randomBytes(1000)
    await s3.por('video/ab/abc', { bytes: data, tamanho: 1000, sha256: sha(data), tipo: 'video/webm' })
    const url = s3.readUrl('video/ab/abc', 300)
    assert.match(url, new RegExp(`^${s.endpoint}/folgali-midia/video/ab/abc\\?X-Amz-Algorithm=AWS4-HMAC-SHA256&`))
    const r = await fetch(url, { headers: { range: 'bytes=0-99' } })
    assert.equal(r.status, 206)
    assert.ok(Buffer.from(await r.arrayBuffer()).equals(data.subarray(0, 100)))
    assert.equal((await fetch(url.replace(/Signature=.{4}/, 'Signature=0000'))).status, 403)
    clock.t += 301_000
    assert.equal((await fetch(url)).status, 403, 'expired')
    assert.throws(() => s3.readUrl('video/ab/abc', 0), /validade/)
  } finally {
    await s.fechar()
  }
})

test('configuration: a bad endpoint, bucket or key name is an error at start, and the secret never shows in a printed object', () => {
  const good = { endpoint: 'https://s3.exemplo.com', bucket: 'folgali-midia', chave: 'chave', segredo: 'segredo-longo-o-bastante' }
  assert.equal(new S3(good).regiao, 'us-east-1')
  for (const [bad, error] of [
    [{ endpoint: 'ftp://s3.exemplo.com' }, /endpoint/],
    [{ endpoint: 'https://s3.exemplo.com/caminho' }, /endpoint/],
    [{ endpoint: 'https://usuario:senha@s3.exemplo.com' }, /endpoint/],
    [{ bucket: 'Com Espaço' }, /bucket/],
    [{ chave: '' }, /chave/],
    [{ segredo: 'curto' }, /segredo/],
    [{ regiao: 'US EAST' }, /região/],
    [{ publicAddress: 'midia.exemplo.com' }, /endereço público/]
  ]) assert.throws(() => new S3({ ...good, ...bad }), error)
  const s3 = new S3(good)
  assert.equal(inspect(s3, { depth: 5 }).includes(good.segredo), false)
  assert.equal(JSON.stringify(s3).includes(good.segredo), false)
  for (const key of ['../fora', '/absoluta', 'a/../b', '', 'com espaço']) assert.throws(() => s3._path(key), /chave de objeto inválida/, key)
})
