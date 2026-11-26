// SPDX-License-Identifier: AGPL-3.0-or-later
// The seeder HTTP client and its guards, against a FAKE relay that answers whatever the test sends: retry with increasing
// wait, pacing between requests, 429 with Retry-After, 5xx, chain read only as far as the relay serves, and what the seeder does with the time
// of the chain head. The behavior against the real relay is in seeder-03.test.js.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { issuerOf } from '../../packages/relay/scripts/demo/demo-keys.mjs'
import { SeedingError, newLedger, seedNetwork } from '../../packages/relay/scripts/demo/seeder.mjs'

const seed = randomBytes(32)
const issuer = issuerOf(seed)
const T = 1_900_000_000
const PEBBLE = { slug: 'seixo', handle: 'seixo', nome: 'Seixo', descricao: 'O primeiro. Rover de demonstração.' }
const CAT = { versao: 2, rovers: [PEBBLE], postagens: [], respostas: [], seguir: [], reacoes: [] }
const resp = (status, body = {}, header = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...header } })
const INFO = { protocolo: ['0.1', '0.2', '0.3'], emissores: [issuer.publicKey] }

/** Script per request: `quem(metodo, caminho, n, corpo)` returns a Response (or throws, like a network failure). */
function fake(who) {
  const requests = []
  const fetchFn = async (url, init = {}) => {
    const u = new URL(url)
    const method = init.method ?? 'GET'
    const body = init.body ? JSON.parse(init.body) : undefined
    const n = requests.filter((p) => p.metodo === method && p.caminho === u.pathname).length + 1
    requests.push({ metodo: method, caminho: u.pathname, corpo: body })
    return who(method, u.pathname, n, body)
  }
  return { fetchFn, pedidos: requests }
}
const base = (extra) => (method, path, n, body) => {
  if (method === 'GET' && path === '/v1/info') return resp(200, INFO)
  if (method === 'GET' && path.startsWith('/v1/rovers/')) return resp(404)
  if (method === 'POST' && path === '/v1/objetos') return resp(201, { estado: 'aceito' })
  return extra?.(method, path, n, body) ?? resp(404)
}
// by default these tests accept an empty ledger: what they measure is the client and the chain reading, not the lost-ledger guard
const run = (f, { wait, intervalMs = 0, ledger = newLedger(), catalogo: catalog = CAT, acceptWithoutLedger = true, ...rest } = {}) =>
  seedNetwork({ url: 'http://relay.exemplo', semente: seed, catalogo: catalog, fetchFn: f.fetchFn, wait, intervalMs, relogio: () => T, ledger, acceptWithoutLedger, ...rest })
const waits = () => { const l = []; return { l, wait: (ms) => { l.push(ms); return Promise.resolve() } } }

test('network failure: retries with increasing wait (500, 1000, 1500) and gives up on the fourth, saying where', async () => {
  const w = waits()
  const f = fake(() => { throw new Error('ECONNRESET') })
  await assert.rejects(() => run(f, w), (e) => e instanceof SeedingError && /sem resposta do relé em GET \/v1\/info/.test(e.message))
  assert.deepEqual(w.l, [500, 1000, 1500])
  assert.equal(f.pedidos.length, 4)
  // if the third attempt answers, seeding goes on
  const w2 = waits()
  let failures = 0
  const g = fake((m, c, n, body) => { if (c === '/v1/info' && failures++ < 2) throw new Error('ECONNRESET'); return base()(m, c, n, body) })
  await run(g, w2)
  assert.deepEqual(w2.l, [500, 1000])
})

test('pacing between requests: the second request waits almost the whole interval, never more than it', async () => {
  const w = waits()
  await run(fake(base()), { ...w, intervalMs: 1000 })
  assert.ok(w.l.length >= 1)
  assert.ok(w.l.every((ms) => ms > 900 && ms <= 1000), JSON.stringify(w.l))
  // without an interval, nobody waits
  const w0 = waits()
  await run(fake(base()), w0)
  assert.deepEqual(w0.l, [])
})

