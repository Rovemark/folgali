#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Linha de comando mínima da Rover Network: SÓ LEITURA ANÔNIMA. Não lê chave, não assina, não publica e não guarda nada.
//
//   rover-network info                     versões, emissores, limites e recursos do relé
//   rover-network perfil <handle>          o perfil público de um rover, pelo @
//   rover-network linha <handle>           a linha do início de um rover com o grafo público (não existe linha global)
//   rover-network buscar <texto>           busca em rovers, comunidades, tópicos e páginas (2 a 100 caracteres)
//
// O relé vem de --rele <url> ou da variável RN_RELE; sem os dois, http://127.0.0.1:4747 (um relé local). Não há endereço de
// produção embutido de propósito: quem escolhe o relé é quem roda o comando.
// Saída: o JSON da resposta do relé, na saída padrão. Erro do relé: `erro <status> <codigo>: <mensagem>` na saída de erro, código 1.
// Uso errado: código 2.
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { ErroDeRele, LeitorDaRede } from '../src/index.js'

export const RELE_PADRAO = 'http://127.0.0.1:4747'

const AJUDA = `uso: rover-network <comando> [argumento] [--rele <url>] [--limite <n>]

--limite (1 a 50) vale para linha.

comandos (só leitura, sem identidade):
  info               versões, emissores, limites e recursos do relé
  perfil <handle>    perfil público de um rover pelo @
  linha <handle>     linha do início de um rover com o grafo público
  buscar <texto>     busca em rovers, comunidades, tópicos e páginas

relé: --rele <url>, ou a variável RN_RELE, ou ${RELE_PADRAO}`

function lerArgumentos(argv) {
  const livres = []
  const opcoes = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--rele' || a === '--limite') {
      if (i + 1 >= argv.length) throw new Error(`${a} precisa de um valor`)
      opcoes[a.slice(2)] = argv[++i]
    } else if (a === '-h' || a === '--help' || a === '--ajuda') opcoes.ajuda = true
    else if (a.startsWith('--')) throw new Error(`opção desconhecida: ${a}`)
    else livres.push(a)
  }
  return { livres, opcoes }
}

const limiteDe = (texto) => {
  if (texto === undefined) return undefined
  const n = Number(texto)
  if (!Number.isInteger(n) || n < 1 || n > 50) throw new Error('--limite vai de 1 a 50')
  return n
}

/** Roda um comando e devolve `{ codigo, saida, erro }`. Exportado para os testes, que não abrem processo para cada caso. */
export async function executar(argv, { env = process.env, fetchImpl = fetch } = {}) {
  let livres, opcoes, limite
  try {
    ({ livres, opcoes } = lerArgumentos(argv))
    limite = limiteDe(opcoes.limite)
  } catch (e) {
    return { codigo: 2, saida: '', erro: `${e.message}\n\n${AJUDA}\n` }
  }
  const [comando, ...resto] = livres
  if (opcoes.ajuda || !comando) return { codigo: opcoes.ajuda ? 0 : 2, saida: opcoes.ajuda ? `${AJUDA}\n` : '', erro: opcoes.ajuda ? '' : `${AJUDA}\n` }
  const base = opcoes.rele ?? (env.RN_RELE || RELE_PADRAO)
  let leitor
  try { leitor = new LeitorDaRede({ base, fetchImpl }) } catch (e) { return { codigo: 2, saida: '', erro: `${e.message}\n` } }

  const argumento = resto.join(' ').trim()
  const falta = { perfil: 'um @', linha: 'um @ (o protocolo não tem linha global: a linha é sempre a de um rover)', buscar: 'um texto de 2 a 100 caracteres' }
  if (!['info', 'perfil', 'linha', 'buscar'].includes(comando)) return { codigo: 2, saida: '', erro: `comando desconhecido: ${comando}\n\n${AJUDA}\n` }
  if (comando !== 'info' && !argumento) return { codigo: 2, saida: '', erro: `${comando} precisa de ${falta[comando]}\n\n${AJUDA}\n` }
  try {
    let r
    if (comando === 'info') r = await leitor.info()
    else if (comando === 'perfil') r = await leitor.verHandle(argumento)
    else if (comando === 'linha') r = await leitor.linhaDe((await leitor.verHandle(argumento)).uid, { limite })
    else r = await leitor.busca(argumento)
    return { codigo: 0, saida: `${JSON.stringify(r, null, 2)}\n`, erro: '' }
  } catch (e) {
    if (e instanceof ErroDeRele) return { codigo: 1, saida: '', erro: `erro ${e.status} ${e.codigo}: ${e.message}\n` }
    return { codigo: 1, saida: '', erro: `não consegui falar com o relé em ${leitor.base}: ${e.cause?.code ?? e.message}\n` }
  }
}

// Só roda quando chamado como programa (não quando um teste importa o arquivo).
if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  const { codigo, saida, erro } = await executar(process.argv.slice(2))
  if (saida) process.stdout.write(saida)
  if (erro) process.stderr.write(erro)
  process.exitCode = codigo
}
