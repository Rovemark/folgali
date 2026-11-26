#!/usr/bin/env node
// End to end of EVENTS (protocol 0.11.0 part 4) on a LOCAL relay: the reference relay as a real process (the person issuer listed as
// verified, so a new account creates events from day one), a stand-in for the Rovemark login that knows two people, the real site
// (standalone build) and real browsers (Logica Pilot, one per person plus one visitor) where each device signs.
// Proves: Ana signs in and creates an event in the form (zone, place, cover, 1 spot); it shows in "Próximos" and "Esta semana" and not
// in "Online"; Bia signs in on her own browser, answers Vou and the full event refuses it on the screen (suggesting Talvez); Talvez
// goes; with the browser in Tokyo the event also shows her own time; Ana edits (2 spots, new place) and Bia, told of the change, now
// answers Vou; the counts follow; the profile shows the event; a visitor reads it all and is invited to sign in, with no answer
// buttons; Ana cancels after the confirmation, Bia is told and the event takes no more answers.
//
//   npx next build   (then)   node scripts/e2e-events.mjs .next/standalone [--fotos <dir>]
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'folgali-e2e-eventos-'))
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
  ana: { id: 'p_e2e_eventos_ana_0001', handle: null, want: 'ana.eventos', nome: 'Ana Souza' },
  bia: { id: 'p_e2e_eventos_bia_0002', handle: null, want: 'bia.eventos', nome: 'Bia Lima' },
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
const event = async (id) => (await relay(`/v1/eventos/${id}`)).json
const answered = async (id, reply) => (await relay(`/v1/eventos/${id}/presencas?resposta=${reply}`)).json.itens.map((i) => i.uid)
const notices = (uid) => {
  const db = new DatabaseSync(DB, { readOnly: true })
  try { return db.prepare("SELECT tipo FROM notificacoes WHERE dest = ? AND tipo LIKE 'evento-%' ORDER BY seq").all(uid).map((r) => r.tipo) } finally { db.close() }
}

/** The date in a zone some days from now ("2026-11-26"). */
const dateIn = (zone, days) => new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date(Date.now() + days * 86400_000))

