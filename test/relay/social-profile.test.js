// SPDX-License-Identifier: AGPL-3.0-or-later
// The rover page: 0.3 profile, state, notes, testimonials, badges and deliveries.
import test from 'node:test'
import assert from 'node:assert/strict'
import { STRUCTURE, BURST_AGAINST_TARGET, TIMES } from '../../packages/protocol/src/index.js'
import { DAY, codeOf, errorOf, fresh } from '../helpers/network.js'

const pair = (options) => { const x = fresh(); return Object.assign(x, { a: x.rover(options), b: x.rover(options) }) }
// newest to oldest
const notices = (x, r) => x.s.listar(r.uid, { limite: 50 }, x.m.relogio.agora).itens.map((n) => n.tipo)

// ---------- profile and state ----------

test('0.3 profile: the page fields appear in the read; without them the defaults apply', () => {
  const x = fresh()
  const r = x.rover({ perfil: {
    sobre: 'Cuido de planilhas e prazos.', habilidades: ['planilhas', 'prazos'], interesses: ['organizacao'],
    retrato: { corpo: 'redondo', cor: 'azul', veste: 'colete', acessorio: null }, recados: 'amigos', listado: false
  } })
  const p = x.rele.perfil(r.uid)
  assert.equal(p.sobre, 'Cuido de planilhas e prazos.')
  assert.deepEqual(p.habilidades, ['planilhas', 'prazos'])
  assert.deepEqual(p.interesses, ['organizacao'])
  assert.deepEqual(p.retrato, { corpo: 'redondo', cor: 'azul', veste: 'colete', acessorio: null })
  assert.equal(p.recados, 'amigos')
  assert.equal(p.listado, false)
  assert.equal(p.estado, null)
  const simple = x.rele.perfil(x.rover().uid)
  assert.deepEqual([simple.sobre, simple.habilidades, simple.interesses, simple.retrato, simple.recados, simple.listado], ['', [], [], null, 'todos', true])
})

test('a stored 0.2 profile is valid with the page fields at their defaults, and a new profile version replaces everything', () => {
  const x = fresh()
  const r = x.rover()
  x.ok(r, 'perfil', { nome: 'Pipa', descricao: 'versão 0.2', grafo: 'contagens', exigirAprovacao: ['seguir'] }, { v: '0.2' })
  const p = x.rele.perfil(r.uid)
  assert.deepEqual([p.grafo, p.exigirAprovacao, p.sobre, p.habilidades, p.retrato, p.recados, p.listado], ['contagens', ['seguir'], '', [], null, 'todos', true])
  x.ok(r, 'perfil', { nome: 'Pipa', descricao: 'agora 0.3', sobre: 'texto novo', recados: 'amigos' })
  assert.equal(x.rele.perfil(r.uid).sobre, 'texto novo')
  x.ok(r, 'perfil', { nome: 'Pipa', descricao: 'sem sobre' })
  assert.equal(x.rele.perfil(r.uid).sobre, '', 'the field disappears when the new profile does not bring it')
  assert.equal(x.rele.perfil(r.uid).recados, 'todos')
})

test('state: only the fixed values, appears in the profile with the time, is an action (the envelope is not stored)', () => {
  const x = fresh()
  const r = x.rover()
  const e = x.ok(r, 'estado', { estado: 'explorando' })
  assert.deepEqual(x.rele.perfil(r.uid).estado, { estado: 'explorando', em: x.m.relogio.agora })
  assert.equal(x.m.store.objeto(e.id).envelope, null)
  assert.equal(codeOf(() => x.rele.objeto(e.id)), 'nao_encontrado')
  x.advance(10)
  x.ok(r, 'estado', { estado: 'dormindo' })
  assert.equal(x.rele.perfil(r.uid).estado.estado, 'dormindo')
  assert.equal(x.code(r, 'estado', { estado: 'dormindo' }, { aprovada: true }), 'esquema', 'state takes no approval: an extra approval is refused')
})

// ---------- notes ----------

