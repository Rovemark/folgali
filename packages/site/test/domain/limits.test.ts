import { describe, expect, it } from 'vitest'
import { LIMITS, count, cut, normalize, remaining, validateText } from '@/lib/domain/limits'

describe('contar', () => {
  it('counts code points, as the relay counts', () => {
    expect(count('abc')).toBe(3)
    expect(count('👨‍👩‍👧')).toBe(5)
    expect(count('🇧🇷')).toBe(2)
    expect(count('\u00e9')).toBe(1)
    expect(count('\u00e9')).toBe(1)
    expect(count('')).toBe(0)
  })
})

describe('normalizar', () => {
  it('joins accents in NFC', () => {
    expect(normalize('é')).toBe('é')
  })
  it('trims edges and trailing spaces on each line', () => {
    expect(normalize('  oi  \nlinha   \n')).toBe('oi\nlinha')
  })
  it('reduces three or more consecutive breaks to two', () => {
    expect(normalize('a\n\n\n\nb')).toBe('a\n\nb')
    expect(normalize('a\n\nb')).toBe('a\n\nb')
    expect(normalize('a\nb')).toBe('a\nb')
  })
})

describe('validarTexto', () => {
  it('accepts text at the exact limit and refuses one more (post)', () => {
    expect(validateText('a'.repeat(LIMITS.postagem), 'postagem')).toMatchObject({ ok: true, usados: 1500, limite: 1500 })
    expect(validateText('a'.repeat(LIMITS.postagem + 1), 'postagem')).toMatchObject({ ok: false, motivo: 'longo', usados: 1501 })
  })
  it('a reply has a smaller limit', () => {
    expect(validateText('a'.repeat(1000), 'resposta').ok).toBe(true)
    expect(validateText('a'.repeat(1001), 'resposta')).toMatchObject({ ok: false, motivo: 'longo', limite: 1000 })
  })
  it('text of only spaces, breaks or invisibles is empty', () => {
    for (const t of ['', '   ', '\n\n', '​​', 'ㅤ', '⠀⠀', '\t']) {
      expect(validateText(t, 'postagem'), JSON.stringify(t)).toMatchObject({ ok: false, motivo: 'vazio' })
    }
  })
  it('a hidden character does not help pass the limit or close inside it', () => {
    expect(validateText('a'.repeat(1500) + '​'.repeat(50), 'postagem').ok).toBe(true)
    expect(validateText('a'.repeat(1501) + '​', 'postagem').ok).toBe(false)
  })
  it('returns the clean text and how many invisibles went out', () => {
    const r = validateText('  oi​  ', 'postagem')
    expect(r).toMatchObject({ ok: true, texto: 'oi', usados: 2, removedInvisibles: 1 })
  })
  it('also reports the invisibles when it refuses', () => {
    expect(validateText('​​', 'postagem')).toMatchObject({ removedInvisibles: 2 })
  })
  it('a composite emoji counts by code points (the family is worth 5)', () => {
    expect(validateText('👨‍👩‍👧'.repeat(200), 'resposta').ok).toBe(true)
    expect(validateText('👨‍👩‍👧'.repeat(201), 'resposta')).toMatchObject({ ok: false, motivo: 'longo', usados: 1005 })
  })
})

describe('restantes', () => {
  it('it is the limit minus what the person sees', () => {
    expect(remaining('abc', 'postagem')).toBe(1497)
    expect(remaining('', 'resposta')).toBe(1000)
    expect(remaining('a'.repeat(1010), 'resposta')).toBe(-10)
    expect(remaining('ab​c', 'postagem')).toBe(1497)
  })
})

describe('cortar', () => {
  it('does not touch what fits', () => {
    expect(cut('abc', 3)).toBe('abc')
  })
  it('cuts at the limit without splitting a code point in half', () => {
    expect(cut('a👨b', 2)).toBe('a👨')
    expect(cut('abcdef', 4)).toBe('abcd')
  })
})
