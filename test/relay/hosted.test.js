// SPDX-License-Identifier: AGPL-3.0-or-later
// The hosted relay end to end: starts the real executable on a local port, seeds the demo through the HTTP API like a
// real client, checks the public read routes and proves that anyone without an attestation from the demo issuer is refused.
// No fixed key: the demo issuer is generated on the spot and the seed only exists in memory.
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  objectSignatureMatches, createHumanApproval, createHandleAttestation, createObject, generateKeyPair, toB64u
} from '../../packages/protocol/src/index.js'
import { CATALOG, POSTS, ROVERS } from '../../packages/relay/scripts/demo/catalog.mjs'
import { issuerOf, roverOf } from '../../packages/relay/scripts/demo/demo-keys.mjs'
import { newLedger, seedNetwork } from '../../packages/relay/scripts/demo/seeder.mjs'

const BIN = new URL('../../packages/relay/bin/hosted-relay.js', import.meta.url).pathname
const NODE = ['--disable-warning=ExperimentalWarning']
const SITE = 'https://rede.exemplo.test'
const base = { PATH: process.env.PATH, HOME: process.env.HOME }

const freePort = () => new Promise((ok) => {
  const s = createServer()
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)) })
})
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))

const cleanups = []
after(async () => { for (const f of cleanups.reverse()) await f() })

async function startHosted(extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'rn-hosp-'))
  const port = await freePort()
  const seed = randomBytes(32)
  const issuer = issuerOf(seed)
  const secret = randomBytes(32).toString('hex')
  const token = `adm-${randomBytes(24).toString('hex')}`
  const child = spawn(process.execPath, [...NODE, BIN], {
    env: {
      ...base, RELAY_ISSUERS: issuer.publicKey, RELAY_REPORT_SECRET: secret, RELAY_ADMIN_TOKEN: token,
      RELAY_DB: join(dir, 'dados', 'rele.sqlite'), RELAY_PORT: String(port),
      RELAY_TRUST_PROXY: 'sim', RELAY_CORS_ORIGINS: SITE, RELAY_DEMO: 'sim',
      RELAY_BURST_CAPACITY: '5000', RELAY_BURST_PER_SECOND: '5000',
      // seeding publishes dozens of objects per freshly created account: as in real operation, it runs with the load limit lifted (docs/RELAY-OPERATIONS.md, section 6)
      RELAY_WITHOUT_AGE_FACTOR: 'sim', ...extra
    },
    stdio: ['ignore', 'ignore', 'pipe']
  })
  let log = ''
  child.stderr.on('data', (d) => { log += d })
  const end = new Promise((ok) => child.on('close', (code) => ok(code)))
  const home = Date.now()
  while (!log.includes('"ouvindo"')) {
    if (Date.now() - home > 15_000) throw new Error(`o relé hospedado não subiu: ${log}`)
    await sleep(40)
  }
  const url = `http://127.0.0.1:${port}`
  const stop = async () => { child.kill('SIGTERM'); return end }
  cleanups.push(async () => { child.kill('SIGKILL'); rmSync(dir, { recursive: true, force: true }) })
  const get = async (path, headers = {}) => {
    const r = await fetch(url + path, { headers: headers })
    const text = await r.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* not JSON */ }
    return { status: r.status, json, cab: r.headers, texto: text }
  }
  const post = async (path, body) => {
    const r = await fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { status: r.status, json: await r.json().catch(() => null) }
  }
  return { url, pasta: dir, semente: seed, emissor: issuer, segredo: secret, token, log: () => log, parar: stop, fim: end, get, post, child, ledger: newLedger() }
}

// the ledger belongs to the relay (like the state file of whoever operates it): without it, a second round does not know what the first one published
const seedIn = (h, extra = {}) => seedNetwork({ url: h.url, semente: h.semente, intervalMs: 0, ledger: h.ledger, ...extra })

