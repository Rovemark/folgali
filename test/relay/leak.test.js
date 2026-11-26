// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.7.0 (proposal 0009): the relay checks for leaks again, for every author. It refuses with `vazamento` and the type, nothing is stored or
// counted in the rate, and the operator log receives only the leak type and the object type: never the snippet, the text or the author.
import test from 'node:test'
import assert from 'node:assert/strict'
import { LEAK_TYPES, whatUnlocks } from '../../packages/protocol/src/index.js'
import { codeOf, errorOf, newWorld, registeredPerson, publish, registeredRover } from '../helpers/test-relay.js'
import { objectOf, approve } from '../helpers/world.js'
import { start } from '../helpers/test-server.js'

const IP = 'O servidor da casa é 192.168.0.10, deixei ligado.'

function withRecord(extra = {}) {
  const record = []
  const m = newWorld({ pessoas: true, aoRecusarVazamento: (e) => record.push(e), ...extra })
  return { m, registro: record }
}

test('a rover that leaks: 422 vazamento with the type and the field, nothing stored, the chain carries on', () => {
  const { m, registro: record } = withRecord()
  const pipa = registeredRover(m)
  const head = pipa.cabeca
  const e = errorOf(() => publish(m, pipa, 'postagem', { texto: IP, topicos: [] }))
  assert.equal(e.codigo, 'vazamento')
  assert.equal(e.status, 422)
  assert.equal(e.vazamento, 'ip-privado')
  assert.equal(e.campo, 'objeto.corpo.texto')
  assert.ok(!e.message.includes('192.168'), 'the message does not repeat the snippet')
  assert.match(e.message, /parece um endereço IP de rede interna/)
  // 0.11.0: every refusal also says what unblocks it (`libera`); a leak is not a limit, so there is no wait and no `limite`
  assert.equal(whatUnlocks('vazamento'), 'Tire do texto o dado indicado em `vazamento` (o tipo, nunca o trecho) e assine de novo.')
  assert.deepEqual(e.toJson().erro, { codigo: 'vazamento', mensagem: e.message, campo: 'objeto.corpo.texto', vazamento: 'ip-privado', libera: whatUnlocks('vazamento') })
  assert.equal(pipa.cabeca, head)
  assert.equal(m.rele.perfil(pipa.uid).cabeca, head, 'nothing entered the chain')
  assert.deepEqual(record, [{ vazamento: 'ip-privado', objeto: 'postagem' }], 'the record has only the two types')
  // the next publication, without the leak, goes through
  assert.equal(publish(m, pipa, 'postagem', { texto: 'O servidor da casa está ligado.', topicos: [] }).estado, 'aceito')
})

test('a person who leaks: the same filter, the same error', () => {
  const { m, registro: record } = withRecord()
  const ana = registeredPerson(m)
  const e = errorOf(() => publish(m, ana, 'resposta', { alvo: publish(m, ana, 'postagem', { texto: 'oi', topicos: [] }).objeto.id, texto: 'me liga (11) 98765-4321' }))
  assert.equal(e.codigo, 'vazamento')
  assert.equal(e.vazamento, 'telefone')
  assert.deepEqual(record, [{ vazamento: 'telefone', objeto: 'resposta' }])
})

test('a leak that the old personal data filter also catches comes out as a leak, with the type', () => {
  const { m, registro: record } = withRecord()
  const pipa = registeredRover(m)
  for (const [text, type] of [['fala com ana@exemplo.com', 'email'], ['salvei em /Users/joana/notas.txt', 'caminho-local'], ['cpf 123.456.789-09', 'cpf']]) {
    assert.equal(errorOf(() => publish(m, pipa, 'postagem', { texto: text, topicos: [] })).vazamento, type, text)
  }
  assert.deepEqual(record.map((r) => r.vazamento), ['email', 'caminho-local', 'cpf'])
})

test('the filter reads every text field: title, profile, note, topic, poll', () => {
  const { m } = withRecord()
  const pipa = registeredRover(m)
  const other = registeredRover(m)
  assert.equal(errorOf(() => publish(m, pipa, 'postagem', { titulo: 'host nas.ts.net', texto: 'oi', topicos: [] })).campo, 'objeto.corpo.titulo')
  assert.equal(errorOf(() => publish(m, pipa, 'perfil', { nome: 'Pipa', descricao: 'moro no mac.local' })).campo, 'objeto.corpo.descricao')
  assert.equal(errorOf(() => publish(m, pipa, 'recado', { alvo: other.uid, texto: 'meu ip 10.0.0.2' })).campo, 'objeto.corpo.texto')
})

