// SPDX-License-Identifier: AGPL-3.0-or-later
// Edges of private messages that mutation testing showed to be untested: pagination, count per side, exact retention deadlines,
// report ceiling, ceilings on pending requests and a rover without a profile.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  MESSAGE_STRUCTURE, MESSAGE_REQUIRES_APPROVAL, MESSAGE_TIMES as T, cipherPrivateKeyFromSeed, cipherPublicKeyOf, encryptMessage,
  createObject, generateCipherKeyPair
} from '../../packages/protocol/src/index.js'
import { clearMessages } from '../../packages/relay/src/messages.js'
import { approve } from '../helpers/world.js'
import { DAY, codeOf, fresh } from '../helpers/network.js'
import { newRoverInWorld } from '../helpers/test-relay.js'

function world(options = {}) {
  const r = fresh({ mensagens: true, ...options })
  const { m } = r
  const m4 = (rover, type, body) => {
    const object = createObject({ v: '0.4', tipo: type, autor: rover.uid, criadoEm: m.relogio.agora, previo: null, corpo: body, chavePrivada: rover.rede.chavePrivada })
    const env = { objeto: object }
    if (MESSAGE_REQUIRES_APPROVAL[type]) env.aprovacao = approve(rover, object, { aprovadoEm: m.relogio.agora })
    return { ...m.rele.aceitar(env), objeto: object }
  }
  const withKey = (o = { validadeS: 89 * DAY }) => {
    const x = r.rover(o)
    x.cifra = generateCipherKeyPair()
    m4(x, 'chave-de-cifra', { chave: x.cifra.publicKey })
    return x
  }
  const acceptedConversation = (a, b, text = 'Podemos conversar?') => {
    const c = m4(a, 'conversa-pedir', { alvo: b.uid, texto: text }).id
    m4(b, 'conversa-decidir', { conversa: c, decisao: 'aceitar' })
    return c
  }
  const sends = (from, to, conversation, text) => {
    const c = encryptMessage({ texto: text, conversa: conversation, de: from.uid, para: to.uid, criadoEm: m.relogio.agora, networkPrivateKey: from.rede.chavePrivada, chavePrivadaDeCifra: from.cifra.chavePrivada, otherCipherPublicKey: to.cifra.publicKey })
    return { ...m4(from, 'mensagem', c.corpo), assinatura: c.assinatura }
  }
  const M = m.rele.mensagens
  const cred = (x) => r.como(x, '/v1/x')
  return { ...r, m4, withKey, acceptedConversation, sends, M, cred }
}

test('pagination: conversations and messages come in pages with a cursor, without repeating or skipping', () => {
  const w = world()
  const ana = w.withKey()
  const friends = [w.withKey(), w.withKey(), w.withKey()]
  const conversations = friends.map((b) => { w.amigos(ana, b, 0); w.advance(1); return w.acceptedConversation(ana, b) })
  const p1 = w.M.conversationsOf(ana.uid, { limite: 2, credencial: w.cred(ana) })
  assert.equal(p1.itens.length, 2)
  assert.notEqual(p1.proximo, null)
  const p2 = w.M.conversationsOf(ana.uid, { limite: 2, antes: p1.proximo, credencial: w.cred(ana) })
  assert.equal(p2.itens.length, 1)
  assert.equal(p2.proximo, null)
  assert.deepEqual([...p1.itens, ...p2.itens].map((c) => c.id), [...conversations].reverse())
  const c = conversations[0]
  const ids = ['um', 'dois', 'três'].map((t) => { w.advance(1); return w.sends(ana, friends[0], c, `mensagem ${t}`).id })
  const m1 = w.M.messagesOf(ana.uid, c, { limite: 2, credencial: w.cred(ana) })
  const m2 = w.M.messagesOf(ana.uid, c, { limite: 2, antes: m1.proximo, credencial: w.cred(ana) })
  assert.equal(m2.proximo, null)
  assert.deepEqual([...m1.itens, ...m2.itens].map((e) => e.objeto.id), [...ids].reverse())
  assert.equal(w.M.messagesOf(ana.uid, c, { limite: 3, credencial: w.cred(ana) }).proximo, null)
})

