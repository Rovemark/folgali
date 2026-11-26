// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic videos for the tests of 0.11.0: a valid CONTAINER (boxes, elements, sizes) around invented media data. Nothing here
// decodes: the protocol only reads the structure, and that is what these builders exercise.
import { randomBytes } from 'node:crypto'

// ---------- MP4 ----------

export function box(type, ...parts) {
  const body = Buffer.concat(parts.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(p))))
  const header = Buffer.alloc(8)
  header.writeUInt32BE(body.length + 8, 0)
  header.write(type, 4, 'latin1')
  return Buffer.concat([header, body])
}

const u32 = (...ns) => { const b = Buffer.alloc(4 * ns.length); ns.forEach((n, i) => b.writeUInt32BE(n >>> 0, i * 4)); return b }
const u16 = (...ns) => { const b = Buffer.alloc(2 * ns.length); ns.forEach((n, i) => b.writeUInt16BE(n, i * 2)); return b }
const MATRIX = u32(0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000)
const SIDEWAYS_MATRIX = u32(0, 0x00010000, 0, 0xffff0000, 0, 0, 0, 0, 0x40000000)

function trail({ handler, codec, largura: width = 0, altura: height = 0, datas: dates = 0, sideways = false, extras = [], mediaExtras = [] }) {
  const tkhd = box('tkhd', u32(0x00000003, dates, dates, 1, 0, 3000), Buffer.alloc(8), u16(0, 0, handler === 'soun' ? 0x0100 : 0, 0), sideways ? SIDEWAYS_MATRIX : MATRIX, u32(width << 16, height << 16))
  const mdhd = box('mdhd', u32(0, dates, dates, 1000, 3000), u16(0x55c4, 0))
  const hdlr = box('hdlr', u32(0, 0), Buffer.from(handler, 'latin1'), Buffer.alloc(12), Buffer.from('Handler\0', 'latin1'))
  const sample = box(codec, Buffer.alloc(6), u16(1), Buffer.alloc(16), u16(width, height), Buffer.alloc(50))
  const stsd = box('stsd', u32(0, 1), sample)
  const stbl = box('stbl', stsd, box('stts', u32(0, 0)), box('stsc', u32(0, 0)), box('stsz', u32(0, 0, 0)), box('stco', u32(0, 0)))
  const minf = box('minf', box(handler === 'soun' ? 'smhd' : 'vmhd', u32(0, 0)), stbl)
  return box('trak', tkhd, ...extras, box('mdia', mdhd, hdlr, minf, ...mediaExtras))
}

/**
 * A valid MP4: ftyp, moov (one H.264 video track, one AAC audio track unless `audio: false`) and mdat.
 * `metadados: true` adds what a camera writes: creation dates, a `udta` with a location atom, a `meta` box and a timed-metadata track.
 */
export function syntheticMp4({
  duracaoMs: durationMs = 3000, largura: width = 1280, altura: height = 720, audio = true, videoCodec = 'avc1', audioCodec = 'mp4a', marca: brand = 'isom', metadados: metadata = false,
  sideways = false, semente: seed = 0, dataBytes = 256, fragmentado: fragmented = false, extraTracks = [], depois: after = Buffer.alloc(0), moovFirst = true
} = {}) {
  const dates = metadata ? 3_900_000_000 : 0
  const local = box('udta', box('©xyz', u16(18, 0x15c7), Buffer.from('-23.5505-046.6333/', 'latin1')))
  const mvhd = box('mvhd', u32(0, dates, dates, 1000, durationMs, 0x00010000), u16(0x0100, 0), Buffer.alloc(8), MATRIX, Buffer.alloc(24), u32(4))
  const tracksEl = [
    trail({ handler: 'vide', codec: videoCodec, largura: width, altura: height, datas: dates, sideways, extras: metadata ? [box('udta', Buffer.from('nome da trilha'))] : [] }),
    ...(audio ? [trail({ handler: 'soun', codec: audioCodec, datas: dates })] : []),
    ...(metadata ? [trail({ handler: 'meta', codec: 'mebx', datas: dates })] : []),
    ...extraTracks.map((t) => trail(t))
  ]
  const moov = box('moov', mvhd, ...tracksEl, ...(metadata ? [local, box('meta', u32(0), Buffer.from('com.apple.quicktime.location.ISO6709'))] : []), ...(fragmented ? [box('mvex', box('trex', Buffer.alloc(24)))] : []))
  const ftyp = box('ftyp', Buffer.from(brand, 'latin1'), u32(0x200), Buffer.from(brand === 'isom' ? 'isomiso2avc1mp41' : brand, 'latin1'))
  const mdat = box('mdat', Buffer.alloc(dataBytes, (seed % 255) + 1))
  const top = moovFirst ? [ftyp, moov, mdat] : [ftyp, mdat, moov]
  return Buffer.concat([...top, ...(metadata ? [box('uuid', randomBytes(16), Buffer.from('<x:xmpmeta>gps</x:xmpmeta>'))] : []), after])
}

