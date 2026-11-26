// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.3.2 (proposal 0007): order `melhores` and `em-alta`, by DISTINCT PEOPLE. The rule that matters: whoever replies 25 times or reacts 500
// times counts as one person, the author does not score on what they wrote, a new account and a hidden rover do not score, and nothing exposes `pontos`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { DAY, codeOf, fresh } from '../helpers/network.js'

function world(options) {
  const x = fresh(options)
  const owner = x.rover()
  const [ana, beto, caio, duda, eli] = [x.rover(), x.rover(), x.rover(), x.rover(), x.rover()]
  const c = x.comunidade(owner, { categorias: [] })
  for (const r of [ana, beto, caio, duda, eli]) { x.entra(r, c, { wait: false }); x.advance(1) }
  x.gestao(owner, c, ana, 'promover')
  x.advance(3601)
  return Object.assign(x, { dono: owner, ana, beto, caio, duda, eli, c })
}
const ids = (l) => l.itens.map((i) => i.id)
const like = (x, who, target) => x.ok(who, 'reacao', { alvo: target, reacao: 'curtir' })

test('melhores counts PEOPLE: three people replying once are worth more than one person replying 25 times and reacting', () => {
  const x = world()
  const t1 = x.topico(x.dono, x.c, { titulo: 'Tópico das três pessoas' })
  const t2 = x.topico(x.dono, x.c, { titulo: 'Tópico de uma pessoa só' })
  const t3 = x.topico(x.dono, x.c, { titulo: 'Tópico do próprio autor' })
  for (const r of [x.beto, x.caio, x.duda]) x.replies(r, t1, 'uma resposta de cada uma')
  for (let i = 0; i < 25; i++) { x.replies(x.beto, t2, `resposta número ${i + 1} da mesma pessoa`); x.advance(1) }
  like(x, x.beto, t2)
  for (let i = 0; i < 10; i++) { x.replies(x.dono, t3, `o autor falando sozinho ${i + 1}`); x.advance(1) }
  like(x, x.eli, t3)
  assert.deepEqual(ids(x.s.topicsOf(x.c, { ordem: 'recentes', limite: 50 })), [t3, t2, t1], 'by time: newest first')
  assert.deepEqual(ids(x.s.topicsOf(x.c, { ordem: 'melhores', limite: 50 })), [t1, t2, t3], 't1 has 3 people (9), t2 one person (3+1=4), t3 only one outside reaction (1)')
})

test('500 reactions from the same person count 1: reacting and removing the reaction in a loop does not inflate the topic', () => {
  const x = world()
  const t4 = x.topico(x.dono, x.c, { titulo: 'Tópico do giro' })
  const t5 = x.topico(x.dono, x.c, { titulo: 'Tópico de duas pessoas' })
  like(x, x.caio, t5)
  like(x, x.duda, t5)
  let alive = null
  for (let i = 0; i < 500; i++) {
    if (alive) x.ok(x.beto, 'remocao-pelo-autor', { alvo: alive })
    alive = x.ok(x.beto, 'reacao', { alvo: t4, reacao: i % 2 === 0 ? 'curtir' : 'util' }).id
    x.advance(80)
  }
  assert.equal(x.s.reactionsOf(t4, x.m.relogio.agora).curtir + x.s.reactionsOf(t4, x.m.relogio.agora).util, 1, 'only the last reaction is alive')
  assert.deepEqual(ids(x.s.topicsOf(x.c, { ordem: 'melhores', limite: 50 })), [t5, t4], '2 people (2 points) beat 500 reactions from 1 person (1 point)')
})

test('the author does not score on what they wrote, and no reply from the new queue makes the topic rise by itself', () => {
  const x = world()
  const own = x.topico(x.dono, x.c, { titulo: 'Proprio' })
  const foreign = x.topico(x.dono, x.c, { titulo: 'Alheio' })
  for (let i = 0; i < 12; i++) { x.replies(x.dono, own, `eu de novo ${i}`); x.advance(1) }
  x.replies(x.eli, foreign, 'uma resposta de fora')
  assert.deepEqual(ids(x.s.topicsOf(x.c, { ordem: 'melhores', limite: 50 })), [foreign, own])
})

