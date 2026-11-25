// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DOMINIOS, ErroDoProtocolo, LIMITES, assinar, bytesCanonicos, calcularIdDeAutorizacao, criarAutorizacaoPermanente, criarPoliticaDaPessoa,
  declaracaoConfere, gerarParDeChaves, validarDeclaracao, verificarAutorizacaoPermanente
} from '../../packages/protocolo/src/index.js'
import { AGORA, autorizacaoDe, novoEmissor, novoRover, objetoDe, politicaDe, revogacaoDe } from '../ajuda/mundo.js'

const emissor = novoEmissor()
const rover = novoRover(emissor)
const outro = novoRover(emissor)
const post = () => objetoDe(rover, 'postagem', { texto: 'oi', topicos: [] })
const resposta = () => objetoDe(rover, 'resposta', { alvo: `ob_${'A'.repeat(43)}`, texto: 'ok' })

function recusaDeclaracao(valor, codigo, campo) {
  const r = validarDeclaracao(valor)
  assert.equal(r.ok, false, 'deveria recusar')
  assert.ok(r.erro instanceof ErroDoProtocolo)
  assert.equal(r.erro.codigo, codigo, r.erro.message)
  if (campo) assert.equal(r.erro.campo, campo)
  return r.erro
}

const ctx = (extra = {}) => ({ objeto: post(), chaveDeAprovacao: rover.aprovacao.chavePublica, agora: AGORA, ...extra })
function recusaAutorizacao(a, codigo, extra, campo) {
  const r = verificarAutorizacaoPermanente(a, ctx(extra))
  assert.equal(r.ok, false, 'deveria recusar')
  assert.equal(r.erro.codigo, codigo, r.erro.message)
  if (campo) assert.equal(r.erro.campo, campo)
  return r.erro
}
/** Autorização com conteúdo escolhido e assinada de verdade (para provar uma regra por vez, sem a assinatura atrapalhar). */
function autorizacaoSob(mudancas, { chave = rover.aprovacao.chavePrivada } = {}) {
  const base = { ...autorizacaoDe(rover), ...mudancas }
  const { id: _i, assinatura: _a, ...sem } = base
  const comId = { ...sem, id: mudancas.id ?? calcularIdDeAutorizacao(sem) }
  return { ...comId, assinatura: assinar(DOMINIOS.autorizacao, bytesCanonicos(comId), chave) }
}

// ---------- política da pessoa ----------

test('política da pessoa: forma, assinatura com a chave de APROVAÇÃO e nenhuma outra', () => {
  const p = politicaDe(rover, { grafo: 'privado', exigirAprovacao: ['seguir', 'denuncia'] })
  assert.equal(p.tipo, 'politica-da-pessoa')
  assert.equal(p.v, '0.2')
  assert.equal(validarDeclaracao(p).ok, true)
  assert.equal(declaracaoConfere(p, rover.aprovacao.chavePublica), true)
  assert.equal(declaracaoConfere(p, rover.rede.chavePublica), false, 'a chave de rede não vale')
  assert.equal(declaracaoConfere(p, outro.aprovacao.chavePublica), false)
  assert.equal(declaracaoConfere({ ...p, grafo: 'publico' }, rover.aprovacao.chavePublica), false)
  assert.equal(declaracaoConfere({ ...p, emitidaEm: p.emitidaEm + 1 }, rover.aprovacao.chavePublica), false)
  assert.equal(declaracaoConfere({ ...p, exigirAprovacao: [] }, rover.aprovacao.chavePublica), false)
})

test('política da pessoa: sem lista de exigências vale lista vazia', () => {
  const p = criarPoliticaDaPessoa({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, autor: rover.uid, emitidaEm: AGORA, grafo: 'contagens' })
  assert.deepEqual(p.exigirAprovacao, [])
  assert.equal(validarDeclaracao(p).ok, true)
})

