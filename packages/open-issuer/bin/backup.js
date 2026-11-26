#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Consistent backup of the open issuer's database, with rotation. Run INSIDE the container (the service may be up):
//   docker exec folgali-emissor node packages/open-issuer/bin/backup.js
// Variables: ISSUER_DB (default /dados/emissor-aberto.sqlite), ISSUER_BACKUP_DIR (default /backups),
//            ISSUER_BACKUP_KEEP (copies to keep, default 24). Prints one line of JSON with the name, the size and the counts.
import { makeBackup, rotate } from '../src/backup.js'
import { withLegacyEnv } from '../../protocol/src/env.js'

const env = withLegacyEnv(process.env, (m) => console.error(JSON.stringify({ t: new Date().toISOString(), nivel: 'aviso', evento: 'variavel_antiga', mensagem: m })))
const last = Number(env.ISSUER_BACKUP_KEEP ?? 24)
if (!Number.isInteger(last) || last < 1 || last > 3650) { console.error('ISSUER_BACKUP_KEEP precisa ser um inteiro entre 1 e 3650.'); process.exit(2) }
const dir = env.ISSUER_BACKUP_DIR ?? '/backups'
try {
  const r = makeBackup({ banco: env.ISSUER_DB ?? '/dados/emissor-aberto.sqlite', pasta: dir })
  const deleted = rotate({ pasta: dir, last })
  console.log(JSON.stringify({ evento: 'backup', arquivo: r.arquivo, bytes: r.bytes, sha256: r.sha256, ...r.contagens, apagados: deleted.length }))
} catch (e) {
  console.error(JSON.stringify({ evento: 'backup_falhou', motivo: e.message }))
  process.exit(1)
}
