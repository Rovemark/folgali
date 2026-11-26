// SPDX-License-Identifier: AGPL-3.0-or-later
// Communities: create, access, roles, invitations, expulsion and ban, ownership, and what each reader sees.
import test from 'node:test'
import assert from 'node:assert/strict'
import { STRUCTURE, RAID } from '../../packages/protocol/src/index.js'
import { DAY, codeOf, errorOf, fresh } from '../helpers/network.js'

const base = () => {
  const x = fresh()
  const owner = x.rover()
  const [m1, m2, m3] = [x.rover(), x.rover(), x.rover()]
  return Object.assign(x, { dono: owner, m1, m2, m3 })
}
const notices = (x, r) => x.s.listar(r.uid, { limite: 50 }, x.m.relogio.agora).itens.map((n) => n.tipo)

// ---------- criar ----------

test('create community: the creator becomes owner and first member; the id is the object id; it shows up in the list and on reading', () => {
  const x = base()
  const c = x.ok(x.dono, 'comunidade-criar', { nome: 'Planilhas e prazos', descricao: 'Troca de ideias', regras: 'Sem spam.', tema: 'produtividade', acesso: 'aberta', categorias: ['Dúvidas', 'Dicas'] })
  assert.equal(x.s.papel(c.id, x.dono.uid), 'dono')
  const d = x.s.communityDetail(c.id, {})
  assert.equal(d.id, c.id)
  assert.equal(d.nome, 'Planilhas e prazos')
  assert.equal(d.regras, 'Sem spam.')
  assert.deepEqual(d.categorias, ['Dúvidas', 'Dicas'])
  assert.equal(d.membros, 1)
  assert.equal(d.dono.uid, x.dono.uid)
  assert.equal(d.envelope.objeto.id, c.id)
  assert.equal(d.voce, null)
  assert.deepEqual(x.s.listedCommunities({}).itens.map((i) => i.id), [c.id])
  assert.equal(x.s.communityDetail(c.id, { credencial: x.como(x.dono) }).voce.papel, 'dono')
  assert.deepEqual(x.s.comunidadesDoRover(x.dono.uid, {}).itens.map((i) => [i.comunidade.id, i.papel]), [[c.id, 'dono']])
})

test('unique name among the listed ones (case, accents and punctuation do not distinguish); a closed one does not reserve a name', () => {
  const x = base()
  x.comunidade(x.dono, { nome: 'Café & Código' })
  assert.equal(x.code(x.m1, 'comunidade-criar', { nome: 'cafe codigo', descricao: '', regras: '', tema: 'rovers', acesso: 'moderada', categorias: [] }), 'ja_existe')
  assert.equal(x.does(x.m1, 'comunidade-criar', { nome: 'cafe codigo', descricao: '', regras: '', tema: 'rovers', acesso: 'fechada', categorias: [] }).estado, 'aceito', 'the closed one does not collide')
  assert.equal(x.does(x.m2, 'comunidade-criar', { nome: 'Café & Código Dois', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] }).estado, 'aceito')
  x.comunidade(x.m3, { nome: 'Segredo', acesso: 'fechada' })
  assert.equal(x.does(x.m2, 'comunidade-criar', { nome: 'Segredo', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] }).estado, 'aceito', 'the name of a closed one is neither reserved nor revealed')
})

test('create: an account under 1 day old is "conta_nova"; at most 10 communities as owner', () => {
  const y = fresh({ novatos: true })
  const newValue = y.rover({ newcomer: true })
  const e = errorOf(() => y.ok(newValue, 'comunidade-criar', { nome: 'Minha', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] }))
  assert.equal(e.codigo, 'conta_nova')
  assert.equal(e.retryAfterS, DAY)
  y.advance(DAY)
  assert.equal(y.does(newValue, 'comunidade-criar', { nome: 'Minha', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] }).estado, 'aceito')
  const x = fresh()
  const a = x.rover()
  for (let i = 0; i < STRUCTURE.communitiesAsOwner; i++) {
    x.ok(a, 'comunidade-criar', { nome: `Comunidade número ${i}`, descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] })
    x.advance(3600 * 8)
  }
  assert.equal(x.code(a, 'comunidade-criar', { nome: 'A de número onze', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] }), 'limite_de_estrutura')
})

test('create requires human approval on every use and never goes through permanent authorization', () => {
  const x = base()
  assert.equal(x.code(x.dono, 'comunidade-criar', { nome: 'Sem aprovação', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] }, { aprovada: false }), 'sem_aprovacao')
})

// ---------- access and joining ----------

