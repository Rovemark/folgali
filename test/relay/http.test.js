// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { newRoverInWorld, publish, registeredRover, envelopeOf } from '../helpers/test-relay.js'
import { TOKEN, start } from '../helpers/test-server.js'

test('info, security headers and standard error', async () => {
  const s = await start()
  try {
    const r = await s.call('GET', '/v1/info')
    assert.equal(r.status, 200)
    assert.deepEqual(r.json.protocolo, ['0.1', '0.2', '0.3'])
    assert.equal(r.cab.get('x-content-type-options'), 'nosniff')
    assert.equal(r.cab.get('content-security-policy'), "default-src 'none'")
    assert.equal(r.cab.get('cache-control'), 'no-store')
    assert.equal(r.cab.get('x-rover-protocolo'), '0.3')
    assert.match(r.cab.get('content-type'), /^application\/json/)
    assert.equal(r.cab.get('access-control-allow-origin'), null)
    const nf = await s.call('GET', '/v1/nada')
    assert.equal(nf.status, 404)
    assert.deepEqual(Object.keys(nf.json), ['erro'])
    assert.equal(nf.json.erro.codigo, 'nao_encontrado')
  } finally { await s.fechar() }
})

test('publish, read, resend and report over HTTP', async () => {
  const s = await start()
  try {
    const a = newRoverInWorld(s.m)
    const profile = envelopeOf(s.m, a, 'perfil', { nome: 'Pipa', descricao: 'oi' }, { atestado: true })
    const r1 = await s.call('POST', '/v1/objetos', { corpo: profile })
    assert.equal(r1.status, 201)
    assert.equal(r1.json.estado, 'aceito')
    a.cabeca = profile.objeto.id
    const r2 = await s.call('POST', '/v1/objetos', { corpo: profile })
    assert.equal(r2.status, 200)
    assert.equal(r2.json.estado, 'duplicado')

    const p = await s.call('GET', `/v1/rovers/${a.uid}`)
    assert.equal(p.status, 200)
    assert.equal(p.json.nome, 'Pipa')
    const byHandle = await s.call('GET', `/v1/handles/${a.handle}`)
    assert.equal(byHandle.status, 200)
    assert.equal(byHandle.json.uid, a.uid)

    const post = envelopeOf(s.m, a, 'postagem', { texto: 'Olá, rede.', topicos: ['rovers'] })
    assert.equal((await s.call('POST', '/v1/objetos', { corpo: post })).status, 201)
    const list = await s.call('GET', `/v1/rovers/${a.uid}/postagens?limite=5`)
    assert.equal(list.json.itens.length, 1)
    assert.equal(list.json.proximo, null)
    const one = await s.call('GET', `/v1/objetos/${post.objeto.id}`)
    assert.equal(one.json.objeto.corpo.texto, 'Olá, rede.')

    const b = registeredRover(s.m)
    const rep = envelopeOf(s.m, b, 'denuncia', { alvo: post.objeto.id, motivo: 'spam' }, { previo: null })
    const rd = await s.call('POST', '/v1/objetos', { corpo: rep })
    assert.equal(rd.status, 202)
    assert.equal(rd.json.estado, 'recebida')

    const line = await s.call('GET', `/v1/linha/inicio?rover=${b.uid}`)
    assert.equal(line.status, 200)
    assert.deepEqual(line.json.itens, [])
  } finally { await s.fechar() }
})

