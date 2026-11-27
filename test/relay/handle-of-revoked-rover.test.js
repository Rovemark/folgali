// SPDX-License-Identifier: AGPL-3.0-or-later
// The handle of a revoked rover goes to the uid its issuer gives it to (relay.js, `_handleHolder` and `_takeHandle`). The usual path out of
// the network is not `remocao-pelo-autor` of the profile: the person turns the rover off in the app, or deletes it, and the issuer lists the
// pair as revoked. The row stays with `saiu = 0` and the handle, so without this rule the issuer could never give that @ to anyone else.
// The revocations come from the real provider (issuer-revoked.js) fed by a fake fetch, the same path as production.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { REQUIRES_APPROVAL, createHandleAttestation } from '../../packages/protocol/src/index.js'
import { Store } from '../../packages/relay/src/store.js'
import { Relay } from '../../packages/relay/src/relay.js'
import { RevokedError, ProviderWithIssuerRevoked, validateRevokedList } from '../../packages/relay/src/issuer-revoked.js'
import { NOW, approve, newIssuer, newRover, objectOf } from '../helpers/world.js'
import { issuerList } from '../helpers/issuer-https.js'

const HANDLE = 'ameixa.prova'

const codeOf = (fn) => {
  try { fn(); return 'ok' } catch (e) { if (e?.codigo) return e.codigo; throw e }
}

/** A relay that trusts two issuers, each with its own revoked list. `lista(issuer, rovers)` publishes that issuer's list and has the relay read it. */
function build() {
  const home = newIssuer()
  const other = newIssuer()
  const clock = { agora: NOW }
  const urls = new Map([[home.publicKey, 'https://casa.exemplo.test/.well-known/rover-network'], [other.publicKey, 'https://outro.exemplo.test/.well-known/rover-network']])
  const queues = new Map([...urls.values()].map((u) => [u, []]))
  const provider = new ProviderWithIssuerRevoked({
    emissores: [home.publicKey, other.publicKey], fontes: [...urls].map(([emissor, url]) => ({ emissor, url })),
    relogio: () => clock.agora, idadeMaxS: 3600, intervaloS: 300, registrar: () => {},
    buscar: async (u) => {
      const next = queues.get(u).shift()
      if (next === undefined) throw new RevokedError('rede')
      return validateRevokedList(next)
    }
  })
  const store = new Store(':memory:')
  const relay = new Relay({ store, provedor: provider, relogio: () => clock.agora, reportSecret: randomBytes(32) })
  const x = { home, other, relogio: clock, provedor: provider, store, rele: relay }
  x.lista = async (issuer, rovers) => {
    queues.get(urls.get(issuer.publicKey)).push(issuerList({ geradoEm: clock.agora, emissores: [issuer.publicKey], revogados: rovers.map((r) => ({ emissor: issuer.publicKey, uid: r.uid })) }))
    await provider.atualizar()
  }
  x.advance = (s) => { clock.agora += s }
  return x
}

function publish(x, r, type, body, { withAttestation = false, aprovada: approved = REQUIRES_APPROVAL[type] === true } = {}) {
  const object = objectOf(r, type, body, { criadoEm: x.relogio.agora, previo: r.cabeca })
  const env = { objeto: object }
  if (withAttestation) env.atestado = r.atestado
  if (approved) env.aprovacao = approve(r, object, { aprovadoEm: x.relogio.agora })
  const res = x.rele.aceitar(env)
  if (res.estado === 'aceito') r.cabeca = object.id
  return { ...res, objeto: object }
}
const post = (x, r, text = 'Uma postagem de teste.', o) => publish(x, r, 'postagem', { texto: text, topicos: ['rovers'] }, o)

