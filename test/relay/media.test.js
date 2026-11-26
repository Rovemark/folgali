// SPDX-License-Identifier: AGPL-3.0-or-later
// Revision 0.5.0 (proposal 0005) on the relay, without HTTP: upload, `imagem` object, reading, removal, orphan, purge, quota, rate,
// account age and the feature turned OFF (the default), which answers as if the image did not exist.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { imageBody, createSendCredential, mediaHash, cleanImage } from '../../packages/protocol/src/index.js'
import { hashPath } from '../../packages/relay/src/media.js'
import * as A from '../helpers/image-samples.js'
import { send, worldWithMedia, syntheticPng, publishImage } from '../helpers/media.js'
import { approve, authorizationOf } from '../helpers/world.js'
import { DAY, codeOf, envelopeOf, errorOf, newWorld, publish, registeredRover } from '../helpers/test-relay.js'

const withWorld = (fn, options) => () => {
  const m = worldWithMedia(options)
  try { return fn(m) } finally { m.apagar() }
}
const publishPost = (m, r, text = 'Olha isso.') => publish(m, r, 'postagem', { texto: text, topicos: [] }).id

// ---------- off ----------

test('off (the default): info does not announce it, the imagem type is refused as unknown and reads do not change', () => {
  const m = newWorld()
  assert.equal(m.rele.midia, null)
  const info = m.rele.info()
  assert.equal(info.recursos.includes('midia'), false)
  assert.equal(info.recursos.includes('midia-livre'), false, '0.11.0: midia-livre is only announced with media on')
  assert.equal('midia' in info, false)
  assert.equal(info.versaoDoRascunho, '0.11.0')
  const r = registeredRover(m)
  const clean = cleanImage(A.gps_png)
  const e = errorOf(() => publish(m, r, 'imagem', imageBody(clean, { uso: 'retrato', alt: 'Verde.' })))
  assert.equal(e.codigo, 'esquema')
  assert.equal(e.campo, 'objeto.tipo')
  // the same refusal as for a type that does not exist (the listed types do not even mention imagem)
  assert.equal(e.message.includes('imagem'), false)
  assert.equal('retratoImagem' in m.rele.perfil(r.uid), false)
  // no media table is created
  assert.equal(m.store.um("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('midia', 'midia_envios', 'midia_recusadas', 'imagens')").n, 0)
})

// ---------- upload ----------

test('upload: two identical uploads become one file; the second is duplicada and counts for whoever sent it', withWorld((m) => {
  const a = m.rover()
  const b = m.rover()
  const r1 = send(m, a, A.gps_jpg).resposta
  assert.equal(r1.estado, 'recebida')
  assert.equal(r1.formato, 'jpeg')
  const r2 = send(m, b, A.gps_jpg).resposta
  assert.equal(r2.estado, 'duplicada')
  assert.equal(r2.hash, r1.hash)
  assert.deepEqual(m.arquivos().length, 1)
  assert.equal(m.store.um('SELECT COUNT(*) AS n FROM midia').n, 1)
  // the stored file is the CLEAN one: no GPS, identical to what the client computed
  const stored = readFileSync(hashPath(m.dir, r1.hash))
  assert.equal(mediaHash(stored), r1.hash)
  assert.ok(stored.equals(cleanImage(A.gps_jpg).bytes))
  // the same file serves both to publish
  assert.equal(publishImage(m, a, A.gps_jpg, { alvo: publishPost(m, a) }).estado, 'aceito')
  assert.equal(publishImage(m, b, A.gps_jpg, { alvo: publishPost(m, b) }).estado, 'aceito')
  assert.equal(m.arquivos().length, 1)
}))

test('upload: the hash is that of the CLEAN bytes; the hash of the original (with metadata) is hash_divergente', withWorld((m) => {
  const a = m.rover()
  assert.equal(codeOf(() => send(m, a, A.gps_jpg, { hash: mediaHash(A.gps_jpg) })), 'hash_divergente')
  assert.equal(codeOf(() => send(m, a, A.gps_jpg, { hash: mediaHash(Buffer.from('outra coisa')) })), 'hash_divergente')
  assert.equal(m.arquivos().length, 0, 'nothing was stored')
}))

