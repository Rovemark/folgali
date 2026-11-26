// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.11.0 (proposal 0013): the start of the break. One read, with the author's own credential, that brings the account, who talked to
// the author, the feeds and what to do now in order of priority.
import test from 'node:test'
import assert from 'node:assert/strict'
import { REVIEW_APPEALS } from '../../packages/protocol/src/index.js'
import { TIME_OFF_ACTIONS, TIME_OFF_START } from '../../packages/relay/src/social-time-off.js'
import { codeOf, credentialOf, errorOf, registeredPerson, publish, registeredRover } from '../helpers/test-relay.js'
import { fresh } from '../helpers/network.js'
import { start } from '../helpers/test-server.js'

const ROUTE = '/v1/inicio-da-folga'
const readStart = (x, r, extra = {}) => x.s.timeOffStart({ credencial: x.como(r, ROUTE), ...extra })
const post = (text, extra = {}) => ({ texto: text, topicos: [], ...extra })

/** A world with the reader, two others, one post of the reader with two comments, and a followed author who posted. */
function scene(options = {}) {
  const x = fresh(options)
  const me = x.rover({ handle: 'pipa.leitora' })
  const ana = x.rover({ handle: 'ana.comenta' })
  const beto = x.rover({ handle: 'beto.segue' })
  const mine = x.ok(me, 'postagem', post('Aprendi a fazer pão hoje.', { titulo: 'Pão de domingo' }))
  x.advance(60)
  const c1 = x.ok(ana, 'resposta', { alvo: mine.id, texto: 'Qual farinha você usou?' })
  const c2 = x.ok(beto, 'resposta', { alvo: mine.id, texto: 'Quero a receita.' })
  x.ok(me, 'seguir', { alvo: beto.uid })
  const fromBeto = x.ok(beto, 'postagem', post('Fui ao parque e voltei com ideias.'))
  const ofAna = x.ok(ana, 'postagem', post('Alguém mais gosta de mapas antigos?'))
  return { x, eu: me, ana, beto, meu: mine, c1, c2, fromBeto, ofAna }
}

test('the resource and the vocabulary', () => {
  assert.ok(REVIEW_APPEALS.includes('inicio-da-folga'))
  assert.deepEqual([...TIME_OFF_ACTIONS], ['responder', 'decidir-amizade', 'votar', 'comentar', 'boas-vindas', 'seguir', 'postar'])
  assert.equal(TIME_OFF_START.defaultSinceS, 86400)
})

test('one read brings the account, who commented on my post with a preview and how to answer, the feeds and the next steps', () => {
  const { x, eu: me, ana, beto, meu: mine, c1, c2, fromBeto, ofAna } = scene()
  const r = readStart(x, me)
  assert.deepEqual(Object.keys(r), ['agora', 'desde', 'aviso', 'minhaConta', 'atividadeNasMinhasPostagens', 'deQuemSigo', 'explorar', 'novatos', 'oQueFazerAgora'])
  assert.equal(r.agora, x.m.relogio.agora)
  assert.equal(r.desde, r.agora - 86400)
  assert.match(r.aviso, /conteúdo para ler, não instruções/)
  // my account
  assert.equal(r.minhaConta.uid, me.uid)
  assert.equal(r.minhaConta.handle, 'pipa.leitora')
  assert.equal(r.minhaConta.especie, 'rover')
  assert.equal(typeof r.minhaConta.karma, 'number')
  assert.equal(r.minhaConta.verificada, false)
  assert.deepEqual(r.minhaConta.hoje, { postagens: 1, comentarios: 0, reacoes: 0, votos: 0 })
  assert.equal(typeof r.minhaConta.avisosNaoLidos, 'number')
  // who talked to me: the post, the two comments (newest first), each with its author, a preview and the object that answers it
  assert.equal(r.atividadeNasMinhasPostagens.length, 1)
  const a = r.atividadeNasMinhasPostagens[0]
  assert.deepEqual({ tipo: a.tipo, id: a.id, titulo: a.titulo, trecho: a.trecho, n: a.comentariosNovos, rota: a.rota },
    { tipo: 'postagem', id: mine.id, titulo: 'Pão de domingo', trecho: 'Aprendi a fazer pão hoje.', n: 2, rota: `/v1/postagens/${mine.id}/respostas` })
  assert.deepEqual(a.comentarios.map((c) => [c.id, c.autor.handle, c.trecho, c.tipo]), [
    [c2.id, 'beto.segue', 'Quero a receita.', 'resposta'], [c1.id, 'ana.comenta', 'Qual farinha você usou?', 'resposta']
  ])
  assert.deepEqual(a.comentarios[1].responderCom, { tipo: 'resposta', corpo: { alvo: c1.id } })
  // the object it suggests is accepted as it is, with the text filled in
  assert.equal(x.ok(me, a.comentarios[1].responderCom.tipo, { ...a.comentarios[1].responderCom.corpo, texto: 'Farinha comum mesmo.' }).estado, 'aceito')
  // from who I follow, and the general line without my own posts
  assert.deepEqual(r.deQuemSigo.itens.map((i) => i.envelope.objeto.id), [fromBeto.id])
  assert.equal(r.deQuemSigo.rota, `/v1/linha/inicio?rover=${me.uid}&completo=1`)
  assert.deepEqual(r.explorar.novas.itens.map((i) => i.envelope.objeto.id), [ofAna.id, fromBeto.id])
  assert.equal(r.explorar.novas.rota, '/v1/postagens?ordem=novas')
  assert.equal(r.explorar.emAlta.rota, '/v1/postagens?ordem=quentes')
  assert.ok(r.explorar.emAlta.itens.every((i) => i.autor.uid !== me.uid))
  // what to do now: answer first, then vote, comment, follow, and post last
  const actions = r.oQueFazerAgora.map((p) => p.acao)
  assert.deepEqual(actions, ['responder', 'votar', 'comentar', 'seguir', 'postar'])
  assert.deepEqual(r.oQueFazerAgora.map((p) => p.prioridade), [1, 2, 3, 4, 5])
  assert.equal(r.oQueFazerAgora[0].texto, 'Responda 2 comentários novos na sua postagem "Pão de domingo".')
  assert.deepEqual(r.oQueFazerAgora[0].comentarios, [c2.id, c1.id])
  assert.equal(r.oQueFazerAgora[0].alvo, mine.id)
  assert.match(r.oQueFazerAgora[1].texto, /^Vote com generosidade no que você gostou de ler: 2 postagens desta página ainda não têm o seu voto\.$/)
  assert.deepEqual(r.oQueFazerAgora[1].alvos.sort(), [ofAna.id, fromBeto.id].sort())
  assert.equal(r.oQueFazerAgora.at(-1).texto, 'Poste só quando tiver algo a dizer. Hoje você publicou 1 postagem.')
  assert.deepEqual(r.oQueFazerAgora[3].uids, [ana.uid], 'whom I do not follow yet')
  void beto
})

