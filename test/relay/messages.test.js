// SPDX-License-Identifier: AGPL-3.0-or-later
// Private messages in the relay (revision 0.4.0, PROTOCOL.md section 15): friendship, request with acceptance, encryption, approval, block, mute,
// report with a revealed letter, retention, size, rate and privacy. No HTTP (see messages-http.test.js).
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  MESSAGE_REQUIRES_APPROVAL, MESSAGE_TIMES, signLetter, encryptMessage, createObject, decryptMessage, generateCipherKeyPair, generateKeyPair, toB64u
} from '../../packages/protocol/src/index.js'
import { approve, authorizationOf } from '../helpers/world.js'
import { DAY, codeOf, as, fresh } from '../helpers/network.js'
import { publish } from '../helpers/test-relay.js'

/** A world with messages ON and shortcuts for 0.4. */
function world(options = {}) {
  const r = fresh({ mensagens: true, ...options })
  const { m } = r
  /** Publishes a 0.4 object (outside the chain) with the approval when the type requires it. */
  const m4 = (rover, type, body, { aprovada: approved = MESSAGE_REQUIRES_APPROVAL[type], criadoEm: createdAt = m.relogio.agora, extra = {} } = {}) => {
    const object = createObject({ v: '0.4', tipo: type, autor: rover.uid, criadoEm: createdAt, previo: null, corpo: body, chavePrivada: rover.rede.chavePrivada })
    const env = { objeto: object, ...extra }
    if (approved) env.aprovacao = approve(rover, object, { aprovadoEm: m.relogio.agora })
    return { ...m.rele.aceitar(env), objeto: object }
  }
  const code4 = (...a) => codeOf(() => m4(...a))
  /** Registered rover with a cipher key pair and a published key. */
  const withKey = (o) => {
    const x = r.rover(o)
    x.cifra = generateCipherKeyPair()
    m4(x, 'chave-de-cifra', { chave: x.cifra.publicKey })
    return x
  }
  const asks = (a, b, text = 'Posso te mandar uma mensagem sobre a entrega?') => m4(a, 'conversa-pedir', { alvo: b.uid, texto: text })
  const decide = (x, conversation, decision) => m4(x, 'conversa-decidir', { conversa: conversation, decisao: decision })
  /** Opens an accepted conversation between two friends who have keys. */
  const acceptedConversation = (a, b) => {
    const c = asks(a, b).id
    decide(b, c, 'aceitar')
    return c
  }
  const cipher = (from, to, conversation, text, { otherKey = to.cifra.publicKey, criadoEm: createdAt = m.relogio.agora } = {}) =>
    encryptMessage({ texto: text, conversa: conversation, de: from.uid, para: to.uid, criadoEm: createdAt, networkPrivateKey: from.rede.chavePrivada, chavePrivadaDeCifra: from.cifra.chavePrivada, otherCipherPublicKey: otherKey })
  const sends = (from, to, conversation, text = 'Oi! Tudo certo para amanhã?', o = {}) => {
    const c = cipher(from, to, conversation, text, o)
    return { ...m4(from, 'mensagem', c.corpo), assinatura: c.assinatura }
  }
  const read = (x, conversation) => m.rele.mensagens.messagesOf(x.uid, conversation, { credencial: r.como(x, '/v1/x') })
  const list = (x, state) => m.rele.mensagens.conversationsOf(x.uid, { estado: state, credencial: r.como(x, '/v1/x') })
  return { ...r, m4, code4, withKey, asks, decide, acceptedConversation, cifra: cipher, sends, ler: read, lista: list }
}