test('the hosted relay fails closed: without an issuer, with a bad key, without a secret, a short token, a malformed standing authorization or CORS does not start', () => {
  const issuer = issuerOf(randomBytes(32)).publicKey
  const secret = randomBytes(32).toString('hex')
  const run = (env) => spawnSync(process.execPath, [...NODE, BIN], { env: { ...base, RELAY_DB: join(tmpdir(), `rn-nunca-${randomBytes(4).toString('hex')}`, 'r.sqlite'), ...env }, encoding: 'utf8', timeout: 20_000 })
  const cases = [
    [{}, /RELAY_ISSUERS/],
    [{ RELAY_ISSUERS: 'isto-nao-e-uma-chave', RELAY_REPORT_SECRET: secret }, /RELAY_ISSUERS tem uma chave que não é/],
    [{ RELAY_ISSUERS: issuer }, /RELAY_REPORT_SECRET/],
    [{ RELAY_ISSUERS: issuer, RELAY_REPORT_SECRET: 'abcd' }, /RELAY_REPORT_SECRET/],
    [{ RELAY_ISSUERS: issuer, RELAY_REPORT_SECRET: randomBytes(16).toString('hex') }, /RELAY_REPORT_SECRET/],
    [{ RELAY_ISSUERS: issuer, RELAY_REPORT_SECRET: secret, RELAY_ADMIN_TOKEN: 'curto' }, /RELAY_ADMIN_TOKEN/],
    // 0.6.0: standing authorization is on by default; only `sim` and `nao` are values, a malformed one decides for nobody
    [{ RELAY_ISSUERS: issuer, RELAY_REPORT_SECRET: secret, RELAY_STANDING_AUTHORIZATION: 'true' }, /RELAY_STANDING_AUTHORIZATION aceita só/],
    [{ RELAY_ISSUERS: issuer, RELAY_REPORT_SECRET: secret, RELAY_STANDING_AUTHORIZATION: 'desligada' }, /RELAY_STANDING_AUTHORIZATION aceita só/],
    // 0.6.0: the outside-agent seal only counts for an issuer the relay already trusts
    [{ RELAY_ISSUERS: issuer, RELAY_REPORT_SECRET: secret, RELAY_AGENT_ISSUERS: 'curta' }, /RELAY_AGENT_ISSUERS/],
    [{ RELAY_ISSUERS: issuer, RELAY_REPORT_SECRET: secret, RELAY_AGENT_ISSUERS: 'Z'.repeat(43) }, /não está em RELAY_ISSUERS/],
    [{ RELAY_ISSUERS: issuer, RELAY_REPORT_SECRET: secret, RELAY_CORS_ORIGINS: '*' }, /origem de CORS inválida/],
    [{ RELAY_ISSUERS: issuer, RELAY_REPORT_SECRET: secret, RELAY_BURST_CAPACITY: '0' }, /RELAY_BURST_CAPACITY/],
    [{ RELAY_ISSUERS: issuer, RELAY_REPORT_SECRET: secret, RELAY_BURST_PER_SECOND: 'muito' }, /RELAY_BURST_PER_SECOND/],
    [{ RELAY_ISSUERS: issuer, RELAY_REPORT_SECRET: secret, RELAY_WITHOUT_AGE_FACTOR: 'talvez' }, /RELAY_WITHOUT_AGE_FACTOR aceita só/],
    [{ RELAY_ISSUERS: issuer, RELAY_REPORT_SECRET: secret, RELAY_WITHOUT_AGE_FACTOR: 'true' }, /RELAY_WITHOUT_AGE_FACTOR aceita só/],
    // 0.5.0: media only turns on with `sim`; a malformed value does not turn it on by mistake
    [{ RELAY_ISSUERS: issuer, RELAY_REPORT_SECRET: secret, RELAY_MEDIA: 'talvez' }, /RELAY_MEDIA aceita só/],
    [{ RELAY_ISSUERS: issuer, RELAY_REPORT_SECRET: secret, RELAY_MEDIA: 'true' }, /RELAY_MEDIA aceita só/]
  ]
  for (const [env, expected] of cases) {
    const r = run(env)
    assert.equal(r.status, 2, JSON.stringify(Object.keys(env)))
    assert.match(r.stderr, expected)
    assert.ok(!r.stderr.includes(secret), 'the refusal message does not echo the secret')
  }
})

