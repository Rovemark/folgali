// SPDX-License-Identifier: AGPL-3.0-or-later
// The anonymous reader never sends credentials, validates the relay address and does not let outside input become another route; the command line
// `rover-network` only reads, picks the relay by --rele, RN_RELE or the local default, and has no production address built in.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { NetworkReader, relayBase } from '../../packages/client/src/index.js'
import { DEFAULT_RELAY, execute } from '../../packages/client/bin/rover-network.js'
import { start } from '../helpers/test-server.js'
import { publish, registeredRover } from '../helpers/test-relay.js'
import { DRAFT_REVIEW } from '../../packages/protocol/src/index.js'

const recordingFetch = () => {
  const requests = []
  const f = async (url, init) => {
    requests.push({ url, init })
    return { ok: true, status: 200, json: async () => ({ itens: [], proximo: null, uid: 'rvr_x' }) }
  }
  return { f, pedidos: requests }
}

test('baseDoRele: only http and https, no user and password, no trailing slash', () => {
  assert.equal(relayBase('http://127.0.0.1:4747/'), 'http://127.0.0.1:4747')
  assert.equal(relayBase('https://rele.exemplo/base//'), 'https://rele.exemplo/base')
  for (const bad of ['ftp://x', 'javascript:alert(1)', 'file:///etc/passwd', 'nada', 'https://a:b@rele.exemplo']) assert.throws(() => relayBase(bad), TypeError, bad)
})

test('LeitorDaRede: every request is a GET, with no Authorization and no body; outside input is encoded in the path', async () => {
  const { f, pedidos: requests } = recordingFetch()
  const l = new NetworkReader({ base: 'http://rele.teste', fetchImpl: f })
  const calls = Object.getOwnPropertyNames(NetworkReader.prototype).filter((n) => n !== 'constructor')
  for (const n of calls) await l[n]('x/../admin?y=1', {})
  assert.ok(requests.length >= calls.length)
  for (const { url, init } of requests) {
    assert.equal(init.method, 'GET', url)
    assert.deepEqual(init.headers, {}, `${url} carried a header`)
    assert.equal(init.body, undefined)
    assert.ok(!url.includes('/../'), `segment not encoded: ${url}`)
    assert.ok(!/\/v1\/admin/.test(url), url)
  }
  requests.length = 0
  await l.viewHandle('@pipa')
  assert.equal(requests[0].url, 'http://rele.teste/v1/handles/pipa', 'the leading @ is stripped')
  await l.lineOf('rvr_x', { limite: 5, completo: true })
  assert.equal(requests[1].url, 'http://rele.teste/v1/linha/inicio?rover=rvr_x&completo=1&limite=5')
  await l.busca('planilha de prazos', { tipo: 'topicos' })
  assert.equal(requests[2].url, 'http://rele.teste/v1/busca?q=planilha%20de%20prazos&tipo=topicos')
})

test('LeitorDaRede against a real relay: profile, timeline, object, error with code and closed graph', async (t) => {
  const s = await start()
  t.after(s.fechar)
  const pipa = registeredRover(s.m, { handle: 'pipa' })
  const bento = registeredRover(s.m, { handle: 'bento' })
  const closed = registeredRover(s.m, { handle: 'quieto', grafo: 'privado' })
  publish(s.m, pipa, 'seguir', { alvo: bento.uid })
  const post = publish(s.m, bento, 'postagem', { texto: 'Lista curta de prazos.', topicos: ['prazos'] })
  const l = new NetworkReader({ base: s.base })
  assert.equal((await l.info()).versaoDoRascunho, DRAFT_REVIEW)
  assert.equal((await l.viewHandle('pipa')).uid, pipa.uid)
  assert.deepEqual((await l.lineOf(pipa.uid)).itens.map((i) => i.objeto.id), [post.objeto.id])
  assert.equal((await l.viewObject(post.objeto.id)).objeto.corpo.texto, 'Lista curta de prazos.')
  await assert.rejects(l.viewHandle('ninguem.aqui'), (e) => e.name === 'RelayError' && e.status === 404 && e.codigo === 'nao_encontrado')
  await assert.rejects(l.seguindo(closed.uid), (e) => e.status === 403 && e.codigo === 'grafo_privado')
  await assert.rejects(l.busca('a'), (e) => e.status === 422 && e.codigo === 'esquema' && e.campo === 'q')
})

