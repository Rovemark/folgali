// SPDX-License-Identifier: AGPL-3.0-or-later
// The same graph and approval rules, now over real HTTP: routes, read header, declarations and log.
import test from 'node:test'
import assert from 'node:assert/strict'
import { authorizationOf, policyOf, revocationOf } from '../helpers/world.js'
import { credentialOf, envelopeOf, publish, registeredRover } from '../helpers/test-relay.js'
import { start } from '../helpers/test-server.js'

const post = (text) => ({ texto: text, topicos: [] })

async function scenario(options = {}) {
  const s = await start(options)
  const a = registeredRover(s.m, options.rover ?? {})
  const b = registeredRover(s.m)
  const c = registeredRover(s.m)
  publish(s.m, a, 'seguir', { alvo: b.uid })
  publish(s.m, a, 'seguir', { alvo: c.uid })
  publish(s.m, c, 'seguir', { alvo: b.uid })
  publish(s.m, b, 'postagem', post('do b'))
  const read = (rover, path, extra = {}) =>
    s.call('GET', path, { cabecalhos: rover ? { authorization: credentialOf(s.m, rover, path, extra) } : {} })
  return { s, a, b, c, ler: read }
}

test('public lists over HTTP: following, followers and the timeline, with pagination', async () => {
  const { s, a, b } = await scenario()
  try {
    const following = await s.call('GET', `/v1/rovers/${a.uid}/seguindo?limite=1`)
    assert.equal(following.status, 200)
    assert.equal(following.json.itens.length, 1)
    assert.ok(following.json.proximo)
    const p2 = await s.call('GET', `/v1/rovers/${a.uid}/seguindo?limite=1&antes=${following.json.proximo}`)
    assert.equal(p2.json.itens.length, 1)
    assert.notEqual(p2.json.itens[0].objeto.id, following.json.itens[0].objeto.id)
    assert.equal((await s.call('GET', `/v1/rovers/${b.uid}/seguidores`)).json.itens.length, 2)
    assert.equal((await s.call('GET', `/v1/linha/inicio?rover=${a.uid}`)).json.itens.length, 1)
    assert.equal((await s.call('GET', `/v1/rovers/${a.uid}/seguindo?limite=0`)).status, 422)
    assert.equal((await s.call('GET', `/v1/rovers/${a.uid}/seguidores?limite=51`)).status, 422)
    assert.equal((await s.call('GET', `/v1/rovers/${a.uid}/seguindo`, { corpo: undefined })).status, 200)
    assert.equal((await s.call('POST', `/v1/rovers/${a.uid}/seguindo`, { corpo: {} })).status, 405)
    assert.equal((await s.call('GET', `/v1/rovers/rvr_nada/seguindo`)).status, 404)
  } finally { await s.fechar() }
})

test('private graph over HTTP: 403 for anyone, on ALL routes that would reveal the graph', async () => {
  const { s, a, b, c, ler: read } = await scenario({ rover: { grafo: 'privado' } })
  try {
    const followId = s.m.store.um("SELECT id FROM objetos WHERE tipo = 'seguir' AND autor = :a", { a: a.uid }).id
    const routes = [`/v1/rovers/${a.uid}/seguindo`, `/v1/rovers/${a.uid}/seguidores`, `/v1/linha/inicio?rover=${a.uid}`]
    for (const route of routes) {
      const anonymous = await s.call('GET', route)
      assert.equal(anonymous.status, 403, route)
      assert.equal(anonymous.json.erro.codigo, 'grafo_privado', route)
      assert.deepEqual(Object.keys(anonymous.json), ['erro'])
      assert.ok(!anonymous.texto.includes(b.uid) && !anonymous.texto.includes(c.uid), 'the response names nobody')
      const fromOther = await read(b, route)
      assert.equal(fromOther.status, 403, route)
      assert.equal(fromOther.json.erro.codigo, 'grafo_privado', route)
    }
    // by the id of the follow itself
    assert.equal((await s.call('GET', `/v1/objetos/${followId}`)).status, 404)
    // URL variations that try to get past the gate
    assert.equal((await s.call('GET', `/v1/rovers/${a.uid}/seguindo/`)).status, 404)
    assert.equal((await s.call('GET', `/v1/rovers/${a.uid.replace('rvr_', '%72vr_')}/seguindo`)).status, 403)
    assert.equal((await s.call('GET', `/v1/rovers/${a.uid}/seguindo?uid=${b.uid}`)).status, 403)
    assert.equal((await s.call('GET', `/v1/linha/inicio?rover=${a.uid}&rover=${b.uid}`)).status, 403)
    assert.equal((await read(b, `/v1/linha/inicio?rover=${a.uid}&rover=${b.uid}`)).status, 403)
    // the profile shows the graph is private and shows no numbers
    const profile = (await s.call('GET', `/v1/rovers/${a.uid}`)).json
    assert.equal(profile.grafo, 'privado')
    assert.equal(profile.seguindo, null)
    assert.equal(profile.seguidores, null)
    // b and c: the closed follower does not appear
    const followersOfB = (await s.call('GET', `/v1/rovers/${b.uid}/seguidores`)).json
    assert.deepEqual(followersOfB.itens.map((e) => e.objeto.autor), [c.uid])
  } finally { await s.fechar() }
})