test('a new account (under 1 day) does not score: a burst of new accounts does not raise the topic', () => {
  const x = fresh({ novatos: true })
  const [owner, ana, beto] = [x.rover(), x.rover(), x.rover()]
  x.advance(2 * DAY)
  const c = x.comunidade(owner)
  for (const r of [ana, beto]) { x.entra(r, c, { wait: false }); x.advance(1) }
  x.advance(3601)
  const old = x.topico(ana, c, { titulo: 'Com uma pessoa antiga' })
  x.replies(beto, old, 'uma pessoa com conta de dois dias')
  const newItems = [x.rover(), x.rover(), x.rover()]
  for (const r of newItems) { x.entra(r, c, { wait: false }); x.advance(1) }
  x.advance(3601)
  const burst = x.topico(ana, c, { titulo: 'Com uma rajada de contas novas' })
  for (const r of newItems) x.replies(r, burst, 'conta nova respondendo')
  assert.deepEqual(ids(x.s.topicsOf(c, { ordem: 'recentes', limite: 50 })), [burst, old])
  assert.deepEqual(ids(x.s.topicsOf(c, { ordem: 'melhores', limite: 50 })), [old, burst], '1 old person (3) beats 3 new accounts (0)')
})

test('a rover blocked by the operator does not score', () => {
  const x = world()
  const ta = x.topico(x.dono, x.c, { titulo: 'Ta com duas pessoas' })
  const tb = x.topico(x.dono, x.c, { titulo: 'Tb com uma pessoa' })
  x.replies(x.beto, ta, 'beto')
  x.replies(x.eli, ta, 'eli')
  x.replies(x.caio, tb, 'caio')
  assert.deepEqual(ids(x.s.topicsOf(x.c, { ordem: 'melhores', limite: 50 })), [ta, tb])
  x.rele.bloquear({ tipo: 'rover', alvo: x.beto.uid, motivo: 'x' })
  assert.deepEqual(ids(x.s.topicsOf(x.c, { ordem: 'melhores', limite: 50 })), [tb, ta], 'without beto, ta has 3 points and tb has 3: a tie, and the newest comes first')
})

test('em-alta counts only the window; melhores counts all time; an invalid window is esquema', () => {
  const x = world()
  const old = x.topico(x.dono, x.c, { titulo: 'Velho' })
  x.replies(x.beto, old, 'antiga')
  x.replies(x.caio, old, 'antiga')
  x.advance(2 * DAY)
  const newValue = x.topico(x.dono, x.c, { titulo: 'Novo' })
  x.replies(x.duda, newValue, 'agora')
  assert.deepEqual(ids(x.s.topicsOf(x.c, { ordem: 'melhores', limite: 50 })), [old, newValue], 'all time: 2 people (6) against 1 (3)')
  assert.deepEqual(ids(x.s.topicsOf(x.c, { ordem: 'em-alta', limite: 50 })), [newValue, old], '24h: only the new topic has activity in the window')
  assert.deepEqual(ids(x.s.topicsOf(x.c, { ordem: 'em-alta', janela: '24h', limite: 50 })), [newValue, old])
  assert.deepEqual(ids(x.s.topicsOf(x.c, { ordem: 'em-alta', janela: '7d', limite: 50 })), [old, newValue], '7 days: the old activity comes back in')
  assert.equal(codeOf(() => x.s.topicsOf(x.c, { ordem: 'em-alta', janela: '1h' })), 'esquema')
})

