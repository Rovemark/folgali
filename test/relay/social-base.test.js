// SPDX-License-Identifier: AGPL-3.0-or-later
// The helpers of the social layer that all routes use: who is visible, account age, roles and the friendship pair.
import test from 'node:test'
import assert from 'node:assert/strict'
import { ROLES, pairOf } from '../../packages/relay/src/social-base.js'
import { codeOf, fresh } from '../helpers/network.js'

test('the friendship pair is the same in both directions and tells different pairs apart', () => {
  assert.equal(pairOf('rvr_a', 'rvr_b'), 'rvr_a|rvr_b')
  assert.equal(pairOf('rvr_b', 'rvr_a'), 'rvr_a|rvr_b')
  assert.notEqual(pairOf('rvr_a', 'rvr_b'), pairOf('rvr_a', 'rvr_c'))
})

test('roles in order: member below moderator below owner', () => {
  const order = (p) => ROLES.indexOf(p)
  assert.ok(order('membro') >= 0)
  assert.ok(order('membro') < order('moderador'))
  assert.ok(order('moderador') < order('dono'))
  assert.equal(ROLES.length, 3)
})

test('summary: a known rover brings handle, name and portrait; an unknown rover and one that left come with nothing, only the uid', () => {
  const x = fresh()
  const a = x.rover({ handle: 'resumo.ana', perfil: { retrato: { corpo: 'redondo', cor: 'azul', veste: null, acessorio: null } } })
  assert.deepEqual(x.s.resumo(a.uid), { uid: a.uid, handle: 'resumo.ana', nome: 'Pipa', retrato: { corpo: 'redondo', cor: 'azul', veste: null, acessorio: null }, especie: 'rover' })
  const withoutPortrait = x.rover()
  assert.equal(x.s.resumo(withoutPortrait.uid).retrato, null)
  const unknown = `rvr_${'Z'.repeat(22)}`
  assert.deepEqual(x.s.resumo(unknown), { uid: unknown, handle: null, nome: null, retrato: null, especie: null })
  x.ok(a, 'remocao-pelo-autor', { alvo: x.rele.perfil(a.uid).perfil.id })
  assert.deepEqual(x.s.resumo(a.uid), { uid: a.uid, handle: null, nome: null, retrato: null, especie: null })
})

test('account age: seconds since the first object seen; unknown account is 0; a late clock gives no negative age', () => {
  const x = fresh({ novatos: true })
  const a = x.rover({ newcomer: true })
  const now = x.m.relogio.agora
  assert.equal(x.s.accountAge(a.uid, now), 0)
  assert.equal(x.s.accountAge(a.uid, now + 100), 100)
  assert.equal(x.s.accountAge(a.uid, now - 50), 0, 'never negative')
  assert.equal(x.s.accountAge(`rvr_${'Z'.repeat(22)}`, now), 0)
})

test('exigirRover and exigirPapel: what does not exist or cannot be seen is 404; whoever is not part of a public community is "nao_e_membro"', () => {
  const x = fresh()
  const [owner, member, outside] = [x.rover(), x.rover(), x.rover()]
  const c = x.comunidade(owner)
  x.entra(member, c, { wait: false })
  const f = x.comunidade(owner, { acesso: 'fechada', nome: 'Fechada de base' })
  const now = x.m.relogio.agora
  assert.equal(x.s.requireRover(owner.uid, now).uid, owner.uid)
  assert.equal(codeOf(() => x.s.requireRover(`rvr_${'Z'.repeat(22)}`, now)), 'alvo_desconhecido')
  assert.equal(x.s.requireRole(c, member.uid, 'membro').papel, 'membro')
  assert.equal(x.s.requireRole(c, owner.uid, 'dono').papel, 'dono')
  assert.equal(codeOf(() => x.s.requireRole(c, member.uid, 'moderador')), 'sem_permissao')
  assert.equal(codeOf(() => x.s.requireRole(c, member.uid, 'dono')), 'sem_permissao')
  assert.equal(codeOf(() => x.s.requireRole(c, outside.uid, 'membro')), 'nao_e_membro')
  assert.equal(codeOf(() => x.s.requireRole(f, outside.uid, 'membro')), 'nao_encontrado')
  assert.equal(codeOf(() => x.s.requireRole(`ob_${'A'.repeat(43)}`, outside.uid, 'membro')), 'nao_encontrado')
  x.gestao(owner, c, outside, 'banir', 'spam')
  assert.equal(codeOf(() => x.s.requireRole(c, outside.uid, 'membro')), 'banido')
})

