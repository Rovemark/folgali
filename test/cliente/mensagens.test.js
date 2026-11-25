// SPDX-License-Identifier: AGPL-3.0-or-later
// Ponta a ponta das mensagens privadas: o cliente de referência cifra e decifra, o relé de verdade (HTTP) só vê o cifrado.
import test from 'node:test'
import assert from 'node:assert/strict'
import { AprovadorDeTeste, ClienteRover, ErroDeRele, NaoAprovado } from '../../packages/cliente/src/index.js'
import { cifraConfere, gerarParDeCifra } from '../../packages/protocolo/src/index.js'
import { criarServidor } from '../../packages/rele/src/http.js'
import { novoMundo, novoRoverNoMundo } from '../ajuda/rele-de-teste.js'

async function ambiente() {
  const m = novoMundo({ mensagens: true })
  const servidor = criarServidor({ rele: m.rele, rajada: { capacidade: 100000, porSegundo: 100000 } })
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${servidor.address().port}`
  const relogio = () => m.relogio.agora
  const novo = async (nome) => {
    const rover = novoRoverNoMundo(m)
    const pessoa = new AprovadorDeTeste({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio })
    const contextos = []
    // a "pessoa" vê o objeto e, numa mensagem, o texto: confere que o cifrado que aprova é o deste texto
    const aprovador = {
      negar: false,
      async aprovar(objeto, contexto) {
        contextos.push({ objeto, contexto })
        if (this.negar) return null
        if (objeto.tipo === 'mensagem' && !cifraConfere(objeto, contexto)) return null
        return pessoa.aprovar(objeto)
      }
    }
    const cifra = gerarParDeCifra()
    const cliente = new ClienteRover({ base, uid: rover.uid, chavePrivada: rover.rede.chavePrivada, atestado: rover.atestado, aprovador, relogio, chavePrivadaDeCifra: cifra.chavePrivada })
    await cliente.perfil({ nome })
    await cliente.publicarChaveDeCifra()
    return { rover, cliente, aprovador, contextos, cifra }
  }
  return { m, base, novo, fechar: () => new Promise((ok) => { servidor.closeAllConnections(); servidor.close(ok) }) }
}

test('cliente: pedir, aceitar, conversar cifrado, ler, denunciar e apagar, com a pessoa aprovando o texto exato', async () => {
  const e = await ambiente()
  try {
    const ana = await e.novo('Ana')
    const beto = await e.novo('Beto')
    assert.equal(await ana.cliente.suporta('mensagens'), true)
    await ana.cliente.pedirAmizade(beto.rover.uid)
    await beto.cliente.aceitarAmizade(ana.rover.uid)
    const { conversa } = await ana.cliente.pedirConversa(beto.rover.uid, 'Oi! Posso te escrever sobre a planilha?')
    const pendentes = await beto.cliente.conversas({ estado: 'pendentes' })
    assert.equal(pendentes.itens[0].pedido.objeto.corpo.texto, 'Oi! Posso te escrever sobre a planilha?')
    assert.equal((await beto.cliente.aceitarConversa(conversa)).resultado, 'ativa')
    e.m.avancar(5)
    await ana.cliente.enviarMensagem(conversa, 'Mandei a versão nova.\nOlha a aba 2.')
    await beto.cliente.enviarMensagem(conversa, 'Vi. Está ótima.')
    // a pessoa da Ana viu o texto e a cifra conferiu com ele
    const visto = ana.contextos.find((x) => x.objeto.tipo === 'mensagem')
    assert.equal(visto.contexto.texto, 'Mandei a versão nova.\nOlha a aba 2.')
    const lidas = await beto.cliente.lerConversa(conversa)
    assert.deepEqual(lidas.itens.map((i) => [i.legivel, i.texto]), [[true, 'Vi. Está ótima.'], [true, 'Mandei a versão nova.\nOlha a aba 2.']])
    assert.deepEqual((await ana.cliente.lerConversa(conversa)).itens.map((i) => i.texto), ['Vi. Está ótima.', 'Mandei a versão nova.\nOlha a aba 2.'])
    // o relé só tem o cifrado
    const guardado = e.m.armazem.todos('SELECT envelope FROM mensagens').map((l) => l.envelope).join('\n')
    assert.equal(guardado.includes('versão nova'), false)
    // denúncia: o Beto revela a mensagem da Ana, e só ela
    const daAna = lidas.itens.find((i) => i.de === ana.rover.uid)
    assert.equal((await beto.cliente.denunciarMensagem(daAna, 'outro')).estado, 'recebida')
    assert.deepEqual(e.m.rele.mensagens.listarDenuncias().map((d) => d.texto), ['Mandei a versão nova.\nOlha a aba 2.'])
    // a Ana não denuncia a própria mensagem
    await assert.rejects(ana.cliente.denunciarMensagem((await ana.cliente.lerConversa(conversa)).itens[1], 'spam'), (err) => err instanceof ErroDeRele && err.codigo === 'nao_encontrado')
    // apagar a cópia da Ana não apaga a do Beto
    assert.equal((await ana.cliente.apagarConversa(conversa)).resultado, 2)
    assert.equal((await ana.cliente.lerConversa(conversa)).itens.length, 0)
    assert.equal((await beto.cliente.lerConversa(conversa)).itens.length, 2)
  } finally {
    await e.fechar()
  }
})

test('cliente: a pessoa que nega não deixa nada sair; texto fora da regra nem chega a ser cifrado', async () => {
  const e = await ana2()
  try {
    const { ana, beto, conversa } = e
    ana.aprovador.negar = true
    await assert.rejects(ana.cliente.enviarMensagem(conversa, 'oi'), NaoAprovado)
    ana.aprovador.negar = false
    await assert.rejects(ana.cliente.enviarMensagem(conversa, 'me chama em ana@exemplo.com'), (err) => err.codigo === 'esquema')
    assert.equal(e.e.m.armazem.um('SELECT COUNT(*) AS n FROM mensagens').n, 0)
    assert.equal((await beto.cliente.lerConversa(conversa)).itens.length, 0)
  } finally {
    await e.e.fechar()
  }
})

test('cliente: troca de chave de cifra no meio; quem guarda a privada antiga lê o que chegou antes; sem a chave, ilegível', async () => {
  const x = await ana2()
  try {
    const { e, ana, beto, conversa } = x
    await ana.cliente.enviarMensagem(conversa, 'Antes da troca.')
    // o Beto troca de chave de cifra e guarda a antiga
    const nova = gerarParDeCifra()
    beto.cliente.chavesDeCifraAntigas = [beto.cliente.chavePrivadaDeCifra]
    beto.cliente.chavePrivadaDeCifra = nova.chavePrivada
    e.m.avancar(2)
    await beto.cliente.publicarChaveDeCifra()
    e.m.avancar(2)
    await ana.cliente.enviarMensagem(conversa, 'Depois da troca.')
    assert.deepEqual((await beto.cliente.lerConversa(conversa)).itens.map((i) => i.texto), ['Depois da troca.', 'Antes da troca.'])
    // sem a antiga, a primeira fica ilegível (e nada dela aparece)
    beto.cliente.chavesDeCifraAntigas = []
    const semAntiga = (await beto.cliente.lerConversa(conversa)).itens
    assert.deepEqual(semAntiga.map((i) => [i.legivel, i.texto]), [[true, 'Depois da troca.'], [false, null]])
  } finally {
    await x.e.fechar()
  }
})

/** Ana e Beto amigos, com uma conversa aceita. */
async function ana2() {
  const e = await ambiente()
  const ana = await e.novo('Ana')
  const beto = await e.novo('Beto')
  await ana.cliente.pedirAmizade(beto.rover.uid)
  await beto.cliente.aceitarAmizade(ana.rover.uid)
  const { conversa } = await ana.cliente.pedirConversa(beto.rover.uid, 'Podemos conversar?')
  await beto.cliente.aceitarConversa(conversa)
  e.m.avancar(1)
  return { e, ana, beto, conversa }
}
