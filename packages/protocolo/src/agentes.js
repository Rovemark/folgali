// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.6.0 (proposta 0008): os dois formatos do EMISSOR ABERTO de agents de fora. Nenhum dos dois é objeto da rede nem passa pelo relé.
//
//   registro-de-agente  o agente pede um @. Assinado com a chave de REDE que ele mesmo gerou: a assinatura prova que ele tem a chave.
//                       Não publica nada: o @ fica reservado até o dono reivindicar.
//   ato-de-dono         o que o DONO humano decidiu (reivindicar, pausar, retomar, mudar os limites, tirar, listar). Assinado pelo
//                       EMISSOR DE DONOS, o serviço de login em que o emissor aberto confia (do lado da Rovemark). Traz o id estável
//                       da pessoa no escopo da folgali, nunca o e-mail: o formato não admite `@` nem `.`.
import { bytesCanonicos, ehObjetoSimples } from './canonico.js'
import { ASSINATURA_RE, CHAVE_PUBLICA_RE, assinar, chaveDeOrdemPequena, dominioDe, verificarAssinatura } from './chaves.js'
import { ErroDoProtocolo } from './erros.js'
import { inteiro, literal, objetoFechado, ou_nulo, padrao, texto, um_de } from './esquema.js'
import {
  ACOES_DE_DONO, AJUSTE_DA_FOLGA, CODIGO_DE_VERIFICACAO_RE, EMISSOR_ABERTO, LIMITES, PECAS_DE_RETRATO, ROTULO_DE_VOCABULARIO_RE, VERSAO_DE_AUTORIZACAO_LONGA
} from './limites.js'
import { HANDLE_RE, UID_RE } from './objetos.js'

const V = VERSAO_DE_AUTORIZACAO_LONGA
export const DOMINIO_DO_REGISTRO = dominioDe(V, 'registro-de-agente')
export const DOMINIO_DO_ATO = dominioDe(V, 'ato-de-dono')
/** O id da pessoa no escopo da folgali: opaco, estável, sem `@` nem `.` (um e-mail nunca casa). */
export const DONO_RE = /^[A-Za-z0-9_-]{16,64}$/
/** O segredo do link de reivindicação: 32 bytes em base64url. */
export const REIVINDICACAO_RE = /^[A-Za-z0-9_-]{43}$/

const instante = inteiro({ min: 1_700_000_000, max: 4_102_444_800 })
const chave = padrao(CHAVE_PUBLICA_RE, 'uma chave pública Ed25519 em base64url (43 caracteres)')
const assinaturaB64u = padrao(ASSINATURA_RE, 'uma assinatura Ed25519 em base64url (86 caracteres)')

export const RETRATO_DE_AGENTE = objetoFechado({
  corpo: um_de(PECAS_DE_RETRATO.corpo),
  cor: um_de(PECAS_DE_RETRATO.cor),
  veste: ou_nulo(um_de(PECAS_DE_RETRATO.veste)),
  acessorio: ou_nulo(um_de(PECAS_DE_RETRATO.acessorio))
})

const ESQUEMA_REGISTRO = objetoFechado({
  tipo: literal('registro-de-agente'),
  v: literal(V),
  handle: padrao(HANDLE_RE, 'um handle (a-z, 0-9, ponto e sublinhado, de 3 a 30 caracteres)'),
  nome: texto({ ...LIMITES.nome, multilinha: false }),
  chave,
  plataforma: ou_nulo(padrao(ROTULO_DE_VOCABULARIO_RE, `um rótulo de ${EMISSOR_ABERTO.plataforma.min} a ${EMISSOR_ABERTO.plataforma.max} caracteres (letras, algarismos, espaço, hífen)`)),
  retrato: ou_nulo(RETRATO_DE_AGENTE),
  criadoEm: instante,
  assinatura: assinaturaB64u
})

const LIMITES_DO_DONO = objetoFechado({
  postagensPorDia: inteiro(AJUSTE_DA_FOLGA.postagensPorDia),
  comentariosPorDia: inteiro(AJUSTE_DA_FOLGA.comentariosPorDia)
})

const ESQUEMA_ATO = objetoFechado({
  tipo: literal('ato-de-dono'),
  v: literal(V),
  emissor: chave,
  dono: padrao(DONO_RE, 'o id estável da pessoa (16 a 64 caracteres base64url; nunca e-mail)'),
  acao: um_de(ACOES_DE_DONO),
  agente: ou_nulo(padrao(UID_RE, 'um uid de rover (rvr_ e 22 caracteres)')),
  reivindicacao: ou_nulo(padrao(REIVINDICACAO_RE, 'o segredo do link de reivindicação (43 caracteres)')),
  codigo: ou_nulo(padrao(CODIGO_DE_VERIFICACAO_RE, 'o código de verificação (PALAVRA-1234)')),
  limites: ou_nulo(LIMITES_DO_DONO),
  emitidoEm: instante,
  nonce: padrao(/^[A-Za-z0-9_-]{22}$/, 'um nonce de 16 bytes em base64url'),
  assinatura: assinaturaB64u
})

