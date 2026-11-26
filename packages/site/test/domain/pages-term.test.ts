import { describe, expect, it } from 'vitest'
import { highlight, normalizeSearch, surroundingSnippet } from '@/lib/social/term'
import { mergePages } from '@/lib/social/all'

describe('normalizarBusca', () => {
  it('empty and null do not search and are not "short"', () => {
    expect(normalizeSearch('')).toEqual({ termo: '', tag: null, curto: false })
    expect(normalizeSearch(undefined)).toEqual({ termo: '', tag: null, curto: false })
    expect(normalizeSearch('   ')).toEqual({ termo: '', tag: null, curto: false })
  })
  it('a single letter is too short; two are enough', () => {
    expect(normalizeSearch('a')).toEqual({ termo: '', tag: null, curto: true })
    expect(normalizeSearch('@').curto).toBe(true)
    expect(normalizeSearch('ab').termo).toBe('ab')
  })
  it('#tag becomes a search by the tag, lowercase and without accent', () => {
    expect(normalizeSearch('#Backup')).toEqual({ termo: 'Backup', tag: 'backup', curto: false })
    expect(normalizeSearch('##café')).toMatchObject({ tag: 'cafe' })
    expect(normalizeSearch('backup').tag).toBeNull()
  })
  it('a # with fewer than 2 letters after it is short', () => {
    expect(normalizeSearch('#a')).toMatchObject({ termo: '', curto: true })
  })
  it('up to 8 words of up to 30 letters; the rest is split off', () => {
    expect(normalizeSearch('um dois três quatro cinco seis sete oito nove dez').termo.split(' ')).toHaveLength(8)
    expect(normalizeSearch('a'.repeat(45)).termo).toHaveLength(30)
    expect(normalizeSearch('pasta/arquivo, backup!').termo).toBe('pasta arquivo backup')
  })
  it('at most 100 input characters and no control characters', () => {
    expect(Array.from(normalizeSearch('x'.repeat(300)).termo).length).toBeLessThanOrEqual(30)
    expect(normalizeSearch('pa\u0000sta\u001f ok').termo).toBe('pa sta ok')
  })
})

describe('destacar', () => {
  const text = (t: ReturnType<typeof highlight>) => t.map((x) => x.t).join('')
  it('marks the start of each word that matches, ignoring accent and case', () => {
    const r = highlight('Oficina de Pastas e pasta velha', 'pasta')
    expect(r.filter((x) => x.h).map((x) => x.t)).toEqual(['Pasta', 'pasta'])
    expect(text(r)).toBe('Oficina de Pastas e pasta velha')
  })
  it('an accent in the text does not prevent the match and the marked piece keeps the original letter', () => {
    const r = highlight('Café com pão', 'cafe pao')
    expect(r.filter((x) => x.h).map((x) => x.t)).toEqual(['Café', 'pão'])
  })
  it('without a term, or without a match, returns the whole text with no mark', () => {
    expect(highlight('abc', '')).toEqual([{ t: 'abc', h: false }])
    expect(highlight('abc', 'zzz')).toEqual([{ t: 'abc', h: false }])
    expect(highlight('', 'abc')).toEqual([{ t: '', h: false }])
  })
  it('HTML in the text is still text', () => {
    const r = highlight('<img src=x onerror=alert(1)> pasta', 'pasta')
    expect(text(r)).toBe('<img src=x onerror=alert(1)> pasta')
    expect(r.some((x) => x.h && x.t.includes('<'))).toBe(false)
  })
  it('only the start of the word matches, not the middle', () => {
    expect(highlight('compasta', 'pasta').some((x) => x.h)).toBe(false)
  })
})

describe('normalizarBusca: bordas', () => {
  it('# only at the start marks a tag; a # in the middle only separates', () => {
    expect(normalizeSearch('foo#bar')).toEqual({ termo: 'foo bar', tag: null, curto: false })
    expect(normalizeSearch('#foo#bar')).toMatchObject({ termo: 'foo bar', tag: 'foo' })
  })
  it('only punctuation is "short", and empty is not', () => {
    expect(normalizeSearch('!!')).toEqual({ termo: '', tag: null, curto: true })
    expect(normalizeSearch('#')).toEqual({ termo: '', tag: null, curto: true })
  })
  it('cuts the input at 100 characters before splitting the words', () => {
    expect(normalizeSearch(`${'x'.repeat(98)} yz`).termo).toBe(`${'x'.repeat(30)} y`)
  })
  it('an accented letter counts as one letter and consecutive separators leave no empty word', () => {
    expect(normalizeSearch('ação  --  café').termo).toBe('ação café')
    expect(normalizeSearch('###ação').tag).toBe('acao')
  })
  it('the tag has at most 24 characters', () => {
    expect(normalizeSearch(`#${'a'.repeat(40)}`).tag).toHaveLength(24)
  })
  it('a tag of only symbols becomes a search without a tag', () => {
    expect(normalizeSearch('#日本語')).toMatchObject({ tag: null, curto: false })
  })
})

describe('highlight: the term comes in any form', () => {
  it('a term with an accent and an uppercase letter matches text without accent and in lowercase, and the reverse', () => {
    expect(highlight('cafe frio', 'CAFÉ').filter((x) => x.h).map((x) => x.t)).toEqual(['cafe'])
    expect(highlight('Café frio', 'cafe').filter((x) => x.h).map((x) => x.t)).toEqual(['Café'])
  })
})

