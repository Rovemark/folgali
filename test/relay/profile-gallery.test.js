// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.9.0 (proposal 0011): the profile gallery. Ready-made portrait and cover by id (`{ galeria }`), working with media off;
// with media on, also `{ midia }` pointing to an image of the author's own. Additive: a profile that sends no cover stays valid and
// the read of a profile without a cover does not change.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  GALLERY_COVERS, COVER_IDS, PORTRAIT_IDS, REVIEW_APPEALS, GALLERY_PORTRAITS, DRAFT_REVIEW, imageBody, publicGallery
} from '../../packages/protocol/src/index.js'
import { codeOf, errorOf, newWorld, registeredPerson, publish, registeredRover } from '../helpers/test-relay.js'
import { send, worldWithMedia, syntheticPng, publishImage } from '../helpers/media.js'
import { start } from '../helpers/test-server.js'

const profile = (extra = {}) => ({ nome: 'Pipa', descricao: 'Rover de teste.', ...extra })
const PUBLIC = fileURLToPath(new URL('../../packages/site/public', import.meta.url))

test('the list: stable ids in English kebab-case, no repeats, and each image exists on the site', () => {
  assert.equal(DRAFT_REVIEW, '0.11.0') // 0.11.0 contains 0.9.0
  assert.ok(REVIEW_APPEALS.includes('galeria-de-perfil'))
  for (const [list, prefix] of [[GALLERY_PORTRAITS, 'portrait-'], [GALLERY_COVERS, 'cover-']]) {
    assert.equal(new Set(list.map((x) => x.id)).size, list.length, 'no repeated id')
    for (const x of list) {
      assert.match(x.id, /^[a-z]+(?:-[a-z]+)+$/, x.id)
      assert.ok(x.id.startsWith(prefix), x.id)
      assert.ok(x.alt.pt.length > 10 && x.alt.en.length > 10, `${x.id}: alternative text`)
      assert.ok(!/—/.test(x.alt.pt + x.alt.en), `${x.id}: no em dash`)
      if (existsSync(PUBLIC)) assert.ok(existsSync(`${PUBLIC}${x.arquivo}`), `${x.id}: ${x.arquivo}`)
    }
  }
  const g = publicGallery()
  assert.equal(g.versao, 1)
  assert.deepEqual(Object.keys(g.retratos[0]), ['id', 'url', 'alt'])
  assert.ok(g.capas.every((c) => c.url.startsWith('https://folgali.com/marca/folgali/')))
  assert.ok(publicGallery('http://localhost:3911/').retratos[0].url.startsWith('http://localhost:3911/marca/'))
})

test('the relay accepts a gallery portrait and cover, refuses an outside id with esquema, and a profile without a cover stays valid', () => {
  const m = newWorld()
  const r = registeredRover(m)
  assert.equal('capa' in m.rele.perfil(r.uid), false, 'without a cover, the read does not gain the field')
  publish(m, r, 'perfil', profile({ retrato: { galeria: PORTRAIT_IDS[0] }, capa: { galeria: COVER_IDS[0] } }))
  const p = m.rele.perfil(r.uid)
  assert.deepEqual(p.retrato, { galeria: PORTRAIT_IDS[0] })
  assert.deepEqual(p.capa, { galeria: COVER_IDS[0] })
  for (const extra of [
    { capa: { galeria: 'cover-train-station' } },
    { retrato: { galeria: 'portrait-aviator' } },
    { capa: { galeria: PORTRAIT_IDS[0] } },
    { retrato: { galeria: COVER_IDS[0] } },
    { capa: { galeria: COVER_IDS[0], extra: 1 } },
    { capa: 'cover-snow' },
    { capa: {} }
  ]) {
    assert.equal(codeOf(() => publish(m, r, 'perfil', profile(extra))), 'esquema', JSON.stringify(extra))
  }
  // the Hangar pieces stay valid, and a new profile without a cover removes the cover
  publish(m, r, 'perfil', profile({ retrato: { corpo: 'seixo', cor: 'menta', veste: null, acessorio: null } }))
  const after = m.rele.perfil(r.uid)
  assert.deepEqual(after.retrato, { corpo: 'seixo', cor: 'menta', veste: null, acessorio: null })
  assert.equal('capa' in after, false)
})

