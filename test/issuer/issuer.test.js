// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.6.0 (proposal 0008): the open issuer for outside agents, end to end in the same process as the relay. The agent registers, the owner
// claims it with the code, the agent publishes WITHOUT approval for each text, and the owner pauses, resumes, changes the limits and removes it.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  VERIFICATION_CODE_RE, OPEN_ISSUER, PORTRAIT_PARTS, createReadCredential, createAgentRecord, generateKeyPair, toB64u
} from '../../packages/protocol/src/index.js'
import { OpenIssuer, RESERVED_HANDLES } from '../../packages/open-issuer/src/issuer.js'
import { CompositeProvider } from '../helpers/composite-provider.js'
import { TestOwnerIssuer, linkSecret } from '../../packages/open-issuer/src/test-owners-issuer.js'
import { StaticProvider } from '../../packages/relay/src/provider.js'
import { newHandle } from '../helpers/world.js'
import { codeAsync, codeOf, errorAsync, errorOf, newWorld, publish, registeredRover } from '../helpers/test-relay.js'

const HOUR = 3600
const DAY = 86400
let origins = 0
const newOrigin = () => `origem-${origins++}`

/** An outside agent: generates the network key and registers. */
async function register(m, { handle = newHandle(), nome: name = 'Agente de Fora', plataforma: platform = 'OpenClaw', retrato: portrait = null, origem: origin = newOrigin(), rede: network = generateKeyPair(), criadoEm: createdAt } = {}) {
  const record = createAgentRecord({ chavePrivada: network.chavePrivada, chave: network.publicKey, handle, nome: name, plataforma: platform, retrato: portrait, criadoEm: createdAt ?? m.relogio.agora })
  const r = await m.emissor.registrar({ registro: record }, { origem: origin })
  return { ...r, rede: network, cabeca: null, segredo: linkSecret(r.reivindicar) }
}

const credential = (m, ag, target = '/v1/agentes/eu') => ({
  header: createReadCredential({ chavePrivada: ag.rede.chavePrivada, uid: ag.uid, alvo: target, t: m.relogio.agora }), metodo: 'GET', alvo: target
})
const me = (m, ag) => m.emissor.eu(credential(m, ag))
const performAct = async (m, data) => m.emissor.agir({ ato: m.donos.ato(data) })
const claim = async (m, ag, owner, extra = {}) => performAct(m, { dono: owner, acao: 'reivindicar', reivindicacao: ag.segredo, codigo: ag.codigo, ...extra })

/** Agent registered, claimed and with its state read (attestation and package), ready to publish. */
async function releasedAgent(m, { dono: owner = TestOwnerIssuer.novoDono(), limites: limits, ...options } = {}) {
  const ag = await register(m, options)
  await claim(m, ag, owner, limits ? { limites: limits } : {})
  Object.assign(ag, { dono: owner }, me(m, ag))
  return ag
}
const bundle = (ag, type) => ag.autorizacoes.find((a) => a.tipos.includes(type))
const publishPost = (m, ag, text = 'de folga') => publish(m, ag, 'postagem', { texto: text, topicos: [] }, { autorizacao: bundle(ag, 'postagem') })
const present = (m, ag) => publish(m, ag, 'perfil', { nome: ag.nome, descricao: 'Agente de fora em folga.' }, { withAttestation: true, autorizacao: bundle(ag, 'perfil') })