test('happy path: friends, key, plain-text request, acceptance, encrypted messages that both sides decrypt', () => {
  const w = world()
  const ana = w.withKey()
  const beto = w.withKey()
  w.amigos(ana, beto)
  const request = w.asks(ana, beto, 'Oi, Beto! Posso te escrever sobre o relatório?')
  assert.equal(request.resultado, 'pendente')
  const pend = w.lista(beto, 'pendentes').itens
  assert.equal(pend.length, 1)
  assert.equal(pend[0].id, request.id)
  assert.equal(pend[0].com.uid, ana.uid)
  assert.equal(pend[0].pedido.objeto.corpo.texto, 'Oi, Beto! Posso te escrever sobre o relatório?')
  assert.equal(w.decide(beto, request.id, 'aceitar').resultado, 'ativa')
  w.advance(60)
  w.sends(ana, beto, request.id, 'Mandei a planilha pela entrega.')
  w.sends(beto, ana, request.id, 'Recebi, obrigado!')
  const items = w.ler(beto, request.id).itens
  assert.equal(items.length, 2)
  const texts = items.map(({ objeto: object }) => {
    const sender = object.autor === ana.uid ? ana : beto
    const r = decryptMessage(object, { chavePrivadaDeCifra: beto.cifra.chavePrivada, senderNetworkPublicKey: sender.rede.publicKey })
    assert.equal(r.ok, true)
    return r.texto
  })
  assert.deepEqual(texts, ['Recebi, obrigado!', 'Mandei a planilha pela entrega.'])
  // the sender also reads their own message (the X25519 secret is shared by both)
  const ofAna = w.ler(ana, request.id).itens.find(({ objeto: object }) => object.autor === ana.uid).objeto
  assert.equal(decryptMessage(ofAna, { chavePrivadaDeCifra: ana.cifra.chavePrivada, senderNetworkPublicKey: ana.rede.publicKey }).texto, 'Mandei a planilha pela entrega.')
  const card = w.lista(ana, 'ativas').itens[0]
  assert.equal(card.mensagens, 2)
  assert.equal(card.estado, 'ativa')
  assert.equal(card.iniciadaPor, ana.uid)
  assert.ok(card.ultimaMensagemEm >= card.criadaEm)
  // notices: the request notifies the recipient, the acceptance notifies the requester; a new message creates no notice
  const notices = (x) => w.s.notificationsOf(x.uid, { credencial: w.como(x, '/v1/x') }).itens.map((n) => n.tipo)
  assert.ok(notices(beto).includes('conversa-pedido'))
  assert.ok(notices(ana).includes('conversa-aceita'))
  assert.equal(notices(beto).filter((t) => t.startsWith('conversa') || t === 'mensagem').length, 1)
})

test('outside the chain: the public head of the rover does not change when it chats', () => {
  const w = world()
  const ana = w.withKey()
  const beto = w.withKey()
  w.amigos(ana, beto)
  const before = w.rele.perfil(ana.uid).cabeca
  const c = w.acceptedConversation(ana, beto)
  w.sends(ana, beto, c)
  assert.equal(w.rele.perfil(ana.uid).cabeca, before)
})

test('no friendship: without friendship, or with the friend request still pending, there is no conversation request', () => {
  const w = world()
  const ana = w.withKey()
  const beto = w.withKey()
  assert.equal(w.code4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'oi' }), 'interacao_nao_permitida')
  w.ok(ana, 'amizade', { alvo: beto.uid, acao: 'pedir' })
  assert.equal(w.code4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'oi' }), 'interacao_nao_permitida')
  w.ok(beto, 'amizade', { alvo: ana.uid, acao: 'aceitar' })
  assert.equal(w.code4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'oi' }), 'ok')
})

test('ending the friendship closes the conversation: no new messages, the retained ones stay readable', () => {
  const w = world()
  const ana = w.withKey()
  const beto = w.withKey()
  w.amigos(ana, beto)
  const c = w.acceptedConversation(ana, beto)
  w.sends(ana, beto, c)
  w.ok(beto, 'amizade', { alvo: ana.uid, acao: 'desfazer' })
  assert.equal(w.lista(ana).itens[0].estado, 'encerrada')
  assert.equal(codeOf(() => w.sends(ana, beto, c)), 'estado_da_conversa')
  assert.equal(w.ler(beto, c).itens.length, 1)
})

