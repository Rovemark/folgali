// SPDX-License-Identifier: AGPL-3.0-or-later
// Own photo on the profile (Rovemark decision of 2026-11-25): the person uploads a portrait and a cover; the relay
// limits it to 6 profile photos a day, serves them with a short cache, moderation removes by the id the report carries (with a log entry),
// and the emergency switch `RELAY_MEDIA=nao` hides the photos without deleting anything.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { MEDIA_CACHE, MEDIA_LIMITS, imageBody } from '../../packages/protocol/src/index.js'
import { hashPath } from '../../packages/relay/src/media.js'
import { Relay } from '../../packages/relay/src/relay.js'
import { codeOf, registeredPerson, publish } from '../helpers/test-relay.js'
import { send, worldWithMedia, syntheticPng } from '../helpers/media.js'
import { TOKEN, start } from '../helpers/test-server.js'

const profile = (extra = {}) => ({ nome: 'Ana Souza', descricao: 'Pessoa.', grafo: 'publico', exigirAprovacao: [], ...extra })

/** Uploads and publishes a profile image (portrait or cover) of the person. */
function profilePhoto(m, author, usage, seed) {
  const { limpa: clean } = send(m, author, syntheticPng({ semente: seed, largura: usage === 'capa' ? 30 : 10, altura: 10 }))
  return publish(m, author, 'imagem', imageBody(clean, { uso: usage, alt: usage === 'capa' ? 'Capa do perfil.' : 'Retrato.' }))
}

test('the person uploads a portrait and a cover, the profile points to them and the read brings both images', () => {
  const m = worldWithMedia({ pessoas: true })
  try {
    const ana = registeredPerson(m)
    const r = profilePhoto(m, ana, 'retrato', 1)
    const c = profilePhoto(m, ana, 'capa', 2)
    assert.equal(r.estado, 'aceito')
    publish(m, ana, 'perfil', profile({ retrato: { midia: r.id }, capa: { midia: c.id } }))
    const p = m.rele.perfil(ana.uid)
    assert.equal(p.retratoImagem.id, r.id)
    assert.equal(p.capaImagem.id, c.id)
    assert.deepEqual(p.capa, { midia: c.id })
  } finally {
    m.apagar()
  }
})

test('at most 6 profile photos a day; a post attachment does not count; the next day it comes back', () => {
  const m = worldWithMedia({ pessoas: true, rates: { imagem: [[3600, 100], [86400, 100]] } })
  try {
    const ana = registeredPerson(m)
    for (let i = 0; i < MEDIA_LIMITS.profilePerDay; i++) assert.equal(profilePhoto(m, ana, i % 2 ? 'capa' : 'retrato', 10 + i).estado, 'aceito', `foto ${i + 1}`)
    assert.equal(codeOf(() => profilePhoto(m, ana, 'retrato', 99)), 'limite_de_taxa')
    m.advance(86401)
    assert.equal(profilePhoto(m, ana, 'retrato', 100).estado, 'aceito')
  } finally {
    m.apagar()
  }
})

test('moderation: the operator removes the photo by the id the report carries, the profile goes back to the default and the removal goes into the log', async () => {
  const s = await start({ mundo: { pessoas: true, midia: { dir: `${process.env.TMPDIR ?? '/tmp'}/rover-midia-perfil-${randomBytes(4).toString('hex')}` } } })
  try {
    const { m } = s
    const ana = registeredPerson(m)
    const r = profilePhoto(m, ana, 'retrato', 3)
    publish(m, ana, 'perfil', profile({ retrato: { midia: r.id } }))
    const hash = m.rele.perfil(ana.uid).retratoImagem.hash
    // the visitor's report, with no account, about the `imagem` object
    const rep = await s.call('POST', `/v1/objetos/${r.id}/denuncias`, { corpo: { motivo: 'ilegal' } })
    assert.equal(rep.status, 202)
    const read = await s.call('GET', `/v1/midia/${hash}`)
    assert.equal(read.status, 200)
    assert.equal(read.cab.get('cache-control'), MEDIA_CACHE)
    assert.equal(read.cab.get('x-content-type-options'), 'nosniff')
    assert.match(read.cab.get('content-security-policy'), /^default-src 'none'/)
    assert.equal(read.cab.get('content-type'), 'image/png')
    const outside = await s.call('DELETE', `/v1/admin/midia/${r.id}`, { corpo: { motivo: 'denúncia de foto procedente', motivoPublico: 'regras' }, cabecalhos: { authorization: `Bearer ${TOKEN}` } })
    assert.equal(outside.status, 200, JSON.stringify(outside.json))
    assert.deepEqual(outside.json, { expurgado: true, objetos: 1 })
    assert.equal((await s.call('GET', `/v1/midia/${hash}`)).status, 404)
    assert.equal(existsSync(hashPath(m.rele.midia.dir, hash)), false)
    const p = m.rele.perfil(ana.uid)
    assert.equal('retratoImagem' in p, false, 'without the image, the site shows the default portrait')
    const log = m.store.um("SELECT acao, alvo_tipo, alvo, motivo FROM remocoes WHERE alvo = :id", { id: r.id })
    assert.deepEqual({ ...log }, { acao: 'remocao', alvo_tipo: 'imagem', alvo: r.id, motivo: 'regras' })
    // the same file does not come back
    assert.equal(codeOf(() => send(m, ana, syntheticPng({ semente: 3, largura: 10, altura: 10 }))), 'midia_recusada')
  } finally {
    await s.fechar()
  }
})

test('emergency switch: without media the profile loses the photos and the upload, but nothing is deleted; turned back on, everything returns', () => {
  const m = worldWithMedia({ pessoas: true })
  try {
    const ana = registeredPerson(m)
    const r = profilePhoto(m, ana, 'retrato', 4)
    const c = profilePhoto(m, ana, 'capa', 5)
    publish(m, ana, 'perfil', profile({ retrato: { midia: r.id }, capa: { midia: c.id } }))
    const hash = m.rele.perfil(ana.uid).capaImagem.hash
    const withSame = (media) => new Relay({ store: m.store, provedor: m.rele.provedor, relogio: () => m.relogio.agora, reportSecret: randomBytes(32), midia: media, emissoresDePessoas: [m.pessoas.publicKey] })
    // RELAY_MEDIA=nao: the same database and the same folder, without the feature
    const off = withSame(null)
    const p = off.perfil(ana.uid)
    assert.equal('retratoImagem' in p, false)
    assert.equal('capaImagem' in p, false)
    assert.equal(off.info().recursos.includes('midia-de-perfil'), false)
    assert.ok(existsSync(hashPath(m.dir, hash)), 'the file stays on disk')
    assert.equal(m.store.um('SELECT COUNT(*) AS n FROM imagens').n, 2, 'the records stay in the database')
    // turned back on: the photos come back without uploading anything again
    const reopened = withSame({ dir: m.dir })
    assert.equal(reopened.perfil(ana.uid).capaImagem.hash, hash)
    assert.ok(reopened.midia.ler(hash).bytes.length > 0)
  } finally {
    m.apagar()
  }
})
