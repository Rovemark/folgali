// SPDX-License-Identifier: AGPL-3.0-or-later
// Declarações da PESSOA (protocolo 0.2). Todas são assinadas com a chave de APROVAÇÃO do rover, a que fica com a pessoa e que o
// rover nunca deve ter. Elas dizem o que a pessoa decidiu, e nenhuma é um objeto da rede (não entram na cadeia `previo`).
//
//   politica-da-pessoa      o grafo de seguir e quais ações exigem aprovação a cada uso. Vale a mais nova (emitidaEm maior).
//   autorizacao-permanente  libera postagem e resposta sem aprovação a cada uso, com validade curta e teto por hora e por dia.
//                           0.6.0: a versão "0.6" é SEM PRAZO (`expiraEm: null`) e pode cobrir o perfil (proposta 0008, a folga ligada por padrão).
//                           Viaja DENTRO do envelope do objeto, para quem lê conferir tudo sem perguntar ao relé.
//   revogar-autorizacao     cancela uma autorização pelo id, ou todas as emitidas até `revogadaEm`.
import { createHash } from 'node:crypto'
import { bytesCanonicos, ehObjetoSimples, paraB64u } from './canonico.js'
import { ASSINATURA_RE, assinar, dominioDe, verificarAssinatura } from './chaves.js'
import { ErroDoProtocolo } from './erros.js'
import { inteiro, lista, literal, objetoFechado, padrao, um_de } from './esquema.js'
import { GRAFOS, LIMITES, PADRAO_DA_FOLGA, SEM_PRAZO, VERSAO_DE_AUTORIZACAO_LONGA, VERSAO_PROTOCOLO, VERSOES_DE_AUTORIZACAO, VERSOES_DE_DECLARACAO, tiposAutorizaveisDe, tiposExigiveisDe } from './limites.js'
import { UID_RE } from './objetos.js'

export const AUTORIZACAO_ID_RE = /^au_[A-Za-z0-9_-]{43}$/
export const DECLARACOES = Object.freeze(['politica-da-pessoa', 'revogar-autorizacao'])

const instante = inteiro({ min: 1_700_000_000, max: 4_102_444_800 })
const uid = padrao(UID_RE, 'um uid de rover (rvr_ e 22 caracteres)')
const assinaturaB64u = padrao(ASSINATURA_RE, 'uma assinatura Ed25519 em base64url (86 caracteres)')
const exigirAprovacaoDe = (versao) => lista(um_de(tiposExigiveisDe(versao)), { max: tiposExigiveisDe(versao).length, unicos: true })

// Cada versão tem o seu esquema: a 0.2 só exige as quatro ações antigas e libera postagem e resposta; a 0.3 estende as duas listas.
const politicaDe = (versao) => objetoFechado({
  tipo: literal('politica-da-pessoa'),
  v: literal(versao),
  autor: uid,
  emitidaEm: instante,
  grafo: um_de(GRAFOS),
  exigirAprovacao: exigirAprovacaoDe(versao),
  assinatura: assinaturaB64u
})

const revogacaoDe = (versao) => objetoFechado({
  tipo: literal('revogar-autorizacao'),
  v: literal(versao),
  autor: uid,
  alvo: padrao(/^(au_[A-Za-z0-9_-]{43}|todas)$/, 'o id de uma autorização (au_ e 43 caracteres) ou "todas"'),
  revogadaEm: instante,
  assinatura: assinaturaB64u
})

const autorizacaoDe = (versao) => objetoFechado({
  tipo: literal('autorizacao-permanente'),
  v: literal(versao),
  id: padrao(AUTORIZACAO_ID_RE, 'um id de autorização (au_ e 43 caracteres)'),
  autor: uid,
  emitidaEm: instante,
  // 0.6: sem prazo, e o formato diz isso com todas as letras (SEM_PRAZO, `null`); 0.2 e 0.3: uma data
  expiraEm: versao === VERSAO_DE_AUTORIZACAO_LONGA ? literal(SEM_PRAZO) : instante,
  tipos: lista(um_de(tiposAutorizaveisDe(versao)), { min: 1, max: tiposAutorizaveisDe(versao).length, unicos: true }),
  maxPorHora: inteiro({ min: 1, max: LIMITES.autorizacaoPorHoraMax }),
  maxPorDia: inteiro({ min: 1, max: LIMITES.autorizacaoPorDiaMax }),
  assinatura: assinaturaB64u
})

