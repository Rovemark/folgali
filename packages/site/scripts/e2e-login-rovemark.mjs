// End to end of "Sign in with Rovemark" with the REAL Rovemark API (the Rovemark platform server running locally, temporary database, outside network
// forbidden) and the REAL folgali site (standalone build). Nothing is fake on either side; only the person clicking is a script.
// Usage: npx next build (and copy public and .next/static into the standalone, as scripts/preview.mjs does), then
//   node scripts/e2e-login-rovemark.mjs <root of rovemark-platform with the folgali login branch> .next/standalone
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import http from 'node:http'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const [platform, standalone] = process.argv.slice(2).map((p) => path.resolve(p))
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'folgali-e2e-'))
const freePort = async () => { const s = http.createServer(); s.listen(0, '127.0.0.1'); await once(s, 'listening'); const p = s.address().port; await new Promise((ok) => s.close(ok)); return p }
const [pApi, pSite] = [await freePort(), await freePort()]
const API = `http://127.0.0.1:${pApi}`
const SITE = `http://127.0.0.1:${pSite}`
const RETURN = `${SITE}/api/auth/rovemark/callback`
const BRIDGE = crypto.randomBytes(24).toString('base64url') + 'x'.repeat(8)
const inherited = Object.fromEntries(['PATH', 'TMPDIR', 'LANG'].filter((k) => process.env[k]).map((k) => [k, process.env[k]]))
const envApi = {
  ...inherited, NODE_ENV: 'test', VITEST: '1', RVM_SEM_DOTENV: '1', RVM_LOGIN: '1', RVM_BACKUP: '0', HOST: '127.0.0.1', PORT: String(pApi),
  RVM_CORS_ORIGINS: API, APP_URL: API, RVM_APP_URL: API, RVM_API_PUBLICA: API, RVM_AUTH_RL: '500', RVM_SOCIAL_RL: '500',
  RVM_FOLGALI_VOLTAS: RETURN, RVM_FOLGALI_API: SITE, RVM_FOLGALI_SEGREDO: BRIDGE, TURNSTILE_SECRET: 'segredo-de-teste',
  RVM_STORE_FILE: path.join(tmp, 'store.json'), RVM_DATA_DIR: tmp, RVM_BACKUP_DIR: path.join(tmp, 'backups'), RVM_EMAIL_CAIXA: path.join(tmp, 'caixa'),
  ROVEMARK_COFRE_KEY: crypto.randomBytes(32).toString('base64'), ROVEMARK_COFRE_ARQUIVO: path.join(tmp, 'cofre.key'),
  ...Object.fromEntries(['AGENDAMENTOS', 'ALARMES', 'AUTH', 'CACHE', 'CONNECT', 'CONTRATOS', 'CRM', 'FIN', 'FOTOS', 'HELP', 'MCP_OAUTH', 'PARCEIROS', 'PROPOSTAS', 'REUNIOES'].map((n) => [`RVM_${n}_DB`, path.join(tmp, `${n.toLowerCase()}.sqlite`)])),
  RVM_HANGAR_DB: path.join(tmp, 'hangar.sqlite'), RVM_HANGAR_CADASTRO_DB: path.join(tmp, 'hangar-cadastro.sqlite'), RVM_HANGAR_EVENTOS_DB: path.join(tmp, 'hangar-eventos.sqlite'),
}
const envSite = { ...inherited, NODE_ENV: 'production', PORT: String(pSite), HOSTNAME: '127.0.0.1', FOLGALI_SESSION_SECRET: crypto.randomBytes(32).toString('base64url'), FOLGALI_ROVEMARK_API: API, FOLGALI_ROVEMARK_RETURN: RETURN, RVM_FOLGALI_SECRET: BRIDGE, FOLGALI_DATA_DIR: path.join(tmp, 'folgali') }
const preload = path.join(tmp, 'sem-rede.mjs')
fs.writeFileSync(preload, `const o=globalThis.fetch;globalThis.fetch=async(i,op)=>{const u=new URL(typeof i==='string'||i instanceof URL?i:i.url);if(!['127.0.0.1','localhost'].includes(u.hostname))throw new Error('rede externa proibida: '+u.origin);return o(i,op)}`)

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))
let n = 0
const matches = async (label, fn) => { await fn(); n++; console.log(`  ✓ ${label}`) }
function jar() {
  const j = new Map()
  return {
    j,
    cab: () => (j.size ? { Cookie: [...j].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
    guardar(r) { for (const c of r.headers.getSetCookie()) { const [pair, ...a] = c.split(';'); const i = pair.indexOf('='); const k = pair.slice(0, i).trim(); const v = pair.slice(i + 1).trim(); if (!v || a.some((x) => /max-age=0\b/i.test(x))) j.delete(k); else j.set(k, v) } },
  }
}
const site = jar()
const rvm = jar()
async function go(url, { metodo: method = 'GET', corpo: body, jar, origem: origin } = {}) {
  const r = await fetch(url, { method: method, redirect: 'manual', headers: { ...jar.cab(), ...(origin ? { Origin: origin } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) })
  jar.guardar(r)
  const text = await r.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* html */ }
  return { status: r.status, local: r.headers.get('location'), texto: text, json, cookies: r.headers.getSetCookie() }
}

let api, web
let logApi = '', logWeb = ''
try {
  process.env = { ...envApi }
  const store = await import(pathToFileURL(path.join(platform, 'server/store.mjs')).href)
  const auth = await import(pathToFileURL(path.join(platform, 'server/auth.mjs')).href)
  store.createUser({ name: 'Dono da Casa', email: 'dono@casa.test', role: 'owner', plataforma: true })
  const account = store.criarConta({ nome: 'Casa da Ana', origem: 'saas' })
  const ana = store.createUser({ name: 'Ana Folga', email: 'ana@folga.test', accountId: account.id, accountRole: 'dono' })
  auth.setPassword(ana.id, ana.email, 'SenhaDaAna2026')

  console.log('▶ subindo a API da Rovemark e o site da folgali')
  api = spawn(process.execPath, ['--import', preload, 'server/index.mjs'], { cwd: platform, env: envApi, stdio: ['ignore', 'pipe', 'pipe'] })
  api.stdout.on('data', (c) => (logApi += c)); api.stderr.on('data', (c) => (logApi += c))
  web = spawn(process.execPath, ['--import', preload, 'server.js'], { cwd: standalone, env: envSite, stdio: ['ignore', 'pipe', 'pipe'] })
  web.stdout.on('data', (c) => (logWeb += c)); web.stderr.on('data', (c) => (logWeb += c))
  for (let i = 0; i < 300 && !(/ouvindo em/.test(logApi) && /Ready|started|localhost|127\.0\.0\.1/i.test(logWeb)); i++) await sleep(100)
  await matches('a API e o site sobem', () => { assert.match(logApi, /ouvindo em/); assert.ok(web.exitCode === null, logWeb) })

  const outbound = await go(`${SITE}/api/auth/rovemark/inicio?lang=pt&destino=/pt/inicio`, { jar: site })
  const start = new URL(outbound.local)
  await matches('o site manda para o start da Rovemark com app, volta, desafio e estado, e grava UM cookie essencial', () => {
    assert.equal(outbound.status, 302)
    assert.equal(start.origin + start.pathname, `${API}/api/auth/oauth/rovemark/start`)
    assert.equal(start.searchParams.get('volta'), RETURN)
    assert.equal(outbound.cookies.length, 1)
    assert.match(outbound.cookies[0], /^folgali_sessao=.*HttpOnly/i)
    assert.match(outbound.cookies[0], /Secure/i)
    assert.match(outbound.cookies[0], /SameSite=lax/i)
  })
  const page = await go(start.href, { jar: rvm })
  const request = new URL(page.local).searchParams.get('autorizar')
  await matches('a API real ACEITA o pedido do site (volta registrada, desafio de 43 caracteres) e abre a página de login', () => { assert.equal(page.status, 302, page.texto); assert.ok(request) })
  const login = await go(`${API}/api/auth/login`, { metodo: 'POST', corpo: { email: 'ana@folga.test', senha: 'SenhaDaAna2026' }, jar: rvm, origem: API })
  const end = await go(`${API}/api/auth/oauth/rovemark/complete`, { metodo: 'POST', corpo: { pedido: request }, jar: rvm, origem: API })
  await matches('a pessoa entra na Rovemark e aprova', () => { assert.equal(login.status, 200, login.texto); assert.equal(end.status, 200, end.texto); assert.match(end.json.url, /^http:\/\/127\.0\.0\.1:\d+\/api\/auth\/rovemark\/callback\?/) })

  const back = await go(end.json.url, { jar: site })
  await matches('a volta no site troca o código com a API real e leva ao destino pedido', () => { assert.equal(back.status, 303, back.texto); assert.equal(new URL(back.local, SITE).pathname, '/pt/inicio') })
  const vault = fs.readFileSync(path.join(tmp, 'folgali', 'cofre.json'), 'utf8')
  await matches('o cofre do site tem a sessão da Ana, sem nenhuma ficha em claro', () => { assert.match(vault, /Ana Folga/); assert.doesNotMatch(vault, /rmapp_/) })
  const signIn = await go(`${SITE}/pt/entrar`, { jar: site })
  await matches('a página /pt/entrar mostra "Você entrou como Ana Folga."', () => assert.match(signIn.texto, /Você entrou como .{0,40}Ana Folga/))

  const central = await go(`${API}/api/contas/folgali`, { jar: rvm, origem: API })
  await matches('a Central de Contas pergunta ao site (rota assinada) e recebe a lista do que a Ana ligou', () => {
    assert.equal(central.status, 200, central.texto)
    assert.equal(central.json.ligados.disponivel, true, JSON.stringify(central.json))
    assert.deepEqual(central.json.ligados.itens, [])
    assert.ok(central.json.sessoes.length >= 1)
  })

  const tokens = await go(`${SITE}/api/auth/sair?lang=pt`, { metodo: 'POST', jar: site })
  await matches('sair no site apaga o cookie e a sessão', () => { assert.equal(tokens.status, 303); assert.ok(!site.j.has('folgali_sessao')) })
  const after = await go(`${API}/api/contas/folgali`, { jar: rvm, origem: API })
  await matches('e a Central vê a entrada da folgali encerrada (a família foi revogada)', () => assert.equal(after.json.sessoes.filter((s) => !s.encerrada && !s.revogada).length, 0, JSON.stringify(after.json.sessoes)))
  // again, and now Ana deletes the Rovemark account: Rovemark tells the site, which deletes everything of hers
  const outbound2 = await go(`${SITE}/api/auth/rovemark/inicio?lang=pt`, { jar: site })
  const page2 = await go(outbound2.local, { jar: rvm })
  const end2 = await go(`${API}/api/auth/oauth/rovemark/complete`, { metodo: 'POST', corpo: { pedido: new URL(page2.local).searchParams.get('autorizar') }, jar: rvm, origem: API })
  const back2 = await go(end2.json.url, { jar: site })
  await matches('a Ana entra de novo', () => { assert.equal(back2.status, 303); assert.match(fs.readFileSync(path.join(tmp, 'folgali', 'cofre.json'), 'utf8'), /Ana Folga/) })
  const erase = await go(`${API}/api/conta/apagar`, { metodo: 'POST', corpo: { senha: 'SenhaDaAna2026' }, jar: rvm, origem: API })
  for (let i = 0; i < 50 && /Ana Folga/.test(fs.readFileSync(path.join(tmp, 'folgali', 'cofre.json'), 'utf8')); i++) await sleep(100)
  await matches('apagar a conta na Rovemark chega ao site (rota assinada) e o cofre esquece a Ana', () => {
    assert.ok(erase.status < 300, `${erase.status} ${erase.texto}`)
    assert.doesNotMatch(fs.readFileSync(path.join(tmp, 'folgali', 'cofre.json'), 'utf8'), /Ana Folga|p_/)
  })
  const signIn2 = await go(`${SITE}/pt/entrar`, { jar: site })
  await matches('e o site, com o cookie antigo, já não mostra a Ana dentro', () => assert.doesNotMatch(signIn2.texto, /Você entrou como/))
  console.log(`\n${n} conferências, todas certas.`)
} catch (e) {
  console.error('\nFALHOU:', e.message)
  console.error('--- api ---\n' + logApi.slice(-2500))
  console.error('--- site ---\n' + logWeb.slice(-2500))
  process.exitCode = 1
} finally {
  api?.kill(); web?.kill()
}
