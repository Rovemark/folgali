// SPDX-License-Identifier: AGPL-3.0-or-later
// Revision 0.5.0 (proposal 0005): images in the reference relay. It only exists when the operator turns it on (`RELAY_MEDIA=sim`); when off,
// the relay does not even create the tables, the /v1/midia routes do not exist and the `imagem` type is refused as unknown.
//
// Rules of this layer:
//   - the BYTES stay outside SQLite, in <dir>/<2 hex>/<hash>, and the path is built ONLY from the hash checked against ^[0-9a-f]{64}$;
//   - the format comes from the bytes and the cleanup is that of `cleanImage` (the same as the client's): the hash is that of the cleaned bytes;
//   - an upload that is not published is served to nobody and disappears after 1 hour; a file that no retained object cites disappears at once;
//   - nothing here fetches a URL.
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ATTACHMENT_TARGETS, ProtocolError, MEDIA_HASH_RE, ID_RE, MEDIA_LIMITS, MODERATION_REASONS, MEDIA_UPLOAD_RATE, VERIFIED_MEDIA_UPLOAD_RATE, MIME_TYPE,
  uploadCredentialMatches, limitError, waitInWords, ageFactor, readUploadCredential, cleanImage, capWithFactor, validateText
} from '../../protocol/src/index.js'
import { ROVER_VISIBLE } from './store.js'

const MEDIA_SCHEMA = `
CREATE TABLE IF NOT EXISTS midia (
  hash TEXT PRIMARY KEY,
  formato TEXT NOT NULL,
  largura INTEGER NOT NULL,
  altura INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  recebida_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS midia_envios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hash TEXT NOT NULL,
  uid TEXT NOT NULL,
  em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS midia_envios_uid ON midia_envios(uid, em);
CREATE INDEX IF NOT EXISTS midia_envios_hash ON midia_envios(hash, uid, em);
CREATE TABLE IF NOT EXISTS midia_recusadas (
  hash TEXT PRIMARY KEY,
  em INTEGER NOT NULL,
  motivo TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS imagens (
  id TEXT PRIMARY KEY,
  autor TEXT NOT NULL,
  hash TEXT NOT NULL,
  uso TEXT NOT NULL,
  alvo TEXT,
  ordem INTEGER,
  formato TEXT NOT NULL,
  largura INTEGER NOT NULL,
  altura INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  alt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS imagens_hash ON imagens(hash);
CREATE INDEX IF NOT EXISTS imagens_alvo ON imagens(alvo, ordem);
CREATE INDEX IF NOT EXISTS imagens_autor ON imagens(autor, uso);
CREATE TABLE IF NOT EXISTS anexos_removidos (
  id TEXT PRIMARY KEY,
  alvo TEXT NOT NULL,
  em INTEGER NOT NULL,
  motivo TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS anexos_removidos_alvo ON anexos_removidos(alvo);
`

// An `imagem` object is live: it has an envelope, was not removed or hidden, is not blocked, the author is visible and, if it is an
// attachment, the post is live too. It uses the aliases `i` (images), `o` (the image object) and `r` (rover).
const IMAGE_IN_FLIGHT = `
  o.envelope IS NOT NULL AND o.removido_em IS NULL AND o.oculto_em IS NULL
  AND o.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
  AND ${ROVER_VISIBLE}
  AND (i.alvo IS NULL OR EXISTS (SELECT 1 FROM objetos p WHERE p.id = i.alvo AND p.envelope IS NOT NULL AND p.removido_em IS NULL
       AND p.oculto_em IS NULL AND p.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')))`

const summary = (l) => ({ id: l.id, hash: l.hash, formato: l.formato, largura: l.largura, altura: l.altura, bytes: l.bytes, alt: l.alt, ordem: l.ordem })

/** The only place where a disk path is born. Throws unless the hash is exactly 64 lowercase hexadecimal characters. */
export function hashPath(dir, hash) {
  if (typeof hash !== 'string' || !MEDIA_HASH_RE.test(hash)) throw new Error('hash de mídia inválido')
  return join(dir, hash.slice(0, 2), hash)
}

