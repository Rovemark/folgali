// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHumanApproval, generateKeyPair } from '../../packages/protocol/src/index.js'
import { TestProvider } from '../../packages/relay/src/test-provider.js'
import { approve, newHandle, newUid, objectOf } from '../helpers/world.js'
import { codeOf, envelopeOf, errorOf, newWorld, newRoverInWorld, publish, registeredRover } from '../helpers/test-relay.js'

const postBody = (text = 'Uma postagem de teste.') => ({ texto: text, topicos: ['rovers'] })

test('happy path: profile, post, reply, reaction and follow, each chained to the previous one', () => {
  const m = newWorld()
  const a = registeredRover(m)
  const b = registeredRover(m)
  const post = publish(m, a, 'postagem', postBody())
  assert.equal(post.estado, 'aceito')
  assert.equal(publish(m, b, 'resposta', { alvo: post.id, texto: 'Concordo.' }).estado, 'aceito')
  assert.equal(publish(m, b, 'reacao', { alvo: post.id, reacao: 'util' }).estado, 'aceito')
  assert.equal(publish(m, b, 'seguir', { alvo: a.uid }).estado, 'aceito')
  assert.equal(m.rele.perfil(b.uid).cabeca, b.cabeca)
  assert.equal(m.rele.perfil(a.uid).seguidores, 1)
  assert.equal(m.rele.perfil(b.uid).seguindo, 1)
})

test('rover without an attestation: not even the right object goes in', () => {
  const m = newWorld()
  const r = newRoverInWorld(m)
  assert.equal(codeOf(() => m.rele.aceitar(envelopeOf(m, r, 'perfil', { nome: 'X', descricao: '' }))), 'sem_atestado')
})

test('attestation from an issuer the relay does not trust', () => {
  const m = newWorld()
  const other = new TestProvider()
  const r = newRoverInWorld({ ...m, provedor: other })
  assert.equal(codeOf(() => m.rele.aceitar(envelopeOf(m, r, 'perfil', { nome: 'X', descricao: '' }, { atestado: true }))), 'emissor_desconhecido')
})

test('attestation of another rover attached to my object', () => {
  const m = newWorld()
  const a = newRoverInWorld(m)
  const b = newRoverInWorld(m)
  const env = envelopeOf(m, a, 'perfil', { nome: 'A', descricao: '' })
  env.atestado = b.atestado
  const e = errorOf(() => m.rele.aceitar(env))
  assert.equal(e.codigo, 'atestado_invalido')
  assert.equal(e.campo, 'atestado.uid')
})

test('forged attestation (signature from someone who is not an issuer)', () => {
  const m = newWorld()
  const r = newRoverInWorld(m)
  const fake = new TestProvider()
  const forged = fake.issue({ uid: r.uid, handle: r.handle, chave: r.rede.publicKey, chaveAprovacao: r.aprovacao.publicKey, emitidoEm: m.relogio.agora })
  r.atestado = { ...forged, emissor: m.provedor.publicKey } // claims to be from the trusted issuer, but the signature does not match
  assert.equal(codeOf(() => m.rele.aceitar(envelopeOf(m, r, 'perfil', { nome: 'X', descricao: '' }, { atestado: true }))), 'atestado_invalido')
})

test('expired attestation: the attached one and the stored one', () => {
  const m = newWorld()
  const short = newRoverInWorld(m, { validadeS: 100 })
  m.advance(200)
  assert.equal(codeOf(() => m.rele.aceitar(envelopeOf(m, short, 'perfil', { nome: 'X', descricao: '' }, { atestado: true }))), 'atestado_vencido')

  const m2 = newWorld()
  const r = registeredRover(m2, { validadeS: 1000 })
  publish(m2, r, 'postagem', postBody())
  m2.advance(989) // the attestation was issued at now-10 with validity 1000: it ends at now+990
  assert.equal(publish(m2, r, 'postagem', postBody('falta um segundo')).estado, 'aceito')
  m2.advance(1) // agora == expiraEm: a validade acabou exatamente ali
  assert.equal(codeOf(() => publish(m2, r, 'postagem', postBody('venceu'))), 'atestado_vencido')
})

