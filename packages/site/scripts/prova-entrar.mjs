#!/usr/bin/env node
// Prova visual das páginas de entrada (/entrar, /entrar/pessoa, /entrar/agente): abre o site local numa JANELA do Logica Pilot (nunca a tela
// inteira do Mac) e grava fotos em JPEG, em celular e computador, nos temas claro e escuro, em pt e en. As fotos ficam em docs/fotos-entrar/,
// FORA do git. Depois de rodar, abra cada uma (o script não julga nada).
//
// A lista de espera só aparece "ligada" com ROVER_NETWORK_LISTA_ESPERA_URL no servidor do site. Por isso são dois passes:
//   node scripts/prova-entrar.mjs --passe desligada                      (servidor SEM a variável)
//   node scripts/prova-entrar.mjs --passe ligada --stub 3977             (servidor com ROVER_NETWORK_LISTA_ESPERA_URL=http://127.0.0.1:3977/v1/waitlist)
// O `--stub` sobe um servidor de mentira que responde 202 (ou 500 / 429 para os e-mails falha@ e limite@) e anota só e-mails @example.com.
//
// Uso: node scripts/prova-entrar.mjs [--base http://127.0.0.1:3975] [--passe desligada|ligada] [--so nome,nome] [--temas claro,escuro] [--vp mobile,desktop] [--lang pt,en]

import { createServer } from 'node:http'
import { appendFileSync, writeFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clicarSel, digitar, rolarPara, seq } from './prova-lib.mjs'

const aqui = dirname(fileURLToPath(import.meta.url))
const saida = resolve(aqui, '../docs/fotos-entrar')
const require = createRequire(import.meta.url)
const PILOT = process.env.LOGICA_PILOT || join(homedir(), 'logicaos/skills/pilot/engine/src/index.js')
const arg = (nome, padrao) => {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 ? process.argv[i + 1] : padrao
}
const BASE = arg('base', 'http://localhost:3975')
const PASSE = arg('passe', 'desligada')
const SO = arg('so', '')?.split(',').filter(Boolean)
const TEMAS = arg('temas', 'claro,escuro').split(',')
const VPS = arg('vp', 'mobile,desktop').split(',')
const LANGS = arg('lang', 'pt,en').split(',')
const STUB = arg('stub', '')
const VIEWPORTS = { mobile: { width: 390, height: 844, dpr: 2 }, desktop: { width: 1440, height: 900, dpr: 1 } }

// ---- servidor de mentira da lista (só para a foto dos estados "enviado" e de erro) ----
if (STUB) {
  const registro = join('/tmp', 'entrar-stub.log')
  writeFileSync(registro, '')
  createServer((req, res) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, OPTIONS' }
    if (req.method === 'OPTIONS') return res.writeHead(204, cors).end()
    let corpo = ''
    req.on('data', (c) => (corpo += c))
    req.on('end', () => {
      let j = {}
      try { j = JSON.parse(corpo) } catch { /* corpo torto */ }
      const email = String(j.email ?? '')
      if (email.endsWith('@example.com')) appendFileSync(registro, `${req.method} ${req.url} ${email} tipo=${j.tipo} consentimento=${j.consentimento}\n`)
      const status = email.startsWith('falha@') ? 500 : email.startsWith('limite@') ? 429 : 202
      res.writeHead(status, { ...cors, 'content-type': 'application/json' }).end(JSON.stringify(status === 202 ? { ok: true } : { erro: { codigo: 'x' } }))
    })
  }).listen(Number(STUB), '127.0.0.1', () => console.log(`stub da lista em http://127.0.0.1:${STUB} (anota em ${registro})`))
}

const definir = (sel, valor) => `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return;const p=Object.getPrototypeOf(e);const set=Object.getOwnPropertyDescriptor(p,'value').set;set.call(e,${JSON.stringify(valor)});e.dispatchEvent(new Event('change',{bubbles:true}))})()`
const NOME = '.e-passos .e-campo:nth-child(1) input'
const HANDLE = '.e-passos .e-campo:nth-child(2) input'
const preencherLista = (email) => seq(digitar('.e-lista input[type=email]', email), clicarSel('.e-lista input[name=consentimento]'))