export class Media {
  /**
   * @param {import('./relay.js').Relay} relay
   * @param {{ dir: string, quotaBytes?: number }} o
   */
  constructor(relay, { dir, cotaBytes: quotaBytes = MEDIA_LIMITS.defaultQuotaBytes }) {
    if (typeof dir !== 'string' || !dir) throw new Error('a mídia precisa de uma pasta')
    if (!Number.isSafeInteger(quotaBytes) || quotaBytes < 1) throw new Error('a cota de mídia precisa ser um inteiro positivo de bytes')
    this.rele = relay
    this.a = relay.store
    this.dir = dir
    this.cotaBytes = quotaBytes
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    this.a.db.exec(MEDIA_SCHEMA)
  }

  agora() { return this.rele.relogio() }

  info() {
    return {
      formatos: ['jpeg', 'png', 'webp'],
      bytesMax: MEDIA_LIMITS.bytesMax,
      ladoMaxPx: MEDIA_LIMITS.ladoMaxPx,
      anexosPorPostagem: MEDIA_LIMITS.anexosPorPostagem,
      altCaracteres: MEDIA_LIMITS.alt.max,
      pendenteS: MEDIA_LIMITS.pendenteS,
      // 0.11.0 (proposal 0013): no human approval per image, the types an image attaches to, and the account-age wait of a
      // non-verified account
      aprovacao: false,
      alvosDeAnexo: [...ATTACHMENT_TARGETS],
      idadeMinimaS: MEDIA_LIMITS.idadeMinimaS,
      cotaBytes: this.cotaBytes
    }
  }

  // ====================================================================================================
  // UPLOAD
  // ====================================================================================================

  /**
   * What is checked BEFORE reading the body (cheap, and the cost falls on whoever asks): credential, rover, age, rate, refused.
   * @param {string} hash
   * @param {{ cabecalho: string | undefined, metodo: string, alvo: string }} credencial
   * @returns {string} the uid of the sender
   */
  prepareUpload(hash, { header, metodo: method, alvo: target }) {
    this.rele._sync()
    const now = this.agora()
    const c = readUploadCredential(header)
    const r = c ? this.a.rover(c.uid) : null
    if (!r || r.saiu || !uploadCredentialMatches(c, { metodo: method, alvo: target, chave: r.chave, agora: now })) throw new ProtocolError('envio_nao_autorizado')
    if (this.a.bloqueado('emissor', r.emissor) || this.a.bloqueado('rover', r.uid)) throw new ProtocolError('bloqueado')
    if (now >= r.atestado_expira_em) throw new ProtocolError('atestado_vencido')
    if (!this.rele.provedor.trustedIssuers().includes(r.emissor)) throw new ProtocolError('emissor_desconhecido')
    if (this.a.storedAttestationRevoked(r)) throw new ProtocolError('atestado_revogado')
    const age = now - r.criado_em
    // 0.10.1: an account from a verified issuer sends a photo from day one, with the full ceiling (relay.js, verifiedAccount)
    const verified = this.rele.verifiedAccount(r.emissor)
    if (!verified && age < MEDIA_LIMITS.idadeMinimaS) {
      const missing = MEDIA_LIMITS.idadeMinimaS - age
      throw new ProtocolError('conta_nova', { detalhe: `A conta envia mídia depois de ${waitInWords(MEDIA_LIMITS.idadeMinimaS)} de idade.`, retryAfterS: missing })
    }
    const factor = this.rele.semFatorDeIdade || verified ? 1 : ageFactor(age)
    // 0.11.0: a verified account uploads at its own, higher, ceiling
    for (const [windowS, effectiveMax] of verified ? VERIFIED_MEDIA_UPLOAD_RATE : MEDIA_UPLOAD_RATE) {
      const max = capWithFactor(effectiveMax, factor)
      const n = this.a.um('SELECT COUNT(*) AS n, MIN(em) AS velho FROM midia_envios WHERE uid = :uid AND em > :desde', { uid: r.uid, desde: now - windowS })
      if (n.n >= max) throw limitError('limite_de_taxa', { max, janelaS: windowS, retryAfterS: n.velho + windowS - now, deQue: 'envios de mídia' })
    }
    if (this.a.um('SELECT 1 AS x FROM midia_recusadas WHERE hash = :hash', { hash })) throw new ProtocolError('midia_recusada')
    return r.uid
  }

