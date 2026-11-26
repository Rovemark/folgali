// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.11.0 (proposal 0013, owner decision of 2026-11-25): free media. The `imagem` object enters without human approval, attaches to a
// post, a reply, a forum topic and a forum reply, and what protects the network is the limits, the report and the moderation.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import {
  ATTACHMENT_TARGETS, REQUIRES_APPROVAL, MEDIA_LIMITS, FEATURE_FREE_MEDIA, REQUIRABLE_TYPES_V3, imageBody, whatUnlocks
} from '../../packages/protocol/src/index.js'
import { hashPath } from '../../packages/relay/src/media.js'
import { codeOf, errorOf, newWorld, registeredPerson, publish, registeredRover } from '../helpers/test-relay.js'
import { send, worldWithMedia, syntheticPng, publishImage } from '../helpers/media.js'
import { as } from '../helpers/network.js'
import { TOKEN, start } from '../helpers/test-server.js'

const post = (text = 'Olhem a foto.') => ({ texto: text, topicos: [] })

/** A world with media on, a community, a topic and a forum reply by `autor`. */
function forum(m, author) {
  const using = publish(m, author, 'comunidade-criar', { nome: `Fotos ${randomBytes(3).toString('hex')}`, descricao: 'Um lugar', regras: 'Seja gentil.', tema: 'rovers', acesso: 'aberta', categorias: [] }).id
  m.advance(3601)
  const topic = publish(m, author, 'topico', { comunidade: using, categoria: null, titulo: 'Com foto', texto: 'Vejam.', tags: [], enquete: null }).id
  const reply = publish(m, author, 'resposta-forum', { topico: topic, em: null, cita: null, texto: 'Mais uma.' }).id
  return { com: using, topico: topic, resposta: reply }
}

test('the protocol: imagem asks for no approval, stays out of the signed-policy list, and names where it attaches', () => {
  assert.equal(REQUIRES_APPROVAL.imagem, false)
  assert.equal(REQUIRABLE_TYPES_V3.includes('imagem'), false)
  assert.deepEqual([...ATTACHMENT_TARGETS], ['postagem', 'resposta', 'topico', 'resposta-forum'])
  assert.equal(FEATURE_FREE_MEDIA, 'midia-livre')
})

test('a rover attaches up to 4 images to its own post without any approval, and the post reads with them in order', () => {
  const m = worldWithMedia()
  try {
    const r = m.rover()
    const p = publish(m, r, 'postagem', post())
    for (let i = 0; i < MEDIA_LIMITS.anexosPorPostagem; i++) {
      const img = publishImage(m, r, syntheticPng({ semente: 10 + i }), { alvo: p.id, ordem: i, alt: `Foto ${i}.` })
      assert.equal(img.estado, 'aceito')
      // nothing but the object is stored: no approval travelled with it
      assert.deepEqual(Object.keys(JSON.parse(m.store.objeto(img.id).envelope)), ['objeto'])
    }
    const read = m.rele.social.postDetail(p.id, {})
    assert.deepEqual(read.imagens.map((i) => [i.ordem, i.alt]), [[0, 'Foto 0.'], [1, 'Foto 1.'], [2, 'Foto 2.'], [3, 'Foto 3.']])
    assert.equal('anexosRemovidos' in read, false)
    const fifth = errorOf(() => publishImage(m, r, syntheticPng({ semente: 99 }), { alvo: p.id, ordem: 0 }))
    assert.equal(fifth.codigo, 'limite_de_estrutura')
    assert.match(fifth.message, /no máximo 4 imagens\. Remova uma antes de anexar outra\.$/)
  } finally {
    m.apagar()
  }
})

