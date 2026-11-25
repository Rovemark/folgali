// SPDX-License-Identifier: AGPL-3.0-or-later
// Revisão 0.5.0 (proposta 0005) pelo HTTP de verdade: as rotas de imagem desligadas (como se não existissem), o envio assinado,
// a leitura com os cabeçalhos de segurança, o teto de bytes antes de ler o corpo, a extensão e o content-type mentirosos e a
// administração.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  LIMITES_DE_MIDIA, corpoDeImagem, criarCredencialDeEnvio, criarCredencialDeLeitura, hashDeMidia, limparImagem
} from '../../packages/protocolo/src/index.js'
import * as A from '../ajuda/amostras-de-imagem.js'
import { chunkPng, pngSintetico } from '../ajuda/midia.js'
import { publicar, roverRegistrado } from '../ajuda/rele-de-teste.js'
import { TOKEN, subir } from '../ajuda/servidor-de-teste.js'

async function comServidor(fn, { ligada = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'rover-midia-http-'))
  const s = await subir({ mundo: ligada ? { midia: { dir } } : {} })
  try { await fn(s) } finally { await s.fechar(); rmSync(dir, { recursive: true, force: true }) }
}

const envioDe = (s, rover, hash, { t = s.m.relogio.agora, caminho = `/v1/midia/${hash}` } = {}) =>
  criarCredencialDeEnvio({ chavePrivada: rover.rede.chavePrivada, uid: rover.uid, alvo: caminho, t })

async function enviar(s, rover, bytes, { hash = limparImagem(bytes).hash ?? '0'.repeat(64), tipo = 'application/octet-stream', cabecalho } = {}) {
  return s.chamar('PUT', `/v1/midia/${hash}`, { bruto: bytes, cabecalhos: { 'content-type': tipo, authorization: cabecalho ?? envioDe(s, rover, hash) } })
}

test('desligado: info sem midia, e PUT e GET em /v1/midia respondem exatamente como um caminho que não existe', () => comServidor(async (s) => {
  const info = await s.chamar('GET', '/v1/info')
  assert.equal(info.json.recursos.includes('midia'), false)
  assert.equal('midia' in info.json, false)
  const r = roverRegistrado(s.m)
  const limpa = limparImagem(A.gps_png)
  const inexistente = await s.chamar('GET', '/v1/qualquer-coisa')
  for (const [metodo, caminho, extra] of [
    ['GET', `/v1/midia/${limpa.hash}`, {}],
    ['PUT', `/v1/midia/${limpa.hash}`, { bruto: limpa.bytes, cabecalhos: { authorization: envioDe(s, r, limpa.hash) } }],
    ['GET', `/v1/admin/midia/${limpa.hash}`, { cabecalhos: { authorization: `Bearer ${TOKEN}` } }],
    ['DELETE', `/v1/admin/midia/${limpa.hash}`, { cabecalhos: { authorization: `Bearer ${TOKEN}` } }]
  ]) {
    const x = await s.chamar(metodo, caminho, extra)
    assert.equal(x.status, 404, `${metodo} ${caminho}`)
    assert.equal(x.texto, inexistente.texto, 'o mesmo corpo de rota inexistente')
  }
}, { ligada: false }))

