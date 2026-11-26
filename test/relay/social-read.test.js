// SPDX-License-Identifier: AGPL-3.0-or-later
// Social reads: pagination at the edges, excerpts, a quote of a reply that is gone, state labels and ids that do not exist.
import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_PAGE } from '../../packages/protocol/src/index.js'
import { codeOf, fresh } from '../helpers/network.js'

const IDX = `ob_${'A'.repeat(43)}`
const UIDX = `rvr_${'A'.repeat(22)}`
/** Text of `n` letters that the secret filter accepts (short words, not a run of letters). */
const text = (n) => `${'abcd '.repeat(Math.ceil(n / 5)).slice(0, n - 1)}x`

function communityWithTopic(extra = {}) {
  const x = fresh()
  const owner = x.rover()
  const m = x.rover()
  const c = x.comunidade(owner)
  x.entra(m, c)
  const t = x.topico(m, c, extra)
  return { x, dono: owner, m, c, t }
}

test('the default page size is 20 and applies when nobody asks for another', () => {
  assert.equal(DEFAULT_PAGE, 20)
  const x = fresh()
  const owner = x.rover()
  for (let i = 0; i < DEFAULT_PAGE + 1; i++) x.ok(x.rover(), 'recado', { alvo: owner.uid, texto: `recado ${i}` })
  const p = x.s.recados(owner.uid, {})
  assert.equal(p.itens.length, DEFAULT_PAGE)
  assert.notEqual(p.proximo, null)
  assert.equal(x.s.recados(owner.uid, { antes: p.proximo }).itens.length, 1)
})

test('cursor pagination: exactly "limite" items has no next page; one more has', () => {
  const x = fresh()
  const owner = x.rover()
  for (let i = 0; i < 3; i++) x.ok(x.rover(), 'recado', { alvo: owner.uid, texto: `recado ${i}` })
  assert.equal(x.s.recados(owner.uid, { limite: 3 }).proximo, null)
  const two = x.s.recados(owner.uid, { limite: 2 })
  assert.equal(two.itens.length, 2)
  assert.notEqual(two.proximo, null)
  assert.equal(x.s.recados(owner.uid, { limite: 2, antes: two.proximo }).itens.length, 1)
})

test('offset pagination: the next page only exists when an item is left over', () => {
  const x = fresh()
  const owner = x.rover()
  const c = x.comunidade(owner)
  x.entra(x.rover(), c, { wait: false })
  assert.equal(x.s.membersOf(c, { limite: 2, credencial: x.como(owner) }).proximo, null, 'two members, a page of two')
  const one = x.s.membersOf(c, { limite: 1, credencial: x.como(owner) })
  assert.equal(one.itens.length, 1)
  assert.equal(one.proximo, 1)
  const rest = x.s.membersOf(c, { limite: 1, antes: one.proximo, credencial: x.como(owner) })
  assert.equal(rest.itens.length, 1)
  assert.equal(rest.proximo, null)
})

test('the topic excerpt cuts at 200 letters and only then adds an ellipsis', () => {
  const exact = communityWithTopic({ texto: text(200) })
  assert.equal(exact.x.s.topicsOf(exact.c, {}).itens[0].trecho, text(200))
  const larger = communityWithTopic({ texto: text(201) })
  assert.equal(larger.x.s.topicsOf(larger.c, {}).itens[0].trecho, `${text(201).slice(0, 200)}…`)
})

test('the topic card says whether it is locked and whether it has a poll', () => {
  const { x, dono: owner, m, c, t } = communityWithTopic()
  const without = x.s.topicsOf(c, {}).itens[0]
  assert.equal(without.trancado, false)
  assert.equal(without.enquete, false)
  x.ok(owner, 'topico-gestao', { topico: t, acao: 'trancar', comunidade: null, categoria: null })
  assert.equal(x.s.topicsOf(c, {}).itens[0].trancado, true)
  const e = x.topico(m, c, { titulo: 'Com enquete', enquete: { opcoes: ['Sim', 'Não'], encerraEm: x.m.relogio.agora + 7200 } })
  assert.equal(x.s.topicsOf(c, {}).itens.find((i) => i.id === e).enquete, true)
})

test('the quote shows the excerpt only while the quoted reply is alive and visible', () => {
  const { x, dono: owner, m, t } = communityWithTopic()
  const a1 = x.replies(m, t, 'apagada pelo autor')
  const a2 = x.replies(m, t, 'escondida pela moderação')
  const a3 = x.replies(m, t, 'continua aqui')
  x.advance(700)
  const b1 = x.replies(m, t, 'cito a primeira', { cita: a1 })
  const b2 = x.replies(m, t, 'cito a segunda', { cita: a2 })
  const b3 = x.replies(m, t, 'cito a terceira', { cita: a3 })
  x.ok(m, 'remocao-pelo-autor', { alvo: a1 })
  x.ok(owner, 'remocao-por-responsavel', { alvo: a2, motivo: 'spam' })
  const quotes = (id) => x.s.repliesOf(t, { limite: 50 }).itens.find((i) => i.id === id).cita
  assert.equal(quotes(b1).trecho, null)
  assert.equal(quotes(b2).trecho, null)
  assert.equal(quotes(b3).trecho, 'continua aqui')
})