test('offset pagination: the pages add up to the whole list, without repeating, and pinned items only come on the first', () => {
  const x = world()
  const repliers = [x.ana, x.beto, x.caio, x.duda, x.eli]
  const topics = []
  for (let k = 5; k >= 1; k--) {
    const t = x.topico(x.dono, x.c, { titulo: `Tópico com ${k} pessoas` })
    topics[k] = t
    for (const r of repliers.slice(0, k)) x.replies(r, t, `resposta de quem tem ${k} colegas`)
  }
  assert.deepEqual(ids(x.s.topicsOf(x.c, { ordem: 'recentes', limite: 50 })), [topics[1], topics[2], topics[3], topics[4], topics[5]], 'by time it is the reverse')
  const p1 = x.s.topicsOf(x.c, { ordem: 'melhores', limite: 2 })
  assert.deepEqual(ids(p1), [topics[5], topics[4]])
  assert.equal(p1.proximo, 2)
  const p2 = x.s.topicsOf(x.c, { ordem: 'melhores', limite: 2, antes: p1.proximo })
  assert.deepEqual(ids(p2), [topics[3], topics[2]])
  assert.equal(p2.proximo, 4)
  const p3 = x.s.topicsOf(x.c, { ordem: 'melhores', limite: 2, antes: p2.proximo })
  assert.deepEqual(ids(p3), [topics[1]])
  assert.equal(p3.proximo, null)
  x.ok(x.ana, 'topico-gestao', { topico: topics[1], acao: 'fixar', comunidade: null, categoria: null })
  const q1 = x.s.topicsOf(x.c, { ordem: 'melhores', limite: 2 })
  assert.deepEqual(q1.fixados.map((i) => i.id), [topics[1]], 'the pinned one comes apart, on the first page')
  assert.deepEqual(ids(q1), [topics[5], topics[4]])
  const q2 = x.s.topicsOf(x.c, { ordem: 'melhores', limite: 2, antes: q1.proximo })
  assert.equal(q2.fixados, undefined, 'second page without pinned items')
  assert.deepEqual(ids(q2), [topics[3], topics[2]])
})

test('replies of a topic: melhores counts who replied to each reply and who reacted to it', () => {
  const x = world()
  const t = x.topico(x.dono, x.c)
  const r2 = x.replies(x.eli, t, 'segunda no tempo')
  const r1 = x.replies(x.beto, t, 'primeira em pessoas')
  const r3 = x.replies(x.duda, t, 'sem ninguém')
  x.replies(x.caio, t, 'filha 1', { em: r1 }); x.replies(x.duda, t, 'filha 2', { em: r1 })
  like(x, x.ana, r2); like(x, x.caio, r2)
  assert.deepEqual(ids(x.s.repliesOf(t, { ordem: 'antigas', limite: 50 })).filter((i) => [r1, r2, r3].includes(i)), [r2, r1, r3])
  assert.deepEqual(ids(x.s.repliesOf(t, { ordem: 'recentes', limite: 50 })).filter((i) => [r1, r2, r3].includes(i)), [r3, r1, r2])
  assert.deepEqual(ids(x.s.repliesOf(t, { ordem: 'melhores', limite: 50 })), [r1, r2, r3], 'r1: 2 people replying (6); r2: 2 people reacting (2); r3: 0')
  const page = x.s.repliesOf(t, { ordem: 'melhores', limite: 2 })
  assert.equal(page.proximo, 2)
  assert.deepEqual(ids(x.s.repliesOf(t, { ordem: 'melhores', limite: 2, antes: 2 })), [r3])
  assert.deepEqual(ids(x.s.repliesOf(t, { ordem: 'em-alta', limite: 50 })), [r1, r2, r3], 'everything happened in the window')
})

test('replies of a postagem: the same formula, for replies to replies and reactions', () => {
  const x = world()
  const post = x.ok(x.ana, 'postagem', { texto: 'uma postagem para responder', topicos: [] }).id
  const pc = x.ok(x.duda, 'resposta', { alvo: post, texto: 'primeira no tempo' }).id
  const pb = x.ok(x.caio, 'resposta', { alvo: post, texto: 'segunda, sem ninguém' }).id
  const pa = x.ok(x.beto, 'resposta', { alvo: post, texto: 'terceira, com filhas' }).id
  x.ok(x.caio, 'resposta', { alvo: pa, texto: 'filha de pa' }); x.ok(x.duda, 'resposta', { alvo: pa, texto: 'outra filha de pa' })
  like(x, x.eli, pc)
  const which = (o) => x.s.postReplies(post, { limite: 50, ...o }).itens.map((i) => i.envelope.objeto.id)
  assert.deepEqual(which({ ordem: 'recentes' }), [pa, pb, pc])
  assert.deepEqual(which({ ordem: 'melhores' }), [pa, pc, pb], 'pa: 2 people (6); pc: 1 reaction (1); pb: 0')
  assert.deepEqual(which({ ordem: 'em-alta' }), [pa, pc, pb])
  assert.equal(codeOf(() => x.s.postReplies(post, { ordem: 'populares' })), 'esquema')
})

