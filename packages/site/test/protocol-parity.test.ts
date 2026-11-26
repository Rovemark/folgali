// Parity with protocol 0.1 (packages/protocol, in the same repository). The web client cleans and checks the
// text BEFORE asking for approval; if it approved a text the relay will refuse, the person would approve for nothing.
// This test draws thousands of texts with hidden characters, personal data and HTML and requires:
//   1) everything the client lets pass, the protocol also accepts;
//   2) everything the protocol refuses for personal data, HTML or a link, the client also blocks.
// If the protocol is not next door (the site was copied alone), the test switches itself off and says why.

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { analyze, blocks } from '@/lib/domain/approval'
import { filterInvisible } from '@/lib/domain/invisible'
import { normalize } from '@/lib/domain/limits'

const path = fileURLToPath(new URL('../../protocol/src/index.js', import.meta.url))
const has = existsSync(path)

type Protocol = { validateText: (v: unknown, r: { min?: number; max: number; multilinha?: boolean; urls?: number }) => string | null; LIMITS: { postagem: { max: number }; resposta: { max: number }; nome: { max: number }; descricao: { max: number } } }

describe.skipIf(!has)('parity with protocol 0.1', async () => {
  const P = (has ? await import(/* @vite-ignore */ path) : null) as Protocol
  const RULES = { min: 1, max: 1500, multilinha: true, urls: 2 }

  it('the text limits are the same', async () => {
    const { LIMITS } = await import('@/lib/domain/limits')
    expect(LIMITS.postagem).toBe(P.LIMITS.postagem.max)
    expect(LIMITS.resposta).toBe(P.LIMITS.resposta.max)
    expect(LIMITS.nome).toBe(P.LIMITS.nome.max)
    expect(LIMITS.apresentacao).toBe(P.LIMITS.descricao.max)
  })

  // deterministic generator
  let seed = 20261104
  const luck = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 2 ** 32
  }
  const choose = <T,>(l: T[]) => l[Math.floor(luck() * l.length)]

  const CHUNKS = [
    'Olá', ' ', ' ', ' ', 'mundo', '\n', '\n\n', '\n\n\n\n', 'ação', 'e\u0301', '👨\u200d👩\u200d👧', '🏳\ufe0f\u200d🌈', '👩\u{1f3fd}\u200d💻', '❤\ufe0f', '1\ufe0f\u20e3', '🏴\u{E0067}\u{E007F}', 'a\u200bb', '\u200c', '\u200d', '\u202e', '\u2066', '\u00ad', '\ufeff', '\u3164', '\u2800', '\u00a0', '\u2003', '\t', '\u0000', '\u0085', '\u2028',
    '\ue000', '\u0378', '\ud800', '\u0600', '\u034f', '\ufe01', '\u{E0100}', '\u0301\u0302\u0303\u0304\u0305', 'x@exemplo.com', '(11)91234-5678', '123.456.789-09', '4111 1111 1111 1111', '/Users/maria/doc', 'C:\\Users\\ana\\x', 'sk-abcdefghijklmnopqrstuv',
    'ghp_' + 'a'.repeat(36), 'a'.repeat(41), '<b>', '&#60;', 'a &amp; b', 'javascript:alert(1)', 'https://a.com', 'https://b.com', 'https://c.com', 'ob_' + 'A'.repeat(43), 'rvr_' + 'A'.repeat(22), '2 < 3', '412 arquivos', 'مرحبا', '日本語', '😀',
  ]
  const draw = () => Array.from({ length: 1 + Math.floor(luck() * 6) }, () => choose(CHUNKS)).join('')

  it('3000 lucky texts: what the client lets pass the protocol accepts', () => {
    const holes: string[] = []
    let accepted = 0
    for (let i = 0; i < 3000; i++) {
      const rawValue = draw()
      const clean = normalize(filterInvisible(rawValue).texto)
      if (clean.length === 0) continue
      const findings = analyze({ tipo: 'postagem', texto: rawValue, topicos: [] })
      if (blocks(findings)) continue
      accepted++
      const verdict = P.validateText(clean, RULES)
      if (verdict !== null) holes.push(`${JSON.stringify(rawValue)} -> ${JSON.stringify(clean)} :: ${verdict}`)
    }
    expect(holes.slice(0, 5)).toEqual([])
    expect(accepted).toBeGreaterThan(300)
  })

  it('3000 lucky texts: personal data, HTML and links the protocol refuses also block the client', () => {
    const holes: string[] = []
    let refused = 0
    for (let i = 0; i < 3000; i++) {
      const clean = normalize(filterInvisible(draw()).texto)
      if (clean.length === 0) continue
      const verdict = P.validateText(clean, RULES)
      if (verdict === null) continue
      if (!/dado|e-mail|chave|segredo|número|caminho|HTML|link|esquema|parece conter|endereço/i.test(verdict)) continue
      refused++
      if (!blocks(analyze({ tipo: 'postagem', texto: clean, topicos: [] }))) holes.push(`${JSON.stringify(clean)} :: ${verdict}`)
    }
    expect(holes.slice(0, 5)).toEqual([])
    expect(refused).toBeGreaterThan(300)
  })

  it('hand-written edge cases', () => {
    const cases = ['Texto simples.', 'linha 1\nlinha 2', '👨\u200d👩\u200d👧 família', 'oi\u200b', 'a\u0301\u0302\u0303\u0304\u0305b', 'valor 2 < 3 e 5 > 4', 'rvr_' + 'A'.repeat(22)]
    for (const c of cases) {
      const clean = normalize(filterInvisible(c).texto)
      const inClient = !blocks(analyze({ tipo: 'postagem', texto: c, topicos: [] }))
      const inProtocol = P.validateText(clean, RULES) === null
      if (inClient) expect(inProtocol, JSON.stringify(c)).toBe(true)
    }
  })
})

describe.skipIf(has)('without the protocol next to it', () => {
  it('warns that the parity was not checked', () => {
    expect(has).toBe(false)
  })
})