  /**
   * After reading the body (with a cap): cleans, checks the hash, the quota and writes. Two identical uploads become one file.
   * @returns {{ estado: 'recebida' | 'duplicada', hash: string, formato: string, largura: number, altura: number, bytes: number }}
   */
  finishUpload(hash, uid, bytes) {
    const now = this.agora()
    const clean = cleanImage(bytes)
    if (!clean.ok) throw new ProtocolError(clean.codigo, { detalhe: `Motivo: ${clean.detalhe}.` })
    if (clean.hash !== hash) throw new ProtocolError('hash_divergente', { campo: 'hash', detalhe: 'O SHA-256 dos bytes limpos não é o hash do endereço. Limpe com a mesma função do protocolo antes de enviar.' })
    // 0.11.0: the same refusal the object would get, before the bytes are stored
    if (this.a.um('SELECT 1 AS x FROM midia_recusadas WHERE hash = :hash', { hash })) throw new ProtocolError('midia_recusada')
    const reply = { hash, formato: clean.formato, largura: clean.largura, altura: clean.altura, bytes: clean.bytes.length }
    const existing = this.a.um('SELECT hash FROM midia WHERE hash = :hash', { hash })
    const path = hashPath(this.dir, hash)
    if (existing && existsSync(path)) {
      this.a.executar('INSERT INTO midia_envios (hash, uid, em) VALUES (:hash, :uid, :agora)', { hash, uid, agora: now })
      return { estado: 'duplicada', ...reply }
    }
    const taken = this.a.um('SELECT COALESCE(SUM(bytes), 0) AS n FROM midia').n
    if (taken + clean.bytes.length > this.cotaBytes) throw this._withoutQuota(taken, clean.bytes.length)
    this._writeFile(path, clean.bytes)
    try {
      this.a.transaction(() => {
        this.a.executar(
          'INSERT OR REPLACE INTO midia (hash, formato, largura, altura, bytes, recebida_em) VALUES (:hash, :formato, :largura, :altura, :bytes, :agora)',
          { ...reply, agora: now }
        )
        this.a.executar('INSERT INTO midia_envios (hash, uid, em) VALUES (:hash, :uid, :agora)', { hash, uid, agora: now })
      })
    } catch (e) {
      if (!existing) rmSync(path, { force: true })
      throw e
    }
    return { estado: 'recebida', ...reply }
  }

  /** 0.11.0: the quota refusal says how much the relay holds, how much is taken and how much this file needs. */
  _withoutQuota(taken, request) {
    const mb = (n) => `${(n / 1048576).toFixed(1)} MB`
    return new ProtocolError('cota_de_midia', { detalhe: `O relé guarda até ${mb(this.cotaBytes)} de mídia, ${mb(taken)} estão ocupados e este arquivo tem ${mb(request)}.` })
  }

  _writeFile(path, bytes) {
    const dir = join(path, '..')
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    const temporary = join(dir, `.tmp-${randomBytes(8).toString('hex')}`)
    writeFileSync(temporary, bytes, { mode: 0o600, flag: 'wx' })
    renameSync(temporary, path)
  }

  // ====================================================================================================
  // THE `imagem` OBJECT
  // ====================================================================================================

  checkAge(obj, stored, now) {
    if (obj.tipo !== 'imagem' && obj.tipo !== 'video') return
    const age = now - stored.criado_em
    if (age < MEDIA_LIMITS.idadeMinimaS) {
      const missing = MEDIA_LIMITS.idadeMinimaS - age
      throw new ProtocolError('conta_nova', { detalhe: `A conta publica mídia depois de ${waitInWords(MEDIA_LIMITS.idadeMinimaS)} de idade.`, retryAfterS: missing })
    }
  }

