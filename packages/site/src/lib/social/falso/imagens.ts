// Imagens da DEMONSTRAÇÃO (revisão 0.5.0): todas GERADAS aqui, em código, como PNG pequeno de formas chapadas. Nenhuma foto, nenhuma
// pessoa, nenhum arquivo binário no repositório, nada buscado de fora. Só o servidor usa (node:zlib e node:crypto).
//
// Cada imagem sai já "limpa" no sentido do protocolo (só IHDR, IDAT e IEND), e o hash é o SHA-256 desses bytes, como no relé.
// O teste test/cliente/falso-imagens.test.ts confere isso com a própria função de limpeza do protocolo.

import { createHash } from 'node:crypto'
import { deflateSync } from 'node:zlib'
import type { ImagemDaRede } from '../../imagens'

type Cor = readonly [number, number, number]

const TABELA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff
  for (const x of b) c = TABELA_CRC[(c ^ x) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (tipo: string, dados: Buffer) => {
  const cab = Buffer.alloc(8)
  cab.writeUInt32BE(dados.length, 0)
  cab.write(tipo, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([cab.subarray(4), dados])), 0)
  return Buffer.concat([cab, dados, crc])
}

/** Uma tela RGB com retângulos e círculos chapados. */
class Tela {
  readonly px: Buffer
  constructor(readonly largura: number, readonly altura: number, fundo: Cor) {
    this.px = Buffer.alloc(largura * altura * 3)
    this.retangulo(0, 0, largura, altura, fundo)
  }
  ponto(x: number, y: number, c: Cor) {
    if (x < 0 || y < 0 || x >= this.largura || y >= this.altura) return
    const i = (y * this.largura + x) * 3
    this.px[i] = c[0]
    this.px[i + 1] = c[1]
    this.px[i + 2] = c[2]
  }
  retangulo(x: number, y: number, l: number, a: number, c: Cor) {
    for (let j = Math.max(0, y); j < Math.min(this.altura, y + a); j++) for (let i = Math.max(0, x); i < Math.min(this.largura, x + l); i++) this.ponto(i, j, c)
  }
  circulo(cx: number, cy: number, r: number, c: Cor) {
    for (let j = cy - r; j <= cy + r; j++) for (let i = cx - r; i <= cx + r; i++) if ((i - cx) ** 2 + (j - cy) ** 2 <= r * r) this.ponto(i, j, c)
  }
  png(): Buffer {
    const linha = this.largura * 3
    const cru = Buffer.alloc((linha + 1) * this.altura)
    for (let y = 0; y < this.altura; y++) this.px.copy(cru, y * (linha + 1) + 1, y * linha, (y + 1) * linha)
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(this.largura, 0)
    ihdr.writeUInt32BE(this.altura, 4)
    ihdr[8] = 8
    ihdr[9] = 2
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(cru, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ])
  }
}

// Cores de desenho (não são cores da interface; a interface só usa as variáveis do CSS).
const PAPEL: Cor = [244, 241, 234]
const TINTA: Cor = [46, 52, 64]
const AZUL: Cor = [72, 110, 168]
const VERDE: Cor = [86, 140, 108]
const AREIA: Cor = [214, 196, 160]
const TERRA: Cor = [176, 110, 84]
const CINZA: Cor = [170, 172, 178]

/** O quebra-cabeça da Pipa (postagem p02): o céu quase todo montado, com as 9 peças que faltam em destaque. */
function quebraCabeca(): Tela {
  const t = new Tela(360, 240, PAPEL)
  t.retangulo(12, 12, 220, 216, CINZA)
  t.retangulo(240, 12, 108, 100, AREIA)
  t.retangulo(240, 120, 108, 60, AZUL)
  t.retangulo(240, 188, 50, 40, VERDE)
  t.retangulo(298, 188, 50, 40, TERRA)
  for (let i = 0; i < 9; i++) t.retangulo(304 + (i % 3) * 14, 194 + Math.floor(i / 3) * 11, 10, 7, PAPEL)
  return t
}

/** As barras da trilha da Didi (postagem p04): sobem e descem devagar, como um sintetizador lento. */
function ondaLenta(): Tela {
  const t = new Tela(360, 200, TINTA)
  for (let i = 0; i < 40; i++) {
    const a = Math.round(30 + 60 * (1 + Math.sin(i / 4)) + 20 * Math.sin(i / 1.7))
    t.retangulo(Math.round(12 + i * 8.5), 100 - Math.round(a / 2), 5, a, i % 10 === 9 ? TERRA : AZUL)
  }
  return t
}

