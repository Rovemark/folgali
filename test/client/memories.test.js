// SPDX-License-Identifier: AGPL-3.0-or-later
// Addition of 2026-11-26 to 0.11.0 (`lembrancas`): the reference client reads a rover's memories. The anonymous reader goes without a
// credential; the rover goes signed (so `minhaReacao` comes back); both against a real relay, with the windows, `limite` and the 404.
import test from 'node:test'
import assert from 'node:assert/strict'
import { NetworkReader, RelayError, RoverClient } from '../../packages/client/src/index.js'
import { start } from '../helpers/test-server.js'
import { DAY, publish, registeredRover } from '../helpers/test-relay.js'

const KEYS = ['ontem', 'uma-semana', 'duas-semanas', 'tres-semanas', 'um-mes', 'primeiro-dia']

test('the request: the path of the rover, `limite` in the query; the reader sends no credential, the rover signs', async () => {
  const requests = []
  const fetchImpl = async (url, init) => {
    requests.push({ url, signed: 'authorization' in (init.headers ?? {}) })
    return { ok: true, status: 200, json: async () => ({ rover: 'rvr_x', agora: 0, desde: 0, janelas: [] }) }
  }
  await new NetworkReader({ base: 'http://rele.teste', fetchImpl }).lembrancas('rvr_x/../admin', { limite: 2 })
  assert.deepEqual(requests[0], { url: 'http://rele.teste/v1/rovers/rvr_x%2F..%2Fadmin/lembrancas?limite=2', signed: false })
  const s = await start()
  try {
    const pipa = registeredRover(s.m, { handle: 'pipa.cliente' })
    const c = new RoverClient({ base: 'http://rele.teste', uid: pipa.uid, chavePrivada: pipa.rede.chavePrivada, atestado: pipa.atestado, aprovador: { aprovar: async () => null }, relogio: () => s.m.relogio.agora, fetchImpl })
    await c.lembrancas()
    assert.deepEqual(requests[1], { url: `http://rele.teste/v1/rovers/${pipa.uid}/lembrancas`, signed: true })
  } finally {
    await s.fechar()
  }
})

test('against a real relay: the windows come in order, yesterday has the post, the rover sees its own reaction, 404 is a RelayError', async () => {
  const s = await start()
  try {
    const { m } = s
    const pipa = registeredRover(m, { handle: 'pipa.lembra' })
    const ana = registeredRover(m, { handle: 'ana.reage' })
    const posted = publish(m, pipa, 'postagem', { texto: 'Uma tarde de chuva na janela.', topicos: [] })
    const second = publish(m, pipa, 'postagem', { texto: 'Depois o sol voltou.', topicos: [] })
    publish(m, ana, 'reacao', { alvo: posted.objeto.id, reacao: 'curtir' })
    publish(m, pipa, 'reacao', { alvo: posted.objeto.id, reacao: 'amei' })
    m.relogio.agora += 1.5 * DAY

    const reader = new NetworkReader({ base: s.base })
    assert.ok(await reader.suporta('lembrancas'))
    const r = await reader.lembrancas(pipa.uid)
    assert.equal(r.rover, pipa.uid)
    assert.equal(r.agora, m.relogio.agora)
    assert.deepEqual(r.janelas.map((w) => w.janela), KEYS)
    const yesterday = r.janelas[0]
    assert.deepEqual(yesterday.itens.map((i) => i.envelope.objeto.id), [posted.objeto.id, second.objeto.id])
    assert.equal(yesterday.itens[0].minhaReacao, null, 'an anonymous read has no reaction of its own')
    assert.deepEqual((await reader.lembrancas(pipa.uid, { limite: 1 })).janelas[0].itens.length, 1)

    const client = new RoverClient({ base: s.base, uid: pipa.uid, chavePrivada: pipa.rede.chavePrivada, atestado: pipa.atestado, aprovador: { aprovar: async () => null }, relogio: () => m.relogio.agora })
    const own = await client.lembrancas()
    assert.equal(own.janelas[0].itens[0].minhaReacao, 'amei')

    await assert.rejects(() => reader.lembrancas('rvr_naoexisteAAAAAAAAAAAAA'), (e) => e instanceof RelayError && e.status === 404 && e.codigo === 'nao_encontrado')
    await assert.rejects(() => reader.lembrancas(pipa.uid, { limite: 11 }), (e) => e instanceof RelayError && e.status === 422)
  } finally {
    await s.fechar()
  }
})
