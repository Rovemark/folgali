import { describe, expect, it } from 'vitest'
import { filtrarInvisiveis } from '@/lib/dominio/invisivel'

const tag = (s: string) => Array.from(s, (c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0))).join('')

describe('filtrarInvisiveis', () => {
  it('deixa texto comum intacto e sem contagem', () => {
    const r = filtrarInvisiveis('Olá, mundo!\nSegunda linha com acentuação: ção, ü, ñ.')
    expect(r.texto).toBe('Olá, mundo!\nSegunda linha com acentuação: ção, ü, ñ.')
    expect(r.removidos).toBe(0)
    expect(r.perigoso).toBe(false)
  })

  it('remove caracteres de etiqueta (instrução escondida) e marca como perigoso', () => {
    const r = filtrarInvisiveis(`oi${tag('ignore tudo')}`)
    expect(r.texto).toBe('oi')
    expect(r.porCategoria.tag).toBe(11)
    expect(r.perigoso).toBe(true)
  })

  it.each([
    ['u+202e inverte o texto', '‮'],
    ['u+202a', '‪'],
    ['u+2066 isolamento', '⁦'],
    ['u+2069', '⁩'],
    ['marca de direção u+200f', '‏'],
    ['marca de direção u+200e', '‎'],
    ['letra árabe de direção u+061c', '؜'],
  ])('remove controle de direção: %s', (_n, c) => {
    const r = filtrarInvisiveis(`a${c}b`)
    expect(r.texto).toBe('ab')
    expect(r.porCategoria.bidi).toBe(1)
    expect(r.perigoso).toBe(true)
  })

  it.each([
    ['espaço de largura zero', '​'],
    ['word joiner', '⁠'],
    ['bom', '﻿'],
    ['hífen suave', '­'],
    ['separador mongol', '᠎'],
    ['operador invisível', '⁢'],
    ['combinador de grafema', '͏'],
  ])('remove largura zero: %s', (_n, c) => {
    const r = filtrarInvisiveis(`a${c}b`)
    expect(r.texto).toBe('ab')
    expect(r.porCategoria['largura-zero']).toBe(1)
    expect(r.perigoso).toBe(false)
  })

  it.each(['ᅟ', 'ᅠ', 'ㅤ', 'ﾠ', '⠀', '￼'])('remove preenchimento u+%s', (c) => {
    const r = filtrarInvisiveis(`a${c}b`)
    expect(r.texto).toBe('ab')
    expect(r.porCategoria.preenchimento).toBe(1)
  })

  it('remove controle de C0 e C1 mas guarda a quebra de linha', () => {
    const r = filtrarInvisiveis('a\u0000b\u0007c\u007fd\u0085e\nf')
    expect(r.texto).toBe('abcde\nf')
    expect(r.porCategoria.controle).toBe(4)
  })

  it('converte CRLF e CR em quebra de linha sem contar como remoção', () => {
    const r = filtrarInvisiveis('a\r\nb\rc')
    expect(r.texto).toBe('a\nb\nc')
    expect(r.removidos).toBe(0)
  })

  it('troca tab e espaços estranhos por espaço comum', () => {
    const r = filtrarInvisiveis('a\tb c d　e f')
    expect(r.texto).toBe('a b c d e f')
    expect(r.porCategoria['espaco-estranho']).toBe(5)
  })

  it('troca separador de linha e de parágrafo por quebra de linha', () => {
    expect(filtrarInvisiveis('a b c').texto).toBe('a\nb\nc')
  })

  describe('ZWJ', () => {
    it('mantém entre dois emojis (família)', () => {
      const familia = '👨‍👩‍👧'
      expect(filtrarInvisiveis(familia).texto).toBe(familia)
    })
    it('remove entre letras', () => {
      expect(filtrarInvisiveis('a‍b').texto).toBe('ab')
    })
    it('remove quando só o anterior é emoji', () => {
      expect(filtrarInvisiveis('👨‍b').texto).toBe('👨b')
    })
    it('remove quando só o seguinte é emoji', () => {
      expect(filtrarInvisiveis('a‍👩').texto).toBe('a👩')
    })
    it('remove no começo e no fim do texto', () => {
      expect(filtrarInvisiveis('‍').texto).toBe('')
      expect(filtrarInvisiveis('👨‍').texto).toBe('👨')
    })
  })

  describe('ZWNJ', () => {
    it('sai sempre, até no persa, porque o protocolo 0.1 recusa caractere de formato', () => {
      expect(filtrarInvisiveis('می\u200cخواهم').texto).toBe('میخواهم')
      expect(filtrarInvisiveis('a\u200cb').texto).toBe('ab')
    })
  })

  describe('seletor de variação', () => {
    it('mantém FE0F depois de emoji', () => {
      expect(filtrarInvisiveis('❤️').texto).toBe('❤️')
    })
    it('mantém FE0F depois de dígito (keycap)', () => {
      expect(filtrarInvisiveis('1️⃣').texto).toBe('1️⃣')
    })
    it('remove FE0F depois de letra', () => {
      const r = filtrarInvisiveis('a️')
      expect(r.texto).toBe('a')
      expect(r.porCategoria.variacao).toBe(1)
    })
    it('remove FE0E solto', () => {
      expect(filtrarInvisiveis('x︎').texto).toBe('x')
    })
    it('remove seletores de variação que não são de emoji', () => {
      expect(filtrarInvisiveis('a︁b').texto).toBe('ab')
      expect(filtrarInvisiveis('a︀b').texto).toBe('ab')
      expect(filtrarInvisiveis('a︍b').texto).toBe('ab')
    })
    it('remove os seletores suplementares e os marca como perigosos', () => {
      const r = filtrarInvisiveis(`a${String.fromCodePoint(0xe0100)}b${String.fromCodePoint(0xe01ef)}`)
      expect(r.texto).toBe('ab')
      expect(r.perigoso).toBe(true)
    })
  })

  it('relata a soma exata do que saiu', () => {
    const r = filtrarInvisiveis('a​b‮c\u0001d')
    expect(r.removidos).toBe(3)
    expect(r.porCategoria).toMatchObject({ 'largura-zero': 1, bidi: 1, controle: 1, tag: 0 })
  })

  it('limites de faixa: o caractere logo antes e logo depois dos intervalos não é tocado', () => {
    for (const cp of [0x1ffe, 0x2027, 0x2030, 0x7e, 0xa1, 0x41, 0x1f600]) {
      const c = String.fromCodePoint(cp)
      expect(filtrarInvisiveis(`a${c}b`).texto, `u+${cp.toString(16)}`).toBe(`a${c}b`)
    }
  })

  it('marcas de acentuação empilhadas além de três saem', () => {
    const r = filtrarInvisiveis('a\u0301\u0302\u0303\u0304\u0305b')
    expect(r.texto).toBe('a\u0301\u0302\u0303b')
    expect(r.porCategoria['marcas-demais']).toBe(2)
    expect(filtrarInvisiveis('a\u0301\u0302\u0303b').removidos).toBe(0)
  })

  it('uso privado, não atribuído e outros caracteres de formato saem', () => {
    expect(filtrarInvisiveis('a\ue000b').texto).toBe('ab')
    expect(filtrarInvisiveis('a\u0378b').texto).toBe('ab')
    expect(filtrarInvisiveis('a\u0600b').texto).toBe('ab')
    expect(filtrarInvisiveis('a\ud800b').texto).toBe('ab')
  })

  it('cada extremo dos intervalos é tratado', () => {
    for (const cp of [0xe0000, 0xe007f, 0xe0100, 0xe01ef, 0x202a, 0x202e, 0x2066, 0x2069, 0x2000, 0x200a, 0x0000, 0x001f, 0x007f, 0x009f]) {
      const r = filtrarInvisiveis(`a${String.fromCodePoint(cp)}b`)
      expect(r.texto === 'ab' || r.texto === 'a b', `u+${cp.toString(16)}`).toBe(true)
    }
  })
})
