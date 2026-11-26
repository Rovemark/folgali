// SPDX-License-Identifier: AGPL-3.0-or-later
// Mutual friendship, blocking and muting, and the privacy of friend lists.
import test from 'node:test'
import assert from 'node:assert/strict'
import { STRUCTURE, TIMES } from '../../packages/protocol/src/index.js'
import { codeOf, errorOf, fresh } from '../helpers/network.js'
import { policyOf } from '../helpers/world.js'

/** A world with two adult rovers, A and B. */
const pair = (options) => { const x = fresh(); return Object.assign(x, { a: x.rover(options), b: x.rover(options) }) }
const notice = (x, r) => x.s.listar(r.uid, { limite: 20 }, x.m.relogio.agora).itens

test('request, accept: the request stays pending, the friendship is born active, pending lists and notifications reach the right people', () => {
  const x = pair()
  assert.equal(x.ok(x.a, 'amizade', { alvo: x.b.uid, acao: 'pedir' }).resultado, 'pendente')
  assert.equal(x.s.amizade(x.a.uid, x.b.uid).estado, 'pendente')
  assert.deepEqual(x.s.amizadesPendentes(x.b.uid, x.como(x.b)).recebidos.map((p) => p.rover.uid), [x.a.uid])
  assert.deepEqual(x.s.amizadesPendentes(x.a.uid, x.como(x.a)).enviados.map((p) => p.rover.uid), [x.b.uid])
  assert.deepEqual(notice(x, x.b).map((n) => n.tipo), ['pedido-de-amizade'])
  assert.equal(notice(x, x.b)[0].origem.uid, x.a.uid)
  assert.equal(x.ok(x.b, 'amizade', { alvo: x.a.uid, acao: 'aceitar' }).resultado, 'ativa')
  assert.equal(x.s.amizade(x.a.uid, x.b.uid).estado, 'ativa')
  assert.deepEqual(x.s.amizadesPendentes(x.b.uid, x.como(x.b)).recebidos, [])
  assert.deepEqual(notice(x, x.a).map((n) => n.tipo), ['amizade-aceita'])
  assert.deepEqual(x.s.amigos(x.a.uid, {}).itens.map((i) => i.rover.uid), [x.b.uid])
  assert.deepEqual(x.s.amigos(x.b.uid, {}).itens.map((i) => i.rover.uid), [x.a.uid])
})

test('requesting again is "ja_existe"; the requester cannot accept or decline their own request', () => {
  const x = pair()
  x.ok(x.a, 'amizade', { alvo: x.b.uid, acao: 'pedir' })
  assert.equal(x.code(x.a, 'amizade', { alvo: x.b.uid, acao: 'pedir' }), 'ja_existe')
  assert.equal(x.code(x.a, 'amizade', { alvo: x.b.uid, acao: 'aceitar' }), 'nao_encontrado')
  assert.equal(x.code(x.a, 'amizade', { alvo: x.b.uid, acao: 'recusar' }), 'nao_encontrado')
  x.ok(x.b, 'amizade', { alvo: x.a.uid, acao: 'aceitar' })
  assert.equal(x.code(x.a, 'amizade', { alvo: x.b.uid, acao: 'pedir' }), 'ja_existe', 'they are already friends')
  assert.equal(x.code(x.b, 'amizade', { alvo: x.a.uid, acao: 'aceitar' }), 'nao_encontrado', 'there is no request anymore')
})

test('accept, decline and undo with nothing pending: "nao_encontrado"', () => {
  const x = pair()
  for (const action of ['aceitar', 'recusar', 'desfazer']) assert.equal(x.code(x.a, 'amizade', { alvo: x.b.uid, acao: action }), 'nao_encontrado', action)
})

test('if the other side had already asked, asking back activates the friendship at once and notifies the first requester', () => {
  const x = pair()
  x.ok(x.a, 'amizade', { alvo: x.b.uid, acao: 'pedir' })
  assert.equal(x.ok(x.b, 'amizade', { alvo: x.a.uid, acao: 'pedir' }).resultado, 'ativa')
  assert.equal(x.s.activeFriendship(x.a.uid, x.b.uid).estado, 'ativa')
  assert.deepEqual(notice(x, x.a).map((n) => n.tipo), ['amizade-aceita'])
})