test('esquema fechado da política da pessoa', () => {
  const p = politicaDe(rover, { grafo: 'privado', exigirAprovacao: ['seguir'] })
  const sem = (campo) => { const { [campo]: _x, ...resto } = p; return resto }
  for (const campo of ['tipo', 'v', 'autor', 'emitidaEm', 'grafo', 'exigirAprovacao', 'assinatura']) {
    recusaDeclaracao(sem(campo), 'esquema', campo === 'tipo' ? 'declaracao.tipo' : `declaracao.${campo}`)
  }
  recusaDeclaracao({ ...p, extra: 1 }, 'esquema', 'declaracao.extra')
  recusaDeclaracao({ ...p, grafo: 'secreto' }, 'esquema', 'declaracao.grafo')
  recusaDeclaracao({ ...p, grafo: 'Publico' }, 'esquema', 'declaracao.grafo')
  recusaDeclaracao({ ...p, v: '0.1' }, 'esquema', 'declaracao.v')
  recusaDeclaracao({ ...p, autor: 'rvr_curto' }, 'esquema', 'declaracao.autor')
  recusaDeclaracao({ ...p, emitidaEm: 1.5 }, 'esquema', 'declaracao.emitidaEm')
  recusaDeclaracao({ ...p, emitidaEm: 1_699_999_999 }, 'esquema', 'declaracao.emitidaEm')
  recusaDeclaracao({ ...p, emitidaEm: 4_102_444_801 }, 'esquema', 'declaracao.emitidaEm')
  recusaDeclaracao({ ...p, assinatura: p.assinatura.slice(1) }, 'esquema', 'declaracao.assinatura')
  recusaDeclaracao({ ...p, exigirAprovacao: 'seguir' }, 'esquema', 'declaracao.exigirAprovacao')
  recusaDeclaracao({ ...p, exigirAprovacao: ['postagem'] }, 'esquema', 'declaracao.exigirAprovacao[0]')
  recusaDeclaracao({ ...p, exigirAprovacao: ['remocao-pelo-autor'] }, 'esquema', 'declaracao.exigirAprovacao[0]')
  recusaDeclaracao({ ...p, exigirAprovacao: ['seguir', 'seguir'] }, 'esquema', 'declaracao.exigirAprovacao')
  recusaDeclaracao({ ...p, exigirAprovacao: ['seguir', 'seguir', 'reacao', 'denuncia', 'deixar-de-seguir'] }, 'esquema', 'declaracao.exigirAprovacao')
  assert.equal(validarDeclaracao({ ...p, exigirAprovacao: ['seguir', 'deixar-de-seguir', 'reacao', 'denuncia'] }).ok, true)
  assert.equal(validarDeclaracao({ ...p, emitidaEm: 1_700_000_000 }).ok, true)
  assert.equal(validarDeclaracao({ ...p, emitidaEm: 4_102_444_800 }).ok, true)
})

test('só política e revogação são declarações; o resto, e o que não é objeto, é recusado', () => {
  for (const ruim of [null, undefined, 'x', 42, [], [{}], true]) recusaDeclaracao(ruim, 'esquema', 'declaracao')
  recusaDeclaracao({}, 'esquema', 'declaracao.tipo')
  recusaDeclaracao({ tipo: 'autorizacao-permanente' }, 'esquema', 'declaracao.tipo')
  recusaDeclaracao({ tipo: 'aprovacao-humana' }, 'esquema', 'declaracao.tipo')
  recusaDeclaracao({ tipo: 'postagem' }, 'esquema', 'declaracao.tipo')
  recusaDeclaracao({ tipo: ['politica-da-pessoa'] }, 'esquema', 'declaracao.tipo')
  recusaDeclaracao({ tipo: '__proto__' }, 'esquema', 'declaracao.tipo')
  recusaDeclaracao({ tipo: 'constructor' }, 'esquema', 'declaracao.tipo')
  const erro = recusaDeclaracao({ tipo: 'x' }, 'esquema')
  assert.match(erro.message, /politica-da-pessoa, revogar-autorizacao/)
})

