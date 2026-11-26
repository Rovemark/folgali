// SPDX-License-Identifier: AGPL-3.0-or-later
// HTTP edges: exact sizes, credential lengths, default pagination values.
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { publish, registeredRover } from '../helpers/test-relay.js'
import { TOKEN, start } from '../helpers/test-server.js'

const JSON_CT = { 'content-type': 'application/json' }
const sizedBody = (bytes) => {
  const base = '{"x":""}'
  return `{"x":"${'a'.repeat(bytes - base.length)}"}`
}

function sendInChunks(s, bytes) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: s.servidor.address().port, method: 'POST', path: '/v1/objetos', headers: { ...JSON_CT, 'transfer-encoding': 'chunked' } }, (res) => {
      res.resume()
      resolve(res.statusCode)
    })
    req.on('error', () => resolve('cortado'))
    const body = sizedBody(bytes)
    for (let i = 0; i < body.length; i += 4096) req.write(body.slice(i, i + 4096))
    req.end()
  })
}

test('a body of exactly 16 KiB passes the size check and fails the schema; one more byte is 413', async () => {
  const s = await start()
  try {
    assert.equal(Buffer.byteLength(sizedBody(16384)), 16384)
    const exact = await s.call('POST', '/v1/objetos', { bruto: sizedBody(16384), cabecalhos: JSON_CT })
    assert.equal(exact.status, 422)
    assert.equal(exact.json.erro.codigo, 'esquema')
    const passed = await s.call('POST', '/v1/objetos', { bruto: sizedBody(16385), cabecalhos: JSON_CT })
    assert.equal(passed.status, 413)
    assert.equal(await sendInChunks(s, 16384), 422)
    assert.ok([413, 'cortado'].includes(await sendInChunks(s, 16385)))
  } finally { await s.fechar() }
})

test('a URL of up to 2048 characters is served, 2049 is not', async () => {
  const s = await start()
  try {
    const withSize = (n) => `/v1/info?${'a'.repeat(n - '/v1/info?'.length)}`
    assert.equal(withSize(2048).length, 2048)
    assert.equal((await s.call('GET', withSize(2048))).status, 200)
    assert.equal((await s.call('GET', withSize(2049))).status, 404)
  } finally { await s.fechar() }
})

test('the admin credential needs 32 characters', async () => {
  const short = await start({ tokenAdmin: 'a'.repeat(31) })
  const exact = await start({ tokenAdmin: 'b'.repeat(32) })
  try {
    assert.equal((await short.call('GET', '/v1/admin/bloqueios', { cabecalhos: { authorization: `Bearer ${'a'.repeat(31)}` } })).status, 404)
    assert.equal((await exact.call('GET', '/v1/admin/bloqueios', { cabecalhos: { authorization: `Bearer ${'b'.repeat(32)}` } })).status, 200)
  } finally { await Promise.all([short.fechar(), exact.fechar()]) }
})

test('pagination over HTTP: default 20, minimum 1, maximum 50', async () => {
  const s = await start({ mundo: { rates: { porTipo: { perfil: [[3600, 100]], postagem: [[3600, 100]], seguir: [[3600, 100]] } } } })
  try {
    const a = registeredRover(s.m)
    const me = registeredRover(s.m)
    publish(s.m, me, 'seguir', { alvo: a.uid })
    for (let i = 0; i < 55; i++) publish(s.m, a, 'postagem', { texto: `p${i}`, topicos: [] })
    for (const base of [`/v1/rovers/${a.uid}/postagens`, `/v1/linha/inicio?rover=${me.uid}`]) {
      const sep = base.includes('?') ? '&' : '?'
      assert.equal((await s.call('GET', base)).json.itens.length, 20, base)
      const one = await s.call('GET', `${base}${sep}limite=1`)
      assert.equal(one.status, 200)
      assert.equal(one.json.itens.length, 1)
      assert.equal((await s.call('GET', `${base}${sep}limite=50`)).json.itens.length, 50)
      const high = await s.call('GET', `${base}${sep}limite=51`)
      assert.equal(high.status, 422)
      assert.match(high.json.erro.mensagem, /a partir de 1 e até 50\./)
    }
    const high = await s.call('GET', `/v1/rovers/${a.uid}/postagens?antes=999999999`)
    assert.equal(high.status, 200)
    assert.equal(high.json.itens.length, 20)
    assert.equal((await s.call('GET', `/v1/rovers/${a.uid}/postagens?antes=1000000000`)).status, 422)
    const zero = await s.call('GET', `/v1/rovers/${a.uid}/postagens?antes=0`)
    assert.equal(zero.status, 422)
    assert.match(zero.json.erro.mensagem, /a partir de 1\.$/) // no ceiling in the text: the 9-digit ceiling comes from the format
  } finally { await s.fechar() }
})

