// SPDX-License-Identifier: AGPL-3.0-or-later
// Revisão 0.5.0 (proposta 0005): imagens. Tudo o que cliente e relé precisam fazer IGUAL mora aqui:
//
//   - `limparImagem(bytes)`: decide o formato pelos BYTES (nunca pela extensão nem pelo content-type), confere a estrutura,
//     tira todo metadado (EXIF, GPS, XMP, ICC, textos, miniaturas) e tudo o que vem depois do fim da imagem, e devolve os
//     bytes limpos. Não decodifica pixels: lê só cabeçalhos e segmentos, com teto de memória igual ao tamanho do arquivo.
//     É determinística e idempotente; o hash do protocolo é o SHA-256 da SAÍDA, então o cliente e o relé chegam ao mesmo.
//   - o corpo do objeto `imagem` (esquema fechado) e as regras entre campos;
//   - a credencial de ENVIO (`Authorization: Rover-Envio ...`), com prefixo de domínio próprio: a credencial de leitura não
//     serve para enviar e a de envio não serve para ler.
//
// O que a limpeza NÃO garante: que os dados comprimidos decodifiquem, nem que não carreguem dado escondido (poliglota dentro
// do fluxo comprimido, esteganografia). Ver PROTOCOLO.md, seção 16.5 e 16.9.
import { createHash } from 'node:crypto'
import { bytesCanonicos } from './canonico.js'
import { assinar, dominioDe, verificarAssinatura } from './chaves.js'
import { falha, inteiro, objetoFechado, ou_nulo, padrao, texto, um_de } from './esquema.js'
import { FORMATOS_DE_IMAGEM, HASH_DE_MIDIA_RE, LIMITES, LIMITES_DE_MIDIA, USOS_DE_IMAGEM } from './limites.js'

// ====================================================================================================
// HASH E FORMATO
// ====================================================================================================

/** SHA-256 em 64 caracteres hexadecimais minúsculos: o endereço da imagem no relé. */
export const hashDeMidia = (bytes) => createHash('sha256').update(bytes).digest('hex')

export const ehHashDeMidia = (s) => typeof s === 'string' && HASH_DE_MIDIA_RE.test(s)