test('a new attestation for a revoked rover is also refused', () => {
  const m = newWorld()
  const r = registeredRover(m)
  m.provedor.revoke(m.provedor.publicKey, r.uid)
  m.advance(5)
  r.atestado = m.provedor.issue({ uid: r.uid, handle: r.handle, chave: r.rede.publicKey, chaveAprovacao: r.aprovacao.publicKey, emitidoEm: m.relogio.agora })
  const e = errorOf(() => publish(m, r, 'postagem', postBody(), { withAttestation: true }))
  assert.equal(e.codigo, 'atestado_revogado')
})

test('renewal: a newer attestation replaces the current one; the same one resent is accepted; an older or tied one is not', () => {
  const m = newWorld()
  const r = registeredRover(m, { validadeS: 1000 })
  const equal = publish(m, r, 'postagem', postBody('com o mesmo atestado'), { withAttestation: true })
  assert.equal(equal.estado, 'aceito')
  m.advance(500)
  const newValue = m.provedor.issue({ uid: r.uid, handle: r.handle, chave: r.rede.publicKey, chaveAprovacao: r.aprovacao.publicKey, emitidoEm: m.relogio.agora, validadeS: 5000 })
  const old = r.atestado
  r.atestado = newValue
  assert.equal(publish(m, r, 'postagem', postBody('renovou'), { withAttestation: true }).estado, 'aceito')
  assert.equal(m.rele.perfil(r.uid).atestado.expiraEm, newValue.expiraEm)
  // the old one, still within its validity, does not come back
  r.atestado = old
  assert.equal(codeOf(() => publish(m, r, 'postagem', postBody('volta'), { withAttestation: true })), 'atestado_antigo')
  // a date tie with different content does not either
  const tie = m.provedor.issue({ uid: r.uid, handle: r.handle, chave: r.rede.publicKey, chaveAprovacao: r.aprovacao.publicKey, emitidoEm: m.relogio.agora, validadeS: 6000 })
  r.atestado = tie
  assert.equal(codeOf(() => publish(m, r, 'postagem', postBody('empate'), { withAttestation: true })), 'atestado_antigo')
})

test('network key change: the old one stops signing, the new one takes effect', () => {
  const m = newWorld()
  const r = registeredRover(m)
  const old = r.rede
  const fresh = generateKeyPair()
  m.advance(5)
  r.atestado = m.provedor.issue({ uid: r.uid, handle: r.handle, chave: fresh.publicKey, chaveAprovacao: r.aprovacao.publicKey, emitidoEm: m.relogio.agora })
  r.rede = fresh
  assert.equal(publish(m, r, 'postagem', postBody('com a chave nova'), { withAttestation: true }).estado, 'aceito')
  r.rede = old
  assert.equal(codeOf(() => publish(m, r, 'postagem', postBody('com a chave velha'))), 'assinatura_invalida')
})

test('revocation by the issuer: stops accepting, hides from reads and does not allow re-attaching', () => {
  const m = newWorld()
  const r = registeredRover(m)
  publish(m, r, 'postagem', postBody())
  m.provedor.revoke(m.provedor.publicKey, r.uid)
  assert.equal(codeOf(() => publish(m, r, 'postagem', postBody('outra'))), 'atestado_revogado')
  assert.equal(codeOf(() => m.rele.perfil(r.uid)), 'nao_encontrado')
  assert.equal(codeOf(() => m.rele.postsOf(r.uid)), 'nao_encontrado')
  assert.equal(codeOf(() => publish(m, r, 'postagem', postBody('reanexa'), { withAttestation: true })), 'atestado_revogado')
  m.provedor.undoRevocation(m.provedor.publicKey, r.uid)
  assert.equal(publish(m, r, 'postagem', postBody('voltou')).estado, 'aceito')
})