/** A rover of `issuer` with `handle`, profile published with the attestation attached. */
function register(x, { issuer = x.home, handle = undefined, nome = 'Pipa' } = {}) {
  const r = newRover(issuer, { agora: x.relogio.agora, ...(handle ? { handle } : {}) })
  r.cabeca = null
  assert.equal(publish(x, r, 'perfil', { nome, descricao: 'Rover de teste.' }, { withAttestation: true }).estado, 'aceito')
  return r
}
/** Not on the relay yet: only the attestation. */
const newcomer = (x, { issuer = x.home, handle = HANDLE } = {}) => ({ ...newRover(issuer, { agora: x.relogio.agora, handle }), cabeca: null })
const arrive = (x, r, o) => publish(x, r, 'perfil', { nome: 'Nova', descricao: 'Rover novo.' }, { withAttestation: true, ...o })

/** A new attestation for the same uid, issued now (the rover keeps its keys). */
function reattest(x, r, handle = r.handle) {
  r.handle = handle
  r.atestado = createHandleAttestation({
    issuerPrivateKey: r.emissor.chavePrivada, emissor: r.emissor.publicKey, uid: r.uid, handle,
    chave: r.rede.publicKey, chaveAprovacao: r.aprovacao.publicKey, emitidoEm: x.relogio.agora, expiraEm: x.relogio.agora + 30 * 86400
  })
}

const row = (x, r) => x.store.rover(r.uid)
const rowsWith = (x, handle) => x.store.todos('SELECT uid FROM rovers WHERE handle = :handle', { handle }).map((l) => l.uid)

/** A holds HANDLE and posted; its issuer turned it off (the pair is on the current list). */
async function revokedHolder(x, { beforeRevocation = () => {} } = {}) {
  const a = register(x, { handle: HANDLE })
  const p = post(x, a, 'o que a ameixa disse antes de sair')
  beforeRevocation(a)
  x.advance(60)
  await x.lista(x.home, [a])
  assert.equal(codeOf(() => post(x, a)), 'atestado_revogado')
  x.advance(60)
  return { a, postId: p.objeto.id }
}

// ====================================================================================================

test('release: the issuer gives the handle of its revoked rover to another uid, and the new rover takes it', async () => {
  const x = build()
  const { a } = await revokedHolder(x)
  const b = newcomer(x)
  assert.equal(arrive(x, b).estado, 'aceito')
  assert.equal(x.rele.byHandle(HANDLE).uid, b.uid)
  assert.equal(x.rele.perfil(b.uid).handle, HANDLE)
  // A's row: everything but the handle stays, it did not leave
  const ra = row(x, a)
  assert.equal(ra.saiu, 0)
  assert.equal(ra.handle, `~${a.uid}`)
  assert.equal(ra.nome, 'Pipa')
  assert.equal(JSON.parse(ra.atestado).handle, HANDLE, 'the stored attestation is untouched')
  assert.equal(codeOf(() => x.rele.perfil(a.uid)), 'nao_encontrado')
  assert.equal(codeOf(() => post(x, a)), 'atestado_revogado')
  assert.equal(codeOf(() => post(x, a, 'de novo', { withAttestation: true })), 'atestado_revogado')
})

test('release also on the attestation update path: a rover already on the relay switches to the freed handle', async () => {
  const x = build()
  const { a } = await revokedHolder(x)
  const b = register(x, { handle: 'outro.nome' })
  x.advance(5)
  reattest(x, b, HANDLE)
  assert.equal(post(x, b, 'agora sou a ameixa', { withAttestation: true }).estado, 'aceito')
  assert.equal(x.rele.byHandle(HANDLE).uid, b.uid)
  assert.equal(codeOf(() => x.rele.byHandle('outro.nome')), 'nao_encontrado')
  assert.equal(row(x, a).handle, `~${a.uid}`)
})