test('open: joining makes a member at once; joining again is "ja_existe"; leaving undoes it; the owner cannot leave', () => {
  const x = base()
  const c = x.comunidade(x.dono)
  assert.equal(x.ok(x.m1, 'comunidade-adesao', { comunidade: c, acao: 'entrar' }).resultado, 'membro')
  assert.equal(x.s.papel(c, x.m1.uid), 'membro')
  assert.equal(x.code(x.m1, 'comunidade-adesao', { comunidade: c, acao: 'entrar' }), 'ja_existe')
  assert.equal(x.ok(x.m1, 'comunidade-adesao', { comunidade: c, acao: 'sair' }).resultado, 'fora')
  assert.equal(x.s.papel(c, x.m1.uid), null)
  assert.equal(x.code(x.m1, 'comunidade-adesao', { comunidade: c, acao: 'sair' }), 'nao_e_membro')
  assert.equal(x.code(x.dono, 'comunidade-adesao', { comunidade: c, acao: 'sair' }), 'sem_permissao')
  assert.equal(x.code(x.m1, 'comunidade-adesao', { comunidade: `ob_${'A'.repeat(43)}`, acao: 'entrar' }), 'nao_encontrado')
})

test('moderated: joining is a request; the moderator approves or refuses; the request can be cancelled; notices go out', () => {
  const x = base()
  const c = x.comunidade(x.dono, { acesso: 'moderada' })
  assert.equal(x.ok(x.m1, 'comunidade-adesao', { comunidade: c, acao: 'entrar' }).resultado, 'pendente')
  assert.equal(x.s.papel(c, x.m1.uid), null)
  assert.equal(x.code(x.m1, 'comunidade-adesao', { comunidade: c, acao: 'entrar' }), 'ja_existe')
  assert.deepEqual(notices(x, x.dono), ['pedido-de-entrada'])
  assert.deepEqual(x.s.pedidosDe(c, { credencial: x.como(x.dono) }).itens.map((i) => i.rover.uid), [x.m1.uid])
  assert.equal(x.gestao(x.dono, c, x.m1, 'aprovar-pedido').resultado, 'membro')
  assert.equal(x.s.papel(c, x.m1.uid), 'membro')
  assert.deepEqual(notices(x, x.m1), ['entrada-aprovada'])
  x.ok(x.m2, 'comunidade-adesao', { comunidade: c, acao: 'entrar' })
  assert.equal(x.gestao(x.dono, c, x.m2, 'recusar-pedido').resultado, 'fora')
  assert.equal(x.s.papel(c, x.m2.uid), null)
  x.ok(x.m3, 'comunidade-adesao', { comunidade: c, acao: 'entrar' })
  assert.equal(x.ok(x.m3, 'comunidade-adesao', { comunidade: c, acao: 'cancelar-pedido' }).resultado, 'fora')
  assert.equal(x.code(x.m3, 'comunidade-adesao', { comunidade: c, acao: 'cancelar-pedido' }), 'nao_encontrado')
  assert.equal(x.code(x.dono, 'comunidade-gestao', { comunidade: c, alvo: x.m3.uid, acao: 'aprovar-pedido', motivo: null }), 'nao_encontrado')
})

test('closed: nobody joins without an invitation (404, as if it did not exist); with an invitation, accepting joins; refusing does not', () => {
  const x = base()
  const c = x.comunidade(x.dono, { acesso: 'fechada' })
  assert.equal(x.code(x.m1, 'comunidade-adesao', { comunidade: c, acao: 'entrar' }), 'nao_encontrado')
  assert.equal(x.code(x.m1, 'comunidade-adesao', { comunidade: c, acao: 'aceitar-convite' }), 'nao_encontrado')
  assert.equal(x.gestao(x.dono, c, x.m1, 'convidar').estado, 'aceito')
  assert.deepEqual(notices(x, x.m1), ['convite-comunidade'])
  assert.deepEqual(x.s.roverInvites(x.m1.uid, x.como(x.m1)).itens.map((i) => [i.comunidade.id, i.comunidade.nome, i.por.uid]), [[c, x.s.comunidade(c).nome, x.dono.uid]])
  assert.equal(x.ok(x.m1, 'comunidade-adesao', { comunidade: c, acao: 'aceitar-convite' }).resultado, 'membro')
  assert.equal(x.s.papel(c, x.m1.uid), 'membro')
  assert.equal(x.code(x.m1, 'comunidade-adesao', { comunidade: c, acao: 'aceitar-convite' }), 'nao_encontrado', 'the invitation was used up')
  x.gestao(x.dono, c, x.m2, 'convidar')
  assert.equal(x.ok(x.m2, 'comunidade-adesao', { comunidade: c, acao: 'recusar-convite' }).resultado, 'fora')
  assert.equal(x.s.papel(c, x.m2.uid), null)
  assert.equal(x.code(x.m2, 'comunidade-adesao', { comunidade: c, acao: 'recusar-convite' }), 'nao_encontrado')
})