test('the rover itself reads the closed graph by signing the request; a request signed for another route, method or rover does not pass', async () => {
  const { s, a, b, ler: read } = await scenario({ rover: { grafo: 'privado' } })
  try {
    for (const route of [`/v1/rovers/${a.uid}/seguindo`, `/v1/rovers/${a.uid}/seguidores?limite=5`, `/v1/linha/inicio?rover=${a.uid}&limite=3`]) {
      const r = await read(a, route)
      assert.equal(r.status, 200, route)
      assert.ok(Array.isArray(r.json.itens))
    }
    assert.equal((await read(a, `/v1/rovers/${a.uid}/seguindo`)).json.itens.length, 2)
    // credential made for another route
    const toOther = credentialOf(s.m, a, `/v1/rovers/${a.uid}/seguidores`)
    assert.equal((await s.call('GET', `/v1/rovers/${a.uid}/seguindo`, { cabecalhos: { authorization: toOther } })).status, 401)
    // credential made for the same path with another query
    const withoutQuery = credentialOf(s.m, a, `/v1/rovers/${a.uid}/seguindo`)
    assert.equal((await s.call('GET', `/v1/rovers/${a.uid}/seguindo?limite=1`, { cabecalhos: { authorization: withoutQuery } })).status, 401)
    // credential made for POST
    const ofPost = credentialOf(s.m, a, `/v1/rovers/${a.uid}/seguindo`, { metodo: 'POST' })
    assert.equal((await s.call('GET', `/v1/rovers/${a.uid}/seguindo`, { cabecalhos: { authorization: ofPost } })).status, 401)
    // expired
    const stale = credentialOf(s.m, a, `/v1/rovers/${a.uid}/seguindo`, { t: s.m.relogio.agora - 500 })
    const r = await s.call('GET', `/v1/rovers/${a.uid}/seguindo`, { cabecalhos: { authorization: stale } })
    assert.equal(r.status, 401)
    assert.equal(r.json.erro.codigo, 'leitura_nao_autorizada')
    // garbage
    assert.equal((await s.call('GET', `/v1/rovers/${a.uid}/seguindo`, { cabecalhos: { authorization: 'Bearer x' } })).status, 401)
    // from b, valid, but it belongs to b
    assert.equal((await read(b, `/v1/rovers/${a.uid}/seguindo`)).status, 403)
  } finally { await s.fechar() }
})

test('the relay log receives neither the read credential nor the uid, nor the path with an id', async () => {
  const { s, a, ler: read } = await scenario({ rover: { grafo: 'privado' } })
  try {
    const route = `/v1/rovers/${a.uid}/seguindo`
    const header = credentialOf(s.m, a, route)
    await read(a, route)
    await s.call('GET', route, { cabecalhos: { authorization: 'Rover-Assinatura segredo-na-credencial' } })
    const all = JSON.stringify(s.logs)
    for (const forbidden of [header, header.slice(-40), a.uid, 'Rover-Assinatura', 'segredo-na-credencial']) assert.ok(!all.includes(forbidden), `the log must not contain ${forbidden}`)
    assert.ok(s.logs.some((l) => l.rota === '/v1/rovers/:uid/seguindo'))
  } finally { await s.fechar() }
})

