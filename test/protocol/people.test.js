// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.7.0 (proposal 0009): the person attestation, the derived uid and what a person may publish.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  PERSON_ATTESTATION_DOMAIN, ProtocolError, PEOPLE, PERSON_RATE, RATE_PER_TYPE, TOTAL_RATE_PER_PERSON, MESSAGE_TYPES, OBJECT_TYPES, PERSON_TYPES,
  checkPersonObject, createPersonAttestation, createHandleAttestation, derivePersonUid, isPersonAttestation, generateKeyPair,
  verifyPersonAttestation
} from '../../packages/protocol/src/index.js'

const NOW = 1_900_000_000
const issuer = generateKeyPair()
const device = generateKeyPair()
const UID = `rvr_${'P'.repeat(22)}`

const attestation = (extra = {}) => createPersonAttestation({
  issuerPrivateKey: issuer.chavePrivada, emissor: issuer.publicKey, uid: UID, handle: 'ana.souza', chave: device.publicKey,
  emitidoEm: NOW - 10, expiraEm: NOW - 10 + 7 * 86400, ...extra
})
const verify = (a, ctx = {}) => verifyPersonAttestation(a, { agora: NOW, emissoresDePessoas: [issuer.publicKey], ...ctx })
const code = (r) => (r.ok ? 'ok' : r.erro.codigo)

test('person attestation: shape, own prefix and no approval key', () => {
  const a = attestation()
  assert.deepEqual(Object.keys(a).sort(), ['assinatura', 'chave', 'emissor', 'emitidoEm', 'expiraEm', 'handle', 'tipo', 'uid', 'v'])
  assert.equal(a.tipo, 'atestado-pessoa')
  assert.equal(a.v, '0.7')
  assert.equal(PERSON_ATTESTATION_DOMAIN, 'rover-network/0.7/atestado-pessoa\n')
  assert.equal(code(verify(a)), 'ok')
  assert.equal(verify(a).atestado, a)
  assert.equal(isPersonAttestation(a), true)
  assert.equal(isPersonAttestation({ tipo: 'atestado-handle' }), false)
  assert.equal(isPersonAttestation(null), false)
  assert.equal(isPersonAttestation('atestado-pessoa'), false)
})

test('person attestation: issuer not on the people list, signature, closed schema, weak key', () => {
  assert.equal(code(verify(attestation(), { emissoresDePessoas: [] })), 'emissor_desconhecido')
  assert.equal(code(verify(attestation(), { emissoresDePessoas: [generateKeyPair().publicKey] })), 'emissor_desconhecido')
  assert.equal(code(verify({ ...attestation(), handle: 'outra.pessoa' })), 'atestado_invalido', 'changing the @ breaks the signature')
  assert.equal(code(verify({ ...attestation(), email: 'ana@exemplo.com' })), 'esquema', 'no extra field: an e-mail does not fit')
  assert.equal(code(verify({ ...attestation(), chaveAprovacao: device.publicKey })), 'esquema', 'a person has no approval key')
  assert.equal(code(verify({ ...attestation(), v: '0.3' })), 'esquema')
  assert.equal(code(verify({ ...attestation(), tipo: 'atestado-handle' })), 'esquema')
  assert.equal(code(verify('x')), 'atestado_invalido')
  const { uid: _u, ...withoutUid } = attestation()
  assert.equal(code(verify(withoutUid)), 'esquema')
  // small-order key (the neutral point of the curve): the issuer signed, but the key is no good
  const weak = createPersonAttestation({
    issuerPrivateKey: issuer.chavePrivada, emissor: issuer.publicKey, uid: UID, handle: 'ana.souza', chave: 'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    emitidoEm: NOW - 10, expiraEm: NOW + 86400
  })
  assert.equal(code(verify(weak)), 'chave_fraca')
})

