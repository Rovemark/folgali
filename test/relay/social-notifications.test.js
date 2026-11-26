// SPDX-License-Identifier: AGPL-3.0-or-later
// Notifications: facts without text, only for the rover itself, with a cap on mentions from strangers, muting, blocking and retention.
import test from 'node:test'
import assert from 'node:assert/strict'
import { TIMES } from '../../packages/protocol/src/index.js'
import { codeOf, fresh } from '../helpers/network.js'
import { NOTIFICATION_TYPES } from '../../packages/relay/src/social-notifications.js'

const list = (x, r, o = {}) => x.s.notificationsOf(r.uid, { credencial: x.como(r), ...o })

test('the notification list belongs only to the rover itself: no credential 401, another rover 403, nonexistent rover 404', () => {
  const x = fresh()
  const [a, b] = [x.rover(), x.rover()]
  assert.equal(codeOf(() => x.s.notificationsOf(a.uid, { credencial: null })), 'leitura_nao_autorizada')
  assert.equal(codeOf(() => x.s.notificationsOf(a.uid, { credencial: x.como(b) })), 'sem_permissao')
  assert.equal(codeOf(() => x.s.notificationsOf(`rvr_${'A'.repeat(22)}`, { credencial: x.como(b) })), 'nao_encontrado')
  assert.deepEqual(list(x, a), { itens: [], proximo: null })
  assert.equal(codeOf(() => x.s.contagemDeNotificacoes(a.uid, { credencial: x.como(b) })), 'sem_permissao')
})

test('a notification carries no text: only type, time, origin, ids and context', () => {
  const x = fresh()
  const [a, b] = [x.rover(), x.rover()]
  x.ok(b, 'recado', { alvo: a.uid, texto: 'texto-secreto-do-recado' })
  const n = list(x, a).itens[0]
  assert.deepEqual(Object.keys(n).sort(), ['comunidade', 'em', 'lugar', 'objeto', 'origem', 'pagina', 'seq', 'tipo', 'topico'])
  assert.equal(JSON.stringify(n).includes('secreto'), false)
  assert.equal(n.tipo, 'recado')
  assert.equal(n.origem.uid, b.uid)
  assert.equal(n.origem.handle, b.handle)
  assert.equal(n.em, x.m.relogio.agora)
  assert.ok(NOTIFICATION_TYPES.includes(n.tipo))
})

test('count since a cursor, page by cursor and order from newest to oldest', () => {
  const x = fresh()
  const a = x.rover()
  for (let i = 0; i < 5; i++) { x.ok(x.rover(), 'recado', { alvo: a.uid, texto: `recado ${i}` }); x.advance(1) }
  assert.equal(x.s.contagemDeNotificacoes(a.uid, { credencial: x.como(a) }).novas, 5)
  const p1 = list(x, a, { limite: 2 })
  const p2 = list(x, a, { limite: 2, antes: p1.proximo })
  const p3 = list(x, a, { limite: 2, antes: p2.proximo })
  const seqs = [...p1.itens, ...p2.itens, ...p3.itens].map((n) => n.seq)
  assert.equal(seqs.length, 5)
  assert.deepEqual([...seqs].sort((m, n) => n - m), seqs, 'decrescente')
  assert.equal(p3.proximo, null)
  assert.equal(x.s.contagemDeNotificacoes(a.uid, { desde: seqs[0], credencial: x.como(a) }).novas, 0)
  assert.equal(x.s.contagemDeNotificacoes(a.uid, { desde: seqs[2], credencial: x.como(a) }).novas, 2)
  assert.equal(x.s.contagemDeNotificacoes(a.uid, { desde: 0, credencial: x.como(a) }).novas, 5)
})

test('whoever blocked or muted the author is not notified; a notice about oneself never exists', () => {
  const x = fresh()
  const [a, b, c] = [x.rover(), x.rover(), x.rover()]
  x.ok(a, 'relacao', { alvo: b.uid, acao: 'silenciar' })
  x.ok(a, 'relacao', { alvo: c.uid, acao: 'bloquear' })
  x.ok(b, 'recado', { alvo: a.uid, texto: 'oi do silenciado' })
  assert.equal(list(x, a).itens.length, 0)
  x.ok(c, 'postagem', { texto: `menção a @${a.handle}`, topicos: [] })
  assert.equal(list(x, a).itens.length, 0, 'mention from someone who was blocked')
  x.ok(a, 'postagem', { texto: `eu mesmo @${a.handle}`, topicos: [] })
  assert.equal(list(x, a).itens.length, 0)
})

