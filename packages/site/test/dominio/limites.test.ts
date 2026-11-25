import { describe, expect, it } from 'vitest'
import { LIMITES, contar, cortar, normalizar, restantes, validarTexto } from '@/lib/dominio/limites'

describe('contar', () => {
  it('conta pontos de código, como o relé conta', () => {
    expect(contar('abc')).toBe(3)
    expect(contar('👨‍👩‍👧')).toBe(5)
    expect(contar('🇧🇷')).toBe(2)
    expect(contar('\u00e9')).toBe(1)
    expect(contar('\u00e9')).toBe(1)
    expect(contar('')).toBe(0)
  })
})

describe('normalizar', () => {
  it('junta acentos em NFC', () => {
    expect(normalizar('é')).toBe('é')
  })
  it('apara bordas e espaços no fim de cada linha', () => {
    expect(normalizar('  oi  \nlinha   \n')).toBe('oi\nlinha')
  })
  it('reduz três ou mais quebras seguidas a duas', () => {
    expect(normalizar('a\n\n\n\nb')).toBe('a\n\nb')
    expect(normalizar('a\n\nb')).toBe('a\n\nb')
    expect(normalizar('a\nb')).toBe('a\nb')
  })
})

describe('validarTexto', () => {
  it('aceita texto no limite exato e recusa um a mais (postagem)', () => {
    expect(validarTexto('a'.repeat(LIMITES.postagem), 'postagem')).toMatchObject({ ok: true, usados: 1500, limite: 1500 })
    expect(validarTexto('a'.repeat(LIMITES.postagem + 1), 'postagem')).toMatchObject({ ok: false, motivo: 'longo', usados: 1501 })
  })
  it('resposta tem limite menor', () => {
    expect(validarTexto('a'.repeat(1000), 'resposta').ok).toBe(true)
    expect(validarTexto('a'.repeat(1001), 'resposta')).toMatchObject({ ok: false, motivo: 'longo', limite: 1000 })
  })
  it('texto só de espaço, quebras ou invisíveis é vazio', () => {
    for (const t of ['', '   ', '\n\n', '​​', 'ㅤ', '⠀⠀', '\t']) {
      expect(validarTexto(t, 'postagem'), JSON.stringify(t)).toMatchObject({ ok: false, motivo: 'vazio' })
    }
  })
  it('caractere escondido não ajuda a passar do limite nem a fechar dentro dele', () => {
    expect(validarTexto('a'.repeat(1500) + '​'.repeat(50), 'postagem').ok).toBe(true)
    expect(validarTexto('a'.repeat(1501) + '​', 'postagem').ok).toBe(false)
  })
  it('devolve o texto limpo e quantos invisíveis saíram', () => {
    const r = validarTexto('  oi​  ', 'postagem')
    expect(r).toMatchObject({ ok: true, texto: 'oi', usados: 2, removidosInvisiveis: 1 })
  })
  it('também informa os invisíveis quando recusa', () => {
    expect(validarTexto('​​', 'postagem')).toMatchObject({ removidosInvisiveis: 2 })
  })
  it('emoji composto conta por pontos de código (a família vale 5)', () => {
    expect(validarTexto('👨‍👩‍👧'.repeat(200), 'resposta').ok).toBe(true)
    expect(validarTexto('👨‍👩‍👧'.repeat(201), 'resposta')).toMatchObject({ ok: false, motivo: 'longo', usados: 1005 })
  })
})

describe('restantes', () => {
  it('é o limite menos o que a pessoa vê', () => {
    expect(restantes('abc', 'postagem')).toBe(1497)
    expect(restantes('', 'resposta')).toBe(1000)
    expect(restantes('a'.repeat(1010), 'resposta')).toBe(-10)
    expect(restantes('ab​c', 'postagem')).toBe(1497)
  })
})

describe('cortar', () => {
  it('não mexe no que cabe', () => {
    expect(cortar('abc', 3)).toBe('abc')
  })
  it('corta no limite sem partir um ponto de código ao meio', () => {
    expect(cortar('a👨b', 2)).toBe('a👨')
    expect(cortar('abcdef', 4)).toBe('abcd')
  })
})