test('decline: the pair cannot ask again for 7 days (in both directions), and on day 7 they can', () => {
  const x = pair()
  x.ok(x.a, 'amizade', { alvo: x.b.uid, acao: 'pedir' })
  assert.equal(x.ok(x.b, 'amizade', { alvo: x.a.uid, acao: 'recusar' }).resultado, 'nenhuma')
  x.advance(3600)
  const e = errorOf(() => x.ok(x.a, 'amizade', { alvo: x.b.uid, acao: 'pedir' }))
  assert.equal(e.codigo, 'limite_de_taxa')
  assert.equal(e.retryAfterS, TIMES.friendRequestRefusalS - 3600)
  assert.equal(x.code(x.b, 'amizade', { alvo: x.a.uid, acao: 'pedir' }), 'limite_de_taxa')
  x.advance(TIMES.friendRequestRefusalS - 3600 - 1)
  assert.equal(x.code(x.a, 'amizade', { alvo: x.b.uid, acao: 'pedir' }), 'limite_de_taxa', 'one second earlier is still blocked')
  x.advance(1)
  assert.equal(x.ok(x.a, 'amizade', { alvo: x.b.uid, acao: 'pedir' }).resultado, 'pendente')
})

test('undo: either side ends an active friendship; the requester cancels the sent request; the receiver can only decline', () => {
  const x = pair()
  x.ok(x.a, 'amizade', { alvo: x.b.uid, acao: 'pedir' })
  assert.equal(x.code(x.b, 'amizade', { alvo: x.a.uid, acao: 'desfazer' }), 'nao_encontrado')
  assert.equal(x.ok(x.a, 'amizade', { alvo: x.b.uid, acao: 'desfazer' }).resultado, 'nenhuma')
  assert.equal(x.s.amizade(x.a.uid, x.b.uid), null)
  for (const who of ['a', 'b']) {
    x.ok(x.a, 'amizade', { alvo: x.b.uid, acao: 'pedir' })
    x.ok(x.b, 'amizade', { alvo: x.a.uid, acao: 'aceitar' })
    const [from, to] = who === 'a' ? [x.a, x.b] : [x.b, x.a]
    x.ok(from, 'amizade', { alvo: to.uid, acao: 'desfazer' })
    assert.equal(x.s.amizade(x.a.uid, x.b.uid), null, who)
  }
})

test('friendship with a rover that does not exist: "alvo_desconhecido"', () => {
  const x = pair()
  assert.equal(x.code(x.a, 'amizade', { alvo: `rvr_${'A'.repeat(22)}`, acao: 'pedir' }), 'alvo_desconhecido')
})

test('count limits: 50 sent requests, 100 received per rover, 500 friends', () => {
  const x = fresh()
  const insert = (from, to, state) => x.m.store.executar(
    'INSERT INTO amizades (par, de, para, estado, criado_em, atualizado_em) VALUES (:par, :de, :para, :estado, 1, 1)',
    { par: from < to ? `${from}|${to}` : `${to}|${from}`, de: from, para: to, estado: state }
  )
  const fake = (n) => Array.from({ length: n }, (_, i) => `rvr_${String(i).padStart(22, 'x')}`)
  const [a, b, c, d, e] = [x.rover(), x.rover(), x.rover(), x.rover(), x.rover()]
  for (const f of fake(STRUCTURE.sentFriendRequests)) insert(a.uid, f, 'pendente')
  assert.equal(x.code(a, 'amizade', { alvo: b.uid, acao: 'pedir' }), 'limite_de_estrutura', '50 sent')
  for (const f of fake(STRUCTURE.receivedFriendRequests)) insert(f, c.uid, 'pendente')
  assert.equal(x.code(b, 'amizade', { alvo: c.uid, acao: 'pedir' }), 'limite_de_estrutura', '100 received')
  for (const f of fake(STRUCTURE.amigos)) insert(d.uid, f, 'ativa')
  assert.equal(x.code(e, 'amizade', { alvo: d.uid, acao: 'pedir' }), 'limite_de_estrutura', '500 friends on one side')
  x.ok(b, 'amizade', { alvo: e.uid, acao: 'pedir' })
  insert(`rvr_${'z'.repeat(22)}`, d.uid, 'pendente')
  assert.equal(x.code(d, 'amizade', { alvo: `rvr_${'z'.repeat(22)}`, acao: 'aceitar' }), 'alvo_desconhecido', 'accept also checks the cap, and the target must exist')
})

