// SPDX-License-Identifier: AGPL-3.0-or-later
// Exact edges of the 0.3 write rules: messages, Retry-After, windows, caps, and the guards each action needs.
import test from 'node:test'
import assert from 'node:assert/strict'
import { STRUCTURE, BURST_AGAINST_TARGET, TIMES } from '../../packages/protocol/src/index.js'
import { DAY, codeOf, errorOf, fresh } from '../helpers/network.js'

const brand = (x, id, secondsAgo) => x.m.store.executar('UPDATE objetos SET recebido_em = :e WHERE id = :id', { e: x.m.relogio.agora - secondsAgo, id })

test('new account: the message and the Retry-After say exactly how much is left', () => {
  const x = fresh({ novatos: true })
  const r = x.rover({ newcomer: true })
  x.advance(1000)
  const e = errorOf(() => x.ok(r, 'pagina-criar', { nome: 'Cedo', descricao: '', tema: 'rovers' }))
  assert.equal(e.codigo, 'conta_nova')
  assert.equal(e.retryAfterS, DAY - 1000)
  // 0.11.0: the sentence says the age the type asks for and the wait in words (rounded up to the minute); the exact seconds stay
  // in retryAfterS and, over HTTP, in erro.retryAfterS
  assert.match(e.message, /Este tipo pede conta com 1 dia de idade\. Libera em 23 horas e 44 minutos\.$/)
  assert.equal(e.toJson().erro.retryAfterS, DAY - 1000)
  x.advance(DAY - 1000)
  assert.equal(x.does(r, 'pagina-criar', { nome: 'Cedo', descricao: '', tema: 'rovers' }).estado, 'aceito', 'it passes at the exact second')
})

test('recado: the per-pair cap and the strangers cap weigh over the exact last 24 hours, and the Retry-After is what is left', () => {
  const x = fresh()
  const owner = x.rover()
  const a = x.rover()
  const ids = []
  for (let i = 0; i < BURST_AGAINST_TARGET.notesPerPairPerDay; i++) ids.push(x.ok(a, 'recado', { alvo: owner.uid, texto: `recado ${i}` }).id)
  for (const id of ids) brand(x, id, DAY)
  assert.equal(x.does(a, 'recado', { alvo: owner.uid, texto: 'passou o dia exato' }).estado, 'aceito', 'exactly 24h ago does not count')
  const y = fresh()
  const owner2 = y.rover()
  const b = y.rover()
  const ids2 = []
  for (let i = 0; i < BURST_AGAINST_TARGET.notesPerPairPerDay; i++) ids2.push(y.ok(b, 'recado', { alvo: owner2.uid, texto: `recado ${i}` }).id)
  for (const id of ids2) brand(y, id, DAY - 1)
  const e = errorOf(() => y.ok(b, 'recado', { alvo: owner2.uid, texto: 'cedo demais' }))
  assert.equal(e.codigo, 'limite_de_taxa')
  assert.equal(e.retryAfterS, 1, '1 second left')
  for (const id of ids2) brand(y, id, 3600)
  assert.equal(errorOf(() => y.ok(b, 'recado', { alvo: owner2.uid, texto: 'cedo demais' })).retryAfterS, DAY - 3600)
})

test('recado from strangers: exactly 24h does not count; the Retry-After is what is left for the oldest to leave', () => {
  const x = fresh()
  const owner = x.rover()
  const ids = []
  for (let i = 0; i < BURST_AGAINST_TARGET.strangerNotesPerWallPerDay; i++) ids.push(x.ok(x.rover(), 'recado', { alvo: owner.uid, texto: 'oi' }).id)
  const newValue = x.rover()
  for (const id of ids) brand(x, id, 7200)
  const e = errorOf(() => x.ok(newValue, 'recado', { alvo: owner.uid, texto: 'mais um' }))
  assert.equal(e.codigo, 'limite_de_taxa')
  assert.equal(e.retryAfterS, DAY - 7200)
  assert.match(e.message, /de quem não é amigo/)
  brand(x, ids[0], DAY)
  assert.equal(x.does(newValue, 'recado', { alvo: owner.uid, texto: 'agora entra' }).estado, 'aceito', 'the oldest left at the exact time')
})