test('mention: the handle must exist; capitals count; at most 20 per hour from non-friends; a friend does not use up the cap', () => {
  const x = fresh()
  const target = x.rover({ handle: 'alvo.da.mencao' })
  const friend = x.rover()
  x.amigos(target, friend, 0)
  x.ok(friend, 'postagem', { texto: 'oi @NaoExiste.Mesmo e @ALVO.da.mencao', topicos: [] })
  assert.equal(list(x, target).itens.filter((n) => n.tipo === 'mencao').length, 1)
  for (let i = 0; i < 20; i++) {
    const e = x.rover()
    x.ok(e, 'postagem', { texto: `oi @alvo.da.mencao ${i}`, topicos: [] })
  }
  const total = () => list(x, target, { limite: 50 }).itens.filter((n) => n.tipo === 'mencao').length
  assert.equal(total(), 20, 'the 1st from the friend + 19 from strangers; the 20th from a stranger is already over the cap of 20 per hour')
  x.ok(friend, 'postagem', { texto: 'outra @alvo.da.mencao', topicos: [] })
  assert.equal(total(), 21, 'the friend keeps notifying')
  x.advance(3601)
  x.ok(x.rover(), 'postagem', { texto: 'passada a hora @alvo.da.mencao', topicos: [] })
  assert.equal(total(), 22)
})

test('mention only in a 0.3 object: a 0.2 postagem with @ does not notify', () => {
  const x = fresh()
  const [a, b] = [x.rover(), x.rover()]
  x.ok(b, 'postagem', { texto: `oi @${a.handle}`, topicos: [] }, { v: '0.2' })
  assert.equal(list(x, a).itens.length, 0)
  x.ok(b, 'postagem', { texto: `oi @${a.handle}`, topicos: [] })
  assert.equal(list(x, a).itens.length, 1)
})

test('retention: the last 500 and the last 90 days stay', () => {
  const x = fresh()
  const a = x.rover()
  const ins = x.m.store
  for (let i = 0; i < 520; i++) ins.executar("INSERT INTO notificacoes (dest, tipo, origem, objeto, comunidade, pagina, em) VALUES (:d, 'recado', NULL, NULL, NULL, NULL, :em)", { d: a.uid, em: x.m.relogio.agora })
  x.rele.limpar()
  assert.equal(ins.um('SELECT COUNT(*) AS n FROM notificacoes WHERE dest = :d', { d: a.uid }).n, 500)
  assert.equal(ins.um('SELECT MIN(seq) AS m FROM notificacoes WHERE dest = :d', { d: a.uid }).m, 21, 'the 500 newest stay')
  ins.executar("INSERT INTO notificacoes (dest, tipo, origem, objeto, comunidade, pagina, em) VALUES (:d, 'recado', NULL, NULL, NULL, NULL, :em)", { d: a.uid, em: x.m.relogio.agora - TIMES.notificationRetentionS - 1 })
  ins.executar("INSERT INTO notificacoes (dest, tipo, origem, objeto, comunidade, pagina, em) VALUES (:d, 'recado', NULL, NULL, NULL, NULL, :em)", { d: a.uid, em: x.m.relogio.agora - TIMES.notificationRetentionS + 10 })
  x.rele.limpar()
  const old = ins.todos('SELECT em FROM notificacoes WHERE dest = :d AND em < :corte', { d: a.uid, corte: x.m.relogio.agora - TIMES.notificationRetentionS })
  assert.equal(old.length, 0)
  assert.equal(ins.um('SELECT COUNT(*) AS n FROM notificacoes WHERE dest = :d AND em = :em', { d: a.uid, em: x.m.relogio.agora - TIMES.notificationRetentionS + 10 }).n, 1, 'the one from 89 days stays')
})

test('when the rover leaves the network, its notifications disappear and the ones it caused lose the origin', () => {
  const x = fresh()
  const [a, b] = [x.rover(), x.rover()]
  x.ok(b, 'recado', { alvo: a.uid, texto: 'oi' })
  x.ok(a, 'recado', { alvo: b.uid, texto: 'olá' })
  x.ok(b, 'remocao-pelo-autor', { alvo: x.rele.perfil(b.uid).perfil.id })
  const n = list(x, a).itens.find((i) => i.tipo === 'recado')
  assert.equal(n.origem, null, 'whoever left does not appear as the origin')
  assert.equal(x.m.store.um('SELECT COUNT(*) AS n FROM notificacoes WHERE dest = :d', { d: b.uid }).n, 0)
})

test('the notification of an object the rover can no longer read brings objeto: null', () => {
  const x = fresh()
  const [a, b] = [x.rover(), x.rover()]
  const rec = x.ok(b, 'recado', { alvo: a.uid, texto: 'oi' })
  assert.equal(list(x, a).itens[0].objeto, rec.id)
  x.ok(b, 'remocao-pelo-autor', { alvo: rec.id })
  assert.equal(list(x, a).itens[0].objeto, null)
})

