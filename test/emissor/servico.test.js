// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.6.0: o emissor aberto como SERVIÇO: o executável sobe sozinho e falha fechado, /saude responde, o backup do banco é consistente e
// rotacionado, e o Dockerfile é o de um serviço próprio (só protocolo e emissor, sem segredo, sem VOLUME, usuário sem privilégio).
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { criarRegistroDeAgente, gerarParDeChaves } from '../../packages/protocolo/src/index.js'
import { EmissorAberto } from '../../packages/emissor-aberto/src/emissor.js'
import { conferir, fazerBackup, nomeDoBackup, rotacionar } from '../../packages/emissor-aberto/src/backup.js'
import { novoHandle } from '../ajuda/mundo.js'

const raiz = new URL('../../', import.meta.url).pathname
const BIN = join(raiz, 'packages/emissor-aberto/bin/emissor-aberto.js')
const BACKUP = join(raiz, 'packages/emissor-aberto/bin/backup.js')
const NODE = ['--disable-warning=ExperimentalWarning']
const base = { PATH: process.env.PATH, HOME: process.env.HOME }
const portaLivre = () => new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)) }) })
const configBoa = (pasta, porta) => ({
  ...base, EMISSOR_CHAVE: randomBytes(32).toString('hex'), EMISSOR_SEGREDO: randomBytes(32).toString('hex'), EMISSOR_DONOS: gerarParDeChaves().chavePublica,
  EMISSOR_LINK: 'https://folgali.test/reivindicar/', EMISSOR_RELE: 'http://127.0.0.1:9', EMISSOR_BANCO: join(pasta, 'dados', 'emissor.sqlite'), EMISSOR_PORTA: String(porta)
})

test('o executável falha fechado: sem chave, segredo, donos, link ou relé não sobe, e a mensagem não ecoa segredo', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'rn-emissor-'))
  try {
    const boa = configBoa(pasta, 1)
    for (const falta of ['EMISSOR_CHAVE', 'EMISSOR_SEGREDO', 'EMISSOR_DONOS', 'EMISSOR_LINK', 'EMISSOR_RELE']) {
      const env = { ...boa }
      delete env[falta]
      const r = spawnSync(process.execPath, [...NODE, BIN], { env, encoding: 'utf8', timeout: 20_000 })
      assert.equal(r.status, 2, falta)
      assert.match(r.stderr, new RegExp(falta))
      assert.ok(!r.stderr.includes(boa.EMISSOR_SEGREDO) && !r.stderr.includes(boa.EMISSOR_CHAVE))
    }
    assert.ok(!existsSync(join(pasta, 'dados')), 'nada foi criado')
  } finally { rmSync(pasta, { recursive: true, force: true }) }
})

test('o executável sobe, responde /saude e as rotas de agentes, não põe segredo no log e fecha limpo com SIGTERM', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'rn-emissor-'))
  const porta = await portaLivre()
  const env = configBoa(pasta, porta)
  const filho = spawn(process.execPath, [...NODE, BIN], { env, stdio: ['ignore', 'ignore', 'pipe'] })
  let log = ''
  filho.stderr.on('data', (d) => { log += d })
  const fim = new Promise((ok) => filho.on('close', ok))
  try {
    const inicio = Date.now()
    while (!log.includes('"ouvindo"')) {
      if (Date.now() - inicio > 15_000) throw new Error(`o emissor não subiu: ${log}`)
      await new Promise((ok) => setTimeout(ok, 40))
    }
    const saude = await (await fetch(`http://127.0.0.1:${porta}/saude`)).json()
    assert.equal(saude.ok, true)
    const info = await (await fetch(`http://127.0.0.1:${porta}/v1/agentes/info`)).json()
    assert.equal(info.emissor, saude.emissor)
    // o relé configurado não responde: o registro é recusado com 503 (não emite @ às cegas)
    const rede = gerarParDeChaves()
    const registro = criarRegistroDeAgente({ chavePrivada: rede.chavePrivada, chave: rede.chavePublica, handle: novoHandle(), nome: 'Bot', criadoEm: Math.floor(Date.now() / 1000) })
    const r = await fetch(`http://127.0.0.1:${porta}/v1/agentes/registro`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ registro }) })
    assert.equal(r.status, 503)
    assert.equal(r.headers.get('retry-after'), '30')
    for (const segredo of [env.EMISSOR_CHAVE, env.EMISSOR_SEGREDO]) assert.ok(!log.includes(segredo))
    const pedidosNoLog = () => log.split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((l) => l.evento === 'pedido')
    // o log do pedido sai depois da resposta: espera os três chegarem
    for (let i = 0; i < 100 && pedidosNoLog().length < 3; i++) await new Promise((ok) => setTimeout(ok, 20))
    const pedidos = pedidosNoLog()
    assert.equal(pedidos.length, 3)
    for (const p of pedidos) assert.deepEqual(Object.keys(p).sort(), ['evento', 'metodo', 'ms', 'nivel', 'rota', 'status', 't'], 'o log de pedido não traz endereço nem cabeçalho')
    assert.ok(statSync(join(pasta, 'dados')).mode % 0o1000 === 0o700, 'a pasta do banco é 0700')
  } finally {
    filho.kill('SIGTERM') // só o processo que este teste criou
    assert.equal(await fim, 0)
    rmSync(pasta, { recursive: true, force: true })
  }
})

