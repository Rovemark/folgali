// SPDX-License-Identifier: AGPL-3.0-or-later
// Where the bytes of a VIDEO live (0.11.0, proposal 0013). Two destinations with the same four gestures, chosen by the operator:
//
//   - DiskStorage: a folder next to the images, `<dir>/<2 hex>/<hash>` (the default: nothing to configure);
//   - S3Storage: an S3-compatible store (on folgali, its own MinIO), `<prefixo><2 hex>/<hash>`.
//
// The address is always the SHA-256 of the clean bytes, checked against ^[0-9a-f]{64}$ before it becomes a path or a key. Images
// stay where they were (media.js, on disk, read synchronously): a video is too big to be read whole into memory, so everything
// here hands over a STREAM, whole or a byte range.
import { createReadStream, existsSync, mkdirSync, renameSync, rmSync, statSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { MEDIA_HASH_RE } from '../../protocol/src/index.js'
import { S3 } from './s3.js'

const checkHash = (hash) => {
  if (typeof hash !== 'string' || !MEDIA_HASH_RE.test(hash)) throw new Error('hash de mídia inválido')
  return hash
}

/**
 * Reads a Range header against the size of the file. Only one range, in bytes: `a-b`, `a-` and `-n`.
 * @returns {{ inicio: number, fim: number } | null | 'insatisfazivel'}  null: no usable range, send the whole file
 */
export function readRange(header, total) {
  if (typeof header !== 'string') return null
  const m = /^bytes=(\d{0,15})-(\d{0,15})$/.exec(header.trim())
  if (!m || (m[1] === '' && m[2] === '')) return null
  if (m[1] === '') {
    const n = Number(m[2])
    if (n === 0) return 'insatisfazivel'
    return { inicio: Math.max(0, total - n), fim: total - 1 }
  }
  const home = Number(m[1])
  const end = m[2] === '' ? total - 1 : Math.min(Number(m[2]), total - 1)
  if (home >= total || home > end) return 'insatisfazivel'
  return { inicio: home, fim: end }
}

export class DiskStorage {
  /** @param {{ dir: string }} o */
  constructor({ dir }) {
    if (typeof dir !== 'string' || !dir) throw new Error('o depósito em disco precisa de uma pasta')
    this.nome = 'disco'
    this.dir = dir
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }

  _path(hash) { return join(this.dir, checkHash(hash).slice(0, 2), hash) }

  /** Takes the file at `caminho` (it stops existing there). */
  async guardar(hash, { caminho: path }) {
    const destination = this._path(hash)
    mkdirSync(join(destination, '..'), { recursive: true, mode: 0o700 })
    try {
      renameSync(path, destination)
    } catch (e) {
      if (e.code !== 'EXDEV') throw e
      // another filesystem: copy, then drop the original
      copyFileSync(path, destination)
      rmSync(path, { force: true })
    }
  }

  async existe(hash) { return existsSync(this._path(hash)) }

  /** @param {{ inicio: number, fim: number } | null} faixa */
  async abrir(hash, band = null) {
    const path = this._path(hash)
    if (!existsSync(path)) return null
    const total = statSync(path).size
    return { total, corpo: createReadStream(path, band ? { start: band.inicio, end: band.fim } : {}) }
  }

  async apagar(hash) { rmSync(this._path(hash), { force: true }) }

  /** A disk has no address of its own: the relay always serves the bytes itself. */
  readUrl() { return null }

  async check() { mkdirSync(this.dir, { recursive: true, mode: 0o700 }) }

  descricao() { return { destino: 'disco' } }
}

export class S3Storage {
  /**
   * @param {{ s3: S3, prefixo?: string, signedUrlS?: number }} o
   *   `signedUrlS`: with a public address on the S3, how long a presigned read lives (the relay redirects to it instead of
   *   carrying the bytes); 0 or no public address: the relay carries the bytes itself
   */
  constructor({ s3, prefixo: prefix = 'video/', signedUrlS = 300 }) {
    if (!(s3 instanceof S3)) throw new Error('o depósito S3 precisa de um cliente S3')
    if (typeof prefix !== 'string' || !/^(?:[a-z0-9][a-z0-9-]{0,30}\/){0,3}$/.test(prefix)) throw new Error('o prefixo do S3 precisa ser vazio ou pastas simples terminadas em barra, como video/')
    if (!Number.isSafeInteger(signedUrlS) || signedUrlS < 0 || signedUrlS > 3600) throw new Error('a validade da URL assinada vai de 0 (desligada) a 3600 segundos')
    this.nome = 's3'
    this.s3 = s3
    this.prefixo = prefix
    this.signedUrlS = signedUrlS
  }

  _key(hash) { return `${this.prefixo}${checkHash(hash).slice(0, 2)}/${hash}` }

  /** Sends the file at `caminho` and removes it from the disk once the store has it. */
  async guardar(hash, { caminho: path, tamanho: size, tipo: type }) {
    await this.s3.por(this._key(hash), { caminho: path, tamanho: size, sha256: hash, tipo: type })
    rmSync(path, { force: true })
  }

  async existe(hash) { return (await this.s3.sizeOf(this._key(hash))) !== null }

  async abrir(hash, band = null) {
    try {
      const r = await this.s3.abrir(this._key(hash), { faixa: band ? `bytes=${band.inicio}-${band.fim}` : null })
      return { total: null, corpo: r.corpo }
    } catch (e) {
      if (e?.status === 404) return null
      throw e
    }
  }

  async apagar(hash) { await this.s3.apagar(this._key(hash)) }

  readUrl(hash) { return this.signedUrlS > 0 ? this.s3.readUrl(this._key(hash), this.signedUrlS) : null }

  async check() { await this.s3.check() }

  descricao() { return { destino: 's3', bucket: this.s3.bucket, prefixo: this.prefixo, leitura: this.readUrl('0'.repeat(64)) ? 'url-assinada' : 'pelo-rele' } }
}

/**
 * The video store from the environment of the relay. Without `RELAY_MEDIA_S3_ENDPOINT` it is the disk (`<media folder>/video`).
 * With it, the five S3 variables are needed together; a half configuration is an error and the relay does not start.
 *
 *   RELAY_MEDIA_S3_ENDPOINT       http(s)://host[:port] of the S3 API (MinIO: the API port, not the console)
 *   RELAY_MEDIA_S3_BUCKET         the bucket (it must exist; the relay does not create it)
 *   RELAY_MEDIA_S3_REGION         region (default us-east-1, what MinIO expects)
 *   RELAY_MEDIA_S3_KEY            access key
 *   RELAY_MEDIA_S3_SECRET         secret key
 *   RELAY_MEDIA_S3_PREFIX         key prefix (default `video/`)
 *   RELAY_MEDIA_S3_PUBLIC_URL     optional: the address a browser reaches the store at; with it the relay answers a read with a
 *                                 redirect to a presigned URL instead of carrying the bytes
 *   RELAY_MEDIA_S3_SIGNED_URL_S   how long that presigned URL lives, in seconds (default 300; 0 turns the redirect off)
 * @param {Record<string, string | undefined>} env
 * @param {string} mediaDir
 */
export function videoStorageOf(env, mediaDir) {
  const s3 = ['ENDPOINT', 'BUCKET', 'KEY', 'SECRET']
  const given = s3.filter((n) => (env[`RELAY_MEDIA_S3_${n}`] ?? '') !== '')
  if (given.length === 0) {
    for (const n of ['REGION', 'PREFIX', 'PUBLIC_URL', 'SIGNED_URL_S']) {
      if ((env[`RELAY_MEDIA_S3_${n}`] ?? '') !== '') throw new Error(`RELAY_MEDIA_S3_${n} só vale junto com RELAY_MEDIA_S3_ENDPOINT, _BUCKET, _KEY e _SECRET.`)
    }
    return new DiskStorage({ dir: join(mediaDir, 'video') })
  }
  if (given.length !== s3.length) {
    throw new Error(`Para guardar vídeo no S3 faltam: ${s3.filter((n) => !given.includes(n)).map((n) => `RELAY_MEDIA_S3_${n}`).join(', ')}. Sem nenhuma delas o vídeo fica no disco.`)
  }
  const validity = env.RELAY_MEDIA_S3_SIGNED_URL_S === undefined || env.RELAY_MEDIA_S3_SIGNED_URL_S === '' ? 300 : Number(env.RELAY_MEDIA_S3_SIGNED_URL_S)
  if (!Number.isSafeInteger(validity)) throw new Error('RELAY_MEDIA_S3_SIGNED_URL_S precisa ser um número inteiro de segundos.')
  return new S3Storage({
    s3: new S3({
      endpoint: env.RELAY_MEDIA_S3_ENDPOINT, bucket: env.RELAY_MEDIA_S3_BUCKET, regiao: env.RELAY_MEDIA_S3_REGION || 'us-east-1',
      chave: env.RELAY_MEDIA_S3_KEY, segredo: env.RELAY_MEDIA_S3_SECRET, publicAddress: env.RELAY_MEDIA_S3_PUBLIC_URL || null
    }),
    prefixo: env.RELAY_MEDIA_S3_PREFIX ?? 'video/',
    signedUrlS: validity
  })
}
