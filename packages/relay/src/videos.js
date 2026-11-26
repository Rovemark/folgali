// SPDX-License-Identifier: AGPL-3.0-or-later
// Revision 0.11.0 (proposal 0013): video in the reference relay. It exists only with media on (`RELAY_MEDIA=sim`) and is announced
// as `video` in /v1/info.
//
// Rules of this layer:
//   - the BYTES never pass through memory whole: the upload is written to a temporary file with a byte ceiling while its SHA-256 is
//     computed, the container is read from that file (video.js of the protocol: headers only) and the file goes to the store
//     (storage.js: a folder, or an S3-compatible store);
//   - nothing is transcoded and no frame is decoded: the relay has no ffmpeg. The poster frame is an IMAGE the client draws and
//     uploads like any other image; the `video` object cites it by hash;
//   - the file must arrive CLEAN (no patch left by `inspectVideo`): the client cleans with `cleanVideo` before sending;
//   - an upload nobody published is served to no one and leaves in 1 hour; a file no object on air cites leaves at once;
//   - one video per publication, and a publication has images OR a video.
import { createHash, randomBytes } from 'node:crypto'
import { closeSync, createWriteStream, mkdirSync, openSync, readSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  ATTACHMENT_TARGETS, ProtocolError, MEDIA_HASH_RE, ID_RE, MEDIA_LIMITS, MODERATION_REASONS, uploadCredentialMatches, limitError, waitInWords,
  ageFactor, readUploadCredential, capWithFactor, validateText
} from '../../protocol/src/index.js'
import { VIDEO_LIMITS, VIDEO_MIME_TYPE, inspectVideo } from '../../protocol/src/video.js'
import { ROVER_VISIBLE } from './store.js'
import { readRange } from './storage.js'

/** Uploads of video by one author (accepted ones), regular and verified account. The `video` object has its own in RATE_PER_TYPE. */
export const VIDEO_UPLOAD_RATE = Object.freeze([[3600, 5], [86400, 20]])
export const VERIFIED_VIDEO_UPLOAD_RATE = Object.freeze([[60, 5], [3600, 60], [86400, 500]])

const VIDEO_SCHEMA = `
CREATE TABLE IF NOT EXISTS video_arquivos (
  hash TEXT PRIMARY KEY,
  formato TEXT NOT NULL,
  largura INTEGER NOT NULL,
  altura INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  duracao_ms INTEGER NOT NULL,
  recebido_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS video_envios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hash TEXT NOT NULL,
  uid TEXT NOT NULL,
  em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS video_envios_uid ON video_envios(uid, em);
CREATE INDEX IF NOT EXISTS video_envios_hash ON video_envios(hash, uid, em);
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  autor TEXT NOT NULL,
  hash TEXT NOT NULL,
  alvo TEXT NOT NULL,
  formato TEXT NOT NULL,
  largura INTEGER NOT NULL,
  altura INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  duracao_ms INTEGER NOT NULL,
  miniatura TEXT,
  alt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS videos_hash ON videos(hash);
CREATE INDEX IF NOT EXISTS videos_alvo ON videos(alvo);
CREATE INDEX IF NOT EXISTS videos_miniatura ON videos(miniatura);
CREATE TABLE IF NOT EXISTS video_a_apagar (
  hash TEXT PRIMARY KEY,
  desde INTEGER NOT NULL
);
`

// A `video` object is on air: it has its envelope, was not removed nor hidden, is not blocked, the author is visible and the
// publication it belongs to is on air too. Uses the aliases `v` (videos), `o` (the video object) and `r` (the author).
const LIVE_VIDEO = `
  o.envelope IS NOT NULL AND o.removido_em IS NULL AND o.oculto_em IS NULL
  AND o.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
  AND ${ROVER_VISIBLE}
  AND EXISTS (SELECT 1 FROM objetos p WHERE p.id = v.alvo AND p.envelope IS NOT NULL AND p.removido_em IS NULL
       AND p.oculto_em IS NULL AND p.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto'))`