test('the quote excerpt also cuts at 200 letters', () => {
  const { x, m, t } = communityWithTopic()
  const long = x.replies(m, t, text(201))
  x.advance(700)
  const b = x.replies(m, t, 'cito a longa', { cita: long })
  assert.equal(x.s.repliesOf(t, { limite: 50 }).itens.find((i) => i.id === b).cita.trecho, `${text(201).slice(0, 200)}…`)
})

test('threaded replies: "em" must be a reply of this topic', () => {
  const { x, dono: owner, m, t } = communityWithTopic()
  const r = x.replies(m, t, 'uma resposta')
  const reaction = x.ok(owner, 'reacao', { alvo: t, reacao: 'curtir' }).id
  assert.equal(codeOf(() => x.s.repliesOf(t, { em: reaction })), 'nao_encontrado', 'a reaction to the topic is not a reply')
  assert.equal(codeOf(() => x.s.repliesOf(t, { em: t })), 'nao_encontrado', 'the topic is not a reply')
  assert.equal(codeOf(() => x.s.repliesOf(t, { em: IDX })), 'nao_encontrado')
  assert.deepEqual(x.s.repliesOf(t, { em: r }).itens, [])
})

test('a pending testimonial carries no acceptance date; an accepted one does', () => {
  const x = fresh()
  const [a, b] = [x.rover(), x.rover()]
  x.amigos(a, b, 4)
  const d = x.ok(b, 'depoimento', { alvo: a.uid, texto: 'Entrega no prazo.' })
  const pend = x.s.depoimentos(a.uid, { estado: 'pendentes', credencial: x.como(a) }).itens[0]
  assert.equal('aceitoEm' in pend, false)
  x.ok(a, 'depoimento-decisao', { depoimento: d.id, decisao: 'aceitar' })
  const accepted = x.s.depoimentos(a.uid, {}).itens[0]
  assert.equal(accepted.aceitoEm, x.m.store.objeto(d.id).estado_em)
})

test('moderated community: whoever asked to join sees "pedidoPendente", whoever did not ask does not', () => {
  const x = fresh()
  const [owner, a, b] = [x.rover(), x.rover(), x.rover()]
  const c = x.comunidade(owner, { acesso: 'moderada' })
  x.ok(a, 'comunidade-adesao', { comunidade: c, acao: 'entrar' })
  assert.equal(x.s.communityDetail(c, { credencial: x.como(a) }).voce.pedidoPendente, true)
  assert.equal(x.s.communityDetail(c, { credencial: x.como(b) }).voce.pedidoPendente, false)
})

test('management queues on a community that does not exist: "nao_encontrado", with and without a credential', () => {
  const x = fresh()
  const r = x.rover()
  for (const fn of ['pedidosDe', 'convitesDa', 'banidosDa']) {
    assert.equal(codeOf(() => x.s[fn](IDX, { credencial: x.como(r) })), 'nao_encontrado', `${fn} with credential`)
    assert.equal(codeOf(() => x.s[fn](IDX, {})), 'nao_encontrado', `${fn} without credential`)
  }
})

test('graph lists of a rover that does not exist: "nao_encontrado"', () => {
  const x = fresh()
  for (const fn of ['amigos', 'comunidadesDoRover', 'paginasDoRover']) {
    assert.equal(codeOf(() => x.s[fn](UIDX, {})), 'nao_encontrado', fn)
  }
})

test('pages: an invalid order is refused; "ativas" puts first whoever published last', () => {
  const x = fresh()
  const owner = x.rover()
  const p1 = x.ok(owner, 'pagina-criar', { nome: 'Primeira página', descricao: '', tema: 'rovers' }).id
  x.advance(10)
  const p2 = x.ok(owner, 'pagina-criar', { nome: 'Segunda página', descricao: '', tema: 'rovers' }).id
  assert.equal(codeOf(() => x.s.listedPages({ ordem: 'nada' })), 'esquema')
  assert.deepEqual(x.s.listedPages({ ordem: 'recentes' }).itens.map((i) => i.id), [p2, p1])
  x.advance(10)
  x.ok(owner, 'pagina-publicar', { pagina: p1, texto: 'Novidade na primeira.', tags: [] })
  assert.deepEqual(x.s.listedPages({ ordem: 'ativas' }).itens.map((i) => i.id), [p1, p2])
  assert.deepEqual(x.s.listedPages({ ordem: 'recentes' }).itens.map((i) => i.id), [p2, p1])
})