test('responsible people: the owner and up to 20 moderators, owner first', () => {
  const x = fresh()
  const owner = x.rover()
  const c = x.comunidade(owner)
  const mods = Array.from({ length: 22 }, () => x.rover())
  for (const m of mods) { x.m.store.executar("INSERT INTO membros (comunidade, uid, papel, desde) VALUES (:c, :u, 'moderador', :d)", { c, u: m.uid, d: x.m.relogio.agora + 1 }) }
  x.m.store.executar("INSERT INTO membros (comunidade, uid, papel, desde) VALUES (:c, :u, 'membro', 1)", { c, u: `rvr_${'q'.repeat(22)}` })
  const r = x.s.responsible(c)
  assert.equal(r.length, 21, 'the owner plus 20 moderators')
  assert.equal(r[0], owner.uid)
  assert.ok(!r.includes(`rvr_${'q'.repeat(22)}`), 'a regular member is not responsible')
  assert.deepEqual(x.s.responsible(`ob_${'A'.repeat(43)}`), [])
})

test('role on a page: owner, admin or nobody; without a uid there is no role', () => {
  const x = fresh()
  const [owner, admin, other] = [x.rover(), x.rover(), x.rover()]
  const p = x.ok(owner, 'pagina-criar', { nome: 'Página de base', descricao: '', tema: 'rovers' }).id
  x.ok(owner, 'pagina-gestao', { pagina: p, alvo: admin.uid, acao: 'adicionar-admin' })
  assert.equal(x.s.roleOnPage(p, owner.uid), 'dono')
  assert.equal(x.s.roleOnPage(p, admin.uid), 'administrador')
  assert.equal(x.s.roleOnPage(p, other.uid), null)
  assert.equal(x.s.roleOnPage(p, null), null)
  assert.equal(x.s.papel(`ob_${'A'.repeat(43)}`, null), null)
  assert.equal(x.s.convidado(p, null), false)
})

test('comunidadeDoCtx: finds the community by its id, by the id of one of its topics, and is null for everything else', () => {
  const x = fresh()
  const owner = x.rover()
  const c = x.comunidade(owner)
  const t = x.topico(owner, c)
  assert.equal(x.s.ctxCommunity(c), c)
  assert.equal(x.s.ctxCommunity(t), c)
  assert.equal(x.s.ctxCommunity(null), null)
  assert.equal(x.s.ctxCommunity(owner.uid), null)
  assert.equal(x.s.ctxCommunity(`ob_${'A'.repeat(43)}`), null)
})

test('community and page: an id that is not text is null; closed or blocked by the relay too', () => {
  const x = fresh()
  const owner = x.rover()
  const c = x.comunidade(owner)
  const p = x.ok(owner, 'pagina-criar', { nome: 'Página dois', descricao: '', tema: 'rovers' }).id
  assert.equal(x.s.comunidade(undefined), null)
  assert.equal(x.s.comunidade(5), null)
  assert.equal(x.s.pagina(undefined), null)
  assert.equal(x.s.topico(undefined), null)
  assert.equal(x.s.comunidade(c).id, c)
  x.rele.bloquear({ tipo: 'objeto', alvo: c, motivo: 'teste' })
  x.rele.bloquear({ tipo: 'objeto', alvo: p, motivo: 'teste' })
  assert.equal(x.s.comunidade(c), null)
  assert.equal(x.s.pagina(p), null)
})

