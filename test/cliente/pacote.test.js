// SPDX-License-Identifier: AGPL-3.0-or-later
// O cliente vira um pacote npm de verdade: o .tgz leva só o que deve, nenhum import sai do pacote, e, instalado num projeto vazio com
// `npm install`, ele importa pelo nome e a linha de comando `rover-network` lê um relé. Nada é publicado.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { reescreverImports } from '../../packages/cliente/scripts/empacotar.mjs'
import { projetoComPacote } from '../ajuda/pacote-instalado.js'
import { subir } from '../ajuda/servidor-de-teste.js'
import { roverRegistrado } from '../ajuda/rele-de-teste.js'
import { REVISAO_DO_RASCUNHO } from '../../packages/protocolo/src/index.js'

const raiz = new URL('../../', import.meta.url).pathname
const manifesto = JSON.parse(readFileSync(join(raiz, 'packages/cliente/package.json'), 'utf8'))

const rodar = (cmd, args, { cwd, env = {} }) => new Promise((ok) => {
  const filho = spawn(cmd, args, { cwd, env: { ...process.env, ...env } })
  let saida = ''
  let erro = ''
  filho.stdout.on('data', (d) => { saida += d })
  filho.stderr.on('data', (d) => { erro += d })
  const limite = setTimeout(() => filho.kill('SIGKILL'), 30_000)
  filho.on('close', (codigo) => { clearTimeout(limite); ok({ codigo, saida, erro }) })
})

test('package.json do repositório: nome, exports com tipos, bin, files e a trava contra publicar da pasta errada', () => {
  assert.equal(manifesto.name, '@rovemark/rover-network-cliente')
  assert.equal(manifesto.private, true, 'publicar da pasta do repositório mandaria o cliente sem o protocolo')
  assert.equal(manifesto.type, 'module')
  assert.equal(manifesto.license, 'AGPL-3.0-or-later')
  assert.deepEqual(manifesto.exports['.'], { types: './index.d.ts', default: './src/index.js' })
  assert.equal(manifesto.types, './index.d.ts')
  assert.deepEqual(manifesto.bin, { 'rover-network': './bin/rover-network.js' })
  assert.deepEqual([...manifesto.files].sort(), ['LICENSE', 'README.en.md', 'README.md', 'bin', 'index.d.ts', 'src'])
  assert.ok(!('dependencies' in manifesto), 'o pacote não tem dependência: só o Node')
  for (const f of ['README.md', 'README.en.md', 'index.d.ts', 'bin/rover-network.js']) assert.ok(statSync(join(raiz, 'packages/cliente', f)).size > 500, f)
  assert.ok(statSync(join(raiz, 'packages/cliente/bin/rover-network.js')).mode & 0o100, 'o bin é executável')
})

test('reescreverImports: o protocolo passa para dentro do pacote, e qualquer outro import que saia do pacote para o empacotamento', () => {
  const origem = join(raiz, 'packages/cliente/src/cliente.js')
  const destino = '/m/src/cliente.js'
  const mapa = (alvo) => (alvo.startsWith(join(raiz, 'packages/protocolo/src')) ? alvo.replace(join(raiz, 'packages/protocolo/src'), '/m/src/protocolo') : alvo.startsWith(join(raiz, 'packages/cliente/src')) ? alvo.replace(join(raiz, 'packages/cliente'), '/m') : null)
  assert.equal(reescreverImports("import { a } from '../../protocolo/src/index.js'", origem, destino, mapa), "import { a } from './protocolo/index.js'")
  assert.equal(reescreverImports("export * from './leitor.js'", origem, destino, mapa), "export * from './leitor.js'")
  assert.equal(reescreverImports("const x = await import('../../protocolo/src/chaves.js')", origem, destino, mapa), "const x = await import('./protocolo/chaves.js')")
  assert.throws(() => reescreverImports("import { b } from '../../rele/src/rele.js'", origem, destino, mapa), /import fora do pacote/)
  assert.equal(reescreverImports("import { c } from 'node:fs'", origem, destino, mapa), "import { c } from 'node:fs'")
})

