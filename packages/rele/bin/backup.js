#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Backup consistente do banco do relé, com rotação. Rode DENTRO do contêiner (o relé pode estar no ar):
//   docker exec rover-network-rele node packages/rele/bin/backup.js
// Variáveis: RELE_BANCO (padrão /dados/rele.sqlite), RELE_BACKUP_PASTA (padrão /backups),
//            RELE_BACKUP_ULTIMOS (cópias mais novas a manter, padrão 12), RELE_BACKUP_DIAS (dias com uma cópia por dia, padrão 14),
//            RELE_MIDIA_DIR (pasta das imagens, a mesma do relé; padrão: midia/ ao lado do banco).
// Imprime uma linha de JSON com o nome, o tamanho e as contagens (e, com imagens, quantas foram copiadas e quantas faltavam na pasta do
// relé). Nunca imprime conteúdo do banco nem hash de imagem.
import { dirname, resolve } from 'node:path'
import { fazerBackup, rotacionar } from '../src/backup.js'

const env = process.env
const inteiro = (nome, padrao) => {
  const n = Number(env[nome] ?? padrao)
  if (!Number.isInteger(n) || n < 1 || n > 3650) { console.error(`${nome} precisa ser um inteiro entre 1 e 3650.`); process.exit(2) }
  return n
}
const ultimos = inteiro('RELE_BACKUP_ULTIMOS', 12)
const dias = inteiro('RELE_BACKUP_DIAS', 14)
const pasta = env.RELE_BACKUP_PASTA ?? '/backups'
try {
  const banco = env.RELE_BANCO ?? '/dados/rele.sqlite'
  const r = fazerBackup({ banco, pasta, midiaDir: resolve(env.RELE_MIDIA_DIR || `${dirname(banco)}/midia`) })
  const apagados = rotacionar({ pasta, ultimos, dias })
  const midia = r.midia ? { imagens: r.midia.arquivos, bytesDeImagens: r.midia.bytes, imagensAusentes: r.midia.ausentes } : {}
  console.log(JSON.stringify({ evento: 'backup', arquivo: r.arquivo, bytes: r.bytes, sha256: r.sha256, ...r.contagens, ...midia, apagados: apagados.length }))
  // imagem que o banco cita e a pasta não tem (ou não confere) ficou fora da cópia: vale um aviso à parte, que o cron leva ao logger
  if (r.midia?.ausentes) console.error(JSON.stringify({ evento: 'backup_imagens_ausentes', arquivo: r.arquivo, imagensAusentes: r.midia.ausentes }))
} catch (e) {
  console.error(JSON.stringify({ evento: 'backup_falhou', motivo: e.message }))
  process.exit(1)
}
