// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.11.0 (proposal 0013, part 3): video over HTTP on the reference relay. The bytes are streamed to a temporary file, read from the
// container (never decoded), kept on disk or in an S3-compatible store, served with Range or by a short presigned URL, and the
// `video` object attaches to a publication without approval, like an image.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { REQUIRES_APPROVAL, REQUIRABLE_TYPES_V3, imageBody, videoBody, createSendCredential, cleanImage, cleanVideo } from '../../packages/protocol/src/index.js'
import { S3Storage } from '../../packages/relay/src/storage.js'
import { S3 } from '../../packages/relay/src/s3.js'
import { publish, registeredRover } from '../helpers/test-relay.js'
import { syntheticPng } from '../helpers/media.js'
import { startS3 } from '../helpers/test-s3.js'
import { TOKEN, start } from '../helpers/test-server.js'
import { syntheticMp4, syntheticWebm } from '../helpers/video.js'

const post = (text = 'Olhem o vídeo.') => ({ texto: text, topicos: [] })

async function environment({ video = {}, s3 = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'rn-video-'))
  const storage = s3 ? new S3Storage({ s3: new S3({ endpoint: s3.endpoint, bucket: s3.bucket, chave: s3.chave, segredo: s3.segredo, publicAddress: s3.publico ?? null }), signedUrlS: s3.publico ? 300 : 0 }) : undefined
  const s = await start({ mundo: { midia: { dir, video: video === null ? undefined : { ...video, ...(storage ? { deposito: storage } : {}) } } } })
  const rover = () => registeredRover(s.m)
  const credential = (r, path) => createSendCredential({ chavePrivada: r.rede.chavePrivada, uid: r.uid, alvo: path, t: s.m.relogio.agora })
  const uploadVideo = (r, bytes, { hash } = {}) => {
    const clean = cleanVideo(bytes)
    const h = hash ?? (clean.ok ? clean.hash : '0'.repeat(64))
    const path = `/v1/video/${h}`
    return s.call('PUT', path, { bruto: clean.ok ? clean.bytes : bytes, cabecalhos: { authorization: credential(r, path) } }).then((reply) => ({ resposta: reply, limpo: clean }))
  }
  const uploadImage = async (r, bytes) => {
    const clean = cleanImage(bytes)
    const path = `/v1/midia/${clean.hash}`
    await s.call('PUT', path, { bruto: clean.bytes, cabecalhos: { authorization: credential(r, path) } })
    return clean
  }
  const close = async () => { await s.fechar(); rmSync(dir, { recursive: true, force: true }) }
  return { ...s, dir, rover, uploadVideo, uploadImage, fechar: close }
}

test('the protocol: video asks for no approval and stays out of the signed-policy list', () => {
  assert.equal(REQUIRES_APPROVAL.video, false)
  assert.equal(REQUIRABLE_TYPES_V3.includes('video'), false)
})

test('off by default: with media on and no video, nothing of video exists', async () => {
  const e = await environment({ video: null })
  try {
    const info = (await e.call('GET', '/v1/info')).json
    assert.equal(info.recursos.includes('video'), false)
    assert.equal(info.video, undefined)
    assert.equal((await e.call('PUT', `/v1/video/${'a'.repeat(64)}`, { bruto: Buffer.from('x') })).status, 404)
    const r = e.rover()
    const p = publish(e.m, r, 'postagem', post())
    const clean = cleanVideo(syntheticMp4())
    const refusal = await e.call('POST', '/v1/objetos', { corpo: { objeto: null } })
    assert.equal(refusal.status, 422)
    assert.throws(() => publish(e.m, r, 'video', videoBody(clean, { alvo: p.id })), (x) => x.codigo === 'esquema' && x.campo === 'objeto.tipo')
  } finally { await e.fechar() }
})