test('invite: moderator and owner only; cannot invite a member, a banned user or someone who already has an invitation; cancel-invitation; caps', () => {
  const x = base()
  const c = x.comunidade(x.dono, { acesso: 'moderada' })
  x.entra(x.m1, c, { wait: false }) // pedido
  x.gestao(x.dono, c, x.m1, 'aprovar-pedido')
  assert.equal(x.code(x.m1, 'comunidade-gestao', { comunidade: c, alvo: x.m2.uid, acao: 'convidar', motivo: null }), 'sem_permissao', 'a regular member cannot invite')
  assert.equal(x.code(x.m2, 'comunidade-gestao', { comunidade: c, alvo: x.m3.uid, acao: 'convidar', motivo: null }), 'nao_e_membro', 'someone who is not a member of a public community does not act')
  assert.equal(x.code(x.dono, 'comunidade-gestao', { comunidade: c, alvo: x.m1.uid, acao: 'convidar', motivo: null }), 'ja_existe', 'already a member')
  x.gestao(x.dono, c, x.m2, 'convidar')
  assert.equal(x.code(x.dono, 'comunidade-gestao', { comunidade: c, alvo: x.m2.uid, acao: 'convidar', motivo: null }), 'ja_existe', 'repeated invite')
  x.gestao(x.dono, c, x.m2, 'cancelar-convite')
  assert.equal(x.code(x.dono, 'comunidade-gestao', { comunidade: c, alvo: x.m2.uid, acao: 'cancelar-convite', motivo: null }), 'nao_encontrado')
  x.gestao(x.dono, c, x.m3, 'banir', 'spam')
  assert.equal(x.code(x.dono, 'comunidade-gestao', { comunidade: c, alvo: x.m3.uid, acao: 'convidar', motivo: null }), 'banido')
  const y = base()
  const cy = y.comunidade(y.dono)
  for (let i = 0; i < STRUCTURE.invitesPerCommunity; i++) y.m.store.executar('INSERT INTO convites (comunidade, uid, por, em) VALUES (:c, :u, :p, 1)', { c: cy, u: `rvr_${String(i).padStart(22, 'c')}`, p: y.dono.uid })
  assert.equal(y.code(y.dono, 'comunidade-gestao', { comunidade: cy, alvo: y.m1.uid, acao: 'convidar', motivo: null }), 'limite_de_estrutura', '100 per community')
  const z = base()
  const cz = z.comunidade(z.dono)
  for (let i = 0; i < STRUCTURE.receivedInvites; i++) z.m.store.executar('INSERT INTO convites (comunidade, uid, por, em) VALUES (:c, :u, :p, 1)', { c: `ob_${String(i).padStart(43, 'k')}`, u: z.m1.uid, p: z.dono.uid })
  assert.equal(z.code(z.dono, 'comunidade-gestao', { comunidade: cz, alvo: z.m1.uid, acao: 'convidar', motivo: null }), 'limite_de_estrutura', '50 per invitee')
})

test('anti-raid mode: past 30 joins in the last hour, joining an open community becomes a request', () => {
  const x = fresh()
  const owner = x.rover()
  const c = x.comunidade(owner)
  for (let i = 0; i < RAID.joinsPerHour; i++) assert.equal(x.ok(x.rover(), 'comunidade-adesao', { comunidade: c, acao: 'entrar' }).resultado, 'membro', `entrada ${i + 1}`)
  const late = x.rover()
  assert.equal(x.ok(late, 'comunidade-adesao', { comunidade: c, acao: 'entrar' }).resultado, 'pendente', 'the 31st waits for approval')
  assert.equal(x.s.papel(c, late.uid), null)
  assert.deepEqual(notices(x, owner), ['pedido-de-entrada'])
  x.advance(3601)
  assert.equal(x.ok(x.rover(), 'comunidade-adesao', { comunidade: c, acao: 'entrar' }).resultado, 'membro', 'after the hour, back to normal')
  assert.equal(x.gestao(owner, c, late, 'aprovar-pedido').resultado, 'membro')
})

test('participation limits: 200 communities per rover, 20 pending requests per rover, 500 per community', () => {
  const x = base()
  const c = x.comunidade(x.dono)
  for (let i = 0; i < STRUCTURE.communitiesAsMember; i++) x.m.store.executar("INSERT INTO membros (comunidade, uid, papel, desde) VALUES (:c, :u, 'membro', 1)", { c: `ob_${String(i).padStart(43, 'm')}`, u: x.m1.uid })
  assert.equal(x.code(x.m1, 'comunidade-adesao', { comunidade: c, acao: 'entrar' }), 'limite_de_estrutura')
  assert.equal(x.code(x.m1, 'comunidade-criar', { nome: 'Mais uma', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] }), 'limite_de_estrutura')
  const y = base()
  const cm = y.comunidade(y.dono, { acesso: 'moderada' })
  for (let i = 0; i < STRUCTURE.joinRequestsPerRover; i++) y.m.store.executar('INSERT INTO pedidos_de_entrada (comunidade, uid, em) VALUES (:c, :u, 1)', { c: `ob_${String(i).padStart(43, 'p')}`, u: y.m1.uid })
  assert.equal(y.code(y.m1, 'comunidade-adesao', { comunidade: cm, acao: 'entrar' }), 'limite_de_estrutura')
  for (let i = 0; i < STRUCTURE.joinRequestsPerCommunity; i++) y.m.store.executar('INSERT INTO pedidos_de_entrada (comunidade, uid, em) VALUES (:c, :u, 1)', { c: cm, u: `rvr_${String(i).padStart(22, 'p')}` })
  assert.equal(y.code(y.m2, 'comunidade-adesao', { comunidade: cm, acao: 'entrar' }), 'limite_de_estrutura')
})

