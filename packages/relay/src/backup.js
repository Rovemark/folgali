// SPDX-License-Identifier: AGPL-3.0-or-later
// Backup and restore of the relay SQLite database.
//   - The copy is made by SQLite itself (VACUUM INTO), which reads a consistent snapshot while the relay keeps writing.
//     Copying the open file (cp, rsync) can catch the database and the WAL at different moments and produce a copy that does not open.
//   - The copy is born with a temporary name, is checked (integrity_check and the relay tables) and only then gets its final name.
//   - Each copy carries a .sha256 beside it; restore checks the hash before touching anything.
//   - Rotation: keeps the N newest copies and the newest of each of the last D days (days in UTC).
//   - Images (0.5.0): the bytes live outside SQLite, in <media folder>/<2 hex>/<hash>. When the database has the `midia` table, the copy
//     carries the folder `<backup>.midia/` with EXACTLY the files that the `midia` table of the copy cites, each one checked by its own name
//     (the name is the SHA-256 of the bytes), and a MANIFESTO.sha256 that `sha256sum -c` understands. A file that arrived after the snapshot does not
//     go in (it would be an orphan); a file that vanished or does not match is also removed from the copy's table (it would be a row without a file) and is counted.
// Nothing here reads the content of the tables beyond counting rows and reading the hashes of the `midia` table.
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { hashPath } from './media.js'

export const NAME_RE = /^rele-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.sqlite$/
const RELAY_TABLES = ['rovers', 'objetos']
/** Suffix of the images folder of a backup: `rele-AAAAMMDD-HHMMSS.sqlite.midia`. */
export const MEDIA_SUFFIX = '.midia'
export const MANIFEST = 'MANIFESTO.sha256'

const quotes = (s) => `'${s.replaceAll("'", "''")}'`
const two = (n) => String(n).padStart(2, '0')

export const backupName = (now) =>
  `rele-${now.getUTCFullYear()}${two(now.getUTCMonth() + 1)}${two(now.getUTCDate())}-${two(now.getUTCHours())}${two(now.getUTCMinutes())}${two(now.getUTCSeconds())}.sqlite`

/** The instant (in ms) the name says, or null if the name is not from one of our backups. */
export function nameInstant(name) {
  const m = NAME_RE.exec(name)
  if (!m) return null
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
  // Date.UTC "fixes" month 13 or day 99 instead of refusing: the name is only valid if the date comes back the same
  return backupName(new Date(t)) === name ? t : null
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const fileSha256 = (path) => sha256(readFileSync(path))

/** The hashes of the `midia` table of the database, in order; `null` if the database has no such table (the feature was never turned on). */
export function mediaHashes(path) {
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    if (!db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'midia'").get()) return null
    return db.prepare('SELECT hash FROM midia ORDER BY hash').all().map((l) => l.hash)
  } finally {
    db.close()
  }
}

const manifestLine = (hash) => `${hash}  ${hash.slice(0, 2)}/${hash}`

/** Writes the bytes to <folder>/<2 hex>/<hash> with the relay permissions (folders 0700, files 0600). */
function writeImage(dir, hash, bytes) {
  const destination = hashPath(dir, hash)
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 })
  writeFileSync(destination, bytes, { mode: 0o600, flag: 'wx' })
}

/**
 * Checks the images folder of a backup against the `midia` table of the backup itself: each hash has its file, each file matches
 * its name, there is no extra file and the manifest lists exactly the same set. Throws with the reason; returns how many files and bytes.
 */