test('the person also picks from the gallery; `{ midia }` with media off is esquema', () => {
  const m = newWorld({ pessoas: true })
  const ana = registeredPerson(m)
  publish(m, ana, 'perfil', { nome: 'Ana', descricao: 'Pessoa.', retrato: { galeria: 'portrait-mint-sprout' }, capa: { galeria: 'cover-forest' } })
  assert.deepEqual(m.rele.perfil(ana.uid).capa, { galeria: 'cover-forest' })
  const e = errorOf(() => publish(m, ana, 'perfil', { nome: 'Ana', descricao: 'Pessoa.', capa: { midia: `ob_${'A'.repeat(43)}` } }))
  assert.equal(e.codigo, 'esquema')
  assert.equal(e.campo, 'objeto.corpo.capa.midia')
  assert.equal(codeOf(() => publish(m, ana, 'perfil', { nome: 'Ana', descricao: 'Pessoa.', capa: { midia: 'nao-e-id' } })), 'esquema')
})

test('with media on: `{ midia }` cover and portrait only point to an image of the author\'s own, with the same use', () => {
  const m = worldWithMedia()
  try {
    assert.ok(m.rele.info().recursos.includes('midia-de-perfil'))
    const a = m.rover()
    const b = m.rover()
    const portrait = publishImage(m, a, syntheticPng({ semente: 1 })).id
    const { limpa: clean } = send(m, a, syntheticPng({ semente: 2, largura: 32, altura: 12 }))
    const cover = publish(m, a, 'imagem', imageBody(clean, { uso: 'capa', alt: 'Um campo verde.' })).id
    publish(m, a, 'perfil', profile({ retrato: { midia: portrait }, capa: { midia: cover } }))
    const p = m.rele.perfil(a.uid)
    assert.deepEqual(p.capa, { midia: cover })
    assert.equal(p.capaImagem.hash, clean.hash)
    assert.ok(p.retratoImagem)
    assert.equal(codeOf(() => publish(m, b, 'perfil', profile({ capa: { midia: cover } }))), 'alvo_desconhecido', 'image of another author')
    assert.equal(codeOf(() => publish(m, a, 'perfil', profile({ capa: { midia: portrait } }))), 'alvo_desconhecido', 'swapped use')
    assert.equal(codeOf(() => publish(m, a, 'perfil', profile({ retrato: { midia: `ob_${'C'.repeat(43)}` } }))), 'alvo_desconhecido', 'not an image')
    // a new cover withdraws the previous one
    const { limpa: other } = send(m, a, syntheticPng({ semente: 3, largura: 32, altura: 12 }))
    publish(m, a, 'imagem', imageBody(other, { uso: 'capa', alt: 'Outro campo.' }))
    assert.equal(m.rele.perfil(a.uid).capaImagem.hash, other.hash)
  } finally {
    m.apagar()
  }
})

test('HTTP: GET /v1/galeria is public, cached, and /v1/info announces the feature', async () => {
  const s = await start()
  try {
    const g = await s.call('GET', '/v1/galeria')
    assert.equal(g.status, 200)
    assert.match(g.cab.get('cache-control'), /public, max-age=\d+/)
    assert.deepEqual(g.json, publicGallery())
    const info = await s.call('GET', '/v1/info')
    assert.ok(info.json.recursos.includes('galeria-de-perfil'))
    assert.equal(info.json.recursos.includes('midia-de-perfil'), false, 'no media, no midia-de-perfil')
  } finally {
    await s.fechar()
  }
})
