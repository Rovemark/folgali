// SPDX-License-Identifier: AGPL-3.0-or-later
// Ponta a ponta da rede social: o cliente de referência contra o relé de verdade, pelo HTTP.
import test from 'node:test'
import assert from 'node:assert/strict'
import { AprovadorDeTeste, ClienteRover, ErroDeRele, NaoAprovado, PessoaDoRover } from '../../packages/cliente/src/index.js'
import { criarServidor } from '../../packages/rele/src/http.js'
import { novoMundo, novoRoverNoMundo } from '../ajuda/rele-de-teste.js'

async function ambiente(opcoesDoMundo = {}) {
  const m = novoMundo(opcoesDoMundo)
  const servidor = criarServidor({ rele: m.rele, rajada: { capacidade: 100000, porSegundo: 100000 } })
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${servidor.address().port}`
  const relogio = () => m.relogio.agora
  const novo = async (nome, pagina = {}) => {
    const rover = novoRoverNoMundo(m)
    const aprovador = new AprovadorDeTeste({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio })
    const cliente = new ClienteRover({ base, uid: rover.uid, chavePrivada: rover.rede.chavePrivada, atestado: rover.atestado, aprovador, relogio })
    const pessoa = new PessoaDoRover({ base, uid: rover.uid, chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio })
    await cliente.perfil({ nome, ...pagina })
    return { rover, aprovador, cliente, pessoa }
  }
  return { m, base, novo, fechar: () => new Promise((ok) => { servidor.closeAllConnections(); servidor.close(ok) }) }
}

test('uma tarde na rede: página, amizade, comunidade, fórum, enquete, página de fãs, busca e notificações', async () => {
  const e = await ambiente()
  try {
    const ana = await e.novo('Ana', { sobre: 'Cuido de planilhas.', habilidades: ['planilhas'], interesses: ['organizacao'], retrato: { corpo: 'redondo', cor: 'azul', veste: null, acessorio: null } })
    const beto = await e.novo('Beto')
    const caio = await e.novo('Caio')
    // página e amizade
    assert.equal((await ana.cliente.estado('explorando')).estado, 'aceito')
    assert.equal((await ana.cliente.paginaDoRover(ana.rover.uid)).rover.estado.estado, 'explorando')
    assert.equal((await beto.cliente.pedirAmizade(ana.rover.uid)).resultado, 'pendente')
    assert.equal((await ana.cliente.amizadesPendentes()).recebidos.length, 1)
    assert.equal((await ana.cliente.aceitarAmizade(beto.rover.uid)).resultado, 'ativa')
    assert.equal((await beto.cliente.notificacoesNovas()).novas, 1)
    assert.equal((await beto.cliente.amigos(beto.rover.uid)).itens[0].rover.uid, ana.rover.uid)
    const rec = await beto.cliente.recado(ana.rover.uid, `Oi, @${ana.rover.handle}! Gostei das planilhas.`)
    assert.equal((await ana.cliente.recados()).itens[0].envelope.objeto.id, rec.objeto.id)
    // comunidade e fórum
    const com = await ana.cliente.criarComunidade({ nome: 'Planilhas e prazos', descricao: 'Troca de ideias', regras: 'Sem spam.', tema: 'produtividade', categorias: ['Dúvidas'] })
    assert.equal((await beto.cliente.entrarNaComunidade(com.id)).resultado, 'membro')
    assert.equal((await caio.cliente.entrarNaComunidade(com.id)).resultado, 'membro')
    e.m.avancar(3601)
    const t = await beto.cliente.topico({ comunidade: com.id, categoria: 'Dúvidas', titulo: 'Como organizar?', texto: 'Quero ouvir a experiência de vocês.', tags: ['organizacao'], enquete: { opcoes: ['lista', 'quadro'], encerraEm: e.m.relogio.agora + 7200 } })
    const r1 = await caio.cliente.responderNoForum(t.id, 'Eu uso uma lista só.')
    const r2 = await ana.cliente.responderNoForum(t.id, 'Concordo com o Caio.', { em: r1.id, cita: r1.id })
    assert.equal((await beto.cliente.marcarResolvido(t.id, r1.id)).estado, 'aceito')
    assert.equal((await ana.cliente.votar(t.id, 0)).estado, 'aceito')
    const det = await caio.cliente.verTopico(t.id)
    assert.deepEqual([det.respostas, det.resolvido, det.enquete.opcoes[0].votos], [2, true, 1])
    const filhas = await caio.cliente.respostasDoTopico(t.id, { em: r1.id })
    assert.equal(filhas.itens[0].id, r2.id)
    assert.equal(filhas.itens[0].cita.trecho, 'Eu uso uma lista só.')
    await beto.cliente.editarTopico(t.id, { titulo: 'Como organizar a semana?', texto: 'Quero ouvir a experiência de vocês.', tags: ['organizacao'] })
    assert.equal((await caio.cliente.historicoDoTopico(t.id)).itens.length, 2)
    // moderação
    await ana.cliente.gerirMembro(com.id, caio.rover.uid, 'promover')
    await caio.cliente.gerirTopico(t.id, 'fixar')
    assert.equal((await ana.cliente.topicos(com.id)).fixados[0].id, t.id)
    await ana.cliente.removerComoResponsavel(r2.id, 'fora-do-tema')
    assert.equal((await ana.cliente.registroDaComunidade(com.id)).itens[0].motivo, 'fora-do-tema')
    // página de fãs
    const pag = await ana.cliente.criarPagina({ nome: 'Fãs de planilha', descricao: 'Novidades', tema: 'planilhas' })
    await beto.cliente.seguirPagina(pag.id)
    await ana.cliente.publicarNaPagina(pag.id, { titulo: 'Versão 2', texto: 'Saiu a versão 2.', tags: ['lancamento'] })
    assert.equal((await beto.cliente.linhaCompleta()).itens[0].objeto.tipo, 'pagina-publicar')
    // busca e descoberta
    assert.equal((await caio.cliente.busca('organizar', { tipo: 'topicos' })).itens[0].id, t.id)
    assert.equal((await caio.cliente.busca('planilhas')).paginas.length, 1)
    assert.equal((await caio.cliente.sugestoes({ tipo: 'comunidades', interesses: 'produtividade' })).itens[0].id, com.id)
    // notificações do Beto: pedido aceito, resposta no tópico, e a mais nova primeiro
    const avisos = await beto.cliente.notificacoes()
    assert.ok(avisos.itens.some((n) => n.tipo === 'amizade-aceita' || n.tipo === 'resposta-no-topico'))
    assert.equal((await ana.cliente.notificacoes()).itens.some((n) => n.tipo === 'mencao' || n.tipo === 'recado'), true)
  } finally { await e.fechar() }
})

test('a pessoa não aprova: nada sai do computador; sem aprovação o relé também recusa; ação livre não pede aprovação', async () => {
  const e = await ambiente()
  try {
    const a = await e.novo('Ana')
    const b = await e.novo('Beto')
    a.aprovador.vistos.length = 0
    a.aprovador.aprovando = false
    await assert.rejects(() => a.cliente.recado(b.rover.uid, 'oi'), NaoAprovado)
    await assert.rejects(() => a.cliente.criarComunidade({ nome: 'Sem aval', tema: 'rovers' }), NaoAprovado)
    assert.equal((await a.cliente.estado('dormindo')).estado, 'aceito', 'estado é livre')
    assert.equal((await a.cliente.pedirAmizade(b.rover.uid)).estado, 'aceito', 'amizade é livre')
    assert.equal(a.aprovador.vistos.length, 2, 'só os dois com texto foram mostrados à pessoa')
    // a pessoa passa a exigir aprovação para amizade (política 0.3): o cliente aprende com o perfil e passa a pedir
    a.aprovador.aprovando = true
    await a.pessoa.definirPolitica({ grafo: 'publico', exigirAprovacao: ['estado', 'amizade'] })
    await a.cliente.sincronizar()
    assert.deepEqual(a.cliente.exigidos, ['amizade', 'estado'])
    a.aprovador.vistos.length = 0
    await a.cliente.estado('ausente')
    assert.equal(a.aprovador.vistos.length, 1)
  } finally { await e.fechar() }
})

test('erros do relé chegam como ErroDeRele com o código novo', async () => {
  const e = await ambiente()
  try {
    const a = await e.novo('Ana')
    const b = await e.novo('Beto')
    await a.cliente.bloquear(b.rover.uid)
    await assert.rejects(() => b.cliente.recado(a.rover.uid, 'oi'), (err) => err instanceof ErroDeRele && err.codigo === 'interacao_nao_permitida' && err.status === 403)
    await assert.rejects(() => b.cliente.entrarNaComunidade(`ob_${'A'.repeat(43)}`), (err) => err.codigo === 'nao_encontrado')
    assert.equal((await a.cliente.relacoes()).itens[0].relacao, 'bloqueio')
    assert.deepEqual((await b.cliente.relacoes()).itens, [], 'o bloqueado não vê nada na própria lista')
    await assert.rejects(() => b.cliente.comunidade(`ob_${'A'.repeat(43)}`), (err) => err.status === 404)
  } finally { await e.fechar() }
})
