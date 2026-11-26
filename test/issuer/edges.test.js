// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.6.0: the open issuer edge cases that mutation testing pointed out. Exact windows (the hour and the day of each limit), the dates that
// keep a package from being born revoked, the fixed key derivation (changing it would orphan every agent), the issuer without a relay, and the
// reading of the configuration of the two relay entries.
import { CLOUDFLARE_RANGES } from '../../packages/protocol/src/cloudflare.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { OPEN_ISSUER, privateKeyFromSeed, publicKeyOf, createAgentRecord, createReadCredential, generateKeyPair } from '../../packages/protocol/src/index.js'
import { OpenIssuer } from '../../packages/open-issuer/src/issuer.js'
import { readConfig } from '../../packages/open-issuer/src/configuration.js'
import { standingAuthorizationOf, agentIssuersOf } from '../../packages/relay/src/operations.js'
import { TestOwnerIssuer, linkSecret } from '../../packages/open-issuer/src/test-owners-issuer.js'
import { NOW, newHandle } from '../helpers/world.js'
import { codeAsync, codeOf, errorAsync, errorOf, newWorld, publish } from '../helpers/test-relay.js'

const HOUR = 3600
const DAY = 86400

async function register(m, { origem: origin = `o-${randomBytes(4).toString('hex')}`, emissor: issuer = m.emissor, agora: now = m.relogio.agora } = {}) {
  const network = generateKeyPair()
  const record = createAgentRecord({ chavePrivada: network.chavePrivada, chave: network.publicKey, handle: newHandle(), nome: 'Bot', criadoEm: now })
  const r = await issuer.registrar({ registro: record }, { origem: origin })
  return { ...r, rede: network, cabeca: null, segredo: linkSecret(r.reivindicar) }
}
const me = (m, ag, issuer = m.emissor) => {
  const target = '/v1/agentes/eu'
  return issuer.eu({ header: createReadCredential({ chavePrivada: ag.rede.chavePrivada, uid: ag.uid, alvo: target, t: m.relogio.agora }), metodo: 'GET', alvo: target })
}
const performAct = async (m, data) => m.emissor.agir({ ato: m.donos.ato(data) })
async function released(m, owner = TestOwnerIssuer.novoDono()) {
  const ag = await register(m)
  await performAct(m, { dono: owner, acao: 'reivindicar', reivindicacao: ag.segredo, codigo: ag.codigo })
  return Object.assign(ag, { dono: owner }, me(m, ag))
}

test('body that is not an object: registration and act answer esquema, without blowing up', async () => {
  const m = newWorld({ openIssuer: true })
  for (const body of [null, 'texto', 3, [], ['registro']]) {
    assert.equal(await codeAsync(() => m.emissor.registrar(body)), 'esquema', JSON.stringify(body))
    assert.equal(await codeAsync(() => m.emissor.agir(body)), 'esquema', JSON.stringify(body))
  }
})

test('fixed derivation: the same secret gives the same approval key and the same owner HMAC, today and after any change in the code', async () => {
  const e = new OpenIssuer({ chavePrivada: privateKeyFromSeed(Buffer.alloc(32, 1)), segredo: Buffer.alloc(32, 7), ownerIssuers: ['B'.repeat(43)], claimLink: 'https://x.test/r/' })
  assert.equal(publicKeyOf(e._approvalKey(`rvr_${'A'.repeat(22)}`)), '-H_9cbvfE7Fz1LKEeCzSojH4bG0KQBEi-ElhuEirtDQ')
  assert.equal(e._ownerHash('B'.repeat(43), 'dn_teste_0123456789'), '0gqtMro3tnwsVY_z7v8Q1NQ8m7gruUCMp4I_xGE8lZM')
})

