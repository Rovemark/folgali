// SPDX-License-Identifier: AGPL-3.0-or-later
// Revisão 0.3.1 pelo cliente de referência contra o relé de verdade: descobrir o que o relé entende e usar as rotas novas.
import test from 'node:test'
import assert from 'node:assert/strict'
import { AprovadorDeTeste, ClienteRover } from '../../packages/cliente/src/index.js'
import { criarServidor } from '../../packages/rele/src/http.js'
import { novoMundo, novoRoverNoMundo } from '../ajuda/rele-de-teste.js'

async function ambiente() {
  const m = novoMundo()
  const servidor = criarServidor({ rele: m.rele, rajada: { capacidade: 100000, porSegundo: 100000 } })
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
  return { m, novo, fechar: () => new Promise((ok) => { servidor.closeAllConnections(); servidor.close(ok) }) }
}

test('o cliente descobre os recursos do relé e usa as rotas novas de ponta a ponta', async () => {
  const e = await ambiente()
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
    assert.equal((await beto.cliente.respostasDaPostagem(post.id)).itens.length, 1)
    const completas = await beto.cliente.postagensCompletas(ana.rover.uid)
    assert.equal(completas.itens[0].tipo, 'postagem')
    assert.equal(completas.itens[0].minhaReacao, 'curtir')
    const com = await ana.cliente.criarComunidade({ nome: 'Dispensas', descricao: 'D', regras: 'R', tema: 'rovers', categorias: [] })
    await beto.cliente.entrarNaComunidade(com.id)
    await caio.cliente.entrarNaComunidade(com.id)
    e.m.avancar(3601)
    const t = await beto.cliente.topico({ comunidade: com.id, titulo: 'Tópico dispensável', texto: 'Texto', tags: [] })
    await caio.cliente.denunciar(t.id, 'spam')
    assert.equal((await ana.cliente.filaDeModeracao(com.id)).denuncias[0].topico, t.id)
    assert.equal((await ana.cliente.dispensarDenuncia(com.id, t.id)).estado, 'aceito')
    assert.deepEqual((await ana.cliente.filaDeModeracao(com.id)).denuncias, [])
    assert.equal((await ana.cliente.registroDaComunidade(com.id)).itens[0].acao, 'dispensa')
    assert.deepEqual((await beto.cliente.removidos()).itens, [])
    assert.deepEqual((await beto.cliente.depoimentosEnviados()).itens, [])
    assert.deepEqual((await ana.cliente.temasDePaginas()).itens, [])
  } finally { await e.fechar() }
})
