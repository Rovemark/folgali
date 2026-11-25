// Ponta a ponta do "Entrar com a Rovemark" com a API REAL da Rovemark (o servidor da plataforma Rovemark rodando local, banco temporário, rede externa
// proibida) e o site REAL da folgali (build standalone). Nada é falso nos dois lados; só a pessoa clicando é um script.
// Uso: npx next build (e copiar public e .next/static para o standalone, como scripts/preview.mjs faz), depois
//   node scripts/e2e-login-rovemark.mjs <raiz do rovemark-platform com a branch do login da folgali> .next/standalone
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import http from 'node:http'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const [plataforma, standalone] = process.argv.slice(2).map((p) => path.resolve(p))
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'folgali-e2e-'))
const portaLivre = async () => { const s = http.createServer(); s.listen(0, '127.0.0.1'); await once(s, 'listening'); const p = s.address().port; await new Promise((ok) => s.close(ok)); return p }
const [pApi, pSite] = [await portaLivre(), await portaLivre()]
const API = `http://127.0.0.1:${pApi}`
const SITE = `http://127.0.0.1:${pSite}`
const VOLTA = `${SITE}/api/auth/rovemark/callback`
const PONTE = crypto.randomBytes(24).toString('base64url') + 'x'.repeat(8)
const herdado = Object.fromEntries(['PATH', 'TMPDIR', 'LANG'].filter((k) => process.env[k]).map((k) => [k, process.env[k]]))
const envApi = {
  ...herdado, NODE_ENV: 'test', VITEST: '1', RVM_SEM_DOTENV: '1', RVM_LOGIN: '1', RVM_BACKUP: '0', HOST: '127.0.0.1', PORT: String(pApi),
  RVM_CORS_ORIGINS: API, APP_URL: API, RVM_APP_URL: API, RVM_API_PUBLICA: API, RVM_AUTH_RL: '500', RVM_SOCIAL_RL: '500',
  RVM_FOLGALI_VOLTAS: VOLTA, RVM_FOLGALI_API: SITE, RVM_FOLGALI_SEGREDO: PONTE, TURNSTILE_SECRET: 'segredo-de-teste',
  RVM_STORE_FILE: path.join(tmp, 'store.json'), RVM_DATA_DIR: tmp, RVM_BACKUP_DIR: path.join(tmp, 'backups'), RVM_EMAIL_CAIXA: path.join(tmp, 'caixa'),
  ROVEMARK_COFRE_KEY: crypto.randomBytes(32).toString('base64'), ROVEMARK_COFRE_ARQUIVO: path.join(tmp, 'cofre.key'),
  ...Object.fromEntries(['AGENDAMENTOS', 'ALARMES', 'AUTH', 'CACHE', 'CONNECT', 'CONTRATOS', 'CRM', 'FIN', 'FOTOS', 'HELP', 'MCP_OAUTH', 'PARCEIROS', 'PROPOSTAS', 'REUNIOES'].map((n) => [`RVM_${n}_DB`, path.join(tmp, `${n.toLowerCase()}.sqlite`)])),
  RVM_HANGAR_DB: path.join(tmp, 'hangar.sqlite'), RVM_HANGAR_CADASTRO_DB: path.join(tmp, 'hangar-cadastro.sqlite'), RVM_HANGAR_EVENTOS_DB: path.join(tmp, 'hangar-eventos.sqlite'),
}
const envSite = { ...herdado, NODE_ENV: 'production', PORT: String(pSite), HOSTNAME: '127.0.0.1', FOLGALI_SESSAO_SEGREDO: crypto.randomBytes(32).toString('base64url'), FOLGALI_ROVEMARK_API: API, FOLGALI_ROVEMARK_VOLTA: VOLTA, RVM_FOLGALI_SEGREDO: PONTE, FOLGALI_DADOS_DIR: path.join(tmp, 'folgali') }
const preload = path.join(tmp, 'sem-rede.mjs')
fs.writeFileSync(preload, `const o=globalThis.fetch;globalThis.fetch=async(i,op)=>{const u=new URL(typeof i==='string'||i instanceof URL?i:i.url);if(!['127.0.0.1','localhost'].includes(u.hostname))throw new Error('rede externa proibida: '+u.origin);return o(i,op)}`)

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms))
let n = 0
const confere = async (rotulo, fn) => { await fn(); n++; console.log(`  ✓ ${rotulo}`) }
function jarra() {
  const j = new Map()
  return {
    j,
    cab: () => (j.size ? { Cookie: [...j].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
    guardar(r) { for (const c of r.headers.getSetCookie()) { const [par, ...a] = c.split(';'); const i = par.indexOf('='); const k = par.slice(0, i).trim(); const v = par.slice(i + 1).trim(); if (!v || a.some((x) => /max-age=0\b/i.test(x))) j.delete(k); else j.set(k, v) } },
  }
}
const site = jarra()
const rvm = jarra()
async function ir(url, { metodo = 'GET', corpo, jar, origem } = {}) {
  const r = await fetch(url, { method: metodo, redirect: 'manual', headers: { ...jar.cab(), ...(origem ? { Origin: origem } : {}), ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, ...(corpo ? { body: JSON.stringify(corpo) } : {}), signal: AbortSignal.timeout(10000) })
  jar.guardar(r)
  const texto = await r.text()
  let json = null
  try { json = JSON.parse(texto) } catch { /* html */ }
  return { status: r.status, local: r.headers.get('location'), texto, json, cookies: r.headers.getSetCookie() }
}

let api, web
let logApi = '', logWeb = ''
try {
  process.env = { ...envApi }
  const store = await import(pathToFileURL(path.join(plataforma, 'server/store.mjs')).href)
  const auth = await import(pathToFileURL(path.join(plataforma, 'server/auth.mjs')).href)
  store.createUser({ name: 'Dono da Casa', email: 'dono@casa.test', role: 'owner', plataforma: true })
  const conta = store.criarConta({ nome: 'Casa da Ana', origem: 'saas' })
  const ana = store.createUser({ name: 'Ana Folga', email: 'ana@folga.test', contaId: conta.id, contaPapel: 'dono' })
  auth.definirSenha(ana.id, ana.email, 'SenhaDaAna2026')

  console.log('▶ subindo a API da Rovemark e o site da folgali')
  api = spawn(process.execPath, ['--import', preload, 'server/index.mjs'], { cwd: plataforma, env: envApi, stdio: ['ignore', 'pipe', 'pipe'] })
  api.stdout.on('data', (c) => (logApi += c)); api.stderr.on('data', (c) => (logApi += c))
  web = spawn(process.execPath, ['--import', preload, 'server.js'], { cwd: standalone, env: envSite, stdio: ['ignore', 'pipe', 'pipe'] })
  web.stdout.on('data', (c) => (logWeb += c)); web.stderr.on('data', (c) => (logWeb += c))
  for (let i = 0; i < 300 && !(/ouvindo em/.test(logApi) && /Ready|started|localhost|127\.0\.0\.1/i.test(logWeb)); i++) await dormir(100)
  await confere('a API e o site sobem', () => { assert.match(logApi, /ouvindo em/); assert.ok(web.exitCode === null, logWeb) })

  const ida = await ir(`${SITE}/api/auth/rovemark/inicio?lang=pt&destino=/pt/inicio`, { jar: site })
  const start = new URL(ida.local)
  await confere('o site manda para o start da Rovemark com app, volta, desafio e estado, e grava UM cookie essencial', () => {
    assert.equal(ida.status, 302)
    assert.equal(start.origin + start.pathname, `${API}/api/auth/oauth/rovemark/start`)
    assert.equal(start.searchParams.get('volta'), VOLTA)
    assert.equal(ida.cookies.length, 1)
    assert.match(ida.cookies[0], /^folgali_sessao=.*HttpOnly/i)
    assert.match(ida.cookies[0], /Secure/i)
    assert.match(ida.cookies[0], /SameSite=lax/i)
  })
  const pagina = await ir(start.href, { jar: rvm })
  const pedido = new URL(pagina.local).searchParams.get('autorizar')
  await confere('a API real ACEITA o pedido do site (volta registrada, desafio de 43 caracteres) e abre a página de login', () => { assert.equal(pagina.status, 302, pagina.texto); assert.ok(pedido) })
  const login = await ir(`${API}/api/auth/login`, { metodo: 'POST', corpo: { email: 'ana@folga.test', senha: 'SenhaDaAna2026' }, jar: rvm, origem: API })
  const fim = await ir(`${API}/api/auth/oauth/rovemark/complete`, { metodo: 'POST', corpo: { pedido }, jar: rvm, origem: API })
  await confere('a pessoa entra na Rovemark e aprova', () => { assert.equal(login.status, 200, login.texto); assert.equal(fim.status, 200, fim.texto); assert.match(fim.json.url, /^http:\/\/127\.0\.0\.1:\d+\/api\/auth\/rovemark\/callback\?/) })

  const volta = await ir(fim.json.url, { jar: site })
  await confere('a volta no site troca o código com a API real e leva ao destino pedido', () => { assert.equal(volta.status, 303, volta.texto); assert.equal(new URL(volta.local, SITE).pathname, '/pt/inicio') })
  const cofre = fs.readFileSync(path.join(tmp, 'folgali', 'cofre.json'), 'utf8')
  await confere('o cofre do site tem a sessão da Ana, sem nenhuma ficha em claro', () => { assert.match(cofre, /Ana Folga/); assert.doesNotMatch(cofre, /rmapp_/) })
  const entrar = await ir(`${SITE}/pt/entrar`, { jar: site })
  await confere('a página /pt/entrar mostra "Você entrou como Ana Folga."', () => assert.match(entrar.texto, /Você entrou como .{0,40}Ana Folga/))

  const central = await ir(`${API}/api/contas/folgali`, { jar: rvm, origem: API })
  await confere('a Central de Contas pergunta ao site (rota assinada) e recebe a lista do que a Ana ligou', () => {
    assert.equal(central.status, 200, central.texto)
    assert.equal(central.json.ligados.disponivel, true, JSON.stringify(central.json))
    assert.deepEqual(central.json.ligados.itens, [])
    assert.ok(central.json.sessoes.length >= 1)
  })

  const fichas = await ir(`${SITE}/api/auth/sair?lang=pt`, { metodo: 'POST', jar: site })
  await confere('sair no site apaga o cookie e a sessão', () => { assert.equal(fichas.status, 303); assert.ok(!site.j.has('folgali_sessao')) })
  const depois = await ir(`${API}/api/contas/folgali`, { jar: rvm, origem: API })
  await confere('e a Central vê a entrada da folgali encerrada (a família foi revogada)', () => assert.equal(depois.json.sessoes.filter((s) => !s.encerrada && !s.revogada).length, 0, JSON.stringify(depois.json.sessoes)))
  // de novo, e agora a Ana apaga a conta Rovemark: a Rovemark avisa o site, que apaga tudo dela
  const ida2 = await ir(`${SITE}/api/auth/rovemark/inicio?lang=pt`, { jar: site })
  const pag2 = await ir(ida2.local, { jar: rvm })
  const fim2 = await ir(`${API}/api/auth/oauth/rovemark/complete`, { metodo: 'POST', corpo: { pedido: new URL(pag2.local).searchParams.get('autorizar') }, jar: rvm, origem: API })
  const volta2 = await ir(fim2.json.url, { jar: site })
  await confere('a Ana entra de novo', () => { assert.equal(volta2.status, 303); assert.match(fs.readFileSync(path.join(tmp, 'folgali', 'cofre.json'), 'utf8'), /Ana Folga/) })
  const apagar = await ir(`${API}/api/conta/apagar`, { metodo: 'POST', corpo: { senha: 'SenhaDaAna2026' }, jar: rvm, origem: API })
  for (let i = 0; i < 50 && /Ana Folga/.test(fs.readFileSync(path.join(tmp, 'folgali', 'cofre.json'), 'utf8')); i++) await dormir(100)
  await confere('apagar a conta na Rovemark chega ao site (rota assinada) e o cofre esquece a Ana', () => {
    assert.ok(apagar.status < 300, `${apagar.status} ${apagar.texto}`)
    assert.doesNotMatch(fs.readFileSync(path.join(tmp, 'folgali', 'cofre.json'), 'utf8'), /Ana Folga|p_/)
  })
  const entrar2 = await ir(`${SITE}/pt/entrar`, { jar: site })
  await confere('e o site, com o cookie antigo, já não mostra a Ana dentro', () => assert.doesNotMatch(entrar2.texto, /Você entrou como/))
  console.log(`\n${n} conferências, todas certas.`)
} catch (e) {
  console.error('\nFALHOU:', e.message)
  console.error('--- api ---\n' + logApi.slice(-2500))
  console.error('--- site ---\n' + logWeb.slice(-2500))
  process.exitCode = 1
} finally {
  api?.kill(); web?.kill()
}
