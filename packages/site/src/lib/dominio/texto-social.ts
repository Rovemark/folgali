// Texto da rede social: menções, tags e links, e o filtro de dado pessoal ampliado do protocolo 0.3
// (seção 2 de docs/API-REDE-SOCIAL.md). Puro e provado por teste e por mutação. O cliente usa isto de
// duas formas: ANTES de propor (para a tela avisar) e para DESENHAR o texto (menção e tag viram link,
// URL vira o domínio por inteiro, nada é buscado nem pré-visualizado). O relé repete todas as regras.

export const MAX_MENCOES = 5
export const MAX_HASHTAGS = 5
export const MAX_LINK = 200

export const ENCURTADORES = ['bit.ly', 't.co', 'tinyurl.com', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 't.ly', 'shorturl.at'] as const
const RASTREADORES = ['fbclid', 'gclid', 'dclid', 'msclkid', 'mc_eid', 'mc_cid', 'igshid', 'yclid', '_hsenc', '_hsmi', 'ref_src', 's_cid', 'wickedid', 'vero_id']

export type CodigoLink = 'link-esquema' | 'link-longo' | 'link-host' | 'link-rastreador' | 'link-invalido'

export interface AchadoDeLink {
  codigo: CodigoLink
  /** o link, encurtado para a tela */
  trecho: string
}

const encurtar = (s: string) => (s.length > 40 ? `${s.slice(0, 37)}...` : s)

// ---- menções --------------------------------------------------------------------------------------

const RE_MENCAO = /(?<![\p{L}\p{N}._@/])@([A-Za-z0-9._]+)/gu

/** Os handles mencionados, em minúsculas, sem repetir, na ordem do texto. Ponto e sublinhado no fim são pontuação. */
export function extrairMencoes(texto: string): string[] {
  const achados: string[] = []
  for (const m of texto.matchAll(RE_MENCAO)) {
    const h = m[1].replace(/[._]+$/, '').toLowerCase()
    if (h.length >= 3 && h.length <= 30 && !achados.includes(h)) achados.push(h)
  }
  return achados
}

/** Quantas menções DISTINTAS o texto tem: o relé conta handles sem repetir (a mesma pessoa citada 6 vezes é 1). */
export function contarMencoes(texto: string): number {
  return extrairMencoes(texto).length
}

// ---- tags --------------------------------------------------------------------------------------------

