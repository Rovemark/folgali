// SPDX-License-Identifier: AGPL-3.0-or-later
// Revision 0.5.0 (proposal 0005) over real HTTP: the image routes turned off (as if they did not exist), the signed upload,
// reading with the security headers, the byte ceiling before reading the body, the lying extension and content-type, and
// administration.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  MEDIA_LIMITS, imageBody, createSendCredential, createReadCredential, mediaHash, cleanImage
} from '../../packages/protocol/src/index.js'
import * as A from '../helpers/image-samples.js'
import { chunkPng, syntheticPng } from '../helpers/media.js'
import { publish, registeredRover } from '../helpers/test-relay.js'
import { TOKEN, start } from '../helpers/test-server.js'

async function withServer(fn, { ligada: enabled = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'rover-midia-http-'))
  const s = await start({ mundo: enabled ? { midia: { dir } } : {} })
  try { await fn(s) } finally { await s.fechar(); rmSync(dir, { recursive: true, force: true }) }
}

const sendOf = (s, rover, hash, { t = s.m.relogio.agora, caminho: path = `/v1/midia/${hash}` } = {}) =>
  createSendCredential({ chavePrivada: rover.rede.chavePrivada, uid: rover.uid, alvo: path, t })

async function send(s, rover, bytes, { hash = cleanImage(bytes).hash ?? '0'.repeat(64), tipo: type = 'application/octet-stream', header } = {}) {
  return s.call('PUT', `/v1/midia/${hash}`, { bruto: bytes, cabecalhos: { 'content-type': type, authorization: header ?? sendOf(s, rover, hash) } })
}

test('off: info without midia, and PUT and GET on /v1/midia answer exactly like a path that does not exist', () => withServer(async (s) => {
  const info = await s.call('GET', '/v1/info')
  assert.equal(info.json.recursos.includes('midia'), false)
  assert.equal(info.json.recursos.includes('midia-livre'), false, '0.11.0: midia-livre is only announced with media on')
  assert.equal('midia' in info.json, false)
  const r = registeredRover(s.m)
  const clean = cleanImage(A.gps_png)
  const nonexistent = await s.call('GET', '/v1/qualquer-coisa')
  for (const [method, path, extra] of [
    ['GET', `/v1/midia/${clean.hash}`, {}],
    ['PUT', `/v1/midia/${clean.hash}`, { bruto: clean.bytes, cabecalhos: { authorization: sendOf(s, r, clean.hash) } }],
    ['GET', `/v1/admin/midia/${clean.hash}`, { cabecalhos: { authorization: `Bearer ${TOKEN}` } }],
    ['DELETE', `/v1/admin/midia/${clean.hash}`, { cabecalhos: { authorization: `Bearer ${TOKEN}` } }]
  ]) {
    const x = await s.call(method, path, extra)
    assert.equal(x.status, 404, `${method} ${path}`)
    assert.equal(x.texto, nonexistent.texto, 'the same body as a nonexistent route')
  }
}, { ligada: false }))