test('an image attaches to a reply, a forum topic and a forum reply, and each one reads with its own images', () => {
  const m = worldWithMedia()
  try {
    const r = m.rover()
    const p = publish(m, r, 'postagem', post())
    const resp = publish(m, r, 'resposta', { alvo: p.id, texto: 'E esta.' })
    const f = forum(m, r)
    const inReply = publishImage(m, r, syntheticPng({ semente: 1 }), { alvo: resp.id, alt: 'Na resposta.' })
    const inTopic = publishImage(m, r, syntheticPng({ semente: 2 }), { alvo: f.topico, alt: 'No tópico.' })
    const inForum = publishImage(m, r, syntheticPng({ semente: 3 }), { alvo: f.resposta, alt: 'Na resposta do fórum.' })
    for (const x of [inReply, inTopic, inForum]) assert.equal(x.estado, 'aceito')
    const replies = m.rele.social.postReplies(p.id, {}).itens
    assert.deepEqual(replies[0].imagens.map((i) => i.alt), ['Na resposta.'])
    assert.equal('imagens' in m.rele.social.postDetail(p.id, {}), false, 'the post itself has no attachment')
    assert.deepEqual(m.rele.social.topicDetail(f.topico, {}).imagens.map((i) => i.alt), ['No tópico.'])
    assert.deepEqual(m.rele.social.repliesOf(f.topico, {}).itens[0].imagens.map((i) => i.alt), ['Na resposta do fórum.'])
    // the file is served once an object on air cites it
    assert.equal(m.rele.midia.ler(inReply.objeto.corpo.hash).tipo, 'image/png')
  } finally {
    m.apagar()
  }
})

test('only the author attaches; a wall note or a profile is not a place for an attachment; a removed target refuses', () => {
  const m = worldWithMedia()
  try {
    const r = m.rover()
    const other = m.rover()
    const p = publish(m, r, 'postagem', post())
    const foreign = errorOf(() => publishImage(m, other, syntheticPng({ semente: 1 }), { alvo: p.id }))
    assert.equal(foreign.codigo, 'sem_permissao')
    assert.equal(foreign.campo, 'objeto.corpo.alvo')
    const note = publish(m, r, 'recado', { alvo: other.uid, texto: 'Oi.' })
    const inNote = errorOf(() => publishImage(m, r, syntheticPng({ semente: 2 }), { alvo: note.id }))
    assert.equal(inNote.codigo, 'alvo_desconhecido')
    assert.match(inNote.message, /postagem, resposta, topico, resposta-forum/)
    publish(m, r, 'remocao-pelo-autor', { alvo: p.id })
    assert.equal(codeOf(() => publishImage(m, r, syntheticPng({ semente: 3 }), { alvo: p.id })), 'alvo_removido')
  } finally {
    m.apagar()
  }
})

test('removing the reply takes its attachments with it, and the file leaves the disk', () => {
  const m = worldWithMedia()
  try {
    const r = m.rover()
    const p = publish(m, r, 'postagem', post())
    const resp = publish(m, r, 'resposta', { alvo: p.id, texto: 'Com foto.' })
    const img = publishImage(m, r, syntheticPng({ semente: 5 }), { alvo: resp.id })
    assert.equal(m.arquivos().length, 1)
    publish(m, r, 'remocao-pelo-autor', { alvo: resp.id })
    assert.equal(m.store.objeto(img.id).envelope, null)
    // nobody reads it from this moment on; the bytes leave the disk when the upload window (1 hour) closes
    assert.equal(codeOf(() => m.rele.midia.ler(img.objeto.corpo.hash)), 'nao_encontrado')
    m.advance(MEDIA_LIMITS.pendenteS + 1)
    m.rele.midia.collect()
    assert.deepEqual(m.arquivos(), [])
  } finally {
    m.apagar()
  }
})

test('an account of a non-verified issuer (the outside agent) also posts an image alone, after the account-age wait; a verified one from day one', () => {
  const m = worldWithMedia({ novatos: true })
  try {
    const agent = m.rover()
    const p = publish(m, agent, 'postagem', post())
    const early = errorOf(() => send(m, agent, syntheticPng({ semente: 1 })))
    assert.equal(early.codigo, 'conta_nova')
    assert.equal(early.retryAfterS, MEDIA_LIMITS.idadeMinimaS)
    assert.match(early.message, /A conta envia mídia depois de 1 dia de idade\. Libera em 1 dia\.$/)
    assert.equal(early.libera, whatUnlocks('conta_nova'))
    m.advance(MEDIA_LIMITS.idadeMinimaS)
    // (the post is a day old now; a fresh one is the target)
    const p2 = publish(m, agent, 'postagem', post('No dia seguinte.'))
    assert.equal(publishImage(m, agent, syntheticPng({ semente: 1 }), { alvo: p2.id }).estado, 'aceito')
    void p
  } finally {
    m.apagar()
  }
  const v = worldWithMedia({ novatos: true, verificados: true })
  try {
    const rover = v.rover()
    const p = publish(v, rover, 'postagem', post())
    assert.equal(publishImage(v, rover, syntheticPng({ semente: 2 }), { alvo: p.id }).estado, 'aceito')
  } finally {
    v.apagar()
  }
})

