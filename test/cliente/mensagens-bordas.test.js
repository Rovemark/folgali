// SPDX-License-Identifier: AGPL-3.0-or-later
// Bordas das mensagens privadas no cliente de referência que o medidor de mutação mostrou sem teste. Contra o relé de verdade (HTTP),
// com um "relé desonesto" opcional na frente: um interceptador que troca a resposta de uma rota, para provar que o cliente confere o que
// recebe (atestado do outro lado, chave de cifra servida, mensagem de outra conversa, assinatura trocada) em vez de confiar no relé.
import test from 'node:test'
import assert from 'node:assert/strict'
import { AprovadorDeTeste, ClienteRover, ErroDeRele, NaoAprovado } from '../../packages/cliente/src/index.js'
import { cifraConfere, criarObjeto, gerarParDeCifra } from '../../packages/protocolo/src/index.js'
import { criarServidor } from '../../packages/rele/src/http.js'
import { novoMundo, novoRoverNoMundo } from '../ajuda/rele-de-teste.js'

async function ambiente() {
  const m = novoMundo({ mensagens: true })
  const servidor = criarServidor({ rele: m.rele, rajada: { capacidade: 100000, porSegundo: 100000 } })
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${servidor.address().port}`
  const relogio = () => m.relogio.agora
  /** Um cliente com fetch espionável: `pedidos` anota método e caminho; `trocar(caminho, metodo)` pode devolver uma resposta forjada. */
  const cliente = (rover, { cifra = gerarParDeCifra(), aprovador } = {}) => {
    const pedidos = []
    const espiao = { trocar: null }
    const fetchImpl = async (url, init = {}) => {
      const caminho = url.slice(base.length)
      const metodo = init.method ?? 'GET'
      pedidos.push({ metodo, caminho, corpo: init.body ? JSON.parse(init.body) : null })
      const forjada = espiao.trocar ? await espiao.trocar(caminho, metodo, () => fetch(url, init)) : null
      return forjada ?? fetch(url, init)
    }
    const pessoa = new AprovadorDeTeste({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio })
    const ap = aprovador ?? {
      negar: false,
      vistos: 0,
      async aprovar(objeto, contexto) {
        this.vistos++
        if (this.negar) return null
        if (objeto.tipo === 'mensagem' && !cifraConfere(objeto, contexto)) return null
        return pessoa.aprovar(objeto)
      }
    }
    const c = new ClienteRover({ base, uid: rover.uid, chavePrivada: rover.rede.chavePrivada, atestado: rover.atestado, aprovador: ap, relogio, fetchImpl, chavePrivadaDeCifra: cifra?.chavePrivada ?? null })
    return { c, pedidos, espiao, aprovador: ap, cifra }
  }
  const novo = async (nome) => {
    const rover = novoRoverNoMundo(m)
    const x = cliente(rover)
    await x.c.perfil({ nome })
    await x.c.publicarChaveDeCifra()
    return { rover, ...x }
  }
  /** Dois amigos com uma conversa aceita. */
  const par = async () => {
    const ana = await novo('Ana')
    const beto = await novo('Beto')
    await ana.c.pedirAmizade(beto.rover.uid)
    await beto.c.aceitarAmizade(ana.rover.uid)
    const { conversa } = await ana.c.pedirConversa(beto.rover.uid, 'Podemos conversar?')
    await beto.c.aceitarConversa(conversa)
    m.avancar(1)
    return { ana, beto, conversa }
  }
  const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })
  return { m, base, cliente, novo, par, json, fechar: () => new Promise((ok) => { servidor.closeAllConnections(); servidor.close(ok) }) }
}

const posts = (pedidos, tipo) => pedidos.filter((p) => p.metodo === 'POST' && p.caminho === '/v1/objetos' && (!tipo || p.corpo.objeto.tipo === tipo))

test('o atestado vai só no primeiro objeto da sessão, também quando ele é da 0.4', async () => {
  const e = await ambiente()
  try {
    const ana = await e.novo('Ana')
    // outra sessão do mesmo rover (aparelho novo): a primeira publicação leva o atestado, a segunda não
    const outra = e.cliente(ana.rover, { cifra: ana.cifra })
    await outra.c.publicarChaveDeCifra()
    await outra.c.publicarChaveDeCifra()
    const enviados = posts(outra.pedidos, 'chave-de-cifra')
    assert.equal(enviados.length, 2)
    assert.deepEqual(enviados.map((p) => 'atestado' in p.corpo), [true, false])
  } finally { await e.fechar() }
})

test('sem chave de cifra: publicar a chave e enviar mensagem falham ANTES de falar com o relé, com a razão', async () => {
  const e = await ambiente()
  try {
    const { ana, conversa } = await e.par()
    const sem = e.cliente(ana.rover, { cifra: null })
    assert.throws(() => sem.c.publicarChaveDeCifra(), /não tem chave de cifra/)
    await assert.rejects(sem.c.enviarMensagem(conversa, 'oi'), /não tem chave de cifra/)
    assert.deepEqual(sem.pedidos, [], 'nada saiu do computador')
  } finally { await e.fechar() }
})

test('chave de rede do outro lado: a própria vem do atestado sem pedido; a do outro é pedida uma vez e guardada', async () => {
  const e = await ambiente()
  try {
    const { ana, beto } = await e.par()
    const x = e.cliente(ana.rover, { cifra: ana.cifra })
    assert.equal(await x.c.chaveDeRedeDe(ana.rover.uid), ana.rover.atestado.chave)
    assert.equal(x.pedidos.length, 0, 'a própria chave não precisa do relé')
    assert.equal(await x.c.chaveDeRedeDe(beto.rover.uid), beto.rover.atestado.chave)
    assert.equal(await x.c.chaveDeRedeDe(beto.rover.uid), beto.rover.atestado.chave)
    assert.equal(x.pedidos.filter((p) => p.caminho === `/v1/rovers/${beto.rover.uid}`).length, 1, 'a segunda vem da memória')
  } finally { await e.fechar() }
})

test('relé desonesto no perfil: atestado de outro rover, ou atestado adulterado, e o cliente recusa a chave de rede', async () => {
  const e = await ambiente()
  try {
    const { ana, beto } = await e.par()
    const caio = await e.novo('Caio')
    const x = e.cliente(ana.rover, { cifra: ana.cifra })
    const perfilDe = async (uid) => (await fetch(`${e.base}/v1/rovers/${uid}`)).json()
    // o perfil do Beto servido com o atestado (válido) do Caio
    const doCaio = (await perfilDe(caio.rover.uid)).atestado
    x.espiao.trocar = async (caminho) => (caminho === `/v1/rovers/${beto.rover.uid}` ? e.json({ ...(await perfilDe(beto.rover.uid)), atestado: doCaio }) : null)
    await assert.rejects(x.c.chaveDeRedeDe(beto.rover.uid), /O atestado do outro rover não confere/)
    // o atestado do Beto com o handle mexido: a assinatura do emissor não confere
    const adulterado = { ...(await perfilDe(beto.rover.uid)).atestado, handle: 'outro.nome' }
    x.espiao.trocar = async (caminho) => (caminho === `/v1/rovers/${beto.rover.uid}` ? e.json({ ...(await perfilDe(beto.rover.uid)), atestado: adulterado }) : null)
    await assert.rejects(x.c.chaveDeRedeDe(beto.rover.uid), /O atestado do outro rover não confere/)
  } finally { await e.fechar() }
})

test('relé desonesto na chave de cifra: outro tipo, outro autor, assinatura de outra chave ou forma torta são recusados', async () => {
  const e = await ambiente()
  try {
    const { ana, beto } = await e.par()
    const caio = await e.novo('Caio')
    const rota = `/v1/rovers/${beto.rover.uid}/chave-de-cifra`
    const servir = (objeto) => { ana.espiao.trocar = async (caminho) => (caminho === rota ? e.json({ objeto }) : null) }
    const chave = gerarParDeCifra().chavePublica
    const obj = (tipo, corpo, { autor = beto.rover.uid, chavePrivada = beto.rover.rede.chavePrivada } = {}) =>
      criarObjeto({ v: '0.4', tipo, autor, criadoEm: e.m.relogio.agora, previo: null, corpo, chavePrivada })
    assert.equal(await ana.c.chaveDeCifraDe(beto.rover.uid), beto.cifra.chavePublica, 'controle: a de verdade passa')
    const casos = [
      ['outro tipo', obj('conversa-pedir', { alvo: ana.rover.uid, texto: 'oi' })],
      ['outro autor (a chave do Caio servida como do Beto)', obj('chave-de-cifra', { chave }, { autor: caio.rover.uid, chavePrivada: caio.rover.rede.chavePrivada })],
      ['assinada por outra chave de rede', obj('chave-de-cifra', { chave }, { chavePrivada: caio.rover.rede.chavePrivada })],
      ['forma torta (campo a mais), assinada pelo Beto', obj('chave-de-cifra', { chave, extra: 1 })]
    ]
    for (const [nome, o] of casos) {
      servir(o)
      await assert.rejects(ana.c.chaveDeCifraDe(beto.rover.uid), /não confere com a chave de rede do rover/, nome)
    }
  } finally { await e.fechar() }
})

test('chave de cifra trocada no meio: o cliente relê a chave e cifra de novo UMA vez; se continuar velha, desiste', async () => {
  const e = await ambiente()
  try {
    const { ana, beto, conversa } = await e.par()
    const rota = `/v1/rovers/${beto.rover.uid}/chave-de-cifra`
    const velha = (await (await fetch(`${e.base}${rota}`)).json()).objeto
    // o Beto troca de chave; o relé (ou um cache no caminho) ainda serve a velha na primeira leitura
    beto.c.chavePrivadaDeCifra = gerarParDeCifra().chavePrivada
    e.m.avancar(2)
    await beto.c.publicarChaveDeCifra()
    e.m.avancar(2)
    let leituras = 0
    ana.espiao.trocar = async (caminho) => (caminho === rota && leituras++ === 0 ? e.json({ objeto: velha }) : null)
    ana.aprovador.vistos = 0
    const r = await ana.c.enviarMensagem(conversa, 'Depois da troca.')
    assert.equal(r.estado, 'aceito')
    assert.equal(ana.aprovador.vistos, 2, 'a pessoa aprovou duas vezes: o cifrado mudou')
    assert.equal(posts(ana.pedidos, 'mensagem').length, 2)
    assert.deepEqual((await beto.c.lerConversa(conversa)).itens.map((i) => i.texto), ['Depois da troca.'])
    // servindo SEMPRE a velha: duas tentativas e desiste com o erro do relé (sem laço sem fim)
    ana.espiao.trocar = async (caminho) => (caminho === rota ? e.json({ objeto: velha }) : null)
    const antes = posts(ana.pedidos, 'mensagem').length
    await assert.rejects(ana.c.enviarMensagem(conversa, 'De novo.'), (err) => err instanceof ErroDeRele && err.codigo === 'chave_de_cifra_desatualizada')
    assert.equal(posts(ana.pedidos, 'mensagem').length - antes, 2)
  } finally { await e.fechar() }
})

test('outros erros no envio não ganham segunda tentativa: a pessoa que nega, e a conversa encerrada', async () => {
  const e = await ambiente()
  try {
    const { ana, beto, conversa } = await e.par()
    ana.aprovador.vistos = 0
    ana.aprovador.negar = true
    await assert.rejects(ana.c.enviarMensagem(conversa, 'oi'), NaoAprovado)
    assert.equal(ana.aprovador.vistos, 1)
    ana.aprovador.negar = false
    await beto.c.encerrarConversa(conversa)
    ana.aprovador.vistos = 0
    const antes = posts(ana.pedidos, 'mensagem').length
    await assert.rejects(ana.c.enviarMensagem(conversa, 'ainda aí?'), (err) => err instanceof ErroDeRele && err.codigo !== 'chave_de_cifra_desatualizada')
    assert.equal(ana.aprovador.vistos, 1, 'uma aprovação só')
    assert.equal(posts(ana.pedidos, 'mensagem').length - antes, 1, 'um envio só')
  } finally { await e.fechar() }
})

test('ler a conversa: mensagem de OUTRA conversa ou com a assinatura do objeto trocada vem ilegível, sem texto e fora das regras', async () => {
  const e = await ambiente()
  try {
    const { ana, beto, conversa: antiga } = await e.par()
    await ana.c.enviarMensagem(antiga, 'Da conversa antiga.')
    await beto.c.encerrarConversa(antiga)
    e.m.avancar(1)
    const { conversa: nova } = await ana.c.pedirConversa(beto.rover.uid, 'De novo?')
    await beto.c.aceitarConversa(nova)
    e.m.avancar(1)
    await ana.c.enviarMensagem(nova, 'Da conversa nova.')
    const rotaNova = `/v1/rovers/${beto.rover.uid}/conversas/${nova}/mensagens`
    const verdadeiras = async (real) => (await (await real()).json())
    // 1. o relé mistura na conversa nova a mensagem da antiga (que é legítima LÁ)
    const daAntiga = e.m.armazem.um('SELECT envelope FROM mensagens WHERE conversa = :c', { c: antiga }).envelope
    beto.espiao.trocar = async (caminho, metodo, real) => {
      if (!caminho.startsWith(rotaNova)) return null
      const pagina = await verdadeiras(real)
      return e.json({ ...pagina, itens: [...pagina.itens, JSON.parse(daAntiga)] })
    }
    const misturada = (await beto.c.lerConversa(nova)).itens
    assert.equal(misturada.length, 2)
    assert.deepEqual(misturada[0], { ...misturada[0], legivel: true, texto: 'Da conversa nova.' })
    assert.deepEqual(misturada[1], { id: JSON.parse(daAntiga).objeto.id, de: ana.rover.uid, criadoEm: JSON.parse(daAntiga).objeto.criadoEm, legivel: false, texto: null, assinatura: null, dentroDasRegras: false })
    // 2. a mensagem certa com a assinatura do OBJETO trocada pela de outro objeto da Ana (forma válida, assinatura que não confere)
    const outraAssinatura = JSON.parse(daAntiga).objeto.assinatura
    beto.espiao.trocar = async (caminho, metodo, real) => {
      if (!caminho.startsWith(rotaNova)) return null
      const pagina = await verdadeiras(real)
      return e.json({ ...pagina, itens: pagina.itens.map((x) => ({ ...x, objeto: { ...x.objeto, assinatura: outraAssinatura } })) })
    }
    assert.deepEqual((await beto.c.lerConversa(nova)).itens.map((i) => [i.legivel, i.texto, i.dentroDasRegras]), [[false, null, false]])
    // 3. sem conseguir conferir a chave de rede de quem enviou (atestado servido torto): ilegível, e a leitura não quebra
    const fresco = e.cliente(beto.rover, { cifra: beto.cifra })
    fresco.c.chavePrivadaDeCifra = beto.c.chavePrivadaDeCifra
    fresco.espiao.trocar = async (caminho, metodo, real) => {
      if (caminho !== `/v1/rovers/${ana.rover.uid}`) return null
      const p = await verdadeiras(real)
      return e.json({ ...p, atestado: { ...p.atestado, handle: 'torto' } })
    }
    assert.deepEqual((await fresco.c.lerConversa(nova)).itens.map((i) => [i.legivel, i.texto]), [[false, null]])
  } finally { await e.fechar() }
})

test('denunciar exige um item que este cliente leu: ilegível ou ausente falha antes de falar com o relé', async () => {
  const e = await ambiente()
  try {
    const { beto } = await e.par()
    const x = e.cliente(beto.rover, { cifra: beto.cifra })
    for (const item of [null, undefined, { id: 'ob_x', legivel: false, texto: null, assinatura: null }]) {
      assert.throws(() => x.c.denunciarMensagem(item, 'spam'), /Só se denuncia uma mensagem que este cliente conseguiu ler/)
    }
    assert.deepEqual(x.pedidos, [])
  } finally { await e.fechar() }
})