test('per-origin limit at the exact edges: the hour and the day count from the oldest registration in the window', async () => {
  const m = newWorld({ openIssuer: true })
  const origin = 'borda-hora'
  const t0 = m.relogio.agora
  for (const d of [0, 10, 20]) { m.relogio.agora = t0 + d; await register(m, { origem: origin }) }
  m.relogio.agora = t0 + 30
  assert.equal((await errorAsync(() => register(m, { origem: origin }))).retryAfterS, HOUR - 30, 'counted from the oldest in the hour')
  m.relogio.agora = t0 + HOUR - 1
  assert.equal((await errorAsync(() => register(m, { origem: origin }))).retryAfterS, 1)
  m.relogio.agora = t0 + HOUR
  assert.equal((await register(m, { origem: origin })).situacao, 'aguardando-dono', 'at the exact hour the oldest left the window')

  const day = 'borda-dia'
  const t1 = m.relogio.agora
  for (let i = 0; i < 10; i++) { m.relogio.agora = t1 + i * HOUR; await register(m, { origem: day }) }
  m.relogio.agora = t1 + 10 * HOUR
  assert.equal((await errorAsync(() => register(m, { origem: day }))).retryAfterS, DAY - 10 * HOUR, 'counted from the oldest in the day')
  m.relogio.agora = t1 + DAY - 1
  assert.equal((await errorAsync(() => register(m, { origem: day }))).retryAfterS, 1)
  m.relogio.agora = t1 + DAY
  assert.equal((await register(m, { origem: day })).situacao, 'aguardando-dono')
})

test('the in-memory origin map is capped at 100 thousand: the oldest goes first, never before the cap is passed', async () => {
  const m = newWorld({ openIssuer: true })
  for (let i = 0; i < 99_999; i++) m.emissor._origins.set(`velha-${i}`, [m.relogio.agora])
  await register(m, { origem: 'nova-1' })
  assert.equal(m.emissor._origins.size, 100_000)
  assert.ok(m.emissor._origins.has('velha-0'), 'at the exact cap nobody leaves')
  await register(m, { origem: 'nova-2' })
  assert.equal(m.emissor._origins.size, 100_000)
  assert.ok(!m.emissor._origins.has('velha-0'))
  assert.ok(m.emissor._origins.has('velha-1'))
})

test('claims per owner per day at the edges: counted from the oldest, and at the exact end of the day it frees up', async () => {
  const m = newWorld({ openIssuer: true })
  const owner = TestOwnerIssuer.novoDono()
  const t0 = m.relogio.agora
  for (let i = 0; i < 5; i++) { m.relogio.agora = t0 + i * 10; await released(m, owner) }
  m.relogio.agora = t0 + 100
  const ag = await register(m)
  assert.equal((await errorAsync(() => performAct(m, { dono: owner, acao: 'reivindicar', reivindicacao: ag.segredo, codigo: ag.codigo }))).retryAfterS, DAY - 100)
  m.relogio.agora = t0 + DAY - 1
  const ag2 = await register(m)
  assert.equal((await errorAsync(() => performAct(m, { dono: owner, acao: 'reivindicar', reivindicacao: ag2.segredo, codigo: ag2.codigo }))).retryAfterS, 1)
  m.relogio.agora = t0 + DAY
  assert.equal((await performAct(m, { dono: owner, acao: 'reivindicar', reivindicacao: ag2.segredo, codigo: ag2.codigo })).situacao, 'liberado')
})

test('the expired registration disappears exactly 7 days after the end of the reservation', async () => {
  const m = newWorld({ openIssuer: true })
  const ag = await register(m)
  const exists = () => m.emissor.db.prepare('SELECT COUNT(*) AS n FROM agentes WHERE uid = ?').get(ag.uid).n
  m.relogio.agora = ag.expiraEm + 7 * DAY - 1
  await register(m)
  assert.equal(exists(), 1)
  m.relogio.agora = ag.expiraEm + 7 * DAY
  await register(m)
  assert.equal(exists(), 0)
})

test('renewal at the edge: with exactly 7 days left it does not renew; with one second less, it renews', async () => {
  const m = newWorld({ openIssuer: true })
  const ag = await released(m)
  m.relogio.agora = ag.atestado.expiraEm - OPEN_ISSUER.renewBeforeS
  assert.equal(me(m, ag).atestado.emitidoEm, ag.atestado.emitidoEm)
  m.relogio.agora++
  assert.equal(me(m, ag).atestado.emitidoEm, m.relogio.agora)
  // the folga package has no expiry: years later, with the attestation renewed, it stays the same
  const bundle = me(m, ag).autorizacoes
  assert.ok(bundle.every((x) => x.expiraEm === null))
  m.relogio.agora += 5 * 365 * DAY
  assert.deepEqual(me(m, ag).autorizacoes.map((x) => x.id), bundle.map((x) => x.id))
})