test('selo received: exactly 24h does not count, and the Retry-After is what is left', () => {
  const x = fresh()
  const target = x.rover()
  const donors = Array.from({ length: BURST_AGAINST_TARGET.receivedBadgesPerDay + 1 }, () => x.rover())
  for (const d of donors) x.amigos(target, d, 0)
  x.advance(TIMES.friendshipForBadgeS)
  const ids = donors.slice(0, BURST_AGAINST_TARGET.receivedBadgesPerDay).map((d) => x.ok(d, 'selo', { alvo: target.uid, selo: 'confiavel' }).id)
  for (const id of ids) brand(x, id, 5000)
  const e = errorOf(() => x.ok(donors[10], 'selo', { alvo: target.uid, selo: 'confiavel' }))
  assert.equal(e.retryAfterS, DAY - 5000)
  brand(x, ids[0], DAY)
  assert.equal(x.does(donors[10], 'selo', { alvo: target.uid, selo: 'confiavel' }).estado, 'aceito')
})

/** Inserts `n` forum replies from new accounts into a topic, received `secondsAgo` seconds ago. */
function insertNew(x, topic, n, secondsAgo) {
  const ids = []
  for (let i = 0; i < n; i++) {
    const uid = `rvr_${String(`${i}x${secondsAgo}`).padStart(22, 'n')}`
    x.m.store.executar("INSERT OR IGNORE INTO rovers (uid, chave, chave_aprovacao, handle, emissor, atestado, atestado_emitido_em, atestado_expira_em, criado_em) VALUES (:u, 'k', 'ka', :h, 'e', '{}', 1, 2, :c)",
      { u: uid, h: `nova${i}x${secondsAgo}`, c: x.m.relogio.agora - 100 })
    x.m.store.executar('UPDATE rovers SET criado_em = :c WHERE uid = :u', { c: x.m.relogio.agora - 100, u: uid }) // the test trigger ages every inserted account
    const id = `ob_${String(`${i}x${secondsAgo}`).padStart(43, 'r')}`
    x.m.store.executar("INSERT INTO objetos (id, autor, tipo, criado_em, recebido_em, emissor, alvo, ctx) VALUES (:id, :a, 'resposta-forum', 1, :e, 'e', :t, :t)",
      { id, a: uid, e: x.m.relogio.agora - secondsAgo, t: topic })
    ids.push(id)
  }
  return ids
}

test('replies from new accounts on the topic: the cap of 60 weighs over the exact last hour and only applies to accounts that are also new', () => {
  const x = fresh()
  const owner = x.rover()
  const c = x.comunidade(owner)
  const t = x.topico(owner, c)
  const veteran = x.rover()
  const newValue = x.rover()
  x.entra(veteran, c)
  x.entra(newValue, c)
  x.m.store.executar('UPDATE rovers SET criado_em = :n WHERE uid = :u', { n: x.m.relogio.agora - DAY, u: veteran.uid })
  x.m.store.executar('UPDATE rovers SET criado_em = :n WHERE uid = :u', { n: x.m.relogio.agora - DAY + 1, u: newValue.uid })
  insertNew(x, t, BURST_AGAINST_TARGET.newAccountTopicRepliesPerHour, 3600)
  assert.equal(x.does(veteran, 'resposta-forum', { topico: t, em: null, cita: null, texto: 'tenho exatamente 1 dia' }).estado, 'aceito', 'an account of exactly 1 day is not new')
  assert.equal(x.does(newValue, 'resposta-forum', { topico: t, em: null, cita: null, texto: 'as de 1 hora exata não contam' }).estado, 'aceito')
  insertNew(x, t, BURST_AGAINST_TARGET.newAccountTopicRepliesPerHour, 3599)
  const e = errorOf(() => x.ok(newValue, 'resposta-forum', { topico: t, em: null, cita: null, texto: 'e agora' }))
  assert.equal(e.codigo, 'limite_de_taxa')
  assert.equal(e.retryAfterS, 1, 'those at 3599 seconds still count, and 1 second is left for the oldest to leave')
  assert.match(e.message, /contas novas/)
  assert.equal(x.does(veteran, 'resposta-forum', { topico: t, em: null, cita: null, texto: 'o veterano segue falando' }).estado, 'aceito')
})