test('person attestation: validity of at most 30 days, positive, not from the future', () => {
  assert.equal(PEOPLE.atestadoValidadeMaxS, 30 * 86400)
  assert.equal(code(verify(attestation({ expiraEm: NOW - 10 + 30 * 86400 }))), 'ok', 'exactly 30 days is valid')
  assert.equal(code(verify(attestation({ expiraEm: NOW - 10 + 30 * 86400 + 1 }))), 'atestado_invalido', 'one second more is not allowed')
  assert.equal(code(verify(attestation({ expiraEm: NOW - 10 }))), 'atestado_invalido', 'zero validity')
  assert.equal(code(verify(attestation({ expiraEm: NOW - 11 }))), 'atestado_invalido', 'negative validity')
  assert.equal(code(verify(attestation({ emitidoEm: NOW + 120, expiraEm: NOW + 86400 }))), 'ok', '2 minutes in the future is still clock skew')
  assert.equal(code(verify(attestation({ emitidoEm: NOW + 121, expiraEm: NOW + 86400 }))), 'atestado_invalido')
  assert.equal(code(verify(attestation({ emitidoEm: NOW + 200, expiraEm: NOW + 86400 }), { toleranceS: 300 })), 'ok', 'the tolerance is configurable')
  assert.equal(code(verify(attestation({ emitidoEm: NOW - 86400, expiraEm: NOW }))), 'atestado_vencido', 'at the instant of expiry it has already expired')
  assert.equal(code(verify(attestation({ emitidoEm: NOW - 86400, expiraEm: NOW + 1 }))), 'ok')
  assert.ok(PEOPLE.recommendedAttestationValidityS <= PEOPLE.atestadoValidadeMaxS)
})

test('a rover attestation does not pass as a person attestation, nor the other way round', () => {
  const rover = createHandleAttestation({
    issuerPrivateKey: issuer.chavePrivada, emissor: issuer.publicKey, uid: UID, handle: 'ana.souza', chave: device.publicKey,
    chaveAprovacao: generateKeyPair().publicKey, emitidoEm: NOW - 10, expiraEm: NOW + 86400
  })
  assert.equal(code(verify(rover)), 'esquema')
  // the person signature is not valid with the handle attestation prefix: the domain separates the two
  const a = attestation()
  const { chave: key, ...rest } = a
  assert.equal(code(verify({ ...rest, chave: key, assinatura: rover.assinatura })), 'atestado_invalido')
})

test('person uid: stable, derived from a secret, never from an e-mail', () => {
  const secret = randomBytes(32)
  const owner = 'p_' + 'a1B2'.repeat(5)
  const uid = derivePersonUid(secret, owner)
  assert.match(uid, /^rvr_[A-Za-z0-9_-]{22}$/)
  assert.equal(derivePersonUid(secret, owner), uid, 'same account, same uid')
  assert.notEqual(derivePersonUid(secret, `${owner}x`), uid)
  assert.notEqual(derivePersonUid(randomBytes(32), owner), uid, 'another issuer, another uid')
  assert.throws(() => derivePersonUid(secret, 'ana@exemplo.com.br'), TypeError)
  assert.throws(() => derivePersonUid(secret, 'curto'), TypeError)
  assert.throws(() => derivePersonUid(secret, 42), TypeError)
  assert.throws(() => derivePersonUid(randomBytes(31), owner), TypeError)
  assert.throws(() => derivePersonUid('segredo', owner), TypeError)
  assert.doesNotThrow(() => derivePersonUid(randomBytes(32), 'a'.repeat(16)))
  assert.doesNotThrow(() => derivePersonUid(randomBytes(32), 'a'.repeat(64)))
  assert.throws(() => derivePersonUid(randomBytes(32), 'a'.repeat(65)), TypeError)
})

test('person types: EVERYTHING a rover does (decision of 2026-11-24, night): community, page, testimonial, badge, message, photo', () => {
  for (const t of [...OBJECT_TYPES, ...MESSAGE_TYPES]) assert.ok(PERSON_TYPES.includes(t), t)
  for (const t of ['estado', 'entrega', 'selo', 'depoimento', 'comunidade-criar', 'comunidade-gestao', 'pagina-criar', 'pagina-publicar', 'imagem', 'mensagem', 'conversa-pedir']) {
    assert.ok(PERSON_TYPES.includes(t), t)
  }
  assert.equal(PERSON_TYPES.length, OBJECT_TYPES.length + MESSAGE_TYPES.length, 'no made-up type')
  // every 0.3 person type has its own rate (messages use the 0.4 table), and the person has a daily cap in total
  for (const t of OBJECT_TYPES.filter((x) => x !== 'denuncia')) assert.ok(PERSON_RATE[t], `${t} without a rate`)
  for (const t of Object.keys(PERSON_RATE)) assert.ok(PERSON_TYPES.includes(t), `rate for a type the person does not use: ${t}`)
  assert.ok(TOTAL_RATE_PER_PERSON.some(([s]) => s === 86400))
  for (const t of ['postagem', 'resposta', 'reacao', 'seguir', 'recado', 'topico', 'resposta-forum']) {
    assert.ok(PERSON_RATE[t].some(([s]) => s === 86400), `${t} without a daily cap`)
  }
  // the new person types have the same cap as the rover, number by number
  for (const t of ['estado', 'depoimento', 'selo', 'entrega', 'comunidade-criar', 'pagina-criar', 'pagina-publicar', 'imagem', 'apelacao-decisao']) {
    assert.deepEqual(PERSON_RATE[t], RATE_PER_TYPE[t], t)
  }
})

