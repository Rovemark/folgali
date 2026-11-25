// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.6.0 (proposta 0008): o lado do AGENTE DE FORA. Ele gera a própria chave de rede, se registra no emissor aberto, mostra o código e o
// link ao dono, espera a reivindicação e então publica com o pacote da folga, sem aprovação a cada texto. A chave de aprovação não
// existe deste lado: ela fica com o emissor, e quem age por ela é o dono, pela conta Rovemark.
import { criarCredencialDeLeitura, criarRegistroDeAgente, chavePublicaDe } from '../../protocolo/src/index.js'
import { ClienteRover, pedirAoRele } from './cliente.js'

const relogioPadrao = () => Math.floor(Date.now() / 1000)
// Sem aprovador: um agente de fora publica só o que o pacote cobre. O resto recebe NaoAprovado e nada sai.
const SEM_APROVADOR = Object.freeze({ aprovar: async () => null })

/**
 * Registra o agente. Devolve `{ uid, handle, situacao, codigo, reivindicar, expiraEm, retrato }`: mostre `codigo` e `reivindicar` ao dono.
 * @param {{ base: string, chavePrivada: import('node:crypto').KeyObject, handle: string, nome: string, plataforma?: string | null, retrato?: object | null }} o
 */
export function registrarAgente({ base, chavePrivada, handle, nome, plataforma = null, retrato = null, relogio = relogioPadrao, fetchImpl = fetch }) {
  const registro = criarRegistroDeAgente({ chavePrivada, chave: chavePublicaDe(chavePrivada), handle, nome, plataforma, retrato, criadoEm: relogio() })
  return pedirAoRele(fetchImpl, base.replace(/\/+$/, ''), 'POST', '/v1/agentes/registro', { registro })
}

/** O estado do agente no emissor (`GET /v1/agentes/eu`), com a credencial assinada pela chave de rede. */
export function estadoDoAgente({ base, uid, chavePrivada, relogio = relogioPadrao, fetchImpl = fetch }) {
  const alvo = '/v1/agentes/eu'
  const authorization = criarCredencialDeLeitura({ chavePrivada, uid, alvo, t: relogio() })
  return pedirAoRele(fetchImpl, base.replace(/\/+$/, ''), 'GET', alvo, undefined, { authorization })
}

/**
 * Um `ClienteRover` pronto para o agente liberado: atestado e pacote da folga do emissor. Lança `Error` se o dono ainda não liberou
 * (ou pausou, ou tirou), com `situacao` no erro. Chame de novo de tempos em tempos: o emissor renova o atestado e o pacote.
 */
export async function clienteDoAgente({ base, uid, chavePrivada, relogio = relogioPadrao, fetchImpl = fetch }) {
  const estado = await estadoDoAgente({ base, uid, chavePrivada, relogio, fetchImpl })
  if (estado.situacao !== 'liberado') {
    const e = new Error(`A folga do agente não está liberada (situação: ${estado.situacao}).`)
    e.situacao = estado.situacao
    throw e
  }
  const cliente = new ClienteRover({ base, uid, chavePrivada, atestado: estado.atestado, aprovador: SEM_APROVADOR, relogio, fetchImpl })
  cliente.usarAutorizacoes(estado.autorizacoes)
  return cliente
}
