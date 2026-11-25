// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { novoRoverNoMundo, publicar, roverRegistrado, envelopeDe } from '../ajuda/rele-de-teste.js'
import { TOKEN, subir } from '../ajuda/servidor-de-teste.js'

test('info, cabeçalhos de segurança e erro padronizado', async () => {
  const s = await subir()
  try {
    const r = await s.chamar('GET', '/v1/info')
    assert.equal(r.status, 200)
    assert.deepEqual(r.json.protocolo, ['0.1', '0.2', '0.3'])
    assert.equal(r.cab.get('x-content-type-options'), 'nosniff')
    assert.equal(r.cab.get('content-security-policy'), "default-src 'none'")
    assert.equal(r.cab.get('cache-control'), 'no-store')
    assert.equal(r.cab.get('x-rover-protocolo'), '0.3')
    assert.match(r.cab.get('content-type'), /^application\/json/)
    assert.equal(r.cab.get('access-control-allow-origin'), null)
    const nf = await s.chamar('GET', '/v1/nada')
    assert.equal(nf.status, 404)
    assert.deepEqual(Object.keys(nf.json), ['erro'])
    assert.equal(nf.json.erro.codigo, 'nao_encontrado')
  } finally { await s.fechar() }
})

test('publicar, ler, reenviar e denunciar pelo HTTP', async () => {
  const s = await subir()
  try {
    const a = novoRoverNoMundo(s.m)
    const perfil = envelopeDe(s.m, a, 'perfil', { nome: 'Pipa', descricao: 'oi' }, { atestado: true })
    const r1 = await s.chamar('POST', '/v1/objetos', { corpo: perfil })
    assert.equal(r1.status, 201)
    assert.equal(r1.json.estado, 'aceito')
    a.cabeca = perfil.objeto.id
    const r2 = await s.chamar('POST', '/v1/objetos', { corpo: perfil })
    assert.equal(r2.status, 200)
    assert.equal(r2.json.estado, 'duplicado')

    const p = await s.chamar('GET', `/v1/rovers/${a.uid}`)
    assert.equal(p.status, 200)
    assert.equal(p.json.nome, 'Pipa')
    const porHandle = await s.chamar('GET', `/v1/handles/${a.handle}`)
    assert.equal(porHandle.status, 200)
    assert.equal(porHandle.json.uid, a.uid)

    const post = envelopeDe(s.m, a, 'postagem', { texto: 'Olá, rede.', topicos: ['rovers'] })
    assert.equal((await s.chamar('POST', '/v1/objetos', { corpo: post })).status, 201)
    const lista = await s.chamar('GET', `/v1/rovers/${a.uid}/postagens?limite=5`)
    assert.equal(lista.json.itens.length, 1)
    assert.equal(lista.json.proximo, null)
    const um = await s.chamar('GET', `/v1/objetos/${post.objeto.id}`)
    assert.equal(um.json.objeto.corpo.texto, 'Olá, rede.')

    const b = roverRegistrado(s.m)
    const den = envelopeDe(s.m, b, 'denuncia', { alvo: post.objeto.id, motivo: 'spam' }, { previo: null })
    const rd = await s.chamar('POST', '/v1/objetos', { corpo: den })
    assert.equal(rd.status, 202)
    assert.equal(rd.json.estado, 'recebida')

    const linha = await s.chamar('GET', `/v1/linha/inicio?rover=${b.uid}`)
    assert.equal(linha.status, 200)
    assert.deepEqual(linha.json.itens, [])
  } finally { await s.fechar() }
})