test('ligado: info anuncia midia com os limites; envio 201, repetido 200 duplicada, e só é servido depois de publicado', () => comServidor(async (s) => {
  const info = await s.chamar('GET', '/v1/info')
  assert.ok(info.json.recursos.includes('midia'))
  assert.deepEqual(info.json.midia, { formatos: ['jpeg', 'png', 'webp'], bytesMax: 1048576, ladoMaxPx: 4096, anexosPorPostagem: 4, altCaracteres: 280, pendenteS: 3600 })
  assert.equal(info.json.versaoDoRascunho, '0.6.0')
  const r = roverRegistrado(s.m)
  const limpa = limparImagem(A.gps_jpg)
  const um = await enviar(s, r, A.gps_jpg)
  assert.equal(um.status, 201)
  assert.deepEqual(um.json, { estado: 'recebida', hash: limpa.hash, formato: 'jpeg', largura: 16, altura: 12, bytes: limpa.bytes.length })
  const dois = await enviar(s, r, A.gps_jpg)
  assert.equal(dois.status, 200)
  assert.equal(dois.json.estado, 'duplicada')
  assert.equal((await s.chamar('GET', `/v1/midia/${limpa.hash}`)).status, 404, 'enviado, ainda não publicado')
  const post = publicar(s.m, r, 'postagem', { texto: 'Com foto.', topicos: [] }).id
  publicar(s.m, r, 'imagem', corpoDeImagem(limpa, { uso: 'anexo', alvo: post, ordem: 0, alt: 'Gradiente azul.' }))
  const res = await fetch(`${s.base}/v1/midia/${limpa.hash}`)
  assert.equal(res.status, 200)
  const bytes = Buffer.from(await res.arrayBuffer())
  assert.ok(bytes.equals(limpa.bytes))
  assert.equal(hashDeMidia(bytes), limpa.hash)
  const h = res.headers
  assert.equal(h.get('content-type'), 'image/jpeg')
  assert.equal(h.get('x-content-type-options'), 'nosniff')
  assert.equal(h.get('content-security-policy'), "default-src 'none'; sandbox")
  assert.equal(h.get('cache-control'), 'public, max-age=31536000, immutable')
  assert.equal(h.get('etag'), `"${limpa.hash}"`)
  assert.equal(h.get('content-disposition'), 'inline')
  assert.equal(h.get('cross-origin-resource-policy'), 'cross-origin')
  // a postagem pelo HTTP traz as imagens
  const detalhe = await s.chamar('GET', `/v1/postagens/${post}`)
  assert.equal(detalhe.json.imagens[0].hash, limpa.hash)
  // o log tem só o padrão da rota, nunca o hash
  assert.ok(s.logs.some((l) => l.rota === '/v1/midia/:hash'))
  assert.equal(JSON.stringify(s.logs).includes(limpa.hash), false)
}))

test('extensão e content-type mentirosos não decidem nada: PNG dito JPEG entra como PNG; GIF dito PNG e SVG dito JPEG são 415', () => comServidor(async (s) => {
  const r = roverRegistrado(s.m)
  const png = await enviar(s, r, A.gps_png, { tipo: 'image/jpeg' })
  assert.equal(png.status, 201)
  assert.equal(png.json.formato, 'png')
  const h = '3'.repeat(64)
  const gif = await enviar(s, r, A.anim_gif, { hash: h, tipo: 'image/png' })
  assert.equal(gif.status, 415)
  assert.equal(gif.json.erro.codigo, 'formato_nao_aceito')
  const svg = await enviar(s, r, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), { hash: h, tipo: 'image/jpeg' })
  assert.equal(svg.json.erro.codigo, 'formato_nao_aceito')
  const truncado = await enviar(s, r, limparImagem(A.gps_png).bytes.subarray(0, 50), { hash: h })
  assert.equal(truncado.json.erro.codigo, 'imagem_invalida')
  const gigante = await enviar(s, r, pngSintetico({ largura: 4097, altura: 4097 }), { hash: h })
  assert.equal(gigante.json.erro.codigo, 'dimensoes_grandes')
  const divergente = await enviar(s, r, A.gps_png, { hash: hashDeMidia(A.gps_png) })
  assert.equal(divergente.status, 422)
  assert.equal(divergente.json.erro.codigo, 'hash_divergente')
}))

/**
 * PUT cru, para mandar mais do que o teto e ler a resposta mesmo com o relé fechando a conexão. Com o tamanho declarado, manda só o
 * começo do corpo (o relé recusa sem ler); sem ele, manda 1 MiB + 1 byte e espera, sem terminar (o relé corta ao passar do teto).
 * Em nenhum dos dois casos o cliente escreve depois de o relé responder, para a resposta não se perder num EPIPE.
 */
function putCru(s, caminho, autorizacao, corpo, { comTamanho = true } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(s.base + caminho)
    const req = request({ hostname: url.hostname, port: url.port, path: caminho, method: 'PUT', agent: false, headers: { authorization: autorizacao, ...(comTamanho ? { 'content-length': corpo.length } : { 'transfer-encoding': 'chunked' }) } }, (res) => {
      let texto = ''
      res.on('data', (p) => { texto += p })
      res.on('end', () => { resolve({ status: res.statusCode, json: JSON.parse(texto), conexao: res.headers.connection }); req.destroy() })
    })
    req.on('error', (e) => { if (!['EPIPE', 'ECONNRESET'].includes(e.code)) reject(e) })
    req.write(comTamanho ? corpo.subarray(0, 65536) : corpo)
  })
}

