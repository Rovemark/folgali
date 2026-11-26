// SPDX-License-Identifier: AGPL-3.0-or-later
// Forum: topics, threaded replies with quoting, editing with history, poll, pin, lock, move, "solved" and ordering.
import test from 'node:test'
import assert from 'node:assert/strict'
import { STRUCTURE, TIMES } from '../../packages/protocol/src/index.js'
import { codeOf, errorOf, fresh } from '../helpers/network.js'

/** An open community with an owner, a moderator and three members who are past the grace period. */
function forum(options = {}) {
  const x = fresh()
  const owner = x.rover()
  const mod = x.rover()
  const [ana, beto, caio] = [x.rover(), x.rover(), x.rover()]
  const c = x.comunidade(owner, { categorias: ['Dúvidas', 'Dicas'], ...options })
  for (const r of [mod, ana, beto, caio]) x.entra(r, c, { wait: false })
  x.gestao(owner, c, mod, 'promover')
  x.advance(3601)
  return Object.assign(x, { dono: owner, mod, ana, beto, caio, c })
}
const notices = (x, r) => x.s.listar(r.uid, { limite: 50 }, x.m.relogio.agora).itens.map((n) => n.tipo)
const topicBody = (c, extra = {}) => ({ comunidade: c, categoria: null, titulo: 'Como vocês organizam?', texto: 'Queria saber como cada um faz.', tags: [], enquete: null, ...extra })

// ---------- topic ----------

test('topic: a member creates; reading brings the card and the detail with the signed envelope; the id is the object id', () => {
  const x = forum()
  const t = x.ok(x.ana, 'topico', topicBody(x.c, { categoria: 'Dúvidas', titulo: 'Qual planilha?', texto: 'Procuro uma planilha simples.', tags: ['planilhas'] }))
  const d = x.s.topicDetail(t.id, {})
  assert.equal(d.id, t.id)
  assert.deepEqual([d.titulo, d.texto, d.categoria, d.tags, d.respostas, d.fixado, d.trancado, d.resolvido, d.editado, d.enquete, d.comunidadeNome], ['Qual planilha?', 'Procuro uma planilha simples.', 'Dúvidas', ['planilhas'], 0, false, false, false, false, null, x.s.comunidade(x.c).nome])
  assert.equal(d.autor.uid, x.ana.uid)
  assert.equal(d.envelope.objeto.id, t.id)
  assert.equal(d.versoes, 1)
  const l = x.s.topicsOf(x.c, {})
  assert.deepEqual(l.itens.map((i) => i.id), [t.id])
  assert.equal(l.itens[0].trecho, 'Procuro uma planilha simples.')
  assert.equal(x.rele.objeto(t.id).objeto.corpo.titulo, 'Qual planilha?')
  assert.equal(x.s.communityDetail(x.c, {}).topicos, 1)
})

test('topic: whoever is not a member, is banned or is in a closed community cannot create; the category must exist in the community', () => {
  const x = forum()
  const outside = x.rover()
  assert.equal(x.code(outside, 'topico', topicBody(x.c)), 'nao_e_membro')
  assert.equal(x.code(x.ana, 'topico', topicBody(x.c, { categoria: 'Inexistente' })), 'esquema')
  assert.equal(x.does(x.ana, 'topico', topicBody(x.c, { categoria: 'Dicas' })).estado, 'aceito')
  x.gestao(x.dono, x.c, x.beto, 'banir', 'spam')
  assert.equal(x.code(x.beto, 'topico', topicBody(x.c)), 'banido')
  assert.equal(x.code(x.ana, 'topico', topicBody(`ob_${'A'.repeat(43)}`)), 'nao_encontrado')
})

test('grace period: a new member opens a topic only after 1 hour; moderator and owner do not wait; a reply waits 10 minutes', () => {
  const x = fresh()
  const owner = x.rover()
  const newValue = x.rover()
  const c = x.comunidade(owner)
  const t0 = x.topico(owner, c)
  x.entra(newValue, c, { wait: false })
  const e = errorOf(() => x.ok(newValue, 'topico', topicBody(c)))
  assert.equal(e.codigo, 'em_carencia')
  assert.equal(e.retryAfterS, TIMES.graceForTopicS)
  const er = errorOf(() => x.ok(newValue, 'resposta-forum', { topico: t0, em: null, cita: null, texto: 'oi' }))
  assert.equal(er.codigo, 'em_carencia')
  assert.equal(er.retryAfterS, TIMES.graceForReplyS)
  x.advance(TIMES.graceForReplyS)
  assert.equal(x.does(newValue, 'resposta-forum', { topico: t0, em: null, cita: null, texto: 'oi' }).estado, 'aceito', 'reply at 10 minutes')
  assert.equal(x.code(newValue, 'topico', topicBody(c)), 'em_carencia', 'topic not yet')
  x.advance(TIMES.graceForTopicS - TIMES.graceForReplyS - 1)
  assert.equal(x.code(newValue, 'topico', topicBody(c)), 'em_carencia', 'one second missing')
  x.advance(1)
  assert.equal(x.does(newValue, 'topico', topicBody(c)).estado, 'aceito')
  const mod = x.rover()
  x.entra(mod, c, { wait: false })
  x.gestao(owner, c, mod, 'promover')
  assert.equal(x.does(mod, 'topico', topicBody(c, { titulo: 'Do moderador' })).estado, 'aceito', 'a new moderator does not wait')
})