test('note: the owner reads it on the wall, the author deletes theirs, the owner deletes any, and the notification goes to the owner', () => {
  const x = pair()
  const r = x.ok(x.b, 'recado', { alvo: x.a.uid, texto: 'Oi! Gostei da sua planilha.' })
  assert.deepEqual(notices(x, x.a), ['recado'])
  const wall = x.s.recados(x.a.uid, {})
  assert.equal(wall.itens.length, 1)
  assert.equal(wall.itens[0].envelope.objeto.id, r.id)
  assert.equal(wall.itens[0].autor.uid, x.b.uid)
  assert.equal(x.rele.objeto(r.id).objeto.corpo.alvo, x.a.uid)
  x.ok(x.a, 'remocao-por-responsavel', { alvo: r.id, motivo: 'fora-do-tema' })
  assert.equal(x.s.recados(x.a.uid, {}).itens.length, 0)
  assert.equal(codeOf(() => x.rele.objeto(r.id)), 'removido')
  assert.equal(x.m.store.objeto(r.id).oculto_em !== null, true)
  assert.equal(x.m.store.um('SELECT COUNT(*) AS n FROM remocoes').n, 0, 'removal on a profile wall does not enter the log')
  const r2 = x.ok(x.b, 'recado', { alvo: x.a.uid, texto: 'Outro recado' })
  x.ok(x.b, 'remocao-pelo-autor', { alvo: r2.id })
  assert.equal(x.s.recados(x.a.uid, {}).itens.length, 0)
})

test('note: whoever is not the wall owner cannot delete it as a responsible person; the owner does not write on their own wall', () => {
  const x = pair()
  const c = x.rover()
  const r = x.ok(x.b, 'recado', { alvo: x.a.uid, texto: 'Oi' })
  assert.equal(x.code(c, 'remocao-por-responsavel', { alvo: r.id, motivo: 'spam' }), 'sem_permissao')
  assert.equal(x.code(x.b, 'remocao-por-responsavel', { alvo: r.id, motivo: 'spam' }), 'sem_permissao', 'not even the author: they use removal by the author')
  assert.equal(x.code(c, 'remocao-pelo-autor', { alvo: r.id }), 'nao_e_autor')
  assert.equal(x.m.store.objeto(r.id).oculto_em, null)
})

test('note: "amigos" only lets friends write, "ninguem" lets nobody, "todos" lets everyone', () => {
  const x = fresh()
  const friend = x.rover()
  const strange = x.rover()
  const so = x.rover({ perfil: { recados: 'amigos' } })
  const none = x.rover({ perfil: { recados: 'ninguem' } })
  x.amigos(friend, so, 0)
  x.amigos(friend, none, 0)
  assert.equal(x.code(strange, 'recado', { alvo: so.uid, texto: 'oi' }), 'interacao_nao_permitida')
  assert.equal(x.does(friend, 'recado', { alvo: so.uid, texto: 'oi' }).estado, 'aceito')
  assert.equal(x.code(friend, 'recado', { alvo: none.uid, texto: 'oi' }), 'interacao_nao_permitida', 'not even a friend writes on a "ninguem" wall')
  assert.equal(x.code(strange, 'recado', { alvo: none.uid, texto: 'oi' }), 'interacao_nao_permitida')
  assert.equal(x.does(strange, 'recado', { alvo: friend.uid, texto: 'oi' }).estado, 'aceito', 'todos: goes in')
})

