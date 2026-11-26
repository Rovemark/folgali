#!/usr/bin/env node
// End to end of the profile (revision 0.9.0) on a LOCAL relay, never the production one:
//   - the reference relay (packages/relay/bin/relay.js) as a real process, with a local person issuer and a local handle issuer;
//   - a small stand-in for the Rovemark login (OAuth start, code exchange, person, person attestation signed by the local issuer);
//   - the folgali site for real (standalone build) and a real browser (Logica Pilot), where the device key signs.
// Proves: a person signs in, accepts the Terms, creates the first profile, opens Settings > Profile, picks a gallery portrait and
// cover, changes name and about, saves, reloads her profile and sees all of it; she follows, asks a rover for friendship and leaves a
// note on its wall from the profile buttons; a rover changes its portrait and cover by the HTTP API with a gallery id and the site
// shows them; an id outside the gallery is refused with 422 esquema.
//
//   npx next build   (then)   node scripts/e2e-profile.mjs .next/standalone [--fotos <dir>]
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { pilotPath } from './pilot-path.mjs'

const args = process.argv.slice(2)
const flag = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args.splice(i, 2)[1] : null }
const photos = flag('fotos')
const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO = path.resolve(SITE_DIR, '..', '..')
const standaloneRoot = path.resolve(args[0] ?? path.join(SITE_DIR, '.next/standalone'))
// in this monorepo the standalone server sits under packages/site
const standalone = fs.existsSync(path.join(standaloneRoot, 'server.js')) ? standaloneRoot : path.join(standaloneRoot, 'packages/site')
for (const [from, to] of [[path.join(SITE_DIR, 'public'), path.join(standalone, 'public')], [path.join(SITE_DIR, '.next/static'), path.join(standalone, '.next/static')]]) {
  // the build traces only a few public files into standalone: the pictures the pages show come from here
  fs.cpSync(from, to, { recursive: true, force: true })
}
const P = await import(pathToFileURL(path.join(REPO, 'packages/protocol/src/index.js')).href)
const M = await import(pathToFileURL(path.join(REPO, 'test/helpers/world.js')).href)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'folgali-e2e-perfil-'))
if (photos) fs.mkdirSync(photos, { recursive: true })

const freePort = async () => { const s = http.createServer(); s.listen(0, '127.0.0.1'); await once(s, 'listening'); const p = s.address().port; await new Promise((ok) => s.close(ok)); return p }
const [pApi, pSite, pRelay] = [await freePort(), await freePort(), await freePort()]
const API = `http://127.0.0.1:${pApi}`
const SITE = `http://127.0.0.1:${pSite}`
const RELAY = `http://127.0.0.1:${pRelay}`
const people = M.newIssuer()
const handles = M.newIssuer()
const uidSecret = crypto.randomBytes(32)
const PERSON = 'p_e2e_perfil_ana_0001'
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))
let n = 0
const check = async (label, fn) => { await fn(); n++; console.log(`  ✓ ${label}`) }
const inherited = Object.fromEntries(['PATH', 'TMPDIR', 'LANG', 'HOME'].filter((k) => process.env[k]).map((k) => [k, process.env[k]]))

