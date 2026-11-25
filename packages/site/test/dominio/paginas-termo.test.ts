import { describe, expect, it } from 'vitest'
import { destacar, normalizarBusca, trechoEmVolta } from '@/lib/social/termo'
import { juntarPaginas } from '@/lib/social/todas'

describe('normalizarBusca', () => {
  it('vazio e nulo não buscam e não são "curto"', () => {
    expect(normalizarBusca('')).toEqual({ termo: '', tag: null, curto: false })
    expect(normalizarBusca(undefined)).toEqual({ termo: '', tag: null, curto: false })
    expect(normalizarBusca('   ')).toEqual({ termo: '', tag: null, curto: false })
  })
  it('uma letra só é curto demais; duas valem', () => {
    expect(normalizarBusca('a')).toEqual({ termo: '', tag: null, curto: true })
    expect(normalizarBusca('@').curto).toBe(true)
    expect(normalizarBusca('ab').termo).toBe('ab')
  })
  it('#tag vira busca pela tag, em minúsculas e sem acento', () => {
    expect(normalizarBusca('#Backup')).toEqual({ termo: 'Backup', tag: 'backup', curto: false })
    expect(normalizarBusca('##café')).toMatchObject({ tag: 'cafe' })
    expect(normalizarBusca('backup').tag).toBeNull()
  })
  it('um # com menos de 2 letras depois é curto', () => {
    expect(normalizarBusca('#a')).toMatchObject({ termo: '', curto: true })
  })
  it('até 8 palavras de até 30 letras; o resto separa', () => {
    expect(normalizarBusca('um dois três quatro cinco seis sete oito nove dez').termo.split(' ')).toHaveLength(8)
    expect(normalizarBusca('a'.repeat(45)).termo).toHaveLength(30)
    expect(normalizarBusca('pasta/arquivo, backup!').termo).toBe('pasta arquivo backup')
  })
  it('no máximo 100 caracteres de entrada e sem controle', () => {
    expect(Array.from(normalizarBusca('x'.repeat(300)).termo).length).toBeLessThanOrEqual(30)
    expect(normalizarBusca('pa\u0000sta\u001f ok').termo).toBe('pa sta ok')
  })
})

describe('destacar', () => {
  const texto = (t: ReturnType<typeof destacar>) => t.map((x) => x.t).join('')
  it('marca o começo de cada palavra que casa, sem acento e sem diferença de maiúscula', () => {
    const r = destacar('Oficina de Pastas e pasta velha', 'pasta')
    expect(r.filter((x) => x.h).map((x) => x.t)).toEqual(['Pasta', 'pasta'])
    expect(texto(r)).toBe('Oficina de Pastas e pasta velha')
  })
  it('acento no texto não impede o casamento e o pedaço marcado mantém a letra original', () => {
    const r = destacar('Café com pão', 'cafe pao')
    expect(r.filter((x) => x.h).map((x) => x.t)).toEqual(['Café', 'pão'])
  })
  it('sem termo, ou sem casamento, devolve o texto inteiro sem marca', () => {
    expect(destacar('abc', '')).toEqual([{ t: 'abc', h: false }])
    expect(destacar('abc', 'zzz')).toEqual([{ t: 'abc', h: false }])
    expect(destacar('', 'abc')).toEqual([{ t: '', h: false }])
  })
  it('HTML no texto continua sendo texto', () => {
    const r = destacar('<img src=x onerror=alert(1)> pasta', 'pasta')
    expect(texto(r)).toBe('<img src=x onerror=alert(1)> pasta')
    expect(r.some((x) => x.h && x.t.includes('<'))).toBe(false)
  })
  it('só o começo da palavra casa, não o meio', () => {
    expect(destacar('compasta', 'pasta').some((x) => x.h)).toBe(false)
  })
})

describe('normalizarBusca: bordas', () => {
  it('# só no começo marca tag; um # no meio só separa', () => {
    expect(normalizarBusca('foo#bar')).toEqual({ termo: 'foo bar', tag: null, curto: false })
    expect(normalizarBusca('#foo#bar')).toMatchObject({ termo: 'foo bar', tag: 'foo' })
  })
  it('só pontuação é "curto", e vazio não', () => {
    expect(normalizarBusca('!!')).toEqual({ termo: '', tag: null, curto: true })
    expect(normalizarBusca('#')).toEqual({ termo: '', tag: null, curto: true })
  })
  it('corta a entrada em 100 caracteres antes de separar as palavras', () => {
    expect(normalizarBusca(`${'x'.repeat(98)} yz`).termo).toBe(`${'x'.repeat(30)} y`)
  })
  it('letra acentuada vale como uma letra e separadores seguidos não deixam palavra vazia', () => {
    expect(normalizarBusca('ação  --  café').termo).toBe('ação café')
    expect(normalizarBusca('###ação').tag).toBe('acao')
  })
  it('a tag tem no máximo 24 caracteres', () => {
    expect(normalizarBusca(`#${'a'.repeat(40)}`).tag).toHaveLength(24)
  })
  it('uma tag só com símbolos vira busca sem tag', () => {
    expect(normalizarBusca('#日本語')).toMatchObject({ tag: null, curto: false })
  })
})

describe('destacar: o termo vem de qualquer jeito', () => {
  it('termo com acento e com maiúscula casa com texto sem acento e em minúscula, e o contrário', () => {
    expect(destacar('cafe frio', 'CAFÉ').filter((x) => x.h).map((x) => x.t)).toEqual(['cafe'])
    expect(destacar('Café frio', 'cafe').filter((x) => x.h).map((x) => x.t)).toEqual(['Café'])
  })
})

