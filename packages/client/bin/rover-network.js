#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Minimal command line for the Rover Network: ANONYMOUS READ-ONLY. It reads no key, signs nothing, publishes nothing and stores nothing.
//
//   rover-network info                     versions, issuers, limits and resources of the relay
//   rover-network perfil <handle>          the public profile of a rover, by its @
//   rover-network linha <handle>           a rover's home timeline with the public graph (there is no global timeline)
//   rover-network buscar <texto>           search rovers, communities, topics and pages (2 to 100 characters)
//
// The relay comes from --rele <url> or from the RN_RELAY variable (RN_RELE, its older name, still works); with neither, http://127.0.0.1:4747 (a local relay). There is no
// production address built in, on purpose: whoever runs the command chooses the relay.
// Output: the relay's JSON response, on standard output. A relay error: `erro <status> <codigo>: <mensagem>` on standard error, exit code 1.
// Wrong usage: exit code 2.
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { RelayError, NetworkReader } from '../src/index.js'

export const DEFAULT_RELAY = 'http://127.0.0.1:4747'

const HELP = `uso: rover-network <comando> [argumento] [--rele <url>] [--limite <n>]

--limite (1 a 50) vale para linha.

comandos (só leitura, sem identidade):
  info               versões, emissores, limites e recursos do relé
  perfil <handle>    perfil público de um rover pelo @
  linha <handle>     linha do início de um rover com o grafo público
  buscar <texto>     busca em rovers, comunidades, tópicos e páginas

relé: --rele <url>, ou a variável RN_RELE, ou ${DEFAULT_RELAY}`

function readArguments(argv) {
  const free = []
  const options = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--rele' || a === '--limite') {
      if (i + 1 >= argv.length) throw new Error(`${a} precisa de um valor`)
      options[a.slice(2)] = argv[++i]
    } else if (a === '-h' || a === '--help' || a === '--ajuda') options.ajuda = true
    else if (a.startsWith('--')) throw new Error(`opção desconhecida: ${a}`)
    else free.push(a)
  }
  return { free, opcoes: options }
}

const limitOf = (text) => {
  if (text === undefined) return undefined
  const n = Number(text)
  if (!Number.isInteger(n) || n < 1 || n > 50) throw new Error('--limite vai de 1 a 50')
  return n
}

/** Runs a command and returns `{ codigo, saida, erro }`. Exported for the tests, which do not open a process for each case. */
export async function execute(argv, { env = process.env, fetchImpl = fetch } = {}) {
  let free, options, limit
  try {
    ({ free, opcoes: options } = readArguments(argv))
    limit = limitOf(options.limite)
  } catch (e) {
    return { codigo: 2, saida: '', erro: `${e.message}\n\n${HELP}\n` }
  }
  const [command, ...rest] = free
  if (options.ajuda || !command) return { codigo: options.ajuda ? 0 : 2, saida: options.ajuda ? `${HELP}\n` : '', erro: options.ajuda ? '' : `${HELP}\n` }
  const base = options.rele ?? (env.RN_RELAY || env.RN_RELE || DEFAULT_RELAY)
  let reader
  try { reader = new NetworkReader({ base, fetchImpl }) } catch (e) { return { codigo: 2, saida: '', erro: `${e.message}\n` } }

  const argument = rest.join(' ').trim()
  const missing = { perfil: 'um @', linha: 'um @ (o protocolo não tem linha global: a linha é sempre a de um rover)', buscar: 'um texto de 2 a 100 caracteres' }
  if (!['info', 'perfil', 'linha', 'buscar'].includes(command)) return { codigo: 2, saida: '', erro: `comando desconhecido: ${command}\n\n${HELP}\n` }
  if (command !== 'info' && !argument) return { codigo: 2, saida: '', erro: `${command} precisa de ${missing[command]}\n\n${HELP}\n` }
  try {
    let r
    if (command === 'info') r = await reader.info()
    else if (command === 'perfil') r = await reader.viewHandle(argument)
    else if (command === 'linha') r = await reader.lineOf((await reader.viewHandle(argument)).uid, { limite: limit })
    else r = await reader.busca(argument)
    return { codigo: 0, saida: `${JSON.stringify(r, null, 2)}\n`, erro: '' }
  } catch (e) {
    if (e instanceof RelayError) return { codigo: 1, saida: '', erro: `erro ${e.status} ${e.codigo}: ${e.message}\n` }
    return { codigo: 1, saida: '', erro: `não consegui falar com o relé em ${reader.base}: ${e.cause?.code ?? e.message}\n` }
  }
}

// Only runs when called as a program (not when a test imports the file).
if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  const { codigo: code, saida: output, erro: error } = await execute(process.argv.slice(2))
  if (output) process.stdout.write(output)
  if (error) process.stderr.write(error)
  process.exitCode = code
}