test('retention at the exact limits: 500 stay, at the 501st the oldest leaves; exactly 90 days stay, 90 days and 1 second leave', () => {
  const x = fresh()
  const a = x.rover()
  const b = x.rover()
  const ins = x.m.store
  const now = x.m.relogio.agora
  const puts = (dest, at) => ins.executar("INSERT INTO notificacoes (dest, tipo, origem, objeto, comunidade, pagina, em) VALUES (:d, 'recado', NULL, NULL, NULL, NULL, :em)", { d: dest, em: at })
  for (let i = 0; i < 500; i++) puts(a.uid, now)
  x.rele.limpar()
  assert.equal(ins.um('SELECT COUNT(*) AS n FROM notificacoes WHERE dest = :d', { d: a.uid }).n, 500, 'exactly 500 stay')
  puts(a.uid, now)
  x.rele.limpar()
  assert.equal(ins.um('SELECT COUNT(*) AS n FROM notificacoes WHERE dest = :d', { d: a.uid }).n, 500)
  assert.equal(ins.um('SELECT MIN(seq) AS m FROM notificacoes WHERE dest = :d', { d: a.uid }).m, 2, 'the first one left')
  puts(b.uid, now - TIMES.notificationRetentionS)
  puts(b.uid, now - TIMES.notificationRetentionS - 1)
  x.rele.limpar()
  assert.deepEqual(ins.todos('SELECT em FROM notificacoes WHERE dest = :d', { d: b.uid }).map((l) => now - l.em), [TIMES.notificationRetentionS], 'exactly 90 days stay')
  assert.equal(ins.um('SELECT COUNT(*) AS n FROM notificacoes WHERE dest = :d', { d: a.uid }).n, 500, 'the cap of one rover does not affect the other')
})

test('whoever was blocked by the relay gets no notice, and the page and community notification only shows what still exists', () => {
  const x = fresh()
  const [a, b, c] = [x.rover(), x.rover(), x.rover()]
  x.rele.bloquear({ tipo: 'rover', alvo: a.uid, motivo: 'teste' })
  x.ok(b, 'postagem', { texto: `oi @${a.handle}`, topicos: [] })
  assert.equal(x.m.store.um('SELECT COUNT(*) AS n FROM notificacoes WHERE dest = :d', { d: a.uid }).n, 0)
  const page = x.ok(c, 'pagina-criar', { nome: 'Página que some', descricao: '', tema: 'rovers' }).id
  x.ok(b, 'pagina-seguir', { pagina: page, acao: 'seguir' })
  assert.equal(list(x, c).itens[0].pagina, page)
  x.ok(c, 'remocao-pelo-autor', { alvo: page })
  assert.equal(list(x, c).itens[0].pagina, null, 'the closed page does not appear')
  const using = x.comunidade(c)
  x.gestao(c, using, b, 'convidar')
  assert.equal(list(x, b).itens[0].comunidade, using, 'the invitee sees the community of the invitation, even without being a member')
  x.ok(c, 'comunidade-posse', { comunidade: using, acao: 'encerrar', novoDono: null })
  assert.equal(list(x, b).itens[0].comunidade, null, 'a closed community does not appear')
})

test('a pending testimonial only appears in the notification for the owner and for the author', () => {
  const x = fresh()
  const [owner, author] = [x.rover(), x.rover()]
  x.amigos(owner, author, 4)
  const d = x.ok(author, 'depoimento', { alvo: owner.uid, texto: 'um depoimento' })
  assert.equal(list(x, owner).itens[0].objeto, d.id, 'the owner sees the pending one')
  x.ok(owner, 'depoimento-decisao', { depoimento: d.id, decisao: 'aceitar' })
  assert.equal(list(x, author).itens[0].objeto, d.id, 'accepted, the author sees it')
  x.ok(owner, 'depoimento-decisao', { depoimento: d.id, decisao: 'recusar' })
  assert.equal(list(x, author).itens[0].objeto, d.id, 'declined, the author still sees it (it is theirs)')
  assert.equal(list(x, owner).itens.find((n) => n.tipo === 'depoimento-para-aceitar').objeto, d.id)
})

test('mention in a community: whoever cannot read the community is not notified, whoever can is; a community that does not exist notifies nobody', () => {
  const x = fresh()
  const [owner, member, outside] = [x.rover(), x.rover(), x.rover()]
  const c = x.comunidade(owner, { acesso: 'fechada', nome: 'Fechada de menção' })
  x.gestao(owner, c, member, 'convidar')
  x.ok(member, 'comunidade-adesao', { comunidade: c, acao: 'aceitar-convite' })
  x.advance(3601)
  x.topico(owner, c, { titulo: 'Tópico com menções', texto: `olá @${member.handle} e @${outside.handle}` })
  assert.equal(list(x, member).itens.some((n) => n.tipo === 'mencao'), true)
  assert.equal(list(x, outside).itens.some((n) => n.tipo === 'mencao'), false)
  assert.equal(x.s.mencoes(`@${outside.handle}`, { origem: owner.uid, objeto: null, comunidade: `ob_${'A'.repeat(43)}` }, x.m.relogio.agora), undefined)
  assert.equal(list(x, outside).itens.length, 0)
})

