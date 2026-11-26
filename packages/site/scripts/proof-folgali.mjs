#!/usr/bin/env node
// Visual proof of folgali: opens the local site in a Logica Pilot WINDOW and saves one photo per screen at 390, 768 and 1440 px,
// light and dark, OUTSIDE git (default <system temp>/folgali-proofs/site-<YYYYMMDD-HHMM>). Whole page with --completa.
// Usage: node scripts/proof-folgali.mjs [--telas folgali|final|real] [--cookie nome=valor] [--base http://127.0.0.1:3941] [--so feed,perfil] [--vp mobile,tablet,desktop] [--temas claro,escuro] [--completa] [--saida folder]
// After running, OPEN EACH PHOTO (Read): the script judges nothing.
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { pilotPath } from './pilot-path.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const PILOT = pilotPath()
const arg = (name, defaultValue) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : defaultValue
}
const now = new Date()
const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
const OUTPUT = arg('saida', join(tmpdir(), 'folgali-proofs', `site-${stamp}`))
const BASE = arg('base', 'http://127.0.0.1:3941')
const ONLY = arg('so', '')?.split(',').filter(Boolean)
const THEMES = arg('temas', 'claro,escuro').split(',')
const VPS = arg('vp', 'mobile,tablet,desktop').split(',')
const COMPLETE = process.argv.includes('--completa')
const VIEWPORTS = { mobile: { width: 390, height: 844, dpr: 2 }, tablet: { width: 768, height: 1024, dpr: 1 }, desktop: { width: 1440, height: 900, dpr: 1 } }

const wait = (pilot) => pilot.page.eval(`new Promise((res)=>{const t0=Date.now();const ok=()=>[...document.querySelectorAll('.portrait')].every(r=>r.dataset.pronto==='1')&&[...document.querySelectorAll('img')].every(i=>i.complete);const t=setInterval(()=>{if(ok()||Date.now()-t0>10000){clearInterval(t);setTimeout(res,400)}},150)})`)
const scrollAll = (pilot) => pilot.page.eval(`new Promise((res)=>{const r=document.documentElement;r.style.scrollBehavior='auto';const h=r.scrollHeight;let y=0;const t=setInterval(()=>{y+=500;window.scrollTo(0,y);if(y>h+500){clearInterval(t);setTimeout(()=>{window.scrollTo(0,0);setTimeout(res,700)},300)}},60)})`)

async function photo(pilot, path, full) {
  if (full) {
    await pilot.page.eval(`(()=>{const e=document.createElement('style');e.id='rn-captura';e.textContent='.tabs,.top,.pub-top{position:static!important}.trilho,.side,.mr-side,.pf-left,.ev-filters,.post-open-photo,.claim-photo{position:static!important}';document.head.appendChild(e)})()`)
    await scrollAll(pilot)
    await wait(pilot)
    await new Promise((r) => setTimeout(r, 1200))
  }
  const b64 = full ? await pilot.actions.screenshot({ format: 'jpeg', quality: 82, fullPage: true }) : (await pilot.page.send('Page.captureScreenshot', { format: 'jpeg', quality: 82, fromSurface: true })).data
  await writeFile(path, Buffer.from(b64, 'base64'))
  if (full) await pilot.page.eval(`document.getElementById('rn-captura')?.remove()`)
}

async function main() {
  // --telas final|real|folgali: the list of screens (scripts/social-screens/<name>.mjs)
  const { SCREENS } = await import(pathToFileURL(join(here, 'telas-social', `${arg('telas', 'folgali')}.mjs`)).href)
  await mkdir(OUTPUT, { recursive: true })
  const { LogicaPilot } = require(PILOT)
  const done = []
  for (const vpName of VPS) {
    const vp = VIEWPORTS[vpName]
    for (const theme of THEMES) {
      const pilot = await new LogicaPilot({ headless: true, width: vp.width, height: vp.height }).launch()
      try {
        await pilot.page.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr, mobile: false })
        // --cookie nome=valor: a session already open (to photograph screens of someone signed in, such as the acceptance of the Terms)
        const cookie = arg('cookie', '')
        if (cookie) {
          await pilot.page.send('Network.enable', {})
          await pilot.page.send('Network.setCookie', { name: cookie.slice(0, cookie.indexOf('=')), value: cookie.slice(cookie.indexOf('=') + 1), url: BASE, httpOnly: true })
        }
        for (const t of SCREENS) {
          if (ONLY?.length && !ONLY.includes(t.nome)) continue
          await pilot.goto(`${BASE}${t.rota}`)
          await pilot.page.eval(`localStorage.setItem('rn-tema','${theme}');document.documentElement.dataset.tema='${theme}'`)
          await new Promise((r) => setTimeout(r, 800))
          await wait(pilot)
          if (t.antes) { await pilot.page.eval(t.antes); await wait(pilot) }
          const file = join(OUTPUT, `${t.nome}-${vpName}-${theme}.jpg`)
          await photo(pilot, file, false)
          done.push(file)
          if (COMPLETE && t.completa) {
            const c = join(OUTPUT, `${t.nome}-completa-${vpName}-${theme}.jpg`)
            await photo(pilot, c, true)
            done.push(c)
          }
          const width = await pilot.page.eval(`document.documentElement.scrollWidth > window.innerWidth + 1 ? document.documentElement.scrollWidth : 0`)
          console.log('foto', file, width ? `ESTOURA A LARGURA: ${width}px` : '')
        }
      } finally {
        try { await pilot.close() } catch { /* already closed */ }
      }
    }
  }
  console.log(`\n${done.length} fotos em ${OUTPUT}. ABRA CADA UMA (Read).`)
}
main().catch((e) => { console.error(e); process.exit(1) })
