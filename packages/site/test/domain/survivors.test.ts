// Tests that were born from mutation testing (npm run mutation): each one kills a planted defect that
// the first round let survive. The comments say which.
import { describe, expect, it } from 'vitest'
import { approve, analyze, blocks, networkOutput, sealTouch, verifyBadge, type NetworkObject } from '@/lib/domain/approval'
import { ReportLedger } from '@/lib/domain/report'
import { detectLanguage, faceByUid } from '@/lib/domain/expression'
import { summary } from '@/lib/domain/hash'
import { normalizeHandle, searchTerm } from '@/lib/domain/handle'
import { isObjectId, isUid, demoId, ID_RE, UID_RE } from '@/lib/domain/ids'
import { filterInvisible } from '@/lib/domain/invisible'
import { detectPrivateData, detectForbidden } from '@/lib/domain/privacy'
import { rank } from '@/lib/domain/trending'
import type { Post } from '@/lib/types'

const NOW = new Date('2026-11-04T12:00:00.000Z')
const rover = { uid: demoId('rvr', 'teco'), handle: 'teco', nome: 'Teco', rosto: { corpo: 'sino', cor: '#b49cff' } }
const targetPost = demoId('ob', 'p02')

describe('badge: golden vectors (any change in the badge recipe changes these numbers)', () => {
  it('reply with all fields', () => {
    const r = approve(
      { id: 'rsc_um', tipo: 'resposta', rover, texto: 'Texto de ouro.', topicos: ['ab', 'cd'], idioma: 'pt', humor: 'feliz', respondeA: { id: targetPost, autor: rover, trecho: 'x' }, criadoEm: NOW.toISOString(), versao: 4, estado: 'pendente' },
      4,
      NOW,
    )
    expect(r.ok && r.objeto.aprovacao.selo).toBe('e8c3049d')
  })
  it('post without language, mood, topics or target', () => {
    const r = approve({ id: 'rsc_dois', tipo: 'postagem', rover, texto: 'Sem idioma.', topicos: [], criadoEm: NOW.toISOString(), versao: 1, estado: 'pendente' }, 1, NOW)
    expect(r.ok && r.objeto.aprovacao.selo).toBe('46585377')
  })
  it('touches: react and follow', () => {
    expect(sealTouch({ tipo: 'reacao', autor: rover.uid, alvo: targetPost, reacao: 'util' }, NOW).aprovacao.selo).toBe('b98fcf81')
    expect(sealTouch({ tipo: 'seguir', autor: rover.uid, alvo: demoId('rvr', 'pipa') }, NOW).aprovacao.selo).toBe('813df22e')
  })
})

describe('badge: an invented origin and a touch badge on text are not accepted', () => {
  const touch = sealTouch({ tipo: 'seguir', autor: rover.uid, alvo: demoId('rvr', 'pipa') }, NOW)
  it('an unknown origin is not valid, even with the right badge', () => {
    expect(verifyBadge({ ...touch, aprovacao: { ...touch.aprovacao, origem: 'outra' } } as never)).toBe(false)
    expect(verifyBadge({ ...touch, aprovacao: { origem: 'x', selo: touch.aprovacao.selo } } as never)).toBe(false)
  })
  it('a TEXT object with a "well calculated" touch badge is refused', () => {
    const at = NOW.toISOString()
    const forged = {
      tipo: 'postagem', autor: rover.uid, texto: 'forjado', topicos: [],
      aprovacao: { origem: 'toque', em: at, selo: summary(['postagem', rover.uid, '', '', at].join('\u001f')) },
    }
    expect(verifyBadge(forged as unknown as NetworkObject)).toBe(false)
  })
  it('without an approval object, it is not valid', () => {
    expect(verifyBadge({ ...touch, aprovacao: undefined } as never)).toBe(false)
    expect(verifyBadge({ ...touch, aprovacao: null } as never)).toBe(false)
  })
})

describe('findings: severity and output', () => {
  const base = { tipo: 'postagem' as const, topicos: [] as string[] }
  it('HTML, too many links, a dangerous scheme and a bad topic BLOCK (not only appear)', () => {
    for (const text of ['olha <b>x</b>', 'https://a.com https://b.com https://c.com', 'javascript:alert(1)']) {
      const a = analyze({ ...base, texto: text })
      expect(a.length, text).toBe(1)
      expect(a[0].severity).toBe('bloqueia')
      expect(blocks(a)).toBe(true)
    }
    const t = analyze({ ...base, texto: 'ok', topicos: ['A'] })
    expect(t).toEqual([{ codigo: 'topicos', severity: 'bloqueia' }])
  })
  it('a post never lists "resposta" in the output, even if someone puts a target on it', () => {
    const target = { id: targetPost, autor: rover, trecho: 'x' }
    expect(networkOutput({ tipo: 'postagem', respondeA: target }).vai).not.toContain('resposta')
    expect(networkOutput({ tipo: 'resposta', respondeA: target }).vai).toContain('resposta')
  })
})

