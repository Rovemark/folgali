#!/usr/bin/env node
// Visual proof per language: opens the key pages of each language in a Logica Pilot window and saves a photo of the WHOLE page
// (computer) and of the window (phone). It is for spotting wrong writing, cut text, Arabic mirroring and a missing font in Chinese,
// Japanese and Korean. The script judges nothing: open each photo (Read).
//
// Usage: node scripts/proof-languages.mjs --idiomas es,ar --saida <folder> [--base http://127.0.0.1:3991] [--rotas "",/entrar,/ajuda] [--tema claro]
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

import { join } from 'node:path'
import { pilotPath } from './pilot-path.mjs'

const require = createRequire(import.meta.url)
const PILOT = pilotPath()
const arg = (n, p) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : p }
const BASE = arg('base', 'http://127.0.0.1:3991')
const LANGUAGES = arg('idiomas', 'es').split(',')
const OUTPUT = arg('saida')
const THEME = arg('tema', 'claro')
const ROUTES = arg('rotas', ',/entrar,/ajuda,/glossario,/sobre').split(',')
if (!OUTPUT) { console.error('falta --saida <pasta>'); process.exit(2) }
await mkdir(OUTPUT, { recursive: true })

const routeName = (r) => (r === '' ? 'inicio' : r.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, ''))
const scrollAll = (pilot) => pilot.page.eval(`new Promise((res)=>{const raiz=document.documentElement;const antes=raiz.style.scrollBehavior;raiz.style.scrollBehavior='auto';const h=raiz.scrollHeight;let y=0;const t=setInterval(()=>{y+=500;window.scrollTo(0,y);if(y>h+500){clearInterval(t);setTimeout(()=>{window.scrollTo(0,0);raiz.style.scrollBehavior=antes;setTimeout(res,500)},300)}},60)})`)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const { LogicaPilot } = require(PILOT)
for (const [vpName, vp] of Object.entries({ desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } })) {
  const pilot = await new LogicaPilot({ headless: true, width: vp.width, height: vp.height }).launch()
  try {
    await pilot.page.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: vpName === 'mobile' ? 2 : 1, mobile: false })
    await pilot.page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: THEME === 'escuro' ? 'dark' : 'light' }] })
    for (const lang of LANGUAGES) {
      for (const route of ROUTES) {
        await pilot.goto(`${BASE}/${lang}${route}`)
        await pilot.page.eval(`localStorage.setItem('rn-tema','${THEME}');document.documentElement.dataset.tema='${THEME}'`)
        await wait(900)
        const file = join(OUTPUT, `${lang}-${routeName(route)}-${vpName}.jpg`)
        if (vpName === 'desktop') {
          await pilot.page.eval(`(()=>{const e=document.createElement('style');e.id='rn-captura';e.textContent='.tabs,.top{position:static!important}.trilho,.side{position:static!important;height:auto!important}';document.head.appendChild(e)})()`)
          await scrollAll(pilot)
          const b64 = await pilot.actions.screenshot({ format: 'jpeg', quality: 70, fullPage: true })
          await writeFile(file, Buffer.from(typeof b64 === 'string' ? b64 : b64.data ?? b64, typeof b64 === 'string' ? 'base64' : undefined))
          await pilot.page.eval(`document.getElementById('rn-captura')?.remove()`)
        } else {
          const { data } = await pilot.page.send('Page.captureScreenshot', { format: 'jpeg', quality: 70, fromSurface: true })
          await writeFile(file, Buffer.from(data, 'base64'))
        }
        console.log('foto', file)
      }
    }
  } finally {
    try { await pilot.close() } catch { /* window already closed */ }
  }
}