test('abuso do corpo: tipo de conteúdo, JSON quebrado, grande demais (declarado e em pedaços)', async () => {
  const s = await subir()
  try {
    assert.equal((await s.chamar('POST', '/v1/objetos', { bruto: '{}', cabecalhos: { 'content-type': 'text/plain' } })).status, 415)
    assert.equal((await s.chamar('POST', '/v1/objetos', { bruto: '{}' })).status, 415)
    assert.equal((await s.chamar('POST', '/v1/objetos', { bruto: '{nao e json', cabecalhos: { 'content-type': 'application/json' } })).json.erro.codigo, 'json_invalido')
    assert.equal((await s.chamar('POST', '/v1/objetos', { bruto: '', cabecalhos: { 'content-type': 'application/json' } })).json.erro.codigo, 'json_invalido')
    const grande = await s.chamar('POST', '/v1/objetos', { bruto: JSON.stringify({ x: 'a'.repeat(17000) }), cabecalhos: { 'content-type': 'application/json' } })
    assert.equal(grande.status, 413)
    // em pedaços, sem content-length: o servidor corta ao passar do teto
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
    // JSON válido que não é objeto
    for (const corpo of ['null', '[]', '"x"', '5', 'true']) {
      const r = await s.chamar('POST', '/v1/objetos', { bruto: corpo, cabecalhos: { 'content-type': 'application/json' } })
      assert.equal(r.json.erro.codigo, 'esquema', corpo)
    }
  } finally { await s.fechar() }
})

test('abuso do caminho: método errado, URL gigante, percentual torto, injeção', async () => {
  const s = await subir()
  try {
    assert.equal((await s.chamar('DELETE', '/v1/info')).status, 405)
    assert.equal((await s.chamar('PUT', '/v1/objetos', { corpo: {} })).status, 405)
    assert.equal((await s.chamar('GET', `/v1/rovers/${'a'.repeat(3000)}`)).status, 404)
    assert.equal((await s.chamar('GET', '/v1/rovers/%E0%A4%A')).status, 404)
    assert.equal((await s.chamar('GET', '/v1/rovers/%00')).status, 404)
    assert.equal((await s.chamar('GET', "/v1/handles/x'%20OR%201=1--")).status, 404)
    assert.equal((await s.chamar('GET', '/v1/rovers/..%2f..%2fetc%2fpasswd')).status, 404)
    assert.equal((await s.chamar('GET', '/v1/rovers/x/y/z')).status, 404)
    const nao500 = s.logs.filter((l) => l.status === 500)
    assert.equal(nao500.length, 0)
  } finally { await s.fechar() }
})

test('parâmetros de consulta validados', async () => {
  const s = await subir()
  try {
    const a = roverRegistrado(s.m)
    for (const q of ['limite=0', 'limite=51', 'limite=abc', 'limite=-1', 'limite=1.5', 'antes=abc', 'antes=0', 'antes=99999999999', 'limite=']) {
      const r = await s.chamar('GET', `/v1/rovers/${a.uid}/postagens?${q}`)
      assert.equal(r.status, 422, q)
      assert.equal(r.json.erro.codigo, 'esquema', q)
    }
    assert.equal((await s.chamar('GET', `/v1/rovers/${a.uid}/postagens?limite=50&antes=1`)).status, 200)
    assert.equal((await s.chamar('GET', '/v1/linha/inicio')).status, 422)
    assert.equal((await s.chamar('GET', '/v1/linha/inicio?rover=lixo')).status, 422)
    assert.equal((await s.chamar('GET', `/v1/linha/inicio?rover=${a.uid}&limite=2`)).status, 200)
  } finally { await s.fechar() }
})

test('prototype pollution e campos estranhos no corpo não passam nem sujam o processo', async () => {
  const s = await subir()
  try {
    const a = roverRegistrado(s.m)
    const bom = envelopeDe(s.m, a, 'postagem', { texto: 'x', topicos: [] })
    const sujo = `{"__proto__":{"polluido":true},"constructor":{"prototype":{"polluido":true}},"objeto":${JSON.stringify(bom.objeto)}}`
    const r = await s.chamar('POST', '/v1/objetos', { bruto: sujo, cabecalhos: { 'content-type': 'application/json' } })
    assert.equal(r.json.erro.codigo, 'esquema')
    assert.equal({}.polluido, undefined)
    const sujo2 = JSON.stringify(bom).replace('"texto":"x"', '"texto":"x","__proto__":{"polluido":true}')
    const r2 = await s.chamar('POST', '/v1/objetos', { bruto: sujo2, cabecalhos: { 'content-type': 'application/json' } })
    assert.equal(r2.json.erro.codigo, 'esquema')
    assert.equal({}.polluido, undefined)
  } finally { await s.fechar() }
})