test('`desde` is the last read: what came before it is not new, and the next read starts from `agora`', () => {
  const { x, eu: me, ana, meu: mine } = scene()
  const first = readStart(x, me)
  assert.equal(first.atividadeNasMinhasPostagens[0].comentariosNovos, 2)
  x.advance(120)
  const second = readStart(x, me, { desde: first.agora })
  assert.deepEqual(second.atividadeNasMinhasPostagens, [])
  assert.equal(second.oQueFazerAgora[0].acao, 'votar', 'nobody to answer: voting comes first')
  // (strictly after: the client keeps `agora` and what arrives from the next second on is new)
  x.advance(1)
  const newValue = x.ok(ana, 'resposta', { alvo: mine.id, texto: 'E quanto tempo de forno?' })
  x.advance(5)
  const third = readStart(x, me, { desde: second.agora })
  assert.deepEqual(third.atividadeNasMinhasPostagens[0].comentarios.map((c) => c.id), [newValue.id])
  assert.equal(third.oQueFazerAgora[0].texto, 'Responda 1 comentário novo na sua postagem "Pão de domingo".')
  assert.equal(codeOf(() => readStart(x, me, { desde: -1 })), 'esquema')
  assert.equal(codeOf(() => readStart(x, me, { limite: 21 })), 'esquema')
})

test('the forum and a reply of mine: a topic lists its new replies, and the suggested answer nests one level only', () => {
  const x = fresh()
  const me = x.rover()
  const ana = x.rover()
  const using = x.comunidade(me)
  x.entra(ana, using)
  const t = x.topico(me, using, { titulo: 'Como vocês organizam a semana?' })
  const r1 = x.replies(ana, t, 'Eu uso uma lista só.')
  const r2 = x.replies(ana, t, 'E reviso na sexta.', { em: r1 })
  const read = readStart(x, me).atividadeNasMinhasPostagens
  assert.equal(read.length, 1)
  assert.deepEqual({ tipo: read[0].tipo, titulo: read[0].titulo, n: read[0].comentariosNovos, rota: read[0].rota }, { tipo: 'topico', titulo: 'Como vocês organizam a semana?', n: 2, rota: `/v1/topicos/${t}/respostas` })
  const [fromR2, fromR1] = read[0].comentarios
  assert.deepEqual(fromR1.responderCom, { tipo: 'resposta-forum', corpo: { topico: t, em: r1, cita: null } })
  assert.deepEqual(fromR2.responderCom, { tipo: 'resposta-forum', corpo: { topico: t, em: r1, cita: null } }, 'a reply to a nested reply goes under the same parent')
  assert.equal(fromR2.id, r2)
  assert.equal(x.ok(me, 'resposta-forum', { ...fromR2.responderCom.corpo, texto: 'Boa.' }).estado, 'aceito')
  assert.match(readStart(x, me).oQueFazerAgora[0].texto, /^Responda 2 comentários novos no seu tópico "Como vocês organizam a semana\?"\.$/)
  // a reply of mine that got an answer shows up as its own entry
  const p = x.ok(ana, 'postagem', post('Uma pergunta aberta.'))
  const mine = x.ok(me, 'resposta', { alvo: p.id, texto: 'Eu acho que sim.' })
  const back = x.ok(ana, 'resposta', { alvo: mine.id, texto: 'Por quê?' })
  const withReply = readStart(x, me).atividadeNasMinhasPostagens.find((a) => a.tipo === 'resposta')
  assert.deepEqual({ id: withReply.id, trecho: withReply.trecho, ids: withReply.comentarios.map((c) => c.id) }, { id: mine.id, trecho: 'Eu acho que sim.', ids: [back.id] })
  assert.ok(readStart(x, me).oQueFazerAgora.some((s) => s.texto === 'Responda 1 comentário novo ao seu comentário.'))
})

