// SPDX-License-Identifier: AGPL-3.0-or-later
// The client becomes a real npm package: the .tgz carries only what it should, no import leaves the package, and, installed in an empty project with
// `npm install`, it imports by name and the `rover-network` command line reads a relay. Nothing is published.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { rewriteImports } from '../../packages/client/scripts/pack.mjs'
import { projectWithPackage } from '../helpers/installed-package.js'
import { start } from '../helpers/test-server.js'
import { registeredRover } from '../helpers/test-relay.js'
import { DRAFT_REVIEW } from '../../packages/protocol/src/index.js'

const root = new URL('../../', import.meta.url).pathname
const manifest = JSON.parse(readFileSync(join(root, 'packages/client/package.json'), 'utf8'))

const run = (cmd, args, { cwd, env = {} }) => new Promise((ok) => {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env } })
  let output = ''
  let error = ''
  child.stdout.on('data', (d) => { output += d })
  child.stderr.on('data', (d) => { error += d })
  const limit = setTimeout(() => child.kill('SIGKILL'), 30_000)
  child.on('close', (code) => { clearTimeout(limit); ok({ codigo: code, saida: output, erro: error }) })
})

test('repository package.json: name, exports with types, bin, files and the guard against publishing from the wrong folder', () => {
  assert.equal(manifest.name, '@rovemark/rover-network-cliente')
  assert.equal(manifest.private, true, 'publishing from the repository folder would ship the client without the protocol')
  assert.equal(manifest.type, 'module')
  assert.equal(manifest.license, 'AGPL-3.0-or-later')
  assert.deepEqual(manifest.exports['.'], { types: './index.d.ts', default: './src/index.js' })
  assert.equal(manifest.types, './index.d.ts')
  assert.deepEqual(manifest.bin, { 'rover-network': './bin/rover-network.js' })
  assert.deepEqual([...manifest.files].sort(), ['LICENSE', 'README.md', 'README.pt-BR.md', 'bin', 'index.d.ts', 'src'])
  assert.ok(!('dependencies' in manifest), 'the package has no dependencies: only Node')
  for (const f of ['README.md', 'README.pt-BR.md', 'index.d.ts', 'bin/rover-network.js']) assert.ok(statSync(join(root, 'packages/client', f)).size > 500, f)
  assert.ok(statSync(join(root, 'packages/client/bin/rover-network.js')).mode & 0o100, 'the bin is executable')
})

test('rewriteImports: the protocol moves inside the package, and any other import that leaves the package stops the packaging', () => {
  const origin = join(root, 'packages/client/src/client.js')
  const destination = '/m/src/client.js'
  const map = (target) => (target.startsWith(join(root, 'packages/protocol/src')) ? target.replace(join(root, 'packages/protocol/src'), '/m/src/protocol') : target.startsWith(join(root, 'packages/client/src')) ? target.replace(join(root, 'packages/client'), '/m') : null)
  assert.equal(rewriteImports("import { a } from '../../protocol/src/index.js'", origin, destination, map), "import { a } from './protocol/index.js'")
  assert.equal(rewriteImports("export * from './reader.js'", origin, destination, map), "export * from './reader.js'")
  assert.equal(rewriteImports("const x = await import('../../protocol/src/keys.js')", origin, destination, map), "const x = await import('./protocol/keys.js')")
  assert.throws(() => rewriteImports("import { b } from '../../relay/src/relay.js'", origin, destination, map), /import fora do pacote/)
  assert.equal(rewriteImports("import { c } from 'node:fs'", origin, destination, map), "import { c } from 'node:fs'")
})

test('the .tgz: only src (with the protocol inside), bin, types, READMEs and license; no relative import leaves the package; no publish guard', async (t) => {
  const p = projectWithPackage()
  t.after(p.apagar)
  const { arquivos: files, nome: name } = p.pacote
  assert.equal(name, '@rovemark/rover-network-cliente')
  for (const f of files) assert.match(f, /^(package\.json|LICENSE|README(\.pt-BR)?\.md|index\.d\.ts|bin\/rover-network\.js|src\/[a-z-]+\.js|src\/protocol\/[a-z-]+\.js)$/, `unexpected file: ${f}`)
  for (const f of ['src/index.js', 'src/client.js', 'src/reader.js', 'src/protocol/index.js', 'src/protocol/objects.js', 'bin/rover-network.js', 'index.d.ts', 'LICENSE']) assert.ok(files.includes(f), `missing ${f}`)
  const installed = join(p.pasta, 'node_modules/@rovemark/rover-network-cliente')
  const js = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? js(join(dir, n)) : n.endsWith('.js') ? [join(dir, n)] : []))
  for (const f of [...js(join(installed, 'src')), ...js(join(installed, 'bin'))]) {
    assert.ok(!/from\s+['"]\.\.\/\.\.\//.test(readFileSync(f, 'utf8')), `${f} still imports from outside the package`)
  }
  const m = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'))
  assert.ok(!('private' in m), 'the assembled package is publishable (the decision to publish belongs to Rovemark)')
  assert.ok(!('scripts' in m))
})

test('installed in an empty project: imports by name, reads a real relay and the `rover-network` bin answers', async (t) => {
  const p = projectWithPackage()
  const s = await start()
  t.after(async () => { await s.fechar(); p.apagar() })
  const pipa = registeredRover(s.m, { handle: 'pipa' })

  writeFileSync(join(p.pasta, 'usar.mjs'), [
    "import { RoverClient, NetworkReader, RelayError, NotApproved, generateKeyPair } from '@rovemark/rover-network-cliente'",
    "for (const x of [RoverClient, NetworkReader, RelayError, NotApproved, generateKeyPair]) if (typeof x !== 'function') throw new Error('faltou export')",
    'const leitor = new NetworkReader({ base: process.env.RN_RELE })',
    "const p = await leitor.viewHandle('pipa')",
    'console.log(p.uid, (await leitor.info()).versaoDoRascunho)'
  ].join('\n'))
  const r = await run(process.execPath, ['usar.mjs'], { cwd: p.pasta, env: { RN_RELE: s.base } })
  assert.equal(r.codigo, 0, r.erro)
  assert.equal(r.saida.trim(), `${pipa.uid} ${DRAFT_REVIEW}`)

  const bin = join(p.pasta, 'node_modules/.bin/rover-network')
  const profile = await run(bin, ['perfil', 'pipa'], { cwd: p.pasta, env: { RN_RELE: s.base } })
  assert.equal(profile.codigo, 0, profile.erro)
  assert.equal(JSON.parse(profile.saida).uid, pipa.uid)
  const withRelay = await run(bin, ['info', '--rele', s.base], { cwd: p.pasta, env: { RN_RELE: 'http://127.0.0.1:1' } })
  assert.equal(withRelay.codigo, 0, '--rele wins over RN_RELE')
  const missing = await run(bin, ['perfil', 'ninguem.aqui'], { cwd: p.pasta, env: { RN_RELE: s.base } })
  assert.equal(missing.codigo, 1)
  assert.equal(missing.erro, 'erro 404 nao_encontrado: Não encontrado.\n')
})
