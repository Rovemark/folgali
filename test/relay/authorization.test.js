// SPDX-License-Identifier: AGPL-3.0-or-later
// Standing authorization: the person allows postagem and resposta without approving each one, with validity, cap and revocation.
// The relay only accepts it if configured for it (default: off).
import test from 'node:test'
import assert from 'node:assert/strict'
import { LIMITS } from '../../packages/protocol/src/index.js'
import { approve, authorizationOf, policyOf, revocationOf } from '../helpers/world.js'
import { codeOf, envelopeOf, errorOf, newWorld, newRoverInWorld, publish, registeredRover } from '../helpers/test-relay.js'

const post = (text) => ({ texto: text, topicos: [] })
const accepting = (options = {}) => newWorld({ aceitarAutorizacaoPermanente: true, ...options })
const ofWorld = (m, r, extra = {}) => authorizationOf(r, { emitidaEm: m.relogio.agora, ...extra })
const postWith = (m, r, authorization, text = 'sem aprovar') => publish(m, r, 'postagem', post(text), { autorizacao: authorization })
const revoke = (m, r, target, extra = {}) => m.rele.acceptDeclaration({ declaracao: revocationOf(r, target, { revogadaEm: m.relogio.agora, ...extra }) })

// 0.6.0 (proposal 0008, Rovemark's decision on 2026-11-24): standing authorization is ON by default.
test('default: the relay ACCEPTS standing authorization; with false, it refuses the perfect one and nothing is stored', () => {
  const linked = newWorld()
  assert.equal(linked.rele.info().autorizacaoPermanente, true)
  assert.deepEqual(linked.rele.info().autorizacaoVersoes, ['0.2', '0.3', '0.6'])
  const rl = registeredRover(linked)
  assert.equal(postWith(linked, rl, ofWorld(linked, rl)).estado, 'aceito')

  const m = newWorld({ aceitarAutorizacaoPermanente: false })
  const r = registeredRover(m)
  const a = ofWorld(m, r)
  const e = errorOf(() => postWith(m, r, a))
  assert.equal(e.codigo, 'autorizacao_nao_aceita')
  assert.equal(e.status, 403)
  assert.equal(e.campo, 'envelope.autorizacao')
  assert.equal(m.rele.postsOf(r.uid).itens.length, 0)
  assert.equal(m.rele.info().autorizacaoPermanente, false)
  // per-use human approval keeps working
  assert.equal(publish(m, r, 'postagem', post('aprovada')).estado, 'aceito')
})

test('only a boolean configures it: "true", 1, "nao", null and objects stop the relay from starting', () => {
  for (const value of ['true', 1, 0, 'nao', null, {}, [], 'sim']) {
    assert.throws(() => newWorld({ aceitarAutorizacaoPermanente: value }), /true ou false/, String(value))
  }
  assert.equal(accepting().rele.info().autorizacaoPermanente, true)
})

test('relay configured to accept: the postagem goes in without approval, and the stored envelope carries the authorization', () => {
  const m = accepting()
  const r = registeredRover(m)
  const a = ofWorld(m, r)
  const p = postWith(m, r, a, 'texto sem aprovar uma a uma')
  assert.equal(p.estado, 'aceito')
  const stored = m.rele.objeto(p.id)
  assert.deepEqual(stored.autorizacao, a)
  assert.equal(stored.aprovacao, undefined)
  assert.equal(m.store.objeto(p.id).autorizacao_id, a.id)
  assert.equal(m.rele.postsOf(r.uid).itens[0].autorizacao.id, a.id)
  // a resposta too, and the chain advanced normally
  const resp = publish(m, r, 'resposta', { alvo: p.id, texto: 'resposta' }, { autorizacao: a })
  assert.equal(resp.estado, 'aceito')
  assert.equal(m.rele.perfil(r.uid).cabeca, resp.id)
  // an object approved the old way has no authorization recorded
  const common = publish(m, r, 'postagem', post('aprovada'))
  assert.equal(m.store.objeto(common.id).autorizacao_id, null)
})