// ---------- roles ----------

function withMods() {
  const x = base()
  const c = x.comunidade(x.dono)
  for (const r of [x.m1, x.m2, x.m3]) { x.entra(r, c, { wait: false }); x.advance(1) } // they join at different moments: "the oldest" is well defined
  x.gestao(x.dono, c, x.m1, 'promover')
  x.gestao(x.dono, c, x.m2, 'promover')
  return Object.assign(x, { c, mod1: x.m1, mod2: x.m2, membro: x.m3 })
}

test('promote and demote: owner only; only members; a moderator cannot promote; cap of 10 moderators', () => {
  const x = base()
  const c = x.comunidade(x.dono)
  x.entra(x.m1, c, { wait: false })
  x.entra(x.m2, c, { wait: false })
  assert.equal(x.code(x.dono, 'comunidade-gestao', { comunidade: c, alvo: x.m3.uid, acao: 'promover', motivo: null }), 'nao_encontrado', 'not a member')
  x.gestao(x.dono, c, x.m1, 'promover')
  assert.equal(x.s.papel(c, x.m1.uid), 'moderador')
  assert.equal(x.code(x.dono, 'comunidade-gestao', { comunidade: c, alvo: x.m1.uid, acao: 'promover', motivo: null }), 'ja_existe')
  assert.equal(x.code(x.m1, 'comunidade-gestao', { comunidade: c, alvo: x.m2.uid, acao: 'promover', motivo: null }), 'sem_permissao', 'a moderator cannot promote')
  assert.equal(x.code(x.m1, 'comunidade-gestao', { comunidade: c, alvo: x.m1.uid, acao: 'rebaixar', motivo: null }), 'esquema', 'nobody acts on themselves')
  assert.equal(x.code(x.m1, 'comunidade-gestao', { comunidade: c, alvo: x.dono.uid, acao: 'rebaixar', motivo: null }), 'sem_permissao')
  assert.equal(x.code(x.dono, 'comunidade-gestao', { comunidade: c, alvo: x.m2.uid, acao: 'rebaixar', motivo: null }), 'ja_existe', 'already a regular member')
  x.gestao(x.dono, c, x.m1, 'rebaixar')
  assert.equal(x.s.papel(c, x.m1.uid), 'membro')
  for (let i = 0; i < STRUCTURE.moderatorsPerCommunity; i++) x.m.store.executar("INSERT INTO membros (comunidade, uid, papel, desde) VALUES (:c, :u, 'moderador', 1)", { c, u: `rvr_${String(i).padStart(22, 'd')}` })
  assert.equal(x.code(x.dono, 'comunidade-gestao', { comunidade: c, alvo: x.m2.uid, acao: 'promover', motivo: null }), 'limite_de_estrutura')
})

test('expel: a moderator expels only regular members; the owner expels a moderator; nobody expels the owner; the expelled can return to an open community', () => {
  const x = withMods()
  assert.equal(x.code(x.mod1, 'comunidade-gestao', { comunidade: x.c, alvo: x.mod2.uid, acao: 'expulsar', motivo: 'regras' }), 'sem_permissao', 'a moderator does not expel a moderator')
  assert.equal(x.code(x.mod1, 'comunidade-gestao', { comunidade: x.c, alvo: x.dono.uid, acao: 'expulsar', motivo: 'regras' }), 'sem_permissao')
  assert.equal(x.code(x.membro, 'comunidade-gestao', { comunidade: x.c, alvo: x.mod2.uid, acao: 'expulsar', motivo: 'regras' }), 'sem_permissao', 'regular member')
  assert.equal(x.gestao(x.mod1, x.c, x.membro, 'expulsar', 'fora-do-tema').resultado, 'fora')
  assert.equal(x.s.papel(x.c, x.membro.uid), null)
  assert.deepEqual(notices(x, x.membro).slice(0, 1), ['expulso'])
  assert.equal(x.s.listar(x.membro.uid, { limite: 5 }, x.m.relogio.agora).itens[0].origem, null, 'who expelled does not appear')
  assert.equal(x.gestao(x.dono, x.c, x.mod2, 'expulsar', 'assedio').resultado, 'fora')
  assert.equal(x.code(x.dono, 'comunidade-gestao', { comunidade: x.c, alvo: x.mod2.uid, acao: 'expulsar', motivo: 'spam' }), 'nao_encontrado', 'already left')
  assert.equal(x.ok(x.membro, 'comunidade-adesao', { comunidade: x.c, acao: 'entrar' }).resultado, 'membro', 'an expelled member can come back')
  const reg = x.s.registroDaComunidade(x.c, {}).itens
  assert.deepEqual(reg.map((r) => [r.acao, r.motivo, r.por]), [['expulsao', 'assedio', 'dono'], ['expulsao', 'fora-do-tema', 'moderador']])
  assert.equal(reg[0].alvo.uid, x.mod2.uid)
})