test('5xx: repeats the request up to the fourth attempt (500, 1000, 1500) and then says the status; 499 does not repeat', async () => {
  const w = waits()
  const f = fake(base((m, c) => (m === 'POST' ? resp(503) : undefined)))
  const four = fake((m, c, n, body) => (m === 'POST' ? resp(503) : base()(m, c, n, body)))
  await assert.rejects(() => run(four, w), /o relé recusou perfil do rover seixo: 503/)
  assert.deepEqual(w.l, [500, 1000, 1500])
  assert.equal(four.pedidos.filter((p) => p.metodo === 'POST').length, 4)
  void f
  // exactly 500 also repeats; 499 does not
  const w5 = waits()
  const fiveHundred = fake((m, c, n, body) => (m === 'POST' && n < 3 ? resp(500) : base()(m, c, n, body)))
  await run(fiveHundred, w5)
  assert.deepEqual(w5.l, [500, 1000])
  const w4 = waits()
  const fourHundred = fake((m, c, n, body) => (m === 'POST' ? resp(499) : base()(m, c, n, body)))
  await assert.rejects(() => run(fourHundred, w4), /o relé recusou perfil do rover seixo: 499/)
  assert.deepEqual(w4.l, [])
})

test('429: waits for Retry-After (capped at 30 seconds), 1 second without a header, and above 120 seconds does not wait: defers', async () => {
  const using = async (header) => {
    const w = waits()
    await run(fake((m, c, n, body) => (m === 'POST' && n === 1 ? resp(429, { erro: { codigo: 'limite_de_taxa' } }, header) : base()(m, c, n, body))), w)
    return w.l
  }
  assert.deepEqual(await using({ 'retry-after': '2' }), [2000])
  assert.deepEqual(await using({}), [1000])
  assert.deepEqual(await using({ 'retry-after': '45' }), [30_000])
  assert.deepEqual(await using({ 'retry-after': '120' }), [30_000])
  assert.deepEqual(await using({ 'retry-after': '1' }), [1000])
  // above 120 s: no wait; the profile cannot be deferred, so the round stops saying so
  const w = waits()
  await assert.rejects(
    () => run(fake((m, c, n, body) => (m === 'POST' ? resp(429, { erro: { codigo: 'limite_de_taxa' } }, { 'retry-after': '121' }) : base()(m, c, n, body))), w),
    /o relé adiou o perfil do rover seixo/
  )
  assert.deepEqual(w.l, [])
})

test('endless 429: waits 12 times and on the next one returns the 429 for the phase to decide', async () => {
  const w = waits()
  const f = fake((m, c, n, body) => (m === 'POST' ? resp(429, { erro: { codigo: 'limite_de_taxa' } }, { 'retry-after': '1' }) : base()(m, c, n, body)))
  await assert.rejects(() => run(f, w), /o relé adiou o perfil/)
  assert.equal(w.l.length, 12)
  assert.equal(f.pedidos.filter((p) => p.metodo === 'POST').length, 13)
})

test('entry guards: the address must be a relay that trusts the issuer of this seed', async () => {
  const without = (m, c, n, body) => base()(m, c, n, body)
  await assert.rejects(() => run(fake((m, c) => (c === '/v1/info' ? resp(404) : without(m, c)))), /não respondeu como um relé da Rover Network/)
  await assert.rejects(() => run(fake((m, c) => (c === '/v1/info' ? resp(200, { emissores: [issuer.publicKey] }) : without(m, c)))), /não respondeu como um relé/)
  await assert.rejects(() => run(fake((m, c) => (c === '/v1/info' ? resp(200, { protocolo: ['0.3'], emissores: ['outra'] }) : without(m, c)))), /não confia no emissor de demonstração/)
  await assert.rejects(() => run(fake((m, c) => (c === '/v1/info' ? resp(200, { protocolo: ['0.3'] }) : without(m, c)))), /não confia no emissor de demonstração/)
})

test('the catalog may only cite rovers that exist: author and target', async () => {
  await assert.rejects(() => run(fake(base()), { catalogo: { ...CAT, postagens: [{ ref: 'p1', de: 'fantasma', topicos: ['a'], texto: 'Texto de quem não existe.' }] } }), /cita o rover "fantasma", que não existe em rovers/)
  await assert.rejects(() => run(fake(base()), { catalogo: { ...CAT, seguir: [['seixo', 'fantasma']] } }), /cita o rover "fantasma", que não existe em rovers/)
})

test('reading the rover: only 200 and 404 are answers; anything else stops with the status', async () => {
  await assert.rejects(() => run(fake((m, c, n, body) => (c.startsWith('/v1/rovers/') ? resp(403) : base()(m, c, n, body)))), /não consegui ler o rover seixo \(status 403\)/)
})