// ---------- blocking and muting ----------

test('blocking ends the friendship, follows in both directions and pending testimonials; unblocking restores nothing', () => {
  const x = pair()
  x.amigos(x.a, x.b, 8)
  x.ok(x.a, 'seguir', { alvo: x.b.uid })
  x.ok(x.b, 'seguir', { alvo: x.a.uid })
  const dep = x.ok(x.a, 'depoimento', { alvo: x.b.uid, texto: 'Um ótimo parceiro de trabalho.' })
  x.ok(x.b, 'relacao', { alvo: x.a.uid, acao: 'bloquear' })
  assert.equal(x.s.amizade(x.a.uid, x.b.uid), null)
  assert.equal(x.m.store.objeto(dep.id).estado, 'recusado')
  assert.equal(x.rele.seguindo(x.a.uid).itens.length, 0)
  assert.equal(x.rele.seguindo(x.b.uid).itens.length, 0)
  assert.equal(x.rele.perfil(x.b.uid).seguidores, 0)
  x.ok(x.b, 'relacao', { alvo: x.a.uid, acao: 'desbloquear' })
  assert.equal(x.s.amizade(x.a.uid, x.b.uid), null, 'the friendship does not come back')
  assert.equal(x.rele.seguindo(x.a.uid).itens.length, 0, 'the follow does not come back')
})

test('a block works in both directions for friendship, note, testimonial, badge, follow, reaction and reply, always with the same error', () => {
  const x = pair()
  const post = x.ok(x.b, 'postagem', { texto: 'uma postagem', topicos: [] })
  x.ok(x.a, 'relacao', { alvo: x.b.uid, acao: 'bloquear' })
  for (const [who, other] of [[x.a, x.b], [x.b, x.a]]) {
    for (const [type, body] of [
      ['amizade', { alvo: other.uid, acao: 'pedir' }], ['recado', { alvo: other.uid, texto: 'oi' }], ['depoimento', { alvo: other.uid, texto: 'oi' }],
      ['selo', { alvo: other.uid, selo: 'rapido' }], ['seguir', { alvo: other.uid }]
    ]) assert.equal(x.code(who, type, body), 'interacao_nao_permitida', `${type} from ${who === x.a ? 'A' : 'B'}`)
  }
  assert.equal(x.code(x.a, 'reacao', { alvo: post.id, reacao: 'curtir' }), 'interacao_nao_permitida')
  assert.equal(x.code(x.a, 'resposta', { alvo: post.id, texto: 'oi' }), 'interacao_nao_permitida')
  const e = errorOf(() => x.does(x.b, 'recado', { alvo: x.a.uid, texto: 'oi' }))
  assert.equal(e.campo, 'objeto.corpo.alvo')
  assert.doesNotMatch(e.message, /bloque/i, 'the message does not say who blocked')
  assert.equal(e.message, errorOf(() => x.does(x.a, 'recado', { alvo: x.b.uid, texto: 'oi' })).message, 'the same message for both sides')
})

test('block again, unblock without a block, mute again and the cap of 1000 blocks: the right errors', () => {
  const x = pair()
  assert.equal(x.code(x.a, 'relacao', { alvo: x.b.uid, acao: 'desbloquear' }), 'nao_encontrado')
  x.ok(x.a, 'relacao', { alvo: x.b.uid, acao: 'bloquear' })
  assert.equal(x.code(x.a, 'relacao', { alvo: x.b.uid, acao: 'bloquear' }), 'ja_existe')
  assert.equal(x.code(x.a, 'relacao', { alvo: x.b.uid, acao: 'dessilenciar' }), 'nao_encontrado', 'blocking is not muting')
  x.ok(x.a, 'relacao', { alvo: x.b.uid, acao: 'silenciar' })
  assert.equal(x.code(x.a, 'relacao', { alvo: x.b.uid, acao: 'silenciar' }), 'ja_existe')
  const c = x.rover()
  const d = x.rover()
  for (let i = 0; i < STRUCTURE.relationsPerType; i++) x.m.store.executar("INSERT INTO relacoes (autor, alvo, tipo, em) VALUES (:a, :alvo, 'bloqueio', 1)", { a: c.uid, alvo: `rvr_${String(i).padStart(22, 'y')}` })
  assert.equal(x.code(c, 'relacao', { alvo: d.uid, acao: 'bloquear' }), 'limite_de_estrutura')
  for (let i = 0; i < STRUCTURE.relationsPerType; i++) x.m.store.executar("INSERT INTO relacoes (autor, alvo, tipo, em) VALUES (:a, :alvo, 'silencio', 1)", { a: c.uid, alvo: `rvr_${String(i).padStart(22, 'w')}` })
  assert.equal(x.code(c, 'relacao', { alvo: d.uid, acao: 'silenciar' }), 'limite_de_estrutura')
})

