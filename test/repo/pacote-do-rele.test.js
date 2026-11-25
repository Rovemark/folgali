// SPDX-License-Identifier: AGPL-3.0-or-later
// O pacote que vai para o servidor (deploy/empacotar.sh) e o Dockerfile do relé: só o necessário, sem segredo, sem VOLUME anônimo,
// usuário sem privilégio, e o pacote sozinho é capaz de subir o relé (as importações resolvem sem o resto do repositório).
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gerarParDeChaves } from '../../packages/protocolo/src/index.js'

const raiz = new URL('../../', import.meta.url).pathname
const dockerfile = readFileSync(join(raiz, 'packages/rele/Dockerfile'), 'utf8')
const porta = () => new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)) }) })

test('Dockerfile: usuário sem privilégio, healthcheck, sem VOLUME, sem segredo, copia só protocolo e rele', () => {
  assert.match(dockerfile, /^FROM node:22-alpine$/m)
  assert.match(dockerfile, /^USER rele$/m)
  assert.match(dockerfile, /^HEALTHCHECK /m)
  assert.ok(!/^\s*VOLUME\b/m.test(dockerfile), 'VOLUME sem volume nomeado vira volume anônimo novo a cada contêiner e o banco some a cada deploy')
  assert.ok(!/(SEGREDO|TOKEN|SENHA|PASSWORD|PRIVATE|SEMENTE)\s*=/i.test(dockerfile.replace(/^#.*$/gm, '')), 'nenhum segredo na imagem')
  const copias = [...dockerfile.matchAll(/^COPY (?:--\S+ )*(\S+)/gm)].map((m) => m[1])
  assert.deepEqual(copias, ['packages/protocolo/package.json', 'packages/protocolo/src', 'packages/rele/package.json', 'packages/rele/bin', 'packages/rele/src'])
  assert.match(dockerfile, /^CMD \["node", "packages\/rele\/bin\/rele-hospedado\.js"\]$/m)
  assert.match(dockerfile, /RELE_BANCO=\/dados\/rele\.sqlite/)
  assert.ok(!/RELE_AUTORIZACAO_PERMANENTE/.test(dockerfile.replace(/^#.*$/gm, '')))
  assert.ok(!existsSync(join(raiz, 'packages/rele/.env')))
})

test('empacotar.sh leva só o que a imagem copia, nada de teste, doc, demonstração, banco ou segredo, e o pacote sobe o relé sozinho', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rn-pacote-'))
  try {
    const tgz = join(dir, 'rele.tgz')
    const r = spawnSync('sh', [join(raiz, 'packages/rele/deploy/empacotar.sh'), tgz], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    const lista = spawnSync('tar', ['-tzf', tgz], { encoding: 'utf8' }).stdout.split('\n').filter((l) => l && !l.endsWith('/'))
    assert.ok(lista.length > 15, `${lista.length} arquivos`)
    for (const f of lista) {
      assert.match(f, /^packages\/(protocolo\/(package\.json|src\/)|rele\/(package\.json|bin\/|src\/|Dockerfile))/, `arquivo inesperado no pacote: ${f}`)
      assert.ok(!/\.(sqlite|db|log|env|md|tgz)$|segredo-|\/\._|node_modules|\/test|\/scripts|\/docs|\.git/.test(f), `não deveria ir: ${f}`)
    }
    for (const f of ['packages/rele/Dockerfile', 'packages/rele/bin/rele-hospedado.js', 'packages/rele/bin/backup.js', 'packages/rele/bin/restaurar.js', 'packages/rele/src/operacao.js', 'packages/rele/src/backup.js', 'packages/protocolo/src/index.js']) {
      assert.ok(lista.includes(f), `faltou ${f}`)
    }
    // extrai num lugar vazio e sobe o relé a partir de lá: se faltasse um arquivo, a importação quebraria
    const dest = join(dir, 'ctx'); spawnSync('mkdir', [dest]); spawnSync('tar', ['-xzf', tgz, '-C', dest])
    const p = await porta()
    const filho = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join(dest, 'packages/rele/bin/rele-hospedado.js')], {
      cwd: dest,
      env: { PATH: process.env.PATH, RELE_EMISSORES: gerarParDeChaves().chavePublica, RELE_SEGREDO_DENUNCIAS: randomBytes(32).toString('hex'), RELE_BANCO: join(dir, 'd', 'rele.sqlite'), RELE_PORTA: String(p) },
      stdio: ['ignore', 'ignore', 'pipe']
    })
    let log = ''
    filho.stderr.on('data', (d) => { log += d })
    try {
      const t0 = Date.now()
      while (!log.includes('"ouvindo"')) { if (Date.now() - t0 > 15000) throw new Error(`não subiu: ${log}`); await new Promise((ok) => setTimeout(ok, 40)) }
      const res = await fetch(`http://127.0.0.1:${p}/v1/info`)
      assert.equal(res.status, 200)
    } finally { filho.kill('SIGTERM') }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