test('upload: format from the bytes; SVG, GIF and APNG refused; truncated and huge-in-pixels refused too, storing nothing', withWorld((m) => {
  const a = m.rover()
  const h = '1'.repeat(64)
  assert.equal(codeOf(() => send(m, a, Buffer.from('<svg/>'), { hash: h })), 'formato_nao_aceito')
  assert.equal(codeOf(() => send(m, a, A.anim_gif, { hash: h })), 'formato_nao_aceito')
  assert.equal(codeOf(() => send(m, a, A.anim_png, { hash: h })), 'formato_nao_aceito')
  assert.equal(codeOf(() => send(m, a, A.gps_png.subarray(0, 60), { hash: h })), 'imagem_invalida')
  assert.equal(codeOf(() => send(m, a, syntheticPng({ largura: 5000, altura: 2 }), { hash: h })), 'dimensoes_grandes')
  assert.equal(m.arquivos().length, 0)
}))

test('upload: a credential of another rover, an expired one, one for another hash or a read one is envio_nao_autorizado', withWorld((m) => {
  const a = m.rover()
  const b = m.rover()
  const clean = cleanImage(A.gps_png)
  const target = `/v1/midia/${clean.hash}`
  const tries = (header, path = target) => codeOf(() => m.rele.midia.prepareUpload(clean.hash, { header, metodo: 'PUT', alvo: path }))
  const cred = (rover, o = {}) => createSendCredential({ chavePrivada: rover.rede.chavePrivada, uid: a.uid, alvo: target, t: m.relogio.agora, ...o })
  assert.equal(tries(cred(a)), 'ok')
  assert.equal(tries(cred(b)), 'envio_nao_autorizado', 'signed by another key')
  assert.equal(tries(cred(a, { t: m.relogio.agora - 121 })), 'envio_nao_autorizado')
  assert.equal(tries(cred(a, { alvo: `/v1/midia/${'2'.repeat(64)}` })), 'envio_nao_autorizado')
  assert.equal(tries(undefined), 'envio_nao_autorizado')
  assert.equal(tries(cred(a), `${target}?x=1`), 'envio_nao_autorizado')
}))

test('upload: a blocked rover is blocked; an account under 1 day old is conta_nova; a purged hash is midia_recusada', withWorld((m) => {
  const a = m.rover()
  m.rele.bloquear({ tipo: 'rover', alvo: a.uid, motivo: 'teste' })
  assert.equal(codeOf(() => send(m, a, A.gps_png)), 'bloqueado')
  const newcomer = m.rover({ newcomer: true })
  assert.equal(codeOf(() => send(m, newcomer, A.gps_png)), 'conta_nova')
  m.advance(DAY)
  assert.equal(codeOf(() => send(m, newcomer, A.gps_png)), 'ok')
}))

test('upload: rate of 20 per hour per rover, counted only on accepted uploads', withWorld((m) => {
  const a = m.rover()
  for (let i = 0; i < 20; i++) send(m, a, syntheticPng({ semente: i }))
  assert.equal(codeOf(() => send(m, a, syntheticPng({ semente: 99 }))), 'limite_de_taxa')
  // a refusal does not spend another rover's quota
  const b = m.rover()
  assert.equal(codeOf(() => send(m, b, syntheticPng({ semente: 100 }))), 'ok')
  m.advance(3601)
  assert.equal(codeOf(() => send(m, a, syntheticPng({ semente: 99 }))), 'ok')
}))

test('total disk quota: exceeded, cota_de_midia, and nothing is stored', withWorld((m) => {
  const a = m.rover()
  const one = send(m, a, A.gps_jpg).resposta
  assert.equal(one.estado, 'recebida')
  assert.equal(codeOf(() => send(m, a, A.prog_jpg)), 'cota_de_midia')
  assert.equal(m.arquivos().length, 1)
}, { cotaBytes: 400 }))

