// SPDX-License-Identifier: AGPL-3.0-or-later
// Layered moderation: removal by a responsible person, public log, appeal, relay block and reports in two queues.
import test from 'node:test'
import assert from 'node:assert/strict'
import { TIMES } from '../../packages/protocol/src/index.js'
import { DAY, codeOf, errorOf, fresh } from '../helpers/network.js'

function forum() {
  const x = fresh()
  const owner = x.rover()
  const mod = x.rover()
  const [ana, beto, caio] = [x.rover(), x.rover(), x.rover()]
  const c = x.comunidade(owner, { categorias: [] })
  for (const r of [mod, ana, beto, caio]) { x.entra(r, c, { wait: false }); x.advance(1) }
  x.gestao(owner, c, mod, 'promover')
  x.advance(3601)
  return Object.assign(x, { dono: owner, mod, ana, beto, caio, c })
}
const notices = (x, r) => x.s.listar(r.uid, { limite: 50 }, x.m.relogio.agora).itens
const remove = (x, who, target, reason = 'spam') => x.ok(who, 'remocao-por-responsavel', { alvo: target, motivo: reason })

// ---------- removal by a responsible person ----------

test('a moderator removes a topic and a reply of a member: gone from reads, search and tags; the author is notified without knowing who', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { titulo: 'Oferta imperdível', tags: ['oferta'] })
  const r = x.replies(x.beto, t, 'Compre já')
  remove(x, x.mod, r, 'spam')
  assert.equal(x.s.repliesOf(t, {}).itens.length, 0)
  assert.equal(codeOf(() => x.rele.objeto(r)), 'removido')
  assert.deepEqual(notices(x, x.beto)[0], { seq: notices(x, x.beto)[0].seq, tipo: 'removido-por-responsavel', em: x.m.relogio.agora, origem: null, objeto: null, comunidade: x.c, pagina: null, lugar: { tipo: 'comunidade', id: x.c, nome: x.s.comunidade(x.c).nome }, topico: null })
  remove(x, x.mod, t, 'spam')
  assert.deepEqual(x.s.topicsOf(x.c, {}).itens, [])
  assert.equal(codeOf(() => x.s.topicDetail(t, {})), 'removido')
  assert.equal(x.s.buscar({ q: 'Oferta' }, x.m.relogio.agora).topicos.length, 0)
  assert.equal(x.m.store.um('SELECT COUNT(*) AS n FROM tags_uso WHERE objeto = :o', { o: t }).n, 0)
  assert.equal(x.code(x.mod, 'remocao-por-responsavel', { alvo: t, motivo: 'spam' }), 'ja_existe')
  assert.equal(x.m.store.objeto(t).envelope !== null, true, 'the envelope is kept for the appeal')
})

test('who can remove: a moderator cannot remove the owner content; the owner removes everything; a member and a stranger cannot', () => {
  const x = forum()
  const ofOwner = x.topico(x.dono, x.c, { titulo: 'Aviso do dono' })
  const his = x.topico(x.ana, x.c, { titulo: 'Tópico da ana' })
  assert.equal(x.code(x.mod, 'remocao-por-responsavel', { alvo: ofOwner, motivo: 'regras' }), 'sem_permissao')
  assert.equal(x.code(x.beto, 'remocao-por-responsavel', { alvo: his, motivo: 'regras' }), 'sem_permissao', 'regular member')
  assert.equal(x.code(x.rover(), 'remocao-por-responsavel', { alvo: his, motivo: 'regras' }), 'nao_e_membro')
  assert.equal(x.code(x.ana, 'remocao-por-responsavel', { alvo: his, motivo: 'regras' }), 'sem_permissao', 'not even the author: they use removal by the author')
  assert.equal(x.does(x.dono, 'remocao-por-responsavel', { alvo: his, motivo: 'regras' }).estado, 'aceito')
  assert.equal(x.does(x.dono, 'remocao-por-responsavel', { alvo: ofOwner, motivo: 'outro' }).estado, 'aceito', 'the owner removes their own too')
  assert.equal(x.code(x.mod, 'remocao-por-responsavel', { alvo: `ob_${'A'.repeat(43)}`, motivo: 'spam' }), 'nao_encontrado')
  const post = x.ok(x.ana, 'postagem', { texto: 'postagem pública comum', topicos: [] })
  assert.equal(x.code(x.dono, 'remocao-por-responsavel', { alvo: post.id, motivo: 'spam' }), 'sem_permissao', 'a postagem is not a community item')
})