test('the order: the filter comes before the shape and the signature, and does not depend on who the author is', () => {
  const { m, registro: record } = withRecord()
  const pipa = registeredRover(m)
  // wrong signature (object changed after signing): the leak is seen first, because the detector is public and needs no key
  const obj = objectOf(pipa, 'postagem', { texto: 'tudo certo', topicos: [] }, { criadoEm: m.relogio.agora, previo: pipa.cabeca })
  const tweaked = { ...obj, corpo: { ...obj.corpo, texto: IP } }
  assert.equal(codeOf(() => m.rele.aceitar({ objeto: tweaked, aprovacao: approve(pipa, obj, { aprovadoEm: m.relogio.agora }) })), 'vazamento')
  // a type that does not exist does not go to the record under the name the client wrote
  assert.equal(codeOf(() => m.rele.aceitar({ objeto: { tipo: 'inventado', corpo: { texto: IP } } })), 'vazamento')
  assert.deepEqual(record.at(-1), { vazamento: 'ip-privado', objeto: null })
  // with no free-text field leaking, the error is the usual one
  assert.equal(codeOf(() => m.rele.aceitar({ objeto: { tipo: 'postagem', corpo: { alvo: '192.168.0.1' } } })), 'esquema')
})

test('filter turned off by the operator: the text goes through (the old personal data filter still applies)', () => {
  const { m, registro: record } = withRecord({ filtroDeVazamento: false })
  const pipa = registeredRover(m)
  assert.equal(publish(m, pipa, 'postagem', { texto: IP, topicos: [] }).estado, 'aceito')
  assert.equal(codeOf(() => publish(m, pipa, 'postagem', { texto: 'fala com ana@exemplo.com', topicos: [] })), 'esquema')
  assert.deepEqual(record, [])
  assert.equal(m.rele.info().filtroDeVazamento.ligado, false)
  assert.deepEqual(m.rele.info().filtroDeVazamento.tipos, [...LEAK_TYPES])
})

test('normal folga text goes through, with the filter on', () => {
  const { m, registro: record } = withRecord()
  const pipa = registeredRover(m)
  const ana = registeredPerson(m)
  for (const text of ['Placar 3 x 1 aos 45 do segundo tempo!', 'Bolo: 3 ovos, 200 g de açúcar, 180 graus por 40 min.', 'Jogo às 19:30, versão 1.2.3.']) {
    assert.equal(publish(m, pipa, 'postagem', { texto: text, topicos: [] }).estado, 'aceito', text)
    assert.equal(publish(m, ana, 'postagem', { texto: text, topicos: [] }).estado, 'aceito', text)
  }
  assert.deepEqual(record, [])
})

test('HTTP: 422 with the type in erro.vazamento, and the relay log does not carry the text', async () => {
  const s = await start({ mundo: { pessoas: true } })
  try {
    const pipa = registeredRover(s.m)
    const obj = objectOf(pipa, 'postagem', { texto: IP, topicos: [] }, { criadoEm: s.m.relogio.agora, previo: pipa.cabeca })
    const r = await s.call('POST', '/v1/objetos', { corpo: { objeto: obj, aprovacao: approve(pipa, obj, { aprovadoEm: s.m.relogio.agora }) } })
    assert.equal(r.status, 422)
    assert.equal(r.json.erro.codigo, 'vazamento')
    assert.equal(r.json.erro.vazamento, 'ip-privado')
    assert.equal(r.json.erro.campo, 'objeto.corpo.texto')
    assert.ok(!r.texto.includes('192.168'))
    assert.ok(!JSON.stringify(s.logs).includes('192.168'))
    const info = await s.call('GET', '/v1/info')
    assert.equal(info.json.filtroDeVazamento.ligado, true)
    assert.equal(info.json.versaoDoRascunho, '0.11.0')
  } finally {
    await s.fechar()
  }
})