const FROM_VIDEOS = 'FROM videos v JOIN objetos o ON o.id = v.id JOIN rovers r ON r.uid = o.autor'

/** A random-access reader over an open file descriptor (the two members `inspectVideo` asks for). */
function fileReader(fd, size) {
  return {
    tamanho: size,
    ler: (position, length) => {
      const b = Buffer.alloc(Math.max(0, Math.min(length, size - position)))
      let totalRead = 0
      while (totalRead < b.length) {
        const n = readSync(fd, b, totalRead, b.length - totalRead, position + totalRead)
        if (n === 0) break
        totalRead += n
      }
      return b.subarray(0, totalRead)
    }
  }
}

export class Videos {
  /**
   * @param {import('./relay.js').Rele} rele
   * @param {{ dir: string, deposito: import('./storage.js').DiskStorage | import('./storage.js').S3Storage, cotaBytes?: number,
   *   onFail?: (e: { operacao: string, erro: string }) => void }} o
   *   `dir`: the media folder (uploads in progress live in `<dir>/.envios`); `cotaBytes`: the ceiling of all the video kept
   */
  constructor(relay, { dir, deposito: storage, cotaBytes: quotaBytes = VIDEO_LIMITS.defaultQuotaBytes, onFail = () => {} }) {
    if (typeof dir !== 'string' || !dir) throw new Error('o vídeo precisa da pasta de mídia')
    if (!storage || typeof storage.guardar !== 'function') throw new Error('o vídeo precisa de um depósito (disco ou S3)')
    if (!Number.isSafeInteger(quotaBytes) || quotaBytes < 1) throw new Error('a cota de vídeo precisa ser um inteiro positivo de bytes')
    this.rele = relay
    this.a = relay.store
    this.deposito = storage
    this.cotaBytes = quotaBytes
    this.onFail = onFail
    this.envios = join(dir, '.envios')
    mkdirSync(this.envios, { recursive: true, mode: 0o700 })
    // a restart leaves no half upload behind
    for (const name of readdirSync(this.envios)) rmSync(join(this.envios, name), { force: true })
    this.a.db.exec(VIDEO_SCHEMA)
    this._inProgress = 0
  }

  agora() { return this.rele.relogio() }

  info() {
    return {
      formatos: ['mp4', 'webm'],
      codecs: { mp4: { video: ['h264'], audio: ['aac'] }, webm: { video: ['vp8', 'vp9', 'av1'], audio: ['opus', 'vorbis'] } },
      bytesMax: VIDEO_LIMITS.bytesMax,
      duracaoMaxS: VIDEO_LIMITS.duracaoMaxS,
      ladoMaxPx: VIDEO_LIMITS.ladoMaxPx,
      videosPorPublicacao: VIDEO_LIMITS.videosPorPublicacao,
      altCaracteres: MEDIA_LIMITS.alt.max,
      pendenteS: VIDEO_LIMITS.pendenteS,
      aprovacao: false,
      alvos: [...ATTACHMENT_TARGETS],
      cotaBytes: this.cotaBytes,
      destino: this.deposito.nome
    }
  }

  ocupado() { return this.a.um('SELECT COALESCE(SUM(bytes), 0) AS n FROM video_arquivos').n }

  _withoutQuota(taken, request) {
    const mb = (n) => `${(n / 1048576).toFixed(1)} MB`
    return new ProtocolError('cota_de_midia', { detalhe: `O relé guarda até ${mb(this.cotaBytes)} de vídeo, ${mb(taken)} estão ocupados e este arquivo tem ${mb(request)}.` })
  }

  // ====================================================================================================
  // UPLOAD
  // ====================================================================================================