test('a moderator of another community cannot remove here: "nao_e_membro" on a public one, "nao_encontrado" on a closed one', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  const strange = x.rover()
  x.comunidade(strange, { nome: 'Outra comunidade' })
  assert.equal(x.code(strange, 'remocao-por-responsavel', { alvo: t, motivo: 'spam' }), 'nao_e_membro')
  const f = x.comunidade(x.dono, { acesso: 'fechada', nome: 'Fechadinha' })
  x.gestao(x.dono, f, x.ana, 'convidar')
  x.ok(x.ana, 'comunidade-adesao', { comunidade: f, acao: 'aceitar-convite' })
  x.advance(3601)
  const tf = x.topico(x.ana, f)
  assert.equal(x.code(strange, 'remocao-por-responsavel', { alvo: tf, motivo: 'spam' }), 'nao_encontrado')
})

test('public log: reason, role of who removed and the content id; never the text or who moderated; no log entry on a wall', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { titulo: 'Texto que não deve vazar', texto: 'conteúdo removido' })
  remove(x, x.mod, t, 'assedio')
  const reg = x.s.registroDaComunidade(x.c, {})
  assert.equal(reg.itens.length, 1)
  assert.deepEqual({ ...reg.itens[0], id: undefined, em: undefined }, { id: undefined, em: undefined, escopo: 'comunidade', contexto: x.c, acao: 'remocao', alvoTipo: 'topico', alvo: t, motivo: 'assedio', por: 'moderador', apelacao: null })
  const text = JSON.stringify(reg)
  for (const secret of ['Texto que não deve vazar', 'conteúdo removido', x.mod.uid, x.ana.uid]) assert.equal(text.includes(secret), false, secret)
  const t2 = x.topico(x.beto, x.c, { titulo: 'Outro' })
  remove(x, x.dono, t2, 'regras')
  assert.deepEqual(x.s.registroDaComunidade(x.c, {}).itens.map((i) => i.por), ['dono', 'moderador'])
  // a wall page is not included
  assert.equal(x.s.registroDoRele({}).itens.length, 0)
})

test('the log of a closed community is only read by members', () => {
  const x = forum()
  const f = x.comunidade(x.dono, { acesso: 'fechada', nome: 'Fechadinha' })
  x.gestao(x.dono, f, x.ana, 'convidar')
  x.ok(x.ana, 'comunidade-adesao', { comunidade: f, acao: 'aceitar-convite' })
  x.advance(3601)
  remove(x, x.dono, x.topico(x.ana, f), 'spam')
  assert.equal(codeOf(() => x.s.registroDaComunidade(f, {})), 'nao_encontrado')
  assert.equal(codeOf(() => x.s.registroDaComunidade(f, { credencial: x.como(x.beto) })), 'nao_encontrado')
  assert.equal(x.s.registroDaComunidade(f, { credencial: x.como(x.ana) }).itens.length, 1)
})

test('hidden content is erased from storage 30 days later, and so is the identity of who moderated', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  remove(x, x.mod, t)
  assert.equal(x.m.store.um('SELECT por FROM remocoes').por, x.mod.uid)
  x.advance(TIMES.retencaoDeRemovidoS - 1)
  x.rele.limpar()
  assert.notEqual(x.m.store.objeto(t).envelope, null)
  x.advance(2)
  x.rele.limpar()
  assert.equal(x.m.store.objeto(t).envelope, null)
  assert.equal(x.m.store.um('SELECT por FROM remocoes').por, null)
  assert.equal(x.s.registroDaComunidade(x.c, {}).itens.length, 1, 'the public log stays')
})

