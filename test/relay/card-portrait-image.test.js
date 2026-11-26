// SPDX-License-Identifier: AGPL-3.0-or-later
// Revision 0.11.0, addition of 2026-11-26 (no version change): the short card of a rover (`resumo`, the `autor` of posts, comments, lists, ranking, friends, search...) carries
// `imagem: { hash, formato }` when the rover has a live portrait image, the same one the profile shows as `retratoImagem`. Without one,
// the card is the same as before. A withdrawn image (removed, replaced, hidden, purged, rover gone, blocked or revoked) never shows.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { imageBody } from '../../packages/protocol/src/index.js'
import { newWorld, publish, registeredRover } from '../helpers/test-relay.js'
import { send, worldWithMedia, syntheticPng } from '../helpers/media.js'
import { TOKEN, start } from '../helpers/test-server.js'

const CARD_KEYS = ['uid', 'handle', 'nome', 'retrato', 'especie']

/** Uploads and publishes a portrait image of the rover and points the profile to it, as the Rover Hangar does. */
function portraitPhoto(m, rover, seed, { perfil: profile = true } = {}) {
  const { limpa: clean } = send(m, rover, syntheticPng({ semente: seed, largura: 12, altura: 12 }))
  const r = publish(m, rover, 'imagem', imageBody(clean, { uso: 'retrato', alt: 'Retrato.' }))
  assert.equal(r.estado, 'aceito')
  if (profile) publish(m, rover, 'perfil', { nome: 'Pipa', descricao: 'Rover de teste.', retrato: { midia: r.id } })
  return { id: r.id, hash: clean.hash, formato: clean.formato }
}

const card = (m, uid) => m.rele.social.resumo(uid)

test('the card carries the live portrait image, only hash and format, the same one as the profile', () => {
  const m = worldWithMedia()
  try {
    const pipa = m.rover()
    const p = portraitPhoto(m, pipa, 1)
    const c = card(m, pipa.uid)
    assert.deepEqual(c.imagem, { hash: p.hash, formato: 'png' })
    assert.deepEqual(Object.keys(c), [...CARD_KEYS, 'imagem'])
    assert.equal(c.imagem.hash, m.rele.perfil(pipa.uid).retratoImagem.hash)
    // the author of a post in a list
    publish(m, pipa, 'postagem', { texto: 'Uma folga boa.', topicos: [] })
    const item = m.rele.social.postagensOrdenadas({ ordem: 'novas' }).itens[0]
    assert.deepEqual(item.autor.imagem, { hash: p.hash, formato: 'png' })
  } finally {
    m.apagar()
  }
})

test('without a portrait image the card has no `imagem` field, with media on or off', () => {
  const m = worldWithMedia()
  try {
    const pipa = m.rover()
    assert.deepEqual(Object.keys(card(m, pipa.uid)), CARD_KEYS)
    // an attachment is not a portrait
    const post = publish(m, pipa, 'postagem', { texto: 'Com anexo.', topicos: [] })
    const { limpa: clean } = send(m, pipa, syntheticPng({ semente: 7 }))
    assert.equal(publish(m, pipa, 'imagem', imageBody(clean, { uso: 'anexo', alvo: post.id, ordem: 0, alt: 'Anexo.' })).estado, 'aceito')
    assert.deepEqual(Object.keys(card(m, pipa.uid)), CARD_KEYS)
  } finally {
    m.apagar()
  }
  const off = newWorld()
  const lua = registeredRover(off)
  assert.deepEqual(Object.keys(off.rele.social.resumo(lua.uid)), CARD_KEYS)
})

test('a new portrait replaces the previous one on the card; removing it takes it off', () => {
  const m = worldWithMedia()
  try {
    const pipa = m.rover()
    portraitPhoto(m, pipa, 1)
    const second = portraitPhoto(m, pipa, 2)
    assert.equal(card(m, pipa.uid).imagem.hash, second.hash)
    publish(m, pipa, 'remocao-pelo-autor', { alvo: second.id })
    assert.equal('imagem' in card(m, pipa.uid), false)
    assert.equal('retratoImagem' in m.rele.perfil(pipa.uid), false)
  } finally {
    m.apagar()
  }
})

