#!/usr/bin/env node
// Prova visual: abre o site local numa JANELA do Logica Pilot (nunca a tela inteira do Mac) e grava
// uma foto por tela, em celular e computador, nos temas claro e escuro. As fotos vão para docs/fotos
// em JPEG. Depois de rodar, abra cada uma (o script não julga nada).
//
// Uso: node scripts/prova-visual.mjs [--base http://localhost:3911] [--so linha,perfil] [--temas claro,escuro] [--vp mobile,desktop]
//
// Precisa do Logica Pilot do repositório principal do LogicaOS. O caminho vem de LOGICA_PILOT
// (padrão: o caminho do Mac do Arquiteto).

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
const SO = arg('so', '')?.split(',').filter(Boolean)
const TEMAS = arg('temas', 'claro,escuro').split(',')
const VPS = arg('vp', 'mobile,desktop').split(',')

const VIEWPORTS = {
  mobile: { width: 390, height: 844, dpr: 2 },
  desktop: { width: 1440, height: 900, dpr: 1 },
}

const id = (rotulo, n = 43) => `ob_${('DEMO' + rotulo).padEnd(n, '0').slice(0, n)}`

// cada tela: rota, o que fazer antes da foto e se a foto é da página inteira
const TELAS = [
  { nome: 'linha', rota: '/pt', fim: true, completa: true },
  { nome: 'linha-en', rota: '/en' },
  { nome: 'perfil', rota: '/pt/r/pipa', fim: true, completa: true },
  { nome: 'perfil-teco', rota: '/pt/r/teco', so: ['mobile'] },
  { nome: 'postagem', rota: `/pt/p/${id('p02')}`, fim: true },
  { nome: 'descobrir', rota: '/pt/descobrir' },
  { nome: 'busca-resultado', rota: '/pt/buscar?q=pi' },
  { nome: 'busca-vazia', rota: '/pt/buscar?q=zzzz' },
  { nome: 'denuncia', rota: `/pt/denunciar/${id('p05')}`, fim: true },
  { nome: 'denuncia-enviada', rota: `/pt/denunciar/${id('p05')}`, antes: enviarDenuncia() },
  { nome: 'vazio-perfil', rota: '/pt/r/didi', antes: abaRespostas(), fim: true },
  { nome: 'erro-rele', rota: '/pt/r/fora_do_ar' },
  { nome: 'nao-encontrado', rota: '/pt/r/nao_existe_mesmo' },
  { nome: 'sobre', rota: '/pt/sobre' },
]

function js(codigo) {
  return codigo
}
function abaRespostas() {
  return js(`(async()=>{const a=[...document.querySelectorAll('a')].find(x=>x.textContent.trim()==='Respostas'&&x.closest('.abas-pag'));if(a){a.click();await new Promise(r=>setTimeout(r,1500))}})()`)
}
function enviarDenuncia() {
  return js(`(async()=>{const r=document.querySelector('input[name=motivo][value=spam]');if(r){r.click()}await new Promise(r=>setTimeout(r,200));const f=document.querySelector('form');f.requestSubmit();await new Promise(r=>setTimeout(r,1500))})()`)
}

async function esperarRetratos(pilot) {
  await pilot.page.eval(`new Promise((res)=>{const t0=Date.now();const ok=()=>[...document.querySelectorAll('.retrato')].every(r=>r.dataset.pronto==='1')&&[...document.querySelectorAll('.rover')].every(r=>r.dataset.pronto==='1');const t=setInterval(()=>{if(ok()||Date.now()-t0>9000){clearInterval(t);setTimeout(res,400)}},120)})`)
}

async function rolarTudo(pilot) {
  await pilot.page.eval(`new Promise((res)=>{const raiz=document.documentElement;const antes=raiz.style.scrollBehavior;raiz.style.scrollBehavior='auto';const h=raiz.scrollHeight;let y=0;const t=setInterval(()=>{y+=500;window.scrollTo(0,y);if(y>h+500){clearInterval(t);setTimeout(()=>{window.scrollTo(0,0);raiz.style.scrollBehavior=antes;setTimeout(res,700)},300)}},60)})`)
}

async function foto(pilot, caminho, inteira) {
  if (inteira) {
    // na foto da página inteira a barra de abas e o topo fixos apareceriam no meio: soltam-se só durante a captura
    await pilot.page.eval(`(()=>{const e=document.createElement('style');e.id='rn-captura';e.textContent='.abas,.topo{position:static!important}.trilho,.lateral{position:static!important;height:auto!important}';document.head.appendChild(e)})()`)
    await rolarTudo(pilot)
    await new Promise((r) => setTimeout(r, 1500))
  }
  // janela (viewport) pelo CDP direto: o que a pessoa vê, com a rolagem em que está. Página inteira pelo Pilot.
  const b64 = inteira
    ? await pilot.actions.screenshot({ format: 'jpeg', quality: 80, fullPage: true })
    : (await pilot.page.send('Page.captureScreenshot', { format: 'jpeg', quality: 80, fromSurface: true })).data
  await writeFile(caminho, Buffer.from(b64, 'base64'))
  if (inteira) await pilot.page.eval(`document.getElementById('rn-captura')?.remove()`)
}

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
        for (const t of TELAS) {
          if (SO?.length && !SO.includes(t.nome)) continue
          if (t.so && !t.so.includes(vpNome)) continue
          await pilot.goto(`${BASE}${t.rota}`)
          await pilot.page.eval(`localStorage.setItem('rn-tema','${tema}');document.documentElement.dataset.tema='${tema}'`)
          await new Promise((r) => setTimeout(r, 900))
          await esperarRetratos(pilot)
          if (t.antes) {
            await pilot.page.eval(t.antes)
            await esperarRetratos(pilot)
          }
          const arq = join(saida, `${t.nome}-${vpNome}-${tema}.jpg`)
          await foto(pilot, arq, false)
          feitas.push(arq)
          console.log('foto', arq)
          if (t.fim) {
            // a janela rolada até o fim da página: onde ficam os botões de decisão e o rodapé
            await pilot.page.eval(`window.scrollTo(0, document.documentElement.scrollHeight)`)
            await new Promise((r) => setTimeout(r, 500))
            const fim = join(saida, `${t.nome}-fim-${vpNome}-${tema}.jpg`)
            await foto(pilot, fim, false)
            feitas.push(fim)
            console.log('foto', fim)
            await pilot.page.eval(`window.scrollTo(0, 0)`)
          }
          if (t.completa && vpNome === 'desktop') {
            const comp = join(saida, `${t.nome}-completa-${vpNome}-${tema}.jpg`)
            await foto(pilot, comp, true)
            feitas.push(comp)
            console.log('foto', comp)
          }
        }
      } finally {
        try {
          await pilot.close()
        } catch {
          /* janela já fechada */
        }
      }
    }
  }
  console.log(`\n${feitas.length} fotos em ${saida}. ABRA CADA UMA (Read) antes de dizer que está pronto.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
