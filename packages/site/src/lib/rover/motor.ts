// Adaptado do motor dos rovers do site do Rover Hangar (código da Rovemark). Desenha o rover de
// pelúcia a partir da ficha e mede cada corpo sozinho pelo canal alfa. A ARTE usada por ele
// (public/marca/pecas) não está licenciada sob a AGPL: ver public/marca/LEIA-ME.md.
//

export const H = 900

export type Ficha = {
  corpo: string
  cor: string
  acessorios?: string[]
  olhos?: string
  boca?: string
  bochechas?: boolean
}

export type Estado = 'parado' | 'acenar' | 'pulinho' | 'falar' | 'pensar' | 'feliz' | 'dormir' | 'trabalhar' | 'correr' | 'voar'

export const CORPOS = ['seixo', 'bolinha', 'gota', 'feijao', 'quadradinho', 'oval', 'pera', 'marshmallow', 'nuvem', 'amendoim', 'sino', 'orelhinhas'] as const
export const NOMES_CORPO: Record<string, string> = { seixo: 'Seixo', bolinha: 'Bolinha', gota: 'Gota', feijao: 'Feijão', quadradinho: 'Quadradinho', oval: 'Oval', pera: 'Pera', marshmallow: 'Marshmallow', nuvem: 'Nuvem', amendoim: 'Amendoim', sino: 'Sino', orelhinhas: 'Orelhinhas' }
export const CORES: Record<string, string> = { marfim: '#f2e8d6', lilás: '#b49cff', rosa: '#ff9fc4', céu: '#86b6ff', menta: '#94dcb6', manga: '#ffcd52', laranja: '#ff9a5c', coral: '#ff7f7f', grafite: '#6b7080', areia: '#d9b98c' }
export const OLHOS = ['conta', 'grandes', 'sonolentos', 'pontinhos', 'ovais', 'brilho'] as const
export const BOCAS = ['sorriso', 'gatinho', 'dentinho', 'aberta', 'pequena', 'lingua'] as const

type Acc = { nome: string; encaixe: 'cabeca' | 'olhos' | 'pescoco' | 'costas' | 'mao'; larg: number; topo?: number; dx?: number; ancora?: 'rosto'; recorte?: boolean }
export const ACESSORIOS: Record<string, Acc> = {
  touca: { nome: 'Touca de aviador', encaixe: 'cabeca', larg: 1.16, topo: -0.14 },
  bone: { nome: 'Boné de piloto', encaixe: 'cabeca', larg: 1.04, topo: -0.2 },
  chapeu: { nome: 'Chapéu de explorador', encaixe: 'cabeca', larg: 1.55, topo: -0.3 },
  fone: { nome: 'Fone de piloto', encaixe: 'cabeca', larg: 1.18, ancora: 'rosto' },
  coroa: { nome: 'Coroa', encaixe: 'cabeca', larg: 0.52, topo: -0.42 },
  broto: { nome: 'Broto', encaixe: 'cabeca', larg: 0.34, topo: -0.62 },
  laco: { nome: 'Laço', encaixe: 'cabeca', larg: 0.46, topo: -0.3, dx: 0.26 },
  oculos: { nome: 'Óculos', encaixe: 'olhos', larg: 1.0 },
  cachecol: { nome: 'Cachecol', encaixe: 'pescoco', larg: 1.1, recorte: true },
  bandana: { nome: 'Bandana', encaixe: 'pescoco', larg: 0.96, recorte: true },
  gravata: { nome: 'Gravata', encaixe: 'pescoco', larg: 0.3 },
  mochila: { nome: 'Mochila', encaixe: 'costas', larg: 1.18 },
  caneca: { nome: 'Caneca', encaixe: 'mao', larg: 0.44 },
}

export const suave = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

const imgs = new Map<string, Promise<HTMLImageElement>>()
export function imagem(src: string) {
  if (!imgs.has(src)) imgs.set(src, new Promise((ok, erro) => { const i = new Image(); i.decoding = 'async'; i.onload = () => ok(i); i.onerror = erro; i.src = src }))
  return imgs.get(src)!
}

export type Medida = ReturnType<typeof medir>

