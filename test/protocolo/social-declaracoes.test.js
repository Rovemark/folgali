// SPDX-License-Identifier: AGPL-3.0-or-later
// Declarações da pessoa na 0.3: política, autorização permanente e revogação, cada uma sob o prefixo da própria versão.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LIMITES, TIPOS_AUTORIZAVEIS_V2, TIPOS_AUTORIZAVEIS_V3, TIPOS_EXIGIVEIS_V2, TIPOS_EXIGIVEIS_V3, VERSAO_PROTOCOLO, VERSOES_DE_DECLARACAO,
  assinar, bytesCanonicos, calcularIdDeAutorizacao, declaracaoConfere, dominioDe, tiposAutorizaveisDe, tiposExigiveisDe, validarDeclaracao,
  verificarAutorizacaoPermanente
} from '../../packages/protocolo/src/index.js'
import { AGORA, novoEmissor, novoRover, autorizacaoDe, politicaDe, revogacaoDe } from '../ajuda/mundo.js'

const rover = novoRover(novoEmissor())
const outro = novoRover(novoEmissor())
const objeto = { autor: rover.uid, tipo: 'postagem', criadoEm: AGORA }
const ctx = (extra = {}) => ({ objeto, chaveDeAprovacao: rover.aprovacao.chavePublica, agora: AGORA, ...extra })

test('a versão atual é 0.3 e as declarações existem em 0.2 e 0.3', () => {
  assert.equal(VERSAO_PROTOCOLO, '0.3')
  assert.deepEqual([...VERSOES_DE_DECLARACAO], ['0.2', '0.3'])
  assert.deepEqual([...tiposExigiveisDe('0.2')], [...TIPOS_EXIGIVEIS_V2])
  assert.deepEqual([...tiposExigiveisDe('0.3')], [...TIPOS_EXIGIVEIS_V3])
  assert.deepEqual([...tiposAutorizaveisDe('0.2')], [...TIPOS_AUTORIZAVEIS_V2])
  assert.deepEqual([...tiposAutorizaveisDe('0.3')], [...TIPOS_AUTORIZAVEIS_V3])
  assert.equal(tiposExigiveisDe('0.1').length, 4, 'qualquer versão que não é a 0.3 usa a lista antiga')
})

for (const v of ['0.2', '0.3']) {
  test(`política ${v}: assinada sob o prefixo ${v} com a chave de aprovação; a de rede, o prefixo vizinho e outro autor não valem`, () => {
    const p = politicaDe(rover, { grafo: 'privado', exigirAprovacao: ['seguir'], v })
    assert.equal(p.v, v)
    assert.equal(validarDeclaracao(p).ok, true)
    assert.equal(declaracaoConfere(p, rover.aprovacao.chavePublica), true)
    assert.equal(declaracaoConfere(p, rover.rede.chavePublica), false)
    assert.equal(declaracaoConfere(p, outro.aprovacao.chavePublica), false)
    const outraVersao = v === '0.2' ? '0.3' : '0.2'
    const sem = (({ assinatura: _a, ...r }) => r)(p)
    const comPrefixoVizinho = { ...p, assinatura: assinar(dominioDe(outraVersao, 'politica-da-pessoa'), bytesCanonicos(sem), rover.aprovacao.chavePrivada) }
    assert.equal(declaracaoConfere(comPrefixoVizinho, rover.aprovacao.chavePublica), false)
    const comPrefixoDeRevogacao = { ...p, assinatura: assinar(dominioDe(v, 'revogar-autorizacao'), bytesCanonicos(sem), rover.aprovacao.chavePrivada) }
    assert.equal(declaracaoConfere(comPrefixoDeRevogacao, rover.aprovacao.chavePublica), false)
    // etiqueta trocada, mesma assinatura
    assert.equal(declaracaoConfere({ ...p, v: outraVersao }, rover.aprovacao.chavePublica), false)
  })

  test(`revogação ${v}: id ou "todas", prefixo da versão, esquema fechado`, () => {
    const alvoId = `au_${'A'.repeat(43)}`
    for (const alvo of [alvoId, 'todas']) {
      const r = revogacaoDe(rover, alvo, { v })
      assert.equal(r.v, v)
      assert.equal(validarDeclaracao(r).ok, true)
      assert.equal(declaracaoConfere(r, rover.aprovacao.chavePublica), true)
      assert.equal(declaracaoConfere({ ...r, v: v === '0.2' ? '0.3' : '0.2' }, rover.aprovacao.chavePublica), false)
    }
    assert.equal(validarDeclaracao({ ...revogacaoDe(rover, 'todas', { v }), alvo: 'tudo' }).ok, false)
    assert.equal(validarDeclaracao({ ...revogacaoDe(rover, 'todas', { v }), extra: 1 }).ok, false)
  })

  test(`autorização ${v}: só os tipos da versão, id por conteúdo, prefixo da versão`, () => {
    const lista = tiposAutorizaveisDe(v)
    const a = autorizacaoDe(rover, { tipos: [...lista], v, maxPorHora: 5, maxPorDia: 20 })
    assert.equal(a.v, v)
    assert.equal(verificarAutorizacaoPermanente(a, ctx()).ok, true, verificarAutorizacaoPermanente(a, ctx()).erro?.message)
    assert.equal(a.id, calcularIdDeAutorizacao(a))
    const fora = v === '0.2' ? 'recado' : 'depoimento'
    const sem = (({ id: _i, assinatura: _a, ...r }) => r)(a)
    const emitir = (corpo, dominio = dominioDe(v, 'autorizacao-permanente')) => {
      const base = { ...sem, ...corpo }
      const comId = { ...base, id: calcularIdDeAutorizacao(base) }
      return { ...comId, assinatura: assinar(dominio, bytesCanonicos(comId), rover.aprovacao.chavePrivada) }
    }
    const r = verificarAutorizacaoPermanente(emitir({ tipos: [fora] }), ctx())
    assert.equal(r.ok, false)
    assert.equal(r.erro.codigo, 'esquema')
    assert.equal(r.erro.campo, 'autorizacao.tipos[0]')
    const outraVersao = v === '0.2' ? '0.3' : '0.2'
    const prefixoVizinho = verificarAutorizacaoPermanente(emitir({}, dominioDe(outraVersao, 'autorizacao-permanente')), ctx())
    assert.equal(prefixoVizinho.erro.codigo, 'autorizacao_invalida')
    assert.equal(prefixoVizinho.erro.campo, 'autorizacao.assinatura')
  })
}