export const TIPO_MIME = Object.freeze({ jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' })

const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * O formato pelos primeiros bytes. Devolve `jpeg`, `png`, `webp` ou null. GIF, SVG, HTML, BMP, HEIC, PDF e o resto: null.
 * @param {Uint8Array} b
 */
export function formatoPelosBytes(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b.length >= 8 && Buffer.from(b.buffer, b.byteOffset, 8).equals(ASSINATURA_PNG)) return 'png'
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp'
  return null
}

const ascii = (b, i, n) => String.fromCharCode(...b.subarray(i, i + n))

// CRC-32 (o do PNG) em JavaScript puro, para a limpeza rodar igual em qualquer lugar.
const TABELA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
export function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// ====================================================================================================
// LIMPEZA
// ====================================================================================================

class Recusa extends Error {
  constructor(codigo, detalhe) {
    super(detalhe)
    this.codigo = codigo
  }
}
const invalida = (detalhe) => new Recusa('imagem_invalida', detalhe)

const conferirDimensoes = (largura, altura) => {
  if (largura < 1 || altura < 1) throw invalida('largura ou altura zero')
  if (largura > LIMITES_DE_MIDIA.ladoMaxPx || altura > LIMITES_DE_MIDIA.ladoMaxPx) {
    throw new Recusa('dimensoes_grandes', `o lado maior passa de ${LIMITES_DE_MIDIA.ladoMaxPx} px`)
  }
}

/**
 * Limpa uma imagem. Nunca lança: devolve o resultado ou o motivo da recusa (um código de erro do protocolo).
 * @param {Uint8Array} entrada
 * @returns {{ ok: true, bytes: Buffer, formato: 'jpeg'|'png'|'webp', largura: number, altura: number, hash: string }
 *         | { ok: false, codigo: 'imagem_grande'|'formato_nao_aceito'|'imagem_invalida'|'dimensoes_grandes', detalhe: string }}
 */
export function limparImagem(entrada) {
  if (!(entrada instanceof Uint8Array)) return { ok: false, codigo: 'imagem_invalida', detalhe: 'não são bytes' }
  const b = Buffer.from(entrada.buffer, entrada.byteOffset, entrada.length)
  if (b.length > LIMITES_DE_MIDIA.bytesMax) return { ok: false, codigo: 'imagem_grande', detalhe: `passa de ${LIMITES_DE_MIDIA.bytesMax} bytes` }
  const formato = formatoPelosBytes(b)
  if (!formato) return { ok: false, codigo: 'formato_nao_aceito', detalhe: 'só JPEG, PNG e WebP, decididos pelos bytes' }
  try {
    const r = formato === 'jpeg' ? limparJpeg(b) : formato === 'png' ? limparPng(b) : limparWebp(b)
    conferirDimensoes(r.largura, r.altura)
    return { ok: true, bytes: r.bytes, formato, largura: r.largura, altura: r.altura, hash: hashDeMidia(r.bytes) }
  } catch (e) {
    if (e instanceof Recusa) return { ok: false, codigo: e.codigo, detalhe: e.message }
    return { ok: false, codigo: 'imagem_invalida', detalhe: 'estrutura ilegível' }
  }
}

// ---------- JPEG ----------

// Ficam: DQT, DHT, DRI, SOF0/1/2 (um só), SOS com os dados comprimidos, EOI. Saem: APP0 a APP15 e COM. O resto é recusado.
const SOF_ACEITOS = new Set([0xc0, 0xc1, 0xc2])
const MANTIDOS_JPEG = new Set([0xdb, 0xc4, 0xdd])
const ehApp = (m) => m >= 0xe0 && m <= 0xef

function limparJpeg(b) {
  const saida = [Buffer.from([0xff, 0xd8])]
  let i = 2
  let sof = null
  let scans = 0
  for (;;) {
    if (i >= b.length) throw invalida('JPEG truncado: falta o fim da imagem')
    if (b[i] !== 0xff) throw invalida('JPEG com byte fora de segmento')
    while (i < b.length && b[i] === 0xff) i++ // preenchimento entre segmentos: sai
    if (i >= b.length) throw invalida('JPEG truncado')
    const m = b[i++]
    if (m === 0xd9) {
      if (!sof || scans === 0) throw invalida('JPEG sem quadro ou sem dados')
      saida.push(Buffer.from([0xff, 0xd9]))
      break // tudo depois do EOI sai (é onde mora o "poliglota" mais comum)
    }
    if (m === 0x00 || m === 0x01 || (m >= 0xd0 && m <= 0xd8)) throw invalida('JPEG com marcador fora de lugar')
    if (i + 2 > b.length) throw invalida('JPEG truncado no tamanho de um segmento')
    const tam = b.readUInt16BE(i)
    if (tam < 2 || i + tam > b.length) throw invalida('JPEG com segmento truncado')
    const segmento = b.subarray(i - 2, i + tam)
    const dados = b.subarray(i + 2, i + tam)
    i += tam
    if (ehApp(m) || m === 0xfe) continue // EXIF, GPS, miniatura, XMP, ICC, Adobe, MPF, comentário: saem
    if (SOF_ACEITOS.has(m)) {
      if (sof) throw invalida('JPEG com mais de um quadro')
      if (dados.length < 6) throw invalida('JPEG com quadro curto')
      const precisao = dados[0]
      const altura = dados.readUInt16BE(1)
      const largura = dados.readUInt16BE(3)
      const comps = dados[5]
      if (precisao !== 8) throw invalida('JPEG que não é de 8 bits')
      if (comps !== 1 && comps !== 3) throw invalida('JPEG CMYK ou com componentes fora do comum')
      if (dados.length !== 6 + 3 * comps) throw invalida('JPEG com quadro de tamanho errado')
      if (altura === 0) throw invalida('JPEG com altura indefinida')
      sof = { largura, altura }
      saida.push(segmento)
      continue
    }
    if (MANTIDOS_JPEG.has(m)) { saida.push(segmento); continue }
    if (m === 0xda) {
      if (!sof) throw invalida('JPEG com dados antes do quadro')
      saida.push(segmento)
      // Dados comprimidos: vão até o próximo marcador que não seja 0xFF00 (byte escapado) nem RSTn.
      const inicio = i
      for (;;) {
        if (i + 1 >= b.length) throw invalida('JPEG truncado nos dados comprimidos')
        if (b[i] === 0xff) {
          const n = b[i + 1]
          if (n === 0x00 || (n >= 0xd0 && n <= 0xd7)) { i += 2; continue }
          break
        }
        i++
      }
      saida.push(b.subarray(inicio, i))
      scans++
      continue
    }
    throw invalida('JPEG com segmento não aceito (sem perda, aritmético, hierárquico ou desconhecido)')
  }
  if (!sof) throw invalida('JPEG sem quadro')
  return { bytes: Buffer.concat(saida), largura: sof.largura, altura: sof.altura }
}

// ---------- PNG ----------

const PROFUNDIDADES_PNG = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }
const ANIMACAO_PNG = new Set(['acTL', 'fcTL', 'fdAT'])