test('on: info announces midia with the limits; upload 201, repeated 200 duplicada, and it is served only after being published', () => withServer(async (s) => {
  const info = await s.call('GET', '/v1/info')
  assert.ok(info.json.recursos.includes('midia'))
  // 0.11.0 (proposal 0013): `midia-livre` comes along, and the block says that the image needs no approval, which types it attaches to, the
  // minimum age of an unverified account and the relay's quota (the default, 1 GiB)
  assert.ok(info.json.recursos.includes('midia-livre'))
  assert.deepEqual(info.json.midia, {
    formatos: ['jpeg', 'png', 'webp'], bytesMax: 1048576, ladoMaxPx: 4096, anexosPorPostagem: 4, altCaracteres: 280, pendenteS: 3600,
    aprovacao: false, alvosDeAnexo: ['postagem', 'resposta', 'topico', 'resposta-forum'], idadeMinimaS: 86400, cotaBytes: 1073741824
  })
  assert.equal(info.json.versaoDoRascunho, '0.11.0')
  const r = registeredRover(s.m)
  const clean = cleanImage(A.gps_jpg)
  const one = await send(s, r, A.gps_jpg)
  assert.equal(one.status, 201)
  assert.deepEqual(one.json, { estado: 'recebida', hash: clean.hash, formato: 'jpeg', largura: 16, altura: 12, bytes: clean.bytes.length })
  const two = await send(s, r, A.gps_jpg)
  assert.equal(two.status, 200)
  assert.equal(two.json.estado, 'duplicada')
  assert.equal((await s.call('GET', `/v1/midia/${clean.hash}`)).status, 404, 'uploaded, not yet published')
  const post = publish(s.m, r, 'postagem', { texto: 'Com foto.', topicos: [] }).id
  publish(s.m, r, 'imagem', imageBody(clean, { uso: 'anexo', alvo: post, ordem: 0, alt: 'Gradiente azul.' }))
  const res = await fetch(`${s.base}/v1/midia/${clean.hash}`)
  assert.equal(res.status, 200)
  const bytes = Buffer.from(await res.arrayBuffer())
  assert.ok(bytes.equals(clean.bytes))
  assert.equal(mediaHash(bytes), clean.hash)
  const h = res.headers
  assert.equal(h.get('content-type'), 'image/jpeg')
  assert.equal(h.get('x-content-type-options'), 'nosniff')
  assert.equal(h.get('content-security-policy'), "default-src 'none'; sandbox")
  assert.equal(h.get('cache-control'), 'public, max-age=300', 'short cache: an image taken down leaves the caches within minutes')
  assert.equal(h.get('etag'), `"${clean.hash}"`)
  assert.equal(h.get('content-disposition'), 'inline')
  assert.equal(h.get('cross-origin-resource-policy'), 'cross-origin')
  // the post over HTTP carries the images
  const detail = await s.call('GET', `/v1/postagens/${post}`)
  assert.equal(detail.json.imagens[0].hash, clean.hash)
  // the log has only the route pattern, never the hash
  assert.ok(s.logs.some((l) => l.rota === '/v1/midia/:hash'))
  assert.equal(JSON.stringify(s.logs).includes(clean.hash), false)
}))

test('a lying extension and content-type decide nothing: a PNG called JPEG enters as PNG; a GIF called PNG and an SVG called JPEG are 415', () => withServer(async (s) => {
  const r = registeredRover(s.m)
  const png = await send(s, r, A.gps_png, { tipo: 'image/jpeg' })
  assert.equal(png.status, 201)
  assert.equal(png.json.formato, 'png')
  const h = '3'.repeat(64)
  const gif = await send(s, r, A.anim_gif, { hash: h, tipo: 'image/png' })
  assert.equal(gif.status, 415)
  assert.equal(gif.json.erro.codigo, 'formato_nao_aceito')
  const svg = await send(s, r, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), { hash: h, tipo: 'image/jpeg' })
  assert.equal(svg.json.erro.codigo, 'formato_nao_aceito')
  const truncated = await send(s, r, cleanImage(A.gps_png).bytes.subarray(0, 50), { hash: h })
  assert.equal(truncated.json.erro.codigo, 'imagem_invalida')
  const huge = await send(s, r, syntheticPng({ largura: 4097, altura: 4097 }), { hash: h })
  assert.equal(huge.json.erro.codigo, 'dimensoes_grandes')
  const divergent = await send(s, r, A.gps_png, { hash: mediaHash(A.gps_png) })
  assert.equal(divergent.status, 422)
  assert.equal(divergent.json.erro.codigo, 'hash_divergente')
}))

/**
 * Raw PUT, to send more than the ceiling and read the response even when the relay closes the connection. With the declared size, it sends only the
 * start of the body (the relay refuses without reading); without it, it sends 1 MiB + 1 byte and waits, without finishing (the relay cuts it off at the ceiling).
 * In neither case does the client write after the relay has answered, so the response is not lost to an EPIPE.
 */
function rawPut(s, path, authorization, body, { withSize = true } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(s.base + path)
    const req = request({ hostname: url.hostname, port: url.port, path: path, method: 'PUT', agent: false, headers: { authorization: authorization, ...(withSize ? { 'content-length': body.length } : { 'transfer-encoding': 'chunked' }) } }, (res) => {
      let text = ''
      res.on('data', (p) => { text += p })
      res.on('end', () => { resolve({ status: res.statusCode, json: JSON.parse(text), connection: res.headers.connection }); req.destroy() })
    })
    req.on('error', (e) => { if (!['EPIPE', 'ECONNRESET'].includes(e.code)) reject(e) })
    req.write(withSize ? body.subarray(0, 65536) : body)
  })
}

