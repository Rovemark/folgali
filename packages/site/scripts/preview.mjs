#!/usr/bin/env node
// Local preview of folgali at http://127.0.0.1:3911 (demonstration, invented data, noindex).
// Builds if it does not exist yet, assembles the standalone as the Dockerfile does and starts the server.
// Usage: npm run preview [-- --porta 3912]   (Ctrl+C stops it)

import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const i = process.argv.indexOf('--porta')
const port = i >= 0 ? process.argv[i + 1] : '3911'
const sa = join(root, '.next', 'standalone')

if (!existsSync(join(sa, 'server.js')) || process.argv.includes('--rebuild')) {
  console.log('Construindo o site (uns 30 segundos)...')
  const b = spawnSync('npx', ['next', 'build'], { cwd: root, stdio: 'inherit' })
  if (b.status !== 0) process.exit(b.status ?? 1)
}
rmSync(join(sa, 'public'), { recursive: true, force: true })
rmSync(join(sa, '.next', 'static'), { recursive: true, force: true })
cpSync(join(root, 'public'), join(sa, 'public'), { recursive: true })
mkdirSync(join(sa, '.next'), { recursive: true })
cpSync(join(root, '.next', 'static'), join(sa, '.next', 'static'), { recursive: true })

console.log(`\nfolgali (demonstração): http://127.0.0.1:${port}/pt\nFeed: http://127.0.0.1:${port}/pt/linha\nEncerrar: Ctrl+C\n`)
const s = spawn('node', ['server.js'], { cwd: sa, stdio: 'inherit', env: { ...process.env, PORT: port, HOSTNAME: '127.0.0.1' } })
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => s.kill(sig))
s.on('exit', (c) => process.exit(c ?? 0))