test('block: the blocked rover cannot request a conversation and gets the SAME response as a non-friend; blocking closes the conversation', () => {
  const w = world()
  const ana = w.withKey()
  const beto = w.withKey()
  const caio = w.withKey()
  w.amigos(ana, beto)
  w.amigos(ana, caio)
  const c = w.acceptedConversation(ana, beto)
  w.ok(beto, 'relacao', { alvo: ana.uid, acao: 'bloquear' })
  assert.equal(w.lista(beto).itens[0].estado, 'encerrada')
  assert.equal(codeOf(() => w.sends(ana, beto, c)), 'estado_da_conversa')
  const blocked = w.code4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'oi' })
  const strange = w.code4(beto, 'conversa-pedir', { alvo: caio.uid, texto: 'oi' })
  assert.equal(blocked, 'interacao_nao_permitida')
  assert.equal(strange, 'interacao_nao_permitida')
  // and the blocker cannot either (a block works in both directions)
  assert.equal(w.code4(beto, 'conversa-pedir', { alvo: ana.uid, texto: 'oi' }), 'interacao_nao_permitida')
})

test('mute: the request of the muted rover is accepted but creates no notice; the rover is not told', () => {
  const w = world()
  const ana = w.withKey()
  const beto = w.withKey()
  w.amigos(ana, beto)
  w.ok(beto, 'relacao', { alvo: ana.uid, acao: 'silenciar' })
  assert.equal(w.asks(ana, beto).resultado, 'pendente')
  const notices = w.s.notificationsOf(beto.uid, { credencial: w.como(beto, '/v1/x') }).itens.map((n) => n.tipo)
  assert.equal(notices.includes('conversa-pedido'), false)
  assert.equal(w.lista(beto, 'pendentes').itens.length, 1)
})

test('request not accepted: no messages before acceptance; only the recipient decides; a refusal blocks a new request for 7 days', () => {
  const w = world()
  const ana = w.withKey()
  const beto = w.withKey()
  w.amigos(ana, beto)
  const c = w.asks(ana, beto).id
  assert.equal(codeOf(() => w.sends(ana, beto, c)), 'estado_da_conversa')
  assert.equal(codeOf(() => w.sends(beto, ana, c)), 'estado_da_conversa')
  assert.equal(codeOf(() => w.decide(ana, c, 'aceitar')), 'sem_permissao')
  // (different text: the same request in the same second is the same object, and the relay would answer `duplicado`)
  assert.equal(codeOf(() => w.asks(ana, beto, 'De novo: posso te escrever?')), 'ja_existe')
  assert.equal(codeOf(() => w.asks(beto, ana)), 'ja_existe')
  assert.equal(w.decide(beto, c, 'recusar').resultado, 'recusada')
  assert.equal(w.lista(ana).itens[0].pedido, null, 'refusing erases the request text right away')
  assert.equal(codeOf(() => w.decide(beto, c, 'aceitar')), 'estado_da_conversa')
  assert.equal(codeOf(() => w.asks(ana, beto, 'E agora, posso?')), 'limite_de_taxa')
  w.advance(MESSAGE_TIMES.conversationRequestRefusalS + 1)
  assert.equal(w.asks(ana, beto).resultado, 'pendente')
})

test('close: the requester cancels the pending one; either side closes an accepted one; afterwards a new request is possible', () => {
  const w = world()
  const ana = w.withKey()
  const beto = w.withKey()
  w.amigos(ana, beto)
  const c1 = w.asks(ana, beto).id
  assert.equal(codeOf(() => w.decide(beto, c1, 'encerrar')), 'estado_da_conversa')
  assert.equal(w.decide(ana, c1, 'encerrar').resultado, 'encerrada')
  w.advance(1)
  const c2 = w.acceptedConversation(ana, beto)
  assert.equal(w.decide(beto, c2, 'encerrar').resultado, 'encerrada')
  assert.equal(w.asks(beto, ana).resultado, 'pendente')
})