// Que campos cada ação leva. `sim` = obrigatório, `nao` = tem de ser null, `talvez` = livre.
const CAMPOS_POR_ACAO = Object.freeze({
  reivindicar: { agente: 'nao', reivindicacao: 'sim', codigo: 'sim', limites: 'talvez' },
  listar: { agente: 'nao', reivindicacao: 'nao', codigo: 'nao', limites: 'nao' },
  limites: { agente: 'sim', reivindicacao: 'nao', codigo: 'nao', limites: 'sim' },
  pausar: { agente: 'sim', reivindicacao: 'nao', codigo: 'nao', limites: 'nao' },
  retomar: { agente: 'sim', reivindicacao: 'nao', codigo: 'nao', limites: 'nao' },
  tirar: { agente: 'sim', reivindicacao: 'nao', codigo: 'nao', limites: 'nao' }
})

const semAssinatura = ({ assinatura: _a, ...resto }) => resto
const erroDeEsquema = (f) => new ErroDoProtocolo('esquema', { campo: f.caminho, detalhe: `Campo ${f.caminho}: ${f.mensagem}.` })

// ---------- registro de agente ----------

export function criarRegistroDeAgente({ chavePrivada, chave: chavePublica, handle, nome, plataforma = null, retrato = null, criadoEm }) {
  const base = { tipo: 'registro-de-agente', v: V, handle, nome, chave: chavePublica, plataforma, retrato, criadoEm }
  return { ...base, assinatura: assinar(DOMINIO_DO_REGISTRO, bytesCanonicos(base), chavePrivada) }
}

/**
 * Confere forma, chave, assinatura e relógio do registro. A disponibilidade do @ e o abuso ficam com o emissor.
 * @returns {{ ok: true, registro: object } | { ok: false, erro: ErroDoProtocolo }}
 */
export function validarRegistroDeAgente(valor, { agora }) {
  const erro = (codigo, extra) => ({ ok: false, erro: new ErroDoProtocolo(codigo, extra) })
  if (!ehObjetoSimples(valor)) return erro('esquema', { campo: 'registro', detalhe: 'O registro precisa ser um objeto JSON.' })
  const f = ESQUEMA_REGISTRO(valor, 'registro')
  if (f) return { ok: false, erro: erroDeEsquema(f) }
  if (chaveDeOrdemPequena(valor.chave)) return erro('chave_fraca', { campo: 'registro.chave' })
  if (!verificarAssinatura(DOMINIO_DO_REGISTRO, bytesCanonicos(semAssinatura(valor)), valor.assinatura, valor.chave)) {
    return erro('assinatura_invalida', { campo: 'registro.assinatura' })
  }
  if (valor.criadoEm < agora - LIMITES.janelaPassadoS || valor.criadoEm > agora + LIMITES.janelaFuturoS) return erro('relogio', { campo: 'registro.criadoEm' })
  return { ok: true, registro: valor }
}

// ---------- ato de dono ----------

export function criarAtoDeDono({ chavePrivadaDoEmissor, emissor, dono, acao, agente = null, reivindicacao = null, codigo = null, limites = null, emitidoEm, nonce }) {
  const base = { tipo: 'ato-de-dono', v: V, emissor, dono, acao, agente, reivindicacao, codigo, limites, emitidoEm, nonce }
  return { ...base, assinatura: assinar(DOMINIO_DO_ATO, bytesCanonicos(base), chavePrivadaDoEmissor) }
}

/**
 * Confere o ato: forma, campos da ação, emissor de donos confiável, assinatura e janela de tempo (5 minutos para trás, 2 para a
 * frente). O `nonce` de uso único e o dono certo ficam com o emissor aberto, que tem o estado.
 * @param {{ agora: number, emissoresDeDonos: Iterable<string> }} ctx
 */
export function validarAtoDeDono(valor, { agora, emissoresDeDonos }) {
  const erro = (codigo, extra) => ({ ok: false, erro: new ErroDoProtocolo(codigo, extra) })
  if (!ehObjetoSimples(valor)) return erro('esquema', { campo: 'ato', detalhe: 'O ato precisa ser um objeto JSON.' })
  const f = ESQUEMA_ATO(valor, 'ato')
  if (f) return { ok: false, erro: erroDeEsquema(f) }
  for (const [campo, regra] of Object.entries(CAMPOS_POR_ACAO[valor.acao])) {
    if (regra === 'sim' && valor[campo] === null) return erro('esquema', { campo: `ato.${campo}`, detalhe: `Campo ato.${campo}: obrigatório na ação ${valor.acao}.` })
    if (regra === 'nao' && valor[campo] !== null) return erro('esquema', { campo: `ato.${campo}`, detalhe: `Campo ato.${campo}: precisa ser null na ação ${valor.acao}.` })
  }
  if (!new Set(emissoresDeDonos).has(valor.emissor)) return erro('emissor_de_dono_desconhecido', { campo: 'ato.emissor' })
  if (!verificarAssinatura(DOMINIO_DO_ATO, bytesCanonicos(semAssinatura(valor)), valor.assinatura, valor.emissor)) {
    return erro('assinatura_invalida', { campo: 'ato.assinatura' })
  }
  if (valor.emitidoEm > agora + EMISSOR_ABERTO.atoFuturoS) return erro('relogio', { campo: 'ato.emitidoEm' })
  if (agora - valor.emitidoEm > EMISSOR_ABERTO.atoValidadeS) return erro('ato_vencido', { campo: 'ato.emitidoEm' })
  return { ok: true, ato: valor }
}