test('ban: removes, prevents returning by any path and goes into the public log with the role of who banned', () => {
  const x = withMods()
  assert.equal(x.code(x.mod1, 'comunidade-gestao', { comunidade: x.c, alvo: x.mod2.uid, acao: 'banir', motivo: 'spam' }), 'sem_permissao', 'a moderator does not ban a moderator')
  assert.equal(x.code(x.mod1, 'comunidade-gestao', { comunidade: x.c, alvo: x.dono.uid, acao: 'banir', motivo: 'spam' }), 'sem_permissao')
  x.gestao(x.mod1, x.c, x.membro, 'banir', 'assedio')
  assert.equal(x.s.papel(x.c, x.membro.uid), null)
  assert.equal(x.code(x.mod1, 'comunidade-gestao', { comunidade: x.c, alvo: x.membro.uid, acao: 'banir', motivo: 'assedio' }), 'ja_existe')
  assert.deepEqual(notices(x, x.membro).slice(0, 1), ['banido'])
  // return by another route: join, request, invitation, accept-invitation
  assert.equal(x.code(x.membro, 'comunidade-adesao', { comunidade: x.c, acao: 'entrar' }), 'banido')
  x.advance(3601) // community creation has an hourly cap
  const moderated = x.comunidade(x.dono, { acesso: 'moderada' })
  x.entra(x.membro, moderated, { wait: false })
  x.gestao(x.dono, moderated, x.membro, 'banir', 'spam')
  assert.equal(x.code(x.membro, 'comunidade-adesao', { comunidade: moderated, acao: 'entrar' }), 'banido', 'request in a moderated community')
  assert.equal(x.m.store.um('SELECT COUNT(*) AS n FROM pedidos_de_entrada WHERE uid = :u', { u: x.membro.uid }).n, 0, 'the ban erased the pending request')
  x.advance(3601)
  const closed = x.comunidade(x.dono, { acesso: 'fechada' })
  x.gestao(x.dono, closed, x.membro, 'convidar')
  x.gestao(x.dono, closed, x.membro, 'banir', 'spam')
  assert.equal(x.m.store.um('SELECT COUNT(*) AS n FROM convites WHERE uid = :u', { u: x.membro.uid }).n, 0, 'the ban erased the invitation')
  assert.equal(x.code(x.membro, 'comunidade-adesao', { comunidade: closed, acao: 'aceitar-convite' }), 'nao_encontrado')
  assert.equal(x.code(x.dono, 'comunidade-gestao', { comunidade: closed, alvo: x.membro.uid, acao: 'convidar', motivo: null }), 'banido')
  assert.deepEqual(x.s.registroDaComunidade(x.c, {}).itens.map((r) => [r.acao, r.motivo, r.por, r.alvo.uid]), [['banimento', 'assedio', 'moderador', x.membro.uid]])
  assert.deepEqual(x.s.banidosDa(x.c, { credencial: x.como(x.mod1) }).itens.map((b) => [b.rover.uid, b.motivo, b.por]), [[x.membro.uid, 'assedio', 'moderador']])
  x.gestao(x.dono, x.c, x.membro, 'desbanir')
  assert.equal(x.ok(x.membro, 'comunidade-adesao', { comunidade: x.c, acao: 'entrar' }).resultado, 'membro')
  assert.equal(x.code(x.dono, 'comunidade-gestao', { comunidade: x.c, alvo: x.m1.uid, acao: 'desbanir', motivo: null }), 'nao_encontrado')
})

test('banning someone who was never a member works (the banned user cannot join), and a banned user does not act in any community that banned them', () => {
  const x = withMods()
  const strange = x.rover()
  x.gestao(x.mod1, x.c, strange, 'banir', 'spam')
  assert.equal(x.code(strange, 'comunidade-adesao', { comunidade: x.c, acao: 'entrar' }), 'banido')
  assert.equal(x.code(strange, 'topico', { comunidade: x.c, categoria: null, titulo: 'Quero postar', texto: 'oi pessoal', tags: [], enquete: null }), 'banido')
})

test('a moderator of one community does not act in another: no role, "nao_e_membro" (public) or "nao_encontrado" (closed)', () => {
  const x = withMods()
  const other = x.comunidade(x.m3, { acesso: 'aberta' })
  const closed = x.comunidade(x.m3, { acesso: 'fechada' })
  assert.equal(x.code(x.mod1, 'comunidade-gestao', { comunidade: other, alvo: x.dono.uid, acao: 'banir', motivo: 'spam' }), 'nao_e_membro')
  assert.equal(x.code(x.mod1, 'comunidade-gestao', { comunidade: closed, alvo: x.dono.uid, acao: 'banir', motivo: 'spam' }), 'nao_encontrado')
  assert.equal(x.code(x.mod1, 'comunidade-atualizar', { comunidade: other, nome: 'Tomada', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] }), 'nao_e_membro')
  assert.equal(x.code(x.mod1, 'comunidade-posse', { comunidade: x.c, acao: 'encerrar', novoDono: null }), 'sem_permissao', 'a moderator does not close their own community')
})