export function medir(img: HTMLImageElement) {
  const W = Math.round((img.width * H) / img.height)
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const c = cv.getContext('2d', { willReadFrequently: true })!; c.drawImage(img, 0, 0, W, H)
  const a = c.getImageData(0, 0, W, H).data
  const cx = W / 2
  const linhas: { runs: number[][]; tronco: number[] | null }[] = []
  for (let y = 0; y < H; y++) {
    const runs: number[][] = []; let ini = -1
    for (let x = 0; x < W; x++) {
      const op = a[(y * W + x) * 4 + 3] > 90
      if (op && ini < 0) ini = x
      if ((!op || x === W - 1) && ini >= 0) { runs.push([ini, op ? x : x - 1]); ini = -1 }
    }
    const grandes = runs.filter((r) => r[1] - r[0] > 6)
    linhas.push({ runs: grandes, tronco: grandes.find((r) => r[0] <= cx && r[1] >= cx) || null })
  }
  const comTronco = linhas.map((l, y) => (l.tronco ? y : -1)).filter((y) => y >= 0)
  const topo = comTronco[0], base = comTronco[comTronco.length - 1]
  const sep: number[] = []
  for (let y = topo; y < base - H * 0.08; y++) {
    const l = linhas[y]; if (!l.tronco) continue
    const t = l.tronco
    if (l.runs.some((r) => r[1] < t[0] - 2) && l.runs.some((r) => r[0] > t[1] + 2)) sep.push(y)
  }
  // blocos de linhas em que o braço está solto do corpo; o braço é o maior bloco, emendado com
  // vizinhos próximos (corpos ondulados, como a nuvem, encostam a mão no meio do caminho)
  const blocos: [number, number][] = []
  for (const y of sep) { const u = blocos[blocos.length - 1]; if (u && y === u[1] + 1) u[1] = y; else blocos.push([y, y]) }
  let melhor = blocos.reduce<[number, number] | null>((m, x) => (!m || x[1] - x[0] > m[1] - m[0] ? x : m), null)
  if (melhor) {
    const ok = (x: [number, number]) => x[1] - x[0] >= 12
    for (const x of blocos) if (ok(x) && x[0] > melhor[1] && x[0] - melhor[1] <= 70) melhor = [melhor[0], x[1]]
    for (const x of [...blocos].reverse()) if (ok(x) && x[1] < melhor[0] && melhor[0] - x[1] <= 70) melhor = [x[0], melhor[1]]
  }
  const axila = melhor ? melhor[0] : Math.round(topo + (base - topo) * 0.45)
  const fimBraco = melhor ? melhor[1] : axila + 80
  const ombroAlt = Math.max(40, (fimBraco - axila) * 0.6)
  const borda = (lado: 0 | 1) => (y: number) => {
    if (y >= axila && linhas[y]?.tronco) return linhas[y].tronco![lado]
    const y1 = axila + 2, y2 = Math.min(fimBraco, axila + 30)
    const a1 = linhas[y1]?.tronco?.[lado] ?? cx * (lado ? 1.5 : 0.5), a2 = linhas[y2]?.tronco?.[lado] ?? a1
    return a1 + ((a2 - a1) * (y - y1)) / Math.max(1, y2 - y1)
  }
  const bordaL = borda(0), bordaR = borda(1)
  const largura = (y: number) => { const t = linhas[Math.round(Math.min(base, Math.max(topo, y)))]?.tronco; return t ? t[1] - t[0] : W * 0.6 }
  let mx = 0, my = 0, n = 0
  for (let y = Math.round(fimBraco - (fimBraco - axila) * 0.35); y <= fimBraco; y++) {
    const l = linhas[y]; if (!l?.tronco) continue
    for (const r of l.runs) if (r[0] > l.tronco[1] + 2) { mx += (r[0] + r[1]) / 2; my += y; n++ }
  }
  const mao = n ? { x: mx / n, y: my / n } : { x: W * 0.9, y: fimBraco }
  const corteL = new Float32Array(H).fill(NaN), corteR = new Float32Array(H).fill(NaN)
  for (let y = axila; y <= fimBraco; y++) {
    const l = linhas[y]; if (!l?.tronco) continue
    const t = l.tronco
    const esq = l.runs.filter((r) => r[1] < t[0] - 2), dir = l.runs.filter((r) => r[0] > t[1] + 2)
    if (esq.length) corteL[y] = (Math.max(...esq.map((r) => r[1])) + t[0]) / 2
    if (dir.length) corteR[y] = (Math.min(...dir.map((r) => r[0])) + t[1]) / 2
  }
  // onde o braço encosta no corpo (sem vão), o corte é interpolado entre as linhas vizinhas com vão
  const preencher = (c: Float32Array, borda: (y: number) => number, lado: number) => {
    let ant = -1
    for (let y = axila; y <= fimBraco; y++) {
      if (Number.isNaN(c[y])) continue
      if (ant >= 0 && y - ant > 1) for (let k = ant + 1; k < y; k++) c[k] = c[ant] + ((c[y] - c[ant]) * (k - ant)) / (y - ant)
      ant = y
    }
    for (let y = 0; y < H; y++) {
      if (y < axila) c[y] = borda(y)
      else if (y > fimBraco) c[y] = y <= fimBraco + 18 ? (Number.isNaN(c[fimBraco]) ? borda(y) + lado * 3 : c[fimBraco]) : borda(Math.min(y, base))
      else if (Number.isNaN(c[y])) c[y] = borda(y) + lado * 3
    }
  }
  preencher(corteL, bordaL, -1); preencher(corteR, bordaR, 1)
  return {
    W, cx, topo, base, axila, fimBraco, ombroAlt, bordaL, bordaR, largura, mao, corteL, corteR,
    rostoY: topo + (axila - topo) * 0.6,
    cabecaY: topo + (axila - topo) * 0.22,
    ombroE: { x: bordaL(axila) + 14, y: axila - ombroAlt * 0.45 },
    ombroD: { x: bordaR(axila) - 14, y: axila - ombroAlt * 0.45 },
    pescocoY: axila - ombroAlt * 0.55,
  }
}