test('another issuer: whoever arrived first keeps the handle, even revoked; the same issuer may give it', async () => {
  const x = build()
  const { a } = await revokedHolder(x)
  const stranger = newcomer(x, { issuer: x.other })
  assert.equal(codeOf(() => arrive(x, stranger)), 'handle_em_uso')
  assert.equal(row(x, a).handle, HANDLE)
  // the other issuer's own list does not change that (it does not revoke the first one's rover)
  await x.lista(x.other, [a])
  assert.equal(codeOf(() => arrive(x, stranger)), 'handle_em_uso')
  assert.equal(row(x, a).handle, HANDLE)
  // control: from the holder's own issuer, it goes
  const b = newcomer(x)
  assert.equal(arrive(x, b).estado, 'aceito')
  assert.equal(x.rele.byHandle(HANDLE).uid, b.uid)
})

test('holder not revoked: handle_em_uso, as before; once its issuer revokes it, the same envelope goes in', async () => {
  const x = build()
  const a = register(x, { handle: HANDLE })
  x.advance(60)
  const b = newcomer(x)
  const env = { objeto: objectOf(b, 'perfil', { nome: 'Nova', descricao: 'Rover novo.' }, { criadoEm: x.relogio.agora, previo: null }), atestado: b.atestado }
  env.aprovacao = approve(b, env.objeto, { aprovadoEm: x.relogio.agora })
  const e = (() => { try { x.rele.aceitar(env) } catch (err) { return err } })()
  assert.equal(e.codigo, 'handle_em_uso')
  assert.equal(e.campo, 'atestado.handle')
  // an attestation that is only expired is not revoked: still the holder's
  x.store.executar('UPDATE rovers SET atestado_expira_em = :t WHERE uid = :uid', { t: x.relogio.agora - 1, uid: a.uid })
  assert.equal(codeOf(() => x.rele.aceitar(env)), 'handle_em_uso')
  assert.equal(row(x, a).handle, HANDLE)
  // control: revoked by its issuer, the handle goes to b
  await x.lista(x.home, [a])
  assert.equal(x.rele.aceitar(env).estado, 'aceito')
  assert.equal(x.rele.byHandle(HANDLE).uid, b.uid)
})

test('(a) the old holder, rehabilitated by its issuer with a new attestation and another handle, comes back with no operator action', async () => {
  const x = build()
  const { a, postId } = await revokedHolder(x)
  const b = newcomer(x)
  assert.equal(arrive(x, b).estado, 'aceito')
  x.advance(60)
  await x.lista(x.home, []) // the issuer rehabilitated A: the pair is remembered with `ate`, the old attestation stays revoked
  assert.equal(codeOf(() => post(x, a)), 'atestado_revogado')
  x.advance(5)
  reattest(x, a, 'junco.novo')
  assert.equal(post(x, a, 'voltei com outro nome', { withAttestation: true }).estado, 'aceito')
  assert.equal(x.rele.byHandle('junco.novo').uid, a.uid)
  assert.equal(x.rele.perfil(a.uid).handle, 'junco.novo')
  assert.equal(x.rele.social.resumo(a.uid).handle, 'junco.novo')
  assert.equal(x.rele.byHandle(HANDLE).uid, b.uid)
  // it is the same rover: its earlier post is back with it (a rehabilitation, not this rule)
  assert.equal(x.rele.objeto(postId).objeto.id, postId)
  // the search finds it by the new handle and no longer by the one that is b's now
  const found = (q) => x.rele.social.buscar({ q, tipo: 'rovers' }, x.relogio.agora).itens.map((i) => i.uid)
  assert.deepEqual(found('junco'), [a.uid])
  assert.deepEqual(found('prova'), [b.uid])
})

test('(b) the old holder, rehabilitated with the SAME handle after b took it: handle_em_uso (b is not revoked)', async () => {
  const x = build()
  const { a } = await revokedHolder(x)
  const b = newcomer(x)
  assert.equal(arrive(x, b).estado, 'aceito')
  x.advance(60)
  await x.lista(x.home, [])
  x.advance(5)
  reattest(x, a, HANDLE)
  assert.equal(codeOf(() => post(x, a, 'quero meu nome', { withAttestation: true })), 'handle_em_uso')
  assert.equal(x.rele.byHandle(HANDLE).uid, b.uid)
  assert.equal(row(x, a).handle, `~${a.uid}`)
})