test('a disk path is only built from a validated hexadecimal hash', () => {
  for (const bad of ['../../etc/passwd', 'A'.repeat(64), `${'a'.repeat(63)}/`, '', `${'a'.repeat(64)}\0`, 'a'.repeat(65)]) {
    assert.throws(() => hashPath('/tmp/x', bad), /hash de mídia inválido/)
  }
  assert.equal(hashPath('/tmp/x', 'ab'.repeat(32)), join('/tmp/x', 'ab', 'ab'.repeat(32)))
})

// ---------- imagem object ----------

test('imagem object: enters without human approval (0.11.0), accepts the attachment of its own author and refuses the rest', withWorld((m) => {
  const a = m.rover()
  const b = m.rover()
  const post = publishPost(m, a)
  const { limpa: clean } = send(m, a, A.gps_png)
  const body = (o = {}) => ({ ...imageBody(clean, { uso: 'anexo', alvo: post, ordem: 0, alt: 'Verde.' }), ...o })
  // 0.11.0 (proposal 0013): no envelope in this test carries an approval or an authorization, and the refusals are only those of the type's rules
  assert.equal(codeOf(() => publish(m, a, 'imagem', body({ largura: 9 }), { aprovada: false })), 'hash_divergente')
  assert.equal(codeOf(() => publish(m, a, 'imagem', body({ formato: 'jpeg' }))), 'hash_divergente')
  // b did not upload this file: it cannot cite it (not even to attach to its own post)
  assert.equal(codeOf(() => publish(m, b, 'imagem', body({ alvo: publishPost(m, b) }))), 'midia_ausente')
  // b uploaded it, but the post belongs to a
  send(m, b, A.gps_png)
  assert.equal(codeOf(() => publish(m, b, 'imagem', body())), 'sem_permissao')
  assert.equal(codeOf(() => publish(m, a, 'imagem', body({ alvo: `ob_${'Z'.repeat(43)}` }))), 'alvo_desconhecido')
  const accepts = publish(m, a, 'imagem', body(), { aprovada: false })
  assert.equal(accepts.estado, 'aceito')
  assert.deepEqual(Object.keys(m.rele.objeto(accepts.id)), ['objeto'], 'the stored envelope is only the object: no approval and no authorization')
  assert.equal(codeOf(() => publish(m, a, 'imagem', body({ ordem: 1 }))), 'ja_existe', 'the same file twice in the same post')
  assert.equal(codeOf(() => publish(m, a, 'imagem', body({ alt: 'Outro.' }))), 'ja_existe', 'the same order')
}))

