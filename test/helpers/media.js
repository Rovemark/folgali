// SPDX-License-Identifier: AGPL-3.0-or-later
// Helpers for the image tests (revision 0.5.0): synthetic PNG (valid structure, made-up pixels, no decoding),
// a world with media turned on in a temporary folder, and the gestures for uploading and publishing.
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { imageBody, crc32, createSendCredential, cleanImage } from '../../packages/protocol/src/index.js'
import { newWorld, publish, registeredRover } from './test-relay.js'

export function chunkPng(type, data = Buffer.alloc(0)) {
  const header = Buffer.alloc(8)
  header.writeUInt32BE(data.length, 0)
  header.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([header.subarray(4), data])), 0)
  return Buffer.concat([header, data, crc])
}

/**
 * Flat color PNG (8-bit RGB). `semente` changes the bytes so each image is different; `antes` and `depois` go in as chunks
 * between the IHDR and the IDAT and after the IEND (raw bytes), for the metadata and polyglot tests.
 */
export function syntheticPng({ largura: width = 4, altura: height = 4, semente: seed = 0, antes: before = [], depois: after = Buffer.alloc(0) } = {}) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const line = Buffer.alloc(1 + Math.min(width, 64) * 3, seed % 256)
  line[0] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunkPng('IHDR', ihdr),
    ...before,
    chunkPng('IDAT', deflateSync(Buffer.concat(Array.from({ length: Math.min(height, 64) }, () => line)))),
    chunkPng('IEND'),
    after
  ])
}

/** A world with media turned on in a temporary folder. Call `apagar()` at the end. */
export function worldWithMedia(options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'rover-midia-'))
  const m = newWorld({ ...options, midia: { dir, ...(options.cotaBytes ? { cotaBytes: options.cotaBytes } : {}) } })
  const files = () => readdirSync(dir, { recursive: true }).filter((f) => /[0-9a-f]{64}$/.test(f))
  return { ...m, dir, arquivos: files, rover: (o) => registeredRover(m, o), apagar: () => rmSync(dir, { recursive: true, force: true }) }
}

/** Uploads the bytes like the client: cleans them, computes the hash and signs the upload credential. Returns the relay response and the clean image. */
export function send(m, rover, bytes, { hash, t = m.relogio.agora } = {}) {
  const clean = cleanImage(bytes)
  const h = hash ?? (clean.ok ? clean.hash : '0'.repeat(64))
  const target = `/v1/midia/${h}`
  const header = createSendCredential({ chavePrivada: rover.rede.chavePrivada, uid: rover.uid, alvo: target, t })
  const uid = m.rele.midia.prepareUpload(h, { header, metodo: 'PUT', alvo: target })
  return { resposta: m.rele.midia.finishUpload(h, uid, bytes), limpa: clean }
}

/** Uploads and publishes the `imagem` object (an attachment of `alvo`, or a portrait when `alvo` is null). */
export function publishImage(m, rover, bytes, { alvo: target = null, ordem: order = target ? 0 : null, alt = 'Um quadrado verde.', corpo: body = {} } = {}) {
  const { limpa: clean } = send(m, rover, bytes)
  return publish(m, rover, 'imagem', { ...imageBody(clean, { uso: target ? 'anexo' : 'retrato', alvo: target, ordem: order, alt }), ...body })
}
