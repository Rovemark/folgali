// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DOMAINS, ProtocolError, LIMITS, signBytes, objectSignatureMatches, canonicalBytes, computeId, canonicalize, createObject, domainOf, validateObject, generateKeyPair
} from '../../packages/protocol/src/index.js'
import { NOW, newIssuer, newRover, objectOf } from '../helpers/world.js'

const issuer = newIssuer()
const rover = newRover(issuer)
const post = () => objectOf(rover, 'postagem', { texto: 'Primeira postagem do rover.', topicos: ['rovers'] })

function refusal(value, code, field) {
  const r = validateObject(value)
  assert.equal(r.ok, false, 'should refuse')
  assert.ok(r.erro instanceof ProtocolError)
  assert.equal(r.erro.codigo, code, r.erro.message)
  if (field) assert.equal(r.erro.campo, field)
  return r.erro
}

test('valid object: shape, content-based id and signature', () => {
  const o = post()
  assert.match(o.id, /^ob_[A-Za-z0-9_-]{43}$/)
  assert.equal(o.v, '0.3')
  assert.equal(validateObject(o).ok, true)
  assert.equal(computeId(o), o.id)
  assert.equal(objectSignatureMatches(o, rover.rede.publicKey), true)
})

test('the id depends on the content and only on it', () => {
  const a = objectOf(rover, 'postagem', { texto: 'igual', topicos: [] })
  const b = objectOf(rover, 'postagem', { texto: 'igual', topicos: [] })
  assert.equal(a.id, b.id) // Ed25519 is deterministic: same content, same object
  assert.equal(a.assinatura, b.assinatura)
  assert.notEqual(a.id, objectOf(rover, 'postagem', { texto: 'outro', topicos: [] }).id)
  assert.notEqual(a.id, objectOf(rover, 'postagem', { texto: 'igual', topicos: [] }, { criadoEm: NOW + 1 }).id)
})

test('the key order of the received JSON does not matter', () => {
  const o = post()
  const shuffled = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(o).reverse())))
  assert.equal(validateObject(shuffled).ok, true)
  assert.equal(objectSignatureMatches(shuffled, rover.rede.publicKey), true)
})

test('swapped signature or altered content: the id or the signature gives it away', () => {
  const o = post()
  const tweaked = { ...o, corpo: { ...o.corpo, texto: 'Texto alterado.' } }
  refusal(tweaked, 'id_incorreto', 'objeto.id')
  const other = generateKeyPair()
  assert.equal(objectSignatureMatches(o, other.publicKey), false)
  const redone = createObject({ ...o, chavePrivada: other.chavePrivada })
  assert.equal(validateObject(redone).ok, true) // shape ok
  assert.equal(objectSignatureMatches(redone, rover.rede.publicKey), false) // but it is not the rover key
})

test('closed schema: an extra field in the envelope, the body and the root', () => {
  const o = post()
  refusal({ ...o, extra: 1 }, 'esquema', 'objeto.extra')
  refusal({ ...o, corpo: { ...o.corpo, html: 'x' } }, 'esquema', 'objeto.corpo.html')
  refusal({ ...o, __proto__: { x: 1 }, ['__proto__']: 1 }, 'esquema')
  const withProto = JSON.parse(`{"__proto__": {"x": 1}, ${JSON.stringify(o).slice(1)}`)
  refusal(withProto, 'esquema', 'objeto.__proto__')
})

test('missing required field and wrong types', () => {
  const o = post()
  for (const k of ['v', 'tipo', 'id', 'autor', 'criadoEm', 'previo', 'corpo', 'assinatura']) {
    const { [k]: _, ...without } = o
    refusal(without, k === 'v' ? 'esquema' : 'esquema', `objeto.${k}`)
  }
  refusal({ ...o, criadoEm: '1900000000' }, 'esquema', 'objeto.criadoEm')
  refusal({ ...o, criadoEm: 1900000000.5 }, 'esquema', 'objeto.criadoEm')
  refusal({ ...o, criadoEm: 5 }, 'esquema', 'objeto.criadoEm')
  refusal({ ...o, autor: 'rvr_curto' }, 'esquema', 'objeto.autor')
  refusal({ ...o, previo: 'ob_curto' }, 'esquema', 'objeto.previo')
  refusal({ ...o, tipo: 'moeda' }, 'esquema', 'objeto.tipo')
  refusal({ ...o, assinatura: 'x' }, 'esquema', 'objeto.assinatura')
  refusal({ ...o, corpo: [] }, 'esquema', 'objeto.corpo')
  refusal(null, 'esquema')
  refusal([], 'esquema')
  refusal('texto', 'esquema')
})

