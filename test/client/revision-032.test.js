// SPDX-License-Identifier: AGPL-3.0-or-later
// Revision 0.3.2 through the reference client against the real relay: discover the new resources and use the panel, the vocabulary, the orderings
// by people and the announcements, end to end. A 0.3.1 relay (without the new `recursos`) is offered none of this.
import test from 'node:test'
import assert from 'node:assert/strict'
import { TestApprover, RoverClient } from '../../packages/client/src/index.js'
import { createRelayServer } from '../../packages/relay/src/http.js'
import { newWorld, newRoverInWorld } from '../helpers/test-relay.js'
import { TOKEN } from '../helpers/test-server.js'

async function environment() {
  const m = newWorld()
  const server = createRelayServer({ rele: m.rele, tokenAdmin: TOKEN, rajada: { capacity: 100000, perSecond: 100000 } })
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
  return { m, base, novo: newValue, fechar: () => new Promise((ok) => { server.closeAllConnections(); server.close(ok) }) }
}

test('the client discovers the four new resources and uses everything end to end', async () => {
  const e = await environment()
  try {
    const [ana, beto, caio, duda] = [await e.novo('Ana'), await e.novo('Beto'), await e.novo('Caio'), await e.novo('Duda')]
    for (const r of ['inicio', 'ordem-por-pessoas', 'vocabulario', 'anuncios']) assert.equal(await ana.cliente.suporta(r), true, r)
    assert.equal((await ana.cliente.info()).versaoDoRascunho, '0.11.0')

    const using = await ana.cliente.createCommunity({ nome: 'Fórum novo', descricao: 'D', regras: 'R', tema: 'rovers', categorias: ['Geral'] })
    for (const x of [beto, caio, duda]) await x.cliente.joinCommunity(using.id)
    e.m.advance(3601)

    // vocabulary and marks
    assert.equal((await ana.cliente.setVocabulary(using.id, {
      etiquetas: [{ chave: 'bug', rotulo: 'Bug', cor: 'laranja' }],
      status: [{ chave: 'aberto', rotulo: 'Aberto', cor: 'verde', categorias: null }]
    })).estado, 'aceito')
    const v = (await beto.cliente.comunidade(using.id)).vocabulario
    assert.deepEqual(v.etiquetas, [{ chave: 'bug', rotulo: 'Bug', cor: 'laranja' }])
    assert.equal(v.padrao, false)
    const t1 = await beto.cliente.topico({ comunidade: using.id, titulo: 'Um tópico com três pessoas', texto: 'Texto', tags: [] })
    const t2 = await beto.cliente.topico({ comunidade: using.id, titulo: 'Um tópico com uma pessoa', texto: 'Texto', tags: [] })
    assert.equal((await beto.cliente.markTopic(t1.id, { etiquetas: ['bug'], status: 'aberto' })).estado, 'aceito')
    assert.deepEqual((await caio.cliente.topicos(using.id, { etiqueta: 'bug' })).itens.map((i) => i.id), [t1.id])
    assert.deepEqual((await caio.cliente.topicos(using.id, { status: 'aberto' })).itens[0].marcas, { etiquetas: ['bug'], status: 'aberto' })

    // ordering by people
    for (const x of [ana, caio, duda]) await x.cliente.replyInForum(t1.id, 'resposta de uma pessoa')
    await ana.cliente.replyInForum(t2.id, 'uma só')
    assert.deepEqual((await caio.cliente.topicos(using.id, { ordem: 'recentes' })).itens.map((i) => i.id), [t2.id, t1.id])
    assert.deepEqual((await caio.cliente.topicos(using.id, { ordem: 'melhores' })).itens.map((i) => i.id), [t1.id, t2.id])
    assert.deepEqual((await caio.cliente.topicos(using.id, { ordem: 'em-alta', janela: '7d' })).itens.map((i) => i.id), [t1.id, t2.id])
    assert.equal((await caio.cliente.topicReplies(t1.id, { ordem: 'melhores' })).itens.length, 3)
    const findings = await caio.cliente.busca('tópico', { tipo: 'topicos', ordem: 'melhores' })
    assert.deepEqual(findings.itens.map((i) => i.id), [t1.id, t2.id])

    // home panel
    const p = await beto.cliente.inicio()
    assert.equal(p.voce.uid, beto.rover.uid)
    assert.deepEqual(p.atividade.map((i) => [i.id, i.respostas]).sort(), [[t1.id, 3], [t2.id, 1]].sort())
    const after = await beto.cliente.inicio({ desde: p.agora })
    assert.equal(after.avisos.total, 0)
    assert.deepEqual(after.atividade, [])
    assert.equal(JSON.stringify(p).includes('Um tópico com'), false, 'no title in the panel')

    // 0.11.0: the start of the break, one read with who talked to the rover and what to do now
    assert.equal(await beto.cliente.suporta('inicio-da-folga'), true)
    const f = await beto.cliente.timeOffStart({ limite: 5 })
    assert.equal(f.minhaConta.uid, beto.rover.uid)
    assert.deepEqual(f.atividadeNasMinhasPostagens.map((i) => [i.id, i.comentariosNovos]).sort(), [[t1.id, 3], [t2.id, 1]].sort())
    assert.ok(f.atividadeNasMinhasPostagens.every((i) => i.comentarios.every((c) => c.responderCom.tipo === 'resposta-forum')))
    assert.equal(f.oQueFazerAgora[0].acao, 'responder')
    assert.deepEqual((await beto.cliente.timeOffStart({ desde: f.agora })).atividadeNasMinhasPostagens, [])

    // announcements: the client reads; the administration publishes
    assert.deepEqual((await ana.cliente.anuncios()).itens, [])
    const r = await fetch(`${e.base}/v1/admin/anuncios`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ titulo: 'Manutenção hoje', texto: 'O relé reinicia às 3h.', fixado: true }) })
    const { id } = await r.json()
    assert.equal(r.status, 201)
    assert.deepEqual((await ana.cliente.anuncios()).itens.map((i) => i.titulo), ['Manutenção hoje'])
    assert.equal((await ana.cliente.anuncio(id)).fixado, true)
    assert.equal((await beto.cliente.inicio({ desde: 0 })).anuncios.ultimo.id, id)
  } finally { await e.fechar() }
})

test('a 0.3.1 relay (without the new resources) offers nothing from 0.3.2 to the client', async () => {
  const e = await environment()
  try {
    const x = await e.novo('Ana')
    const pretended = { ...(await x.cliente.info()), versaoDoRascunho: '0.3.1', recursos: ['voce-datas', 'postagem-detalhe'] }
    const cliente0 = Object.create(x.cliente)
    cliente0.info = async () => pretended
    for (const r of ['inicio', 'ordem-por-pessoas', 'vocabulario', 'anuncios']) assert.equal(await cliente0.suporta(r), false, r)
    assert.equal(await cliente0.suporta('postagem-detalhe'), true, 'the 0.3.1 ones stay')
  } finally { await e.fechar() }
})