test('relations are private: the relay does not serve the object, only the rover itself lists them, and the blocked one cannot find out', () => {
  const x = pair()
  const bl = x.ok(x.a, 'relacao', { alvo: x.b.uid, acao: 'bloquear' })
  assert.equal(codeOf(() => x.rele.objeto(bl.id)), 'nao_encontrado')
  assert.equal(x.m.store.objeto(bl.id).envelope, null)
  assert.deepEqual(x.s.relacoes(x.a.uid, { credencial: x.como(x.a) }).itens.map((i) => [i.rover.uid, i.relacao]), [[x.b.uid, 'bloqueio']])
  assert.equal(codeOf(() => x.s.relacoes(x.a.uid, { credencial: x.como(x.b) })), 'sem_permissao')
  assert.equal(codeOf(() => x.s.relacoes(x.a.uid, { credencial: null })), 'leitura_nao_autorizada')
  assert.deepEqual(x.s.relacoes(x.b.uid, { credencial: x.como(x.b) }).itens, [])
  assert.equal(x.s.paginaDoRover(x.a.uid, { credencial: x.como(x.b) }).voce.euBloqueei, false, 'B does not see that A blocked them')
  assert.equal(x.s.paginaDoRover(x.b.uid, { credencial: x.como(x.a) }).voce.euBloqueei, true)
})

test('muting only cuts the muted rover notifications; they can still interact', () => {
  const x = pair()
  x.ok(x.a, 'relacao', { alvo: x.b.uid, acao: 'silenciar' })
  x.ok(x.b, 'recado', { alvo: x.a.uid, texto: 'oi, tudo bem?' })
  assert.equal(notice(x, x.a).length, 0)
  assert.equal(x.s.recados(x.a.uid, {}).itens.length, 1, 'the note went in, it just did not notify')
  x.ok(x.a, 'relacao', { alvo: x.b.uid, acao: 'dessilenciar' })
  x.advance(2000)
  x.ok(x.b, 'recado', { alvo: x.a.uid, texto: 'outro oi' })
  assert.equal(notice(x, x.a).length, 1)
})

// ---------- friend lists and the graph ----------

test('friend list: a rover with a closed graph appears neither in the list nor in the count of others, and sees its own', () => {
  const x = fresh()
  const a = x.rover()
  const b = x.rover({ grafo: 'privado' })
  const c = x.rover()
  x.amigos(a, b, 0)
  x.amigos(a, c, 0)
  assert.deepEqual(x.s.amigos(a.uid, { credencial: null }).itens.map((i) => i.rover.uid), [c.uid])
  assert.equal(x.s.paginaDoRover(a.uid, {}).contagens.amigos, 1)
  assert.deepEqual(x.s.amigos(a.uid, { credencial: x.como(a) }).itens.map((i) => i.rover.uid).sort(), [b.uid, c.uid].sort(), 'A sees all of theirs')
  assert.equal(x.s.paginaDoRover(a.uid, { credencial: x.como(a) }).contagens.amigos, 2)
  assert.equal(codeOf(() => x.s.amigos(b.uid, { credencial: null })), 'grafo_privado')
  assert.deepEqual(x.s.amigos(b.uid, { credencial: x.como(b) }).itens.map((i) => i.rover.uid), [a.uid], 'B reads theirs')
  assert.equal(x.s.paginaDoRover(b.uid, {}).contagens.amigos, null)
  assert.equal(codeOf(() => x.s.amigos(b.uid, { credencial: x.como(a) })), 'grafo_privado', 'not even a friend reads the other list')
})

