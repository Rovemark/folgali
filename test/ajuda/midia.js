// SPDX-License-Identifier: AGPL-3.0-or-later
// Ajudantes dos testes de imagem (revisão 0.5.0): PNG sintético (estrutura válida, pixels inventados, sem decodificar),
// um mundo com a mídia ligada numa pasta temporária, e os gestos de enviar e publicar.
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { corpoDeImagem, crc32, criarCredencialDeEnvio, limparImagem } from '../../packages/protocolo/src/index.js'
import { novoMundo, publicar, roverRegistrado } from './rele-de-teste.js'

export function chunkPng(tipo, dados = Buffer.alloc(0)) {
  const cab = Buffer.alloc(8)
  cab.writeUInt32BE(dados.length, 0)
  cab.write(tipo, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([cab.subarray(4), dados])), 0)
  return Buffer.concat([cab, dados, crc])
}

/**
 * PNG de cor chapada (RGB de 8 bits). `semente` muda os bytes para cada imagem ser outra; `antes` e `depois` entram como chunks
 * entre o IHDR e o IDAT e depois do IEND (bytes crus), para os testes de metadado e de poliglota.
 */
export function pngSintetico({ largura = 4, altura = 4, semente = 0, antes = [], depois = Buffer.alloc(0) } = {}) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(largura, 0)
  ihdr.writeUInt32BE(altura, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const linha = Buffer.alloc(1 + Math.min(largura, 64) * 3, semente % 256)
  linha[0] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunkPng('IHDR', ihdr),
    ...antes,
    chunkPng('IDAT', deflateSync(Buffer.concat(Array.from({ length: Math.min(altura, 64) }, () => linha)))),
    chunkPng('IEND'),
    depois
  ])
}

/** Um mundo com a mídia ligada numa pasta temporária. Chame `apagar()` no fim. */
export function mundoComMidia(opcoes = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'rover-midia-'))
  const m = novoMundo({ ...opcoes, midia: { dir, ...(opcoes.cotaBytes ? { cotaBytes: opcoes.cotaBytes } : {}) } })
  const arquivos = () => readdirSync(dir, { recursive: true }).filter((f) => /[0-9a-f]{64}$/.test(f))
  return { ...m, dir, arquivos, rover: (o) => roverRegistrado(m, o), apagar: () => rmSync(dir, { recursive: true, force: true }) }
}

/** Envia os bytes como o cliente: limpa, calcula o hash e assina a credencial de envio. Devolve a resposta do relé e a imagem limpa. */
export function enviar(m, rover, bytes, { hash, t = m.relogio.agora } = {}) {
  const limpa = limparImagem(bytes)
  const h = hash ?? (limpa.ok ? limpa.hash : '0'.repeat(64))
  const alvo = `/v1/midia/${h}`
  const cabecalho = criarCredencialDeEnvio({ chavePrivada: rover.rede.chavePrivada, uid: rover.uid, alvo, t })
  const uid = m.rele.midia.prepararEnvio(h, { cabecalho, metodo: 'PUT', alvo })
  return { resposta: m.rele.midia.concluirEnvio(h, uid, bytes), limpa }
}

/** Envia e publica o objeto `imagem` (anexo de `alvo`, ou retrato quando `alvo` é null). */
export function publicarImagem(m, rover, bytes, { alvo = null, ordem = alvo ? 0 : null, alt = 'Um quadrado verde.', corpo = {} } = {}) {
  const { limpa } = enviar(m, rover, bytes)
  return publicar(m, rover, 'imagem', { ...corpoDeImagem(limpa, { uso: alvo ? 'anexo' : 'retrato', alvo, ordem, alt }), ...corpo })
}
