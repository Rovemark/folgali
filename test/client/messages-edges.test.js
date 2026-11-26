// SPDX-License-Identifier: AGPL-3.0-or-later
// Edge cases of private messages in the reference client that mutation testing showed to be untested. Against the real relay (HTTP),
// with an optional "dishonest relay" in front: an interceptor that swaps the response of one route, to prove that the client checks what it
// receives (the other side attestation, the served cipher key, a message from another conversation, a swapped signature) instead of trusting the relay.
import test from 'node:test'
import assert from 'node:assert/strict'
import { TestApprover, RoverClient, RelayError, NotApproved } from '../../packages/client/src/index.js'
import { cipherMatches, createObject, generateCipherKeyPair } from '../../packages/protocol/src/index.js'
import { createRelayServer } from '../../packages/relay/src/http.js'
import { newWorld, newRoverInWorld } from '../helpers/test-relay.js'

async function environment() {
  const m = newWorld({ mensagens: true })
  const server = createRelayServer({ rele: m.rele, rajada: { capacity: 100000, perSecond: 100000 } })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${server.address().port}`
  const clock = () => m.relogio.agora
  /** A client with a spy-able fetch: `pedidos` records method and path; `trocar(caminho, metodo)` can return a forged response. */
  const client = (rover, { cifra: cipher = generateCipherKeyPair(), aprovador: approver } = {}) => {
    const requests = []
    const spy = { trocar: null }
    const fetchImpl = async (url, init = {}) => {
      const path = url.slice(base.length)
      const method = init.method ?? 'GET'
      requests.push({ metodo: method, caminho: path, corpo: init.body ? JSON.parse(init.body) : null })
      const forged = spy.trocar ? await spy.trocar(path, method, () => fetch(url, init)) : null
      return forged ?? fetch(url, init)
    }
    const person = new TestApprover({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio: clock })
    const ap = approver ?? {
      deny: false,
      seen: 0,
      async aprovar(object, context) {
        this.seen++
        if (this.deny) return null
        if (object.tipo === 'mensagem' && !cipherMatches(object, context)) return null
        return person.aprovar(object)
      }
    }
    const c = new RoverClient({ base, uid: rover.uid, chavePrivada: rover.rede.chavePrivada, atestado: rover.atestado, aprovador: ap, relogio: clock, fetchImpl, chavePrivadaDeCifra: cipher?.chavePrivada ?? null })
    return { c, pedidos: requests, spy, aprovador: ap, cifra: cipher }
  }
  const newValue = async (name) => {
    const rover = newRoverInWorld(m)
    const x = client(rover)
    await x.c.perfil({ nome: name })
    await x.c.publishCipherKey()
    return { rover, ...x }
  }
  /** Two friends with an accepted conversation. */
  const pair = async () => {
    const ana = await newValue('Ana')
    const beto = await newValue('Beto')
    await ana.c.pedirAmizade(beto.rover.uid)
    await beto.c.aceitarAmizade(ana.rover.uid)
    const { conversa: conversation } = await ana.c.requestConversation(beto.rover.uid, 'Podemos conversar?')
    await beto.c.acceptConversation(conversation)
    m.advance(1)
    return { ana, beto, conversa: conversation }
  }
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  return { m, base, cliente: client, novo: newValue, par: pair, json, fechar: () => new Promise((ok) => { server.closeAllConnections(); server.close(ok) }) }
}

const posts = (requests, type) => requests.filter((p) => p.metodo === 'POST' && p.caminho === '/v1/objetos' && (!type || p.corpo.objeto.tipo === type))

test('the attestation goes only with the first object of the session, also when that object is a 0.4 one', async () => {
  const e = await environment()
  try {
    const ana = await e.novo('Ana')
    // another session of the same rover (new device): the first publication carries the attestation, the second does not
    const other = e.cliente(ana.rover, { cifra: ana.cifra })
    await other.c.publishCipherKey()
    await other.c.publishCipherKey()
    const sent = posts(other.pedidos, 'chave-de-cifra')
    assert.equal(sent.length, 2)
    assert.deepEqual(sent.map((p) => 'atestado' in p.corpo), [true, false])
  } finally { await e.fechar() }
})

test('without a cipher key: publishing the key and sending a message fail BEFORE talking to the relay, with the reason', async () => {
  const e = await environment()
  try {
    const { ana, conversa: conversation } = await e.par()
    const without = e.cliente(ana.rover, { cifra: null })
    assert.throws(() => without.c.publishCipherKey(), /não tem chave de cifra/)
    await assert.rejects(without.c.enviarMensagem(conversation, 'oi'), /não tem chave de cifra/)
    assert.deepEqual(without.pedidos, [], 'nothing left the computer')
  } finally { await e.fechar() }
})

test('network key of the other side: our own comes from the attestation with no request; the other one is requested once and kept', async () => {
  const e = await environment()
  try {
    const { ana, beto } = await e.par()
    const x = e.cliente(ana.rover, { cifra: ana.cifra })
    assert.equal(await x.c.networkKeyOf(ana.rover.uid), ana.rover.atestado.chave)
    assert.equal(x.pedidos.length, 0, 'our own key does not need the relay')
    assert.equal(await x.c.networkKeyOf(beto.rover.uid), beto.rover.atestado.chave)
    assert.equal(await x.c.networkKeyOf(beto.rover.uid), beto.rover.atestado.chave)
    assert.equal(x.pedidos.filter((p) => p.caminho === `/v1/rovers/${beto.rover.uid}`).length, 1, 'the second comes from memory')
  } finally { await e.fechar() }
})

test('dishonest relay on the profile: attestation of another rover, or a tampered attestation, and the client refuses the network key', async () => {
  const e = await environment()
  try {
    const { ana, beto } = await e.par()
    const caio = await e.novo('Caio')
    const x = e.cliente(ana.rover, { cifra: ana.cifra })
    const profileOf = async (uid) => (await fetch(`${e.base}/v1/rovers/${uid}`)).json()
    // Beto's profile served with Caio's (valid) attestation
    const ofCaio = (await profileOf(caio.rover.uid)).atestado
    x.spy.trocar = async (path) => (path === `/v1/rovers/${beto.rover.uid}` ? e.json({ ...(await profileOf(beto.rover.uid)), atestado: ofCaio }) : null)
    await assert.rejects(x.c.networkKeyOf(beto.rover.uid), /O atestado do outro rover não confere/)
    // Beto's attestation with the handle altered: the issuer signature does not match
    const tampered = { ...(await profileOf(beto.rover.uid)).atestado, handle: 'outro.nome' }
    x.spy.trocar = async (path) => (path === `/v1/rovers/${beto.rover.uid}` ? e.json({ ...(await profileOf(beto.rover.uid)), atestado: tampered }) : null)
    await assert.rejects(x.c.networkKeyOf(beto.rover.uid), /O atestado do outro rover não confere/)
  } finally { await e.fechar() }
})

test('dishonest relay on the cipher key: another type, another author, a signature from another key or a malformed shape are refused', async () => {
  const e = await environment()
  try {
    const { ana, beto } = await e.par()
    const caio = await e.novo('Caio')
    const route = `/v1/rovers/${beto.rover.uid}/chave-de-cifra`
    const serve = (object) => { ana.spy.trocar = async (path) => (path === route ? e.json({ objeto: object }) : null) }
    const key = generateCipherKeyPair().publicKey
    const obj = (type, body, { autor: author = beto.rover.uid, chavePrivada: privateKey = beto.rover.rede.chavePrivada } = {}) =>
      createObject({ v: '0.4', tipo: type, autor: author, criadoEm: e.m.relogio.agora, previo: null, corpo: body, chavePrivada: privateKey })
    assert.equal(await ana.c.cipherKeyOf(beto.rover.uid), beto.cifra.publicKey, 'control: the real one passes')
    const cases = [
      ['outro tipo', obj('conversa-pedir', { alvo: ana.rover.uid, texto: 'oi' })],
      ['outro autor (a chave do Caio servida como do Beto)', obj('chave-de-cifra', { chave: key }, { autor: caio.rover.uid, chavePrivada: caio.rover.rede.chavePrivada })],
      ['assinada por outra chave de rede', obj('chave-de-cifra', { chave: key }, { chavePrivada: caio.rover.rede.chavePrivada })],
      ['forma torta (campo a mais), assinada pelo Beto', obj('chave-de-cifra', { chave: key, extra: 1 })]
    ]
    for (const [name, o] of cases) {
      serve(o)
      await assert.rejects(ana.c.cipherKeyOf(beto.rover.uid), /não confere com a chave de rede do rover/, name)
    }
  } finally { await e.fechar() }
})

test('cipher key replaced midway: the client rereads the key and encrypts again ONCE; if it is still stale, it gives up', async () => {
  const e = await environment()
  try {
    const { ana, beto, conversa: conversation } = await e.par()
    const route = `/v1/rovers/${beto.rover.uid}/chave-de-cifra`
    const stale = (await (await fetch(`${e.base}${route}`)).json()).objeto
    // Beto changes key; the relay (or a cache on the way) still serves the old one on the first read
    beto.c.chavePrivadaDeCifra = generateCipherKeyPair().chavePrivada
    e.m.advance(2)
    await beto.c.publishCipherKey()
    e.m.advance(2)
    let reads = 0
    ana.spy.trocar = async (path) => (path === route && reads++ === 0 ? e.json({ objeto: stale }) : null)
    ana.aprovador.seen = 0
    const r = await ana.c.enviarMensagem(conversation, 'Depois da troca.')
    assert.equal(r.estado, 'aceito')
    assert.equal(ana.aprovador.seen, 2, 'the person approved twice: the cifrado changed')
    assert.equal(posts(ana.pedidos, 'mensagem').length, 2)
    assert.deepEqual((await beto.c.readConversation(conversation)).itens.map((i) => i.texto), ['Depois da troca.'])
    // always serving the old one: two attempts, then it gives up with the relay error (no endless loop)
    ana.spy.trocar = async (path) => (path === route ? e.json({ objeto: stale }) : null)
    const before = posts(ana.pedidos, 'mensagem').length
    await assert.rejects(ana.c.enviarMensagem(conversation, 'De novo.'), (err) => err instanceof RelayError && err.codigo === 'chave_de_cifra_desatualizada')
    assert.equal(posts(ana.pedidos, 'mensagem').length - before, 2)
  } finally { await e.fechar() }
})

test('other errors on send do not get a second attempt: the person who denies, and the closed conversation', async () => {
  const e = await environment()
  try {
    const { ana, beto, conversa: conversation } = await e.par()
    ana.aprovador.seen = 0
    ana.aprovador.deny = true
    await assert.rejects(ana.c.enviarMensagem(conversation, 'oi'), NotApproved)
    assert.equal(ana.aprovador.seen, 1)
    ana.aprovador.deny = false
    await beto.c.endConversation(conversation)
    ana.aprovador.seen = 0
    const before = posts(ana.pedidos, 'mensagem').length
    await assert.rejects(ana.c.enviarMensagem(conversation, 'ainda aí?'), (err) => err instanceof RelayError && err.codigo !== 'chave_de_cifra_desatualizada')
    assert.equal(ana.aprovador.seen, 1, 'a single approval')
    assert.equal(posts(ana.pedidos, 'mensagem').length - before, 1, 'a single send')
  } finally { await e.fechar() }
})

test('reading the conversation: a message from ANOTHER conversation or with a swapped object signature comes back unreadable, with no text and outside the rules', async () => {
  const e = await environment()
  try {
    const { ana, beto, conversa: old } = await e.par()
    await ana.c.enviarMensagem(old, 'Da conversa antiga.')
    await beto.c.endConversation(old)
    e.m.advance(1)
    const { conversa: fresh } = await ana.c.requestConversation(beto.rover.uid, 'De novo?')
    await beto.c.acceptConversation(fresh)
    e.m.advance(1)
    await ana.c.enviarMensagem(fresh, 'Da conversa nova.')
    const newRoute = `/v1/rovers/${beto.rover.uid}/conversas/${fresh}/mensagens`
    const genuine = async (real) => (await (await real()).json())
    // 1. the relay mixes into the new conversation the message from the old one (which is legitimate THERE)
    const fromOld = e.m.store.um('SELECT envelope FROM mensagens WHERE conversa = :c', { c: old }).envelope
    beto.spy.trocar = async (path, method, real) => {
      if (!path.startsWith(newRoute)) return null
      const page = await genuine(real)
      return e.json({ ...page, itens: [...page.itens, JSON.parse(fromOld)] })
    }
    const mixed = (await beto.c.readConversation(fresh)).itens
    assert.equal(mixed.length, 2)
    assert.deepEqual(mixed[0], { ...mixed[0], readable: true, texto: 'Da conversa nova.' })
    assert.deepEqual(mixed[1], { id: JSON.parse(fromOld).objeto.id, de: ana.rover.uid, deTerceiro: true, criadoEm: JSON.parse(fromOld).objeto.criadoEm, readable: false, texto: null, assinatura: null, withinRules: false })
    // 2. the right message with the OBJECT signature swapped for that of another Ana object (valid shape, signature that does not match)
    const otherSignature = JSON.parse(fromOld).objeto.assinatura
    beto.spy.trocar = async (path, method, real) => {
      if (!path.startsWith(newRoute)) return null
      const page = await genuine(real)
      return e.json({ ...page, itens: page.itens.map((x) => ({ ...x, objeto: { ...x.objeto, assinatura: otherSignature } })) })
    }
    assert.deepEqual((await beto.c.readConversation(fresh)).itens.map((i) => [i.readable, i.texto, i.withinRules]), [[false, null, false]])
    // 3. unable to check the network key of the sender (malformed attestation served): unreadable, and the read does not break
    const freshClient = e.cliente(beto.rover, { cifra: beto.cifra })
    freshClient.c.chavePrivadaDeCifra = beto.c.chavePrivadaDeCifra
    freshClient.spy.trocar = async (path, method, real) => {
      if (path !== `/v1/rovers/${ana.rover.uid}`) return null
      const p = await genuine(real)
      return e.json({ ...p, atestado: { ...p.atestado, handle: 'torto' } })
    }
    assert.deepEqual((await freshClient.c.readConversation(fresh)).itens.map((i) => [i.readable, i.texto]), [[false, null]])
  } finally { await e.fechar() }
})

test('reporting requires an item this client read: unreadable or missing fails before talking to the relay', async () => {
  const e = await environment()
  try {
    const { beto } = await e.par()
    const x = e.cliente(beto.rover, { cifra: beto.cifra })
    for (const item of [null, undefined, { id: 'ob_x', readable: false, texto: null, assinatura: null }]) {
      assert.throws(() => x.c.reportMessage(item, 'spam'), /Só se denuncia uma mensagem que este cliente conseguiu ler/)
    }
    assert.deepEqual(x.pedidos, [])
  } finally { await e.fechar() }
})
