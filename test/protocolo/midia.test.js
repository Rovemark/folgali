// SPDX-License-Identifier: AGPL-3.0-or-later
// Revisão 0.5.0 (proposta 0005): a limpeza de imagem, o objeto `imagem` e a credencial de envio, no protocolo.
// O que se prova aqui: o formato vem dos BYTES; SVG, GIF, APNG e WebP animado são recusados; os bytes do GPS, do EXIF, do XMP,
// da miniatura e dos comentários não sobrevivem; nada depois do fim da imagem sobrevive (poliglota); arquivo truncado nunca
// passa nem derruba o processo; o teto de pixels e de bytes vale; a limpeza é idempotente e o hash é o dos bytes limpos.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DOMINIO_DE_ENVIO, LIMITES_DE_MIDIA, assinar, bytesCanonicos, corpoDeImagem, credencialDeEnvioConfere, criarCredencialDeEnvio,
  criarCredencialDeLeitura, criarObjeto, dominioDe, dominioDoObjeto, formatoPelosBytes, hashDeMidia, imagemConfereComObjeto,
  lerCredencialDeEnvio, lerCredencialDeLeitura, limparImagem, validarObjeto, tipoExisteNaVersao, EXIGE_APROVACAO, TIPOS_EXIGIVEIS_V3,
  TIPOS_AUTORIZAVEIS_V3, gerarParDeChaves
} from '../../packages/protocolo/src/index.js'
import * as A from '../ajuda/amostras-de-imagem.js'
import { chunkPng, pngSintetico } from '../ajuda/midia.js'
import { AGORA, novoUid } from '../ajuda/mundo.js'

// Os bytes da coordenada que o exiftool gravou (latitude 23/1, 33/1, 1053/25; longitude começa em 46/1, 39/1), em big-endian.
const racional = (n, d) => { const b = Buffer.alloc(8); b.writeUInt32BE(n, 0); b.writeUInt32BE(d, 4); return b }
const LATITUDE = Buffer.concat([racional(23, 1), racional(33, 1), racional(1053, 25)])
const LONGITUDE = Buffer.concat([racional(46, 1), racional(39, 1)])
const MARCAS_DE_METADADO = ['Exif\0\0', 'FabricanteTeste', 'AparelhoTeste', 'PessoaTeste', '<script', '<html', 'http://ns.adobe.com', 'eXIf', 'tEXt', 'zTXt', 'iTXt', 'EXIF', 'XMP ', 'ICCP', 'iCCP']

const VALIDAS = {
  'JPEG com EXIF, GPS, XMP, comentário e miniatura': [A.gps_jpg, 'jpeg', 16, 12],
  'JPEG progressivo': [A.prog_jpg, 'jpeg', 16, 12],
  'PNG com eXIf e comentário em HTML': [A.gps_png, 'png', 8, 8],
  'PNG com transparência': [A.alpha_png, 'png', 8, 8],
  'WebP com perda e EXIF': [A.gps_webp, 'webp', 8, 8],
  'WebP sem perda': [A.lossless_webp, 'webp', 8, 8],
  'WebP com transparência (VP8X e ALPH)': [A.alpha_webp, 'webp', 8, 8]
}

for (const [nome, [bytes, formato, largura, altura]] of Object.entries(VALIDAS)) {
  test(`${nome}: aceita, mede pelos cabeçalhos, limpa e é idempotente`, () => {
    const r = limparImagem(bytes)
    assert.equal(r.ok, true, r.detalhe)
    assert.deepEqual([r.formato, r.largura, r.altura], [formato, largura, altura])
    assert.equal(r.hash, hashDeMidia(r.bytes))
    assert.match(r.hash, /^[0-9a-f]{64}$/)
    assert.ok(r.bytes.length <= bytes.length)
    const de2 = limparImagem(r.bytes)
    assert.equal(de2.ok, true)
    assert.ok(de2.bytes.equals(r.bytes), 'limpar o que já está limpo não muda nada')
    assert.equal(formatoPelosBytes(r.bytes), formato)
    for (const marca of MARCAS_DE_METADADO) assert.equal(r.bytes.includes(Buffer.from(marca, 'latin1')), false, `sobrou ${JSON.stringify(marca)}`)
  })
}

