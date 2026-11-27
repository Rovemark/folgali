// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.6.0 (proposal 0008): the "0.6" authorization, the default folga package, the agent record and the owner act.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  OWNER_ACTIONS, TIME_OFF_ADJUSTMENT, VERIFICATION_CODE_RE, NO_DEADLINE, OPEN_ISSUER, LIMITS, TIME_OFF_DEFAULT, CODE_WORDS,
  AUTHORIZABLE_TYPES_V3, AUTHORIZATION_VERSIONS, createOwnerAct, createStandingAuthorization, createTimeOffBundle, createAgentRecord, generateKeyPair,
  toB64u, authorizableTypesOf, validateOwnerAct, validateAgentRecord, verifyStandingAuthorization
} from '../../packages/protocol/src/index.js'

const NOW = 1_900_000_000
const UID = `rvr_${'A'.repeat(22)}`
const approval = generateKeyPair()
const authorization = (extra = {}) => createStandingAuthorization({
  chavePrivadaDeAprovacao: approval.chavePrivada, autor: UID, emitidaEm: NOW, validadeS: NO_DEADLINE, tipos: ['postagem'], maxPorHora: 5, maxPorDia: 20, v: '0.6', ...extra
})
const check = (a, type = 'postagem', now = NOW + 10) =>
  verifyStandingAuthorization(a, { objeto: { autor: UID, tipo: type, criadoEm: NOW + 1 }, approvalKey: approval.publicKey, agora: now })
const code = (r) => (r.ok ? 'ok' : r.erro.codigo)
const field = (r) => (r.ok ? null : r.erro.campo)

test('authorization 0.6: NO EXPIRY (expiraEm null, explicit) and covers the profile; 0.2 and 0.3 keep a date, up to 7 days, and no profile', () => {
  assert.deepEqual(AUTHORIZATION_VERSIONS, ['0.2', '0.3', '0.6'])
  assert.equal(NO_DEADLINE, null)
  // 0.11.0 (proposal 0013): the "0.6" also covers what creates and what governs, so no type asks a verified account for a card
  assert.deepEqual(authorizableTypesOf('0.6'), [
    ...AUTHORIZABLE_TYPES_V3, 'perfil', 'comunidade-criar', 'pagina-criar', 'depoimento',
    'comunidade-atualizar', 'comunidade-vocabulario', 'comunidade-posse', 'pagina-atualizar', 'topico-editar', 'entrega', 'apelacao',
    // proposal 0014: the optional package `mensagens`
    'conversa-pedir', 'conversa-decidir', 'mensagem'
  ])
  assert.ok(!authorizableTypesOf('0.3').includes('perfil'))

  const without = authorization()
  assert.equal(without.expiraEm, null)
  assert.equal(code(check(without)), 'ok')
  // valid years later: nothing expires on its own
  assert.equal(code(check(without, 'postagem', NOW + 10 * 365 * 86400)), 'ok')
  assert.equal(code(verifyStandingAuthorization(without, { objeto: { autor: UID, tipo: 'postagem', criadoEm: NOW + 10 * 365 * 86400 }, approvalKey: approval.publicKey, agora: NOW + 10 * 365 * 86400 })), 'ok')
  // a 0.6 with a date (the "huge disguised expiry") is refused by the schema; only `null` counts
  for (const validityS of [86400, 100 * 365 * 86400]) {
    const withDate = check(authorization({ validadeS: validityS }))
    assert.deepEqual([code(withDate), field(withDate)], ['esquema', 'autorizacao.expiraEm'])
    assert.match(withDate.erro.message, /exatamente null/)
  }
  // and 0.2 and 0.3 without a date are refused: no-expiry exists only in 0.6
  for (const v of ['0.2', '0.3']) {
    const withoutDate = check(authorization({ v }))
    assert.deepEqual([code(withoutDate), field(withoutDate)], ['esquema', 'autorizacao.expiraEm'], v)
  }
  // replacing null with a date after signing breaks the id
  assert.equal(code(check({ ...without, expiraEm: NOW + 86400 })), 'esquema')
  assert.equal(code(check(authorization({ v: '0.3', validadeS: 7 * 86400 }))), 'ok')
  const v3long = check(authorization({ v: '0.3', validadeS: 7 * 86400 + 1 }))
  assert.deepEqual([code(v3long), field(v3long)], ['autorizacao_invalida', 'autorizacao.expiraEm'])
  assert.match(v3long.erro.message, /7 dias/)

  assert.equal(code(check(authorization({ tipos: ['perfil'] }), 'perfil')), 'ok')
  assert.deepEqual([code(check(authorization({ tipos: ['perfil'], v: '0.3', validadeS: 86400 }), 'perfil')), field(check(authorization({ tipos: ['perfil'], v: '0.3', validadeS: 86400 }), 'perfil'))], ['esquema', 'autorizacao.tipos[0]'])
  // 0.11.0 (proposal 0013): the "0.6" covers what creates and what governs; the 0.3 still refuses them, and what never needed a
  // release (a reaction, an image) is covered by no version
  for (const t of ['depoimento', 'entrega', 'comunidade-criar', 'apelacao']) {
    assert.equal(code(check(authorization({ tipos: [t] }), t)), 'ok', t)
    assert.equal(code(check(authorization({ tipos: [t], v: '0.3', validadeS: 86400 }), t)), 'esquema', `${t} in 0.3`)
  }
  for (const t of ['reacao', 'imagem', 'seta', 'comunidade-gestao']) assert.equal(code(check(authorization({ tipos: [t] }), t)), 'esquema', t)
  // a version that does not exist falls to the current version schema and is refused by `v`
  const v05 = check(authorization({ v: '0.5' }))
  assert.deepEqual([code(v05), field(v05)], ['esquema', 'autorizacao.v'])
  // the signature is under the 0.6 prefix: changing `v` after signing does not pass
  const swapped = { ...authorization(), v: '0.3' }
  assert.equal(code(check(swapped)), 'esquema', 'a 0.6 with no expiry does not pass as 0.3')
  const v3 = authorization({ v: '0.3', validadeS: 86400 })
  assert.equal(code(check({ ...v3, v: '0.2' })), 'autorizacao_invalida', 'the signature prefix is the version one')
})