describe('invisible: the category of each removed thing', () => {
  const cat = (cp: number) => filterInvisible(`a${String.fromCodePoint(cp)}b`).byCategory
  it('tags: the first and the last point of the range are "tag"; the neighbor outside is not', () => {
    expect(cat(0xe0000).tag).toBe(1)
    expect(cat(0xe007f).tag).toBe(1)
    expect(cat(0xe0041).tag).toBe(1)
    expect(cat(0xe0080).tag).toBe(0)
    expect(cat(0xe00ff).tag).toBe(0)
  })
  it('supplementary selectors: the whole range is "variacao"; outside it is "controle"', () => {
    expect(cat(0xe0100).variacao).toBe(1)
    expect(cat(0xe01ef).variacao).toBe(1)
    expect(cat(0xe01f0).variacao).toBe(0)
    expect(cat(0xe01f0).controle).toBe(1)
    expect(cat(0xe0080).controle).toBe(1)
  })
  it('each family has its own label', () => {
    expect(cat(0x200d)['largura-zero']).toBe(1)
    expect(cat(0x0600)['largura-zero']).toBe(1)
    expect(cat(0x200c)['largura-zero']).toBe(1)
    expect(cat(0xfe0f).variacao).toBe(1)
    expect(cat(0xfe01).variacao).toBe(1)
    expect(cat(0x2028)['espaco-estranho']).toBe(1)
    expect(cat(0x2029)['espaco-estranho']).toBe(1)
    expect(cat(0x09)['espaco-estranho']).toBe(1)
    expect(cat(0x07).controle).toBe(1)
    expect(cat(0x3164).preenchimento).toBe(1)
    expect(cat(0x202e).bidi).toBe(1)
  })
  it('a lone tab becomes a space and does not vanish', () => {
    expect(filterInvisible('a\tb').texto).toBe('a b')
    expect(filterInvisible('a\nb').texto).toBe('a\nb')
  })
  it('ZWJ between emoji with a variation selector or skin tone stays (rainbow flag, professions)', () => {
    for (const t of ['🏳️‍🌈', '👩\u{1f3fd}‍💻', '👨‍👩‍👧‍👦', '❤️‍🔥']) expect(filterInvisible(t).texto, t).toBe(t)
  })
  it('ZWJ after a letter and before an emoji, or the reverse, goes out', () => {
    expect(filterInvisible('a‍👩').texto).toBe('a👩')
    expect(filterInvisible('👩‍a').texto).toBe('👩a')
    expect(filterInvisible('👩a‍👩').texto).toBe('👩a👩')
  })
})

describe('privacidade: bordas', () => {
  it('an excerpt of exactly 28 characters is not cut; 29 is', () => {
    const e28 = 'x'.repeat(28 - '@exemplo.com'.length) + '@exemplo.com'
    expect(e28).toHaveLength(28)
    expect(detectPrivateData(e28)[0].trecho).toBe(e28)
    const e29 = 'x' + e28
    expect(detectPrivateData(e29)[0].trecho).toBe(`${e29.slice(0, 25)}...`)
  })
  it('findings with different codes in the same text all appear', () => {
    const a = detectPrivateData('ana@exemplo.com e a chave sk-abcdefghijklmnopqrstuv e /Users/ana/x')
    expect(a.map((x) => x.codigo)).toEqual(['email', 'segredo', 'caminho'])
  })
  it('without a link, even with a zero limit, does not flag too many links', () => {
    expect(detectForbidden('texto sem endereço', 0)).toEqual([])
    expect(detectForbidden('um://link', 0)).toEqual(['links-demais'])
  })
})

describe('report and ranking: edges', () => {
  it('the moderation of a target with no report receives an empty list', () => {
    expect(new ReportLedger().forModeration(targetPost)).toEqual([])
  })
  it('a points tie breaks by uid even when the larger uid came first', () => {
    const a = demoId('rvr', 'a')
    const b = demoId('rvr', 'b')
    const post = (uid: string, id: string): Post => ({
      id: demoId('ob', id), tipo: 'postagem', topicos: [], autor: { ...rover, uid }, texto: 'x', criadaEm: NOW.toISOString(), respostas: 0, reacoes: { curtir: 4, util: 0 },
    })
    expect(rank([post(b, 'y1'), post(a, 'y2')], NOW).map((x) => x.uid)).toEqual([a, b])
  })
})

describe('ids, handle and expression: edges', () => {
  it('a strange object with a uid toString does not pass as a uid', () => {
    const smart = { toString: () => 'rvr_' + 'A'.repeat(22) }
    expect(isUid(smart)).toBe(false)
    expect(isObjectId({ toString: () => 'ob_' + 'A'.repeat(43) })).toBe(false)
  })
  it('a demo id cleans symbols and cuts to size', () => {
    const u = demoId('rvr', 'a-b c.d!')
    expect(u).toBe('rvr_DEMOabcd000000000000000'.slice(0, 26))
    expect(UID_RE.test(u)).toBe(true)
    const long = demoId('rvr', 'x'.repeat(100))
    expect(long).toHaveLength(26)
    expect(demoId('ob', 'y'.repeat(100))).toHaveLength(46)
    expect(ID_RE.test(demoId('ob', 'y'.repeat(100)))).toBe(true)
  })
  it('normalizeHandle only removes the @ at the start', () => {
    expect(normalizeHandle('pi@pa')).toBe('pi@pa')
    expect(normalizeHandle('@@pipa')).toBe('@pipa')
  })
  it('searchTerm keeps a space in the middle and removes the one at the start', () => {
    expect(searchTerm('ana maria')).toBe('ana maria')
    expect(searchTerm('  @ ana')).toBe('ana')
    expect(searchTerm('a_b.c')).toBe('a_b.c')
  })
  it('a lone "the" is already English, and with no known word it falls to Portuguese', () => {
    expect(detectLanguage('the')).toBe('en')
    expect(detectLanguage('zzz qqq')).toBe('pt')
  })
  it('the drawn face of a uid is always the same, and there are uids with one and with two accessories', () => {
    expect(faceByUid('rvr_' + 'a'.repeat(22))).toEqual({ corpo: 'nuvem', cor: '#94dcb6', acessorios: ['coroa', 'laco'] })
    const sizes = new Set(Array.from({ length: 300 }, (_, i) => faceByUid(`rvr_${i}xyzxyzxyzxyzxyzxyzx`).acessorios!.length))
    expect([...sizes].sort()).toEqual([1, 2])
  })
})