export function checkBackupMedia(file) {
  const hashes = mediaHashes(file)
  const dir = `${file}${MEDIA_SUFFIX}`
  if (hashes === null) {
    if (existsSync(dir)) throw new Error(`o backup tem a pasta ${basename(dir)} mas o banco não tem a tabela de mídia: as duas metades não são do mesmo backup`)
    return null
  }
  if (!existsSync(dir)) {
    if (hashes.length === 0) return { arquivos: 0, bytes: 0 }
    throw new Error(`o banco do backup cita ${hashes.length} imagens e a pasta ${basename(dir)} não está ao lado dele`)
  }
  const expected = new Set(hashes)
  let bytes = 0
  for (const hash of hashes) {
    const path = hashPath(dir, hash)
    if (!existsSync(path)) throw new Error(`falta no backup a imagem ${hash}, que o banco do backup cita`)
    const content = readFileSync(path)
    if (sha256(content) !== hash) throw new Error(`a imagem ${hash} do backup não confere com o próprio hash: foi alterada ou está corrompida`)
    bytes += content.length
  }
  for (const sub of readdirSync(dir)) {
    if (sub === MANIFEST) continue
    const inside = join(dir, sub)
    if (!/^[0-9a-f]{2}$/.test(sub) || !statSync(inside).isDirectory()) throw new Error(`arquivo estranho na pasta de imagens do backup: ${sub}`)
    for (const name of readdirSync(inside)) {
      if (!expected.has(name) || name.slice(0, 2) !== sub) throw new Error(`a pasta de imagens do backup tem um arquivo que o banco do backup não cita: ${sub}/${name}`)
    }
  }
  const manifest = existsSync(join(dir, MANIFEST)) ? readFileSync(join(dir, MANIFEST), 'utf8') : null
  if (manifest !== hashes.map((h) => `${manifestLine(h)}\n`).join('')) throw new Error(`o ${MANIFEST} do backup não lista as mesmas imagens que o banco do backup`)
  return { arquivos: hashes.length, bytes }
}

/** Opens the file only to check it. Returns the counts or throws with the reason. */
export function check(path, { tables = RELAY_TABLES } = {}) {
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    const ic = db.prepare('PRAGMA integrity_check').all()
    if (ic.length !== 1 || ic[0].integrity_check !== 'ok') throw new Error('o banco não passou no integrity_check do SQLite')
    const counts = {}
    for (const t of tables) {
      const exists = db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = :t").get({ t })
      if (!exists) throw new Error(`o banco não tem a tabela "${t}": não parece um banco do relé`)
      counts[t] = Number(db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n)
    }
    return counts
  } finally {
    db.close()
  }
}

/**
 * Consistent copy of the database to `pasta`. The relay may be writing.
 * With the `midia` table in the database, it also copies the images from `mediaDir` (default: `midia/` next to the database, the same as the relay) to
 * `<backup>.midia/`. The image copy follows the database SNAPSHOT, not the folder: only what the `midia` table of the copy cites goes in.
 * @returns {{ arquivo: string, caminho: string, bytes: number, sha256: string, contagens: object,
 *   midia: null | { arquivos: number, bytes: number, ausentes: number } }}
 */
export function makeBackup({ banco: dbPath, pasta: dir, mediaDir = join(dirname(dbPath), 'midia'), agora: now = new Date() }) {
  if (!existsSync(dbPath)) throw new Error(`banco não encontrado: ${dbPath}`)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const file = backupName(now)
  const finalPath = join(dir, file)
  if (existsSync(finalPath)) throw new Error(`já existe um backup deste segundo: ${file}`)
  const partial = `${finalPath}.parcial`
  const partialMedia = `${finalPath}${MEDIA_SUFFIX}.parcial`
  rmSync(partial, { force: true })
  rmSync(partialMedia, { recursive: true, force: true })
  const db = new DatabaseSync(dbPath)
  try {
    db.exec('PRAGMA busy_timeout = 30000')
    db.exec(`VACUUM INTO ${quotes(partial)}`)
  } finally {
    db.close()
  }
  try {
    check(partial)
    const media = copyMedia(partial, mediaDir, partialMedia)
    const counts = check(partial)
    chmodSync(partial, 0o600)
    const hash = fileSha256(partial)
    writeFileSync(`${finalPath}.sha256`, `${hash}  ${file}\n`, { mode: 0o600 })
    // the images folder gets its final name BEFORE the database: a crash between the two leaves a folder without a database (rotation deletes it),
    // never a database that cites images without their folder
    if (media) renameSync(partialMedia, `${finalPath}${MEDIA_SUFFIX}`)
    renameSync(partial, finalPath)
    return { arquivo: file, caminho: finalPath, bytes: statSync(finalPath).size, sha256: hash, contagens: counts, midia: media }
  } catch (e) {
    rmSync(partial, { force: true })
    rmSync(partialMedia, { recursive: true, force: true })
    rmSync(`${finalPath}${MEDIA_SUFFIX}`, { recursive: true, force: true })
    rmSync(`${finalPath}.sha256`, { force: true })
    throw e
  }
}