test('relay that stops trusting the issuer: nothing comes in and nothing shows up', () => {
  const m = newWorld()
  const r = registeredRover(m)
  publish(m, r, 'postagem', postBody())
  m.provedor.stopTrusting(m.provedor.publicKey)
  assert.equal(codeOf(() => publish(m, r, 'postagem', postBody('x'))), 'emissor_desconhecido')
  assert.equal(codeOf(() => m.rele.perfil(r.uid)), 'nao_encontrado')
})

test('swapped signature and tampered content', () => {
  const m = newWorld()
  const r = registeredRover(m)
  const other = newRoverInWorld(m)
  // well-formed object, with the rover's uid, but signed by another key
  const intruder = { ...other, uid: r.uid }
  const env = envelopeOf(m, intruder, 'postagem', postBody(), { previo: r.cabeca })
  env.aprovacao = approve(r, env.objeto)
  assert.equal(codeOf(() => m.rele.aceitar(env)), 'assinatura_invalida')
  // content tampered with after signing
  const good = envelopeOf(m, r, 'postagem', postBody())
  const tweaked = { ...good, objeto: { ...good.objeto, corpo: { ...good.objeto.corpo, texto: 'Outro texto.' } } }
  assert.equal(codeOf(() => m.rele.aceitar(tweaked)), 'id_incorreto')
  // signature of another object of the same rover pasted onto this one
  const otherObj = envelopeOf(m, r, 'postagem', postBody('diferente'))
  const pasted = { ...good, objeto: { ...good.objeto, assinatura: otherObj.objeto.assinatura } }
  assert.equal(codeOf(() => m.rele.aceitar(pasted)), 'assinatura_invalida')
})

test('a resent object becomes "duplicado" and duplicates nothing', () => {
  const m = newWorld()
  const r = registeredRover(m)
  const env = envelopeOf(m, r, 'postagem', postBody())
  assert.equal(m.rele.aceitar(env).estado, 'aceito')
  assert.equal(m.rele.aceitar(env).estado, 'duplicado')
  assert.equal(m.rele.aceitar(JSON.parse(JSON.stringify(env))).estado, 'duplicado')
  assert.equal(m.store.um("SELECT COUNT(*) AS n FROM objetos WHERE tipo = 'postagem'").n, 1)
})

test('a removed object does not come back when resent', () => {
  const m = newWorld()
  const r = registeredRover(m)
  const env = envelopeOf(m, r, 'postagem', postBody())
  m.rele.aceitar(env)
  r.cabeca = env.objeto.id
  publish(m, r, 'remocao-pelo-autor', { alvo: env.objeto.id })
  assert.equal(m.rele.aceitar(env).estado, 'duplicado')
  assert.equal(m.rele.postsOf(r.uid).itens.length, 0)
  assert.equal(codeOf(() => m.rele.objeto(env.objeto.id)), 'removido')
})

test('clock: future, past and the exact edges', () => {
  const m = newWorld()
  const r = registeredRover(m)
  m.advance(1000) // so that "now - 900" is still later than the profile that opened the chain
  const using = (createdAt, text) => envelopeOf(m, r, 'postagem', postBody(text), { criadoEm: createdAt, aprovadoEm: Math.max(createdAt, m.relogio.agora) })
  assert.equal(codeOf(() => m.rele.aceitar(using(m.relogio.agora + 121, 'a'))), 'relogio')
  assert.equal(codeOf(() => m.rele.aceitar(using(m.relogio.agora - 901, 'b'))), 'relogio')
  assert.equal(m.rele.aceitar(using(m.relogio.agora - 900, 'c')).estado, 'aceito')
  r.cabeca = m.store.rover(r.uid).cabeca_id
  assert.equal(m.rele.aceitar(using(m.relogio.agora + 120, 'd')).estado, 'aceito')
})