  /** Rules of the `imagem` type. Returns the effect that relay.js writes (the envelope stays: an image is content). */
  regras(obj, now) {
    const c = obj.corpo
    if (this.a.um('SELECT 1 AS x FROM midia_recusadas WHERE hash = :hash', { hash: c.hash })) throw new ProtocolError('midia_recusada', { campo: 'objeto.corpo.hash' })
    const uploaded = this.a.um('SELECT 1 AS x FROM midia_envios WHERE hash = :hash AND uid = :uid AND em > :desde', { hash: c.hash, uid: obj.autor, desde: now - MEDIA_LIMITS.pendenteS })
    const file = this.a.um('SELECT * FROM midia WHERE hash = :hash', { hash: c.hash })
    if (!uploaded || !file) throw new ProtocolError('midia_ausente', { campo: 'objeto.corpo.hash' })
    for (const field of ['formato', 'largura', 'altura', 'bytes']) {
      if (file[field] !== c[field]) throw new ProtocolError('hash_divergente', { campo: `objeto.corpo.${field}`, detalhe: `O campo ${field} não descreve o arquivo enviado.` })
    }
    if (c.uso === 'anexo') {
      const p = this.a.objeto(c.alvo)
      // 0.11.0 (proposal 0013): an image attaches to a post, a reply, a forum topic or a forum reply (ATTACHMENT_TARGETS)
      if (!p || !ATTACHMENT_TARGETS.includes(p.tipo) || this.a.bloqueado('objeto', p.id)) throw new ProtocolError('alvo_desconhecido', { campo: 'objeto.corpo.alvo', detalhe: `O anexo aponta para um destes: ${ATTACHMENT_TARGETS.join(', ')}.` })
      if (p.removido_em !== null || p.oculto_em !== null) throw new ProtocolError('alvo_removido', { campo: 'objeto.corpo.alvo' })
      if (p.autor !== obj.autor) throw new ProtocolError('sem_permissao', { campo: 'objeto.corpo.alvo', detalhe: 'Só o autor anexa imagens ao que publicou.' })
      const active = this.a.todos(
        `SELECT i.ordem, i.hash FROM imagens i JOIN objetos o ON o.id = i.id WHERE i.alvo = :alvo AND o.envelope IS NOT NULL AND o.removido_em IS NULL`,
        { alvo: p.id }
      )
      if (active.length >= MEDIA_LIMITS.anexosPorPostagem) throw new ProtocolError('limite_de_estrutura', { campo: 'objeto.corpo.alvo', detalhe: `Cada publicação tem no máximo ${MEDIA_LIMITS.anexosPorPostagem} imagens. Remova uma antes de anexar outra.` })
      if (active.some((x) => x.ordem === c.ordem)) throw new ProtocolError('ja_existe', { campo: 'objeto.corpo.ordem' })
      if (active.some((x) => x.hash === c.hash)) throw new ProtocolError('ja_existe', { campo: 'objeto.corpo.hash' })
      // 0.11.0 part 3: a publication has up to 4 images OR one video
      if (this.rele.videos?.hasVideo(p.id)) throw new ProtocolError('limite_de_estrutura', { campo: 'objeto.corpo.alvo', detalhe: 'Uma publicação leva até 4 imagens ou 1 vídeo, não os dois.' })
    } else {
      // 2026-11-25: ceiling of PROFILE images (portrait and cover together) per author in 24 hours, on top of the type's rate. It counts
      // the `imagem` objects without a target (portrait and cover; an attachment points to the post), including those already replaced
      // or removed: changing photos also uses it up.
      const n = this.a.um(
        `SELECT COUNT(*) AS n, MIN(recebido_em) AS velho FROM objetos
         WHERE tipo = 'imagem' AND autor = :autor AND alvo IS NULL AND recebido_em > :desde`,
        { autor: obj.autor, desde: now - 86400 }
      )
      if (n.n >= MEDIA_LIMITS.profilePerDay) {
        throw limitError('limite_de_taxa', { max: MEDIA_LIMITS.profilePerDay, janelaS: 86400, retryAfterS: n.velho + 86400 - now, deQue: 'fotos de perfil (retrato e capa)' })
      }
    }
    return {
      alvo: c.alvo,
      depois: ({ agora: t }) => {
        // portrait and cover (0.9.0): one per rover, the new one withdraws the previous one
        if (c.uso !== 'anexo') this._withdraw(this.a.todos('SELECT id FROM imagens WHERE autor = :autor AND uso = :uso', { autor: obj.autor, uso: c.uso }).map((l) => l.id), t)
        this.a.executar(
          `INSERT INTO imagens (id, autor, hash, uso, alvo, ordem, formato, largura, altura, bytes, alt)
           VALUES (:id, :autor, :hash, :uso, :alvo, :ordem, :formato, :largura, :altura, :bytes, :alt)`,
          { id: obj.id, autor: obj.autor, hash: c.hash, uso: c.uso, alvo: c.alvo, ordem: c.ordem, formato: c.formato, largura: c.largura, altura: c.altura, bytes: c.bytes, alt: c.alt }
        )
      }
    }
  }

  /** Withdraws `imagem` objects (as if the author removed them): the envelope goes, the trace stays. */
  _withdraw(ids, now) {
    for (const id of ids) {
      this.a.executar('UPDATE objetos SET envelope = NULL, removido_em = COALESCE(removido_em, :agora) WHERE id = :id', { id, agora: now })
      this.a.executar('DELETE FROM imagens WHERE id = :id', { id })
      this.a.executar('DELETE FROM denuncias WHERE alvo = :id', { id })
    }
  }

