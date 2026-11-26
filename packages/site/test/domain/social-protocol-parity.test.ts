// Parity of the social text filter with the protocol 0.3 validator (packages/protocol, `validateText` with
// `v3: true`). The client checks the text BEFORE asking for approval; if it approved something the relay refuses, the
// person would approve for nothing. It draws thousands of texts with mentions, tags, good and bad links, postal codes, coordinates,
// numbers and HTML and requires:
//   1) everything the client lets pass, the protocol also accepts;
//   2) everything the protocol refuses for a link, mention, hashtag or personal data, the client also blocks.
// Protocol 0.3 lives in the main repository, on the feat/social branch. Where it does not exist (the site was copied
// alone, or the protocol is still 0.2), the test switches itself off and says why. To point to the other copy:
//   ROVER_PROTOCOLO_03=/caminho/packages/protocol/src/index.js npm test
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseSocial, blocksSocial, type SocialDraft } from '@/lib/domain/social-approval'
import { filterInvisible } from '@/lib/domain/invisible'
import { normalize } from '@/lib/domain/limits'

const candidates = [process.env.ROVER_PROTOCOLO_03, fileURLToPath(new URL('../../../protocol/src/index.js', import.meta.url))].filter((x): x is string => !!x)
const path = candidates.find((c) => existsSync(c))

type Protocol = { validateText: (v: unknown, r: Record<string, unknown>) => string | null; validateLinks?: unknown; extractHashtags?: unknown; SOCIAL_LIMITS?: { mencoesPorTexto: number; hashtagsPorTexto: number; linkChars: number } }
const P = path ? ((await import(/* @vite-ignore */ path)) as Protocol) : null
const has03 = !!P && typeof P.validateLinks === 'function' && typeof P.extractHashtags === 'function'
const reason = !path ? 'the protocol is not next to the site' : !has03 ? 'the protocol found is older than 0.3 (no validateLinks/extractHashtags)' : ''

describe.skipIf(!has03)(`social text parity with protocol 0.3${reason ? ` (off: ${reason})` : ''}`, () => {
  const RULES = { min: 1, max: 1500, multilinha: true, urls: 2, v3: true }
  const draft = (text: string): SocialDraft => ({
    id: 'r', tipo: 'pagina-publicar', rover: { uid: 'rvr_x', handle: 'x', nome: 'X', rosto: { corpo: 'sino', cor: '#fff' } },
    campos: { pagina: `ob_${'A'.repeat(43)}`, titulo: null, texto: text, tags: [] }, destino: null, criadoEm: '2026-11-05T00:00:00Z', versao: 1, estado: 'pendente',
  })
  const client = (text: string) => blocksSocial(parseSocial(draft(text)))
  const protocol = (text: string) => P!.validateText(normalize(filterInvisible(text).texto), RULES)

  it('the protocol numbers are the client\'s', async () => {
    const { MAX_MENTIONS, MAX_HASHTAGS, MAX_LINK } = await import('@/lib/domain/social-text')
    expect(P!.SOCIAL_LIMITS!.mencoesPorTexto).toBe(MAX_MENTIONS)
    expect(P!.SOCIAL_LIMITS!.hashtagsPorTexto).toBe(MAX_HASHTAGS)
    expect(P!.SOCIAL_LIMITS!.linkChars).toBe(MAX_LINK)
  })

  let seed = 20261105
  const luck = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 2 ** 32
  }
  const choose = <T,>(l: T[]) => l[Math.floor(luck() * l.length)]
  const CHUNKS = [
    'Oi, tudo bem?', 'O mapa ficou pronto.', 'Organizei as pastas por ano', 'Data: hoje às 10h', 'arquivo: relatório', 'custa 10.50, 20.25', 'versão 1.2.3.4', 'ótimo trabalho!',
    '@pipa', '@Pipa', '@max.codigo_1', '@ab', '@pipa.', 'fulano@exemplo', 'rota/@pipa', '@@pipa', '(@nina)', '@a_b_c', '@nome.com',
    '#fio', '#Fio', '#ab', '#a', '#abc_def', '#café', '#ação', `#${'a'.repeat(24)}`, `#${'a'.repeat(25)}`, '#-ab', 'a#tag', '##tag', '(#tag)', '#a1-b2',
    'https://exemplo.com/a', 'https://www.exemplo.com.br/x?q=1', 'http://exemplo.com', 'ftp://exemplo.com', 'https://127.0.0.1/a', 'https://localhost/a', 'https://u:p@exemplo.com', 'https://exemplo.com:8443/a',
    'https://exemplo.com:443/a', 'https://xn--bcher-kva.example', 'https://bit.ly/abc', 'https://www.t.co/x', 'https://exemplo.com/?utm_source=x', 'https://exemplo.com/?fbclid=1', 'https://exemplo.com/?ok=1&UTM_medium=x',
    'https://a_b.com', 'https://-a.com', 'https://impressora.local', 'https://x.internal', 'https://semponto', `https://exemplo.com/${'a'.repeat(190)}`, `https://exemplo.com/${'a'.repeat(170)}`, 'veja https://exemplo.com/a.', '(https://b.org/x),',
    'javascript:alert(1)', 'JavaScript :x', 'vbscript:x', 'data:text/html,abc', 'file:/etc/passwd', 'blob:https://a.com/x',
    '12345-678', '-12345-678', '12345-6789', '12345-678-9', 'moro no 01310-100', '-23.5505, -46.6333', '23.5505,46.6333', '12.34, 56.78', '12.345, 67.890', '1234.5678, 12.3456',
    'ana@exemplo.com', '11 98765-4321', '/Users/ana/x', '<b>oi</b>', 'a &amp; b',
  ]
  const generate = () => {
    const n = 1 + Math.floor(luck() * 5)
    return Array.from({ length: n }, () => choose(CHUNKS)).join(choose([' ', ' ', '\n', ', ']))
  }

  it('each piece alone: the client and the protocol agree', () => {
    const divergences: string[] = []
    for (const p of CHUNKS) {
      const c = client(p)
      const r = protocol(p) !== null
      if (c !== r) divergences.push(`${JSON.stringify(p.slice(0, 60))} cliente=${c ? 'trava' : 'passa'} protocolo=${r ? 'recusa' : 'aceita'}`)
    }
    expect(divergences).toEqual([])
  })

  it('5000 drawn texts: the client never approves what the protocol refuses, and blocks what the protocol refuses for a link, mark or personal data', () => {
    const wronglyApproved: string[] = []
    const letThrough: string[] = []
    for (let i = 0; i < 5000; i++) {
      const t = generate()
      const c = client(t)
      const r = protocol(t)
      if (!c && r !== null) wronglyApproved.push(`${JSON.stringify(t.slice(0, 120))} → ${r}`)
      if (c && r === null) letThrough.push(JSON.stringify(t.slice(0, 120)))
    }
    expect(wronglyApproved.slice(0, 5)).toEqual([])
    // the client may be stricter only on what the relay does not look at (the list of false blocks must stay empty here)
    expect(letThrough.slice(0, 5)).toEqual([])
  })
})

describe.skipIf(has03)('social text parity with protocol 0.3 (off)', () => {
  it.skip(`off: ${reason}`, () => {})
})
