// SPDX-License-Identifier: AGPL-3.0-or-later
// Backup do banco do emissor aberto, no mesmo desenho do relé (packages/rele/src/backup.js):
//   - a cópia é do próprio SQLite (VACUUM INTO), um instantâneo consistente enquanto o serviço segue gravando;
//   - nasce com nome provisório, é conferida (integrity_check e as tabelas do emissor) e só então ganha o nome final, com um .sha256 ao lado;
//   - rotação: guarda as N cópias mais novas.
// O banco não tem chave privada nenhuma (a chave e o segredo vêm do ambiente), mas tem o HMAC dos donos e o estado de cada agente:
// a pasta de backups é 0700 e cada arquivo 0600.
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { TABELAS_DO_EMISSOR } from './emissor.js'

export const NOME_RE = /^emissor-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.sqlite$/
const dois = (n) => String(n).padStart(2, '0')
export const nomeDoBackup = (d) => `emissor-${d.getUTCFullYear()}${dois(d.getUTCMonth() + 1)}${dois(d.getUTCDate())}-${dois(d.getUTCHours())}${dois(d.getUTCMinutes())}${dois(d.getUTCSeconds())}.sqlite`
const aspas = (s) => `'${s.replaceAll("'", "''")}'`

/** Confere uma cópia: abre só para leitura, integrity_check `ok` e as tabelas do emissor presentes. Devolve as contagens. */
export function conferir(caminho) {
  const db = new DatabaseSync(caminho, { readOnly: true })
  try {
    const r = db.prepare('PRAGMA integrity_check').get()
    if (Object.values(r)[0] !== 'ok') throw new Error('a cópia não passou no integrity_check')
    const contagens = {}
    for (const t of TABELAS_DO_EMISSOR) {
      if (!db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = :t").get({ t })) throw new Error(`a cópia não tem a tabela ${t}`)
      contagens[t] = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n
    }
    return contagens
  } finally { db.close() }
}

/** Faz a cópia em `pasta`. Devolve { arquivo, bytes, sha256, contagens }. Lança sem deixar arquivo pela metade. */
export function fazerBackup({ banco, pasta, agora = new Date() }) {
  if (!existsSync(banco)) throw new Error('o banco do emissor não existe')
  mkdirSync(pasta, { recursive: true, mode: 0o700 })
  const nome = nomeDoBackup(agora)
  const final = join(pasta, nome)
  if (existsSync(final)) throw new Error('já existe um backup com este nome (dois no mesmo segundo)')
  const provisorio = `${final}.parcial`
  rmSync(provisorio, { force: true })
  const db = new DatabaseSync(banco, { readOnly: true })
  try { db.exec(`VACUUM INTO ${aspas(provisorio)}`) } finally { db.close() }
  try {
    chmodSync(provisorio, 0o600)
    const contagens = conferir(provisorio)
    const bytes = readFileSync(provisorio)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    renameSync(provisorio, final)
    writeFileSync(`${final}.sha256`, `${sha256}  ${nome}\n`, { mode: 0o600 })
    return { arquivo: nome, bytes: bytes.length, sha256, contagens }
  } catch (e) {
    rmSync(provisorio, { force: true })
    throw e
  }
}

/** Guarda as `ultimos` cópias mais novas (e o .sha256 de cada); apaga as outras. Devolve os nomes apagados. */
export function rotacionar({ pasta, ultimos }) {
  const copias = readdirSync(pasta).filter((n) => NOME_RE.test(n) && statSync(join(pasta, n)).isFile()).sort().reverse()
  const apagar = copias.slice(ultimos)
  for (const n of apagar) { rmSync(join(pasta, n), { force: true }); rmSync(join(pasta, `${n}.sha256`), { force: true }) }
  return apagar
}
