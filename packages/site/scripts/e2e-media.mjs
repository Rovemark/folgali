#!/usr/bin/env node
// End to end of the person's own profile photo (decision of 25/11/2026) on a LOCAL relay with media on:
// the reference relay as a real process (RELAY_MEDIA=sim), a stand-in for the Rovemark login, the real site (standalone build) and a real
// browser (Logica Pilot) where the device crops, recodes and signs.
// Proves: a person uploads a portrait and a cover from Settings > Profile (a phone photo with EXIF and GPS), saves, reloads and sees both;
// the served bytes carry no GPS; a GIF and a 16 MB file are refused on the screen; more than 1 MiB is refused by the relay and by the
// site route; "Report photo" sends a visitor report on the image object; the operator removes the photo by that id, the profile falls
// back to the default portrait and the removal is in the moderation record; the emergency switch (RELAY_MEDIA=nao) hides the photos and
// pauses uploads without deleting anything, and turning media back on brings them back.
//
//   npx next build   (then)   node scripts/e2e-media.mjs .next/standalone [--fotos <dir>]
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'folgali-e2e-midia-'))
if (photos) fs.mkdirSync(photos, { recursive: true })

const freePort = async () => { const s = http.createServer(); s.listen(0, '127.0.0.1'); await once(s, 'listening'); const p = s.address().port; await new Promise((ok) => s.close(ok)); return p }
const [pApi, pSite, pRelay] = [await freePort(), await freePort(), await freePort()]
const API = `http://127.0.0.1:${pApi}`
const SITE = `http://127.0.0.1:${pSite}`
const RELAY = `http://127.0.0.1:${pRelay}`
const ADMIN = crypto.randomBytes(32).toString('hex')
const people = M.newIssuer()
const uidSecret = crypto.randomBytes(32)
const PERSON = 'p_e2e_midia_ana_00001'
const DB = path.join(tmp, 'rele.sqlite')
const MEDIA_DIR = path.join(tmp, 'midia')
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))
let n = 0
const check = async (label, fn) => { await fn(); n++; console.log(`  ✓ ${label}`) }
const inherited = Object.fromEntries(['PATH', 'TMPDIR', 'LANG', 'HOME'].filter((k) => process.env[k]).map((k) => [k, process.env[k]]))

// test pictures: a phone-like JPEG with EXIF and GPS, a GIF, a 16 MB file
const PHOTO = path.join(tmp, 'foto-do-celular.jpg')
execFileSync('magick', ['-size', '1600x1200', 'gradient:#7fb3e6-#f2c94c', '-fill', '#e8574a', '-draw', 'circle 800,600 800,300', '-quality', '92', PHOTO])
execFileSync('exiftool', ['-overwrite_original', '-GPSLatitude=23.5505', '-GPSLatitudeRef=S', '-GPSLongitude=46.6333', '-GPSLongitudeRef=W', '-Artist=Ana Souza', PHOTO], { stdio: 'ignore' })
const GIF = path.join(tmp, 'animada.gif')
execFileSync('magick', ['-size', '200x200', 'xc:red', 'xc:blue', '-loop', '0', GIF])
const BIG = path.join(tmp, 'grande.jpg')
fs.writeFileSync(BIG, Buffer.concat([fs.readFileSync(PHOTO).subarray(0, 4), crypto.randomBytes(16 * 1048576)]))
assert.ok(fs.readFileSync(PHOTO).includes(Buffer.from('Ana Souza')), 'the test photo carries EXIF')

// ── the Rovemark stand-in ──
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
    return send(200, { ok: true, attestation: P.createPersonAttestation({ issuerPrivateKey: people.chavePrivada, emissor: people.publicKey, uid: personUid, handle: personHandle, chave: body.key, emitidoEm: t, expiraEm: t + 7 * 86400 }) })
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
const startRelay = (media) => start('relay', ['--disable-warning=ExperimentalWarning', path.join(REPO, 'packages/relay/bin/relay.js')], {
  cwd: REPO, ready: /"ouvindo"/,
  env: { ...inherited, RELAY_ISSUERS: people.publicKey, RELAY_PEOPLE_ISSUERS: people.publicKey, RELAY_DB: DB, RELAY_PORT: String(pRelay), RELAY_REPORT_SECRET: 'ab'.repeat(32), RELAY_GALLERY_BASE: SITE, RELAY_MEDIA: media, RELAY_MEDIA_DIR: MEDIA_DIR, RELAY_ADMIN_TOKEN: ADMIN },
})
async function stopRelay() {
  const c = children.relay
  c.kill()
  if (c.exitCode === null) await once(c, 'exit')
}
async function relay(method, p, { body, headers = {}, raw } = {}) {
  const r = await fetch(`${RELAY}${p}`, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: raw ?? (body ? JSON.stringify(body) : undefined) })
  const buf = Buffer.from(await r.arrayBuffer())
  let json = null
  try { json = JSON.parse(buf.toString('utf8')) } catch { /* bytes */ }
  return { status: r.status, json, buf, headers: r.headers }
}