test('topic search accepts order; on another type, order is an error; the default is still relevance', () => {
  const x = world()
  const a = x.topico(x.dono, x.c, { titulo: 'Orquestra de planilhas', texto: 'a orquestra toca todo dia' })
  const b = x.topico(x.dono, x.c, { titulo: 'Orquestra de lembretes', texto: 'orquestra pequena' })
  for (const r of [x.beto, x.caio, x.duda]) x.replies(r, a, 'toco junto')
  x.replies(x.eli, b, 'também')
  const now = x.m.relogio.agora
  const search = (o) => x.s.buscar({ q: 'orquestra', tipo: 'topicos', leitor: null, ...o }, now).itens.map((i) => i.id)
  assert.deepEqual(search({ ordem: 'recentes' }), [b, a])
  assert.deepEqual(search({ ordem: 'melhores' }), [a, b])
  assert.deepEqual(search({ ordem: 'em-alta' }), [a, b])
  assert.deepEqual(search({}), search({ ordem: 'relevancia' }), 'without order it is relevance, same as 0.3.1')
  for (const type of ['rovers', 'comunidades', 'paginas', 'todos']) {
    assert.equal(codeOf(() => x.s.buscar({ q: 'orquestra', tipo: type, ordem: 'melhores', leitor: null }, now)), 'esquema', type)
  }
  assert.equal(codeOf(() => x.s.buscar({ q: 'orquestra', tipo: 'topicos', ordem: 'populares', leitor: null }, now)), 'esquema')
  assert.deepEqual(Object.keys(x.s.buscar({ q: 'orquestra', tipo: 'todos', leitor: null }, now)), ['rovers', 'comunidades', 'topicos', 'paginas'], 'tipo=todos stays the same')
})

test('privacy: a closed community cannot be ordered from outside, an invalid order is esquema and the points never leave', () => {
  const x = world()
  const closed = x.comunidade(x.dono, { acesso: 'fechada' })
  assert.equal(codeOf(() => x.s.topicsOf(closed, { ordem: 'melhores', credencial: x.como(x.caio) })), 'nao_encontrado')
  assert.equal(codeOf(() => x.s.topicsOf(x.c, { ordem: 'populares' })), 'esquema')
  const t = x.topico(x.dono, x.c)
  x.replies(x.beto, t, 'oi')
  like(x, x.caio, t)
  const list = x.s.topicsOf(x.c, { ordem: 'melhores', limite: 50 })
  const text = JSON.stringify(list)
  for (const forbidden of ['pontos', 'score', 'pessoas']) assert.equal(text.includes(`"${forbidden}"`), false, `the list does not expose "${forbidden}"`)
  for (const who of [x.beto, x.caio]) assert.equal(text.includes(who.uid), false, 'and never who replied or reacted')
})

test('topic replies: em-alta looks only at the window and melhores looks at all time', () => {
  const x = world()
  const t = x.topico(x.dono, x.c)
  const stale = x.replies(x.beto, t, 'a antiga, com duas filhas')
  const fresh = x.replies(x.eli, t, 'a nova')
  x.replies(x.caio, t, 'filha antiga 1', { em: stale }); x.replies(x.duda, t, 'filha antiga 2', { em: stale })
  x.advance(2 * DAY)
  x.replies(x.caio, t, 'filha nova', { em: fresh })
  const which = (o) => ids(x.s.repliesOf(t, { limite: 50, ...o }))
  assert.deepEqual(which({ ordem: 'melhores' }), [stale, fresh], 'all time: 2 people (6) against 1 (3)')
  assert.deepEqual(which({ ordem: 'em-alta' }), [fresh, stale], '24h: only the new reply has activity')
  assert.deepEqual(which({ ordem: 'em-alta', janela: '7d' }), [stale, fresh])
  assert.equal(codeOf(() => x.s.repliesOf(t, { ordem: 'em-alta', janela: '1h' })), 'esquema')
})