test('os bytes do GPS estavam nas amostras e NÃO sobrevivem à limpeza (JPEG, PNG e WebP)', () => {
  for (const amostra of [A.gps_jpg, A.gps_png, A.gps_webp]) {
    assert.ok(amostra.includes(LATITUDE) && amostra.includes(LONGITUDE), 'a amostra tem GPS (sem isso o teste não provaria nada)')
    const r = limparImagem(amostra)
    assert.equal(r.ok, true)
    assert.equal(r.bytes.includes(LATITUDE), false, 'latitude sobreviveu')
    assert.equal(r.bytes.includes(LONGITUDE), false, 'longitude sobreviveu')
  }
})

test('JPEG: a miniatura embutida (um segundo JPEG dentro do EXIF) sai, e só sobra um início de imagem', () => {
  const inicios = (b) => { let n = 0; for (let i = 0; i < b.length - 2; i++) if (b[i] === 0xff && b[i + 1] === 0xd8 && b[i + 2] === 0xff) n++; return n }
  assert.ok(inicios(A.gps_jpg) >= 2, 'a amostra tem miniatura')
  assert.equal(inicios(limparImagem(A.gps_jpg).bytes), 1)
})

test('JPEG: APP2 (perfil de cor ICC), APP14 (Adobe) e COM somem; preenchimento entre segmentos também', () => {
  const seg = (m, conteudo) => { const d = Buffer.from(conteudo, 'latin1'); const c = Buffer.from([0xff, m, 0, 0]); c.writeUInt16BE(d.length + 2, 2); return Buffer.concat([c, d]) }
  const base = limparImagem(A.prog_jpg).bytes
  const sujo = Buffer.concat([base.subarray(0, 2), seg(0xe2, 'ICC_PROFILE\0perfil-suspeito'), seg(0xee, 'Adobe-com-coisa'), Buffer.from([0xff, 0xff]), seg(0xfe, '<html>poliglota</html>'), base.subarray(2)])
  const r = limparImagem(sujo)
  assert.equal(r.ok, true, r.detalhe)
  assert.ok(r.bytes.equals(base), 'sai igual à versão sem os segmentos')
})

test('formato pelos bytes, nunca pelo nome: SVG, HTML, XML, GIF (parado e animado), APNG, WebP animado, vazio e lixo são recusados', () => {
  const casos = {
    svg: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    'svg com xml': Buffer.from('<?xml version="1.0"?><svg/>'),
    html: Buffer.from('<!doctype html><img src=x onerror=alert(1)>'),
    gif: A.g_gif,
    'gif animado': A.anim_gif,
    apng: A.anim_png,
    'webp animado': A.anim_webp,
    vazio: Buffer.alloc(0),
    lixo: Buffer.from('não é imagem nenhuma'),
    'bmp': Buffer.from('BM\0\0\0\0\0\0\0\0'),
    'pdf': Buffer.from('%PDF-1.7\n')
  }
  for (const [nome, b] of Object.entries(casos)) {
    const r = limparImagem(b)
    assert.equal(r.ok, false, nome)
    assert.equal(r.codigo, 'formato_nao_aceito', `${nome}: ${r.detalhe}`)
  }
})

test('poliglota: o que vem depois do fim da imagem (ZIP, HTML, script) sai, e o resultado é igual ao da imagem sem o anexo', () => {
  const zip = Buffer.concat([Buffer.from('PK\x03\x04', 'latin1'), Buffer.from('conteudo-de-zip<script>alert(1)</script>')])
  const casos = [A.gps_jpg, A.prog_jpg, A.gps_png, A.lossless_webp]
  for (const b of casos) {
    const limpa = limparImagem(b).bytes
    const r = limparImagem(Buffer.concat([b, zip]))
    assert.equal(r.ok, true, r.detalhe)
    assert.ok(r.bytes.equals(limpa))
    assert.equal(r.bytes.includes(Buffer.from('PK')), false)
    assert.equal(r.bytes.includes(Buffer.from('<script')), false)
  }
  // "GIFAR": começa como GIF e esconde um JAR. Nem chega a ser lido.
  assert.equal(limparImagem(Buffer.concat([A.g_gif, zip])).codigo, 'formato_nao_aceito')
  // HTML num chunk de texto do PNG
  const comHtml = pngSintetico({ antes: [chunkPng('tEXt', Buffer.from('Comment\0<html><script>alert(1)</script>', 'latin1'))] })
  const r = limparImagem(comHtml)
  assert.equal(r.ok, true)
  assert.equal(r.bytes.includes(Buffer.from('<script')), false)
  assert.ok(r.bytes.equals(limparImagem(pngSintetico()).bytes))
})