test('1 MiB ceiling: a declared size above the ceiling is refused before reading, and a body without a size is cut off at the ceiling', () => withServer(async (s) => {
  const r = registeredRover(s.m)
  const base = syntheticPng()
  const large = syntheticPng({ antes: [chunkPng('zzZz', Buffer.alloc(MEDIA_LIMITS.bytesMax - base.length - 12 + 1, 0x61))] })
  assert.equal(large.length, MEDIA_LIMITS.bytesMax + 1)
  const h = '4'.repeat(64)
  const path = `/v1/midia/${h}`
  for (const withSize of [true, false]) {
    const x = await rawPut(s, path, sendOf(s, r, h), large, { withSize })
    assert.equal(x.status, 413, `comTamanho=${withSize}`)
    assert.equal(x.json.erro.codigo, 'imagem_grande')
    assert.equal(x.connection, 'close')
  }
  // exactly at the ceiling passes
  const atCap = syntheticPng({ antes: [chunkPng('zzZz', Buffer.alloc(MEDIA_LIMITS.bytesMax - base.length - 12, 0x61))] })
  const ok = await send(s, r, atCap)
  assert.equal(ok.status, 201)
  assert.ok(ok.json.bytes < MEDIA_LIMITS.bytesMax, 'the helper chunk was removed in the cleanup')
}))

test('credential: a read one cannot upload, one for another hash cannot upload, an expired one cannot upload, without one it cannot upload', () => withServer(async (s) => {
  const r = registeredRover(s.m)
  const clean = cleanImage(A.gps_png)
  const path = `/v1/midia/${clean.hash}`
  const cases = {
    leitura: createReadCredential({ chavePrivada: r.rede.chavePrivada, uid: r.uid, alvo: path, t: s.m.relogio.agora, metodo: 'PUT' }),
    'outro hash': sendOf(s, r, '5'.repeat(64)),
    expired: sendOf(s, r, clean.hash, { t: s.m.relogio.agora - 200 }),
    vazia: ''
  }
  for (const [name, header] of Object.entries(cases)) {
    const x = await send(s, r, A.gps_png, { header })
    assert.equal(x.status, 401, name)
    assert.equal(x.json.erro.codigo, 'envio_nao_autorizado', name)
  }
  // hash outside the format: the route answers as nonexistent
  for (const bad of ['ABC', clean.hash.toUpperCase(), '..%2F..%2Fetc%2Fpasswd', `${clean.hash}0`]) {
    const x = await s.call('GET', `/v1/midia/${bad}`)
    assert.equal(x.status, 404, bad)
  }
}))

test('admin: view any file and purge; without the credential, 404', () => withServer(async (s) => {
  const r = registeredRover(s.m)
  const clean = cleanImage(A.gps_webp)
  await send(s, r, A.gps_webp)
  const admin = { authorization: `Bearer ${TOKEN}` }
  assert.equal((await s.call('GET', `/v1/admin/midia/${clean.hash}`)).status, 401)
  const seen = await fetch(`${s.base}/v1/admin/midia/${clean.hash}`, { headers: admin })
  assert.equal(seen.status, 200)
  assert.equal(seen.headers.get('cache-control'), 'no-store')
  assert.equal(seen.headers.get('content-type'), 'image/webp')
  assert.ok(Buffer.from(await seen.arrayBuffer()).equals(clean.bytes))
  const x = await s.call('DELETE', `/v1/admin/midia/${clean.hash}`, { corpo: { motivo: 'teste de expurgo' }, cabecalhos: admin })
  assert.equal(x.status, 200)
  assert.deepEqual(x.json, { expurgado: true, objetos: 0 })
  assert.equal((await s.call('GET', `/v1/admin/midia/${clean.hash}`, { cabecalhos: admin })).status, 404)
  const from = await send(s, r, A.gps_webp)
  assert.equal(from.status, 410)
  assert.equal(from.json.erro.codigo, 'midia_recusada')
}))
