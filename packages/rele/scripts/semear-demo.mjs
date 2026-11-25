#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Semeia o relé de DEMONSTRAÇÃO com dezoito rovers de pelúcia inventados e a rede social e o fórum deles, pela API HTTP, como um
// cliente real faria.
//   node --disable-warning=ExperimentalWarning packages/rele/scripts/semear-demo.mjs --relay https://folgali.com \
//        --semente-arquivo /caminho/da/semente [--estado ARQUIVO] [--simular] [--geracao 1] [--intervalo-ms 130] [--aceitar-sem-estado]
// A semente do emissor de demonstração vem de um ARQUIVO (um temporário 0600 que quem opera grava a partir do cofre e apaga depois).
//
// O RELÉ MANDA NO TEMPO: comunidade e página só com conta de 1 dia, depoimento com amizade de 3 dias, selo com 7, resposta e voto
// depois da carência na comunidade. O semeador publica o que já pode e ADIA o resto; no fim diz quando vale rodar de novo. Rode
// de novo nas datas que ele indicar (ver o calendário em docs/OPERACAO-DO-RELE.md). Cada rodada só faz o que falta.
//
// O ESTADO (o ledger do que já foi publicado) fica num arquivo no computador de quem opera, FORA do repositório. Sem ele, uma nova
// rodada não sabe o que já fez e pode repetir conteúdo: não apague. Padrão: ~/.rover-network/semeadura-<host>-g<geracao>.json (0600).
// Nunca imprime a semente nem chave privada.
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { lerSemente } from './demo/chaves-demo.mjs'
import { novoLedger, semear } from './demo/semeador.mjs'

const args = process.argv.slice(2)
const valor = (nome) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : undefined }
const relay = valor('--relay')
const arquivo = valor('--semente-arquivo')
if (!relay || !arquivo) {
  console.error('uso: semear-demo.mjs --relay <url> --semente-arquivo <arquivo> [--estado ARQUIVO] [--simular] [--geracao N] [--intervalo-ms N] [--aceitar-sem-estado]')
  process.exit(2)
}
let url
try { url = new URL(relay) } catch { console.error('--relay não é um endereço válido'); process.exit(2) }
const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
if (url.protocol !== 'https:' && !local) { console.error('--relay precisa ser https (http só em 127.0.0.1)'); process.exit(2) }

let semente
try { semente = lerSemente(readFileSync(arquivo, 'utf8')) } catch (e) { console.error(e.message); process.exit(2) }

const geracao = Number(valor('--geracao') ?? 1)
const caminhoDoEstado = valor('--estado') ?? join(homedir(), '.rover-network', `semeadura-${url.host.replace(/[^\w.-]/g, '_')}-g${geracao}.json`)

function lerEstado() {
  if (!existsSync(caminhoDoEstado)) return novoLedger()
  let l
  try { l = JSON.parse(readFileSync(caminhoDoEstado, 'utf8')) } catch { l = null }
  const objeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
  if (!objeto(l) || l.versao !== 1 || !objeto(l.itens) || !objeto(l.rovers)) {
    console.error(`o arquivo de estado ${caminhoDoEstado} não é um registro de semeadura válido; não vou sobrescrever. Conserte ou mova o arquivo.`)
    process.exit(2)
  }
  return l
}
const ledger = lerEstado()
const simular = args.includes('--simular')

/** Grava por arquivo temporário e troca de nome: uma queda no meio nunca deixa o registro pela metade. */
function gravar(l) {
  if (simular) return
  mkdirSync(dirname(caminhoDoEstado), { recursive: true, mode: 0o700 })
  const tmp = `${caminhoDoEstado}.novo`
  writeFileSync(tmp, JSON.stringify(l), { mode: 0o600 })
  renameSync(tmp, caminhoDoEstado)
  try { chmodSync(caminhoDoEstado, 0o600) } catch { /* sistema sem chmod */ }
}

const quando = (s) => (s ? new Date(s * 1000).toISOString() : null)
try {
  const r = await semear({
    url: url.origin, semente, simular, geracao, aceitarSemLedger: args.includes('--aceitar-sem-estado'), intervaloMs: Number(valor('--intervalo-ms') ?? 130), ledger, aoProgredir: gravar,
    registrar: (e) => console.error(JSON.stringify(e))
  })
  const adiados = {}
  for (const a of r.adiados) adiados[a.fase] = (adiados[a.fase] ?? 0) + 1
  console.log(JSON.stringify({
    relay: url.origin, simulado: r.simulado, criados: r.criados, existentes: r.existentes, pulados: r.pulados, rovers: r.rovers.length,
    adiados, totalAdiado: r.adiados.length, proximaRodada: quando(r.proximaRodada), estado: simular ? null : caminhoDoEstado
  }))
  if (r.adiados.length) {
    console.error(`${r.adiados.length} item(ns) esperam o tempo que o relé exige. ${r.proximaRodada ? `Rode de novo a partir de ${quando(r.proximaRodada)}.` : 'Rode de novo em alguns dias (amizades novas ainda não dão depoimento nem selo).'}`)
  }
} catch (e) {
  console.error(`semeadura interrompida: ${e.message}`)
  process.exit(1)
}
