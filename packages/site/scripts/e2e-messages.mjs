#!/usr/bin/env node
// End to end of PRIVATE MESSAGES for people (protocol 0.4.0) on a LOCAL relay: the reference relay as a real process with
// RELAY_MESSAGES=sim, a stand-in for the Rovemark login that knows two people, the real site (standalone build) and two real browsers
// (Logica Pilot), one per person, where each device creates its own cipher key and signs.
// Proves: both activate messages on their device (the relay holds only the PUBLIC cipher key); they become friends through the profile
// buttons; Ana asks for a conversation (the request in clear, as the protocol says); Bia accepts; they exchange messages that each
// browser decrypts; the relay database holds only cipher text (no clear text in the rows nor anywhere in the database files); Bia
// reports one of Ana's messages, which reveals that text, and only it, to the operator; deleting a copy removes it for one side only.
//
//   npx next build   (then)   node scripts/e2e-messages.mjs .next/standalone [--fotos <dir>]
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
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
const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO = path.resolve(SITE_DIR, '..', '..')
const standaloneRoot = path.resolve(args[0] ?? path.join(SITE_DIR, '.next/standalone'))
const standalone = fs.existsSync(path.join(standaloneRoot, 'server.js')) ? standaloneRoot : path.join(standaloneRoot, 'packages/site')
for (const [from, to] of [[path.join(SITE_DIR, 'public'), path.join(standalone, 'public')], [path.join(SITE_DIR, '.next/static'), path.join(standalone, '.next/static')]]) {
  fs.cpSync(from, to, { recursive: true, force: true })
}
const P = await import(pathToFileURL(path.join(REPO, 'packages/protocol/src/index.js')).href)
const M = await import(pathToFileURL(path.join(REPO, 'test/helpers/world.js')).href)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'folgali-e2e-mensagens-'))
if (photos) fs.mkdirSync(photos, { recursive: true })

const freePort = async () => { const s = http.createServer(); s.listen(0, '127.0.0.1'); await once(s, 'listening'); const p = s.address().port; await new Promise((ok) => s.close(ok)); return p }
const [pApi, pSite, pRelay] = [await freePort(), await freePort(), await freePort()]
const API = `http://127.0.0.1:${pApi}`
const SITE = `http://127.0.0.1:${pSite}`
const RELAY = `http://127.0.0.1:${pRelay}`
const people = M.newIssuer()
const uidSecret = crypto.randomBytes(32)
const DB = path.join(tmp, 'rele.sqlite')
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))
let n = 0
const check = async (label, fn) => { await fn(); n++; console.log(`  ✓ ${label}`) }
const inherited = Object.fromEntries(['PATH', 'TMPDIR', 'LANG', 'HOME'].filter((k) => process.env[k]).map((k) => [k, process.env[k]]))

// ── two people behind the Rovemark stand-in; the one signing in next is `current` ──
const PEOPLE = {
  ana: { id: 'p_e2e_mensagens_ana_001', handle: null, want: 'ana.mensagens', nome: 'Ana Souza' },
  bia: { id: 'p_e2e_mensagens_bia_002', handle: null, want: 'bia.mensagens', nome: 'Bia Lima' },
}
for (const p of Object.values(PEOPLE)) p.uid = P.derivePersonUid(uidSecret, p.id)
let current = PEOPLE.ana
const byCode = new Map()
const byToken = new Map()
const api = http.createServer(async (req, res) => {
  const url = new URL(req.url, API)
  const body = await new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d }); req.on('end', () => ok(b ? JSON.parse(b) : {})) })
  const send = (status, j) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(j)) }
  if (url.pathname === '/api/auth/oauth/rovemark/start') {
    const back = new URL(url.searchParams.get('volta'))
    const code = crypto.randomBytes(24).toString('base64url')
    byCode.set(code, current)
    back.searchParams.set('estado', url.searchParams.get('estado'))
    back.searchParams.set('codigo', code)
    res.writeHead(302, { location: back.toString() })
    return res.end()
  }
  const tokens = (who) => {
    const t = { access_token: `rmapp_at_${crypto.randomBytes(32).toString('base64url')}`, refresh_token: `rmapp_rt_${crypto.randomBytes(32).toString('base64url')}`, expires_in: 900, pessoa: { id: who.id, nome: `${who.nome} da Conta` } }
    byToken.set(t.access_token, who)
    byToken.set(t.refresh_token, who)
    return t
  }
  if (url.pathname === '/api/auth/app/exchange') return byCode.has(body.codigo) ? send(200, tokens(byCode.get(body.codigo))) : send(400, { error: 'bad_code' })
  if (url.pathname === '/api/auth/app/refresh') return byToken.has(body.refresh_token) ? send(200, tokens(byToken.get(body.refresh_token))) : send(401, { error: 'bad_refresh' })
  const who = byToken.get(String(req.headers.authorization ?? '').replace(/^Bearer /, ''))
  if (!who) return send(401, { error: 'no_token' })
  if (url.pathname === '/api/auth/app/folgali/person') return send(200, { ok: true, uid: who.uid, handle: who.handle, adult: true })
  if (url.pathname === '/api/auth/app/folgali/person-attestation') {
    if (body.handle) who.handle = body.handle
    const t = Math.floor(Date.now() / 1000) - 5
    return send(200, { ok: true, attestation: P.createPersonAttestation({ issuerPrivateKey: people.chavePrivada, emissor: people.publicKey, uid: who.uid, handle: who.handle, chave: body.key, emitidoEm: t, expiraEm: t + 7 * 86400 }) })
  }
  send(404, { error: 'not_found' })
})
api.listen(pApi, '127.0.0.1')
await once(api, 'listening')