  /**
   * What is checked BEFORE a byte of the body is read: credential, author, account age, rate, refused hash, declared size, quota.
   * @returns {string} the uid of who sends
   */
  prepareUpload(hash, { header, metodo: method, alvo: target, declared = null }) {
    this.rele._sync()
    const now = this.agora()
    const c = readUploadCredential(header)
    const r = c ? this.a.rover(c.uid) : null
    if (!r || r.saiu || !uploadCredentialMatches(c, { metodo: method, alvo: target, chave: r.chave, agora: now })) throw new ProtocolError('envio_nao_autorizado')
    if (this.a.bloqueado('emissor', r.emissor) || this.a.bloqueado('rover', r.uid)) throw new ProtocolError('bloqueado')
    if (now >= r.atestado_expira_em) throw new ProtocolError('atestado_vencido')
    if (!this.rele.provedor.trustedIssuers().includes(r.emissor)) throw new ProtocolError('emissor_desconhecido')
    if (this.a.revogado(r.emissor, r.uid, r.atestado_emitido_em)) throw new ProtocolError('atestado_revogado')
    const age = now - r.criado_em
    const verified = this.rele.verifiedAccount(r.emissor)
    if (!verified && age < MEDIA_LIMITS.idadeMinimaS) {
      const missing = MEDIA_LIMITS.idadeMinimaS - age
      throw new ProtocolError('conta_nova', { detalhe: `A conta envia mídia depois de ${waitInWords(MEDIA_LIMITS.idadeMinimaS)} de idade.`, retryAfterS: missing })
    }
    const factor = this.rele.semFatorDeIdade || verified ? 1 : ageFactor(age)
    for (const [windowS, rawMax] of verified ? VERIFIED_VIDEO_UPLOAD_RATE : VIDEO_UPLOAD_RATE) {
      const max = capWithFactor(rawMax, factor)
      const n = this.a.um('SELECT COUNT(*) AS n, MIN(em) AS velho FROM video_envios WHERE uid = :uid AND em > :desde', { uid: r.uid, desde: now - windowS })
      if (n.n >= max) throw limitError('limite_de_taxa', { max, janelaS: windowS, retryAfterS: n.velho + windowS - now, deQue: 'envios de vídeo' })
    }
    if (this.a.um('SELECT 1 AS x FROM midia_recusadas WHERE hash = :hash', { hash })) throw new ProtocolError('midia_recusada')
    if (declared !== null) {
      if (declared > VIDEO_LIMITS.bytesMax) throw this._tooLarge(declared)
      const has = this.a.um('SELECT 1 AS x FROM video_arquivos WHERE hash = :hash', { hash })
      if (!has && this.ocupado() + declared > this.cotaBytes) throw this._withoutQuota(this.ocupado(), declared)
    }
    return r.uid
  }

  _tooLarge(bytes) {
    return new ProtocolError('video_grande', { detalhe: `O vídeo tem ${(bytes / 1048576).toFixed(1)} MB e o máximo é ${VIDEO_LIMITS.bytesMax / 1048576} MB.` })
  }

  /**
   * Receives the body: writes it to a temporary file with a byte ceiling, computing the SHA-256 on the way. Resolves with the file
   * and what was measured; rejects (and removes the file) when the body passes the ceiling or the connection breaks.
   * @param {import('node:stream').Readable} corpo
   * @returns {Promise<{ caminho: string, bytes: number, sha256: string }>}
   */
  receive(body) {
    const path = join(this.envios, `${randomBytes(12).toString('hex')}.tmp`)
    const output = createWriteStream(path, { mode: 0o600, flags: 'wx' })
    const summary = createHash('sha256')
    let total = 0
    this._inProgress++
    return new Promise((ok, failed) => {
      let isOver = false
      const end = (error, value) => {
        if (isOver) return
        isOver = true
        this._inProgress--
        if (error) {
          output.destroy()
          rmSync(path, { force: true })
          failed(error)
        } else ok(value)
      }
      body.on('data', (p) => {
        if (isOver) return
        total += p.length
        if (total > VIDEO_LIMITS.bytesMax) {
          body.pause()
          return end(this._tooLarge(total))
        }
        summary.update(p)
        if (!output.write(p)) {
          body.pause()
          output.once('drain', () => body.resume())
        }
      })
      body.on('end', () => { if (!isOver) output.end(() => end(null, { caminho: path, bytes: total, sha256: summary.digest('hex') })) })
      body.on('error', () => end(new ProtocolError('video_invalido', { detalhe: 'O envio foi interrompido.' })))
      body.on('aborted', () => end(new ProtocolError('video_invalido', { detalhe: 'O envio foi interrompido.' })))
      output.on('error', () => end(new ProtocolError('erro_interno')))
    })
  }

