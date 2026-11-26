// 0.3 mentions, tags, links and personal data (docs/API-SOCIAL-NETWORK.md, section 2).
import { describe, expect, it } from 'vitest'
import {
  SHORTENERS, MAX_HASHTAGS, MAX_LINK, MAX_MENTIONS, parseLinks, countMentions, detectPersonal03, linkDomain, extractLinks, extractMentions, extractTags, split, linkProblem,
} from '@/lib/domain/social-text'

describe('@handle mentions (2.1)', () => {
  it('a mention is an @ attached to 3 to 30 characters of a-z 0-9 . _', () => {
    expect(extractMentions('oi @pipa e @max.codigo_1')).toEqual(['pipa', 'max.codigo_1'])
    expect(extractMentions('@abc')).toEqual(['abc'])
    expect(extractMentions(`@${'a'.repeat(30)}`)).toEqual(['a'.repeat(30)])
    expect(extractMentions(`@${'a'.repeat(31)}`)).toEqual([])
  })
  it('fewer than 3 characters, or a lone @, is ordinary text', () => {
    expect(extractMentions('@ab e @ e @')).toEqual([])
    expect(countMentions('@ab @a')).toBe(0)
  })
  it('a trailing dot and underscore are punctuation: "oi @pipa." mentions pipa', () => {
    expect(extractMentions('oi @pipa.')).toEqual(['pipa'])
    expect(extractMentions('oi @pipa_ e @max..')).toEqual(['pipa', 'max'])
    expect(extractMentions('@ab._')).toEqual([])
  })
  it('not preceded by a letter, digit, dot, underscore, @ or slash', () => {
    expect(extractMentions('fulano@exemplo')).toEqual([])
    expect(extractMentions('a1@pipa')).toEqual([])
    expect(extractMentions('x.@pipa _@pipa @@pipa')).toEqual([])
    expect(extractMentions('rota/@pipa')).toEqual([])
    expect(extractMentions('(@pipa) "@max"')).toEqual(['pipa', 'max'])
    expect(extractMentions('oi\n@pipa')).toEqual(['pipa'])
  })
  it('the limit of 5 counts DISTINCT people, like the relay: citing the same one 6 times is 1', () => {
    expect(MAX_MENTIONS).toBe(5)
    expect(extractMentions('@pipa @pipa @pipa')).toEqual(['pipa'])
    expect(countMentions('@pipa @pipa @pipa')).toBe(1)
    expect(countMentions('@pipa @Pipa @PIPA')).toBe(1)
    expect(countMentions('@aaa @bbb @ccc @ddd @eee')).toBe(5)
    expect(countMentions('@aaa @bbb @ccc @ddd @eee @fff')).toBe(6)
  })
  it('the protocol accepts uppercase in the mention and stores it in lowercase (parity)', () => {
    expect(extractMentions('oi @Pipa')).toEqual(['pipa'])
    expect(countMentions('@Aaa @Bbb @Ccc @Ddd @Eee @Fff')).toBe(6)
  })
})

describe('tags #tema (2.2)', () => {
  it('2 to 24 characters, starts with a letter or digit, lowercase and without repeating', () => {
    expect(extractTags('#Rovers e #rovers #ab #a1-b2').tags).toEqual(['rovers', 'ab', 'a1-b2'])
    expect(extractTags(`#${'a'.repeat(24)}`).tags).toEqual(['a'.repeat(24)])
  })
  it('a # followed by 1 character is ordinary text; a hyphen in front does not count', () => {
    expect(extractTags('#a #1 #').total).toBe(0)
    expect(extractTags('#a #1 #').longa).toBe(false)
    expect(extractTags('#-ab').tags).toEqual([])
  })
  it('a sequence of more than 24 characters is an error (it is not ignored)', () => {
    const r = extractTags(`#${'a'.repeat(25)}`)
    expect(r.longa).toBe(true)
    expect(r.tags).toEqual([])
    expect(extractTags(`#${'a'.repeat(24)}`).longa).toBe(false)
  })
  it('only an ASCII run that STARTS with a letter or digit, with more than 24, is an error; the others are ignored', () => {
    expect(extractTags(`#-${'a'.repeat(24)}`).longa).toBe(false)
    expect(extractTags(`#${'é'.repeat(30)}`).longa).toBe(false)
    expect(extractTags(`#_${'a'.repeat(30)}`).longa).toBe(false)
    expect(extractTags(`#a${'_'.repeat(30)}`).longa).toBe(false)
    expect(extractTags(`#9${'b'.repeat(24)}`).longa).toBe(true)
    expect(extractTags(`#${'a'.repeat(23)}`).longa).toBe(false)
  })
  it('not preceded by a letter, digit or #', () => {
    expect(extractTags('a#tag 1#tag ##tag').tags).toEqual([])
    expect(extractTags('(#tag)').tags).toEqual(['tag'])
  })
  it('the ceiling of 5 counts DISTINCT tags, like the relay', () => {
    expect(MAX_HASHTAGS).toBe(5)
    expect(extractTags('#aa #aa #AA').total).toBe(1)
    expect(extractTags('#aa #bb #cc #dd #ee #ff').total).toBe(6)
  })
  it('parity with the protocol: an underscore and an accent make the sequence invalid, not a shorter tag', () => {
    expect(extractTags('#abc_def').tags).toEqual([])
    expect(extractTags('#café').tags).toEqual([])
    expect(extractTags('#ação').total).toBe(0)
  })
})

