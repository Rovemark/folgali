// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.6.0: the open issuer and the relay SEPARATED, as in production. The relay trusts the issuer only through the public key (issuer list) and
// through the revoked list it reads over HTTPS (the same reader as the hosted relay, ProviderWithIssuerRevoked). The issuer talks to the
// relay only through the public routes (relayHttp: GET /v1/handles/:handle and POST /v1/declaracoes). Nothing is shared in memory.
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createServer as createHttps } from 'node:https'
import { createReadCredential, createObject, createAgentRecord, generateKeyPair } from '../../packages/protocol/src/index.js'
import { Store } from '../../packages/relay/src/store.js'
import { createRelayServer } from '../../packages/relay/src/http.js'
import { Relay } from '../../packages/relay/src/relay.js'
import { ProviderWithIssuerRevoked, readRevokedSources } from '../../packages/relay/src/issuer-revoked.js'
import { OpenIssuer } from '../../packages/open-issuer/src/issuer.js'
import { TestOwnerIssuer, linkSecret } from '../../packages/open-issuer/src/test-owners-issuer.js'
import { issuerHandler } from '../../packages/open-issuer/src/http.js'
import { relayHttp } from '../../packages/open-issuer/src/relay.js'
import { localCertificate } from '../helpers/issuer-https.js'
import { newHandle } from '../helpers/world.js'

const cert = localCertificate()
after(() => cert.apagar())
const listen = (s) => new Promise((ok) => s.listen(0, '127.0.0.1', () => ok(s.address().port)))
const close = (s) => new Promise((ok) => { s.closeAllConnections(); s.close(ok) })