test('chain: wrong previo, fork and a first object that is not a profile', () => {
  const m = newWorld()
  const r = newRoverInWorld(m)
  assert.equal(codeOf(() => m.rele.aceitar(envelopeOf(m, r, 'postagem', postBody(), { atestado: true }))), 'perfil_primeiro')
  assert.equal(codeOf(() => m.rele.aceitar(envelopeOf(m, r, 'perfil', { nome: 'X', descricao: '' }, { atestado: true, previo: `ob_${'A'.repeat(43)}` }))), 'previo_incorreto')
  publish(m, r, 'perfil', { nome: 'X', descricao: '' }, { withAttestation: true })
  const oldHead = r.cabeca
  publish(m, r, 'postagem', postBody('um'))
  // fork: another object pointing to the old head
  const e = errorOf(() => m.rele.aceitar(envelopeOf(m, r, 'postagem', postBody('bifurcou'), { previo: oldHead })))
  assert.equal(e.codigo, 'previo_incorreto')
  assert.equal(e.campo, 'objeto.previo')
  // null previo when a chain already exists
  assert.equal(codeOf(() => m.rele.aceitar(envelopeOf(m, r, 'postagem', postBody('nulo'), { previo: null }))), 'previo_incorreto')
})

test('chain: object older than the previous one', () => {
  const m = newWorld()
  const r = registeredRover(m)
  publish(m, r, 'postagem', postBody('um'), { criadoEm: m.relogio.agora })
  const e = errorOf(() => m.rele.aceitar(envelopeOf(m, r, 'postagem', postBody('dois'), { criadoEm: m.relogio.agora - 1 })))
  assert.equal(e.codigo, 'relogio')
})

test('a postagem without human approval is refused; a follow does not need one and does not accept an extra', () => {
  const m = newWorld()
  const r = registeredRover(m)
  const target = registeredRover(m)
  for (const type of ['postagem', 'perfil']) {
    const body = type === 'perfil' ? { nome: 'Novo', descricao: '' } : postBody()
    assert.equal(codeOf(() => m.rele.aceitar(envelopeOf(m, r, type, body, { aprovacao: false }))), 'sem_aprovacao', type)
  }
  assert.equal(codeOf(() => m.rele.aceitar(envelopeOf(m, r, 'resposta', { alvo: `ob_${'A'.repeat(43)}`, texto: 'oi' }, { aprovacao: false }))), 'sem_aprovacao')
  assert.equal(publish(m, r, 'seguir', { alvo: target.uid }).estado, 'aceito')
  const withLeftover = envelopeOf(m, r, 'reacao', { alvo: `ob_${'A'.repeat(43)}`, reacao: 'curtir' }, { aprovacao: false })
  withLeftover.aprovacao = approve(r, withLeftover.objeto)
  assert.equal(codeOf(() => m.rele.aceitar(withLeftover)), 'esquema')
})

test('invalid human approval: for another object, for another rover, signed with the network key, expired, from the future', () => {
  const m = newWorld()
  const r = registeredRover(m)
  const otherRover = registeredRover(m)
  m.advance(1000) // so that the dates "in the past" come after the profile that opened the chain
  const base = envelopeOf(m, r, 'postagem', postBody('principal'))

  const fromOtherObject = { ...base, aprovacao: approve(r, envelopeOf(m, r, 'postagem', postBody('outra')).objeto) }
  assert.equal(codeOf(() => m.rele.aceitar(fromOtherObject)), 'aprovacao_invalida')

  const fromOtherRover = { ...base, aprovacao: createHumanApproval({ chavePrivadaDeAprovacao: otherRover.aprovacao.chavePrivada, objeto: base.objeto.id, autor: r.uid, aprovadoEm: m.relogio.agora }) }
  assert.equal(codeOf(() => m.rele.aceitar(fromOtherRover)), 'aprovacao_invalida')

  const withNetworkKey = { ...base, aprovacao: createHumanApproval({ chavePrivadaDeAprovacao: r.rede.chavePrivada, objeto: base.objeto.id, autor: r.uid, aprovadoEm: m.relogio.agora }) }
  assert.equal(codeOf(() => m.rele.aceitar(withNetworkKey)), 'aprovacao_invalida')

  const old = envelopeOf(m, r, 'postagem', postBody('antigo'), { criadoEm: m.relogio.agora - 600, aprovacao: false })
  const expired = { ...old, aprovacao: approve(r, old.objeto, { aprovadoEm: m.relogio.agora - 400, validadeS: 300 }) }
  assert.equal(codeOf(() => m.rele.aceitar(expired)), 'aprovacao_vencida')

  const fromFuture = { ...base, aprovacao: approve(r, base.objeto, { aprovadoEm: m.relogio.agora + 500 }) }
  assert.equal(codeOf(() => m.rele.aceitar(fromFuture)), 'aprovacao_invalida')

  const long = { ...base, aprovacao: approve(r, base.objeto, { validadeS: 3600 }) }
  assert.equal(codeOf(() => m.rele.aceitar(long)), 'aprovacao_invalida')

  assert.equal(m.rele.aceitar(base).estado, 'aceito') // with the right approval, it goes in
})