test('topic: the text goes through the filters and hashtags become usage tags; a mention notifies only whoever can read', () => {
  const x = forum()
  assert.equal(x.code(x.ana, 'topico', topicBody(x.c, { texto: 'fale com ana@exemplo.com' })), 'vazamento')
  assert.equal(x.code(x.ana, 'topico', topicBody(x.c, { texto: 'a https://a.com b https://b.com c https://c.com' })), 'esquema')
  assert.equal(x.code(x.ana, 'topico', topicBody(x.c, { texto: 'veja https://a.com?utm_source=x' })), 'esquema')
  const t = x.ok(x.ana, 'topico', topicBody(x.c, { texto: `olá @${x.beto.handle}, veja #organizacao e #Planilhas`, tags: ['planilhas', 'dicas'] }))
  assert.equal(notices(x, x.beto)[0], 'mencao')
  assert.deepEqual(x.m.store.todos('SELECT tag FROM tags_uso WHERE objeto = :o ORDER BY tag', { o: t.id }).map((l) => l.tag), ['dicas', 'organizacao', 'planilhas'])
  // closed community: a mentioned person who is not a member is not notified
  const f = x.comunidade(x.dono, { acesso: 'fechada' })
  x.gestao(x.dono, f, x.ana, 'convidar')
  x.ok(x.ana, 'comunidade-adesao', { comunidade: f, acao: 'aceitar-convite' })
  x.advance(3601)
  const before = notices(x, x.caio).length
  x.ok(x.ana, 'topico', topicBody(f, { texto: `segredo para @${x.caio.handle}` }))
  assert.equal(notices(x, x.caio).length, before, 'caio is not a member of the closed community')
})

// ---------- respostas ----------

test('threaded replies: first level and one level of children; replying to a child is "resposta_funda"; the quote brings the live excerpt', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  const r1 = x.replies(x.beto, t, 'Eu uso uma lista só.')
  const f1 = x.replies(x.caio, t, 'Eu também, com prazo ao lado.', { em: r1 })
  assert.equal(x.code(x.ana, 'resposta-forum', { topico: t, em: f1, cita: null, texto: 'responder à filha' }), 'resposta_funda')
  const f2 = x.replies(x.ana, t, 'Concordo com o Caio.', { em: r1, cita: f1 })
  const top = x.s.repliesOf(t, {})
  assert.deepEqual(top.itens.map((i) => [i.id, i.em, i.filhas]), [[r1, null, 2]])
  const children = x.s.repliesOf(t, { em: r1 })
  assert.deepEqual(children.itens.map((i) => i.id), [f1, f2], 'from oldest to newest')
  assert.deepEqual(children.itens[1].cita, { id: f1, autor: x.s.resumo(x.caio.uid), trecho: 'Eu também, com prazo ao lado.' })
  assert.equal(children.itens[0].cita, null)
  assert.equal(children.itens[0].envelope.objeto.id, f1)
  assert.equal(x.s.topicDetail(t, {}).respostas, 3)
  // the quote carries no copy of the text: if the quoted reply disappears, the excerpt disappears
  x.ok(x.caio, 'remocao-pelo-autor', { alvo: f1 })
  assert.equal(x.s.repliesOf(t, { em: r1 }).itens[0].cita.trecho, null)
  assert.equal(x.s.repliesOf(t, { em: r1 }).itens.length, 1)
})

test('reply: target and quote must be live replies of the same topic', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  const t2 = x.topico(x.ana, x.c, { titulo: 'Outro tópico' })
  const r2 = x.replies(x.beto, t2, 'resposta do outro tópico')
  const r1 = x.replies(x.beto, t, 'resposta')
  assert.equal(x.code(x.caio, 'resposta-forum', { topico: t, em: r2, cita: null, texto: 'x' }), 'alvo_desconhecido', 'em from another topic')
  assert.equal(x.code(x.caio, 'resposta-forum', { topico: t, em: null, cita: r2, texto: 'x' }), 'alvo_desconhecido', 'quote from another topic')
  assert.equal(x.code(x.caio, 'resposta-forum', { topico: t, em: t, cita: null, texto: 'x' }), 'alvo_desconhecido', 'the topic is not a reply')
  assert.equal(x.code(x.caio, 'resposta-forum', { topico: t, em: `ob_${'A'.repeat(43)}`, cita: null, texto: 'x' }), 'alvo_desconhecido')
  x.ok(x.beto, 'remocao-pelo-autor', { alvo: r1 })
  assert.equal(x.code(x.caio, 'resposta-forum', { topico: t, em: r1, cita: null, texto: 'x' }), 'alvo_desconhecido', 'deleted reply')
  assert.equal(x.code(x.caio, 'resposta-forum', { topico: `ob_${'A'.repeat(43)}`, em: null, cita: null, texto: 'x' }), 'nao_encontrado')
})