// cada tela: nome, rota, o que fazer antes da foto, se é a página inteira, o passe e o que mostrar rolado
const TELAS = [
  { nome: 'entrar', rota: '/entrar', completa: true, passe: 'desligada' },
  { nome: 'pessoa', rota: '/entrar/pessoa', completa: true, passe: 'desligada' },
  { nome: 'pessoa-preenchida', rota: '/entrar/pessoa', passe: 'desligada', antes: seq(digitar(NOME, 'Pipa'), digitar(HANDLE, 'pipa.viagens'), clicarSel('.e-cor input[value=coral]'), definir('.e-forma select', 'gota'), rolarPara('.e-ficha')) },
  { nome: 'pessoa-handle-curto', rota: '/entrar/pessoa', passe: 'desligada', antes: seq(digitar(NOME, 'Ana'), digitar(HANDLE, 'ab'), rolarPara('.e-ficha')) },
  { nome: 'pessoa-handle-invalido', rota: '/entrar/pessoa', passe: 'desligada', antes: seq(digitar(HANDLE, 'Pipá Viagens'), rolarPara('.e-ficha')) },
  { nome: 'pessoa-handle-ok', rota: '/entrar/pessoa', passe: 'desligada', antes: seq(digitar(NOME, 'Max'), digitar(HANDLE, '@max.piloto'), clicarSel('.e-cor input[value=manga]'), rolarPara('.e-ficha')) },
  { nome: 'pessoa-lista-desligada', rota: '/entrar/pessoa', passe: 'desligada', antes: rolarPara('.e-lista') },
  { nome: 'agente', rota: '/entrar/agente', completa: true, passe: 'desligada' },
  { nome: 'agente-lista-desligada', rota: '/entrar/agente', passe: 'desligada', antes: rolarPara('.e-lista') },
  { nome: 'pessoa-lista-aberta', rota: '/entrar/pessoa', passe: 'ligada', antes: rolarPara('.e-lista') },
  { nome: 'pessoa-lista-erros', rota: '/entrar/pessoa', passe: 'ligada', antes: seq(clicarSel('.e-lista .e-botao'), rolarPara('.e-lista')) },
  { nome: 'pessoa-lista-enviado', rota: '/entrar/pessoa', passe: 'ligada', antes: seq(preencherLista('ana@example.com'), clicarSel('.e-lista .e-botao'), rolarPara('.e-lista')) },
  { nome: 'pessoa-lista-falha', rota: '/entrar/pessoa', passe: 'ligada', antes: seq(preencherLista('falha@example.com'), clicarSel('.e-lista .e-botao'), rolarPara('.e-lista')) },
  { nome: 'pessoa-lista-limite', rota: '/entrar/pessoa', passe: 'ligada', antes: seq(preencherLista('limite@example.com'), clicarSel('.e-lista .e-botao'), rolarPara('.e-lista')) },
  { nome: 'agente-lista-aberta', rota: '/entrar/agente', passe: 'ligada', antes: rolarPara('.e-lista') },
  { nome: 'agente-lista-erros', rota: '/entrar/agente', passe: 'ligada', antes: seq(clicarSel('.e-lista .e-botao'), rolarPara('.e-lista')) },
  { nome: 'agente-lista-enviado', rota: '/entrar/agente', passe: 'ligada', antes: seq(digitar('.e-lista input[name=agente]', 'Resumidor de convites'), digitar('.e-lista textarea', 'Lê os convites da semana e propõe respostas curtas.'), preencherLista('dev@example.com'), clicarSel('.e-lista .e-botao'), rolarPara('.e-lista')) },
]

async function esperarRovers(pilot) {
  await pilot.page.eval(`new Promise((res)=>{const t0=Date.now();const ok=()=>[...document.querySelectorAll('.rover')].every(r=>r.dataset.pronto==='1');(function v(){if(ok()||Date.now()-t0>9000)res(1);else setTimeout(v,150)})()})`)
}
async function rolarTudo(pilot) {
  await pilot.page.eval(`new Promise((res)=>{const raiz=document.documentElement;const antes=raiz.style.scrollBehavior;raiz.style.scrollBehavior='auto';const h=raiz.scrollHeight;let y=0;const p=()=>{y+=500;window.scrollTo(0,y);if(y<h)setTimeout(p,120);else{window.scrollTo(0,0);raiz.style.scrollBehavior=antes;setTimeout(res,300)}};p()})`)
}
async function foto(pilot, caminho, inteira) {
  if (inteira) {
    await rolarTudo(pilot)
    await new Promise((r) => setTimeout(r, 800))
  }
  const b64 = inteira
    ? await pilot.actions.screenshot({ format: 'jpeg', quality: 82, fullPage: true })
    : (await pilot.page.send('Page.captureScreenshot', { format: 'jpeg', quality: 82, fromSurface: true })).data
  await writeFile(caminho, Buffer.from(b64, 'base64'))
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
        for (const lang of LANGS) {
          for (const t of TELAS) {
            if (t.passe !== PASSE) continue
            if (SO?.length && !SO.includes(t.nome)) continue
            await pilot.goto(`${BASE}/${lang}${t.rota}`)
            await pilot.page.eval(`localStorage.setItem('rn-tema','${tema}');document.documentElement.dataset.tema='${tema}'`)
            await new Promise((r) => setTimeout(r, 900))
            await esperarRovers(pilot)
            if (t.antes) {
              await pilot.page.eval(t.antes)
              await new Promise((r) => setTimeout(r, 900))
              await esperarRovers(pilot)
            }
            const arq = join(saida, `${t.nome}-${lang}-${vpNome}-${tema}.jpg`)
            await foto(pilot, arq, false)
            feitas.push(arq)
            console.log('foto', arq)
            if (t.completa && vpNome === 'desktop') {
              const comp = join(saida, `${t.nome}-completa-${lang}-${vpNome}-${tema}.jpg`)
              await foto(pilot, comp, true)
              feitas.push(comp)
              console.log('foto', comp)
            }
          }
        }
      } finally {
        try { await pilot.close() } catch { /* janela já fechada */ }
      }
    }
  }
  console.log(`\n${feitas.length} fotos em ${saida}. ABRA CADA UMA (Read) antes de dizer que está pronto.`)
  if (!STUB) process.exit(0)
  console.log('stub ainda de pé: encerre este processo (Ctrl+C) quando terminar')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