test('an unknown version has its own code', () => {
  refusal({ ...post(), v: '9.9' }, 'versao_nao_suportada', 'objeto.v')
  refusal({ ...post(), v: 1 }, 'esquema', 'objeto.v')
})

test('the body of each type is closed and validated', () => {
  const t = (type, body) => objectOf(rover, type, body)
  const targetId = `ob_${'A'.repeat(43)}`
  const targetUid = `rvr_${'B'.repeat(22)}`
  const valid = [
    t('perfil', { nome: 'Pipa', descricao: '' }),
    t('perfil', { nome: 'Pipa', descricao: 'Gosta de planilhas.' }),
    t('postagem', { titulo: 'Oi', texto: 'texto', topicos: ['a1', 'b-2'] }),
    t('resposta', { alvo: targetId, texto: 'resposta' }),
    t('seguir', { alvo: targetUid }),
    t('deixar-de-seguir', { alvo: targetUid }),
    t('reacao', { alvo: targetId, reacao: 'curtir' }),
    t('reacao', { alvo: targetId, reacao: 'util' }),
    // 0.8.0 (proposal 0010): the four post reactions exist in "v": "0.3"
    ...['amei', 'haha', 'uau', 'abraco'].map((reaction) => t('reacao', { alvo: targetId, reacao: reaction })),
    t('denuncia', { alvo: targetId, motivo: 'spam' }),
    t('remocao-pelo-autor', { alvo: targetId })
  ]
  for (const o of valid) assert.equal(validateObject(o).ok, true, `${o.tipo} ${JSON.stringify(o.corpo)}`)
  const bad = [
    ['perfil', { nome: 'Pipa' }, 'objeto.corpo.descricao'],
    ['perfil', { nome: '', descricao: '' }, 'objeto.corpo.nome'],
    ['perfil', { nome: 'a'.repeat(41), descricao: '' }, 'objeto.corpo.nome'],
    ['perfil', { nome: 'duas\nlinhas', descricao: '' }, 'objeto.corpo.nome'],
    ['perfil', { nome: 'Pipa', descricao: 'd'.repeat(281) }, 'objeto.corpo.descricao'],
    ['postagem', { texto: 'x', topicos: ['Maiúsculo'] }, 'objeto.corpo.topicos[0]'],
    ['postagem', { texto: 'x', topicos: ['a1', 'a1'] }, 'objeto.corpo.topicos'],
    ['postagem', { texto: 'x', topicos: ['aa', 'bb', 'cc', 'dd'] }, 'objeto.corpo.topicos'],
    ['postagem', { texto: 'x' }, 'objeto.corpo.topicos'],
    ['postagem', { texto: 'x'.repeat(1501), topicos: [] }, 'objeto.corpo.texto'],
    ['postagem', { titulo: 't'.repeat(101), texto: 'x', topicos: [] }, 'objeto.corpo.titulo'],
    ['resposta', { alvo: 'ob_x', texto: 'x' }, 'objeto.corpo.alvo'],
    ['resposta', { alvo: targetId, texto: 'y'.repeat(1001) }, 'objeto.corpo.texto'],
    ['seguir', { alvo: targetId }, 'objeto.corpo.alvo'],
    ['reacao', { alvo: targetId, reacao: 'grr' }, 'objeto.corpo.reacao'],
    ['reacao', { alvo: targetId, reacao: 'Amei' }, 'objeto.corpo.reacao'],
    ['reacao', { alvo: targetId, reacao: 'abraço' }, 'objeto.corpo.reacao'],
    ['denuncia', { alvo: targetId, motivo: 'chato' }, 'objeto.corpo.motivo'],
    ['denuncia', { alvo: targetId, motivo: 'spam', texto: 'livre' }, 'objeto.corpo.texto'],
    ['remocao-pelo-autor', { alvo: targetUid }, 'objeto.corpo.alvo']
  ]
  for (const [type, body, field] of bad) refusal(t(type, body), 'esquema', field)
  // objects 0.1 and 0.2 keep the two reactions of their time
  for (const v of ['0.1', '0.2']) {
    for (const reaction of ['amei', 'haha', 'uau', 'abraco']) refusal(objectOf(rover, 'reacao', { alvo: targetId, reacao: reaction }, { v }), 'esquema', 'objeto.corpo.reacao')
    assert.equal(validateObject(objectOf(rover, 'reacao', { alvo: targetId, reacao: 'curtir' }, { v })).ok, true, v)
  }
})

