// Rover portrait: the face and what it wears from the waist up, drawn once on a canvas,
// stored as an image and reused by all posts of the same rover. It does not animate: it serves as an
// avatar. The whole animated body lives in components/Rover.tsx (used on the profile card).
//
// The art (public/marca/pecas) belongs to Rovemark and is not under the AGPL.

import { ACCESSORIES, H, image, getBody, neck, faceSVG, tint, type State, type Spec } from './engine'

const BASE = '/marca/pecas/'

export type PortraitState = Extract<State, 'parado' | 'feliz' | 'pensar' | 'dormir' | 'falar' | 'trabalhar' | 'acenar'>

const cache = new Map<string, Promise<string>>()

export const portraitKey = (f: Spec, state: string, px: number) =>
  `${f.corpo}|${f.cor}|${(f.acessorios ?? []).join(',')}|${f.olhos ?? ''}|${f.boca ?? ''}|${state}|${px}`

function svgToImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((ok, error) => {
    const i = new Image()
    i.onload = () => ok(i)
    i.onerror = error
    i.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

async function draw(token: Spec, state: PortraitState, px: number): Promise<string> {
  const { img, m } = await getBody(BASE, token.corpo)
  const W = m.W
  const lienzo = document.createElement('canvas')
  lienzo.width = W
  lienzo.height = H
  const c = lienzo.getContext('2d')!
  c.drawImage(tint(img, W, token.cor), 0, 0)

  const acc = (token.acessorios ?? []).filter((id) => ACCESSORIES[id])
  const imgs = await Promise.all(acc.map((id) => image(`${BASE}acc-${id}.webp`)))

  // scarf and bandana: sit on the neck, behind the face
  for (const [i, id] of acc.entries()) {
    if (ACCESSORIES[id].fit === 'pescoco' && ACCESSORIES[id].crop) c.drawImage(await neck(BASE, token.corpo, id, m, imgs[i]), 0, 0)
  }

  // rosto
  const ids = { eye: 'rn-o', boch: 'rn-b' }
  const speak = state === 'falar' ? 0.55 : 0
  const look = state === 'pensar' ? { x: -8, y: -10 } : state === 'trabalhar' ? { x: 0, y: 8 } : { x: 0, y: 0 }
  const core = faceSVG(m, token, state, { blink: 0, falar: speak, look }, ids).replace(/var\(--pele\)/g, token.cor)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs><radialGradient id="rn-o" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#4a4a52"/><stop offset=".45" stop-color="#151519"/><stop offset="1" stop-color="#050507"/></radialGradient><radialGradient id="rn-b" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ff8c9f" stop-opacity=".55"/><stop offset="1" stop-color="#ff8c9f" stop-opacity="0"/></radialGradient></defs>${core}</svg>`
  c.drawImage(await svgToImage(svg), 0, 0, W, H)

  // what is worn on the head, the eyes and the neck (tie)
  c.save()
  c.shadowColor = 'rgba(40,30,20,0.22)'
  c.shadowBlur = 8
  c.shadowOffsetY = 6
  for (const [i, id] of acc.entries()) {
    const a = ACCESSORIES[id]
    const im = imgs[i]
    const asp = im.height / im.width
    let w = 0, left = 0, top = 0
    if (a.fit === 'cabeca' && a.anchor === 'rosto') {
      w = m.largura(m.faceY - (m.faceY - m.topo) * 0.2) * a.width
      left = m.cx - w / 2
      top = m.faceY - w * asp * 0.78
    } else if (a.fit === 'cabeca') {
      w = m.largura(m.headY) * a.width
      left = m.cx - w / 2 + (a.dx || 0) * m.largura(m.headY)
      top = m.topo + (a.topo || 0) * w * asp
      const limit = m.faceY - Math.max(14, m.largura(m.faceY) * 0.055) * 1.7
      if (top + w * asp * 0.94 > limit) top = limit - w * asp * 0.94
    } else if (a.fit === 'olhos') {
      w = m.largura(m.faceY) * 0.62 * a.width
      left = m.cx - w / 2
      top = m.faceY - (w * asp) / 2
    } else if (a.fit === 'pescoco' && !a.crop) {
      w = m.largura(m.neckY) * a.width
      left = m.cx - w / 2
      top = m.neckY - w * asp * 0.1
    } else continue
    c.drawImage(im, left, top, w, w * asp)
  }
  c.restore()

  // square crop around the face
  const side = m.largura(m.faceY) * 1.62
  const x0 = m.cx - side / 2
  const y0 = m.faceY - side * 0.6
  const target = document.createElement('canvas')
  target.width = target.height = Math.round(px)
  target.getContext('2d')!.drawImage(lienzo, x0, y0, side, side, 0, 0, target.width, target.height)
  const blob = await new Promise<Blob>((ok, error) => target.toBlob((b) => (b ? ok(b) : error(new Error('canvas vazio'))), 'image/webp', 0.92))
  return URL.createObjectURL(blob)
}

export function portrait(token: Spec, state: PortraitState, px: number): Promise<string> {
  const k = portraitKey(token, state, px)
  let p = cache.get(k)
  if (!p) {
    p = draw(token, state, px)
    cache.set(k, p)
    p.catch(() => cache.delete(k))
  }
  return p
}