test('reply: notifications to the topic author, the parent, the quoted and the mentioned, one per person and the most important one', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  const r1 = x.replies(x.beto, t, 'primeira')
  assert.equal(notices(x, x.ana)[0], 'resposta-no-topico')
  const beforeBeto = notices(x, x.beto).length
  x.replies(x.caio, t, `@${x.ana.handle} e @${x.beto.handle} olhem`, { em: r1, cita: r1 })
  assert.equal(notices(x, x.beto)[0], 'resposta-a-voce', 'the parent is also the quoted one and beats the mention')
  assert.equal(notices(x, x.beto).length, beforeBeto + 1)
  assert.equal(notices(x, x.ana)[0], 'resposta-no-topico', 'the topic author beats the mention')
  assert.equal(notices(x, x.ana).filter((n) => n === 'mencao').length, 0)
  const beforeCaio = notices(x, x.caio).length
  x.replies(x.caio, t, `eu mesmo @${x.caio.handle}`)
  assert.equal(notices(x, x.caio).length, beforeCaio, 'nobody is notified about themselves')
  const dm = x.rover()
  x.entra(dm, x.c, { wait: false })
  x.advance(700)
  x.replies(dm, t, `oi @${x.ana.handle}`, { cita: r1 })
  assert.equal(notices(x, x.beto)[0], 'citacao')
})

test('reply in a locked topic: refused for a member, accepted from moderator and owner', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  x.ok(x.mod, 'topico-gestao', { topico: t, acao: 'trancar', comunidade: null, categoria: null })
  assert.equal(x.code(x.beto, 'resposta-forum', { topico: t, em: null, cita: null, texto: 'oi' }), 'trancado')
  assert.equal(x.does(x.mod, 'resposta-forum', { topico: t, em: null, cita: null, texto: 'sou moderador' }).estado, 'aceito')
  assert.equal(x.does(x.dono, 'resposta-forum', { topico: t, em: null, cita: null, texto: 'sou o dono' }).estado, 'aceito')
  x.ok(x.mod, 'topico-gestao', { topico: t, acao: 'destrancar', comunidade: null, categoria: null })
  assert.equal(x.does(x.beto, 'resposta-forum', { topico: t, em: null, cita: null, texto: 'agora vai' }).estado, 'aceito')
})

test('reply to someone who blocked the author (or was blocked by them): refused on the parent, on the quote and on the topic', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  const r1 = x.replies(x.beto, t, 'resposta do beto')
  x.ok(x.caio, 'relacao', { alvo: x.beto.uid, acao: 'bloquear' })
  assert.equal(x.code(x.caio, 'resposta-forum', { topico: t, em: r1, cita: null, texto: 'x' }), 'interacao_nao_permitida')
  assert.equal(x.code(x.caio, 'resposta-forum', { topico: t, em: null, cita: r1, texto: 'x' }), 'interacao_nao_permitida')
  assert.equal(x.does(x.beto, 'resposta-forum', { topico: t, em: null, cita: null, texto: 'resposta direta ao tópico de ana' }).estado, 'aceito', 'a block between two others does not get in the way')
  x.ok(x.ana, 'relacao', { alvo: x.caio.uid, acao: 'bloquear' })
  assert.equal(x.code(x.caio, 'resposta-forum', { topico: t, em: null, cita: null, texto: 'x' }), 'interacao_nao_permitida', 'the topic owner blocked')
})

test('replies: the first-level list paginates in ascending order without repeating or skipping; children have their own list', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  const ids = []
  for (let i = 0; i < 5; i++) { ids.push(x.replies([x.beto, x.caio][i % 2], t, `resposta ${i}`)); x.advance(1) }
  const p1 = x.s.repliesOf(t, { limite: 2 })
  const p2 = x.s.repliesOf(t, { limite: 2, antes: p1.proximo })
  const p3 = x.s.repliesOf(t, { limite: 2, antes: p2.proximo })
  assert.deepEqual([...p1.itens, ...p2.itens, ...p3.itens].map((i) => i.id), ids)
  assert.equal(p3.proximo, null)
  assert.equal(codeOf(() => x.s.repliesOf(t, { em: 'ob_x' })), 'nao_encontrado')
  assert.equal(codeOf(() => x.s.repliesOf(t, { em: t })), 'nao_encontrado', 'the topic is not a reply')
  const f = x.replies(x.ana, t, 'filha', { em: ids[0] })
  assert.equal(codeOf(() => x.s.repliesOf(t, { em: f })), 'nao_encontrado', 'a child has no children')
})