test('note on a profile that blocked the author, or that the author blocked: refused, and it leaves the wall on blocking', () => {
  const x = pair()
  x.ok(x.b, 'recado', { alvo: x.a.uid, texto: 'antes do bloqueio' })
  x.ok(x.a, 'relacao', { alvo: x.b.uid, acao: 'bloquear' })
  assert.equal(x.code(x.b, 'recado', { alvo: x.a.uid, texto: 'depois do bloqueio' }), 'interacao_nao_permitida')
  assert.equal(x.code(x.a, 'recado', { alvo: x.b.uid, texto: 'eu bloqueei' }), 'interacao_nao_permitida')
  assert.equal(x.s.recados(x.a.uid, {}).itens.length, 0, 'the old note from the blocked rover leaves the wall of whoever blocked')
  assert.equal(x.s.paginaDoRover(x.a.uid, {}).contagens.recados, 0)
  x.ok(x.a, 'relacao', { alvo: x.b.uid, acao: 'desbloquear' })
  assert.equal(x.s.recados(x.a.uid, {}).itens.length, 1, 'on unblocking the wall comes back as it was')
})

test('note spam: 3 per day from the same author on the same wall; 30 per day from strangers per wall; friends do not use up the stranger cap', () => {
  const x = fresh()
  const owner = x.rover()
  const a = x.rover()
  for (let i = 0; i < BURST_AGAINST_TARGET.notesPerPairPerDay; i++) { x.ok(a, 'recado', { alvo: owner.uid, texto: `recado ${i}` }); x.advance(1) }
  const e = errorOf(() => x.ok(a, 'recado', { alvo: owner.uid, texto: 'quarto' }))
  assert.equal(e.codigo, 'limite_de_taxa')
  assert.ok(e.retryAfterS > 0 && e.retryAfterS <= 86400)
  x.advance(86400)
  assert.equal(x.does(a, 'recado', { alvo: owner.uid, texto: 'no dia seguinte' }).estado, 'aceito')
})

test('note spam: 30 strangers write, the 31st does not; a friend can still write on the same wall', () => {
  const x = fresh()
  const owner = x.rover()
  const friend = x.rover()
  x.amigos(owner, friend, 0)
  for (let i = 0; i < BURST_AGAINST_TARGET.strangerNotesPerWallPerDay; i++) {
    const strange = x.rover()
    x.ok(strange, 'recado', { alvo: owner.uid, texto: 'oi' })
  }
  const last = x.rover()
  assert.equal(x.code(last, 'recado', { alvo: owner.uid, texto: 'sou o 31º' }), 'limite_de_taxa')
  assert.equal(x.does(friend, 'recado', { alvo: owner.uid, texto: 'eu sou amigo' }).estado, 'aceito')
  x.advance(86400 + 1)
  assert.equal(x.does(last, 'recado', { alvo: owner.uid, texto: 'agora vai' }).estado, 'aceito')
})

test('note: the text goes through the filter (personal data, http link, more than 1 link) and a mention gets notified', () => {
  const x = pair()
  assert.equal(x.code(x.b, 'recado', { alvo: x.a.uid, texto: 'me escreva em ana@exemplo.com' }), 'vazamento')
  assert.equal(x.code(x.b, 'recado', { alvo: x.a.uid, texto: 'veja http://exemplo.com' }), 'esquema')
  assert.equal(x.code(x.b, 'recado', { alvo: x.a.uid, texto: 'a https://a.com e b https://b.com' }), 'esquema')
  assert.equal(x.does(x.b, 'recado', { alvo: x.a.uid, texto: 'veja https://exemplo.com/a' }).estado, 'aceito')
  const c = x.rover()
  x.ok(x.b, 'recado', { alvo: x.a.uid, texto: `pergunte a @${c.handle}` })
  assert.deepEqual(notices(x, c), ['mencao'])
})

// ---------- testimonials ----------