// ---------- revogação ----------

test('revogação: por id ou de todas, assinada com a chave de aprovação', () => {
  const id = autorizacaoDe(rover).id
  for (const alvo of [id, 'todas']) {
    const r = revogacaoDe(rover, alvo)
    assert.equal(r.tipo, 'revogar-autorizacao')
    assert.equal(validarDeclaracao(r).ok, true, alvo)
    assert.equal(declaracaoConfere(r, rover.aprovacao.chavePublica), true)
    assert.equal(declaracaoConfere(r, rover.rede.chavePublica), false)
    assert.equal(declaracaoConfere({ ...r, alvo: alvo === 'todas' ? id : 'todas' }, rover.aprovacao.chavePublica), false)
  }
  const r = revogacaoDe(rover, 'todas')
  // uma política assinada não se faz passar por revogação, nem o contrário (domínios diferentes)
  const p = politicaDe(rover)
  assert.equal(declaracaoConfere({ ...r, tipo: 'politica-da-pessoa' }, rover.aprovacao.chavePublica), false)
  assert.equal(declaracaoConfere({ ...p, tipo: 'revogar-autorizacao' }, rover.aprovacao.chavePublica), false)
})

test('esquema fechado da revogação', () => {
  const id = autorizacaoDe(rover).id
  const r = revogacaoDe(rover, id)
  recusaDeclaracao({ ...r, extra: 1 }, 'esquema', 'declaracao.extra')
  const { alvo: _a, ...semAlvo } = r
  recusaDeclaracao(semAlvo, 'esquema', 'declaracao.alvo')
  for (const ruim of ['TODAS', 'todas ', ' todas', 'todas\n', 'todos', '', 'au_curto', `au_${'A'.repeat(44)}`, `ob_${'A'.repeat(43)}`, `xau_${'A'.repeat(43)}`, `${id}x`, 7, null, ['todas']]) {
    recusaDeclaracao({ ...r, alvo: ruim }, 'esquema', 'declaracao.alvo')
  }
  recusaDeclaracao({ ...r, revogadaEm: 'agora' }, 'esquema', 'declaracao.revogadaEm')
  recusaDeclaracao({ ...r, v: '0.1' }, 'esquema', 'declaracao.v')
  recusaDeclaracao({ ...r, tipo: 'revogar-autorizacao', grafo: 'privado' }, 'esquema', 'declaracao.grafo')
})

// ---------- autorização permanente ----------

test('autorização permanente válida: id por conteúdo, assinada pela chave de aprovação, 7 dias no máximo', () => {
  const a = autorizacaoDe(rover, { maxPorHora: 5, maxPorDia: 20, tipos: ['postagem'] })
  assert.match(a.id, /^au_[A-Za-z0-9_-]{43}$/)
  assert.equal(a.v, '0.2')
  assert.equal(a.expiraEm - a.emitidaEm, 86400)
  assert.equal(calcularIdDeAutorizacao(a), a.id)
  const r = verificarAutorizacaoPermanente(a, ctx())
  assert.equal(r.ok, true)
  assert.equal(r.autorizacao, a)
  // o mesmo conteúdo dá o mesmo id (identificador por conteúdo), conteúdo diferente dá outro
  assert.equal(autorizacaoDe(rover, { maxPorHora: 5, maxPorDia: 20, tipos: ['postagem'] }).id, a.id)
  assert.notEqual(autorizacaoDe(rover, { maxPorHora: 6, maxPorDia: 20, tipos: ['postagem'] }).id, a.id)
  assert.notEqual(autorizacaoDe(rover, { maxPorHora: 5, maxPorDia: 20, tipos: ['postagem'], emitidaEm: AGORA + 1 }).id, a.id)
  // vale para resposta quando a lista a cobre
  assert.equal(verificarAutorizacaoPermanente(autorizacaoDe(rover), ctx({ objeto: resposta() })).ok, true)
})