test('readable topic: the operator blocking the topic or its author takes it down, each on its own; deleted becomes 410 only for those who read the community', () => {
  const x = fresh()
  const [owner, author, reader] = [x.rover(), x.rover(), x.rover()]
  const c = x.comunidade(owner)
  x.entra(author, c)
  const t1 = x.topico(author, c, { titulo: 'Um tópico' })
  const t2 = x.topico(owner, c, { titulo: 'Outro tópico' })
  const now = x.m.relogio.agora
  assert.equal(x.s.topicReadable(t1, null, now).t.id, t1)
  x.rele.bloquear({ tipo: 'objeto', alvo: t2, motivo: 'teste' })
  assert.equal(codeOf(() => x.s.topicReadable(t2, null, now)), 'nao_encontrado', 'only the blocked topic')
  assert.equal(x.s.topicReadable(t1, null, now).t.id, t1)
  x.rele.bloquear({ tipo: 'rover', alvo: author.uid, motivo: 'teste' })
  assert.equal(codeOf(() => x.s.topicReadable(t1, null, now)), 'nao_encontrado', 'only the blocked author')
  assert.equal(codeOf(() => x.s.topicReadable(`ob_${'A'.repeat(43)}`, reader.uid, now)), 'nao_encontrado')
})

test('readable space: a reply to a deleted, hidden or blocked topic is not readable; the topic itself is', () => {
  const x = fresh()
  const [owner, author] = [x.rover(), x.rover()]
  const c = x.comunidade(owner)
  x.entra(author, c)
  const mk = (title) => { const t = x.topico(author, c, { titulo: title }); const r = x.replies(owner, t, 'resposta'); return { t, r, linha: x.m.store.objeto(r), timelineT: x.m.store.objeto(t) } }
  const ok = mk('Tópico vivo')
  assert.equal(x.s.readableSpace(ok.linha, null), true)
  assert.equal(x.s.readableSpace(ok.timelineT, null), true, 'the topic ctx is the community: it is enough for it to be open')
  const deleted = mk('Tópico apagado')
  x.ok(author, 'remocao-pelo-autor', { alvo: deleted.t })
  assert.equal(x.s.readableSpace(x.m.store.objeto(deleted.r), null), false, 'deleted topic')
  const hidden = mk('Tópico escondido')
  x.ok(owner, 'remocao-por-responsavel', { alvo: hidden.t, motivo: 'spam' })
  assert.equal(x.s.readableSpace(x.m.store.objeto(hidden.r), null), false, 'topic hidden by a responsible person')
  const blocked = mk('Tópico bloqueado')
  x.rele.bloquear({ tipo: 'objeto', alvo: blocked.t, motivo: 'teste' })
  assert.equal(x.s.readableSpace(x.m.store.objeto(blocked.r), null), false, 'topic blocked by the relay')
})

test('readable space: a closed page is not readable, and a page update only counts while the page is alive', () => {
  const x = fresh()
  const owner = x.rover()
  const p = x.ok(owner, 'pagina-criar', { nome: 'Página legível', descricao: '', tema: 'rovers' }).id
  const u = x.ok(owner, 'pagina-publicar', { pagina: p, texto: 'atualização', tags: [] })
  assert.equal(x.s.readableSpace(x.m.store.objeto(u.id), null), true)
  x.rele.bloquear({ tipo: 'objeto', alvo: p, motivo: 'teste' })
  assert.equal(x.s.readableSpace(x.m.store.objeto(u.id), null), false)
})

test('readable space: a community content stays readable after its creator left the network (ownership passed on)', () => {
  const x = fresh()
  const [owner, heir] = [x.rover(), x.rover()]
  const c = x.comunidade(owner)
  x.entra(heir, c)
  const t = x.topico(heir, c, { titulo: 'Fica depois da saída' })
  x.ok(owner, 'remocao-pelo-autor', { alvo: x.rele.perfil(owner.uid).perfil.id })
  assert.equal(x.m.store.objeto(c).removido_em !== null, true, 'the creation object was deleted along with the profile of the creator')
  assert.equal(x.s.readableSpace(x.m.store.objeto(t), null), true)
  assert.equal(x.s.topicDetail(t, {}).titulo, 'Fica depois da saída')
})