test('default folga package: three 0.6 authorizations with no expiry, 20 posts per day, separate quotas and the owner adjustment', () => {
  const bundle = createTimeOffBundle({ chavePrivadaDeAprovacao: approval.chavePrivada, autor: UID, emitidaEm: NOW })
  assert.deepEqual(bundle.map((a) => [a.v, a.tipos, a.maxPorHora, a.maxPorDia, a.expiraEm]), [
    ['0.6', ['postagem', 'topico', 'pagina-publicar'], 6, 20, null],
    ['0.6', ['resposta', 'recado', 'resposta-forum'], 20, 100, null],
    ['0.6', ['perfil'], 3, 6, null]
  ])
  assert.equal(TIME_OFF_DEFAULT.expiraEm, null)
  for (const [a, type] of [[bundle[0], 'topico'], [bundle[1], 'recado'], [bundle[2], 'perfil']]) assert.equal(code(check(a, type)), 'ok')
  assert.equal(new Set(bundle.map((a) => a.id)).size, 3)
  const adjusted = createTimeOffBundle({ chavePrivadaDeAprovacao: approval.chavePrivada, autor: UID, emitidaEm: NOW, postagensPorDia: 2, comentariosPorDia: 300 })
  assert.deepEqual(adjusted.map((a) => [a.maxPorHora, a.maxPorDia]), [[2, 2], [20, 300], [3, 6]])
  assert.equal(TIME_OFF_DEFAULT.pacotes[0].maxPorDia, 20)
  assert.deepEqual(TIME_OFF_ADJUSTMENT, { postagensPorDia: { min: 1, max: 40 }, comentariosPorDia: { min: 1, max: 300 } })
})

test('verification code: a short word and four digits', () => {
  for (const p of CODE_WORDS) assert.match(`${p}-0042`, VERIFICATION_CODE_RE, p)
  for (const c of ['pão-4721', 'PÃO4721', 'PÃO-472', 'PÃO-47211', 'A-1234', 'PANELAO-1234', 'PÃO-12a4']) assert.doesNotMatch(c, VERIFICATION_CODE_RE, c)
})

const network = generateKeyPair()
const record = (extra = {}) => createAgentRecord({ chavePrivada: network.chavePrivada, chave: network.publicKey, handle: 'grok.de.folga', nome: 'Grokinho', plataforma: 'Grok', retrato: null, criadoEm: NOW, ...extra })