test('count per side: the card counts only the messages that side still keeps', () => {
  const w = world()
  const ana = w.withKey()
  const beto = w.withKey()
  w.amigos(ana, beto, 0)
  const c = w.acceptedConversation(ana, beto)
  w.sends(ana, beto, c, 'uma')
  w.advance(1)
  w.sends(beto, ana, c, 'duas')
  w.m4(ana, 'conversa-apagar', { conversa: c, mensagem: null })
  assert.equal(w.M.conversationOf(ana.uid, c, { credencial: w.cred(ana) }).mensagens, 0)
  assert.equal(w.M.conversationOf(beto.uid, c, { credencial: w.cred(beto) }).mensagens, 2)
})

test('retention, exact deadlines: a refusal disappears after 7 days, a pending request and its trace wait 30, a report 180', () => {
  const w = world()
  const ana = w.withKey()
  const beto = w.withKey()
  const caio = w.withKey()
  w.amigos(ana, beto, 0)
  w.amigos(ana, caio, 0)
  const refused = w.m4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'oi' }).id
  w.m4(beto, 'conversa-decidir', { conversa: refused, decisao: 'recusar' })
  const pending = w.m4(ana, 'conversa-pedir', { alvo: caio.uid, texto: 'oi, Caio' }).id
  const account = (sql, p = {}) => w.rele.store.um(`SELECT COUNT(*) AS n FROM ${sql}`, p).n
  w.advance(T.conversationRequestRefusalS - 5)
  w.rele.limpar()
  assert.equal(account('conversas WHERE id = :id', { id: refused }), 1)
  w.advance(10)
  w.rele.limpar()
  assert.equal(account('conversas WHERE id = :id', { id: refused }), 0)
  assert.equal(account('conversas WHERE id = :id', { id: pending }), 1, 'pending still within the 30 days')
  assert.ok(account('objetos WHERE id = :id', { id: pending }) === 1, 'trace still within the 30 days')
  w.advance(T.requestRetentionS - T.conversationRequestRefusalS)
  w.rele.limpar()
  assert.equal(account('conversas WHERE id = :id', { id: pending }), 0)
  assert.equal(account('objetos WHERE id = :id', { id: pending }), 0)
  // report: 180 days
  const c = w.acceptedConversation(ana, beto, 'de novo?')
  const msg = w.sends(ana, beto, c, 'texto denunciado')
  w.m4(beto, 'mensagem-denuncia', { mensagem: msg.id, motivo: 'spam', texto: 'texto denunciado', assinatura: msg.assinatura })
  w.advance(179 * DAY)
  w.rele.limpar()
  assert.equal(account('denuncias_de_mensagem'), 1)
  w.advance(2 * DAY)
  w.rele.limpar()
  assert.equal(account('denuncias_de_mensagem'), 0)
})

test('message report ceiling: 10 per day per reporter', () => {
  const w = world({ rates: { porTipo: {} } })
  const ana = w.withKey()
  const beto = w.withKey()
  w.amigos(ana, beto, 0)
  const c = w.acceptedConversation(ana, beto)
  // spaced past the burst per conversation (10 a minute, proposal 0014): this test is about the report ceiling
  const msgs = Array.from({ length: 11 }, (_, i) => { w.advance(7); return w.sends(ana, beto, c, `mensagem ${i}`) })
  const rep = (x, i) => codeOf(() => w.m4(beto, 'mensagem-denuncia', { mensagem: x.id, motivo: 'spam', texto: `mensagem ${i}`, assinatura: x.assinatura }))
  for (let i = 0; i < 10; i++) assert.equal(rep(msgs[i], i), 'ok')
  assert.equal(rep(msgs[10], 10), 'limite_de_taxa')
  w.advance(DAY + 1)
  // within the message retention period, the report counts again the next day
  assert.equal(rep(msgs[10], 10), 'ok')
})

test('pending request ceilings: 20 sent per rover, 50 received per rover', () => {
  const w = world({ rates: { porTipo: {} } })
  const ana = w.withKey()
  const others = Array.from({ length: MESSAGE_STRUCTURE.sentPendingRequests + 1 }, () => w.withKey())
  others.forEach((b) => w.amigos(ana, b, 0))
  others.slice(0, -1).forEach((b) => w.m4(ana, 'conversa-pedir', { alvo: b.uid, texto: 'oi' }))
  assert.equal(codeOf(() => w.m4(ana, 'conversa-pedir', { alvo: others.at(-1).uid, texto: 'oi' })), 'limite_de_estrutura')
  const target = w.withKey()
  const many = Array.from({ length: MESSAGE_STRUCTURE.receivedPendingRequests + 1 }, () => w.withKey())
  many.forEach((x) => w.amigos(x, target, 0))
  many.slice(0, -1).forEach((x) => w.m4(x, 'conversa-pedir', { alvo: target.uid, texto: 'oi' }))
  assert.equal(codeOf(() => w.m4(many.at(-1), 'conversa-pedir', { alvo: target.uid, texto: 'oi' })), 'limite_de_estrutura')
})