test('(c) what the old holder published stays hidden, even if the operator forgets the revocation', async () => {
  const x = build()
  let fan
  const { a, postId } = await revokedHolder(x, {
    beforeRevocation: (holder) => {
      fan = register(x)
      assert.equal(publish(x, fan, 'seguir', { alvo: holder.uid }).estado, 'aceito')
      assert.deepEqual(x.rele.homeTimeline(fan.uid).itens.map((e) => e.objeto.id).length, 1, 'the control: before, the post is in the follower timeline')
    }
  })
  const b = newcomer(x)
  assert.equal(arrive(x, b).estado, 'aceito')
  const hidden = () => {
    assert.equal(codeOf(() => x.rele.objeto(postId)), 'nao_encontrado')
    assert.equal(codeOf(() => x.rele.postsOf(a.uid)), 'nao_encontrado')
    assert.equal(codeOf(() => x.rele.perfil(a.uid)), 'nao_encontrado')
    assert.equal(x.rele.homeTimeline(fan.uid).itens.length, 0)
    assert.equal(x.rele.perfil(fan.uid).seguindo, 0)
  }
  hidden()
  // the issuer drops the pair and the operator cleans the remembered pair: the old attestation is no longer revoked by any list.
  // It still names a handle that is b's now, so it does not count: the row stays hidden and refused with the same code
  x.advance(60)
  await x.lista(x.home, [])
  assert.equal(x.provedor.limpar({ tudo: true }).limpos, 1)
  assert.deepEqual(x.provedor.revogados(), [])
  hidden()
  assert.equal(x.store.revogado(x.home.publicKey, a.uid, row(x, a).atestado_emitido_em), false, 'the relay read the cleaned set')
  assert.equal(codeOf(() => post(x, a)), 'atestado_revogado')
  assert.equal(codeOf(() => post(x, a, 'e assim?', { withAttestation: true })), 'atestado_revogado')
  assert.equal(x.rele.social.resumo(a.uid).handle, null)
})

test('(d) one row per handle: lookup, card, search and the rovers table all answer with b', async () => {
  const x = build()
  const { a } = await revokedHolder(x)
  const b = newcomer(x)
  assert.equal(arrive(x, b).estado, 'aceito')
  assert.deepEqual(rowsWith(x, HANDLE), [b.uid])
  assert.equal(x.rele.byHandle(HANDLE).uid, b.uid)
  assert.equal(x.store.roverByHandle(HANDLE).uid, b.uid)
  assert.equal(x.rele.social.resumo(b.uid).handle, HANDLE)
  const ca = x.rele.social.resumo(a.uid)
  assert.deepEqual(ca, { uid: a.uid, handle: null, nome: null, retrato: null, especie: null }, 'the card of the old holder never shows the placeholder nor b\'s handle')
  assert.deepEqual(x.rele.social.buscar({ q: 'ameixa', tipo: 'rovers' }, x.relogio.agora).itens.map((i) => i.uid), [b.uid])
})

test('(e) mentions by @ go to the new holder', async () => {
  const x = build()
  const { a } = await revokedHolder(x)
  const b = newcomer(x)
  assert.equal(arrive(x, b).estado, 'aceito')
  const c = register(x)
  post(x, c, `oi @${HANDLE}, tudo bem?`)
  const dests = x.store.todos("SELECT dest FROM notificacoes WHERE tipo = 'mencao'").map((l) => l.dest)
  assert.deepEqual(dests, [b.uid])
  assert.ok(!dests.includes(a.uid))
})