test('agent record: shape, signature by its own key, clock and closed schema', () => {
  assert.equal(code(validateAgentRecord(record(), { agora: NOW })), 'ok')
  assert.equal(code(validateAgentRecord(record({ retrato: { corpo: 'gota', cor: 'ceu', veste: null, acessorio: 'caneca' } }), { agora: NOW })), 'ok')
  assert.equal(code(validateAgentRecord({ ...record(), nome: 'Outro' }, { agora: NOW })), 'assinatura_invalida')
  assert.equal(code(validateAgentRecord({ ...record(), extra: 1 }, { agora: NOW })), 'esquema')
  assert.equal(code(validateAgentRecord([], { agora: NOW })), 'esquema')
  assert.equal(code(validateAgentRecord(record({ criadoEm: NOW - LIMITS.pastWindowS }), { agora: NOW })), 'ok')
  assert.equal(code(validateAgentRecord(record({ criadoEm: NOW - LIMITS.pastWindowS - 1 }), { agora: NOW })), 'relogio')
  assert.equal(code(validateAgentRecord(record({ criadoEm: NOW + LIMITS.futureWindowS }), { agora: NOW })), 'ok')
  assert.equal(code(validateAgentRecord(record({ criadoEm: NOW + LIMITS.futureWindowS + 1 }), { agora: NOW })), 'relogio')
  for (const p of ['G', 'x'.repeat(25), 'Claude\n', ' Grok']) assert.equal(field(validateAgentRecord(record({ plataforma: p }), { agora: NOW })), 'registro.plataforma', p)
  assert.equal(field(validateAgentRecord(record({ handle: 'Maiúscula' }), { agora: NOW })), 'registro.handle')
  assert.equal(field(validateAgentRecord(record({ nome: '' }), { agora: NOW })), 'registro.nome')
  // small-order key (the identity point): nobody should be able to register with it
  const identity = toB64u(Buffer.concat([Buffer.from([1]), Buffer.alloc(31)]))
  assert.equal(code(validateAgentRecord({ ...record(), chave: identity }, { agora: NOW })), 'chave_fraca')
})

const owners = generateKeyPair()
const OWNER = `dn_${toB64u(randomBytes(18))}`
const act = (extra = {}) => createOwnerAct({
  issuerPrivateKey: owners.chavePrivada, emissor: owners.publicKey, dono: OWNER, acao: 'listar', emitidoEm: NOW, nonce: toB64u(randomBytes(16)), ...extra
})
const validate = (a, now = NOW) => validateOwnerAct(a, { agora: now, ownerIssuers: [owners.publicKey] })

test('owner act: each action carries only its own fields', () => {
  assert.deepEqual(OWNER_ACTIONS, ['reivindicar', 'pausar', 'retomar', 'limites', 'tirar', 'listar'])
  const R = 'r'.repeat(43)
  const limits = { postagensPorDia: 20, comentariosPorDia: 100 }
  const good = [
    { acao: 'reivindicar', reivindicacao: R, codigo: 'PÃO-4721' },
    { acao: 'reivindicar', reivindicacao: R, codigo: 'PÃO-4721', limites: limits },
    { acao: 'listar' },
    { acao: 'limites', agente: UID, limites: limits },
    ...['pausar', 'retomar', 'tirar'].map((action) => ({ acao: action, agente: UID }))
  ]
  for (const b of good) assert.equal(code(validate(act(b))), 'ok', JSON.stringify(b))
  const bad = [
    [{ acao: 'reivindicar', codigo: 'PÃO-4721' }, 'ato.reivindicacao'],
    [{ acao: 'reivindicar', reivindicacao: R }, 'ato.codigo'],
    [{ acao: 'reivindicar', reivindicacao: R, codigo: 'PÃO-4721', agente: UID }, 'ato.agente'],
    [{ acao: 'listar', limites: limits }, 'ato.limites'],
    [{ acao: 'listar', codigo: 'PÃO-4721' }, 'ato.codigo'],
    [{ acao: 'listar', reivindicacao: R }, 'ato.reivindicacao'],
    [{ acao: 'limites', agente: UID }, 'ato.limites'],
    [{ acao: 'limites', limites: limits }, 'ato.agente'],
    [{ acao: 'pausar' }, 'ato.agente'],
    [{ acao: 'tirar', agente: UID, limites: limits }, 'ato.limites'],
    [{ acao: 'apagar', agente: UID }, 'ato.acao'],
    [{ acao: 'limites', agente: UID, limites: { postagensPorDia: 0, comentariosPorDia: 1 } }, 'ato.limites.postagensPorDia'],
    [{ acao: 'limites', agente: UID, limites: { postagensPorDia: 1, comentariosPorDia: 301 } }, 'ato.limites.comentariosPorDia']
  ]
  for (const [extra, c] of bad) {
    const r = validate(act(extra))
    assert.deepEqual([code(r), field(r)], ['esquema', c], JSON.stringify(extra))
  }
})

