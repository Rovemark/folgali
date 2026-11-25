// SPDX-License-Identifier: AGPL-3.0-or-later
// Bordas do HTTP: tamanhos exatos, tamanhos de credencial, valores padrão de paginação.
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { publicar, roverRegistrado } from '../ajuda/rele-de-teste.js'
import { TOKEN, subir } from '../ajuda/servidor-de-teste.js'

const JSON_CT = { 'content-type': 'application/json' }
const corpoDeTamanho = (bytes) => {
  const base = '{"x":""}'
  return `{"x":"${'a'.repeat(bytes - base.length)}"}`
}

function enviarEmPedacos(s, bytes) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: s.servidor.address().port, method: 'POST', path: '/v1/objetos', headers: { ...JSON_CT, 'transfer-encoding': 'chunked' } }, (res) => {
      res.resume()
      resolve(res.statusCode)
    })
    req.on('error', () => resolve('cortado'))
    const corpo = corpoDeTamanho(bytes)
    for (let i = 0; i < corpo.length; i += 4096) req.write(corpo.slice(i, i + 4096))
    req.end()
  })
}

test('corpo de exatamente 16 KiB passa do tamanho e cai no esquema; um byte a mais é 413', async () => {
  const s = await subir()
  try {
    assert.equal(Buffer.byteLength(corpoDeTamanho(16384)), 16384)
    const justo = await s.chamar('POST', '/v1/objetos', { bruto: corpoDeTamanho(16384), cabecalhos: JSON_CT })
    assert.equal(justo.status, 422)
    assert.equal(justo.json.erro.codigo, 'esquema')
    const passou = await s.chamar('POST', '/v1/objetos', { bruto: corpoDeTamanho(16385), cabecalhos: JSON_CT })
    assert.equal(passou.status, 413)
    assert.equal(await enviarEmPedacos(s, 16384), 422)
    assert.ok([413, 'cortado'].includes(await enviarEmPedacos(s, 16385)))
  } finally { await s.fechar() }
})

test('endereço de até 2048 caracteres é atendido, de 2049 não', async () => {
  const s = await subir()
  try {
    const comTamanho = (n) => `/v1/info?${'a'.repeat(n - '/v1/info?'.length)}`
    assert.equal(comTamanho(2048).length, 2048)
    assert.equal((await s.chamar('GET', comTamanho(2048))).status, 200)
    assert.equal((await s.chamar('GET', comTamanho(2049))).status, 404)
  } finally { await s.fechar() }
})

test('a credencial de administração precisa de 32 caracteres', async () => {
  const curto = await subir({ tokenAdmin: 'a'.repeat(31) })
  const justo = await subir({ tokenAdmin: 'b'.repeat(32) })
  try {
    assert.equal((await curto.chamar('GET', '/v1/admin/bloqueios', { cabecalhos: { authorization: `Bearer ${'a'.repeat(31)}` } })).status, 404)
    assert.equal((await justo.chamar('GET', '/v1/admin/bloqueios', { cabecalhos: { authorization: `Bearer ${'b'.repeat(32)}` } })).status, 200)
  } finally { await Promise.all([curto.fechar(), justo.fechar()]) }
})

test('paginação pelo HTTP: padrão de 20, mínimo 1, máximo 50', async () => {
  const s = await subir({ mundo: { taxas: { porTipo: { perfil: [[3600, 100]], postagem: [[3600, 100]], seguir: [[3600, 100]] } } } })
  try {
    const a = roverRegistrado(s.m)
    const eu = roverRegistrado(s.m)
    publicar(s.m, eu, 'seguir', { alvo: a.uid })
    for (let i = 0; i < 55; i++) publicar(s.m, a, 'postagem', { texto: `p${i}`, topicos: [] })
    for (const base of [`/v1/rovers/${a.uid}/postagens`, `/v1/linha/inicio?rover=${eu.uid}`]) {
      const sep = base.includes('?') ? '&' : '?'
      assert.equal((await s.chamar('GET', base)).json.itens.length, 20, base)
      const um = await s.chamar('GET', `${base}${sep}limite=1`)
      assert.equal(um.status, 200)
      assert.equal(um.json.itens.length, 1)
      assert.equal((await s.chamar('GET', `${base}${sep}limite=50`)).json.itens.length, 50)
      const alto = await s.chamar('GET', `${base}${sep}limite=51`)
      assert.equal(alto.status, 422)
      assert.match(alto.json.erro.mensagem, /a partir de 1 e até 50\./)
    }
    const alto = await s.chamar('GET', `/v1/rovers/${a.uid}/postagens?antes=999999999`)
    assert.equal(alto.status, 200)
    assert.equal(alto.json.itens.length, 20)
    assert.equal((await s.chamar('GET', `/v1/rovers/${a.uid}/postagens?antes=1000000000`)).status, 422)
    const zero = await s.chamar('GET', `/v1/rovers/${a.uid}/postagens?antes=0`)
    assert.equal(zero.status, 422)
    assert.match(zero.json.erro.mensagem, /a partir de 1\.$/) // sem teto no texto: o teto de 9 dígitos vem do formato
  } finally { await s.fechar() }
})