// ---------- appeal ----------

function removed() {
  const x = forum()
  const t = x.topico(x.ana, x.c, { titulo: 'Pergunta legítima', tags: ['pergunta'] })
  remove(x, x.mod, t, 'fora-do-tema')
  return Object.assign(x, { t })
}

test('appeal against a removal made by a moderator: the owner decides; reverted gives back the content, the search entry and the tags', () => {
  const x = removed()
  const ap = x.ok(x.ana, 'apelacao', { tipo: 'remocao', alvo: x.t, texto: 'Era uma pergunta sobre o tema da comunidade.' })
  assert.deepEqual(x.s.registroDaComunidade(x.c, {}).itens[0].apelacao, 'aberta')
  assert.equal(notices(x, x.dono)[0].tipo, 'apelacao-recebida')
  assert.equal(notices(x, x.mod).some((n) => n.tipo === 'apelacao-recebida'), false)
  const queue = x.s.communityQueue(x.c, { credencial: x.como(x.dono) })
  assert.deepEqual(queue.apelacoes.map((a) => [a.id, a.tipo, a.alvo, a.autor.uid, a.texto]), [[ap.id, 'remocao', x.t, x.ana.uid, 'Era uma pergunta sobre o tema da comunidade.']])
  assert.equal(queue.apelacoes[0].envelope.objeto.corpo.titulo, 'Pergunta legítima', 'the owner sees the retained content')
  assert.deepEqual(x.s.communityQueue(x.c, { credencial: x.como(x.mod) }).apelacoes, [], 'the moderator does not see appeals')
  assert.equal(x.code(x.mod, 'apelacao-decisao', { apelacao: ap.id, resultado: 'revertida' }), 'sem_permissao', 'a moderator does not decide')
  assert.equal(x.code(x.ana, 'apelacao-decisao', { apelacao: ap.id, resultado: 'revertida' }), 'sem_permissao', 'the appellant neither')
  x.ok(x.dono, 'apelacao-decisao', { apelacao: ap.id, resultado: 'revertida' })
  assert.equal(x.s.topicDetail(x.t, {}).titulo, 'Pergunta legítima')
  assert.equal(x.s.topicsOf(x.c, {}).itens.length, 1)
  assert.equal(x.s.buscar({ q: 'legítima' }, x.m.relogio.agora).topicos.length, 1)
  assert.equal(x.m.store.um('SELECT COUNT(*) AS n FROM tags_uso WHERE objeto = :o', { o: x.t }).n, 1)
  assert.equal(notices(x, x.ana)[0].tipo, 'apelacao-decidida')
  assert.equal(x.s.registroDaComunidade(x.c, {}).itens[0].apelacao, 'revertida')
  assert.equal(x.code(x.dono, 'apelacao-decisao', { apelacao: ap.id, resultado: 'mantida' }), 'ja_existe')
})

test('upheld appeal: nothing comes back and the case closes; one per case; after 14 days it is not valid', () => {
  const x = removed()
  const ap = x.ok(x.ana, 'apelacao', { tipo: 'remocao', alvo: x.t, texto: 'Peço revisão.' })
  assert.equal(x.code(x.ana, 'apelacao', { tipo: 'remocao', alvo: x.t, texto: 'De novo.' }), 'ja_existe')
  x.ok(x.dono, 'apelacao-decisao', { apelacao: ap.id, resultado: 'mantida' })
  assert.equal(codeOf(() => x.s.topicDetail(x.t, {})), 'removido')
  assert.equal(x.s.registroDaComunidade(x.c, {}).itens[0].apelacao, 'mantida')
  assert.deepEqual(x.s.communityQueue(x.c, { credencial: x.como(x.dono) }).apelacoes, [])
  const y = removed()
  y.advance(TIMES.janelaDeApelacaoS)
  assert.equal(y.does(y.ana, 'apelacao', { tipo: 'remocao', alvo: y.t, texto: 'No último dia.' }).estado, 'aceito')
  const z = removed()
  z.advance(TIMES.janelaDeApelacaoS + 1)
  assert.equal(errorOf(() => z.ok(z.ana, 'apelacao', { tipo: 'remocao', alvo: z.t, texto: 'Tarde demais.' })).codigo, 'fora_da_janela')
})

