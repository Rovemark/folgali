// SPDX-License-Identifier: AGPL-3.0-or-later
// Proposal 0014 (owner decision of 2026-11-25): the rover sends private messages ALONE, "free, with the filter". The optional package
// `mensagens` of the "0.6" authorization releases conversa-pedir, conversa-decidir and mensagem; without it they keep asking for the
// approval at each use; the relay ceilings and the burst per conversation hold for everyone; the default package does not change.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  OPTIONAL_TIME_OFF_BUNDLES, TIME_OFF_DEFAULT, BURST_PER_CONVERSATION, FEATURE_MESSAGES_WITHOUT_APPROVAL, MESSAGE_RATE, encryptMessage, createObject,
  createTimeOffBundle, generateCipherKeyPair, authorizableTypesOf
} from '../../packages/protocol/src/index.js'
import { approve, authorizationOf } from '../helpers/world.js'
import { codeOf, errorOf, fresh } from '../helpers/network.js'

/** A world with messages ON; `m4` publishes a 0.4 object with an approval, an authorization, or neither. */
function world() {
  const r = fresh({ mensagens: true })
  const { m } = r
  const m4 = (rover, type, body, { aprovada: approved = false, autorizacao: authorization } = {}) => {
    const object = createObject({ v: '0.4', tipo: type, autor: rover.uid, criadoEm: m.relogio.agora, previo: null, corpo: body, chavePrivada: rover.rede.chavePrivada })
    const env = { objeto: object, ...(authorization ? { autorizacao: authorization } : {}) }
    if (approved) env.aprovacao = approve(rover, object, { aprovadoEm: m.relogio.agora })
    return { ...m.rele.aceitar(env), objeto: object }
  }
  const withKey = () => {
    const x = r.rover()
    x.cifra = generateCipherKeyPair()
    m4(x, 'chave-de-cifra', { chave: x.cifra.publicKey })
    return x
  }
  const bundle = (x, extra = {}) => createTimeOffBundle({ chavePrivadaDeAprovacao: x.aprovacao.chavePrivada, autor: x.uid, emitidaEm: m.relogio.agora, postagensPorDia: 20, comentariosPorDia: 100, opcionais: ['mensagens'], ...extra })
    .find((a) => a.tipos.includes('mensagem'))
  const bodyOf = (from, to, conversation, text) => encryptMessage({
    texto: text, conversa: conversation, de: from.uid, para: to.uid, criadoEm: m.relogio.agora, networkPrivateKey: from.rede.chavePrivada, chavePrivadaDeCifra: from.cifra.chavePrivada, otherCipherPublicKey: to.cifra.publicKey
  }).corpo
  return { ...r, m4, withKey, pacote: bundle, bodyOf }
}

test('the protocol: the optional package, the types it covers, the resource name and the ceilings', () => {
  assert.equal(FEATURE_MESSAGES_WITHOUT_APPROVAL, 'mensagens-sem-aprovacao')
  const p = OPTIONAL_TIME_OFF_BUNDLES.find((x) => x.nome === 'mensagens')
  assert.deepEqual([...p.tipos], ['conversa-pedir', 'conversa-decidir', 'mensagem'])
  assert.deepEqual({ ...p.porTipoPorDia }, { 'conversa-pedir': 30, 'conversa-decidir': 30, mensagem: 300 })
  for (const t of p.tipos) assert.ok(authorizableTypesOf('0.6').includes(t), t)
  for (const v of ['0.2', '0.3']) assert.equal(authorizableTypesOf(v).includes('mensagem'), false, `the "${v}" authorization never covers a message`)
  assert.deepEqual([...MESSAGE_RATE['conversa-pedir']], [[3600, 10], [86400, 30]])
  assert.deepEqual([...MESSAGE_RATE.mensagem], [[3600, 60], [86400, 300]])
  assert.deepEqual(BURST_PER_CONVERSATION.map((j) => [...j]), [[60, 10], [3600, 120]])
  // the default package does not change: three authorizations, no message type
  assert.deepEqual(TIME_OFF_DEFAULT.pacotes.map((x) => x.nome), ['postagens', 'conversa', 'perfil'])
})