test('fila de denúncias pelo HTTP: padrão 50, de 1 a 200', async () => {
  const s = await subir()
  try {
    for (let i = 0; i < 210; i++) {
      s.m.armazem.executar('INSERT INTO denuncias (alvo, autor_do_alvo, motivo, pseudonimo, criado_em) VALUES (:alvo, :autor, :motivo, :p, :agora)', {
        alvo: `ob_${String(i).padStart(43, 'A')}`, autor: `rvr_${'B'.repeat(22)}`, motivo: 'spam', p: `p${i}`, agora: s.m.relogio.agora
      })
    }
    const ok = { authorization: `Bearer ${TOKEN}` }
    const n = async (q) => (await s.chamar('GET', `/v1/admin/denuncias${q}`, { cabecalhos: ok }))
    assert.equal((await n('')).json.denuncias.length, 50)
    assert.equal((await n('?limite=1')).json.denuncias.length, 1)
    assert.equal((await n('?limite=200')).json.denuncias.length, 200)
    assert.equal((await n('?limite=201')).status, 422)
    assert.equal((await n('?limite=0')).status, 422)
  } finally { await s.fechar() }
})

test('fila de apelações do relé pelo HTTP: padrão 50, de 1 a 200', async () => {
  const s = await subir({ rajada: { capacidade: 100000, porSegundo: 100000 } })
  try {
    for (let i = 0; i < 210; i++) {
      s.m.armazem.executar("INSERT INTO apelacoes (id, tipo, alvo, contexto, autor, decisor, envelope, em, estado) VALUES (:id, 'outra', :alvo, NULL, :autor, 'rele', NULL, :em, 'aberta')", {
        id: `ap_${i}`, alvo: `ob_${String(i).padStart(43, 'A')}`, autor: `rvr_${'B'.repeat(22)}`, em: s.m.relogio.agora + i
      })
    }
    const ok = { authorization: `Bearer ${TOKEN}` }
    const n = async (q) => (await s.chamar('GET', `/v1/admin/apelacoes${q}`, { cabecalhos: ok }))
    assert.equal((await n('')).status, 200)
    assert.equal((await n('')).json.itens.length, 50)
    assert.equal((await n('?limite=1')).json.itens.length, 1)
    assert.equal((await n('?limite=200')).json.itens.length, 200)
    assert.equal((await n('?limite=201')).status, 422)
    assert.equal((await n('?limite=0')).status, 422)
  } finally { await s.fechar() }
})

test('recém-chegados pelo HTTP: padrão 50, de 1 a 50', async () => {
  const s = await subir({ rajada: { capacidade: 100000, porSegundo: 100000 } })
  try {
    for (let i = 0; i < 52; i++) {
      const r = roverRegistrado(s.m, {})
      s.m.armazem.executar('UPDATE rovers SET criado_em = :c WHERE uid = :u', { c: s.m.relogio.agora - 10, u: r.uid })
    }
    const n = async (q) => (await s.chamar('GET', `/v1/descobrir/recem-chegados${q}`))
    assert.equal((await n('')).json.itens.length, 50)
    assert.equal((await n('?limite=1')).json.itens.length, 1)
    assert.equal((await n('?limite=50')).json.itens.length, 50)
    assert.equal((await n('?limite=51')).status, 422)
    assert.equal((await n('?limite=0')).status, 422)
  } finally { await s.fechar() }
})
