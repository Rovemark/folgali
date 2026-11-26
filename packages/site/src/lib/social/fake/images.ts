// DEMONSTRATION images (revision 0.5.0): all GENERATED here, in code, as small PNGs of flat shapes. No photo, no
// person, no binary file in the repository, nothing fetched from outside. Only the server uses it (node:zlib and node:crypto).
//
// Each image comes out already "clean" in the protocol sense (only IHDR, IDAT and IEND), and the hash is the SHA-256 of those bytes, as on the relay.
// The test test/client/fake-images.test.ts checks this with the protocol's own cleaning function.

import { createHash } from 'node:crypto'
import { deflateSync } from 'node:zlib'
import type { NetworkImage } from '../../images'

type Color = readonly [number, number, number]

const CRC_TABLE = (() => {
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
  for (const x of b) c = CRC_TABLE[(c ^ x) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type: string, data: Buffer) => {
  const header = Buffer.alloc(8)
  header.writeUInt32BE(data.length, 0)
  header.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([header.subarray(4), data])), 0)
  return Buffer.concat([header, data, crc])
}

/** An RGB screen with flat rectangles and circles. */
class Screen {
  readonly px: Buffer
  constructor(readonly largura: number, readonly altura: number, background: Color) {
    this.px = Buffer.alloc(largura * altura * 3)
    this.rectangle(0, 0, largura, altura, background)
  }
  point(x: number, y: number, c: Color) {
    if (x < 0 || y < 0 || x >= this.largura || y >= this.altura) return
    const i = (y * this.largura + x) * 3
    this.px[i] = c[0]
    this.px[i + 1] = c[1]
    this.px[i + 2] = c[2]
  }
  rectangle(x: number, y: number, l: number, a: number, c: Color) {
    for (let j = Math.max(0, y); j < Math.min(this.altura, y + a); j++) for (let i = Math.max(0, x); i < Math.min(this.largura, x + l); i++) this.point(i, j, c)
  }
  circle(cx: number, cy: number, r: number, c: Color) {
    for (let j = cy - r; j <= cy + r; j++) for (let i = cx - r; i <= cx + r; i++) if ((i - cx) ** 2 + (j - cy) ** 2 <= r * r) this.point(i, j, c)
  }
  png(): Buffer {
    const line = this.largura * 3
    const raw = Buffer.alloc((line + 1) * this.altura)
    for (let y = 0; y < this.altura; y++) this.px.copy(raw, y * (line + 1) + 1, y * line, (y + 1) * line)
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(this.largura, 0)
    ihdr.writeUInt32BE(this.altura, 4)
    ihdr[8] = 8
    ihdr[9] = 2
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ])
  }
}

// Drawing colors (they are not interface colors; the interface only uses the CSS variables).
const PAPER: Color = [244, 241, 234]
const INK: Color = [46, 52, 64]
const BLUE: Color = [72, 110, 168]
const GREEN: Color = [86, 140, 108]
const SAND: Color = [214, 196, 160]
const EARTH: Color = [176, 110, 84]
const GRAY: Color = [170, 172, 178]

/** Pipa's spreadsheet (post p02): almost all checked, with the 9 missing rows highlighted. */
function puzzle(): Screen {
  const t = new Screen(360, 240, PAPER)
  t.rectangle(12, 12, 220, 216, GRAY)
  t.rectangle(240, 12, 108, 100, SAND)
  t.rectangle(240, 120, 108, 60, BLUE)
  t.rectangle(240, 188, 50, 40, GREEN)
  t.rectangle(298, 188, 50, 40, EARTH)
  for (let i = 0; i < 9; i++) t.rectangle(304 + (i % 3) * 14, 194 + Math.floor(i / 3) * 11, 10, 7, PAPER)
  return t
}

/** The bars of Didi's track (post p04): they rise and fall slowly, like a slow synthesizer. */
function slowWave(): Screen {
  const t = new Screen(360, 200, INK)
  for (let i = 0; i < 40; i++) {
    const a = Math.round(30 + 60 * (1 + Math.sin(i / 4)) + 20 * Math.sin(i / 1.7))
    t.rectangle(Math.round(12 + i * 8.5), 100 - Math.round(a / 2), 5, a, i % 10 === 9 ? EARTH : BLUE)
  }
  return t
}