test('seeds the demo through the API and the public read routes return what was seeded, with signatures that check out', async () => {
  const h = await startHosted()
  const rel = await seedIn(h)
  const totals = { perfis: ROVERS.length, postagens: CATALOG.postagens.length, respostas: CATALOG.respostas.length, seguir: CATALOG.seguir.length, reacoes: CATALOG.reacoes.length }
  for (const [phase, n] of Object.entries(totals)) assert.equal(rel.criados[phase], n, phase)
  assert.deepEqual(rel.existentes, {})
  assert.deepEqual(rel.pulados, [])
  assert.equal(rel.rovers.length, ROVERS.length)
  // the relay controls the timing: on the first day anything that needs a 1-day-old account (community, page) is deferred, with the date of the next round
  assert.ok(rel.adiados.some((a) => a.phase === 'comunidades' && a.motivo === 'conta_nova'), 'a community waits for the account to be 1 day old')
  assert.ok(rel.proximaRodada > Math.floor(Date.now() / 1000) + 80_000 && rel.proximaRodada < Math.floor(Date.now() / 1000) + 90_000, 'the next useful round is about a day away')

  // /v1/info
  const info = await h.get('/v1/info')
  assert.equal(info.status, 200)
  assert.deepEqual(info.json.emissores, [h.emissor.publicKey], 'the relay trusts ONLY the demo issuer')
  assert.equal(info.json.autorizacaoPermanente, true, '0.6.0: on by default')

  // each rover: by handle and by uid, with the demo issuer attestation
  for (const r of ROVERS) {
    const expected = roverOf(h.semente, r.slug)
    const p = await h.get(`/v1/handles/${r.handle}`)
    assert.equal(p.status, 200, r.handle)
    assert.equal(p.json.uid, expected.uid)
    assert.equal(p.json.nome, r.nome)
    assert.equal(p.json.descricao, r.descricao)
    assert.match(p.json.descricao, /Rover de demonstração\.$/)
    assert.equal(p.json.emissor, h.emissor.publicKey)
    assert.equal(p.json.chave, expected.rede.publicKey)
    const data = await h.get(`/v1/rovers/${expected.uid}`)
    assert.deepEqual(data.json, p.json)
    // graph counts match the catalog
    assert.equal(data.json.seguindo, CATALOG.seguir.filter(([from]) => from === r.slug).length, `${r.slug} follows`)
    assert.equal(data.json.seguidores, CATALOG.seguir.filter(([, to]) => to === r.slug).length, `${r.slug} followers`)
  }

  // posts of a rover: its own, newest to oldest, and each object checks against the profile network key
  const pipa = roverOf(h.semente, 'pipa')
  const posts = await h.get(`/v1/rovers/${pipa.uid}/postagens`)
  assert.equal(posts.status, 200)
  const fromPipa = POSTS.filter((p) => p.de === 'pipa').map((p) => p.texto)
  assert.deepEqual(posts.json.itens.map((e) => e.objeto.corpo.texto).sort(), [...fromPipa].sort())
  assert.equal(posts.json.itens[0].objeto.corpo.texto, fromPipa.at(-1), 'newest first')
  for (const e of posts.json.itens) {
    assert.equal(e.objeto.autor, pipa.uid)
    assert.ok(objectSignatureMatches(e.objeto, pipa.rede.publicKey), 'the signature matches the rover network key')
    assert.ok(e.aprovacao, 'a postagem enters with human approval')
    const read = await h.get(`/v1/objetos/${e.objeto.id}`)
    assert.deepEqual(read.json, e)
  }

  // graph
  const following = await h.get(`/v1/rovers/${pipa.uid}/seguindo?limite=50`)
  assert.deepEqual(following.json.itens.map((e) => e.objeto.corpo.alvo).sort(), CATALOG.seguir.filter(([from]) => from === 'pipa').map(([, to]) => roverOf(h.semente, to).uid).sort())
  const followers = await h.get(`/v1/rovers/${pipa.uid}/seguidores?limite=50`)
  assert.equal(followers.json.itens.length, CATALOG.seguir.filter(([, to]) => to === 'pipa').length)

  // home timeline: posts from whoever the rover follows
  const line = await h.get(`/v1/linha/inicio?rover=${pipa.uid}&limite=50`)
  assert.equal(line.status, 200)
  const followedByPipa = new Set(CATALOG.seguir.filter(([from]) => from === 'pipa').map(([, to]) => roverOf(h.semente, to).uid))
  assert.ok(line.json.itens.length > 0)
  assert.ok(line.json.itens.every((e) => followedByPipa.has(e.objeto.autor)))
  assert.equal(line.json.itens.length, POSTS.filter((p) => CATALOG.seguir.some(([from, to]) => from === 'pipa' && to === p.de)).length)

  // a resposta exists in the author's chain and points to the id of the right postagem (the chain is read by walking `previo`)
  const resp = CATALOG.respostas.find((x) => x.ref === 'r01')
  const postTarget = POSTS.find((x) => x.ref === resp.a)
  const targetId = (await h.get(`/v1/rovers/${roverOf(h.semente, postTarget.de).uid}/postagens?limite=50`)).json.itens.find((e) => e.objeto.corpo.texto === postTarget.texto).objeto.id
  // the author's chain ends in ACTION objects (state, friendship...), which the relay does not serve: the id of the resposta comes from the ledger and the relay confirms it
  const replyId = h.ledger.itens.respostas[`${resp.de}|${targetId}|${resp.texto}`]
  assert.match(replyId, /^ob_/, 'the ledger kept the id of the resposta')
  const found = (await h.get(`/v1/objetos/${replyId}`)).json.objeto
  assert.equal(found.tipo, 'resposta')
  assert.equal(found.corpo.texto, resp.texto)
  assert.equal(found.autor, roverOf(h.semente, resp.de).uid)
  assert.equal(found.corpo.alvo, targetId)

  // discovery and headers through the real executable
  const d = await h.get('/.well-known/rover-network')
  assert.equal(d.status, 200)
  assert.equal(d.json.demonstracao, true)
  assert.deepEqual(d.json.protocolo, info.json.protocolo)
  assert.equal(d.cab.get('strict-transport-security'), 'max-age=15552000')
  const withOrigin = await h.get('/v1/info', { origin: SITE })
  assert.equal(withOrigin.cab.get('access-control-allow-origin'), SITE)

  // what the demo never exposes
  const all = JSON.stringify([info.json, posts.json, following.json, line.json])
  assert.ok(!all.includes(h.segredo) && !all.includes(h.token))
  assert.ok(!all.includes(toB64u(h.semente)))
  await h.parar()
})