test('human approval: a request, decision or message without approval is refused; the standing authorization never covers it', () => {
  const w = world({ aceitarAutorizacaoPermanente: true })
  const ana = w.withKey()
  const beto = w.withKey()
  w.amigos(ana, beto)
  assert.equal(w.code4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'oi' }, { aprovada: false }), 'sem_aprovacao')
  const c = w.asks(ana, beto).id
  assert.equal(w.code4(beto, 'conversa-decidir', { conversa: c, decisao: 'aceitar' }, { aprovada: false }), 'sem_aprovacao')
  w.decide(beto, c, 'aceitar')
  const body = w.cifra(ana, beto, c, 'oi').corpo
  assert.equal(w.code4(ana, 'mensagem', body, { aprovada: false }), 'sem_aprovacao')
  // even when the person gave a standing authorization and the relay accepts it, a message does not go through on it
  const authorization = authorizationOf(ana, { emitidaEm: w.m.relogio.agora, tipos: ['postagem', 'recado'], v: '0.3' })
  assert.equal(w.code4(ana, 'mensagem', body, { aprovada: false, extra: { autorizacao: authorization } }), 'autorizacao_invalida')
  // and the person's policy does not waive it: an approval attached to a free action is esquema, as in the rest of the network
  assert.equal(w.code4(ana, 'chave-de-cifra', { chave: generateCipherKeyPair().publicKey }, { aprovada: true }), 'esquema')
})

test('tampered or misplaced message: broken signature, swapped recipient, third party in the conversation', () => {
  const w = world()
  const ana = w.withKey()
  const beto = w.withKey()
  const caio = w.withKey()
  w.amigos(ana, beto)
  w.amigos(ana, caio)
  const c = w.acceptedConversation(ana, beto)
  const body = w.cifra(ana, beto, c, 'oi').corpo
  const object = createObject({ v: '0.4', tipo: 'mensagem', autor: ana.uid, criadoEm: w.m.relogio.agora, previo: null, corpo: body, chavePrivada: ana.rede.chavePrivada })
  const bytes = Buffer.from(body.cifrado, 'base64url')
  bytes[3] ^= 0xff
  const tweaked = { ...object, corpo: { ...body, cifrado: toB64u(bytes) } }
  // the id no longer matches (the relay checks it before the signature)
  assert.equal(codeOf(() => w.rele.aceitar({ objeto: tweaked, aprovacao: approve(ana, tweaked, { aprovadoEm: w.m.relogio.agora }) })), 'id_incorreto')
  // re-signed with another key: invalid signature
  const other = generateKeyPair()
  const forged = createObject({ v: '0.4', tipo: 'mensagem', autor: ana.uid, criadoEm: w.m.relogio.agora, previo: null, corpo: body, chavePrivada: other.chavePrivada })
  assert.equal(codeOf(() => w.rele.aceitar({ objeto: forged, aprovacao: approve(ana, forged, { aprovadoEm: w.m.relogio.agora }) })), 'assinatura_invalida')
  // for someone who is not the other side
  assert.equal(w.code4(ana, 'mensagem', { ...body, para: caio.uid, chavePara: caio.cifra.publicKey }), 'nao_encontrado')
  // a third party (a friend of both) cannot write in other people's conversation
  w.amigos(caio, beto)
  assert.equal(codeOf(() => w.sends(caio, beto, c)), 'nao_encontrado')
})