test('approval and authorization in the same envelope: refused before anything else, even on a relay that does not accept it', () => {
  for (const m of [newWorld(), accepting()]) {
    const r = registeredRover(m)
    const env = envelopeOf(m, r, 'postagem', post('as duas'), { autorizacao: ofWorld(m, r) })
    env.aprovacao = approve(r, env.objeto, { aprovadoEm: m.relogio.agora })
    const e = errorOf(() => m.rele.aceitar(env))
    assert.equal(e.codigo, 'esquema')
    assert.equal(e.campo, 'envelope.autorizacao')
  }
})

test('authorization missing from the object or of another shape: "sem_aprovacao" still applies', () => {
  const m = accepting()
  const r = registeredRover(m)
  assert.equal(codeOf(() => publish(m, r, 'postagem', post('sem nada'), { aprovada: false })), 'sem_aprovacao')
  assert.equal(codeOf(() => publish(m, r, 'postagem', post('lixo'), { autorizacao: 'x' })), 'autorizacao_invalida')
  const withNull = { ...envelopeOf(m, r, 'postagem', post('lixo'), { aprovacao: false }), autorizacao: null }
  assert.equal(codeOf(() => m.rele.aceitar(withNull)), 'autorizacao_invalida')
  assert.equal(codeOf(() => publish(m, r, 'postagem', post('lixo'), { autorizacao: {} })), 'esquema')
})

test('expired: it ends at the exact time, and the person has to issue another one', () => {
  const m = accepting()
  const r = registeredRover(m)
  const a = ofWorld(m, r, { validadeS: 1000 })
  assert.equal(postWith(m, r, a, 'a').estado, 'aceito')
  m.advance(999)
  assert.equal(postWith(m, r, a, 'b').estado, 'aceito')
  m.advance(1)
  const e = errorOf(() => postWith(m, r, a, 'c'))
  assert.equal(e.codigo, 'autorizacao_vencida')
  assert.equal(e.campo, 'autorizacao.expiraEm')
  m.advance(86400)
  assert.equal(codeOf(() => postWith(m, r, a, 'd')), 'autorizacao_vencida')
  assert.equal(m.rele.postsOf(r.uid).itens.length, 2)
  assert.equal(postWith(m, r, ofWorld(m, r), 'e').estado, 'aceito')
})

test('maximum validity of 7 days: a longer authorization is refused', () => {
  const m = accepting()
  const r = registeredRover(m, { validadeS: 30 * 86400 })
  assert.equal(postWith(m, r, ofWorld(m, r, { validadeS: LIMITS.autorizacaoValidadeMaxS })).estado, 'aceito')
  const e = errorOf(() => postWith(m, r, ofWorld(m, r, { validadeS: LIMITS.autorizacaoValidadeMaxS + 1 }), 'longa'))
  assert.equal(e.codigo, 'autorizacao_invalida')
  assert.equal(e.campo, 'autorizacao.expiraEm')
})

test('revoked by id: the next publication fails right away, and what was already published stays', () => {
  const m = accepting()
  const r = registeredRover(m)
  const a = ofWorld(m, r)
  const before = postWith(m, r, a, 'antes')
  assert.equal(revoke(m, r, a.id).estado, 'aceita')
  const e = errorOf(() => postWith(m, r, a, 'depois'))
  assert.equal(e.codigo, 'autorizacao_revogada')
  assert.equal(e.campo, 'autorizacao.id')
  assert.equal(m.rele.objeto(before.id).objeto.corpo.texto, 'antes')
  assert.equal(m.rele.postsOf(r.uid).itens.length, 1)
  // another authorization of the same rover was not revoked
  assert.equal(postWith(m, r, ofWorld(m, r, { maxPorHora: 6 }), 'outra').estado, 'aceito')
  // per-use human approval is still available
  assert.equal(publish(m, r, 'postagem', post('aprovada')).estado, 'aceito')
})