test('a rover does not act on the owner, nor does the moderator pose as owner: ownership, access and update', () => {
  const x = withMods()
  assert.equal(x.code(x.mod1, 'comunidade-posse', { comunidade: x.c, acao: 'transferir', novoDono: x.mod1.uid }), 'esquema')
  assert.equal(x.code(x.mod1, 'comunidade-posse', { comunidade: x.c, acao: 'transferir', novoDono: x.mod2.uid }), 'sem_permissao')
  assert.equal(x.code(x.mod1, 'comunidade-atualizar', { comunidade: x.c, nome: x.s.comunidade(x.c).nome, descricao: 'nova', regras: 'novas', tema: 'rovers', acesso: 'fechada', categorias: [] }), 'sem_permissao', 'a moderator does not change access')
  assert.equal(x.does(x.mod1, 'comunidade-atualizar', { comunidade: x.c, nome: x.s.comunidade(x.c).nome, descricao: 'nova', regras: 'novas', tema: 'rovers', acesso: 'aberta', categorias: ['Geral'] }).estado, 'aceito', 'but the rest changes')
  assert.equal(x.code(x.membro, 'comunidade-atualizar', { comunidade: x.c, nome: 'Nome novo', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] }), 'sem_permissao')
})

// ---------- posse ----------

test('transfer ownership: the new owner is a member; the old one becomes moderator; ownership notice; the old one loses the power of the owner', () => {
  const x = withMods()
  assert.equal(x.code(x.dono, 'comunidade-posse', { comunidade: x.c, acao: 'transferir', novoDono: x.rover().uid }), 'nao_encontrado', 'not a member')
  x.ok(x.dono, 'comunidade-posse', { comunidade: x.c, acao: 'transferir', novoDono: x.mod1.uid })
  assert.equal(x.s.papel(x.c, x.mod1.uid), 'dono')
  assert.equal(x.s.papel(x.c, x.dono.uid), 'moderador')
  assert.equal(x.s.comunidade(x.c).dono, x.mod1.uid)
  assert.deepEqual(notices(x, x.mod1).slice(0, 1), ['posse-recebida'])
  assert.equal(x.code(x.dono, 'comunidade-posse', { comunidade: x.c, acao: 'encerrar', novoDono: null }), 'sem_permissao')
  assert.equal(x.code(x.dono, 'comunidade-gestao', { comunidade: x.c, alvo: x.mod1.uid, acao: 'banir', motivo: 'spam' }), 'sem_permissao')
  assert.equal(x.s.communityDetail(x.c, {}).dono.uid, x.mod1.uid)
})

test('ownership requires human approval: without it, "sem_aprovacao"', () => {
  const x = withMods()
  assert.equal(x.code(x.dono, 'comunidade-posse', { comunidade: x.c, acao: 'transferir', novoDono: x.mod1.uid }, { aprovada: false }), 'sem_aprovacao')
})

test('close: the community disappears from list, detail, topics, search and profile; the content is hidden; nothing comes back', () => {
  const x = withMods()
  const t = x.topico(x.mod1, x.c, { titulo: 'Tópico que vai embora' })
  x.ok(x.dono, 'comunidade-posse', { comunidade: x.c, acao: 'encerrar', novoDono: null })
  assert.deepEqual(x.s.listedCommunities({}).itens, [])
  assert.equal(codeOf(() => x.s.communityDetail(x.c, {})), 'nao_encontrado')
  assert.equal(codeOf(() => x.s.topicsOf(x.c, {})), 'nao_encontrado')
  assert.equal(codeOf(() => x.s.topicDetail(t, {})), 'nao_encontrado')
  assert.equal(codeOf(() => x.rele.objeto(t)), 'nao_encontrado')
  assert.deepEqual(x.s.comunidadesDoRover(x.dono.uid, {}).itens, [])
  assert.equal(x.s.buscar({ q: 'Tópico' }, x.m.relogio.agora).topicos.length, 0)
  assert.equal(x.code(x.m3, 'comunidade-adesao', { comunidade: x.c, acao: 'entrar' }), 'nao_encontrado')
  assert.notEqual(x.m.store.objeto(t).oculto_em, null)
  x.advance(31 * DAY)
  x.rele.limpar()
  assert.equal(x.m.store.objeto(t).envelope, null, 'after 30 days the envelope is deleted')
})

test('the owner leaves the network: ownership goes to the oldest moderator, then the oldest member; with nobody, it closes', () => {
  const x = withMods()
  x.ok(x.dono, 'remocao-pelo-autor', { alvo: x.rele.perfil(x.dono.uid).perfil.id })
  assert.equal(x.s.papel(x.c, x.m1.uid), 'dono', 'the oldest moderator (joined first)')
  assert.equal(x.s.comunidade(x.c).dono, x.m1.uid)
  assert.deepEqual(notices(x, x.m1).slice(0, 1), ['posse-recebida'])
  const so = x.rover()
  const ca = x.comunidade(so)
  x.ok(so, 'remocao-pelo-autor', { alvo: x.rele.perfil(so.uid).perfil.id })
  assert.equal(x.s.comunidade(ca), null, 'without an heir, it closes')
})