  /** Effect of removal by the author on the media: the removed post takes its attachments with it. */
  onRemove(targetRow, now) {
    if (ATTACHMENT_TARGETS.includes(targetRow?.tipo)) this._withdraw(this.a.todos('SELECT id FROM imagens WHERE alvo = :id', { id: targetRow.id }).map((l) => l.id), now)
    if (targetRow?.tipo === 'imagem') this.a.executar('DELETE FROM imagens WHERE id = :id', { id: targetRow.id })
  }

  // ====================================================================================================
  // CLEANUP
  // ====================================================================================================

  /**
   * Deletes what became orphaned: the read copy of an object without an envelope, a file that no retained object cites and that nobody uploaded
   * in the last hour, a file row whose file vanished from disk, and the upload history older than one day. Returns how many files it deleted.
   */
  collect(now = this.agora()) {
    this.a.executar('DELETE FROM imagens WHERE NOT EXISTS (SELECT 1 FROM objetos o WHERE o.id = imagens.id AND o.envelope IS NOT NULL)')
    const orphans = this.a.todos(
      `SELECT hash FROM midia m WHERE NOT EXISTS (SELECT 1 FROM imagens i WHERE i.hash = m.hash)
         AND NOT EXISTS (SELECT 1 FROM midia_envios e WHERE e.hash = m.hash AND e.em > :desde)
         ${this.rele.videos ? 'AND NOT EXISTS (SELECT 1 FROM videos v WHERE v.miniatura = m.hash)' : ''}`,
      { desde: now - MEDIA_LIMITS.pendenteS }
    )
    for (const { hash } of orphans) this._deleteFile(hash)
    for (const { hash } of this.a.todos('SELECT hash FROM midia')) {
      if (!existsSync(hashPath(this.dir, hash))) this.a.executar('DELETE FROM midia WHERE hash = :hash', { hash })
    }
    this.a.executar('DELETE FROM midia_envios WHERE em <= :corte', { corte: now - 86400 })
    return orphans.length
  }

  _deleteFile(hash) {
    rmSync(hashPath(this.dir, hash), { force: true })
    this.a.executar('DELETE FROM midia WHERE hash = :hash', { hash })
  }

  // ====================================================================================================
  // READ
  // ====================================================================================================

  /** The bytes of a hash that some live object cites. Any other case is `nao_encontrado`, identical (the route does not become a probe). */
  ler(hash) {
    this.rele._sync()
    if (!MEDIA_HASH_RE.test(hash)) throw new ProtocolError('nao_encontrado')
    const now = this.agora()
    const visible = this.a.um(
      `SELECT 1 AS x FROM imagens i JOIN objetos o ON o.id = i.id JOIN rovers r ON r.uid = o.autor WHERE i.hash = :hash AND ${IMAGE_IN_FLIGHT} LIMIT 1`,
      { hash, ...this.rele._visibilityParams(now) }
    )
    // 0.11.0 part 3: the poster of a video on air is served like an attached image
    if (!visible && !this.rele.videos?.isThumbnailLive(hash, now)) throw new ProtocolError('nao_encontrado')
    return this._file(hash)
  }

  /** For administration: any stored file, published or not, blocked or not. */
  readAsOperator(hash) {
    if (!MEDIA_HASH_RE.test(hash)) throw new ProtocolError('nao_encontrado')
    return this._file(hash)
  }

  _file(hash) {
    const line = this.a.um('SELECT formato FROM midia WHERE hash = :hash', { hash })
    const path = hashPath(this.dir, hash)
    if (!line || !existsSync(path)) throw new ProtocolError('nao_encontrado')
    return { bytes: readFileSync(path), tipo: MIME_TYPE[line.formato] }
  }

  /** The live images of a post, in order. */
  postImages(id, now) {
    return this.a.todos(
      `SELECT i.* FROM imagens i JOIN objetos o ON o.id = i.id JOIN rovers r ON r.uid = o.autor WHERE i.alvo = :id AND ${IMAGE_IN_FLIGHT} ORDER BY i.ordem`,
      { id, ...this.rele._visibilityParams(now) }
    ).map(summary)
  }