test('revoking "todas": reaches what was issued up to the revocation date, never what was issued after', () => {
  const m = accepting()
  const r = registeredRover(m)
  const before = ofWorld(m, r, { emitidaEm: m.relogio.agora - 5 })
  const equal = ofWorld(m, r, { emitidaEm: m.relogio.agora })
  const after = ofWorld(m, r, { emitidaEm: m.relogio.agora + 1 })
  assert.equal(revoke(m, r, 'todas').estado, 'aceita')
  assert.equal(codeOf(() => postWith(m, r, before, 'a')), 'autorizacao_revogada')
  assert.equal(codeOf(() => postWith(m, r, equal, 'b')), 'autorizacao_revogada')
  assert.equal(postWith(m, r, after, 'c').estado, 'aceito')
  // revoking again, later, also reaches the one that came after
  m.advance(10)
  revoke(m, r, 'todas')
  assert.equal(codeOf(() => postWith(m, r, after, 'd')), 'autorizacao_revogada')
})

test(`one rover's revocation does not reach another rover's authorization`, () => {
  const m = accepting()
  const r = registeredRover(m)
  const other = registeredRover(m)
  revoke(m, r, 'todas')
  assert.equal(postWith(m, other, ofWorld(m, other), 'do outro').estado, 'aceito')
})

test(`another rover's authorization is not valid, nor a copied one or one signed with the network key`, () => {
  const m = accepting()
  const r = registeredRover(m)
  const other = registeredRover(m)
  const e = errorOf(() => postWith(m, r, ofWorld(m, other), 'roubada'))
  assert.equal(e.codigo, 'autorizacao_invalida')
  assert.equal(e.campo, 'autorizacao.autor')
  // the rover tries to sign its own authorization with its network key
  const own = authorizationOf({ ...r, aprovacao: r.rede }, { emitidaEm: m.relogio.agora })
  const f = errorOf(() => postWith(m, r, own, 'própria'))
  assert.equal(f.codigo, 'autorizacao_invalida')
  assert.equal(f.campo, 'autorizacao.assinatura')
  // or with any approval key
  assert.equal(codeOf(() => postWith(m, r, authorizationOf({ ...r, aprovacao: other.aprovacao }, { emitidaEm: m.relogio.agora }), 'x')), 'autorizacao_invalida')
  assert.equal(m.rele.postsOf(r.uid).itens.length, 0)
})

test('object type outside the list: the authorization only allows what it lists', () => {
  const m = accepting()
  const r = registeredRover(m)
  const replyOnly = ofWorld(m, r, { tipos: ['resposta'] })
  const e = errorOf(() => postWith(m, r, replyOnly, 'postagem'))
  assert.equal(e.codigo, 'autorizacao_invalida')
  assert.equal(e.campo, 'autorizacao.tipos')
  const p = publish(m, r, 'postagem', post('aprovada'))
  assert.equal(publish(m, r, 'resposta', { alvo: p.id, texto: 'ok' }, { autorizacao: replyOnly }).estado, 'aceito')
  const postOnly = ofWorld(m, r, { tipos: ['postagem'] })
  assert.equal(codeOf(() => publish(m, r, 'resposta', { alvo: p.id, texto: 'não' }, { autorizacao: postOnly })), 'autorizacao_invalida')
})

test('profile, follow, react, report, remove: none is allowed by standing authorization', () => {
  const m = accepting()
  const r = registeredRover(m)
  const target = registeredRover(m)
  const p = publish(m, target, 'postagem', post('alvo'))
  const a = ofWorld(m, r)
  const attempts = [
    ['perfil', { nome: 'Novo', descricao: '' }],
    ['seguir', { alvo: target.uid }],
    ['reacao', { alvo: p.id, reacao: 'curtir' }],
    ['denuncia', { alvo: p.id, motivo: 'spam' }],
    ['remocao-pelo-autor', { alvo: m.rele.perfil(r.uid).perfil.id }]
  ]
  for (const [type, body] of attempts) {
    const e = errorOf(() => publish(m, r, type, body, { autorizacao: a }))
    assert.equal(e.codigo, 'autorizacao_invalida', type)
    assert.equal(e.campo, 'autorizacao.tipos', type)
  }
  assert.equal(m.rele.perfil(r.uid).nome, 'Pipa')
  assert.equal(m.rele.perfil(r.uid).seguindo, 0)
})

test('authorization in the future (issuer clock ahead by more than 2 minutes) is refused', () => {
  const m = accepting()
  const r = registeredRover(m)
  assert.equal(codeOf(() => postWith(m, r, ofWorld(m, r, { emitidaEm: m.relogio.agora + 121 }), 'a')), 'autorizacao_invalida')
  assert.equal(postWith(m, r, ofWorld(m, r, { emitidaEm: m.relogio.agora + 120 }), 'b').estado, 'aceito')
})