describe('links (2.3)', () => {
  const ok = (l: string) => expect(linkProblem(l)).toBeNull()
  it('https with a real domain works', () => {
    ok('https://exemplo.com')
    ok('https://www.exemplo.com.br/caminho?q=1#topo')
    ok('https://sub.dominio-legal.org/a/b')
  })
  it('only https: http, ftp and the rest are refused', () => {
    for (const l of ['http://exemplo.com', 'ftp://exemplo.com', 'file:///etc/passwd', 'data://x', 'blob://x', 'javascript://x']) expect(linkProblem(l)).toBe('link-esquema')
    expect(linkProblem('HTTP://exemplo.com')).toBe('link-esquema')
  })
  it('at most 200 characters, counting code points', () => {
    expect(MAX_LINK).toBe(200)
    const base = 'https://exemplo.com/'
    ok(base + 'a'.repeat(200 - base.length))
    expect(linkProblem(base + 'a'.repeat(201 - base.length))).toBe('link-longo')
  })
  it('no IP, localhost, user and password, port, xn-- or shortener', () => {
    for (const l of ['https://127.0.0.1/a', 'https://10.0.0.1', 'https://[::1]/a', 'https://localhost/a', 'https://usuario:senha@exemplo.com', 'https://usuario@exemplo.com', 'https://exemplo.com:8443/a', 'https://xn--bcher-kva.example', 'https://sub.xn--bcher-kva.example', 'https://semponto']) {
      expect(linkProblem(l), l).toBe('link-host')
    }
    for (const e of SHORTENERS) {
      expect(linkProblem(`https://${e}/abc`), e).toBe('link-host')
      expect(linkProblem(`https://www.${e}/abc`), `www.${e}`).toBe('link-host')
    }
    expect(SHORTENERS).toHaveLength(11)
  })
  it('no tracker: utm_* and the parameters on the list, in any case', () => {
    for (const p of ['utm_source=x', 'UTM_medium=x', 'fbclid=1', 'gclid=1', 'dclid=1', 'msclkid=1', 'mc_eid=1', 'mc_cid=1', 'igshid=1', 'yclid=1', '_hsenc=1', '_hsmi=1', 'ref_src=1', 's_cid=1', 'wickedid=1', 'vero_id=1', 'FBCLID=1']) {
      expect(linkProblem(`https://exemplo.com/a?ok=1&${p}`), p).toBe('link-rastreador')
    }
    ok('https://exemplo.com/a?utm=1&source=2&ref=3')
  })
  it('extracting links removes trailing punctuation and finds any scheme', () => {
    expect(extractLinks('veja https://exemplo.com/a. e (https://b.org/x), ou ftp://c.net/y!')).toEqual(['https://exemplo.com/a', 'https://b.org/x', 'ftp://c.net/y'])
    expect(extractLinks('sem link aqui')).toEqual([])
  })
  it('parseLinks: counts, finds the problem, and `demais` when it goes over the field\'s maximum', () => {
    const t = 'https://a.com e https://b.com e https://c.com'
    expect(parseLinks(t, 2)).toMatchObject({ total: 3, rest: true, achados: [] })
    expect(parseLinks(t, 3)).toMatchObject({ total: 3, rest: false })
    expect(parseLinks('https://a.com', 0)).toMatchObject({ total: 1, rest: true })
    expect(parseLinks('nada', 0)).toEqual({ total: 0, achados: [], rest: false })
    expect(parseLinks('http://a.com', 2).achados).toEqual([{ codigo: 'link-esquema', trecho: 'http://a.com' }])
  })
  it('schemes without slashes that execute are refused: javascript:, vbscript:, data: with MIME, file: and blob:', () => {
    for (const t of ['clique javascript:alert(1)', 'JavaScript :x', 'vbscript:x', 'data:text/html,abc', 'file:/etc/passwd', 'blob:https://a.com/x']) {
      expect(parseLinks(t, 2).achados.some((a) => a.codigo === 'link-esquema'), t).toBe(true)
    }
  })
  it('"Data: hoje" and "arquivo: nome" are ordinary text (parity with the protocol)', () => {
    for (const t of ['Data: hoje às 10h', 'data: 12/11', 'arquivo: relatório', 'file: pronto']) expect(parseLinks(t, 2).achados, t).toEqual([])
  })
  it('the 40-character excerpt fits whole; the 41-character one becomes 37 plus an ellipsis', () => {
    const l40 = `http://exemplo.com/${'a'.repeat(21)}`
    expect(l40).toHaveLength(40)
    expect(parseLinks(l40, 2).achados[0].trecho).toBe(l40)
    expect(parseLinks(`${l40}a`, 2).achados[0].trecho).toBe(`${l40.slice(0, 37)}...`)
  })
  it('the finding\'s excerpt is shortened for the screen', () => {
    const long = `http://exemplo.com/${'a'.repeat(100)}`
    const t = parseLinks(long, 2).achados[0].trecho
    expect(t.length).toBe(40)
    expect(t.endsWith('...')).toBe(true)
  })
  it('a broken link after https://', () => {
    expect(linkProblem('https://a%.com')).toBe('link-invalido')
    expect(linkProblem('https://[abc')).toBe('link-invalido')
  })
  it('only the exact https scheme counts: xhttps:// is not https://', () => {
    expect(linkProblem('xhttps://exemplo.com')).toBe('link-esquema')
    expect(linkProblem('ahttps://exemplo.com')).toBe('link-esquema')
    expect(extractLinks('1https://exemplo.com')).toEqual(['https://exemplo.com'])
  })
  it('a password without a user is also refused; .local, .internal and .localhost are the local network', () => {
    expect(linkProblem('https://:senha@exemplo.com')).toBe('link-host')
    for (const l of ['https://impressora.local', 'https://x.internal', 'https://a.localhost']) expect(linkProblem(l), l).toBe('link-host')
    ok('https://localhosted.com')
    ok('https://minhalocal.com')
  })
  it('the whole domain, https only', () => {
    expect(linkDomain('https://www.exemplo.com.br/a?b=1')).toBe('www.exemplo.com.br')
    expect(linkDomain('http://exemplo.com')).toBeNull()
    expect(linkDomain('lixo')).toBeNull()
  })
  it('parity with the protocol: an invalid domain label, .local and .internal', () => {
    for (const l of ['https://a_b.com', 'https://-a.com', 'https://a-.com', 'https://impressora.local', 'https://x.internal', 'https://a.localhost']) expect(linkProblem(l), l).not.toBeNull()
  })
})