function limparPng(b) {
  const saida = [ASSINATURA_PNG]
  let i = 8
  let ihdr = null
  let plte = false
  let trns = false
  let idat = 0 // 0 = ainda não veio, 1 = vindo, 2 = acabou (veio outro chunk depois)
  let fim = false
  while (!fim) {
    if (i + 12 > b.length) throw invalida('PNG truncado')
    const tam = b.readUInt32BE(i)
    const tipo = ascii(b, i + 4, 4)
    if (tam > b.length - i - 12) throw invalida('PNG com chunk truncado')
    if (!/^[A-Za-z]{4}$/.test(tipo)) throw invalida('PNG com nome de chunk inválido')
    const chunk = b.subarray(i, i + 12 + tam)
    const dados = b.subarray(i + 8, i + 8 + tam)
    if (crc32(b.subarray(i + 4, i + 8 + tam)) !== b.readUInt32BE(i + 8 + tam)) throw invalida('PNG com CRC errado')
    i += 12 + tam
    if (ANIMACAO_PNG.has(tipo)) throw new Recusa('formato_nao_aceito', 'PNG animado (APNG) não é aceito')
    if (!ihdr && tipo !== 'IHDR') throw invalida('PNG que não começa pelo IHDR')
    if (idat === 1 && tipo !== 'IDAT') idat = 2
    switch (tipo) {
      case 'IHDR': {
        if (ihdr || tam !== 13) throw invalida('PNG com IHDR repetido ou de tamanho errado')
        const largura = dados.readUInt32BE(0)
        const altura = dados.readUInt32BE(4)
        const prof = dados[8]
        const cor = dados[9]
        if (!PROFUNDIDADES_PNG[cor]?.includes(prof)) throw invalida('PNG com profundidade e tipo de cor que não combinam')
        if (dados[10] !== 0 || dados[11] !== 0 || dados[12] > 1) throw invalida('PNG com compressão, filtro ou entrelaçamento desconhecido')
        conferirDimensoes(largura, altura)
        ihdr = { largura, altura, cor }
        saida.push(chunk)
        break
      }
      case 'PLTE':
        if (plte || idat || cor0ou4(ihdr) || tam === 0 || tam % 3 !== 0 || tam > 768) throw invalida('PNG com paleta fora de lugar')
        plte = true
        saida.push(chunk)
        break
      case 'tRNS':
        if (trns || idat || (ihdr.cor === 3 && !plte) || ihdr.cor === 4 || ihdr.cor === 6) throw invalida('PNG com transparência fora de lugar')
        trns = true
        saida.push(chunk)
        break
      case 'IDAT':
        if (idat === 2) throw invalida('PNG com dados de imagem separados')
        if (ihdr.cor === 3 && !plte) throw invalida('PNG de paleta sem paleta')
        idat = 1
        saida.push(chunk)
        break
      case 'IEND':
        if (!idat || tam !== 0) throw invalida('PNG sem dados de imagem')
        saida.push(chunk)
        fim = true // tudo depois do IEND sai
        break
      default:
        // Chunk crítico desconhecido (primeira letra maiúscula): não dá para garantir o que ele é. Auxiliar: sai.
        if (tipo.charCodeAt(0) < 0x61) throw invalida('PNG com chunk crítico desconhecido')
    }
  }
  return { bytes: Buffer.concat(saida), largura: ihdr.largura, altura: ihdr.altura }
}
const cor0ou4 = (ihdr) => ihdr.cor === 0 || ihdr.cor === 4

// ---------- WebP ----------

const ANIMACAO_WEBP = new Set(['ANIM', 'ANMF'])
const BIT_ALFA_VP8X = 0x10
const BIT_ANIMACAO_VP8X = 0x02

function dimensoesVp8(dados) {
  if (dados.length < 10) throw invalida('WebP com quadro VP8 curto')
  if ((dados[0] & 1) !== 0) throw invalida('WebP com quadro VP8 que não é chave')
  if (dados[3] !== 0x9d || dados[4] !== 0x01 || dados[5] !== 0x2a) throw invalida('WebP com quadro VP8 sem código de início')
  return { largura: dados.readUInt16LE(6) & 0x3fff, altura: dados.readUInt16LE(8) & 0x3fff }
}

function dimensoesVp8l(dados) {
  if (dados.length < 5 || dados[0] !== 0x2f) throw invalida('WebP sem assinatura VP8L')
  const v = dados.readUInt32LE(1)
  if (v >>> 29 !== 0) throw invalida('WebP VP8L de versão desconhecida')
  return { largura: (v & 0x3fff) + 1, altura: ((v >>> 14) & 0x3fff) + 1 }
}