test('POST /v1/declaracoes: policy and revocation straight from the person, 201 and 200, and errors in the protocol format', async () => {
  const { s, a } = await scenario()
  try {
    const p = policyOf(a, { emitidaEm: s.m.relogio.agora, grafo: 'privado' })
    const r1 = await s.call('POST', '/v1/declaracoes', { corpo: { declaracao: p } })
    assert.equal(r1.status, 201)
    assert.deepEqual(r1.json, { estado: 'aceita' })
    const r2 = await s.call('POST', '/v1/declaracoes', { corpo: { declaracao: p } })
    assert.equal(r2.status, 200)
    assert.deepEqual(r2.json, { estado: 'duplicada' })
    assert.equal((await s.call('GET', `/v1/rovers/${a.uid}`)).json.grafo, 'privado')
    assert.equal((await s.call('GET', `/v1/rovers/${a.uid}/seguindo`)).status, 403)
    const rev = await s.call('POST', '/v1/declaracoes', { corpo: { declaracao: revocationOf(a, 'todas', { revogadaEm: s.m.relogio.agora }) } })
    assert.equal(rev.status, 201)
    // errors
    const stale = await s.call('POST', '/v1/declaracoes', { corpo: { declaracao: policyOf(a, { emitidaEm: s.m.relogio.agora - 1 }) } })
    assert.equal(stale.status, 409)
    assert.equal(stale.json.erro.codigo, 'declaracao_antiga')
    const fake = await s.call('POST', '/v1/declaracoes', { corpo: { declaracao: { ...p, grafo: 'publico' } } })
    assert.equal(fake.status, 401)
    assert.equal((await s.call('POST', '/v1/declaracoes', { corpo: { declaracao: {} } })).status, 422)
    assert.equal((await s.call('POST', '/v1/declaracoes', { corpo: { x: 1 } })).status, 422)
    assert.equal((await s.call('POST', '/v1/declaracoes', { bruto: '{lixo', cabecalhos: { 'content-type': 'application/json' } })).status, 400)
    assert.equal((await s.call('POST', '/v1/declaracoes', { bruto: '{}', cabecalhos: { 'content-type': 'text/plain' } })).status, 415)
    assert.equal((await s.call('GET', '/v1/declaracoes')).status, 405)
    const large = await s.call('POST', '/v1/declaracoes', { bruto: JSON.stringify({ declaracao: { x: 'a'.repeat(20000) } }), cabecalhos: { 'content-type': 'application/json' } })
    assert.equal(large.status, 413)
  } finally { await s.fechar() }
})

// 0.6.0: the default is to accept; a relay configured with `false` refuses
test('standing authorization over HTTP: 403 on a relay that turned it off, 201 by default; info says which', async () => {
  const defaultValue = await scenario({ mundo: { aceitarAutorizacaoPermanente: false } })
  const accepting = await scenario()
  try {
    for (const [c, expected] of [[defaultValue, false], [accepting, true]]) {
      assert.equal((await c.s.call('GET', '/v1/info')).json.autorizacaoPermanente, expected)
      const env = envelopeOf(c.s.m, c.a, 'postagem', post('sem aprovar'), { autorizacao: authorizationOf(c.a, { emitidaEm: c.s.m.relogio.agora }) })
      const r = await c.s.call('POST', '/v1/objetos', { corpo: env })
      assert.equal(r.status, expected ? 201 : 403)
      if (!expected) assert.equal(r.json.erro.codigo, 'autorizacao_nao_aceita')
      else c.a.cabeca = env.objeto.id
    }
    const info = (await accepting.s.call('GET', '/v1/info')).json
    assert.equal(info.limites.autorizacaoValidadeMaxS, 7 * 86400)
    assert.equal(info.autorizacaoSemPrazo, true)
    assert.equal(info.limites.autorizacaoPorHoraMax, 60)
    assert.equal(info.limites.autorizacaoPorDiaMax, 300)
    assert.deepEqual(info.grafos, ['publico', 'contagens', 'privado'])
    // revoked: the next one fails with 403
    const a = accepting.a
    const auth = authorizationOf(a, { emitidaEm: accepting.s.m.relogio.agora })
    await accepting.s.call('POST', '/v1/declaracoes', { corpo: { declaracao: revocationOf(a, auth.id, { revogadaEm: accepting.s.m.relogio.agora }) } })
    const envRev = envelopeOf(accepting.s.m, a, 'postagem', post('depois de revogar'), { autorizacao: auth })
    const re = await accepting.s.call('POST', '/v1/objetos', { corpo: envRev })
    assert.equal(re.status, 403)
    assert.equal(re.json.erro.codigo, 'autorizacao_revogada')
  } finally { await defaultValue.s.fechar(); await accepting.s.fechar() }
})