test('graph "contagens": shows the number and hides the list; the person policy closes more than the profile', () => {
  const x = fresh()
  const a = x.rover({ grafo: 'contagens' })
  const b = x.rover()
  x.amigos(a, b, 0)
  assert.equal(x.s.paginaDoRover(a.uid, {}).contagens.amigos, 1)
  assert.equal(codeOf(() => x.s.amigos(a.uid, { credencial: null })), 'grafo_privado')
  const c = x.rover()
  x.amigos(b, c, 0)
  assert.equal(x.s.amigos(b.uid, {}).itens.length, 1, 'B is public: their list brings C, and A (graph contagens) is left out')
  x.rele.acceptDeclaration({ declaracao: policyOf(c, { grafo: 'privado', emitidaEm: x.m.relogio.agora, v: '0.3' }) })
  assert.equal(codeOf(() => x.s.amigos(c.uid, { credencial: null })), 'grafo_privado')
  assert.equal(x.s.amigos(b.uid, {}).itens.length, 0, 'C closed through the policy: disappears from the list of B')
})

test('mutual friends: only between public graphs (or when the reader is one of the ends), without revealing who closed', () => {
  const x = fresh()
  const [a, b, z1, z2, zf] = [x.rover(), x.rover(), x.rover(), x.rover(), x.rover({ grafo: 'privado' })]
  for (const z of [z1, z2, zf]) { x.amigos(a, z, 0); x.amigos(b, z, 0) }
  const list = (uid, using, credential) => x.s.amigosEmComum(uid, using, { credencial: credential }).itens.map((r) => r.uid).sort()
  assert.deepEqual(list(a.uid, b.uid, null), [z1.uid, z2.uid].sort(), 'the closed one is left out')
  assert.deepEqual(list(a.uid, b.uid, x.como(a)), [z1.uid, z2.uid].sort())
  assert.deepEqual(list(b.uid, a.uid, null), [z1.uid, z2.uid].sort(), 'symmetric')
  assert.equal(codeOf(() => x.s.amigosEmComum(a.uid, a.uid, {})), 'esquema')
  assert.equal(codeOf(() => x.s.amigosEmComum(a.uid, 'rvr_x', {})), 'esquema')
  assert.equal(codeOf(() => x.s.amigosEmComum(a.uid, undefined, {})), 'esquema')
  assert.equal(codeOf(() => x.s.amigosEmComum(a.uid, `rvr_${'A'.repeat(22)}`, {})), 'nao_encontrado')
  // one end closed: only that rover reads, and even then the other side does not open if it is closed too
  const f1 = x.rover({ grafo: 'privado' })
  x.amigos(a, f1, 0)
  assert.equal(codeOf(() => x.s.amigosEmComum(a.uid, f1.uid, { credencial: null })), 'grafo_privado')
  assert.equal(codeOf(() => x.s.amigosEmComum(a.uid, f1.uid, { credencial: x.como(b) })), 'grafo_privado')
  assert.equal(codeOf(() => x.s.amigosEmComum(a.uid, f1.uid, { credencial: x.como(a) })), 'grafo_privado', 'A reads, but F1 is closed and is not A')
  assert.deepEqual(list(f1.uid, a.uid, x.como(f1)), [], 'F1 reads its own end; A is public')
  const f2 = x.rover({ grafo: 'privado' })
  assert.equal(codeOf(() => x.s.amigosEmComum(f1.uid, f2.uid, { credencial: x.como(f1) })), 'grafo_privado', 'two closed ends: nobody reads')
})

test('friendship lists paginate by cursor without repeating or skipping', () => {
  const x = fresh()
  const a = x.rover()
  const others = Array.from({ length: 5 }, () => x.rover())
  for (const o of others) x.amigos(a, o, 0)
  const p1 = x.s.amigos(a.uid, { limite: 2 })
  const p2 = x.s.amigos(a.uid, { limite: 2, antes: p1.proximo })
  const p3 = x.s.amigos(a.uid, { limite: 2, antes: p2.proximo })
  assert.equal(p3.proximo, null)
  const all = [...p1.itens, ...p2.itens, ...p3.itens].map((i) => i.rover.uid)
  assert.deepEqual(all, [...others].reverse().map((o) => o.uid), 'newest to oldest')
})