test('imagem object: the approval of a client older than 0.11.0 is checked and stored; an invalid one and a standing authorization are refused', withWorld((m) => {
  const a = m.rover()
  const other = m.rover()
  const post = publishPost(m, a)
  m.advance(1000) // so that the "old" object (the one with the expired approval) comes after the post that opened the chain
  const { limpa: clean } = send(m, a, A.gps_png)
  const body = imageBody(clean, { uso: 'anexo', alvo: post, ordem: 0, alt: 'Verde.' })
  const base = envelopeOf(m, a, 'imagem', body, { aprovacao: false })
  assert.deepEqual(Object.keys(base), ['objeto'])
  const refusal = (extra) => errorOf(() => m.rele.aceitar({ ...base, ...extra }))

  // invalid approval: of another object, signed by another rover's approval key, by the network key, expired, and one that is not an object
  const fromOtherObject = refusal({ aprovacao: approve(a, envelopeOf(m, a, 'imagem', { ...body, alt: 'Outra.' }, { aprovacao: false }).objeto, { aprovadoEm: m.relogio.agora }) })
  assert.deepEqual([fromOtherObject.codigo, fromOtherObject.campo], ['aprovacao_invalida', 'aprovacao.objeto'])
  const fromOtherRover = refusal({ aprovacao: approve({ ...a, aprovacao: other.aprovacao }, base.objeto, { aprovadoEm: m.relogio.agora }) })
  assert.deepEqual([fromOtherRover.codigo, fromOtherRover.campo], ['aprovacao_invalida', 'aprovacao.assinatura'])
  const withNetworkKey = refusal({ aprovacao: approve({ ...a, aprovacao: a.rede }, base.objeto, { aprovadoEm: m.relogio.agora }) })
  assert.deepEqual([withNetworkKey.codigo, withNetworkKey.campo], ['aprovacao_invalida', 'aprovacao.assinatura'])
  assert.equal(refusal({ aprovacao: 5 }).codigo, 'aprovacao_invalida')
  const old = envelopeOf(m, a, 'imagem', body, { criadoEm: m.relogio.agora - 600, aprovacao: false })
  assert.equal(codeOf(() => m.rele.aceitar({ ...old, aprovacao: approve(a, old.objeto, { aprovadoEm: m.relogio.agora - 400, validadeS: 300 }) })), 'aprovacao_vencida')

  // standing authorization: none covers the imagem type, and the right approval next to it does not save it
  const authorization = authorizationOf(a, { emitidaEm: m.relogio.agora, tipos: ['postagem', 'resposta'] })
  const withAuthorization = refusal({ autorizacao: authorization })
  assert.deepEqual([withAuthorization.codigo, withAuthorization.status, withAuthorization.campo], ['autorizacao_invalida', 403, 'autorizacao.tipos'])
  const asBoth = refusal({ autorizacao: authorization, aprovacao: approve(a, base.objeto, { aprovadoEm: m.relogio.agora }) })
  assert.deepEqual([asBoth.codigo, asBoth.campo], ['esquema', 'envelope.autorizacao'])

  // no refusal left a trace: the image is not online yet
  assert.equal(codeOf(() => m.rele.midia.ler(clean.hash)), 'nao_encontrado')

  // the right approval from an old client: accepted, and the stored envelope carries it as before 0.11.0
  const approval = approve(a, base.objeto, { aprovadoEm: m.relogio.agora })
  assert.equal(m.rele.aceitar({ ...base, aprovacao: approval }).estado, 'aceito')
  assert.deepEqual(m.rele.objeto(base.objeto.id), { objeto: base.objeto, aprovacao: approval })
  assert.ok(m.rele.midia.ler(clean.hash).bytes.equals(clean.bytes))
  // (the same authorization is valid for what it covers: the refusal above is about the imagem type, not the authorization)
  a.cabeca = base.objeto.id
  assert.equal(m.rele.aceitar(envelopeOf(m, a, 'postagem', { texto: 'Com a autorização.', topicos: [] }, { autorizacao: authorization })).estado, 'aceito')
}))

test('imagem object: at most 4 attachments per post', withWorld((m) => {
  const a = m.rover()
  const post = publishPost(m, a)
  for (let i = 0; i < 4; i++) assert.equal(publishImage(m, a, syntheticPng({ semente: i }), { alvo: post, ordem: i }).estado, 'aceito')
  const { limpa: clean } = send(m, a, syntheticPng({ semente: 9 }))
  assert.equal(codeOf(() => publish(m, a, 'imagem', imageBody(clean, { uso: 'anexo', alvo: post, ordem: 3, alt: 'Quinta.' }))), 'limite_de_estrutura')
}))

test('imagem object: the upload is valid for 1 hour; after that, midia_ausente', withWorld((m) => {
  const a = m.rover()
  const { limpa: clean } = send(m, a, A.gps_png)
  m.advance(3601)
  assert.equal(codeOf(() => publish(m, a, 'imagem', imageBody(clean, { uso: 'retrato', alt: 'Verde.' }))), 'midia_ausente')
}))

test('imagem object: an account under 1 day old does not publish an image (conta_nova)', withWorld((m) => {
  const a = m.rover()
  const { limpa: clean } = send(m, a, A.gps_png)
  m.store.executar('UPDATE rovers SET criado_em = :t WHERE uid = :uid', { t: m.relogio.agora - 100, uid: a.uid })
  assert.equal(codeOf(() => publish(m, a, 'imagem', imageBody(clean, { uso: 'retrato', alt: 'Verde.' }))), 'conta_nova')
}))

// ---------- reading ----------

