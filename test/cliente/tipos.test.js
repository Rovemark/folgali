// SPDX-License-Identifier: AGPL-3.0-or-later
// `packages/cliente/index.d.ts` é escrito à mão, então pode ficar para trás do código. Duas travas:
// 1. todo export do pacote e todo método público de cada classe tem declaração no .d.ts (método novo sem tipo quebra aqui);
// 2. o tsc (o do site, em packages/site/node_modules) compila um exemplo que usa a API e RECUSA um exemplo com uso errado, importando
//    pelo nome do pacote, como um projeto de fora faria. Sem o tsc instalado, a trava 2 é pulada e diz por quê.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as pacote from '../../packages/cliente/src/index.js'

const raiz = new URL('../../', import.meta.url).pathname
const dts = readFileSync(join(raiz, 'packages/cliente/index.d.ts'), 'utf8')

/** Os nomes de método declarados no corpo de `export class Nome ... {` (até a chave que fecha na coluna zero). */
function metodosDeclarados(classe) {
  const ini = dts.search(new RegExp(`^export class ${classe}\\b`, 'm'))
  assert.ok(ini >= 0, `classe ${classe} sem declaração`)
  const corpo = dts.slice(ini, dts.indexOf('\n}', ini))
  return new Set([...corpo.matchAll(/^\s+(\w+)\(/gm)].map((m) => m[1]))
}

test('todo export do pacote tem declaração no index.d.ts', () => {
  const declarados = new Set([...dts.matchAll(/^export (?:declare )?(?:class|function|const|interface|type) (\w+)/gm)].map((m) => m[1]))
  for (const nome of Object.keys(pacote)) assert.ok(declarados.has(nome), `${nome} é exportado e não tem tipo`)
  for (const nome of declarados) {
    if (/^[A-Z]/.test(nome) && !(nome in pacote)) {
      // tipos de dado (interface/type) não existem em tempo de execução; classes e funções têm de existir
      assert.ok(!new RegExp(`^export class ${nome}\\b`, 'm').test(dts), `${nome} declarado como classe e não exportado`)
    }
  }
  for (const m of dts.matchAll(/^export function (\w+)/gm)) assert.equal(typeof pacote[m[1]], 'function', m[1])
})

for (const classe of ['ClienteRover', 'LeitorDaRede', 'PessoaDoRover', 'AprovadorDeTeste', 'ErroDeRele', 'NaoAprovado']) {
  test(`${classe}: todo método público tem declaração`, () => {
    const declarados = metodosDeclarados(classe)
    const metodos = Object.getOwnPropertyNames(pacote[classe].prototype).filter((n) => n !== 'constructor' && typeof pacote[classe].prototype[n] === 'function')
    for (const m of metodos) assert.ok(declarados.has(m), `${classe}.${m} sem tipo no index.d.ts`)
    for (const d of declarados) if (d !== 'constructor') assert.ok(metodos.includes(d), `${classe}.${d} declarado mas não existe`)
  })
}

// os campos das instâncias de erro (o agente lê `e.codigo`, `e.retryAfterSegundos`): todo campo próprio tem tipo declarado
test('ErroDeRele e NaoAprovado: todo campo da instância tem declaração', () => {
  const casos = [
    ['ErroDeRele', new pacote.ErroDeRele(429, { erro: { codigo: 'limite_de_taxa', mensagem: 'x', campo: 'y' } }, new Headers({ 'retry-after': '7' }))],
    ['NaoAprovado', new pacote.NaoAprovado()]
  ]
  for (const [classe, instancia] of casos) {
    const ini = dts.search(new RegExp(`^export class ${classe}\\b`, 'm'))
    const corpo = dts.slice(ini, dts.indexOf('\n}', ini))
    const campos = new Set([...corpo.matchAll(/^ {2}(?:readonly )?(\w+)\??:/gm)].map((m) => m[1]))
    for (const nome of Object.keys(instancia)) assert.ok(campos.has(nome), `${classe}.${nome} existe na instância e não tem tipo no index.d.ts`)
  }
})

const TSC = join(raiz, 'packages/site/node_modules/typescript/bin/tsc')
const TIPOS = join(raiz, 'packages/site/node_modules/@types')

const BOM = `
import { readFileSync } from 'node:fs'
import { ClienteRover, ErroDeRele, LeitorDaRede, NaoAprovado, chavePrivadaDeSemente, criarAprovacaoHumana, gerarParDeChaves } from '@rovemark/rover-network-cliente'
import type { AprovacaoHumana, AtestadoDeHandle, Objeto } from '@rovemark/rover-network-cliente'

const leitor = new LeitorDaRede({ base: 'http://127.0.0.1:4747' })
const info = await leitor.info()
const versao: string = info.versaoDoRascunho
const perfil = await leitor.verHandle('pipa')
const linha = await leitor.linhaDe(perfil.uid, { limite: 2 })
const textos: unknown[] = linha.itens.map((e) => e.objeto.corpo.texto)
const tudo = await leitor.busca('pastas')
const contagem: number = tudo.topicos.length + tudo.rovers.length
const lista = await leitor.busca('pastas', { tipo: 'topicos', limite: 5 })
const proximo: number | null = lista.proximo
const comunidades = await leitor.comunidades({ ordem: 'ativas' })
const membros: number = comunidades.itens[0].membros

const aprovacao = gerarParDeChaves()
const aprovador = { aprovar: async (o: Objeto): Promise<AprovacaoHumana | null> => criarAprovacaoHumana({ chavePrivadaDeAprovacao: aprovacao.chavePrivada, objeto: o.id, autor: o.autor, aprovadoEm: o.criadoEm }) }
const atestado = JSON.parse(readFileSync('atestado.json', 'utf8')) as AtestadoDeHandle
const cliente = new ClienteRover({ base: 'http://127.0.0.1:4747', uid: atestado.uid, chavePrivada: chavePrivadaDeSemente(Buffer.alloc(32)), atestado, aprovador })
try {
  const r = await cliente.postar({ texto: 'oi', topicos: ['teste'] })
  const estado: 'aceito' | 'duplicado' | 'recebida' = r.estado
  console.log(versao, textos, contagem, proximo, membros, estado, r.objeto.id)
} catch (e) {
  if (e instanceof NaoAprovado) console.log(e.name)
  else if (e instanceof ErroDeRele) {
    const espera: number | null = e.retryAfterSegundos
    console.log(e.status, e.codigo, e.campo, espera)
  }
}
export {}
`
// cada linha é um erro que o tsc PRECISA acusar
const RUIM = `
import { ClienteRover, LeitorDaRede } from '@rovemark/rover-network-cliente'
const semBase = new LeitorDaRede({})
const leitor = new LeitorDaRede({ base: 'http://127.0.0.1:4747' })
const n: number = (await leitor.info()).versaoDoRascunho
const inexistente = await leitor.apagarTudo()
const semChave = new ClienteRover({ base: 'x', uid: 'y' })
console.log(semBase, n, inexistente, semChave)
export {}
`

test('tsc --noEmit: um projeto de fora compila contra o index.d.ts, e o uso errado é recusado', (t) => {
  if (!existsSync(TSC) || !existsSync(join(TIPOS, 'node'))) {
    t.skip('sem typescript e @types/node em packages/site/node_modules (crie o link descrito no brief); a trava dos tipos não rodou')
    return
  }
  const pasta = mkdtempSync(join(tmpdir(), 'rn-tipos-'))
  t.after(() => rmSync(pasta, { recursive: true, force: true }))
  mkdirSync(join(pasta, 'node_modules/@rovemark'), { recursive: true })
  symlinkSync(join(raiz, 'packages/cliente'), join(pasta, 'node_modules/@rovemark/rover-network-cliente'))
  writeFileSync(join(pasta, 'package.json'), JSON.stringify({ name: 'tipos', private: true, type: 'module' }))
  const tsconfig = (arquivo) => JSON.stringify({
    compilerOptions: { target: 'es2022', module: 'nodenext', moduleResolution: 'nodenext', strict: true, noEmit: true, skipLibCheck: false, typeRoots: [TIPOS], types: ['node'] },
    files: [arquivo]
  })
  writeFileSync(join(pasta, 'bom.mts'), BOM)
  writeFileSync(join(pasta, 'ruim.mts'), RUIM)
  writeFileSync(join(pasta, 'tsconfig.bom.json'), tsconfig('bom.mts'))
  writeFileSync(join(pasta, 'tsconfig.ruim.json'), tsconfig('ruim.mts'))

  const bom = spawnSync(process.execPath, [TSC, '-p', 'tsconfig.bom.json'], { cwd: pasta, encoding: 'utf8' })
  assert.equal(bom.status, 0, `o exemplo certo não compilou:\n${bom.stdout}${bom.stderr}`)

  const ruim = spawnSync(process.execPath, [TSC, '-p', 'tsconfig.ruim.json'], { cwd: pasta, encoding: 'utf8' })
  assert.notEqual(ruim.status, 0, 'o tsc aceitou uso errado: a trava não morde')
  const linhas = new Set([...ruim.stdout.matchAll(/ruim\.mts\((\d+),/g)].map((m) => Number(m[1])))
  assert.deepEqual([...linhas].sort((a, b) => a - b), [3, 5, 6, 7], ruim.stdout)
})
