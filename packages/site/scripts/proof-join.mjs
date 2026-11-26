#!/usr/bin/env node
// Visual proof of the join pages (/entrar, /entrar/pessoa, /entrar/agente): opens the local site in a Logica Pilot WINDOW (never the whole
// screen of the Mac) and saves JPEG photos, on phone and computer, in the light and dark themes, in pt and en. The photos stay in docs/fotos-entrar/,
// OUTSIDE git. After running, open each one (the script judges nothing).
//
// The waitlist only shows as "on" with FOLGALI_WAITLIST_URL on the site server. So there are two passes:
//   node scripts/proof-join.mjs --passe desligada                      (server WITHOUT the variable)
//   node scripts/proof-join.mjs --passe ligada --stub 3977             (server with FOLGALI_WAITLIST_URL=http://127.0.0.1:3977/v1/waitlist)
// The `--stub` starts a fake server that answers 202 (or 500 / 429 for the e-mails falha@ and limite@) and records only @example.com e-mails.
//
// Usage: node scripts/proof-join.mjs [--base http://127.0.0.1:3975] [--passe desligada|ligada] [--so nome,nome] [--temas claro,escuro] [--vp mobile,desktop] [--lang pt,en]

import { createServer } from 'node:http'
import { appendFileSync, writeFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clickSel, type, scrollTo, seq } from './proof-lib.mjs'
import { pilotPath } from './pilot-path.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const output = resolve(here, '../docs/fotos-entrar')
const require = createRequire(import.meta.url)
const PILOT = pilotPath()
const arg = (name, defaultValue) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : defaultValue
}
const BASE = arg('base', 'http://localhost:3975')
const PASSE = arg('passe', 'desligada')
const ONLY = arg('so', '')?.split(',').filter(Boolean)
const THEMES = arg('temas', 'claro,escuro').split(',')
const VPS = arg('vp', 'mobile,desktop').split(',')
const LANGS = arg('lang', 'pt,en').split(',')
const STUB = arg('stub', '')
const VIEWPORTS = { mobile: { width: 390, height: 844, dpr: 2 }, desktop: { width: 1440, height: 900, dpr: 1 } }

// ---- fake server of the list (only for the photo of the "sent" and error states) ----
if (STUB) {
  const record = join('/tmp', 'entrar-stub.log')
  writeFileSync(record, '')
  createServer((req, res) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, OPTIONS' }
    if (req.method === 'OPTIONS') return res.writeHead(204, cors).end()
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      let j = {}
      try { j = JSON.parse(body) } catch { /* corpo torto */ }
      const email = String(j.email ?? '')
      if (email.endsWith('@example.com')) appendFileSync(record, `${req.method} ${req.url} ${email} tipo=${j.tipo} consentimento=${j.consentimento}\n`)
      const status = email.startsWith('falha@') ? 500 : email.startsWith('limite@') ? 429 : 202
      res.writeHead(status, { ...cors, 'content-type': 'application/json' }).end(JSON.stringify(status === 202 ? { ok: true } : { erro: { codigo: 'x' } }))
    })
  }).listen(Number(STUB), '127.0.0.1', () => console.log(`stub da lista em http://127.0.0.1:${STUB} (anota em ${record})`))
}

const set = (sel, value) => `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return;const p=Object.getPrototypeOf(e);const set=Object.getOwnPropertyDescriptor(p,'value').set;set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('change',{bubbles:true}))})()`
const NAME = '.e-passos .e-campo:nth-child(1) input'
const HANDLE = '.e-passos .e-campo:nth-child(2) input'
const fillList = (email) => seq(type('.e-lista input[type=email]', email), clickSel('.e-lista input[name=consentimento]'))

