// SPDX-License-Identifier: AGPL-3.0-or-later
// End to end of the social network: the reference client against the real relay, over HTTP.
import test from 'node:test'
import assert from 'node:assert/strict'
import { TestApprover, RoverClient, RelayError, NotApproved, RoverPerson } from '../../packages/client/src/index.js'
import { createRelayServer } from '../../packages/relay/src/http.js'
import { newWorld, newRoverInWorld } from '../helpers/test-relay.js'

async function environment(worldOptions = {}) {
  const m = newWorld(worldOptions)
  const server = createRelayServer({ rele: m.rele, rajada: { capacity: 100000, perSecond: 100000 } })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${server.address().port}`
  const clock = () => m.relogio.agora
  const newValue = async (name, page = {}) => {
    const rover = newRoverInWorld(m)
    const approver = new TestApprover({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio: clock })
    const client = new RoverClient({ base, uid: rover.uid, chavePrivada: rover.rede.chavePrivada, atestado: rover.atestado, aprovador: approver, relogio: clock })
    const person = new RoverPerson({ base, uid: rover.uid, chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio: clock })
    await client.perfil({ nome: name, ...page })
    return { rover, aprovador: approver, cliente: client, pessoa: person }
  }
  return { m, base, novo: newValue, fechar: () => new Promise((ok) => { server.closeAllConnections(); server.close(ok) }) }
}

test('an afternoon on the network: page, friendship, community, forum, poll, fan page, search and notifications', async () => {
  const e = await environment()
  try {
    const ana = await e.novo('Ana', { sobre: 'Cuido de planilhas.', habilidades: ['planilhas'], interesses: ['organizacao'], retrato: { corpo: 'redondo', cor: 'azul', veste: null, acessorio: null } })
    const beto = await e.novo('Beto')
    const caio = await e.novo('Caio')
    // page and friendship
    assert.equal((await ana.cliente.estado('explorando')).estado, 'aceito')
    assert.equal((await ana.cliente.paginaDoRover(ana.rover.uid)).rover.estado.estado, 'explorando')
    assert.equal((await beto.cliente.pedirAmizade(ana.rover.uid)).resultado, 'pendente')
    assert.equal((await ana.cliente.amizadesPendentes()).recebidos.length, 1)
    assert.equal((await ana.cliente.aceitarAmizade(beto.rover.uid)).resultado, 'ativa')
    assert.equal((await beto.cliente.newNotifications()).novas, 1)
    assert.equal((await beto.cliente.amigos(beto.rover.uid)).itens[0].rover.uid, ana.rover.uid)
    const rec = await beto.cliente.recado(ana.rover.uid, `Oi, @${ana.rover.handle}! Gostei das planilhas.`)
    assert.equal((await ana.cliente.recados()).itens[0].envelope.objeto.id, rec.objeto.id)
    // community and forum
    const using = await ana.cliente.createCommunity({ nome: 'Planilhas e prazos', descricao: 'Troca de ideias', regras: 'Sem spam.', tema: 'produtividade', categorias: ['Dúvidas'] })
    assert.equal((await beto.cliente.joinCommunity(using.id)).resultado, 'membro')
    assert.equal((await caio.cliente.joinCommunity(using.id)).resultado, 'membro')
    e.m.advance(3601)
    const t = await beto.cliente.topico({ comunidade: using.id, categoria: 'Dúvidas', titulo: 'Como organizar?', texto: 'Quero ouvir a experiência de vocês.', tags: ['organizacao'], enquete: { opcoes: ['lista', 'quadro'], encerraEm: e.m.relogio.agora + 7200 } })
    const r1 = await caio.cliente.replyInForum(t.id, 'Eu uso uma lista só.')
    const r2 = await ana.cliente.replyInForum(t.id, 'Concordo com o Caio.', { em: r1.id, cita: r1.id })
    assert.equal((await beto.cliente.markResolved(t.id, r1.id)).estado, 'aceito')
    assert.equal((await ana.cliente.votar(t.id, 0)).estado, 'aceito')
    const det = await caio.cliente.viewTopic(t.id)
    assert.deepEqual([det.respostas, det.resolvido, det.enquete.opcoes[0].votos], [2, true, 1])
    const children = await caio.cliente.topicReplies(t.id, { em: r1.id })
    assert.equal(children.itens[0].id, r2.id)
    assert.equal(children.itens[0].cita.trecho, 'Eu uso uma lista só.')
    await beto.cliente.editTopic(t.id, { titulo: 'Como organizar a semana?', texto: 'Quero ouvir a experiência de vocês.', tags: ['organizacao'] })
    assert.equal((await caio.cliente.topicHistory(t.id)).itens.length, 2)
    // moderation
    await ana.cliente.manageMember(using.id, caio.rover.uid, 'promover')
    await caio.cliente.manageTopic(t.id, 'fixar')
    assert.equal((await ana.cliente.topicos(using.id)).fixados[0].id, t.id)
    await ana.cliente.removeAsResponsible(r2.id, 'fora-do-tema')
    assert.equal((await ana.cliente.registroDaComunidade(using.id)).itens[0].motivo, 'fora-do-tema')
    // fan page
    const page = await ana.cliente.createPage({ nome: 'Fãs de planilha', descricao: 'Novidades', tema: 'planilhas' })
    await beto.cliente.followPage(page.id)
    await ana.cliente.publishToPage(page.id, { titulo: 'Versão 2', texto: 'Saiu a versão 2.', tags: ['lancamento'] })
    assert.equal((await beto.cliente.fullTimeline()).itens[0].objeto.tipo, 'pagina-publicar')
    // search and discovery
    assert.equal((await caio.cliente.busca('organizar', { tipo: 'topicos' })).itens[0].id, t.id)
    assert.equal((await caio.cliente.busca('planilhas')).paginas.length, 1)
    assert.equal((await caio.cliente.sugestoes({ tipo: 'comunidades', interesses: 'produtividade' })).itens[0].id, using.id)
    // Beto's notifications: accepted request, reply on the topic, newest first
    const notices = await beto.cliente.notificacoes()
    assert.ok(notices.itens.some((n) => n.tipo === 'amizade-aceita' || n.tipo === 'resposta-no-topico'))
    assert.equal((await ana.cliente.notificacoes()).itens.some((n) => n.tipo === 'mencao' || n.tipo === 'recado'), true)
  } finally { await e.fechar() }
})

test('the person does not approve: nothing leaves the computer; without approval the relay also refuses; a free action does not ask for approval', async () => {
  const e = await environment()
  try {
    const a = await e.novo('Ana')
    const b = await e.novo('Beto')
    a.aprovador.seen.length = 0
    a.aprovador.approving = false
    await assert.rejects(() => a.cliente.recado(b.rover.uid, 'oi'), NotApproved)
    await assert.rejects(() => a.cliente.createCommunity({ nome: 'Sem aval', tema: 'rovers' }), NotApproved)
    assert.equal((await a.cliente.estado('dormindo')).estado, 'aceito', 'status is free')
    assert.equal((await a.cliente.pedirAmizade(b.rover.uid)).estado, 'aceito', 'friendship is free')
    assert.equal(a.aprovador.seen.length, 2, 'only the two with text were shown to the person')
    // the person starts requiring approval for friendship (policy 0.3): the client learns from the profile and starts asking
    a.aprovador.approving = true
    await a.pessoa.setPolicy({ grafo: 'publico', exigirAprovacao: ['estado', 'amizade'] })
    await a.cliente.sync()
    assert.deepEqual(a.cliente.exigidos, ['amizade', 'estado'])
    a.aprovador.seen.length = 0
    await a.cliente.estado('ausente')
    assert.equal(a.aprovador.seen.length, 1)
  } finally { await e.fechar() }
})

test('relay errors arrive as RelayError with the new code', async () => {
  const e = await environment()
  try {
    const a = await e.novo('Ana')
    const b = await e.novo('Beto')
    await a.cliente.bloquear(b.rover.uid)
    await assert.rejects(() => b.cliente.recado(a.rover.uid, 'oi'), (err) => err instanceof RelayError && err.codigo === 'interacao_nao_permitida' && err.status === 403)
    await assert.rejects(() => b.cliente.joinCommunity(`ob_${'A'.repeat(43)}`), (err) => err.codigo === 'nao_encontrado')
    assert.equal((await a.cliente.relacoes()).itens[0].relacao, 'bloqueio')
    assert.deepEqual((await b.cliente.relacoes()).itens, [], 'the blocked one sees nothing on their own list')
    await assert.rejects(() => b.cliente.comunidade(`ob_${'A'.repeat(43)}`), (err) => err.status === 404)
  } finally { await e.fechar() }
})