// ── the Rovemark stand-in: only the five calls the site makes for a person ──
const personUid = P.derivePersonUid(uidSecret, PERSON)
let personHandle = null
const api = http.createServer(async (req, res) => {
  const url = new URL(req.url, API)
  const body = await new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d }); req.on('end', () => ok(b ? JSON.parse(b) : {})) })
  const send = (status, j) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(j)) }
  if (url.pathname === '/api/auth/oauth/rovemark/start') {
    const back = new URL(url.searchParams.get('volta'))
    back.searchParams.set('estado', url.searchParams.get('estado'))
    back.searchParams.set('codigo', crypto.randomBytes(24).toString('base64url'))
    res.writeHead(302, { location: back.toString() })
    return res.end()
  }
  const tokens = () => ({ access_token: `rmapp_at_${crypto.randomBytes(32).toString('base64url')}`, refresh_token: `rmapp_rt_${crypto.randomBytes(32).toString('base64url')}`, expires_in: 900, pessoa: { id: PERSON, nome: 'Ana Souza da Conta' } })
  if (url.pathname === '/api/auth/app/exchange' || url.pathname === '/api/auth/app/refresh') return send(200, tokens())
  if (url.pathname === '/api/auth/app/folgali/person') return send(200, { ok: true, uid: personUid, handle: personHandle, adult: true })
  if (url.pathname === '/api/auth/app/folgali/person-attestation') {
    if (body.handle) personHandle = body.handle
    const t = Math.floor(Date.now() / 1000) - 5
    const attestation = P.createPersonAttestation({ issuerPrivateKey: people.chavePrivada, emissor: people.publicKey, uid: personUid, handle: personHandle, chave: body.key, emitidoEm: t, expiraEm: t + 7 * 86400 })
    return send(200, { ok: true, attestation })
  }
  send(404, { error: 'not_found' })
})
api.listen(pApi, '127.0.0.1')
await once(api, 'listening')

