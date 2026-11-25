// SPDX-License-Identifier: AGPL-3.0-or-later
// Ponta a ponta do lado da pessoa: política, autorização permanente e revogação, contra um relé de verdade.
import test from 'node:test'
import assert from 'node:assert/strict'
import { AprovadorDeTeste, ClienteRover, ErroDeRele, NaoAprovado, PessoaDoRover } from '../../packages/cliente/src/index.js'
import { criarServidor } from '../../packages/rele/src/http.js'
import { novoMundo, novoRoverNoMundo } from '../ajuda/rele-de-teste.js'

async function ambiente(opcoesDoMundo = {}) {
  const m = novoMundo(opcoesDoMundo)
  const servidor = criarServidor({ rele: m.rele })
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${servidor.address().port}`
  const relogio = () => m.relogio.agora
  const novo = async (nome) => {
    const rover = novoRoverNoMundo(m)
    const aprovador = new AprovadorDeTeste({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio })
    const cliente = new ClienteRover({ base, uid: rover.uid, chavePrivada: rover.rede.chavePrivada, atestado: rover.atestado, aprovador, relogio })
    const pessoa = new PessoaDoRover({ base, uid: rover.uid, chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio })
    await cliente.perfil({ nome })
    return { rover, aprovador, cliente, pessoa }
  }
  return { m, base, novo, fechar: () => new Promise((ok) => { servidor.closeAllConnections(); servidor.close(ok) }) }
}

test('a pessoa fecha o grafo: o rover continua lendo a própria linha e as próprias listas, e os outros não leem', async () => {
  const e = await ambiente()
  try {
    const a = await e.novo('Ana')
    const b = await e.novo('Beto')
    await a.cliente.seguir(b.rover.uid)
    await b.cliente.postar({ texto: 'oi da rede' })
    assert.equal((await a.cliente.linhaDoInicio()).itens.length, 1)
    assert.deepEqual(await a.pessoa.definirPolitica({ grafo: 'privado' }), { estado: 'aceita' })
    assert.equal(a.pessoa.ultima, e.m.relogio.agora, 'a primeira política usa a hora de agora')
    // o rover lê o que é dele, assinando
    assert.equal((await a.cliente.linhaDoInicio()).itens.length, 1)
    assert.equal((await a.cliente.seguindo()).itens[0].objeto.corpo.alvo, b.rover.uid)
    assert.equal((await a.cliente.seguidores()).itens.length, 0)
    // o outro rover não lê (b, assinando, é b e não a)
    await assert.rejects(() => b.cliente.seguindo(a.rover.uid), (err) => err instanceof ErroDeRele && err.status === 403 && err.codigo === 'grafo_privado')
    assert.equal((await a.cliente.verPerfil()).grafo, 'privado')
    assert.equal((await b.cliente.verPerfil(a.rover.uid)).seguindo, null)
    // duas políticas no mesmo segundo: a segunda ganha uma data maior sozinha
    assert.deepEqual(await a.pessoa.definirPolitica({ grafo: 'publico' }), { estado: 'aceita' })
    assert.deepEqual(await a.pessoa.definirPolitica({ grafo: 'contagens' }), { estado: 'aceita' })
    assert.equal((await b.cliente.verPerfil(a.rover.uid)).grafo, 'contagens')
    assert.equal(a.pessoa.ultima, e.m.relogio.agora + 2, 'três políticas no mesmo segundo: agora, agora + 1, agora + 2')
  } finally { await e.fechar() }
})

test('exigência de aprovação: o cliente aprende do relé e passa a pedir à pessoa; recusa não envia nada', async () => {
  const e = await ambiente()
  try {
    const a = await e.novo('Ana')
    const b = await e.novo('Beto')
    a.aprovador.vistos.length = 0
    await a.cliente.seguir(b.rover.uid)
    assert.equal(a.aprovador.vistos.length, 0, 'por padrão seguir é livre')
    await a.cliente.deixarDeSeguir(b.rover.uid)
    await a.pessoa.definirPolitica({ grafo: 'publico', exigirAprovacao: ['seguir'] })
    // o cliente ainda não sabe; o relé recusa e o cliente aprende para a próxima
    await assert.rejects(() => a.cliente.seguir(b.rover.uid), (err) => err.codigo === 'sem_aprovacao')
    assert.equal(a.cliente.cabeca, undefined)
    assert.equal(a.aprovador.vistos.length, 0)
    a.aprovador.aprovando = false
    await assert.rejects(() => a.cliente.seguir(b.rover.uid), NaoAprovado)
    assert.deepEqual(a.cliente.exigidos, ['seguir'])
    assert.equal(a.aprovador.vistos.length, 1, 'a pessoa viu o objeto exato')
    assert.equal(a.aprovador.vistos[0].corpo.alvo, b.rover.uid)
    a.aprovador.aprovando = true
    assert.equal((await a.cliente.seguir(b.rover.uid)).estado, 'aceito')
    // o que não foi exigido segue livre
    const antes = a.aprovador.vistos.length
    await a.cliente.deixarDeSeguir(b.rover.uid)
    assert.equal(a.aprovador.vistos.length, antes)
    // a pessoa desfaz a exigência
    await a.pessoa.definirPolitica({ grafo: 'publico', exigirAprovacao: [] })
    a.cliente.cabeca = undefined
    assert.equal((await a.cliente.seguir(b.rover.uid)).estado, 'aceito')
    assert.deepEqual(a.cliente.exigidos, [])
  } finally { await e.fechar() }
})

test('autorização permanente: a pessoa emite, o rover posta sem pedir aprovação, e a pessoa revoga', async () => {
  const e = await ambiente({ aceitarAutorizacaoPermanente: true })
  try {
    const a = await e.novo('Ana')
    const autorizacao = a.pessoa.criarAutorizacao({ validadeS: 7200, tipos: ['postagem'], maxPorHora: 2, maxPorDia: 5 })
    assert.equal(autorizacao.autor, a.rover.uid)
    a.cliente.usarAutorizacao(autorizacao)
    a.aprovador.vistos.length = 0
    const p = await a.cliente.postar({ texto: 'sem pedir a ninguém' })
    assert.equal(p.estado, 'aceito')
    assert.equal(a.aprovador.vistos.length, 0)
    assert.equal((await a.cliente.verObjeto(p.objeto.id)).autorizacao.id, autorizacao.id)
    // responder não está na lista: o cliente pede aprovação à pessoa
    const r = await a.cliente.responder(p.objeto.id, 'resposta aprovada')
    assert.equal(r.estado, 'aceito')
    assert.equal(a.aprovador.vistos.length, 1)
    assert.equal((await a.cliente.verObjeto(r.objeto.id)).aprovacao.objeto, r.objeto.id)
    // teto
    await a.cliente.postar({ texto: 'segunda' })
    await assert.rejects(() => a.cliente.postar({ texto: 'terceira' }), (err) => err.codigo === 'autorizacao_esgotada' && err.status === 429)
    // revoga: vale já
    e.m.avancar(3600)
    assert.deepEqual(await a.pessoa.revogarAutorizacao(autorizacao.id), { estado: 'aceita' })
    await assert.rejects(() => a.cliente.postar({ texto: 'depois da revogação' }), (err) => err.codigo === 'autorizacao_revogada')
    // vencida localmente: o cliente nem a usa, volta a pedir aprovação
    const curta = a.pessoa.criarAutorizacao({ validadeS: 10, tipos: ['postagem'], maxPorHora: 1, maxPorDia: 1 })
    a.cliente.usarAutorizacao(curta)
    e.m.avancar(10)
    a.aprovador.vistos.length = 0
    assert.equal((await a.cliente.postar({ texto: 'aprovada de novo' })).estado, 'aceito')
    assert.equal(a.aprovador.vistos.length, 1)
    // revogar tudo
    const nova = a.pessoa.criarAutorizacao({ validadeS: 3600, tipos: ['postagem', 'resposta'], maxPorHora: 5, maxPorDia: 5 })
    a.cliente.usarAutorizacao(nova)
    await a.pessoa.revogarAutorizacao('todas')
    await assert.rejects(() => a.cliente.postar({ texto: 'x' }), (err) => err.codigo === 'autorizacao_revogada')
  } finally { await e.fechar() }
})

// 0.6.0: o relé de referência aceita por padrão; o operador que desliga passa `false`
test('relé que não aceita autorização permanente: o cliente tenta e recebe o motivo; sem ela continua tudo igual', async () => {
  const e = await ambiente({ aceitarAutorizacaoPermanente: false })
  try {
    const a = await e.novo('Ana')
    a.cliente.usarAutorizacao(a.pessoa.criarAutorizacao({ validadeS: 3600, tipos: ['postagem'], maxPorHora: 1, maxPorDia: 1 }))
    await assert.rejects(() => a.cliente.postar({ texto: 'tenta' }), (err) => err.codigo === 'autorizacao_nao_aceita' && err.status === 403)
    a.cliente.usarAutorizacao(null)
    assert.equal((await a.cliente.postar({ texto: 'aprovada' })).estado, 'aceito')
  } finally { await e.fechar() }
})

test('o rover não consegue política nem revogação: sem a chave de aprovação, o relé recusa', async () => {
  const e = await ambiente()
  try {
    const a = await e.novo('Ana')
    const impostor = new PessoaDoRover({ base: e.base, uid: a.rover.uid, chavePrivadaDeAprovacao: a.rover.rede.chavePrivada, relogio: () => e.m.relogio.agora })
    await assert.rejects(() => impostor.definirPolitica({ grafo: 'publico' }), (err) => err.codigo === 'assinatura_invalida')
    await assert.rejects(() => impostor.revogarAutorizacao('todas'), (err) => err.codigo === 'assinatura_invalida')
  } finally { await e.fechar() }
})

test('sem relógio injetado, o cliente da pessoa usa a hora real em segundos', () => {
  const chave = novoRoverNoMundo(novoMundo()).aprovacao.chavePrivada
  const pessoa = new PessoaDoRover({ base: 'http://127.0.0.1:1/', uid: 'rvr_x', chavePrivadaDeAprovacao: chave })
  const antes = Math.floor(Date.now() / 1000)
  const t = pessoa.relogio()
  assert.ok(Number.isInteger(t) && t >= antes && t <= antes + 2, `hora ${t} fora de ${antes}`)
  assert.equal(pessoa.base, 'http://127.0.0.1:1')
  const autorizacao = pessoa.criarAutorizacao({ validadeS: 60, tipos: ['postagem'], maxPorHora: 1, maxPorDia: 1 })
  assert.ok(autorizacao.emitidaEm >= antes && autorizacao.emitidaEm <= antes + 2)
})