export function tingir(img: HTMLImageElement, W: number, hex: string) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const c = cv.getContext('2d', { willReadFrequently: true })!; c.drawImage(img, 0, 0, W, H)
  const d = c.getImageData(0, 0, W, H), p = d.data
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3]) continue
    const L = (p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114) / 255, k = L / 0.8, realce = Math.max(0, k - 1) * 0.55
    p[i] = Math.min(255, r * Math.min(k, 1) + 255 * realce); p[i + 1] = Math.min(255, g * Math.min(k, 1) + 255 * realce); p[i + 2] = Math.min(255, b * Math.min(k, 1) + 255 * realce)
  }
  c.putImageData(d, 0, 0)
  return cv
}

export type Partes = { tronco: HTMLCanvasElement; bracoE: HTMLCanvasElement; bracoD: HTMLCanvasElement }

function separar(tex: HTMLCanvasElement, m: Medida): Partes {
  const W = m.W, src = tex.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H).data
  const novo = () => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d')!; return [cv, c, c.createImageData(W, H)] as const }
  const [cT, xT, dT] = novo(), [cE, xE, dE] = novo(), [cD, xD, dD] = novo()
  const topoOmbro = m.axila - m.ombroAlt, fim = m.fimBraco + 18
  for (let y = 0; y < H; y++) {
    const ombro = y < m.axila, vert = ombro ? suave(topoOmbro, m.axila - m.ombroAlt * 0.3, y) : 1, noBraco = y >= topoOmbro && y <= fim
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, a = src[i + 3]; if (!a) continue
      let wE = 0, wD = 0, wT = 1
      if (noBraco) {
        if (ombro) {
          // ombro: o tronco fica inteiro até a borda; o braço leva o que está fora dela e se
          // sobrepõe um pouco para dentro, em degradê, cobrindo a emenda quando gira
          const bL = m.corteL[y], bR = m.corteR[y]
          wE = vert * (x <= bL ? 1 : 1 - suave(bL, bL + 16, x))
          wD = vert * (x >= bR ? 1 : 1 - suave(bR, bR - 16, x))
          if (x <= bL || x >= bR) wT = 1 - vert
        } else { wE = x < m.corteL[y] ? 1 : 0; wD = x > m.corteR[y] ? 1 : 0; wT = 1 - wE - wD }
      }
      for (const [d, w] of [[dT, wT], [dE, wE], [dD, wD]] as const) if (w > 0) { d.data[i] = src[i]; d.data[i + 1] = src[i + 1]; d.data[i + 2] = src[i + 2]; d.data[i + 3] = a * w }
    }
  }
  xT.putImageData(dT, 0, 0); xE.putImageData(dE, 0, 0); xD.putImageData(dD, 0, 0)
  return { tronco: cT, bracoE: cE, bracoD: cD }
}

