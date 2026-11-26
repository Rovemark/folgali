#!/usr/bin/env node
// Visual proof of the media front (revision 0.5.0): post with one and with two images, profile with an image portrait and the approval screen with
// the exact image and the alt text, on phone and computer, in Portuguese and in Arabic. Opens the local site in a window
// of Logica Pilot. The photos go to docs/fotos/midia-*.jpg. After running, OPEN EACH ONE (the script judges nothing).
//
// Usage: node scripts/proof-media.mjs [--base http://localhost:3911] [--idiomas pt,ar] [--vp mobile,desktop] [--temas claro]

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
const LANGUAGES = arg('idiomas', 'pt,ar').split(',')
const VPS = arg('vp', 'mobile,desktop').split(',')
const THEMES = arg('temas', 'claro').split(',')
const ONLY = arg('so', '').split(',').filter(Boolean)
const VIEWPORTS = { mobile: { width: 390, height: 844, dpr: 2 }, desktop: { width: 1440, height: 900, dpr: 1 } }
const id = (label) => `ob_${('DEMO' + label).padEnd(43, '0')}`

const SCREENS = [
  { nome: 'postagem-uma', rota: `/p/${id('p02')}`, alvo: '.gallery' },
  { nome: 'postagem-duas', rota: `/p/${id('p04')}`, alvo: '.gallery' },
  { nome: 'perfil-retrato', rota: '/r/pipa', alvo: '.pf-portrait-image' },
  // the queue opens on the most recent draft; the post with an image is chosen by tapping the tabs until the image block appears
]

// scrolls to the target (the image is lazy) and waits for all the network images to really load
const show = (sel) => `(async()=>{const e=document.querySelector(${JSON.stringify(sel)});if(e){e.scrollIntoView({block:'center'});}const t0=Date.now();while(Date.now()-t0<8000){const imgs=[...document.querySelectorAll('img[src^="/midia/"]')];if(imgs.length&&imgs.every(i=>i.complete&&i.naturalWidth>0))break;await new Promise(r=>setTimeout(r,150))}await new Promise(r=>setTimeout(r,500));return [...document.querySelectorAll('img[src^="/midia/"]')].map(i=>i.naturalWidth+'x'+i.naturalHeight+':'+(i.complete?'ok':'falta')).join(',')})()`

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
        for (const lang of LANGUAGES) {
          for (const t of SCREENS) {
            if (ONLY.length && !ONLY.includes(t.nome)) continue
            await pilot.goto(`${BASE}/${lang}${t.rota}`)
            await pilot.page.eval(`localStorage.setItem('rn-tema','${theme}');document.documentElement.dataset.tema='${theme}'`)
            await new Promise((r) => setTimeout(r, 1200))
            if (t.antes) await pilot.page.eval(t.antes)
            const loaded = await pilot.page.eval(show(t.alvo))
            const file = join(output, `midia-${t.nome}-${lang}-${vpName}-${theme}.jpg`)
            const b64 = (await pilot.page.send('Page.captureScreenshot', { format: 'jpeg', quality: 80, fromSurface: true })).data
            await writeFile(file, Buffer.from(b64, 'base64'))
            done.push(file)
            console.log('foto', file, 'imagens:', loaded)
          }
        }
      } finally {
        try { await pilot.close() } catch { /* window already closed */ }
      }
    }
  }
  console.log(`\n${done.length} fotos em ${output}. ABRA CADA UMA (Read) antes de dizer que está pronto.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