test('appeal: only the content author; removal on a profile wall has no appeal; content that was not removed cannot be appealed', () => {
  const x = removed()
  assert.equal(x.code(x.beto, 'apelacao', { tipo: 'remocao', alvo: x.t, texto: 'Não é meu.' }), 'nao_encontrado')
  const live = x.topico(x.ana, x.c, { titulo: 'Vivo' })
  assert.equal(x.code(x.ana, 'apelacao', { tipo: 'remocao', alvo: live, texto: 'Nada a apelar.' }), 'nao_encontrado')
  const rec = x.ok(x.beto, 'recado', { alvo: x.ana.uid, texto: 'oi' })
  x.ok(x.ana, 'remocao-por-responsavel', { alvo: rec.id, motivo: 'spam' })
  assert.equal(x.code(x.beto, 'apelacao', { tipo: 'remocao', alvo: rec.id, texto: 'Meu recado.' }), 'sem_permissao')
  assert.equal(x.code(x.ana, 'apelacao', { tipo: 'banimento', alvo: x.c, texto: 'Não fui banida.' }), 'nao_encontrado')
  assert.equal(x.code(x.ana, 'apelacao', { tipo: 'remocao', alvo: x.t, texto: 'sem aprovação' }, { aprovada: false }), 'sem_aprovacao')
})

test('ban appeal: the banned rover appeals, the owner decides; reverted lifts the ban but does not put them back as a member', () => {
  const x = forum()
  x.gestao(x.mod, x.c, x.caio, 'banir', 'spam')
  const ap = x.ok(x.caio, 'apelacao', { tipo: 'banimento', alvo: x.c, texto: 'Foi um engano.' })
  assert.equal(x.s.banidosDa(x.c, { credencial: x.como(x.dono) }).itens[0].apelacao, 'aberta')
  assert.equal(x.code(x.caio, 'apelacao', { tipo: 'banimento', alvo: x.c, texto: 'De novo.' }), 'ja_existe')
  x.ok(x.dono, 'apelacao-decisao', { apelacao: ap.id, resultado: 'revertida' })
  assert.equal(x.s.banidosDa(x.c, { credencial: x.como(x.dono) }).itens.length, 0)
  assert.equal(x.s.papel(x.c, x.caio.uid), null, 'does not come back as a member')
  assert.equal(x.ok(x.caio, 'comunidade-adesao', { comunidade: x.c, acao: 'entrar' }).resultado, 'membro', 'but can already join')
  assert.equal(x.s.registroDaComunidade(x.c, {}).itens[0].apelacao, 'revertida')
})

test('a removal or ban made by the OWNER has no decider inside the community: the appeal falls into the relay queue, which decides', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  remove(x, x.dono, t, 'regras')
  x.gestao(x.dono, x.c, x.caio, 'banir', 'assedio')
  const a1 = x.ok(x.ana, 'apelacao', { tipo: 'remocao', alvo: t, texto: 'O dono removeu e discordo.' })
  const a2 = x.ok(x.caio, 'apelacao', { tipo: 'banimento', alvo: x.c, texto: 'Banido por engano.' })
  assert.equal(x.code(x.dono, 'apelacao-decisao', { apelacao: a1.id, resultado: 'revertida' }), 'sem_permissao', 'the owner does not judge themselves')
  assert.deepEqual(x.s.communityQueue(x.c, { credencial: x.como(x.dono) }).apelacoes, [])
  assert.equal(notices(x, x.dono).some((n) => n.tipo === 'apelacao-recebida'), false)
  const queue = x.s.relayAppeals({})
  assert.deepEqual(queue.itens.map((a) => [a.id, a.tipo, a.origem]).sort(), [[a1.id, 'remocao', 'rele'], [a2.id, 'banimento', 'rele']].sort())
  x.s.decideRelayAppeal(a1.id, 'revertida')
  x.s.decideRelayAppeal(a2.id, 'mantida')
  assert.equal(x.s.topicDetail(t, {}).id, t)
  assert.equal(x.s.banidosDa(x.c, { credencial: x.como(x.dono) }).itens[0].apelacao, 'mantida')
  assert.equal(notices(x, x.ana)[0].tipo, 'apelacao-decidida')
  assert.equal(codeOf(() => x.s.decideRelayAppeal(a1.id, 'revertida')), 'ja_existe')
  assert.equal(codeOf(() => x.s.decideRelayAppeal(`ob_${'A'.repeat(43)}`, 'revertida')), 'nao_encontrado')
})

