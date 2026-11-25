#!/usr/bin/env node
// Prova visual da frente de mídia (revisão 0.5.0): postagem com uma e com duas imagens, perfil com retrato em imagem e a tela de
// aprovação com a imagem exata e o texto alternativo, em celular e computador, em português e em árabe. Abre o site local numa janela
// do Logica Pilot. As fotos vão para docs/fotos/midia-*.jpg. Depois de rodar, ABRA CADA UMA (o script não julga nada).
//
// Uso: node scripts/prova-midia.mjs [--base http://localhost:3911] [--idiomas pt,ar] [--vp mobile,desktop] [--temas claro]

import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const saida = resolve(aqui, '../docs/fotos')
const require = createRequire(import.meta.url)
const PILOT = process.env.LOGICA_PILOT || join(homedir(), 'logicaos/skills/pilot/engine/src/index.js')
const arg = (nome, padrao) => {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 ? process.argv[i + 1] : padrao
}
const BASE = arg('base', 'http://localhost:3911')
const IDIOMAS = arg('idiomas', 'pt,ar').split(',')
const VPS = arg('vp', 'mobile,desktop').split(',')
const TEMAS = arg('temas', 'claro').split(',')
const SO = arg('so', '').split(',').filter(Boolean)
const VIEWPORTS = { mobile: { width: 390, height: 844, dpr: 2 }, desktop: { width: 1440, height: 900, dpr: 1 } }
const id = (rotulo) => `ob_${('DEMO' + rotulo).padEnd(43, '0')}`

const TELAS = [
  { nome: 'postagem-uma', rota: `/p/${id('p02')}`, alvo: '.galeria' },
  { nome: 'postagem-duas', rota: `/p/${id('p04')}`, alvo: '.galeria' },
  { nome: 'perfil-retrato', rota: '/r/pipa', alvo: '.pf-retrato-imagem' },
  // a fila abre no rascunho mais recente; a postagem com imagem é escolhida tocando nas abas até o bloco de imagens aparecer
]

// rola até o alvo (a imagem é lazy) e espera todas as imagens da rede carregarem de verdade
const mostrar = (sel) => `(async()=>{const e=document.querySelector(${JSON.stringify(sel)});if(e){e.scrollIntoView({block:'center'});}const t0=Date.now();while(Date.now()-t0<8000){const imgs=[...document.querySelectorAll('img[src^="/midia/"]')];if(imgs.length&&imgs.every(i=>i.complete&&i.naturalWidth>0))break;await new Promise(r=>setTimeout(r,150))}await new Promise(r=>setTimeout(r,500));return [...document.querySelectorAll('img[src^="/midia/"]')].map(i=>i.naturalWidth+'x'+i.naturalHeight+':'+(i.complete?'ok':'falta')).join(',')})()`

async function main() {
  await mkdir(saida, { recursive: true })
  const { LogicaPilot } = require(PILOT)
  const feitas = []
  for (const vpNome of VPS) {
    const vp = VIEWPORTS[vpNome]
    for (const tema of TEMAS) {
      const pilot = await new LogicaPilot({ headless: true, width: vp.width, height: vp.height }).launch()
      try {
        await pilot.page.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr, mobile: false })
        await pilot.page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: tema === 'escuro' ? 'dark' : 'light' }] })
        for (const lang of IDIOMAS) {
          for (const t of TELAS) {
            if (SO.length && !SO.includes(t.nome)) continue
            await pilot.goto(`${BASE}/${lang}${t.rota}`)
            await pilot.page.eval(`localStorage.setItem('rn-tema','${tema}');document.documentElement.dataset.tema='${tema}'`)
            await new Promise((r) => setTimeout(r, 1200))
            if (t.antes) await pilot.page.eval(t.antes)
            const carregadas = await pilot.page.eval(mostrar(t.alvo))
            const arq = join(saida, `midia-${t.nome}-${lang}-${vpNome}-${tema}.jpg`)
            const b64 = (await pilot.page.send('Page.captureScreenshot', { format: 'jpeg', quality: 80, fromSurface: true })).data
            await writeFile(arq, Buffer.from(b64, 'base64'))
            feitas.push(arq)
            console.log('foto', arq, 'imagens:', carregadas)
          }
        }
      } finally {
        try { await pilot.close() } catch { /* janela já fechada */ }
      }
    }
  }
  console.log(`\n${feitas.length} fotos em ${saida}. ABRA CADA UMA (Read) antes de dizer que está pronto.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