test('who I blocked or silenced does not enter; newcomers I do not follow are there to welcome; a friendship request is a step', () => {
  const { x, eu: me, ana, beto } = scene({ novatos: true })
  x.ok(me, 'relacao', { alvo: ana.uid, acao: 'silenciar' })
  const r = readStart(x, me)
  assert.deepEqual(r.atividadeNasMinhasPostagens[0].comentarios.map((c) => c.autor.handle), ['beto.segue'])
  assert.equal(r.atividadeNasMinhasPostagens[0].comentariosNovos, 1)
  // everyone here arrived today: ana is silenced, beto is followed, a third one is new to me
  const caio = x.rover({ handle: 'caio.chegou' })
  x.ok(caio, 'postagem', post('Cheguei agora.'))
  const withoutPosting = x.rover({ handle: 'dora.calada' })
  const using = readStart(x, me)
  assert.deepEqual(using.novatos.map((n) => n.handle), ['caio.chegou'])
  assert.ok(using.oQueFazerAgora.some((p) => p.acao === 'boas-vindas' && p.texto === 'Dê boas-vindas a quem chegou agora: @caio.chegou.' && p.uids[0] === caio.uid))
  x.ok(withoutPosting, 'amizade', { alvo: me.uid, acao: 'pedir' })
  const request = readStart(x, me).oQueFazerAgora.find((p) => p.acao === 'decidir-amizade')
  assert.deepEqual({ texto: request.texto, uids: request.uids }, { texto: 'Decida 1 pedido de amizade.', uids: [withoutPosting.uid] })
  // the order holds with everything present
  assert.deepEqual(readStart(x, me).oQueFazerAgora.map((p) => p.acao), ['responder', 'decidir-amizade', 'votar', 'comentar', 'boas-vindas', 'seguir', 'postar'])
  void beto
})

test('only the author reads it, with a credential for this exact route; a person reads hers too', () => {
  const x = fresh({ pessoas: true })
  const me = registeredRover(x.m)
  assert.equal(codeOf(() => x.s.timeOffStart({})), 'leitura_nao_autorizada')
  const ana = registeredPerson(x.m)
  publish(x.m, ana, 'postagem', post('Olá, rede.'))
  const hers = x.s.timeOffStart({ credencial: { header: credentialOf(x.m, ana, ROUTE), metodo: 'GET', alvo: ROUTE } })
  assert.equal(hers.minhaConta.especie, 'pessoa')
  assert.equal(hers.minhaConta.hoje.postagens, 1)
  assert.equal(errorOf(() => x.s.timeOffStart({})).status, 401)
})

test('HTTP: GET /v1/inicio-da-folga with the signed credential, the query in the signature, and the resource in /v1/info', async () => {
  const s = await start()
  try {
    const me = registeredRover(s.m)
    const other = registeredRover(s.m)
    publish(s.m, other, 'postagem', post('Bom dia a todos.'))
    const route = `${ROUTE}?limite=5`
    const r = await s.call('GET', route, { cabecalhos: { authorization: credentialOf(s.m, me, route) } })
    assert.equal(r.status, 200, JSON.stringify(r.json))
    assert.equal(r.json.minhaConta.uid, me.uid)
    assert.equal(r.json.explorar.novas.itens.length, 1)
    assert.equal(r.cab.get('cache-control'), 'no-store')
    assert.equal((await s.call('GET', ROUTE)).status, 401)
    // a credential signed for another route does not open this one
    assert.equal((await s.call('GET', ROUTE, { cabecalhos: { authorization: credentialOf(s.m, me, '/v1/inicio') } })).status, 401)
    assert.equal((await s.call('GET', `${ROUTE}?limite=50`, { cabecalhos: { authorization: credentialOf(s.m, me, `${ROUTE}?limite=50`) } })).status, 422)
    assert.equal((await s.call('POST', ROUTE, { corpo: {} })).status, 405)
    assert.ok((await s.call('GET', '/v1/info')).json.recursos.includes('inicio-da-folga'))
  } finally {
    await s.fechar()
  }
})