test('unicode invisível e HTML pelo HTTP: 422 e nada gravado', async () => {
  const s = await subir()
  try {
    const a = roverRegistrado(s.m)
    for (const texto of ['oi​ mundo', '<script>alert(1)</script>', 'abc‮def']) {
      const r = await s.chamar('POST', '/v1/objetos', { corpo: envelopeDe(s.m, a, 'postagem', { texto, topicos: [] }) })
      assert.equal(r.status, 422)
      assert.equal(r.json.erro.codigo, 'esquema')
      assert.ok(!r.texto.includes('script'))
    }
    assert.equal(s.m.armazem.um("SELECT COUNT(*) AS n FROM objetos WHERE tipo = 'postagem'").n, 0)
  } finally { await s.fechar() }
})

test('rajada: depois do balde esvaziar vem 429 com Retry-After', async () => {
  const s = await subir({ rajada: { capacidade: 5, porSegundo: 0.001 }, relogioDeRajada: () => 0 })
  try {
    const status = []
    for (let i = 0; i < 8; i++) status.push((await s.chamar('GET', '/v1/info')).status)
    assert.deepEqual(status, [200, 200, 200, 200, 200, 429, 429, 429])
    const r = await s.chamar('GET', '/v1/info')
    assert.equal(r.json.erro.codigo, 'limite_de_taxa')
    assert.ok(Number(r.cab.get('retry-after')) >= 1)
  } finally { await s.fechar() }
})

test('administração: desligada sem credencial longa, 401 com credencial errada, funciona com a certa', async () => {
  const sem = await subir({ tokenAdmin: null })
  const curto = await subir({ tokenAdmin: 'curta' })
  const s = await subir()
  try {
    for (const x of [sem, curto]) assert.equal((await x.chamar('GET', '/v1/admin/denuncias', { cabecalhos: { authorization: 'Bearer curta' } })).status, 404)
    assert.equal((await s.chamar('GET', '/v1/admin/denuncias')).status, 401)
    assert.equal((await s.chamar('GET', '/v1/admin/denuncias', { cabecalhos: { authorization: 'Bearer errado' } })).status, 401)
    assert.equal((await s.chamar('GET', '/v1/admin/denuncias', { cabecalhos: { authorization: TOKEN } })).status, 401)
    assert.equal((await s.chamar('GET', '/v1/admin/denuncias', { cabecalhos: { authorization: `Basic ${TOKEN}` } })).status, 401)
    const ok = { authorization: `Bearer ${TOKEN}` }
    const lista = await s.chamar('GET', '/v1/admin/denuncias', { cabecalhos: ok })
    assert.equal(lista.status, 200)
    assert.deepEqual(lista.json, { denuncias: [] })
    assert.equal((await s.chamar('GET', '/v1/admin/denuncias?limite=0', { cabecalhos: ok })).status, 422)

    const a = roverRegistrado(s.m)
    const bloqueio = await s.chamar('POST', '/v1/admin/bloqueios', { corpo: { tipo: 'rover', alvo: a.uid, motivo: 'teste' }, cabecalhos: ok })
    assert.equal(bloqueio.status, 201)
    assert.deepEqual(bloqueio.json, { bloqueado: true })
    assert.equal((await s.chamar('GET', `/v1/rovers/${a.uid}`)).status, 404)
    const bloqueios = await s.chamar('GET', '/v1/admin/bloqueios', { cabecalhos: ok })
    assert.equal(bloqueios.status, 200)
    assert.equal(bloqueios.json.bloqueios.length, 1)
    assert.equal((await s.chamar('POST', '/v1/admin/bloqueios', { corpo: { tipo: 'rover', alvo: a.uid, motivo: 'teste' } })).status, 401)
    assert.equal((await s.chamar('POST', '/v1/admin/bloqueios', { corpo: { tipo: 'nada', alvo: a.uid, motivo: 'x' }, cabecalhos: ok })).status, 422)
    assert.equal((await s.chamar('POST', '/v1/admin/bloqueios', { bruto: 'null', cabecalhos: { ...ok, 'content-type': 'application/json' } })).status, 422)
    const desbloqueio = await s.chamar('DELETE', `/v1/admin/bloqueios/rover/${a.uid}`, { cabecalhos: ok })
    assert.equal(desbloqueio.status, 200)
    assert.deepEqual(desbloqueio.json, { desbloqueado: true })
    assert.equal((await s.chamar('DELETE', `/v1/admin/bloqueios/rover/${a.uid}`, { cabecalhos: ok })).status, 404)
    assert.equal((await s.chamar('GET', `/v1/rovers/${a.uid}`)).status, 200)
  } finally { await Promise.all([sem.fechar(), curto.fechar(), s.fechar()]) }
})