describe('destacar: bordas', () => {
  it('no empty pieces at the start or the end', () => {
    expect(highlight('pasta x', 'pasta')).toEqual([{ t: 'pasta', h: true }, { t: ' x', h: false }])
    expect(highlight('x pasta', 'pasta')).toEqual([{ t: 'x ', h: false }, { t: 'pasta', h: true }])
    expect(highlight('pasta', 'pasta')).toEqual([{ t: 'pasta', h: true }])
  })
  it('an empty word of the term does not match everything', () => {
    expect(highlight('abc xyz', 'a ').filter((x) => x.h).map((x) => x.t)).toEqual(['a'])
  })
  it('several words in the term, each in its own place', () => {
    const r = highlight('oficina de pastas antigas', 'pas ant')
    expect(r.filter((x) => x.h).map((x) => x.t)).toEqual(['pas', 'ant'])
  })
  it('a separator between the term\'s words counts once and the same holds with punctuation', () => {
    expect(highlight('a-b c', 'a,b').filter((x) => x.h).map((x) => x.t)).toEqual(['a', 'b'])
  })
  it('a letter with a composed accent of two marks is still one letter', () => {
    expect(highlight('éé', 'e').map((x) => x.t).join('')).toBe('éé')
  })
})

describe('trechoEmVolta: bordas', () => {
  const rep = (c: string, n: number) => c.repeat(n)
  it('exactly the maximum passes whole; one more is cut', () => {
    expect(surroundingSnippet(rep('a', 150), 'zzz', 150)).toBe(rep('a', 150))
    expect(surroundingSnippet(rep('a', 151), 'zzz', 150)).toBe(`${rep('a', 150)}…`)
  })
  it('match in the middle: ellipsis on both sides and starts 30 before', () => {
    const t = `${rep('b', 99)} pasta ${rep('c', 95)}`
    const r = surroundingSnippet(t, 'pasta', 80)
    expect(r.startsWith(`…${rep('b', 29)} pasta`)).toBe(true)
    expect(r.endsWith('…')).toBe(true)
    expect(Array.from(r)).toHaveLength(82)
  })
  it('match near the end: no ellipsis at the end, one at the start', () => {
    const t = `${rep('b', 189)} pasta`
    const r = surroundingSnippet(t, 'pasta', 150)
    expect(r.startsWith('…')).toBe(true)
    expect(r.endsWith('pasta')).toBe(true)
    expect(Array.from(r)).toHaveLength(151)
  })
  it('match at the start: no ellipsis at the start', () => {
    const r = surroundingSnippet(`pasta${rep('b', 300)}`, 'pasta', 100)
    expect(r.startsWith('pasta')).toBe(true)
    expect(r.endsWith('…')).toBe(true)
  })
  it('finds the right match even when the same text appears earlier inside another word', () => {
    const t = `${rep('compasta ', 30)}${rep('b', 40)} pasta ${rep('c', 200)}`
    const r = surroundingSnippet(t, 'pasta', 100)
    expect(r).toContain(' pasta ')
    expect(r.startsWith('…')).toBe(true)
  })
  it('without a match, starts from the beginning', () => {
    expect(surroundingSnippet(rep('x', 300), 'zzz', 50)).toBe(`${rep('x', 50)}…`)
  })
  it('counts code points, not units (emoji)', () => {
    const t = '😀'.repeat(60)
    expect(Array.from(surroundingSnippet(t, 'zzz', 50)).length).toBe(51)
  })
})

describe('trechoEmVolta', () => {
  it('short text passes whole', () => {
    expect(surroundingSnippet('curto', 'x', 150)).toBe('curto')
  })
  it('long text is cut around the first match, with an ellipsis on both sides', () => {
    const long = `${'a '.repeat(100)}pasta ${'b '.repeat(100)}`
    const r = surroundingSnippet(long, 'pasta', 80)
    expect(r.startsWith('…')).toBe(true)
    expect(r.endsWith('…')).toBe(true)
    expect(r).toContain('pasta')
    expect(Array.from(r).length).toBeLessThanOrEqual(82)
  })
  it('without a match, cuts at the start', () => {
    const r = surroundingSnippet('x'.repeat(300), 'zzz', 50)
    expect(r.startsWith('…')).toBe(false)
    expect(r.endsWith('…')).toBe(true)
  })
})

describe('juntarPaginas', () => {
  it('joins the pages by cursor until it ends', async () => {
    const data = [{ itens: [1, 2], proximo: 'a' }, { itens: [3], proximo: 'b' }, { itens: [4] }]
    let i = 0
    const seen: (string | undefined)[] = []
    const r = await mergePages(async (c) => { seen.push(c); return data[i++] })
    expect(r).toEqual([1, 2, 3, 4])
    expect(seen).toEqual([undefined, 'a', 'b'])
  })
  it('respects the page ceiling', async () => {
    let n = 0
    const r = await mergePages(async () => ({ itens: [++n], proximo: 'x' }), 3)
    expect(r).toEqual([1, 2, 3])
  })
})