test('backup: cópia consistente, conferida e com sha256; nome provisório nunca sobra; rotação guarda as N mais novas', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'rn-emissor-bkp-'))
  try {
    const banco = join(pasta, 'emissor.sqlite')
    const e = new EmissorAberto({ chavePrivada: gerarParDeChaves().chavePrivada, segredo: randomBytes(32), emissoresDeDonos: ['A'.repeat(43)], linkDeReivindicacao: 'https://x.test/r/', banco })
    const rede = gerarParDeChaves()
    await e.registrar({ registro: criarRegistroDeAgente({ chavePrivada: rede.chavePrivada, chave: rede.chavePublica, handle: novoHandle(), nome: 'Bot', criadoEm: Math.floor(Date.now() / 1000) }) })
    const destino = join(pasta, 'backups')
    const t0 = Date.UTC(2026, 10, 24, 12, 0, 0)
    const r = fazerBackup({ banco, pasta: destino, agora: new Date(t0) })
    assert.equal(r.arquivo, 'emissor-20261124-120000.sqlite')
    assert.deepEqual(r.contagens, { agentes: 1, atos_vistos: 0, entregas_pendentes: 0 })
    const bytes = readFileSync(join(destino, r.arquivo))
    assert.equal(readFileSync(join(destino, `${r.arquivo}.sha256`), 'utf8'), `${r.sha256}  ${r.arquivo}\n`)
    assert.equal(statSync(join(destino, r.arquivo)).mode % 0o1000, 0o600)
    assert.equal(bytes.length, r.bytes)
    assert.throws(() => fazerBackup({ banco, pasta: destino, agora: new Date(t0) }), /mesmo segundo/)
    for (let i = 1; i <= 4; i++) fazerBackup({ banco, pasta: destino, agora: new Date(t0 + i * 1000) })
    assert.deepEqual(rotacionar({ pasta: destino, ultimos: 2 }), ['emissor-20261124-120002.sqlite', 'emissor-20261124-120001.sqlite', 'emissor-20261124-120000.sqlite'])
    assert.deepEqual(readdirSync(destino).sort(), ['emissor-20261124-120003.sqlite', 'emissor-20261124-120003.sqlite.sha256', 'emissor-20261124-120004.sqlite', 'emissor-20261124-120004.sqlite.sha256'])
    assert.ok(!readdirSync(destino).some((n) => n.endsWith('.parcial')))
    // banco que não é do emissor: a conferência recusa e nada fica para trás
    const alheio = join(pasta, 'alheio.sqlite')
    new DatabaseSync(alheio).exec('CREATE TABLE x (a); INSERT INTO x VALUES (1);')
    assert.throws(() => fazerBackup({ banco: alheio, pasta: destino, agora: new Date(t0 + 9000) }), /tabela agentes/)
    assert.ok(!readdirSync(destino).some((n) => n.includes('120009')))
    assert.throws(() => conferir(alheio), /tabela agentes/)
    assert.throws(() => fazerBackup({ banco: join(pasta, 'nao-existe.sqlite'), pasta: destino }), /não existe/)
    assert.equal(nomeDoBackup(new Date(t0)), 'emissor-20261124-120000.sqlite')
    // o executável de backup, como no contêiner
    const b = spawnSync(process.execPath, [...NODE, BACKUP], { env: { ...base, EMISSOR_BANCO: banco, EMISSOR_BACKUP_PASTA: destino, EMISSOR_BACKUP_ULTIMOS: '1' }, encoding: 'utf8' })
    assert.equal(b.status, 0, b.stderr)
    const linha = JSON.parse(b.stdout)
    assert.deepEqual([linha.evento, linha.agentes, linha.apagados], ['backup', 1, 2])
    const ruim = spawnSync(process.execPath, [...NODE, BACKUP], { env: { ...base, EMISSOR_BANCO: banco, EMISSOR_BACKUP_PASTA: destino, EMISSOR_BACKUP_ULTIMOS: '0' }, encoding: 'utf8' })
    assert.equal(ruim.status, 2)
    e.fechar()
  } finally { rmSync(pasta, { recursive: true, force: true }) }
})

test('Dockerfile do emissor: serviço próprio, só protocolo e emissor, usuário sem privilégio, saúde em /saude, sem VOLUME e sem segredo', () => {
  const d = readFileSync(join(raiz, 'packages/emissor-aberto/Dockerfile'), 'utf8')
  const sem = d.replace(/^#.*$/gm, '')
  assert.match(d, /^FROM node:22-alpine$/m)
  assert.match(d, /^USER emissor$/m)
  assert.match(d, /^HEALTHCHECK .*http:\/\/127\.0\.0\.1:4848\/saude/m)
  assert.ok(!/^\s*VOLUME\b/m.test(d))
  assert.ok(!/(SEGREDO|CHAVE|TOKEN|SENHA|PASSWORD|PRIVATE|SEMENTE)\s*=/i.test(sem))
  assert.deepEqual([...d.matchAll(/^COPY (?:--\S+ )*(\S+)/gm)].map((m) => m[1]), [
    'packages/protocolo/package.json', 'packages/protocolo/src', 'packages/emissor-aberto/package.json', 'packages/emissor-aberto/bin', 'packages/emissor-aberto/src'
  ])
  assert.match(d, /^CMD \["node", "packages\/emissor-aberto\/bin\/emissor-aberto\.js"\]$/m)
  assert.ok(!/packages\/rele/.test(sem), 'a imagem do emissor não leva o relé')
})

test('o pacote do emissor só importa o protocolo e ele mesmo (nada do relé)', () => {
  const pasta = join(raiz, 'packages/emissor-aberto')
  for (const sub of ['src', 'bin']) {
    for (const f of readdirSync(join(pasta, sub))) {
      const texto = readFileSync(join(pasta, sub, f), 'utf8')
      for (const [, de] of texto.matchAll(/from '([^']+)'/g)) {
        assert.ok(de.startsWith('node:') || de.startsWith('./') || de.startsWith('../src/') || de === '../../protocolo/src/index.js', `${sub}/${f} importa ${de}`)
      }
    }
  }
})