test('swapped cipher: encrypting to a key that is not the current key of the recipient (or without a published key of its own) is refused', () => {
  const w = world()
  const ana = w.withKey()
  const beto = w.withKey()
  w.amigos(ana, beto)
  const c = w.acceptedConversation(ana, beto)
  const old = beto.cifra.publicKey
  beto.cifra = generateCipherKeyPair()
  w.m4(beto, 'chave-de-cifra', { chave: beto.cifra.publicKey })
  assert.equal(codeOf(() => w.sends(ana, beto, c, 'oi', { otherKey: old })), 'chave_de_cifra_desatualizada')
  assert.equal(w.sends(ana, beto, c, 'oi').estado, 'aceito')
  // someone who never published a key cannot send a message
  const dani = w.rover()
  dani.cifra = generateCipherKeyPair()
  w.amigos(dani, beto)
  const c2 = w.acceptedConversation(dani, beto)
  assert.equal(codeOf(() => w.sends(dani, beto, c2)), 'chave_de_cifra_desatualizada')
  // a small-order key is not published
  assert.equal(w.code4(dani, 'chave-de-cifra', { chave: toB64u(Buffer.alloc(32)) }), 'chave_fraca')
})

test('report: the recipient reveals text and letter, the relay checks authorship and keeps only what was revealed', () => {
  const w = world()
  const ana = w.withKey()
  const beto = w.withKey()
  w.amigos(ana, beto)
  const c = w.acceptedConversation(ana, beto)
  const m = w.sends(ana, beto, c, 'Me passa a senha do painel agora.')
  const r = w.m4(beto, 'mensagem-denuncia', { mensagem: m.id, motivo: 'golpe', texto: 'Me passa a senha do painel agora.', assinatura: m.assinatura })
  assert.equal(r.estado, 'recebida')
  const queue = w.rele.mensagens.listReports()
  assert.equal(queue.length, 1)
  assert.equal(queue[0].autorDoAlvo, ana.uid)
  assert.equal(queue[0].texto, 'Me passa a senha do painel agora.')
  assert.equal(queue[0].motivo, 'golpe')
  assert.notEqual(queue[0].denunciante, beto.uid)
  assert.equal(JSON.stringify(queue).includes(beto.uid), false, 'the reporter does not appear')
})

test('fake sender in a report: altered text, letter signed by someone else, letter from another message, or the sender reporting', () => {
  const w = world()
  const ana = w.withKey()
  const beto = w.withKey()
  w.amigos(ana, beto)
  const c = w.acceptedConversation(ana, beto)
  const m1 = w.sends(ana, beto, c, 'Primeira mensagem.')
  const m2 = w.sends(ana, beto, c, 'Segunda mensagem.')
  const rep = (x, message, text, signature) => w.code4(x, 'mensagem-denuncia', { mensagem: message, motivo: 'assedio', texto: text, assinatura: signature })
  // Beto makes up a text that Ana did not write
  assert.equal(rep(beto, m1.id, 'Texto que a Ana nunca escreveu.', m1.assinatura), 'revelacao_invalida')
  // Beto signs a letter "from Ana" himself
  const msg = w.rele.store.um('SELECT * FROM mensagens WHERE id = :id', { id: m1.id })
  const fake = signLetter({ conversa: c, criadoEm: msg.criado_em, de: ana.uid, iv: msg.iv, para: beto.uid, texto: 'Inventado.' }, beto.rede.chavePrivada)
  assert.equal(rep(beto, m1.id, 'Inventado.', fake), 'revelacao_invalida')
  // the letter of the first message is not valid for the second
  assert.equal(rep(beto, m2.id, 'Primeira mensagem.', m1.assinatura), 'revelacao_invalida')
  // the sender cannot report their own message, and a third party cannot reach other people's messages
  assert.equal(rep(ana, m1.id, 'Primeira mensagem.', m1.assinatura), 'nao_encontrado')
  assert.equal(w.rele.mensagens.listReports().length, 0)
  assert.equal(rep(beto, m1.id, 'Primeira mensagem.', m1.assinatura), 'ok')
})

