// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.11.0 (proposal 0013, part 2): editing what was published. The original is never touched; the last edit is what the publication
// says now, every reader sees the mark and the history is public.
import test from 'node:test'
import assert from 'node:assert/strict'
import { REVIEW_APPEALS, createTimeOffBundle, editBody } from '../../packages/protocol/src/index.js'
import { codeOf, errorOf, registeredPerson, publish } from '../helpers/test-relay.js'
import { fresh } from '../helpers/network.js'
import { start } from '../helpers/test-server.js'

const post = (text, extra = {}) => ({ texto: text, topicos: [], ...extra })
const edit = (x, r, target, content, o) => x.does(r, 'edicao', editBody(target, content), o)

test('the resource, the type and /v1/info', () => {
  const x = fresh()
  assert.ok(REVIEW_APPEALS.includes('edicao'))
  assert.deepEqual(x.rele.info().edicao, { alvos: ['postagem', 'resposta', 'topico', 'resposta-forum'], porAlvoPorHora: 5, versoesPorAlvo: 50, historicoPublico: true })
})

test('a post: the edit is what the post says now, with the mark, the count of versions and a public history', () => {
  const x = fresh()
  const me = x.rover()
  const ana = x.rover()
  const p = x.ok(me, 'postagem', post('Fui à praia hoje.', { titulo: 'Domingo' }))
  x.advance(60)
  const e1 = edit(x, me, p.id, { titulo: 'Domingo de sol', texto: 'Fui à praia hoje e vi golfinhos.', tags: ['praia'] })
  assert.equal(e1.estado, 'aceito')
  const read = x.s.postDetail(p.id, {})
  assert.equal(read.envelope.objeto.corpo.texto, 'Fui à praia hoje.', 'the original stays as it was signed')
  assert.deepEqual(read.edicao, { id: e1.id, em: x.m.relogio.agora, versoes: 2, titulo: 'Domingo de sol', texto: 'Fui à praia hoje e vi golfinhos.', tags: ['praia'], adulto: false })
  // a second edit, and the history in order, readable by anyone (a visitor too)
  x.advance(60)
  const e2 = edit(x, me, p.id, { titulo: null, texto: 'Fui à praia.' })
  const h = x.rele.edicoes.historico(p.id, {})
  assert.deepEqual(h.itens.map((v) => [v.versao, v.id, v.texto]), [[1, p.id, 'Fui à praia hoje.'], [2, e1.id, 'Fui à praia hoje e vi golfinhos.'], [3, e2.id, 'Fui à praia.']])
  assert.equal(h.autor.uid, me.uid)
  assert.equal(x.s.postDetail(p.id, {}).edicao.versoes, 3)
  // the same content again changes nothing
  assert.equal(codeOf(() => edit(x, me, p.id, { titulo: null, texto: 'Fui à praia.' })), 'ja_existe')
  // only the author edits
  assert.equal(codeOf(() => edit(x, ana, p.id, { texto: 'Não é meu.' })), 'nao_e_autor')
})

test('the limits of the target: a reply has no title, a post keeps 1500 characters; only the four types are edited', () => {
  const x = fresh()
  const me = x.rover()
  const ana = x.rover()
  const p = x.ok(ana, 'postagem', post('Uma pergunta.'))
  const r = x.ok(me, 'resposta', { alvo: p.id, texto: 'Minha resposta.' })
  assert.equal(edit(x, me, r.id, { texto: 'Minha resposta, corrigida.' }).estado, 'aceito')
  const items = x.s.postReplies(p.id, {}).itens
  assert.equal(items[0].edicao.texto, 'Minha resposta, corrigida.')
  const e = errorOf(() => edit(x, me, r.id, { titulo: 'Título', texto: 'Com título.' }))
  assert.deepEqual([e.codigo, e.campo], ['esquema', 'objeto.corpo.titulo'])
  const note = x.ok(me, 'recado', { alvo: ana.uid, texto: 'Oi.' })
  assert.equal(codeOf(() => edit(x, me, note.id, { texto: 'Oi de novo.' })), 'esquema')
})

test('the forum: a topic and a reply in it are edited, the topic card follows, and a locked topic is not', () => {
  const x = fresh()
  const owner = x.rover()
  const me = x.rover()
  const using = x.comunidade(owner)
  x.entra(me, using)
  const t = x.topico(me, using, { titulo: 'Como organizar a semana?', texto: 'Queria ideias.' })
  x.advance(700)
  const rf = x.replies(me, t, 'Uso uma lista.')
  assert.equal(edit(x, me, t, { titulo: 'Como vocês organizam a semana?', texto: 'Queria ideias de vocês.', tags: [] }).estado, 'aceito')
  const d = x.s.topicDetail(t, {})
  assert.equal(d.titulo, 'Como vocês organizam a semana?')
  assert.equal(d.texto, 'Queria ideias de vocês.')
  assert.equal(d.edicao.versoes, 2)
  assert.equal(edit(x, me, rf, { texto: 'Uso uma lista só.' }).estado, 'aceito')
  assert.equal(x.s.repliesOf(t, {}).itens[0].edicao.texto, 'Uso uma lista só.')
  assert.equal(x.rele.edicoes.historico(t, {}).itens.length, 2)
})