// cache por corpo (medida) e por corpo+cor (camadas): vários rovers iguais custam um só
const medidas = new Map<string, Promise<{ img: HTMLImageElement; m: Medida }>>()
const camadas = new Map<string, Promise<Partes>>()
export function obterCorpo(base: string, corpo: string) {
  if (!medidas.has(corpo)) medidas.set(corpo, imagem(`${base}corpo-${corpo}.webp`).then((img) => ({ img, m: medir(img) })))
  return medidas.get(corpo)!
}
export function obterPartes(base: string, corpo: string, cor: string) {
  const k = `${corpo}|${cor}`
  if (!camadas.has(k)) camadas.set(k, obterCorpo(base, corpo).then(({ img, m }) => separar(tingir(img, m.W, cor), m)))
  return camadas.get(k)!
}

// cachecol e bandana: desenhados no tronco e recortados por ele (passam por trás dos braços)
export async function pescoco(base: string, corpo: string, id: string, m: Medida, img: HTMLImageElement) {
  const a = ACESSORIOS[id], cv = document.createElement('canvas'); cv.width = m.W; cv.height = H
  const c = cv.getContext('2d')!, w = m.largura(m.pescocoY) * a.larg, h = (w * img.height) / img.width, x = m.cx - w / 2, y = m.pescocoY - h * 0.28
  c.save(); c.filter = 'blur(10px)'; c.globalAlpha = 0.35; c.drawImage(img, x, y + 16, w, h); c.restore()
  c.drawImage(img, x, y, w, h)
  const { img: corpoImg } = await obterCorpo(base, corpo)
  c.globalCompositeOperation = 'destination-in'; c.drawImage(corpoImg, 0, 0, m.W, H)
  c.beginPath(); c.moveTo(m.bordaL(m.topo), m.topo)
  for (let yy = m.topo; yy <= m.base; yy += 6) c.lineTo(m.bordaL(yy) + 2, yy)
  for (let yy = m.base; yy >= m.topo; yy -= 6) c.lineTo(m.bordaR(yy) - 2, yy)
  c.closePath(); c.fillStyle = '#000'; c.fill()
  return cv
}

export type Pose = { sx: number; sy: number; ty: number; rot: number; aE: number; aD: number; falar: number; olhar: { x: number; y: number } }

export function pose(e: Estado, t: number): Pose {
  let sx = 1, sy = 1, ty = 0, rot = 0, aE = 0, aD = 0, falar = 0
  let olhar = { x: 0, y: 0 }
  const resp = Math.sin(t * 2.1)
  if (e === 'parado') { sy = 1 + resp * 0.012; sx = 1 - resp * 0.008; rot = Math.sin(t * 0.9) * 1.2; aE = Math.sin(t * 2.1 + 0.6) * 4; aD = -aE }
  else if (e === 'acenar') { sy = 1 + resp * 0.01; rot = -2 + Math.sin(t * 1.4); aE = -6; aD = -62 + Math.sin(t * 9) * 16 }
  else if (e === 'pulinho' || e === 'feliz') {
    const per = e === 'feliz' ? 0.9 : 1.15, f = (t % per) / per, alt = e === 'feliz' ? 30 : 46
    if (f < 0.22) { const a = Math.sin((f / 0.22) * Math.PI / 2); sy = 1 - 0.13 * a; sx = 1 + 0.09 * a }
    else if (f < 0.72) { const a = (f - 0.22) / 0.5; ty = -Math.sin(a * Math.PI) * alt; sy = 1 + 0.07 * Math.sin(a * Math.PI) * (1 - a); sx = 1 - 0.04 * Math.sin(a * Math.PI) }
    else { const s = Math.sin(((f - 0.72) / 0.28) * Math.PI); sy = 1 - 0.1 * s; sx = 1 + 0.07 * s }
    const ar = f > 0.22 && f < 0.72; aE = ar ? 62 : -8; aD = -aE
  } else if (e === 'falar') { sy = 1 + resp * 0.01; rot = Math.sin(t * 1.7) * 2; falar = Math.max(0, Math.sin(t * 13) * 0.5 + Math.sin(t * 7.3) * 0.5); aE = Math.sin(t * 3) * 7; aD = -Math.sin(t * 2.4) * 10 }
  else if (e === 'pensar') { rot = 4 + Math.sin(t * 1.1) * 1.5; sy = 1 + resp * 0.008; olhar = { x: -10, y: -12 }; aE = -4; aD = -34 }
  else if (e === 'dormir') { const r2 = Math.sin(t * 1.2); sy = 1 + r2 * 0.022; sx = 1 - r2 * 0.012; rot = 6; aE = -16; aD = 16 }
  else if (e === 'trabalhar') { sy = 1 + resp * 0.008; rot = -1; olhar = { x: 0, y: 8 }; aE = -28 + Math.abs(Math.sin(t * 14)) * 10; aD = 28 - Math.abs(Math.sin(t * 14 + 1.3)) * 10 }
  else if (e === 'correr') { const f = t * 9; ty = -Math.abs(Math.sin(f)) * 16; rot = 7; sy = 1 + Math.cos(f * 2) * 0.03; sx = 1 - Math.cos(f * 2) * 0.02; aE = 22 + Math.sin(f) * 26; aD = -22 + Math.sin(f) * 26 }
  else if (e === 'voar') { ty = Math.sin(t * 1.6) * 8; rot = Math.sin(t * 1.1) * 4; aE = 70 + Math.sin(t * 6) * 18; aD = -70 - Math.sin(t * 6 + 0.4) * 18 }
  return { sx, sy, ty, rot, aE, aD, falar, olhar }
}

