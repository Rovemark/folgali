#!/usr/bin/env node
// Responsive check: opens each page at each width (and theme) in a Logica Pilot window, takes a photo of what a person sees, and
// FAILS (exit 1) when the page scrolls sideways or when the profile header has overlapping pieces (title, badges, @, intro,
// counters, buttons, portrait). Read every photo afterwards: the check measures boxes, it does not judge the design.
//
// Usage: node scripts/proof-responsive.mjs --base http://localhost:3911 --rotas /pt/r/pipa,/pt/linha --saida <dir>
//        [--larguras 1440,1280,1220,1024,900,768,600,390,360] [--temas claro,escuro] [--sem-fotos]
// Needs the Logica Pilot browser engine: set LOGICA_PILOT to its entry file (index.js).
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

import { join } from 'node:path'
import { pilotPath } from './pilot-path.mjs'

const require = createRequire(import.meta.url)
const PILOT = pilotPath()
const arg = (name, defaultValue) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : defaultValue
}
const BASE = arg('base', 'http://localhost:3911')
const ROUTES = arg('rotas', '/pt/r/pipa').split(',').filter(Boolean)
const WIDTHS = arg('larguras', '1440,1280,1220,1024,900,768,600,390,360').split(',').map(Number)
const THEMES = arg('temas', 'claro').split(',')
const OUTPUT = arg('saida', join(process.cwd(), 'prova-responsiva'))
const PHOTOS = !process.argv.includes('--sem-fotos')
const HEIGHT = Number(arg('altura', '900'))

// Runs in the page: what scrolls sideways and which pieces of the profile header overlap.
const MEASURE = `(() => {
  const raiz = document.documentElement
  const largo = raiz.scrollWidth - raiz.clientWidth
  const culpados = largo > 1 ? [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > raiz.clientWidth + 1) && getComputedStyle(e).position !== 'fixed' }).slice(0, 5).map((e) => (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : e.tagName.toLowerCase())) : []
  const cab = document.querySelector('.pf-identity')
  const sobre = []
  if (cab) {
    const pecas = [...cab.querySelectorAll('.pf-avatar, .pf-title, .spec-name > *:not(h1), .post-handle, .spec-intro, .pf-num, .pf-actions > *, .pf-relationship-row > *, .pf-join > *')]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
    const caixa = (e) => e.getBoundingClientRect()
    for (let i = 0; i < pecas.length; i++) for (let j = i + 1; j < pecas.length; j++) {
      const a = pecas[i], b = pecas[j]
      if (a.contains(b) || b.contains(a)) continue
      const x = box(a), y = box(b)
      const dx = Math.min(x.right, y.right) - Math.max(x.left, y.left)
      const dy = Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top)
      if (dx > 2 && dy > 2) sobre.push(((a.className || a.tagName) + ' x ' + (b.className || b.tagName)).slice(0, 120))
    }
    const t = cab.querySelector('.pf-title')
    if (t && t.scrollWidth > t.clientWidth + 1 && getComputedStyle(t).textOverflow !== 'ellipsis') sobre.push('pf-titulo cortado sem reticências')
    for (const n of cab.querySelectorAll('.pf-num')) if (n.getClientRects().length > 1) sobre.push('contador quebrado: ' + n.textContent.trim())
  }
  return JSON.stringify({ largo, culpados, sobre })
})()`

async function main() {
  await mkdir(OUTPUT, { recursive: true })
  const { LogicaPilot } = require(PILOT)
  const failures = []
  let photos = 0
  for (const theme of THEMES) {
    for (const w of WIDTHS) {
      const pilot = await new LogicaPilot({ headless: true, width: w, height: HEIGHT }).launch()
      try {
        const mobile = w < 700
        await pilot.page.send('Emulation.setDeviceMetricsOverride', { width: w, height: HEIGHT, deviceScaleFactor: mobile ? 2 : 1, mobile: false })
        await pilot.page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme === 'escuro' ? 'dark' : 'light' }] })
        for (const route of ROUTES) {
          await pilot.goto(`${BASE}${route}`)
          await pilot.page.eval(`localStorage.setItem('rn-tema','${theme}');document.documentElement.dataset.tema='${theme}'`)
          await pilot.page.eval(`new Promise((res)=>{const t0=Date.now();const t=setInterval(()=>{const ok=[...document.querySelectorAll('.portrait')].every(r=>r.dataset.pronto==='1')&&!document.querySelector('.pf-relationship-waiting');if(ok||Date.now()-t0>8000){clearInterval(t);setTimeout(res,500)}},150)})`)
          const m = JSON.parse(await pilot.page.eval(MEASURE))
          const name = `${route.replace(/[^a-z0-9@]+/gi, '_').replace(/^_|_$/g, '') || 'raiz'}-${w}-${theme}`
          if (m.overflow > 1) failures.push(`${name}: rolagem lateral de ${m.overflow}px (${m.culprits.join(', ')})`)
          for (const s of m.sobre) failures.push(`${name}: ${s}`)
          if (PHOTOS) {
            const b64 = (await pilot.page.send('Page.captureScreenshot', { format: 'jpeg', quality: 78, fromSurface: true })).data
            await writeFile(join(OUTPUT, `${name}.jpg`), Buffer.from(b64, 'base64'))
            photos++
          }
        }
      } finally {
        try { await pilot.close() } catch { /* already closed */ }
      }
    }
  }
  console.log(`${photos} fotos em ${OUTPUT}`)
  if (failures.length) {
    console.error(`\n${failures.length} problema(s):\n- ${failures.join('\n- ')}`)
    process.exit(1)
  }
  console.log('sem rolagem lateral e sem sobreposição no cabeçalho do perfil')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