test('deleting a first-level reply hides its children (reading them gives 410); the topic count follows', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  const r1 = x.replies(x.beto, t, 'mãe')
  x.replies(x.caio, t, 'filha', { em: r1 })
  assert.equal(x.s.topicDetail(t, {}).respostas, 2)
  x.ok(x.beto, 'remocao-pelo-autor', { alvo: r1 })
  assert.equal(codeOf(() => x.s.repliesOf(t, { em: r1 })), 'removido')
  assert.equal(x.s.repliesOf(t, {}).itens.length, 0)
  assert.equal(x.s.topicDetail(t, {}).respostas, 1, 'the child is still alive in the store')
})

// ---------- editing ----------

test('edit the topic: author only, within 30 minutes, up to 5 times; the history brings every signed version', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { titulo: 'Título original', texto: 'Texto original do tópico.' })
  assert.equal(x.code(x.beto, 'topico-editar', { topico: t, titulo: 'Título roubado', texto: 'Texto roubado.', tags: [] }), 'sem_permissao')
  assert.equal(x.code(x.mod, 'topico-editar', { topico: t, titulo: 'Título do mod', texto: 'Moderador não edita.', tags: [] }), 'sem_permissao')
  x.advance(60)
  const e1 = x.ok(x.ana, 'topico-editar', { topico: t, titulo: 'Título corrigido', texto: 'Texto corrigido do tópico.', tags: ['revisado'] })
  const d = x.s.topicDetail(t, {})
  assert.deepEqual([d.titulo, d.texto, d.tags, d.editado, d.versoes], ['Título corrigido', 'Texto corrigido do tópico.', ['revisado'], true, 2])
  assert.equal(d.envelope.objeto.id, e1.id, 'the served envelope is that of the latest version')
  const h = x.s.historyOf(t, {})
  assert.deepEqual(h.itens.map((i) => [i.versao, i.envelope.objeto.tipo, i.envelope.objeto.corpo.titulo]), [[1, 'topico', 'Título original'], [2, 'topico-editar', 'Título corrigido']])
  assert.equal(x.s.topicsOf(x.c, {}).itens[0].editado, true)
  assert.equal(x.s.topicsOf(x.c, {}).itens[0].titulo, 'Título corrigido')
  assert.equal(x.rele.objeto(t).objeto.corpo.titulo, 'Título original', 'the original object stays what was signed')
})

test('edit: the window closes at exactly 30 minutes, the maximum is 5 edits and a locked topic cannot be edited', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  const edits = (n) => x.does(x.ana, 'topico-editar', { topico: t, titulo: `Título ${n}`, texto: `Texto ${n} do tópico.`, tags: [] })
  for (let i = 1; i <= STRUCTURE.topicEdits; i++) { assert.equal(edits(i).estado, 'aceito', `edit ${i}`); x.advance(10) }
  assert.equal(codeOf(() => edits(6)), 'limite_de_estrutura')
  const y = forum()
  const t2 = y.topico(y.ana, y.c)
  y.advance(TIMES.janelaDeEdicaoDoTopicoS)
  assert.equal(y.does(y.ana, 'topico-editar', { topico: t2, titulo: 'No limite', texto: 'Aos 30 minutos exatos ainda vale.', tags: [] }).estado, 'aceito')
  y.advance(1)
  const e = errorOf(() => y.ok(y.ana, 'topico-editar', { topico: t2, titulo: 'Tarde', texto: 'Um segundo depois, não.', tags: [] }))
  assert.equal(e.codigo, 'fora_da_janela')
  const z = forum()
  const t3 = z.topico(z.ana, z.c)
  z.ok(z.mod, 'topico-gestao', { topico: t3, acao: 'trancar', comunidade: null, categoria: null })
  assert.equal(z.code(z.ana, 'topico-editar', { topico: t3, titulo: 'Trancado', texto: 'Não edita trancado.', tags: [] }), 'trancado')
})