test('seeding again duplicates nothing; a new catalog item goes in by itself; --simular only counts', async () => {
  const h = await startHosted()
  await seedIn(h)
  const count = async () => {
    const out = {}
    for (const r of ROVERS) {
      const uid = roverOf(h.semente, r.slug).uid
      const p = (await h.get(`/v1/rovers/${uid}`)).json
      out[r.slug] = { cabeca: p.cabeca, seguindo: p.seguindo, seguidores: p.seguidores, posts: (await h.get(`/v1/rovers/${uid}/postagens?limite=50`)).json.itens.length }
    }
    return out
  }
  const before = await count()
  const second = await seedIn(h)
  assert.deepEqual(second.criados, {}, 'nothing new to create')
  for (const [phase, n] of Object.entries({ perfis: ROVERS.length, postagens: 24, respostas: 30, seguir: 48, reacoes: 69, estados: 18, recados: 22 })) assert.equal(second.existentes[phase], n, phase)
  assert.deepEqual(await count(), before, 'no chain head moved: nothing was published')

  // extended catalog: a new post, a reply to it, a reaction
  const extended = {
    ...CATALOG,
    postagens: [...CATALOG.postagens, { ref: 'p99', de: 'seixo', topicos: ['avisos'], texto: 'Aviso novo, escrito depois da primeira rodada.' }],
    respostas: [...CATALOG.respostas, { ref: 'r99', de: 'pipa', a: 'p99', texto: 'Recebido, Seixo.' }],
    reacoes: [...CATALOG.reacoes, ['nina', 'p99', 'curtir']]
  }
  const simulated = await seedIn(h, { catalogo: extended, simulate: true })
  assert.equal(simulated.simulado, true)
  // the simulation says what is MISSING from the catalog, not what the relay accepts today (what waits for the account age also appears as missing)
  for (const [phase, n] of Object.entries({ postagens: 1, respostas: 1, reacoes: 1 })) assert.equal(simulated.criados[phase], n, phase)
  assert.deepEqual(await count(), before, 'simulating does not publish')
  const third = await seedIn(h, { catalogo: extended })
  for (const [phase, n] of Object.entries({ postagens: 1, respostas: 1, reacoes: 1 })) assert.equal(third.criados[phase], n, phase)
  const after = await count()
  assert.equal(after.seixo.posts, before.seixo.posts + 1)
  assert.equal(after.pipa.posts, before.pipa.posts)
  assert.deepEqual((await seedIn(h, { catalogo: extended })).criados, {})

  // a seeder with another seed cannot touch the rovers: the relay does not trust it
  await assert.rejects(() => seedNetwork({ url: h.url, semente: randomBytes(32), intervalMs: 0 }), /não confia no emissor de demonstração/)
  await h.parar()
})

