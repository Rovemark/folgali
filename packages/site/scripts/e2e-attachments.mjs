#!/usr/bin/env node
// End to end of FREE MEDIA on a publication (protocol 0.11.0, `midia-livre`; owner decision of 25/11/2026) on a LOCAL relay: the
// reference relay as a real process (RELAY_MEDIA=sim, the person issuer listed as verified), a stand-in for the Rovemark login, the real
// site (standalone build) and a real browser (Logica Pilot) where the device reduces, cleans and signs.
// Proves: a signed-in person, verified from day one, attaches images in the composer (a GIF is refused on the screen), publishes a post
// with 2 images and posts with 1, 3 and 4; the relay holds the `imagem` objects in order, without approval, and the served bytes carry
// no EXIF; the feed and the post page show the gallery, an image with no description has a name, and the image opens larger (Escape
// closes); a VISITOR reports one image; the operator removes it by that id; the post stays and says "removed by moderation"; sending the
// removed file again is refused before anything is published; an image refused after the post is out leaves the post standing and the
// screen says which one did not go; and the post limit of the relay says on the screen how long is left.
//
//   npx next build   (then)   node scripts/e2e-attachments.mjs .next/standalone [--fotos <dir>]
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
    env: { ...inherited, RELAY_ISSUERS: people.publicKey, RELAY_PEOPLE_ISSUERS: people.publicKey, RELAY_VERIFIED_ISSUERS: people.publicKey, RELAY_DB: DB, RELAY_PORT: String(pRelay), RELAY_REPORT_SECRET: 'ab'.repeat(32), RELAY_GALLERY_BASE: SITE, RELAY_MEDIA: 'sim', RELAY_MEDIA_DIR: MEDIA_DIR, RELAY_ADMIN_TOKEN: ADMIN },
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

  // ── the composer ──
  await composer()
  await check('the composer offers "Anexar imagem" because the relay announces midia-livre', async () => {
    assert.equal(await ev(`document.querySelector('.pw-attach-button').textContent.trim()`), 'Anexar imagem')
    assert.equal(await ev(`document.querySelector('.pw-box input[type=file]').multiple`), true)
  })
  await pickFiles(GIF)
  await waitFor(`[...document.querySelectorAll('.pw-box .callout-notice')].some((e)=>/JPEG, PNG nem WebP/.test(e.textContent))`)
  await check('a GIF is refused on the screen, by its first bytes, before anything leaves', async () => {
    assert.equal(await ev(`document.querySelectorAll('.pw-preview').length`), 0)
    assert.equal(uploads().length, 0)
  })
  await pickFiles(PHONE, picture(1), picture(2))
  await previews(3)
  await type('.pw-box textarea', 'Tarde de folga na praia, com direito a castelo de areia.')
  await type('.pw-preview:nth-child(1) input[type=text]', 'O mar no fim da tarde, visto da areia.')
  await check('three chosen images show as previews, each with a remove button and an optional description', async () => {
    assert.equal(await ev(`[...document.querySelectorAll('.pw-preview')].every((li)=>li.querySelector('img').naturalWidth>0&&!!li.querySelector('.pw-preview-remove')&&!li.querySelector('input[type=text]').required)`), true)
    assert.deepEqual(await ev(`[...document.querySelectorAll('.pw-preview-alt label')].map((l)=>l.textContent)`), [1, 2, 3].map((k) => `Descrição da imagem ${k} (opcional)`))
  })
  await shots4('01-compositor-3-previas', '.pw-box')
  await ev(`document.querySelector('.pw-preview:nth-child(3) .pw-preview-remove').click()`)
  await previews(2)
  const P2 = await publish('Tarde de folga na praia, com direito a castelo de areia.')
  let p2
  await check('a post with 2 images: the relay holds two `imagem` objects in order, with no approval, the description and an empty one', async () => {
    p2 = await post(P2)
    assert.equal(p2.envelope.objeto.corpo.texto, 'Tarde de folga na praia, com direito a castelo de areia.')
    assert.deepEqual(p2.imagens.map((i) => [i.ordem, i.formato, i.alt]), [[0, 'jpeg', 'O mar no fim da tarde, visto da areia.'], [1, 'jpeg', '']])
    for (const i of p2.imagens) {
      assert.ok(Math.max(i.largura, i.altura) <= 2048 && i.bytes <= 1048576, JSON.stringify(i))
      const env = (await relay('GET', `/v1/objetos/${i.id}`)).json
      assert.equal(env.objeto.tipo, 'imagem')
      assert.equal(env.objeto.corpo.uso, 'anexo')
      assert.equal(env.objeto.corpo.alvo, P2)
      assert.equal(env.aprovacao ?? null, null, 'no human approval travels with a free image')
    }
    // the third picture was removed on the screen before publishing: it never left the device
    assert.equal(uploads().length, 2)
  })
  await check('the proportion is kept and the served file is a clean JPEG: no EXIF, no GPS, no name', async () => {
    assert.deepEqual([p2.imagens[0].largura, p2.imagens[0].altura], [1600, 1200])
    assert.deepEqual([p2.imagens[1].largura, p2.imagens[1].altura], [1200, 1600])
    const r = await relay('GET', `/v1/midia/${p2.imagens[0].hash}`)
    assert.equal(r.status, 200)
    assert.equal(r.headers.get('content-type'), 'image/jpeg')
    for (const mark of ['Exif', 'Ana Souza', 'GPS']) assert.equal(r.buf.includes(Buffer.from(mark)), false, mark)
    assert.equal(crypto.createHash('sha256').update(r.buf).digest('hex'), p2.imagens[0].hash)
    assert.equal((await fetch(`${SITE}/midia/${p2.imagens[0].hash}.jpg`)).status, 200)
  })
  await pilot.goto(`${SITE}/pt/linha`)
  await waitFor(`!!document.querySelector('.post .gallery[data-n="2"] img')`)
  await check('the feed shows the gallery; the image with no description is named after its author, none has an empty alt', async () => {
    assert.deepEqual(await ev(`[...document.querySelectorAll('.post .gallery[data-n="2"] img')].map((i)=>i.alt)`), ['O mar no fim da tarde, visto da areia.', 'Imagem publicada por Ana Souza'])
    assert.deepEqual(await ev(`[...document.querySelectorAll('.post .gallery[data-n="2"] img')].map((i)=>i.getAttribute('src'))`), p2.imagens.map((i) => `/midia/${i.hash}.jpg`))
  })
  await shots4('02-feed-galeria-2', '.post')

  // ── opening an image larger ──
  await pilot.goto(`${SITE}/pt/p/${P2}`)
  await waitFor(`!!document.querySelector('.gallery[data-n="2"] .gallery-open')`)
  await shots4('03-postagem-2-imagens')
  await ev(`document.querySelector('.gallery .gallery-open').click()`)
  await waitFor(`document.querySelector('dialog.viewer').open&&document.querySelector('dialog.viewer img.viewer-img')?.naturalWidth>0`)
  await check('tapping an image opens it larger in a modal dialog, with its position, its description and "Denunciar imagem"', async () => {
    assert.equal(await ev(`document.querySelector('dialog.viewer').matches(':modal')`), true)
    assert.equal(await ev(`document.querySelector('dialog.viewer .viewer-position').textContent`), 'Imagem 1 de 2')
    assert.equal(await ev(`document.querySelector('dialog.viewer .viewer-caption').textContent`), 'O mar no fim da tarde, visto da areia.')
    assert.equal(await ev(`document.activeElement.getAttribute('aria-label')`), 'Fechar')
    assert.equal(await ev(`document.querySelector('dialog.viewer .viewer-report').textContent.trim()`), 'Denunciar imagem')
  })
  await shots4('04-visor-imagem-ampliada')
  const key = async (k, code) => { for (const t of ['keyDown', 'keyUp']) await pilot.page.send('Input.dispatchKeyEvent', { type: t, key: k, code, windowsVirtualKeyCode: code === 'Escape' ? 27 : 39 }) }
  await key('ArrowRight', 'ArrowRight')
  await waitFor(`document.querySelector('dialog.viewer .viewer-position').textContent==='Imagem 2 de 2'`)
  await key('Escape', 'Escape')
  await waitFor(`!document.querySelector('dialog.viewer').open`)
  await check('the arrow key goes to the next image and Escape closes, with the focus back on the image that opened it', async () => {
    // the dialog closes first and the focus comes back right after (wait for it, do not race it)
    await waitFor(`!!document.activeElement?.classList.contains('gallery-open')`)
    assert.equal(await ev(`document.activeElement.classList.contains('gallery-open')`), true)
  })

  // ── 1, 3 and 4 images ──
  const galleries = {}
  for (const [k, from, text] of [[1, 3, 'Um cochilo no sofá depois do almoço.'], [3, 4, 'Três momentos do passeio de hoje.'], [4, 7, 'Quatro cantos da casa na folga.']]) {
    await composer()
    await pickFiles(...Array.from({ length: k }, (_, i) => picture(from + i)))
    await previews(k)
    galleries[k] = await publish(text, k === 3 ? ['A trilha no começo da manhã.'] : [])
    await pilot.goto(`${SITE}/pt/p/${galleries[k]}`)
    await waitFor(`document.querySelectorAll('.gallery[data-n="${k}"] img').length===${k}`)
    await shots4(`05-postagem-${k}-image${k === 1 ? 'm' : 'ns'}`)
  }
  await check('posts with 1, 3 and 4 images: every image is on the relay, in the order it was chosen', async () => {
    for (const k of [1, 3, 4]) assert.deepEqual((await post(galleries[k])).imagens.map((i) => i.ordem), Array.from({ length: k }, (_, i) => i))
    assert.equal(uploads().length, 10)
  })

  // ── a visitor reports one image ──
  const cookies = (await pilot.page.send('Network.getCookies', { urls: [SITE] })).cookies
  await pilot.page.send('Network.clearBrowserCookies')
  await pilot.goto(`${SITE}/pt/p/${P2}`)
  await waitFor(`document.querySelectorAll('.gallery .gallery-report').length===2`)
  await check('the visitor (no session) sees the gallery and a "Denunciar a imagem" entry of 44 px on each image', async () => {
    assert.equal((await pilot.page.send('Network.getCookies', { urls: [SITE] })).cookies.length, 0)
    assert.deepEqual(await ev(`[...document.querySelectorAll('.gallery .gallery-report')].map((a)=>a.getAttribute('aria-label'))`), ['Denunciar a imagem 1', 'Denunciar a imagem 2'])
    assert.deepEqual(await ev(`[...document.querySelectorAll('.gallery .gallery-report')].map((a)=>{const r=a.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)]})`), [[44, 44], [44, 44]])
  })
  const REPORTED = p2.imagens[1]
  await ev(`[...document.querySelectorAll('.gallery .gallery-report')][1].click()`)
  await waitFor(`location.pathname==='/pt/denunciar/${REPORTED.id}'&&!!document.querySelector('input[name=motivo][value=ilegal]')`)
  await check('the report page says it is an image and whose, not a profile photo', async () => {
    const target = await ev(`document.querySelector('.target-report').innerText`)
    assert.match(target, /Imagem denunciada/i)
    assert.match(target, new RegExp(`Imagem publicada por @${HANDLE.replace('.', '\\.')}`))
    assert.doesNotMatch(target, /Foto do perfil/)
    assert.equal(await ev(`document.querySelector('input[name=alvo]').value`), REPORTED.id)
  })
  await shots4('06-denunciar-imagem')
  await click('input[name=motivo][value=ilegal]')
  await sleep(200)
  await click('input[name=boaFe]')
  await click('form.panel button[type=submit]')
  await waitFor(`!!document.querySelector('.panel.published')`)
  await check('the report reaches the relay as a visitor report on the `imagem` object', async () => {
    const d = await relay('GET', '/v1/admin/denuncias', { headers: admin })
    assert.equal(d.status, 200)
    assert.ok(JSON.stringify(d.json).includes(REPORTED.id), JSON.stringify(d.json).slice(0, 300))
  })

  // ── the operator removes it ──
  await check('the operator removes the image by that id: the file is gone, the post stays with one image and says one was removed', async () => {
    const r = await relay('DELETE', `/v1/admin/midia/${REPORTED.id}`, { body: { motivo: 'denuncia confirmada no teste', motivoPublico: 'regras' }, headers: admin })
    assert.equal(r.status, 200, JSON.stringify(r.json))
    assert.equal((await relay('GET', `/v1/midia/${REPORTED.hash}`)).status, 404)
    const after = await post(P2)
    assert.deepEqual(after.imagens.map((i) => i.id), [p2.imagens[0].id])
    assert.equal(after.anexosRemovidos, 1)
    assert.equal(after.envelope.objeto.corpo.texto, 'Tarde de folga na praia, com direito a castelo de areia.')
  })
  await sleep(11_000) // the site's short read cache
  await pilot.goto(`${SITE}/pt/p/${P2}`)
  await waitFor(`!!document.querySelector('.gallery-removed')`)
  await check('the post page shows the image that stayed and the note "Uma imagem foi removida pela moderação."', async () => {
    assert.equal(await ev(`document.querySelector('.gallery-removed').textContent`), 'Uma imagem foi removida pela moderação.')
    assert.equal(await ev(`document.querySelectorAll('.gallery[data-n="1"] img').length`), 1)
    assert.equal((await fetch(`${SITE}/midia/${REPORTED.hash}.jpg`)).status, 404)
  })
  await shots4('07-removida-pela-moderacao')

  // ── Ana again: the removed file does not come back ──
  for (const c of cookies) await pilot.page.send('Network.setCookie', { name: c.name, value: c.value, url: SITE, httpOnly: c.httpOnly, sameSite: c.sameSite })
  await composer()
  await pickFiles(picture(11), picture(1))
  await previews(2)
  await type('.pw-box textarea', 'Tentando mandar de novo a foto que saiu.')
  await sleep(150)
  const before = (await posts()).length
  await click('.pw-box button[type=submit]')
  await waitFor(`[...document.querySelectorAll('.pw-box .callout-notice')].some((e)=>/nada foi publicado/.test(e.textContent))`)
  await check('sending the removed file again: the upload is refused, the screen says which image and why, and nothing is published', async () => {
    assert.equal(await ev(`[...document.querySelectorAll('.pw-box .callout-notice')].map((e)=>e.textContent).join(' ')`), 'A imagem 2 não foi enviada, então nada foi publicado. Esta imagem foi removida pela moderação e não volta.')
    assert.equal((await posts()).length, before)
    assert.equal(await ev(`document.querySelectorAll('.pw-preview').length`), 2)
    assert.equal(await ev(`document.querySelector('.pw-box textarea').value`), 'Tentando mandar de novo a foto que saiu.')
  })
  await shots4('08-compositor-envio-recusado', '.pw-box')

  // ── an image refused AFTER the post is out ──
  // The operator takes down the third file between its upload and its `imagem` object (every file is uploaded before the post). The
  // network is slowed so the removal lands in that gap; the relay then refuses that one object.
  await composer()
  await pickFiles(picture(12), picture(13), picture(14))
  await previews(3)
  await type('.pw-box textarea', 'Três fotos, uma delas vai ficar pelo caminho.')
  await sleep(150)
  const sent = uploads().length
  await pilot.page.send('Network.enable')
  await pilot.page.send('Network.emulateNetworkConditions', { offline: false, latency: 350, downloadThroughput: -1, uploadThroughput: -1 })
  await click('.pw-box button[type=submit]')
  let third = null
  for (const t0 = Date.now(); Date.now() - t0 < 30000 && !third; await sleep(15)) third = uploads()[sent + 2] ?? null
  assert.ok(third, 'the three files were uploaded')
  const purge = await relay('DELETE', `/v1/admin/midia/${third}`, { body: { motivo: 'retirada entre o envio e o objeto, no teste', motivoPublico: 'regras' }, headers: admin })
  assert.equal(purge.status, 200, JSON.stringify(purge.json))
  await waitFor(`!!document.querySelector('.pw-partial')&&!document.querySelector('.pw-partial [aria-busy=true]')`, 45000)
  await pilot.page.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  let P3
  await check('image 3 is refused after the post is out: the post stays with the other two, and the screen says which one did not go and why', async () => {
    assert.equal(purge.json.objetos, 0, 'the file was removed before any object cited it')
    const text = await ev(`document.querySelector('.pw-partial').innerText`)
    assert.match(text, /A postagem foi publicada, mas a imagem 3 não entrou\./)
    assert.match(text, /Imagem 3 de 3/)
    assert.match(text, /Esta imagem foi removida pela moderação e não volta\./)
    assert.match(text, /Tentar de novo/)
    P3 = (await posts())[0]
    assert.equal(P3.envelope.objeto.corpo.texto, 'Três fotos, uma delas vai ficar pelo caminho.')
    assert.deepEqual(P3.imagens.map((i) => i.ordem), [0, 1])
  })
  await shots4('09-compositor-imagem-nao-entrou', '.pw-box')
  await clickText('.pw-partial button', 'Tentar de novo')
  await sleep(400)
  await waitFor(`!!document.querySelector('.pw-partial')&&!document.querySelector('.pw-partial [aria-busy=true]')`)
  await check('"Tentar de novo" asks the relay again for that image only (still refused, and said); "Deixar assim" ends it with the post published', async () => {
    assert.match(await ev(`document.querySelector('.pw-partial').innerText`), /a imagem 3 não entrou/)
    assert.equal((await posts())[0].envelope.objeto.id, P3.envelope.objeto.id)
    await clickText('.pw-partial button', 'Deixar assim')
    await waitFor(`!document.querySelector('.pw-partial')&&!!document.querySelector('.pw-box .callout-ok')`)
    assert.deepEqual((await post(P3.envelope.objeto.id)).imagens.map((i) => i.ordem), [0, 1])
  })

  // ── the post limit says how long is left ──
  await composer()
  let refusal = null
  let went = 0
  let lastText = ''
  for (let i = 0; i < 14 && !refusal; i++) {
    lastText = `Bilhete rápido número ${i + 1}.`
    await type('.pw-box textarea', lastText)
    await sleep(120)
    await click('.pw-box button[type=submit]')
    await waitFor(`!document.querySelector('.pw-box [aria-busy=true]')&&(!!document.querySelector('.pw-box .callout-ok')||!!document.querySelector('.pw-box .callout-notice'))`)
    refusal = await ev(`document.querySelector('.pw-box .callout-notice')?.textContent ?? null`)
    if (!refusal) went++
  }
  await check('the 11th post in a minute: the relay refuses with retryAfterS and the screen says when it unblocks', async () => {
    assert.match(refusal ?? '', /^Você chegou ao limite de postagens\. Libera em \d+ (segundo|segundos|minuto)\.$/)
    // a verified account posts 10 a minute: the notes that went plus the posts of the steps before that are still inside the minute
    const lastMinute = (await posts()).filter((p) => p.envelope.objeto.criadoEm >= Math.floor(Date.now() / 1000) - 60).length
    assert.ok(went >= 1 && went <= 10, `${went} notes went before the refusal`)
    // (`criadoEm` is the signing instant, a second or so before the relay counts it: the edge of the minute may hold one more)
    assert.ok(lastMinute >= 9 && lastMinute <= 11, `${lastMinute} posts in the last minute on the relay (${went} of them notes)`)
    const newest = (await posts())[0].envelope.objeto.corpo.texto
    assert.notEqual(newest, lastText, 'the refused note is not on the relay')
    assert.equal(await ev(`document.querySelector('.pw-box textarea').value`), lastText, 'what she wrote stays in the box')
  })
  await shots4('10-compositor-limite-com-prazo', '.pw-box')

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