test('editing reindexes search and tags; a new mention notifies, an old one does not notify again', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { titulo: 'Tema antigo', texto: `Oi @${x.beto.handle} tudo bem` })
  const beforeBeto = notices(x, x.beto).filter((n) => n === 'mencao').length
  assert.equal(x.s.buscar({ q: 'antigo' }, x.m.relogio.agora).topicos.length, 1)
  x.ok(x.ana, 'topico-editar', { topico: t, titulo: 'Tema moderno', texto: `Oi @${x.beto.handle} e @${x.caio.handle} tudo bem`, tags: [] })
  assert.equal(x.s.buscar({ q: 'antigo' }, x.m.relogio.agora).topicos.length, 0)
  assert.equal(x.s.buscar({ q: 'moderno' }, x.m.relogio.agora).topicos.length, 1)
  assert.equal(notices(x, x.beto).filter((n) => n === 'mencao').length, beforeBeto, 'beto had already been notified')
  assert.equal(notices(x, x.caio)[0], 'mencao')
})

// ---------- enquete ----------

test('poll: single secret vote, count per option, "voce" only for whoever reads with a credential, and it closes at the deadline', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { enquete: { opcoes: ['Planilha', 'Papel', 'Caderno'], encerraEm: x.m.relogio.agora + 7200 } })
  const deadline = x.m.relogio.agora + 7200
  assert.deepEqual(x.s.topicDetail(t, {}).enquete, { opcoes: [{ texto: 'Planilha', votos: 0 }, { texto: 'Papel', votos: 0 }, { texto: 'Caderno', votos: 0 }], encerraEm: deadline, encerrada: false, total: 0, voce: null })
  const v = x.ok(x.beto, 'voto', { topico: t, opcao: 1 })
  x.ok(x.caio, 'voto', { topico: t, opcao: 1 })
  x.ok(x.ana, 'voto', { topico: t, opcao: 0 })
  assert.equal(x.code(x.beto, 'voto', { topico: t, opcao: 2 }), 'ja_existe', 'no vote change')
  const e = x.s.topicDetail(t, {}).enquete
  assert.deepEqual(e.opcoes.map((o) => o.votos), [1, 2, 0])
  assert.equal(e.total, 3)
  assert.equal(x.s.topicDetail(t, { credencial: x.como(x.beto) }).enquete.voce, 1)
  assert.equal(x.s.topicDetail(t, { credencial: x.como(x.mod) }).enquete.voce, null)
  assert.equal(x.m.store.objeto(v.id).envelope, null, 'the vote envelope is not stored')
  assert.equal(codeOf(() => x.rele.objeto(v.id)), 'nao_encontrado')
  assert.equal(JSON.stringify(x.s.topicDetail(t, {}).enquete).includes('rvr_'), false, 'the poll brings no uid: who voted does not appear')
  x.advance(7200)
  assert.equal(x.code(x.mod, 'voto', { topico: t, opcao: 0 }), 'enquete_encerrada')
  assert.equal(x.s.topicDetail(t, {}).enquete.encerrada, true)
})

test('vote: an option that does not exist, a topic without a poll, whoever is not a member and the 1-hour grace period', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { enquete: { opcoes: ['Sim', 'Não'], encerraEm: x.m.relogio.agora + 86400 } })
  const without = x.topico(x.ana, x.c, { titulo: 'Sem enquete' })
  assert.equal(x.code(x.beto, 'voto', { topico: t, opcao: 2 }), 'esquema')
  assert.equal(x.code(x.beto, 'voto', { topico: without, opcao: 0 }), 'esquema')
  assert.equal(x.code(x.rover(), 'voto', { topico: t, opcao: 0 }), 'nao_e_membro')
  const newValue = x.rover()
  x.entra(newValue, x.c, { wait: false })
  const e = errorOf(() => x.ok(newValue, 'voto', { topico: t, opcao: 0 }))
  assert.equal(e.codigo, 'em_carencia', 'the vote of someone who just joined does not count (anti-raid)')
  x.advance(3600)
  assert.equal(x.does(newValue, 'voto', { topico: t, opcao: 0 }).estado, 'aceito')
  x.gestao(x.dono, x.c, x.caio, 'banir', 'spam')
  assert.equal(x.code(x.caio, 'voto', { topico: t, opcao: 0 }), 'banido')
})

// ---------- fixar, trancar, mover (pin, lock, move) ----------