test('report queue over HTTP: default 50, from 1 to 200', async () => {
  const s = await start()
  try {
    for (let i = 0; i < 210; i++) {
      s.m.store.executar('INSERT INTO denuncias (alvo, autor_do_alvo, motivo, pseudonimo, criado_em) VALUES (:alvo, :autor, :motivo, :p, :agora)', {
        alvo: `ob_${String(i).padStart(43, 'A')}`, autor: `rvr_${'B'.repeat(22)}`, motivo: 'spam', p: `p${i}`, agora: s.m.relogio.agora
      })
    }
    const ok = { authorization: `Bearer ${TOKEN}` }
    const n = async (q) => (await s.call('GET', `/v1/admin/denuncias${q}`, { cabecalhos: ok }))
    assert.equal((await n('')).json.denuncias.length, 50)
    assert.equal((await n('?limite=1')).json.denuncias.length, 1)
    assert.equal((await n('?limite=200')).json.denuncias.length, 200)
    assert.equal((await n('?limite=201')).status, 422)
    assert.equal((await n('?limite=0')).status, 422)
  } finally { await s.fechar() }
})

test('relay appeals queue over HTTP: default 50, from 1 to 200', async () => {
  const s = await start({ rajada: { capacity: 100000, perSecond: 100000 } })
  try {
    for (let i = 0; i < 210; i++) {
      s.m.store.executar("INSERT INTO apelacoes (id, tipo, alvo, contexto, autor, decisor, envelope, em, estado) VALUES (:id, 'outra', :alvo, NULL, :autor, 'rele', NULL, :em, 'aberta')", {
        id: `ap_${i}`, alvo: `ob_${String(i).padStart(43, 'A')}`, autor: `rvr_${'B'.repeat(22)}`, em: s.m.relogio.agora + i
      })
    }
    const ok = { authorization: `Bearer ${TOKEN}` }
    const n = async (q) => (await s.call('GET', `/v1/admin/apelacoes${q}`, { cabecalhos: ok }))
    assert.equal((await n('')).status, 200)
    assert.equal((await n('')).json.itens.length, 50)
    assert.equal((await n('?limite=1')).json.itens.length, 1)
    assert.equal((await n('?limite=200')).json.itens.length, 200)
    assert.equal((await n('?limite=201')).status, 422)
    assert.equal((await n('?limite=0')).status, 422)
  } finally { await s.fechar() }
})

test('newcomers over HTTP: default 50, from 1 to 50', async () => {
  const s = await start({ rajada: { capacity: 100000, perSecond: 100000 } })
  try {
    for (let i = 0; i < 52; i++) {
      const r = registeredRover(s.m, {})
      s.m.store.executar('UPDATE rovers SET criado_em = :c WHERE uid = :u', { c: s.m.relogio.agora - 10, u: r.uid })
    }
    const n = async (q) => (await s.call('GET', `/v1/descobrir/recem-chegados${q}`))
    assert.equal((await n('')).json.itens.length, 50)
    assert.equal((await n('?limite=1')).json.itens.length, 1)
    assert.equal((await n('?limite=50')).json.itens.length, 50)
    assert.equal((await n('?limite=51')).status, 422)
    assert.equal((await n('?limite=0')).status, 422)
  } finally { await s.fechar() }
})