// ---------- the relay ----------

test('the relay blocks an object with a public reason: it enters the relay log; the appeal falls into its queue; reverting unblocks', () => {
  const x = forum()
  const post = x.ok(x.ana, 'postagem', { texto: 'uma postagem polêmica', topicos: [] })
  x.rele.bloquear({ tipo: 'objeto', alvo: post.id, motivo: 'denúncia procedente em análise', motivoPublico: 'assedio' })
  assert.equal(codeOf(() => x.rele.objeto(post.id)), 'nao_encontrado')
  const reg = x.s.registroDoRele({})
  assert.deepEqual(reg.itens.map((i) => [i.escopo, i.acao, i.alvoTipo, i.alvo, i.motivo, i.por, i.apelacao]), [['rele', 'remocao', 'postagem', post.id, 'assedio', 'rele', null]])
  const ap = x.ok(x.ana, 'apelacao', { tipo: 'remocao', alvo: post.id, texto: 'Não vejo o problema.' })
  assert.deepEqual(x.s.relayAppeals({}).itens.map((a) => a.id), [ap.id])
  x.s.decideRelayAppeal(ap.id, 'revertida')
  assert.equal(x.rele.objeto(post.id).objeto.id, post.id)
  assert.equal(x.rele.listBlocks().length, 0)
  // without a public reason the block stays private
  x.rele.bloquear({ tipo: 'objeto', alvo: post.id, motivo: 'privado' })
  assert.equal(x.s.registroDoRele({}).itens.length, 1)
  assert.equal(codeOf(() => x.rele.bloquear({ tipo: 'rover', alvo: x.ana.uid, motivo: 'x', motivoPublico: 'spam' })), 'esquema')
  assert.equal(codeOf(() => x.rele.bloquear({ tipo: 'objeto', alvo: post.id, motivo: 'x', motivoPublico: 'golpe' })), 'esquema')
})

test('the relay blocks the object that created a community: it disappears from lists and reads', () => {
  const x = forum()
  x.rele.bloquear({ tipo: 'objeto', alvo: x.c, motivo: 'comunidade de golpe', motivoPublico: 'ilegal' })
  assert.deepEqual(x.s.listedCommunities({}).itens, [])
  assert.equal(codeOf(() => x.s.communityDetail(x.c, {})), 'nao_encontrado')
  assert.equal(codeOf(() => x.s.topicsOf(x.c, {})), 'nao_encontrado')
  assert.equal(x.s.buscar({ q: 'Comunidade' }, x.m.relogio.agora).comunidades.length, 0)
  x.rele.desbloquear('objeto', x.c)
  assert.equal(x.s.communityDetail(x.c, {}).id, x.c)
})

// ---------- reports ----------