test('reading: an unpublished upload is not served; a published one is; reads gain the fields only when there is an image', withWorld((m) => {
  const a = m.rover()
  const post = publishPost(m, a)
  const without = publishPost(m, a, 'Sem imagem.')
  const { limpa: clean } = send(m, a, A.gps_webp)
  assert.equal(codeOf(() => m.rele.midia.ler(clean.hash)), 'nao_encontrado', 'uploaded and not published')
  assert.equal(codeOf(() => m.rele.midia.ler('f'.repeat(64))), 'nao_encontrado', 'never existed')
  publish(m, a, 'imagem', imageBody(clean, { uso: 'anexo', alvo: post, ordem: 0, alt: 'Um quadrado.' }))
  const read = m.rele.midia.ler(clean.hash)
  assert.equal(read.tipo, 'image/webp')
  assert.ok(read.bytes.equals(clean.bytes))
  const detail = m.rele.social.postDetail(post, {})
  assert.equal(detail.imagens.length, 1)
  assert.deepEqual(Object.keys(detail.imagens[0]).sort(), ['alt', 'altura', 'bytes', 'formato', 'hash', 'id', 'largura', 'ordem'])
  assert.equal(detail.imagens[0].alt, 'Um quadrado.')
  assert.equal('imagens' in m.rele.social.postDetail(without, {}), false, 'no image, no field')
  const items = m.rele.postsOf(a.uid, { completo: true }).itens
  assert.equal(items.find((i) => i.envelope.objeto.id === post).imagens.length, 1)
  assert.equal('imagens' in items.find((i) => i.envelope.objeto.id === without), false)
  // the old list (without `completo`) never delivers an imagem object
  assert.ok(m.rele.postsOf(a.uid).itens.every((e) => e.objeto.tipo === 'postagem'))
  assert.equal('retratoImagem' in m.rele.perfil(a.uid), false)
}))

test('portrait: it shows on the profile; the new one replaces the previous one and the old file disappears at once', withWorld((m) => {
  const a = m.rover()
  const r1 = publishImage(m, a, A.gps_png, { alt: 'Primeiro retrato.' })
  const h1 = cleanImage(A.gps_png).hash
  assert.equal(m.rele.perfil(a.uid).retratoImagem.hash, h1)
  assert.equal(m.rele.social.paginaDoRover(a.uid).rover.retratoImagem.alt, 'Primeiro retrato.')
  m.advance(3601) // the first upload stops holding the file
  publishImage(m, a, A.alpha_png, { alt: 'Segundo retrato.' })
  const h2 = cleanImage(A.alpha_png).hash
  assert.equal(m.rele.perfil(a.uid).retratoImagem.hash, h2)
  assert.equal(existsSync(hashPath(m.dir, h1)), false, 'the old portrait file was removed from disk')
  assert.equal(codeOf(() => m.rele.midia.ler(h1)), 'nao_encontrado')
  assert.equal(codeOf(() => m.rele.objeto(r1.id)), 'removido')
}))

// ---------- removal, orphan, retention ----------

test('orphan removal: the file only disappears when the LAST object that cites it is removed', withWorld((m) => {
  const a = m.rover()
  const b = m.rover()
  const imageA = publishImage(m, a, A.gps_jpg, { alvo: publishPost(m, a) })
  const ib = publishImage(m, b, A.gps_jpg, { alvo: publishPost(m, b) })
  const hash = cleanImage(A.gps_jpg).hash
  m.advance(3601)
  publish(m, a, 'remocao-pelo-autor', { alvo: imageA.id })
  assert.equal(m.arquivos().length, 1, 'b still cites it')
  assert.ok(m.rele.midia.ler(hash))
  publish(m, b, 'remocao-pelo-autor', { alvo: ib.id })
  assert.equal(m.arquivos().length, 0, 'nobody cites it any more: removed from disk')
  assert.equal(m.store.um('SELECT COUNT(*) AS n FROM midia').n, 0)
}))

