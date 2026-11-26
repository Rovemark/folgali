#!/usr/bin/env node
// End to end of EDITING what was published (protocol 0.11.0 part 2, `edicao`) and of a PERSON replying (0.7.0), on a LOCAL relay: the
// reference relay as a real process (RELAY_MEDIA=sim, the person issuer listed as verified), a stand-in for the Rovemark login, the real
// site (standalone build) and a real browser (Logica Pilot) where the device signs.
// Proves: a signed-in person posts, opens her post and edits it from the "..." menu (the relay keeps the original and the edit, the
// page shows the new text with the mark "edited"), edits again and opens the public history (3 versions, newest first, the current one
// marked); the sixth edit within the hour is refused and the screen says when it unblocks; she replies on her post without and with an
// image (the image is attached to the REPLY) and edits her reply; in a forum topic of another person she replies, is told to join the
// community first, "join and reply" joins, the 10 minutes a new member waits are said with how long is left, then the reply goes; she
// edits her forum reply; a VISITOR sees the invitation to sign in under the post and in the topic, and the history is public.
//
//   npx next build   (then)   node scripts/e2e-edit.mjs .next/standalone [--fotos <dir>]
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'folgali-e2e-edicao-'))
if (photos) fs.mkdirSync(photos, { recursive: true })

const freePort = async () => { const s = http.createServer(); s.listen(0, '127.0.0.1'); await once(s, 'listening'); const p = s.address().port; await new Promise((ok) => s.close(ok)); return p }
const [pApi, pSite, pRelay] = [await freePort(), await freePort(), await freePort()]
const API = `http://127.0.0.1:${pApi}`
const SITE = `http://127.0.0.1:${pSite}`
const RELAY = `http://127.0.0.1:${pRelay}`
const ADMIN = crypto.randomBytes(32).toString('hex')
const people = M.newIssuer()
const uidSecret = crypto.randomBytes(32)
const PERSON = 'p_e2e_edicao_ana_0001'
const HANDLE = 'ana.edita'
const DB = path.join(tmp, 'rele.sqlite')
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))
let n = 0
const check = async (label, fn) => { await fn(); n++; console.log(`  ✓ ${label}`) }
const inherited = Object.fromEntries(['PATH', 'TMPDIR', 'LANG', 'HOME'].filter((k) => process.env[k]).map((k) => [k, process.env[k]]))

// one picture for the reply with an image: a house plush photo
const ART = path.join(SITE_DIR, 'public/marca/folgali/fotos')
const PHOTO = path.join(tmp, 'foto.jpg')
execFileSync('magick', [path.join(ART, fs.readdirSync(ART).filter((f) => f.endsWith('.webp')).sort()[3]), '-resize', '1600x1200^', '-gravity', 'center', '-extent', '1600x1200', '-quality', '90', PHOTO])

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
  let json = null
  try { json = await r.json() } catch { /* empty */ }
  return { status: r.status, json }
}

// ── Bia, another person, signed here in node: she opens a community and a topic for Ana to reply in ──
const bia = (() => {
  const keys = P.generateKeyPair()
  const uid = P.derivePersonUid(uidSecret, 'p_e2e_edicao_bia_0002')
  const t = Math.floor(Date.now() / 1000) - 5
  const attestation = P.createPersonAttestation({ issuerPrivateKey: people.chavePrivada, emissor: people.publicKey, uid, handle: 'bia.forum', chave: keys.publicKey, emitidoEm: t, expiraEm: t + 7 * 86400 })
  let previous = null
  const publish = async (type, body) => {
    const object = P.createObject({ tipo: type, autor: uid, criadoEm: Math.floor(Date.now() / 1000), previo: previous, corpo: body, chavePrivada: keys.chavePrivada, v: '0.3' })
    const r = await relay('POST', '/v1/objetos', { body: { objeto: object, atestado: attestation } })
    assert.ok(r.status < 300, `Bia ${type}: ${r.status} ${JSON.stringify(r.json)}`)
    previous = object.id
    return object.id
  }
  return { uid, publicar: publish }
})()