const children = []
const logs = {}
function start(name, argv, { cwd, env, ready }) {
  return new Promise((ok, fail) => {
    const c = spawn(process.execPath, argv, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    children.push(c)
    logs[name] = ''
    const t = setTimeout(() => fail(new Error(`${name} did not start: ${logs[name].slice(-800)}`)), 60_000)
    const on = (d) => { logs[name] += d; if (ready.test(logs[name])) { clearTimeout(t); ok(c) } }
    c.stdout.on('data', on)
    c.stderr.on('data', on)
  })
}
async function relay(method, p, body) {
  const r = await fetch(`${RELAY}${p}`, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  return { status: r.status, json: await r.json().catch(() => null) }
}
/** A rover of the local handle issuer, publishing through the relay HTTP API like the Rover Hangar app does. */
function newRover(handle) {
  const rover = M.newRover(handles, { agora: Math.floor(Date.now() / 1000), handle })
  rover.cabeca = null
  rover.publish = async (type, body, { first = false } = {}) => {
    const obj = M.objectOf(rover, type, body, { criadoEm: Math.floor(Date.now() / 1000), previo: rover.cabeca })
    const env = { objeto: obj, ...(first ? { atestado: rover.atestado } : {}), ...(P.REQUIRES_APPROVAL[type] ? { aprovacao: M.approve(rover, obj, { aprovadoEm: Math.floor(Date.now() / 1000) }) } : {}) }
    const r = await relay('POST', '/v1/objetos', env)
    if (r.status < 300) rover.cabeca = obj.id
    return r
  }
  return rover
}

let pilot
try {
  await start('relay', ['--disable-warning=ExperimentalWarning', path.join(REPO, 'packages/relay/bin/relay.js')], {
    cwd: REPO, ready: /"ouvindo"/,
    env: { ...inherited, RELAY_ISSUERS: `${people.publicKey},${handles.publicKey}`, RELAY_PEOPLE_ISSUERS: people.publicKey, RELAY_DB: path.join(tmp, 'rele.sqlite'), RELAY_PORT: String(pRelay), RELAY_REPORT_SECRET: crypto.randomBytes(32).toString('hex'), RELAY_GALLERY_BASE: SITE },
  })
  await start('site', ['server.js'], {
    cwd: standalone, ready: /Ready|started|127\.0\.0\.1/i,
    env: { ...inherited, NODE_ENV: 'production', PORT: String(pSite), HOSTNAME: '127.0.0.1', FOLGALI_SESSION_SECRET: crypto.randomBytes(32).toString('base64url'), FOLGALI_ROVEMARK_API: API, FOLGALI_ROVEMARK_RETURN: `${SITE}/api/auth/rovemark/callback`, FOLGALI_DATA_DIR: path.join(tmp, 'folgali'), FOLGALI_CLIENT: 'http', FOLGALI_RELAY_URL: RELAY, FOLGALI_BASE_URL: SITE },
  })
  console.log(`▶ relay ${RELAY}, Rovemark stand-in ${API}, site ${SITE}`)

  // a rover from the Rover Hangar, already on folgali
  const pipa = newRover('pipa.e2e')
  await check('a rover joins with a profile without portrait or cover (still valid)', async () => assert.equal((await pipa.publish('perfil', { nome: 'Pipa', descricao: 'Rover de teste.' }, { first: true })).status, 201))
  const gallery = await relay('GET', '/v1/galeria')
  await check('GET /v1/galeria lists the house portraits and covers with absolute URLs', () => {
    assert.equal(gallery.status, 200)
    assert.ok(gallery.json.retratos.length >= 20 && gallery.json.capas.length >= 6)
    assert.ok(gallery.json.capas.every((c) => c.url.startsWith(`${SITE}/marca/folgali/`)))
  })

  // ── the browser: sign in, Terms, first profile ──
  const require = createRequire(import.meta.url)
  const { LogicaPilot } = require(pilotPath())
  pilot = await new LogicaPilot({ headless: true, width: 1440, height: 900 }).launch()
  const ev = (js) => pilot.page.eval(js)
  const waitFor = async (js, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(js).catch(() => false)) return true; await sleep(250) } throw new Error(`timed out: ${js}\n--- page ---\n${String(await ev(`location.href+'\\n'+(document.querySelector('main')||document.body).innerText.slice(0,1200)`).catch((x) => x.message))}`) }
  const type = (sel, text) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});const set=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value').set;set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)
  const click = (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.click();return true})()`)
  const shot = async (name, { width = 1440, height = 900, tema: theme = 'claro', sel } = {}) => {
    if (!photos) return
    await pilot.page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: width < 700 ? 2 : 1, mobile: false })
    await pilot.page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme === 'escuro' ? 'dark' : 'light' }] })
    await ev(`localStorage.setItem('rn-tema','${theme}');document.documentElement.dataset.tema='${theme}'`)
    if (sel) await ev(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({block:'start'})`)
    else await ev('window.scrollTo(0,0)')
    await sleep(700)
    const { data } = await pilot.page.send('Page.captureScreenshot', { format: 'jpeg', quality: 80, fromSurface: true })
    fs.writeFileSync(path.join(photos, `${name}-${width}-${theme}.jpg`), Buffer.from(data, 'base64'))
  }
  const shots4 = async (name, sel) => { for (const width of [1440, 390]) for (const theme of ['claro', 'escuro']) await shot(name, { width, tema: theme, sel }) ; await pilot.page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }) }

  await pilot.goto(`${SITE}/api/auth/rovemark/inicio?lang=pt&destino=/pt/entrar`)
  await waitFor(`location.pathname==='/pt/entrar'`)
  await waitFor(`!!document.querySelector('input[name=aceito]')`)
  await click('input[name=aceito]')
  await sleep(300)
  await click('form.consent button[type=submit]')
  await waitFor(`!document.querySelector('input[name=aceito]')`)
  await check('Ana signs in with the Rovemark stand-in and accepts the Terms', () => true)

  // a visitor-free view of a rover first: signed in, without a folgali profile yet, the header says to create one
  await pilot.goto(`${SITE}/pt/r/pipa.e2e`)
  await waitFor(`!!document.querySelector('.pf-join')`)
  await pilot.goto(`${SITE}/pt/linha`)
  await waitFor(`!!document.querySelector('.pw-box input')`)
  const inputs = await ev(`[...document.querySelectorAll('.pw-box input')].map((i)=>'#'+CSS.escape(i.id))`)
  await type(inputs[0], 'ana.folga')
  await type(inputs[1], 'ana.folga')
  await click('.pw-box button[type=submit]')
  await waitFor(`!!document.querySelector('.pw-box textarea')`)
  await check('the first profile is published from the device (name equal to the @, like the Hangar did for the owner)', async () => {
    const r = await relay('GET', '/v1/handles/ana.folga')
    assert.equal(r.json.nome, 'ana.folga')
  })
  await pilot.goto(`${SITE}/pt/r/ana.folga`)
  await waitFor(`!!document.querySelector('.pf-title')`)
  await check('own profile: the @ is not repeated under a name equal to it, a neutral house cover, "Edit profile"', async () => {
    assert.equal(await ev(`!!document.querySelector('.pf-identity .post-handle')`), false)
    assert.match(await ev(`document.querySelector('.pf-cover img').getAttribute('src')`), /\/marca\/folgali\/(covers|scenes\/empty-hammock)/)
    await waitFor(`[...document.querySelectorAll('.pf-actions a')].some((a)=>a.getAttribute('href')==='/pt/configuracoes/perfil')`)
  })
  await shots4('perfil-pessoa-antes-de-editar')

  // ── Settings > Profile: portrait, cover, name, about ──
  await pilot.goto(`${SITE}/pt/configuracoes/perfil`)
  await waitFor(`!!document.querySelector('.pe-form input')`)
  await shots4('configuracoes-perfil')
  const ids = await ev(`(()=>{const f=document.querySelector('.pe-form');return {nome:'#'+CSS.escape(f.querySelectorAll('input[type=text]')[0].id),desc:'#'+CSS.escape(f.querySelectorAll('input[type=text]')[1].id),sobre:'#'+CSS.escape(f.querySelector('textarea').id),inter:'#'+CSS.escape(f.querySelectorAll('input[type=text]')[2].id)}})()`)
  await type(ids.nome, 'Ana Souza de Folga')
  await type(ids.desc, 'Domingo comprido e limonada.')
  await type(ids.sobre, 'Gosto de trilha no fim da tarde e de jogo de tabuleiro com os amigos.')
  await type(ids.inter, 'Trilha, jogos de tabuleiro, café')
  await click('.pe-portraits input[value="portrait-mint-sprout"]')
  await click('.pe-covers input[value="cover-forest"]')
  await click('.pe-notes input[value="amigos"]')
  await sleep(300)
  await shot('configuracoes-perfil-escolhido', { sel: '.pe-covers' })
  await click('.pe-form button[type=submit]')
  await waitFor(`!!document.querySelector('.pe-form .callout-ok')`)
  await check('the new profile is on the relay: name, about, interests, notes from friends, gallery portrait and cover', async () => {
    const r = await relay('GET', '/v1/handles/ana.folga')
    assert.equal(r.json.nome, 'Ana Souza de Folga')
    assert.equal(r.json.sobre, 'Gosto de trilha no fim da tarde e de jogo de tabuleiro com os amigos.')
    assert.deepEqual(r.json.interesses, ['trilha', 'jogos-de-tabuleiro', 'cafe'])
    assert.equal(r.json.recados, 'amigos')
    assert.deepEqual(r.json.retrato, { galeria: 'portrait-mint-sprout' })
    assert.deepEqual(r.json.capa, { galeria: 'cover-forest' })
    assert.equal(r.json.grafo, 'publico', 'what the form does not show stays')
  })
  await pilot.goto(`${SITE}/pt/r/ana.folga`)
  await waitFor(`!!document.querySelector('.pf-title')`)
  await check('after reload the profile shows it all: name, @, about, portrait and cover from the gallery', async () => {
    assert.equal(await ev(`document.querySelector('.pf-title').textContent`), 'Ana Souza de Folga')
    assert.equal(await ev(`document.querySelector('.pf-identity .post-handle').textContent`), '@ana.folga')
    assert.match(await ev(`document.querySelector('.pf-cover img').getAttribute('src')`), /covers\/forest\.webp$/)
    assert.match(await ev(`document.querySelector('.pf-avatar img').getAttribute('src')`), /avatares\/grilo-do-caio\.webp$/)
    assert.ok((await ev(`document.querySelector('.pf-about')?.innerText ?? ''`)).includes('trilha no fim da tarde'))
  })
  await shots4('perfil-pessoa-editado')

  // ── a rover changes its portrait and cover through the API, by gallery id ──
  await check('a rover changes portrait and cover by gallery id; an id outside the gallery is 422 esquema', async () => {
    const ok = await pipa.publish('perfil', { nome: 'Pipa', descricao: 'Rover de teste.', retrato: { galeria: 'portrait-sun-cap' }, capa: { galeria: 'cover-snow' } })
    assert.equal(ok.status, 201, JSON.stringify(ok.json))
    const bad = await pipa.publish('perfil', { nome: 'Pipa', descricao: 'Rover de teste.', capa: { galeria: 'cover-train-station' } })
    assert.equal(bad.status, 422)
    assert.equal(bad.json.erro.codigo, 'esquema')
  })

  // ── the person acts on the rover profile: follow, friendship, a note ──
  await pilot.goto(`${SITE}/pt/r/pipa.e2e`)
  await waitFor(`[...document.querySelectorAll('.pf-relationship-row button')].length>=2`)
  await check('the rover profile shows the portrait and cover it chose', async () => {
    assert.match(await ev(`document.querySelector('.pf-cover img').getAttribute('src')`), /covers\/snow\.webp$/)
    assert.match(await ev(`document.querySelector('.pf-avatar img').getAttribute('src')`), /avatares\/max\.webp$/)
  })
  await shots4('perfil-rover-visto-pela-pessoa')
  await ev(`[...document.querySelectorAll('.pf-relationship-row button')][0].click()`)
  await waitFor(`document.querySelector('.pf-relationship-row button[aria-pressed=true]')!==null`)
  await ev(`[...document.querySelectorAll('.pf-relationship-row button')][1].click()`)
  await waitFor(`!!document.querySelector('.pf-relationship-row .pill')`)
  await waitFor(`!!document.querySelector('form#recado textarea')`)
  await type('form#recado textarea', 'Oi, Pipa! Passei para deixar um abraço.')
  await click('form#recado button[type=submit]')
  await waitFor(`!!document.querySelector('form#recado .callout-ok')`)
  await check('follow, friendship request and the note reached the relay, signed by the device', async () => {
    const followers = await relay('GET', `/v1/rovers/${pipa.uid}/seguidores`)
    assert.ok(followers.json.itens.some((e) => e.objeto.autor === personUid))
    const notes = await relay('GET', `/v1/rovers/${pipa.uid}/recados`)
    assert.ok(notes.json.itens.some((e) => e.envelope?.objeto?.corpo?.texto === 'Oi, Pipa! Passei para deixar um abraço.' || e.objeto?.corpo?.texto === 'Oi, Pipa! Passei para deixar um abraço.'), JSON.stringify(notes.json).slice(0, 400))
  })
  await pilot.goto(`${SITE}/pt/r/pipa.e2e`)
  await waitFor(`!!document.querySelector('.pf-relationship-row button[aria-pressed=true]')`)
  await check('after reload the buttons read the relation from the relay: Following and Request sent', async () => {
    assert.ok((await ev(`document.querySelector('.pf-relationship-row').innerText`)).includes('Pedido enviado'))
  })
  await shots4('perfil-rover-depois-de-agir')
  console.log(`\n${n} checks passed${photos ? `, photos in ${photos}` : ''}`)
} catch (e) {
  console.error(e)
  for (const [k, v] of Object.entries(logs)) console.error(`--- ${k} ---\n${v.slice(-1500)}`)
  process.exitCode = 1
} finally {
  try { await pilot?.close() } catch { /* closed */ }
  for (const c of children) c.kill()
  api.close()
}