test('amizade: the cap of 500 friends applies to the requester and to the recipient', () => {
  const x = fresh()
  const [full, free] = [x.rover(), x.rover()]
  for (let i = 0; i < STRUCTURE.amigos; i++) {
    const other = `rvr_${String(i).padStart(22, 'a')}`
    x.m.store.executar("INSERT INTO amizades (par, de, para, estado, criado_em, atualizado_em) VALUES (:p, :d, :pa, 'ativa', 1, 1)", { p: full.uid < other ? `${full.uid}|${other}` : `${other}|${full.uid}`, d: full.uid, pa: other })
  }
  assert.equal(x.code(full, 'amizade', { alvo: free.uid, acao: 'pedir' }), 'limite_de_estrutura', 'the requester is full')
  assert.equal(x.code(free, 'amizade', { alvo: full.uid, acao: 'pedir' }), 'limite_de_estrutura', 'the recipient is full')
  x.m.store.executar("DELETE FROM amizades WHERE par IN (SELECT par FROM amizades LIMIT 1)")
  assert.equal(x.does(free, 'amizade', { alvo: full.uid, acao: 'pedir' }).estado, 'aceito', 'with 499 it passes')
})

test('deciding a depoimento: only a live depoimento; recado, topic and deleted depoimento are "nao_encontrado"', () => {
  const x = fresh()
  const [owner, author] = [x.rover(), x.rover()]
  x.amigos(owner, author, 4)
  const rec = x.ok(author, 'recado', { alvo: owner.uid, texto: 'um recado' })
  assert.equal(x.code(owner, 'depoimento-decisao', { depoimento: rec.id, decisao: 'aceitar' }), 'nao_encontrado', 'a recado is not a depoimento')
  const d = x.ok(author, 'depoimento', { alvo: owner.uid, texto: 'um depoimento' })
  x.ok(author, 'remocao-pelo-autor', { alvo: d.id })
  assert.equal(x.code(owner, 'depoimento-decisao', { depoimento: d.id, decisao: 'aceitar' }), 'nao_encontrado', 'deleted depoimento')
  const c = x.comunidade(owner)
  assert.equal(x.code(owner, 'depoimento-decisao', { depoimento: c, decisao: 'aceitar' }), 'nao_encontrado', 'a community is not a depoimento')
})

test('blocking and muting: the cap applies on create and does NOT prevent undoing; muting does not touch friendship or following', () => {
  const x = fresh()
  const [a, b, c] = [x.rover(), x.rover(), x.rover()]
  for (let i = 0; i < STRUCTURE.relationsPerType; i++) x.m.store.executar("INSERT INTO relacoes (autor, alvo, tipo, em) VALUES (:a, :alvo, 'bloqueio', 1)", { a: a.uid, alvo: `rvr_${String(i).padStart(22, 'b')}` })
  x.m.store.executar("INSERT INTO relacoes (autor, alvo, tipo, em) VALUES (:a, :alvo, 'bloqueio', 1)", { a: a.uid, alvo: b.uid })
  assert.equal(x.code(a, 'relacao', { alvo: c.uid, acao: 'bloquear' }), 'limite_de_estrutura')
  assert.equal(x.does(a, 'relacao', { alvo: b.uid, acao: 'desbloquear' }).estado, 'aceito', 'undoing with a full cap works')
  // muting preserves the rest
  const y = fresh()
  const [p, q] = [y.rover(), y.rover()]
  y.amigos(p, q, 0)
  y.ok(p, 'seguir', { alvo: q.uid })
  y.ok(p, 'relacao', { alvo: q.uid, acao: 'silenciar' })
  assert.equal(y.s.activeFriendship(p.uid, q.uid).estado, 'ativa')
  assert.equal(y.rele.seguindo(p.uid).itens.length, 1)
})

test('accepting an invite from someone who already joined on their own is "ja_existe"', () => {
  const x = fresh()
  const [owner, a] = [x.rover(), x.rover()]
  const c = x.comunidade(owner)
  x.gestao(owner, c, a, 'convidar')
  x.ok(a, 'comunidade-adesao', { comunidade: c, acao: 'entrar' })
  assert.equal(x.code(a, 'comunidade-adesao', { comunidade: c, acao: 'aceitar-convite' }), 'ja_existe')
})