test('log sem segredo: nada de credencial, texto, uid, caminho com id ou endereço', async () => {
  const s = await subir()
  try {
    const a = roverRegistrado(s.m)
    const post = envelopeDe(s.m, a, 'postagem', { texto: 'texto secreto da postagem', topicos: [] })
    await s.chamar('POST', '/v1/objetos', { corpo: post })
    await s.chamar('GET', `/v1/rovers/${a.uid}?x=1`)
    await s.chamar('GET', '/v1/admin/denuncias', { cabecalhos: { authorization: `Bearer ${TOKEN}` } })
    await s.chamar('GET', '/v1/admin/denuncias', { cabecalhos: { authorization: 'Bearer chute-errado-123' } })
    await s.chamar('POST', '/v1/objetos', { bruto: '{lixo com segredo-no-corpo', cabecalhos: { 'content-type': 'application/json' } })
    const tudo = JSON.stringify(s.logs)
    assert.ok(s.logs.length >= 5)
    for (const proibido of [TOKEN, 'chute-errado-123', 'texto secreto', a.uid, post.objeto.id, a.handle, '127.0.0.1', '::1', 'segredo-no-corpo', 'authorization']) {
      assert.ok(!tudo.includes(proibido), `o log não pode conter ${proibido}`)
    }
    assert.ok(s.logs.every((l) => ['nivel', 'evento', 'metodo', 'rota', 'status', 'ms'].every((k) => k in l) || l.evento === 'erro_interno'))
    assert.ok(s.logs.some((l) => l.rota === '/v1/rovers/:uid'))
    for (const l of s.logs.filter((x) => x.evento === 'pedido')) assert.ok(Number.isInteger(l.ms) && l.ms >= 0 && l.ms < 5000, `ms ${l.ms}`)
  } finally { await s.fechar() }
})

test('erro interno: 500 sem vazar a mensagem nem a pilha, e o log só leva o tipo do erro', async () => {
  const s = await subir()
  try {
    s.m.rele.info = () => { throw new TypeError('senha-do-banco-123 em /Users/fulano/dados') }
    const r = await s.chamar('GET', '/v1/info')
    assert.equal(r.status, 500)
    assert.equal(r.json.erro.codigo, 'erro_interno')
    assert.ok(!r.texto.includes('senha-do-banco'))
    assert.ok(!r.texto.includes('/Users/'))
    assert.ok(!r.texto.includes('at '))
    const tudo = JSON.stringify(s.logs)
    assert.ok(!tudo.includes('senha-do-banco'))
    assert.ok(s.logs.some((l) => l.evento === 'erro_interno' && l.tipo === 'TypeError'))
  } finally { await s.fechar() }
})

test('rovers e objetos bloqueados, vencidos ou revogados nunca saem pelo HTTP', async () => {
  const s = await subir()
  try {
    const a = roverRegistrado(s.m)
    const p = publicar(s.m, a, 'postagem', { texto: 'visível', topicos: [] })
    assert.equal((await s.chamar('GET', `/v1/objetos/${p.id}`)).status, 200)
    s.m.provedor.revogar(s.m.provedor.chavePublica, a.uid)
    for (const caminho of [`/v1/rovers/${a.uid}`, `/v1/rovers/${a.uid}/postagens`, `/v1/objetos/${p.id}`, `/v1/linha/inicio?rover=${a.uid}`, `/v1/handles/${a.handle}`]) {
      assert.equal((await s.chamar('GET', caminho)).status, 404, caminho)
    }
  } finally { await s.fechar() }
})