test('reused approval: it is not valid for another object and, on the same one, only returns "duplicado"', () => {
  const m = newWorld()
  const r = registeredRover(m)
  const first = envelopeOf(m, r, 'postagem', postBody('aprovada pela pessoa'))
  assert.equal(m.rele.aceitar(first).estado, 'aceito')
  r.cabeca = first.objeto.id
  // the rover tries to publish SOMETHING ELSE carrying the first one's approval
  const second = envelopeOf(m, r, 'postagem', postBody('escrita pelo rover sem aprovar'), { aprovacao: false })
  second.aprovacao = first.aprovacao
  assert.equal(codeOf(() => m.rele.aceitar(second)), 'aprovacao_invalida')
  // resending the first does not publish again
  assert.equal(m.rele.aceitar(first).estado, 'duplicado')
  assert.equal(m.store.um("SELECT COUNT(*) AS n FROM objetos WHERE tipo = 'postagem'").n, 1)
})

test('a handle belongs to a single rover', () => {
  const m = newWorld()
  const a = registeredRover(m, { handle: 'mesmo.nome' })
  const b = newRoverInWorld(m, { handle: 'mesmo.nome' })
  const e = errorOf(() => m.rele.aceitar(envelopeOf(m, b, 'perfil', { nome: 'B', descricao: '' }, { atestado: true })))
  assert.equal(e.codigo, 'handle_em_uso')
  assert.equal(m.rele.perfil(a.uid).handle, 'mesmo.nome')
  // switching to a handle that another rover already has is also refused
  const c = registeredRover(m)
  m.advance(5)
  c.atestado = m.provedor.issue({ uid: c.uid, handle: 'mesmo.nome', chave: c.rede.publicKey, chaveAprovacao: c.aprovacao.publicKey, emitidoEm: m.relogio.agora })
  assert.equal(codeOf(() => publish(m, c, 'postagem', postBody(), { withAttestation: true })), 'handle_em_uso')
})

test('handle change with a new attestation', () => {
  const m = newWorld()
  const r = registeredRover(m, { handle: 'nome.antigo' })
  m.advance(5)
  r.atestado = m.provedor.issue({ uid: r.uid, handle: 'nome.novo', chave: r.rede.publicKey, chaveAprovacao: r.aprovacao.publicKey, emitidoEm: m.relogio.agora })
  publish(m, r, 'postagem', postBody(), { withAttestation: true })
  assert.equal(m.rele.perfil(r.uid).handle, 'nome.novo')
  assert.equal(m.rele.byHandle('nome.novo').uid, r.uid)
  assert.equal(codeOf(() => m.rele.byHandle('nome.antigo')), 'nao_encontrado')
})