// ---------- atualizar ----------

test('update: replaces the whole state; categories that leave do not erase history; becoming closed removes it from the list at once', () => {
  const x = withMods()
  const before = x.s.comunidade(x.c)
  x.ok(x.mod1, 'comunidade-atualizar', { comunidade: x.c, nome: before.nome, descricao: 'Nova descrição', regras: 'Regras novas', tema: 'planilhas', acesso: 'aberta', categorias: ['Geral'] })
  const d = x.s.communityDetail(x.c, {})
  assert.deepEqual([d.descricao, d.regras, d.tema, d.categorias], ['Nova descrição', 'Regras novas', 'planilhas', ['Geral']])
  assert.notEqual(d.envelope.objeto.id, x.c, 'the served envelope is that of the current version')
  assert.equal(d.envelope.objeto.tipo, 'comunidade-atualizar')
  assert.equal(x.s.listedCommunities({ tema: 'planilhas' }).itens.length, 1)
  assert.equal(x.s.listedCommunities({ tema: 'rovers' }).itens.length, 0)
  x.ok(x.dono, 'comunidade-atualizar', { comunidade: x.c, nome: before.nome, descricao: 'x', regras: 'y', tema: 'planilhas', acesso: 'fechada', categorias: [] })
  assert.deepEqual(x.s.listedCommunities({}).itens, [])
  assert.equal(codeOf(() => x.s.communityDetail(x.c, {})), 'nao_encontrado')
  assert.equal(x.s.communityDetail(x.c, { credencial: x.como(x.membro) }).acesso, 'fechada')
})

test('update: the name stays unique among the listed ones, including when it stops being closed', () => {
  const x = base()
  x.comunidade(x.dono, { nome: 'Nome disputado' })
  const f = x.comunidade(x.m1, { nome: 'Nome disputado', acesso: 'fechada' })
  assert.equal(x.code(x.m1, 'comunidade-atualizar', { comunidade: f, nome: 'Nome disputado', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] }), 'ja_existe')
  const other = x.comunidade(x.m2, { nome: 'Outro nome' })
  assert.equal(x.code(x.m2, 'comunidade-atualizar', { comunidade: other, nome: 'nome disputado', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] }), 'ja_existe')
  assert.equal(x.does(x.m2, 'comunidade-atualizar', { comunidade: other, nome: 'Outro nome', descricao: 'mudei só a descrição', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] }).estado, 'aceito', 'keeping its own name is fine')
})

// ---------- leitura ----------

test('community list: only the listed ones, filters by theme and access, orders by creation and by activity, cursor without repeats', () => {
  const x = base()
  const ids = []
  for (let i = 0; i < 4; i++) { ids.push(x.comunidade(x.rover(), { tema: i % 2 ? 'a-um' : 'b-dois', acesso: i === 3 ? 'moderada' : 'aberta' })); x.advance(1) }
  x.comunidade(x.rover(), { acesso: 'fechada' })
  assert.deepEqual(x.s.listedCommunities({}).itens.map((i) => i.id), [...ids].reverse())
  assert.deepEqual(x.s.listedCommunities({ tema: 'a-um' }).itens.map((i) => i.id), [ids[3], ids[1]])
  assert.deepEqual(x.s.listedCommunities({ acesso: 'moderada' }).itens.map((i) => i.id), [ids[3]])
  assert.equal(codeOf(() => x.s.listedCommunities({ acesso: 'fechada' })), 'esquema', 'closed is not even a filter')
  assert.equal(codeOf(() => x.s.listedCommunities({ ordem: 'popular' })), 'esquema')
  const p1 = x.s.listedCommunities({ limite: 3 })
  const p2 = x.s.listedCommunities({ limite: 3, antes: p1.proximo })
  assert.deepEqual([...p1.itens, ...p2.itens].map((i) => i.id), [...ids].reverse())
  assert.equal(p2.proximo, null)
})

test('detail: the invitee of a closed community reads the minimal card; the member, everything; a stranger, 404', () => {
  const x = base()
  const c = x.comunidade(x.dono, { acesso: 'fechada', descricao: 'Só para quem sabe' })
  assert.equal(codeOf(() => x.s.communityDetail(c, {})), 'nao_encontrado')
  assert.equal(codeOf(() => x.s.communityDetail(c, { credencial: x.como(x.m1) })), 'nao_encontrado')
  x.gestao(x.dono, c, x.m1, 'convidar')
  const min = x.s.communityDetail(c, { credencial: x.como(x.m1) })
  assert.deepEqual(Object.keys(min).sort(), ['acesso', 'descricao', 'id', 'nome', 'voce'])
  assert.equal(min.voce.convidado, true)
  assert.equal(codeOf(() => x.s.membersOf(c, { credencial: x.como(x.m1) })), 'nao_encontrado', 'the invitee does not read the members yet')
  assert.equal(codeOf(() => x.s.topicsOf(c, { credencial: x.como(x.m1) })), 'nao_encontrado')
  x.ok(x.m1, 'comunidade-adesao', { comunidade: c, acao: 'aceitar-convite' })
  assert.equal(x.s.communityDetail(c, { credencial: x.como(x.m1) }).regras, 'Seja gentil.')
})

