// SPDX-License-Identifier: AGPL-3.0-or-later
// Os dois atestados do protocolo.
//
// 1. ATESTADO DE HANDLE (assinado por um EMISSOR de handles): liga o @ e o uid rvr_ às duas chaves do rover:
//    a chave de REDE (assina os objetos) e a chave de APROVAÇÃO (assina a aprovação humana). Valem até `expiraEm`.
// 2. ATESTADO DE APROVAÇÃO HUMANA (assinado com a chave de aprovação, que fica com a pessoa): diz "a pessoa viu e
//    aprovou o objeto de id X". Curto (no máximo 10 minutos), amarrado ao id do objeto e de uso único.
import { createHash, randomBytes } from 'node:crypto'
import { bytesCanonicos, ehObjetoSimples, paraB64u } from './canonico.js'
import { ASSINATURA_RE, CHAVE_PUBLICA_RE, assinar, chaveDeOrdemPequena, dominioDe, verificarAssinatura } from './chaves.js'
import { ErroDoProtocolo } from './erros.js'
import { inteiro, literal, objetoFechado, padrao, um_de } from './esquema.js'
import { LIMITES, VERSAO_PROTOCOLO, VERSOES_ACEITAS } from './limites.js'
import { HANDLE_RE, ID_RE, UID_RE } from './objetos.js'

const instante = inteiro({ min: 1_700_000_000, max: 4_102_444_800 })
const chave = padrao(CHAVE_PUBLICA_RE, 'uma chave pública Ed25519 em base64url (43 caracteres)')
const assinaturaB64u = padrao(ASSINATURA_RE, 'uma assinatura Ed25519 em base64url (86 caracteres)')

const ESQUEMA_ATESTADO = objetoFechado({
  tipo: literal('atestado-handle'),
  v: um_de(VERSOES_ACEITAS),
  emissor: chave,
  uid: padrao(UID_RE, 'um uid de rover (rvr_ e 22 caracteres)'),
  handle: padrao(HANDLE_RE, 'um handle (a-z, 0-9, ponto e sublinhado, de 3 a 30 caracteres)'),
  chave,
  chaveAprovacao: chave,
  emitidoEm: instante,
  expiraEm: instante,
  assinatura: assinaturaB64u
})

const ESQUEMA_APROVACAO = objetoFechado({
  tipo: literal('aprovacao-humana'),
  v: um_de(VERSOES_ACEITAS),
  objeto: padrao(ID_RE, 'um id de objeto (ob_ e 43 caracteres)'),
  autor: padrao(UID_RE, 'um uid de rover (rvr_ e 22 caracteres)'),
  aprovadoEm: instante,
  expiraEm: instante,
  nonce: padrao(/^[A-Za-z0-9_-]{22}$/, 'um nonce de 16 bytes em base64url'),
  assinatura: assinaturaB64u
})

const semAssinatura = ({ assinatura: _a, ...resto }) => resto

function erroDeEsquema(falha) {
  return new ErroDoProtocolo('esquema', { campo: falha.caminho, detalhe: `Campo ${falha.caminho}: ${falha.mensagem}.` })
}

// ---------- atestado de handle ----------

export function criarAtestadoDeHandle({ chavePrivadaDoEmissor, emissor, uid, handle, chave: chaveDeRede, chaveAprovacao, emitidoEm, expiraEm, v = VERSAO_PROTOCOLO }) {
  const base = {
    tipo: 'atestado-handle', v, emissor, uid, handle, chave: chaveDeRede, chaveAprovacao, emitidoEm, expiraEm
  }
  return { ...base, assinatura: assinar(dominioDe(v, 'atestado-handle'), bytesCanonicos(base), chavePrivadaDoEmissor) }
}

/**
 * @param {unknown} atestado
 * @param {{ agora: number, emissoresConfiaveis: Iterable<string>, validadeMaxS?: number, toleranciaS?: number }} ctx
 * @returns {{ ok: true, atestado: object } | { ok: false, erro: ErroDoProtocolo }}
 */