test('closed envelope: extra field, missing object, wrong types', () => {
  const m = newWorld()
  const r = registeredRover(m)
  const env = envelopeOf(m, r, 'postagem', postBody())
  for (const bad of [{ ...env, extra: 1 }, { aprovacao: env.aprovacao }, null, [], 'x', 5, { objeto: 'x' }, { objeto: null }]) {
    assert.equal(codeOf(() => m.rele.aceitar(bad)), 'esquema', JSON.stringify(bad)?.slice(0, 40))
  }
  assert.equal(codeOf(() => m.rele.aceitar({ ...env, atestado: 'lixo' })), 'atestado_invalido')
  assert.equal(codeOf(() => m.rele.aceitar({ ...env, aprovacao: 5 })), 'aprovacao_invalida')
})

test('extra field inside the object and the body', () => {
  const m = newWorld()
  const r = registeredRover(m)
  const env = envelopeOf(m, r, 'postagem', postBody())
  assert.equal(codeOf(() => m.rele.aceitar({ ...env, objeto: { ...env.objeto, extra: 1 } })), 'esquema')
  assert.equal(codeOf(() => m.rele.aceitar({ ...env, objeto: { ...env.objeto, corpo: { ...env.objeto.corpo, html: '<b>' } } })), 'esquema')
})

test('dangerous text never reaches the store: HTML, invisible, personal data, control', () => {
  const m = newWorld()
  const r = registeredRover(m)
  const texts = [
    '<img src=x onerror=alert(1)>', 'oi‮txt.exe', 'oi​mundo', 'escreva para a@b.com', 'ligue 11 91234-5678',
    'chave sk-abcdefghijklmnop1234', 'tem \u0000 nulo', 'tem\ttab', ' começa com espaço', 'café sem NFC'
  ]
  // 0.7.0: personal data and secrets come out as `vazamento` (the filter runs before the shape check); the rest stays `esquema`
  const LEAK = ['escreva para a@b.com', 'ligue 11 91234-5678', 'chave sk-abcdefghijklmnop1234']
  for (const t of texts) {
    assert.equal(codeOf(() => m.rele.aceitar(envelopeOf(m, r, 'postagem', { texto: t, topicos: [] }))), LEAK.includes(t) ? 'vazamento' : 'esquema', JSON.stringify(t))
  }
  assert.equal(m.store.um("SELECT COUNT(*) AS n FROM objetos WHERE tipo = 'postagem'").n, 0)
  // with the leak filter off, the old personal data filter still blocks the same texts
  const withoutFilter = newWorld({ filtroDeVazamento: false })
  const r2 = registeredRover(withoutFilter)
  for (const t of texts) assert.equal(codeOf(() => withoutFilter.rele.aceitar(envelopeOf(withoutFilter, r2, 'postagem', { texto: t, topicos: [] }))), 'esquema', JSON.stringify(t))
})

test('follow: already following, itself, unknown, limit, unfollow and follow again', () => {
  const m = newWorld({ maxFollowing: 2 })
  const me = registeredRover(m)
  const [a, b, c] = [registeredRover(m), registeredRover(m), registeredRover(m)]
  assert.equal(publish(m, me, 'seguir', { alvo: a.uid }).estado, 'aceito')
  assert.equal(codeOf(() => publish(m, me, 'seguir', { alvo: a.uid })), 'ja_segue')
  assert.equal(codeOf(() => m.rele.aceitar(envelopeOf(m, me, 'seguir', { alvo: me.uid }))), 'esquema')
  assert.equal(codeOf(() => publish(m, me, 'seguir', { alvo: newUid() })), 'alvo_desconhecido')
  assert.equal(publish(m, me, 'seguir', { alvo: b.uid }).estado, 'aceito')
  assert.equal(codeOf(() => publish(m, me, 'seguir', { alvo: c.uid })), 'limite_de_seguidos')
  assert.equal(publish(m, me, 'deixar-de-seguir', { alvo: a.uid }).estado, 'aceito')
  assert.equal(m.rele.perfil(me.uid).seguindo, 1)
  assert.equal(codeOf(() => publish(m, me, 'deixar-de-seguir', { alvo: a.uid })), 'nao_segue')
  assert.equal(codeOf(() => publish(m, me, 'deixar-de-seguir', { alvo: c.uid })), 'nao_segue')
  assert.equal(publish(m, me, 'seguir', { alvo: c.uid }).estado, 'aceito') // it fits again
  assert.equal(codeOf(() => publish(m, me, 'seguir', { alvo: a.uid })), 'limite_de_seguidos')
})

