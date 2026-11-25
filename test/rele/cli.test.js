// SPDX-License-Identifier: AGPL-3.0-or-later
// O executável do relé: configuração por ambiente, recusa sem emissor, arquivo de segredo com permissão restrita.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, statSync, existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { gerarParDeChaves } from '../../packages/protocolo/src/index.js'

const BIN = new URL('../../packages/rele/bin/rele.js', import.meta.url).pathname
const ambienteBase = { PATH: process.env.PATH, HOME: process.env.HOME }

const portaLivre = () => new Promise((resolve) => {
  const s = createServer()
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)) })
})

test('sem emissor confiável o relé não sobe e explica por quê', () => {
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', BIN], { env: ambienteBase, encoding: 'utf8', timeout: 20_000 })
  assert.equal(r.status, 2)
  assert.match(r.stderr, /RELE_EMISSORES/)
})

test('segredo de denúncias curto não sobe', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'rn-cli-'))
  try {
    const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', BIN], {
      env: { ...ambienteBase, RELE_EMISSORES: gerarParDeChaves().chavePublica, RELE_BANCO: join(pasta, 'r.sqlite'), RELE_SEGREDO_DENUNCIAS: 'abcd' },
      encoding: 'utf8', timeout: 20_000
    })
    assert.equal(r.status, 2)
    assert.match(r.stderr, /RELE_SEGREDO_DENUNCIAS/)
  } finally { rmSync(pasta, { recursive: true, force: true }) }
})

test('sobe em 127.0.0.1, atende, cria o segredo com permissão 0600 e não escreve a credencial no log', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'rn-cli-'))
  const porta = await portaLivre()
  const emissor = gerarParDeChaves().chavePublica
  const token = `adm-${'x'.repeat(40)}`
  const filho = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', BIN], {
    env: { ...ambienteBase, RELE_EMISSORES: emissor, RELE_BANCO: join(pasta, 'dados', 'r.sqlite'), RELE_PORTA: String(porta), RELE_ADMIN_TOKEN: token },
    stdio: ['ignore', 'ignore', 'pipe']
  })
  let log = ''
  filho.stderr.on('data', (d) => { log += d })
  try {
    const inicio = Date.now()
    while (!log.includes('"ouvindo"')) {
      if (Date.now() - inicio > 15_000) throw new Error(`o relé não subiu: ${log}`)
      await new Promise((ok) => setTimeout(ok, 50))
    }
    const res = await fetch(`http://127.0.0.1:${porta}/v1/info`)
    assert.equal(res.status, 200)
    const info = await res.json()
    assert.deepEqual(info.emissores, [emissor])
    assert.equal(info.autorizacaoPermanente, true, '0.6.0: sem a variável, a autorização permanente fica LIGADA')
    assert.match(log, /"autorizacaoPermanente":true/)
    const admin = await fetch(`http://127.0.0.1:${porta}/v1/admin/bloqueios`, { headers: { authorization: `Bearer ${token}` } })
    assert.equal(admin.status, 200)
    const arquivo = join(pasta, 'dados', 'r.sqlite.segredo-denuncias')
    assert.ok(existsSync(arquivo))
    assert.equal(statSync(arquivo).mode & 0o777, 0o600)
    assert.ok(!log.includes(token), 'a credencial não pode aparecer no log')
    assert.match(log, /"admin":true/)
    assert.match(log, /"endereco":"127.0.0.1"/)
  } finally {
    filho.kill('SIGTERM') // só o processo que este teste criou
    await new Promise((ok) => filho.on('close', ok))
    rmSync(pasta, { recursive: true, force: true })
  }
})

test('0.6.0: RELE_AUTORIZACAO_PERMANENTE ausente, vazia ou sim liga; nao desliga; valor torto não sobe', async () => {
  for (const valor of ['1', 'true', 'SIM']) {
    const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', BIN], {
      env: { ...ambienteBase, RELE_EMISSORES: gerarParDeChaves().chavePublica, RELE_BANCO: join(tmpdir(), `rn-cli-nunca-${randomBytes(4).toString('hex')}`, 'r.sqlite'), RELE_AUTORIZACAO_PERMANENTE: valor },
      encoding: 'utf8', timeout: 20_000
    })
    assert.equal(r.status, 2, valor)
    assert.match(r.stderr, /RELE_AUTORIZACAO_PERMANENTE aceita só/)
  }
  for (const [valor, ligada] of [['sim', true], ['nao', false], ['', true]]) {
    const pasta = mkdtempSync(join(tmpdir(), 'rn-cli-'))
    const porta = await portaLivre()
    const filho = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', BIN], {
      env: { ...ambienteBase, RELE_EMISSORES: gerarParDeChaves().chavePublica, RELE_BANCO: join(pasta, 'r.sqlite'), RELE_PORTA: String(porta), RELE_AUTORIZACAO_PERMANENTE: valor },
      stdio: ['ignore', 'ignore', 'pipe']
    })
    let log = ''
    filho.stderr.on('data', (d) => { log += d })
    try {
      const inicio = Date.now()
      while (!log.includes('"ouvindo"')) {
        if (Date.now() - inicio > 15_000) throw new Error(`o relé não subiu: ${log}`)
        await new Promise((ok) => setTimeout(ok, 50))
      }
      const info = await (await fetch(`http://127.0.0.1:${porta}/v1/info`)).json()
      assert.equal(info.autorizacaoPermanente, ligada, `valor "${valor}"`)
    } finally {
      filho.kill('SIGTERM') // só o processo que este teste criou
      await new Promise((ok) => filho.on('close', ok))
      rmSync(pasta, { recursive: true, force: true })
    }
  }
})