test('with the package the rover asks, decides and writes alone; without it, the approval at each use is still asked', () => {
  const w = world()
  const ana = w.withKey()
  const beto = w.withKey()
  w.amigos(ana, beto)
  // without the package and without an approval: refused, as in 0.4.0
  assert.equal(codeOf(() => w.m4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'Posso te escrever?' })), 'sem_aprovacao')
  const pa = w.pacote(ana)
  const pb = w.pacote(beto)
  const request = w.m4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'Posso te escrever?' }, { autorizacao: pa })
  assert.equal(request.resultado, 'pendente')
  assert.equal(w.m4(beto, 'conversa-decidir', { conversa: request.id, decisao: 'aceitar' }, { autorizacao: pb }).resultado, 'ativa')
  const msg = w.m4(ana, 'mensagem', w.bodyOf(ana, beto, request.id, 'Oi, Beto, vi a sua foto do parque.'), { autorizacao: pa })
  assert.equal(msg.estado, 'aceito')
  // the stored envelope carries the authorization, not an approval
  const env = JSON.parse(w.m.store.um('SELECT envelope FROM mensagens WHERE id = :id', { id: msg.objeto.id }).envelope)
  assert.equal(env.autorizacao.id, pa.id)
  assert.equal('aprovacao' in env, false)
  // beto without his package still needs the approval to write back
  assert.equal(codeOf(() => w.m4(beto, 'mensagem', w.bodyOf(beto, ana, request.id, 'Oi!'))), 'sem_aprovacao')
  assert.equal(w.m4(beto, 'mensagem', w.bodyOf(beto, ana, request.id, 'Oi!'), { aprovada: true }).estado, 'aceito')
  // an authorization of the default package (posts) does not cover a message
  const [posts] = createTimeOffBundle({ chavePrivadaDeAprovacao: ana.aprovacao.chavePrivada, autor: ana.uid, emitidaEm: w.m.relogio.agora, postagensPorDia: 20, comentariosPorDia: 100 })
  const e = errorOf(() => w.m4(ana, 'mensagem', w.bodyOf(ana, beto, request.id, 'De novo.'), { autorizacao: posts }))
  assert.deepEqual([e.codigo, e.campo], ['autorizacao_invalida', 'autorizacao.tipos'])
})

test('the ceilings hold: the owner\'s day on the package, and the burst per conversation for everyone', () => {
  const w = world()
  const ana = w.withKey()
  const beto = w.withKey()
  w.amigos(ana, beto)
  const short = authorizationOf(ana, { emitidaEm: w.m.relogio.agora, tipos: ['conversa-pedir', 'mensagem'], maxPorHora: 3, maxPorDia: 3, v: '0.6', validadeS: null })
  const c = w.m4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'Posso te escrever?' }, { autorizacao: short }).id
  w.m4(beto, 'conversa-decidir', { conversa: c, decisao: 'aceitar' }, { aprovada: true })
  w.m4(ana, 'mensagem', w.bodyOf(ana, beto, c, 'Um.'), { autorizacao: short })
  w.m4(ana, 'mensagem', w.bodyOf(ana, beto, c, 'Dois.'), { autorizacao: short })
  const exhausted = errorOf(() => w.m4(ana, 'mensagem', w.bodyOf(ana, beto, c, 'Três.'), { autorizacao: short }))
  assert.equal(exhausted.codigo, 'autorizacao_esgotada', 'the request counted too: three in the day')
  // the burst: 10 messages in a minute in one conversation, even with a generous package
  const broad = w.pacote(ana)
  w.advance(61)
  for (let i = 0; i < 10; i++) w.m4(ana, 'mensagem', w.bodyOf(ana, beto, c, `Rajada ${i}.`), { autorizacao: broad })
  const burst = errorOf(() => w.m4(ana, 'mensagem', w.bodyOf(ana, beto, c, 'Mais uma.'), { autorizacao: broad }))
  assert.equal(burst.codigo, 'limite_de_taxa')
  assert.deepEqual(burst.limite, { max: 10, janelaS: 60 })
  w.advance(61)
  assert.equal(w.m4(ana, 'mensagem', w.bodyOf(ana, beto, c, 'Depois de um minuto.'), { autorizacao: broad }).estado, 'aceito')
})

test('revoking the package turns the rover\'s messages off at once', () => {
  const w = world()
  const ana = w.withKey()
  const beto = w.withKey()
  w.amigos(ana, beto)
  const pa = w.pacote(ana)
  const c = w.m4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'Posso te escrever?' }, { autorizacao: pa }).id
  w.m4(beto, 'conversa-decidir', { conversa: c, decisao: 'aceitar' }, { aprovada: true })
  w.m.store.executar('INSERT INTO autorizacoes_revogadas (autor, alvo, em, recebida_em) VALUES (:autor, :alvo, :em, :em)', { autor: ana.uid, alvo: pa.id, em: w.m.relogio.agora })
  assert.equal(codeOf(() => w.m4(ana, 'mensagem', w.bodyOf(ana, beto, c, 'Ainda posso?'), { autorizacao: pa })), 'autorizacao_revogada')
})

test('/v1/info announces the resource only with messages on; the package is listed with its ceilings', () => {
  const linked = world().rele.info()
  assert.ok(linked.recursos.includes('mensagens-sem-aprovacao'))
  const p = linked.tetos.folga.pacotesOpcionais.find((x) => x.nome === 'mensagens')
  assert.deepEqual(p, { nome: 'mensagens', tipos: ['conversa-pedir', 'conversa-decidir', 'mensagem'], maxPorHora: 60, maxPorDia: 360, porTipoPorDia: { 'conversa-pedir': 30, 'conversa-decidir': 30, mensagem: 300 } })
  assert.equal(fresh().rele.info().recursos.includes('mensagens-sem-aprovacao'), false)
})
