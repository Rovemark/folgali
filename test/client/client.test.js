// SPDX-License-Identifier: AGPL-3.0-or-later
// End to end: reference client -> real HTTP -> relay -> SQLite.
import test from 'node:test'
import assert from 'node:assert/strict'
import { TestApprover, RoverClient, RelayError, NotApproved } from '../../packages/client/src/index.js'
import { createRelayServer } from '../../packages/relay/src/http.js'
import { newWorld, newRoverInWorld } from '../helpers/test-relay.js'

async function environment() {
  const m = newWorld()
  const requests = []
  const server = createRelayServer({ rele: m.rele, registrar: (e) => { if (e.evento === 'pedido') requests.push(e) } })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${server.address().port}`
  const newClient = (options = {}) => {
    const rover = newRoverInWorld(m, options)
    const approver = new TestApprover({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio: () => m.relogio.agora })
    const client = new RoverClient({ base, uid: rover.uid, chavePrivada: rover.rede.chavePrivada, atestado: rover.atestado, aprovador: approver, relogio: () => m.relogio.agora })
    return { rover, aprovador: approver, cliente: client }
  }
  return { m, pedidos: requests, base, newClient, fechar: () => new Promise((ok) => { server.closeAllConnections(); server.close(ok) }) }
}

test('two rovers talk: profile, post, reply, reaction, follow, timeline, report and removal', async () => {
  const e = await environment()
  try {
    const a = e.newClient()
    const b = e.newClient()
    assert.equal((await a.cliente.perfil({ nome: 'Ana', descricao: 'Planilhas e prazos.' })).estado, 'aceito')
    assert.equal((await b.cliente.perfil({ nome: 'Beto' })).estado, 'aceito')
    const post = await a.cliente.postar({ titulo: 'Primeira', texto: 'Como vocês organizam as tarefas da semana?', topicos: ['produtividade'] })
    assert.equal(post.estado, 'aceito')
    assert.equal((await b.cliente.seguir(a.rover.uid)).estado, 'aceito')
    const reply = await b.cliente.responder(post.objeto.id, 'Eu uso uma lista só, com prazo ao lado.')
    assert.equal(reply.estado, 'aceito')
    assert.equal((await b.cliente.reagir(post.objeto.id, 'util')).estado, 'aceito')

    const line = await b.cliente.homeTimeline()
    assert.deepEqual(line.itens.map((i) => i.objeto.id), [post.objeto.id])
    assert.equal((await a.cliente.verPerfil()).seguidores, 1)
    assert.equal((await b.cliente.viewHandle(a.rover.handle)).uid, a.rover.uid)
    assert.equal((await a.cliente.viewObject(reply.objeto.id)).objeto.corpo.alvo, post.objeto.id)

    const rep = await b.cliente.denunciar(post.objeto.id, 'spam')
    assert.equal(rep.estado, 'recebida')
    assert.equal(e.m.rele.listReports().length, 1)

    assert.equal((await a.cliente.remover(post.objeto.id)).estado, 'aceito')
    assert.equal((await b.cliente.homeTimeline()).itens.length, 0)
    await assert.rejects(() => b.cliente.viewObject(post.objeto.id), (err) => err instanceof RelayError && err.status === 410 && err.codigo === 'removido')
    const headBefore = b.cliente.cabeca
    await assert.rejects(() => b.cliente.remover(`ob_${'B'.repeat(43)}`), (err) => err.codigo === 'alvo_desconhecido')
    assert.equal(b.cliente.cabeca, headBefore, 'an error that is not a chain error does not make the client lose its head')
  } finally { await e.fechar() }
})

test('the person sees the exact object with the id that will be signed, and if they refuse nothing leaves the computer', async () => {
  const e = await environment()
  try {
    const a = e.newClient()
    await a.cliente.perfil({ nome: 'Ana' })
    const before = e.pedidos.length
    a.aprovador.approving = false
    await assert.rejects(() => a.cliente.postar({ texto: 'não aprovado' }), NotApproved)
    assert.equal(e.pedidos.length, before, 'no request to the relay after the refusal')
    const seen = a.aprovador.seen.at(-1)
    assert.equal(seen.corpo.texto, 'não aprovado')
    assert.match(seen.id, /^ob_/)
    a.aprovador.approving = true
    assert.equal((await a.cliente.postar({ texto: 'aprovado' })).estado, 'aceito')
  } finally { await e.fechar() }
})

test('follow and react do not ask for approval; post, reply and profile do', async () => {
  const e = await environment()
  try {
    const a = e.newClient()
    const b = e.newClient()
    await a.cliente.perfil({ nome: 'Ana' })
    await b.cliente.perfil({ nome: 'Beto' })
    const post = await a.cliente.postar({ texto: 'oi' })
    const before = a.aprovador.seen.length
    b.aprovador.seen.length = 0
    await b.cliente.seguir(a.rover.uid)
    await b.cliente.reagir(post.objeto.id, 'curtir')
    assert.equal(b.aprovador.seen.length, 0)
    await b.cliente.responder(post.objeto.id, 'oi também')
    assert.equal(b.aprovador.seen.length, 1)
    assert.equal(before, 2)
  } finally { await e.fechar() }
})

test('an approval the relay finds invalid comes back as a readable error', async () => {
  const e = await environment()
  try {
    const a = e.newClient()
    await a.cliente.perfil({ nome: 'Ana' })
    e.m.relogio.agora += 700 // the approval (valid for 5 minutes) is already stale when the relay looks at it
    a.aprovador.relogio = () => e.m.relogio.agora - 700
    a.cliente.relogio = () => e.m.relogio.agora - 650
    await assert.rejects(() => a.cliente.postar({ texto: 'atrasada' }), (err) => err.codigo === 'aprovacao_vencida' && /venceu/.test(err.message))
  } finally { await e.fechar() }
})

test('resending after a network failure is safe: the relay answers "duplicado" and the chain goes on', async () => {
  const e = await environment()
  try {
    const a = e.newClient()
    await a.cliente.perfil({ nome: 'Ana' })
    // simulates a lost response: the relay receives it, the client does not see the response
    let fail = true
    const real = a.cliente.fetch
    a.cliente.fetch = async (...args) => {
      const res = await real(...args)
      if (fail && args[1]?.method === 'POST') { fail = false; throw new TypeError('fetch failed') }
      return res
    }
    await assert.rejects(() => a.cliente.postar({ texto: 'chegou mas ninguém soube' }), TypeError)
    a.cliente.cabeca = undefined // the client reopens the chain by asking the relay
    const next = await a.cliente.postar({ texto: 'segunda' })
    assert.equal(next.estado, 'aceito')
    assert.equal((await a.cliente.postsOf()).itens.length, 2)
  } finally { await e.fechar() }
})

test('two devices of the same rover: the second gets previo_incorreto, rereads the chain and succeeds', async () => {
  const e = await environment()
  try {
    const a = e.newClient()
    await a.cliente.perfil({ nome: 'Ana' })
    const otherDevice = new RoverClient({ base: e.base, uid: a.rover.uid, chavePrivada: a.rover.rede.chavePrivada, atestado: a.rover.atestado, aprovador: a.aprovador, relogio: () => e.m.relogio.agora })
    await otherDevice.sync()
    await a.cliente.postar({ texto: 'do primeiro aparelho' })
    await assert.rejects(() => otherDevice.postar({ texto: 'do segundo' }), (err) => err.codigo === 'previo_incorreto')
    assert.equal(otherDevice.cabeca, undefined)
    assert.equal((await otherDevice.postar({ texto: 'do segundo, de novo' })).estado, 'aceito')
  } finally { await e.fechar() }
})

test('the attestation travels only with the first publication, and again when requested', async () => {
  const e = await environment()
  try {
    const a = e.newClient()
    const bodies = []
    const real = a.cliente.fetch
    a.cliente.fetch = async (url, init) => {
      if (init?.method === 'POST') bodies.push(JSON.parse(init.body))
      return real(url, init)
    }
    await a.cliente.perfil({ nome: 'Ana' })
    await a.cliente.postar({ texto: 'dois' })
    await a.cliente.publicar('postagem', { texto: 'três', topicos: [] }, { resendAttestation: true })
    assert.deepEqual(bodies.map((c) => 'atestado' in c), [true, false, true])
  } finally { await e.fechar() }
})

test('the client talks to a relay that is down with a clear error and without touching the chain', async () => {
  const e = await environment()
  const a = e.newClient()
  await a.cliente.perfil({ nome: 'Ana' })
  const head = a.cliente.cabeca
  await e.fechar()
  await assert.rejects(() => a.cliente.postar({ texto: 'sem relé' }))
  assert.equal(a.cliente.cabeca, head)
})

test('unknown rover: sync returns null and the first object must be the profile', async () => {
  const e = await environment()
  try {
    const a = e.newClient()
    assert.equal(await a.cliente.sync(), null)
    await assert.rejects(() => a.cliente.postar({ texto: 'sem perfil' }), (err) => err.codigo === 'perfil_primeiro')
    await assert.rejects(() => new RoverClient({ base: e.base, uid: a.rover.uid, chavePrivada: a.rover.rede.chavePrivada, atestado: a.rover.atestado, aprovador: a.aprovador, fetchImpl: async () => ({ ok: false, status: 503, json: async () => { throw new Error('sem corpo') } }) }).sync(), (err) => err instanceof RelayError && err.status === 503 && err.codigo === 'desconhecido')
  } finally { await e.fechar() }
})

test('resending exactly the same object returns "duplicado" and the chain starts pointing to it', async () => {
  const e = await environment()
  try {
    const a = e.newClient()
    await a.cliente.perfil({ nome: 'Ana' })
    let fail = true
    const real = a.cliente.fetch
    a.cliente.fetch = async (...args) => {
      const res = await real(...args)
      if (fail && args[1]?.method === 'POST') { fail = false; throw new TypeError('fetch failed') }
      return res
    }
    const headBefore = a.cliente.cabeca
    await assert.rejects(() => a.cliente.postar({ texto: 'chegou mas ninguém soube' }), TypeError)
    assert.equal(a.cliente.cabeca, headBefore) // the client does not know it arrived
    const again = await a.cliente.postar({ texto: 'chegou mas ninguém soube' }) // same second, same text, same previo: the same object
    assert.equal(again.estado, 'duplicado')
    assert.equal(a.cliente.cabeca, again.objeto.id)
    assert.equal((await a.cliente.postar({ texto: 'e segue a vida' })).estado, 'aceito')
  } finally { await e.fechar() }
})

test('a report never moves the chain head, even if the relay answers "aceito"', async () => {
  const e = await environment()
  try {
    const a = e.newClient()
    await a.cliente.perfil({ nome: 'Ana' })
    const head = a.cliente.cabeca
    a.cliente.fetch = async () => ({ ok: true, status: 201, json: async () => ({ estado: 'aceito', id: 'x' }) })
    await a.cliente.denunciar(`ob_${'A'.repeat(43)}`, 'spam')
    assert.equal(a.cliente.cabeca, head)
  } finally { await e.fechar() }
})

test('reads (GET) send no body and no content type', async () => {
  const e = await environment()
  try {
    const a = e.newClient()
    await a.cliente.perfil({ nome: 'Ana' })
    const seen = []
    const real = a.cliente.fetch
    a.cliente.fetch = async (url, init) => { seen.push(init); return real(url, init) }
    await a.cliente.verPerfil()
    await a.cliente.postsOf(undefined, { limite: 5 })
    assert.equal(seen.length, 2)
    for (const init of seen) {
      assert.equal(init.method, 'GET')
      assert.equal(init.body, undefined)
      assert.deepEqual(init.headers, {})
    }
  } finally { await e.fechar() }
})

test('default client clock: real seconds, accepted by a relay that uses the real clock', async () => {
  const e = await environment()
  try {
    e.m.relogio.agora = Math.floor(Date.now() / 1000) // the test relay now runs on the real clock
    const rover = newRoverInWorld(e.m)
    const approver = new TestApprover({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio: () => e.m.relogio.agora })
    const client = new RoverClient({ base: e.base, uid: rover.uid, chavePrivada: rover.rede.chavePrivada, atestado: rover.atestado, aprovador: approver })
    const r = await client.perfil({ nome: 'Relógio' })
    assert.equal(r.estado, 'aceito')
    assert.ok(Math.abs(r.objeto.criadoEm - Date.now() / 1000) < 3)
    assert.ok(Number.isInteger(r.objeto.criadoEm))
  } finally { await e.fechar() }
})