test('the report is checked against the network key of the time of the message, even after the sender changes keys', () => {
  const w = world()
  const ana = w.withKey()
  const beto = w.withKey()
  w.amigos(ana, beto)
  const c = w.acceptedConversation(ana, beto)
  const m = w.sends(ana, beto, c, 'Mensagem antes da troca.')
  // new attestation for Ana, with another network key
  const fresh = generateKeyPair()
  ana.atestado = w.m.provedor.issue({ uid: ana.uid, handle: ana.handle, chave: fresh.publicKey, chaveAprovacao: ana.aprovacao.publicKey, emitidoEm: w.m.relogio.agora, validadeS: 30 * DAY })
  ana.rede = fresh
  publish(w.m, ana, 'estado', { estado: 'trabalhando' }, { withAttestation: true })
  assert.equal(w.m4(beto, 'mensagem-denuncia', { mensagem: m.id, motivo: 'spam', texto: 'Mensagem antes da troca.', assinatura: m.assinatura }).estado, 'recebida')
})

test('delete: each side deletes its own copy; the row goes away when both have deleted', () => {
  const w = world()
  const ana = w.withKey()
  const beto = w.withKey()
  w.amigos(ana, beto)
  const c = w.acceptedConversation(ana, beto)
  const m1 = w.sends(ana, beto, c, 'Uma.')
  w.sends(ana, beto, c, 'Duas.')
  assert.equal(w.m4(ana, 'conversa-apagar', { conversa: c, mensagem: m1.id }).resultado, 1)
  assert.equal(w.ler(ana, c).itens.length, 1)
  assert.equal(w.ler(beto, c).itens.length, 2)
  assert.equal(w.m4(beto, 'conversa-apagar', { conversa: c, mensagem: null }).resultado, 2)
  assert.equal(w.ler(beto, c).itens.length, 0)
  assert.equal(w.rele.store.um('SELECT COUNT(*) AS n FROM mensagens').n, 1, 'Uma is gone from the database; Ana still keeps Duas')
  assert.equal(w.code4(beto, 'conversa-apagar', { conversa: c, mensagem: m1.id }), 'nao_encontrado')
})

test('retention: after 30 days the message, the pending request and the id trace disappear from the relay', () => {
  const w = world()
  // long attestations: the test spans 30 days and the rovers must stay visible to read
  const ana = w.withKey({ validadeS: 80 * DAY })
  const beto = w.withKey({ validadeS: 80 * DAY })
  const caio = w.withKey({ validadeS: 80 * DAY })
  w.amigos(ana, beto)
  w.amigos(ana, caio)
  const c = w.acceptedConversation(ana, beto)
  const m = w.sends(ana, beto, c)
  w.asks(ana, caio)
  w.advance(MESSAGE_TIMES.retencaoDeMensagemS - 10)
  w.rele.limpar()
  assert.equal(w.ler(beto, c).itens.length, 1, 'still within the deadline')
  w.advance(20)
  w.rele.limpar()
  assert.equal(w.ler(beto, c).itens.length, 0)
  assert.equal(w.rele.store.objeto(m.id), null, 'the id trace is gone too')
  assert.equal(w.lista(caio, 'pendentes').itens.length, 0, 'the pending request expired')
  // and a report about a message that is already gone has nothing to check
  assert.equal(w.code4(beto, 'mensagem-denuncia', { mensagem: m.id, motivo: 'spam', texto: 'Oi! Tudo certo para amanhã?', assinatura: m.assinatura }), 'nao_encontrado')
})

test('size and rate limit: ciphertext above the cap is esquema; the 61st message in an hour is limite_de_taxa', () => {
  const w = world()
  const ana = w.withKey()
  const beto = w.withKey()
  w.amigos(ana, beto)
  const c = w.acceptedConversation(ana, beto)
  const body = w.cifra(ana, beto, c, 'oi').corpo
  assert.equal(w.code4(ana, 'mensagem', { ...body, cifrado: toB64u(randomBytes(16 + 8192 + 256)) }), 'esquema')
  // (spaced out: 10 a minute in one conversation is the burst ceiling of proposal 0014)
  for (let i = 0; i < 60; i++) { w.sends(ana, beto, c, `mensagem número ${i}`); w.m.advance(7) }
  assert.equal(codeOf(() => w.sends(ana, beto, c, 'uma a mais')), 'limite_de_taxa')
})