test('what the person publishes: 0.3 and 0.4 messages, without approval or authorization, profile with portrait and without requirement', () => {
  const obj = (type, body = {}, v = '0.3') => ({ v, tipo: type, corpo: body })
  const profile = { nome: 'Ana', descricao: '', grafo: 'publico', exigirAprovacao: [] }
  assert.equal(checkPersonObject(obj('postagem')), null)
  assert.equal(checkPersonObject(obj('perfil', profile)), null)
  assert.equal(checkPersonObject(obj('perfil', profile), {}), null)
  const e = (o, env) => checkPersonObject(o, env)
  assert.ok(e(obj('postagem', {}, '0.2')) instanceof ProtocolError)
  assert.equal(e(obj('postagem', {}, '0.2')).codigo, 'esquema')
  assert.equal(e(obj('postagem', {}, '0.2')).campo, 'objeto.v')
  assert.equal(e(obj('postagem', {}, '0.1')).campo, 'objeto.v')
  assert.equal(e(obj('mensagem', {}, '0.4')), null, 'a private message is valid')
  assert.equal(e(obj('estado')), null)
  assert.equal(e(obj('selo')), null)
  assert.equal(e(obj('comunidade-criar')), null)
  assert.equal(e(obj('imagem')), null)
  // a type that does not exist stays refused with the person code (left for a future type)
  assert.equal(e(obj('tipo-que-nao-existe')).codigo, 'nao_permitido_a_pessoa')
  assert.equal(e(obj('tipo-que-nao-existe')).campo, 'objeto.tipo')
  assert.equal(e(obj('postagem'), { aprovacao: {} }).campo, 'envelope.aprovacao')
  assert.equal(e(obj('postagem'), { autorizacao: {} }).campo, 'envelope.autorizacao')
  assert.equal(e(obj('mensagem', {}, '0.4'), { aprovacao: {} }).campo, 'envelope.aprovacao', 'not even on the message')
  assert.equal(e(obj('postagem'), { aprovacao: null }).codigo, 'esquema', 'even null counts: the field cannot be present')
  assert.equal(e(obj('perfil', { ...profile, retrato: { corpo: 'seixo', cor: 'menta', veste: null, acessorio: null } })), null, 'a portrait is allowed')
  assert.equal(e(obj('perfil', { ...profile, exigirAprovacao: ['seguir'] })).campo, 'objeto.corpo.exigirAprovacao')
  // the requirement only matters on the profile
  assert.equal(e(obj('postagem', { retrato: 1, exigirAprovacao: ['x'] })), null)
})

test('the person rate table in PROTOCOL.md (section 18.4) is the one in the code, number by number and window by window', async () => {
  const { readFileSync } = await import('node:fs')
  const { PEOPLE_RATE_PER_ISSUER } = await import('../../packages/protocol/src/index.js')
  const md = readFileSync(new URL('../../docs/PROTOCOL.md', import.meta.url), 'utf8')
  const section = md.slice(md.indexOf('### 18.4 Person rate'), md.indexOf('### 18.5'))
  const lines = section.split('\n').filter((l) => /^\| `/.test(l) || /^\| (total|per issuer)/.test(l))
  const seen = new Set()
  const windows = (hour, day) => [...(hour ? [[3600, Number(hour)]] : []), ...(day ? [[86400, Number(day)]] : [])]
  for (const l of lines) {
    const [label, hour, day] = l.split('|').slice(1, 4).map((c) => c.trim())
    if (label.startsWith('total')) { assert.deepEqual(TOTAL_RATE_PER_PERSON, windows(hour, day), 'total'); continue }
    if (label.startsWith('per issuer')) { assert.deepEqual(PEOPLE_RATE_PER_ISSUER, windows(hour, day), 'emissor'); continue }
    for (const [, type] of label.matchAll(/`([a-z-]+)`/g)) {
      assert.deepEqual(PERSON_RATE[type], windows(hour, day), type)
      seen.add(type)
    }
  }
  assert.deepEqual([...seen].sort(), Object.keys(PERSON_RATE).sort(), 'the table lists all types with a rate')
})

test('the person attestation validity is the contract one: at most 30 days, 7 recommended, and the error states the number', () => {
  assert.equal(PEOPLE.recommendedAttestationValidityS, 7 * 86400)
  const r = verify(attestation({ expiraEm: NOW - 10 + 31 * 86400 }))
  assert.match(r.erro.message, /no máximo 30 dias/)
})