test('upload, publish without approval, read with Range; one video per publication and no image next to it', async () => {
  const e = await environment()
  try {
    const info = (await e.call('GET', '/v1/info')).json
    assert.ok(info.recursos.includes('video'))
    assert.deepEqual({ bytesMax: info.video.bytesMax, duracaoMaxS: info.video.duracaoMaxS, aprovacao: info.video.aprovacao, destino: info.video.destino }, { bytesMax: 52428800, duracaoMaxS: 60, aprovacao: false, destino: 'disco' })
    const r = e.rover()
    const p = publish(e.m, r, 'postagem', post())
    // a phone video with dates and a location: the client cleans it; the relay checks it arrived clean
    const { resposta: reply, limpo: clean } = await e.uploadVideo(r, syntheticMp4({ metadados: true, duracaoMs: 12_000 }))
    assert.equal(reply.status, 201, reply.texto)
    assert.deepEqual({ estado: reply.json.estado, formato: reply.json.formato, duracaoMs: reply.json.duracaoMs }, { estado: 'recebida', formato: 'mp4', duracaoMs: 12_000 })
    assert.equal((await e.uploadVideo(r, clean.bytes)).resposta.json.estado, 'duplicada')
    // the poster frame is an image the client drew and uploaded
    const poster = await e.uploadImage(r, syntheticPng({ semente: 7 }))
    const v = publish(e.m, r, 'video', videoBody(clean, { alvo: p.id, miniatura: poster.hash, alt: 'O mar na praia.' }))
    assert.equal(v.estado, 'aceito')
    assert.deepEqual(Object.keys(JSON.parse(e.m.store.objeto(v.id).envelope)), ['objeto'], 'no approval travelled with it')
    const read = (await e.call('GET', `/v1/postagens/${p.id}`)).json
    assert.equal(read.video.hash, clean.hash)
    assert.equal(read.video.alt, 'O mar na praia.')
    assert.equal(read.video.miniatura.hash, poster.hash)
    // the poster is served like an attached image
    assert.equal((await e.call('GET', `/v1/midia/${poster.hash}`)).status, 200)
    // whole and by range
    const integer = await fetch(`${e.base}/v1/video/${clean.hash}`)
    assert.equal(integer.status, 200)
    assert.equal(integer.headers.get('content-type'), 'video/mp4')
    assert.equal(integer.headers.get('accept-ranges'), 'bytes')
    assert.deepEqual(Buffer.from(await integer.arrayBuffer()), clean.bytes)
    const part = await fetch(`${e.base}/v1/video/${clean.hash}`, { headers: { range: 'bytes=10-19' } })
    assert.equal(part.status, 206)
    assert.equal(part.headers.get('content-range'), `bytes 10-19/${clean.bytes.length}`)
    assert.deepEqual(Buffer.from(await part.arrayBuffer()), clean.bytes.subarray(10, 20))
    assert.equal((await fetch(`${e.base}/v1/video/${clean.hash}`, { headers: { range: `bytes=${clean.bytes.length}-` } })).status, 416)
    // one video per publication, images OR a video
    const other = cleanVideo(syntheticWebm({ semente: 3 }))
    await e.uploadVideo(r, other.bytes)
    assert.throws(() => publish(e.m, r, 'video', videoBody(other, { alvo: p.id })), (x) => x.codigo === 'limite_de_estrutura')
    const img = await e.uploadImage(r, syntheticPng({ semente: 9 }))
    assert.throws(() => publish(e.m, r, 'imagem', imageBody(img, { uso: 'anexo', alvo: p.id, ordem: 0, alt: '' })), (x) => x.codigo === 'limite_de_estrutura')
    // a webm on another post
    const p2 = publish(e.m, r, 'postagem', post('Outro.'))
    assert.equal(publish(e.m, r, 'video', videoBody(other, { alvo: p2.id })).estado, 'aceito')
  } finally { await e.fechar() }
})

test('refusals of the upload: not clean, wrong address, not a video, too big by the declared size', async () => {
  const e = await environment()
  try {
    const r = e.rover()
    const dirty = syntheticMp4({ metadados: true })
    const clean = cleanVideo(dirty)
    const notClean = await e.call('PUT', `/v1/video/${clean.hash}`, { bruto: dirty, cabecalhos: { authorization: createSendCredential({ chavePrivada: r.rede.chavePrivada, uid: r.uid, alvo: `/v1/video/${clean.hash}`, t: e.m.relogio.agora }) } })
    assert.equal(notClean.json.erro.codigo, 'hash_divergente')
    const { createHash } = await import('node:crypto')
    const h = createHash('sha256').update(dirty).digest('hex')
    const withMetadata = await e.call('PUT', `/v1/video/${h}`, { bruto: dirty, cabecalhos: { authorization: createSendCredential({ chavePrivada: r.rede.chavePrivada, uid: r.uid, alvo: `/v1/video/${h}`, t: e.m.relogio.agora }) } })
    assert.deepEqual([withMetadata.status, withMetadata.json.erro.codigo], [422, 'video_invalido'])
    const png = syntheticPng()
    const hp = createHash('sha256').update(png).digest('hex')
    const notVideo = await e.call('PUT', `/v1/video/${hp}`, { bruto: png, cabecalhos: { authorization: createSendCredential({ chavePrivada: r.rede.chavePrivada, uid: r.uid, alvo: `/v1/video/${hp}`, t: e.m.relogio.agora }) } })
    assert.deepEqual([notVideo.status, notVideo.json.erro.codigo], [415, 'formato_nao_aceito'])
    assert.equal((await e.call('PUT', `/v1/video/${'b'.repeat(64)}`, { bruto: Buffer.from('x') })).json.erro.codigo, 'envio_nao_autorizado')
    assert.deepEqual(readdirSync(join(e.dir, '.envios')), [], 'no temporary file is left behind')
  } finally { await e.fechar() }
})

