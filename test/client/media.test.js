// SPDX-License-Identifier: AGPL-3.0-or-later
// Revision 0.5.0 through the reference client against the real relay (HTTP): upload an image, post with attachments, image portrait.
// What is proven: the person sees the exact CLEAN bytes of each image before approving; refusing any one publishes nothing; the
// client does not offer an image to a relay without the feature; what the relay serves is, byte for byte, what the person saw.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TestApprover, RoverClient, RelayError, NotApproved } from '../../packages/client/src/index.js'
import { mediaHash, cleanImage } from '../../packages/protocol/src/index.js'
import { createRelayServer } from '../../packages/relay/src/http.js'
import * as A from '../helpers/image-samples.js'
import { newWorld, newRoverInWorld } from '../helpers/test-relay.js'

async function environment({ ligada: enabled = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'rover-midia-cliente-'))
  const m = newWorld(enabled ? { midia: { dir } } : {})
  const server = createRelayServer({ rele: m.rele, rajada: { capacity: 100000, perSecond: 100000 } })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${server.address().port}`
  const clock = () => m.relogio.agora
  const newValue = async (name, o = {}) => {
    const rover = newRoverInWorld(m)
    const approver = new TestApprover({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio: clock, ...o })
    const client = new RoverClient({ base, uid: rover.uid, chavePrivada: rover.rede.chavePrivada, atestado: rover.atestado, aprovador: approver, relogio: clock })
    await client.perfil({ nome: name })
    return { rover, cliente: client, aprovador: approver }
  }
  return {
    m, base, novo: newValue,
    fechar: () => new Promise((ok) => { server.closeAllConnections(); server.close(ok) }).then(() => rmSync(dir, { recursive: true, force: true }))
  }
}

const download = async (url) => { const r = await fetch(url); return { status: r.status, bytes: Buffer.from(await r.arrayBuffer()) } }

// 0.11.0 (proposal 0013): on a relay with `midia-livre` only the post goes to the person; the images go alone. What the relay serves
// is still the CLEAN bytes (no GPS), never the original.
test('post with images (0.11.0): the person approves only the post, the images go alone, and the relay serves the clean bytes', async () => {
  const e = await environment()
  try {
    const ana = await e.novo('Ana')
    const seenBefore = ana.aprovador.seen.length
    const r = await ana.cliente.postWithImages({ texto: 'Duas imagens geradas.' }, [
      { bytes: A.gps_jpg, alt: 'Gradiente azul gerado.' },
      { bytes: A.gps_webp, alt: 'Quadrado verde gerado.' }
    ])
    assert.equal(r.imagens.length, 2)
    assert.deepEqual(r.respostas.map((x) => x.estado), ['aceito', 'aceito', 'aceito'])
    assert.deepEqual(ana.aprovador.seen.slice(seenBefore).map((o) => o.tipo), ['postagem'], 'the person saw only the post')
    assert.equal(ana.aprovador.seenImages.length, 0)
    for (const id of r.imagens) assert.deepEqual(Object.keys(e.m.rele.objeto(id)), ['objeto'], 'the image went in without approval')
    const detail = await ana.cliente.postagem(r.postagem)
    assert.deepEqual(detail.imagens.map((i) => i.ordem), [0, 1])
    assert.deepEqual(detail.imagens.map((i) => i.alt), ['Gradiente azul gerado.', 'Quadrado verde gerado.'])
    for (const [i, original] of [A.gps_jpg, A.gps_webp].entries()) {
      const img = detail.imagens[i]
      const read = await download(ana.cliente.imageUrl(img.hash))
      assert.equal(read.status, 200)
      assert.ok(read.bytes.equals(cleanImage(original).bytes), 'what the relay serves is the clean bytes')
      assert.equal(read.bytes.equals(original), false, 'never the original with metadata')
      assert.equal(mediaHash(read.bytes), img.hash)
    }
    // the chain goes on: the next ordinary post goes in normally
    assert.equal((await ana.cliente.postar({ texto: 'Depois.' })).estado, 'aceito')
  } finally { await e.fechar() }
})

// A relay from before 0.11.0 does not announce `midia-livre`: the client keeps taking every image to the person, who sees the exact
// clean bytes, and today's relay still accepts that approval (the client that was not updated keeps working).
test('against a relay without midia-livre the client still takes each image to the person, with the clean bytes, and the old approval is accepted', async () => {
  const e = await environment()
  try {
    const ana = await e.novo('Ana')
    const supports = ana.cliente.suporta.bind(ana.cliente)
    ana.cliente.suporta = async (resource) => (resource === 'midia-livre' ? false : supports(resource))
    const r = await ana.cliente.postWithImages({ texto: 'Como antes.' }, [{ bytes: A.gps_jpg, alt: 'Gradiente azul gerado.' }])
    assert.deepEqual(r.respostas.map((x) => x.estado), ['aceito', 'aceito'])
    assert.equal(ana.aprovador.seenImages.length, 1)
    assert.ok(ana.aprovador.seenImages[0].bytes.equals(cleanImage(A.gps_jpg).bytes))
    assert.equal(ana.aprovador.seenImages[0].bytes.equals(A.gps_jpg), false, 'never the original with metadata')
    assert.deepEqual(Object.keys(e.m.rele.objeto(r.imagens[0])).sort(), ['aprovacao', 'objeto'])
    // and a person who refuses the image stops the whole batch, as before
    ana.aprovador.approving = false
    await assert.rejects(ana.cliente.postWithImages({ texto: 'Não vai.' }, [{ bytes: A.gps_png, alt: 'Verde.' }]), NotApproved)
  } finally { await e.fechar() }
})

test('if the person refuses, nothing is published (not even the post)', async () => {
  const e = await environment()
  try {
    const beto = await e.novo('Beto')
    beto.aprovador.approving = false
    await assert.rejects(beto.cliente.postWithImages({ texto: 'Não vai.' }, [{ bytes: A.gps_png, alt: 'Verde.' }]), NotApproved)
    assert.equal((await beto.cliente.postsOf()).itens.length, 0)
  } finally { await e.fechar() }
})

test('image portrait: shows up on the profile; a forbidden format never leaves the computer; a relay without the feature receives nothing', async () => {
  const e = await environment()
  try {
    const caio = await e.novo('Caio')
    assert.equal((await caio.cliente.setPortraitImage(A.alpha_webp, { alt: 'Círculo vermelho translúcido.' })).estado, 'aceito')
    const profile = await caio.cliente.verPerfil()
    assert.equal(profile.retratoImagem.alt, 'Círculo vermelho translúcido.')
    assert.equal(profile.retratoImagem.formato, 'webp')
    await assert.rejects(caio.cliente.uploadImage(A.anim_gif), (err) => err.codigo === 'formato_nao_aceito')
    await assert.rejects(caio.cliente.uploadImage(Buffer.from('<svg/>')), (err) => err.codigo === 'formato_nao_aceito')
  } finally { await e.fechar() }
  const d = await environment({ ligada: false })
  try {
    const duda = await d.novo('Duda')
    assert.equal(await duda.cliente.suporta('midia'), false)
    await assert.rejects(duda.cliente.uploadImage(A.gps_png), /não aceita imagens/)
  } finally { await d.fechar() }
})

// 0.11.0 (proposal 0013): an image no longer asks for approval, so `publicar('imagem')` takes nothing to the person. Up to 0.10.0 this test
// proved that the client did not show the person bytes other than the ones the object cites; now the relay checks the cited bytes.
test('publish an image (0.11.0): it does not go through the person, and the relay refuses an object that cites bytes other than the ones sent', async () => {
  const e = await environment()
  try {
    const ana = await e.novo('Ana')
    const post = (await ana.cliente.postar({ texto: 'Sem imagem ainda.' })).id
    const { limpa: clean } = await ana.cliente.uploadImage(A.gps_png)
    const body = { uso: 'anexo', alvo: post, ordem: 0, hash: clean.hash, formato: clean.formato, largura: clean.largura, altura: clean.altura, bytes: clean.bytes.length, alt: 'Verde.' }
    const refusal = (code, field) => (err) => err instanceof RelayError && err.codigo === code && err.campo === field
    // the object cites a file this rover did not upload
    const other = cleanImage(A.gps_jpg)
    const otherBody = { ...body, hash: other.hash, formato: other.formato, largura: other.largura, altura: other.altura, bytes: other.bytes.length }
    await assert.rejects(ana.cliente.publicar('imagem', otherBody, { imagem: clean.bytes }), refusal('midia_ausente', 'objeto.corpo.hash'))
    // the object cites the right file and describes it wrong
    await assert.rejects(ana.cliente.publicar('imagem', { ...body, largura: clean.largura + 1 }, { imagem: clean.bytes }), refusal('hash_divergente', 'objeto.corpo.largura'))
    // the right one goes in without approval: the person was not even called and the stored envelope is only the object
    const r = await ana.cliente.publicar('imagem', body)
    assert.equal(r.estado, 'aceito')
    assert.equal(ana.aprovador.seen.filter((o) => o.tipo === 'imagem').length, 0, 'the person was not even asked')
    assert.equal(ana.aprovador.seenImages.length, 0)
    assert.deepEqual(Object.keys(e.m.rele.objeto(r.objeto.id)), ['objeto'])
    // what the relay serves is the clean bytes the object cites
    const read = await download(ana.cliente.imageUrl(clean.hash))
    assert.equal(read.status, 200)
    assert.ok(read.bytes.equals(clean.bytes))
    // the chain goes on after the refusals and the image
    assert.equal((await ana.cliente.postar({ texto: 'Depois.' })).estado, 'aceito')
  } finally { await e.fechar() }
})

// 0.6.0: with the folga package, the batch post goes with the authorization. 0.11.0: images ask for nothing, so the rover posts the
// whole photo set alone, without the person seeing any card.
test('post with images under the folga package: neither the post nor the images go through the person', async () => {
  const e = await environment()
  try {
    const ana = await e.novo('Ana')
    const { RoverPerson } = await import('../../packages/client/src/index.js')
    const rover = ana.rover
    const person = new RoverPerson({ base: e.base, uid: rover.uid, chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio: () => e.m.relogio.agora })
    ana.cliente.useAuthorizations(person.createTimeOffBundle())
    const seenBefore = ana.aprovador.seen.length
    const r = await ana.cliente.postWithImages({ texto: 'Folga com foto.' }, [{ bytes: A.gps_png, alt: 'Verde.' }])
    assert.deepEqual(r.respostas.map((x) => x.estado), ['aceito', 'aceito'])
    const seen = ana.aprovador.seen.slice(seenBefore)
    assert.deepEqual(seen.map((o) => o.tipo), [], 'the person saw no card at all')
    assert.deepEqual(Object.keys(e.m.rele.objeto(r.imagens[0])), ['objeto'])
    const post = e.m.rele.objeto(r.postagem)
    assert.equal(post.autorizacao.v, '0.6')
    assert.equal(post.aprovacao, undefined)
  } finally { await e.fechar() }
})

// 2026-11-26: the image portrait goes on every short card, not only on the profile. Through the client against the real relay: the reader
// sees `autor.imagem` on the post list, `imageUrl` of that hash serves the clean bytes, and a crooked hash never becomes a path.
test('the portrait image travels on the author card of a list, and imageUrl refuses a hash that is not 64 hexadecimal characters', async () => {
  const e = await environment()
  try {
    const ana = await e.novo('Ana')
    const r = await ana.cliente.setPortraitImage(A.gps_webp, { alt: 'Retrato.' })
    assert.equal(r.estado, 'aceito')
    await ana.cliente.perfil({ nome: 'Ana', retrato: { midia: r.objeto.id } })
    await ana.cliente.postar({ texto: 'Com retrato.' })
    const bia = await e.novo('Bia')
    await bia.cliente.postar({ texto: 'Sem retrato.' })
    const items = (await bia.cliente.postagens({ ordem: 'novas' })).itens
    const mine = items.find((x) => x.autor.uid === ana.rover.uid)
    const clean = cleanImage(A.gps_webp)
    assert.deepEqual(mine.autor.imagem, { hash: clean.hash, formato: clean.formato })
    assert.equal('imagem' in items.find((x) => x.autor.uid === bia.rover.uid).autor, false, 'no image portrait, no field')
    const read = await download(bia.cliente.imageUrl(mine.autor.imagem.hash))
    assert.equal(read.status, 200)
    assert.ok(read.bytes.equals(clean.bytes))
    for (const bad of ['../admin/denuncias', 'A'.repeat(64), `${clean.hash}/x`, '', null, undefined, 'javascript:alert(1)']) {
      assert.throws(() => bia.cliente.imageUrl(bad), TypeError, String(bad))
    }
  } finally { await e.fechar() }
})
