// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.11.0 (proposal 0013): the body of an edit and the limits of each thing that can be edited.
import test from 'node:test'
import assert from 'node:assert/strict'
import { LIMITS, SOCIAL_LIMITS } from '../../packages/protocol/src/index.js'
import { EDIT_TARGETS, EDIT_BODY, EDIT_LIMITS, checkEdit, versionContent, editBody } from '../../packages/protocol/src/edits.js'

const TARGET = `ob_${'A'.repeat(43)}`
const fieldOf = (f) => f?.caminho ?? 'ok'
/** A text of exactly `n` characters that reads as words (a long run of one letter looks like a secret to the leak filter). */
const long = (n) => `${'folga boa '.repeat(Math.ceil(n / 10)).slice(0, n - 1)}a`

test('the body is closed and whole: target, title or null, text, tags and the optional +18 mark', () => {
  const body = editBody(TARGET, { texto: 'Texto novo.' })
  assert.deepEqual(body, { alvo: TARGET, titulo: null, texto: 'Texto novo.', tags: [] })
  assert.equal(EDIT_BODY(body, 'objeto.corpo'), null)
  assert.deepEqual(editBody(TARGET, { titulo: 'Com título', texto: 'Texto.', tags: ['folga'], adulto: true }), { alvo: TARGET, titulo: 'Com título', texto: 'Texto.', tags: ['folga'], adulto: true })
  for (const [bad, field] of [
    [{ ...body, extra: 1 }, 'objeto.corpo.extra'],
    [(({ titulo: _t, ...r }) => r)(body), 'objeto.corpo.titulo'],
    [(({ tags: _t, ...r }) => r)(body), 'objeto.corpo.tags'],
    [{ ...body, alvo: 'rvr_' + 'A'.repeat(22) }, 'objeto.corpo.alvo'],
    [{ ...body, texto: '' }, 'objeto.corpo.texto'],
    [{ ...body, texto: 'a'.repeat(2001) }, 'objeto.corpo.texto'],
    [{ ...body, texto: '<b>negrito</b>' }, 'objeto.corpo.texto'],
    [{ ...body, texto: 'fale comigo em pessoa@exemplo.com' }, 'objeto.corpo.texto'],
    [{ ...body, titulo: 'duas\nlinhas' }, 'objeto.corpo.titulo'],
    [{ ...body, tags: ['Com Maiúscula'] }, 'objeto.corpo.tags[0]'],
    [{ ...body, tags: ['a1', 'a1'] }, 'objeto.corpo.tags'],
    [{ ...body, adulto: false }, 'objeto.corpo.adulto']
  ]) assert.equal(fieldOf(EDIT_BODY(bad, 'objeto.corpo')), field, field)
  assert.deepEqual([...EDIT_TARGETS], ['postagem', 'resposta', 'topico', 'resposta-forum'])
  assert.deepEqual({ ...EDIT_LIMITS }, { porAlvoPorHora: 5, versoesPorAlvo: 50 })
})

test('each target keeps the limits it had when it was published', () => {
  const from = (extra) => editBody(TARGET, { texto: 'Texto.', ...extra })
  // post: optional title, 1500 characters, 3 tags, +18
  assert.equal(checkEdit('postagem', from({ titulo: 'Título', tags: ['a1', 'b2', 'c3'], adulto: true })), null)
  assert.equal(checkEdit('postagem', from({ texto: long(LIMITS.postagem.max) })), null)
  assert.equal(fieldOf(checkEdit('postagem', from({ texto: long(LIMITS.postagem.max + 1) }))), 'objeto.corpo.texto')
  assert.equal(fieldOf(checkEdit('postagem', from({ tags: ['a1', 'b2', 'c3', 'd4'] }))), 'objeto.corpo.tags')
  assert.equal(fieldOf(checkEdit('postagem', from({ titulo: 'a'.repeat(LIMITS.titulo.max + 1) }))), 'objeto.corpo.titulo')
  // reply: text only, 1000 characters
  assert.equal(checkEdit('resposta', from({ texto: long(LIMITS.resposta.max) })), null)
  assert.equal(fieldOf(checkEdit('resposta', from({ texto: long(LIMITS.resposta.max + 1) }))), 'objeto.corpo.texto')
  assert.equal(fieldOf(checkEdit('resposta', from({ titulo: 'Não tem' }))), 'objeto.corpo.titulo')
  assert.equal(fieldOf(checkEdit('resposta', from({ tags: ['a1'] }))), 'objeto.corpo.tags')
  assert.equal(fieldOf(checkEdit('resposta', from({ adulto: true }))), 'objeto.corpo.adulto')
  // topic: the title is required (3 to 120), 2000 characters, 5 tags
  assert.equal(checkEdit('topico', from({ titulo: 'Como vocês fazem?', texto: long(SOCIAL_LIMITS.topicoTexto.max), tags: ['a1', 'b2', 'c3', 'd4', 'e5'] })), null)
  assert.equal(fieldOf(checkEdit('topico', from({}))), 'objeto.corpo.titulo')
  assert.equal(fieldOf(checkEdit('topico', from({ titulo: 'ab' }))), 'objeto.corpo.titulo')
  assert.equal(fieldOf(checkEdit('topico', from({ titulo: 'Título bom', adulto: true }))), 'objeto.corpo.adulto')
  // forum reply: text only, 1500 characters
  assert.equal(checkEdit('resposta-forum', from({ texto: long(SOCIAL_LIMITS.respostaForum.max) })), null)
  assert.equal(fieldOf(checkEdit('resposta-forum', from({ texto: long(SOCIAL_LIMITS.respostaForum.max + 1) }))), 'objeto.corpo.texto')
  assert.equal(fieldOf(checkEdit('resposta-forum', from({ titulo: 'Não tem' }))), 'objeto.corpo.titulo')
  // nothing else is edited
  for (const type of ['recado', 'depoimento', 'perfil', 'pagina-publicar', 'imagem', 'edicao']) assert.equal(fieldOf(checkEdit(type, from({}))), 'objeto.corpo.alvo', type)
})

test('the content of a version reads the same four fields from the original object and from an edit', () => {
  assert.deepEqual(versionContent({ tipo: 'postagem', corpo: { texto: 'Oi.', topicos: ['folga'], adulto: true } }), { titulo: null, texto: 'Oi.', tags: ['folga'], adulto: true })
  assert.deepEqual(versionContent({ tipo: 'postagem', corpo: { titulo: 'T', texto: 'Oi.', topicos: [] } }), { titulo: 'T', texto: 'Oi.', tags: [], adulto: false })
  assert.deepEqual(versionContent({ tipo: 'resposta', corpo: { alvo: TARGET, texto: 'Sim.' } }), { titulo: null, texto: 'Sim.', tags: [], adulto: false })
  assert.deepEqual(versionContent({ tipo: 'topico', corpo: { titulo: 'T', texto: 'Oi.', tags: ['a1'] } }), { titulo: 'T', texto: 'Oi.', tags: ['a1'], adulto: false })
  assert.deepEqual(versionContent({ tipo: 'edicao', corpo: editBody(TARGET, { titulo: 'N', texto: 'Novo.', tags: ['b2'] }) }), { titulo: 'N', texto: 'Novo.', tags: ['b2'], adulto: false })
})