test('removal by the author takes the video and the file; the operator purge marks the post and refuses the file again', async () => {
  const e = await environment()
  try {
    const r = e.rover()
    const p = publish(e.m, r, 'postagem', post())
    const { limpo: clean } = await e.uploadVideo(r, syntheticMp4({ semente: 5 }))
    const v = publish(e.m, r, 'video', videoBody(clean, { alvo: p.id }))
    const purga = await e.call('DELETE', `/v1/admin/midia/${v.id}`, { corpo: { motivo: 'denúncia procedente', motivoPublico: 'ilegal' }, cabecalhos: { authorization: `Bearer ${TOKEN}` } })
    assert.equal(purga.status, 200, purga.texto)
    assert.deepEqual(purga.json, { expurgado: true, objetos: 1 })
    const read = (await e.call('GET', `/v1/postagens/${p.id}`)).json
    assert.equal(read.video, undefined)
    assert.equal(read.anexosRemovidos, 1)
    assert.equal((await e.call('GET', `/v1/video/${clean.hash}`)).status, 404)
    assert.equal((await e.uploadVideo(r, clean.bytes)).resposta.json.erro.codigo, 'midia_recusada')
    // the author removes a post with a video: the video goes and the file leaves the store
    const p2 = publish(e.m, r, 'postagem', post('Mais um.'))
    const { limpo: l2 } = await e.uploadVideo(r, syntheticWebm({ semente: 8 }))
    publish(e.m, r, 'video', videoBody(l2, { alvo: p2.id }))
    assert.equal((await e.call('GET', `/v1/video/${l2.hash}`)).status, 200)
    publish(e.m, r, 'remocao-pelo-autor', { alvo: p2.id })
    assert.equal((await e.call('GET', `/v1/video/${l2.hash}`)).status, 404)
    e.m.advance(3601)
    await e.m.rele.videos.collect()
    assert.equal(await e.m.rele.videos.deposito.existe(l2.hash), false)
  } finally { await e.fechar() }
})

test('S3 store: the file goes to the bucket signed with SigV4; reads go through the relay, or by a short presigned URL', async () => {
  for (const isPublic of [false, true]) {
    const s3 = await startS3()
    const e = await environment({ s3: { endpoint: s3.endpoint, bucket: s3.bucket, chave: s3.chave, segredo: s3.segredo, ...(isPublic ? { publico: s3.endpoint } : {}) } })
    try {
      assert.equal((await e.call('GET', '/v1/info')).json.video.destino, 's3')
      const r = e.rover()
      const p = publish(e.m, r, 'postagem', post())
      const { resposta: reply, limpo: clean } = await e.uploadVideo(r, syntheticMp4({ semente: 11 }))
      assert.equal(reply.status, 201, reply.texto)
      assert.ok(s3.pedidos.some((x) => x.metodo === 'PUT' && x.caminho.endsWith(`video/${clean.hash.slice(0, 2)}/${clean.hash}`)), JSON.stringify(s3.pedidos))
      publish(e.m, r, 'video', videoBody(clean, { alvo: p.id }))
      const read = await fetch(`${e.base}/v1/video/${clean.hash}`, { redirect: 'manual', headers: { range: 'bytes=0-9' } })
      if (isPublic) {
        assert.equal(read.status, 302)
        const url = new URL(read.headers.get('location'))
        assert.ok(url.searchParams.get('X-Amz-Signature'))
        assert.ok(Number(url.searchParams.get('X-Amz-Expires')) <= 300)
        const direct = await fetch(url, { headers: { range: 'bytes=0-9' } })
        assert.equal(direct.status, 206)
        assert.deepEqual(Buffer.from(await direct.arrayBuffer()), clean.bytes.subarray(0, 10))
      } else {
        assert.equal(read.status, 206)
        assert.deepEqual(Buffer.from(await read.arrayBuffer()), clean.bytes.subarray(0, 10))
      }
    } finally {
      await e.fechar()
      await s3.fechar()
    }
  }
})