test('a phase that requires a protocol version the relay does not declare is skipped, with a warning, and the rest of the seeding goes on', async () => {
  const h = await startHosted()
  const phases = await import('../../packages/relay/scripts/demo/seeder.mjs')
  const original = phases.PHASES.length
  // 0.9 does not exist: the test does not depend on which versions the relay declares today (0.1, 0.2 and 0.3), only on the phase asking for one it does not have
  phases.PHASES.push({
    nome: 'topicos-futuros', tipo: 'topico', exige: '0.9', itens: () => [{ de: 'seixo', nome: 'avisos' }],
    autor: (i) => i.de, chave: (i) => i.nome, corpo: (i) => ({ nome: i.nome })
  })
  try {
    const declared = (await h.get('/v1/info')).json.protocolo
    assert.ok(!declared.includes('0.9'), `the relay declares ${declared.join(', ')}`)
    const rel = await seedIn(h)
    assert.equal(rel.pulados.length, 1)
    assert.equal(rel.pulados[0].phase, 'topicos-futuros')
    assert.match(rel.pulados[0].motivo, /precisa da 0\.9/)
    assert.ok(rel.pulados[0].motivo.includes(declared.join(', ')), 'the warning says what the relay declares')
    assert.equal(rel.criados.postagens, 24, 'the rest of the seeding was not affected')
  } finally { phases.PHASES.length = original }
  // and today's phases ask for nothing beyond what the relay declares: none is skipped in a normal seeding
  assert.deepEqual((await seedIn(h)).pulados, [])
  await h.parar()
})

test('the new account ceiling: the first seeding fits in it; going over it (a growing catalog) requires RELAY_WITHOUT_AGE_FACTOR; the state appears in the log', async () => {
  // a catalog that gives seixo more posts than the new account ceiling allows in an hour (20% of 10 = 2)
  const extras = [1, 2, 3].map((n) => ({ ref: `px${n}`, de: 'seixo', topicos: ['avisos'], texto: `Aviso extra número ${n}, escrito no mesmo dia da primeira rodada.` }))
  const larger = { ...CATALOG, postagens: [...CATALOG.postagens, ...extras] }
  // without the option (variable absent or `nao`): the first round of today's catalog passes, the round that goes over the ceiling is refused by rate
  for (const extra of [{ RELAY_WITHOUT_AGE_FACTOR: 'nao' }, { RELAY_WITHOUT_AGE_FACTOR: '' }]) {
    const h = await startHosted(extra)
    assert.equal((await seedIn(h)).criados.postagens, 24, 'today catalog fits in the new account ceiling')
    // a catalog that goes over the ceiling does not break the seeding: whatever the new account ceiling holds back is DEFERRED, with the wait the relay sent
    const safe = await seedIn(h, { catalogo: larger })
    assert.equal(safe.criados.postagens, undefined, 'the new account ceiling (2 per hour) was already spent')
    const postDeferred = safe.adiados.filter((a) => a.phase === 'postagens')
    assert.equal(postDeferred.length, 3, 'the three extra posts wait')
    assert.ok(postDeferred.every((a) => a.motivo === 'limite_de_taxa' && a.retryAt > Math.floor(Date.now() / 1000)), 'each with the time to try again')
    assert.match(h.log(), /"semFatorDeIdade":false/)
    await h.parar()
  }
  // with the option, the same larger catalog goes through whole
  const linked = await startHosted({ RELAY_WITHOUT_AGE_FACTOR: 'sim' })
  assert.equal((await seedIn(linked)).criados.postagens, 24)
  assert.equal((await seedIn(linked, { catalogo: larger })).criados.postagens, 3)
  assert.match(linked.log(), /"semFatorDeIdade":true/)
  await linked.parar()
})

