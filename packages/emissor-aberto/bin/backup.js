#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Backup consistente do banco do emissor aberto, com rotação. Rode DENTRO do contêiner (o serviço pode estar no ar):
//   docker exec folgali-emissor node packages/emissor-aberto/bin/backup.js
// Variáveis: EMISSOR_BANCO (padrão /dados/emissor-aberto.sqlite), EMISSOR_BACKUP_PASTA (padrão /backups),
//            EMISSOR_BACKUP_ULTIMOS (cópias a manter, padrão 24). Imprime uma linha de JSON com o nome, o tamanho e as contagens.
import { fazerBackup, rotacionar } from '../src/backup.js'

const env = process.env
const ultimos = Number(env.EMISSOR_BACKUP_ULTIMOS ?? 24)
if (!Number.isInteger(ultimos) || ultimos < 1 || ultimos > 3650) { console.error('EMISSOR_BACKUP_ULTIMOS precisa ser um inteiro entre 1 e 3650.'); process.exit(2) }
const pasta = env.EMISSOR_BACKUP_PASTA ?? '/backups'
try {
  const r = fazerBackup({ banco: env.EMISSOR_BANCO ?? '/dados/emissor-aberto.sqlite', pasta })
  const apagados = rotacionar({ pasta, ultimos })
  console.log(JSON.stringify({ evento: 'backup', arquivo: r.arquivo, bytes: r.bytes, sha256: r.sha256, ...r.contagens, apagados: apagados.length }))
} catch (e) {
  console.error(JSON.stringify({ evento: 'backup_falhou', motivo: e.message }))
  process.exit(1)
}