test('body abuse: content type, broken JSON, too large (declared and in chunks)', async () => {
  const s = await start()
  try {
    assert.equal((await s.call('POST', '/v1/objetos', { bruto: '{}', cabecalhos: { 'content-type': 'text/plain' } })).status, 415)
    assert.equal((await s.call('POST', '/v1/objetos', { bruto: '{}' })).status, 415)
    assert.equal((await s.call('POST', '/v1/objetos', { bruto: '{nao e json', cabecalhos: { 'content-type': 'application/json' } })).json.erro.codigo, 'json_invalido')
    assert.equal((await s.call('POST', '/v1/objetos', { bruto: '', cabecalhos: { 'content-type': 'application/json' } })).json.erro.codigo, 'json_invalido')
    const large = await s.call('POST', '/v1/objetos', { bruto: JSON.stringify({ x: 'a'.repeat(17000) }), cabecalhos: { 'content-type': 'application/json' } })
    assert.equal(large.status, 413)
    // in chunks, no content-length: the server cuts it off at the ceiling
    const status = await new Promise((resolve) => {
      const req = http.request({ host: '127.0.0.1', port: s.servidor.address().port, method: 'POST', path: '/v1/objetos', headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' } }, (res) => {
        res.resume()
        resolve(res.statusCode)
      })
      req.on('error', () => resolve('cortado'))
      req.write('{"a":"')
      for (let i = 0; i < 5; i++) req.write('b'.repeat(4000))
      req.end('"}')
    })
    assert.ok([413, 'cortado'].includes(status), String(status))
    // valid JSON that is not an object
    for (const body of ['null', '[]', '"x"', '5', 'true']) {
      const r = await s.call('POST', '/v1/objetos', { bruto: body, cabecalhos: { 'content-type': 'application/json' } })
      assert.equal(r.json.erro.codigo, 'esquema', body)
    }
  } finally { await s.fechar() }
})

test('path abuse: wrong method, giant URL, malformed percent encoding, injection', async () => {
  const s = await start()
  try {
    assert.equal((await s.call('DELETE', '/v1/info')).status, 405)
    assert.equal((await s.call('PUT', '/v1/objetos', { corpo: {} })).status, 405)
    assert.equal((await s.call('GET', `/v1/rovers/${'a'.repeat(3000)}`)).status, 404)
    assert.equal((await s.call('GET', '/v1/rovers/%E0%A4%A')).status, 404)
    assert.equal((await s.call('GET', '/v1/rovers/%00')).status, 404)
    assert.equal((await s.call('GET', "/v1/handles/x'%20OR%201=1--")).status, 404)
    assert.equal((await s.call('GET', '/v1/rovers/..%2f..%2fetc%2fpasswd')).status, 404)
    assert.equal((await s.call('GET', '/v1/rovers/x/y/z')).status, 404)
    const not500 = s.logs.filter((l) => l.status === 500)
    assert.equal(not500.length, 0)
  } finally { await s.fechar() }
})

test('query parameters are validated', async () => {
  const s = await start()
  try {
    const a = registeredRover(s.m)
    for (const q of ['limite=0', 'limite=51', 'limite=abc', 'limite=-1', 'limite=1.5', 'antes=abc', 'antes=0', 'antes=99999999999', 'limite=']) {
      const r = await s.call('GET', `/v1/rovers/${a.uid}/postagens?${q}`)
      assert.equal(r.status, 422, q)
      assert.equal(r.json.erro.codigo, 'esquema', q)
    }
    assert.equal((await s.call('GET', `/v1/rovers/${a.uid}/postagens?limite=50&antes=1`)).status, 200)
    assert.equal((await s.call('GET', '/v1/linha/inicio')).status, 422)
    assert.equal((await s.call('GET', '/v1/linha/inicio?rover=lixo')).status, 422)
    assert.equal((await s.call('GET', `/v1/linha/inicio?rover=${a.uid}&limite=2`)).status, 200)
  } finally { await s.fechar() }
})

test('prototype pollution and stray fields in the body do not pass or dirty the process', async () => {
  const s = await start()
  try {
    const a = registeredRover(s.m)
    const good = envelopeOf(s.m, a, 'postagem', { texto: 'x', topicos: [] })
    const dirty = `{"__proto__":{"polluido":true},"constructor":{"prototype":{"polluido":true}},"objeto":${JSON.stringify(good.objeto)}}`
    const r = await s.call('POST', '/v1/objetos', { bruto: dirty, cabecalhos: { 'content-type': 'application/json' } })
    assert.equal(r.json.erro.codigo, 'esquema')
    assert.equal({}.polluido, undefined)
    const dirty2 = JSON.stringify(good).replace('"texto":"x"', '"texto":"x","__proto__":{"polluido":true}')
    const r2 = await s.call('POST', '/v1/objetos', { bruto: dirty2, cabecalhos: { 'content-type': 'application/json' } })
    assert.equal(r2.json.erro.codigo, 'esquema')
    assert.equal({}.polluido, undefined)
  } finally { await s.fechar() }
})