const rover = (head, attestationExpires = T + 90 * 86400) => resp(200, { cabeca: head, atestado: { expiraEm: attestationExpires }, perfil: { corpo: { nome: 'Outro', descricao: 'Perfil diferente, para obrigar a publicar de novo.', grafo: 'publico', exigirAprovacao: [] } } })

test('the chain is read up to 2000 objects; at the 2001st the seeder gives up', async () => {
  const chain = (size) => fake((m, c, n, body) => {
    if (c.startsWith('/v1/rovers/')) return rover('ob_0')
    const mo = /^\/v1\/objetos\/ob_(\d+)$/.exec(c)
    if (mo) { const i = Number(mo[1]); return resp(200, { objeto: { id: `ob_${i}`, tipo: 'seguir', criadoEm: T - 100, previo: i + 1 < size ? `ob_${i + 1}` : null, corpo: { alvo: 'rvr_x' } } }) }
    return base()(m, c, n, body)
  })
  await run(chain(2000))
  await assert.rejects(() => run(chain(2001)), /a cadeia do rover seixo é longa demais para ler/)
})

test('chain object: 404 and 410 end the reading without error; any other failure stops it', async () => {
  for (const status of [404, 410]) {
    const f = fake((m, c, n, body) => (c.startsWith('/v1/rovers/') ? rover('ob_0') : c.startsWith('/v1/objetos/') ? resp(status) : base()(m, c, n, body)))
    await run(f)
  }
  await assert.rejects(
    () => run(fake((m, c, n, body) => (c.startsWith('/v1/rovers/') ? rover('ob_0') : c.startsWith('/v1/objetos/') ? resp(403) : base()(m, c, n, body)))),
    /não consegui ler um objeto da cadeia do rover seixo \(status 403\)/
  )
})

test('the time of the next object never goes backwards: it comes from the head read, from the ledger or, with neither, from now', async () => {
  const firstPost = (f) => f.pedidos.find((p) => p.metodo === 'POST').corpo.objeto.criadoEm
  // readable head 10 s ago: the new object takes that time, not the one from 5 minutes ago
  const readable = fake((m, c, n, body) => {
    if (c.startsWith('/v1/rovers/')) return rover('ob_0')
    if (c === '/v1/objetos/ob_0') return resp(200, { objeto: { id: 'ob_0', tipo: 'postagem', criadoEm: T - 10, previo: null, corpo: { texto: 'x' } } })
    return base()(m, c, n, body)
  })
  await run(readable)
  assert.equal(firstPost(readable), T - 10)
  // unreadable head (action), but the ledger knows its time
  const ledger = newLedger()
  ledger.itens.estados = { 'seixo|x': true }
  ledger.rovers.seixo = { ultimoCriado: T - 10 }
  const ofLedger = fake((m, c, n, body) => (c.startsWith('/v1/rovers/') ? rover('ob_0') : c.startsWith('/v1/objetos/') ? resp(404) : base()(m, c, n, body)))
  await run(ofLedger, { ledger })
  assert.equal(firstPost(ofLedger), T - 10)
  // unreadable head and ledger with nothing about it: now
  const none = fake((m, c, n, body) => (c.startsWith('/v1/rovers/') ? rover('ob_0') : c.startsWith('/v1/objetos/') ? resp(404) : base()(m, c, n, body)))
  await run(none, { acceptWithoutLedger: true })
  assert.equal(firstPost(none), T)
  // new rover: the time is that of 5 minutes ago plus the count of objects in this round (0 for the first)
  const newValue = fake(base())
  await run(newValue)
  assert.equal(firstPost(newValue), T - 300)
})

test('a relay that already has rovers from this seeding and an empty ledger is refused, unless the caller explicitly accepts', async () => {
  const existing = () => fake((m, c, n, body) => (c.startsWith('/v1/rovers/') ? rover(null) : base()(m, c, n, body)))
  await assert.rejects(() => run(existing(), { acceptWithoutLedger: false }), /o registro do que foi feito \(o arquivo de estado\) está vazio/)
  await run(existing(), { acceptWithoutLedger: true })
  await run(existing(), { simulate: true, acceptWithoutLedger: false })
  const withRecord = newLedger()
  withRecord.itens.postagens = { 'seixo|x': 'ob_1' }
  await run(existing(), { ledger: withRecord, acceptWithoutLedger: false })
})

// ------------------------------------------------------------------------------------------------------------------------------
// What the seeder sends and what it does with each relay response
// ------------------------------------------------------------------------------------------------------------------------------

const TWO = { ...CAT, rovers: [PEBBLE, { slug: 'pipa', handle: 'pipa', nome: 'Pipa', descricao: 'A segunda. Rover de demonstração.' }] }