test('changing the approval key (new attestation) invalidates authorizations issued with the old key', () => {
  const m = accepting()
  const r = registeredRover(m)
  const stale = ofWorld(m, r)
  assert.equal(postWith(m, r, stale, 'antes').estado, 'aceito')
  m.advance(100)
  const fresh = newRoverInWorld(m)
  const attestation = m.provedor.issue({ uid: r.uid, handle: r.handle, chave: r.rede.publicKey, chaveAprovacao: fresh.aprovacao.publicKey, emitidoEm: m.relogio.agora })
  const newR = { ...r, aprovacao: fresh.aprovacao, atestado: attestation }
  const env = envelopeOf(m, newR, 'postagem', post('com a velha'), { autorizacao: stale, atestado: true })
  const e = errorOf(() => m.rele.aceitar(env))
  assert.equal(e.codigo, 'autorizacao_invalida')
  assert.equal(e.campo, 'autorizacao.assinatura')
  // the person issues another one with the new key and everything comes back
  assert.equal(m.rele.aceitar(envelopeOf(m, newR, 'postagem', post('com a nova'), { autorizacao: authorizationOf(newR, { emitidaEm: m.relogio.agora }), atestado: true })).estado, 'aceito')
})

// ---------- tetos ----------

test('hourly cap: the N+1th is "autorizacao_esgotada" with an exact Retry-After, and the sliding window frees it', () => {
  const m = accepting()
  const r = registeredRover(m)
  const a = ofWorld(m, r, { maxPorHora: 2, maxPorDia: 10 })
  postWith(m, r, a, '1')
  m.advance(10)
  postWith(m, r, a, '2')
  const e = errorOf(() => postWith(m, r, a, '3'))
  assert.equal(e.codigo, 'autorizacao_esgotada')
  assert.equal(e.status, 429)
  assert.equal(e.retryAfterS, 3600 - 10)
  // 0.11.0: the refusal names the limit and the window, says the wait in words, and carries both for a machine
  assert.match(e.message, /Limite de publicações desta autorização \(o limite que a pessoa escolheu\): 2 por hora\. Libera em 1 hora\.$/)
  assert.deepEqual(e.limite, { max: 2, janelaS: 3600 })
  m.advance(3600 - 10 - 1)
  assert.equal(codeOf(() => postWith(m, r, a, '3')), 'autorizacao_esgotada')
  m.advance(1)
  assert.equal(postWith(m, r, a, '3').estado, 'aceito')
})

test('daily cap: applies even with the hour free, and the wait lasts until the oldest leaves the one-day window', () => {
  const m = accepting({ rates: { porTipo: { postagem: [[3600, 100], [86400, 100]], resposta: [[3600, 100]], perfil: [[3600, 100]] } } })
  const r = registeredRover(m)
  const a = ofWorld(m, r, { validadeS: 7 * 86400, maxPorHora: 3, maxPorDia: 4 })
  for (let i = 0; i < 3; i++) postWith(m, r, a, `h${i}`)
  m.advance(3601)
  postWith(m, r, a, 'quarta')
  const e = errorOf(() => postWith(m, r, a, 'quinta'))
  assert.equal(e.codigo, 'autorizacao_esgotada')
  assert.match(e.message, /Limite de publicações desta autorização \(o limite que a pessoa escolheu\): 4 por dia\. Libera em 23 horas\.$/)
  assert.deepEqual(e.limite, { max: 4, janelaS: 86400 })
  assert.equal(e.retryAfterS, 86400 - 3601)
  m.advance(86400 - 3601)
  assert.equal(postWith(m, r, a, 'depois').estado, 'aceito')
})

test('the cap counts what the rover published under the authorization, even after removal, and does not count what was approved per use', () => {
  const m = accepting()
  const r = registeredRover(m)
  const a = ofWorld(m, r, { maxPorHora: 2, maxPorDia: 5 })
  const p1 = postWith(m, r, a, '1')
  publish(m, r, 'postagem', post('aprovada a cada uso'))
  publish(m, r, 'remocao-pelo-autor', { alvo: p1.id })
  postWith(m, r, a, '2')
  assert.equal(codeOf(() => postWith(m, r, a, '3')), 'autorizacao_esgotada')
})