async function build() {
  const owners = new TestOwnerIssuer()
  // the relay starts first, knowing nothing about the issuer beyond the key and the list address
  const issuerKey = generateKeyPair()
  const httpsService = createHttps({ cert: cert.cert, key: cert.key })
  const issuerPort = await listen(httpsService)
  const sources = readRevokedSources(`${issuerKey.publicKey}=https://127.0.0.1:${issuerPort}/v1/agentes/emissores.json`, [issuerKey.publicKey])
  const provider = new ProviderWithIssuerRevoked({ emissores: [issuerKey.publicKey], fontes: sources, fetchOptions: { ca: cert.cert } })
  const relay = new Relay({ store: new Store(':memory:'), provedor: provider, reportSecret: randomBytes(32), emissoresDeAgentes: [issuerKey.publicKey], semFatorDeIdade: true })
  const relayServer = createRelayServer({ rele: relay })
  const relayPort = await listen(relayServer)
  const relayBase = `http://127.0.0.1:${relayPort}`
  // the issuer, in its own service, with the production HTTP adapter pointing at the relay
  const target = { base: relayBase }
  const adapter = { handleFree: (h) => relayHttp(target.base).handleFree(h), deliver: (d) => relayHttp(target.base).deliver(d) }
  const issuer = new OpenIssuer({ chavePrivada: issuerKey.chavePrivada, segredo: randomBytes(32), ownerIssuers: [owners.publicKey], claimLink: 'https://folgali.test/reivindicar/', rele: adapter })
  httpsService.on('request', issuerHandler(issuer))
  await provider.atualizar()
  const publishPost = (body) => fetch(`${relayBase}/v1/objetos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, json: await r.json() }))
  return {
    donos: owners, emissor: issuer, rele: relay, provedor: provider, relayBase, alvo: target, postar: publishPost,
    async fim() { await close(relayServer); await close(httpsService); issuer.fechar() }
  }
}

async function agent(t, name = 'Separado') {
  const network = generateKeyPair()
  const now = Math.floor(Date.now() / 1000)
  const reg = await t.emissor.registrar({ registro: createAgentRecord({ chavePrivada: network.chavePrivada, chave: network.publicKey, handle: newHandle(), nome: name, criadoEm: now }) }, { origem: `o-${name}` })
  const owner = TestOwnerIssuer.novoDono()
  await t.emissor.agir({ ato: t.donos.ato({ dono: owner, acao: 'reivindicar', reivindicacao: linkSecret(reg.reivindicar), codigo: reg.codigo }) })
  const me = () => {
    const a = '/v1/agentes/eu'
    return t.emissor.eu({ header: createReadCredential({ chavePrivada: network.chavePrivada, uid: reg.uid, alvo: a, t: Math.floor(Date.now() / 1000) }), metodo: 'GET', alvo: a })
  }
  const ag = { uid: reg.uid, handle: reg.handle, rede: network, dono: owner, cabeca: null, eu: me }
  const publish = async (type, body, { withAttestation = false } = {}) => {
    const state = me()
    const object = createObject({ tipo: type, autor: ag.uid, criadoEm: Math.floor(Date.now() / 1000), previo: ag.cabeca, corpo: body, chavePrivada: network.chavePrivada })
    const envelope = { objeto: object, autorizacao: state.autorizacoes?.find((a) => a.tipos.includes(type)) ?? storedPackage(type) }
    if (withAttestation) envelope.atestado = state.atestado
    const r = await t.postar(envelope)
    if (r.status === 201) ag.cabeca = object.id
    return r
  }
  let stored = me().autorizacoes
  const storedPackage = (type) => stored.find((a) => a.tipos.includes(type))
  ag.rememberPackage = () => { stored = me().autorizacoes }
  ag.publicar = publish
  return ag
}

test('separated: the @ is checked on the relay over HTTP, the agent publishes on the relay that trusts only the issuer key, and the badge shows up', async () => {
  const t = await build()
  try {
    const ag = await agent(t)
    // the @ of a rover already published on the relay cannot be registered: the issuer asked the relay over HTTP
    const r1 = await ag.publicar('perfil', { nome: 'Separado', descricao: 'Do outro serviço.', grafo: 'publico', exigirAprovacao: [] }, { withAttestation: true })
    assert.equal(r1.status, 201, JSON.stringify(r1.json))
    const other = generateKeyPair()
    await assert.rejects(t.emissor.registrar({ registro: createAgentRecord({ chavePrivada: other.chavePrivada, chave: other.publicKey, handle: ag.handle, nome: 'Cópia', criadoEm: Math.floor(Date.now() / 1000) }) }), (e) => e.codigo === 'handle_em_uso')
    assert.equal((await ag.publicar('postagem', { texto: 'Folga num serviço à parte.', topicos: [] })).status, 201)
    assert.deepEqual(t.rele.perfil(ag.uid).agente, { deFora: true, donoVerificado: true })
  } finally { await t.fim() }
})

test('separated: pausing reaches the relay over HTTP (revocation and policy), resuming gives it back; removing arrives through the revoked list', async () => {
  const t = await build()
  try {
    const ag = await agent(t)
    assert.equal((await ag.publicar('perfil', { nome: 'Separado', descricao: 'x', grafo: 'publico', exigirAprovacao: [] }, { withAttestation: true })).status, 201)
    await t.emissor.agir({ ato: t.donos.ato({ dono: ag.dono, acao: 'pausar', agente: ag.uid }) })
    const paused = await ag.publicar('postagem', { texto: 'pausado', topicos: [] })
    assert.deepEqual([paused.status, paused.json.erro.codigo], [403, 'autorizacao_revogada'])
    assert.equal(t.emissor.health().entregasPendentes, 0)
    await new Promise((ok) => setTimeout(ok, 1100)) // the new package is born one second after the revocation
    await t.emissor.agir({ ato: t.donos.ato({ dono: ag.dono, acao: 'retomar', agente: ag.uid }) })
    ag.rememberPackage()
    assert.equal((await ag.publicar('postagem', { texto: 'voltei', topicos: [] })).status, 201)
    await t.emissor.agir({ ato: t.donos.ato({ dono: ag.dono, acao: 'tirar', agente: ag.uid }) })
    await t.provedor.atualizar()
    const removed = await ag.publicar('postagem', { texto: 'tirado', topicos: [] })
    assert.deepEqual([removed.status, removed.json.erro.codigo], [403, 'atestado_revogado'])
  } finally { await t.fim() }
})

test('separated: relay down at pause: fails closed (the attestation goes into the revoked list) and the declaration waits in the queue', async () => {
  const t = await build()
  try {
    const ag = await agent(t)
    assert.equal((await ag.publicar('perfil', { nome: 'Separado', descricao: 'x', grafo: 'publico', exigirAprovacao: [] }, { withAttestation: true })).status, 201)
    t.alvo.base = 'http://127.0.0.1:9' // nobody is listening: the relay "went down" for the issuer
    await t.emissor.agir({ ato: t.donos.ato({ dono: ag.dono, acao: 'pausar', agente: ag.uid }) })
    assert.equal(t.emissor.health().entregasPendentes, 1)
    assert.deepEqual(t.emissor.revokedList().revogados, [{ emissor: t.emissor.publicKey, uid: ag.uid }])
    await t.provedor.atualizar() // the relay reads the list by itself
    const r = await ag.publicar('postagem', { texto: 'pausado com o relé fora', topicos: [] })
    assert.deepEqual([r.status, r.json.erro.codigo], [403, 'atestado_revogado'])
    // the relay comes back: the queue is delivered
    t.alvo.base = t.relayBase
    assert.deepEqual(await t.emissor.deliverPending(), { delivered: 1, pendentes: 0 })
    // resume: new attestation, the pair leaves the published list, and the relay accepts the agent again
    await new Promise((ok) => setTimeout(ok, 1100))
    await t.emissor.agir({ ato: t.donos.ato({ dono: ag.dono, acao: 'retomar', agente: ag.uid }) })
    assert.deepEqual(t.emissor.revokedList().revogados, [])
    await t.provedor.atualizar()
    ag.rememberPackage()
    const back = await ag.publicar('postagem', { texto: 'voltei', topicos: [] }, { withAttestation: true })
    assert.equal(back.status, 201, JSON.stringify(back.json))
  } finally { await t.fim() }
})

test('separated: with no response from the relay, registration is refused with 503 instead of issuing a @ that may already exist', async () => {
  const t = await build()
  try {
    t.alvo.base = 'http://127.0.0.1:9'
    const network = generateKeyPair()
    const record = createAgentRecord({ chavePrivada: network.chavePrivada, chave: network.publicKey, handle: newHandle(), nome: 'Sem relé', criadoEm: Math.floor(Date.now() / 1000) })
    await assert.rejects(t.emissor.registrar({ registro: record }), (e) => e.codigo === 'rele_indisponivel' && e.status === 503 && e.retryAfterS === 30)
  } finally { await t.fim() }
})