test('invisible unicode and HTML over HTTP: 422 and nothing stored', async () => {
  const s = await start()
  try {
    const a = registeredRover(s.m)
    for (const text of ['oi​ mundo', '<script>alert(1)</script>', 'abc‮def']) {
      const r = await s.call('POST', '/v1/objetos', { corpo: envelopeOf(s.m, a, 'postagem', { texto: text, topicos: [] }) })
      assert.equal(r.status, 422)
      assert.equal(r.json.erro.codigo, 'esquema')
      assert.ok(!r.texto.includes('script'))
    }
    assert.equal(s.m.store.um("SELECT COUNT(*) AS n FROM objetos WHERE tipo = 'postagem'").n, 0)
  } finally { await s.fechar() }
})

test('burst: once the bucket is empty, 429 comes with Retry-After', async () => {
  const s = await start({ rajada: { capacity: 5, perSecond: 0.001 }, burstClock: () => 0 })
  try {
    const status = []
    for (let i = 0; i < 8; i++) status.push((await s.call('GET', '/v1/info')).status)
    assert.deepEqual(status, [200, 200, 200, 200, 200, 429, 429, 429])
    const r = await s.call('GET', '/v1/info')
    assert.equal(r.json.erro.codigo, 'limite_de_taxa')
    assert.ok(Number(r.cab.get('retry-after')) >= 1)
  } finally { await s.fechar() }
})

test('admin: off without a long credential, 401 with a wrong credential, works with the right one', async () => {
  const without = await start({ tokenAdmin: null })
  const short = await start({ tokenAdmin: 'curta' })
  const s = await start()
  try {
    for (const x of [without, short]) assert.equal((await x.call('GET', '/v1/admin/denuncias', { cabecalhos: { authorization: 'Bearer curta' } })).status, 404)
    assert.equal((await s.call('GET', '/v1/admin/denuncias')).status, 401)
    assert.equal((await s.call('GET', '/v1/admin/denuncias', { cabecalhos: { authorization: 'Bearer errado' } })).status, 401)
    assert.equal((await s.call('GET', '/v1/admin/denuncias', { cabecalhos: { authorization: TOKEN } })).status, 401)
    assert.equal((await s.call('GET', '/v1/admin/denuncias', { cabecalhos: { authorization: `Basic ${TOKEN}` } })).status, 401)
    const ok = { authorization: `Bearer ${TOKEN}` }
    const list = await s.call('GET', '/v1/admin/denuncias', { cabecalhos: ok })
    assert.equal(list.status, 200)
    assert.deepEqual(list.json, { denuncias: [] })
    assert.equal((await s.call('GET', '/v1/admin/denuncias?limite=0', { cabecalhos: ok })).status, 422)

    const a = registeredRover(s.m)
    const blocking = await s.call('POST', '/v1/admin/bloqueios', { corpo: { tipo: 'rover', alvo: a.uid, motivo: 'teste' }, cabecalhos: ok })
    assert.equal(blocking.status, 201)
    assert.deepEqual(blocking.json, { bloqueado: true })
    assert.equal((await s.call('GET', `/v1/rovers/${a.uid}`)).status, 404)
    const blocks = await s.call('GET', '/v1/admin/bloqueios', { cabecalhos: ok })
    assert.equal(blocks.status, 200)
    assert.equal(blocks.json.bloqueios.length, 1)
    assert.equal((await s.call('POST', '/v1/admin/bloqueios', { corpo: { tipo: 'rover', alvo: a.uid, motivo: 'teste' } })).status, 401)
    assert.equal((await s.call('POST', '/v1/admin/bloqueios', { corpo: { tipo: 'nada', alvo: a.uid, motivo: 'x' }, cabecalhos: ok })).status, 422)
    assert.equal((await s.call('POST', '/v1/admin/bloqueios', { bruto: 'null', cabecalhos: { ...ok, 'content-type': 'application/json' } })).status, 422)
    const unblock = await s.call('DELETE', `/v1/admin/bloqueios/rover/${a.uid}`, { cabecalhos: ok })
    assert.equal(unblock.status, 200)
    assert.deepEqual(unblock.json, { desbloqueado: true })
    assert.equal((await s.call('DELETE', `/v1/admin/bloqueios/rover/${a.uid}`, { cabecalhos: ok })).status, 404)
    assert.equal((await s.call('GET', `/v1/rovers/${a.uid}`)).status, 200)
  } finally { await Promise.all([without.fechar(), short.fechar(), s.fechar()]) }
})