const children = {}
const logs = {}
function start(name, argv, { cwd, env, ready }) {
  return new Promise((ok, fail) => {
    const c = spawn(process.execPath, argv, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    children[name] = c
    logs[name] = ''
    const t = setTimeout(() => fail(new Error(`${name} did not start: ${logs[name].slice(-800)}`)), 60_000)
    const on = (d) => { logs[name] += d; if (ready.test(logs[name])) { clearTimeout(t); ok(c) } }
    c.stdout.on('data', on)
    c.stderr.on('data', on)
  })
}
const relay = async (p) => { const r = await fetch(`${RELAY}${p}`); return { status: r.status, json: await r.json().catch(() => null) } }
const rows = (sql, ...params) => {
  const db = new DatabaseSync(DB, { readOnly: true })
  try { return db.prepare(sql).all(...params).map((r) => ({ ...r })) } finally { db.close() }
}
/** Every byte the relay keeps on disk (the database and its write-ahead log), as text, to search for a clear text. */
const onDisk = () => ['', '-wal', '-shm'].map((s) => `${DB}${s}`).filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f).toString('latin1') + fs.readFileSync(f).toString('utf8')).join('\n')

const pilots = []
try {
  await start('relay', ['--disable-warning=ExperimentalWarning', path.join(REPO, 'packages/relay/bin/relay.js')], {
    cwd: REPO, ready: /"ouvindo"/,
    env: { ...inherited, RELAY_MESSAGES: 'sim', RELAY_ISSUERS: people.publicKey, RELAY_PEOPLE_ISSUERS: people.publicKey, RELAY_VERIFIED_ISSUERS: people.publicKey, RELAY_DB: DB, RELAY_PORT: String(pRelay), RELAY_REPORT_SECRET: 'ab'.repeat(32), RELAY_GALLERY_BASE: SITE },
  })
  await start('site', ['server.js'], {
    cwd: standalone, ready: /Ready|started|127\.0\.0\.1/i,
    env: { ...inherited, NODE_ENV: 'production', PORT: String(pSite), HOSTNAME: '127.0.0.1', FOLGALI_SESSION_SECRET: crypto.randomBytes(32).toString('base64url'), FOLGALI_ROVEMARK_API: API, FOLGALI_ROVEMARK_RETURN: `${SITE}/api/auth/rovemark/callback`, FOLGALI_DATA_DIR: path.join(tmp, 'folgali'), FOLGALI_CLIENT: 'http', FOLGALI_RELAY_URL: RELAY, FOLGALI_BASE_URL: SITE },
  })
  console.log(`▶ relay ${RELAY} (RELAY_MESSAGES=sim), Rovemark stand-in ${API}, site ${SITE}`)
  await check('the relay announces messages', async () => {
    const i = (await relay('/v1/info')).json
    assert.ok(i.recursos.includes('mensagens'), String(i.recursos))
    assert.equal(i.mensagens, true)
  })

  const require = createRequire(import.meta.url)
  const { LogicaPilot } = require(pilotPath())
  /** One browser of its own (its own cookies, device key and cipher key), with the helpers. */
  async function browser() {
    const pilot = await new LogicaPilot({ headless: true, width: 1440, height: 900 }).launch()
    pilots.push(pilot)
    const ev = (js) => pilot.page.eval(js)
    const b = {
      pilot, ev,
      goto: (u) => pilot.goto(u),
      waitFor: async (js, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(js).catch(() => false)) return true; await sleep(200) } throw new Error(`timed out: ${js}\n--- page ---\n${String(await ev(`location.href+'\\n'+(document.querySelector('main')||document.body).innerText.slice(0,1500)`).catch((x) => x.message))}`) },
      set: (sel, value) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});const set=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value').set;set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));return true})()`),
      click: (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.click();return true})()`),
      clickText: (scope, text) => ev(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(scope)})].find((b)=>b.textContent.trim()===${JSON.stringify(text)});if(!e)return false;e.click();return true})()`),
      text: (sel) => ev(`document.querySelector(${JSON.stringify(sel)})?.innerText ?? null`),
    }
    b.view = async (width, theme) => {
      await pilot.page.send('Emulation.setDeviceMetricsOverride', { width, height: width < 700 ? 844 : 900, deviceScaleFactor: width < 700 ? 2 : 1, mobile: false })
      await pilot.page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme === 'escuro' ? 'dark' : 'light' }] })
      await ev(`localStorage.setItem('rn-tema','${theme}');document.documentElement.dataset.tema='${theme}'`)
    }
    b.snap = async (name, width, theme) => {
      if (!photos) return
      await b.view(width, theme)
      await ev('window.scrollTo(0,0)')
      await sleep(700)
      const { data } = await pilot.page.send('Page.captureScreenshot', { format: 'jpeg', quality: 82, fromSurface: true })
      fs.writeFileSync(path.join(photos, `${name}-${width}-${theme}.jpg`), Buffer.from(data, 'base64'))
    }
    b.reset = () => b.view(1440, 'claro')
    /** The same screen in 1440 and 390, light and dark. `atPhone` runs before the phone shots (to pick the pane). */
    b.shots4 = async (name, atPhone) => {
      for (const theme of ['claro', 'escuro']) await b.snap(name, 1440, theme)
      if (atPhone) { await b.view(390, 'claro'); await sleep(300); await atPhone() }
      for (const theme of ['claro', 'escuro']) await b.snap(name, 390, theme)
      await b.reset()
    }
    return b
  }
  /** Sign in with Rovemark as `who`, accept the Terms and create the folgali profile. */
  async function signIn(b, who) {
    current = who
    await b.goto(`${SITE}/api/auth/rovemark/inicio?lang=pt&destino=/pt/entrar`)
    await b.waitFor(`location.pathname==='/pt/entrar'`)
    await b.waitFor(`!!document.querySelector('input[name=aceito]')`)
    await b.click('input[name=aceito]')
    await sleep(300)
    await b.click('form.consent button[type=submit]')
    await b.waitFor(`!document.querySelector('input[name=aceito]')`)
    await b.goto(`${SITE}/pt/linha`)
    await b.waitFor(`!!document.querySelector('.pw-box input')`)
    const inputs = await b.ev(`[...document.querySelectorAll('.pw-box input')].map((i)=>'#'+CSS.escape(i.id))`)
    await b.set(inputs[0], who.want)
    await b.set(inputs[1], who.nome)
    await b.click('.pw-box button[type=submit]')
    await b.waitFor(`!!document.querySelector('.pw-box textarea')`)
    assert.equal((await relay(`/v1/handles/${who.want}`)).json.nome, who.nome)
  }
  /** Turn messages on in this browser from the messages page. */
  async function activate(b, who, shot) {
    await b.goto(`${SITE}/pt/mensagens`)
    await b.waitFor(`!!document.querySelector('.cv-activate button')`)
    if (shot) await b.shots4(shot)
    await b.click('.cv-activate button')
    await b.waitFor(`!!document.querySelector('.cv-list')`, 45000)
    const k = await relay(`/v1/rovers/${who.uid}/chave-de-cifra`)
    assert.equal(k.status, 200)
    assert.equal(k.json.objeto.tipo, 'chave-de-cifra')
    assert.equal(k.json.objeto.v, '0.4')
    assert.equal(k.json.objeto.previo, null)
    return k.json.objeto.corpo.chave
  }

  const ana = await browser()
  const bia = await browser()
  await signIn(ana, PEOPLE.ana)
  await signIn(bia, PEOPLE.bia)

  let anaKey, biaKey
  await check('Ana turns messages on in her browser: the relay keeps only the public cipher key, signed by her device', async () => {
    anaKey = await activate(ana, PEOPLE.ana, '01-ativar')
    const stored = rows('SELECT uid, chave, vigente FROM chaves_de_cifra')
    assert.deepEqual(stored, [{ uid: PEOPLE.ana.uid, chave: anaKey, vigente: 1 }])
    // the cipher key in her IndexedDB cannot be exported: the private half never leaves the browser
    const extractable = await ana.ev(`new Promise((ok)=>{const r=indexedDB.open('folgali',1);r.onsuccess=()=>{const g=r.result.transaction('device').objectStore('device').get('cipher-key:${PEOPLE.ana.uid}');g.onsuccess=()=>ok(String(g.result.privateKey.extractable)+':'+g.result.privateKey.algorithm.name)}})`)
    assert.equal(extractable, 'false:X25519')
  })
  await check('Bia turns messages on in hers', async () => {
    biaKey = await activate(bia, PEOPLE.bia)
    assert.notEqual(biaKey, anaKey)
  })

  await check('they become friends through the profile buttons; before that, the new conversation offers nobody', async () => {
    await ana.click('.cv-list .cv-head button')
    await ana.waitFor(`/só entre amigos/.test(document.querySelector('.cv-new-body')?.innerText||'')&&!document.querySelector('.cv-friends')`)
    await ana.goto(`${SITE}/pt/r/${PEOPLE.bia.want}`)
    await ana.waitFor(`[...document.querySelectorAll('.pf-relationship-row button')].some((b)=>b.textContent.trim()==='Pedir amizade')`)
    await ana.clickText('.pf-relationship-row button', 'Pedir amizade')
    await ana.waitFor(`/Pedido enviado/.test(document.querySelector('.pf-relationship-row').innerText)`)
    await bia.goto(`${SITE}/pt/r/${PEOPLE.ana.want}`)
    await bia.waitFor(`[...document.querySelectorAll('.pf-relationship-row button')].some((b)=>b.textContent.trim()==='Aceitar amizade')`)
    await bia.clickText('.pf-relationship-row button', 'Aceitar amizade')
    await bia.waitFor(`/Amigos/.test(document.querySelector('.pf-relationship-row').innerText)`)
  })

  const REQUEST = 'Oi Bia! Quer combinar o piquenique de sábado por aqui?'
  const ANA_1 = 'Levo a toalha xadrez e o bolo de cenoura. Você leva o suco?'
  const BIA_1 = 'Combinado! Levo suco de caju e uns pães de queijo.'
  const ANA_2 = 'Fechado. Encontro às 10h no portão do parque.'
  let conversation
  await check('Ana asks Bia for a conversation: the screen warns the request travels in clear, the relay keeps it pending', async () => {
    await ana.goto(`${SITE}/pt/mensagens`)
    await ana.waitFor(`!!document.querySelector('.cv-list')`)
    await ana.click('.cv-list .cv-head button')
    await ana.waitFor(`!!document.querySelector('.cv-friends .cv-friend')`)
    await ana.shots4('02-nova-conversa-amigos')
    await ana.click('.cv-friends .cv-friend')
    await ana.waitFor(`!!document.querySelector('#cv-pedido-texto')`)
    assert.match(await ana.text('.cv-notice-clear'), /em claro/)
    await ana.set('#cv-pedido-texto', REQUEST)
    await sleep(200)
    await ana.shots4('03-pedido-escrevendo')
    await ana.click('.cv-request button[type=submit]')
    await ana.waitFor(`!!document.querySelector('.cv-request-block')&&/Esperando/.test(document.querySelector('.cv-request-block').innerText)`, 45000)
    conversation = (await ana.ev('location.pathname')).split('/').pop()
    assert.match(conversation, /^ob_[A-Za-z0-9_-]{43}$/)
    const [c] = rows('SELECT de, para, estado, pedido FROM conversas WHERE id = ?', conversation)
    assert.equal(c.de, PEOPLE.ana.uid)
    assert.equal(c.para, PEOPLE.bia.uid)
    assert.equal(c.estado, 'pendente')
    assert.equal(JSON.parse(c.pedido).objeto.corpo.texto, REQUEST)
  })
  await ana.shots4('04-pedido-enviado', async () => {})

  await check('Bia sees the pending request in her list, opens it, reads it (checked against Ana\'s signature) and accepts', async () => {
    await bia.goto(`${SITE}/pt/mensagens`)
    await bia.waitFor(`!!document.querySelector('.cv-conversation[data-pede]')`)
    await bia.shots4('05-lista-com-pedido')
    await bia.click('.cv-conversation[data-pede]')
    await bia.waitFor(`/piquenique/.test(document.querySelector('.cv-request-block')?.innerText||'')`)
    await bia.shots4('06-pedido-recebido', async () => { await bia.goto(`${SITE}/pt/mensagens/${conversation}`); await bia.waitFor(`/piquenique/.test(document.querySelector('.cv-request-block')?.innerText||'')`) })
    await bia.clickText('.cv-request-block button', 'Aceitar')
    await bia.waitFor(`!!document.querySelector('#cv-texto')`, 45000)
    assert.equal(rows('SELECT estado FROM conversas WHERE id = ?', conversation)[0].estado, 'ativa')
  })

  /** Write in the open conversation and wait until the relay holds one more message. */
  async function say(b, text) {
    const before = rows('SELECT COUNT(*) AS n FROM mensagens')[0].n
    await b.set('#cv-texto', text)
    await sleep(150)
    await b.click('.cv-write button[type=submit]')
    const t0 = Date.now()
    while (rows('SELECT COUNT(*) AS n FROM mensagens')[0].n === before) { if (Date.now() - t0 > 45000) throw new Error(`message not stored: ${await b.text('.cv-conversation-open')}`); await sleep(200) }
    await b.waitFor(`[...document.querySelectorAll('.cv-msg[data-minha=true] .cv-text')].some((p)=>p.textContent===${JSON.stringify(text)})`)
  }
  await check('they exchange messages; each browser decrypts what the other wrote', async () => {
    await ana.goto(`${SITE}/pt/mensagens/${conversation}`)
    await ana.waitFor(`!!document.querySelector('#cv-texto')`)
    await say(ana, ANA_1)
    await bia.goto(`${SITE}/pt/mensagens/${conversation}`)
    await bia.waitFor(`[...document.querySelectorAll('.cv-msg[data-minha=false] .cv-text')].some((p)=>p.textContent===${JSON.stringify(ANA_1)})`)
    await say(bia, BIA_1)
    await ana.goto(`${SITE}/pt/mensagens/${conversation}`)
    await ana.waitFor(`[...document.querySelectorAll('.cv-msg[data-minha=false] .cv-text')].some((p)=>p.textContent===${JSON.stringify(BIA_1)})`)
    await say(ana, ANA_2)
    await bia.goto(`${SITE}/pt/mensagens/${conversation}`)
    await bia.waitFor(`[...document.querySelectorAll('.cv-msg .cv-text')].length===3`)
    assert.deepEqual(await bia.ev(`[...document.querySelectorAll('.cv-msg .cv-text')].map((p)=>p.textContent)`), [ANA_1, BIA_1, ANA_2])
  })
  await check('the relay holds only cipher text: no message text in its rows, nor anywhere in its database files', async () => {
    const stored = rows('SELECT de, para, envelope FROM mensagens ORDER BY seq')
    assert.equal(stored.length, 3)
    for (const s of stored) {
      const o = JSON.parse(s.envelope).objeto
      assert.equal(o.v, '0.4')
      assert.equal(o.previo, null)
      assert.deepEqual(Object.keys(o.corpo).sort(), ['chaveDe', 'chavePara', 'cifrado', 'conversa', 'iv', 'para', 'sal'])
      assert.ok(P.ciphertextSizeMatches(o.corpo.cifrado))
    }
    const disk = onDisk()
    for (const text of [ANA_1, BIA_1, ANA_2, 'toalha xadrez', 'caju', 'portão do parque']) assert.ok(!disk.includes(text), `clear text on the relay disk: ${text}`)
    // what the protocol's own client decrypts with Bia's key, the relay could not: the cipher key never reached it
    assert.equal(rows("SELECT COUNT(*) AS n FROM chaves_de_cifra WHERE envelope LIKE '%\"d\"%'")[0].n, 0)
  })
  await bia.shots4('07-conversa', async () => { await bia.goto(`${SITE}/pt/mensagens/${conversation}`); await bia.waitFor(`[...document.querySelectorAll('.cv-msg .cv-text')].length===3`) })
  await bia.shots4('08-lista-celular', async () => { await bia.goto(`${SITE}/pt/mensagens`); await bia.waitFor(`!!document.querySelector('.cv-conversation')`) })
  await bia.goto(`${SITE}/pt/mensagens/${conversation}`)
  await bia.waitFor(`[...document.querySelectorAll('.cv-msg .cv-text')].length===3`)
  await bia.shots4('09-detalhes', async () => {
    await bia.goto(`${SITE}/pt/mensagens/${conversation}`)
    await bia.waitFor(`[...document.querySelectorAll('.cv-msg .cv-text')].length===3`)
    await bia.click('.cv-view-details')
    await bia.waitFor(`getComputedStyle(document.querySelector('.cv-details')).display!=='none'`)
  })

  await check('Bia reports Ana\'s second message: the form warns the operator will read it, and the relay keeps exactly that text', async () => {
    await bia.goto(`${SITE}/pt/mensagens/${conversation}`)
    await bia.waitFor(`[...document.querySelectorAll('.cv-msg .cv-text')].length===3`)
    await bia.ev(`(()=>{const li=[...document.querySelectorAll('.cv-msg')].find((l)=>l.querySelector('.cv-text')?.textContent===${JSON.stringify(ANA_2)});[...li.querySelectorAll('button')].find((b)=>b.textContent.trim()==='Denunciar').click();return true})()`)
    await bia.waitFor(`!!document.querySelector('.cv-report input[type=radio]')`)
    assert.match(await bia.text('.cv-report .cv-notice-clear'), /operador do relé o texto desta mensagem/)
    await bia.click('.cv-report input[value=assedio]')
    await sleep(200)
    await bia.shots4('10-denuncia', async () => {
      await bia.ev(`(()=>{const li=[...document.querySelectorAll('.cv-msg')].find((l)=>l.querySelector('.cv-text')?.textContent===${JSON.stringify(ANA_2)});[...li.querySelectorAll('button')].find((b)=>b.textContent.trim()==='Denunciar').click();return true})()`)
      await bia.waitFor(`!!document.querySelector('.cv-report input[type=radio]')`)
      await bia.click('.cv-report input[value=assedio]')
    })
    await bia.ev(`(()=>{const li=[...document.querySelectorAll('.cv-msg')].find((l)=>l.querySelector('.cv-text')?.textContent===${JSON.stringify(ANA_2)});[...li.querySelectorAll('button')].find((b)=>b.textContent.trim()==='Denunciar').click();return true})()`)
    await bia.waitFor(`!!document.querySelector('.cv-report input[type=radio]')`)
    await bia.click('.cv-report input[value=assedio]')
    await sleep(150)
    await bia.click('.cv-report button[type=submit]')
    await bia.waitFor(`/Denúncia recebida/.test(document.querySelector('.cv-report')?.innerText||'')`, 45000)
    const reports = rows('SELECT autor_do_alvo, motivo, texto FROM denuncias_de_mensagem')
    assert.deepEqual(reports, [{ autor_do_alvo: PEOPLE.ana.uid, motivo: 'assedio', texto: ANA_2 }])
  })

  await check('Bia deletes her copy of one message: gone for her, still there for Ana', async () => {
    await bia.goto(`${SITE}/pt/mensagens/${conversation}`)
    await bia.waitFor(`[...document.querySelectorAll('.cv-msg .cv-text')].length===3`)
    await bia.ev(`(()=>{const li=[...document.querySelectorAll('.cv-msg')].find((l)=>l.querySelector('.cv-text')?.textContent===${JSON.stringify(ANA_1)});[...li.querySelectorAll('button')].find((b)=>b.textContent.trim()==='Apagar').click();return true})()`)
    await bia.waitFor(`!!document.querySelector('.cv-msg .cv-confirm')`)
    await bia.clickText('.cv-msg .cv-confirm button', 'Confirmar')
    await bia.waitFor(`[...document.querySelectorAll('.cv-msg .cv-text')].length===2`, 45000)
    await ana.goto(`${SITE}/pt/mensagens/${conversation}`)
    await ana.waitFor(`[...document.querySelectorAll('.cv-msg .cv-text')].length===3`)
  })

  console.log(`\n${n} checks passed${photos ? `, photos in ${photos}` : ''}`)
} catch (e) {
  console.error(e)
  for (const [k, v] of Object.entries(logs)) console.error(`--- ${k} ---\n${v.slice(-1500)}`)
  process.exitCode = 1
} finally {
  for (const p of pilots) { try { await p.close() } catch { /* closed */ } }
  for (const c of Object.values(children)) c.kill()
  api.close()
}