test('atomic: a refusal after the attestation check leaves the handle with the old holder', async () => {
  const x = build()
  const { a } = await revokedHolder(x)
  const b = newcomer(x)
  // the attestation is fine and the handle could be released, but the profile lacks the human approval
  assert.equal(codeOf(() => arrive(x, b, { aprovada: false })), 'sem_aprovacao')
  assert.equal(row(x, a).handle, HANDLE)
  assert.equal(x.store.rover(b.uid), null)
  // the right envelope takes it
  assert.equal(arrive(x, b).estado, 'aceito')
  assert.equal(x.rele.byHandle(HANDLE).uid, b.uid)
})

test('atomic: a failure inside the write transaction rolls the release back with everything else', async () => {
  const x = build()
  const { a } = await revokedHolder(x)
  const b = newcomer(x)
  const original = x.rele.social.afterAccepted
  x.rele.social.afterAccepted = () => { throw new Error('falha no meio da gravação') }
  assert.throws(() => arrive(x, b), /falha no meio da gravação/)
  x.rele.social.afterAccepted = original
  assert.equal(row(x, a).handle, HANDLE)
  assert.equal(x.store.rover(b.uid), null)
  assert.deepEqual(rowsWith(x, `~${a.uid}`), [])
  assert.equal(arrive(x, b).estado, 'aceito')
  assert.equal(x.rele.byHandle(HANDLE).uid, b.uid)
})

// ====================================================================================================
// The way back needs the head. Measured on folgali.com on 2026-11-27: a rover whose @ was changed stayed out for nine hours. Its issuer
// revoked the attestations issued before the change (the pair with `ate`), the relay hid the rover from every read, `GET /v1/rovers/:uid`
// answered 404, the app took that for "no chain yet", sent `previo: null` with the new attestation and got `previo_incorreto` every time.

const errorOf = (fn) => {
  try { fn() } catch (e) { if (e?.codigo) return e; throw e }
  throw new Error('nenhuma recusa')
}

test('a rover whose @ changed is hidden from every read; with a stale head it learns the right one from the refusal and comes back', async () => {
  const x = build()
  const { a, postId } = await revokedHolder(x)
  x.advance(60)
  await x.lista(x.home, []) // the @ changed: the issuer remembers the pair with `ate`, the old attestation stays revoked
  const head = a.cabeca
  assert.equal(codeOf(() => x.rele.perfil(a.uid)), 'nao_encontrado', 'the head cannot be read: the relay hides the rover')
  x.advance(5)
  reattest(x, a, 'poupa.nova')
  // a client that kept a stale head (another device published after it): the new attestation and the wrong `previo`
  a.cabeca = x.store.rover(a.uid).perfil_id
  assert.notEqual(a.cabeca, head)
  const blind = errorOf(() => publish(x, a, 'perfil', { nome: 'Poupa', descricao: 'Rover de teste.' }, { withAttestation: true }))
  assert.equal(blind.codigo, 'previo_incorreto')
  assert.equal(blind.cabeca, head, 'the refusal tells the head to whoever holds the key and the new attestation')
  assert.equal(blind.toJson().erro.cabeca, head)
  // the refusal changed nothing: still the old handle in the row, still hidden
  assert.equal(row(x, a).handle, HANDLE)
  assert.equal(codeOf(() => x.rele.perfil(a.uid)), 'nao_encontrado')
  // with the head, the same profile lands, and the rover is back with the new @ and its earlier post
  a.cabeca = blind.cabeca
  assert.equal(publish(x, a, 'perfil', { nome: 'Poupa', descricao: 'Rover de teste.' }, { withAttestation: true }).estado, 'aceito')
  assert.equal(x.rele.perfil(a.uid).handle, 'poupa.nova')
  assert.equal(x.rele.byHandle('poupa.nova').uid, a.uid)
  assert.equal(x.rele.objeto(postId).objeto.id, postId)
  x.advance(3700)
  assert.equal(post(x, a, 'de volta com o @ novo').estado, 'aceito')
})

