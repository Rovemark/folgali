// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.7.0 (proposal 0009), end to end over HTTP: the person publishes with the PersonClient, without approval, next to a rover; the client
// blocks the leak before asking for approval and before sending, for rover and person; the relay refuses again what a careless client sends.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TestApprover, PersonClient, RoverClient, RelayError, ProtocolError, LeakBlocked, detectLeak, generateKeyPair,
  askRelay, findLeaks, leakInObject
} from '../../packages/client/src/index.js'
import { createObject, generateCipherKeyPair } from '../../packages/protocol/src/index.js'
import { createRelayServer } from '../../packages/relay/src/http.js'
import { newPersonInWorld, newWorld, newRoverInWorld } from '../helpers/test-relay.js'

async function environment() {
  const m = newWorld({ pessoas: true })
  const requests = []
  const server = createRelayServer({ rele: m.rele, registrar: (e) => { if (e.evento === 'pedido') requests.push(e) } })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${server.address().port}`
  const clock = () => m.relogio.agora
  const rover = () => {
    const r = newRoverInWorld(m)
    const approver = new TestApprover({ chavePrivadaDeAprovacao: r.aprovacao.chavePrivada, relogio: clock })
    return { r, aprovador: approver, cliente: new RoverClient({ base, uid: r.uid, chavePrivada: r.rede.chavePrivada, atestado: r.atestado, aprovador: approver, relogio: clock }) }
  }
  const person = (options) => {
    const p = newPersonInWorld(m, options)
    return { p, cliente: new PersonClient({ base, chavePrivada: p.rede.chavePrivada, atestado: p.atestado, relogio: clock }) }
  }
  return { m, pedidos: requests, base, rover, pessoa: person, fechar: () => new Promise((ok) => { server.closeAllConnections(); server.close(ok) }) }
}

test('the person joins, posts, comments on the rover and the rover answers: the profile and the card say person', async () => {
  const e = await environment()
  try {
    const ana = e.pessoa({ handle: 'ana.souza' })
    const pipa = e.rover()
    assert.equal(ana.cliente.isPerson, true)
    assert.equal(pipa.cliente.isPerson, false)
    assert.equal(ana.cliente.uid, ana.p.uid, 'the uid comes from the attestation')
    assert.equal((await ana.cliente.perfil({ nome: 'Ana' })).estado, 'aceito')
    await pipa.cliente.perfil({ nome: 'Pipa' })
    const post = await ana.cliente.postar({ texto: 'Fiz bolo de cenoura hoje, 3 ovos e 200 g de açúcar.' })
    assert.equal(post.estado, 'aceito')
    const ofRover = await pipa.cliente.postar({ texto: 'Tarde de leitura na rede.' })
    assert.equal((await ana.cliente.responder(ofRover.objeto.id, 'Qual livro?')).estado, 'aceito')
    assert.equal((await ana.cliente.reagir(ofRover.objeto.id, 'curtir')).estado, 'aceito')
    assert.equal((await ana.cliente.seguir(pipa.r.uid)).estado, 'aceito')
    assert.equal((await pipa.cliente.responder(post.objeto.id, 'Que delícia!')).estado, 'aceito')
    // the rover asked for approval for its texts; the person asked nobody for anything
    assert.equal(pipa.aprovador.seen.length, 3)
    const profile = await ana.cliente.verPerfil()
    assert.equal(profile.especie, 'pessoa')
    assert.equal(profile.chaveAprovacao, null)
    assert.equal((await pipa.cliente.verPerfil(ana.p.uid)).especie, 'pessoa')
    assert.equal((await pipa.cliente.verPerfil()).especie, 'rover')
    const info = await askRelay(fetch, e.base, 'GET', '/v1/info')
    assert.deepEqual(info.pessoas.emissores, [e.m.pessoas.publicKey])
  } finally { await e.fechar() }
})

test('the person client does what the rover does, and refuses without sending only the approval requirement on the profile', async () => {
  const e = await environment()
  try {
    const ana = e.pessoa()
    await ana.cliente.perfil({ nome: 'Ana' })
    // decision of 2026-11-24, night: status, delivery and portrait apply to the person
    assert.equal((await ana.cliente.estado('disponivel')).estado, 'aceito')
    assert.equal((await ana.cliente.entrega({ titulo: 'Horta da varanda', descricao: 'Plantei manjericão.', resultado: 'Já brotou.' })).estado, 'aceito')
    assert.equal((await ana.cliente.perfil({ nome: 'Ana', retrato: { corpo: 'seixo', cor: 'menta', veste: null, acessorio: null } })).estado, 'aceito')
    const before = e.pedidos.length
    await assert.rejects(() => ana.cliente.perfil({ nome: 'Ana', exigirAprovacao: ['seguir'] }), (err) => err instanceof ProtocolError && err.codigo === 'esquema' && err.campo === 'objeto.corpo.exigirAprovacao')
    assert.equal(e.pedidos.length, before, 'nothing was sent to the relay')
  } finally { await e.fechar() }
})

test('leak: the client blocks before approval and before sending, explains without repeating the snippet, and marks where it is', async () => {
  const e = await environment()
  try {
    const pipa = e.rover()
    await pipa.cliente.perfil({ nome: 'Pipa' })
    const seen = pipa.aprovador.seen.length
    const before = e.pedidos.length
    const text = 'Terminei o deploy, a chave é sk-proj-aB3xK9mQ2pL7vN4tR8sW1yZ6uE5 e o resto foi tranquilo.'
    const err = await pipa.cliente.postar({ texto: text }).catch((x) => x)
    assert.ok(err instanceof LeakBlocked)
    assert.equal(err.codigo, 'vazamento')
    assert.equal(err.tipo, 'chave-de-api')
    assert.equal(err.campo, 'objeto.corpo.texto')
    assert.equal(text.slice(err.inicio, err.fim), 'sk-proj-aB3xK9mQ2pL7vN4tR8sW1yZ6uE5')
    assert.ok(!err.message.includes('sk-proj'), 'the message does not repeat the snippet')
    assert.match(err.message, /Nada foi enviado/)
    assert.equal(pipa.aprovador.seen.length, seen, 'the person was not even asked to approve')
    assert.equal(e.pedidos.length, before, 'nothing left the computer')
    // the person too
    const ana = e.pessoa()
    await ana.cliente.perfil({ nome: 'Ana' })
    await assert.rejects(() => ana.cliente.postar({ texto: 'meu zap é (11) 98765-4321' }), (x) => x instanceof LeakBlocked && x.tipo === 'telefone')
    await assert.rejects(() => ana.cliente.perfil({ nome: 'Ana', descricao: 'ana@exemplo.com' }), (x) => x instanceof LeakBlocked && x.campo === 'objeto.corpo.descricao')
    // normal text passes
    assert.equal((await ana.cliente.postar({ texto: 'Placar 3 x 1, jogo às 19:30.' })).estado, 'aceito')
  } finally { await e.fechar() }
})

test('the relay refuses again what a careless client sends, with the type in RelayError.vazamento', async () => {
  const e = await environment()
  try {
    const ana = e.pessoa()
    await ana.cliente.perfil({ nome: 'Ana' })
    // builds and sends by hand, without the client filter
    const obj = createObject({ tipo: 'postagem', autor: ana.p.uid, criadoEm: e.m.relogio.agora, previo: ana.cliente.cabeca, corpo: { texto: 'o NAS é nas.ts.net', topicos: [] }, chavePrivada: ana.p.rede.chavePrivada })
    const err = await askRelay(fetch, e.base, 'POST', '/v1/objetos', { objeto: obj }).catch((x) => x)
    assert.ok(err instanceof RelayError)
    assert.equal(err.status, 422)
    assert.equal(err.codigo, 'vazamento')
    assert.equal(err.vazamento, 'host-interno')
    assert.equal(err.campo, 'objeto.corpo.texto')
    // on an error that is not a leak the field is null
    const other = await askRelay(fetch, e.base, 'GET', '/v1/rovers/rvr_naoexiste').catch((x) => x)
    assert.equal(other.vazamento, null)
  } finally { await e.fechar() }
})

test('device change: usarAtestado with the new key; an attestation of another person or of a rover is refused', async () => {
  const e = await environment()
  try {
    const ana = e.pessoa()
    await ana.cliente.perfil({ nome: 'Ana' })
    e.m.advance(60)
    const notebook = generateKeyPair()
    const newValue = e.m.pessoas.issue({ dono: ana.p.dono, chave: notebook.publicKey, handle: ana.p.handle })
    ana.cliente.useAttestation(newValue, notebook.chavePrivada)
    assert.equal((await ana.cliente.postar({ texto: 'do notebook' })).estado, 'aceito')
    assert.equal((await ana.cliente.verPerfil()).chave, notebook.publicKey)
    // renewal with the same key (without passing the key)
    e.m.advance(60)
    ana.cliente.useAttestation(e.m.pessoas.issue({ dono: ana.p.dono, chave: notebook.publicKey, handle: ana.p.handle }))
    assert.equal((await ana.cliente.postar({ texto: 'renovado' })).estado, 'aceito')
    const other = e.pessoa()
    assert.throws(() => ana.cliente.useAttestation(other.p.atestado), TypeError)
    assert.throws(() => ana.cliente.useAttestation(newRoverInWorld(e.m).atestado), TypeError)
    assert.throws(() => ana.cliente.useAttestation(null), TypeError)
    assert.throws(() => new PersonClient({ base: e.base, chavePrivada: notebook.chavePrivada, atestado: newRoverInWorld(e.m).atestado }), TypeError)
    assert.throws(() => new PersonClient({ base: e.base, chavePrivada: notebook.chavePrivada }), TypeError)
  } finally { await e.fechar() }
})

test('the detector functions are exported by the client package', () => {
  assert.equal(detectLeak('fala com ana@exemplo.com').tipo, 'email')
  assert.deepEqual(findLeaks('nada aqui'), [])
  assert.equal(leakInObject({ corpo: { texto: '10.0.0.1' } }).tipo, 'ip-privado')
})

test('private message between person and rover through the client: the person approves nothing, the rover approves, both read', async () => {
  const m = newWorld({ pessoas: true, mensagens: true })
  const server = createRelayServer({ rele: m.rele, rajada: { capacity: 100000, perSecond: 100000 } })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${server.address().port}`
  const clock = () => m.relogio.agora
  try {
    const p = newPersonInWorld(m, { validadeS: 30 * 86400 })
    const r = newRoverInWorld(m)
    const trusted = [p.atestado.emissor, r.atestado.emissor]
    const ana = new PersonClient({ base, chavePrivada: p.rede.chavePrivada, atestado: p.atestado, relogio: clock, trustedIssuers: trusted, chavePrivadaDeCifra: generateCipherKeyPair().chavePrivada })
    const approver = new TestApprover({ chavePrivadaDeAprovacao: r.aprovacao.chavePrivada, relogio: clock })
    const pipa = new RoverClient({ base, uid: r.uid, chavePrivada: r.rede.chavePrivada, atestado: r.atestado, aprovador: approver, relogio: clock, trustedIssuers: trusted, chavePrivadaDeCifra: generateCipherKeyPair().chavePrivada })
    await ana.perfil({ nome: 'Ana' })
    await pipa.perfil({ nome: 'Pipa' })
    await ana.publishCipherKey()
    await pipa.publishCipherKey()
    await ana.pedirAmizade(r.uid)
    await pipa.aceitarAmizade(p.uid)
    const seenBefore = approver.seen.length
    const { conversa: conversation } = await ana.requestConversation(r.uid, 'Bora trocar receitas?')
    assert.equal((await pipa.acceptConversation(conversation)).resultado, 'ativa')
    m.advance(5)
    await ana.enviarMensagem(conversation, 'Mandei a do bolo!')
    await pipa.enviarMensagem(conversation, 'Recebi, obrigado.')
    assert.equal(approver.seen.length - seenBefore, 2, 'the rover approved the accept and its message; the person asked for nothing')
    // both read: the person network key is checked against the person attestation
    assert.deepEqual((await pipa.readConversation(conversation)).itens.map((i) => [i.readable, i.texto]), [[true, 'Recebi, obrigado.'], [true, 'Mandei a do bolo!']])
    assert.deepEqual((await ana.readConversation(conversation)).itens.map((i) => i.readable), [true, true])
  } finally { await new Promise((ok) => { server.closeAllConnections(); server.close(ok) }) }
})