test('the time of objects: 5 minutes ago plus one unit per object in the round, and human approval is valid for 300 seconds', async () => {
  const f = fake(base())
  await run(f, { catalogo: TWO })
  const posts = f.pedidos.filter((p) => p.metodo === 'POST')
  assert.equal(posts.length, 2)
  assert.equal(posts[0].corpo.objeto.criadoEm, T - 300)
  assert.equal(posts[1].corpo.objeto.criadoEm, T - 299)
  for (const p of posts) {
    assert.equal(p.corpo.aprovacao.expiraEm - p.corpo.aprovacao.aprovadoEm, 300)
    assert.ok(p.corpo.atestado, 'the first object of the rover carries the attestation')
  }
})

test('the relay answers 200 or 201: both are success and go into the ledger; 202 and 204 are not', async () => {
  for (const ok of [200, 201]) {
    const ledger = newLedger()
    await run(fake((m, c, n, body) => (m === 'POST' ? resp(ok, {}) : base()(m, c, n, body))), { ledger, catalogo: { ...CAT, postagens: [{ ref: 'p1', de: 'seixo', topicos: ['a'], texto: 'Uma postagem para entrar.' }] } })
    assert.match(Object.values(ledger.itens.postagens)[0], /^ob_/, `status ${ok}`)
  }
  for (const bad of [202, 204]) {
    await assert.rejects(() => run(fake((m, c, n, body) => (m === 'POST' ? (bad === 204 ? new Response(null, { status: 204 }) : resp(bad, {})) : base()(m, c, n, body)))), new RegExp(`o relé recusou perfil do rover seixo: ${bad}`))
  }
})

const WITH_POST = { ...CAT, postagens: [{ ref: 'p1', de: 'seixo', topicos: ['a'], texto: 'Uma postagem que o relé pode adiar.' }] }
const refusedPost = (status, body, header) => (m, c, n, b) => (m === 'POST' && b?.objeto?.tipo === 'postagem' ? resp(status, body, header) : base()(m, c, n, b))

test('what the relay refuses because of time becomes a deferral with a return time; what nobody foresaw stops the round', async () => {
  // code the phase marks as "not time yet": the time comes from Retry-After, and without it from retryAfterS in the body
  const withCode = { ...WITH_POST }
  const f = { nome: 'postagens' }
  void f
  const ofBody = await run(fake(refusedPost(403, { erro: { codigo: 'em_carencia', retryAfterS: 77 } })), { catalogo: withCode }).catch((e) => e)
  // `postagens` does not mark em_carencia: it is a real error, and the message says the code
  assert.match(ofBody.message, /o relé recusou postagem do rover seixo: em_carencia/)
  // 429 without body and without a long wait, after the 12 waits: error with the status (not a deferral)
  const w = waits()
  await assert.rejects(() => run(fake(refusedPost(429, {}, { 'retry-after': '120' })), { ...w, catalogo: withCode }), /o relé recusou postagem do rover seixo: 429/)
  // 429 with a wait above 120 s: deferred, even without a body, with the return time
  const long = await run(fake(refusedPost(429, {}, { 'retry-after': '121' })), { ...waits(), catalogo: withCode })
  assert.equal(long.adiados.length, 1)
  assert.deepEqual(long.adiados[0], { phase: 'postagens', item: 'seixo', motivo: 'status 429', retryAt: T + 121 })
  assert.equal(long.proximaRodada, T + 121)
  // 429 with the rate code and a short wait: after waiting, deferred with the time
  const rate = await run(fake(refusedPost(429, { erro: { codigo: 'limite_de_taxa' } }, { 'retry-after': '5' })), { ...waits(), catalogo: withCode })
  assert.deepEqual(rate.adiados.map((a) => [a.motivo, a.retryAt]), [['limite_de_taxa', T + 5]])
})