/**
 * Copies to `destino` the images that the `midia` table of the `parcial` copy cites, checking each one by its hash. One that vanished from the relay
 * folder (or does not match) is removed from the copy's table, so the backup does not keep a row without a file. `null` if there is no media table.
 */
function copyMedia(partial, mediaDir, destination) {
  const hashes = mediaHashes(partial)
  if (hashes === null) return null
  if (hashes.length > 0 && !existsSync(mediaDir)) {
    throw new Error(`o banco cita ${hashes.length} imagens e a pasta de mídia ${mediaDir} não existe: confira RELAY_MEDIA_DIR`)
  }
  mkdirSync(destination, { mode: 0o700 }) // the backup folder already exists and the `.parcial` was just deleted
  const copied = []
  const missing = []
  let bytes = 0
  for (const hash of hashes) {
    const origin = hashPath(mediaDir, hash)
    const content = existsSync(origin) ? readFileSync(origin) : null
    if (!content || sha256(content) !== hash) { missing.push(hash); continue }
    writeImage(destination, hash, content)
    copied.push(hash)
    bytes += content.length
  }
  if (missing.length) {
    const db = new DatabaseSync(partial)
    try {
      const erase = db.prepare('DELETE FROM midia WHERE hash = :hash')
      for (const hash of missing) erase.run({ hash })
    } finally {
      db.close()
    }
  }
  writeFileSync(join(destination, MANIFEST), copied.map((h) => `${manifestLine(h)}\n`).join(''), { mode: 0o600 })
  return { arquivos: copied.length, bytes, missing: missing.length }
}

/** Backup names (newest to oldest). Ignores everything that is not one of our backups. */
export function listBackups(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((n) => nameInstant(n) !== null).sort().reverse()
}

/**
 * Which backups to delete. Keeps: the newest `last` and, of each of the last `dias` days (UTC), the newest of the day.
 * @param {string[]} nomes
 * @param {{ agora: Date, last?: number, dias?: number }} o
 */
export function chooseToDelete(names, { agora: now, last = 12, dias: days = 14 }) {
  const valid = names.filter((n) => nameInstant(n) !== null).sort().reverse()
  const store = new Set(valid.slice(0, last))
  const limit = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days - 1) * 86_400_000
  const seen = new Set()
  for (const n of valid) {
    const t = nameInstant(n)
    const day = Math.floor(t / 86_400_000)
    if (t >= limit && !seen.has(day)) { seen.add(day); store.add(n) }
  }
  return valid.filter((n) => !store.has(n))
}

