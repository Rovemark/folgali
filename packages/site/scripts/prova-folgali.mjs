#!/usr/bin/env node
// Prova visual da folgali: abre o site local numa JANELA do Logica Pilot e grava uma foto por tela em 390, 768 e 1440 px,
// claro e escuro, FORA do git (padrão ~/.logicaos/provas/folgali/site-<AAAAMMDD-HHMM>). Página inteira com --completa.
// Uso: node scripts/prova-folgali.mjs [--base http://127.0.0.1:3941] [--so feed,perfil] [--vp mobile,tablet,desktop] [--temas claro,escuro] [--completa] [--saida pasta]
// Depois de rodar, ABRA CADA FOTO (Read): o script não julga nada.
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const PILOT = process.env.LOGICA_PILOT || join(homedir(), 'logicaos/skills/pilot/engine/src/index.js')
const arg = (nome, padrao) => {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 ? process.argv[i + 1] : padrao
}
const agora = new Date()
const carimbo = `${agora.getFullYear()}${String(agora.getMonth() + 1).padStart(2, '0')}${String(agora.getDate()).padStart(2, '0')}-${String(agora.getHours()).padStart(2, '0')}${String(agora.getMinutes()).padStart(2, '0')}`
const SAIDA = arg('saida', join(homedir(), '.logicaos/provas/folgali', `site-${carimbo}`))
const BASE = arg('base', 'http://127.0.0.1:3941')
const SO = arg('so', '')?.split(',').filter(Boolean)
const TEMAS = arg('temas', 'claro,escuro').split(',')
const VPS = arg('vp', 'mobile,tablet,desktop').split(',')
const COMPLETA = process.argv.includes('--completa')
const VIEWPORTS = { mobile: { width: 390, height: 844, dpr: 2 }, tablet: { width: 768, height: 1024, dpr: 1 }, desktop: { width: 1440, height: 900, dpr: 1 } }

const esperar = (pilot) => pilot.page.eval(`new Promise((res)=>{const t0=Date.now();const ok=()=>[...document.querySelectorAll('.retrato')].every(r=>r.dataset.pronto==='1')&&[...document.querySelectorAll('img')].every(i=>i.complete);const t=setInterval(()=>{if(ok()||Date.now()-t0>10000){clearInterval(t);setTimeout(res,400)}},150)})`)
const rolarTudo = (pilot) => pilot.page.eval(`new Promise((res)=>{const r=document.documentElement;r.style.scrollBehavior='auto';const h=r.scrollHeight;let y=0;const t=setInterval(()=>{y+=500;window.scrollTo(0,y);if(y>h+500){clearInterval(t);setTimeout(()=>{window.scrollTo(0,0);setTimeout(res,700)},300)}},60)})`)

async function foto(pilot, caminho, inteira) {
  if (inteira) {
    await pilot.page.eval(`(()=>{const e=document.createElement('style');e.id='rn-captura';e.textContent='.abas,.topo,.pub-topo{position:static!important}.trilho,.lateral,.mr-lado,.pf-esq,.ev-filtros,.post-aberto-foto,.reiv-foto{position:static!important}';document.head.appendChild(e)})()`)
    await rolarTudo(pilot)
    await esperar(pilot)
    await new Promise((r) => setTimeout(r, 1200))
  }
  const b64 = inteira ? await pilot.actions.screenshot({ format: 'jpeg', quality: 82, fullPage: true }) : (await pilot.page.send('Page.captureScreenshot', { format: 'jpeg', quality: 82, fromSurface: true })).data
  await writeFile(caminho, Buffer.from(b64, 'base64'))
  if (inteira) await pilot.page.eval(`document.getElementById('rn-captura')?.remove()`)
}

async function main() {
  const { TELAS } = await import(pathToFileURL(join(aqui, 'telas-social', 'folgali.mjs')).href)
  await mkdir(SAIDA, { recursive: true })
  const { LogicaPilot } = require(PILOT)
  const feitas = []
  for (const vpNome of VPS) {
    const vp = VIEWPORTS[vpNome]
    for (const tema of TEMAS) {
      const pilot = await new LogicaPilot({ headless: true, width: vp.width, height: vp.height }).launch()
      try {
        await pilot.page.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr, mobile: false })
        for (const t of TELAS) {
          if (SO?.length && !SO.includes(t.nome)) continue
          await pilot.goto(`${BASE}${t.rota}`)
          await pilot.page.eval(`localStorage.setItem('rn-tema','${tema}');document.documentElement.dataset.tema='${tema}'`)
          await new Promise((r) => setTimeout(r, 800))
          await esperar(pilot)
          if (t.antes) { await pilot.page.eval(t.antes); await esperar(pilot) }
          const arq = join(SAIDA, `${t.nome}-${vpNome}-${tema}.jpg`)
          await foto(pilot, arq, false)
          feitas.push(arq)
          if (COMPLETA && t.completa) {
            const c = join(SAIDA, `${t.nome}-completa-${vpNome}-${tema}.jpg`)
            await foto(pilot, c, true)
            feitas.push(c)
          }
          const larg = await pilot.page.eval(`document.documentElement.scrollWidth > window.innerWidth + 1 ? document.documentElement.scrollWidth : 0`)
          console.log('foto', arq, larg ? `ESTOURA A LARGURA: ${larg}px` : '')
        }
      } finally {
        try { await pilot.close() } catch { /* já fechada */ }
      }
    }
  }
  console.log(`\n${feitas.length} fotos em ${SAIDA}. ABRA CADA UMA (Read).`)
}
main().catch((e) => { console.error(e); process.exit(1) })