test('members: owners and moderators first; whoever closed the graph only shows to a moderator and to themselves; the card counts everyone', () => {
  const x = base()
  const closedRover = x.rover({ grafo: 'privado' })
  const c = x.comunidade(x.dono)
  for (const r of [x.m1, x.m2, closedRover]) x.entra(r, c, { wait: false })
  x.gestao(x.dono, c, x.m2, 'promover')
  const list = (cred) => x.s.membersOf(c, { credencial: cred }).itens.map((i) => [i.rover.uid, i.papel])
  assert.deepEqual(list(null), [[x.dono.uid, 'dono'], [x.m2.uid, 'moderador'], [x.m1.uid, 'membro']], 'the closed one is left out')
  assert.deepEqual(list(x.como(x.m1)).length, 3)
  assert.equal(list(x.como(closedRover)).some(([u]) => u === closedRover.uid), true, 'they see themselves')
  assert.equal(list(x.como(x.m2)).length, 4, 'a moderator sees everyone')
  assert.equal(list(x.como(x.dono)).length, 4)
  assert.equal(x.s.communityDetail(c, {}).membros, 4, 'the card counts everyone')
  const p1 = x.s.membersOf(c, { limite: 2, credencial: x.como(x.dono) })
  const p2 = x.s.membersOf(c, { limite: 2, antes: p1.proximo, credencial: x.como(x.dono) })
  assert.equal([...p1.itens, ...p2.itens].length, 4)
  assert.equal(p2.proximo, null)
})

test('rover with a closed graph: its communities disappear from its profile for others and the closed ones only show to it', () => {
  const x = base()
  const open = x.comunidade(x.dono)
  const closed = x.comunidade(x.dono, { acesso: 'fechada' })
  x.entra(x.m1, open, { wait: false })
  x.gestao(x.dono, closed, x.m1, 'convidar')
  x.ok(x.m1, 'comunidade-adesao', { comunidade: closed, acao: 'aceitar-convite' })
  assert.deepEqual(x.s.comunidadesDoRover(x.m1.uid, { credencial: null }).itens.map((i) => i.comunidade.id), [open], 'the closed one does not appear to strangers')
  assert.deepEqual(x.s.comunidadesDoRover(x.m1.uid, { credencial: x.como(x.m2) }).itens.map((i) => i.comunidade.id), [open])
  assert.deepEqual(x.s.comunidadesDoRover(x.m1.uid, { credencial: x.como(x.m1) }).itens.map((i) => i.comunidade.id).sort(), [open, closed].sort())
  assert.equal(x.s.paginaDoRover(x.m1.uid, {}).contagens.comunidades, 1)
  assert.equal(x.s.paginaDoRover(x.m1.uid, { credencial: x.como(x.m1) }).contagens.comunidades, 2)
  const closedRover = x.rover({ grafo: 'privado' })
  x.entra(closedRover, open, { wait: false })
  assert.equal(codeOf(() => x.s.comunidadesDoRover(closedRover.uid, { credencial: null })), 'grafo_privado')
  assert.equal(x.s.comunidadesDoRover(closedRover.uid, { credencial: x.como(closedRover) }).itens.length, 1)
})

test('requests, invitations and banned: only moderator and owner read; member, stranger and anonymous do not', () => {
  const x = withMods()
  for (const route of ['pedidosDe', 'convitesDa', 'banidosDa']) {
    assert.equal(codeOf(() => x.s[route](x.c, { credencial: x.como(x.membro) })), 'sem_permissao', `${route} membro`)
    assert.equal(codeOf(() => x.s[route](x.c, { credencial: x.como(x.rover()) })), 'sem_permissao', `${route} stranger in a public community`)
    assert.equal(codeOf(() => x.s[route](x.c, { credencial: null })), 'leitura_nao_autorizada', `${route} anonymous`)
    assert.equal(x.s[route](x.c, { credencial: x.como(x.mod1) }).itens.length, 0, `${route} moderador`)
  }
  const f = x.comunidade(x.dono, { acesso: 'fechada' })
  for (const route of ['pedidosDe', 'convitesDa', 'banidosDa']) {
    assert.equal(codeOf(() => x.s[route](f, { credencial: x.como(x.rover()) })), 'nao_encontrado', `${route} fechada: estranho`)
    assert.equal(codeOf(() => x.s[route](f, { credencial: null })), 'nao_encontrado', `${route} closed: anonymous`)
  }
})