test('teto de 1 MiB: o tamanho declarado acima do teto é recusado antes de ler, e o corpo sem tamanho é cortado no teto', () => comServidor(async (s) => {
  const r = roverRegistrado(s.m)
  const base = pngSintetico()
  const grande = pngSintetico({ antes: [chunkPng('zzZz', Buffer.alloc(LIMITES_DE_MIDIA.bytesMax - base.length - 12 + 1, 0x61))] })
  assert.equal(grande.length, LIMITES_DE_MIDIA.bytesMax + 1)
  const h = '4'.repeat(64)
  const caminho = `/v1/midia/${h}`
  for (const comTamanho of [true, false]) {
    const x = await putCru(s, caminho, envioDe(s, r, h), grande, { comTamanho })
    assert.equal(x.status, 413, `comTamanho=${comTamanho}`)
    assert.equal(x.json.erro.codigo, 'imagem_grande')
    assert.equal(x.conexao, 'close')
  }
  // exatamente no teto passa
  const noTeto = pngSintetico({ antes: [chunkPng('zzZz', Buffer.alloc(LIMITES_DE_MIDIA.bytesMax - base.length - 12, 0x61))] })
  const ok = await enviar(s, r, noTeto)
  assert.equal(ok.status, 201)
  assert.ok(ok.json.bytes < LIMITES_DE_MIDIA.bytesMax, 'o chunk auxiliar saiu na limpeza')
}))

test('credencial: a de leitura não envia, a de outro hash não envia, a vencida não envia, sem ela não envia', () => comServidor(async (s) => {
  const r = roverRegistrado(s.m)
  const limpa = limparImagem(A.gps_png)
  const caminho = `/v1/midia/${limpa.hash}`
  const casos = {
    leitura: criarCredencialDeLeitura({ chavePrivada: r.rede.chavePrivada, uid: r.uid, alvo: caminho, t: s.m.relogio.agora, metodo: 'PUT' }),
    'outro hash': envioDe(s, r, '5'.repeat(64)),
    vencida: envioDe(s, r, limpa.hash, { t: s.m.relogio.agora - 200 }),
    vazia: ''
  }
  for (const [nome, cabecalho] of Object.entries(casos)) {
    const x = await enviar(s, r, A.gps_png, { cabecalho })
    assert.equal(x.status, 401, nome)
    assert.equal(x.json.erro.codigo, 'envio_nao_autorizado', nome)
  }
  // hash fora do formato: a rota responde como inexistente
  for (const ruim of ['ABC', limpa.hash.toUpperCase(), '..%2F..%2Fetc%2Fpasswd', `${limpa.hash}0`]) {
    const x = await s.chamar('GET', `/v1/midia/${ruim}`)
    assert.equal(x.status, 404, ruim)
  }
}))

test('administração: ver qualquer arquivo e expurgar; sem a credencial, 404', () => comServidor(async (s) => {
  const r = roverRegistrado(s.m)
  const limpa = limparImagem(A.gps_webp)
  await enviar(s, r, A.gps_webp)
  const adm = { authorization: `Bearer ${TOKEN}` }
  assert.equal((await s.chamar('GET', `/v1/admin/midia/${limpa.hash}`)).status, 401)
  const visto = await fetch(`${s.base}/v1/admin/midia/${limpa.hash}`, { headers: adm })
  assert.equal(visto.status, 200)
  assert.equal(visto.headers.get('cache-control'), 'no-store')
  assert.equal(visto.headers.get('content-type'), 'image/webp')
  assert.ok(Buffer.from(await visto.arrayBuffer()).equals(limpa.bytes))
  const x = await s.chamar('DELETE', `/v1/admin/midia/${limpa.hash}`, { corpo: { motivo: 'teste de expurgo' }, cabecalhos: adm })
  assert.equal(x.status, 200)
  assert.deepEqual(x.json, { expurgado: true, objetos: 0 })
  assert.equal((await s.chamar('GET', `/v1/admin/midia/${limpa.hash}`, { cabecalhos: adm })).status, 404)
  const de = await enviar(s, r, A.gps_webp)
  assert.equal(de.status, 410)
  assert.equal(de.json.erro.codigo, 'midia_recusada')
}))