test('each authorization has its own count; two from the same rover neither add up nor lend to each other', () => {
  const m = accepting()
  const r = registeredRover(m)
  const a = ofWorld(m, r, { maxPorHora: 1, maxPorDia: 1 })
  const b = ofWorld(m, r, { maxPorHora: 1, maxPorDia: 2 })
  postWith(m, r, a, 'a1')
  assert.equal(codeOf(() => postWith(m, r, a, 'a2')), 'autorizacao_esgotada')
  assert.equal(postWith(m, r, b, 'b1').estado, 'aceito')
  assert.equal(codeOf(() => postWith(m, r, b, 'b2')), 'autorizacao_esgotada')
})

test(`the relay limits still apply: the authorization does not exceed the rover's post cap, and this error comes first`, () => {
  const m = accepting()
  const r = registeredRover(m)
  const a = ofWorld(m, r, { maxPorHora: 60, maxPorDia: 300 })
  for (let i = 0; i < 10; i++) postWith(m, r, a, `p${i}`)
  assert.equal(codeOf(() => postWith(m, r, a, 'onze')), 'limite_de_taxa')
  // both caps exceeded: the relay one shows up
  const m2 = accepting({ rates: { porTipo: { postagem: [[3600, 1]], perfil: [[3600, 5]] } } })
  const r2 = registeredRover(m2)
  const a2 = ofWorld(m2, r2, { maxPorHora: 1, maxPorDia: 1 })
  postWith(m2, r2, a2, 'um')
  assert.equal(codeOf(() => postWith(m2, r2, a2, 'dois')), 'limite_de_taxa')
})

test('a refusal due to a limit does not spend the authorization cap', () => {
  const m = accepting()
  const r = registeredRover(m)
  const a = ofWorld(m, r, { maxPorHora: 2, maxPorDia: 4 })
  assert.equal(codeOf(() => postWith(m, r, a, 'dado pessoal: fulano@example.com')), 'vazamento')
  assert.equal(codeOf(() => postWith(m, r, a, '<b>html</b>')), 'esquema')
  assert.equal(postWith(m, r, a, 'bom 1').estado, 'aceito')
  assert.equal(postWith(m, r, a, 'bom 2').estado, 'aceito')
  assert.equal(m.store.countAuthorization(a.id, 0).n, 2)
})

// ---------- the rest of the relay still rules ----------

test('privacy filter, block, chain and duplicate apply the same under authorization', () => {
  const m = accepting()
  const r = registeredRover(m)
  const a = ofWorld(m, r)
  for (const text of ['escreva para fulano@example.com', 'ligue 11999998888', 'veja /Users/joana/segredo.txt']) {
    assert.equal(codeOf(() => postWith(m, r, a, text)), 'vazamento', text)
  }
  assert.equal(codeOf(() => postWith(m, r, a, '<script>alert(1)</script>')), 'esquema')
  const ok = postWith(m, r, a, 'texto bom')
  // resubmitting the same object: duplicate, without using up the ceiling
  const before = m.store.countAuthorization(a.id, 0).n
  assert.equal(m.rele.aceitar({ objeto: m.rele.objeto(ok.id).objeto, autorizacao: a }).estado, 'duplicado')
  assert.equal(m.store.countAuthorization(a.id, 0).n, before)
  // wrong previo
  const crooked = envelopeOf(m, r, 'postagem', post('torto'), { previo: `ob_${'A'.repeat(43)}`, autorizacao: a })
  assert.equal(codeOf(() => m.rele.aceitar(crooked)), 'previo_incorreto')
  // operator moderation: a blocked rover does not publish even with authorization
  m.rele.bloquear({ tipo: 'rover', alvo: r.uid, motivo: 'teste' })
  assert.equal(codeOf(() => postWith(m, r, a, 'bloqueado')), 'bloqueado')
  m.rele.desbloquear('rover', r.uid)
  // the issuer revoked the attestation: nothing gets through
  m.provedor.revoke(m.provedor.publicKey, r.uid)
  assert.equal(codeOf(() => postWith(m, r, a, 'revogado')), 'atestado_revogado')
})