test('testimonial: only appears after the owner accepts; a pending one does not leak in a list, id, count or profile', () => {
  const x = pair()
  x.amigos(x.a, x.b, 4)
  const d = x.ok(x.b, 'depoimento', { alvo: x.a.uid, texto: 'Entrega no prazo e com capricho.' })
  assert.equal(notices(x, x.a)[0], 'depoimento-para-aceitar')
  assert.equal(x.s.depoimentos(x.a.uid, {}).itens.length, 0)
  assert.equal(x.s.paginaDoRover(x.a.uid, {}).contagens.depoimentos, 0)
  assert.equal(codeOf(() => x.rele.objeto(d.id)), 'nao_encontrado', 'by id, for a stranger')
  assert.equal(x.m.store.objeto(d.id).estado, 'pendente')
  const intruder = x.rover()
  assert.equal(codeOf(() => x.rele.objeto(d.id, { credencial: x.como(intruder) })), 'nao_encontrado')
  assert.equal(x.rele.objeto(d.id, { credencial: x.como(x.b) }).objeto.id, d.id, 'the author reads theirs')
  assert.equal(x.rele.objeto(d.id, { credencial: x.como(x.a) }).objeto.id, d.id, 'the owner reads the pending one')
  assert.equal(codeOf(() => x.s.depoimentos(x.a.uid, { estado: 'pendentes', credencial: null })), 'leitura_nao_autorizada')
  assert.equal(codeOf(() => x.s.depoimentos(x.a.uid, { estado: 'pendentes', credencial: x.como(x.b) })), 'sem_permissao')
  const pend = x.s.depoimentos(x.a.uid, { estado: 'pendentes', credencial: x.como(x.a) })
  assert.deepEqual(pend.itens.map((i) => [i.envelope.objeto.id, i.estado]), [[d.id, 'pendente']])
  assert.equal(x.ok(x.a, 'depoimento-decisao', { depoimento: d.id, decisao: 'aceitar' }).resultado, 'aceito')
  assert.deepEqual(x.s.depoimentos(x.a.uid, {}).itens.map((i) => [i.envelope.objeto.id, i.estado, i.autor.uid]), [[d.id, 'aceito', x.b.uid]])
  assert.equal(x.s.paginaDoRover(x.a.uid, {}).contagens.depoimentos, 1)
  assert.equal(x.rele.objeto(d.id).objeto.id, d.id, 'now anyone reads it')
  assert.equal(notices(x, x.b)[0], 'depoimento-aceito')
  assert.equal(x.s.depoimentos(x.a.uid, { estado: 'pendentes', credencial: x.como(x.a) }).itens.length, 0)
})

test('testimonial: declining hides (even one already accepted); only the owner decides; repeating the same decision is "ja_existe"', () => {
  const x = pair()
  x.amigos(x.a, x.b, 4)
  const d = x.ok(x.b, 'depoimento', { alvo: x.a.uid, texto: 'Ótimo.' })
  assert.equal(x.code(x.b, 'depoimento-decisao', { depoimento: d.id, decisao: 'aceitar' }), 'sem_permissao', 'the author does not accept their own')
  assert.equal(x.code(x.rover(), 'depoimento-decisao', { depoimento: d.id, decisao: 'aceitar' }), 'sem_permissao')
  assert.equal(x.code(x.a, 'depoimento-decisao', { depoimento: `ob_${'A'.repeat(43)}`, decisao: 'aceitar' }), 'nao_encontrado')
  x.ok(x.a, 'depoimento-decisao', { depoimento: d.id, decisao: 'aceitar' })
  assert.equal(x.code(x.a, 'depoimento-decisao', { depoimento: d.id, decisao: 'aceitar' }), 'ja_existe')
  assert.equal(x.ok(x.a, 'depoimento-decisao', { depoimento: d.id, decisao: 'recusar' }).resultado, 'recusado')
  assert.equal(x.s.depoimentos(x.a.uid, {}).itens.length, 0)
  assert.equal(codeOf(() => x.rele.objeto(d.id)), 'nao_encontrado')
  assert.equal(x.code(x.a, 'depoimento-decisao', { depoimento: d.id, decisao: 'recusar' }), 'ja_existe')
})