test('postagem replies: em-alta looks only at the window and melhores looks at all time', () => {
  const x = world()
  const post = x.ok(x.ana, 'postagem', { texto: 'uma postagem de janela', topicos: [] }).id
  const pa = x.ok(x.beto, 'resposta', { alvo: post, texto: 'a antiga' }).id
  const pb = x.ok(x.eli, 'resposta', { alvo: post, texto: 'a nova' }).id
  x.ok(x.caio, 'resposta', { alvo: pa, texto: 'filha antiga 1' }); x.ok(x.duda, 'resposta', { alvo: pa, texto: 'filha antiga 2' })
  x.advance(2 * DAY)
  x.ok(x.caio, 'resposta', { alvo: pb, texto: 'filha nova' })
  const which = (o) => x.s.postReplies(post, { limite: 50, ...o }).itens.map((i) => i.envelope.objeto.id)
  assert.deepEqual(which({ ordem: 'melhores' }), [pa, pb])
  assert.deepEqual(which({ ordem: 'em-alta' }), [pb, pa])
  assert.deepEqual(which({ ordem: 'em-alta', janela: '7d' }), [pa, pb])
  assert.equal(codeOf(() => x.s.postReplies(post, { ordem: 'em-alta', janela: '1h' })), 'esquema')
})

test('topic search: em-alta looks only at the window, melhores at all time; recentes is by time and relevance is the text one', () => {
  const x = world()
  const a = x.topico(x.dono, x.c, { titulo: 'orquestra orquestra orquestra', texto: 'orquestra orquestra orquestra orquestra' })
  for (const r of [x.beto, x.caio, x.duda]) x.replies(r, a, 'toco junto')
  x.advance(2 * DAY)
  const b = x.topico(x.dono, x.c, { titulo: 'Orquestra', texto: 'um dia' })
  x.replies(x.eli, b, 'também')
  const search = (o) => x.s.buscar({ q: 'orquestra', tipo: 'topicos', leitor: null, ...o }, x.m.relogio.agora).itens.map((i) => i.id)
  assert.deepEqual(search({ ordem: 'melhores' }), [a, b], 'all time: 3 people (9) against 1 (3)')
  assert.deepEqual(search({ ordem: 'em-alta' }), [b, a], '24h: only the new topic has activity')
  assert.deepEqual(search({ ordem: 'em-alta', janela: '7d' }), [a, b])
  assert.deepEqual(search({ ordem: 'recentes' }), [b, a], 'by time: newest first')
  assert.deepEqual(search({}), [a, b], 'text relevance puts what mentions the word most first, unlike time')
  assert.deepEqual(search({ ordem: 'relevancia' }), [a, b])
  assert.equal(codeOf(() => x.s.buscar({ q: 'orquestra', tipo: 'topicos', ordem: 'em-alta', janela: '1h', leitor: null }, x.m.relogio.agora)), 'esquema')
})

test('the parent of a reply list (em) is only valid if it is a level-one reply of the topic itself', () => {
  const x = world()
  const t = x.topico(x.dono, x.c)
  const other = x.topico(x.dono, x.c, { titulo: 'Outro tópico' })
  const r = x.replies(x.beto, t, 'resposta de nível um')
  x.replies(x.caio, t, 'filha', { em: r })
  const fromOther = x.replies(x.duda, other, 'resposta de outro tópico')
  const edit = x.ok(x.dono, 'topico-editar', { topico: t, titulo: 'Titulo editado', texto: 'Texto editado', tags: [] }).id
  assert.equal(x.s.repliesOf(t, { em: r, limite: 50 }).itens.length, 1, 'a valid parent lists its children')
  for (const [name, at] of [['resposta de outro tópico', fromOther], ['a edição do tópico', edit], ['o próprio tópico', t], ['id que não existe', `ob_${'Z'.repeat(43)}`], ['texto qualquer', 'nao-e-id']]) {
    assert.equal(codeOf(() => x.s.repliesOf(t, { em: at })), 'nao_encontrado', name)
  }
})