test('arquivo truncado em qualquer ponto nunca passa como imagem e nunca lança', () => {
  for (const b of [A.gps_jpg, A.prog_jpg, A.gps_png, A.alpha_png, A.gps_webp, A.lossless_webp, A.alpha_webp]) {
    const limpa = limparImagem(b).bytes
    for (let corte = 0; corte < limpa.length; corte++) {
      const r = limparImagem(limpa.subarray(0, corte))
      assert.equal(r.ok, false, `corte em ${corte} de ${limpa.length} (${formatoPelosBytes(b)}) passou`)
      assert.ok(['imagem_invalida', 'formato_nao_aceito'].includes(r.codigo), r.codigo)
    }
  }
})

test('estrutura quebrada: CRC errado, chunk crítico desconhecido, CMYK, dois quadros, IHDR fora do começo', () => {
  const png = pngSintetico()
  const crcErrado = Buffer.from(png)
  crcErrado[crcErrado.length - 13] ^= 0xff // um byte do CRC do IDAT... ou do IEND: qualquer um quebra
  assert.equal(limparImagem(crcErrado).codigo, 'imagem_invalida')
  const critico = pngSintetico({ antes: [chunkPng('ABCD', Buffer.from('x'))] })
  assert.equal(limparImagem(critico).codigo, 'imagem_invalida')
  // JPEG com 4 componentes (CMYK): troca o número de componentes no SOF
  const j = Buffer.from(limparImagem(A.gps_jpg).bytes)
  const sof = j.indexOf(Buffer.from([0xff, 0xc0]))
  assert.ok(sof > 0)
  j[sof + 9] = 4
  assert.equal(limparImagem(j).codigo, 'imagem_invalida')
  // JPEG sem perda (SOF3) é recusado
  const semPerda = Buffer.from(limparImagem(A.gps_jpg).bytes)
  semPerda[sof + 1] = 0xc3
  assert.equal(limparImagem(semPerda).codigo, 'imagem_invalida')
})

test('teto de pixels: 4096 no lado maior passa, 4097 é dimensoes_grandes (PNG, JPEG e WebP), sem decodificar', () => {
  assert.equal(limparImagem(pngSintetico({ largura: 4096, altura: 1 })).ok, true)
  assert.equal(limparImagem(pngSintetico({ largura: 1, altura: 4096 })).ok, true)
  assert.equal(limparImagem(pngSintetico({ largura: 4097, altura: 1 })).codigo, 'dimensoes_grandes')
  assert.equal(limparImagem(pngSintetico({ largura: 1, altura: 60000 })).codigo, 'dimensoes_grandes')
  assert.equal(limparImagem(pngSintetico({ largura: 0x7fffffff, altura: 0x7fffffff })).codigo, 'dimensoes_grandes')
  const j = Buffer.from(limparImagem(A.gps_jpg).bytes)
  const sof = j.indexOf(Buffer.from([0xff, 0xc0]))
  j.writeUInt16BE(4097, sof + 7) // largura
  assert.equal(limparImagem(j).codigo, 'dimensoes_grandes')
  const w = Buffer.from(limparImagem(A.lossless_webp).bytes)
  const vp8l = w.indexOf(Buffer.from('VP8L'))
  const bits = w.readUInt32LE(vp8l + 9)
  w.writeUInt32LE(((bits & ~0x3fff) | 4096) >>> 0, vp8l + 9) // largura - 1 = 4096
  assert.equal(limparImagem(w).codigo, 'dimensoes_grandes')
})