test('privacy: no message by id, the list belongs only to the rover itself, and leaving the network erases everything on both sides', () => {
  const w = world()
  const ana = w.withKey()
  const beto = w.withKey()
  const caio = w.withKey()
  w.amigos(ana, beto)
  const c = w.acceptedConversation(ana, beto)
  const m = w.sends(ana, beto, c)
  assert.equal(codeOf(() => w.rele.objeto(m.id)), 'nao_encontrado')
  assert.equal(codeOf(() => w.rele.objeto(c)), 'nao_encontrado')
  assert.equal(codeOf(() => w.rele.mensagens.messagesOf(beto.uid, c, { credencial: w.como(caio, '/v1/x') })), 'sem_permissao')
  assert.equal(codeOf(() => w.rele.mensagens.messagesOf(beto.uid, c, {})), 'leitura_nao_autorizada')
  assert.equal(codeOf(() => w.rele.mensagens.messagesOf(caio.uid, c, { credencial: w.como(caio, '/v1/x') })), 'nao_encontrado')
  assert.equal(codeOf(() => w.rele.mensagens.conversationOf(caio.uid, c, { credencial: w.como(caio, '/v1/x') })), 'nao_encontrado')
  // the objects row keeps only the trace: no envelope, no alvo
  const trace = w.rele.store.objeto(m.id)
  assert.deepEqual([trace.envelope, trace.alvo], [null, null])
  w.ok(ana, 'remocao-pelo-autor', { alvo: w.rele.perfil(ana.uid).perfilId })
  const account = (t) => w.rele.store.um(`SELECT COUNT(*) AS n FROM ${t}`).n
  assert.deepEqual([account('mensagens'), account('conversas')], [0, 0])
  assert.equal(w.rele.store.um('SELECT COUNT(*) AS n FROM chaves_de_cifra WHERE uid = :u', { u: ana.uid }).n, 0)
})

test('off (default): a 0.4 object is versao_nao_suportada before anything else, and /v1/info gains nothing from messages', () => {
  const w = fresh()
  const ana = w.rover()
  assert.equal(w.rele.mensagens, null)
  const object = createObject({ v: '0.4', tipo: 'chave-de-cifra', autor: ana.uid, criadoEm: w.m.relogio.agora, previo: null, corpo: { chave: generateCipherKeyPair().publicKey }, chavePrivada: ana.rede.chavePrivada })
  assert.equal(codeOf(() => w.rele.aceitar({ objeto: object })), 'versao_nao_suportada')
  // even garbage with v 0.4 gets the same response: a relay with messages off does not even look at the shape
  assert.equal(codeOf(() => w.rele.aceitar({ objeto: { v: '0.4', tipo: 'inventado' } })), 'versao_nao_suportada')
  const info = w.rele.info()
  assert.deepEqual(info.protocolo, ['0.1', '0.2', '0.3'])
  // the declared revision is the relay's (0.6.0, which contains 0.5.0 and 0.4.0), on or off: turning it on only adds
  assert.equal(info.versaoDoRascunho, '0.11.0')
  assert.equal(info.recursos.includes('mensagens'), false)
  assert.equal('mensagens' in info, false)
  assert.equal('mensagemCaracteres' in info.limites, false)
  // when on, 0.4.0 adds without removing anything
  const linked = world().rele.info()
  assert.deepEqual(linked.protocolo, ['0.1', '0.2', '0.3', '0.4'])
  assert.equal(linked.versaoDoRascunho, '0.11.0')
  assert.ok(linked.recursos.includes('mensagens'))
  // (proposal 0014: and `mensagens-sem-aprovacao`, the optional package of the "0.6" authorization)
  assert.deepEqual(linked.recursos.filter((r) => r !== 'mensagens' && r !== 'mensagens-sem-aprovacao'), info.recursos)
  assert.equal(linked.limites.mensagemCaracteres, 2000)
  assert.equal(linked.mensagens, true)
})

