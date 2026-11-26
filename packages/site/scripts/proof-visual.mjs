#!/usr/bin/env node
// Visual proof: opens the local site in a Logica Pilot WINDOW (never the whole screen of the Mac) and saves
// one photo per screen, on phone and computer, in the light and dark themes. The photos go to docs/fotos
// as JPEG. After running, open each one (the script judges nothing).
//
// Usage: node scripts/proof-visual.mjs [--base http://localhost:3911] [--so linha,perfil] [--temas claro,escuro] [--vp mobile,desktop]
//
// Needs the Logica Pilot of the main LogicaOS repository. The path comes from LOGICA_PILOT
// (default: the path on Rovemark's Mac).

import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pilotPath } from './pilot-path.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const output = resolve(here, '../docs/fotos')
const require = createRequire(import.meta.url)
const PILOT = pilotPath()

const arg = (name, defaultValue) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : defaultValue
}
const BASE = arg('base', 'http://localhost:3911')
const ONLY = arg('so', '')?.split(',').filter(Boolean)
const THEMES = arg('temas', 'claro,escuro').split(',')
const VPS = arg('vp', 'mobile,desktop').split(',')

const VIEWPORTS = {
  mobile: { width: 390, height: 844, dpr: 2 },
  desktop: { width: 1440, height: 900, dpr: 1 },
}

const id = (label, n = 43) => `ob_${('DEMO' + label).padEnd(n, '0').slice(0, n)}`

// each screen: route, what to do before the photo and whether the photo is of the whole page
const SCREENS = [
  { nome: 'linha', rota: '/pt', fim: true, completa: true },
  { nome: 'linha-en', rota: '/en' },
  { nome: 'perfil', rota: '/pt/r/pipa', fim: true, completa: true },
  { nome: 'perfil-teco', rota: '/pt/r/teco', so: ['mobile'] },
  { nome: 'postagem', rota: `/pt/p/${id('p02')}`, fim: true },
  { nome: 'descobrir', rota: '/pt/descobrir' },
  { nome: 'busca-resultado', rota: '/pt/buscar?q=pi' },
  { nome: 'busca-vazia', rota: '/pt/buscar?q=zzzz' },
  { nome: 'denuncia', rota: `/pt/denunciar/${id('p05')}`, fim: true },
  { nome: 'denuncia-enviada', rota: `/pt/denunciar/${id('p05')}`, antes: sendReport() },
  { nome: 'vazio-perfil', rota: '/pt/r/didi', antes: repliesTab(), fim: true },
  { nome: 'erro-rele', rota: '/pt/r/fora_do_ar' },
  { nome: 'nao-encontrado', rota: '/pt/r/nao_existe_mesmo' },
  { nome: 'sobre', rota: '/pt/sobre' },
]

function js(code) {
  return code
}
function repliesTab() {
  return js(`(async()=>{const a=[...document.querySelectorAll('a')].find(x=>x.textContent.trim()==='Respostas'&&x.closest('.page-tabs'));if(a){a.click();await new Promise(r=>setTimeout(r,1500))}})()`)
}
function sendReport() {
  return js(`(async()=>{const r=document.querySelector('input[name=motivo][value=spam]');if(r){r.click()}await new Promise(r=>setTimeout(r,200));const f=document.querySelector('form');f.requestSubmit();await new Promise(r=>setTimeout(r,1500))})()`)
}

async function waitForPortraits(pilot) {
  await pilot.page.eval(`new Promise((res)=>{const t0=Date.now();const ok=()=>[...document.querySelectorAll('.portrait')].every(r=>r.dataset.pronto==='1')&&[...document.querySelectorAll('.rover')].every(r=>r.dataset.pronto==='1');const t=setInterval(()=>{if(ok()||Date.now()-t0>9000){clearInterval(t);setTimeout(res,400)}},120)})`)
}

async function scrollAll(pilot) {
  await pilot.page.eval(`new Promise((res)=>{const raiz=document.documentElement;const antes=raiz.style.scrollBehavior;raiz.style.scrollBehavior='auto';const h=raiz.scrollHeight;let y=0;const t=setInterval(()=>{y+=500;window.scrollTo(0,y);if(y>h+500){clearInterval(t);setTimeout(()=>{window.scrollTo(0,0);raiz.style.scrollBehavior=antes;setTimeout(res,700)},300)}},60)})`)
}

async function photo(pilot, path, full) {
  if (full) {
    // in the whole-page photo the tab bar and the fixed top would show up in the middle: they are released only during the capture
    await pilot.page.eval(`(()=>{const e=document.createElement('style');e.id='rn-captura';e.textContent='.tabs,.top{position:static!important}.trilho,.side{position:static!important;height:auto!important}';document.head.appendChild(e)})()`)
    await scrollAll(pilot)
    await new Promise((r) => setTimeout(r, 1500))
  }
  // window (viewport) through CDP directly: what the person sees, at the scroll position they are at. Whole page through Pilot.
  const b64 = full
    ? await pilot.actions.screenshot({ format: 'jpeg', quality: 80, fullPage: true })
    : (await pilot.page.send('Page.captureScreenshot', { format: 'jpeg', quality: 80, fromSurface: true })).data
  await writeFile(path, Buffer.from(b64, 'base64'))
  if (full) await pilot.page.eval(`document.getElementById('rn-captura')?.remove()`)
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
        for (const t of SCREENS) {
          if (ONLY?.length && !ONLY.includes(t.nome)) continue
          if (t.so && !t.so.includes(vpName)) continue
          await pilot.goto(`${BASE}${t.rota}`)
          await pilot.page.eval(`localStorage.setItem('rn-tema','${theme}');document.documentElement.dataset.tema='${theme}'`)
          await new Promise((r) => setTimeout(r, 900))
          await waitForPortraits(pilot)
          if (t.antes) {
            await pilot.page.eval(t.antes)
            await waitForPortraits(pilot)
          }
          const file = join(output, `${t.nome}-${vpName}-${theme}.jpg`)
          await photo(pilot, file, false)
          done.push(file)
          console.log('foto', file)
          if (t.fim) {
            // the window scrolled to the end of the page: where the decision buttons and the footer are
            await pilot.page.eval(`window.scrollTo(0, document.documentElement.scrollHeight)`)
            await new Promise((r) => setTimeout(r, 500))
            const end = join(output, `${t.nome}-fim-${vpName}-${theme}.jpg`)
            await photo(pilot, end, false)
            done.push(end)
            console.log('foto', end)
            await pilot.page.eval(`window.scrollTo(0, 0)`)
          }
          if (t.completa && vpName === 'desktop') {
            const comp = join(output, `${t.nome}-completa-${vpName}-${theme}.jpg`)
            await photo(pilot, comp, true)
            done.push(comp)
            console.log('foto', comp)
          }
        }
      } finally {
        try {
          await pilot.close()
        } catch {
          /* window already closed */
        }
      }
    }
  }
  console.log(`\n${done.length} fotos em ${output}. ABRA CADA UMA (Read) antes de dizer que está pronto.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
