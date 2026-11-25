// SPDX-License-Identifier: AGPL-3.0-or-later
// Revisão 0.3.2 pelo cliente de referência contra o relé de verdade: descobrir os recursos novos e usar o painel, o vocabulário, as ordens
// por pessoas e os anúncios de ponta a ponta. Um relé 0.3.1 (sem `recursos` novos) não é oferecido nada disto.
import test from 'node:test'
import assert from 'node:assert/strict'
import { AprovadorDeTeste, ClienteRover } from '../../packages/cliente/src/index.js'
import { criarServidor } from '../../packages/rele/src/http.js'
import { novoMundo, novoRoverNoMundo } from '../ajuda/rele-de-teste.js'
import { TOKEN } from '../ajuda/servidor-de-teste.js'

async function ambiente() {
  const m = novoMundo()
  const servidor = criarServidor({ rele: m.rele, tokenAdmin: TOKEN, rajada: { capacidade: 100000, porSegundo: 100000 } })
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${servidor.address().port}`
  const relogio = () => m.relogio.agora
  const novo = async (nome) => {
    const rover = novoRoverNoMundo(m)
    const aprovador = new AprovadorDeTeste({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio })
    const cliente = new ClienteRover({ base, uid: rover.uid, chavePrivada: rover.rede.chavePrivada, atestado: rover.atestado, aprovador, relogio })
    await cliente.perfil({ nome })
    return { rover, cliente }
  }
  return { m, base, novo, fechar: () => new Promise((ok) => { servidor.closeAllConnections(); servidor.close(ok) }) }
}

test('o cliente descobre os quatro recursos novos e usa tudo de ponta a ponta', async () => {
  const e = await ambiente()
  try {
    const [ana, beto, caio, duda] = [await e.novo('Ana'), await e.novo('Beto'), await e.novo('Caio'), await e.novo('Duda')]
    for (const r of ['inicio', 'ordem-por-pessoas', 'vocabulario', 'anuncios']) assert.equal(await ana.cliente.suporta(r), true, r)
    assert.equal((await ana.cliente.info()).versaoDoRascunho, '0.6.0')

    const com = await ana.cliente.criarComunidade({ nome: 'Fórum novo', descricao: 'D', regras: 'R', tema: 'rovers', categorias: ['Geral'] })
    for (const x of [beto, caio, duda]) await x.cliente.entrarNaComunidade(com.id)
    e.m.avancar(3601)

    // vocabulário e marcas
    assert.equal((await ana.cliente.definirVocabulario(com.id, {
      etiquetas: [{ chave: 'bug', rotulo: 'Bug', cor: 'laranja' }],
      status: [{ chave: 'aberto', rotulo: 'Aberto', cor: 'verde', categorias: null }]
    })).estado, 'aceito')
    const v = (await beto.cliente.comunidade(com.id)).vocabulario
    assert.deepEqual(v.etiquetas, [{ chave: 'bug', rotulo: 'Bug', cor: 'laranja' }])
    assert.equal(v.padrao, false)
    const t1 = await beto.cliente.topico({ comunidade: com.id, titulo: 'Um tópico com três pessoas', texto: 'Texto', tags: [] })
    const t2 = await beto.cliente.topico({ comunidade: com.id, titulo: 'Um tópico com uma pessoa', texto: 'Texto', tags: [] })
    assert.equal((await beto.cliente.marcarTopico(t1.id, { etiquetas: ['bug'], status: 'aberto' })).estado, 'aceito')
    assert.deepEqual((await caio.cliente.topicos(com.id, { etiqueta: 'bug' })).itens.map((i) => i.id), [t1.id])
    assert.deepEqual((await caio.cliente.topicos(com.id, { status: 'aberto' })).itens[0].marcas, { etiquetas: ['bug'], status: 'aberto' })

    // ordem por pessoas
    for (const x of [ana, caio, duda]) await x.cliente.responderNoForum(t1.id, 'resposta de uma pessoa')
    await ana.cliente.responderNoForum(t2.id, 'uma só')
    assert.deepEqual((await caio.cliente.topicos(com.id, { ordem: 'recentes' })).itens.map((i) => i.id), [t2.id, t1.id])
    assert.deepEqual((await caio.cliente.topicos(com.id, { ordem: 'melhores' })).itens.map((i) => i.id), [t1.id, t2.id])
    assert.deepEqual((await caio.cliente.topicos(com.id, { ordem: 'em-alta', janela: '7d' })).itens.map((i) => i.id), [t1.id, t2.id])
    assert.equal((await caio.cliente.respostasDoTopico(t1.id, { ordem: 'melhores' })).itens.length, 3)
    const achados = await caio.cliente.busca('tópico', { tipo: 'topicos', ordem: 'melhores' })
    assert.deepEqual(achados.itens.map((i) => i.id), [t1.id, t2.id])

    // painel de início
    const p = await beto.cliente.inicio()
    assert.equal(p.voce.uid, beto.rover.uid)
    assert.deepEqual(p.atividade.map((i) => [i.id, i.respostas]).sort(), [[t1.id, 3], [t2.id, 1]].sort())
    const depois = await beto.cliente.inicio({ desde: p.agora })
    assert.equal(depois.avisos.total, 0)
    assert.deepEqual(depois.atividade, [])
    assert.equal(JSON.stringify(p).includes('Um tópico com'), false, 'nenhum título no painel')

    // anúncios: o cliente lê; quem publica é a administração
    assert.deepEqual((await ana.cliente.anuncios()).itens, [])
    const r = await fetch(`${e.base}/v1/admin/anuncios`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ titulo: 'Manutenção hoje', texto: 'O relé reinicia às 3h.', fixado: true }) })
    const { id } = await r.json()
    assert.equal(r.status, 201)
    assert.deepEqual((await ana.cliente.anuncios()).itens.map((i) => i.titulo), ['Manutenção hoje'])
    assert.equal((await ana.cliente.anuncio(id)).fixado, true)
    assert.equal((await beto.cliente.inicio({ desde: 0 })).anuncios.ultimo.id, id)
  } finally { await e.fechar() }
})

test('um relé 0.3.1 (sem os recursos novos) não oferece nada da 0.3.2 ao cliente', async () => {
  const e = await ambiente()
  try {
    const x = await e.novo('Ana')
    const fingido = { ...(await x.cliente.info()), versaoDoRascunho: '0.3.1', recursos: ['voce-datas', 'postagem-detalhe'] }
    const cliente0 = Object.create(x.cliente)
    cliente0.info = async () => fingido
    for (const r of ['inicio', 'ordem-por-pessoas', 'vocabulario', 'anuncios']) assert.equal(await cliente0.suporta(r), false, r)
    assert.equal(await cliente0.suporta('postagem-detalhe'), true, 'os da 0.3.1 continuam')
  } finally { await e.fechar() }
})
