#!/usr/bin/env node
// End to end of VIDEO (protocol 0.11.0 part 3, `video`) on a LOCAL relay with RELAY_VIDEO=sim, adapted from e2e-attachments.mjs: the
// reference relay as a real process (RELAY_MEDIA=sim, the person issuer listed as verified), a stand-in for the Rovemark login, the real
// site (standalone build) and a real browser (Logica Pilot) where the device reduces, cleans and signs.
// Proves: a signed-in person, verified from day one, attaches images in the composer (a GIF is refused on the screen), publishes a post
// with 2 images and posts with 1, 3 and 4; the relay holds the `imagem` objects in order, without approval, and the served bytes carry
// no EXIF; the feed and the post page show the gallery, an image with no description has a name, and the image opens larger (Escape
// closes); a VISITOR reports one image; the operator removes it by that id; the post stays and says "removed by moderation"; sending the
// removed file again is refused before anything is published; an image refused after the post is out leaves the post standing and the
// screen says which one did not go; and the post limit of the relay says on the screen how long is left.
//
//   npx next build   (then)   node scripts/e2e-video.mjs .next/standalone [--fotos <dir>]
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'folgali-e2e-anexos-'))
if (photos) fs.mkdirSync(photos, { recursive: true })

const freePort = async () => { const s = http.createServer(); s.listen(0, '127.0.0.1'); await once(s, 'listening'); const p = s.address().port; await new Promise((ok) => s.close(ok)); return p }
const [pApi, pSite, pRelay] = [await freePort(), await freePort(), await freePort()]
const API = `http://127.0.0.1:${pApi}`
const SITE = `http://127.0.0.1:${pSite}`
const RELAY = `http://127.0.0.1:${pRelay}`
const ADMIN = crypto.randomBytes(32).toString('hex')
const people = M.newIssuer()
const uidSecret = crypto.randomBytes(32)
const PERSON = 'p_e2e_anexos_ana_0001'
const HANDLE = 'ana.anexos'
const DB = path.join(tmp, 'rele.sqlite')
const MEDIA_DIR = path.join(tmp, 'midia')
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))
let n = 0
const check = async (label, fn) => { await fn(); n++; console.log(`  ✓ ${label}`) }
const inherited = Object.fromEntries(['PATH', 'TMPDIR', 'LANG', 'HOME'].filter((k) => process.env[k]).map((k) => [k, process.env[k]]))

// test pictures: the house's own plush photos in three formats and several shapes, one of them as a phone writes it (EXIF and GPS),
// plus a GIF. Each file is a different picture (the relay refuses the same file twice on one post).
const ART = path.join(SITE_DIR, 'public/marca/folgali/fotos')
const art = fs.readdirSync(ART).filter((f) => f.endsWith('.webp')).sort()
assert.ok(art.length >= 16, 'the house photos are in public/marca/folgali/fotos')
const SHAPES = [['1600x1200', 'jpg'], ['1200x1600', 'jpg'], ['2400x1350', 'png'], ['1000x1000', 'webp'], ['3000x2000', 'jpg'], ['900x1400', 'jpg']]
const picture = (i) => {
  const [size, ext] = SHAPES[i % SHAPES.length]
  const out = path.join(tmp, `foto-${String(i + 1).padStart(2, '0')}.${ext}`)
  if (!fs.existsSync(out)) execFileSync('magick', [path.join(ART, art[i]), '-resize', `${size}^`, '-gravity', 'center', '-extent', size, ...(ext === 'jpg' ? ['-quality', '90'] : []), out])
  return out
}
const PHONE = picture(0)
execFileSync('exiftool', ['-overwrite_original', '-GPSLatitude=23.5505', '-GPSLatitudeRef=S', '-GPSLongitude=46.6333', '-GPSLongitudeRef=W', '-Artist=Ana Souza', PHONE], { stdio: 'ignore' })
assert.ok(fs.readFileSync(PHONE).includes(Buffer.from('Ana Souza')), 'the phone photo carries EXIF')
const GIF = path.join(tmp, 'animada.gif')
execFileSync('magick', ['-size', '200x200', 'xc:red', 'xc:blue', '-loop', '0', GIF])

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
async function relay(method, p, { body, headers = {} } = {}) {
  const r = await fetch(`${RELAY}${p}`, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined })
  const buf = Buffer.from(await r.arrayBuffer())
  let json = null
  try { json = JSON.parse(buf.toString('utf8')) } catch { /* bytes */ }
  return { status: r.status, json, buf, headers: r.headers }
}
const admin = { authorization: `Bearer ${ADMIN}` }
/** Ana's posts on the relay, newest first, as the public list serves them (each with `imagens` and `anexosRemovidos` when there are). */
const posts = async () => (await relay('GET', '/v1/postagens?ordem=novas&limite=50')).json.itens.filter((i) => i.envelope.objeto.autor === personUid)
const post = async (id) => (await relay('GET', `/v1/postagens/${id}`)).json
const uploads = () => {
  const db = new DatabaseSync(DB, { readOnly: true })
  try { return db.prepare('SELECT hash FROM midia_envios WHERE uid = ? ORDER BY rowid').all(personUid).map((r) => r.hash) } finally { db.close() }
}