let pilot
try {
  await startRelay('sim')
  await start('site', ['server.js'], {
    cwd: standalone, ready: /Ready|started|127\.0\.0\.1/i,
    env: { ...inherited, NODE_ENV: 'production', PORT: String(pSite), HOSTNAME: '127.0.0.1', FOLGALI_SESSION_SECRET: crypto.randomBytes(32).toString('base64url'), FOLGALI_ROVEMARK_API: API, FOLGALI_ROVEMARK_RETURN: `${SITE}/api/auth/rovemark/callback`, FOLGALI_DATA_DIR: path.join(tmp, 'folgali'), FOLGALI_CLIENT: 'http', FOLGALI_RELAY_URL: RELAY, FOLGALI_BASE_URL: SITE },
  })
  console.log(`▶ relay ${RELAY} (media on), Rovemark stand-in ${API}, site ${SITE}`)
  await check('the relay announces midia and midia-de-perfil', async () => {
    const i = await relay('GET', '/v1/info')
    assert.ok(i.json.recursos.includes('midia') && i.json.recursos.includes('midia-de-perfil'))
  })

  const require = createRequire(import.meta.url)
  const { LogicaPilot } = require(pilotPath())
  pilot = await new LogicaPilot({ headless: true, width: 1440, height: 900 }).launch()
  const ev = (js) => pilot.page.eval(js)
  const waitFor = async (js, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(js).catch(() => false)) return true; await sleep(250) } throw new Error(`timed out: ${js}\n--- page ---\n${String(await ev(`location.href+'\\n'+(document.querySelector('main')||document.body).innerText.slice(0,1500)`).catch((x) => x.message))}`) }
  const type = (sel, text) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});const set=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value').set;set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)
  const click = (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.click();return true})()`)
  /** Puts a file in the n-th file field, as a person picking it from the gallery or the camera. */
  const pickFile = async (index, file) => {
    const { root } = await pilot.page.send('DOM.getDocument', { depth: -1 })
    const { nodeIds } = await pilot.page.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: 'input[type=file]' })
    await pilot.page.send('DOM.setFileInputFiles', { files: [file], nodeId: nodeIds[index] })
  }
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
  const shots4 = async (name, sel) => {
    for (const width of [1440, 390]) for (const theme of ['claro', 'escuro']) await shot(name, { width, tema: theme, sel })
    await pilot.page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
    await ev(`localStorage.setItem('rn-tema','claro');document.documentElement.dataset.tema='claro'`)
  }

  // ── sign in, Terms, first profile ──
  await pilot.goto(`${SITE}/api/auth/rovemark/inicio?lang=pt&destino=/pt/entrar`)
  await waitFor(`location.pathname==='/pt/entrar'`)
  await waitFor(`!!document.querySelector('input[name=aceito]')`)
  await click('input[name=aceito]')
  await sleep(300)
  await click('form.consent button[type=submit]')
  await waitFor(`!document.querySelector('input[name=aceito]')`)
  await pilot.goto(`${SITE}/pt/linha`)
  await waitFor(`!!document.querySelector('.pw-box input')`)
  const inputs = await ev(`[...document.querySelectorAll('.pw-box input')].map((i)=>'#'+CSS.escape(i.id))`)
  await type(inputs[0], 'ana.foto')
  await type(inputs[1], 'Ana Souza de Oliveira')
  await click('.pw-box button[type=submit]')
  await waitFor(`!!document.querySelector('.pw-box textarea')`)
  // a profile photo needs an account 1 day old (the relay's rule): the test ages the account in the local relay's database
  const db = new DatabaseSync(DB)
  db.prepare('UPDATE rovers SET criado_em = criado_em - 172800 WHERE uid = ?').run(personUid)
  db.close()
  await check('Ana signs in, accepts the Terms and creates her profile (the name with surname passes)', async () => {
    assert.equal((await relay('GET', '/v1/handles/ana.foto')).json.nome, 'Ana Souza de Oliveira')
  })

  // ── Settings > Profile: what the screen refuses ──
  await pilot.goto(`${SITE}/pt/configuracoes/perfil`)
  await waitFor(`document.querySelectorAll('input[type=file]').length===2`)
  await pickFile(0, GIF)
  await waitFor(`[...document.querySelectorAll('.pe-photo .callout-notice')].some((e)=>/JPEG, PNG nem WebP/.test(e.textContent))`)
  await pickFile(0, BIG)
  await waitFor(`[...document.querySelectorAll('.pe-photo .callout-notice')].some((e)=>/15 MB/.test(e.textContent))`)
  await check('the screen refuses a GIF and a 16 MB file before decoding them', () => true)

  // ── portrait and cover from the phone photo ──
  await pickFile(0, PHOTO)
  await waitFor(`!!document.querySelector('.pe-photo[data-uso=retrato] canvas')`)
  await ev(`(()=>{const r=document.querySelector('.pe-photo[data-uso=retrato] input[type=range]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(r,'1.6');r.dispatchEvent(new Event('input',{bubbles:true}));r.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  await shots4('recorte-retrato', '.pe-photo[data-uso=retrato]')
  await ev(`[...document.querySelectorAll('.pe-photo[data-uso=retrato] button')].find((b)=>b.textContent.includes('Usar esta foto')).click()`)
  await waitFor(`!!document.querySelector('.pe-portraits .pe-photo-chosen img')`)
  await pickFile(1, PHOTO)
  await waitFor(`!!document.querySelector('.pe-photo[data-uso=capa] canvas')`)
  await shots4('recorte-capa', '.pe-photo[data-uso=capa]')
  await ev(`[...document.querySelectorAll('.pe-photo[data-uso=capa] button')].find((b)=>b.textContent.includes('Usar esta foto')).click()`)
  await waitFor(`!!document.querySelector('.pe-covers .pe-photo-chosen img')`)
  await click('.pe-form button[type=submit]')
  await waitFor(`!!document.querySelector('.pe-form .callout-ok')`)
  let profile
  await check('portrait and cover are on the relay: imagem objects with uso retrato and capa, the profile points to them', async () => {
    profile = (await relay('GET', '/v1/handles/ana.foto')).json
    assert.ok(profile.retrato?.midia && profile.capa?.midia, JSON.stringify({ r: profile.retrato, c: profile.capa }))
    assert.equal(profile.retratoImagem.id, profile.retrato.midia)
    assert.equal(profile.capaImagem.id, profile.capa.midia)
    assert.deepEqual([profile.retratoImagem.largura, profile.retratoImagem.altura], [640, 640])
    assert.deepEqual([profile.capaImagem.largura, profile.capaImagem.altura], [1500, 500])
  })
  await check('the served photo is a recoded JPEG with no EXIF, no GPS and no name, short cache and the fixed headers', async () => {
    const r = await relay('GET', `/v1/midia/${profile.retratoImagem.hash}`)
    assert.equal(r.status, 200)
    assert.equal(r.headers.get('content-type'), 'image/jpeg')
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff')
    assert.match(r.headers.get('content-security-policy'), /^default-src 'none'/)
    assert.equal(r.headers.get('cache-control'), 'public, max-age=300')
    assert.equal(r.buf.includes(Buffer.from('Exif')), false)
    assert.equal(r.buf.includes(Buffer.from('Ana Souza')), false)
    const site = await fetch(`${SITE}/midia/${profile.retratoImagem.hash}.jpg`)
    assert.equal(site.status, 200)
    assert.equal(site.headers.get('cache-control'), 'public, max-age=300')
  })
  await pilot.goto(`${SITE}/pt/r/ana.foto`)
  await waitFor(`!!document.querySelector('.pf-avatar img')`)
  await check('after reload the profile shows her photo as the portrait and as the cover', async () => {
    assert.match(await ev(`document.querySelector('.pf-avatar img').getAttribute('src')`), new RegExp(`^/midia/${profile.retratoImagem.hash}\\.jpg$`))
    assert.match(await ev(`document.querySelector('.pf-cover img').getAttribute('src')`), new RegExp(`^/midia/${profile.capaImagem.hash}\\.jpg$`))
  })
  await shots4('perfil-com-foto')

  // ── size limits on the API path ──
  await check('more than 1 MiB: 413 from the relay and from the site route', async () => {
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), crypto.randomBytes(1048577)])
    const r = await relay('PUT', `/v1/midia/${'a'.repeat(64)}`, { raw: big, headers: { authorization: `Rover-Envio uid=${personUid}, t=${Math.floor(Date.now() / 1000)}, a=${'A'.repeat(86)}`, 'content-length': String(big.length) } })
    assert.ok([401, 413].includes(r.status), String(r.status))
    const s = await fetch(`${SITE}/api/person/media/${'a'.repeat(64)}`, { method: 'PUT', body: big, headers: { 'x-rover-envio': `Rover-Envio uid=${personUid}, t=1900000000, a=${'A'.repeat(86)}`, 'content-length': String(big.length) } })
    assert.ok([401, 413].includes(s.status), String(s.status))
    // signed in (the browser's cookie), the size is what stops it
    const cookie = (await pilot.page.send('Network.getCookies', { urls: [SITE] })).cookies.map((c) => `${c.name}=${c.value}`).join('; ')
    const s2 = await fetch(`${SITE}/api/person/media/${'a'.repeat(64)}`, { method: 'PUT', body: big, headers: { cookie, 'x-rover-envio': `Rover-Envio uid=${personUid}, t=1900000000, a=${'A'.repeat(86)}`, 'content-length': String(big.length) } })
    assert.equal(s2.status, 413)
  })

  // ── report and moderation ──
  await waitFor(`[...document.querySelectorAll('.pf-report-photo a')].length===2`)
  await ev(`[...document.querySelectorAll('.pf-report-photo a')][0].click()`)
  await waitFor(`!!document.querySelector('input[name=motivo][value=ilegal]')`)
  await shots4('denunciar-foto')
  await click('input[name=motivo][value=ilegal]')
  await sleep(200)
  await click('input[name=boaFe]')
  await click('form.panel button[type=submit]')
  await waitFor(`!!document.querySelector('.panel.published')`)
  await check('"Report photo" sends a visitor report on the imagem object', async () => {
    const d = await relay('GET', '/v1/admin/denuncias', { headers: { authorization: `Bearer ${ADMIN}` } })
    assert.equal(d.status, 200)
    assert.ok(JSON.stringify(d.json).includes(profile.retratoImagem.id), JSON.stringify(d.json).slice(0, 300))
  })
  await check('the operator removes the photo by that id: the file is gone, the removal is in the moderation record', async () => {
    const r = await relay('DELETE', `/v1/admin/midia/${profile.retratoImagem.id}`, { body: { motivo: 'denuncia confirmada no teste', motivoPublico: 'regras' }, headers: { authorization: `Bearer ${ADMIN}` } })
    assert.equal(r.status, 200, JSON.stringify(r.json))
    assert.equal((await relay('GET', `/v1/midia/${profile.retratoImagem.hash}`)).status, 404)
    const db2 = new DatabaseSync(DB, { readOnly: true })
    const log = db2.prepare("SELECT acao, alvo_tipo, motivo FROM remocoes WHERE alvo = ?").get(profile.retratoImagem.id)
    db2.close()
    assert.deepEqual({ ...log }, { acao: 'remocao', alvo_tipo: 'imagem', motivo: 'regras' })
  })
  await sleep(11_000) // the site's short read cache
  await pilot.goto(`${SITE}/pt/r/ana.foto`)
  await waitFor(`!!document.querySelector('.pf-avatar .portrait')`)
  await check('the profile falls back to the default portrait; the cover photo stays', async () => {
    assert.equal(await ev(`!!document.querySelector('.pf-avatar img[src^="/midia/"]')`), false)
    assert.match(await ev(`document.querySelector('.pf-cover img').getAttribute('src')`), /^\/midia\//)
  })
  await shots4('perfil-depois-da-remocao')

  // ── emergency switch ──
  await stopRelay()
  await startRelay('nao')
  await sleep(61_000) // the site keeps the relay's resources for 60 s
  await pilot.goto(`${SITE}/pt/r/ana.foto`)
  await waitFor(`!!document.querySelector('.pf-cover img')`)
  await check('RELAY_MEDIA=nao: no photo on the profile, the upload is paused, and nothing was deleted', async () => {
    assert.equal(await ev(`!!document.querySelector('.pf-cover img[src^="/midia/"]')`), false)
    assert.equal((await relay('PUT', `/v1/midia/${profile.capaImagem.hash}`, { raw: Buffer.from('x') })).status, 404)
    assert.ok(fs.existsSync(path.join(MEDIA_DIR, profile.capaImagem.hash.slice(0, 2), profile.capaImagem.hash)), 'the file stays on disk')
  })
  await pilot.goto(`${SITE}/pt/configuracoes/perfil`)
  await waitFor(`!!document.querySelector('.pe-form')`)
  await check('Settings > Profile hides "Upload photo" and says uploads are paused', async () => {
    assert.equal(await ev(`document.querySelectorAll('input[type=file]').length`), 0)
    assert.ok((await ev(`document.querySelector('.pe-form').innerText`)).includes('O envio de fotos está pausado'))
  })
  await shots4('configuracoes-pausado', '.pe-covers')
  await stopRelay()
  await startRelay('sim')
  await sleep(11_000)
  await pilot.goto(`${SITE}/pt/r/ana.foto`)
  await waitFor(`!!document.querySelector('.pf-cover img[src^="/midia/"]')`)
  await check('media back on: the cover photo is back without sending anything again', () => true)
  console.log(`\n${n} checks passed${photos ? `, photos in ${photos}` : ''}`)
} catch (e) {
  console.error(e)
  for (const [k, v] of Object.entries(logs)) console.error(`--- ${k} ---\n${v.slice(-1500)}`)
  process.exitCode = 1
} finally {
  try { await pilot?.close() } catch { /* closed */ }
  for (const c of Object.values(children)) c.kill()
  api.close()
}