const RE_TAG = /(?<![\p{L}\p{N}#])#([\p{L}\p{N}_-]+)/gu
const TAG_VALIDA = /^[A-Za-z0-9][A-Za-z0-9-]{1,23}$/
const SO_ASCII_DE_TAG = /^[A-Za-z0-9-]+$/

export interface AchadoDeTags {
  tags: string[]
  /** uma sequência de mais de 24 caracteres é erro de esquema */
  longa: boolean
  total: number
}

/**
 * As tags válidas (minúsculas, sem repetir) e se alguma sequência ASCII passou de 24 caracteres (erro, não é
 * ignorada). A corrida de letras vai até onde o protocolo a corta (letra, número, sublinhado e hífen): `#abc_def`
 * e `#café` são uma sequência inválida inteira, não uma tag `abc`. `total` conta tags DISTINTAS, como o relé.
 */
export function extrairTags(texto: string): AchadoDeTags {
  const tags: string[] = []
  let longa = false
  for (const m of texto.matchAll(RE_TAG)) {
    const corrida = m[1]
    if (TAG_VALIDA.test(corrida)) {
      const t = corrida.toLowerCase()
      if (!tags.includes(t)) tags.push(t)
    } else if (SO_ASCII_DE_TAG.test(corrida) && /^[A-Za-z0-9]/.test(corrida) && corrida.length > 24) longa = true
  }
  return { tags, longa, total: tags.length }
}

// ---- links -------------------------------------------------------------------------------------------

const RE_ESQUEMA_QUALQUER = /([A-Za-z][A-Za-z0-9+.-]*):\/\/[^\s]*/g
// Esquemas sem "//" que executam ou embutem conteúdo (igual ao relé). "Data: hoje" é texto comum: `data:` só vale com cara de MIME.
const RE_ESQUEMA_SEM_BARRAS = /\b(?:javascript|vbscript)\s*:|\bdata:[a-z]+\/[a-z]|\b(?:file|blob):(?:\/|https?)/i

/** Corta pontuação que não pertence ao link: "veja https://x.com/a." */
function limparFim(l: string): string {
  return l.replace(/[.,;:!?)\]}'"]+$/, '')
}

export function extrairLinks(texto: string): string[] {
  return Array.from(texto.matchAll(RE_ESQUEMA_QUALQUER), (m) => limparFim(m[0]))
}

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/
const ROTULO = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/** Confere UM link contra a seção 2.3 (as mesmas conferências do relé). Devolve o motivo ou null. */
export function problemaDoLink(link: string): CodigoLink | null {
  if (!/^https:\/\//.test(link)) return 'link-esquema'
  if (Array.from(link).length > MAX_LINK) return 'link-longo'
  let u: URL
  try {
    u = new URL(link)
  } catch {
    return 'link-invalido'
  }
  if (u.username !== '' || u.password !== '' || u.port !== '') return 'link-host'
  const host = u.hostname.toLowerCase()
  if (IPV4.test(host) || host.includes(':') || host.startsWith('[')) return 'link-host'
  if (host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return 'link-host'
  const rotulos = host.split('.')
  if (rotulos.length < 2 || rotulos.some((r) => !ROTULO.test(r) || r.startsWith('xn--'))) return 'link-host'
  if ((ENCURTADORES as readonly string[]).includes(host.replace(/^www\./, ''))) return 'link-host'
  for (const k of u.searchParams.keys()) {
    const chave = k.toLowerCase()
    if (chave.startsWith('utm_') || RASTREADORES.includes(chave)) return 'link-rastreador'
  }
  return null
}

/** O domínio por inteiro, para mostrar antes de a pessoa sair da rede. */
export function dominioDoLink(link: string): string | null {
  try {
    const u = new URL(link)
    return u.protocol === 'https:' ? u.hostname : null
  } catch {
    return null
  }
}

export function analisarLinks(texto: string, maxLinks: number): { total: number; achados: AchadoDeLink[]; demais: boolean } {
  const achados: AchadoDeLink[] = []
  const links = extrairLinks(texto)
  for (const l of links) {
    const p = problemaDoLink(l)
    if (p) achados.push({ codigo: p, trecho: encurtar(l) })
  }
  // "javascript:", "data:" e afins não têm "//": o relé recusa o esquema igual.
  const solto = RE_ESQUEMA_SEM_BARRAS.exec(texto)
  if (solto) achados.push({ codigo: 'link-esquema', trecho: encurtar(solto[0]) })
  return { total: links.length, achados, demais: links.length > maxLinks }
}

// ---- dado pessoal que o 0.3 acrescenta --------------------------------------------------------------

export type CodigoPessoal03 = 'cep' | 'coordenadas'

const RE_CEP = /(?<![\d-])\d{5}-\d{3}(?![\d-])/
const RE_COORD = /(?<![\d.])-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}(?![\d.])/

export function detectarPessoal03(texto: string): { codigo: CodigoPessoal03; trecho: string }[] {
  const r: { codigo: CodigoPessoal03; trecho: string }[] = []
  const cep = RE_CEP.exec(texto)
  if (cep) r.push({ codigo: 'cep', trecho: cep[0] })
  const c = RE_COORD.exec(texto)
  if (c) r.push({ codigo: 'coordenadas', trecho: encurtar(c[0]) })
  return r
}

// ---- para desenhar -----------------------------------------------------------------------------------

export type Parte = { t: 'texto'; v: string } | { t: 'mencao'; v: string } | { t: 'tag'; v: string } | { t: 'link'; v: string; dominio: string | null; seguro: boolean }

/**
 * Parte o texto para a tela desenhar. Nada vira HTML: a tela recebe partes e escolhe o elemento. O
 * link só é "seguro" (clicável) se passa em todas as regras; o resto aparece como texto simples.
 */
export function partir(texto: string): Parte[] {
  const marcas: { ini: number; fim: number; parte: Parte }[] = []
  for (const m of texto.matchAll(RE_ESQUEMA_QUALQUER)) {
    const l = limparFim(m[0])
    marcas.push({ ini: m.index, fim: m.index + l.length, parte: { t: 'link', v: l, dominio: dominioDoLink(l), seguro: problemaDoLink(l) === null } })
  }
  for (const m of texto.matchAll(RE_MENCAO)) {
    const h = m[1].replace(/[._]+$/, '')
    if (h.length >= 3 && h.length <= 30) marcas.push({ ini: m.index, fim: m.index + 1 + h.length, parte: { t: 'mencao', v: h.toLowerCase() } })
  }
  for (const m of texto.matchAll(RE_TAG)) {
    const c = m[1]
    if (TAG_VALIDA.test(c)) marcas.push({ ini: m.index, fim: m.index + 1 + c.length, parte: { t: 'tag', v: c.toLowerCase() } })
  }
  // os links entram primeiro e menção ou tag que cai dentro de um link (`/#fio`, `?a=(@pipa)`) é pulada pela sobreposição
  marcas.sort((a, b) => a.ini - b.ini)
  const partes: Parte[] = []
  let pos = 0
  for (const x of marcas) {
    if (x.ini < pos) continue
    if (x.ini > pos) partes.push({ t: 'texto', v: texto.slice(pos, x.ini) })
    partes.push(x.parte)
    pos = x.fim
  }
  if (pos < texto.length) partes.push({ t: 'texto', v: texto.slice(pos) })
  return partes
}
