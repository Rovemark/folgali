#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Builds the client's npm package (`@rovemark/rover-network-cliente`) into a .tgz, WITHOUT publishing anything.
//
// Why it exists: in the repository the client imports the protocol by relative path (`../../protocol/src/index.js`), which does not
// work inside node_modules. Instead of touching the sources (other fronts add methods to the client at the same time), this
// script copies the client to an assembly folder, puts a copy of the protocol in `src/protocol/` and rewrites ONLY the imports that
// point to the protocol. Any relative import that leaves the package and does not go to the protocol is an error, and the script stops.
// The package has no dependency at all: only Node 22.
//
//   node packages/client/scripts/pack.mjs [--destino <folder>]      prints the path of the .tgz
//
// The repository's package.json has `"private": true` as a guard against `npm publish` by mistake from the wrong folder
// (publishing from there would send the client without the protocol). The assembly one has no guard: publishing is `npm publish <tgz>`, a decision of
// Rovemark, and no script here does it.
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const BUNDLE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = resolve(BUNDLE, '..', '..')
const PROTOCOL = join(ROOT, 'packages', 'protocol', 'src')

/** All the .js files in a folder, recursively. */
const jsFiles = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n)
  return statSync(p).isDirectory() ? jsFiles(p) : (p.endsWith('.js') ? [p] : [])
})

const inside = (parent, child) => child === parent || child.startsWith(parent + sep)
const withDot = (r) => (r.startsWith('.') ? r : `./${r}`).split(sep).join('/')
// `from '...'`, `import '...'` and `import('...')`: what a module in this repository uses
const SPECIFIER = /(\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.{1,2}\/[^'"]+)\2/g

/**
 * Rewrites the imports of a file that, in the assembly, lives at `destino` and, in the repository, lived at `origem`.
 * `mapa(alvoNoRepositorio)` returns where the target lives in the assembly, or null if the target cannot go into the package.
 */
export function rewriteImports(text, origin, destination, map) {
  return text.replace(SPECIFIER, (all, before, quotes, esp) => {
    const target = resolve(dirname(origin), esp)
    const newValue = map(target)
    if (!newValue) throw new Error(`import fora do pacote em ${relative(ROOT, origin)}: ${esp}`)
    return `${before}${quotes}${withDot(relative(dirname(destination), newValue))}${quotes}`
  })
}

export function pack({ destino: destination = process.cwd() } = {}) {
  const assembly = mkdtempSync(join(tmpdir(), 'rn-cliente-pacote-'))
  try {
    const manifest = JSON.parse(readFileSync(join(BUNDLE, 'package.json'), 'utf8'))
    delete manifest.private
    delete manifest.scripts
    writeFileSync(join(assembly, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    for (const f of ['README.md', 'README.pt-BR.md', 'index.d.ts']) cpSync(join(BUNDLE, f), join(assembly, f))
    cpSync(join(ROOT, 'LICENSE'), join(assembly, 'LICENSE'))

    // where each repository file lives in the assembly
    const map = (target) => {
      if (inside(PROTOCOL, target)) return join(assembly, 'src', 'protocol', relative(PROTOCOL, target))
      if (inside(join(BUNDLE, 'src'), target) || inside(join(BUNDLE, 'bin'), target)) return join(assembly, relative(BUNDLE, target))
      return null
    }
    const copy = (origin) => {
      const targetFile = map(origin)
      mkdirSync(dirname(targetFile), { recursive: true })
      writeFileSync(targetFile, rewriteImports(readFileSync(origin, 'utf8'), origin, targetFile, map), { mode: statSync(origin).mode })
    }
    for (const f of [...jsFiles(join(BUNDLE, 'src')), ...jsFiles(join(BUNDLE, 'bin')), ...jsFiles(PROTOCOL)]) copy(f)

    mkdirSync(destination, { recursive: true })
    const r = spawnSync('npm', ['pack', assembly, '--pack-destination', destination, '--json', '--ignore-scripts'], { encoding: 'utf8' })
    if (r.status !== 0) throw new Error(`npm pack falhou: ${r.stderr}`)
    const [info] = JSON.parse(r.stdout)
    return { arquivo: join(destination, info.filename), arquivos: info.files.map((f) => f.path).sort(), nome: info.name, versao: info.version }
  } finally {
    rmSync(assembly, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--destino')
  const { arquivo: file } = pack({ destino: i >= 0 ? resolve(process.argv[i + 1]) : process.cwd() })
  console.log(file)
}