test('o .tgz: só src (com o protocolo dentro), bin, tipos, READMEs e licença; nenhum import relativo sai do pacote; sem trava de publicar', async (t) => {
  const p = projetoComPacote()
  t.after(p.apagar)
  const { arquivos, nome } = p.pacote
  assert.equal(nome, '@rovemark/rover-network-cliente')
  for (const f of arquivos) assert.match(f, /^(package\.json|LICENSE|README(\.en)?\.md|index\.d\.ts|bin\/rover-network\.js|src\/[a-z-]+\.js|src\/protocolo\/[a-z-]+\.js)$/, `arquivo inesperado: ${f}`)
  for (const f of ['src/index.js', 'src/cliente.js', 'src/leitor.js', 'src/protocolo/index.js', 'src/protocolo/objetos.js', 'bin/rover-network.js', 'index.d.ts', 'LICENSE']) assert.ok(arquivos.includes(f), `faltou ${f}`)
  const instalado = join(p.pasta, 'node_modules/@rovemark/rover-network-cliente')
  const js = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? js(join(dir, n)) : n.endsWith('.js') ? [join(dir, n)] : []))
  for (const f of [...js(join(instalado, 'src')), ...js(join(instalado, 'bin'))]) {
    assert.ok(!/from\s+['"]\.\.\/\.\.\//.test(readFileSync(f, 'utf8')), `${f} ainda importa de fora do pacote`)
  }
  const m = JSON.parse(readFileSync(join(instalado, 'package.json'), 'utf8'))
  assert.ok(!('private' in m), 'o pacote montado é publicável (a decisão de publicar é do Arquiteto)')
  assert.ok(!('scripts' in m))
})

test('instalado num projeto vazio: importa pelo nome, lê um relé de verdade e o bin `rover-network` responde', async (t) => {
  const p = projetoComPacote()
  const s = await subir()
  t.after(async () => { await s.fechar(); p.apagar() })
  const pipa = roverRegistrado(s.m, { handle: 'pipa' })

  writeFileSync(join(p.pasta, 'usar.mjs'), [
    "import { ClienteRover, LeitorDaRede, ErroDeRele, NaoAprovado, gerarParDeChaves } from '@rovemark/rover-network-cliente'",
    "for (const x of [ClienteRover, LeitorDaRede, ErroDeRele, NaoAprovado, gerarParDeChaves]) if (typeof x !== 'function') throw new Error('faltou export')",
    'const leitor = new LeitorDaRede({ base: process.env.RN_RELE })',
    "const p = await leitor.verHandle('pipa')",
    'console.log(p.uid, (await leitor.info()).versaoDoRascunho)'
  ].join('\n'))
  const r = await rodar(process.execPath, ['usar.mjs'], { cwd: p.pasta, env: { RN_RELE: s.base } })
  assert.equal(r.codigo, 0, r.erro)
  assert.equal(r.saida.trim(), `${pipa.uid} ${REVISAO_DO_RASCUNHO}`)

  const bin = join(p.pasta, 'node_modules/.bin/rover-network')
  const perfil = await rodar(bin, ['perfil', 'pipa'], { cwd: p.pasta, env: { RN_RELE: s.base } })
  assert.equal(perfil.codigo, 0, perfil.erro)
  assert.equal(JSON.parse(perfil.saida).uid, pipa.uid)
  const comRele = await rodar(bin, ['info', '--rele', s.base], { cwd: p.pasta, env: { RN_RELE: 'http://127.0.0.1:1' } })
  assert.equal(comRele.codigo, 0, '--rele vence RN_RELE')
  const falta = await rodar(bin, ['perfil', 'ninguem.aqui'], { cwd: p.pasta, env: { RN_RELE: s.base } })
  assert.equal(falta.codigo, 1)
  assert.equal(falta.erro, 'erro 404 nao_encontrado: Não encontrado.\n')
})