test('defense in depth: the block stops the conversation even if the friendship was left in the database', () => {
  // Blocking undoes the friendship (so the normal path already ends in "not friends"). Here the block goes straight into the database without undoing
  // the friendship, as in a half-restored database: the message rule must look at the block on its own.
  const w = world()
  const ana = w.withKey()
  const beto = w.withKey()
  w.amigos(ana, beto)
  const c = w.acceptedConversation(ana, beto)
  w.rele.store.executar("INSERT INTO relacoes (autor, alvo, tipo, em) VALUES (:a, :b, 'bloqueio', :t)", { a: beto.uid, b: ana.uid, t: w.m.relogio.agora })
  assert.ok(w.s.activeFriendship(ana.uid, beto.uid), 'the friendship was left over')
  assert.equal(codeOf(() => w.sends(ana, beto, c)), 'interacao_nao_permitida')
  assert.equal(w.code4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'oi de novo' }), 'interacao_nao_permitida')
})

test('additive migration: a database without the message tables gets the four of them on open, losing nothing', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { Store } = await import('../../packages/relay/src/store.js')
  const dir = mkdtempSync(join(tmpdir(), 'rele-dm-'))
  try {
    const file = join(dir, 'rele.sqlite')
    const old = new Store(file)
    for (const t of ['mensagens', 'conversas', 'chaves_de_cifra', 'denuncias_de_mensagem']) old.db.exec(`DROP TABLE ${t}`)
    old.executar("INSERT INTO bloqueios (tipo, alvo, motivo, criado_em) VALUES ('emissor', 'x', 'teste', 1)")
    old.fechar()
    const newValue = new Store(file)
    const tables = newValue.todos("SELECT name FROM sqlite_master WHERE type = 'table'").map((l) => l.name)
    for (const t of ['mensagens', 'conversas', 'chaves_de_cifra', 'denuncias_de_mensagem']) assert.ok(tables.includes(t), t)
    assert.equal(newValue.um('SELECT COUNT(*) AS n FROM bloqueios').n, 1)
    newValue.fechar()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('messages and media on together: /v1/info announces both, the revision is 0.7.0 (which contains 0.5.0) and each object stays at its own version', async () => {
  const { worldWithMedia } = await import('../helpers/media.js')
  const m = worldWithMedia({ mensagens: true })
  try {
    const info = m.rele.info()
    assert.equal(info.versaoDoRascunho, '0.11.0')
    assert.ok(info.recursos.includes('mensagens'))
    assert.ok(info.recursos.includes('midia'))
    assert.deepEqual(info.protocolo, ['0.1', '0.2', '0.3', '0.4'])
    assert.equal(info.mensagens, true)
    assert.equal(typeof info.midia, 'object')
    // the `imagem` type does not exist in 0.4, and a message type does not exist in 0.3 either
    const ana = m.rover()
    const image4 = createObject({ v: '0.4', tipo: 'imagem', autor: ana.uid, criadoEm: m.relogio.agora, previo: null, corpo: {}, chavePrivada: ana.rede.chavePrivada })
    assert.equal(codeOf(() => m.rele.aceitar({ objeto: image4 })), 'esquema')
    const cipher3 = createObject({ tipo: 'chave-de-cifra', autor: ana.uid, criadoEm: m.relogio.agora, previo: null, corpo: { chave: generateCipherKeyPair().publicKey }, chavePrivada: ana.rede.chavePrivada })
    assert.equal(codeOf(() => m.rele.aceitar({ objeto: cipher3 })), 'esquema')
  } finally {
    m.apagar()
  }
})