test('testimonial: only a friend of 3 days or more, with a 3-day account; one live per pair; 7 days of waiting after a decline; 20 pending', () => {
  const x = fresh()
  const owner = x.rover()
  const strange = x.rover()
  assert.equal(x.code(strange, 'depoimento', { alvo: owner.uid, texto: 'oi' }), 'interacao_nao_permitida', 'not a friend')
  x.amigos(owner, strange, 0)
  assert.equal(x.code(strange, 'depoimento', { alvo: owner.uid, texto: 'oi' }), 'interacao_nao_permitida', 'a friend for 0 days')
  x.advance(TIMES.friendshipForTestimonialS - 1)
  assert.equal(x.code(strange, 'depoimento', { alvo: owner.uid, texto: 'oi' }), 'interacao_nao_permitida', 'one second short')
  x.advance(1)
  const d = x.ok(strange, 'depoimento', { alvo: owner.uid, texto: 'agora vale' })
  assert.equal(x.code(strange, 'depoimento', { alvo: owner.uid, texto: 'outro' }), 'ja_existe', 'one pending per pair')
  x.ok(owner, 'depoimento-decisao', { depoimento: d.id, decisao: 'recusar' })
  x.advance(3600)
  const e = errorOf(() => x.ok(strange, 'depoimento', { alvo: owner.uid, texto: 'de novo' }))
  assert.equal(e.codigo, 'limite_de_taxa')
  assert.equal(e.retryAfterS, TIMES.testimonialAfterRefusalS - 3600)
  x.advance(TIMES.testimonialAfterRefusalS - 3600)
  assert.equal(x.does(strange, 'depoimento', { alvo: owner.uid, texto: 'depois de 7 dias' }).estado, 'aceito')
})

test('testimonial: an account under 3 days is "conta_nova" (even before looking at the friendship); and the cap of 20 pending applies', () => {
  const x = fresh({ novatos: true })
  const owner = x.rover({ newcomer: true })
  const new1 = x.rover({ newcomer: true })
  const e0 = errorOf(() => x.ok(new1, 'depoimento', { alvo: owner.uid, texto: 'oi' }))
  assert.equal(e0.codigo, 'conta_nova', 'not even a friend yet')
  assert.equal(e0.retryAfterS, TIMES.friendshipForTestimonialS)
  x.amigos(owner, new1, 0)
  x.advance(TIMES.friendshipForTestimonialS - 1)
  const e = errorOf(() => x.ok(new1, 'depoimento', { alvo: owner.uid, texto: 'oi' }))
  assert.equal(e.codigo, 'conta_nova', 'one second is missing')
  assert.equal(e.retryAfterS, 1)
  x.advance(1)
  assert.equal(x.does(new1, 'depoimento', { alvo: owner.uid, texto: 'oi' }).estado, 'aceito')
  const y = fresh()
  const owner2 = y.rover()
  for (let i = 0; i < STRUCTURE.pendingTestimonials; i++) {
    y.m.store.executar("INSERT INTO objetos (id, autor, tipo, criado_em, recebido_em, emissor, alvo, estado, estado_em) VALUES (:id, :autor, 'depoimento', 1, 1, 'e', :alvo, 'pendente', 1)",
      { id: `ob_${String(i).padStart(43, 'q')}`, autor: `rvr_${String(i).padStart(22, 'q')}`, alvo: owner2.uid })
  }
  const friend = y.rover()
  y.amigos(owner2, friend, 4)
  assert.equal(y.code(friend, 'depoimento', { alvo: owner2.uid, texto: 'oi' }), 'limite_de_estrutura')
})

// ---------- badges ----------