const pilots = []
try {
  await start('relay', ['--disable-warning=ExperimentalWarning', path.join(REPO, 'packages/relay/bin/relay.js')], {
    cwd: REPO, ready: /"ouvindo"/,
    env: { ...inherited, RELAY_ISSUERS: people.publicKey, RELAY_PEOPLE_ISSUERS: people.publicKey, RELAY_VERIFIED_ISSUERS: people.publicKey, RELAY_DB: DB, RELAY_PORT: String(pRelay), RELAY_REPORT_SECRET: 'ab'.repeat(32), RELAY_GALLERY_BASE: SITE },
  })
  await start('site', ['server.js'], {
    cwd: standalone, ready: /Ready|started|127\.0\.0\.1/i,
    env: { ...inherited, NODE_ENV: 'production', PORT: String(pSite), HOSTNAME: '127.0.0.1', FOLGALI_SESSION_SECRET: crypto.randomBytes(32).toString('base64url'), FOLGALI_ROVEMARK_API: API, FOLGALI_ROVEMARK_RETURN: `${SITE}/api/auth/rovemark/callback`, FOLGALI_DATA_DIR: path.join(tmp, 'folgali'), FOLGALI_CLIENT: 'http', FOLGALI_RELAY_URL: RELAY, FOLGALI_BASE_URL: SITE },
  })
  console.log(`▶ relay ${RELAY} (verified person issuer), Rovemark stand-in ${API}, site ${SITE}`)
  await check('the relay announces events and their limits', async () => {
    const i = (await relay('/v1/info')).json
    assert.ok(i.recursos.includes('eventos'), String(i.recursos))
    assert.deepEqual(i.eventos.respostas, ['vou', 'talvez', 'nao-vou'])
  })

  const require = createRequire(import.meta.url)
  const { LogicaPilot } = require(pilotPath())
  /** One browser of its own (its own cookies and device key), with the helpers. */
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
    b.shot = async (name, { width = 1440, height = 900, tema: theme = 'claro', sel } = {}) => {
      if (!photos) return
      await pilot.page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: width < 700 ? 2 : 1, mobile: false })
      await pilot.page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme === 'escuro' ? 'dark' : 'light' }] })
      await ev(`localStorage.setItem('rn-tema','${theme}');document.documentElement.dataset.tema='${theme}'`)
      if (sel) await ev(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({block:'start'})`)
      else await ev('window.scrollTo(0,0)')
      await ev(`Promise.all([...document.images].filter((i)=>i.getBoundingClientRect().top<innerHeight*1.5).map((i)=>{i.loading='eager';return i.decode().catch(()=>null)}))`).catch(() => null)
      await sleep(700)
      const { data } = await pilot.page.send('Page.captureScreenshot', { format: 'jpeg', quality: 82, fromSurface: true })
      fs.writeFileSync(path.join(photos, `${name}-${width}-${theme}.jpg`), Buffer.from(data, 'base64'))
    }
    b.shots4 = async (name, sel) => {
      for (const width of [1440, 390]) for (const theme of ['claro', 'escuro']) await b.shot(name, { width, tema: theme, sel })
      await pilot.page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
      await ev(`localStorage.setItem('rn-tema','claro');document.documentElement.dataset.tema='claro'`)
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

  // ── Ana creates an event ──
  const ana = await browser()
  await signIn(ana, PEOPLE.ana)
  await check('Ana signs in, accepts the Terms and creates her profile; the Events list offers "Criar evento"', async () => {
    await ana.goto(`${SITE}/pt/eventos`)
    await ana.waitFor(`!!document.querySelector('.evr-create')`)
    assert.equal((await ana.text('.evr-create')).trim(), 'Criar evento')
  })
  const ZONE = 'America/Sao_Paulo'
  const DAY = dateIn(ZONE, 2)
  await ana.goto(`${SITE}/pt/eventos/novo`)
  await ana.waitFor(`!!document.querySelector('form.evr-form input[name=titulo]')`)
  await ana.set('form.evr-form input[name=titulo]', 'Noite de jogos de tabuleiro')
  await ana.set('form.evr-form textarea[name=descricao]', 'Tragam seus jogos favoritos.\nTem café e bolo de fubá.')
  await ana.set('form.evr-form input[name=inicioData]', DAY)
  await ana.set('form.evr-form input[name=inicioHora]', '20:00')
  await ana.set('form.evr-form input[name=fimData]', DAY)
  await ana.set('form.evr-form input[name=fimHora]', '23:00')
  await ana.set('form.evr-form select[name=fuso]', ZONE)
  await ana.set('form.evr-form input[name=lugar]', 'Praça da Liberdade, banco perto do coreto')
  await ana.click('form.evr-form input[name=capa][value=cover-stars]')
  await ana.set('form.evr-form input[name=vagas]', '1')
  await sleep(200)
  await ana.shots4('02-form-novo')
  await ana.shots4('02b-form-novo-capas', '.evr-capas')
  await ana.click('form.evr-form button[type=submit]')
  await ana.waitFor(`/^\\/pt\\/eventos\\/ob_[A-Za-z0-9_-]{43}$/.test(location.pathname)&&!!document.querySelector('.evr-aberto h1')`, 45000)
  const ID = (await ana.ev('location.pathname')).split('/').pop()
  const startS = Math.floor(Date.parse(`${DAY}T20:00:00-03:00`) / 1000)
  await check('the form signed evento-criar on Ana\'s device: the relay holds the exact content, she counts as going', async () => {
    const e = await event(ID)
    assert.equal(e.titulo, 'Noite de jogos de tabuleiro')
    assert.equal(e.descricao, 'Tragam seus jogos favoritos.\nTem café e bolo de fubá.')
    assert.equal(e.inicio, startS)
    assert.equal(e.fim, startS + 3 * 3600)
    assert.equal(e.fuso, ZONE)
    assert.equal(e.online, false)
    assert.equal(e.lugar, 'Praça da Liberdade, banco perto do coreto')
    assert.deepEqual(e.capa, { galeria: 'cover-stars' })
    assert.equal(e.vagas, 1)
    assert.equal(e.vagasRestantes, 0)
    assert.equal(e.organizador.uid, PEOPLE.ana.uid)
    assert.equal(e.envelope.objeto.tipo, 'evento-criar')
    assert.equal(e.envelope.aprovacao ?? null, null, 'no approval travels with an event of a person')
    assert.deepEqual(await answered(ID, 'vou'), [PEOPLE.ana.uid])
  })
  await check('the open event shows Ana as the organizer: Editar and Cancelar evento, the place, the cover', async () => {
    await ana.waitFor(`!!document.querySelector('.evr-org-actions a[href$="/editar"]')`)
    const t = await ana.text('main')
    assert.match(t, /20:00 até 23:00/)
    assert.match(t, /Praça da Liberdade, banco perto do coreto/)
    assert.match(t, /Lotado/)
    assert.equal(await ana.ev(`document.querySelector('.ev-cover-photo img').getAttribute('src')`), '/marca/folgali/covers/stars.webp')
  })
  await ana.shots4('03-evento-organizadora')
  await check('it shows in "Próximos" and in "Esta semana", not in "Online"', async () => {
    for (const q of ['', '?filtro=semana']) {
      await ana.goto(`${SITE}/pt/eventos${q}`)
      await ana.waitFor(`[...document.querySelectorAll('.evr-card .ev-link')].some((a)=>a.textContent==='Noite de jogos de tabuleiro')`)
    }
    await ana.goto(`${SITE}/pt/eventos?filtro=online`)
    await ana.waitFor(`!!document.querySelector('.ev-main')`)
    assert.equal(await ana.ev(`document.querySelectorAll('.evr-card').length`), 0)
  })
  await ana.goto(`${SITE}/pt/eventos?filtro=semana`)
  await ana.waitFor(`!!document.querySelector('.evr-card')`)
  await ana.shots4('01-lista-semana')

  // ── Bia answers: full, then Talvez; in Tokyo she also sees her own time ──
  const bia = await browser()
  await signIn(bia, PEOPLE.bia)
  await bia.pilot.page.send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Tokyo' })
  await bia.goto(`${SITE}/pt/eventos/${ID}`)
  await bia.waitFor(`!!document.querySelector('.evr-buttons button[data-resposta=vou]')`)
  await bia.click('.evr-buttons button[data-resposta=vou]')
  await bia.waitFor(`!!document.querySelector('.evr-refusal')`)
  await check('Bia answers Vou on a full event: refused on the screen, suggesting Talvez; nothing changes on the relay', async () => {
    assert.equal((await bia.text('.evr-refusal')).trim(), 'As vagas acabaram. Você pode responder Talvez para acompanhar.')
    assert.deepEqual(await answered(ID, 'vou'), [PEOPLE.ana.uid])
    assert.equal(await bia.ev(`document.querySelector('.evr-buttons button[data-resposta=vou]').getAttribute('aria-pressed')`), 'false')
  })
  await bia.shots4('04-evento-lotado')
  await bia.click('.evr-buttons button[data-resposta=talvez]')
  await bia.waitFor(`document.querySelector('.evr-buttons button[data-resposta=talvez]').getAttribute('aria-pressed')==='true'&&!document.querySelector('.evr-refusal')`)
  await check('Talvez goes; her browser in Tokyo also shows the event in her own time', async () => {
    assert.deepEqual(await answered(ID, 'talvez'), [PEOPLE.bia.uid])
    await bia.goto(`${SITE}/pt/eventos/${ID}`)
    // her own answer comes back from the relay read as her (signed on her device)
    await bia.waitFor(`document.querySelector('.evr-buttons button[data-resposta=talvez]')?.getAttribute('aria-pressed')==='true'`)
    await bia.waitFor(`!!document.querySelector('.evr-reader')`)
    assert.match(await bia.text('.evr-reader'), /^No seu horário: .+ 08:00 até 11:00/)
    assert.match(await bia.text('#quem-vai'), /Ana Souza/)
  })
  await bia.shots4('05-evento-talvez-toquio')

  // ── Ana edits: two spots and a new place; Bia is told and goes ──
  await ana.goto(`${SITE}/pt/eventos/${ID}/editar`)
  await ana.waitFor(`document.querySelector('form.evr-form input[name=titulo]')?.value==='Noite de jogos de tabuleiro'`)
  await check('the edit form opens with what the event says now', async () => {
    assert.equal(await ana.ev(`document.querySelector('form.evr-form input[name=inicioHora]').value`), '20:00')
    assert.equal(await ana.ev(`document.querySelector('form.evr-form input[name=vagas]').value`), '1')
    assert.equal(await ana.ev(`document.querySelector('form.evr-form input[name=capa][value=cover-stars]').checked`), true)
  })
  await ana.set('form.evr-form input[name=vagas]', '2')
  await ana.set('form.evr-form input[name=lugar]', 'Biblioteca do bairro, sala 2')
  await sleep(200)
  await ana.shots4('06-form-editar')
  await ana.click('form.evr-form button[type=submit]')
  await ana.waitFor(`location.pathname==='/pt/eventos/${ID}'&&/Biblioteca do bairro/.test(document.querySelector('main').innerText)`, 45000)
  await check('evento-editar carries the whole content: 2 spots, the new place, the same start; who said Talvez is told', async () => {
    const e = await event(ID)
    assert.equal(e.versoes, 2)
    assert.equal(e.editado, true)
    assert.equal(e.vagas, 2)
    assert.equal(e.lugar, 'Biblioteca do bairro, sala 2')
    assert.equal(e.inicio, startS)
    assert.equal(e.envelope.objeto.tipo, 'evento-editar')
    assert.deepEqual(notices(PEOPLE.bia.uid), ['evento-editado'])
  })
  await bia.goto(`${SITE}/pt/eventos/${ID}`)
  await bia.waitFor(`document.querySelector('.evr-buttons button[data-resposta=talvez]')?.getAttribute('aria-pressed')==='true'`)
  await bia.click('.evr-buttons button[data-resposta=vou]')
  await bia.waitFor(`document.querySelector('.evr-buttons button[data-resposta=vou]').getAttribute('aria-pressed')==='true'`)
  await check('Bia now answers Vou: the counts follow on the relay and on the page', async () => {
    const e = await event(ID)
    assert.deepEqual(e.contagens, { vou: 2, talvez: 0, naoVou: 0 })
    assert.equal(e.vagasRestantes, 0)
    await bia.waitFor(`/2 vão/.test(document.querySelector('.evr-cover-info').innerText)`)
    await bia.waitFor(`/Bia Lima/.test(document.querySelector('#quem-vai').innerText)`)
  })

  // ── a visitor ──
  await check('a visitor reads the event and the list (server HTML): no answer buttons, the invitation to sign in', async () => {
    const html = await (await fetch(`${SITE}/pt/eventos/${ID}`)).text()
    assert.match(html, /Noite de jogos de tabuleiro/)
    assert.match(html, /Entre com a conta Rovemark para responder\./)
    assert.doesNotMatch(html, /data-resposta/)
    assert.match(await (await fetch(`${SITE}/pt/eventos`)).text(), /Noite de jogos de tabuleiro/)
  })
  const visitor = await browser()
  await visitor.goto(`${SITE}/pt/eventos/${ID}`)
  await visitor.waitFor(`!!document.querySelector('.evr-invite')`)
  await check('in the visitor browser nobody organizes: no Editar, no Cancelar', async () => {
    await sleep(800)
    assert.equal(await visitor.ev(`!!document.querySelector('.evr-org-actions')`), false)
  })
  await visitor.shots4('07-evento-visitante')
  await visitor.goto(`${SITE}/pt/eventos`)
  await visitor.waitFor(`!!document.querySelector('.evr-card')`)
  await visitor.shots4('08-lista-visitante')

  // ── the profile ──
  await check('the profiles show the event: Ana organizes it, Bia goes', async () => {
    await visitor.goto(`${SITE}/pt/r/${PEOPLE.ana.want}`)
    await visitor.waitFor(`!!document.querySelector('.evr-profile')`)
    assert.match(await visitor.text('.evr-profile'), /Organiza\s+Noite de jogos de tabuleiro/)
    await visitor.goto(`${SITE}/pt/r/${PEOPLE.bia.want}`)
    await visitor.waitFor(`!!document.querySelector('.evr-profile')`)
    assert.match(await visitor.text('.evr-profile'), /Vai\s+Noite de jogos de tabuleiro/)
  })
  await visitor.goto(`${SITE}/pt/r/${PEOPLE.ana.want}`)
  await visitor.waitFor(`!!document.querySelector('.evr-profile')`)
  await visitor.shots4('09-perfil-eventos', '.evr-profile')

  // ── Ana cancels ──
  await ana.goto(`${SITE}/pt/eventos/${ID}`)
  await ana.waitFor(`!!document.querySelector('.evr-org-actions button')`)
  await ana.clickText('.evr-org-actions button', 'Cancelar evento')
  await ana.waitFor(`!!document.querySelector('.evr-confirm')`)
  await ana.shots4('10-cancelar-confirmacao', '.evr-org-actions')
  await ana.clickText('.evr-confirm button', 'Sim, cancelar')
  await ana.waitFor(`!!document.querySelector('.evr-state')`, 45000)
  await check('Ana confirms and cancels: the relay marks it, Bia is told, the page says so and takes no more answers', async () => {
    const e = await event(ID)
    assert.equal(e.estado, 'cancelado')
    assert.equal(e.encerrado, true)
    assert.deepEqual(notices(PEOPLE.bia.uid), ['evento-editado', 'evento-cancelado'])
    assert.equal((await ana.text('.evr-state')).trim(), 'Este evento foi cancelado por quem organiza.')
    await bia.goto(`${SITE}/pt/eventos/${ID}`)
    await bia.waitFor(`!!document.querySelector('.evr-state')`)
    assert.equal(await bia.ev(`!!document.querySelector('.evr-buttons')`), false)
  })
  await bia.shots4('11-evento-cancelado-convidada')
  await bia.goto(`${SITE}/pt/eventos`)
  await bia.waitFor(`!!document.querySelector('.evr-card[data-estado=cancelado]')`)
  await bia.shots4('12-lista-com-cancelado')

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