test('dates in the same second: the new package is born one second after the revocation, and the policy advances one second at a time', async () => {
  const m = newWorld({ openIssuer: true })
  const ag = await released(m)
  const t = m.relogio.agora
  publish(m, ag, 'perfil', { nome: 'Bot', descricao: 'x' }, { withAttestation: true, autorizacao: ag.autorizacoes.find((a) => a.tipos.includes('perfil')) })
  const v = m.emissor.provedor.versao
  await performAct(m, { dono: ag.dono, acao: 'limites', agente: ag.uid, limites: { postagensPorDia: 3, comentariosPorDia: 3 } })
  assert.equal(me(m, ag).autorizacoes[0].emitidaEm, t + 1, 'limits in the same second as the claim')
  assert.equal(m.emissor.provedor.versao, v, 'changing the limits does not touch the revoked list')
  const limitsPackage = me(m, ag).autorizacoes
  await performAct(m, { dono: ag.dono, acao: 'pausar', agente: ag.uid })
  assert.equal(m.store.politica(ag.uid).emitida_em, t)
  // the package issued by the limits change (at t + 1) also falls with the pause in the same second
  assert.equal(codeOf(() => publish(m, ag, 'postagem', { texto: 'pausado', topicos: [] }, { autorizacao: limitsPackage[0] })), 'autorizacao_revogada')
  await performAct(m, { dono: ag.dono, acao: 'limites', agente: ag.uid, limites: { postagensPorDia: 4, comentariosPorDia: 4 } })
  await performAct(m, { dono: ag.dono, acao: 'retomar', agente: ag.uid })
  assert.equal(m.store.politica(ag.uid).emitida_em, t + 1)
  assert.equal(me(m, ag).autorizacoes[0].emitidaEm, t + 2, 'one second after the revocation of "todas" (made at t + 1)')
  assert.equal(m.emissor.provedor.versao, v, 'resuming with the relay knowing the agent does not touch the revoked list')
})

test('pausing before the first publication revokes exactly the attestation issued up to then', async () => {
  const m = newWorld({ openIssuer: true })
  const ag = await released(m)
  await performAct(m, { dono: ag.dono, acao: 'pausar', agente: ag.uid })
  assert.deepEqual(m.emissor.provedor.revogados(), [{ emissor: m.emissor.publicKey, uid: ag.uid, ate: ag.atestado.emitidoEm + 1 }])
})

test('the nonce of an act is kept until the act expires for good, even with sweeps in between', async () => {
  const m = newWorld({ openIssuer: true })
  const ag = await released(m)
  const act = m.donos.ato({ dono: ag.dono, acao: 'listar' })
  await m.emissor.agir({ ato: act })
  m.relogio.agora += OPEN_ISSUER.actValidityS - 1
  await performAct(m, { dono: ag.dono, acao: 'listar' }) // varre
  assert.equal(await codeAsync(() => m.emissor.agir({ ato: act })), 'ato_repetido')
})

test('issuer info: the default and the folga adjustment', async () => {
  const m = newWorld({ openIssuer: true })
  const i = m.emissor.info()
  assert.deepEqual(i.padrao, { postagensPorDia: 20, comentariosPorDia: 100 })
  assert.deepEqual(i.ajuste, { postagensPorDia: { min: 1, max: 40 }, comentariosPorDia: { min: 1, max: 300 } })
})

test('issuer without a relay attached: registers, releases and, on pause, revokes the attestation (there is no relay to receive the policy)', async () => {
  const owners = new TestOwnerIssuer({ relogio: () => NOW })
  const e = new OpenIssuer({ chavePrivada: generateKeyPair().chavePrivada, segredo: randomBytes(32), ownerIssuers: [owners.publicKey], claimLink: 'https://x.test/r/', relogio: () => NOW })
  const m = { relogio: { agora: NOW } }
  const ag = await register(m, { emissor: e, agora: NOW })
  const owner = TestOwnerIssuer.novoDono()
  await e.agir({ ato: owners.ato({ dono: owner, acao: 'reivindicar', reivindicacao: ag.segredo, codigo: ag.codigo }) })
  const state = me(m, ag, e)
  assert.equal(state.situacao, 'liberado')
  await e.agir({ ato: owners.ato({ dono: owner, acao: 'pausar', agente: ag.uid }) })
  assert.deepEqual(e.provedor.revogados(), [{ emissor: e.publicKey, uid: ag.uid, ate: state.atestado.emitidoEm + 1 }])
})