test('log without secrets: no credential, text, uid, path with an id or address', async () => {
  const s = await start()
  try {
    const a = registeredRover(s.m)
    const post = envelopeOf(s.m, a, 'postagem', { texto: 'texto secreto da postagem', topicos: [] })
    await s.call('POST', '/v1/objetos', { corpo: post })
    await s.call('GET', `/v1/rovers/${a.uid}?x=1`)
    await s.call('GET', '/v1/admin/denuncias', { cabecalhos: { authorization: `Bearer ${TOKEN}` } })
    await s.call('GET', '/v1/admin/denuncias', { cabecalhos: { authorization: 'Bearer chute-errado-123' } })
    await s.call('POST', '/v1/objetos', { bruto: '{lixo com segredo-no-corpo', cabecalhos: { 'content-type': 'application/json' } })
    const all = JSON.stringify(s.logs)
    assert.ok(s.logs.length >= 5)
    for (const forbidden of [TOKEN, 'chute-errado-123', 'texto secreto', a.uid, post.objeto.id, a.handle, '127.0.0.1', '::1', 'segredo-no-corpo', 'authorization']) {
      assert.ok(!all.includes(forbidden), `the log must not contain ${forbidden}`)
    }
    assert.ok(s.logs.every((l) => ['nivel', 'evento', 'metodo', 'rota', 'status', 'ms'].every((k) => k in l) || l.evento === 'erro_interno'))
    assert.ok(s.logs.some((l) => l.rota === '/v1/rovers/:uid'))
    for (const l of s.logs.filter((x) => x.evento === 'pedido')) assert.ok(Number.isInteger(l.ms) && l.ms >= 0 && l.ms < 5000, `ms ${l.ms}`)
  } finally { await s.fechar() }
})

test('internal error: 500 without leaking the message or the stack, and the log carries only the error type', async () => {
  const s = await start()
  try {
    s.m.rele.info = () => { throw new TypeError('senha-do-banco-123 em /Users/fulano/dados') }
    const r = await s.call('GET', '/v1/info')
    assert.equal(r.status, 500)
    assert.equal(r.json.erro.codigo, 'erro_interno')
    assert.ok(!r.texto.includes('senha-do-banco'))
    assert.ok(!r.texto.includes('/Users/'))
    assert.ok(!r.texto.includes('at '))
    const all = JSON.stringify(s.logs)
    assert.ok(!all.includes('senha-do-banco'))
    assert.ok(s.logs.some((l) => l.evento === 'erro_interno' && l.tipo === 'TypeError'))
  } finally { await s.fechar() }
})

test('blocked, expired or revoked rovers and objects never come out over HTTP', async () => {
  const s = await start()
  try {
    const a = registeredRover(s.m)
    const p = publish(s.m, a, 'postagem', { texto: 'visível', topicos: [] })
    assert.equal((await s.call('GET', `/v1/objetos/${p.id}`)).status, 200)
    s.m.provedor.revoke(s.m.provedor.publicKey, a.uid)
    for (const path of [`/v1/rovers/${a.uid}`, `/v1/rovers/${a.uid}/postagens`, `/v1/objetos/${p.id}`, `/v1/linha/inicio?rover=${a.uid}`, `/v1/handles/${a.handle}`]) {
      assert.equal((await s.call('GET', path)).status, 404, path)
    }
  } finally { await s.fechar() }
})