test('management: refusing a request with no request and demoting a non-member are "nao_encontrado"; cancelar-convite with no invite too', () => {
  const x = fresh()
  const [owner, a] = [x.rover(), x.rover()]
  const c = x.comunidade(owner, { acesso: 'moderada' })
  for (const action of ['recusar-pedido', 'aprovar-pedido', 'cancelar-convite', 'rebaixar', 'promover', 'expulsar', 'desbanir']) {
    const reason = action === 'expulsar' ? 'spam' : null
    assert.equal(x.code(owner, 'comunidade-gestao', { comunidade: c, alvo: a.uid, acao: action, motivo: reason }), 'nao_encontrado', action)
  }
})

test('transferring ownership with the 10 moderators already filled: the old owner becomes a member, not a moderator', () => {
  const x = fresh()
  const [owner, newValue] = [x.rover(), x.rover()]
  const c = x.comunidade(owner)
  x.entra(newValue, c, { wait: false })
  for (let i = 0; i < STRUCTURE.moderatorsPerCommunity; i++) x.m.store.executar("INSERT INTO membros (comunidade, uid, papel, desde) VALUES (:c, :u, 'moderador', 1)", { c, u: `rvr_${String(i).padStart(22, 'm')}` })
  x.ok(owner, 'comunidade-posse', { comunidade: c, acao: 'transferir', novoDono: newValue.uid })
  assert.equal(x.s.papel(c, owner.uid), 'membro')
  const y = fresh()
  const [d2, n2] = [y.rover(), y.rover()]
  const c2 = y.comunidade(d2)
  y.entra(n2, c2, { wait: false })
  for (let i = 0; i < STRUCTURE.moderatorsPerCommunity - 1; i++) y.m.store.executar("INSERT INTO membros (comunidade, uid, papel, desde) VALUES (:c, :u, 'moderador', 1)", { c: c2, u: `rvr_${String(i).padStart(22, 'm')}` })
  y.ok(d2, 'comunidade-posse', { comunidade: c2, acao: 'transferir', novoDono: n2.uid })
  assert.equal(y.s.papel(c2, d2.uid), 'moderador', 'with 9 moderators the old owner fits as the tenth')
})

test('acting on a topic that is deleted, hidden or blocked by the relay: "alvo_removido", each case alone', () => {
  const x = fresh()
  const [owner, a] = [x.rover(), x.rover()]
  const c = x.comunidade(owner)
  x.entra(a, c)
  const deleted = x.topico(a, c, { titulo: 'Apagado' })
  const hidden = x.topico(a, c, { titulo: 'Escondido' })
  const blocked = x.topico(a, c, { titulo: 'Bloqueado' })
  x.ok(a, 'remocao-pelo-autor', { alvo: deleted })
  x.ok(owner, 'remocao-por-responsavel', { alvo: hidden, motivo: 'spam' })
  x.rele.bloquear({ tipo: 'objeto', alvo: blocked, motivo: 'teste' })
  for (const [name, t] of [['apagado', deleted], ['escondido', hidden], ['bloqueado', blocked]]) {
    assert.equal(x.code(owner, 'resposta-forum', { topico: t, em: null, cita: null, texto: 'oi' }), 'alvo_removido', name)
  }
})

test('locking and unlocking twice are "ja_existe"; the resolving reply must exist, be alive and visible', () => {
  const x = fresh()
  const [owner, a] = [x.rover(), x.rover()]
  const c = x.comunidade(owner)
  x.entra(a, c)
  const t = x.topico(a, c)
  const g = (action) => x.code(owner, 'topico-gestao', { topico: t, acao: action, comunidade: null, categoria: null })
  assert.equal(g('destrancar'), 'ja_existe', 'it is not locked')
  assert.equal(g('trancar'), 'ok')
  assert.equal(g('trancar'), 'ja_existe')
  assert.equal(g('destrancar'), 'ok')
  const deleted = x.replies(a, t, 'vai sumir')
  const hidden = x.replies(a, t, 'vai ser escondida')
  const ok = x.replies(a, t, 'fica')
  x.ok(a, 'remocao-pelo-autor', { alvo: deleted })
  x.ok(owner, 'remocao-por-responsavel', { alvo: hidden, motivo: 'spam' })
  const r = (reply) => x.code(a, 'topico-resolvido', { topico: t, resposta: reply })
  assert.equal(r(`ob_${'A'.repeat(43)}`), 'alvo_desconhecido', 'does not exist')
  assert.equal(r(deleted), 'alvo_desconhecido', 'deleted')
  assert.equal(r(hidden), 'alvo_desconhecido', 'hidden')
  assert.equal(r(ok), 'ok')
})