test('service configuration: everything checked, and no secret in the message', () => {
  const key = 'a'.repeat(64)
  const ok = {
    ISSUER_KEY: key, ISSUER_SECRET: 'b'.repeat(64), ISSUER_OWNERS: ` ${'C'.repeat(43)} ,, ${'D'.repeat(43)} `,
    ISSUER_LINK: 'https://folgali.com/reivindicar/', ISSUER_RELAY: 'https://folgali.com/'
  }
  const c = readConfig(ok)
  assert.equal(publicKeyOf(c.chavePrivada), publicKeyOf(privateKeyFromSeed(Buffer.from(key, 'hex'))))
  assert.deepEqual(c.segredo, Buffer.from('b'.repeat(64), 'hex'))
  assert.deepEqual(c.ownerIssuers, ['C'.repeat(43), 'D'.repeat(43)])
  assert.equal(c.claimLink, 'https://folgali.com/reivindicar/')
  assert.equal(c.rele, 'https://folgali.com')
  assert.deepEqual([c.banco, c.porta, c.endereco, c.trustProxy, c.deliveryIntervalS], ['/dados/emissor-aberto.sqlite', 4848, '127.0.0.1', false, 60])
  const other = readConfig({ ...ok, ISSUER_DB: '/x.sqlite', ISSUER_PORT: '9000', ISSUER_ADDRESS: '0.0.0.0', ISSUER_TRUST_PROXY: 'sim', ISSUER_DELIVERY_INTERVAL_S: '5', ISSUER_LINK: 'https://folgali.com/', ISSUER_RELAY: 'http://127.0.0.1:4747' })
  assert.deepEqual([other.banco, other.porta, other.endereco, other.trustProxy, other.deliveryIntervalS, other.claimLink, other.rele], ['/x.sqlite', 9000, '0.0.0.0', true, 5, 'https://folgali.com/', 'http://127.0.0.1:4747'])
  assert.equal(readConfig({ ...ok, ISSUER_RELAY: 'http://localhost' }).rele, 'http://localhost')
  // Cloudflare: off by default; on only with the proxy trusted; the override replaces the built-in list
  assert.equal(c.cloudflare, null)
  assert.equal(other.cloudflare, null)
  assert.deepEqual(readConfig({ ...ok, ISSUER_TRUST_PROXY: 'sim', ISSUER_CLOUDFLARE: 'sim' }).cloudflare, { ranges: CLOUDFLARE_RANGES })
  assert.deepEqual(readConfig({ ...ok, ISSUER_TRUST_PROXY: 'sim', ISSUER_CLOUDFLARE: 'sim', ISSUER_CLOUDFLARE_RANGES: '198.51.100.0/24' }).cloudflare, { ranges: ['198.51.100.0/24'] })
  const bad = [
    [{ ISSUER_KEY: undefined }, /ISSUER_KEY/],
    [{ ISSUER_KEY: 'a'.repeat(63) }, /ISSUER_KEY/],
    [{ ISSUER_KEY: `x${'a'.repeat(63)}` }, /ISSUER_KEY/],
    [{ ISSUER_KEY: `${'a'.repeat(64)}0` }, /ISSUER_KEY/],
    [{ ISSUER_SECRET: undefined }, /ISSUER_SECRET/],
    [{ ISSUER_SECRET: 'A'.repeat(64) }, /diferente/],
    [{ ISSUER_OWNERS: undefined }, /ISSUER_OWNERS/],
    [{ ISSUER_OWNERS: ' , ' }, /ISSUER_OWNERS/],
    [{ ISSUER_OWNERS: `${'C'.repeat(43)},curta` }, /ISSUER_OWNERS/],
    [{ ISSUER_OWNERS: 'C'.repeat(44) }, /ISSUER_OWNERS/],
    [{ ISSUER_LINK: undefined }, /ISSUER_LINK/],
    [{ ISSUER_LINK: 'http://folgali.com/r/' }, /ISSUER_LINK/],
    [{ ISSUER_LINK: 'https://folgali.com/r' }, /ISSUER_LINK/],
    [{ ISSUER_LINK: 'https://folgali.com/r/?x=1/' }, /ISSUER_LINK/],
    [{ ISSUER_LINK: 'https://u@folgali.com/r/' }, /ISSUER_LINK/],
    [{ ISSUER_LINK: 'xhttps://folgali.com/r/' }, /ISSUER_LINK/],
    [{ ISSUER_RELAY: undefined }, /ISSUER_RELAY/],
    [{ ISSUER_RELAY: 'http://folgali.com' }, /ISSUER_RELAY/],
    [{ ISSUER_RELAY: 'https://folgali.com/v1' }, /ISSUER_RELAY/],
    [{ ISSUER_RELAY: 'https://u@folgali.com' }, /ISSUER_RELAY/],
    [{ ISSUER_RELAY: 'http://127.0.0.2' }, /ISSUER_RELAY/],
    [{ ISSUER_TRUST_PROXY: 'talvez' }, /ISSUER_TRUST_PROXY/],
    [{ ISSUER_CLOUDFLARE: 'talvez', ISSUER_TRUST_PROXY: 'sim' }, /ISSUER_CLOUDFLARE aceita/],
    [{ ISSUER_CLOUDFLARE: 'sim' }, /ISSUER_TRUST_PROXY=sim/],
    [{ ISSUER_CLOUDFLARE_RANGES: '198.51.100.0/24' }, /ISSUER_CLOUDFLARE_RANGES só vale/],
    [{ ISSUER_CLOUDFLARE: 'sim', ISSUER_TRUST_PROXY: 'sim', ISSUER_CLOUDFLARE_RANGES: '1.2.3.4' }, /ISSUER_CLOUDFLARE_RANGES tem uma faixa/],
    [{ ISSUER_PORT: '0' }, /ISSUER_PORT/],
    [{ ISSUER_PORT: '70000' }, /ISSUER_PORT/],
    [{ ISSUER_PORT: '1.5' }, /ISSUER_PORT/],
    [{ ISSUER_DELIVERY_INTERVAL_S: '4' }, /ISSUER_DELIVERY_INTERVAL_S/]
  ]
  for (const [swap, error] of bad) {
    assert.throws(() => readConfig({ ...ok, ...swap }), (e) => error.test(e.message) && !e.message.includes('b'.repeat(64)) && !e.message.includes(key), JSON.stringify(swap))
  }
})