describe('0.3 personal data (2.4)', () => {
  it('CEP: 12345-678', () => {
    expect(detectPersonal03('moro no 12345-678')).toEqual([{ codigo: 'cep', trecho: '12345-678' }])
    expect(detectPersonal03('12345-6789')).toEqual([])
    expect(detectPersonal03('212345-678')).toEqual([])
    expect(detectPersonal03('12345-67')).toEqual([])
  })
  it('a postal code attached to a hyphen does not count (parity with the protocol)', () => {
    expect(detectPersonal03('-12345-678')).toEqual([])
    expect(detectPersonal03('12345-678-9')).toEqual([])
  })
  it('coordinate pair: -23.5505, -46.6333', () => {
    expect(detectPersonal03('estou em -23.5505, -46.6333 agora')).toEqual([{ codigo: 'coordenadas', trecho: '-23.5505, -46.6333' }])
    expect(detectPersonal03('23.5505,46.6333')).toHaveLength(1)
    expect(detectPersonal03('versão 1.2.3.4')).toEqual([])
    expect(detectPersonal03('1234.5678, 12.3456')).toEqual([])
  })
  it('prices and short numbers with two decimal places are not coordinates (parity: requires 3 places)', () => {
    expect(detectPersonal03('custa 10.50, 20.25')).toEqual([])
    expect(detectPersonal03('12.345, 67.890')).toHaveLength(1)
  })
  it('postal code and coordinates together give two findings, in that order', () => {
    expect(detectPersonal03('12345-678 e 10.1234, 20.5678').map((a) => a.codigo)).toEqual(['cep', 'coordenadas'])
  })
})