export function rotate({ pasta: dir, agora: now = new Date(), last = 12, dias: days = 14 }) {
  const erase = chooseToDelete(listBackups(dir), { agora: now, last, dias: days })
  for (const n of erase) {
    rmSync(join(dir, n), { force: true })
    rmSync(join(dir, `${n}.sha256`), { force: true })
    rmSync(join(dir, `${n}${MEDIA_SUFFIX}`), { recursive: true, force: true })
  }
  // leftover of a copy that died halfway (the database or the `.parcial` images folder, or the images folder that got its final name
  // without the database): disappears after a day. Only what has the name of one of our backups.
  const old = (n) => now.getTime() - statSync(join(dir, n)).mtimeMs > 86_400_000
  for (const n of existsSync(dir) ? readdirSync(dir) : []) {
    const partial = n.endsWith('.parcial') && nameInstant(n.slice(0, -'.parcial'.length).replace(/\.midia$/, '')) !== null
    const dirWithoutDb = n.endsWith(MEDIA_SUFFIX) && nameInstant(n.slice(0, -MEDIA_SUFFIX.length)) !== null && !existsSync(join(dir, n.slice(0, -MEDIA_SUFFIX.length)))
    if ((partial || dirWithoutDb) && old(n)) rmSync(join(dir, n), { recursive: true, force: true })
  }
  return erase
}

/**
 * Restores `arquivo` into `destino`. The relay MUST be stopped: two writers on the same SQLite corrupt the database.
 * If a database already exists at `destino` (or the images folder at `mediaDir`), it only proceeds with `forcar`, and what was there (the database with
 * the WAL and the SHM, and the images folder) goes to `<name>.antes-de-restaurar-<instant>`.
 * Images: everything is checked BEFORE touching anything (the database hash, integrity_check, each image by its own hash, nothing
 * more or less than what the backup `midia` table cites). An old backup, without the `.midia` folder, of a database that cites images: refused,
 * unless `acceptWithoutMedia` (reading those images answers 404 and the relay cleanup deletes the rows without a file).
 */
export function restore({ arquivo: file, destino: destination, mediaDir = join(dirname(destination), 'midia'), forcar: force = false, acceptWithoutMedia = false, agora: now = new Date() }) {
  if (!existsSync(file)) throw new Error(`backup não encontrado: ${file}`)
  const badge = `${file}.sha256`
  if (existsSync(badge)) {
    const expected = readFileSync(badge, 'utf8').trim().split(/\s+/)[0]
    if (expected !== fileSha256(file)) throw new Error('o hash do backup não confere com o .sha256: o arquivo foi alterado ou está corrompido')
  }
  check(file)
  let media
  try {
    media = checkBackupMedia(file)
  } catch (e) {
    if (!(acceptWithoutMedia && !existsSync(`${file}${MEDIA_SUFFIX}`))) throw e
    media = null
  }
  const stored = []
  const taken = [`${destination}`, `${destination}-wal`, `${destination}-shm`, mediaDir].filter((c) => existsSync(c))
  if (taken.length) {
    if (!force) throw new Error(`já existe um banco em ${destination} (ou a pasta de imagens ${mediaDir}). Use --forcar para guardá-los de lado e restaurar.`)
    const suffix = `.antes-de-restaurar-${now.getTime()}`
    for (const extra of ['', '-wal', '-shm']) {
      if (existsSync(`${destination}${extra}`)) { renameSync(`${destination}${extra}`, `${destination}${suffix}${extra}`); stored.push(basename(`${destination}${suffix}${extra}`)) }
    }
    if (existsSync(mediaDir)) { renameSync(mediaDir, `${mediaDir}${suffix}`); stored.push(basename(`${mediaDir}${suffix}`)) }
  }
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 })
  if (media) {
    // the folder is born with another name and only gets the final one whole: the relay never starts looking at a half folder
    const mediaPartial = `${mediaDir}.parcial`
    rmSync(mediaPartial, { recursive: true, force: true })
    mkdirSync(mediaPartial, { recursive: true, mode: 0o700 })
    const origin = `${file}${MEDIA_SUFFIX}`
    for (const hash of mediaHashes(file)) writeImage(mediaPartial, hash, readFileSync(hashPath(origin, hash)))
    renameSync(mediaPartial, mediaDir)
  }
  const partial = `${destination}.parcial`
  copyFileSync(file, partial)
  chmodSync(partial, 0o600)
  renameSync(partial, destination)
  const counts = check(destination)
  return { destino: destination, contagens: counts, guardados: stored, midia: media }
}