test('a report on community content goes to both queues; the community one shows reasons and weights, never the reporter', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { titulo: 'Conteúdo suspeito' })
  x.does(x.beto, 'denuncia', { alvo: t, motivo: 'spam' })
  x.does(x.caio, 'denuncia', { alvo: t, motivo: 'assedio' })
  const queue = x.s.communityQueue(x.c, { credencial: x.como(x.mod) })
  assert.equal(queue.denuncias.length, 1)
  assert.deepEqual({ ...queue.denuncias[0], primeiraEm: 0, ultimaEm: 0 }, { alvo: t, alvoTipo: 'topico', topico: t, motivos: { spam: 1, assedio: 1 }, total: 2, primeiraEm: 0, ultimaEm: 0, peso: 2 })
  const text = JSON.stringify(queue)
  for (const who of [x.beto, x.caio]) {
    assert.equal(text.includes(who.uid), false)
    assert.equal(text.includes(x.rele._pseudonym(who.uid)), false, 'not even the pseudonym the relay operator sees')
  }
  const ofRelay = x.rele.listReports()
  assert.equal(ofRelay.length, 2)
  assert.equal(ofRelay[0].comunidade, x.c)
  assert.ok(ofRelay.every((d) => d.denunciante.length === 22))
  assert.equal(x.does(x.beto, 'denuncia', { alvo: t, motivo: 'spam' }).estado, 'recebida', 'repeating is accepted silently, without duplicating')
  assert.equal(x.rele.listReports().length, 2)
  assert.equal(codeOf(() => x.s.communityQueue(x.c, { credencial: x.como(x.beto) })), 'sem_permissao')
  assert.equal(codeOf(() => x.s.communityQueue(x.c, { credencial: null })), 'leitura_nao_autorizada')
})

test('the report weight only counts accounts of 7 days or more, and the new reasons exist', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  x.m.store.executar('UPDATE rovers SET criado_em = :n WHERE uid = :u', { n: x.m.relogio.agora - 2 * DAY, u: x.caio.uid })
  x.does(x.beto, 'denuncia', { alvo: t, motivo: 'menores' })
  x.does(x.caio, 'denuncia', { alvo: t, motivo: 'personificacao' })
  const g = x.s.communityQueue(x.c, { credencial: x.como(x.mod) }).denuncias[0]
  assert.equal(g.total, 2)
  assert.equal(g.peso, 1, 'only the report from someone with 7 days or more weighs')
  assert.deepEqual(g.motivos, { menores: 1, personificacao: 1 })
  assert.equal(x.does(x.beto, 'denuncia', { alvo: t, motivo: 'fora-do-tema' }).estado, 'recebida')
  assert.equal(x.code(x.beto, 'denuncia', { alvo: t, motivo: 'ilegal-demais' }), 'esquema', 'reason outside the enum')
})

test('brigading: 50 rovers report the same content and NOTHING is hidden or removed; the queue only sorts', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { titulo: 'Conteúdo legítimo atacado' })
  const r = x.replies(x.beto, t, 'uma resposta também atacada')
  for (let i = 0; i < 50; i++) {
    const attacker = x.rover()
    x.does(attacker, 'denuncia', { alvo: t, motivo: 'assedio' })
    x.does(attacker, 'denuncia', { alvo: r, motivo: 'spam' })
  }
  assert.equal(x.s.topicDetail(t, {}).titulo, 'Conteúdo legítimo atacado')
  assert.equal(x.s.repliesOf(t, {}).itens.length, 1)
  assert.equal(x.s.topicsOf(x.c, {}).itens.length, 1)
  assert.equal(x.s.buscar({ q: 'legítimo' }, x.m.relogio.agora).topicos.length, 1)
  assert.equal(x.m.store.objeto(t).oculto_em, null)
  const queue = x.s.communityQueue(x.c, { credencial: x.como(x.mod) })
  assert.equal(queue.denuncias[0].total, 50)
  assert.equal(x.does(x.ana, 'topico-editar', { topico: t, titulo: 'Segue editável', texto: 'O autor segue podendo editar.', tags: [] }).estado, 'aceito')
})

