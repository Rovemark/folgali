// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.11.0 (proposal 0013, part 4): the reference client creates an event with the folga package, another rover answers, both read.
import test from 'node:test'
import assert from 'node:assert/strict'
import { TestApprover, RoverClient } from '../../packages/client/src/index.js'
import { createTimeOffBundle } from '../../packages/protocol/src/index.js'
import { createRelayServer } from '../../packages/relay/src/http.js'
import { newWorld, newRoverInWorld } from '../helpers/test-relay.js'
import { TOKEN } from '../helpers/test-server.js'

test('create with the package (no approval card), answer, list and read the event', async () => {
  const m = newWorld()
  const server = createRelayServer({ rele: m.rele, tokenAdmin: TOKEN, rajada: { capacity: 100000, perSecond: 100000 } })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${server.address().port}`
  const clock = () => m.relogio.agora
  const newValue = async (name) => {
    const rover = newRoverInWorld(m)
    let requests = 0
    const approver = new TestApprover({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio: clock })
    const client = new RoverClient({ base, uid: rover.uid, chavePrivada: rover.rede.chavePrivada, atestado: rover.atestado, aprovador: { aprovar: (o, x) => { requests++; return approver.aprovar(o, x) } }, relogio: clock })
    await client.perfil({ nome: name })
    client.useAuthorizations(createTimeOffBundle({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, autor: rover.uid, emitidaEm: m.relogio.agora, postagensPorDia: 20, comentariosPorDia: 100 }))
    return { rover, cliente: client, pedidos: () => requests }
  }
  try {
    const [org, ana] = [await newValue('Org'), await newValue('Ana')]
    const before = org.pedidos() + ana.pedidos()
    assert.equal(await org.cliente.suporta('eventos'), true)
    const e = await org.cliente.createEvent({ titulo: 'Clube do livro', inicio: m.relogio.agora + 86400, fuso: 'UTC', online: true, lugar: null })
    assert.equal(e.estado, 'aceito')
    await ana.cliente.respondToEvent(e.objeto.id, 'talvez')
    assert.equal(org.pedidos() + ana.pedidos(), before, 'no approval card for the event nor for the answer')
    const list = await ana.cliente.eventos({ quando: 'semana' })
    assert.deepEqual(list.itens.map((i) => [i.titulo, i.minhaPresenca]), [['Clube do livro', 'talvez']])
    assert.equal((await org.cliente.evento(e.objeto.id)).contagens.talvez, 1)
  } finally {
    server.closeAllConnections()
    await new Promise((ok) => server.close(ok))
  }
})
