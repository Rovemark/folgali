// SPDX-License-Identifier: AGPL-3.0-or-later
// Revision 0.3.1 through the reference client against the real relay: discover what the relay understands and use the new routes.
import test from 'node:test'
import assert from 'node:assert/strict'
import { TestApprover, RoverClient } from '../../packages/client/src/index.js'
import { createRelayServer } from '../../packages/relay/src/http.js'
import { newWorld, newRoverInWorld } from '../helpers/test-relay.js'

async function environment() {
  const m = newWorld()
  const server = createRelayServer({ rele: m.rele, rajada: { capacity: 100000, perSecond: 100000 } })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${server.address().port}`
  const clock = () => m.relogio.agora
  const newValue = async (name) => {
    const rover = newRoverInWorld(m)
    const approver = new TestApprover({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio: clock })
    const client = new RoverClient({ base, uid: rover.uid, chavePrivada: rover.rede.chavePrivada, atestado: rover.atestado, aprovador: approver, relogio: clock })
    await client.perfil({ nome: name })
    return { rover, cliente: client }
  }
  return { m, novo: newValue, fechar: () => new Promise((ok) => { server.closeAllConnections(); server.close(ok) }) }
}

test('the client discovers the relay resources and uses the new routes end to end', async () => {
  const e = await environment()
  try {
    const [ana, beto, caio] = [await e.novo('Ana'), await e.novo('Beto'), await e.novo('Caio')]
    assert.equal(await ana.cliente.suporta('postagem-detalhe'), true)
    assert.equal(await ana.cliente.suporta('recurso-que-nao-existe'), false)
    const post = await ana.cliente.postar({ texto: 'uma postagem para o cliente' })
    await beto.cliente.reagir(post.id, 'curtir')
    await caio.cliente.responder(post.id, 'concordo')
    const d = await beto.cliente.postagem(post.id)
    assert.deepEqual(d.contagens, { respostas: 1, reacoes: { curtir: 1, util: 0 } })
    assert.equal(d.minhaReacao, 'curtir')
    assert.equal((await beto.cliente.postReplies(post.id)).itens.length, 1)
    const complete = await beto.cliente.fullPosts(ana.rover.uid)
    assert.equal(complete.itens[0].tipo, 'postagem')
    assert.equal(complete.itens[0].minhaReacao, 'curtir')
    const using = await ana.cliente.createCommunity({ nome: 'Dispensas', descricao: 'D', regras: 'R', tema: 'rovers', categorias: [] })
    await beto.cliente.joinCommunity(using.id)
    await caio.cliente.joinCommunity(using.id)
    e.m.advance(3601)
    const t = await beto.cliente.topico({ comunidade: using.id, titulo: 'Tópico dispensável', texto: 'Texto', tags: [] })
    await caio.cliente.denunciar(t.id, 'spam')
    assert.equal((await ana.cliente.filaDeModeracao(using.id)).denuncias[0].topico, t.id)
    assert.equal((await ana.cliente.dismissReport(using.id, t.id)).estado, 'aceito')
    assert.deepEqual((await ana.cliente.filaDeModeracao(using.id)).denuncias, [])
    assert.equal((await ana.cliente.registroDaComunidade(using.id)).itens[0].acao, 'dispensa')
    assert.deepEqual((await beto.cliente.removidos()).itens, [])
    assert.deepEqual((await beto.cliente.depoimentosEnviados()).itens, [])
    assert.deepEqual((await ana.cliente.temasDePaginas()).itens, [])
  } finally { await e.fechar() }
})
