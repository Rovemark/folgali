#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Um relé de DEMONSTRAÇÃO para desenvolver e fotografar o site, SEM servidor, sem segredo guardado e sem esperar uma semana: sobe o relé de
// referência numa porta local, com banco em memória, e semeia o catálogo inteiro andando o RELÓGIO DO RELÉ pelo calendário que o
// relé real impõe (dia 0, 1 dia, 10 minutos depois, 3 dias, 7 dias). Quando termina, o relógio volta a ser o de verdade e o relé
// continua no ar. O emissor é gerado na hora e some quando o processo termina. Não use para nada além de teste local.
//   node --disable-warning=ExperimentalWarning packages/rele/scripts/relay-local-demo.mjs [--porta 4747] [--log]   (--log mostra cada pedido que o relé registra)
//   (outro terminal, em packages/site)  ROVER_NETWORK_CLIENTE=http ROVER_NETWORK_RELE_URL=http://127.0.0.1:4747 npm run preview
import { randomBytes } from 'node:crypto'
import { Armazem } from '../src/armazem.js'
import { criarServidor } from '../src/http.js'
import { ProvedorEstatico } from '../src/provedor.js'
import { Rele } from '../src/rele.js'
import { emissorDe } from './demo/chaves-demo.mjs'
import { novoLedger, semear } from './demo/semeador.mjs'

const args = process.argv.slice(2)
const valor = (nome) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : undefined }
const porta = Number(valor('--porta') ?? 4747)
if (!Number.isInteger(porta) || porta < 1 || porta > 65535) { console.error('--porta precisa ser um número de porta'); process.exit(2) }

const DIA = 86400
const ETAPAS = [0, DIA + 60, 660, 3 * DIA, 7 * DIA] // a idade que o relé pede, uma etapa por rodada
const total = ETAPAS.reduce((a, b) => a + b, 0)
const agoraReal = () => Math.floor(Date.now() / 1000)
let atraso = total + 600 // o relógio do relé começa lá atrás e é puxado para frente até alcançar o de verdade
const relogio = () => agoraReal() - atraso

const semente = randomBytes(32)
const emissor = emissorDe(semente)
const rele = new Rele({
  armazem: new Armazem(':memory:'),
  provedor: new ProvedorEstatico({ emissores: [emissor.chavePublica], nome: 'demonstracao-local' }),
  relogio, segredoDeDenuncias: randomBytes(32), semFatorDeIdade: true
})
const registrar = args.includes('--log') ? (e) => console.error(JSON.stringify(e)) : () => {}
const servidor = criarServidor({ rele, registrar, rajada: { capacidade: 100_000, porSegundo: 100_000 } })
await new Promise((ok) => servidor.listen(porta, '127.0.0.1', ok))
const url = `http://127.0.0.1:${porta}`
console.error(`relé local em ${url}, semeando pelo calendário do relé real...`)

const ledger = novoLedger()
for (const etapa of ETAPAS) {
  atraso -= etapa
  const r = await semear({ url, semente, intervaloMs: 0, relogio, ledger })
  console.error(JSON.stringify({ etapa: `+${(etapa / 3600).toFixed(1)}h`, criados: Object.values(r.criados).reduce((a, b) => a + b, 0), adiados: r.adiados.length }))
}
atraso = 0 // daqui para frente o relógio é o de verdade
console.error(`pronto: ${url}  (Ctrl+C encerra e apaga tudo)`)
process.on('SIGINT', () => servidor.close(() => process.exit(0)))
process.on('SIGTERM', () => servidor.close(() => process.exit(0)))
