// SPDX-License-Identifier: AGPL-3.0-or-later
// Mensagens privadas pelo HTTP: desligadas, o relé é um 0.3.2 (rotas somem, 0.4 é versao_nao_suportada, /v1/info igual); ligadas, as rotas
// próprias exigem a credencial do rover do caminho, a chave de cifra é pública, a fila de denúncias é do operador e o log não leva ids.
import test from 'node:test'
import assert from 'node:assert/strict'
import { criarObjeto, gerarParDeCifra } from '../../packages/protocolo/src/index.js'
import { aprovar } from '../ajuda/mundo.js'
import { credencialDe, roverRegistrado } from '../ajuda/rele-de-teste.js'
import { TOKEN, subir } from '../ajuda/servidor-de-teste.js'

const objeto4 = (s, rover, tipo, corpo) => criarObjeto({ v: '0.4', tipo, autor: rover.uid, criadoEm: s.m.relogio.agora, previo: null, corpo, chavePrivada: rover.rede.chavePrivada })
const admin = { authorization: `Bearer ${TOKEN}` }

test('desligadas (padrão): rotas de conversa não existem, objeto 0.4 é versao_nao_suportada, /v1/info sem nada novo', async () => {
  const s = await subir()
  try {
    const ana = roverRegistrado(s.m)
    for (const rota of [`/v1/rovers/${ana.uid}/chave-de-cifra`, `/v1/rovers/${ana.uid}/conversas`, '/v1/admin/mensagens/denuncias']) {
      const r = await s.chamar('GET', rota, { cabecalhos: admin })
      assert.equal(r.status, 404, rota)
      assert.equal(r.json.erro.codigo, 'nao_encontrado', rota)
    }
    const r = await s.chamar('POST', '/v1/objetos', { corpo: { objeto: objeto4(s, ana, 'chave-de-cifra', { chave: gerarParDeCifra().chavePublica }) } })
    assert.equal(r.status, 422)
    assert.equal(r.json.erro.codigo, 'versao_nao_suportada')
    const info = (await s.chamar('GET', '/v1/info')).json
    assert.equal(info.versaoDoRascunho, '0.6.0')
    assert.equal(info.recursos.includes('mensagens'), false)
    assert.equal(info.mensagens, undefined)
    assert.equal((await s.chamar('GET', '/v1/info')).cab.get('x-rover-protocolo'), '0.3')
  } finally {
    await s.fechar()
  }
})

test('ligadas: chave de cifra pública, conversas só com a credencial do próprio rover, fila do operador, log sem ids', async () => {
  const s = await subir({ mundo: { mensagens: true } })
  try {
    const ana = roverRegistrado(s.m)
    const beto = roverRegistrado(s.m)
    const publicar4 = async (rover, tipo, corpo, aprovada) => {
      const o = objeto4(s, rover, tipo, corpo)
      const env = aprovada ? { objeto: o, aprovacao: aprovar(rover, o, { aprovadoEm: s.m.relogio.agora }) } : { objeto: o }
      return s.chamar('POST', '/v1/objetos', { corpo: env })
    }
    const chave = gerarParDeCifra().chavePublica
    assert.equal((await publicar4(ana, 'chave-de-cifra', { chave })).status, 201)
    const pub = await s.chamar('GET', `/v1/rovers/${ana.uid}/chave-de-cifra`)
    assert.equal(pub.status, 200)
    assert.equal(pub.json.objeto.corpo.chave, chave)
    assert.equal((await s.chamar('GET', `/v1/rovers/${beto.uid}/chave-de-cifra`)).status, 404)

    const rota = `/v1/rovers/${ana.uid}/conversas?estado=todas`
    assert.equal((await s.chamar('GET', rota)).status, 401)
    const deOutro = await s.chamar('GET', rota, { cabecalhos: { authorization: credencialDe(s.m, beto, rota) } })
    assert.equal(deOutro.status, 403)
    assert.equal(deOutro.json.erro.codigo, 'sem_permissao')
    const proprio = await s.chamar('GET', rota, { cabecalhos: { authorization: credencialDe(s.m, ana, rota) } })
    assert.equal(proprio.status, 200)
    assert.deepEqual(proprio.json, { itens: [], proximo: null })
    const torto = `/v1/rovers/${ana.uid}/conversas?estado=arquivadas`
    assert.equal((await s.chamar('GET', torto, { cabecalhos: { authorization: credencialDe(s.m, ana, torto) } })).json.erro.codigo, 'esquema')

    // sem amizade, o pedido não entra, e a resposta não diz por quê
    const r = await publicar4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'oi' }, true)
    assert.equal(r.status, 403)
    assert.equal(r.json.erro.codigo, 'interacao_nao_permitida')

    assert.equal((await s.chamar('GET', '/v1/admin/mensagens/denuncias')).status, 401)
    const fila = await s.chamar('GET', '/v1/admin/mensagens/denuncias', { cabecalhos: admin })
    assert.deepEqual(fila.json, { denuncias: [] })

    const info = (await s.chamar('GET', '/v1/info')).json
    assert.equal(info.versaoDoRascunho, '0.6.0')
    assert.ok(info.recursos.includes('mensagens'))

    const log = JSON.stringify(s.logs)
    assert.equal(log.includes(ana.uid), false)
    assert.equal(log.includes(beto.uid), false)
    assert.ok(s.logs.some((e) => e.rota === '/v1/rovers/:uid/conversas'))
  } finally {
    await s.fechar()
  }
})