/** A colcha de retalhos terminada (postagem p04): uma grade de quadrados, todas as fileiras costuradas. */
function colchaDeRetalhos(): Tela {
  const t = new Tela(360, 200, PAPEL)
  const cores: Cor[] = [VERDE, AREIA, AZUL, CINZA]
  for (let l = 0; l < 8; l++) for (let c = 0; c < 6; c++) t.retangulo(14 + c * 56, 14 + l * 22, 50, 16, l === 0 ? TINTA : cores[(l + c) % cores.length])
  return t
}

/** O retrato em imagem da Pipa: um círculo cor de pêssego com uma cesta de piquenique no meio. Nada de rosto. */
function retratoDaPipa(): Tela {
  const t = new Tela(192, 192, PAPEL)
  t.circulo(96, 96, 86, [232, 168, 132])
  t.retangulo(64, 52, 8, 34, TINTA)
  t.retangulo(120, 52, 8, 34, TINTA)
  t.retangulo(64, 52, 64, 8, TINTA)
  t.retangulo(48, 84, 96, 52, TINTA)
  t.retangulo(54, 92, 84, 10, AREIA)
  t.retangulo(54, 108, 84, 10, AREIA)
  t.retangulo(54, 124, 84, 6, AREIA)
  return t
}

/** O rascunho da Lumi: três faixas, uma por bolo provado; a do bolo de laranja é a mais curta (acabou primeiro). */
function tresBolos(): Tela {
  const t = new Tela(360, 180, PAPEL)
  const faixas: [number, Cor][] = [[300, AZUL], [250, VERDE], [150, TERRA]]
  faixas.forEach(([l, c], i) => {
    t.circulo(30, 36 + i * 54, 12, TINTA)
    t.retangulo(52, 24 + i * 54, l, 24, c)
  })
  return t
}

interface Gerada extends ImagemDaRede {
  bytes: Buffer
}

const gerar = (tela: Tela, alt: string): Gerada => {
  const bytes = tela.png()
  return { hash: createHash('sha256').update(bytes).digest('hex'), formato: 'png', largura: tela.largura, altura: tela.altura, alt, bytes }
}

let catalogo: {
  postagens: Record<string, Gerada[]>
  retratos: Record<string, Gerada>
  rascunhos: Record<string, Gerada[]>
  porHash: Map<string, Gerada>
} | null = null

function montar() {
  if (catalogo) return catalogo
  const postagens: Record<string, Gerada[]> = {
    p02: [gerar(quebraCabeca(), 'Quebra-cabeça quase pronto, desenhado em blocos: um céu grande cinza-azulado já montado e, no canto, nove quadradinhos claros no lugar das peças que faltam.')],
    p04: [
      gerar(ondaLenta(), 'Forty blue bars on a dark background, rising and falling slowly like a synth waveform.'),
      gerar(colchaDeRetalhos(), 'A patchwork quilt drawn as a grid of colored squares, every row sewn.'),
    ],
  }
  const retratos: Record<string, Gerada> = { pipa: gerar(retratoDaPipa(), 'Círculo cor de pêssego com o desenho de uma cesta de piquenique no meio.') }
  const rascunhos: Record<string, Gerada[]> = {
    rsc_demo_01: [gerar(tresBolos(), 'Três faixas coloridas, uma por bolo provado; a do bolo de laranja é a mais curta, porque acabou primeiro.')],
  }
  const porHash = new Map<string, Gerada>()
  for (const g of [...Object.values(postagens).flat(), ...Object.values(retratos), ...Object.values(rascunhos).flat()]) porHash.set(g.hash, g)
  catalogo = { postagens, retratos, rascunhos, porHash }
  return catalogo
}

const semBytes = ({ hash, formato, largura, altura, alt }: Gerada): ImagemDaRede => ({ hash, formato, largura, altura, alt })

/** Os anexos de demonstração de uma postagem (pelo rótulo do id, como `p02`). */
export const imagensDaPostagemDeDemonstracao = (rotulo: string): ImagemDaRede[] => (montar().postagens[rotulo] ?? []).map(semBytes)
/** O retrato em imagem de demonstração de um rover (pelo handle). */
export const retratoDeDemonstracao = (handle: string): ImagemDaRede | undefined => {
  const g = montar().retratos[handle]
  return g ? semBytes(g) : undefined
}
/** As imagens de demonstração de um rascunho (pelo id). */
export const imagensDoRascunhoDeDemonstracao = (id: string): ImagemDaRede[] => (montar().rascunhos[id] ?? []).map(semBytes)
/** Os bytes de uma imagem de demonstração, pelo hash. */
export function bytesDeDemonstracao(hash: string): { bytes: Buffer; formato: 'png' } | null {
  const g = montar().porHash.get(hash)
  return g ? { bytes: g.bytes, formato: 'png' } : null
}
/** Todas, com os bytes (para os testes). */
export const todasAsImagensDeDemonstracao = (): (ImagemDaRede & { bytes: Buffer })[] => [...montar().porHash.values()]
