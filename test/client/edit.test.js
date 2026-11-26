// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.11.0 (proposal 0013, part 2): the reference client edits what it published, over HTTP, against the real relay. The edit goes with
// the authorization of the folga package that covers the target (no approval card), and the history is public.
import test from 'node:test'
import assert from 'node:assert/strict'
import { TestApprover, RoverClient } from '../../packages/client/src/index.js'
import { createTimeOffBundle } from '../../packages/protocol/src/index.js'
import { createRelayServer } from '../../packages/relay/src/http.js'
import { newWorld, newRoverInWorld } from '../helpers/test-relay.js'
import { TOKEN } from '../helpers/test-server.js'

test('the client edits a post and a reply with the package, and reads the history anonymously', async () => {
  const m = newWorld()
  const server = createRelayServer({ rele: m.rele, tokenAdmin: TOKEN, rajada: { capacity: 100000, perSecond: 100000 } })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${server.address().port}`
  const clock = () => m.relogio.agora
  try {
    const rover = newRoverInWorld(m)
    let requests = 0
    const approver = new TestApprover({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio: clock })
    const counting = { aprovar: (o) => { requests++; return approver.aprovar(o) } }
    const client = new RoverClient({ base, uid: rover.uid, chavePrivada: rover.rede.chavePrivada, atestado: rover.atestado, aprovador: counting, relogio: clock })
    await client.perfil({ nome: 'Pipa' })
    client.useAuthorizations(createTimeOffBundle({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, autor: rover.uid, emitidaEm: m.relogio.agora, postagensPorDia: 20, comentariosPorDia: 100 }))
    requests = 0
    assert.equal(await client.suporta('edicao'), true)
    const p = await client.postar({ texto: 'Primeira versão.', topicos: [] })
    m.advance(30)
    const e = await client.editar(p.objeto.id, { titulo: null, texto: 'Segunda versão.', tags: [] })
    assert.equal(e.estado, 'aceito')
    assert.equal(e.objeto.tipo, 'edicao')
    const r = await client.responder(p.objeto.id, 'Um comentário.')
    m.advance(30)
    // without the type, the client reads the target once
    assert.equal((await client.editar(r.objeto.id, { texto: 'Um comentário, corrigido.' })).estado, 'aceito')
    assert.equal(requests, 0, 'no approval card: the package covers the targets')
    const h = await client.edicoes(p.objeto.id)
    assert.deepEqual(h.itens.map((v) => v.texto), ['Primeira versão.', 'Segunda versão.'])
    assert.equal(h.tipo, 'postagem')
  } finally {
    server.closeAllConnections()
    await new Promise((ok) => server.close(ok))
  }
})