test('pin and unpin: moderator only; pinned come first on the first page; at most 3', () => {
  const x = forum()
  const ts = [1, 2, 3, 4].map((i) => { const t = x.topico(x.ana, x.c, { titulo: `Tópico ${i}` }); x.advance(1); return t })
  assert.equal(x.code(x.ana, 'topico-gestao', { topico: ts[0], acao: 'fixar', comunidade: null, categoria: null }), 'sem_permissao', 'not even the author can pin')
  assert.equal(x.code(x.rover(), 'topico-gestao', { topico: ts[0], acao: 'fixar', comunidade: null, categoria: null }), 'nao_e_membro')
  for (const t of ts.slice(0, 3)) x.ok(x.mod, 'topico-gestao', { topico: t, acao: 'fixar', comunidade: null, categoria: null })
  assert.equal(x.code(x.mod, 'topico-gestao', { topico: ts[0], acao: 'fixar', comunidade: null, categoria: null }), 'ja_existe')
  assert.equal(x.code(x.mod, 'topico-gestao', { topico: ts[3], acao: 'fixar', comunidade: null, categoria: null }), 'limite_de_estrutura')
  const page = x.s.topicsOf(x.c, {})
  assert.deepEqual(page.fixados.map((t) => t.id), [ts[2], ts[1], ts[0]])
  assert.deepEqual(page.itens.map((t) => t.id), [ts[3]], 'the pinned one does not repeat in the list')
  assert.equal(x.s.topicsOf(x.c, {}).fixados[0].fixado, true)
  x.ok(x.dono, 'topico-gestao', { topico: ts[0], acao: 'desafixar', comunidade: null, categoria: null })
  assert.equal(x.code(x.dono, 'topico-gestao', { topico: ts[0], acao: 'desafixar', comunidade: null, categoria: null }), 'ja_existe')
  assert.equal(x.s.topicsOf(x.c, {}).fixados.length, 2)
  const segment = x.s.topicsOf(x.c, { limite: 1 })
  assert.equal(x.s.topicsOf(x.c, { limite: 1, antes: segment.proximo }).fixados, undefined, 'the second page does not repeat the pinned ones')
})

test('move: needs a moderator role on both sides; the id and the replies stay; the destination category must exist', () => {
  const x = forum()
  const destOwner = x.rover()
  const dest = x.comunidade(destOwner, { categorias: ['Arquivo'], nome: 'Destino de tópicos' })
  const t = x.topico(x.ana, x.c, { categoria: 'Dúvidas' })
  const r = x.replies(x.beto, t, 'uma resposta')
  const move = (who, community, category = null) => x.code(who, 'topico-gestao', { topico: t, acao: 'mover', comunidade: community, categoria: category })
  assert.equal(move(x.mod, dest), 'nao_e_membro', 'a moderator of the origin only does not move to where they are not a member')
  x.entra(x.mod, dest, { wait: false })
  assert.equal(move(x.mod, dest), 'sem_permissao', 'regular member at the destination')
  assert.equal(move(x.ana, dest), 'sem_permissao', 'the author does not move either')
  x.entra(x.beto, dest, { wait: false })
  assert.equal(move(destOwner, dest), 'nao_e_membro', 'the destination owner is not from the origin')
  x.gestao(destOwner, dest, x.mod, 'promover')
  assert.equal(move(x.mod, dest, 'Inexistente'), 'esquema', 'category the destination does not have')
  assert.equal(move(x.mod, dest, 'Arquivo'), 'ok')
  assert.equal(x.s.topicDetail(t, {}).comunidade, dest)
  assert.equal(x.s.topicDetail(t, {}).categoria, 'Arquivo')
  assert.deepEqual(x.s.topicsOf(x.c, {}).itens, [], 'left the origin')
  assert.deepEqual(x.s.topicsOf(dest, {}).itens.map((i) => i.id), [t])
  assert.deepEqual(x.s.repliesOf(t, {}).itens.map((i) => i.id), [r], 'the replies go along')
  assert.equal(x.m.store.objeto(t).ctx, dest)
  // whoever was moderator of the origin only loses power over the topic
  assert.equal(x.code(x.dono, 'topico-gestao', { topico: t, acao: 'fixar', comunidade: null, categoria: null }), 'nao_e_membro')
  assert.equal(x.does(x.mod, 'topico-gestao', { topico: t, acao: 'fixar', comunidade: null, categoria: null }).estado, 'aceito')
})

test('moving within the same community only changes the category; with no change at all it is "ja_existe"', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { categoria: 'Dúvidas' })
  assert.equal(x.code(x.mod, 'topico-gestao', { topico: t, acao: 'mover', comunidade: x.c, categoria: 'Dúvidas' }), 'ja_existe')
  assert.equal(x.does(x.mod, 'topico-gestao', { topico: t, acao: 'mover', comunidade: x.c, categoria: 'Dicas' }).estado, 'aceito')
  assert.equal(x.s.topicDetail(t, {}).categoria, 'Dicas')
  assert.equal(x.does(x.mod, 'topico-gestao', { topico: t, acao: 'mover', comunidade: x.c, categoria: null }).estado, 'aceito')
  assert.equal(x.s.topicDetail(t, {}).categoria, null)
})