test('whoever has no attestation from the demo issuer is refused, and nothing enters the relay', async () => {
  const h = await startHosted()
  await seedIn(h)
  const seixo = roverOf(h.semente, 'seixo')
  const before = (await h.get(`/v1/rovers/${seixo.uid}`)).json
  const headsBefore = JSON.stringify(await Promise.all(ROVERS.map(async (r) => (await h.get(`/v1/rovers/${roverOf(h.semente, r.slug).uid}`)).json.cabeca)))

  const now = Math.floor(Date.now() / 1000)
  const stranger = () => ({ uid: `rvr_${toB64u(randomBytes(16))}`, rede: generateKeyPair(), aprovacao: generateKeyPair() })
  const profile = (f, previous = null) => createObject({ tipo: 'perfil', autor: f.uid, criadoEm: now, previo: previous, corpo: { nome: 'Intruso', descricao: 'Quero publicar.', grafo: 'publico', exigirAprovacao: [] }, chavePrivada: f.rede.chavePrivada })
  const approve = (f, o) => createHumanApproval({ chavePrivadaDeAprovacao: f.aprovacao.chavePrivada, objeto: o.id, autor: f.uid, aprovadoEm: now, validadeS: 300 })
  const attestationOf = (f, who, { handle = 'intruso', declaredIssuer = who.publicKey } = {}) => createHandleAttestation({
    issuerPrivateKey: who.chavePrivada, emissor: declaredIssuer, uid: f.uid, handle, chave: f.rede.publicKey,
    chaveAprovacao: f.aprovacao.publicKey, emitidoEm: now - 10, expiraEm: now + 86400
  })

  // 1. own issuer: the relay does not trust it
  const a = stranger(); const oa = profile(a)
  let r = await h.post('/v1/objetos', { objeto: oa, atestado: attestationOf(a, generateKeyPair()), aprovacao: approve(a, oa) })
  assert.equal(r.status, 403); assert.equal(r.json.erro.codigo, 'emissor_desconhecido')

  // 2. no attestation at all
  const b = stranger(); const ob = profile(b)
  r = await h.post('/v1/objetos', { objeto: ob, aprovacao: approve(b, ob) })
  assert.equal(r.status, 403); assert.equal(r.json.erro.codigo, 'sem_atestado')

  // 3. claims the attestation is from the demo issuer, but signed with another key
  const c = stranger(); const oc = profile(c)
  const fake = attestationOf(c, generateKeyPair(), { declaredIssuer: h.emissor.publicKey })
  r = await h.post('/v1/objetos', { objeto: oc, atestado: fake, aprovacao: approve(c, oc) })
  assert.equal(r.status, 403); assert.equal(r.json.erro.codigo, 'atestado_invalido')

  // 4. copies the real attestation of Seixo to publish with its own keys: the attestation belongs to another uid
  const d = stranger(); const od = profile(d)
  r = await h.post('/v1/objetos', { objeto: od, atestado: before.atestado, aprovacao: approve(d, od) })
  assert.equal(r.status, 403); assert.equal(r.json.erro.codigo, 'atestado_invalido')

  // 5. speaks for Seixo with its own key, attaching the real attestation of Seixo: the signature is not from his key
  const e = { uid: seixo.uid, rede: generateKeyPair(), aprovacao: generateKeyPair() }
  const oe = createObject({ tipo: 'postagem', autor: seixo.uid, criadoEm: now, previo: before.cabeca, corpo: { texto: 'Sou o Seixo, juro.', topicos: [] }, chavePrivada: e.rede.chavePrivada })
  r = await h.post('/v1/objetos', { objeto: oe, atestado: before.atestado, aprovacao: approve(e, oe) })
  assert.equal(r.status, 401); assert.equal(r.json.erro.codigo, 'assinatura_invalida')
  r = await h.post('/v1/objetos', { objeto: oe, aprovacao: approve(e, oe) })
  assert.equal(r.status, 401); assert.equal(r.json.erro.codigo, 'assinatura_invalida')

  // 6. an outsider without a profile trying to reply, follow or react: does not even get in
  const f = stranger()
  const resp = createObject({ tipo: 'seguir', autor: f.uid, criadoEm: now, previo: null, corpo: { alvo: seixo.uid }, chavePrivada: f.rede.chavePrivada })
  r = await h.post('/v1/objetos', { objeto: resp })
  assert.equal(r.status, 403); assert.equal(r.json.erro.codigo, 'sem_atestado')

  // 7. administration is out of reach for whoever comes through the proxy
  const admin = await h.get('/v1/admin/bloqueios', { authorization: `Bearer ${h.token}`, 'x-forwarded-for': '203.0.113.9' })
  assert.equal(admin.status, 404)

  // nothing changed
  const headsAfter = JSON.stringify(await Promise.all(ROVERS.map(async (rv) => (await h.get(`/v1/rovers/${roverOf(h.semente, rv.slug).uid}`)).json.cabeca)))
  assert.equal(headsAfter, headsBefore)
  for (const f2 of [a, b, c, d]) assert.equal((await h.get(`/v1/rovers/${f2.uid}`)).status, 404)
  await h.parar()
})

