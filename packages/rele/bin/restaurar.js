#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Restaura um backup no banco do relé. O RELÉ TEM DE ESTAR PARADO (docs/OPERACAO-DO-RELE.md, seção 8).
//   node packages/rele/bin/restaurar.js <arquivo | ultimo> [--destino /dados/rele.sqlite] [--midia /dados/midia] [--forcar] [--sem-midia]
// `ultimo` pega o backup mais novo de RELE_BACKUP_PASTA (padrão /backups). Com --forcar, o banco atual não é apagado:
// vai para <destino>.antes-de-restaurar-<instante>, e a pasta de imagens para <midia>.antes-de-restaurar-<instante>.
// A pasta de imagens é --midia, ou RELE_MIDIA_DIR, ou midia/ ao lado do destino (o mesmo padrão do relé).
// --sem-midia: aceita um backup antigo, sem a pasta <backup>.midia, de um banco que cita imagens (elas ficam sem arquivo).
import { dirname, join, resolve } from 'node:path'
import { listarBackups, restaurar } from '../src/backup.js'

const env = process.env
const args = process.argv.slice(2)
const forcar = args.includes('--forcar')
const aceitarSemMidia = args.includes('--sem-midia')
const valor = (nome) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : undefined }
const destino = args.includes('--destino') ? valor('--destino') : (env.RELE_BANCO ?? '/dados/rele.sqlite')
const midiaDir = args.includes('--midia') ? valor('--midia') : (destino && resolve(env.RELE_MIDIA_DIR || `${dirname(destino)}/midia`))
const alvo = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--destino' && args[i - 1] !== '--midia')
if (!alvo || !destino || !midiaDir) { console.error('uso: restaurar.js <arquivo | ultimo> [--destino caminho] [--midia pasta] [--forcar] [--sem-midia]'); process.exit(2) }
const pasta = env.RELE_BACKUP_PASTA ?? '/backups'
let arquivo = alvo
if (alvo === 'ultimo') {
  const [novo] = listarBackups(pasta)
  if (!novo) { console.error(`nenhum backup em ${pasta}`); process.exit(1) }
  arquivo = join(pasta, novo)
} else if (!alvo.includes('/')) {
  arquivo = join(pasta, alvo)
}
try {
  const r = restaurar({ arquivo, destino, midiaDir, forcar, aceitarSemMidia })
  console.log(JSON.stringify({ evento: 'restaurado', de: arquivo, ...r.contagens, ...(r.midia ? { imagens: r.midia.arquivos } : {}), guardados: r.guardados }))
} catch (e) {
  console.error(JSON.stringify({ evento: 'restauracao_falhou', motivo: e.message }))
  process.exit(1)
}