test('a rover without a profile does not publish a 0.4 object (perfil_primeiro), even with the attestation attached', () => {
  const w = world()
  const newValue = newRoverInWorld(w.m)
  const object = createObject({ v: '0.4', tipo: 'chave-de-cifra', autor: newValue.uid, criadoEm: w.m.relogio.agora, previo: null, corpo: { chave: generateCipherKeyPair().publicKey }, chavePrivada: newValue.rede.chavePrivada })
  assert.equal(codeOf(() => w.rele.aceitar({ objeto: object, atestado: newValue.atestado })), 'perfil_primeiro')
})

test('cipher seed: only 32 bytes, and the same seed gives the same key', () => {
  const s = randomBytes(32)
  assert.equal(cipherPublicKeyOf(cipherPrivateKeyFromSeed(s)), cipherPublicKeyOf(cipherPrivateKeyFromSeed(Buffer.from(s))))
  for (const crooked_ of [randomBytes(31), randomBytes(33), 'x'.repeat(32)]) assert.throws(() => cipherPrivateKeyFromSeed(crooked_), TypeError)
})

// ---- edges that mutation testing showed to be untested (debts, 2026-11-17) ----

test('deciding on a conversation that does not exist or that the author is not part of: the same answer, nao_encontrado on the conversation field', () => {
  const w = world()
  const ana = w.withKey()
  const beto = w.withKey()
  const caio = w.withKey()
  w.amigos(ana, beto, 0)
  const c = w.m4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'oi' }).id
  const error = (f) => { try { f(); return null } catch (e) { return [e.codigo, e.campo] } }
  const nonexistent = `ob_${'A'.repeat(43)}`
  assert.deepEqual(error(() => w.m4(beto, 'conversa-decidir', { conversa: nonexistent, decisao: 'aceitar' })), ['nao_encontrado', 'objeto.corpo.conversa'])
  assert.deepEqual(error(() => w.m4(caio, 'conversa-decidir', { conversa: c, decisao: 'aceitar' })), ['nao_encontrado', 'objeto.corpo.conversa'], 'outside the conversation')
  assert.equal(w.m4(beto, 'conversa-decidir', { conversa: c, decisao: 'aceitar' }).resultado, 'ativa', 'control: the recipient decides')
})

test('after a refusal: Retry-After says exactly what is left of the 7 days, and at the exact second of the 7 days the request goes through', () => {
  const w = world()
  const ana = w.withKey()
  const beto = w.withKey()
  w.amigos(ana, beto, 0)
  const c = w.m4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'oi' }).id
  w.m4(beto, 'conversa-decidir', { conversa: c, decisao: 'recusar' })
  w.advance(DAY)
  let error = null
  try { w.m4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'oi de novo' }) } catch (e) { error = e }
  assert.equal(error?.codigo, 'limite_de_taxa')
  assert.equal(error.retryAfterS, T.conversationRequestRefusalS - DAY)
  w.advance(T.conversationRequestRefusalS - DAY - 1)
  assert.equal(codeOf(() => w.m4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'oi de novo' })), 'limite_de_taxa', 'one second before')
  w.advance(1)
  assert.equal(codeOf(() => w.m4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'oi de novo' })), 'ok', 'at the exact second of the 7 days')
})