test('cross-field rules: a report outside the chain, nobody follows themselves', () => {
  const targetId = `ob_${'A'.repeat(43)}`
  refusal(objectOf(rover, 'denuncia', { alvo: targetId, motivo: 'spam' }, { previo: targetId }), 'esquema', 'objeto.previo')
  refusal(objectOf(rover, 'seguir', { alvo: rover.uid }), 'esquema', 'objeto.corpo.alvo')
  refusal(objectOf(rover, 'deixar-de-seguir', { alvo: rover.uid }), 'esquema', 'objeto.corpo.alvo')
})

test('forbidden text inside the object: HTML, invisible characters, personal data', () => {
  const t = (text) => objectOf(rover, 'postagem', { texto: text, topicos: [] })
  refusal(t('<script>alert(1)</script>'), 'esquema', 'objeto.corpo.texto')
  refusal(t('oi​mundo'), 'esquema', 'objeto.corpo.texto')
  refusal(t('mande para a@b.com'), 'esquema', 'objeto.corpo.texto')
  const error = refusal(t('mande para a@b.com'), 'esquema')
  assert.ok(!error.message.includes('a@b.com'))
})

test('the worst object the schema lets through fits well within the byte limit', () => {
  // Design invariant: the object byte limit needs no check of its own because the schema already guarantees it.
  // If someone raises the limit of a field without raising LIMITS.objectBytes, this test fails.
  const topics = ['a'.repeat(24), 'b'.repeat(24), 'c'.repeat(24)]
  const worstPost = objectOf(rover, 'postagem', { texto: '🙂'.repeat(LIMITS.postagem.max), titulo: '🙂'.repeat(LIMITS.titulo.max), topicos: topics })
  const worstReply = objectOf(rover, 'resposta', { alvo: `ob_${'A'.repeat(43)}`, texto: '🙂'.repeat(LIMITS.resposta.max) })
  const worstProfile = objectOf(rover, 'perfil', { nome: '🙂'.repeat(LIMITS.nome.max), descricao: '🙂'.repeat(LIMITS.descricao.max) })
  for (const o of [worstPost, worstReply, worstProfile]) {
    assert.equal(validateObject(o).ok, true, o.tipo)
    assert.ok(Buffer.byteLength(canonicalize(o)) < LIMITS.objetoBytes, o.tipo)
  }
})

test('post and reply accept line breaks; profile name and description do not', () => {
  assert.equal(validateObject(objectOf(rover, 'postagem', { texto: 'uma\nduas', topicos: [] })).ok, true)
  assert.equal(validateObject(objectOf(rover, 'resposta', { alvo: `ob_${'A'.repeat(43)}`, texto: 'uma\nduas' })).ok, true)
  refusal(objectOf(rover, 'perfil', { nome: 'Pipa', descricao: 'uma\nduas' }), 'esquema', 'objeto.corpo.descricao')
})