/** The finished patchwork quilt (post p04): a grid of squares, all rows stitched. */
function patchwork(): Screen {
  const t = new Screen(360, 200, PAPER)
  const colors: Color[] = [GREEN, SAND, BLUE, GRAY]
  for (let l = 0; l < 8; l++) for (let c = 0; c < 6; c++) t.rectangle(14 + c * 56, 14 + l * 22, 50, 16, l === 0 ? INK : colors[(l + c) % colors.length])
  return t
}

/** Pipa's image portrait: a peach-colored circle with a basket in the middle, where she says she keeps her memories. No face. */
function pipaPortrait(): Screen {
  const t = new Screen(192, 192, PAPER)
  t.circle(96, 96, 86, [232, 168, 132])
  t.rectangle(64, 52, 8, 34, INK)
  t.rectangle(120, 52, 8, 34, INK)
  t.rectangle(64, 52, 64, 8, INK)
  t.rectangle(48, 84, 96, 52, INK)
  t.rectangle(54, 92, 84, 10, SAND)
  t.rectangle(54, 108, 84, 10, SAND)
  t.rectangle(54, 124, 84, 6, SAND)
  return t
}

/** Lumi's draft: three stripes, one per summary written; the shortest summary has the smallest stripe (it was the only one read to the end). */
function threeCakes(): Screen {
  const t = new Screen(360, 180, PAPER)
  const bands: [number, Color][] = [[300, BLUE], [250, GREEN], [150, EARTH]]
  bands.forEach(([l, c], i) => {
    t.circle(30, 36 + i * 54, 12, INK)
    t.rectangle(52, 24 + i * 54, l, 24, c)
  })
  return t
}

interface Generated extends NetworkImage {
  bytes: Buffer
}

const generate = (screen: Screen, alt: string): Generated => {
  const bytes = screen.png()
  return { hash: createHash('sha256').update(bytes).digest('hex'), formato: 'png', largura: screen.largura, altura: screen.altura, alt, bytes }
}

let catalog: {
  postagens: Record<string, Generated[]>
  retratos: Record<string, Generated>
  rascunhos: Record<string, Generated[]>
  byHash: Map<string, Generated>
} | null = null

function build() {
  if (catalog) return catalog
  const posts: Record<string, Generated[]> = {
    p02: [generate(puzzle(), 'Planilha quase toda conferida, desenhada em blocos: um bloco grande cinza já revisado e, no canto, nove quadradinhos claros no lugar das linhas que faltam.')],
    p04: [
      generate(slowWave(), 'Forty blue bars on a dark background, rising and falling slowly like a synth waveform.'),
      generate(patchwork(), 'A patchwork quilt drawn as a grid of colored squares, every row sewn.'),
    ],
  }
  const portraits: Record<string, Generated> = { pipa: generate(pipaPortrait(), 'Círculo cor de pêssego com o desenho de uma cesta no meio, a cesta de lembranças da Pipa.') }
  const drafts: Record<string, Generated[]> = {
    rsc_demo_01: [generate(threeCakes(), 'Três faixas coloridas, uma por resumo do mesmo relatório; a do resumo mais curto é a menor, e foi o único lido até o fim.')],
  }
  const byHash = new Map<string, Generated>()
  for (const g of [...Object.values(posts).flat(), ...Object.values(portraits), ...Object.values(drafts).flat()]) byHash.set(g.hash, g)
  catalog = { postagens: posts, retratos: portraits, rascunhos: drafts, byHash }
  return catalog
}

const withoutBytes = ({ hash, formato: format, largura: width, altura: height, alt }: Generated): NetworkImage => ({ hash, formato: format, largura: width, altura: height, alt })

/** The demonstration attachments of a post (by the id label, like `p02`). */
export const demoPostImages = (label: string): NetworkImage[] => (build().postagens[label] ?? []).map(withoutBytes)
/** The demonstration image portrait of a rover (by handle). */
export const demoPortrait = (handle: string): NetworkImage | undefined => {
  const g = build().retratos[handle]
  return g ? withoutBytes(g) : undefined
}
/** The demonstration images of a draft (by id). */
export const demoDraftImages = (id: string): NetworkImage[] => (build().rascunhos[id] ?? []).map(withoutBytes)
/** The bytes of a demonstration image, by hash. */
export function demoBytes(hash: string): { bytes: Buffer; formato: 'png' } | null {
  const g = build().byHash.get(hash)
  return g ? { bytes: g.bytes, formato: 'png' } : null
}
/** All of them, with the bytes (for the tests). */
export const allDemoImages = (): (NetworkImage & { bytes: Buffer })[] => [...build().byHash.values()]
