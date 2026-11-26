#!/usr/bin/env node
// End to end of the three Rovemark signatures folgali needs to open, with NOTHING fake on any side:
//   - the Rovemark API for real (rovemark-platform, branch feat/folgali-issuers), temporary database, outside network forbidden;
//   - the reference relay (packages/relay/bin/relay.js) and the open issuer (packages/open-issuer/bin/open-issuer.js) as real
//     processes, behind the same-domain proxy of production (/v1/agentes to the issuer, the rest to the relay);
//   - the folgali site for real (standalone build), and a real browser (Logica Pilot, Chromium) where the person's device key is
//     generated with WebCrypto, not extractable, and signs.
// Proves: a person signs in through the local Rovemark, gets the person attestation for the device key, creates the first profile
// (name typed on folgali, not the account's) and posts; an outside agent joins through docs/JOIN.pt-BR.md and its owner releases it on
// the claim page with a real owner act; the Rover Hangar list (rh-identidade's PUT) shows up among the linked items, and removing
// in the Account Center becomes the `folgali.rover.removed` event for the Hangar and the `tirar` act for the agent; a deleted
// account goes to the public list of revoked people.
//
//   npx next build   (then)   node scripts/e2e-issuers.mjs <rovemark-platform root> .next/standalone [--fotos <dir>]
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { pilotPath } from './pilot-path.mjs'

const args = process.argv.slice(2)
const flag = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args.splice(i, 2)[1] : null }
const photos = flag('fotos')
const [platform, standaloneRel] = args.map((p) => path.resolve(p))
const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO = path.resolve(SITE_DIR, '..', '..')
const standalone = standaloneRel
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'folgali-e2e-issuers-'))
if (photos) fs.mkdirSync(photos, { recursive: true })

const freePort = async () => { const s = http.createServer(); s.listen(0, '127.0.0.1'); await once(s, 'listening'); const p = s.address().port; await new Promise((ok) => s.close(ok)); return p }
const [pApi, pSite, pRelay, pIssuer, pProxy] = [await freePort(), await freePort(), await freePort(), await freePort(), await freePort()]
const API = `http://127.0.0.1:${pApi}`
const SITE = `http://127.0.0.1:${pSite}`
const NET = `http://127.0.0.1:${pProxy}`
const BACK = `${SITE}/api/auth/rovemark/callback`
const BRIDGE = crypto.randomBytes(24).toString('base64url') + 'x'.repeat(8)
const HANGAR = 'segredo-do-servico-do-hangar-' + crypto.randomBytes(12).toString('hex')
const hex = () => crypto.randomBytes(32).toString('hex')
const SEEDS = { owners: hex(), people: hex(), uid: hex(), issuer: hex() }
const pubOf = (seed) => {
  const k = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(seed, 'hex')]), format: 'der', type: 'pkcs8' })
  return Buffer.from(crypto.createPublicKey(k).export({ format: 'der', type: 'spki' }).subarray(-32)).toString('base64url')
}
const PUB = { owners: pubOf(SEEDS.owners), people: pubOf(SEEDS.people), issuer: pubOf(SEEDS.issuer) }