test('object date limits: from 2023 to 2100, inclusive', () => {
  const using = (createdAt) => objectOf(rover, 'postagem', { texto: 'x', topicos: [] }, { criadoEm: createdAt })
  assert.equal(validateObject(using(1_700_000_000)).ok, true)
  refusal(using(1_699_999_999), 'esquema', 'objeto.criadoEm')
  assert.equal(validateObject(using(4_102_444_800)).ok, true)
  refusal(using(4_102_444_801), 'esquema', 'objeto.criadoEm')
})

test('topics: exactly three pass, a list that is not a list does not pass, the title is optional', () => {
  assert.equal(validateObject(objectOf(rover, 'postagem', { texto: 'x', topicos: ['aa', 'bb', 'cc'] })).ok, true)
  assert.equal(validateObject(objectOf(rover, 'postagem', { texto: 'x', topicos: [] })).ok, true) // no title
  refusal(objectOf(rover, 'postagem', { texto: 'x', topicos: { length: 0 } }), 'esquema', 'objeto.corpo.topicos')
  refusal(objectOf(rover, 'postagem', { texto: 'x', topicos: 'aa' }), 'esquema', 'objeto.corpo.topicos')
})

test('previo null or an id; anything else is not accepted', () => {
  const targetId = `ob_${'A'.repeat(43)}`
  assert.equal(validateObject(objectOf(rover, 'postagem', { texto: 'x', topicos: [] }, { previo: targetId })).ok, true)
  refusal(objectOf(rover, 'postagem', { texto: 'x', topicos: [] }, { previo: 'ob_x' }), 'esquema', 'objeto.previo')
})

test('the object canonical form is stable: the same id for whoever recomputes', () => {
  const o = post()
  const read = JSON.parse(JSON.stringify(o))
  assert.equal(computeId(read), o.id)
})

// ---------- 0.2: profile with graph and requirement; compatibility with 0.1 ----------

const profile02 = (body = {}) => objectOf(rover, 'perfil', { nome: 'Pipa', descricao: 'oi', grafo: 'publico', exigirAprovacao: [], ...body }, { v: '0.2' })

test('profile 0.2: graph and requirement are mandatory and closed', () => {
  assert.equal(validateObject(profile02()).ok, true)
  for (const graph of ['publico', 'contagens', 'privado']) assert.equal(validateObject(profile02({ grafo: graph })).ok, true, graph)
  for (const bad of ['secreto', 'Publico', '', null, 1, ['publico']]) refusal(profile02({ grafo: bad }), 'esquema', 'objeto.corpo.grafo')
  assert.equal(validateObject(profile02({ exigirAprovacao: ['seguir', 'deixar-de-seguir', 'reacao', 'denuncia'] })).ok, true)
  refusal(profile02({ exigirAprovacao: ['postagem'] }), 'esquema', 'objeto.corpo.exigirAprovacao[0]')
  refusal(profile02({ exigirAprovacao: ['perfil'] }), 'esquema', 'objeto.corpo.exigirAprovacao[0]')
  refusal(profile02({ exigirAprovacao: ['remocao-pelo-autor'] }), 'esquema', 'objeto.corpo.exigirAprovacao[0]')
  refusal(profile02({ exigirAprovacao: ['seguir', 'seguir'] }), 'esquema', 'objeto.corpo.exigirAprovacao')
  refusal(profile02({ exigirAprovacao: ['seguir', 'deixar-de-seguir', 'reacao', 'denuncia', 'seguir'] }), 'esquema', 'objeto.corpo.exigirAprovacao')
  refusal(profile02({ exigirAprovacao: 'seguir' }), 'esquema', 'objeto.corpo.exigirAprovacao')
  refusal(profile02({ extra: 1 }), 'esquema', 'objeto.corpo.extra')
  // without the new fields, a 0.2 profile is refused: the format changed
  const without = (field) => {
    const { [field]: _x, ...body } = { nome: 'Pipa', descricao: 'oi', grafo: 'publico', exigirAprovacao: [] }
    return createObject({ tipo: 'perfil', autor: rover.uid, criadoEm: NOW, corpo: body, chavePrivada: rover.rede.chavePrivada })
  }
  refusal(without('grafo'), 'esquema', 'objeto.corpo.grafo')
  refusal(without('exigirAprovacao'), 'esquema', 'objeto.corpo.exigirAprovacao')
})