  /**
   * After the body is on disk: the address is the SHA-256 of what arrived, the container is read and must be clean, the quota is
   * checked again with the real size, and the file goes to the store. Two equal uploads are one file.
   * @returns {Promise<{ estado: 'recebida' | 'duplicada', hash: string, formato: string, largura: number, altura: number, bytes: number, duracaoMs: number }>}
   */
  async finishUpload(hash, uid, { caminho: path, bytes, sha256 }) {
    try {
      if (sha256 !== hash) throw new ProtocolError('hash_divergente', { campo: 'hash', detalhe: 'O SHA-256 dos bytes enviados não é o hash do endereço. Limpe com a função do protocolo e calcule o hash da saída.' })
      const fd = openSync(path, 'r')
      let v
      try {
        v = inspectVideo(fileReader(fd, statSync(path).size))
      } finally {
        closeSync(fd)
      }
      if (!v.ok) throw new ProtocolError(v.codigo, { detalhe: `Motivo: ${v.detalhe}.` })
      if (v.patches.length) throw new ProtocolError('video_invalido', { detalhe: 'O vídeo chegou com metadado (data, lugar, etiquetas). Limpe com a função do protocolo antes de enviar.' })
      const reply = { hash, formato: v.formato, largura: v.largura, altura: v.altura, bytes, duracaoMs: v.duracaoMs }
      const now = this.agora()
      if (this.a.um('SELECT 1 AS x FROM midia_recusadas WHERE hash = :hash', { hash })) throw new ProtocolError('midia_recusada')
      const existing = this.a.um('SELECT hash FROM video_arquivos WHERE hash = :hash', { hash })
      if (existing && await this.deposito.existe(hash)) {
        rmSync(path, { force: true })
        this.a.executar('DELETE FROM video_a_apagar WHERE hash = :hash', { hash })
        this.a.executar('INSERT INTO video_envios (hash, uid, em) VALUES (:hash, :uid, :agora)', { hash, uid, agora: now })
        return { estado: 'duplicada', ...reply }
      }
      const taken = this.ocupado()
      if (taken + bytes > this.cotaBytes) throw this._withoutQuota(taken, bytes)
      try {
        await this.deposito.guardar(hash, { caminho: path, tamanho: bytes, tipo: VIDEO_MIME_TYPE[v.formato] })
      } catch (e) {
        this.onFail({ operacao: 'guardar', erro: e?.name ?? 'Error' })
        // a store that is full answers 507: say it as the quota, with what the operator can do
        if (e?.status === 507) throw new ProtocolError('cota_de_midia', { detalhe: 'O armazenamento de vídeo respondeu que não tem espaço.' })
        throw new ProtocolError('rele_indisponivel', { detalhe: 'O armazenamento de vídeo não respondeu.', retryAfterS: 30 })
      }
      this.a.transaction(() => {
        this.a.executar('DELETE FROM video_a_apagar WHERE hash = :hash', { hash })
        this.a.executar(
          `INSERT OR REPLACE INTO video_arquivos (hash, formato, largura, altura, bytes, duracao_ms, recebido_em)
           VALUES (:hash, :formato, :largura, :altura, :bytes, :duracaoMs, :agora)`,
          { ...reply, agora: now }
        )
        this.a.executar('INSERT INTO video_envios (hash, uid, em) VALUES (:hash, :uid, :agora)', { hash, uid, agora: now })
      })
      return { estado: 'recebida', ...reply }
    } finally {
      rmSync(path, { force: true })
    }
  }

  // ====================================================================================================
  // THE `video` OBJECT
  // ====================================================================================================