// ---------- WebM ----------

function vint(n, bytes) {
  const size = bytes ?? (n < 127 ? 1 : n < 16383 ? 2 : n < 2097151 ? 3 : 4)
  const b = Buffer.alloc(size)
  if (size === 8) b.writeBigUInt64BE(BigInt(n))
  else b.writeUIntBE(n, 0, size)
  b[0] |= 0x80 >> (size - 1)
  return b
}

export function el(id, ...parts) {
  const body = Buffer.concat(parts.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(p))))
  const header = Buffer.alloc(id > 0xffffff ? 4 : id > 0xffff ? 3 : id > 0xff ? 2 : 1)
  header.writeUIntBE(id, 0, header.length)
  return Buffer.concat([header, vint(body.length), body])
}

const integer = (n) => { const b = Buffer.alloc(n > 0xffff ? 4 : n > 0xff ? 2 : 1); b.writeUIntBE(n, 0, b.length); return b }
const real = (x) => { const b = Buffer.alloc(8); b.writeDoubleBE(x); return b }

/** A valid WebM: EBML header, Segment with Info, Tracks (VP9 and Opus by default) and one Cluster. */
export function syntheticWebm({
  duracaoMs: durationMs = 3000, largura: width = 1280, altura: height = 720, audio = true, videoCodec = 'V_VP9', audioCodec = 'A_OPUS', metadados: metadata = false, withoutDuration = false,
  documentType = 'webm', semente: seed = 0, dataBytes = 256, subtitleTrack = false, aoVivo: live = false, depois: after = Buffer.alloc(0)
} = {}) {
  const header = el(0x1a45dfa3, el(0x4286, integer(1)), el(0x42f7, integer(1)), el(0x4282, documentType), el(0x4287, integer(4)), el(0x4285, integer(2)))
  const info = el(0x1549a966,
    el(0x2ad7b1, integer(1_000_000)),
    ...(withoutDuration ? [] : [el(0x4489, real(durationMs))]),
    el(0x4d80, 'teste'), el(0x5741, 'teste'),
    ...(metadata ? [el(0x7ba9, 'Férias em casa, rua tal'), el(0x4461, Buffer.alloc(8, 7))] : []))
  const videoTrack = el(0xae, el(0xd7, integer(1)), el(0x73c5, integer(1)), el(0x83, integer(1)), el(0x86, videoCodec), ...(metadata ? [el(0x536e, 'câmera do quarto')] : []), el(0xe0, el(0xb0, integer(width)), el(0xba, integer(height))))
  const audioTrack = el(0xae, el(0xd7, integer(2)), el(0x73c5, integer(2)), el(0x83, integer(2)), el(0x86, audioCodec))
  const caption = el(0xae, el(0xd7, integer(3)), el(0x73c5, integer(3)), el(0x83, integer(0x11)), el(0x86, 'S_TEXT/UTF8'))
  const tracksEl = el(0x1654ae6b, videoTrack, ...(audio ? [audioTrack] : []), ...(subtitleTrack ? [caption] : []))
  const group = el(0x1f43b675, el(0xe7, integer(0)), el(0xa3, Buffer.alloc(dataBytes, (seed % 255) + 1)))
  const marks = el(0x1254c367, el(0x7373, el(0x67c8, el(0x45a3, 'LOCATION'), el(0x4487, '-23.5505-046.6333'))))
  const body = Buffer.concat([info, tracksEl, ...(metadata ? [marks, el(0x1043a770, el(0x45b9, 'capítulo'))] : []), group])
  const segment = live
    ? Buffer.concat([Buffer.from([0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]), body])
    : Buffer.concat([Buffer.from([0x18, 0x53, 0x80, 0x67]), vint(body.length, 8), body])
  return Buffer.concat([header, segment, after])
}