// each screen: name, route, what to do before the photo, whether it is the whole page, the pass and what to show scrolled
const SCREENS = [
  { nome: 'entrar', rota: '/entrar', completa: true, passe: 'desligada' },
  { nome: 'pessoa', rota: '/entrar/pessoa', completa: true, passe: 'desligada' },
  { nome: 'pessoa-preenchida', rota: '/entrar/pessoa', passe: 'desligada', antes: seq(type(NAME, 'Pipa'), type(HANDLE, 'pipa.viagens'), clickSel('.e-cor input[value=coral]'), set('.e-forma select', 'gota'), scrollTo('.e-ficha')) },
  { nome: 'pessoa-handle-curto', rota: '/entrar/pessoa', passe: 'desligada', antes: seq(type(NAME, 'Ana'), type(HANDLE, 'ab'), scrollTo('.e-ficha')) },
  { nome: 'pessoa-handle-invalido', rota: '/entrar/pessoa', passe: 'desligada', antes: seq(type(HANDLE, 'Pipá Viagens'), scrollTo('.e-ficha')) },
  { nome: 'pessoa-handle-ok', rota: '/entrar/pessoa', passe: 'desligada', antes: seq(type(NAME, 'Max'), type(HANDLE, '@max.piloto'), clickSel('.e-cor input[value=manga]'), scrollTo('.e-ficha')) },
  { nome: 'pessoa-lista-desligada', rota: '/entrar/pessoa', passe: 'desligada', antes: scrollTo('.e-lista') },
  { nome: 'agente', rota: '/entrar/agente', completa: true, passe: 'desligada' },
  { nome: 'agente-lista-desligada', rota: '/entrar/agente', passe: 'desligada', antes: scrollTo('.e-lista') },
  { nome: 'pessoa-lista-aberta', rota: '/entrar/pessoa', passe: 'ligada', antes: scrollTo('.e-lista') },
  { nome: 'pessoa-lista-erros', rota: '/entrar/pessoa', passe: 'ligada', antes: seq(clickSel('.e-lista .e-botao'), scrollTo('.e-lista')) },
  { nome: 'pessoa-lista-enviado', rota: '/entrar/pessoa', passe: 'ligada', antes: seq(fillList('ana@example.com'), clickSel('.e-lista .e-botao'), scrollTo('.e-lista')) },
  { nome: 'pessoa-lista-falha', rota: '/entrar/pessoa', passe: 'ligada', antes: seq(fillList('falha@example.com'), clickSel('.e-lista .e-botao'), scrollTo('.e-lista')) },
  { nome: 'pessoa-lista-limite', rota: '/entrar/pessoa', passe: 'ligada', antes: seq(fillList('limite@example.com'), clickSel('.e-lista .e-botao'), scrollTo('.e-lista')) },
  { nome: 'agente-lista-aberta', rota: '/entrar/agente', passe: 'ligada', antes: scrollTo('.e-lista') },
  { nome: 'agente-lista-erros', rota: '/entrar/agente', passe: 'ligada', antes: seq(clickSel('.e-lista .e-botao'), scrollTo('.e-lista')) },
  { nome: 'agente-lista-enviado', rota: '/entrar/agente', passe: 'ligada', antes: seq(type('.e-lista input[name=agente]', 'Resumidor de convites'), type('.e-lista textarea', 'Lê os convites da semana e propõe respostas curtas.'), fillList('dev@example.com'), clickSel('.e-lista .e-botao'), scrollTo('.e-lista')) },
]

async function waitForRovers(pilot) {
  await pilot.page.eval(`new Promise((res)=>{const t0=Date.now();const ok=()=>[...document.querySelectorAll('.rover')].every(r=>r.dataset.pronto==='1');(function v(){if(ok()||Date.now()-t0>9000)res(1);else setTimeout(v,150)})()})`)
}
async function scrollAll(pilot) {
  await pilot.page.eval(`new Promise((res)=>{const raiz=document.documentElement;const antes=raiz.style.scrollBehavior;raiz.style.scrollBehavior='auto';const h=raiz.scrollHeight;let y=0;const p=()=>{y+=500;window.scrollTo(0,y);if(y<h)setTimeout(p,120);else{window.scrollTo(0,0);raiz.style.scrollBehavior=antes;setTimeout(res,300)}};p()})`)
}
async function photo(pilot, path, full) {
  if (full) {
    await scrollAll(pilot)
    await new Promise((r) => setTimeout(r, 800))
  }
  const b64 = full
    ? await pilot.actions.screenshot({ format: 'jpeg', quality: 82, fullPage: true })
    : (await pilot.page.send('Page.captureScreenshot', { format: 'jpeg', quality: 82, fromSurface: true })).data
  await writeFile(path, Buffer.from(b64, 'base64'))
}

async function main() {
  await mkdir(output, { recursive: true })
  const { LogicaPilot } = require(PILOT)
  const done = []
  for (const vpName of VPS) {
    const vp = VIEWPORTS[vpName]
    for (const theme of THEMES) {
      const pilot = await new LogicaPilot({ headless: true, width: vp.width, height: vp.height }).launch()
      try {
        await pilot.page.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr, mobile: false })
        await pilot.page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme === 'escuro' ? 'dark' : 'light' }] })
        for (const lang of LANGS) {
          for (const t of SCREENS) {
            if (t.passe !== PASSE) continue
            if (ONLY?.length && !ONLY.includes(t.nome)) continue
            await pilot.goto(`${BASE}/${lang}${t.rota}`)
            await pilot.page.eval(`localStorage.setItem('rn-tema','${theme}');document.documentElement.dataset.tema='${theme}'`)
            await new Promise((r) => setTimeout(r, 900))
            await waitForRovers(pilot)
            if (t.antes) {
              await pilot.page.eval(t.antes)
              await new Promise((r) => setTimeout(r, 900))
              await waitForRovers(pilot)
            }
            const file = join(output, `${t.nome}-${lang}-${vpName}-${theme}.jpg`)
            await photo(pilot, file, false)
            done.push(file)
            console.log('foto', file)
            if (t.completa && vpName === 'desktop') {
              const comp = join(output, `${t.nome}-completa-${lang}-${vpName}-${theme}.jpg`)
              await photo(pilot, comp, true)
              done.push(comp)
              console.log('foto', comp)
            }
          }
        }
      } finally {
        try { await pilot.close() } catch { /* window already closed */ }
      }
    }
  }
  console.log(`\n${done.length} fotos em ${output}. ABRA CADA UMA (Read) antes de dizer que está pronto.`)
  if (!STUB) process.exit(0)
  console.log('stub ainda de pé: encerre este processo (Ctrl+C) quando terminar')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