export function rostoSVG(m: Medida, ficha: Ficha, estado: Estado, f: { piscar: number; falar: number; olhar: { x: number; y: number } }, ids: { olho: string; boch: string }) {
  const lw = m.largura(m.rostoY), cx = m.cx, y = m.rostoY
  const dx = lw * 0.2, r = Math.max(14, lw * 0.055), by = y + r * 2.1
  const xs = [cx - dx, cx + dx], tinta = '#1a1a20'
  let o = '', b = ''
  const tipo = ficha.olhos || 'conta'
  if (estado === 'dormir') o = xs.map((x) => `<path d="M${x - r} ${y} Q${x} ${y + r * 0.9} ${x + r} ${y}" stroke="${tinta}" stroke-width="${r * 0.32}" fill="none" stroke-linecap="round"/>`).join('')
  else if (estado === 'feliz') o = xs.map((x) => `<path d="M${x - r} ${y + 4} Q${x} ${y - r * 1.1} ${x + r} ${y + 4}" stroke="${tinta}" stroke-width="${r * 0.34}" fill="none" stroke-linecap="round"/>`).join('')
  else {
    const abre = Math.max(0.08, 1 - f.piscar)
    o = xs.map((x) => {
      const X = x + f.olhar.x, Y = y + f.olhar.y
      if (tipo === 'pontinhos') return `<ellipse cx="${X}" cy="${Y}" rx="${r * 0.45}" ry="${r * 0.55 * abre}" fill="${tinta}"/>`
      if (tipo === 'sonolentos') return `<ellipse cx="${X}" cy="${Y}" rx="${r}" ry="${r * 1.05 * abre}" fill="url(#${ids.olho})"/><path d="M${X - r * 1.15} ${Y - r * 0.15} L${X + r * 1.15} ${Y - r * 0.15} L${X + r * 1.15} ${Y - r * 1.4} L${X - r * 1.15} ${Y - r * 1.4}Z" style="fill:var(--pele)"/><path d="M${X - r * 1.1} ${Y - r * 0.15} Q${X} ${Y + r * 0.1} ${X + r * 1.1} ${Y - r * 0.15}" stroke="${tinta}" stroke-width="${r * 0.18}" fill="none"/>`
      const rx = tipo === 'grandes' ? r * 1.35 : tipo === 'ovais' ? r * 0.8 : r, ry = (tipo === 'grandes' ? r * 1.45 : tipo === 'ovais' ? r * 1.4 : r * 1.12) * abre
      let s = `<ellipse cx="${X}" cy="${Y}" rx="${rx}" ry="${ry}" fill="url(#${ids.olho})"/>`
      if (ry > r * 0.4) {
        s += `<circle cx="${X - rx * 0.32}" cy="${Y - ry * 0.38}" r="${rx * 0.3}" fill="#fff" opacity=".95"/><circle cx="${X + rx * 0.3}" cy="${Y + ry * 0.25}" r="${rx * 0.13}" fill="#fff" opacity=".7"/>`
        if (tipo === 'brilho') s += `<path d="M${X + rx * 0.35} ${Y - ry * 0.55} l${rx * 0.1} ${rx * 0.22} l${rx * 0.22} ${rx * 0.1} l${-rx * 0.22} ${rx * 0.1} l${-rx * 0.1} ${rx * 0.22} l${-rx * 0.1} ${-rx * 0.22} l${-rx * 0.22} ${-rx * 0.1} l${rx * 0.22} ${-rx * 0.1}z" fill="#fff"/>`
      }
      return s
    }).join('')
  }
  const sw = r * 0.3, boca = ficha.boca || 'sorriso', bw = r * 1.15
  if (estado === 'falar' && f.falar > 0.08) b = `<ellipse cx="${cx}" cy="${by + 4}" rx="${bw * 0.7 + f.falar * 6}" ry="${r * 0.25 + f.falar * r * 0.7}" fill="#3a2422"/><ellipse cx="${cx}" cy="${by + 8 + f.falar * 6}" rx="${bw * 0.35}" ry="${r * 0.12 + f.falar * r * 0.25}" fill="#ff8f8f"/>`
  else if (estado === 'dormir') b = `<path d="M${cx - bw * 0.45} ${by} Q${cx} ${by + r * 0.3} ${cx + bw * 0.45} ${by}" stroke="#2a1b18" stroke-width="${sw * 0.8}" fill="none" stroke-linecap="round"/>`
  else if (estado === 'pensar' || estado === 'trabalhar') b = `<path d="M${cx - bw * 0.5} ${by + 4} Q${cx} ${by - 2} ${cx + bw * 0.55} ${by + 2}" stroke="#2a1b18" stroke-width="${sw}" fill="none" stroke-linecap="round"/>`
  else if (boca === 'gatinho') b = `<path d="M${cx - bw} ${by - 2} Q${cx - bw * 0.5} ${by + r * 0.9} ${cx} ${by} Q${cx + bw * 0.5} ${by + r * 0.9} ${cx + bw} ${by - 2}" stroke="#2a1b18" stroke-width="${sw}" fill="none" stroke-linecap="round"/>`
  else if (boca === 'pequena') b = `<ellipse cx="${cx}" cy="${by + 4}" rx="${r * 0.32}" ry="${r * 0.38}" fill="#3a2422"/>`
  else if (boca === 'aberta' || estado === 'feliz' || estado === 'correr' || estado === 'voar') b = `<path d="M${cx - bw} ${by - 4} Q${cx} ${by + r * 1.6} ${cx + bw} ${by - 4}Z" fill="#3a2422"/><ellipse cx="${cx}" cy="${by + r * 0.55}" rx="${bw * 0.45}" ry="${r * 0.25}" fill="#ff8f8f"/>`
  else if (boca === 'dentinho') b = `<path d="M${cx - bw} ${by - 4} Q${cx} ${by + r * 1.2} ${cx + bw} ${by - 4}" stroke="#2a1b18" stroke-width="${sw}" fill="none" stroke-linecap="round"/><rect x="${cx - r * 0.28}" y="${by + r * 0.05}" width="${r * 0.56}" height="${r * 0.42}" rx="${r * 0.1}" fill="#fff" stroke="#2a1b18" stroke-width="${sw * 0.4}"/>`
  else if (boca === 'lingua') b = `<path d="M${cx - bw} ${by - 4} Q${cx} ${by + r * 1.3} ${cx + bw} ${by - 4}" stroke="#2a1b18" stroke-width="${sw}" fill="none" stroke-linecap="round"/><path d="M${cx - r * 0.1} ${by + r * 0.45} q${r * 0.35} ${r * 0.05} ${r * 0.3} ${r * 0.55} q${-r * 0.2} ${r * 0.3} ${-r * 0.45} 0z" fill="#ff7d8e"/>`
  else b = `<path d="M${cx - bw} ${by - 4} Q${cx} ${by + r * 1.1} ${cx + bw} ${by - 4}" stroke="#2a1b18" stroke-width="${sw}" fill="none" stroke-linecap="round"/>`
  const bo = ficha.bochechas === false ? '' : [cx - lw * 0.33, cx + lw * 0.33].map((x) => `<ellipse cx="${x}" cy="${by - r * 0.3}" rx="${r * 1.9}" ry="${r * 1.2}" fill="url(#${ids.boch})"/>`).join('')
  return bo + o + b
}

// relógio único para todos os rovers da página
type Assinante = (agora: number) => void
const assinantes = new Set<Assinante>()
let rodando = false
export function assinar(fn: Assinante) {
  assinantes.add(fn)
  if (!rodando) {
    rodando = true
    const laco = (agora: number) => { assinantes.forEach((f) => f(agora)); if (assinantes.size) requestAnimationFrame(laco); else rodando = false }
    requestAnimationFrame(laco)
  }
  return () => { assinantes.delete(fn) }
}
