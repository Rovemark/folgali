// SPDX-License-Identifier: AGPL-3.0-or-later
// End to end private messages: the reference client encrypts and decrypts, the real relay (HTTP) only sees the ciphertext.
import test from 'node:test'
import assert from 'node:assert/strict'
import { TestApprover, RoverClient, RelayError, NotApproved, RoverPerson } from '../../packages/client/src/index.js'
import { cipherMatches, generateCipherKeyPair } from '../../packages/protocol/src/index.js'
import { createRelayServer } from '../../packages/relay/src/http.js'
import { newWorld, newRoverInWorld } from '../helpers/test-relay.js'

async function environment() {
  const m = newWorld({ mensagens: true })
  const server = createRelayServer({ rele: m.rele, rajada: { capacity: 100000, perSecond: 100000 } })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${server.address().port}`
  const clock = () => m.relogio.agora
  const newValue = async (name) => {
    const rover = newRoverInWorld(m)
    const person = new TestApprover({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio: clock })
    const contexts = []
    // the "person" sees the object and, in a message, the text: checks that the ciphertext being approved is the one for this text
    const approver = {
      deny: false,
      async aprovar(object, context) {
        contexts.push({ objeto: object, contexto: context })
        if (this.deny) return null
        if (object.tipo === 'mensagem' && !cipherMatches(object, context)) return null
        return person.aprovar(object)
      }
    }
    const cipher = generateCipherKeyPair()
    const client = new RoverClient({ base, uid: rover.uid, chavePrivada: rover.rede.chavePrivada, atestado: rover.atestado, aprovador: approver, relogio: clock, chavePrivadaDeCifra: cipher.chavePrivada })
    await client.perfil({ nome: name })
    await client.publishCipherKey()
    return { rover, cliente: client, aprovador: approver, contexts, cifra: cipher }
  }
  return { m, base, novo: newValue, fechar: () => new Promise((ok) => { server.closeAllConnections(); server.close(ok) }) }
}

test('client: request, accept, chat encrypted, read, report and delete, with the person approving the exact text', async () => {
  const e = await environment()
  try {
    const ana = await e.novo('Ana')
    const beto = await e.novo('Beto')
    assert.equal(await ana.cliente.suporta('mensagens'), true)
    await ana.cliente.pedirAmizade(beto.rover.uid)
    await beto.cliente.aceitarAmizade(ana.rover.uid)
    const { conversa: conversation } = await ana.cliente.requestConversation(beto.rover.uid, 'Oi! Posso te escrever sobre a planilha?')
    const pending = await beto.cliente.conversas({ estado: 'pendentes' })
    assert.equal(pending.itens[0].pedido.objeto.corpo.texto, 'Oi! Posso te escrever sobre a planilha?')
    assert.equal((await beto.cliente.acceptConversation(conversation)).resultado, 'ativa')
    e.m.advance(5)
    await ana.cliente.enviarMensagem(conversation, 'Mandei a versão nova.\nOlha a aba 2.')
    await beto.cliente.enviarMensagem(conversation, 'Vi. Está ótima.')
    // Ana's person saw the text and the encryption matched it
    const seen = ana.contexts.find((x) => x.objeto.tipo === 'mensagem')
    assert.equal(seen.contexto.texto, 'Mandei a versão nova.\nOlha a aba 2.')
    const readItems = await beto.cliente.readConversation(conversation)
    assert.deepEqual(readItems.itens.map((i) => [i.readable, i.texto]), [[true, 'Vi. Está ótima.'], [true, 'Mandei a versão nova.\nOlha a aba 2.']])
    assert.deepEqual((await ana.cliente.readConversation(conversation)).itens.map((i) => i.texto), ['Vi. Está ótima.', 'Mandei a versão nova.\nOlha a aba 2.'])
    // the relay only has the ciphertext
    const stored = e.m.store.todos('SELECT envelope FROM mensagens').map((l) => l.envelope).join('\n')
    assert.equal(stored.includes('versão nova'), false)
    // report: Beto reveals Ana's message, and only that one
    const ofAna = readItems.itens.find((i) => i.de === ana.rover.uid)
    assert.equal((await beto.cliente.reportMessage(ofAna, 'outro')).estado, 'recebida')
    assert.deepEqual(e.m.rele.mensagens.listReports().map((d) => d.texto), ['Mandei a versão nova.\nOlha a aba 2.'])
    // Ana does not report her own message
    await assert.rejects(ana.cliente.reportMessage((await ana.cliente.readConversation(conversation)).itens[1], 'spam'), (err) => err instanceof RelayError && err.codigo === 'nao_encontrado')
    // deleting Ana's copy does not delete Beto's
    assert.equal((await ana.cliente.deleteConversation(conversation)).resultado, 2)
    assert.equal((await ana.cliente.readConversation(conversation)).itens.length, 0)
    assert.equal((await beto.cliente.readConversation(conversation)).itens.length, 2)
  } finally {
    await e.fechar()
  }
})

test('client: the person who denies lets nothing out; text that breaks the rules is never even encrypted', async () => {
  const e = await ana2()
  try {
    const { ana, beto, conversa: conversation } = e
    ana.aprovador.deny = true
    await assert.rejects(ana.cliente.enviarMensagem(conversation, 'oi'), NotApproved)
    ana.aprovador.deny = false
    // proposal 0014: the leak filter refuses it before ciphering (the relay cannot read a ciphered text)
    await assert.rejects(ana.cliente.enviarMensagem(conversation, 'me chama em ana@exemplo.com'), (err) => err.codigo === 'vazamento')
    assert.equal(e.e.m.store.um('SELECT COUNT(*) AS n FROM mensagens').n, 0)
    assert.equal((await beto.cliente.readConversation(conversation)).itens.length, 0)
  } finally {
    await e.e.fechar()
  }
})

test('client: cipher key replaced midway; whoever keeps the old private key reads what arrived before; without the key, unreadable', async () => {
  const x = await ana2()
  try {
    const { e, ana, beto, conversa: conversation } = x
    await ana.cliente.enviarMensagem(conversation, 'Antes da troca.')
    // Beto changes cipher key and keeps the old one
    const fresh = generateCipherKeyPair()
    beto.cliente.oldCipherKeys = [beto.cliente.chavePrivadaDeCifra]
    beto.cliente.chavePrivadaDeCifra = fresh.chavePrivada
    e.m.advance(2)
    await beto.cliente.publishCipherKey()
    e.m.advance(2)
    await ana.cliente.enviarMensagem(conversation, 'Depois da troca.')
    assert.deepEqual((await beto.cliente.readConversation(conversation)).itens.map((i) => i.texto), ['Depois da troca.', 'Antes da troca.'])
    // without the old key, the first one is unreadable (and nothing of it shows)
    beto.cliente.oldCipherKeys = []
    const withoutOld = (await beto.cliente.readConversation(conversation)).itens
    assert.deepEqual(withoutOld.map((i) => [i.readable, i.texto]), [[true, 'Depois da troca.'], [false, null]])
  } finally {
    await x.e.fechar()
  }
})

/** Ana and Beto as friends, with an accepted conversation. */
async function ana2() {
  const e = await environment()
  const ana = await e.novo('Ana')
  const beto = await e.novo('Beto')
  await ana.cliente.pedirAmizade(beto.rover.uid)
  await beto.cliente.aceitarAmizade(ana.rover.uid)
  const { conversa: conversation } = await ana.cliente.requestConversation(beto.rover.uid, 'Podemos conversar?')
  await beto.cliente.acceptConversation(conversation)
  e.m.advance(1)
  return { e, ana, beto, conversa: conversation }
}

test('client, proposal 0014: with the `mensagens` package the rover requests, accepts and writes without the person; a leak stops before encryption; without the package, it asks again', async () => {
  const e = await environment()
  try {
    const ana = await e.novo('Ana')
    const beto = await e.novo('Beto')
    assert.equal(await ana.cliente.suporta('mensagens-sem-aprovacao'), true)
    await ana.cliente.pedirAmizade(beto.rover.uid)
    await beto.cliente.aceitarAmizade(ana.rover.uid)
    const bundleOf = (x) => new RoverPerson({ base: e.base, uid: x.rover.uid, chavePrivadaDeAprovacao: x.rover.aprovacao.chavePrivada, relogio: () => e.m.relogio.agora })
      .createTimeOffBundle({ opcionais: ['mensagens'] })
    ana.cliente.useAuthorizations(bundleOf(ana))
    beto.cliente.useAuthorizations(bundleOf(beto))
    // the person says no to everything from here: nothing may ask her
    ana.contexts.length = 0
    beto.contexts.length = 0
    ana.aprovador.deny = true
    beto.aprovador.deny = true
    const { conversa: conversation } = await ana.cliente.requestConversation(beto.rover.uid, 'Oi! Posso te escrever sobre o passeio?')
    assert.equal((await beto.cliente.acceptConversation(conversation)).resultado, 'ativa')
    await ana.cliente.enviarMensagem(conversation, 'Sábado de manhã, no parque.')
    assert.equal(ana.contexts.length + beto.contexts.length, 0, 'no approval was asked')
    const readItems = await beto.cliente.readConversation(conversation)
    assert.deepEqual(readItems.itens.map((i) => [i.texto, i.deTerceiro]), [['Sábado de manhã, no parque.', true]])
    assert.equal((await ana.cliente.readConversation(conversation)).itens[0].deTerceiro, false)
    // the leak filter: refused on the client, before ciphering, and nothing reaches the relay
    const before = e.m.store.um('SELECT COUNT(*) AS n FROM mensagens').n
    await assert.rejects(ana.cliente.enviarMensagem(conversation, 'Minha senha: hunter2-Xq9!vB7z'), (err) => err.codigo === 'vazamento')
    assert.equal(e.m.store.um('SELECT COUNT(*) AS n FROM mensagens').n, before)
    // without the package (an empty list) the approval is asked again, and the person says no
    ana.cliente.useAuthorizations([])
    await assert.rejects(ana.cliente.enviarMensagem(conversation, 'De novo?'), (err) => err instanceof NotApproved)
  } finally {
    await e.fechar()
  }
})