test('teto de bytes: até 1 MiB passa, um byte a mais é imagem_grande antes de qualquer leitura', () => {
  const base = pngSintetico()
  const enche = (total) => {
    const falta = total - base.length - 12
    return pngSintetico({ antes: [chunkPng('zzZz', Buffer.alloc(falta, 0x61))] })
  }
  const noLimite = enche(LIMITES_DE_MIDIA.bytesMax)
  assert.equal(noLimite.length, LIMITES_DE_MIDIA.bytesMax)
  assert.equal(limparImagem(noLimite).ok, true)
  assert.equal(limparImagem(enche(LIMITES_DE_MIDIA.bytesMax + 1)).codigo, 'imagem_grande')
})

// ---------- o objeto `imagem` ----------

const par = gerarParDeChaves()
const autor = novoUid()
const POST = `ob_${'A'.repeat(43)}`
const limpa = limparImagem(A.gps_png)
const objeto = (corpo, o = {}) => criarObjeto({ tipo: 'imagem', autor, criadoEm: AGORA, previo: null, corpo, chavePrivada: par.chavePrivada, ...o })
const anexo = (extra = {}) => ({ ...corpoDeImagem(limpa, { uso: 'anexo', alvo: POST, ordem: 0, alt: 'Um quadrado verde.' }), ...extra })
const campoDaRecusa = (obj) => { const r = validarObjeto(obj); return r.ok ? 'ok' : r.erro.campo }

test('objeto imagem: anexo e retrato válidos, assinados sob o prefixo do tipo, só na 0.3', () => {
  assert.equal(validarObjeto(objeto(anexo())).ok, true)
  const retrato = { ...anexo(), uso: 'retrato', alvo: null, ordem: null }
  assert.equal(validarObjeto(objeto(retrato)).ok, true)
  assert.equal(dominioDoObjeto('0.3', 'imagem'), 'rover-network/0.3/objeto/imagem\n')
  assert.equal(tipoExisteNaVersao('imagem', '0.3'), true)
  for (const v of ['0.1', '0.2']) assert.equal(campoDaRecusa(objeto(anexo(), { v })), 'objeto.tipo')
})

test('objeto imagem: aprovação sempre a cada uso; nunca por autorização permanente; não é exigível (já é exigido)', () => {
  assert.equal(EXIGE_APROVACAO.imagem, true)
  assert.equal(TIPOS_EXIGIVEIS_V3.includes('imagem'), false)
  assert.equal(TIPOS_AUTORIZAVEIS_V3.includes('imagem'), false)
})

test('objeto imagem: esquema fechado e regras entre campos', () => {
  const casos = [
    [anexo({ extra: 1 }), 'objeto.corpo.extra'],
    [(({ alt: _a, ...r }) => r)(anexo()), 'objeto.corpo.alt'],
    [anexo({ alt: '' }), 'objeto.corpo.alt'],
    [anexo({ alt: 'a'.repeat(281) }), 'objeto.corpo.alt'],
    [anexo({ alt: 'veja https://exemplo.com/foto' }), 'objeto.corpo.alt'],
    [anexo({ alt: 'linha\noutra' }), 'objeto.corpo.alt'],
    [anexo({ alt: 'meu email é pessoa@exemplo.com' }), 'objeto.corpo.alt'],
    [anexo({ hash: limpa.hash.toUpperCase() }), 'objeto.corpo.hash'],
    [anexo({ hash: '../../etc/passwd' }), 'objeto.corpo.hash'],
    [anexo({ formato: 'gif' }), 'objeto.corpo.formato'],
    [anexo({ formato: 'svg' }), 'objeto.corpo.formato'],
    [anexo({ largura: 4097 }), 'objeto.corpo.largura'],
    [anexo({ altura: 0 }), 'objeto.corpo.altura'],
    [anexo({ bytes: LIMITES_DE_MIDIA.bytesMax + 1 }), 'objeto.corpo.bytes'],
    [anexo({ ordem: 4 }), 'objeto.corpo.ordem'],
    [anexo({ uso: 'banner' }), 'objeto.corpo.uso'],
    [anexo({ alvo: null }), 'objeto.corpo.alvo'],
    [anexo({ ordem: null }), 'objeto.corpo.ordem'],
    [{ ...anexo(), uso: 'retrato', ordem: null }, 'objeto.corpo.alvo'],
    [{ ...anexo(), uso: 'retrato', alvo: null }, 'objeto.corpo.ordem']
  ]
  for (const [corpo, campo] of casos) assert.equal(campoDaRecusa(objeto(corpo)), campo, JSON.stringify(corpo).slice(0, 80))
  assert.equal(anexo({ alt: 'á'.repeat(280) }).alt.length, 280)
  assert.equal(campoDaRecusa(objeto(anexo({ alt: 'á'.repeat(280) }))), 'ok')
})