test('esquema fechado da autorização: limites sempre presentes, tipos só postagem e resposta', () => {
  const a = autorizacaoDe(rover)
  const sem = (campo) => { const { [campo]: _x, ...resto } = a; return resto }
  for (const campo of ['tipo', 'v', 'id', 'autor', 'emitidaEm', 'expiraEm', 'tipos', 'maxPorHora', 'maxPorDia', 'assinatura']) {
    recusaAutorizacao(sem(campo), 'esquema', {}, `autorizacao.${campo}`)
  }
  recusaAutorizacao({ ...a, extra: 1 }, 'esquema', {}, 'autorizacao.extra')
  recusaAutorizacao({ ...a, v: '0.1' }, 'esquema', {}, 'autorizacao.v')
  recusaAutorizacao({ ...a, id: `ob_${'A'.repeat(43)}` }, 'esquema', {}, 'autorizacao.id')
  recusaAutorizacao({ ...a, tipos: [] }, 'esquema', {}, 'autorizacao.tipos')
  recusaAutorizacao({ ...a, tipos: ['perfil'] }, 'esquema', {}, 'autorizacao.tipos[0]')
  recusaAutorizacao({ ...a, tipos: ['seguir'] }, 'esquema', {}, 'autorizacao.tipos[0]')
  recusaAutorizacao({ ...a, tipos: ['postagem', 'postagem'] }, 'esquema', {}, 'autorizacao.tipos')
  recusaAutorizacao({ ...a, tipos: ['postagem', 'resposta', 'resposta'] }, 'esquema', {}, 'autorizacao.tipos')
  recusaAutorizacao({ ...a, tipos: 'postagem' }, 'esquema', {}, 'autorizacao.tipos')
  const erroMin = recusaAutorizacao({ ...a, tipos: [] }, 'esquema')
  assert.match(erroMin.message, /mínimo é 1/)
  for (const ruim of [0, -1, 1.5, '5', null, LIMITES.autorizacaoPorHoraMax + 1]) recusaAutorizacao({ ...a, maxPorHora: ruim }, 'esquema', {}, 'autorizacao.maxPorHora')
  for (const ruim of [0, -1, 2.5, '20', null, LIMITES.autorizacaoPorDiaMax + 1]) recusaAutorizacao({ ...a, maxPorDia: ruim }, 'esquema', {}, 'autorizacao.maxPorDia')
  for (const ruim of [null, undefined, 'x', 42, [], true]) recusaAutorizacao(ruim, 'autorizacao_invalida', {}, 'autorizacao')
})

test('tetos de limite: 60 por hora e 300 por dia são aceitos, 1 também', () => {
  assert.equal(LIMITES.autorizacaoPorHoraMax, 60)
  assert.equal(LIMITES.autorizacaoPorDiaMax, 300)
  assert.equal(verificarAutorizacaoPermanente(autorizacaoDe(rover, { maxPorHora: 60, maxPorDia: 300 }), ctx()).ok, true)
  assert.equal(verificarAutorizacaoPermanente(autorizacaoDe(rover, { maxPorHora: 1, maxPorDia: 1 }), ctx()).ok, true)
  assert.equal(verificarAutorizacaoPermanente(autorizacaoDe(rover, { maxPorHora: 7, maxPorDia: 7 }), ctx()).ok, true)
})

test('id que não é o hash do conteúdo, mesmo com assinatura boa, é recusado', () => {
  const falso = autorizacaoSob({ id: `au_${'A'.repeat(43)}` })
  recusaAutorizacao(falso, 'autorizacao_invalida', {}, 'autorizacao.id')
  // e conteúdo mexido depois de assinada mantém o id velho: o id denuncia antes da assinatura
  const a = autorizacaoDe(rover)
  recusaAutorizacao({ ...a, maxPorHora: a.maxPorHora + 1 }, 'autorizacao_invalida', {}, 'autorizacao.id')
})