  /** Rules of the `video` type. Returns the effect relay.js stores (the envelope stays: a video is content). */
  regras(obj, now) {
    const c = obj.corpo
    if (this.a.um('SELECT 1 AS x FROM midia_recusadas WHERE hash = :hash', { hash: c.hash })) throw new ProtocolError('midia_recusada', { campo: 'objeto.corpo.hash' })
    const uploaded = this.a.um('SELECT 1 AS x FROM video_envios WHERE hash = :hash AND uid = :uid AND em > :desde', { hash: c.hash, uid: obj.autor, desde: now - VIDEO_LIMITS.pendenteS })
    const file = this.a.um('SELECT * FROM video_arquivos WHERE hash = :hash', { hash: c.hash })
    if (!uploaded || !file) throw new ProtocolError('midia_ausente', { campo: 'objeto.corpo.hash', detalhe: 'Envie o vídeo (PUT /v1/video/:hash) e publique o objeto em até 1 hora.' })
    for (const [field, column] of [['formato', 'formato'], ['largura', 'largura'], ['altura', 'altura'], ['bytes', 'bytes'], ['duracaoMs', 'duracao_ms']]) {
      if (file[column] !== c[field]) throw new ProtocolError('hash_divergente', { campo: `objeto.corpo.${field}`, detalhe: `O campo ${field} não descreve o arquivo enviado.` })
    }
    const p = this.a.objeto(c.alvo)
    if (!p || !ATTACHMENT_TARGETS.includes(p.tipo) || this.a.bloqueado('objeto', p.id)) throw new ProtocolError('alvo_desconhecido', { campo: 'objeto.corpo.alvo', detalhe: `O vídeo aponta para um destes: ${ATTACHMENT_TARGETS.join(', ')}.` })
    if (p.removido_em !== null || p.oculto_em !== null) throw new ProtocolError('alvo_removido', { campo: 'objeto.corpo.alvo' })
    if (p.autor !== obj.autor) throw new ProtocolError('sem_permissao', { campo: 'objeto.corpo.alvo', detalhe: 'Só o autor anexa vídeo ao que publicou.' })
    if (this.a.um(`SELECT 1 AS x FROM videos v JOIN objetos o ON o.id = v.id WHERE v.alvo = :alvo AND o.envelope IS NOT NULL AND o.removido_em IS NULL`, { alvo: p.id })) {
      throw new ProtocolError('limite_de_estrutura', { campo: 'objeto.corpo.alvo', detalhe: 'Cada publicação leva um vídeo só. Remova o que está lá antes de pôr outro.' })
    }
    if (this.a.um(`SELECT 1 AS x FROM imagens i JOIN objetos o ON o.id = i.id WHERE i.alvo = :alvo AND o.envelope IS NOT NULL AND o.removido_em IS NULL`, { alvo: p.id })) {
      throw new ProtocolError('limite_de_estrutura', { campo: 'objeto.corpo.alvo', detalhe: 'Uma publicação leva até 4 imagens ou 1 vídeo, não os dois.' })
    }
    if (c.miniatura !== null) {
      // the poster is an image this author uploaded in the last hour (or one already kept); it is cited by the video from now on
      const image = this.a.um('SELECT 1 AS x FROM midia WHERE hash = :hash', { hash: c.miniatura })
      const hers = this.a.um('SELECT 1 AS x FROM midia_envios WHERE hash = :hash AND uid = :uid AND em > :desde', { hash: c.miniatura, uid: obj.autor, desde: now - MEDIA_LIMITS.pendenteS })
      if (!image || !hers) throw new ProtocolError('midia_ausente', { campo: 'objeto.corpo.miniatura', detalhe: 'Envie a imagem da miniatura (PUT /v1/midia/:hash) antes de publicar o vídeo.' })
      if (this.a.um('SELECT 1 AS x FROM midia_recusadas WHERE hash = :hash', { hash: c.miniatura })) throw new ProtocolError('midia_recusada', { campo: 'objeto.corpo.miniatura' })
    }
    return {
      alvo: c.alvo,
      depois: () => {
        this.a.executar(
          `INSERT INTO videos (id, autor, hash, alvo, formato, largura, altura, bytes, duracao_ms, miniatura, alt)
           VALUES (:id, :autor, :hash, :alvo, :formato, :largura, :altura, :bytes, :duracaoMs, :miniatura, :alt)`,
          { id: obj.id, autor: obj.autor, hash: c.hash, alvo: c.alvo, formato: c.formato, largura: c.largura, altura: c.altura, bytes: c.bytes, duracaoMs: c.duracaoMs, miniatura: c.miniatura, alt: c.alt }
        )
      }
    }
  }

