// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.11.0: the database that is in production (schema of 0.10.0, with live rows) opens with today's code. Nothing is lost, nothing
// is rewritten, and the old content takes part in what is new.
import test from 'node:test'
import assert from 'node:assert/strict'
import { OLD, openOldDb } from '../helpers/old-db.js'
import { publish } from '../helpers/test-relay.js'
import { syntheticPng, publishImage } from '../helpers/media.js'

test('the production database opens: every old row reads as before and the new tables are there', () => {
  const m = openOldDb()
  try {
    const before = m.store.um('SELECT COUNT(*) AS n FROM objetos').n
    assert.equal(before, 9)
    assert.ok(m.tables().includes('anexos_removidos'))
    const post = m.rele.social.postDetail(OLD.post, {})
    assert.equal(post.envelope.objeto.corpo.texto, 'Postagem de antes da 0.11.0.')
    assert.deepEqual(post.imagens.map((i) => i.alt), ['Anexo antigo.'])
    assert.equal(post.contagens.respostas, 1)
    assert.equal('anexosRemovidos' in post, false)
    assert.equal(m.rele.social.topicDetail(OLD.top, {}).titulo, 'Tópico antigo')
    assert.equal(m.rele.social.repliesOf(OLD.top, {}).itens.length, 1)
    assert.equal(m.rele.info().versaoDoRascunho, '0.11.0')
  } finally {
    m.apagar()
  }
})

test('old authors go on: the old post, reply, topic and forum reply each take a new attachment without approval', () => {
  const m = openOldDb()
  try {
    const a = m.adotar(OLD.a)
    const b = m.adotar(OLD.b)
    assert.equal(publishImage(m, a, syntheticPng({ semente: 21 }), { alvo: OLD.post, ordem: 1, alt: 'Anexo novo.' }).estado, 'aceito')
    assert.equal(publishImage(m, b, syntheticPng({ semente: 22 }), { alvo: OLD.resp, alt: 'Na resposta antiga.' }).estado, 'aceito')
    assert.equal(publishImage(m, a, syntheticPng({ semente: 23 }), { alvo: OLD.top, alt: 'No tópico antigo.' }).estado, 'aceito')
    assert.equal(publishImage(m, a, syntheticPng({ semente: 24 }), { alvo: OLD.rf, alt: 'Na resposta de fórum antiga.' }).estado, 'aceito')
    assert.deepEqual(m.rele.social.postDetail(OLD.post, {}).imagens.map((i) => i.alt), ['Anexo antigo.', 'Anexo novo.'])
    assert.deepEqual(m.rele.social.postReplies(OLD.post, {}).itens[0].imagens.map((i) => i.alt), ['Na resposta antiga.'])
    // and the chain of the old author continues from where it stopped
    assert.equal(publish(m, a, 'postagem', { texto: 'Depois da migração.', topicos: [] }).estado, 'aceito')
  } finally {
    m.apagar()
  }
})

test('the old attachment removed by moderation marks the old post', () => {
  const m = openOldDb()
  try {
    assert.deepEqual(m.rele.midia.purge(OLD.img, { motivo: 'denúncia procedente', motivoPublico: 'regras' }), { expurgado: true, objetos: 1 })
    const post = m.rele.social.postDetail(OLD.post, {})
    assert.equal('imagens' in post, false)
    assert.equal(post.anexosRemovidos, 1)
  } finally {
    m.apagar()
  }
})