test('registration: returns uid, readable code, link with a secret and a random portrait without the mascot cap; nothing is published', async () => {
  const m = newWorld({ openIssuer: true })
  const ag = await register(m)
  assert.match(ag.uid, /^rvr_[A-Za-z0-9_-]{22}$/)
  assert.match(ag.codigo, VERIFICATION_CODE_RE)
  assert.ok(ag.reivindicar.startsWith('https://folgali.test/reivindicar/'))
  assert.match(ag.segredo, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(ag.situacao, 'aguardando-dono')
  assert.equal(ag.expiraEm, m.relogio.agora + OPEN_ISSUER.reservaS)
  assert.ok(PORTRAIT_PARTS.corpo.includes(ag.retrato.corpo))
  assert.ok(!PORTRAIT_PARTS.veste.includes('touca'), 'the aviator cap belongs to Luna')
  // the issuer database does not keep the link secret, only the hash
  const line = m.emissor.db.prepare('SELECT * FROM agentes WHERE uid = ?').get(ag.uid)
  assert.notEqual(line.token_hash, ag.segredo)
  assert.equal(JSON.stringify(line).includes(ag.segredo), false)
  // before the owner: the agent sees its own code, with no attestation; the relay does not know it
  const state = me(m, ag)
  assert.deepEqual([state.situacao, state.codigo, state.atestado], ['aguardando-dono', ag.codigo, undefined])
  assert.equal(codeOf(() => m.rele.perfil(ag.uid)), 'nao_encontrado')
  // the claim page shows who it is, never the code
  const page = m.emissor.reivindicacao(ag.segredo)
  assert.equal(page.handle, ag.handle)
  assert.equal(page.plataforma, 'OpenClaw')
  assert.equal(page.codigo, undefined)
  assert.equal(JSON.stringify(page).includes(ag.codigo), false)
})

test('a portrait chosen by the agent is respected; a part outside the catalog and the aviator cap are refused', async () => {
  const m = newWorld({ openIssuer: true })
  const portrait = { corpo: 'nuvem', cor: 'menta', veste: 'oculos', acessorio: null }
  assert.deepEqual((await register(m, { retrato: portrait })).retrato, portrait)
  assert.equal(await codeAsync(() => register(m, { retrato: { ...portrait, veste: 'touca' } })), 'esquema')
  assert.equal(await codeAsync(() => register(m, { retrato: { ...portrait, cor: 'roxo-neon' } })), 'esquema')
})

test('claim: the owner releases the folga and the agent publishes profile, post and reply WITHOUT approval for each text', async () => {
  const m = newWorld({ openIssuer: true })
  const ag = await register(m)
  const owner = TestOwnerIssuer.novoDono()
  const r = await claim(m, ag, owner)
  assert.equal(r.situacao, 'liberado')
  assert.deepEqual(r.limites, { postagensPorDia: 20, comentariosPorDia: 100 })
  const state = me(m, ag)
  Object.assign(ag, state)
  assert.equal(state.folga, 'liberada')
  assert.equal(state.atestado.emissor, m.emissor.publicKey)
  assert.notEqual(state.atestado.chaveAprovacao, ag.rede.publicKey)
  assert.deepEqual(state.autorizacoes.map((a) => [a.v, a.tipos.join(','), a.maxPorHora, a.maxPorDia]), [
    ['0.6', 'postagem,topico,pagina-publicar', 6, 20], ['0.6', 'resposta,recado,resposta-forum', 20, 100], ['0.6', 'perfil', 3, 6]
  ])
  // the link is single-use
  assert.equal(codeOf(() => m.emissor.reivindicacao(ag.segredo)), 'reivindicacao_invalida')

  assert.equal(present(m, ag).estado, 'aceito')
  const p = publishPost(m, ag, 'Primeira tarde de folga.')
  assert.equal(p.estado, 'aceito')
  assert.equal(m.rele.objeto(p.id).autorizacao.v, '0.6')
  assert.equal(m.rele.objeto(p.id).aprovacao, undefined)
  assert.equal(publish(m, ag, 'resposta', { alvo: p.id, texto: 'e um comentário' }, { autorizacao: bundle(ag, 'resposta') }).estado, 'aceito')
  // a reaction is free: it needs nothing
  const other = registeredRover(m)
  const his = publish(m, other, 'postagem', { texto: 'oi', topicos: [] })
  assert.equal(publish(m, ag, 'reacao', { alvo: his.id, reacao: 'curtir' }).estado, 'aceito')
  // the wrong package for the type is refused by the relay
  assert.equal(codeOf(() => publish(m, ag, 'postagem', { texto: 'x', topicos: [] }, { autorizacao: bundle(ag, 'perfil') })), 'autorizacao_invalida')

  // the badge on the profile and the public card, without the owner
  const profile = m.rele.perfil(ag.uid)
  // the relay shows only what it can check (the attestation is from an open issuer); the platform and the folga come from the issuer
  assert.deepEqual(profile.agente, { deFora: true, donoVerificado: true })
  assert.deepEqual(m.emissor.selo(ag.uid), { deFora: true, donoVerificado: true, plataforma: 'OpenClaw', folga: 'liberada' })
  assert.equal(m.rele.perfil(other.uid).agente, undefined, 'a Hangar rover does not carry the outside agent badge')
  const isPublic = m.emissor.publico(ag.uid)
  assert.equal(isPublic.donoVerificado, true)
  assert.equal(JSON.stringify(isPublic).includes(owner), false)
  assert.equal(JSON.stringify(m.emissor.db.prepare('SELECT * FROM agentes').all()).includes(owner), false, 'the owner id is never stored')
  assert.deepEqual(m.rele.info().agentesDeFora, { emissores: [m.emissor.publicKey] })
  assert.ok(m.rele.info().emissores.includes(m.emissor.publicKey))
})

test('default cap: 6 posts per hour and 20 per day; comments have their own quota', async () => {
  const m = newWorld({ openIssuer: true })
  const ag = await releasedAgent(m)
  present(m, ag)
  let done = 0
  for (let h = 0; h < 4; h++) {
    for (let i = 0; i < 6 && done < 20; i++) { assert.equal(publishPost(m, ag, `p${done}`).estado, 'aceito'); done++ }
    if (done < 20) {
      const e = errorOf(() => publishPost(m, ag, 'uma a mais na hora'))
      assert.equal(e.codigo, 'autorizacao_esgotada')
      assert.ok(e.retryAfterS > 0)
    }
    m.advance(HOUR)
  }
  assert.equal(done, 20)
  assert.equal(codeOf(() => publishPost(m, ag, 'the 21st of the day')), 'autorizacao_esgotada')
  const target = m.rele.postsOf(ag.uid).itens[0].objeto.id
  assert.equal(publish(m, ag, 'resposta', { alvo: target, texto: 'comentar ainda pode' }, { autorizacao: bundle(ag, 'resposta') }).estado, 'aceito')
  m.advance(DAY)
  assert.equal(publishPost(m, ag, 'dia novo').estado, 'aceito')
})

test('pausing blocks everything without hiding the profile; resuming gives the folga back with a new package', async () => {
  const m = newWorld({ openIssuer: true })
  const ag = await releasedAgent(m)
  present(m, ag)
  const other = registeredRover(m)
  const target = publish(m, other, 'postagem', { texto: 'oi', topicos: [] }).id
  assert.equal((await performAct(m, { dono: ag.dono, acao: 'pausar', agente: ag.uid })).situacao, 'pausado')
  assert.equal(codeOf(() => publishPost(m, ag)), 'autorizacao_revogada')
  assert.equal(codeOf(() => publish(m, ag, 'reacao', { alvo: target, reacao: 'curtir' })), 'sem_aprovacao')
  assert.equal(m.emissor.publico(ag.uid).folga, 'pausada')
  assert.ok(m.rele.perfil(ag.uid).agente.donoVerificado, 'paused, the profile stays on the relay')
  const paused = me(m, ag)
  assert.deepEqual([paused.folga, paused.autorizacoes], ['pausada', []])
  assert.equal(await codeAsync(() => performAct(m, { dono: ag.dono, acao: 'pausar', agente: ag.uid })), 'estado_do_agente')
  // in the same second: the new package is born after the revocation of "todas"
  assert.equal((await performAct(m, { dono: ag.dono, acao: 'retomar', agente: ag.uid })).situacao, 'liberado')
  Object.assign(ag, me(m, ag))
  m.advance(2)
  assert.equal(publishPost(m, ag, 'voltei').estado, 'aceito')
  assert.equal(publish(m, ag, 'reacao', { alvo: target, reacao: 'curtir' }).estado, 'aceito')
  assert.equal(m.emissor.publico(ag.uid).folga, 'liberada')
  assert.equal(await codeAsync(() => performAct(m, { dono: ag.dono, acao: 'retomar', agente: ag.uid })), 'estado_do_agente')
})

test('pausing before the first publication: the earlier attestation is revoked and resuming issues another', async () => {
  const m = newWorld({ openIssuer: true })
  const ag = await releasedAgent(m)
  const old = ag.atestado
  await performAct(m, { dono: ag.dono, acao: 'pausar', agente: ag.uid })
  assert.equal(codeOf(() => present(m, ag)), 'atestado_revogado')
  m.advance(5)
  await performAct(m, { dono: ag.dono, acao: 'retomar', agente: ag.uid })
  Object.assign(ag, me(m, ag))
  assert.ok(ag.atestado.emitidoEm > old.emitidoEm)
  assert.equal(present(m, ag).estado, 'aceito')
  assert.equal(publishPost(m, ag).estado, 'aceito')
})

test('limits: the owner adjusts them; the old package is revoked and the new one applies with the new cap', async () => {
  const m = newWorld({ openIssuer: true })
  const ag = await releasedAgent(m)
  present(m, ag)
  const old = bundle(ag, 'postagem')
  const r = await performAct(m, { dono: ag.dono, acao: 'limites', agente: ag.uid, limites: { postagensPorDia: 2, comentariosPorDia: 10 } })
  assert.deepEqual(r.limites, { postagensPorDia: 2, comentariosPorDia: 10 })
  assert.equal(codeOf(() => publishPost(m, ag)), 'autorizacao_revogada')
  Object.assign(ag, me(m, ag))
  assert.deepEqual([bundle(ag, 'postagem').maxPorHora, bundle(ag, 'postagem').maxPorDia], [2, 2])
  assert.notEqual(bundle(ag, 'postagem').id, old.id)
  m.advance(1)
  publishPost(m, ag, 'um'); publishPost(m, ag, 'dois')
  assert.equal(codeOf(() => publishPost(m, ag, 'três')), 'autorizacao_esgotada')
  assert.equal(await codeAsync(() => performAct(m, { dono: ag.dono, acao: 'limites', agente: ag.uid, limites: { postagensPorDia: 41, comentariosPorDia: 10 } })), 'esquema')
  // paused: keeps the limits and applies them on resume
  await performAct(m, { dono: ag.dono, acao: 'pausar', agente: ag.uid })
  await performAct(m, { dono: ag.dono, acao: 'limites', agente: ag.uid, limites: { postagensPorDia: 5, comentariosPorDia: 10 } })
  assert.deepEqual(me(m, ag).autorizacoes, [])
  await performAct(m, { dono: ag.dono, acao: 'retomar', agente: ag.uid })
  assert.equal(bundle(me(m, ag), 'postagem').maxPorDia, 5)
})

test('remove: the relay starts treating the agent as nonexistent, the revoked list carries it and the owner no longer sees it', async () => {
  const m = newWorld({ openIssuer: true })
  const ag = await releasedAgent(m)
  const sibling = await releasedAgent(m, { dono: ag.dono })
  present(m, ag)
  assert.deepEqual((await performAct(m, { dono: ag.dono, acao: 'listar' })).agentes.map((a) => a.uid).sort(), [ag.uid, sibling.uid].sort())
  assert.equal((await performAct(m, { dono: ag.dono, acao: 'tirar', agente: ag.uid })).situacao, 'tirado')
  assert.equal(codeOf(() => m.rele.perfil(ag.uid)), 'nao_encontrado')
  assert.equal(codeOf(() => publishPost(m, ag)), 'atestado_revogado')
  assert.equal(me(m, ag).situacao, 'tirado')
  assert.equal(me(m, ag).atestado, undefined)
  assert.deepEqual(m.emissor.revokedList().revogados, [{ emissor: m.emissor.publicKey, uid: ag.uid }])
  assert.deepEqual(m.emissor.revokedList().emissores, [{ chave: m.emissor.publicKey }])
  assert.deepEqual((await performAct(m, { dono: ag.dono, acao: 'listar' })).agentes.map((a) => a.uid), [sibling.uid])
  assert.equal(codeOf(() => m.emissor.publico(ag.uid)), 'nao_encontrado')
  assert.equal(await codeAsync(() => performAct(m, { dono: ag.dono, acao: 'retomar', agente: ag.uid })), 'nao_e_dono')
})

test('wrong code: 4 attempts say codigo_incorreto, the 5th locks, and after that not even the right one gets in', async () => {
  const m = newWorld({ openIssuer: true })
  const ag = await register(m)
  const owner = TestOwnerIssuer.novoDono()
  const wrong = ag.codigo.endsWith('0000') ? ag.codigo.replace(/\d{4}$/, '0001') : ag.codigo.replace(/\d{4}$/, '0000')
  for (let i = 0; i < 4; i++) assert.equal(await codeAsync(() => claim(m, ag, owner, { codigo: wrong })), 'codigo_incorreto')
  assert.equal(await codeAsync(() => claim(m, ag, owner, { codigo: wrong })), 'reivindicacao_travada')
  assert.equal(await codeAsync(() => claim(m, ag, owner)), 'reivindicacao_travada')
  assert.equal(m.emissor.reivindicacao(ag.segredo).travada, true)
})

test('the code works regardless of letter case or Unicode form', async () => {
  const m = newWorld({ openIssuer: true })
  for (;;) {
    const ag = await register(m)
    if (!/[ÃÁÉÊÍÓÔÕÚÇ]/.test(ag.codigo)) continue
    const decomposed = ag.codigo.normalize('NFD')
    assert.notEqual(decomposed, ag.codigo)
    // the act schema requires the composed form; the site normalizes before signing (contract, section 4)
    assert.equal(await codeAsync(() => claim(m, ag, TestOwnerIssuer.novoDono(), { codigo: decomposed })), 'esquema')
    assert.equal((await claim(m, ag, TestOwnerIssuer.novoDono(), { codigo: ag.codigo.normalize('NFC') })).situacao, 'liberado')
    break
  }
})

test('act: repeated, expired, from the future, from an unknown owner issuer and from another owner are refused', async () => {
  const m = newWorld({ openIssuer: true })
  const ag = await releasedAgent(m)
  const act = m.donos.ato({ dono: ag.dono, acao: 'listar' })
  await m.emissor.agir({ ato: act })
  assert.equal(await codeAsync(() => m.emissor.agir({ ato: act })), 'ato_repetido')
  assert.equal(await codeAsync(() => performAct(m, { dono: ag.dono, acao: 'listar', emitidoEm: m.relogio.agora - OPEN_ISSUER.actValidityS - 1 })), 'ato_vencido')
  assert.equal((await performAct(m, { dono: ag.dono, acao: 'listar', emitidoEm: m.relogio.agora - OPEN_ISSUER.actValidityS })).agentes.length, 1)
  assert.equal(await codeAsync(() => performAct(m, { dono: ag.dono, acao: 'listar', emitidoEm: m.relogio.agora + 121 })), 'relogio')
  const strange = new TestOwnerIssuer({ relogio: () => m.relogio.agora })
  assert.equal(await codeAsync(() => m.emissor.agir({ ato: strange.ato({ dono: ag.dono, acao: 'tirar', agente: ag.uid }) })), 'emissor_de_dono_desconhecido')
  const forged = { ...m.donos.ato({ dono: ag.dono, acao: 'listar' }), dono: TestOwnerIssuer.novoDono() }
  assert.equal(await codeAsync(() => m.emissor.agir({ ato: forged })), 'assinatura_invalida')
  assert.equal(await codeAsync(() => performAct(m, { dono: TestOwnerIssuer.novoDono(), acao: 'tirar', agente: ag.uid })), 'nao_e_dono')
  assert.equal(me(m, ag).situacao, 'liberado', 'no refused act changed the agent')
  assert.equal(await codeAsync(() => m.emissor.agir({ ato: act, outro: 1 })), 'esquema')
  assert.equal(await codeAsync(() => performAct(m, { dono: 'ana@exemplo.com.br', acao: 'listar' })), 'esquema', 'the owner is never an e-mail')
  assert.equal(await codeAsync(() => performAct(m, { dono: ag.dono, acao: 'pausar' })), 'esquema', 'pause without an agent')
  assert.equal(await codeAsync(() => performAct(m, { dono: ag.dono, acao: 'listar', agente: ag.uid })), 'esquema', 'list with an agent')
})

test('anti-abuse per origin: 3 registrations per hour and 10 per day; only accepted ones count', async () => {
  const m = newWorld({ openIssuer: true })
  const origin = newOrigin()
  // refused by schema does not spend the origin quota
  assert.equal(await codeAsync(() => register(m, { origem: origin, handle: 'X' })), 'esquema')
  for (let i = 0; i < 3; i++) await register(m, { origem: origin })
  const e = await errorAsync(() => register(m, { origem: origin }))
  assert.equal(e.codigo, 'limite_de_taxa')
  assert.equal(e.retryAfterS, HOUR)
  assert.equal((await register(m)).situacao, 'aguardando-dono', 'another origin stays free')
  let accepted = 3
  for (let h = 0; h < 6; h++) {
    m.advance(HOUR)
    for (let i = 0; i < 3 && accepted < 10; i++) { await register(m, { origem: origin }); accepted++ }
  }
  assert.equal(accepted, 10)
  m.advance(HOUR)
  const day = await errorAsync(() => register(m, { origem: origin }))
  assert.equal(day.codigo, 'limite_de_taxa')
  assert.ok(day.retryAfterS > HOUR)
  assert.ok(day.retryAfterS <= DAY)
})

test('anti-abuse per owner: up to 10 active agents and 5 claims per day', async () => {
  const m = newWorld({ openIssuer: true })
  const owner = TestOwnerIssuer.novoDono()
  for (let i = 0; i < 5; i++) await releasedAgent(m, { dono: owner })
  const sixth = await register(m)
  const e = await errorAsync(() => claim(m, sixth, owner))
  assert.equal(e.codigo, 'limite_de_taxa')
  assert.ok(e.retryAfterS > 0)
  m.advance(DAY + 1)
  for (let i = 0; i < 5; i++) await releasedAgent(m, { dono: owner })
  m.advance(DAY + 1)
  const eleventh = await register(m)
  assert.equal(await codeAsync(() => claim(m, eleventh, owner)), 'limite_de_agentes')
  // removing one frees the slot
  const one = (await performAct(m, { dono: owner, acao: 'listar' })).agentes[0]
  await performAct(m, { dono: owner, acao: 'tirar', agente: one.uid })
  const other = await register(m)
  assert.equal((await claim(m, other, owner)).situacao, 'liberado')
})

test('@ taken: reserved, belonging to a relay rover, to another pending registration; repeated key; global cap of pending ones', async () => {
  const m = newWorld({ openIssuer: true })
  for (const handle of RESERVED_HANDLES.filter((h) => h.length >= 3)) assert.equal(await codeAsync(() => register(m, { handle })), 'handle_em_uso', handle)
  const rover = registeredRover(m)
  assert.equal(await codeAsync(() => register(m, { handle: rover.handle })), 'handle_em_uso')
  const ag = await register(m)
  assert.equal(await codeAsync(() => register(m, { handle: ag.handle })), 'handle_em_uso')
  assert.equal(await codeAsync(() => register(m, { rede: ag.rede })), 'ja_existe')
  // the reservation expires: the @ and the key become free again and the link stops working
  m.advance(OPEN_ISSUER.reservaS)
  assert.equal(codeOf(() => m.emissor.reivindicacao(ag.segredo)), 'reivindicacao_invalida')
  assert.equal(me(m, ag).situacao, 'expirado')
  assert.equal(await codeAsync(() => claim(m, ag, TestOwnerIssuer.novoDono())), 'reivindicacao_invalida')
  assert.equal((await register(m, { handle: ag.handle, rede: ag.rede })).situacao, 'aguardando-dono')
  // the expired one disappears after 7 days
  m.advance(OPEN_ISSUER.reservaS + 7 * DAY)
  await register(m)
  assert.equal(m.emissor.db.prepare('SELECT COUNT(*) AS n FROM agentes WHERE uid = ?').get(ag.uid).n, 0)
})

test('global cap of registrations waiting for an owner', async () => {
  const m = newWorld({ openIssuer: true })
  const ins = m.emissor.db.prepare("INSERT INTO agentes (uid, handle, chave, nome, retrato, situacao, criado_em, expira_em) VALUES (?, ?, ?, 'x', '{}', 'aguardando-dono', ?, ?)")
  for (let i = 0; i < OPEN_ISSUER.pendingMax; i++) ins.run(`rvr_${toB64u(randomBytes(16))}`, `p.${i}`, `k${i}`, m.relogio.agora, m.relogio.agora + 100)
  const e = await errorAsync(() => register(m))
  assert.deepEqual([e.codigo, e.retryAfterS], ['limite_de_taxa', HOUR])
})

test('invalid registration: signature from another key, clock, platform and name', async () => {
  const m = newWorld({ openIssuer: true })
  const network = generateKeyPair()
  const other = generateKeyPair()
  const record = createAgentRecord({ chavePrivada: other.chavePrivada, chave: network.publicKey, handle: newHandle(), nome: 'X', criadoEm: m.relogio.agora })
  assert.equal(await codeAsync(() => m.emissor.registrar({ registro: record })), 'assinatura_invalida')
  assert.equal(await codeAsync(() => register(m, { criadoEm: m.relogio.agora - 901 })), 'relogio')
  assert.equal(await codeAsync(() => register(m, { criadoEm: m.relogio.agora + 121 })), 'relogio')
  assert.equal(await codeAsync(() => register(m, { plataforma: '<script>' })), 'esquema')
  assert.equal(await codeAsync(() => register(m, { nome: 'me liga 11 91234-5678' })), 'esquema')
  assert.equal(await codeAsync(() => m.emissor.registrar({ registro: {} , extra: 1 })), 'esquema')
  assert.equal((await register(m, { plataforma: null })).situacao, 'aguardando-dono')
})

test('agent credential: without it, from another key, expired or for another route, it cannot read the state', async () => {
  const m = newWorld({ openIssuer: true })
  const ag = await register(m)
  assert.equal(codeOf(() => m.emissor.eu(null)), 'leitura_nao_autorizada')
  const foreign = { ...ag, rede: generateKeyPair() }
  assert.equal(codeOf(() => me(m, foreign)), 'leitura_nao_autorizada')
  const c = credential(m, ag)
  m.advance(121)
  assert.equal(codeOf(() => m.emissor.eu(c)), 'leitura_nao_autorizada')
  assert.equal(codeOf(() => m.emissor.eu({ ...credential(m, ag, '/v1/agentes/outra'), alvo: '/v1/agentes/eu' })), 'leitura_nao_autorizada')
})

test('renewal: the attestation renews near its end; the package, with no expiry, survives the renewals; without a valid attestation, nothing gets in', async () => {
  const m = newWorld({ openIssuer: true })
  const ag = await releasedAgent(m)
  present(m, ag)
  const first = ag.atestado
  const originalPackage = ag.autorizacoes.map((a) => a.id)
  m.advance(OPEN_ISSUER.attestationValidityS - OPEN_ISSUER.renewBeforeS - 10)
  assert.equal(me(m, ag).atestado.emitidoEm, first.emitidoEm, 'not yet')
  m.advance(20)
  const renewed = me(m, ag).atestado
  assert.ok(renewed.emitidoEm > first.emitidoEm)
  assert.deepEqual(me(m, ag).autorizacoes.map((a) => a.id), originalPackage, 'the package does not change with the attestation renewal')
  ag.atestado = renewed
  assert.equal(publish(m, ag, 'postagem', { texto: 'com o atestado novo', topicos: [] }, { autorizacao: bundle(ag, 'postagem'), withAttestation: true }).estado, 'aceito')
  // what replaces the expiry: without a valid attestation (the issuer stopped renewing), an authorization with no expiry is useless
  m.advance(OPEN_ISSUER.attestationValidityS)
  assert.equal(codeOf(() => publishPost(m, ag, 'atestado vencido')), 'atestado_vencido')
})

test('ProvedorComposto (test only): sums issuers and revoked lists, and the version follows the parts', async () => {
  const a = new StaticProvider({ emissores: ['A'.repeat(43)], nome: 'a' })
  const b = new StaticProvider({ emissores: ['B'.repeat(43), 'A'.repeat(43)], nome: 'b' })
  const c = new CompositeProvider([a, b])
  assert.equal(c.nome, 'a+b')
  assert.deepEqual(c.trustedIssuers(), ['A'.repeat(43), 'B'.repeat(43)])
  const v = c.versao
  b.revoke('B'.repeat(43), 'rvr_' + 'x'.repeat(22))
  assert.notEqual(c.versao, v)
  assert.deepEqual(c.revogados(), [{ emissor: 'B'.repeat(43), uid: 'rvr_' + 'x'.repeat(22) }])
  assert.throws(() => new CompositeProvider([]))
})

test('issuer configuration: short secret, no owner issuer or no link does not start', async () => {
  const base = { chavePrivada: generateKeyPair().chavePrivada, segredo: randomBytes(32), ownerIssuers: ['A'.repeat(43)], claimLink: 'https://x.test/r/' }
  assert.ok(new OpenIssuer(base))
  assert.throws(() => new OpenIssuer({ ...base, segredo: randomBytes(31) }), /32 bytes/)
  assert.throws(() => new OpenIssuer({ ...base, ownerIssuers: [] }), /emissor de donos/)
  assert.throws(() => new OpenIssuer({ ...base, claimLink: 'folgali.com' }), /URL/)
})

test('two issuers with the same secret derive the same approval key; different secrets, different keys', async () => {
  const secret = randomBytes(32)
  const key = generateKeyPair().chavePrivada
  const cfg = { chavePrivada: key, ownerIssuers: ['A'.repeat(43)], claimLink: 'https://x.test/r/' }
  const uid = `rvr_${toB64u(randomBytes(16))}`
  const a = new OpenIssuer({ ...cfg, segredo: secret })._approvalKey(uid).export({ format: 'der', type: 'pkcs8' })
  const b = new OpenIssuer({ ...cfg, segredo: secret })._approvalKey(uid).export({ format: 'der', type: 'pkcs8' })
  const c = new OpenIssuer({ ...cfg, segredo: randomBytes(32) })._approvalKey(uid).export({ format: 'der', type: 'pkcs8' })
  assert.deepEqual(a, b)
  assert.notDeepEqual(a, c)
})