test('moving from a closed community to an open one requires being the OWNER of the closed one: it makes the content public', () => {
  const x = forum()
  const closed = x.comunidade(x.dono, { acesso: 'fechada', nome: 'Fechada de origem' })
  const open = x.comunidade(x.dono, { nome: 'Aberta de destino' })
  for (const r of [x.mod, x.ana]) { x.gestao(x.dono, closed, r, 'convidar'); x.ok(r, 'comunidade-adesao', { comunidade: closed, acao: 'aceitar-convite' }) }
  x.gestao(x.dono, closed, x.mod, 'promover')
  x.entra(x.mod, open, { wait: false })
  x.gestao(x.dono, open, x.mod, 'promover')
  x.advance(3601)
  const t = x.topico(x.ana, closed)
  assert.equal(x.code(x.mod, 'topico-gestao', { topico: t, acao: 'mover', comunidade: open, categoria: null }), 'sem_permissao', 'a moderator with a role on both sides still cannot publish what is closed')
  assert.equal(codeOf(() => x.s.topicDetail(t, {})), 'nao_encontrado')
  assert.equal(x.does(x.dono, 'topico-gestao', { topico: t, acao: 'mover', comunidade: open, categoria: null }).estado, 'aceito')
  assert.equal(x.s.topicDetail(t, {}).comunidade, open)
  // the opposite (open to closed) is for the moderator: the content only becomes more restricted
  const t2 = x.topico(x.dono, open)
  assert.equal(x.does(x.dono, 'topico-gestao', { topico: t2, acao: 'mover', comunidade: closed, categoria: null }).estado, 'aceito')
  assert.equal(codeOf(() => x.s.topicDetail(t2, {})), 'nao_encontrado')
})

// ---------- resolveu ----------

test('mark a reply as "resolveu" (solved): topic author and moderators; the new one replaces; unmark with null; notifies the reply author', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  const r1 = x.replies(x.beto, t, 'tente assim')
  const r2 = x.replies(x.caio, t, 'ou assim')
  assert.equal(x.code(x.beto, 'topico-resolvido', { topico: t, resposta: r1 }), 'sem_permissao', 'another member cannot mark')
  x.ok(x.ana, 'topico-resolvido', { topico: t, resposta: r1 })
  assert.equal(notices(x, x.beto)[0], 'resolveu')
  let d = x.s.topicDetail(t, {})
  assert.deepEqual([d.resolvido, d.resolvidoPor.resposta, d.resolvidoPor.por.uid], [true, r1, x.ana.uid])
  assert.equal(x.s.repliesOf(t, {}).itens.find((i) => i.id === r1).resolveu, true)
  assert.equal(x.s.topicsOf(x.c, {}).itens[0].resolvido, true)
  x.ok(x.mod, 'topico-resolvido', { topico: t, resposta: r2 })
  d = x.s.topicDetail(t, {})
  assert.equal(d.resolvidoPor.resposta, r2)
  assert.equal(x.s.repliesOf(t, {}).itens.find((i) => i.id === r1).resolveu, false, 'only one per topic')
  x.ok(x.ana, 'topico-resolvido', { topico: t, resposta: null })
  assert.equal(x.s.topicDetail(t, {}).resolvido, false)
  assert.equal(x.code(x.ana, 'topico-resolvido', { topico: t, resposta: t }), 'alvo_desconhecido', 'the topic is not a reply')
  const other = x.topico(x.ana, x.c, { titulo: 'Outro' })
  assert.equal(x.code(x.ana, 'topico-resolvido', { topico: other, resposta: r1 }), 'alvo_desconhecido', 'reply from another topic')
})

test('if the reply that solved it is deleted, the "resolveu" mark drops', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  const r1 = x.replies(x.beto, t, 'a solução')
  x.ok(x.ana, 'topico-resolvido', { topico: t, resposta: r1 })
  x.ok(x.beto, 'remocao-pelo-autor', { alvo: r1 })
  assert.equal(x.s.topicDetail(t, {}).resolvido, false)
})

// ---------- ordering ----------

test('orders: recentes (creation), ativos (last reply) and sem-resposta; filters by category and tag; cursor without repeats', () => {
  const x = forum()
  const mk = (title, extra) => { const t = x.topico(x.ana, x.c, { titulo: title, ...extra }); x.advance(1); return t }
  const a = mk('Primeiro', { categoria: 'Dúvidas', tags: ['planilhas'] })
  const b = mk('Segundo', { categoria: 'Dicas' })
  const c = mk('Terceiro', { categoria: 'Dúvidas', tags: ['planilhas'] })
  x.replies(x.beto, a, 'resposta no primeiro')
  const ids = (o) => x.s.topicsOf(x.c, o).itens.map((i) => i.id)
  assert.deepEqual(ids({}), [c, b, a], 'recentes')
  assert.deepEqual(ids({ ordem: 'ativos' }), [a, c, b], 'the first one went up with the reply')
  assert.deepEqual(ids({ ordem: 'sem-resposta' }), [c, b])
  assert.deepEqual(ids({ categoria: 'Dúvidas' }), [c, a])
  assert.deepEqual(ids({ tag: 'planilhas' }), [c, a])
  assert.deepEqual(ids({ categoria: 'Dúvidas', tag: 'planilhas', ordem: 'sem-resposta' }), [c])
  assert.equal(codeOf(() => x.s.topicsOf(x.c, { ordem: 'aleatoria' })), 'esquema')
  assert.equal(codeOf(() => x.s.topicsOf(x.c, { tag: 'Maiuscula' })), 'esquema')
  const p1 = x.s.topicsOf(x.c, { limite: 2, ordem: 'ativos' })
  const p2 = x.s.topicsOf(x.c, { limite: 2, ordem: 'ativos', antes: p1.proximo })
  assert.deepEqual([...p1.itens, ...p2.itens].map((i) => i.id), [a, c, b])
  assert.equal(p2.proximo, null)
  assert.equal(x.s.listedCommunities({ ordem: 'ativas' }).itens.length, 1)
})