describe('split: draw without HTML', () => {
  it('separates text, mention, tag and link', () => {
    expect(split('oi @pipa, veja #fio e https://exemplo.com/a.')).toEqual([
      { t: 'texto', v: 'oi ' }, { t: 'mencao', v: 'pipa' }, { t: 'texto', v: ', veja ' }, { t: 'tag', v: 'fio' },
      { t: 'texto', v: ' e ' }, { t: 'link', v: 'https://exemplo.com/a', dominio: 'exemplo.com', seguro: true }, { t: 'texto', v: '.' },
    ])
  })
  it('only marks as clickable (safe) the link that passes all the rules', () => {
    const bad = ['http://exemplo.com', 'https://127.0.0.1', 'https://exemplo.com/?utm_source=x', 'https://bit.ly/abc', 'https://u:p@exemplo.com', 'ftp://exemplo.com']
    for (const l of bad) {
      const p = split(l).find((x) => x.t === 'link')
      expect(p && p.t === 'link' && p.seguro, l).toBe(false)
    }
    const good = split('https://exemplo.com/a')[0]
    expect(good).toMatchObject({ t: 'link', seguro: true })
  })
  it('a mention and a tag inside a link do not become a mention or a tag', () => {
    const p = split('https://exemplo.com/@pipa#fio')
    expect(p).toHaveLength(1)
    expect(p[0].t).toBe('link')
  })
  it('the parts reassemble the original text and never produce markup: the value comes out as it came', () => {
    const text = 'a <b>negrito</b> @pipa #oi https://x.com/a?b=1 fim'
    const p = split(text)
    const prefix = (x: (typeof p)[number]) => (x.t === 'mencao' ? '@' : x.t === 'tag' ? '#' : '')
    expect(p.map((x) => prefix(x) + x.v).join('')).toBe(text)
    for (const x of p) expect(Object.keys(x).every((k) => ['t', 'v', 'dominio', 'seguro'].includes(k))).toBe(true)
    expect(split('')).toEqual([])
    expect(split('só texto')).toEqual([{ t: 'texto', v: 'só texto' }])
  })
  it('a mention and a tag inside a link remain part of the link, even when the rule would let them match', () => {
    for (const l of ['https://exemplo.com/#fio', 'https://exemplo.com/a?b=(@pipa)z', 'https://exemplo.com/?x=#fio']) {
      const p = split(l)
      expect(p, l).toHaveLength(1)
      expect(p[0]).toMatchObject({ t: 'link', v: l })
    }
    expect(split('veja https://exemplo.com/#fio e #fio')).toEqual([
      { t: 'texto', v: 'veja ' }, { t: 'link', v: 'https://exemplo.com/#fio', dominio: 'exemplo.com', seguro: true }, { t: 'texto', v: ' e ' }, { t: 'tag', v: 'fio' },
    ])
  })
  it('the mention without the trailing dot or underscore, and at the limits of 3 and 30 characters', () => {
    expect(split('oi @pipa.')).toEqual([{ t: 'texto', v: 'oi ' }, { t: 'mencao', v: 'pipa' }, { t: 'texto', v: '.' }])
    expect(split('@pipa..')).toEqual([{ t: 'mencao', v: 'pipa' }, { t: 'texto', v: '..' }])
    expect(split('@pipa_')).toEqual([{ t: 'mencao', v: 'pipa' }, { t: 'texto', v: '_' }])
    expect(split('@abc')).toEqual([{ t: 'mencao', v: 'abc' }])
    expect(split(`@${'a'.repeat(30)}`)).toEqual([{ t: 'mencao', v: 'a'.repeat(30) }])
    expect(split(`@${'a'.repeat(31)}`)).toEqual([{ t: 'texto', v: `@${'a'.repeat(31)}` }])
    expect(split('@Pipa')).toEqual([{ t: 'mencao', v: 'pipa' }])
    expect(split('@max.codigo_1')).toEqual([{ t: 'mencao', v: 'max.codigo_1' }])
  })
  it('limits: a long tag and a short mention remain text', () => {
    expect(split(`#${'a'.repeat(25)}`)).toEqual([{ t: 'texto', v: `#${'a'.repeat(25)}` }])
    expect(split('@ab')).toEqual([{ t: 'texto', v: '@ab' }])
  })
})
