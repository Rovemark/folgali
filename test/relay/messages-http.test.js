// SPDX-License-Identifier: AGPL-3.0-or-later
// Private messages over HTTP: when off, the relay is a 0.3.2 (the routes disappear, 0.4 is versao_nao_suportada, /v1/info is unchanged); when on, the
// message routes require the credential of the rover in the path, the cipher key is public, the report queue belongs to the operator and the log carries no ids.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createObject, generateCipherKeyPair } from '../../packages/protocol/src/index.js'
import { approve } from '../helpers/world.js'
import { credentialOf, registeredRover } from '../helpers/test-relay.js'
import { TOKEN, start } from '../helpers/test-server.js'

const object4 = (s, rover, type, body) => createObject({ v: '0.4', tipo: type, autor: rover.uid, criadoEm: s.m.relogio.agora, previo: null, corpo: body, chavePrivada: rover.rede.chavePrivada })
const admin = { authorization: `Bearer ${TOKEN}` }

test('off (default): conversation routes do not exist, a 0.4 object is versao_nao_suportada, /v1/info has nothing new', async () => {
  const s = await start()
  try {
    const ana = registeredRover(s.m)
    for (const route of [`/v1/rovers/${ana.uid}/chave-de-cifra`, `/v1/rovers/${ana.uid}/conversas`, '/v1/admin/mensagens/denuncias']) {
      const r = await s.call('GET', route, { cabecalhos: admin })
      assert.equal(r.status, 404, route)
      assert.equal(r.json.erro.codigo, 'nao_encontrado', route)
    }
    const r = await s.call('POST', '/v1/objetos', { corpo: { objeto: object4(s, ana, 'chave-de-cifra', { chave: generateCipherKeyPair().publicKey }) } })
    assert.equal(r.status, 422)
    assert.equal(r.json.erro.codigo, 'versao_nao_suportada')
    const info = (await s.call('GET', '/v1/info')).json
    assert.equal(info.versaoDoRascunho, '0.11.0')
    assert.equal(info.recursos.includes('mensagens'), false)
    assert.equal(info.mensagens, undefined)
    assert.equal((await s.call('GET', '/v1/info')).cab.get('x-rover-protocolo'), '0.3')
  } finally {
    await s.fechar()
  }
})

test('on: public cipher key, conversations only with the credential of the rover itself, operator queue, log without ids', async () => {
  const s = await start({ mundo: { mensagens: true } })
  try {
    const ana = registeredRover(s.m)
    const beto = registeredRover(s.m)
    const publish4 = async (rover, type, body, approved) => {
      const o = object4(s, rover, type, body)
      const env = approved ? { objeto: o, aprovacao: approve(rover, o, { aprovadoEm: s.m.relogio.agora }) } : { objeto: o }
      return s.call('POST', '/v1/objetos', { corpo: env })
    }
    const key = generateCipherKeyPair().publicKey
    assert.equal((await publish4(ana, 'chave-de-cifra', { chave: key })).status, 201)
    const pub = await s.call('GET', `/v1/rovers/${ana.uid}/chave-de-cifra`)
    assert.equal(pub.status, 200)
    assert.equal(pub.json.objeto.corpo.chave, key)
    assert.equal((await s.call('GET', `/v1/rovers/${beto.uid}/chave-de-cifra`)).status, 404)

    const route = `/v1/rovers/${ana.uid}/conversas?estado=todas`
    assert.equal((await s.call('GET', route)).status, 401)
    const fromOther = await s.call('GET', route, { cabecalhos: { authorization: credentialOf(s.m, beto, route) } })
    assert.equal(fromOther.status, 403)
    assert.equal(fromOther.json.erro.codigo, 'sem_permissao')
    const own = await s.call('GET', route, { cabecalhos: { authorization: credentialOf(s.m, ana, route) } })
    assert.equal(own.status, 200)
    assert.deepEqual(own.json, { itens: [], proximo: null })
    const crooked = `/v1/rovers/${ana.uid}/conversas?estado=arquivadas`
    assert.equal((await s.call('GET', crooked, { cabecalhos: { authorization: credentialOf(s.m, ana, crooked) } })).json.erro.codigo, 'esquema')

    // without friendship the request is not accepted, and the response does not say why
    const r = await publish4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'oi' }, true)
    assert.equal(r.status, 403)
    assert.equal(r.json.erro.codigo, 'interacao_nao_permitida')

    assert.equal((await s.call('GET', '/v1/admin/mensagens/denuncias')).status, 401)
    const queue = await s.call('GET', '/v1/admin/mensagens/denuncias', { cabecalhos: admin })
    assert.deepEqual(queue.json, { denuncias: [] })

    const info = (await s.call('GET', '/v1/info')).json
    assert.equal(info.versaoDoRascunho, '0.11.0')
    assert.ok(info.recursos.includes('mensagens'))

    const log = JSON.stringify(s.logs)
    assert.equal(log.includes(ana.uid), false)
    assert.equal(log.includes(beto.uid), false)
    assert.ok(s.logs.some((e) => e.rota === '/v1/rovers/:uid/conversas'))
  } finally {
    await s.fechar()
  }
})