function limparWebp(b) {
  const tamRiff = b.readUInt32LE(4)
  if (tamRiff < 4 || tamRiff % 2 !== 0 || 8 + tamRiff > b.length) throw invalida('WebP truncado ou com tamanho torto')
  const fimRiff = 8 + tamRiff // o que vem depois sai
  let i = 12
  let vp8x = null
  let alph = null
  let quadro = null
  let dims = null
  while (i < fimRiff) {
    if (i + 8 > fimRiff) throw invalida('WebP com chunk truncado')
    const tipo = ascii(b, i, 4)
    const tam = b.readUInt32LE(i + 4)
    const comPad = tam + (tam & 1)
    if (tam > fimRiff - i - 8 || i + 8 + comPad > fimRiff) throw invalida('WebP com chunk truncado')
    const dados = b.subarray(i + 8, i + 8 + tam)
    const primeiro = i === 12
    i += 8 + comPad
    if (ANIMACAO_WEBP.has(tipo)) throw new Recusa('formato_nao_aceito', 'WebP animado não é aceito')
    switch (tipo) {
      case 'VP8X': {
        if (!primeiro || tam !== 10) throw invalida('WebP com VP8X fora de lugar')
        if (dados[0] & BIT_ANIMACAO_VP8X) throw new Recusa('formato_nao_aceito', 'WebP animado não é aceito')
        vp8x = { alfa: (dados[0] & BIT_ALFA_VP8X) !== 0, largura: dados.readUIntLE(4, 3) + 1, altura: dados.readUIntLE(7, 3) + 1 }
        break
      }
      case 'ALPH':
        if (!vp8x || alph || quadro) throw invalida('WebP com transparência fora de lugar')
        alph = dados
        break
      case 'VP8 ':
      case 'VP8L':
        if (quadro) throw invalida('WebP com mais de um quadro')
        if (!primeiro && !vp8x) throw invalida('WebP com quadro fora de lugar')
        quadro = { tipo, dados }
        dims = tipo === 'VP8 ' ? dimensoesVp8(dados) : dimensoesVp8l(dados)
        break
      default:
        if (!vp8x && quadro) break // formato simples: o que vier depois do quadro sai
        if (!vp8x) throw invalida('WebP sem quadro no começo')
      // EXIF, XMP, ICCP e desconhecidos: saem
    }
  }
  if (!quadro) throw invalida('WebP sem quadro')
  if (alph && quadro.tipo !== 'VP8 ') throw invalida('WebP com transparência separada num quadro sem perda')
  if (vp8x && (vp8x.largura !== dims.largura || vp8x.altura !== dims.altura)) throw invalida('WebP com tela de tamanho diferente do quadro')
  const chunk = (tipo, dados) => {
    const cab = Buffer.alloc(8)
    cab.write(tipo, 0, 'ascii')
    cab.writeUInt32LE(dados.length, 4)
    return dados.length & 1 ? [cab, dados, Buffer.alloc(1)] : [cab, dados]
  }
  const partes = []
  if (vp8x) {
    const x = Buffer.alloc(10)
    x[0] = vp8x.alfa ? BIT_ALFA_VP8X : 0
    x.writeUIntLE(dims.largura - 1, 4, 3)
    x.writeUIntLE(dims.altura - 1, 7, 3)
    partes.push(...chunk('VP8X', x))
    if (alph) partes.push(...chunk('ALPH', alph))
  }
  partes.push(...chunk(quadro.tipo, quadro.dados))
  const corpo = Buffer.concat(partes)
  const cab = Buffer.alloc(12)
  cab.write('RIFF', 0, 'ascii')
  cab.writeUInt32LE(corpo.length + 4, 4)
  cab.write('WEBP', 8, 'ascii')
  return { bytes: Buffer.concat([cab, corpo]), ...dims }
}

// ====================================================================================================
// OBJETO `imagem`
// ====================================================================================================

const ID_RE = /^ob_[A-Za-z0-9_-]{43}$/