let pilot
try {
  await start('relay', ['--disable-warning=ExperimentalWarning', path.join(REPO, 'packages/relay/bin/relay.js')], {
    cwd: REPO, ready: /"ouvindo"/,
    // the person issuer is a VERIFIED issuer, as on folgali: its accounts send media from day one, at the verified ceilings
    env: { ...inherited, RELAY_ISSUERS: people.publicKey, RELAY_PEOPLE_ISSUERS: people.publicKey, RELAY_VERIFIED_ISSUERS: people.publicKey, RELAY_DB: DB, RELAY_PORT: String(pRelay), RELAY_REPORT_SECRET: 'ab'.repeat(32), RELAY_GALLERY_BASE: SITE, RELAY_MEDIA: 'sim', RELAY_VIDEO: 'sim', RELAY_MEDIA_DIR: MEDIA_DIR, RELAY_ADMIN_TOKEN: ADMIN },
  })
  await start('site', ['server.js'], {
    cwd: standalone, ready: /Ready|started|127\.0\.0\.1/i,
    env: { ...inherited, NODE_ENV: 'production', PORT: String(pSite), HOSTNAME: '127.0.0.1', FOLGALI_SESSION_SECRET: crypto.randomBytes(32).toString('base64url'), FOLGALI_ROVEMARK_API: API, FOLGALI_ROVEMARK_RETURN: `${SITE}/api/auth/rovemark/callback`, FOLGALI_DATA_DIR: path.join(tmp, 'folgali'), FOLGALI_CLIENT: 'http', FOLGALI_RELAY_URL: RELAY, FOLGALI_BASE_URL: SITE },
  })
  console.log(`▶ relay ${RELAY} (media on, verified person issuer), Rovemark stand-in ${API}, site ${SITE}`)
  await check('the relay announces midia-livre, takes an image without approval, and lists the person issuer as verified', async () => {
    const i = (await relay('GET', '/v1/info')).json
    for (const r of ['midia', 'midia-livre', 'recusas-com-prazo']) assert.ok(i.recursos.includes(r), `${r} in ${i.recursos}`)
    assert.equal(i.midia.aprovacao, false)
    assert.deepEqual(i.midia.alvosDeAnexo, ['postagem', 'resposta', 'topico', 'resposta-forum'])
    assert.deepEqual(i.verificados?.emissores, [people.publicKey])
  })

  const require = createRequire(import.meta.url)
  const { LogicaPilot } = require(pilotPath())
  pilot = await new LogicaPilot({ headless: true, width: 1440, height: 900 }).launch()
  const ev = (js) => pilot.page.eval(js)
  const waitFor = async (js, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(js).catch(() => false)) return true; await sleep(200) } throw new Error(`timed out: ${js}\n--- page ---\n${String(await ev(`location.href+'\\n'+(document.querySelector('main')||document.body).innerText.slice(0,1500)`).catch((x) => x.message))}`) }
  const type = (sel, text) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});const set=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value').set;set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)
  const click = (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.click();return true})()`)
  const clickText = (scope, text) => ev(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(scope)})].find((b)=>b.textContent.trim()===${JSON.stringify(text)});if(!e)return false;e.click();return true})()`)
  /** Puts files in the composer's file field, as a person picking them from the gallery or the camera. */
  const pickFiles = async (...files) => {
    const { root } = await pilot.page.send('DOM.getDocument', { depth: -1 })
    const { nodeId } = await pilot.page.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.pw-box input[type=file]' })
    await pilot.page.send('DOM.setFileInputFiles', { files, nodeId })
  }
  const previews = (k) => waitFor(`document.querySelectorAll('.pw-preview').length===${k}&&!document.querySelector('.pw-box [aria-busy=true]')&&!(document.querySelector('.pw-progress')?.textContent)`)
  const shot = async (name, { width = 1440, height = 900, tema: theme = 'claro', sel } = {}) => {
    if (!photos) return
    await pilot.page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: width < 700 ? 2 : 1, mobile: false })
    await pilot.page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme === 'escuro' ? 'dark' : 'light' }] })
    await ev(`localStorage.setItem('rn-tema','${theme}');document.documentElement.dataset.tema='${theme}'`)
    if (sel) await ev(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({block:'start'})`)
    else await ev('window.scrollTo(0,0)')
    // every picture on screen is decoded before the photo (lazy images of a gallery included)
    await ev(`Promise.all([...document.images].filter((i)=>i.getBoundingClientRect().top<innerHeight*1.5).map((i)=>{i.loading='eager';return i.decode().catch(()=>null)}))`).catch(() => null)
    await sleep(700)
    const { data } = await pilot.page.send('Page.captureScreenshot', { format: 'jpeg', quality: 82, fromSurface: true })
    fs.writeFileSync(path.join(photos, `${name}-${width}-${theme}.jpg`), Buffer.from(data, 'base64'))
  }
  const shots4 = async (name, sel) => {
    for (const width of [1440, 390]) for (const theme of ['claro', 'escuro']) await shot(name, { width, tema: theme, sel })
    await pilot.page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
    await ev(`localStorage.setItem('rn-tema','claro');document.documentElement.dataset.tema='claro'`)
  }
  /** Opens the feed with the composer ready. */
  const composer = async () => {
    await pilot.goto(`${SITE}/pt/linha`)
    await waitFor(`!!document.querySelector('.pw-box textarea')&&!!document.querySelector('.pw-box input[type=file]')`)
  }
  /** Writes, describes and publishes what is in the composer; resolves when the screen says it is out. Returns the new post id. */
  const publish = async (text, alts = []) => {
    const before = (await posts()).map((i) => i.envelope.objeto.id)
    await type('.pw-box textarea', text)
    for (const [i, alt] of alts.entries()) if (alt) await type(`.pw-preview:nth-child(${i + 1}) input[type=text]`, alt)
    await sleep(150)
    await click('.pw-box button[type=submit]')
    await waitFor(`!!document.querySelector('.pw-box .callout-ok')`, 45000)
    const now = (await posts()).map((i) => i.envelope.objeto.id).filter((id) => !before.includes(id))
    assert.equal(now.length, 1, 'exactly one new post')
    return now[0]
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
  await type(inputs[0], HANDLE)
  await type(inputs[1], 'Ana Souza')
  await click('.pw-box button[type=submit]')
  await waitFor(`!!document.querySelector('.pw-box textarea')`)
  await check('Ana signs in with Rovemark, accepts the Terms and creates her profile; nothing ages her account in this test', async () => {
    assert.equal((await relay('GET', `/v1/handles/${HANDLE}`)).json.nome, 'Ana Souza')
    const db = new DatabaseSync(DB, { readOnly: true })
    const age = Math.floor(Date.now() / 1000) - db.prepare('SELECT criado_em FROM rovers WHERE uid = ?').get(personUid).criado_em
    db.close()
    assert.ok(age < 120, `the account is ${age} s old`)
  })

  // ── video: a real phone-like MP4 (H.264 + AAC, with a title, a date and a location written in) and a WebM made by ffmpeg ──
  const MP4 = path.join(tmp, 'praia.mp4')
  const WEBM = path.join(tmp, 'parque.webm')
  const LONG = path.join(tmp, 'longo.mp4')
  const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'ignore' })
  ff(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-metadata', 'title=Praia da Ana', '-metadata', 'location=-23.5505-046.6333/', '-metadata', 'creation_time=2026-11-25T10:00:00Z', '-movflags', '+faststart', MP4])
  ff(['-f', 'lavfi', '-i', 'testsrc=size=480x270:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=330', '-t', '3', '-c:v', 'libvpx-vp9', '-b:v', '300k', '-c:a', 'libopus', WEBM])
  ff(['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=10', '-t', '62', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', LONG])
  assert.ok(fs.readFileSync(MP4).includes(Buffer.from('Praia da Ana')), 'the phone-like video carries a title')
  const pickVideo = async (file) => {
    const { root } = await pilot.page.send('DOM.getDocument', { depth: -1 })
    const { nodeId } = await pilot.page.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.pw-box input[type=file][accept^="video"]' })
    await pilot.page.send('DOM.setFileInputFiles', { files: [file], nodeId })
  }
  const videoRows = () => { const db = new DatabaseSync(DB, { readOnly: true }); try { return db.prepare('SELECT v.id, v.hash, v.alvo, v.miniatura, v.duracao_ms FROM videos v ORDER BY rowid').all() } finally { db.close() } }

  await composer()
  await check('the composer offers "Anexar vídeo" because the relay announces video', async () => {
    assert.ok((await relay('GET', '/v1/info')).json.recursos.includes('video'))
    assert.equal(await ev(`!!document.querySelector('.pw-box input[type=file][accept^="video"]')`), true)
  })
  await pickVideo(LONG)
  await waitFor(`[...document.querySelectorAll('.pw-box .callout-notice')].some((e)=>/60/.test(e.textContent))`, 60000)
  await check('a 62-second video is refused on the screen before anything leaves', async () => {
    assert.equal(videoRows().length, 0)
  })
  await pickVideo(MP4)
  await waitFor(`!!document.querySelector('.pw-video-cover')&&!document.querySelector('.pw-box [aria-busy=true]')`, 60000)
  await type('.pw-box textarea', 'Quatro segundos de mar, com som.')
  await shots4('01-compositor-com-video', '.pw-box')
  const before = (await posts()).map((i) => i.envelope.objeto.id)
  await click('.pw-box button[type=submit]')
  await waitFor(`!!document.querySelector('.pw-box .callout-ok')`, 120000)
  const P1 = (await posts()).map((i) => i.envelope.objeto.id).find((id) => !before.includes(id))
  await check('the post goes with its video and a poster drawn in the browser; the relay holds a clean file', async () => {
    const read = await post(P1)
    assert.ok(read.video, 'the post reads with its video')
    assert.ok(read.video.miniatura, 'the poster frame was drawn and sent')
    assert.equal(read.video.formato, 'mp4')
    const bytes = (await relay('GET', `/v1/video/${read.video.hash}`)).buf
    assert.equal(bytes.includes(Buffer.from('Praia da Ana')), false, 'the title left the file')
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), read.video.hash)
  })
  await pilot.goto(`${SITE}/pt/p/${P1}`)
  await waitFor(`!!document.querySelector('figure.video-network video')`)
  await check('the post page shows the player with the poster, no autoplay, and the site serves ranges from its own domain', async () => {
    const src = await ev(`document.querySelector('figure.video-network video').currentSrc||document.querySelector('figure.video-network video source')?.src||document.querySelector('figure.video-network video').src`)
    assert.match(src, /\/video\/[0-9a-f]{64}\.mp4$/)
    assert.equal(await ev(`document.querySelector('figure.video-network video').autoplay`), false)
    assert.ok(await ev(`!!document.querySelector('figure.video-network video').poster`))
    const r = await fetch(src, { headers: { range: 'bytes=0-99' } })
    assert.equal(r.status, 206)
    assert.equal((await r.arrayBuffer()).byteLength, 100)
    await ev(`(async()=>{const v=document.querySelector('figure.video-network video');v.muted=true;await v.play().catch(()=>{});return true})()`)
    await waitFor(`document.querySelector('figure.video-network video').currentTime>0.3||document.querySelector('figure.video-network video').readyState>=2`, 20000)
  })
  await ev(`(()=>{const v=document.querySelector('figure.video-network video');v.pause();v.currentTime=1.5;return true})()`)
  await sleep(800)
  await shots4('02-postagem-com-video', 'article.post')

  // a WebM on a reply
  await composer()
  await pickVideo(WEBM)
  await waitFor(`!!document.querySelector('.pw-video-cover')&&!document.querySelector('.pw-box [aria-busy=true]')`, 60000)
  await type('.pw-box textarea', 'Um WebM do parque.')
  await click('.pw-box button[type=submit]')
  await waitFor(`!!document.querySelector('.pw-box .callout-ok')`, 120000)
  await check('a WebM (VP9 and Opus) goes too', async () => {
    const rows = videoRows()
    assert.equal(rows.length, 2)
  })

  // a visitor reports the video; the operator removes it by that id
  const cookies = (await pilot.page.send('Network.getCookies', { urls: [SITE] })).cookies
  await pilot.page.send('Network.clearBrowserCookies')
  await pilot.goto(`${SITE}/pt/p/${P1}`)
  await waitFor(`!!document.querySelector('.video-network-report')`)
  const reportHref = await ev(`document.querySelector('.video-network-report').getAttribute('href')`)
  await pilot.goto(SITE + reportHref)
  await waitFor(`!!document.querySelector('form') && /vídeo/i.test(document.body.innerText)`)
  await shots4('03-denunciar-video')
  const vid = (await post(P1)).video.id
  const purge = await relay('DELETE', `/v1/admin/midia/${vid}`, { body: { motivo: 'teste de ponta a ponta', motivoPublico: 'outro' }, headers: admin })
  await check('the operator removes the video by its id: the post stays and says one attachment was removed', async () => {
    assert.equal(purge.status, 200)
    const read = await post(P1)
    assert.equal(read.video, undefined)
    assert.equal(read.anexosRemovidos, 1)
  })
  await sleep(11_000) // the site's short read cache
  await pilot.goto(`${SITE}/pt/p/${P1}`)
  await waitFor(`!document.querySelector('figure.video-network')`)
  await check('the post page has no player any more and says an attachment was removed; the site serves the file no more', async () => {
    assert.match(await ev(`document.querySelector('article.post').innerText`), /removid/i)
    assert.equal((await fetch(`${SITE}/video/${(await relay('GET', '/v1/info')).json && '0'.repeat(64)}.mp4`)).status, 404)
  })
  await shots4('04-video-removido', 'article.post')
  for (const c of cookies) await pilot.page.send('Network.setCookie', { name: c.name, value: c.value, url: SITE, httpOnly: c.httpOnly, sameSite: c.sameSite })

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