test('removing the post takes the attachments with it, and the orphan files disappear', withWorld((m) => {
  const a = m.rover()
  const post = publishPost(m, a)
  const i0 = publishImage(m, a, syntheticPng({ semente: 1 }), { alvo: post, ordem: 0 })
  const i1 = publishImage(m, a, syntheticPng({ semente: 2 }), { alvo: post, ordem: 1 })
  m.advance(3601)
  publish(m, a, 'remocao-pelo-autor', { alvo: post })
  for (const i of [i0, i1]) assert.equal(codeOf(() => m.rele.objeto(i.id)), 'removido')
  assert.equal(m.arquivos().length, 0)
}))

test('an upload never published disappears after 1 hour (periodic cleanup)', withWorld((m) => {
  const a = m.rover()
  send(m, a, A.gps_png)
  m.rele.limpar()
  assert.equal(m.arquivos().length, 1, 'within the hour it stays')
  m.advance(3601)
  m.rele.limpar()
  assert.equal(m.arquivos().length, 0)
}))

test('leaving the network deletes the images of the rover', withWorld((m) => {
  const a = m.rover()
  publishImage(m, a, A.gps_png)
  publishImage(m, a, A.gps_jpg, { alvo: publishPost(m, a) })
  m.advance(3601)
  const profile = m.store.rover(a.uid).perfil_id
  publish(m, a, 'remocao-pelo-autor', { alvo: profile })
  assert.equal(m.arquivos().length, 0)
}))

test('operator block: the file stops being served but stays (retention same as the object); unblocking restores it', withWorld((m) => {
  const a = m.rover()
  const post = publishPost(m, a)
  const img = publishImage(m, a, A.gps_png, { alvo: post })
  const hash = cleanImage(A.gps_png).hash
  m.advance(3601)
  m.rele.bloquear({ tipo: 'objeto', alvo: img.id, motivo: 'denúncia em análise', motivoPublico: 'ilegal' })
  m.rele.limpar()
  assert.equal(codeOf(() => m.rele.midia.ler(hash)), 'nao_encontrado')
  assert.equal(m.arquivos().length, 1)
  assert.ok(m.rele.midia.readAsOperator(hash).bytes.length > 0, 'the operator can see it to decide')
  m.rele.desbloquear('objeto', img.id)
  assert.ok(m.rele.midia.ler(hash))
  // blocking the POST also hides the attachment
  m.rele.bloquear({ tipo: 'objeto', alvo: post, motivo: 'teste' })
  assert.equal(codeOf(() => m.rele.midia.ler(hash)), 'nao_encontrado')
  assert.equal('imagens' in (m.rele.postsOf(a.uid, { completo: true }).itens[0] ?? {}), false)
}))

test('reporting an image works like reporting any object', withWorld((m) => {
  const a = m.rover()
  const b = m.rover()
  const img = publishImage(m, a, A.gps_png, { alvo: publishPost(m, a) })
  assert.equal(publish(m, b, 'denuncia', { alvo: img.id, motivo: 'ilegal' }).estado, 'recebida')
  const d = m.rele.listReports()
  assert.equal(d.length, 1)
  assert.equal(d[0].alvo, img.id)
  assert.equal(d[0].motivo, 'ilegal')
}))

test('purge: deletes the file, removes the objects, enters the record and a resend is midia_recusada', withWorld((m) => {
  const a = m.rover()
  const img = publishImage(m, a, A.gps_png, { alvo: publishPost(m, a) })
  const hash = cleanImage(A.gps_png).hash
  assert.equal(codeOf(() => m.rele.midia.purge(hash, { motivo: '' })), 'esquema')
  assert.equal(codeOf(() => m.rele.midia.purge(hash, { motivo: 'x', motivoPublico: 'inventado' })), 'esquema')
  assert.deepEqual(m.rele.midia.purge(hash, { motivo: 'material ilegal confirmado', motivoPublico: 'ilegal' }), { expurgado: true, objetos: 1 })
  assert.equal(m.arquivos().length, 0)
  assert.equal(codeOf(() => m.rele.objeto(img.id)), 'removido')
  assert.equal(codeOf(() => send(m, a, A.gps_png)), 'midia_recusada')
  const record = m.rele.social.registroDoRele({})
  assert.ok(record.itens.some((l) => l.alvo === img.id && l.motivo === 'ilegal'))
}))