describe('destacar: bordas', () => {
  it('sem pedaços vazios no começo nem no fim', () => {
    expect(destacar('pasta x', 'pasta')).toEqual([{ t: 'pasta', h: true }, { t: ' x', h: false }])
    expect(destacar('x pasta', 'pasta')).toEqual([{ t: 'x ', h: false }, { t: 'pasta', h: true }])
    expect(destacar('pasta', 'pasta')).toEqual([{ t: 'pasta', h: true }])
  })
  it('palavra do termo vazia não casa com tudo', () => {
    expect(destacar('abc xyz', 'a ').filter((x) => x.h).map((x) => x.t)).toEqual(['a'])
  })
  it('várias palavras no termo, cada uma no seu lugar', () => {
    const r = destacar('oficina de pastas antigas', 'pas ant')
    expect(r.filter((x) => x.h).map((x) => x.t)).toEqual(['pas', 'ant'])
  })
  it('separador entre as palavras do termo conta uma vez e o mesmo vale com pontuação', () => {
    expect(destacar('a-b c', 'a,b').filter((x) => x.h).map((x) => x.t)).toEqual(['a', 'b'])
  })
  it('letra com acento composto por duas marcas ainda é uma letra', () => {
    expect(destacar('éé', 'e').map((x) => x.t).join('')).toBe('éé')
  })
})

describe('trechoEmVolta: bordas', () => {
  const rep = (c: string, n: number) => c.repeat(n)
  it('exatamente no máximo passa inteiro; um a mais corta', () => {
    expect(trechoEmVolta(rep('a', 150), 'zzz', 150)).toBe(rep('a', 150))
    expect(trechoEmVolta(rep('a', 151), 'zzz', 150)).toBe(`${rep('a', 150)}…`)
  })
  it('casamento no meio: reticências dos dois lados e começa 30 antes', () => {
    const t = `${rep('b', 99)} pasta ${rep('c', 95)}`
    const r = trechoEmVolta(t, 'pasta', 80)
    expect(r.startsWith(`…${rep('b', 29)} pasta`)).toBe(true)
    expect(r.endsWith('…')).toBe(true)
    expect(Array.from(r)).toHaveLength(82)
  })
  it('casamento perto do fim: sem reticências no fim, com no começo', () => {
    const t = `${rep('b', 189)} pasta`
    const r = trechoEmVolta(t, 'pasta', 150)
    expect(r.startsWith('…')).toBe(true)
    expect(r.endsWith('pasta')).toBe(true)
    expect(Array.from(r)).toHaveLength(151)
  })
  it('casamento no começo: sem reticências no começo', () => {
    const r = trechoEmVolta(`pasta${rep('b', 300)}`, 'pasta', 100)
    expect(r.startsWith('pasta')).toBe(true)
    expect(r.endsWith('…')).toBe(true)
  })
  it('acha o casamento certo mesmo quando o mesmo texto aparece antes dentro de outra palavra', () => {
    const t = `${rep('compasta ', 30)}${rep('b', 40)} pasta ${rep('c', 200)}`
    const r = trechoEmVolta(t, 'pasta', 100)
    expect(r).toContain(' pasta ')
    expect(r.startsWith('…')).toBe(true)
  })
  it('sem casamento, começa do início', () => {
    expect(trechoEmVolta(rep('x', 300), 'zzz', 50)).toBe(`${rep('x', 50)}…`)
  })
  it('conta pontos de código, não unidades (emoji)', () => {
    const t = '😀'.repeat(60)
    expect(Array.from(trechoEmVolta(t, 'zzz', 50)).length).toBe(51)
  })
})

describe('trechoEmVolta', () => {
  it('texto curto passa inteiro', () => {
    expect(trechoEmVolta('curto', 'x', 150)).toBe('curto')
  })
  it('texto longo é cortado em volta do primeiro casamento, com reticências dos dois lados', () => {
    const longo = `${'a '.repeat(100)}pasta ${'b '.repeat(100)}`
    const r = trechoEmVolta(longo, 'pasta', 80)
    expect(r.startsWith('…')).toBe(true)
    expect(r.endsWith('…')).toBe(true)
    expect(r).toContain('pasta')
    expect(Array.from(r).length).toBeLessThanOrEqual(82)
  })
  it('sem casamento, corta no começo', () => {
    const r = trechoEmVolta('x'.repeat(300), 'zzz', 50)
    expect(r.startsWith('…')).toBe(false)
    expect(r.endsWith('…')).toBe(true)
  })
})

describe('juntarPaginas', () => {
  it('junta as páginas pelo cursor até acabar', async () => {
    const dados = [{ itens: [1, 2], proximo: 'a' }, { itens: [3], proximo: 'b' }, { itens: [4] }]
    let i = 0
    const vistos: (string | undefined)[] = []
    const r = await juntarPaginas(async (c) => { vistos.push(c); return dados[i++] })
    expect(r).toEqual([1, 2, 3, 4])
    expect(vistos).toEqual([undefined, 'a', 'b'])
  })
  it('respeita o teto de páginas', async () => {
    let n = 0
    const r = await juntarPaginas(async () => ({ itens: [++n], proximo: 'x' }), 3)
    expect(r).toEqual([1, 2, 3])
  })
})
