// SPDX-License-Identifier: AGPL-3.0-or-later
// Ajudantes de teste: chaves geradas na hora (nenhuma chave fixa no repositório), emissor de teste e rovers de teste.
import {
  criarAprovacaoHumana, criarAtestadoDeHandle, criarAutorizacaoPermanente, criarObjeto, criarPoliticaDaPessoa,
  criarRevogacaoDeAutorizacao, gerarParDeChaves, paraB64u
} from '../../packages/protocolo/src/index.js'
import { randomBytes } from 'node:crypto'

export const AGORA = 1_900_000_000

export function novoEmissor() {
  const par = gerarParDeChaves()
  return { chavePublica: par.chavePublica, chavePrivada: par.chavePrivada }
}

export const novoUid = () => `rvr_${paraB64u(randomBytes(16))}`

let contador = 0
export const novoHandle = () => `rover.t${(contador++).toString(36)}${randomBytes(2).toString('hex')}`

/** Um rover de teste completo: uid, chave de rede, chave de aprovação e atestado emitido por `emissor`. */
export function novoRover(emissor, { agora = AGORA, handle = novoHandle(), validadeS = 30 * 86400, uid = novoUid() } = {}) {
  const rede = gerarParDeChaves()
  const aprovacao = gerarParDeChaves()
  const atestado = criarAtestadoDeHandle({
    chavePrivadaDoEmissor: emissor.chavePrivada,
    emissor: emissor.chavePublica,
    uid,
    handle,
    chave: rede.chavePublica,
    chaveAprovacao: aprovacao.chavePublica,
    emitidoEm: agora - 10,
    expiraEm: agora - 10 + validadeS
  })
  return { uid, handle, rede, aprovacao, atestado, emissor }
}

// O perfil 0.2 leva grafo e exigência. Os testes que só querem "um perfil" escrevem nome e descrição, e o ajudante completa
// com os padrões do protocolo (grafo público, nada exigido). Quem testa a política passa os campos e eles prevalecem.
export const PERFIL_PADRAO = Object.freeze({ grafo: 'publico', exigirAprovacao: [] })

export function objetoDe(rover, tipo, corpo, { criadoEm = AGORA, previo = null, v } = {}) {
  const completo = tipo === 'perfil' && v === undefined ? { ...PERFIL_PADRAO, ...corpo } : corpo
  return criarObjeto({ tipo, autor: rover.uid, criadoEm, previo, corpo: completo, chavePrivada: rover.rede.chavePrivada, ...(v === undefined ? {} : { v }) })
}

export function aprovar(rover, objeto, { aprovadoEm = AGORA, validadeS = 300, nonce } = {}) {
  return criarAprovacaoHumana({
    chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, objeto: objeto.id, autor: rover.uid, aprovadoEm, validadeS, nonce
  })
}

// ---------- declarações da pessoa (sempre com a chave de APROVAÇÃO, nunca a de rede) ----------

// Estes ajudantes criam declarações 0.2 por padrão (a bateria 0.2 continua valendo como prova de compatibilidade); passe `v: '0.3'`
// para a 0.3, que acrescenta tipos exigíveis e autorizáveis.
export const politicaDe = (rover, { grafo = 'publico', exigirAprovacao = [], emitidaEm = AGORA, v = '0.2' } = {}) =>
  criarPoliticaDaPessoa({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, autor: rover.uid, emitidaEm, grafo, exigirAprovacao, v })

export const autorizacaoDe = (rover, { emitidaEm = AGORA, validadeS = 86400, tipos = ['postagem', 'resposta'], maxPorHora = 5, maxPorDia = 20, v = '0.2' } = {}) =>
  criarAutorizacaoPermanente({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, autor: rover.uid, emitidaEm, validadeS, tipos, maxPorHora, maxPorDia, v })

export const revogacaoDe = (rover, alvo, { revogadaEm = AGORA, v = '0.2' } = {}) =>
  criarRevogacaoDeAutorizacao({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, autor: rover.uid, alvo, revogadaEm, v })
