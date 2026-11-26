#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Consistent backup of the relay database, with rotation. Run it INSIDE the container (the relay can stay up):
//   docker exec rover-network-rele node packages/relay/bin/backup.js
// Variables: RELAY_DB (default /dados/rele.sqlite), RELAY_BACKUP_DIR (default /backups),
//            RELAY_BACKUP_KEEP (how many newest copies to keep, default 12), RELAY_BACKUP_DAYS (days that keep one copy per day, default 14),
//            RELAY_MEDIA_DIR (images folder, the same as the relay's; default: midia/ next to the database).
// Prints one JSON line with the name, the size and the counts (and, with images, how many were copied and how many were missing from the
// relay folder). It never prints database content or an image hash.
import { dirname, resolve } from 'node:path'
import { makeBackup, rotate } from '../src/backup.js'
import { withLegacyEnv } from '../../protocol/src/env.js'

const env = withLegacyEnv(process.env, (m) => console.error(JSON.stringify({ t: new Date().toISOString(), nivel: 'aviso', evento: 'variavel_antiga', mensagem: m })))
const integer = (name, defaultValue) => {
  const n = Number(env[name] ?? defaultValue)
  if (!Number.isInteger(n) || n < 1 || n > 3650) { console.error(`${name} precisa ser um inteiro entre 1 e 3650.`); process.exit(2) }
  return n
}
const last = integer('RELAY_BACKUP_KEEP', 12)
const days = integer('RELAY_BACKUP_DAYS', 14)
const dir = env.RELAY_BACKUP_DIR ?? '/backups'
try {
  const dbPath = env.RELAY_DB ?? '/dados/rele.sqlite'
  const r = makeBackup({ banco: dbPath, pasta: dir, mediaDir: resolve(env.RELAY_MEDIA_DIR || `${dirname(dbPath)}/midia`) })
  const deleted = rotate({ pasta: dir, last, dias: days })
  const media = r.midia ? { imagens: r.midia.arquivos, bytesDeImagens: r.midia.bytes, imagensAusentes: r.midia.missing } : {}
  console.log(JSON.stringify({ evento: 'backup', arquivo: r.arquivo, bytes: r.bytes, sha256: r.sha256, ...r.contagens, ...media, apagados: deleted.length }))
  // an image the database cites but the folder lacks (or does not match) stayed out of the copy: it gets a separate warning, which cron sends to the logger
  if (r.midia?.missing) console.error(JSON.stringify({ evento: 'backup_imagens_ausentes', arquivo: r.arquivo, imagensAusentes: r.midia.missing }))
} catch (e) {
  console.error(JSON.stringify({ evento: 'backup_falhou', motivo: e.message }))
  process.exit(1)
}