test('política 0.2 só exige as 4 ações antigas; a 0.3 exige qualquer das 18 livres e recusa o resto', () => {
  assert.equal(validarDeclaracao(politicaDe(rover, { exigirAprovacao: [...TIPOS_EXIGIVEIS_V2] })).ok, true)
  for (const novo of TIPOS_EXIGIVEIS_V3.filter((t) => !TIPOS_EXIGIVEIS_V2.includes(t))) {
    assert.equal(validarDeclaracao(politicaDe(rover, { exigirAprovacao: [novo] })).ok, false, `0.2 não conhece ${novo}`)
    assert.equal(validarDeclaracao(politicaDe(rover, { exigirAprovacao: [novo], v: '0.3' })).ok, true, `0.3 conhece ${novo}`)
  }
  assert.equal(validarDeclaracao(politicaDe(rover, { exigirAprovacao: [...TIPOS_EXIGIVEIS_V3], v: '0.3' })).ok, true, 'as 18 de uma vez')
  for (const nunca of ['perfil', 'postagem', 'recado', 'topico', 'remocao-pelo-autor', 'denuncia-falsa']) {
    assert.equal(validarDeclaracao(politicaDe(rover, { exigirAprovacao: [nunca], v: '0.3' })).ok, false, nunca)
  }
  assert.equal(validarDeclaracao(politicaDe(rover, { exigirAprovacao: ['selo', 'selo'], v: '0.3' })).ok, false)
})

test('declaração de versão desconhecida ou ausente é "esquema" no campo da versão', () => {
  const p = politicaDe(rover, { v: '0.3' })
  for (const v of ['0.1', '0.4', '', null, 0.3]) {
    const r = validarDeclaracao({ ...p, v })
    assert.equal(r.ok, false, String(v))
    assert.equal(r.erro.codigo, 'esquema')
    assert.equal(r.erro.campo, 'declaracao.v')
  }
  const { v: _v, ...semV } = p
  assert.equal(validarDeclaracao(semV).erro.campo, 'declaracao.v')
  assert.equal(validarDeclaracao({ ...p, tipo: 'outra' }).erro.campo, 'declaracao.tipo')
})

test('a autorização 0.3 mantém os tetos e a validade de 7 dias; versão desconhecida é "esquema" (não "autorizacao_invalida")', () => {
  const doRecado = ctx({ objeto: { ...objeto, tipo: 'recado' } })
  const a = autorizacaoDe(rover, { tipos: ['recado'], v: '0.3', validadeS: LIMITES.autorizacaoValidadeMaxS })
  assert.equal(verificarAutorizacaoPermanente(a, doRecado).ok, true)
  assert.equal(verificarAutorizacaoPermanente(a, ctx()).erro.campo, 'autorizacao.tipos', 'não cobre postagem')
  const longa = autorizacaoDe(rover, { tipos: ['recado'], v: '0.3', validadeS: LIMITES.autorizacaoValidadeMaxS + 1 })
  assert.equal(verificarAutorizacaoPermanente(longa, doRecado).erro.campo, 'autorizacao.expiraEm')
  const r = verificarAutorizacaoPermanente({ ...a, v: '0.4' }, doRecado)
  assert.equal(r.erro.codigo, 'esquema')
  assert.equal(r.erro.campo, 'autorizacao.v')
  assert.equal(verificarAutorizacaoPermanente({}, ctx()).erro.codigo, 'esquema')
  assert.equal(verificarAutorizacaoPermanente(null, ctx()).erro.codigo, 'autorizacao_invalida')
})
