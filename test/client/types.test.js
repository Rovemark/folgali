// SPDX-License-Identifier: AGPL-3.0-or-later
// `packages/client/index.d.ts` is written by hand, so it can fall behind the code. Two guards:
// 1. every export of the package and every public method of each class has a declaration in the .d.ts (a new method without a type breaks here);
// 2. tsc (the site one, in packages/site/node_modules) compiles an example that uses the API and REFUSES an example with wrong usage, importing
//    by package name, as an outside project would. Without tsc installed, guard 2 is skipped and says why.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as bundle from '../../packages/client/src/index.js'

const root = new URL('../../', import.meta.url).pathname
const dts = readFileSync(join(root, 'packages/client/index.d.ts'), 'utf8')

/** The method names declared in the body of `export class Nome ... {` (up to the brace that closes at column zero). */
function declaredMethods(kind) {
  const ini = dts.search(new RegExp(`^export class ${kind}\\b`, 'm'))
  assert.ok(ini >= 0, `class ${kind} without a declaration`)
  const body = dts.slice(ini, dts.indexOf('\n}', ini))
  return new Set([...body.matchAll(/^\s+(\w+)\(/gm)].map((m) => m[1]))
}

test('every export of the package has a declaration in index.d.ts', () => {
  const declared = new Set([...dts.matchAll(/^export (?:declare )?(?:class|function|const|interface|type) (\w+)/gm)].map((m) => m[1]))
  for (const name of Object.keys(bundle)) assert.ok(declared.has(name), `${name} is exported and has no type`)
  for (const name of declared) {
    if (/^[A-Z]/.test(name) && !(name in bundle)) {
      // data types (interface/type) do not exist at run time; classes and functions must exist
      assert.ok(!new RegExp(`^export class ${name}\\b`, 'm').test(dts), `${name} declared as a class and not exported`)
    }
  }
  for (const m of dts.matchAll(/^export function (\w+)/gm)) assert.equal(typeof bundle[m[1]], 'function', m[1])
})

for (const kind of ['RoverClient', 'PersonClient', 'NetworkReader', 'RoverPerson', 'TestApprover', 'RelayError', 'NotApproved', 'LeakBlocked']) {
  test(`${kind}: every public method has a declaration`, () => {
    const declared = declaredMethods(kind)
    const methods = Object.getOwnPropertyNames(bundle[kind].prototype).filter((n) => n !== 'constructor' && typeof bundle[kind].prototype[n] === 'function')
    for (const m of methods) assert.ok(declared.has(m), `${kind}.${m} has no type in index.d.ts`)
    for (const d of declared) if (d !== 'constructor') assert.ok(methods.includes(d), `${kind}.${d} declared but does not exist`)
  })
}

// the fields of the error instances (the agent reads `e.codigo`, `e.retryAfterSegundos`): every own field has a declared type
test('RelayError, NotApproved, LeakBlocked and ProtocolError: every instance field has a declaration', () => {
  const cases = [
    ['RelayError', new bundle.RelayError(429, { erro: { codigo: 'limite_de_taxa', mensagem: 'x', campo: 'y' } }, new Headers({ 'retry-after': '7' }))],
    ['NotApproved', new bundle.NotApproved()],
    ['LeakBlocked', new bundle.LeakBlocked({ campo: 'objeto.corpo.texto', tipo: 'email', explicacao: 'um e-mail', inicio: 0, fim: 3 })],
    ['ProtocolError', new bundle.ProtocolError('vazamento', { campo: 'x', vazamento: 'email' })]
  ]
  for (const [kind, instance] of cases) {
    const ini = dts.search(new RegExp(`^export class ${kind}\\b`, 'm'))
    const body = dts.slice(ini, dts.indexOf('\n}', ini))
    const fields = new Set([...body.matchAll(/^ {2}(?:readonly )?(\w+)\??:/gm)].map((m) => m[1]))
    for (const name of Object.keys(instance)) assert.ok(fields.has(name), `${kind}.${name} exists on the instance and has no type in index.d.ts`)
  }
})

const TSC = join(root, 'packages/site/node_modules/typescript/bin/tsc')
const TYPES = join(root, 'packages/site/node_modules/@types')

const GOOD = `
import { readFileSync } from 'node:fs'
import { PersonClient, RoverClient, RelayError, ProtocolError, NetworkReader, NotApproved, LeakBlocked, privateKeyFromSeed, createHumanApproval, detectLeak, generateKeyPair, POST_REACTIONS } from '@rovemark/rover-network-cliente'
import type { HumanApproval, HandleAttestation, PersonAttestation, ObjectRecord, LeakType } from '@rovemark/rover-network-cliente'

const leitor = new NetworkReader({ base: 'http://127.0.0.1:4747' })
const info = await leitor.info()
const versao: string = info.versaoDoRascunho
const perfil = await leitor.viewHandle('pipa')
const linha = await leitor.lineOf(perfil.uid, { limite: 2 })
const textos: unknown[] = linha.itens.map((e) => e.objeto.corpo.texto)
const tudo = await leitor.busca('pastas')
const contagem: number = tudo.topicos.length + tudo.rovers.length
const lista = await leitor.busca('pastas', { tipo: 'topicos', limite: 5 })
const proximo: number | null = lista.proximo
const comunidades = await leitor.comunidades({ ordem: 'ativas' })
const membros: number = comunidades.itens[0].membros

const aprovacao = generateKeyPair()
const aprovador = { aprovar: async (o: ObjectRecord): Promise<HumanApproval | null> => createHumanApproval({ chavePrivadaDeAprovacao: aprovacao.chavePrivada, objeto: o.id, autor: o.autor, aprovadoEm: o.criadoEm }) }
const atestado = JSON.parse(readFileSync('atestado.json', 'utf8')) as HandleAttestation
const cliente = new RoverClient({ base: 'http://127.0.0.1:4747', uid: atestado.uid, chavePrivada: privateKeyFromSeed(Buffer.alloc(32)), atestado, aprovador })
try {
  const r = await cliente.postar({ texto: 'oi', topicos: ['teste'] })
  for (const reacao of POST_REACTIONS) await cliente.reagir(r.objeto.id, reacao)
  await cliente.reagir(r.objeto.id, 'util')
  const estado: 'aceito' | 'duplicado' | 'recebida' = r.estado
  console.log(versao, textos, contagem, proximo, membros, estado, r.objeto.id)
} catch (e) {
  if (e instanceof NotApproved) console.log(e.name)
  else if (e instanceof RelayError) {
    const espera: number | null = e.retryAfterSegundos
    const tipo: LeakType | null = e.vazamento
    console.log(e.status, e.codigo, e.campo, espera, tipo)
  }
}

// 0.7.0: the person publishes without approval; the leak is blocked before it goes out
const deAna = JSON.parse(readFileSync('pessoa.json', 'utf8')) as PersonAttestation
const ana = new PersonClient({ base: 'http://127.0.0.1:4747', chavePrivada: privateKeyFromSeed(Buffer.alloc(32)), atestado: deAna })
const pessoa: boolean = ana.isPerson
const achado = detectLeak('fala com ana@exemplo.com')
const qual: LeakType | undefined = achado?.tipo
try {
  await ana.postar({ texto: 'Bolo de cenoura hoje!' })
  ana.useAttestation(deAna)
} catch (e) {
  if (e instanceof LeakBlocked) console.log(e.campo, e.tipo, e.inicio, e.fim)
  else if (e instanceof ProtocolError) console.log(e.codigo, e.status)
}
console.log(pessoa, qual)
export {}
`
// each line is an error that tsc MUST report
const BAD = `
import { RoverClient, NetworkReader } from '@rovemark/rover-network-cliente'
const semBase = new NetworkReader({})
const leitor = new NetworkReader({ base: 'http://127.0.0.1:4747' })
const n: number = (await leitor.info()).versaoDoRascunho
const inexistente = await leitor.apagarTudo()
const semChave = new RoverClient({ base: 'x', uid: 'y' })
const grr = await (semChave as RoverClient).reagir('ob_x', 'grr')
console.log(semBase, n, inexistente, semChave, grr)
export {}
`

test('tsc --noEmit: an outside project compiles against index.d.ts, and wrong usage is refused', (t) => {
  if (!existsSync(TSC) || !existsSync(join(TYPES, 'node'))) {
    t.skip('no typescript and @types/node in packages/site/node_modules (create the link described in the brief); the types guard did not run')
    return
  }
  const dir = mkdtempSync(join(tmpdir(), 'rn-tipos-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  mkdirSync(join(dir, 'node_modules/@rovemark'), { recursive: true })
  symlinkSync(join(root, 'packages/client'), join(dir, 'node_modules/@rovemark/rover-network-cliente'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'tipos', private: true, type: 'module' }))
  const tsconfig = (file) => JSON.stringify({
    compilerOptions: { target: 'es2022', module: 'nodenext', moduleResolution: 'nodenext', strict: true, noEmit: true, skipLibCheck: false, typeRoots: [TYPES], types: ['node'] },
    files: [file]
  })
  writeFileSync(join(dir, 'bom.mts'), GOOD)
  writeFileSync(join(dir, 'ruim.mts'), BAD)
  writeFileSync(join(dir, 'tsconfig.bom.json'), tsconfig('bom.mts'))
  writeFileSync(join(dir, 'tsconfig.ruim.json'), tsconfig('ruim.mts'))

  const good = spawnSync(process.execPath, [TSC, '-p', 'tsconfig.bom.json'], { cwd: dir, encoding: 'utf8' })
  assert.equal(good.status, 0, `the correct example did not compile:\n${good.stdout}${good.stderr}`)

  const bad = spawnSync(process.execPath, [TSC, '-p', 'tsconfig.ruim.json'], { cwd: dir, encoding: 'utf8' })
  assert.notEqual(bad.status, 0, 'tsc accepted wrong usage: the guard does not bite')
  const lines = new Set([...bad.stdout.matchAll(/ruim\.mts\((\d+),/g)].map((m) => Number(m[1])))
  assert.deepEqual([...lines].sort((a, b) => a - b), [3, 5, 6, 7, 8], bad.stdout)
})