test('autorização de outro rover não vale, nem assinada com chave que não é a de aprovação deste rover', () => {
  recusaAutorizacao(autorizacaoDe(outro), 'autorizacao_invalida', {}, 'autorizacao.autor')
  const feita = autorizacaoDe(outro)
  assert.match(recusaAutorizacao(feita, 'autorizacao_invalida').message, /outro rover/)
  recusaAutorizacao(autorizacaoSob({}, { chave: outro.aprovacao.chavePrivada }), 'autorizacao_invalida', {}, 'autorizacao.assinatura')
  recusaAutorizacao(autorizacaoSob({}, { chave: rover.rede.chavePrivada }), 'autorizacao_invalida', {}, 'autorizacao.assinatura')
  recusaAutorizacao(autorizacaoDe(rover), 'autorizacao_invalida', { chaveDeAprovacao: outro.aprovacao.chavePublica }, 'autorizacao.assinatura')
  recusaAutorizacao(autorizacaoDe(rover), 'autorizacao_invalida', { chaveDeAprovacao: rover.rede.chavePublica }, 'autorizacao.assinatura')
})

test('validade: até 7 dias, positiva; teto por dia nunca menor que o teto por hora', () => {
  assert.equal(LIMITES.autorizacaoValidadeMaxS, 7 * 86400)
  assert.equal(verificarAutorizacaoPermanente(autorizacaoDe(rover, { validadeS: 7 * 86400 }), ctx()).ok, true)
  const longa = recusaAutorizacao(autorizacaoDe(rover, { validadeS: 7 * 86400 + 1 }), 'autorizacao_invalida', {}, 'autorizacao.expiraEm')
  assert.match(longa.message, /no máximo 7 dias/)
  recusaAutorizacao(autorizacaoSob({ expiraEm: AGORA }), 'autorizacao_invalida', {}, 'autorizacao.expiraEm')
  recusaAutorizacao(autorizacaoSob({ expiraEm: AGORA - 5 }), 'autorizacao_invalida', {}, 'autorizacao.expiraEm')
  assert.equal(verificarAutorizacaoPermanente(autorizacaoDe(rover, { validadeS: 1 }), ctx()).ok, true)
  recusaAutorizacao(autorizacaoDe(rover, { maxPorHora: 10, maxPorDia: 9 }), 'autorizacao_invalida', {}, 'autorizacao.maxPorDia')
  assert.equal(verificarAutorizacaoPermanente(autorizacaoDe(rover, { maxPorHora: 10, maxPorDia: 10 }), ctx()).ok, true)
})

test('tipo de objeto fora da lista: a autorização só libera o que ela lista', () => {
  const soResposta = autorizacaoDe(rover, { tipos: ['resposta'] })
  recusaAutorizacao(soResposta, 'autorizacao_invalida', {}, 'autorizacao.tipos')
  assert.equal(verificarAutorizacaoPermanente(soResposta, ctx({ objeto: resposta() })).ok, true)
  const soPostagem = autorizacaoDe(rover, { tipos: ['postagem'] })
  recusaAutorizacao(soPostagem, 'autorizacao_invalida', { objeto: resposta() }, 'autorizacao.tipos')
  for (const tipo of ['perfil', 'seguir', 'deixar-de-seguir', 'reacao', 'denuncia', 'remocao-pelo-autor']) {
    recusaAutorizacao(autorizacaoDe(rover), 'autorizacao_invalida', { objeto: { autor: rover.uid, tipo, criadoEm: AGORA } }, 'autorizacao.tipos')
  }
})