test('an authorization signed for a rover does not allow an object from a rover that left the network', () => {
  const m = accepting()
  const r = registeredRover(m)
  const a = ofWorld(m, r)
  publish(m, r, 'remocao-pelo-autor', { alvo: m.rele.perfil(r.uid).perfil.id })
  assert.equal(codeOf(() => postWith(m, r, a, 'volta')), 'rover_saiu')
})

test('a policy that requires approval for an action is not bypassed by authorization (it covers no action besides text)', () => {
  const m = accepting()
  const r = registeredRover(m)
  const target = registeredRover(m)
  m.rele.acceptDeclaration({ declaracao: policyOf(r, { emitidaEm: m.relogio.agora, exigirAprovacao: ['seguir'] }) })
  assert.equal(codeOf(() => publish(m, r, 'seguir', { alvo: target.uid }, { autorizacao: ofWorld(m, r) })), 'autorizacao_invalida')
  assert.equal(codeOf(() => publish(m, r, 'seguir', { alvo: target.uid })), 'sem_aprovacao')
})

test('a relay that accepts authorization does not waive the trusted issuer: no attestation, nothing', () => {
  const m = accepting()
  const r = newRoverInWorld(m)
  const e = errorOf(() => m.rele.aceitar(envelopeOf(m, r, 'postagem', post('x'), { autorizacao: authorizationOf(r, { emitidaEm: m.relogio.agora }) })))
  assert.equal(e.codigo, 'sem_atestado')
})

// 0.6.0: the "0.6" authorization has no expiry. What holds it is not the date: it is revocation (never forgotten), the approval key of the
// current attestation and the caps.
test('0.6 authorization with no expiry: valid years later; once revoked, still refused even after cleanup; another approval key does not work', () => {
  const m = newWorld()
  const r = registeredRover(m)
  const a = authorizationOf(r, { emitidaEm: m.relogio.agora, validadeS: null, v: '0.6', tipos: ['postagem', 'perfil'] })
  assert.equal(a.expiraEm, null)
  assert.equal(postWith(m, r, a, 'hoje').estado, 'aceito')
  // the test attestation lasts 30 days: a new attestation, with the SAME approval key, keeps the authorization valid
  m.advance(2 * 365 * 86400)
  const renewed = m.provedor.issue({ uid: r.uid, handle: r.handle, chave: r.rede.publicKey, chaveAprovacao: r.aprovacao.publicKey, emitidoEm: m.relogio.agora })
  r.atestado = renewed
  assert.equal(publish(m, r, 'postagem', post('dois anos depois'), { autorizacao: a, withAttestation: true }).estado, 'aceito')
  assert.equal(publish(m, r, 'perfil', { nome: 'Pipa', descricao: 'perfil sem aprovar', grafo: 'publico', exigirAprovacao: [] }, { autorizacao: a }).estado, 'aceito')
  revoke(m, r, a.id)
  m.advance(5 * 365 * 86400)
  m.rele.limpar()
  r.atestado = m.provedor.issue({ uid: r.uid, handle: r.handle, chave: r.rede.publicKey, chaveAprovacao: r.aprovacao.publicKey, emitidoEm: m.relogio.agora })
  assert.equal(codeOf(() => publish(m, r, 'postagem', post('revogada'), { autorizacao: a, withAttestation: true })), 'autorizacao_revogada')
  // new attestation with ANOTHER approval key: every old authorization stops matching
  const other = newRoverInWorld(m)
  const swapped = m.provedor.issue({ uid: r.uid, handle: r.handle, chave: r.rede.publicKey, chaveAprovacao: other.aprovacao.publicKey, emitidoEm: m.relogio.agora + 1 })
  m.advance(1)
  const b = authorizationOf(r, { emitidaEm: m.relogio.agora, validadeS: null, v: '0.6' })
  r.atestado = swapped
  assert.equal(codeOf(() => publish(m, r, 'postagem', post('chave trocada'), { autorizacao: b, withAttestation: true })), 'autorizacao_invalida')
})