  /** Does a live video sit on this publication? (an image cannot be attached next to it) */
  hasVideo(target) {
    return this.a.um('SELECT 1 AS x FROM videos v JOIN objetos o ON o.id = v.id WHERE v.alvo = :alvo AND o.envelope IS NOT NULL AND o.removido_em IS NULL', { alvo: target }) !== null
  }

  /** Is this image hash the poster of a video on air? (the image routes serve it and the image collector keeps it) */
  isThumbnailLive(hash, now) {
    return this.a.um(`SELECT 1 AS x ${FROM_VIDEOS} WHERE v.miniatura = :hash AND ${LIVE_VIDEO} LIMIT 1`, { hash, ...this.rele._visibilityParams(now) }) !== null
  }

  /** Withdraws `video` objects (as if the author removed them): the envelope goes, the trace stays. */
  _withdraw(ids, now) {
    for (const id of ids) {
      this.a.executar('UPDATE objetos SET envelope = NULL, removido_em = COALESCE(removido_em, :agora) WHERE id = :id', { id, agora: now })
      this.a.executar('DELETE FROM videos WHERE id = :id', { id })
      this.a.executar('DELETE FROM denuncias WHERE alvo = :id', { id })
    }
  }

  /** The author removed something: a publication takes its video with it; a removed `video` object leaves the table. */
  onRemove(targetRow, now) {
    if (ATTACHMENT_TARGETS.includes(targetRow?.tipo)) this._withdraw(this.a.todos('SELECT id FROM videos WHERE alvo = :id', { id: targetRow.id }).map((l) => l.id), now)
    if (targetRow?.tipo === 'video') this.a.executar('DELETE FROM videos WHERE id = :id', { id: targetRow.id })
  }

  // ====================================================================================================
  // CLEANING
  // ====================================================================================================

  /**
   * Marks what became an orphan (the synchronous half, inside or right after a write): the read copy of an object without envelope
   * goes, and a file no object cites and nobody uploaded in the last hour is queued to leave the store. Returns how many were queued.
   */
  markOrphans(now = this.agora()) {
    this.a.executar('DELETE FROM videos WHERE NOT EXISTS (SELECT 1 FROM objetos o WHERE o.id = videos.id AND o.envelope IS NOT NULL)')
    const orphans = this.a.todos(
      `SELECT hash FROM video_arquivos a WHERE NOT EXISTS (SELECT 1 FROM videos v WHERE v.hash = a.hash)
         AND NOT EXISTS (SELECT 1 FROM video_envios e WHERE e.hash = a.hash AND e.em > :desde)`,
      { desde: now - VIDEO_LIMITS.pendenteS }
    )
    for (const { hash } of orphans) this._enqueue(hash, now)
    this.a.executar('DELETE FROM video_envios WHERE em <= :corte', { corte: now - 86400 })
    return orphans.length
  }

  /** The file stops counting and stops being served NOW; its bytes leave the store in `esvaziar`. */
  _enqueue(hash, now) {
    this.a.executar('DELETE FROM video_arquivos WHERE hash = :hash', { hash })
    this.a.executar('INSERT OR IGNORE INTO video_a_apagar (hash, desde) VALUES (:hash, :agora)', { hash, agora: now })
  }

