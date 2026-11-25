// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test'
import assert from 'node:assert/strict'
import { gerarParDeChaves, verificarAtestadoDeHandle } from '../../packages/protocolo/src/index.js'
import { ProvedorDeAtestados, ProvedorEstatico } from '../../packages/rele/src/provedor.js'
import { ProvedorDeTeste } from '../../packages/rele/src/provedor-de-teste.js'
import { AGORA, novoUid } from '../ajuda/mundo.js'

test('a interface base não funciona sozinha: quem implementa tem de preencher tudo', () => {
  const base = new ProvedorDeAtestados()
  assert.throws(() => base.nome, /não implementado/)
  assert.throws(() => base.emissoresConfiaveis(), /não implementado/)
  assert.throws(() => base.revogados(), /não implementado/)
  assert.throws(() => base.versao, /não implementado/)
})

test('provedor estático: lista de emissores, revogação e versão que sobe a cada mudança', () => {
  const a = gerarParDeChaves().chavePublica
  const b = gerarParDeChaves().chavePublica
  const p = new ProvedorEstatico({ emissores: [a, b], nome: 'meu' })
  assert.equal(p.nome, 'meu')
  assert.deepEqual(p.emissoresConfiaveis(), [a, b])
  const v0 = p.versao
  const uid = novoUid()
  p.revogar(a, uid)
  assert.equal(p.versao, v0 + 1)
  assert.deepEqual(p.revogados(), [{ emissor: a, uid }])
  p.desfazerRevogacao(a, uid)
  assert.equal(p.versao, v0 + 2)
  assert.deepEqual(p.revogados(), [])
  p.deixarDeConfiar(a)
  assert.equal(p.versao, v0 + 3)
  assert.deepEqual(p.emissoresConfiaveis(), [b])
})

test('o que o provedor devolve é cópia: mexer nela não muda a configuração', () => {
  const a = gerarParDeChaves().chavePublica
  const p = new ProvedorEstatico({ emissores: [a], revogados: [{ emissor: a, uid: novoUid() }] })
  p.emissoresConfiaveis().push('intruso')
  p.revogados()[0].uid = 'outro'
  p.revogados().push({ emissor: a, uid: 'mais um' })
  assert.deepEqual(p.emissoresConfiaveis(), [a])
  assert.equal(p.revogados().length, 1)
  assert.notEqual(p.revogados()[0].uid, 'outro')
})

test('desfazer a revogação de um rover não solta a de outro', () => {
  const a = gerarParDeChaves().chavePublica
  const u1 = novoUid()
  const u2 = novoUid()
  const p = new ProvedorEstatico({ emissores: [a], revogados: [{ emissor: a, uid: u1 }, { emissor: a, uid: u2 }] })
  p.desfazerRevogacao(a, u1)
  assert.deepEqual(p.revogados(), [{ emissor: a, uid: u2 }])
  p.desfazerRevogacao(gerarParDeChaves().chavePublica, u2) // outro emissor não desfaz
  assert.equal(p.revogados().length, 1)
})

test('provedor de teste emite atestados que o protocolo aceita', () => {
  const p = new ProvedorDeTeste()
  const rede = gerarParDeChaves()
  const aprov = gerarParDeChaves()
  const at = p.emitir({ uid: novoUid(), handle: 'quem.quer', chave: rede.chavePublica, chaveAprovacao: aprov.chavePublica, emitidoEm: AGORA, validadeS: 100 })
  assert.equal(at.expiraEm - at.emitidoEm, 100)
  assert.equal(verificarAtestadoDeHandle(at, { agora: AGORA, emissoresConfiaveis: p.emissoresConfiaveis() }).ok, true)
  const padrao = p.emitir({ uid: novoUid(), handle: 'quem.quer', chave: rede.chavePublica, chaveAprovacao: aprov.chavePublica, emitidoEm: AGORA })
  assert.equal(padrao.expiraEm - padrao.emitidoEm, 30 * 86400)
  assert.equal(p.nome, 'teste')
})