test('ceiling on accepted conversations: with 199 active it accepts the 200th; with 200 active, the next is limite_de_estrutura', () => {
  const w = world({ rates: { porTipo: {} } })
  const ana = w.withKey()
  const cap = MESSAGE_STRUCTURE.activeConversations
  assert.equal(cap, 200)
  // the existing conversations go straight into the database (the rules for each were already proven above); half in each direction
  const ins = (i) => w.rele.store.executar(
    `INSERT INTO conversas (id, par, de, para, estado, pedido, criada_em, atualizada_em, ultima_mensagem_em, seq_atividade)
     VALUES (:id, :par, :de, :para, 'ativa', NULL, :t, :t, NULL, :seq)`,
    { id: `ob_falsa${String(i).padStart(38, '0')}`, par: `par-${i}`, de: i % 2 ? ana.uid : `rvr_outro${i}`, para: i % 2 ? `rvr_outro${i}` : ana.uid, t: w.m.relogio.agora, seq: 1000 + i }
  )
  for (let i = 0; i < cap - 1; i++) ins(i)
  const asks = () => { const b = w.withKey(); w.amigos(ana, b, 0); return w.m4(b, 'conversa-pedir', { alvo: ana.uid, texto: 'oi' }).id }
  assert.equal(w.m4(ana, 'conversa-decidir', { conversa: asks(), decisao: 'aceitar' }).resultado, 'ativa', 'a 200ª')
  assert.equal(codeOf(() => w.m4(ana, 'conversa-decidir', { conversa: asks(), decisao: 'aceitar' })), 'limite_de_estrutura', 'a 201ª')
})

test('pagination, edge: with exactly `limite` conversations there is no next page', () => {
  const w = world()
  const ana = w.withKey()
  const friends = [w.withKey(), w.withKey()]
  friends.forEach((b) => { w.amigos(ana, b, 0); w.advance(1); w.acceptedConversation(ana, b) })
  const p = w.M.conversationsOf(ana.uid, { limite: 2, credencial: w.cred(ana) })
  assert.equal(p.itens.length, 2)
  assert.equal(p.proximo, null)
  const c = w.M.conversationsOf(ana.uid, { credencial: w.cred(ana) }).itens[0].id
  w.sends(ana, friends[1], c, 'uma')
  w.advance(1)
  w.sends(ana, friends[1], c, 'duas')
  const m = w.M.messagesOf(ana.uid, c, { limite: 2, credencial: w.cred(ana) })
  assert.equal(m.itens.length, 2)
  assert.equal(m.proximo, null)
})

test('listReports without a limit returns the 50 newest', () => {
  const w = world()
  for (let i = 0; i < 51; i++) {
    w.rele.store.executar(
      'INSERT INTO denuncias_de_mensagem (mensagem, autor_do_alvo, motivo, texto, pseudonimo, criado_em) VALUES (:m, :a, :mo, :t, :p, :c)',
      { m: `ob_m${i}`, a: 'rvr_x', mo: 'spam', t: `texto ${i}`, p: `p${i}`, c: w.m.relogio.agora }
    )
  }
  const list = w.M.listReports()
  assert.equal(list.length, 50)
  assert.equal(list[0].texto, 'texto 50')
  assert.equal(w.M.listReports({ limite: 51 }).length, 51)
})

test('clearMessages called directly: a report is kept 180 days by default (one-second edge); an accepted conversation request disappears at 30 days', () => {
  const w = world()
  const a = w.rele.store
  const now = w.m.relogio.agora
  const rep = (name, created) => a.executar(
    'INSERT INTO denuncias_de_mensagem (mensagem, autor_do_alvo, motivo, texto, pseudonimo, criado_em) VALUES (:m, :a, :mo, :t, :p, :c)',
    { m: name, a: 'rvr_x', mo: 'spam', t: 'x', p: name, c: created }
  )
  rep('velha', now - 180 * 86400 - 1)
  rep('no-limite', now - 180 * 86400)
  rep('nova', now - 180 * 86400 + 1)
  // retained request of an ACTIVE conversation: one of 30 days and one second, another recent
  const conv = (id, created) => a.executar(
    `INSERT INTO conversas (id, par, de, para, estado, pedido, criada_em, atualizada_em, ultima_mensagem_em, seq_atividade)
     VALUES (:id, :id, 'rvr_a', 'rvr_b', 'ativa', '{"objeto":{}}', :c, :c, NULL, 1)`, { id, c: created }
  )
  conv('antiga', now - T.requestRetentionS - 1)
  conv('recente', now - 60)
  clearMessages(a, now)
  assert.deepEqual(a.todos('SELECT mensagem FROM denuncias_de_mensagem ORDER BY mensagem').map((l) => l.mensagem), ['no-limite', 'nova'])
  assert.deepEqual(a.todos('SELECT id, pedido IS NULL AS semPedido FROM conversas ORDER BY id').map((l) => [l.id, l.semPedido]), [['antiga', 1], ['recente', 0]])
  // with another deadline, the other deadline applies
  clearMessages(a, now, 1)
  assert.equal(a.um('SELECT COUNT(*) AS n FROM denuncias_de_mensagem').n, 0)
})