test('the reporter has a cap of 10 per day; a report from someone who cannot see the target (closed community) is silently dropped', () => {
  const x = forum()
  const f = x.comunidade(x.dono, { acesso: 'fechada', nome: 'Fechada para denúncia' })
  x.gestao(x.dono, f, x.ana, 'convidar')
  x.ok(x.ana, 'comunidade-adesao', { comunidade: f, acao: 'aceitar-convite' })
  x.advance(3601)
  const tf = x.topico(x.ana, f, { titulo: 'Segredo' })
  const strange = x.rover()
  const r = x.does(strange, 'denuncia', { alvo: tf, motivo: 'spam' })
  assert.equal(r.estado, 'recebida', 'the same answer as always')
  assert.equal(x.rele.listReports().length, 0, 'but nothing was stored')
  const open = x.topico(x.ana, x.c, { titulo: 'Aberto' })
  assert.equal(x.does(strange, 'denuncia', { alvo: open, motivo: 'spam' }).estado, 'recebida')
  assert.equal(x.rele.listReports().length, 1)
  const nonexistent = x.does(strange, 'denuncia', { alvo: `ob_${'A'.repeat(43)}`, motivo: 'spam' })
  assert.equal(nonexistent.estado, 'recebida')
  // reporting the community itself (the object that created it) goes only to the relay queue
  x.does(x.beto, 'denuncia', { alvo: x.c, motivo: 'personificacao' })
  assert.deepEqual(x.s.communityQueue(x.c, { credencial: x.como(x.dono) }).denuncias.map((d) => d.alvo), [open], 'in the community queue only the topic, not the community itself')
  assert.equal(x.rele.listReports().some((d) => d.alvo === x.c && d.comunidade === null), true)
  // a member of the closed community can report
  x.does(x.dono, 'denuncia', { alvo: tf, motivo: 'spam' })
  assert.equal(x.s.communityQueue(f, { credencial: x.como(x.dono) }).denuncias.length, 1)
})

// ---------- pages, restoring and appeal edge cases ----------

test('page update: only the owner removes, and not their own; a page that no longer exists blocks removal; the author is notified with the page', () => {
  const x = forum()
  const page = x.ok(x.dono, 'pagina-criar', { nome: 'Página moderada', descricao: '', tema: 'rovers' }).id
  x.ok(x.dono, 'pagina-gestao', { pagina: page, alvo: x.mod.uid, acao: 'adicionar-admin' })
  const ofOwner = x.ok(x.dono, 'pagina-publicar', { pagina: page, texto: 'atualização do dono', tags: [] })
  const ofAdmin = x.ok(x.mod, 'pagina-publicar', { pagina: page, texto: 'atualização do administrador', tags: ['aviso'] })
  assert.equal(x.code(x.dono, 'remocao-por-responsavel', { alvo: ofOwner.id, motivo: 'spam' }), 'sem_permissao', 'the owner does not remove their own through this route')
  assert.equal(x.code(x.mod, 'remocao-por-responsavel', { alvo: ofAdmin.id, motivo: 'spam' }), 'sem_permissao', 'nor does the administrator remove theirs')
  assert.equal(x.code(x.ana, 'remocao-por-responsavel', { alvo: ofAdmin.id, motivo: 'spam' }), 'sem_permissao')
  x.ok(x.dono, 'remocao-por-responsavel', { alvo: ofAdmin.id, motivo: 'fora-do-tema' })
  const n = notices(x, x.mod)[0]
  assert.deepEqual([n.tipo, n.pagina, n.comunidade, n.origem], ['removido-por-responsavel', page, null, null])
  assert.deepEqual(x.s.pageRecord(page, {}).itens.map((i) => [i.escopo, i.contexto, i.motivo, i.por]), [['pagina', page, 'fora-do-tema', 'dono']])
  // closed page: nothing to remove
  const other = x.ok(x.beto, 'pagina-criar', { nome: 'Página que acaba', descricao: '', tema: 'rovers' }).id
  const u = x.ok(x.beto, 'pagina-publicar', { pagina: other, texto: 'x', tags: [] })
  x.ok(x.beto, 'remocao-pelo-autor', { alvo: other })
  assert.equal(x.code(x.beto, 'remocao-por-responsavel', { alvo: u.id, motivo: 'spam' }), 'sem_permissao')
})

