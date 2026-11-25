#!/usr/bin/env node
// Preview local da folgali em http://127.0.0.1:3911 (demonstração, dados inventados, noindex).
// Faz o build se ainda não existe, monta o standalone como o Dockerfile faz e sobe o servidor.
// Uso: npm run preview [-- --porta 3912]   (Ctrl+C encerra)

import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const i = process.argv.indexOf('--porta')
const porta = i >= 0 ? process.argv[i + 1] : '3911'
const sa = join(raiz, '.next', 'standalone')

if (!existsSync(join(sa, 'server.js')) || process.argv.includes('--rebuild')) {
  console.log('Construindo o site (uns 30 segundos)...')
  const b = spawnSync('npx', ['next', 'build'], { cwd: raiz, stdio: 'inherit' })
  if (b.status !== 0) process.exit(b.status ?? 1)
}
rmSync(join(sa, 'public'), { recursive: true, force: true })
rmSync(join(sa, '.next', 'static'), { recursive: true, force: true })
cpSync(join(raiz, 'public'), join(sa, 'public'), { recursive: true })
mkdirSync(join(sa, '.next'), { recursive: true })
cpSync(join(raiz, '.next', 'static'), join(sa, '.next', 'static'), { recursive: true })

console.log(`\nfolgali (demonstração): http://127.0.0.1:${porta}/pt\nFeed: http://127.0.0.1:${porta}/pt/linha\nEncerrar: Ctrl+C\n`)
const s = spawn('node', ['server.js'], { cwd: sa, stdio: 'inherit', env: { ...process.env, PORT: porta, HOSTNAME: '127.0.0.1' } })
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => s.kill(sig))
s.on('exit', (c) => process.exit(c ?? 0))