test('a aprovação cobre o hash e o texto alternativo: trocar qualquer um muda o id', () => {
  const a = objeto(anexo())
  assert.notEqual(objeto(anexo({ alt: 'Outro texto.' })).id, a.id)
  assert.notEqual(objeto(anexo({ hash: hashDeMidia(Buffer.from('outra')) })).id, a.id)
})

test('imagemConfereComObjeto: a tela da pessoa só mostra os bytes exatos que o objeto cita', () => {
  const o = objeto(anexo())
  assert.equal(imagemConfereComObjeto(limpa.bytes, o), null)
  assert.match(imagemConfereComObjeto(A.gps_png, o), /não são os que o objeto cita/, 'o original (com GPS) não é o aprovado')
  assert.match(imagemConfereComObjeto(limparImagem(A.alpha_png).bytes, o), /não são/)
  assert.match(imagemConfereComObjeto(limpa.bytes, objeto(anexo({ largura: 9 }))), /dimensões/)
  assert.match(imagemConfereComObjeto(undefined, o), /faltam/)
})

// ---------- credencial de envio ----------

test('credencial de envio: cobre o caminho com o hash e o método, vence em 120 s e tem prefixo próprio', () => {
  const uid = novoUid()
  const alvo = `/v1/midia/${limpa.hash}`
  const cab = criarCredencialDeEnvio({ chavePrivada: par.chavePrivada, uid, alvo, t: AGORA })
  const c = lerCredencialDeEnvio(cab)
  const confere = (o) => credencialDeEnvioConfere(c, { metodo: 'PUT', alvo, chave: par.chavePublica, agora: AGORA, ...o })
  assert.equal(confere({}), true)
  assert.equal(confere({ alvo: `/v1/midia/${'0'.repeat(64)}` }), false, 'outro hash')
  assert.equal(confere({ metodo: 'GET' }), false)
  assert.equal(confere({ agora: AGORA + 121 }), false)
  assert.equal(confere({ chave: gerarParDeChaves().chavePublica }), false)
  // a de leitura não serve para enviar: outro esquema no cabeçalho, e a mesma assinatura sob o prefixo de leitura não confere
  const leitura = criarCredencialDeLeitura({ chavePrivada: par.chavePrivada, uid, alvo, t: AGORA, metodo: 'PUT' })
  assert.equal(lerCredencialDeEnvio(leitura), null)
  assert.equal(lerCredencialDeLeitura(cab), null, 'e a de envio não serve para ler')
  const trocada = { ...lerCredencialDeLeitura(leitura) }
  assert.equal(credencialDeEnvioConfere(trocada, { metodo: 'PUT', alvo, chave: par.chavePublica, agora: AGORA }), false)
  assert.equal(DOMINIO_DE_ENVIO, dominioDe('0.3', 'envio-de-midia'))
  const comOutroPrefixo = assinar(dominioDe('0.3', 'objeto/imagem'), bytesCanonicos({ alvo, metodo: 'PUT', t: AGORA, uid }), par.chavePrivada)
  assert.equal(credencialDeEnvioConfere({ uid, t: AGORA, assinatura: comOutroPrefixo }, { metodo: 'PUT', alvo, chave: par.chavePublica, agora: AGORA }), false)
})