test('stranger mention window: those exactly 1 hour ago do not count, those at 59 minutes and 59 seconds do', () => {
  const x = fresh()
  const target = x.rover({ handle: 'alvo.da.janela' })
  const now = x.m.relogio.agora
  const puts = (at) => x.m.store.executar("INSERT INTO notificacoes (dest, tipo, origem, objeto, comunidade, pagina, em) VALUES (:d, 'mencao', NULL, NULL, NULL, NULL, :em)", { d: target.uid, em: at })
  for (let i = 0; i < 20; i++) puts(now - 3600)
  x.ok(x.rover(), 'postagem', { texto: 'oi @alvo.da.janela primeira', topicos: [] })
  assert.equal(x.m.store.um("SELECT COUNT(*) AS n FROM notificacoes WHERE dest = :d AND em = :em", { d: target.uid, em: now }).n, 1, 'those at exactly 1h do not count')
  for (let i = 0; i < 18; i++) puts(now - 3599)
  x.ok(x.rover(), 'postagem', { texto: 'oi @alvo.da.janela segunda', topicos: [] })
  assert.equal(x.m.store.um("SELECT COUNT(*) AS n FROM notificacoes WHERE dest = :d AND em = :em", { d: target.uid, em: now }).n, 2, 'there were 19 recent ones (1 + 18): the 20th gets in')
  x.ok(x.rover(), 'postagem', { texto: 'oi @alvo.da.janela terceira', topicos: [] })
  assert.equal(x.m.store.um("SELECT COUNT(*) AS n FROM notificacoes WHERE dest = :d AND em = :em", { d: target.uid, em: now }).n, 2, 'with 20 recent ones, the next does not get in')
})

test('notification list: 20 per page by default, proximo only when there is more, and the object of an action, nonexistent or someone else, comes null', () => {
  const x = fresh()
  const [a, b, c] = [x.rover(), x.rover(), x.rover()]
  const now = x.m.relogio.agora
  for (let i = 0; i < 22; i++) x.m.store.executar("INSERT INTO notificacoes (dest, tipo, origem, objeto, comunidade, pagina, em) VALUES (:d, 'recado', NULL, NULL, NULL, NULL, :em)", { d: a.uid, em: now })
  const p = x.s.listar(a.uid, {}, now)
  assert.equal(p.itens.length, 20, 'default of 20')
  assert.equal(p.proximo, p.itens[19].seq)
  assert.equal(x.s.listar(a.uid, { limite: 22 }, now).proximo, null, 'exactly what there is: no next page')
  assert.equal(x.s.listar(a.uid, { limite: 21 }, now).proximo !== null, true)
  assert.equal(x.s.listar(a.uid, { limite: 21 }, now).itens.length, 21)
  // objects
  x.ok(b, 'amizade', { alvo: c.uid, acao: 'pedir' })
  assert.equal(x.s.listar(c.uid, { limite: 5 }, now).itens[0].objeto, null, 'an action has no envelope: objeto null')
  x.m.store.executar("INSERT INTO notificacoes (dest, tipo, origem, objeto, comunidade, pagina, em) VALUES (:d, 'recado', NULL, :o, NULL, NULL, :em)", { d: c.uid, o: `ob_${'N'.repeat(43)}`, em: now })
  assert.equal(x.s.listar(c.uid, { limite: 1 }, now).itens[0].objeto, null, 'an object that does not exist')
  // pending testimonial: only the owner and the author see it
  x.amigos(a, b, 4)
  const d = x.ok(b, 'depoimento', { alvo: a.uid, texto: 'um depoimento' })
  const to = (dest) => {
    x.m.store.executar("INSERT INTO notificacoes (dest, tipo, origem, objeto, comunidade, pagina, em) VALUES (:d, 'recado', NULL, :o, NULL, NULL, :em)", { d: dest.uid, o: d.id, em: now })
    return x.s.listar(dest.uid, { limite: 1 }, now).itens[0].objeto
  }
  assert.equal(to(a), d.id)
  assert.equal(to(b), d.id)
  assert.equal(to(c), null, 'a third party does not see the pending one')
  x.ok(a, 'depoimento-decisao', { depoimento: d.id, decisao: 'aceitar' })
  assert.equal(to(c), d.id, 'accepted, it is public')
})