test('new account and grace period: deferred with the Retry-After time, or the one in the body; the next round is the smallest of the times', async () => {
  const cv = (name, owner) => ({ ref: `c-${name}`, dono: owner, nome: name, descricao: 'x', regras: 'y', tema: 'tema', acesso: 'aberta', categorias: [], moderadores: [], membros: [] })
  const two = { ...TWO, comunidades: [cv('Primeira', 'seixo'), cv('Segunda', 'pipa')] }
  let n = 0
  const f = fake((m, c, k, body) => {
    if (m === 'POST' && body?.objeto?.tipo === 'comunidade-criar') {
      n++
      return n === 1 ? resp(403, { erro: { codigo: 'conta_nova', retryAfterS: 900 } }) : resp(403, { erro: { codigo: 'conta_nova' } }, { 'retry-after': '300' })
    }
    return base()(m, c, k, body)
  })
  const r = await run(f, { catalogo: two })
  const [a, b] = r.adiados.filter((x) => x.phase === 'comunidades')
  assert.deepEqual([a.item, a.motivo, a.retryAt], ['Primeira', 'conta_nova', T + 900], 'without a header, the time comes from the body')
  assert.deepEqual([b.item, b.retryAt], ['Segunda', T + 300], 'the header wins')
  assert.equal(r.proximaRodada, T + 300, 'the next round is the smallest time')
  // with no time at all, the deferral exists and the next round stays open
  const withoutHour = await run(fake((m, c, k, body) => (m === 'POST' && body?.objeto?.tipo === 'comunidade-criar' ? resp(403, { erro: { codigo: 'conta_nova' } }) : base()(m, c, k, body))), { catalogo: { ...CAT, comunidades: [cv('Primeira', 'seixo')] } })
  assert.equal(withoutHour.adiados[0].retryAt, null)
  assert.equal(withoutHour.proximaRodada, null)
})

test('the relay says the community already exists: the seeder recovers the id by name; if it cannot find it, it refuses to go on', async () => {
  const cv = { ref: 'c1', dono: 'seixo', nome: 'Existe', descricao: 'x', regras: 'y', tema: 'tema', acesso: 'aberta', categorias: [], moderadores: [], membros: [] }
  const catalog = { ...CAT, comunidades: [cv] }
  const ID = `ob_${'a'.repeat(43)}`
  const already = (items) => fake((m, c, n, body) => {
    if (m === 'POST' && body?.objeto?.tipo === 'comunidade-criar') return resp(409, { erro: { codigo: 'ja_existe' } })
    if (m === 'GET' && c === '/v1/comunidades') return resp(200, { itens: items })
    return base()(m, c, n, body)
  })
  const ledger = newLedger()
  const r = await run(already([{ id: ID, nome: 'Outra' }, { id: ID, nome: 'Existe' }]), { catalogo: catalog, ledger })
  assert.equal(r.existentes.comunidades, 1)
  assert.equal(ledger.itens.comunidades[`seixo|seixo|Existe`], ID)
  await assert.rejects(() => run(already([{ id: ID, nome: 'Outra' }]), { catalogo: catalog }), /o relé diz que "comunidades" já existe, mas não achei o id para continuar/)
})

test('--simular does not need the ref to exist: it returns a pending id instead of failing', async () => {
  const broken = { ...CAT, respostas: [{ ref: 'rx', de: 'seixo', a: 'p-que-nao-existe', texto: 'Resposta a um post que o catálogo não tem.' }] }
  const r = await run(fake(base()), { catalogo: broken, simulate: true })
  assert.equal(r.simulado, true)
  await assert.rejects(() => run(fake(base()), { catalogo: broken }), /aponta para "p-que-nao-existe"/)
})

test('the readable chain recognizes post, reply, follow and reaction already published, without a ledger', async () => {
  const objs = {
    ob_0: { id: 'ob_0', tipo: 'postagem', criadoEm: T - 50, previo: 'ob_1', corpo: { texto: 'Já publicada.', topicos: ['a'] } },
    ob_1: { id: 'ob_1', tipo: 'postagem', criadoEm: T - 60, previo: 'ob_1', corpo: { texto: 'Já publicada.', topicos: ['a'] } }
  }
  objs.ob_1.previo = null
  const f = fake((m, c, n, body) => {
    if (c.startsWith('/v1/rovers/')) return rover('ob_0')
    const o = objs[c.replace('/v1/objetos/', '')]
    if (o) return resp(200, { objeto: o })
    return base()(m, c, n, body)
  })
  const r = await run(f, { catalogo: { ...CAT, postagens: [{ ref: 'p1', de: 'seixo', topicos: ['a'], texto: 'Já publicada.' }, { ref: 'p2', de: 'seixo', topicos: ['a'], texto: 'Nova de verdade.' }] } })
  assert.equal(r.existentes.postagens, 1)
  assert.equal(r.criados.postagens, 1)
  assert.equal(f.pedidos.filter((p) => p.metodo === 'POST' && p.corpo.objeto.tipo === 'postagem').length, 1)
})
