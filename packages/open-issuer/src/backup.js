// SPDX-License-Identifier: AGPL-3.0-or-later
// Backup of the open issuer's database, in the same design as the relay's (packages/relay/src/backup.js):
//   - the copy is made by SQLite itself (VACUUM INTO), a consistent snapshot while the service keeps writing;
//   - it is born with a temporary name, is checked (integrity_check and the issuer's tables) and only then gets its final name, with a .sha256 next to it;
//   - rotation: keeps the N newest copies.
// The database holds no private key at all (the key and the secret come from the environment), but it does hold the owners' HMAC and each agent's state:
// the backup folder is 0700 and each file 0600.
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ISSUER_TABLES } from './issuer.js'

export const NAME_RE = /^emissor-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.sqlite$/
const two = (n) => String(n).padStart(2, '0')
export const backupName = (d) => `emissor-${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}-${two(d.getUTCHours())}${two(d.getUTCMinutes())}${two(d.getUTCSeconds())}.sqlite`
const quotes = (s) => `'${s.replaceAll("'", "''")}'`

/** Checks a copy: opens read-only, integrity_check `ok` and the issuer's tables present. Returns the counts. */
export function check(path) {
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    const r = db.prepare('PRAGMA integrity_check').get()
    if (Object.values(r)[0] !== 'ok') throw new Error('a cópia não passou no integrity_check')
    const counts = {}
    for (const t of ISSUER_TABLES) {
      if (!db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = :t").get({ t })) throw new Error(`a cópia não tem a tabela ${t}`)
      counts[t] = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n
    }
    return counts
  } finally { db.close() }
}

/** Makes the copy in `pasta`. Returns { arquivo, bytes, sha256, contagens }. Throws without leaving a half-written file. */
export function makeBackup({ banco: dbPath, pasta: dir, agora: now = new Date() }) {
  if (!existsSync(dbPath)) throw new Error('o banco do emissor não existe')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const name = backupName(now)
  const finalPath = join(dir, name)
  if (existsSync(finalPath)) throw new Error('já existe um backup com este nome (dois no mesmo segundo)')
  const provisional = `${finalPath}.parcial`
  rmSync(provisional, { force: true })
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try { db.exec(`VACUUM INTO ${quotes(provisional)}`) } finally { db.close() }
  try {
    chmodSync(provisional, 0o600)
    const counts = check(provisional)
    const bytes = readFileSync(provisional)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    renameSync(provisional, finalPath)
    writeFileSync(`${finalPath}.sha256`, `${sha256}  ${name}\n`, { mode: 0o600 })
    return { arquivo: name, bytes: bytes.length, sha256, contagens: counts }
  } catch (e) {
    rmSync(provisional, { force: true })
    throw e
  }
}

/** Keeps the `ultimos` newest copies (and each one's .sha256); deletes the others. Returns the names deleted. */
export function rotate({ pasta: dir, last }) {
  const copies = readdirSync(dir).filter((n) => NAME_RE.test(n) && statSync(join(dir, n)).isFile()).sort().reverse()
  const erase = copies.slice(last)
  for (const n of erase) { rmSync(join(dir, n), { force: true }); rmSync(join(dir, `${n}.sha256`), { force: true }) }
  return erase
}