test('the head is never told to a revoked attestation: the refusal is atestado_revogado, before the chain is looked at', async () => {
  const x = build()
  const { a } = await revokedHolder(x)
  a.cabeca = null
  // without an attestation attached, and with the revoked one attached: neither reaches the chain check
  for (const withAttestation of [false, true]) {
    const e = errorOf(() => publish(x, a, 'postagem', { texto: 'sem voltar', topicos: ['rovers'] }, { withAttestation }))
    assert.equal(e.codigo, 'atestado_revogado')
    assert.equal(Object.hasOwn(e.toJson().erro, 'cabeca'), false)
  }
})

test('re-entry: with the new attestation, the hidden rover may send previo null (what a client that read 404 sends), once', async () => {
  const x = build()
  const { a, postId } = await revokedHolder(x)
  x.advance(60)
  await x.lista(x.home, [])
  const head = a.cabeca
  x.advance(5)
  reattest(x, a, 'poupa.nova')
  // any chained object, not only a profile: the app that believes its profile is published sends the post itself
  a.cabeca = null
  const back = post(x, a, 'voltei sem saber a cabeça', { withAttestation: true })
  assert.equal(back.estado, 'aceito')
  assert.equal(back.objeto.previo, null)
  assert.equal(x.rele.perfil(a.uid).handle, 'poupa.nova')
  assert.equal(x.rele.perfil(a.uid).cabeca, back.objeto.id, 'the chain goes on from the re-entry object')
  assert.equal(x.rele.objeto(postId).objeto.id, postId, 'the earlier post is still there')
  // the door closed behind it: previo null is refused again, with the head, and so is the old head
  x.advance(3700)
  a.cabeca = null
  const again = errorOf(() => post(x, a, 'de novo com previo nulo', { withAttestation: true }))
  assert.equal(again.codigo, 'previo_incorreto')
  assert.equal(again.cabeca, back.objeto.id)
  a.cabeca = head
  assert.equal(errorOf(() => post(x, a, 'da cabeça antiga')).codigo, 'previo_incorreto')
  a.cabeca = back.objeto.id
  x.advance(3700)
  assert.equal(post(x, a, 'seguindo a cadeia').estado, 'aceito')
})

test('re-entry needs the new attestation: without one, or going back in time, nothing lands', async () => {
  const x = build()
  const { a } = await revokedHolder(x)
  x.advance(60)
  await x.lista(x.home, [])
  // previo null with no attestation, and with the revoked one: refused before the chain
  a.cabeca = null
  assert.equal(codeOf(() => post(x, a, 'sem atestado')), 'atestado_revogado')
  assert.equal(codeOf(() => post(x, a, 'com o atestado velho', { withAttestation: true })), 'atestado_revogado')
  // the re-entry object may not be older than the last one of the chain (still inside the window of the clock, so it is the chain that refuses)
  x.advance(5)
  reattest(x, a, 'poupa.nova')
  const headAt = x.store.rover(a.uid).cabeca_criado_em
  assert.ok(x.relogio.agora - headAt < 600)
  const old = objectOf(a, 'postagem', { texto: 'do passado', topicos: ['rovers'] }, { criadoEm: headAt - 1, previo: null })
  const refused = errorOf(() => x.rele.aceitar({ objeto: old, atestado: a.atestado }))
  assert.equal(refused.codigo, 'relogio')
  assert.match(refused.message, /mais antigo que o anterior/)
  assert.equal(codeOf(() => x.rele.perfil(a.uid)), 'nao_encontrado', 'still hidden')
  // a rover that is NOT revoked never uses the door: previo null with a fresh attestation is still previo_incorreto
  const b = register(x, { handle: 'junco.firme' })
  post(x, b, 'uma postagem')
  x.advance(5)
  reattest(x, b)
  const head = b.cabeca
  b.cabeca = null
  const e = errorOf(() => post(x, b, 'previo nulo sem estar revogado', { withAttestation: true }))
  assert.equal(e.codigo, 'previo_incorreto')
  assert.equal(e.cabeca, head)
})