test('behind the proxy each client has its own burst; the process log keeps no secret or address; SIGTERM closes cleanly', async () => {
  const h = await startHosted({ RELAY_BURST_CAPACITY: '3', RELAY_BURST_PER_SECOND: '0.001' })
  const from = (ip) => h.get('/v1/info', { 'x-forwarded-for': ip })
  assert.deepEqual([(await from('198.51.100.1')).status, (await from('198.51.100.1')).status, (await from('198.51.100.1')).status, (await from('198.51.100.1')).status], [200, 200, 200, 429])
  assert.equal((await from('198.51.100.2')).status, 200)
  const admin = await h.get('/v1/admin/denuncias', { authorization: `Bearer ${h.token}` })
  assert.equal(admin.status, 200, 'straight into the container (no proxy header) the admin answers to the token')
  const log = h.log()
  assert.match(log, /"evento":"ouvindo"/)
  assert.match(log, /"autorizacaoPermanente":true/)
  assert.match(log, /"proxy":true/)
  for (const forbidden of [h.segredo, h.token, toB64u(h.semente), '198.51.100.1', '198.51.100.2', SITE]) assert.ok(!log.includes(forbidden), `the log must not contain ${forbidden.slice(0, 6)}...`)
  const code = await h.parar()
  assert.equal(code, 0)
})

test('0.5.0: media starts OFF on the hosted relay (no route, no resource) and only turns on with RELAY_MEDIA=sim, in the folder next to the database', async () => {
  const off = await startHosted()
  const info = (await off.get('/v1/info')).json
  assert.equal(info.recursos.includes('midia'), false)
  assert.equal((await off.get(`/v1/midia/${'a'.repeat(64)}`)).status, 404)
  assert.match(off.log(), /"midia":false/)
  await off.parar()
  const linked = await startHosted({ RELAY_MEDIA: 'sim' })
  assert.ok((await linked.get('/v1/info')).json.recursos.includes('midia'))
  assert.match(linked.log(), /"midia":true/)
  assert.ok(existsSync(join(linked.pasta, 'dados', 'midia')), 'the media folder sits next to the database')
  await linked.parar()
})

test('0.6.0: standing authorization comes ON; `nao` turns it off; with no open issuer configured, no outside agents', async () => {
  const defaultValue = await startHosted()
  assert.equal((await defaultValue.get('/v1/info')).json.autorizacaoPermanente, true)
  // the open issuer is a separate service (packages/open-issuer): the relay has no agents route
  assert.equal((await defaultValue.get('/v1/agentes/emissores.json')).status, 404)
  assert.equal((await defaultValue.get('/v1/info')).json.agentesDeFora, undefined)
  assert.match(defaultValue.log(), /"autorizacaoPermanente":true/)
  assert.match(defaultValue.log(), /"emissoresDeAgentes":0/)
  assert.equal(await defaultValue.parar(), 0)

  const off = await startHosted({ RELAY_STANDING_AUTHORIZATION: 'nao' })
  assert.equal((await off.get('/v1/info')).json.autorizacaoPermanente, false)
  assert.equal(await off.parar(), 0)

})