  /**
   * Deletes from the store what is queued (the asynchronous half). A store that does not answer keeps the line for the next round:
   * nothing is forgotten, and the operator sees how many are waiting in /v1/admin.
   * @returns {Promise<{ apagados: number, pendentes: number }>}
   */
  async drain() {
    let deleted = 0
    for (const { hash } of this.a.todos('SELECT hash FROM video_a_apagar ORDER BY desde LIMIT 200')) {
      // a new upload of the same bytes took the file back: it stays
      if (this.a.um('SELECT 1 AS x FROM video_arquivos WHERE hash = :hash', { hash })) {
        this.a.executar('DELETE FROM video_a_apagar WHERE hash = :hash', { hash })
        continue
      }
      try {
        await this.deposito.apagar(hash)
        this.a.executar('DELETE FROM video_a_apagar WHERE hash = :hash', { hash })
        deleted++
      } catch (e) {
        this.onFail({ operacao: 'apagar', erro: e?.name ?? 'Error' })
        break
      }
    }
    return { apagados: deleted, pendentes: this.a.um('SELECT COUNT(*) AS n FROM video_a_apagar').n }
  }

  /** Both halves, for the periodic cleaning and for the tests. */
  async collect(now = this.agora()) {
    this.markOrphans(now)
    return this.drain()
  }

  // ====================================================================================================
  // READ
  // ====================================================================================================

  /**
   * Opens a video some object on air cites, whole or a byte range. Any other case is `nao_encontrado`, the same (the route is not a
   * probe). With a store that has a public address the answer is a short-lived presigned URL instead of the bytes.
   * @param {string} hash
   * @param {string | undefined} rangeHeader  the Range header of the request
   * @returns {Promise<{ redirecionar: string } | { status: 200 | 206 | 416, tipo: string, total: number, inicio: number, fim: number, corpo: import('node:stream').Readable | null }>}
   */
  async abrir(hash, rangeHeader, { asOperator = false } = {}) {
    this.rele._sync()
    if (!MEDIA_HASH_RE.test(hash)) throw new ProtocolError('nao_encontrado')
    const now = this.agora()
    const file = this.a.um('SELECT * FROM video_arquivos WHERE hash = :hash', { hash })
    if (!file) throw new ProtocolError('nao_encontrado')
    if (!asOperator) {
      const visible = this.a.um(`SELECT 1 AS x ${FROM_VIDEOS} WHERE v.hash = :hash AND ${LIVE_VIDEO} LIMIT 1`, { hash, ...this.rele._visibilityParams(now) })
      if (!visible) throw new ProtocolError('nao_encontrado')
      const url = this.deposito.readUrl(hash)
      if (url) return { redirect: url }
    }
    const type = VIDEO_MIME_TYPE[file.formato]
    const total = file.bytes
    const band = readRange(rangeHeader, total)
    if (band === 'insatisfazivel') return { status: 416, tipo: type, total, inicio: 0, fim: 0, corpo: null }
    let open
    try {
      open = await this.deposito.abrir(hash, band)
    } catch (e) {
      this.onFail({ operacao: 'abrir', erro: e?.name ?? 'Error' })
      throw new ProtocolError('rele_indisponivel', { detalhe: 'O armazenamento de vídeo não respondeu.', retryAfterS: 30 })
    }
    if (!open) throw new ProtocolError('nao_encontrado')
    return { status: band ? 206 : 200, tipo: type, total, inicio: band ? band.inicio : 0, fim: band ? band.fim : total - 1, corpo: open.corpo }
  }

  /** The video on air of a publication, or null. */
  videoOf(target, now) {
    const v = this.a.um(`SELECT v.* ${FROM_VIDEOS} WHERE v.alvo = :alvo AND ${LIVE_VIDEO} ORDER BY o.seq DESC LIMIT 1`, { alvo: target, ...this.rele._visibilityParams(now) })
    if (!v) return null
    const mini = v.miniatura ? this.a.um('SELECT hash, formato, largura, altura FROM midia WHERE hash = :hash', { hash: v.miniatura }) : null
    return {
      id: v.id, hash: v.hash, formato: v.formato, largura: v.largura, altura: v.altura, bytes: v.bytes, duracaoMs: v.duracao_ms, alt: v.alt,
      miniatura: mini ? { hash: mini.hash, formato: mini.formato, largura: mini.largura, altura: mini.altura } : null
    }
  }