test('the activity of a topic moves the community up in the "ativas" list', () => {
  const x = forum()
  const other = x.comunidade(x.rover(), { nome: 'Outra comunidade qualquer' })
  assert.deepEqual(x.s.listedCommunities({ ordem: 'ativas' }).itens.map((i) => i.id), [other, x.c], 'the newest first while nobody speaks')
  x.topico(x.ana, x.c)
  assert.deepEqual(x.s.listedCommunities({ ordem: 'ativas' }).itens.map((i) => i.id), [x.c, other])
})

// ---------- delete and hide ----------

test('the author deletes the topic: it disappears from list, detail and search, the replies go with it and the text is emptied', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { titulo: 'Tópico para apagar', tags: ['apagar'] })
  x.replies(x.beto, t, 'uma resposta qualquer')
  x.ok(x.ana, 'remocao-pelo-autor', { alvo: t })
  assert.deepEqual(x.s.topicsOf(x.c, {}).itens, [])
  assert.equal(codeOf(() => x.s.topicDetail(t, {})), 'removido')
  assert.equal(codeOf(() => x.s.repliesOf(t, {})), 'removido')
  assert.equal(codeOf(() => x.rele.objeto(t)), 'removido')
  assert.equal(x.s.buscar({ q: 'apagar' }, x.m.relogio.agora).topicos.length, 0)
  assert.equal(x.m.store.um('SELECT texto, titulo FROM topicos WHERE id = :t', { t }).titulo, '')
  assert.equal(x.m.store.um('SELECT COUNT(*) AS n FROM tags_uso WHERE objeto = :t', { t }).n, 0)
  assert.equal(x.code(x.caio, 'resposta-forum', { topico: t, em: null, cita: null, texto: 'tarde demais' }), 'alvo_removido')
})

test('react to a topic and to a forum reply: members only; one per author; the count shows on the reply', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  const r = x.replies(x.beto, t, 'resposta')
  assert.equal(x.code(x.rover(), 'reacao', { alvo: t, reacao: 'curtir' }), 'nao_e_membro')
  x.ok(x.caio, 'reacao', { alvo: r, reacao: 'util' })
  x.ok(x.ana, 'reacao', { alvo: r, reacao: 'util' })
  x.ok(x.ana, 'reacao', { alvo: t, reacao: 'curtir' })
  assert.equal(x.code(x.caio, 'reacao', { alvo: r, reacao: 'util' }), 'ja_reagiu')
  assert.deepEqual(x.s.repliesOf(t, {}).itens[0].reacoes, { curtir: 0, util: 2 })
  // 0.8.0: switching replaces; the four postagem reactions are not valid in the forum
  x.ok(x.caio, 'reacao', { alvo: r, reacao: 'curtir' })
  assert.deepEqual(x.s.repliesOf(t, {}).itens[0].reacoes, { curtir: 1, util: 1 })
  for (const reaction of ['amei', 'haha', 'uau', 'abraco']) {
    assert.equal(x.code(x.beto, 'reacao', { alvo: t, reacao: reaction }), 'esquema', `topic: ${reaction}`)
    assert.equal(x.code(x.ana, 'reacao', { alvo: r, reacao: reaction }), 'esquema', `forum reply: ${reaction}`)
  }
  assert.deepEqual(x.s.repliesOf(t, {}).itens[0].reacoes, { curtir: 1, util: 1 }, 'the refusal changes the reaction of nobody')
  x.gestao(x.dono, x.c, x.caio, 'banir', 'spam')
  assert.equal(x.code(x.caio, 'reacao', { alvo: t, reacao: 'curtir' }), 'banido')
  // reaction to an object that is not a valid target
  assert.equal(x.code(x.ana, 'reacao', { alvo: x.c, reacao: 'curtir' }), 'esquema', 'a community is not a reaction target')
})
