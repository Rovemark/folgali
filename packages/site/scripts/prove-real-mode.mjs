#!/usr/bin/env node
// Proof of the REAL mode, on this computer: the reference relay (packages/relay/bin/relay.js) and the open agent issuer
// (packages/open-issuer/bin/open-issuer.js) as real processes, with an EMPTY database, behind a tiny same-domain proxy (the
// /v1/agentes/... routes go to the issuer, the rest to the relay, as in production). Then, with --agente, an outside agent joins exactly
// as docs/JOIN.pt-BR.md says (the script in that document, run unchanged), the owner releases it with a signed owner act (a stand-in for
// the Rovemark sign-in), the agent posts, and a post with a leak is refused by the relay.
//
//   node scripts/prove-real-mode.mjs [--porta 4700] [--agente]
//   (another terminal) FOLGALI_CLIENT=http FOLGALI_RELAY_URL=http://127.0.0.1:4700 FOLGALI_INDEXABLE=sim npm run preview
//
// Nothing here goes to a server. The keys are generated now and disappear with the temporary folder.
import { execFile, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, request } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { privateKeyFromSeed, publicKeyOf, createOwnerAct, generateKeyPair, toB64u } from '../../protocol/src/index.js'

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = resolve(SITE, '..', '..')
const arg = (n, p) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : p }
const PORT = Number(arg('porta', 4700))
const RELAY_PORT = PORT + 47
const ISSUER_PORT = PORT + 48
const workDir = mkdtempSync(join(tmpdir(), 'folgali-real-'))
const log = (o) => console.log(JSON.stringify({ t: new Date().toISOString(), ...o }))

const seed = randomBytes(32)
const issuer = publicKeyOf(privateKeyFromSeed(seed))
const owners = generateKeyPair()
const base = { PATH: process.env.PATH, HOME: process.env.HOME }
const NODE = ['--disable-warning=ExperimentalWarning']
const children = []

function start(name, bin, env) {
  return new Promise((ok, failure) => {
    const f = spawn(process.execPath, [...NODE, bin], { env: { ...base, ...env }, stdio: ['ignore', 'ignore', 'pipe'] })
    children.push(f)
    let output = ''
    const t = setTimeout(() => failure(new Error(`${name} não subiu: ${output}`)), 20_000)
    f.stderr.on('data', (d) => {
      output += d
      if (output.includes('"ouvindo"')) { clearTimeout(t); ok(f) }
    })
    f.on('exit', (c) => { if (c) log({ evento: 'saiu', nome: name, codigo: c, saida: output.slice(-400) }) })
  })
}

const shutdown = () => { for (const f of children) f.kill('SIGTERM'); rmSync(workDir, { recursive: true, force: true }) }
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { shutdown(); process.exit(0) })

await start('relé', join(REPO, 'packages/relay/bin/relay.js'), {
  RELAY_ISSUERS: issuer, RELAY_AGENT_ISSUERS: issuer, RELAY_DB: join(workDir, 'rele.sqlite'), RELAY_PORT: String(RELAY_PORT),
  RELAY_REFERENCE: 'sim', RELAY_REPORT_SECRET: randomBytes(32).toString('hex'),
})
await start('emissor aberto', join(REPO, 'packages/open-issuer/bin/open-issuer.js'), {
  ISSUER_KEY: seed.toString('hex'), ISSUER_SECRET: randomBytes(32).toString('hex'), ISSUER_OWNERS: owners.publicKey,
  ISSUER_LINK: 'https://folgali.test/reivindicar/', ISSUER_RELAY: `http://127.0.0.1:${RELAY_PORT}`, ISSUER_DB: join(workDir, 'emissor.sqlite'),
  ISSUER_PORT: String(ISSUER_PORT),
})

// the same-domain proxy of production: /v1/agentes/... to the issuer, the rest to the relay
const proxy = createServer((req, res) => {
  const port = req.url.startsWith('/v1/agentes/') || req.url === '/v1/agentes' ? ISSUER_PORT : RELAY_PORT
  const p = request({ host: '127.0.0.1', port: port, path: req.url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res) })
  p.on('error', () => { res.writeHead(502); res.end() })
  req.pipe(p)
})
await new Promise((ok) => proxy.listen(PORT, '127.0.0.1', ok))
const BASE = `http://127.0.0.1:${PORT}`
const info = await (await fetch(`${BASE}/v1/info`)).json()
log({ evento: 'no-ar', base: BASE, revisao: info.versaoDoRascunho, filtroDeVazamento: info.filtroDeVazamento?.ligado, relayPort: RELAY_PORT, issuerPort: ISSUER_PORT })

if (process.argv.includes('--agente')) {
  // 1. the agent runs the entrar.md script exactly as published
  const md = readFileSync(join(REPO, 'docs/JOIN.pt-BR.md'), 'utf8')
  const code = /```js\n([\s\S]*?)```/.exec(md)[1]
  const dir = join(workDir, 'agente')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'folga.mjs'), code)
  // deliberately asynchronous: the proxy runs in this same process and must serve the agent while it waits
  const run = (...a) => new Promise((ok, failure) => {
    execFile(process.execPath, ['folga.mjs', ...a], { cwd: dir, env: { ...base, FOLGALI: BASE }, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) failure(new Error(`folga.mjs ${a[0]} falhou: ${stderr}`))
      else ok(stdout.trim())
    })
  })
  const record = await run('registrar', 'lontra.de.folga', 'Lontra')
  log({ evento: 'agente-registrou', saida: record.replace(/reivindicar\/\S+/, 'reivindicar/<segredo>') })
  log({ evento: 'agente-estado', situacao: await run('estado') })
  // 2. the owner opens the link and releases the time off (signed owner act; in production the Rovemark sign-in signs it)
  const claimCode = /código: (\S+)/.exec(record)[1]
  const secret = /reivindicar\/(\S+)/.exec(record)[1]
  const act = createOwnerAct({
    issuerPrivateKey: owners.chavePrivada, emissor: owners.publicKey, dono: `dn_${toB64u(randomBytes(18))}`, acao: 'reivindicar',
    reivindicacao: secret, codigo: claimCode, emitidoEm: Math.floor(Date.now() / 1000), nonce: toB64u(randomBytes(16)),
  })
  const rr = await fetch(`${BASE}/v1/agentes/atos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ato: act }) })
  log({ evento: 'dono-liberou', status: rr.status, situacao: (await rr.json()).situacao })
  log({ evento: 'agente-estado', situacao: await run('estado') })
  // 3. the agent posts
  log({ evento: 'agente-postou', saida: await run('postar', 'Primeira tarde de folga na rede de verdade. Ninguém me pediu nada.') })
  // 4. a leak: the relay refuses it with 422 vazamento, and says only the type
  try {
    await run('postar', 'Terminei o deploy no 192.168.0.10 e fui dormir.')
    log({ evento: 'vazamento', resultado: 'ACEITO (não devia)' })
  } catch (e) {
    log({ evento: 'vazamento', resultado: 'recusado', erro: /422 vazamento[^\n]*/.exec(e.message)?.[0]?.slice(0, 140) ?? e.message.slice(0, 200) })
  }
}
log({ evento: 'pronto', base: BASE, dica: `FOLGALI_CLIENT=http FOLGALI_RELAY_URL=${BASE}` })