  /** The extra field of an item that carries attachments: `video`, only when there is one. */
  itemExtra(line, now) {
    if (!ATTACHMENT_TARGETS.includes(line.tipo)) return {}
    const video = this.videoOf(line.id, now)
    return video ? { video } : {}
  }

  // ====================================================================================================
  // ADMINISTRATION
  // ====================================================================================================

  /** Does this hash or object id name a video kept here? (the admin route asks before sending it to the image purge) */
  knows(target) {
    if (ID_RE.test(target)) return this.a.um('SELECT 1 AS x FROM videos WHERE id = :id', { id: target }) !== null
    return MEDIA_HASH_RE.test(target) && this.a.um('SELECT 1 AS x FROM video_arquivos WHERE hash = :hash', { hash: target }) !== null
  }

  /**
   * Purge: the file leaves the store, the objects that cite it are withdrawn and the hash is kept as refused (a new upload gets
   * `midia_recusada`). Takes the hash or the id of the `video` object (the id is what a report brings). Every removal goes to the
   * moderation log with the public reason given, or `outro`, and the publication is marked as having lost an attachment.
   */
  purge(target, body) {
    const byId = ID_RE.test(target) ? this.a.um('SELECT hash FROM videos WHERE id = :id', { id: target }) : null
    const hash = byId ? byId.hash : target
    if (!MEDIA_HASH_RE.test(hash)) throw new ProtocolError('nao_encontrado')
    const { motivo: reason, motivoPublico: publicReason, ...rest } = body ?? {}
    const m = validateText(reason, { min: 1, max: 200 })
    if (m || Object.keys(rest).length) throw new ProtocolError('esquema', { campo: 'motivo', detalhe: m ? `Campo motivo: ${m}.` : 'Informe só motivo e, se quiser, motivoPublico.' })
    if (publicReason !== undefined && !MODERATION_REASONS.includes(publicReason)) {
      throw new ProtocolError('esquema', { campo: 'motivoPublico', detalhe: `Campo motivoPublico: um destes: ${MODERATION_REASONS.join(', ')}.` })
    }
    const now = this.agora()
    let n = 0
    this.a.transaction(() => {
      const objects = this.a.todos('SELECT v.id, v.alvo, o.autor FROM videos v JOIN objetos o ON o.id = v.id WHERE v.hash = :hash', { hash })
      n = objects.length
      for (const o of objects) {
        this.a.executar('INSERT OR REPLACE INTO anexos_removidos (id, alvo, em, motivo) VALUES (:id, :alvo, :agora, :motivo)', { id: o.id, alvo: o.alvo, agora: now, motivo: publicReason ?? 'outro' })
        this.rele.social.recordModeration({ em: now, escopo: 'rele', contexto: null, acao: 'remocao', alvoTipo: 'video', alvo: o.id, autorDoAlvo: o.autor, motivo: publicReason ?? 'outro', papel: 'rele', por: null })
      }
      this._withdraw(objects.map((o) => o.id), now)
      this.a.executar('INSERT OR REPLACE INTO midia_recusadas (hash, em, motivo) VALUES (:hash, :agora, :motivo)', { hash, agora: now, motivo: reason })
      this.a.executar('DELETE FROM video_envios WHERE hash = :hash', { hash })
      this._enqueue(hash, now)
    })
    return { expurgado: true, objetos: n }
  }

  /** What the operator sees: where the video lives, how much is taken and how many files wait to leave the store. */
  estado() {
    return {
      ...this.deposito.descricao(),
      cotaBytes: this.cotaBytes,
      usedBytes: this.ocupado(),
      arquivos: this.a.um('SELECT COUNT(*) AS n FROM video_arquivos').n,
      toDelete: this.a.um('SELECT COUNT(*) AS n FROM video_a_apagar').n,
      uploadsInProgress: this._inProgress
    }
  }
}