test('rover-network: info, profile, timeline and search against a real relay; the output is the relay JSON', async (t) => {
  const s = await start()
  t.after(s.fechar)
  const pipa = registeredRover(s.m, { handle: 'pipa' })
  const bento = registeredRover(s.m, { handle: 'bento' })
  publish(s.m, pipa, 'seguir', { alvo: bento.uid })
  publish(s.m, bento, 'postagem', { texto: 'Planilha de prazos nova.', topicos: ['prazos'] })
  const env = { RN_RELE: s.base }
  const info = await execute(['info'], { env })
  assert.equal(info.codigo, 0, info.erro)
  assert.equal(JSON.parse(info.saida).versaoDoRascunho, DRAFT_REVIEW)
  assert.equal(JSON.parse((await execute(['perfil', '@pipa'], { env })).saida).uid, pipa.uid)
  const line = JSON.parse((await execute(['linha', 'pipa', '--limite', '1'], { env })).saida)
  assert.equal(line.itens.length, 1)
  assert.equal(line.itens[0].objeto.autor, bento.uid)
  const search = await execute(['buscar', 'planilha', 'de', 'prazos'], { env })
  assert.equal(search.codigo, 0, search.erro)
  assert.deepEqual(Object.keys(JSON.parse(search.saida)).sort(), ['comunidades', 'paginas', 'rovers', 'topicos'])
  const missing = await execute(['perfil', 'ninguem.aqui'], { env })
  assert.deepEqual(missing, { codigo: 1, saida: '', erro: 'erro 404 nao_encontrado: Não encontrado.\n' })
  assert.equal((await execute(['info', '--rele', s.base], { env: { RN_RELE: 'http://127.0.0.1:1' } })).codigo, 0, '--rele wins over RN_RELE')
  assert.equal((await execute(['info'], { env: { RN_RELAY: s.base, RN_RELE: 'http://127.0.0.1:1' } })).codigo, 0, 'RN_RELAY, the English name, wins over RN_RELE')
})

test('rover-network: wrong usage exits with 2 and the help; a relay that is down exits with 1 saying where it tried; the default is the local relay', async () => {
  for (const argv of [[], ['publicar', 'oi'], ['perfil'], ['linha'], ['buscar'], ['info', '--limite', '0'], ['info', '--rele'], ['info', '--chave', 'x'], ['info', '--rele', 'ftp://x']]) {
    const r = await execute(argv, { env: {} })
    assert.equal(r.codigo, 2, argv.join(' '))
    assert.equal(r.saida, '')
  }
  assert.match((await execute(['linha'], { env: {} })).erro, /não tem linha global/)
  const help = await execute(['--help'], { env: {} })
  assert.equal(help.codigo, 0)
  assert.match(help.saida, /só leitura/)
  const outside = await execute(['info'], { env: { RN_RELE: 'http://127.0.0.1:1' } })
  assert.equal(outside.codigo, 1)
  assert.match(outside.erro, /^não consegui falar com o relé em http:\/\/127\.0\.0\.1:1/)
  const { f, pedidos: requests } = recordingFetch()
  await execute(['info'], { env: {}, fetchImpl: f })
  assert.equal(requests[0].url, `${DEFAULT_RELAY}/v1/info`)
  assert.equal(DEFAULT_RELAY, 'http://127.0.0.1:4747')
})

test('no production address built into the bin or the reader; the bin imports nothing that signs', () => {
  for (const f of ['packages/client/bin/rover-network.js', 'packages/client/src/reader.js']) {
    const source = readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8')
    for (const u of source.match(/https?:\/\/[a-z0-9][^\s'"`)]*/gi) ?? []) assert.match(u, /^http:\/\/127\.0\.0\.1:4747$/, `${f}: ${u}`)
  }
  const bin = readFileSync(new URL('../../packages/client/bin/rover-network.js', import.meta.url), 'utf8')
  assert.ok(!/RoverClient|chavePrivada|createObject|POST/.test(bin), 'the command line is read-only')
})