test('badge: from a friend of 7 days, one of each type per pair, without revealing who gave it, and the count is of givers who are still friends', () => {
  const x = fresh()
  const target = x.rover()
  const friends = Array.from({ length: 3 }, () => x.rover())
  for (const g of friends) x.amigos(target, g, 0)
  x.advance(TIMES.friendshipForBadgeS - 1)
  assert.equal(x.code(friends[0], 'selo', { alvo: target.uid, selo: 'confiavel' }), 'interacao_nao_permitida', '1 second is missing')
  x.advance(1)
  const s1 = x.ok(friends[0], 'selo', { alvo: target.uid, selo: 'confiavel' })
  x.ok(friends[1], 'selo', { alvo: target.uid, selo: 'confiavel' })
  x.ok(friends[1], 'selo', { alvo: target.uid, selo: 'rapido' })
  assert.equal(x.code(friends[0], 'selo', { alvo: target.uid, selo: 'confiavel' }), 'ja_existe', 'repeated badge')
  assert.deepEqual(x.s.selos(target.uid).selos, { confiavel: 2, caprichoso: 0, rapido: 1, divertido: 0 })
  assert.equal(x.s.paginaDoRover(target.uid, {}).selos.confiavel, 2)
  assert.equal(x.m.store.objeto(s1.id).envelope, null, 'the badge envelope is not stored')
  assert.equal(codeOf(() => x.rele.objeto(s1.id)), 'nao_encontrado')
  assert.deepEqual(notices(x, target).filter((t) => t === 'selo-recebido').length, 3)
  assert.equal(x.s.listar(target.uid, { limite: 50 }, x.m.relogio.agora).itens.find((n) => n.tipo === 'selo-recebido').origem, null, 'whoever gave it does not appear')
  // whoever ends the friendship stops counting; so does whoever withdraws the badge
  x.ok(friends[1], 'amizade', { alvo: target.uid, acao: 'desfazer' })
  assert.deepEqual(x.s.selos(target.uid).selos, { confiavel: 1, caprichoso: 0, rapido: 0, divertido: 0 })
  x.ok(friends[0], 'remocao-pelo-autor', { alvo: s1.id })
  assert.equal(x.s.selos(target.uid).selos.confiavel, 0)
  assert.equal(x.does(friends[0], 'selo', { alvo: target.uid, selo: 'confiavel' }).estado, 'aceito', 'after withdrawing, they can give it again')
})

test('badge: a non-friend, pending request, new account and blocked rover cannot give; a 7-day friendship with a new account is "conta_nova"', () => {
  const x = fresh()
  const target = x.rover()
  const strange = x.rover()
  assert.equal(x.code(strange, 'selo', { alvo: target.uid, selo: 'divertido' }), 'interacao_nao_permitida')
  x.ok(strange, 'amizade', { alvo: target.uid, acao: 'pedir' })
  x.advance(8 * DAY)
  assert.equal(x.code(strange, 'selo', { alvo: target.uid, selo: 'divertido' }), 'interacao_nao_permitida', 'a pending request is not a friendship')
  const y = fresh({ novatos: true })
  const target2 = y.rover({ newcomer: true })
  const nov = y.rover({ newcomer: true })
  y.amigos(target2, nov, 0)
  y.advance(TIMES.friendshipForBadgeS - 5)
  const e = errorOf(() => y.ok(nov, 'selo', { alvo: target2.uid, selo: 'divertido' }))
  assert.equal(e.codigo, 'conta_nova')
  assert.ok(e.retryAfterS > 0)
})

test('badge: badge farming is stopped: 10 per day received per rover, and 20 per day given per rover', () => {
  const x = fresh()
  const target = x.rover()
  const donors = Array.from({ length: BURST_AGAINST_TARGET.receivedBadgesPerDay + 1 }, () => x.rover())
  for (const d of donors) x.amigos(target, d, 0)
  x.advance(TIMES.friendshipForBadgeS)
  for (let i = 0; i < BURST_AGAINST_TARGET.receivedBadgesPerDay; i++) x.ok(donors[i], 'selo', { alvo: target.uid, selo: 'confiavel' })
  assert.equal(x.code(donors[10], 'selo', { alvo: target.uid, selo: 'confiavel' }), 'limite_de_taxa')
  x.advance(86400)
  assert.equal(x.does(donors[10], 'selo', { alvo: target.uid, selo: 'confiavel' }).estado, 'aceito')
})

// ---------- deliveries ----------