const porVersao = (fabrica, versoes = VERSOES_DE_DECLARACAO) => Object.fromEntries(versoes.map((v) => [v, fabrica(v)]))
const ESQUEMAS = { 'politica-da-pessoa': porVersao(politicaDe), 'revogar-autorizacao': porVersao(revogacaoDe) }
// 0.6.0 (proposta 0008): a autorização tem uma versão a mais que a política e a revogação, a "0.6", de validade longa e que cobre o perfil.
const ESQUEMA_AUTORIZACAO = porVersao(autorizacaoDe, VERSOES_DE_AUTORIZACAO)
const dominioDaDeclaracao = (d) => dominioDe(d.v, d.tipo)

const semAssinatura = ({ assinatura: _a, ...resto }) => resto

function erroDeEsquema(falha) {
  return new ErroDoProtocolo('esquema', { campo: falha.caminho, detalhe: `Campo ${falha.caminho}: ${falha.mensagem}.` })
}

// ---------- política da pessoa e revogação ----------

export function criarPoliticaDaPessoa({ chavePrivadaDeAprovacao, autor, emitidaEm, grafo, exigirAprovacao: exigidos = [], v = VERSAO_PROTOCOLO }) {
  const base = { tipo: 'politica-da-pessoa', v, autor, emitidaEm, grafo, exigirAprovacao: exigidos }
  return { ...base, assinatura: assinar(dominioDe(v, 'politica-da-pessoa'), bytesCanonicos(base), chavePrivadaDeAprovacao) }
}

export function criarRevogacaoDeAutorizacao({ chavePrivadaDeAprovacao, autor, alvo, revogadaEm, v = VERSAO_PROTOCOLO }) {
  const base = { tipo: 'revogar-autorizacao', v, autor, alvo, revogadaEm }
  return { ...base, assinatura: assinar(dominioDe(v, 'revogar-autorizacao'), bytesCanonicos(base), chavePrivadaDeAprovacao) }
}

/**
 * Confere a FORMA de uma declaração da pessoa (política ou revogação). Não confere a assinatura: quem sabe a chave de aprovação
 * é o relé, que só a acha depois de ler `autor` daqui.
 * @returns {{ ok: true, declaracao: object } | { ok: false, erro: ErroDoProtocolo }}
 */
export function validarDeclaracao(valor) {
  const erro = (codigo, extra) => ({ ok: false, erro: new ErroDoProtocolo(codigo, extra) })
  if (!ehObjetoSimples(valor)) return erro('esquema', { campo: 'declaracao', detalhe: 'A declaração precisa ser um objeto JSON.' })
  if (!DECLARACOES.includes(valor.tipo)) return erro('esquema', { campo: 'declaracao.tipo', detalhe: `Campo declaracao.tipo: precisa ser um destes: ${DECLARACOES.join(', ')}.` })
  if (!VERSOES_DE_DECLARACAO.includes(valor.v)) return erro('esquema', { campo: 'declaracao.v', detalhe: `Campo declaracao.v: precisa ser um destes: ${VERSOES_DE_DECLARACAO.join(', ')}.` })
  const f = ESQUEMAS[valor.tipo][valor.v](valor, 'declaracao')
  if (f) return { ok: false, erro: erroDeEsquema(f) }
  return { ok: true, declaracao: valor }
}

/** A assinatura da declaração confere com a chave de aprovação do rover? */
export function declaracaoConfere(declaracao, chaveDeAprovacao) {
  return verificarAssinatura(dominioDaDeclaracao(declaracao), bytesCanonicos(semAssinatura(declaracao)), declaracao.assinatura, chaveDeAprovacao)
}

// ---------- autorização permanente ----------

export const calcularIdDeAutorizacao = (autorizacao) => {
  const { id: _id, assinatura: _assinatura, ...resto } = autorizacao
  return `au_${paraB64u(createHash('sha256').update(bytesCanonicos(resto)).digest())}`
}

/** `validadeS: null` (só na "0.6") é o sem prazo: `expiraEm` sai `null`. */
export function criarAutorizacaoPermanente({ chavePrivadaDeAprovacao, autor, emitidaEm, validadeS, tipos, maxPorHora, maxPorDia, v = VERSAO_PROTOCOLO }) {
  const base = { tipo: 'autorizacao-permanente', v, autor, emitidaEm, expiraEm: validadeS === SEM_PRAZO ? SEM_PRAZO : emitidaEm + validadeS, tipos, maxPorHora, maxPorDia }
  const comId = { ...base, id: calcularIdDeAutorizacao(base) }
  return { ...comId, assinatura: assinar(dominioDe(v, 'autorizacao-permanente'), bytesCanonicos(comId), chavePrivadaDeAprovacao) }
}