export function verificarAtestadoDeHandle(atestado, ctx) {
  const erro = (codigo, extra) => ({ ok: false, erro: new ErroDoProtocolo(codigo, extra) })
  const validadeMax = ctx.validadeMaxS ?? LIMITES.atestadoValidadeMaxS
  const tolerancia = ctx.toleranciaS ?? LIMITES.atestadoTolerânciaDeRelogioS
  if (!ehObjetoSimples(atestado)) return erro('atestado_invalido', { campo: 'atestado' })
  const f = ESQUEMA_ATESTADO(atestado, 'atestado')
  if (f) return { ok: false, erro: erroDeEsquema(f) }
  if (!new Set(ctx.emissoresConfiaveis).has(atestado.emissor)) return erro('emissor_desconhecido', { campo: 'atestado.emissor' })
  if (!verificarAssinatura(dominioDe(atestado.v, 'atestado-handle'), bytesCanonicos(semAssinatura(atestado)), atestado.assinatura, atestado.emissor)) {
    return erro('atestado_invalido', { campo: 'atestado.assinatura', detalhe: 'A assinatura do emissor não confere.' })
  }
  if (atestado.chave === atestado.chaveAprovacao) {
    return erro('atestado_invalido', { campo: 'atestado.chaveAprovacao', detalhe: 'A chave de aprovação precisa ser diferente da chave de rede do rover.' })
  }
  if (chaveDeOrdemPequena(atestado.chave)) return erro('chave_fraca', { campo: 'atestado.chave' })
  if (chaveDeOrdemPequena(atestado.chaveAprovacao)) return erro('chave_fraca', { campo: 'atestado.chaveAprovacao' })
  if (atestado.expiraEm <= atestado.emitidoEm || atestado.expiraEm - atestado.emitidoEm > validadeMax) {
    return erro('atestado_invalido', { campo: 'atestado.expiraEm', detalhe: `A validade precisa ser positiva e de no máximo ${Math.floor(validadeMax / 86400)} dias.` })
  }
  if (atestado.emitidoEm > ctx.agora + tolerancia) {
    return erro('atestado_invalido', { campo: 'atestado.emitidoEm', detalhe: 'O atestado foi emitido no futuro.' })
  }
  if (ctx.agora >= atestado.expiraEm) return erro('atestado_vencido', { campo: 'atestado.expiraEm' })
  return { ok: true, atestado }
}

// ---------- aprovação humana ----------

export function criarAprovacaoHumana({ chavePrivadaDeAprovacao, objeto, autor, aprovadoEm, validadeS = 300, nonce = paraB64u(randomBytes(16)), v = VERSAO_PROTOCOLO }) {
  const base = {
    tipo: 'aprovacao-humana', v, objeto, autor, aprovadoEm, expiraEm: aprovadoEm + validadeS, nonce
  }
  return { ...base, assinatura: assinar(dominioDe(v, 'aprovacao-humana'), bytesCanonicos(base), chavePrivadaDeAprovacao) }
}

/** Identificador de uso único: dois envios da mesma aprovação dão o mesmo valor. */
export const identificadorDaAprovacao = (aprovacao) =>
  paraB64u(createHash('sha256').update(bytesCanonicos(aprovacao)).digest())

/**
 * Confere a aprovação contra o objeto que ela diz aprovar.
 * Janela: criadoEm do objeto <= aprovadoEm <= expiraEm, validade de no máximo 10 minutos e, ao vivo, agora dentro dela.
 * @param {unknown} aprovacao
 * @param {{ objeto: { id: string, autor: string, criadoEm: number }, chaveDeAprovacao: string, agora: number, aoVivo?: boolean, toleranciaS?: number }} ctx
 */
export function verificarAprovacaoHumana(aprovacao, ctx) {
  const erro = (codigo, extra) => ({ ok: false, erro: new ErroDoProtocolo(codigo, extra) })
  const tolerancia = ctx.toleranciaS ?? LIMITES.janelaFuturoS
  if (!ehObjetoSimples(aprovacao)) return erro('aprovacao_invalida', { campo: 'aprovacao' })
  const f = ESQUEMA_APROVACAO(aprovacao, 'aprovacao')
  if (f) return { ok: false, erro: erroDeEsquema(f) }
  if (aprovacao.objeto !== ctx.objeto.id) return erro('aprovacao_invalida', { campo: 'aprovacao.objeto', detalhe: 'Ela aprova outro objeto.' })
  if (aprovacao.autor !== ctx.objeto.autor) return erro('aprovacao_invalida', { campo: 'aprovacao.autor', detalhe: 'Ela é de outro rover.' })
  if (!verificarAssinatura(dominioDe(aprovacao.v, 'aprovacao-humana'), bytesCanonicos(semAssinatura(aprovacao)), aprovacao.assinatura, ctx.chaveDeAprovacao)) {
    return erro('aprovacao_invalida', { campo: 'aprovacao.assinatura', detalhe: 'A assinatura não confere com a chave de aprovação do rover.' })
  }
  if (aprovacao.aprovadoEm < ctx.objeto.criadoEm) {
    return erro('aprovacao_invalida', { campo: 'aprovacao.aprovadoEm', detalhe: 'A aprovação é anterior à criação do objeto.' })
  }
  if (aprovacao.expiraEm <= aprovacao.aprovadoEm || aprovacao.expiraEm - aprovacao.aprovadoEm > LIMITES.aprovacaoValidadeMaxS) {
    return erro('aprovacao_invalida', { campo: 'aprovacao.expiraEm', detalhe: `A validade precisa ser positiva e de no máximo ${LIMITES.aprovacaoValidadeMaxS / 60} minutos.` })
  }
  if (ctx.aoVivo !== false) {
    if (aprovacao.aprovadoEm > ctx.agora + tolerancia) {
      return erro('aprovacao_invalida', { campo: 'aprovacao.aprovadoEm', detalhe: 'A aprovação está no futuro.' })
    }
    if (ctx.agora > aprovacao.expiraEm) return erro('aprovacao_vencida', { campo: 'aprovacao.expiraEm' })
  }
  return { ok: true, aprovacao }
}