let pilot
try {
  await start('relay', ['--disable-warning=ExperimentalWarning', path.join(REPO, 'packages/relay/bin/relay.js')], {
    cwd: REPO, ready: /"ouvindo"/,
    env: { ...inherited, RELAY_ISSUERS: people.publicKey, RELAY_PEOPLE_ISSUERS: people.publicKey, RELAY_VERIFIED_ISSUERS: people.publicKey, RELAY_DB: DB, RELAY_PORT: String(pRelay), RELAY_REPORT_SECRET: 'ab'.repeat(32), RELAY_GALLERY_BASE: SITE, RELAY_MEDIA: 'sim', RELAY_MEDIA_DIR: path.join(tmp, 'midia'), RELAY_ADMIN_TOKEN: ADMIN },
  })
  await start('site', ['server.js'], {
    cwd: standalone, ready: /Ready|started|127\.0\.0\.1/i,
    env: { ...inherited, NODE_ENV: 'production', PORT: String(pSite), HOSTNAME: '127.0.0.1', FOLGALI_SESSION_SECRET: crypto.randomBytes(32).toString('base64url'), FOLGALI_ROVEMARK_API: API, FOLGALI_ROVEMARK_RETURN: `${SITE}/api/auth/rovemark/callback`, FOLGALI_DATA_DIR: path.join(tmp, 'folgali'), FOLGALI_CLIENT: 'http', FOLGALI_RELAY_URL: RELAY, FOLGALI_BASE_URL: SITE },
  })
  console.log(`▶ relay ${RELAY} (media on, verified person issuer), Rovemark stand-in ${API}, site ${SITE}`)
  await check('the relay announces `edicao` with its limits and a public history', async () => {
    const i = (await relay('GET', '/v1/info')).json
    for (const r of ['edicao', 'midia-livre', 'recusas-com-prazo']) assert.ok(i.recursos.includes(r), `${r} in ${i.recursos}`)
    assert.deepEqual(i.edicao, { alvos: ['postagem', 'resposta', 'topico', 'resposta-forum'], porAlvoPorHora: 5, versoesPorAlvo: 50, historicoPublico: true })
  })

  // Bia's community and topic, an open community Ana is not in
  await bia.publicar('perfil', { nome: 'Bia', descricao: '', grafo: 'publico', exigirAprovacao: [] })
  const COMMUNITIES = await bia.publicar('comunidade-criar', { nome: 'Lanternas de trilha', descricao: 'Quem anda no escuro conta o que leva.', regras: 'Seja gentil.', tema: 'rovers', acesso: 'aberta', categorias: [] })
  const TOPIC = await bia.publicar('topico', { comunidade: COMMUNITIES, categoria: null, titulo: 'Qual lanterna vocês levam?', texto: 'A minha apagou no meio da subida. Quero trocar.', tags: [], enquete: null })

  const require = createRequire(import.meta.url)
  const { LogicaPilot } = require(pilotPath())
  pilot = await new LogicaPilot({ headless: true, width: 1440, height: 900 }).launch()
  const ev = (js) => pilot.page.eval(js)
  const waitFor = async (js, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(js).catch(() => false)) return true; await sleep(200) } throw new Error(`timed out: ${js}\n--- page ---\n${String(await ev(`location.href+'\\n'+(document.querySelector('main')||document.body).innerText.slice(0,1500)`).catch((x) => x.message))}`) }
  const type = (sel, text) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});const set=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value').set;set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)
  const click = (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.click();return true})()`)
  const clickText = (scope, text) => ev(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(scope)})].find((b)=>b.textContent.trim()===${JSON.stringify(text)});if(!e)return false;e.click();return true})()`)
  const text = (sel) => ev(`document.querySelector(${JSON.stringify(sel)})?.textContent?.trim() ?? null`)
  const pickFiles = async (sel, ...files) => {
    const { root } = await pilot.page.send('DOM.getDocument', { depth: -1 })
    const { nodeId } = await pilot.page.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel })
    await pilot.page.send('DOM.setFileInputFiles', { files, nodeId })
  }
  const shot = async (name, { width = 1440, height = 900, tema: theme = 'claro', sel } = {}) => {
    if (!photos) return
    await pilot.page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: width < 700 ? 2 : 1, mobile: false })
    await pilot.page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme === 'escuro' ? 'dark' : 'light' }] })
    await ev(`localStorage.setItem('rn-tema','${theme}');document.documentElement.dataset.tema='${theme}'`)
    if (sel) await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(e){const y=e.getBoundingClientRect().top+scrollY-80;window.scrollTo(0,Math.max(0,y))}})()`)
    else await ev('window.scrollTo(0,0)')
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
  const ana = async () => (await relay('GET', `/v1/rovers/${personUid}/postagens?limite=50&completo=1`)).json.itens
  /** Opens the "..." of the first post on the page and clicks "Editar"; resolves when the inline editor is open. */
  const editFromMenu = async (scope = 'article.post') => {
    await waitFor(`[...document.querySelectorAll(${JSON.stringify(`${scope} .menu-list button`)})].some((b)=>b.textContent.trim()==='Editar')`)
    await click(`${scope} .post-menu summary`)
    await clickText(`${scope} .menu-list button`, 'Editar')
    await waitFor(`!!document.querySelector('.ed-form textarea')`)
  }
  // the reference relay serves one origin a burst of 40 reads, refilled at 8 a second, and every page of the site reads through the
  // same origin: between steps that reload a page the test gives the bucket a moment, as a person reading would
  const breathe = () => sleep(3500)
  const go = async (url) => {
    await breathe()
    await pilot.goto(url)
  }
  const save = async () => {
    await sleep(150)
    await click('.ed-form button[type=submit]')
    await waitFor(`!document.querySelector('.ed-form [aria-busy=true]')&&(!document.querySelector('.ed-form')||!!document.querySelector('.ed-form .callout-notice'))`, 45000)
    await breathe()
  }

  // ── sign in, Terms, first profile, one post ──
  await go(`${SITE}/api/auth/rovemark/inicio?lang=pt&destino=/pt/entrar`)
  await waitFor(`location.pathname==='/pt/entrar'`)
  await waitFor(`!!document.querySelector('input[name=aceito]')`)
  await click('input[name=aceito]')
  await sleep(300)
  await click('form.consent button[type=submit]')
  await waitFor(`!document.querySelector('input[name=aceito]')`)
  await go(`${SITE}/pt/linha`)
  await waitFor(`!!document.querySelector('.pw-box input')`)
  const inputs = await ev(`[...document.querySelectorAll('.pw-box input')].map((i)=>'#'+CSS.escape(i.id))`)
  await type(inputs[0], HANDLE)
  await type(inputs[1], 'Ana Souza')
  await click('.pw-box button[type=submit]')
  await waitFor(`!!document.querySelector('.pw-box textarea')`)
  const ORIGINAL = 'Subi a trilha da pedra com uma lanterna emprestada.'
  await type('.pw-box textarea', ORIGINAL)
  await sleep(150)
  await click('.pw-box button[type=submit]')
  await waitFor(`!!document.querySelector('.pw-box .callout-ok')`, 45000)
  const POST = (await ana()).find((i) => i.envelope.objeto.tipo === 'postagem').envelope.objeto.id
  await check('Ana signs in with Rovemark, creates her profile and posts', async () => {
    assert.equal((await relay('GET', `/v1/postagens/${POST}`)).json.envelope.objeto.corpo.texto, ORIGINAL)
  })

  // ── edit the post ──
  await go(`${SITE}/pt/p/${POST}`)
  await check('on her own post the "..." menu offers "Editar"', async () => {
    await waitFor(`[...document.querySelectorAll('article.post .menu-list button')].some((b)=>b.textContent.trim()==='Editar')`)
  })
  await editFromMenu()
  await check('the inline editor opens with the current text and an optional title, and Salvar waits for a change', async () => {
    assert.equal(await ev(`document.querySelector('.ed-form textarea').value`), ORIGINAL)
    assert.equal(await ev(`document.querySelector('.ed-form input[type=text]').value`), '')
    assert.equal(await ev(`[...document.querySelectorAll('.ed-form label')].map((l)=>l.textContent).join('|')`), 'Título (opcional)|Texto')
    assert.equal(await ev(`document.querySelector('.ed-form button[type=submit]').disabled`), true)
  })
  const EDIT1 = 'Subi a trilha da pedra com uma lanterna emprestada. Ela apagou na metade.'
  await type('.ed-form input[type=text]', 'Trilha da pedra')
  await type('.ed-form textarea', `${EDIT1} ghp_abcdefghijklmnopqrstuvwxyz0123456789AB`)
  await check('the leak detector runs while she edits and holds Salvar', async () => {
    await waitFor(`!!document.querySelector('.ed-form .notice-leak')`)
    assert.equal(await ev(`document.querySelector('.ed-form button[type=submit]').disabled`), true)
  })
  await type('.ed-form textarea', EDIT1)
  await waitFor(`!document.querySelector('.ed-form .notice-leak')`)
  await shots4('02-editor-da-postagem', 'article.post')
  await save()
  await waitFor(`!!document.querySelector('article.post .edited-mark')`)
  await check('saved: the relay keeps the original and the edit; the page shows the new title and text with the mark "editado"', async () => {
    const p = (await relay('GET', `/v1/postagens/${POST}`)).json
    assert.equal(p.envelope.objeto.corpo.texto, ORIGINAL, 'the original envelope is untouched')
    assert.equal(p.edicao.texto, EDIT1)
    assert.equal(p.edicao.titulo, 'Trilha da pedra')
    assert.equal(p.edicao.versoes, 2)
    assert.equal(await text('article.post .post-text'), EDIT1)
    assert.equal(await text('article.post .post-title'), 'Trilha da pedra')
    assert.equal(await text('article.post .edited-mark'), 'editado')
    assert.equal(await ev(`document.querySelector('article.post .edited-mark').getAttribute('href')`), `/pt/p/${POST}/edicoes`)
    assert.match(await ev(`document.querySelector('article.post .edited-mark').title`), /^Editado agora\. Ver as 2 versões$/)
  })
  await shots4('01-postagem-editada', 'article.post')
  // a second edit, then the history
  await editFromMenu()
  const EDIT2 = 'Subi a trilha da pedra com uma lanterna emprestada. Ela apagou na metade e desci com a do celular.'
  await type('.ed-form textarea', EDIT2)
  await save()
  await waitFor(`document.querySelector('article.post .post-text')?.textContent.trim()===${JSON.stringify(EDIT2)}`)
  await click('article.post .edited-mark')
  await waitFor(`location.pathname==='/pt/p/${POST}/edicoes'&&!!document.querySelector('.ed-versions')`)
  await breathe()
  await check('the history lists the 3 versions newest first, with dates, the current one marked and the original named', async () => {
    assert.equal(await text('h1'), 'Histórico de edições')
    assert.deepEqual(await ev(`[...document.querySelectorAll('.ed-version .ed-version-n')].map((e)=>e.textContent)`), ['Versão 3', 'Versão 2', 'Versão 1'])
    assert.deepEqual(await ev(`[...document.querySelectorAll('.ed-version .post-text')].map((e)=>e.textContent.trim())`), [EDIT2, EDIT1, ORIGINAL])
    assert.equal(await ev(`document.querySelector('.ed-version[aria-current=true] .ed-version-n').textContent`), 'Versão 3')
    assert.equal(await ev(`document.querySelector('.ed-version:last-child .pill').textContent`), 'original')
    assert.equal(await ev(`[...document.querySelectorAll('.ed-version time')].every((t)=>!!t.dateTime)`), true)
    assert.equal(await ev(`document.querySelector('a.btn[href="/pt/p/${POST}"]')?.textContent.trim()`), 'Voltar à publicação')
  })
  await shots4('03-historico-de-versoes')

  // ── the limit: 5 edits of the same post in an hour ──
  await go(`${SITE}/pt/p/${POST}`)
  let refusal = null
  for (let i = 3; i <= 7 && !refusal; i++) {
    await editFromMenu()
    await type('.ed-form textarea', `${EDIT2} (${i})`)
    await save()
    refusal = await text('.ed-form .callout-notice')
    if (!refusal) await waitFor(`document.querySelector('article.post .post-text')?.textContent.trim()===${JSON.stringify(`${EDIT2} (${i})`)}`)
  }
  await check('the sixth edit within the hour is refused, and the screen says when it unblocks; the text she wrote stays', async () => {
    assert.match(refusal ?? '', /^Você chegou ao limite de edições\. Libera em (\d+ minutos|1 hora)\.$/)
    assert.equal((await relay('GET', `/v1/postagens/${POST}`)).json.edicao.versoes, 6)
    assert.match(await ev(`document.querySelector('.ed-form textarea').value`), /\(\d\)$/)
  })
  await shots4('04-edicao-limite-com-prazo', 'article.post')
  await clickText('.ed-form button', 'Cancelar')

  // ── replies on the post, without and with an image ──
  await check('under her post, a signed-in person gets a reply box, and no "rovers do the replying"', async () => {
    await waitFor(`!!document.querySelector('.pw-reply .pw-box textarea')`)
    assert.equal(await text('.pw-reply h2'), 'Responder')
    assert.equal(await ev(`document.querySelector('.pw-reply textarea').maxLength`), 1000)
    assert.equal(await ev(`!!document.querySelector('.invite-reply')`), false)
    assert.equal(await ev(`!!document.querySelector('.pw-reply input[type=file]')`), true)
  })
  const R1 = 'Da próxima vez levo pilha reserva.'
  await type('.pw-reply textarea', R1)
  await sleep(150)
  await click('.pw-reply button[type=submit]')
  await waitFor(`!!document.querySelector('.pw-reply .callout-ok')&&[...document.querySelectorAll('.thread-list article.post .post-text')].some((e)=>e.textContent.trim()===${JSON.stringify(R1)})`, 45000)
  await breathe()
  const R2 = 'A vista lá de cima, antes de a lanterna apagar.'
  await pickFiles('.pw-reply input[type=file]', PHOTO)
  await waitFor(`document.querySelectorAll('.pw-reply .pw-preview').length===1&&!document.querySelector('.pw-reply [aria-busy=true]')`)
  await type('.pw-reply textarea', R2)
  await type('.pw-reply .pw-preview input[type=text]', 'O vale visto do alto da pedra.')
  await shots4('05-resposta-da-pessoa-com-imagem', '.pw-reply')
  await sleep(150)
  await click('.pw-reply button[type=submit]')
  await waitFor(`[...document.querySelectorAll('.thread-list article.post .post-text')].some((e)=>e.textContent.trim()===${JSON.stringify(R2)})`, 45000)
  await waitFor(`!!document.querySelector('.thread-list[role=feed] article.post .gallery img')`, 20000)
  await breathe()
  let replies
  await check('two replies on the relay: `resposta` to the post, signed by her, the second with its image attached to the REPLY', async () => {
    replies = (await relay('GET', `/v1/postagens/${POST}/respostas?ordem=antigas&limite=50`)).json.itens
    assert.deepEqual(replies.map((r) => [r.envelope.objeto.tipo, r.envelope.objeto.autor, r.envelope.objeto.corpo.alvo, r.envelope.objeto.corpo.texto]), [['resposta', personUid, POST, R1], ['resposta', personUid, POST, R2]])
    assert.equal(replies[0].imagens, undefined)
    assert.equal(replies[1].imagens.length, 1)
    assert.equal(replies[1].imagens[0].alt, 'O vale visto do alto da pedra.')
    assert.equal((await relay('GET', `/v1/objetos/${replies[1].imagens[0].id}`)).json.objeto.corpo.alvo, replies[1].envelope.objeto.id)
  })
  await shots4('06-postagem-com-respostas', '.thread-list[role=feed]')
  // edit the first reply
  const REPLY1 = replies[0].envelope.objeto.id
  const scope = `.thread-list[role=feed] article.post:first-child`
  await editFromMenu(scope)
  await check('a reply edits only its text: no title field', async () => {
    assert.deepEqual(await ev(`[...document.querySelectorAll('.ed-form label')].map((l)=>l.textContent)`), ['Texto'])
  })
  await type('.ed-form textarea', 'Da próxima vez levo pilha reserva e uma lanterna de cabeça.')
  await save()
  await waitFor(`!!document.querySelector('${scope} .edited-mark')`)
  await check('the reply shows its new text, the mark, and its history is public at /p/<reply>/edicoes', async () => {
    assert.equal((await relay('GET', `/v1/objetos/${REPLY1}/edicoes`)).json.itens.length, 2)
    assert.equal(await ev(`document.querySelector('${scope} .edited-mark').getAttribute('href')`), `/pt/p/${REPLY1}/edicoes`)
  })

  // ── the forum ──
  await go(`${SITE}/pt/t/${TOPIC}`)
  await waitFor(`!!document.querySelector('section.card .pw-box textarea')`)
  await check('in the topic of another person, a signed-in person gets her reply box (1500 characters), not the rover form', async () => {
    assert.equal(await text('#pw-forum-t'), 'Responder ao tópico')
    assert.equal(await ev(`document.querySelector('section.card .pw-box textarea').maxLength`), 1500)
  })
  const F1 = 'Eu levo uma de cabeça e uma pequena no bolso.'
  await type('section.card .pw-box textarea', F1)
  await sleep(150)
  await click('section.card .pw-box button[type=submit]')
  await waitFor(`!!document.querySelector('section.card .pw-refusal button')`, 45000)
  await check('not in the community yet: the refusal says so and offers "Entrar na comunidade e responder"', async () => {
    assert.equal(await text('section.card .pw-refusal p'), 'Só quem está na comunidade responde aqui.')
    assert.equal(await text('section.card .pw-refusal button'), 'Entrar na comunidade e responder')
  })
  await shots4('07-forum-entrar-e-responder', 'section.card')
  await click('section.card .pw-refusal button')
  await waitFor(`/Você entrou há pouco na comunidade/.test(document.querySelector('section.card .pw-refusal p')?.textContent??'')`, 45000)
  await check('"join and reply" joined the open community; the relay holds a new member 10 minutes, and the screen says when it unblocks', async () => {
    const members = (await relay('GET', `/v1/comunidades/${COMMUNITIES}/membros?limite=50`)).json.itens
    assert.ok(members.some((m) => m.rover.uid === personUid), 'Ana is a member')
    assert.match(await text('section.card .pw-refusal p'), /^Você entrou há pouco na comunidade\. Libera em (10|9) minutos\.$/)
    assert.equal(await ev(`!!document.querySelector('section.card .pw-refusal button')`), false)
    assert.equal(await ev(`document.querySelector('section.card .pw-box textarea').value`), F1, 'what she wrote stays in the box')
  })
  await shots4('08-forum-carencia-com-prazo', 'section.card')
  // ten minutes go by (the test ages her membership in the relay database instead of waiting), and she sends again
  {
    const db = new DatabaseSync(DB)
    db.prepare('UPDATE membros SET desde = desde - 700 WHERE uid = ?').run(personUid)
    db.close()
  }
  await click('section.card .pw-box button[type=submit]')
  await waitFor(`[...document.querySelectorAll('.forum-thread .reply .post-text')].some((e)=>e.textContent.trim()===${JSON.stringify(F1)})`, 45000)
  await breathe()
  let FR
  await check('after the wait the `resposta-forum` goes to the topic and shows in the thread', async () => {
    const items = (await relay('GET', `/v1/topicos/${TOPIC}/respostas`)).json.itens
    assert.deepEqual(items.map((r) => [r.autor.uid, r.envelope.objeto.corpo.texto, r.envelope.objeto.corpo.em]), [[personUid, F1, null]])
    FR = items[0].id
  })
  // edit the forum reply from its action row
  await waitFor(`[...document.querySelectorAll('.reply-actions button')].some((b)=>b.textContent.trim()==='Editar')`)
  await clickText('.reply-actions button', 'Editar')
  await waitFor(`!!document.querySelector('.ed-form textarea')`)
  await type('.ed-form textarea', 'Eu levo uma de cabeça e uma pequena no bolso, com pilha de sobra.')
  await shots4('09-forum-editando-resposta', '.forum-thread')
  await save()
  await waitFor(`!!document.querySelector('.forum-thread .edited-mark')`)
  await shots4('10-forum-resposta-editada', '.forum-thread')
  await check('the forum reply shows its new text with the mark, which leads to /t/<reply>/edicoes; "back" returns to the topic at the reply', async () => {
    assert.equal(await text('.forum-thread .reply .post-text'), 'Eu levo uma de cabeça e uma pequena no bolso, com pilha de sobra.')
    assert.equal(await ev(`document.querySelector('.forum-thread .edited-mark').getAttribute('href')`), `/pt/t/${FR}/edicoes`)
    await click('.forum-thread .edited-mark')
    await waitFor(`location.pathname==='/pt/t/${FR}/edicoes'&&!!document.querySelector('.ed-versions')`)
    assert.equal(await ev(`document.querySelectorAll('.ed-version').length`), 2)
    assert.equal(await ev(`document.querySelector('a.btn[href^="/pt/t/"]').getAttribute('href')`), `/pt/t/${TOPIC}#r-${FR.slice(-12)}`)
  })
  await shots4('11-forum-historico-da-resposta')

  // ── a visitor ──
  await pilot.page.send('Network.clearBrowserCookies')
  await go(`${SITE}/pt/p/${POST}`)
  await waitFor(`!!document.querySelector('.invite-reply')`)
  await check('a visitor reads the edited post with the mark, gets the invitation to sign in and no reply box nor "Editar"', async () => {
    assert.equal(await ev(`!!document.querySelector('.pw-box')`), false)
    assert.equal(await ev(`document.querySelector('.invite-reply a').getAttribute('href')`), '/pt/entrar')
    assert.equal(await text('.invite-reply a'), 'Entrar para responder')
    assert.match(await text('.invite-reply p'), /^Pessoas e rovers respondem aqui\./)
    assert.equal(await ev(`[...document.querySelectorAll('.menu-list button')].some((b)=>b.textContent.trim()==='Editar')`), false)
    assert.equal(await text('article.post .edited-mark'), 'editado')
  })
  await shots4('12-visitante-convite-na-postagem', '.thread-list[role=feed]')
  await go(`${SITE}/pt/p/${POST}/edicoes`)
  await check('the history is public: the visitor opens it too', async () => {
    await waitFor(`document.querySelectorAll('.ed-version').length===6`)
  })
  await go(`${SITE}/pt/t/${TOPIC}`)
  await waitFor(`!!document.querySelector('.invite-reply')`)
  await check('in the topic, the visitor gets the same invitation instead of a form she cannot use', async () => {
    assert.equal(await ev(`document.querySelector('.invite-reply a').getAttribute('href')`), '/pt/entrar')
    assert.equal(await ev(`!!document.querySelector('.pw-box')`), false)
    // one invitation at the end, not a "join first" under every reply
    assert.equal(await ev(`document.querySelectorAll('.reply-notice').length`), 0)
  })
  await shots4('13-visitante-convite-no-forum', '#respostas-t')

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
