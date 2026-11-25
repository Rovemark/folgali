#!/usr/bin/env node
// Prova visual por idioma: abre as páginas-chave de cada idioma numa janela do Logica Pilot e grava uma foto da página INTEIRA
// (computador) e da janela (celular). Serve para ver escrita errada, corte de texto, espelho do árabe e fonte faltando em chinês,
// japonês e coreano. O script não julga nada: abra cada foto (Read).
//
// Uso: node scripts/prova-idiomas.mjs --idiomas es,ar --saida <pasta> [--base http://127.0.0.1:3991] [--rotas "",/entrar,/ajuda] [--tema claro]
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const PILOT = process.env.LOGICA_PILOT || join(homedir(), 'logicaos/skills/pilot/engine/src/index.js')
const arg = (n, p) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : p }
const BASE = arg('base', 'http://127.0.0.1:3991')
const IDIOMAS = arg('idiomas', 'es').split(',')
const SAIDA = arg('saida')
const TEMA = arg('tema', 'claro')
const ROTAS = arg('rotas', ',/entrar,/ajuda,/glossario,/sobre').split(',')
if (!SAIDA) { console.error('falta --saida <pasta>'); process.exit(2) }
await mkdir(SAIDA, { recursive: true })

const nomeDaRota = (r) => (r === '' ? 'inicio' : r.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, ''))
const rolarTudo = (pilot) => pilot.page.eval(`new Promise((res)=>{const raiz=document.documentElement;const antes=raiz.style.scrollBehavior;raiz.style.scrollBehavior='auto';const h=raiz.scrollHeight;let y=0;const t=setInterval(()=>{y+=500;window.scrollTo(0,y);if(y>h+500){clearInterval(t);setTimeout(()=>{window.scrollTo(0,0);raiz.style.scrollBehavior=antes;setTimeout(res,500)},300)}},60)})`)
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

const { LogicaPilot } = require(PILOT)
for (const [vpNome, vp] of Object.entries({ desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } })) {
  const pilot = await new LogicaPilot({ headless: true, width: vp.width, height: vp.height }).launch()
  try {
    await pilot.page.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: vpNome === 'mobile' ? 2 : 1, mobile: false })
    await pilot.page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: TEMA === 'escuro' ? 'dark' : 'light' }] })
    for (const lang of IDIOMAS) {
      for (const rota of ROTAS) {
        await pilot.goto(`${BASE}/${lang}${rota}`)
        await pilot.page.eval(`localStorage.setItem('rn-tema','${TEMA}');document.documentElement.dataset.tema='${TEMA}'`)
        await esperar(900)
        const arq = join(SAIDA, `${lang}-${nomeDaRota(rota)}-${vpNome}.jpg`)
        if (vpNome === 'desktop') {
          await pilot.page.eval(`(()=>{const e=document.createElement('style');e.id='rn-captura';e.textContent='.abas,.topo{position:static!important}.trilho,.lateral{position:static!important;height:auto!important}';document.head.appendChild(e)})()`)
          await rolarTudo(pilot)
          const b64 = await pilot.actions.screenshot({ format: 'jpeg', quality: 70, fullPage: true })
          await writeFile(arq, Buffer.from(typeof b64 === 'string' ? b64 : b64.data ?? b64, typeof b64 === 'string' ? 'base64' : undefined))
          await pilot.page.eval(`document.getElementById('rn-captura')?.remove()`)
        } else {
          const { data } = await pilot.page.send('Page.captureScreenshot', { format: 'jpeg', quality: 70, fromSurface: true })
          await writeFile(arq, Buffer.from(data, 'base64'))
        }
        console.log('foto', arq)
      }
    }
  } finally {
    try { await pilot.close() } catch { /* janela já fechada */ }
  }
}