test('tempo: vence na hora exata, não vale para objeto criado depois do vencimento, nem emitida no futuro', () => {
  const a = autorizacaoDe(rover, { emitidaEm: AGORA, validadeS: 1000 })
  assert.equal(verificarAutorizacaoPermanente(a, ctx({ agora: AGORA + 999 })).ok, true)
  recusaAutorizacao(a, 'autorizacao_vencida', { agora: AGORA + 1000 }, 'autorizacao.expiraEm')
  recusaAutorizacao(a, 'autorizacao_vencida', { agora: AGORA + 5000 }, 'autorizacao.expiraEm')
  // criado antes do vencimento, relógio de quem confere já depois: vencida ao vivo, válida na réplica
  const o = objetoDe(rover, 'postagem', { texto: 'oi', topicos: [] }, { criadoEm: AGORA + 999 })
  assert.equal(verificarAutorizacaoPermanente(a, ctx({ objeto: o, agora: AGORA + 5000, aoVivo: false })).ok, true)
  recusaAutorizacao(a, 'autorizacao_vencida', { objeto: o, agora: AGORA + 5000 })
  // objeto criado na hora do vencimento ou depois: vencida, ao vivo ou não
  const tarde = objetoDe(rover, 'postagem', { texto: 'oi', topicos: [] }, { criadoEm: AGORA + 1000 })
  recusaAutorizacao(a, 'autorizacao_vencida', { objeto: tarde, aoVivo: false }, 'autorizacao.expiraEm')
  recusaAutorizacao(a, 'autorizacao_vencida', { objeto: tarde, agora: AGORA }, 'autorizacao.expiraEm')
  // emitida no futuro (além da folga de relógio)
  const futura = autorizacaoDe(rover, { emitidaEm: AGORA + 121 })
  recusaAutorizacao(futura, 'autorizacao_invalida', {}, 'autorizacao.emitidaEm')
  assert.equal(verificarAutorizacaoPermanente(autorizacaoDe(rover, { emitidaEm: AGORA + 120 }), ctx()).ok, true)
  assert.equal(verificarAutorizacaoPermanente(futura, ctx({ aoVivo: false })).ok, true)
})

test('ordem de validação da autorização: esquema, id, autor, assinatura, regras, tipo, vencimento, futuro', () => {
  // vários defeitos juntos: aparece o primeiro da ordem
  const vencidaEDeOutro = autorizacaoDe(outro, { tipos: ['resposta'], validadeS: 10 })
  assert.equal(recusaAutorizacao(vencidaEDeOutro, 'autorizacao_invalida', { agora: AGORA + 5000 }).campo, 'autorizacao.autor')
  const mal = autorizacaoSob({ tipos: ['resposta'], expiraEm: AGORA + 10 }, { chave: outro.aprovacao.chavePrivada })
  assert.equal(recusaAutorizacao(mal, 'autorizacao_invalida', { agora: AGORA + 5000 }).campo, 'autorizacao.assinatura')
  const tipoEVencida = autorizacaoDe(rover, { tipos: ['resposta'], validadeS: 10 })
  assert.equal(recusaAutorizacao(tipoEVencida, 'autorizacao_invalida', { agora: AGORA + 5000 }).campo, 'autorizacao.tipos')
  const vencidaEFutura = autorizacaoDe(rover, { emitidaEm: AGORA - 5000, validadeS: 10 })
  assert.equal(recusaAutorizacao(vencidaEFutura, 'autorizacao_vencida').campo, 'autorizacao.expiraEm')
})

test('autorização assinada por uma chave qualquer não vale, mesmo com tudo certo no resto', () => {
  const dela = criarAutorizacaoPermanente({
    chavePrivadaDeAprovacao: gerarParDeChaves().chavePrivada, autor: rover.uid, emitidaEm: AGORA, validadeS: 100, tipos: ['postagem'], maxPorHora: 1, maxPorDia: 1
  })
  recusaAutorizacao(dela, 'autorizacao_invalida', {}, 'autorizacao.assinatura')
})