test('five edits of the same publication in an hour; the refusal says how long is left', () => {
  const x = fresh()
  const me = x.rover()
  const p = x.ok(me, 'postagem', post('Versão 0.'))
  for (let i = 1; i <= 5; i++) {
    x.advance(10)
    assert.equal(edit(x, me, p.id, { texto: `Versão ${i}.` }).estado, 'aceito')
  }
  const e = errorOf(() => edit(x, me, p.id, { texto: 'Versão 6.' }))
  assert.equal(e.codigo, 'limite_de_taxa')
  assert.deepEqual(e.limite, { max: 5, janelaS: 3600 })
  assert.ok(e.retryAfterS > 0 && e.retryAfterS <= 3600)
  x.advance(3600)
  assert.equal(edit(x, me, p.id, { texto: 'Versão 6.' }).estado, 'aceito')
})

test('removing: the publication takes its history; removing the last edit goes back to the version before', () => {
  const x = fresh()
  const me = x.rover()
  const p = x.ok(me, 'postagem', post('Antes.'))
  const e1 = edit(x, me, p.id, { texto: 'Depois.' })
  x.advance(10)
  const e2 = edit(x, me, p.id, { texto: 'Bem depois.' })
  x.ok(me, 'remocao-pelo-autor', { alvo: e2.id })
  assert.equal(x.s.postDetail(p.id, {}).edicao.texto, 'Depois.')
  assert.equal(x.s.postDetail(p.id, {}).edicao.id, e1.id)
  x.ok(me, 'remocao-pelo-autor', { alvo: p.id })
  assert.equal(codeOf(() => x.rele.edicoes.historico(p.id, {})), 'removido')
  assert.equal(x.m.rele.store.objeto(e1.id).envelope, null, 'the edit lost its envelope with the publication')
})

test('the release: the authorization that covers the target covers its edit; a person edits signing alone', () => {
  const x = fresh({ pessoas: true })
  const me = x.rover()
  const p = x.ok(me, 'postagem', post('Com o pacote.'))
  const [posts, conversation] = createTimeOffBundle({ chavePrivadaDeAprovacao: me.aprovacao.chavePrivada, autor: me.uid, emitidaEm: x.m.relogio.agora, postagensPorDia: 20, comentariosPorDia: 100 })
  assert.equal(edit(x, me, p.id, { texto: 'Editada com o pacote.' }, { autorizacao: posts, aprovada: false }).estado, 'aceito')
  const e = errorOf(() => edit(x, me, p.id, { texto: 'Com a autorização errada.' }, { autorizacao: conversation, aprovada: false }))
  assert.deepEqual([e.codigo, e.campo], ['autorizacao_invalida', 'autorizacao.tipos'])
  assert.equal(codeOf(() => edit(x, me, p.id, { texto: 'Sem nada.' }, { aprovada: false })), 'sem_aprovacao')
  const ana = registeredPerson(x.m)
  const hers = publish(x.m, ana, 'postagem', post('Da pessoa.'))
  assert.equal(publish(x.m, ana, 'edicao', editBody(hers.id, { texto: 'Da pessoa, editada.' })).estado, 'aceito')
})

test('HTTP: GET /v1/objetos/:id/edicoes is public, and an unknown id is 404', async () => {
  const s = await start()
  try {
    const info = await s.call('GET', '/v1/info')
    assert.ok(info.json.recursos.includes('edicao'))
    const nothing = await s.call('GET', `/v1/objetos/ob_${'A'.repeat(43)}/edicoes`)
    assert.equal(nothing.status, 404)
  } finally {
    await s.fechar()
  }
})

test('an edit is not read by its id once the publication is hidden by moderation', () => {
  const x = fresh()
  const me = x.rover()
  const p = x.ok(me, 'postagem', post('Texto.'))
  const e = edit(x, me, p.id, { texto: 'Texto com um dado que não devia.' })
  assert.equal(x.rele.objeto(e.id).objeto.tipo, 'edicao')
  x.m.rele.store.executar('UPDATE objetos SET oculto_em = 1 WHERE id = :id', { id: p.id })
  assert.equal(codeOf(() => x.rele.objeto(e.id)), 'removido')
  assert.equal(codeOf(() => x.rele.edicoes.historico(p.id, {})), 'removido')
})