export const CORPO_IMAGEM = objetoFechado({
  uso: um_de(USOS_DE_IMAGEM),
  alvo: ou_nulo(padrao(ID_RE, 'um id de objeto (ob_ e 43 caracteres)')),
  ordem: ou_nulo(inteiro({ min: 0, max: LIMITES_DE_MIDIA.anexosPorPostagem - 1 })),
  hash: padrao(HASH_DE_MIDIA_RE, 'um SHA-256 em 64 caracteres hexadecimais minúsculos'),
  formato: um_de(FORMATOS_DE_IMAGEM),
  largura: inteiro({ min: 1, max: LIMITES_DE_MIDIA.ladoMaxPx }),
  altura: inteiro({ min: 1, max: LIMITES_DE_MIDIA.ladoMaxPx }),
  bytes: inteiro({ min: 1, max: LIMITES_DE_MIDIA.bytesMax }),
  alt: texto({ ...LIMITES_DE_MIDIA.alt, multilinha: false, urls: 0, v3: true })
})

/** Corpos dos tipos de mídia (só existem em `"v": "0.3"`). */
export const CORPOS_DE_MIDIA = Object.freeze({ imagem: CORPO_IMAGEM })

/** Regras entre campos do objeto `imagem`: anexo leva alvo e ordem; retrato não leva nenhum dos dois. */
export function regrasDeMidia({ tipo, corpo }) {
  if (tipo !== 'imagem') return null
  if (corpo.uso === 'anexo') {
    if (corpo.alvo === null) return falha('objeto.corpo.alvo', 'o anexo precisa da postagem')
    if (corpo.ordem === null) return falha('objeto.corpo.ordem', 'o anexo precisa da ordem (0 a 3)')
    return null
  }
  if (corpo.alvo !== null) return falha('objeto.corpo.alvo', 'o retrato não aponta para objeto')
  if (corpo.ordem !== null) return falha('objeto.corpo.ordem', 'o retrato não tem ordem')
  return null
}

/** O corpo de um objeto `imagem` a partir do resultado da limpeza. */
export const corpoDeImagem = (limpa, { uso, alvo = null, ordem = null, alt }) => ({
  uso, alvo, ordem, hash: limpa.hash, formato: limpa.formato, largura: limpa.largura, altura: limpa.altura, bytes: limpa.bytes.length, alt
})

/**
 * O que o aplicativo da pessoa confere antes de mostrar a tela de aprovação: os bytes que ele vai mostrar são exatamente os que o
 * objeto cita (SHA-256, tamanho e formato), e a limpeza deles não muda nada. Devolve null quando confere, ou o motivo.
 */
export function imagemConfereComObjeto(bytes, objeto) {
  if (objeto?.tipo !== 'imagem') return 'o objeto não é uma imagem'
  const c = objeto.corpo
  if (!(bytes instanceof Uint8Array)) return 'faltam os bytes da imagem'
  if (hashDeMidia(bytes) !== c.hash) return 'os bytes não são os que o objeto cita'
  if (bytes.length !== c.bytes) return 'o tamanho não confere'
  const limpa = limparImagem(bytes)
  if (!limpa.ok || limpa.hash !== c.hash) return 'a imagem não está limpa'
  if (limpa.formato !== c.formato || limpa.largura !== c.largura || limpa.altura !== c.altura) return 'o formato ou as dimensões não conferem'
  return null
}

// ====================================================================================================
// CREDENCIAL DE ENVIO
// ====================================================================================================

/** Prefixo de domínio da credencial de envio. Diferente do de leitura: uma credencial nunca vale pela outra. */
export const DOMINIO_DE_ENVIO = dominioDe('0.3', 'envio-de-midia')

const ENVIO_RE = /^Rover-Envio uid=(rvr_[A-Za-z0-9_-]{22}), t=(\d{10}), a=([A-Za-z0-9_-]{86})$/
const bytesDoEnvio = ({ metodo, alvo, t, uid }) => bytesCanonicos({ alvo, metodo, t, uid })

/** O cabeçalho Authorization de um envio. `alvo` é o caminho `/v1/midia/<hash>` exatamente como será pedido. */
export function criarCredencialDeEnvio({ chavePrivada, uid, alvo, t, metodo = 'PUT' }) {
  return `Rover-Envio uid=${uid}, t=${t}, a=${assinar(DOMINIO_DE_ENVIO, bytesDoEnvio({ metodo, alvo, t, uid }), chavePrivada)}`
}

export function lerCredencialDeEnvio(cabecalho) {
  const m = typeof cabecalho === 'string' ? ENVIO_RE.exec(cabecalho) : null
  return m ? { uid: m[1], t: Number(m[2]), assinatura: m[3] } : null
}

export function credencialDeEnvioConfere(credencial, { metodo, alvo, chave, agora }) {
  if (Math.abs(agora - credencial.t) > LIMITES.leituraToleranciaS) return false
  return verificarAssinatura(DOMINIO_DE_ENVIO, bytesDoEnvio({ metodo, alvo, t: credencial.t, uid: credencial.uid }), credencial.assinatura, chave)
}