test('the card never shows the image of a rover that left, was blocked or revoked, nor an image hidden or blocked by the operator', () => {
  const m = worldWithMedia()
  try {
    // left the network
    const gone = m.rover()
    portraitPhoto(m, gone, 1)
    assert.ok(card(m, gone.uid).imagem)
    publish(m, gone, 'remocao-pelo-autor', { alvo: m.store.rover(gone.uid).perfil_id })
    assert.deepEqual(card(m, gone.uid), { uid: gone.uid, handle: null, nome: null, retrato: null, especie: null })

    // rover blocked by the operator, and unblocked
    const blocked = m.rover()
    portraitPhoto(m, blocked, 2)
    m.rele.bloquear({ tipo: 'rover', alvo: blocked.uid, motivo: 'teste' })
    assert.equal('imagem' in card(m, blocked.uid), false)
    m.rele.desbloquear('rover', blocked.uid)
    assert.ok(card(m, blocked.uid).imagem)

    // attestation revoked by the issuer
    const revoked = m.rover()
    portraitPhoto(m, revoked, 3)
    m.provedor.revoke(m.provedor.publicKey, revoked.uid)
    m.rele._sync()
    assert.equal('imagem' in card(m, revoked.uid), false)

    // the image object blocked (a report under review) and then hidden
    const reported = m.rover()
    const p = portraitPhoto(m, reported, 4)
    m.rele.bloquear({ tipo: 'objeto', alvo: p.id, motivo: 'denúncia em análise', motivoPublico: 'ilegal' })
    assert.equal('imagem' in card(m, reported.uid), false)
    m.rele.desbloquear('objeto', p.id)
    assert.ok(card(m, reported.uid).imagem)
    m.rele.social.hide({ id: p.id, tipo: 'imagem' }, null, m.relogio.agora)
    assert.equal('imagem' in card(m, reported.uid), false)

    // attestation expired
    const late = m.rover({ validadeS: 3 * 86400 })
    portraitPhoto(m, late, 5)
    m.advance(4 * 86400)
    assert.equal('imagem' in card(m, late.uid), false)
  } finally {
    m.apagar()
  }
})

test('a list of N cards costs the same queries with and without portrait images (the image rides in the row query)', () => {
  const count = (withImages) => {
    const m = worldWithMedia({ rates: { postagem: [[3600, 1000], [86400, 1000]] } })
    try {
      for (let i = 0; i < 20; i++) {
        const r = m.rover()
        if (withImages) portraitPhoto(m, r, 100 + i)
        publish(m, r, 'postagem', { texto: `Folga ${i}.`, topicos: [] })
      }
      let queries = 0
      const { um, todos } = m.store
      m.store.um = (...a) => { queries++; return um.apply(m.store, a) }
      m.store.todos = (...a) => { queries++; return todos.apply(m.store, a) }
      const items = m.rele.social.postagensOrdenadas({ ordem: 'novas', limite: 20 }).itens
      assert.equal(items.length, 20)
      assert.equal(items.filter((x) => x.autor.imagem).length, withImages ? 20 : 0)
      const total = queries
      // one card is still ONE query, as it was before the image existed (the row of the rover)
      const before = queries
      const c = m.rele.social.resumo(items[0].autor.uid)
      assert.equal(queries - before, 1, 'one query per card')
      assert.equal('imagem' in c, withImages)
      return total
    } finally {
      m.apagar()
    }
  }
  const without = count(false)
  const withImages = count(true)
  assert.equal(withImages, without, `with images ${withImages} queries, without ${without}`)
  process.stdout.write(`# a list of 20 posts by 20 authors: ${without} queries without portrait images, ${withImages} with\n`)
})

test('HTTP: the card goes out with `imagem` and the image is served at /v1/midia/:hash; the response grows by about 100 bytes per card', async () => {
  const dir = `${process.env.TMPDIR ?? '/tmp'}/rover-midia-cartao-${randomBytes(4).toString('hex')}`
  const s = await start({ mundo: { midia: { dir }, rates: { postagem: [[3600, 1000], [86400, 1000]] } } })
  try {
    const { m } = s
    const rovers = []
    for (let i = 0; i < 20; i++) {
      const r = registeredRover(m)
      publish(m, r, 'postagem', { texto: `Folga ${i}.`, topicos: [] })
      rovers.push(r)
    }
    const before = (await s.call('GET', '/v1/postagens?ordem=novas&limite=20')).texto.length
    let p
    for (const [i, r] of rovers.entries()) p = portraitPhoto(m, r, 200 + i)
    const res = await s.call('GET', '/v1/postagens?ordem=novas&limite=20')
    assert.equal(res.status, 200)
    const after = res.texto.length
    const authors = res.json.itens.map((x) => x.autor)
    assert.equal(authors.filter((a) => a.imagem).length, 20)
    // the profile change (retrato: { midia }) also lands in `retrato`; the growth that matters here is the new field
    const imageField = authors.reduce((n, a) => n + JSON.stringify({ imagem: a.imagem }).length - 1, 0) // `,"imagem":{...}` with its comma
    assert.ok(imageField / 20 <= 102, `${imageField / 20} bytes per card`)
    process.stdout.write(`# 20 cards: ${before} bytes without images, ${after} with (imagem field ${imageField / 20} bytes per card)\n`)
    const img = await s.call('GET', `/v1/midia/${p.hash}`)
    assert.equal(img.status, 200)
    // the operator purges the last one: its card loses the image at once
    const purge = await s.call('DELETE', `/v1/admin/midia/${p.hash}`, { corpo: { motivo: 'teste' }, cabecalhos: { authorization: `Bearer ${TOKEN}` } })
    assert.equal(purge.status, 200)
    const again = await s.call('GET', '/v1/postagens?ordem=novas&limite=20')
    assert.equal(again.json.itens.filter((x) => x.autor.imagem).length, 19)
  } finally {
    await s.fechar()
  }
})
