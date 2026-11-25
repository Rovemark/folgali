// Filtro de conteúdo invisível. Texto que chega de outro rover (ou que o rover propôs) não pode
// carregar nada que o olho não veja: instruções escondidas em caracteres de etiqueta (U+E0000), setas
// de direção que trocam a ordem do que se lê (U+202E), espaços de largura zero que quebram a busca e a
// denúncia, caracteres de preenchimento que fazem texto vazio parecer cheio.
//
// Regra de bolso: se o caractere não aparece na tela e não muda a forma de uma letra ou de um emoji
// que está ao lado, ele sai. Os dois que mudam (ZWJ entre emojis, FE0F depois de um emoji) ficam só
// nesse contexto. O que sai daqui passa no validador de texto do protocolo 0.1 do relé, que recusa
// qualquer caractere de formato (categoria Cf), de uso privado, não atribuído, e marcas empilhadas.
// Custo conhecido: o ZWNJ do persa também sai, porque o protocolo o recusa.

export type CategoriaInvisivel = 'tag' | 'bidi' | 'largura-zero' | 'controle' | 'variacao' | 'preenchimento' | 'espaco-estranho' | 'marcas-demais'

export interface RelatorioInvisivel {
  texto: string
  removidos: number
  porCategoria: Record<CategoriaInvisivel, number>
  /** Verdadeiro quando saiu algo que só serve para esconder ou enganar (etiquetas, direção, variação suplementar). */
  perigoso: boolean
}

const ZERADO = (): Record<CategoriaInvisivel, number> => ({
  tag: 0,
  bidi: 0,
  'largura-zero': 0,
  controle: 0,
  variacao: 0,
  preenchimento: 0,
  'espaco-estranho': 0,
  'marcas-demais': 0,
})

const PICTO = /\p{Extended_Pictographic}/u
const BASE_KEYCAP = /[0-9#*]/
const CONTINUACAO_DE_EMOJI = /[\ufe0e\ufe0f\u{1f3fb}-\u{1f3ff}]/u
const SEM_LUGAR = /[\p{Cs}\p{Co}\p{Cn}]/u
const FORMATO = /\p{Cf}/u
const MARCA = /\p{M}/u

const LARGURA_ZERO = new Set([0xad, 0x34f, 0x180e, 0x200b, 0x2060, 0x2061, 0x2062, 0x2063, 0x2064, 0xfeff])
const PREENCHIMENTO = new Set([0x115f, 0x1160, 0x2800, 0x3164, 0xffa0, 0xfff9, 0xfffa, 0xfffb, 0xfffc])
const ESPACOS = new Set([0xa0, 0x1680, 0x202f, 0x205f, 0x3000])

function ehBidi(cp: number): boolean {
  return cp === 0x61c || cp === 0x200e || cp === 0x200f || (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069)
}
function ehEspaco(cp: number): boolean {
  return ESPACOS.has(cp) || (cp >= 0x2000 && cp <= 0x200a)
}
function ehControle(cp: number): boolean {
  if (cp === 0x0a || cp === 0x09) return false // (o CR já virou LF antes do laço)
  return cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f)
}

export function filtrarInvisiveis(entrada: string): RelatorioInvisivel {
  const cps = Array.from(entrada.replace(/\r\n?/g, '\n'), (c) => c.codePointAt(0)!)
  const porCategoria = ZERADO()
  let saida = ''
  let anterior = '' // último caractere MANTIDO (para o contexto de FE0F)
  let base = '' // último caractere mantido que não é seletor de variação nem tom de pele (para o contexto de ZWJ)
  let marcasSeguidas = 0
  const marcar = (c: CategoriaInvisivel) => {
    porCategoria[c]++
  }
  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i]
    const ch = String.fromCodePoint(cp)
    const proximo = i + 1 < cps.length ? String.fromCodePoint(cps[i + 1]) : ''
    let manter = true
    let troca: string | null = null

    if (cp >= 0xe0000 && cp <= 0xe007f) {
      manter = false
      marcar('tag')
    } else if (cp >= 0xe0100 && cp <= 0xe01ef) {
      manter = false
      marcar('variacao')
    } else if (ehBidi(cp)) {
      manter = false
      marcar('bidi')
    } else if (cp === 0x200d) {
      if (!(PICTO.test(base) && PICTO.test(proximo))) {
        manter = false
        marcar('largura-zero')
      }
    } else if (cp === 0xfe0e || cp === 0xfe0f) {
      if (!(PICTO.test(anterior) || BASE_KEYCAP.test(anterior))) {
        manter = false
        marcar('variacao')
      }
    } else if (cp >= 0xfe00 && cp <= 0xfe0d) {
      manter = false
      marcar('variacao')
    } else if (LARGURA_ZERO.has(cp)) {
      manter = false
      marcar('largura-zero')
    } else if (PREENCHIMENTO.has(cp)) {
      manter = false
      marcar('preenchimento')
    } else if (ehControle(cp) || SEM_LUGAR.test(ch)) {
      manter = false
      marcar('controle')
    } else if (FORMATO.test(ch)) {
      manter = false
      marcar('largura-zero')
    } else if (MARCA.test(ch) && marcasSeguidas >= 3) {
      manter = false
      marcar('marcas-demais')
    } else if (cp === 0x09 || ehEspaco(cp)) {
      troca = ' '
      marcar('espaco-estranho')
    } else if (cp === 0x2028 || cp === 0x2029) {
      troca = '\n'
      marcar('espaco-estranho')
    }

    if (troca !== null) {
      saida += troca
      anterior = base = troca
      marcasSeguidas = 0
    } else if (manter) {
      saida += ch
      anterior = ch
      if (!CONTINUACAO_DE_EMOJI.test(ch)) base = ch
      marcasSeguidas = MARCA.test(ch) ? marcasSeguidas + 1 : 0
    }
  }
  const removidos = Object.values(porCategoria).reduce((a, b) => a + b, 0)
  return {
    texto: saida,
    removidos,
    porCategoria,
    perigoso: porCategoria.tag + porCategoria.bidi > 0 || porCategoria.variacao > 0,
  }
}
