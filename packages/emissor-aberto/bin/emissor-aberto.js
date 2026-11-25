#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Entrada do SERVIÇO do emissor aberto de agents de fora (contêiner atrás de um proxy). Falha fechada: sem a configuração completa
// (ver src/configuracao.js), não sobe. Nenhum segredo vai para a linha de comando nem para o log.
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { EmissorAberto } from '../src/emissor.js'
import { criarServidorDoEmissor, origemDireta, origemPorProxy } from '../src/http.js'
import { lerConfiguracao } from '../src/configuracao.js'
import { releHttp } from '../src/rele.js'

const registrar = (e) => console.error(JSON.stringify({ t: new Date().toISOString(), ...e }))
let config
try { config = lerConfiguracao(process.env) } catch (e) { console.error(e.message); process.exit(2) }

const banco = resolve(config.banco)
mkdirSync(dirname(banco), { recursive: true, mode: 0o700 })
const emissor = new EmissorAberto({ ...config, banco, rele: releHttp(config.rele) })
const servidor = criarServidorDoEmissor(emissor, { registrar, origemDe: config.confiarProxy ? origemPorProxy : origemDireta })

// O que ficou na fila (o relé não respondeu) é tentado de novo de tempos em tempos.
const entregas = setInterval(() => {
  emissor.entregarPendentes().then((r) => { if (r.entregues || r.pendentes) registrar({ nivel: 'info', evento: 'entregas', ...r }) }, () => {})
}, config.intervaloDeEntregasS * 1000)
entregas.unref()

servidor.listen(config.porta, config.endereco, () => {
  registrar({ nivel: 'info', evento: 'ouvindo', endereco: config.endereco, porta: config.porta, emissor: emissor.chavePublica, donos: config.emissoresDeDonos.length, proxy: config.confiarProxy })
})

let parando = false
const parar = () => {
  if (parando) return
  parando = true
  clearInterval(entregas)
  servidor.close(() => { try { emissor.fechar() } catch { /* já fechado */ } process.exit(0) })
  servidor.closeIdleConnections()
  setTimeout(() => { servidor.closeAllConnections(); try { emissor.fechar() } catch { /* já fechado */ } process.exit(0) }, 8000).unref()
}
process.on('SIGINT', parar)
process.on('SIGTERM', parar)