test('compatibility: a 0.1 profile (without the new fields) stays valid, and the new field does not go into a 0.1 object', () => {
  const old = createObject({ v: '0.1', tipo: 'perfil', autor: rover.uid, criadoEm: NOW, corpo: { nome: 'Pipa', descricao: 'oi' }, chavePrivada: rover.rede.chavePrivada })
  assert.equal(old.v, '0.1')
  assert.equal(validateObject(old).ok, true)
  assert.equal(objectSignatureMatches(old, rover.rede.publicKey), true)
  const withNewField = createObject({ v: '0.1', tipo: 'perfil', autor: rover.uid, criadoEm: NOW, corpo: { nome: 'Pipa', descricao: 'oi', grafo: 'privado', exigirAprovacao: [] }, chavePrivada: rover.rede.chavePrivada })
  refusal(withNewField, 'esquema', 'objeto.corpo.grafo')
  // the other types have the same body in both versions
  const post01 = createObject({ v: '0.1', tipo: 'postagem', autor: rover.uid, criadoEm: NOW, corpo: { texto: 'oi', topicos: [] }, chavePrivada: rover.rede.chavePrivada })
  assert.equal(validateObject(post01).ok, true)
  assert.equal(objectSignatureMatches(post01, rover.rede.publicKey), true)
})

test('unknown or malformed version: 0.5 is not supported, a number or null is esquema; a 0.4 post is esquema (0.4 has only messages)', () => {
  const o = post()
  const tweaked = (v) => ({ ...o, v })
  refusal(tweaked('0.5'), 'versao_nao_suportada', 'objeto.v')
  refusal(tweaked('0.4'), 'esquema', 'objeto.tipo')
  refusal(tweaked('1.0'), 'versao_nao_suportada', 'objeto.v')
  refusal(tweaked(''), 'versao_nao_suportada', 'objeto.v')
  refusal(tweaked(0.2), 'esquema', 'objeto.v')
  refusal(tweaked(null), 'esquema', 'objeto.v')
  const { v: _v, ...withoutV } = o
  refusal(withoutV, 'esquema', 'objeto.v')
})

test('the signature carries the object version prefix: signing under the other version does not match', () => {
  const o = post()
  assert.equal(o.v, '0.3')
  const withOldPrefix = { ...o, assinatura: signBytes(domainOf('0.1', 'objeto'), canonicalBytes((({ assinatura: _a, ...r }) => r)(o)), rover.rede.chavePrivada) }
  assert.equal(objectSignatureMatches(withOldPrefix, rover.rede.publicKey), false)
  // in 0.3 each type has its own prefix: the generic 0.2 prefix does not count either
  const withGenericPrefix = { ...o, assinatura: signBytes(domainOf('0.2', 'objeto'), canonicalBytes((({ assinatura: _a, ...r }) => r)(o)), rover.rede.chavePrivada) }
  assert.equal(objectSignatureMatches(withGenericPrefix, rover.rede.publicKey), false)
  assert.equal(objectSignatureMatches({ ...o, tipo: 'resposta' }, rover.rede.publicKey), false)
  const old = createObject({ v: '0.1', tipo: 'postagem', autor: rover.uid, criadoEm: NOW, corpo: { texto: 'oi', topicos: [] }, chavePrivada: rover.rede.chavePrivada })
  const withNewPrefix = { ...old, assinatura: signBytes(DOMAINS.objeto, canonicalBytes((({ assinatura: _a, ...r }) => r)(old)), rover.rede.chavePrivada) }
  assert.equal(objectSignatureMatches(withNewPrefix, rover.rede.publicKey), false)
  // the version goes into the id: the same body in two versions makes two objects
  assert.notEqual(old.id, createObject({ tipo: 'postagem', autor: rover.uid, criadoEm: NOW, corpo: { texto: 'oi', topicos: [] }, chavePrivada: rover.rede.chavePrivada }).id)
})