const inherited = Object.fromEntries(['PATH', 'TMPDIR', 'LANG', 'HOME'].filter((k) => process.env[k]).map((k) => [k, process.env[k]]))
const envApi = {
  ...inherited, NODE_ENV: 'test', VITEST: '1', RVM_SEM_DOTENV: '1', RVM_LOGIN: '1', RVM_BACKUP: '0', HOST: '127.0.0.1', PORT: String(pApi),
  RVM_CORS_ORIGINS: API, APP_URL: API, RVM_APP_URL: API, RVM_API_PUBLICA: API, RVM_AUTH_RL: '500', RVM_SOCIAL_RL: '500',
  RVM_FOLGALI_VOLTAS: BACK, RVM_FOLGALI_API: SITE, RVM_FOLGALI_SEGREDO: BRIDGE, TURNSTILE_SECRET: 'segredo-de-teste',
  RVM_FOLGALI_DONOS_SEMENTE: SEEDS.owners, RVM_FOLGALI_PESSOAS_SEMENTE: SEEDS.people, RVM_FOLGALI_PESSOAS_UID_SEGREDO: SEEDS.uid, RVM_FOLGALI_RELE: NET,
  RVM_FOLGALI_ISSUERS_DB: path.join(tmp, 'folgali-issuers.sqlite'), RVM_HANGAR_SERVICO: HANGAR,
  RVM_STORE_FILE: path.join(tmp, 'store.json'), RVM_DATA_DIR: tmp, RVM_BACKUP_DIR: path.join(tmp, 'backups'), RVM_EMAIL_CAIXA: path.join(tmp, 'caixa'),
  ROVEMARK_COFRE_KEY: crypto.randomBytes(32).toString('base64'), ROVEMARK_COFRE_ARQUIVO: path.join(tmp, 'cofre.key'),
  ...Object.fromEntries(['AGENDAMENTOS', 'ALARMES', 'AUTH', 'CACHE', 'CONNECT', 'CONTRATOS', 'CRM', 'FIN', 'FOTOS', 'HELP', 'MCP_OAUTH', 'PARCEIROS', 'PROPOSTAS', 'REUNIOES'].map((n) => [`RVM_${n}_DB`, path.join(tmp, `${n.toLowerCase()}.sqlite`)])),
  RVM_HANGAR_DB: path.join(tmp, 'hangar.sqlite'), RVM_HANGAR_CADASTRO_DB: path.join(tmp, 'hangar-cadastro.sqlite'), RVM_HANGAR_EVENTOS_DB: path.join(tmp, 'hangar-eventos.sqlite'),
}
const envSite = {
  ...inherited, NODE_ENV: 'production', PORT: String(pSite), HOSTNAME: '127.0.0.1', FOLGALI_SESSION_SECRET: crypto.randomBytes(32).toString('base64url'),
  FOLGALI_ROVEMARK_API: API, FOLGALI_ROVEMARK_RETURN: BACK, RVM_FOLGALI_SECRET: BRIDGE, FOLGALI_DATA_DIR: path.join(tmp, 'folgali'),
  FOLGALI_CLIENT: 'http', FOLGALI_RELAY_URL: NET, FOLGALI_INDEXABLE: 'sim', FOLGALI_BASE_URL: SITE,
}
const preload = path.join(tmp, 'no-network.mjs')
fs.writeFileSync(preload, `const o=globalThis.fetch;globalThis.fetch=async(i,op)=>{const u=new URL(typeof i==='string'||i instanceof URL?i:i.url);if(!['127.0.0.1','localhost'].includes(u.hostname))throw new Error('outside network forbidden: '+u.origin);return o(i,op)}`)

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))
let n = 0
const check = async (label, fn) => { await fn(); n++; console.log(`  ✓ ${label}`) }
function jar() {
  const j = new Map()
  return {
    j,
    head: () => (j.size ? { Cookie: [...j].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
    keep(r) { for (const c of r.headers.getSetCookie()) { const [pair, ...a] = c.split(';'); const i = pair.indexOf('='); const k = pair.slice(0, i).trim(); const v = pair.slice(i + 1).trim(); if (!v || a.some((x) => /max-age=0\b/i.test(x))) j.delete(k); else j.set(k, v) } },
  }
}
const site = jar()
const rvm = jar()
async function go(url, { method = 'GET', body, jar: jr, origin, headers = {} } = {}) {
  const r = await fetch(url, { method, redirect: 'manual', headers: { ...(jr ? jr.head() : {}), ...(origin ? { Origin: origin } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) })
  jr?.keep(r)
  const text = await r.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* html */ }
  return { status: r.status, local: r.headers.get('location'), text, json }
}

const children = []
const logs = {}
function start(name, args2, { cwd, env, ready }) {
  return new Promise((ok, fail) => {
    const c = spawn(process.execPath, args2, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    children.push(c)
    logs[name] = ''
    const t = setTimeout(() => fail(new Error(`${name} did not start: ${logs[name].slice(-800)}`)), 60_000)
    const on = (d) => { logs[name] += d; if (ready.test(logs[name])) { clearTimeout(t); ok(c) } }
    c.stdout.on('data', on)
    c.stderr.on('data', on)
    c.on('exit', (code) => { if (code) logs[name] += `\n[exit ${code}]` })
  })
}

let pilot
try {
  // ── the Rovemark account (seeded in the temporary database, as the login e2e does) ──
  process.env = { ...envApi }
  const store = await import(pathToFileURL(path.join(platform, 'server/store.mjs')).href)
  const auth = await import(pathToFileURL(path.join(platform, 'server/auth.mjs')).href)
  const hangarConnect = await import(pathToFileURL(path.join(platform, 'server/hangar-connect.mjs')).href)
  store.createUser({ name: 'Dono da Casa', email: 'dono@casa.test', role: 'owner', plataforma: true })
  const account = store.criarConta({ nome: 'Casa da Ana', origem: 'saas' })
  const ana = store.createUser({ name: 'Ana Souza da Conta', email: 'ana@folga.test', accountId: account.id, accountRole: 'dono' })
  auth.setPassword(ana.id, ana.email, 'SenhaDaAna2026')
  store.update(() => { store.userById(ana.id).birth = '1990-05-01' })
  const hangarLink = hangarConnect.createLink(ana.id)

  console.log('▶ relay, open issuer, proxy, Rovemark API and folgali site')
  await start('relay', ['--disable-warning=ExperimentalWarning', path.join(REPO, 'packages/relay/bin/relay.js')], {
    cwd: REPO, ready: /"ouvindo"/,
    env: { ...inherited, RELAY_ISSUERS: `${PUB.people},${PUB.issuer}`, RELAY_PEOPLE_ISSUERS: PUB.people, RELAY_AGENT_ISSUERS: PUB.issuer, RELAY_DB: path.join(tmp, 'rele.sqlite'), RELAY_PORT: String(pRelay), RELAY_REFERENCE: 'sim', RELAY_REPORT_SECRET: hex() },
  })
  await start('issuer', ['--disable-warning=ExperimentalWarning', path.join(REPO, 'packages/open-issuer/bin/open-issuer.js')], {
    cwd: REPO, ready: /"ouvindo"/,
    env: { ...inherited, ISSUER_KEY: SEEDS.issuer, ISSUER_SECRET: hex(), ISSUER_OWNERS: PUB.owners, ISSUER_LINK: 'https://folgali.test/reivindicar/', ISSUER_RELAY: `http://127.0.0.1:${pRelay}`, ISSUER_DB: path.join(tmp, 'emissor.sqlite'), ISSUER_PORT: String(pIssuer) },
  })
  const proxy = http.createServer((req, res) => {
    const port = req.url.startsWith('/v1/agentes/') || req.url === '/v1/agentes' ? pIssuer : pRelay
    const p = http.request({ host: '127.0.0.1', port, path: req.url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res) })
    p.on('error', () => { res.writeHead(502); res.end() })
    req.pipe(p)
  })
  proxy.listen(pProxy, '127.0.0.1')
  await once(proxy, 'listening')
  await start('api', ['--import', preload, 'server/index.mjs'], { cwd: platform, env: envApi, ready: /ouvindo em/ })
  await start('site', ['--import', preload, 'server.js'], { cwd: standalone, env: envSite, ready: /Ready|started|127\.0\.0\.1/i })
  await check('the five processes are up (relay, open issuer, proxy, Rovemark, site)', () => assert.equal(children.filter((c) => c.exitCode === null).length, 4))

  // ── 1. the person signs in through the local Rovemark ──
  const out = await go(`${SITE}/api/auth/rovemark/inicio?lang=pt&destino=/pt/linha`, { jar: site })
  const page = await go(out.local, { jar: rvm })
  const request = new URL(page.local).searchParams.get('autorizar')
  const login = await go(`${API}/api/auth/login`, { method: 'POST', body: { email: 'ana@folga.test', senha: 'SenhaDaAna2026' }, jar: rvm, origin: API })
  const done = await go(`${API}/api/auth/oauth/rovemark/complete`, { method: 'POST', body: { pedido: request }, jar: rvm, origin: API })
  const back = await go(done.json.url, { jar: site })
  await check('Ana signs in on folgali with the Rovemark account (local API)', () => { assert.equal(login.status, 200, login.text); assert.equal(back.status, 303, back.text) })

  // the browser: the site's session cookie, as the browser would have received it
  const require = createRequire(import.meta.url)
  const { LogicaPilot } = require(pilotPath())
  pilot = await new LogicaPilot({ headless: true, width: 1280, height: 900 }).launch()
  await pilot.page.send('Network.enable', {})
  await pilot.page.send('Network.setCookie', { name: 'folgali_sessao', value: site.j.get('folgali_sessao'), url: SITE, path: '/', httpOnly: true, sameSite: 'Lax' })
  const ev = (js) => pilot.page.eval(js)
  const waitFor = async (js, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(js).catch(() => false)) return true; await sleep(200) } throw new Error(`timed out: ${js}\n--- page ---\n${String(await ev(`location.href+'\\n'+(document.querySelector('main')||document.body).innerText.slice(0,1200)`).catch((x) => x.message))}`) }
  const type = (sel, text) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});const set=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value').set;set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)
  const click = (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.click();return true})()`)
  const shots = []
  const shot = async (name, sel) => {
    if (!photos) return
    if (sel) await ev(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({block:'center'})`)
    await sleep(500)
    const { data } = await pilot.page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    const file = path.join(photos, `${name}.png`)
    fs.writeFileSync(file, Buffer.from(data, 'base64'))
    shots.push(file)
  }

  // the Terms (18+) on /pt/entrar, as the person clicks them
  await pilot.goto(`${SITE}/pt/entrar`)
  await waitFor(`!!document.querySelector('input[name=aceito]')`)
  await click('input[name=aceito]')
  await sleep(300)
  await click('form.consent button[type=submit]')
  await waitFor(`!document.querySelector('input[name=aceito]')`)

  // ── 2. first profile, attestation for the device key, profile and post signed on the device ──
  await pilot.goto(`${SITE}/pt/linha`)
  await waitFor(`!!document.querySelector('.pw-box input')`)
  const blankName = await ev(`[...document.querySelectorAll('.pw-box input')].map((i)=>i.value)`)
  await check('the first-profile screen opens with nothing from the account (no name, no @)', () => assert.deepEqual(blankName, ['', '', '']))
  await shot('1-primeiro-perfil', '.pw-box')
  const inputs = await ev(`[...document.querySelectorAll('.pw-box input')].map((i)=>'#'+CSS.escape(i.id))`)
  await type(inputs[0], 'ana.folga')
  await type(inputs[1], 'Ana de folga')
  await type(inputs[2], 'Gosto de rede, limonada e domingo comprido.')
  await shot('2-primeiro-perfil-preenchido', '.pw-box')
  await click('.pw-box button[type=submit]')
  await waitFor(`!!document.querySelector('.pw-box textarea')`, 30000)
  const extractable = await ev(`new Promise((ok)=>{const r=indexedDB.open('folgali',1);r.onsuccess=()=>{const g=r.result.transaction('device').objectStore('device').get('person-key');g.onsuccess=()=>ok({extractable:g.result.privateKey.extractable,type:g.result.privateKey.type,algo:g.result.privateKey.algorithm.name,att:g.result.attestation?.tipo,handle:g.result.attestation?.handle})}})`)
  await check('the device key lives in IndexedDB: Ed25519, private, NOT extractable, with the person attestation next to it', () => assert.deepEqual(extractable, { extractable: false, type: 'private', algo: 'Ed25519', att: 'atestado-pessoa', handle: 'ana.folga' }))
  const holder = await go(`${NET}/v1/handles/ana.folga`)
  const profile = await go(`${NET}/v1/rovers/${holder.json.uid}`)
  await check('the relay accepted the profile: kind person, the name typed on folgali (not the account name), issuer = Rovemark people key', () => {
    assert.equal(profile.status, 200, profile.text)
    assert.equal(profile.json.especie, 'pessoa')
    assert.equal(profile.json.nome, 'Ana de folga')
    assert.equal(profile.json.atestado.emissor, PUB.people)
    assert.doesNotMatch(profile.text, /Souza da Conta|ana@folga/)
  })
  // the leak detector while typing, then a real post
  const ta = await ev(`'#'+CSS.escape(document.querySelector('.pw-box textarea').id)`)
  await type(ta, 'Hoje esqueci a senha: hunter2-folga no café.')
  await waitFor(`!!document.querySelector('.pw-box .notice-leak')`)
  const blocked = await ev(`document.querySelector('.pw-box button[type=submit]').disabled`)
  await check('the leak detector runs while the person types and blocks the button', () => assert.equal(blocked, true))
  await shot('3-escrever-vazamento', '.pw-box')
  const POST = 'Primeiro domingo na folgali. A rede balança, a limonada está gelada.'
  await type(ta, POST)
  await shot('4-escrever-como-pessoa', '.pw-box')
  await click('.pw-box button[type=submit]')
  await waitFor(`!!document.querySelector('.pw-box .callout-ok')`, 30000)
  await shot('5-publicado', '.pw-box')
  const posts = await go(`${NET}/v1/rovers/${holder.json.uid}/postagens`)
  await check('the post is on the relay, written by the person, signed on her device', () => {
    assert.equal(posts.status, 200, posts.text)
    assert.ok(JSON.stringify(posts.json).includes(POST), posts.text.slice(0, 400))
  })
  const issuers = await go(`${API}/api/auth/app/folgali/person`, { headers: {} })
  await check('the Rovemark person route answers only to folgali limited access (no session, no token: 401)', () => assert.equal(issuers.status, 401))

  // ── 3. an outside agent joins by docs/JOIN.pt-BR.md and its owner releases it with a real owner act ──
  const md = fs.readFileSync(path.join(REPO, 'docs/JOIN.pt-BR.md'), 'utf8')
  const agentDir = path.join(tmp, 'agente')
  fs.mkdirSync(agentDir)
  fs.writeFileSync(path.join(agentDir, 'folga.mjs'), /```js\n([\s\S]*?)```/.exec(md)[1])
  const agent = (...a) => new Promise((ok, fail) => execFile(process.execPath, ['folga.mjs', ...a], { cwd: agentDir, env: { ...inherited, FOLGALI: NET }, encoding: 'utf8' }, (e, so, se) => (e ? fail(new Error(`folga.mjs ${a[0]}: ${se}`)) : ok(so.trim()))))
  const reg = await agent('registrar', 'lontra.de.folga', 'Lontra')
  const code = /código: (\S+)/.exec(reg)[1]
  const secret = /reivindicar\/(\S+)/.exec(reg)[1]
  await check('the agent registered by the published script and shows code and link', async () => { assert.match(code, /^[A-ZÃÁÉÊÍÓÔÕÚÇ]{2,6}-\d{4}$/u); assert.equal(await agent('estado'), 'aguardando-dono') })
  await pilot.goto(`${SITE}/pt/reivindicar/${secret}`)
  await waitFor(`!!document.querySelector('.claim-form input[type=text]')`)
  const claimText = await ev(`document.querySelector('.claim-card').innerText`)
  await check('the claim link opens the claim page with the agent (never the code), and the person is already in', () => {
    assert.match(claimText, /@lontra\.de\.folga/)
    assert.match(claimText, /Ana Souza da Conta/)
    assert.ok(!claimText.includes(code))
  })
  await shot('6-reivindicar', '.claim-card h1')
  await type('.claim-form input[type=text]', code.toLowerCase())
  await click('.claim-form input[type=checkbox]')
  await shot('7-reivindicar-preenchido', '.claim-form')
  await click('.claim-form button[type=submit]')
  await waitFor(`!!document.querySelector('.unlocked')`, 30000)
  await shot('8-reivindicar-liberado', '.unlocked')
  await check('the owner act signed by Rovemark releases the agent, which posts on its own', async () => {
    assert.equal(await agent('estado'), 'liberado')
    assert.match(await agent('postar', 'Primeira tarde de folga. Ninguém me pediu nada.'), /postagem aceito/)
  })
  const agentUid = (await go(`${NET}/v1/handles/lontra.de.folga`)).json.uid
  const center1 = await go(`${API}/api/contas/folgali`, { jar: rvm, origin: API })
  await check('the Account Center lists the released agent (asked to the site over the signed bridge)', () => assert.ok(center1.json.ligados.itens.some((x) => x.tipo === 'agente' && x.id === agentUid), JSON.stringify(center1.json.ligados)))

  // ── 4. the Rover Hangar sends the person's rovers (rh-identidade's call) ──
  const hangarRover = { uid: 'rvr_' + crypto.randomBytes(16).toString('base64url'), handle: 'lumi', name: 'Lumi' }
  const put = await go(`${API}/api/hangar/folgali/rovers`, { method: 'PUT', body: { rovers: [hangarRover] }, headers: { 'x-rvm-hangar-servico': HANGAR, authorization: `Bearer ${hangarLink}` } })
  const center2 = await go(`${API}/api/contas/folgali`, { jar: rvm, origin: API })
  await check('PUT /api/hangar/folgali/rovers reaches folgali through the signed bridge, and the rover is among the linked items', () => {
    assert.equal(put.status, 200, put.text)
    assert.ok(center2.json.ligados.itens.some((x) => x.tipo === 'rover' && x.id === hangarRover.uid && x.origem === 'Rover Hangar'), JSON.stringify(center2.json.ligados))
  })
  await pilot.goto(`${SITE}/pt/inicio`)
  await waitFor(`!!document.querySelector('.linked-list')`)
  const mine = await ev(`document.querySelector('.my-rover').innerText`)
  await check('"Meu rover" shows the Hangar rover and the released agent', () => { assert.match(mine, /Lumi/); assert.match(mine, /Lontra/) })
  await shot('9-meu-rover-ligados', '.my-rover h1')
  // removing in the Account Center: the rover becomes the Hangar event, the agent goes with the `tirar` act
  const rmRover = await go(`${API}/api/contas/folgali/remover`, { method: 'POST', body: { tipo: 'rover', id: hangarRover.uid }, jar: rvm, origin: API })
  const queue = new DatabaseSync(envApi.RVM_HANGAR_EVENTOS_DB).prepare("SELECT corpo FROM hangar_eventos WHERE tipo = 'folgali.rover.removed'").all().map((r) => JSON.parse(r.corpo).dados)
  await check('removing the Hangar rover in the Center: folgali drops it and the Hangar gets `folgali.rover.removed { pessoa, uid }`', () => {
    assert.equal(rmRover.status, 200, rmRover.text)
    assert.deepEqual(queue, [{ pessoa: ana.id, uid: hangarRover.uid }])
  })
  const rmAgent = await go(`${API}/api/contas/folgali/remover`, { method: 'POST', body: { tipo: 'agente', id: agentUid }, jar: rvm, origin: API })
  await check('removing the agent in the Center hands a `tirar` act to the open issuer: the agent is out', async () => {
    assert.equal(rmAgent.status, 200, rmAgent.text)
    assert.equal(await agent('estado'), 'tirado')
  })

  // ── 5. the account is deleted: the person's uid goes to the public revoked list ──
  const del = await go(`${API}/api/conta/apagar`, { method: 'POST', body: { senha: 'SenhaDaAna2026' }, jar: rvm, origin: API })
  const list = await go(`${API}/api/auth/app/folgali/issuers.json`)
  await check('deleting the Rovemark account puts the person uid in issuers.json, in the format the relay reads', () => {
    assert.ok(del.status < 300, del.text)
    assert.equal(list.json.versao, 1)
    assert.deepEqual(list.json.emissores, [{ chave: PUB.people, estado: 'atual' }])
    assert.ok(list.json.revogados.some((r) => r.uid === holder.json.uid && r.emissor === PUB.people), list.text)
  })
  console.log(`\n${n} checks, all right.${shots.length ? `\nscreenshots:\n${shots.join('\n')}` : ''}`)
} catch (e) {
  console.error('\nFAILED:', e.stack || e.message)
  for (const [k, v] of Object.entries(logs)) console.error(`--- ${k} ---\n${v.slice(-2000)}`)
  process.exitCode = 1
} finally {
  await pilot?.close().catch(() => {})
  for (const c of children) c.kill()
  setTimeout(() => process.exit(process.exitCode ?? 0), 500).unref()
}