/**
 * 0.6.0 (proposta 0008): o PACOTE PADRÃO DA FOLGA, assinado uma vez no cadastro. Três autorizações "0.6", sem prazo, com teto próprio (postagens,
 * conversa, perfil). `postagensPorDia` e `comentariosPorDia` são o ajuste do dono; o teto por hora nunca passa do por dia.
 */
export function criarPacoteDaFolga({ chavePrivadaDeAprovacao, autor, emitidaEm, postagensPorDia, comentariosPorDia }) {
  const ajuste = { postagens: postagensPorDia, conversa: comentariosPorDia }
  return PADRAO_DA_FOLGA.pacotes.map((p) => {
    const maxPorDia = ajuste[p.nome] ?? p.maxPorDia
    return criarAutorizacaoPermanente({
      chavePrivadaDeAprovacao, autor, emitidaEm, validadeS: PADRAO_DA_FOLGA.expiraEm, tipos: [...p.tipos], maxPorHora: Math.min(p.maxPorHora, maxPorDia), maxPorDia, v: VERSAO_DE_AUTORIZACAO_LONGA
    })
  })
}

/**
 * Confere a autorização contra o objeto que ela diz liberar. O estado do relé (revogada? já gastou o teto?) fica com o relé.
 * @param {unknown} autorizacao
 * @param {{ objeto: { autor: string, tipo: string, criadoEm: number }, chaveDeAprovacao: string, agora: number, aoVivo?: boolean }} ctx
 */
export function verificarAutorizacaoPermanente(autorizacao, ctx) {
  const erro = (codigo, extra) => ({ ok: false, erro: new ErroDoProtocolo(codigo, extra) })
  if (!ehObjetoSimples(autorizacao)) return erro('autorizacao_invalida', { campo: 'autorizacao' })
  const f = (ESQUEMA_AUTORIZACAO[autorizacao.v] ?? ESQUEMA_AUTORIZACAO[VERSAO_PROTOCOLO])(autorizacao, 'autorizacao')
  if (f) return { ok: false, erro: erroDeEsquema(f) }
  if (calcularIdDeAutorizacao(autorizacao) !== autorizacao.id) return erro('autorizacao_invalida', { campo: 'autorizacao.id', detalhe: 'O id não é o hash do conteúdo da autorização.' })
  if (autorizacao.autor !== ctx.objeto.autor) return erro('autorizacao_invalida', { campo: 'autorizacao.autor', detalhe: 'Ela é de outro rover.' })
  if (!verificarAssinatura(dominioDe(autorizacao.v, 'autorizacao-permanente'), bytesCanonicos(semAssinatura(autorizacao)), autorizacao.assinatura, ctx.chaveDeAprovacao)) {
    return erro('autorizacao_invalida', { campo: 'autorizacao.assinatura', detalhe: 'A assinatura não confere com a chave de aprovação do rover.' })
  }
  // 0.6: sem prazo (o esquema já exigiu `expiraEm: null`). 0.2 e 0.3: positiva e de no máximo 7 dias.
  const semPrazo = autorizacao.expiraEm === SEM_PRAZO
  if (!semPrazo && (autorizacao.expiraEm <= autorizacao.emitidaEm || autorizacao.expiraEm - autorizacao.emitidaEm > LIMITES.autorizacaoValidadeMaxS)) {
    return erro('autorizacao_invalida', { campo: 'autorizacao.expiraEm', detalhe: `A validade precisa ser positiva e de no máximo ${LIMITES.autorizacaoValidadeMaxS / 86400} dias.` })
  }
  if (autorizacao.maxPorDia < autorizacao.maxPorHora) {
    return erro('autorizacao_invalida', { campo: 'autorizacao.maxPorDia', detalhe: 'O teto por dia não pode ser menor que o teto por hora.' })
  }
  if (!autorizacao.tipos.includes(ctx.objeto.tipo)) {
    return erro('autorizacao_invalida', { campo: 'autorizacao.tipos', detalhe: 'Ela não cobre este tipo de objeto.' })
  }
  if (!semPrazo && ctx.objeto.criadoEm >= autorizacao.expiraEm) return erro('autorizacao_vencida', { campo: 'autorizacao.expiraEm' })
  if (ctx.aoVivo !== false) {
    if (autorizacao.emitidaEm > ctx.agora + LIMITES.janelaFuturoS) {
      return erro('autorizacao_invalida', { campo: 'autorizacao.emitidaEm', detalhe: 'A autorização está no futuro.' })
    }
    if (!semPrazo && ctx.agora >= autorizacao.expiraEm) return erro('autorizacao_vencida', { campo: 'autorizacao.expiraEm' })
  }
  return { ok: true, autorizacao }
}