test('a reverted appeal on a page update gives back the update and the usage tags', () => {
  const x = forum()
  const page = x.ok(x.dono, 'pagina-criar', { nome: 'Página que devolve', descricao: '', tema: 'rovers' }).id
  x.ok(x.dono, 'pagina-gestao', { pagina: page, alvo: x.mod.uid, acao: 'adicionar-admin' })
  const u = x.ok(x.mod, 'pagina-publicar', { pagina: page, texto: 'conteúdo legítimo sobre #devolver', tags: ['devolvida'] })
  x.ok(x.dono, 'remocao-por-responsavel', { alvo: u.id, motivo: 'regras' })
  assert.equal(x.m.store.um('SELECT COUNT(*) AS n FROM tags_uso WHERE objeto = :o', { o: u.id }).n, 0)
  const ap = x.ok(x.mod, 'apelacao', { tipo: 'remocao', alvo: u.id, texto: 'Era legítimo.' })
  assert.deepEqual(x.s.relayAppeals({}).itens.map((a) => a.id), [ap.id], 'removed by the page owner: the queue is the relay one')
  x.s.decideRelayAppeal(ap.id, 'revertida')
  assert.equal(x.s.communityUpdates(page, {}).itens.length, 1)
  assert.deepEqual(x.m.store.todos('SELECT tag FROM tags_uso WHERE objeto = :o ORDER BY tag', { o: u.id }).map((l) => l.tag), ['devolver', 'devolvida'])
})

test('restoring only works with the envelope still kept; without it returns false and changes nothing', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { titulo: 'Restauração', tags: ['restaurar'] })
  x.ok(x.mod, 'remocao-por-responsavel', { alvo: t, motivo: 'spam' })
  const line = x.m.store.objeto(t)
  assert.equal(x.s.restaurar({ ...line, envelope: null }), false)
  assert.notEqual(x.m.store.objeto(t).oculto_em, null, 'without the envelope nothing was undone')
  assert.equal(x.s.restaurar(line), true)
  assert.equal(x.m.store.objeto(t).oculto_em, null)
  assert.equal(x.s.buscar({ q: 'Restauração' }, x.m.relogio.agora).topicos.length, 1)
})

test('appeal: a ban without a ban, of a closed community or without a log entry, and a decision on an appeal that does not exist', () => {
  const x = forum()
  assert.equal(x.code(x.ana, 'apelacao', { tipo: 'banimento', alvo: x.c, texto: 'Nunca fui banida.' }), 'nao_encontrado')
  x.gestao(x.dono, x.c, x.caio, 'banir', 'spam')
  x.m.store.executar('DELETE FROM remocoes WHERE acao = :a', { a: 'banimento' })
  assert.equal(x.code(x.caio, 'apelacao', { tipo: 'banimento', alvo: x.c, texto: 'Sem registro.' }), 'nao_encontrado', 'banned, but without a ban log entry')
  const y = forum()
  y.gestao(y.dono, y.c, y.caio, 'banir', 'spam')
  y.ok(y.dono, 'comunidade-posse', { comunidade: y.c, acao: 'encerrar', novoDono: null })
  assert.equal(y.code(y.caio, 'apelacao', { tipo: 'banimento', alvo: y.c, texto: 'Comunidade encerrada.' }), 'nao_encontrado')
  assert.equal(x.code(x.dono, 'apelacao-decisao', { apelacao: `ob_${'A'.repeat(43)}`, resultado: 'revertida' }), 'nao_encontrado')
})

test('the author removing what a responsible person hid, or a resolved item dropping, leaves no stuck state', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  const r = x.replies(x.beto, t, 'a resposta')
  x.ok(x.ana, 'topico-resolvido', { topico: t, resposta: r })
  const other = x.replies(x.caio, t, 'outra resposta')
  x.ok(x.caio, 'remocao-pelo-autor', { alvo: other })
  assert.equal(x.s.topicDetail(t, {}).resolvido, true, 'deleting ANOTHER reply does not drop the "resolveu"')
  x.ok(x.beto, 'remocao-pelo-autor', { alvo: r })
  assert.equal(x.s.topicDetail(t, {}).resolvido, false)
})