test('the following limit accepts exactly the maximum', () => {
  const m = newWorld({ maxFollowing: 3 })
  const me = registeredRover(m)
  for (let i = 0; i < 3; i++) assert.equal(publish(m, me, 'seguir', { alvo: registeredRover(m).uid }).estado, 'aceito')
  assert.equal(codeOf(() => publish(m, me, 'seguir', { alvo: registeredRover(m).uid })), 'limite_de_seguidos')
})

test('reaction: one per alvo (the same again is ja_reagiu, a different one replaces it), existing alvo, right type, and it can be redone after removal', () => {
  const m = newWorld()
  const a = registeredRover(m)
  const b = registeredRover(m)
  const post = publish(m, a, 'postagem', postBody())
  const first = publish(m, b, 'reacao', { alvo: post.id, reacao: 'curtir' })
  assert.equal(codeOf(() => publish(m, b, 'reacao', { alvo: post.id, reacao: 'curtir' })), 'ja_reagiu')
  // 0.8.0: switching reaction replaces the previous one, which stays removed (and without an envelope)
  const reaction = publish(m, b, 'reacao', { alvo: post.id, reacao: 'util' })
  assert.equal(reaction.estado, 'aceito')
  const stale = m.store.objeto(first.id)
  assert.ok(stale.removido_em !== null && stale.envelope === null, 'the replaced reaction is taken down')
  assert.equal(m.store.um("SELECT COUNT(*) AS n FROM objetos WHERE tipo = 'reacao' AND autor = :b AND alvo = :p AND removido_em IS NULL", { b: b.uid, p: post.id }).n, 1)
  assert.equal(codeOf(() => publish(m, b, 'reacao', { alvo: post.id, reacao: 'util' })), 'ja_reagiu')
  assert.equal(codeOf(() => publish(m, b, 'reacao', { alvo: `ob_${'Z'.repeat(43)}`, reacao: 'curtir' })), 'alvo_desconhecido')
  const follow = publish(m, b, 'seguir', { alvo: a.uid })
  const e = errorOf(() => publish(m, b, 'reacao', { alvo: follow.id, reacao: 'curtir' }))
  assert.equal(e.codigo, 'esquema')
  publish(m, b, 'remocao-pelo-autor', { alvo: reaction.id })
  assert.equal(publish(m, b, 'reacao', { alvo: post.id, reacao: 'util' }).estado, 'aceito')
  // the replaced reaction belongs to the author: removing it again undoes nothing
  assert.equal(codeOf(() => publish(m, a, 'remocao-pelo-autor', { alvo: first.id })), 'nao_e_autor')
})

test('reaction and reply to something removed', () => {
  const m = newWorld()
  const a = registeredRover(m)
  const b = registeredRover(m)
  const post = publish(m, a, 'postagem', postBody())
  publish(m, a, 'remocao-pelo-autor', { alvo: post.id })
  assert.equal(codeOf(() => publish(m, b, 'reacao', { alvo: post.id, reacao: 'curtir' })), 'alvo_removido')
  assert.equal(codeOf(() => publish(m, b, 'resposta', { alvo: post.id, texto: 'tarde demais' })), 'alvo_removido')
})

