// SPDX-License-Identifier: AGPL-3.0-or-later
// End to end on the person side: policy, standing authorization and revocation, against a real relay.
import test from 'node:test'
import assert from 'node:assert/strict'
import { TestApprover, RoverClient, RelayError, NotApproved, RoverPerson } from '../../packages/client/src/index.js'
import { createRelayServer } from '../../packages/relay/src/http.js'
import { newWorld, newRoverInWorld } from '../helpers/test-relay.js'

async function environment(worldOptions = {}) {
  const m = newWorld(worldOptions)
  const server = createRelayServer({ rele: m.rele })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${server.address().port}`
  const clock = () => m.relogio.agora
  const newValue = async (name) => {
    const rover = newRoverInWorld(m)
    const approver = new TestApprover({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio: clock })
    const client = new RoverClient({ base, uid: rover.uid, chavePrivada: rover.rede.chavePrivada, atestado: rover.atestado, aprovador: approver, relogio: clock })
    const person = new RoverPerson({ base, uid: rover.uid, chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio: clock })
    await client.perfil({ nome: name })
    return { rover, aprovador: approver, cliente: client, pessoa: person }
  }
  return { m, base, novo: newValue, fechar: () => new Promise((ok) => { server.closeAllConnections(); server.close(ok) }) }
}

test('the person closes the graph: the rover keeps reading its own timeline and lists, and the others cannot', async () => {
  const e = await environment()
  try {
    const a = await e.novo('Ana')
    const b = await e.novo('Beto')
    await a.cliente.seguir(b.rover.uid)
    await b.cliente.postar({ texto: 'oi da rede' })
    assert.equal((await a.cliente.homeTimeline()).itens.length, 1)
    assert.deepEqual(await a.pessoa.setPolicy({ grafo: 'privado' }), { estado: 'aceita' })
    assert.equal(a.pessoa.ultima, e.m.relogio.agora, 'the first policy uses the current time')
    // the rover reads what is its own, signing
    assert.equal((await a.cliente.homeTimeline()).itens.length, 1)
    assert.equal((await a.cliente.seguindo()).itens[0].objeto.corpo.alvo, b.rover.uid)
    assert.equal((await a.cliente.seguidores()).itens.length, 0)
    // the other rover cannot read (b, signing, is b and not a)
    await assert.rejects(() => b.cliente.seguindo(a.rover.uid), (err) => err instanceof RelayError && err.status === 403 && err.codigo === 'grafo_privado')
    assert.equal((await a.cliente.verPerfil()).grafo, 'privado')
    assert.equal((await b.cliente.verPerfil(a.rover.uid)).seguindo, null)
    // two policies in the same second: the second gets a later date on its own
    assert.deepEqual(await a.pessoa.setPolicy({ grafo: 'publico' }), { estado: 'aceita' })
    assert.deepEqual(await a.pessoa.setPolicy({ grafo: 'contagens' }), { estado: 'aceita' })
    assert.equal((await b.cliente.verPerfil(a.rover.uid)).grafo, 'contagens')
    assert.equal(a.pessoa.ultima, e.m.relogio.agora + 2, 'three policies in the same second: now, now + 1, now + 2')
  } finally { await e.fechar() }
})

test('approval requirement: the client learns from the relay and starts asking the person; a refusal sends nothing', async () => {
  const e = await environment()
  try {
    const a = await e.novo('Ana')
    const b = await e.novo('Beto')
    a.aprovador.seen.length = 0
    await a.cliente.seguir(b.rover.uid)
    assert.equal(a.aprovador.seen.length, 0, 'by default following is free')
    await a.cliente.deixarDeSeguir(b.rover.uid)
    await a.pessoa.setPolicy({ grafo: 'publico', exigirAprovacao: ['seguir'] })
    // the client does not know yet; the relay refuses and the client learns for next time
    await assert.rejects(() => a.cliente.seguir(b.rover.uid), (err) => err.codigo === 'sem_aprovacao')
    assert.equal(a.cliente.cabeca, undefined)
    assert.equal(a.aprovador.seen.length, 0)
    a.aprovador.approving = false
    await assert.rejects(() => a.cliente.seguir(b.rover.uid), NotApproved)
    assert.deepEqual(a.cliente.exigidos, ['seguir'])
    assert.equal(a.aprovador.seen.length, 1, 'the person saw the exact object')
    assert.equal(a.aprovador.seen[0].corpo.alvo, b.rover.uid)
    a.aprovador.approving = true
    assert.equal((await a.cliente.seguir(b.rover.uid)).estado, 'aceito')
    // what was not required stays free
    const before = a.aprovador.seen.length
    await a.cliente.deixarDeSeguir(b.rover.uid)
    assert.equal(a.aprovador.seen.length, before)
    // the person undoes the requirement
    await a.pessoa.setPolicy({ grafo: 'publico', exigirAprovacao: [] })
    a.cliente.cabeca = undefined
    assert.equal((await a.cliente.seguir(b.rover.uid)).estado, 'aceito')
    assert.deepEqual(a.cliente.exigidos, [])
  } finally { await e.fechar() }
})

test('standing authorization: the person issues it, the rover posts without asking for approval, and the person revokes it', async () => {
  const e = await environment({ aceitarAutorizacaoPermanente: true })
  try {
    const a = await e.novo('Ana')
    const authorization = a.pessoa.createAuthorization({ validadeS: 7200, tipos: ['postagem'], maxPorHora: 2, maxPorDia: 5 })
    assert.equal(authorization.autor, a.rover.uid)
    a.cliente.useAuthorization(authorization)
    a.aprovador.seen.length = 0
    const p = await a.cliente.postar({ texto: 'sem pedir a ninguém' })
    assert.equal(p.estado, 'aceito')
    assert.equal(a.aprovador.seen.length, 0)
    assert.equal((await a.cliente.viewObject(p.objeto.id)).autorizacao.id, authorization.id)
    // replying is not on the list: the client asks the person for approval
    const r = await a.cliente.responder(p.objeto.id, 'resposta aprovada')
    assert.equal(r.estado, 'aceito')
    assert.equal(a.aprovador.seen.length, 1)
    assert.equal((await a.cliente.viewObject(r.objeto.id)).aprovacao.objeto, r.objeto.id)
    // cap
    await a.cliente.postar({ texto: 'segunda' })
    await assert.rejects(() => a.cliente.postar({ texto: 'terceira' }), (err) => err.codigo === 'autorizacao_esgotada' && err.status === 429)
    // revokes: effective immediately
    e.m.advance(3600)
    assert.deepEqual(await a.pessoa.revokeAuthorization(authorization.id), { estado: 'aceita' })
    await assert.rejects(() => a.cliente.postar({ texto: 'depois da revogação' }), (err) => err.codigo === 'autorizacao_revogada')
    // expired locally: the client does not even use it, goes back to asking for approval
    const short = a.pessoa.createAuthorization({ validadeS: 10, tipos: ['postagem'], maxPorHora: 1, maxPorDia: 1 })
    a.cliente.useAuthorization(short)
    e.m.advance(10)
    a.aprovador.seen.length = 0
    assert.equal((await a.cliente.postar({ texto: 'aprovada de novo' })).estado, 'aceito')
    assert.equal(a.aprovador.seen.length, 1)
    // revoke all
    const fresh = a.pessoa.createAuthorization({ validadeS: 3600, tipos: ['postagem', 'resposta'], maxPorHora: 5, maxPorDia: 5 })
    a.cliente.useAuthorization(fresh)
    await a.pessoa.revokeAuthorization('todas')
    await assert.rejects(() => a.cliente.postar({ texto: 'x' }), (err) => err.codigo === 'autorizacao_revogada')
  } finally { await e.fechar() }
})

// 0.6.0: the reference relay accepts by default; an operator who turns it off passes `false`
test('relay that does not accept standing authorization: the client tries and gets the reason; without it everything works the same', async () => {
  const e = await environment({ aceitarAutorizacaoPermanente: false })
  try {
    const a = await e.novo('Ana')
    a.cliente.useAuthorization(a.pessoa.createAuthorization({ validadeS: 3600, tipos: ['postagem'], maxPorHora: 1, maxPorDia: 1 }))
    await assert.rejects(() => a.cliente.postar({ texto: 'tenta' }), (err) => err.codigo === 'autorizacao_nao_aceita' && err.status === 403)
    a.cliente.useAuthorization(null)
    assert.equal((await a.cliente.postar({ texto: 'aprovada' })).estado, 'aceito')
  } finally { await e.fechar() }
})

test('the rover cannot set a policy or revoke: without the approval key, the relay refuses', async () => {
  const e = await environment()
  try {
    const a = await e.novo('Ana')
    const impostor = new RoverPerson({ base: e.base, uid: a.rover.uid, chavePrivadaDeAprovacao: a.rover.rede.chavePrivada, relogio: () => e.m.relogio.agora })
    await assert.rejects(() => impostor.setPolicy({ grafo: 'publico' }), (err) => err.codigo === 'assinatura_invalida')
    await assert.rejects(() => impostor.revokeAuthorization('todas'), (err) => err.codigo === 'assinatura_invalida')
  } finally { await e.fechar() }
})

test('without an injected clock, the person client uses real time in seconds', () => {
  const key = newRoverInWorld(newWorld()).aprovacao.chavePrivada
  const person = new RoverPerson({ base: 'http://127.0.0.1:1/', uid: 'rvr_x', chavePrivadaDeAprovacao: key })
  const before = Math.floor(Date.now() / 1000)
  const t = person.relogio()
  assert.ok(Number.isInteger(t) && t >= before && t <= before + 2, `time ${t} outside ${before}`)
  assert.equal(person.base, 'http://127.0.0.1:1')
  const authorization = person.createAuthorization({ validadeS: 60, tipos: ['postagem'], maxPorHora: 1, maxPorDia: 1 })
  assert.ok(authorization.emitidaEm >= before && authorization.emitidaEm <= before + 2)
})