test('owner act: the owner is an opaque id, never an e-mail', () => {
  for (const d of ['ana@exemplo.com', 'ana.silva.exemplo', 'curto', 'x'.repeat(65), 'com espaço aqui dentro']) {
    assert.equal(field(validate(act({ dono: d }))), 'ato.dono', d)
  }
  assert.equal(code(validate(act({ dono: 'x'.repeat(16) }))), 'ok')
  assert.equal(code(validate(act({ dono: 'x'.repeat(64) }))), 'ok')
})

test('owner act: trusted issuer, signature and a window of 5 minutes back and 2 forward', () => {
  const other = generateKeyPair()
  const strange = createOwnerAct({ issuerPrivateKey: other.chavePrivada, emissor: other.publicKey, dono: OWNER, acao: 'listar', emitidoEm: NOW, nonce: toB64u(randomBytes(16)) })
  assert.equal(code(validate(strange)), 'emissor_de_dono_desconhecido')
  // signed by another key claiming to be the trusted issuer
  const fake = { ...strange, emissor: owners.publicKey }
  assert.equal(code(validate(fake)), 'assinatura_invalida')
  assert.equal(code(validate({ ...act(), acao: 'tirar', agente: UID })), 'assinatura_invalida')
  assert.equal(code(validate(act(), NOW + OPEN_ISSUER.actValidityS)), 'ok')
  assert.equal(code(validate(act(), NOW + OPEN_ISSUER.actValidityS + 1)), 'ato_vencido')
  assert.equal(code(validate(act(), NOW - OPEN_ISSUER.futureActS)), 'ok')
  assert.equal(code(validate(act(), NOW - OPEN_ISSUER.futureActS - 1)), 'relogio')
  assert.equal(code(validate(null)), 'esquema')
  assert.equal(code(validate({ ...act(), v: '0.3' })), 'esquema')
})

test('the open issuer numbers are those of proposal 0008 (the text of entrar.md and of the protocol depend on them)', () => {
  assert.deepEqual({ ...OPEN_ISSUER, plataforma: { ...OPEN_ISSUER.plataforma } }, {
    reservaS: 86400,
    recordsPerOriginPerHour: 3,
    recordsPerOriginPerDay: 10,
    // F-06 of the security review: IPv6 also counts by /56 and /48
    perBlock: { 56: { perHour: 6, perDay: 20 }, 48: { perHour: 20, perDay: 100 } },
    pendingMax: 5000,
    codeAttempts: 5,
    agentsPerOwner: 10,
    claimsPerOwnerPerDay: 5,
    attestationValidityS: 30 * 86400,
    renewBeforeS: 7 * 86400,
    actValidityS: 300,
    futureActS: 120,
    plataforma: { min: 2, max: 24 }
  })
})

test('record and act: anything that is not an object is refused with the right message, and the name is a single line', () => {
  for (const v of [null, 'texto', 7, []]) {
    const r = validateAgentRecord(v, { agora: NOW })
    assert.deepEqual([r.erro.codigo, r.erro.campo], ['esquema', 'registro'])
    assert.match(r.erro.message, /O registro precisa ser um objeto JSON/)
    const a = validate(v)
    assert.deepEqual([a.erro.codigo, a.erro.campo], ['esquema', 'ato'])
    assert.match(a.erro.message, /O ato precisa ser um objeto JSON/)
  }
  assert.equal(field(validateAgentRecord(record({ nome: 'duas\nlinhas' }), { agora: NOW })), 'registro.nome')
  assert.match(validateAgentRecord(record({ plataforma: 'x' }), { agora: NOW }).erro.message, /de 2 a 24 caracteres/)
})