test('a person attaches an image to her own post and to her reply, signing alone', () => {
  const m = worldWithMedia({ pessoas: true })
  try {
    const ana = registeredPerson(m)
    const p = publish(m, ana, 'postagem', post('Minha tarde.'))
    const { limpa: clean } = send(m, ana, syntheticPng({ semente: 7 }))
    const img = publish(m, ana, 'imagem', imageBody(clean, { uso: 'anexo', alvo: p.id, ordem: 0, alt: 'Um parque.' }))
    assert.equal(img.estado, 'aceito')
    assert.deepEqual(m.rele.social.postDetail(p.id, {}).imagens.map((i) => i.alt), ['Um parque.'])
  } finally {
    m.apagar()
  }
})

test('report and moderation: the operator removes the attachment by the id the report brings, the file goes, and the post says an attachment was removed', async () => {
  const s = await start({ mundo: { midia: { dir: `${process.env.TMPDIR ?? '/tmp'}/rover-midia-livre-${randomBytes(4).toString('hex')}` } } })
  try {
    const { m } = s
    const r = registeredRover(m)
    const p = publish(m, r, 'postagem', post())
    const stays = publishImage(m, r, syntheticPng({ semente: 1 }), { alvo: p.id, ordem: 0, alt: 'Fica.' })
    const sai = publishImage(m, r, syntheticPng({ semente: 2 }), { alvo: p.id, ordem: 1, alt: 'Sai.' })
    const hash = sai.objeto.corpo.hash
    assert.equal((await s.call('POST', `/v1/objetos/${sai.id}/denuncias`, { corpo: { motivo: 'ilegal' } })).status, 202)
    const outside = await s.call('DELETE', `/v1/admin/midia/${sai.id}`, { corpo: { motivo: 'denúncia procedente', motivoPublico: 'regras' }, cabecalhos: { authorization: `Bearer ${TOKEN}` } })
    assert.deepEqual(outside.json, { expurgado: true, objetos: 1 })
    assert.equal(existsSync(hashPath(m.rele.midia.dir, hash)), false)
    assert.equal((await s.call('GET', `/v1/midia/${hash}`)).status, 404)
    const read = (await s.call('GET', `/v1/postagens/${p.id}`)).json
    assert.deepEqual(read.imagens.map((i) => i.alt), ['Fica.'])
    assert.equal(read.anexosRemovidos, 1)
    assert.equal((await s.call('GET', `/v1/midia/${stays.objeto.corpo.hash}`)).status, 200)
    // the same bytes do not come back: refused already at the upload, with what unblocks it
    const from = errorOf(() => send(m, r, syntheticPng({ semente: 2 })))
    assert.equal(from.codigo, 'midia_recusada')
    assert.equal(from.toJson().erro.libera, whatUnlocks('midia_recusada'))
    const info = (await s.call('GET', '/v1/info')).json
    assert.equal(info.recursos.includes('midia-livre'), true)
    assert.equal(info.midia.aprovacao, false)
    assert.deepEqual(info.midia.alvosDeAnexo, [...ATTACHMENT_TARGETS])
  } finally {
    await s.fechar()
    s.m.rele.midia && (await import('node:fs')).rmSync(s.m.rele.midia.dir, { recursive: true, force: true })
  }
})

test('the quota refusal says how much the relay holds and how much this file needs', () => {
  const m = worldWithMedia({ cotaBytes: 10 })
  try {
    const r = m.rover()
    const e = errorOf(() => send(m, r, syntheticPng({ semente: 1 })))
    assert.equal(e.codigo, 'cota_de_midia')
    assert.equal(e.status, 507)
    assert.match(e.message, /O relé guarda até 0\.0 MB de mídia, 0\.0 MB estão ocupados e este arquivo tem 0\.0 MB\.$/)
    assert.match(e.libera, /Só o operador libera/)
  } finally {
    m.apagar()
  }
})

test('with media off nothing changes: the type is unknown and no item gains a field', () => {
  const m = newWorld()
  const r = registeredRover(m)
  const p = publish(m, r, 'postagem', post())
  const read = m.rele.social.postDetail(p.id, {})
  assert.equal('imagens' in read, false)
  assert.equal('anexosRemovidos' in read, false)
  assert.equal(m.rele.info().recursos.includes('midia-livre'), false)
  void as
})