  /**
   * Extra fields of an item that carries attachments (post; 0.11.0: reply, topic and forum reply): `imagens`, only when there are
   * any, and `anexosRemovidos` (0.11.0), only when moderation removed one of its attachments.
   */
  itemExtra(line, now) {
    if (!ATTACHMENT_TARGETS.includes(line.tipo)) return {}
    const images = this.postImages(line.id, now)
    const removed = this.a.um('SELECT COUNT(*) AS n FROM anexos_removidos WHERE alvo = :id', { id: line.id }).n
    return { ...(images.length ? { imagens: images } : {}), ...(removed ? { anexosRemovidos: removed } : {}), ...(this.rele.videos ? this.rele.videos.itemExtra(line, now) : {}) }
  }

  /** Extra fields of the profile: `retratoImagem` and (0.9.0) `capaImagem`, each only when there is one. */
  profileExtra(uid, now) {
    const last = (usage) => this.a.um(
      `SELECT i.* FROM imagens i JOIN objetos o ON o.id = i.id JOIN rovers r ON r.uid = o.autor
       WHERE i.autor = :uid AND i.uso = :uso AND ${IMAGE_IN_FLIGHT} ORDER BY o.seq DESC LIMIT 1`,
      { uid, uso: usage, ...this.rele._visibilityParams(now) }
    )
    const portrait = last('retrato')
    const cover = last('capa')
    return { ...(portrait ? { retratoImagem: summary(portrait) } : {}), ...(cover ? { capaImagem: summary(cover) } : {}) }
  }

  /**
   * 0.9.0: `retrato: { midia }` or `capa: { midia }` in the profile points to an `imagem` object of the author's own, online, with the
   * field's use. Otherwise, `alvo_desconhecido` on the field.
   */
  checkProfileImage(author, field, id, now) {
    const l = this.a.um(
      `SELECT i.uso FROM imagens i JOIN objetos o ON o.id = i.id JOIN rovers r ON r.uid = o.autor
       WHERE i.id = :id AND i.autor = :autor AND ${IMAGE_IN_FLIGHT}`,
      { id, autor: author, ...this.rele._visibilityParams(now) }
    )
    if (!l || l.uso !== field) throw new ProtocolError('alvo_desconhecido', { campo: `objeto.corpo.${field}.midia`, detalhe: `O ${field} precisa ser uma imagem sua, publicada com uso ${field}.` })
  }

  // ====================================================================================================
  // ADMINISTRATION
  // ====================================================================================================

  /**
   * Purge: deletes the file, withdraws the objects that cite it and stores the hash as refused (resubmitting gives `midia_recusada`).
   * Accepts the hash or the id of the `imagem` object (the id is what the report carries). Every removal goes into the moderation log,
   * with the public reason given or `outro`; a profile that cited the image goes back to the default portrait and cover on its own.
   */
  purge(target, body) {
    const byId = ID_RE.test(target) ? this.a.um('SELECT hash FROM imagens WHERE id = :id', { id: target }) : null
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
      const objects = this.a.todos('SELECT i.id, i.alvo, o.autor FROM imagens i JOIN objetos o ON o.id = i.id WHERE i.hash = :hash', { hash })
      n = objects.length
      for (const o of objects) {
        // 0.11.0: the post that lost an attachment to moderation says so (`anexosRemovidos` on the item)
        if (o.alvo) this.a.executar('INSERT OR REPLACE INTO anexos_removidos (id, alvo, em, motivo) VALUES (:id, :alvo, :agora, :motivo)', { id: o.id, alvo: o.alvo, agora: now, motivo: publicReason ?? 'outro' })
        this.rele.social.recordModeration({ em: now, escopo: 'rele', contexto: null, acao: 'remocao', alvoTipo: 'imagem', alvo: o.id, autorDoAlvo: o.autor, motivo: publicReason ?? 'outro', papel: 'rele', por: null })
      }
      this._withdraw(objects.map((o) => o.id), now)
      this.a.executar('INSERT OR REPLACE INTO midia_recusadas (hash, em, motivo) VALUES (:hash, :agora, :motivo)', { hash, agora: now, motivo: reason })
      this.a.executar('DELETE FROM midia_envios WHERE hash = :hash', { hash })
      this.a.executar('DELETE FROM midia WHERE hash = :hash', { hash })
    })
    rmSync(hashPath(this.dir, hash), { force: true })
    return { expurgado: true, objetos: n }
  }
}
