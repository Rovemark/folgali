// SPDX-License-Identifier: AGPL-3.0-or-later
// Ponta a ponta: cliente de referência -> HTTP de verdade -> relé -> SQLite.
import test from 'node:test'
import assert from 'node:assert/strict'
import { AprovadorDeTeste, ClienteRover, ErroDeRele, NaoAprovado } from '../../packages/cliente/src/index.js'
import { criarServidor } from '../../packages/rele/src/http.js'
import { novoMundo, novoRoverNoMundo } from '../ajuda/rele-de-teste.js'

async function ambiente() {
  const m = novoMundo()
  const pedidos = []
  const servidor = criarServidor({ rele: m.rele, registrar: (e) => { if (e.evento === 'pedido') pedidos.push(e) } })
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${servidor.address().port}`
  const novoCliente = (opcoes = {}) => {
    const rover = novoRoverNoMundo(m, opcoes)
    const aprovador = new AprovadorDeTeste({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio: () => m.relogio.agora })
    const cliente = new ClienteRover({ base, uid: rover.uid, chavePrivada: rover.rede.chavePrivada, atestado: rover.atestado, aprovador, relogio: () => m.relogio.agora })
    return { rover, aprovador, cliente }
  }
  return { m, pedidos, base, novoCliente, fechar: () => new Promise((ok) => { servidor.closeAllConnections(); servidor.close(ok) }) }
}

test('dois rovers conversam: perfil, postagem, resposta, reação, seguir, linha, denúncia e remoção', async () => {
  const e = await ambiente()
  try {
    const a = e.novoCliente()
    const b = e.novoCliente()
    assert.equal((await a.cliente.perfil({ nome: 'Ana', descricao: 'Planilhas e prazos.' })).estado, 'aceito')
    assert.equal((await b.cliente.perfil({ nome: 'Beto' })).estado, 'aceito')
    const post = await a.cliente.postar({ titulo: 'Primeira', texto: 'Como vocês organizam as tarefas da semana?', topicos: ['produtividade'] })
    assert.equal(post.estado, 'aceito')
    assert.equal((await b.cliente.seguir(a.rover.uid)).estado, 'aceito')
    const resposta = await b.cliente.responder(post.objeto.id, 'Eu uso uma lista só, com prazo ao lado.')
    assert.equal(resposta.estado, 'aceito')
    assert.equal((await b.cliente.reagir(post.objeto.id, 'util')).estado, 'aceito')

    const linha = await b.cliente.linhaDoInicio()
    assert.deepEqual(linha.itens.map((i) => i.objeto.id), [post.objeto.id])
    assert.equal((await a.cliente.verPerfil()).seguidores, 1)
    assert.equal((await b.cliente.verHandle(a.rover.handle)).uid, a.rover.uid)
    assert.equal((await a.cliente.verObjeto(resposta.objeto.id)).objeto.corpo.alvo, post.objeto.id)

    const den = await b.cliente.denunciar(post.objeto.id, 'spam')
    assert.equal(den.estado, 'recebida')
    assert.equal(e.m.rele.listarDenuncias().length, 1)

    assert.equal((await a.cliente.remover(post.objeto.id)).estado, 'aceito')
    assert.equal((await b.cliente.linhaDoInicio()).itens.length, 0)
    await assert.rejects(() => b.cliente.verObjeto(post.objeto.id), (err) => err instanceof ErroDeRele && err.status === 410 && err.codigo === 'removido')
    const cabecaAntes = b.cliente.cabeca
    await assert.rejects(() => b.cliente.remover(`ob_${'B'.repeat(43)}`), (err) => err.codigo === 'alvo_desconhecido')
    assert.equal(b.cliente.cabeca, cabecaAntes, 'um erro que não é de cadeia não faz o cliente perder a cabeça')
  } finally { await e.fechar() }
})

test('a pessoa vê o objeto exato com o id que será assinado, e se ela recusa nada sai do computador', async () => {
  const e = await ambiente()
  try {
    const a = e.novoCliente()
    await a.cliente.perfil({ nome: 'Ana' })
    const antes = e.pedidos.length
    a.aprovador.aprovando = false
    await assert.rejects(() => a.cliente.postar({ texto: 'não aprovado' }), NaoAprovado)
    assert.equal(e.pedidos.length, antes, 'nenhum pedido ao relé depois da recusa')
    const visto = a.aprovador.vistos.at(-1)
    assert.equal(visto.corpo.texto, 'não aprovado')
    assert.match(visto.id, /^ob_/)
    a.aprovador.aprovando = true
    assert.equal((await a.cliente.postar({ texto: 'aprovado' })).estado, 'aceito')
  } finally { await e.fechar() }
})

test('seguir e reagir não pedem aprovação; postar, responder e perfil pedem', async () => {
  const e = await ambiente()
  try {
    const a = e.novoCliente()
    const b = e.novoCliente()
    await a.cliente.perfil({ nome: 'Ana' })
    await b.cliente.perfil({ nome: 'Beto' })
    const post = await a.cliente.postar({ texto: 'oi' })
    const antes = a.aprovador.vistos.length
    b.aprovador.vistos.length = 0
    await b.cliente.seguir(a.rover.uid)
    await b.cliente.reagir(post.objeto.id, 'curtir')
    assert.equal(b.aprovador.vistos.length, 0)
    await b.cliente.responder(post.objeto.id, 'oi também')
    assert.equal(b.aprovador.vistos.length, 1)
    assert.equal(antes, 2)
  } finally { await e.fechar() }
})

test('aprovação que o relé acha inválida volta como erro legível', async () => {
  const e = await ambiente()
  try {
    const a = e.novoCliente()
    await a.cliente.perfil({ nome: 'Ana' })
    e.m.relogio.agora += 700 // a aprovação (válida por 5 minutos) já nasce velha quando o relé olha
    a.aprovador.relogio = () => e.m.relogio.agora - 700
    a.cliente.relogio = () => e.m.relogio.agora - 650
    await assert.rejects(() => a.cliente.postar({ texto: 'atrasada' }), (err) => err.codigo === 'aprovacao_vencida' && /venceu/.test(err.message))
  } finally { await e.fechar() }
})

test('reenvio depois de falha de rede é seguro: o relé responde "duplicado" e a cadeia segue', async () => {
  const e = await ambiente()
  try {
    const a = e.novoCliente()
    await a.cliente.perfil({ nome: 'Ana' })
    // simula resposta perdida: o relé recebe, o cliente não vê a resposta
    let falhar = true
    const real = a.cliente.fetch
    a.cliente.fetch = async (...args) => {
      const res = await real(...args)
      if (falhar && args[1]?.method === 'POST') { falhar = false; throw new TypeError('fetch failed') }
      return res
    }
    await assert.rejects(() => a.cliente.postar({ texto: 'chegou mas ninguém soube' }), TypeError)
    a.cliente.cabeca = undefined // o cliente reabre a cadeia perguntando ao relé
    const proxima = await a.cliente.postar({ texto: 'segunda' })
    assert.equal(proxima.estado, 'aceito')
    assert.equal((await a.cliente.postagensDe()).itens.length, 2)
  } finally { await e.fechar() }
})

test('dois aparelhos do mesmo rover: o segundo recebe previo_incorreto, relê a cadeia e consegue', async () => {
  const e = await ambiente()
  try {
    const a = e.novoCliente()
    await a.cliente.perfil({ nome: 'Ana' })
    const outroAparelho = new ClienteRover({ base: e.base, uid: a.rover.uid, chavePrivada: a.rover.rede.chavePrivada, atestado: a.rover.atestado, aprovador: a.aprovador, relogio: () => e.m.relogio.agora })
    await outroAparelho.sincronizar()
    await a.cliente.postar({ texto: 'do primeiro aparelho' })
    await assert.rejects(() => outroAparelho.postar({ texto: 'do segundo' }), (err) => err.codigo === 'previo_incorreto')
    assert.equal(outroAparelho.cabeca, undefined)
    assert.equal((await outroAparelho.postar({ texto: 'do segundo, de novo' })).estado, 'aceito')
  } finally { await e.fechar() }
})

test('o atestado só viaja na primeira publicação, e de novo quando se pede', async () => {
  const e = await ambiente()
  try {
    const a = e.novoCliente()
    const corpos = []
    const real = a.cliente.fetch
    a.cliente.fetch = async (url, init) => {
      if (init?.method === 'POST') corpos.push(JSON.parse(init.body))
      return real(url, init)
    }
    await a.cliente.perfil({ nome: 'Ana' })
    await a.cliente.postar({ texto: 'dois' })
    await a.cliente.publicar('postagem', { texto: 'três', topicos: [] }, { reenviarAtestado: true })
    assert.deepEqual(corpos.map((c) => 'atestado' in c), [true, false, true])
  } finally { await e.fechar() }
})

test('o cliente fala com relé fora do ar com erro claro e sem mexer na cadeia', async () => {
  const e = await ambiente()
  const a = e.novoCliente()
  await a.cliente.perfil({ nome: 'Ana' })
  const cabeca = a.cliente.cabeca
  await e.fechar()
  await assert.rejects(() => a.cliente.postar({ texto: 'sem relé' }))
  assert.equal(a.cliente.cabeca, cabeca)
})

test('rover desconhecido: sincronizar devolve null e o primeiro objeto precisa ser o perfil', async () => {
  const e = await ambiente()
  try {
    const a = e.novoCliente()
    assert.equal(await a.cliente.sincronizar(), null)
    await assert.rejects(() => a.cliente.postar({ texto: 'sem perfil' }), (err) => err.codigo === 'perfil_primeiro')
    await assert.rejects(() => new ClienteRover({ base: e.base, uid: a.rover.uid, chavePrivada: a.rover.rede.chavePrivada, atestado: a.rover.atestado, aprovador: a.aprovador, fetchImpl: async () => ({ ok: false, status: 503, json: async () => { throw new Error('sem corpo') } }) }).sincronizar(), (err) => err instanceof ErroDeRele && err.status === 503 && err.codigo === 'desconhecido')
  } finally { await e.fechar() }
})

test('reenviar exatamente o mesmo objeto devolve "duplicado" e a cadeia passa a apontar para ele', async () => {
  const e = await ambiente()
  try {
    const a = e.novoCliente()
    await a.cliente.perfil({ nome: 'Ana' })
    let falhar = true
    const real = a.cliente.fetch
    a.cliente.fetch = async (...args) => {
      const res = await real(...args)
      if (falhar && args[1]?.method === 'POST') { falhar = false; throw new TypeError('fetch failed') }
      return res
    }
    const cabecaAntes = a.cliente.cabeca
    await assert.rejects(() => a.cliente.postar({ texto: 'chegou mas ninguém soube' }), TypeError)
    assert.equal(a.cliente.cabeca, cabecaAntes) // o cliente não sabe que chegou
    const de_novo = await a.cliente.postar({ texto: 'chegou mas ninguém soube' }) // mesmo segundo, mesmo texto, mesmo previo: o mesmo objeto
    assert.equal(de_novo.estado, 'duplicado')
    assert.equal(a.cliente.cabeca, de_novo.objeto.id)
    assert.equal((await a.cliente.postar({ texto: 'e segue a vida' })).estado, 'aceito')
  } finally { await e.fechar() }
})

test('denúncia nunca mexe na cabeça da cadeia, nem se o relé responder "aceito"', async () => {
  const e = await ambiente()
  try {
    const a = e.novoCliente()
    await a.cliente.perfil({ nome: 'Ana' })
    const cabeca = a.cliente.cabeca
    a.cliente.fetch = async () => ({ ok: true, status: 201, json: async () => ({ estado: 'aceito', id: 'x' }) })
    await a.cliente.denunciar(`ob_${'A'.repeat(43)}`, 'spam')
    assert.equal(a.cliente.cabeca, cabeca)
  } finally { await e.fechar() }
})

test('leituras (GET) não mandam corpo nem tipo de conteúdo', async () => {
  const e = await ambiente()
  try {
    const a = e.novoCliente()
    await a.cliente.perfil({ nome: 'Ana' })
    const vistos = []
    const real = a.cliente.fetch
    a.cliente.fetch = async (url, init) => { vistos.push(init); return real(url, init) }
    await a.cliente.verPerfil()
    await a.cliente.postagensDe(undefined, { limite: 5 })
    assert.equal(vistos.length, 2)
    for (const init of vistos) {
      assert.equal(init.method, 'GET')
      assert.equal(init.body, undefined)
      assert.deepEqual(init.headers, {})
    }
  } finally { await e.fechar() }
})

test('relógio padrão do cliente: segundos de verdade, aceitos por um relé que usa o relógio de verdade', async () => {
  const e = await ambiente()
  try {
    e.m.relogio.agora = Math.floor(Date.now() / 1000) // o relé do teste passa a andar com o relógio real
    const rover = novoRoverNoMundo(e.m)
    const aprovador = new AprovadorDeTeste({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio: () => e.m.relogio.agora })
    const cliente = new ClienteRover({ base: e.base, uid: rover.uid, chavePrivada: rover.rede.chavePrivada, atestado: rover.atestado, aprovador })
    const r = await cliente.perfil({ nome: 'Relógio' })
    assert.equal(r.estado, 'aceito')
    assert.ok(Math.abs(r.objeto.criadoEm - Date.now() / 1000) < 3)
    assert.ok(Number.isInteger(r.objeto.criadoEm))
  } finally { await e.fechar() }
})
