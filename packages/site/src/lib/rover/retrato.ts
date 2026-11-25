// Retrato do rover: o rosto e o que ele veste da cintura para cima, desenhado uma vez em um canvas,
// guardado como imagem e reaproveitado por todas as postagens do mesmo rover. Não anima: serve de
// avatar. O corpo inteiro e animado fica em components/Rover.tsx (usado na ficha do perfil).
//
// A arte (public/marca/pecas) é da Rovemark e não está sob a AGPL.

import { ACESSORIOS, H, imagem, obterCorpo, pescoco, rostoSVG, tingir, type Estado, type Ficha } from './motor'

const BASE = '/marca/pecas/'

export type EstadoRetrato = Extract<Estado, 'parado' | 'feliz' | 'pensar' | 'dormir' | 'falar' | 'trabalhar' | 'acenar'>

const cache = new Map<string, Promise<string>>()

export const chaveDoRetrato = (f: Ficha, estado: string, px: number) =>
  `${f.corpo}|${f.cor}|${(f.acessorios ?? []).join(',')}|${f.olhos ?? ''}|${f.boca ?? ''}|${estado}|${px}`

function svgParaImagem(svg: string): Promise<HTMLImageElement> {
  return new Promise((ok, erro) => {
    const i = new Image()
    i.onload = () => ok(i)
    i.onerror = erro
    i.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

async function desenhar(ficha: Ficha, estado: EstadoRetrato, px: number): Promise<string> {
  const { img, m } = await obterCorpo(BASE, ficha.corpo)
  const W = m.W
  const lienzo = document.createElement('canvas')
  lienzo.width = W
  lienzo.height = H
  const c = lienzo.getContext('2d')!
  c.drawImage(tingir(img, W, ficha.cor), 0, 0)

  const acc = (ficha.acessorios ?? []).filter((id) => ACESSORIOS[id])
  const imgs = await Promise.all(acc.map((id) => imagem(`${BASE}acc-${id}.webp`)))

  // cachecol e bandana: ficam no pescoço, atrás do rosto
  for (const [i, id] of acc.entries()) {
    if (ACESSORIOS[id].encaixe === 'pescoco' && ACESSORIOS[id].recorte) c.drawImage(await pescoco(BASE, ficha.corpo, id, m, imgs[i]), 0, 0)
  }

  // rosto
  const ids = { olho: 'rn-o', boch: 'rn-b' }
  const falar = estado === 'falar' ? 0.55 : 0
  const olhar = estado === 'pensar' ? { x: -8, y: -10 } : estado === 'trabalhar' ? { x: 0, y: 8 } : { x: 0, y: 0 }
  const miolo = rostoSVG(m, ficha, estado, { piscar: 0, falar, olhar }, ids).replace(/var\(--pele\)/g, ficha.cor)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs><radialGradient id="rn-o" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#4a4a52"/><stop offset=".45" stop-color="#151519"/><stop offset="1" stop-color="#050507"/></radialGradient><radialGradient id="rn-b" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ff8c9f" stop-opacity=".55"/><stop offset="1" stop-color="#ff8c9f" stop-opacity="0"/></radialGradient></defs>${miolo}</svg>`
  c.drawImage(await svgParaImagem(svg), 0, 0, W, H)

  // o que se veste na cabeça, nos olhos e no pescoço (gravata)
  c.save()
  c.shadowColor = 'rgba(40,30,20,0.22)'
  c.shadowBlur = 8
  c.shadowOffsetY = 6
  for (const [i, id] of acc.entries()) {
    const a = ACESSORIOS[id]
    const im = imgs[i]
    const asp = im.height / im.width
    let w = 0, left = 0, top = 0
    if (a.encaixe === 'cabeca' && a.ancora === 'rosto') {
      w = m.largura(m.rostoY - (m.rostoY - m.topo) * 0.2) * a.larg
      left = m.cx - w / 2
      top = m.rostoY - w * asp * 0.78
    } else if (a.encaixe === 'cabeca') {
      w = m.largura(m.cabecaY) * a.larg
      left = m.cx - w / 2 + (a.dx || 0) * m.largura(m.cabecaY)
      top = m.topo + (a.topo || 0) * w * asp
      const limite = m.rostoY - Math.max(14, m.largura(m.rostoY) * 0.055) * 1.7
      if (top + w * asp * 0.94 > limite) top = limite - w * asp * 0.94
    } else if (a.encaixe === 'olhos') {
      w = m.largura(m.rostoY) * 0.62 * a.larg
      left = m.cx - w / 2
      top = m.rostoY - (w * asp) / 2
    } else if (a.encaixe === 'pescoco' && !a.recorte) {
      w = m.largura(m.pescocoY) * a.larg
      left = m.cx - w / 2
      top = m.pescocoY - w * asp * 0.1
    } else continue
    c.drawImage(im, left, top, w, w * asp)
  }
  c.restore()

  // recorte quadrado em volta do rosto
  const lado = m.largura(m.rostoY) * 1.62
  const x0 = m.cx - lado / 2
  const y0 = m.rostoY - lado * 0.6
  const alvo = document.createElement('canvas')
  alvo.width = alvo.height = Math.round(px)
  alvo.getContext('2d')!.drawImage(lienzo, x0, y0, lado, lado, 0, 0, alvo.width, alvo.height)
  const blob = await new Promise<Blob>((ok, erro) => alvo.toBlob((b) => (b ? ok(b) : erro(new Error('canvas vazio'))), 'image/webp', 0.92))
  return URL.createObjectURL(blob)
}

export function retrato(ficha: Ficha, estado: EstadoRetrato, px: number): Promise<string> {
  const k = chaveDoRetrato(ficha, estado, px)
  let p = cache.get(k)
  if (!p) {
    p = desenhar(ficha, estado, px)
    cache.set(k, p)
    p.catch(() => cache.delete(k))
  }
  return p
}