test('relay: RELAY_AGENT_ISSUERS only accepts keys the relay already trusts', () => {
  const a = 'A'.repeat(43)
  const b = 'B'.repeat(43)
  assert.deepEqual(agentIssuersOf({}, [a]), [])
  assert.deepEqual(agentIssuersOf({ RELAY_AGENT_ISSUERS: '' }, [a]), [])
  assert.deepEqual(agentIssuersOf({ RELAY_AGENT_ISSUERS: ` ${a} , ${a} ` }, [a, b]), [a])
  assert.throws(() => agentIssuersOf({ RELAY_AGENT_ISSUERS: b }, [a]), /não está em RELAY_ISSUERS/)
  assert.throws(() => agentIssuersOf({ RELAY_AGENT_ISSUERS: 'curta' }, [a]), /43 caracteres/)
})

test('RELAY_STANDING_AUTHORIZATION: absent, empty and sim turn it on; nao turns it off; anything else is an error', async () => {
  for (const v of [undefined, '', 'sim']) assert.equal(standingAuthorizationOf({ RELAY_STANDING_AUTHORIZATION: v }), true)
  assert.equal(standingAuthorizationOf({ RELAY_STANDING_AUTHORIZATION: 'nao' }), false)
  assert.equal(standingAuthorizationOf({}), true)
  for (const v of ['NAO', 'false', '0', 'talvez']) assert.throws(() => standingAuthorizationOf({ RELAY_STANDING_AUTHORIZATION: v }), /aceita só/)
})

test('the registration accepted at the day edge keeps the oldest: the next one, at the same instant, still counts it', async () => {
  const m = newWorld({ openIssuer: true })
  const origin = 'borda-guardada'
  const t0 = m.relogio.agora
  for (let i = 0; i < 9; i++) { m.relogio.agora = t0 + i * HOUR; await register(m, { origem: origin }) }
  m.relogio.agora = t0 + DAY - 1
  await register(m, { origem: origin })
  assert.equal((await errorAsync(() => register(m, { origem: origin }))).retryAfterS, 1, 'the one from t0 is 86399 seconds old and still counts')
})

test('the default issuer clock is the system one, in seconds', async () => {
  const owners = new TestOwnerIssuer()
  const e = new OpenIssuer({ chavePrivada: generateKeyPair().chavePrivada, segredo: randomBytes(32), ownerIssuers: [owners.publicKey], claimLink: 'https://x.test/r/' })
  const now = Math.floor(Date.now() / 1000)
  const r = await register({ relogio: { agora: now } }, { emissor: e, agora: now })
  assert.ok(Math.abs(r.expiraEm - OPEN_ISSUER.reservaS - now) <= 2)
})
