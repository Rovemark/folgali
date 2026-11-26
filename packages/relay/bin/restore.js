#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Restores a backup into the relay database. THE RELAY MUST BE STOPPED (docs/RELAY-OPERATIONS.md, section 8).
//   node packages/relay/bin/restore.js <file | ultimo> [--destino /dados/rele.sqlite] [--midia /dados/midia] [--forcar] [--sem-midia]
// `ultimo` picks the newest backup in RELAY_BACKUP_DIR (default /backups). With --forcar, the current database is not deleted:
// it moves to <destino>.antes-de-restaurar-<instant>, and the images folder moves to <midia>.antes-de-restaurar-<instant>.
// The images folder is --midia, or RELAY_MEDIA_DIR, or midia/ next to the destination (the same default as the relay).
// --sem-midia: accepts an old backup, without the <backup>.midia folder, of a database that cites images (they are left without a file).
import { dirname, join, resolve } from 'node:path'
import { listBackups, restore } from '../src/backup.js'
import { withLegacyEnv } from '../../protocol/src/env.js'

const env = withLegacyEnv(process.env, (m) => console.error(JSON.stringify({ t: new Date().toISOString(), nivel: 'aviso', evento: 'variavel_antiga', mensagem: m })))
const args = process.argv.slice(2)
const force = args.includes('--forcar')
const acceptWithoutMedia = args.includes('--sem-midia')
const value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const destination = args.includes('--destino') ? value('--destino') : (env.RELAY_DB ?? '/dados/rele.sqlite')
const mediaDir = args.includes('--midia') ? value('--midia') : (destination && resolve(env.RELAY_MEDIA_DIR || `${dirname(destination)}/midia`))
const target = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--destino' && args[i - 1] !== '--midia')
if (!target || !destination || !mediaDir) { console.error('uso: restore.js <arquivo | ultimo> [--destino caminho] [--midia pasta] [--forcar] [--sem-midia]'); process.exit(2) }
const dir = env.RELAY_BACKUP_DIR ?? '/backups'
let file = target
if (target === 'ultimo') {
  const [newValue] = listBackups(dir)
  if (!newValue) { console.error(`nenhum backup em ${dir}`); process.exit(1) }
  file = join(dir, newValue)
} else if (!target.includes('/')) {
  file = join(dir, target)
}
try {
  const r = restore({ arquivo: file, destino: destination, mediaDir, forcar: force, acceptWithoutMedia })
  console.log(JSON.stringify({ evento: 'restaurado', de: file, ...r.contagens, ...(r.midia ? { imagens: r.midia.arquivos } : {}), guardados: r.guardados }))
} catch (e) {
  console.error(JSON.stringify({ evento: 'restauracao_falhou', motivo: e.message }))
  process.exit(1)
}