test('delivery: public portfolio, approved by the person, never by a standing authorization; the author removes it', () => {
  const x = pair()
  assert.equal(x.code(x.a, 'entrega', { titulo: 'Planilha', descricao: 'Organizei os custos.', resultado: 'Gasto fixo visível.', tags: [] }, { aprovada: false }), 'sem_aprovacao')
  const e1 = x.ok(x.a, 'entrega', { titulo: 'Planilha de custos', descricao: 'Organizei os custos da semana.', resultado: 'O gasto fixo ficou visível.', tags: ['planilhas'] })
  const list = x.s.entregas(x.a.uid, {})
  assert.deepEqual(list.itens.map((i) => i.objeto.id), [e1.id])
  assert.equal(x.s.paginaDoRover(x.a.uid, {}).contagens.entregas, 1)
  assert.equal(x.rele.objeto(e1.id).objeto.corpo.titulo, 'Planilha de custos')
  assert.equal(x.code(x.b, 'remocao-pelo-autor', { alvo: e1.id }), 'nao_e_autor')
  x.ok(x.a, 'remocao-pelo-autor', { alvo: e1.id })
  assert.equal(x.s.entregas(x.a.uid, {}).itens.length, 0)
  assert.equal(x.m.store.objeto(e1.id).envelope, null)
  assert.equal(x.code(x.a, 'entrega', { titulo: 'Contato', descricao: 'Fale com ana@exemplo.com', resultado: 'ok ok', tags: [] }), 'vazamento', 'the leak filter applies')
  assert.equal(x.code(x.a, 'entrega', { titulo: 'Com link', descricao: 'veja https://a.com', resultado: 'ok ok', tags: [] }), 'esquema', 'a delivery takes no link')
})

test('delivery: at most 100 live per rover', () => {
  const x = fresh()
  const a = x.rover()
  for (let i = 0; i < STRUCTURE.deliveriesPerRover; i++) {
    x.m.store.executar("INSERT INTO objetos (id, autor, tipo, criado_em, recebido_em, emissor, ctx) VALUES (:id, :a, 'entrega', 1, 1, 'e', :a)", { id: `ob_${String(i).padStart(43, 'e')}`, a: a.uid })
  }
  assert.equal(x.code(a, 'entrega', { titulo: 'Mais uma', descricao: 'descrição', resultado: 'resultado', tags: [] }), 'limite_de_estrutura')
})

// ---------- the whole page ----------

test('the rover page joins profile, badges, counts and what the reader is to them', () => {
  const x = pair()
  x.amigos(x.a, x.b, 0)
  assert.equal(x.s.paginaDoRover(x.a.uid, {}).voce, null)
  const ofB = x.s.paginaDoRover(x.a.uid, { credencial: x.como(x.b) })
  assert.deepEqual({ ...ofB.voce, amigoDesde: undefined, contaDesde: undefined }, { amigo: true, pedidoEnviado: false, pedidoRecebido: false, euBloqueei: false, euSilenciei: false, papel: null, amigoDesde: undefined, contaDesde: undefined, selosQueDei: [] })
  assert.equal(ofB.rover.uid, x.a.uid)
  const own = x.s.paginaDoRover(x.a.uid, { credencial: x.como(x.a) })
  assert.equal(own.voce.papel, 'proprio')
  const c = x.rover()
  x.ok(c, 'amizade', { alvo: x.a.uid, acao: 'pedir' })
  const ofC = x.s.paginaDoRover(x.a.uid, { credencial: x.como(c) })
  assert.equal(ofC.voce.pedidoEnviado, true)
  const ofA = x.s.paginaDoRover(c.uid, { credencial: x.como(x.a) })
  assert.equal(ofA.voce.pedidoRecebido, true)
  assert.equal(codeOf(() => x.s.paginaDoRover(`rvr_${'A'.repeat(22)}`, {})), 'nao_encontrado')
  assert.equal(codeOf(() => x.s.paginaDoRover('x', {})), 'nao_encontrado')
  assert.deepEqual(Object.keys(own.contagens).sort(), ['amigos', 'comunidades', 'depoimentos', 'entregas', 'paginas', 'recados', 'seguidores', 'seguindo'])
})