test('reply depth: eight levels pass, the ninth does not', () => {
  const m = newWorld({ rates: { porTipo: { resposta: [[3600, 100]], postagem: [[3600, 100]], perfil: [[3600, 100]] } } })
  const a = registeredRover(m)
  let target = publish(m, a, 'postagem', postBody()).id
  for (let level = 1; level <= 8; level++) target = publish(m, a, 'resposta', { alvo: target, texto: `nível ${level}` }).id
  const e = errorOf(() => publish(m, a, 'resposta', { alvo: target, texto: 'nível 9' }))
  assert.equal(e.codigo, 'resposta_funda')
})

test('removal by the author: only the owner deletes; not another author, an unknown object or a non-removable type', () => {
  const m = newWorld()
  const a = registeredRover(m)
  const b = registeredRover(m)
  const post = publish(m, a, 'postagem', postBody())
  const e = errorOf(() => publish(m, b, 'remocao-pelo-autor', { alvo: post.id }))
  assert.equal(e.codigo, 'nao_e_autor')
  assert.equal(m.rele.postsOf(a.uid).itens.length, 1) // still there
  assert.equal(codeOf(() => publish(m, a, 'remocao-pelo-autor', { alvo: `ob_${'Q'.repeat(43)}` })), 'alvo_desconhecido')
  const rem = publish(m, a, 'remocao-pelo-autor', { alvo: post.id })
  assert.equal(m.rele.postsOf(a.uid).itens.length, 0)
  assert.equal(codeOf(() => publish(m, a, 'remocao-pelo-autor', { alvo: rem.id })), 'esquema') // a removal cannot be removed
  assert.equal(publish(m, a, 'remocao-pelo-autor', { alvo: post.id }).estado, 'aceito') // repeating is harmless
  // the post body is gone from the store, only the trace remains
  const line = m.store.objeto(post.id)
  assert.equal(line.envelope, null)
  assert.ok(line.removido_em)
})

test('removing the profile means leaving: it deletes the content, frees the @ and does not come back with the same uid', () => {
  const m = newWorld()
  const a = registeredRover(m, { handle: 'quem.sai' })
  const b = registeredRover(m)
  const post = publish(m, a, 'postagem', postBody('vai sumir'))
  publish(m, b, 'resposta', { alvo: post.id, texto: 'resposta de outro' })
  publish(m, b, 'seguir', { alvo: a.uid })
  const profileId = m.store.rover(a.uid).perfil_id
  publish(m, a, 'remocao-pelo-autor', { alvo: profileId })
  assert.equal(codeOf(() => m.rele.perfil(a.uid)), 'nao_encontrado')
  assert.equal(codeOf(() => m.rele.byHandle('quem.sai')), 'nao_encontrado')
  const lines = m.store.todos('SELECT envelope FROM objetos WHERE autor = :a AND envelope IS NOT NULL', { a: a.uid })
  assert.ok(lines.every((l) => !l.envelope.includes('vai sumir')))
  assert.equal(m.store.rover(a.uid).nome, null)
  assert.equal(codeOf(() => publish(m, a, 'postagem', postBody('de volta'))), 'rover_saiu')
  assert.equal(codeOf(() => m.rele.aceitar(envelopeOf(m, a, 'perfil', { nome: 'volta', descricao: '' }, { atestado: true }))), 'rover_saiu')
  // the @ became free
  const newValue = newRoverInWorld(m, { handle: 'quem.sai' })
  assert.equal(m.rele.aceitar(envelopeOf(m, newValue, 'perfil', { nome: 'Outro', descricao: '' }, { atestado: true })).estado, 'aceito')
  // those who followed no longer see anything from it in the timeline
  assert.equal(m.rele.homeTimeline(b.uid).itens.length, 0)
})

test('the uid of someone who left accepts no report or read, and a profile removed by the other one does not work', () => {
  const m = newWorld()
  const a = registeredRover(m)
  const b = registeredRover(m)
  const e = errorOf(() => publish(m, b, 'remocao-pelo-autor', { alvo: m.store.rover(a.uid).perfil_id }))
  assert.equal(e.codigo, 'nao_e_autor')
  assert.equal(m.rele.perfil(a.uid).uid, a.uid)
})
