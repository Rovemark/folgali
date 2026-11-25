// Paridade do filtro de texto social com o validador do protocolo 0.3 (packages/protocolo, `validarTexto` com
// `v3: true`). O cliente confere o texto ANTES de pedir a aprovação; se aprovasse algo que o relé recusa, a
// pessoa aprovaria à toa. Sorteia milhares de textos com menções, tags, links bons e ruins, CEP, coordenadas,
// números e HTML e exige:
//   1) tudo que o cliente deixa passar, o protocolo também aceita;
//   2) tudo que o protocolo recusa por link, menção, hashtag ou dado pessoal, o cliente também trava.
// O protocolo 0.3 mora no repositório principal, na branch feat/social. Onde ele não existir (o site foi copiado
// sozinho, ou o protocolo ainda é o 0.2), o teste se desliga e diz por quê. Para apontar a outra cópia:
//   ROVER_PROTOCOLO_03=/caminho/packages/protocolo/src/index.js npm test
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { analisarSocial, bloqueiaSocial, type RascunhoSocial } from '@/lib/dominio/aprovacao-social'
import { filtrarInvisiveis } from '@/lib/dominio/invisivel'
import { normalizar } from '@/lib/dominio/limites'

const candidatos = [process.env.ROVER_PROTOCOLO_03, fileURLToPath(new URL('../../../protocolo/src/index.js', import.meta.url))].filter((x): x is string => !!x)
const caminho = candidatos.find((c) => existsSync(c))

type Protocolo = { validarTexto: (v: unknown, r: Record<string, unknown>) => string | null; validarLinks?: unknown; extrairHashtags?: unknown; LIMITES_SOCIAIS?: { mencoesPorTexto: number; hashtagsPorTexto: number; linkCaracteres: number } }
const P = caminho ? ((await import(/* @vite-ignore */ caminho)) as Protocolo) : null
const tem03 = !!P && typeof P.validarLinks === 'function' && typeof P.extrairHashtags === 'function'
const motivo = !caminho ? 'o protocolo não está ao lado do site' : !tem03 ? 'o protocolo encontrado é anterior à 0.3 (sem validarLinks/extrairHashtags)' : ''

describe.skipIf(!tem03)(`paridade do texto social com o protocolo 0.3${motivo ? ` (desligado: ${motivo})` : ''}`, () => {
  const REGRAS = { min: 1, max: 1500, multilinha: true, urls: 2, v3: true }
  const rascunho = (texto: string): RascunhoSocial => ({
    id: 'r', tipo: 'pagina-publicar', rover: { uid: 'rvr_x', handle: 'x', nome: 'X', rosto: { corpo: 'sino', cor: '#fff' } },
    campos: { pagina: `ob_${'A'.repeat(43)}`, titulo: null, texto, tags: [] }, destino: null, criadoEm: '2026-11-05T00:00:00Z', versao: 1, estado: 'pendente',
  })
  const cliente = (texto: string) => bloqueiaSocial(analisarSocial(rascunho(texto)))
  const protocolo = (texto: string) => P!.validarTexto(normalizar(filtrarInvisiveis(texto).texto), REGRAS)

  it('os números do protocolo são os do cliente', async () => {
    const { MAX_MENCOES, MAX_HASHTAGS, MAX_LINK } = await import('@/lib/dominio/texto-social')
    expect(P!.LIMITES_SOCIAIS!.mencoesPorTexto).toBe(MAX_MENCOES)
    expect(P!.LIMITES_SOCIAIS!.hashtagsPorTexto).toBe(MAX_HASHTAGS)
    expect(P!.LIMITES_SOCIAIS!.linkCaracteres).toBe(MAX_LINK)
  })

  let semente = 20261105
  const sorte = () => {
    semente = (Math.imul(semente, 1664525) + 1013904223) >>> 0
    return semente / 2 ** 32
  }
  const escolher = <T,>(l: T[]) => l[Math.floor(sorte() * l.length)]
  const PEDACOS = [
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
  const gerar = () => {
    const n = 1 + Math.floor(sorte() * 5)
    return Array.from({ length: n }, () => escolher(PEDACOS)).join(escolher([' ', ' ', '\n', ', ']))
  }

  it('cada pedaço sozinho: o cliente e o protocolo concordam', () => {
    const divergencias: string[] = []
    for (const p of PEDACOS) {
      const c = cliente(p)
      const r = protocolo(p) !== null
      if (c !== r) divergencias.push(`${JSON.stringify(p.slice(0, 60))} cliente=${c ? 'trava' : 'passa'} protocolo=${r ? 'recusa' : 'aceita'}`)
    }
    expect(divergencias).toEqual([])
  })

  it('5000 textos sorteados: o cliente nunca aprova o que o protocolo recusa, e trava o que o protocolo recusa por link, marca ou dado pessoal', () => {
    const aprovouErrado: string[] = []
    const deixouPassar: string[] = []
    for (let i = 0; i < 5000; i++) {
      const t = gerar()
      const c = cliente(t)
      const r = protocolo(t)
      if (!c && r !== null) aprovouErrado.push(`${JSON.stringify(t.slice(0, 120))} → ${r}`)
      if (c && r === null) deixouPassar.push(JSON.stringify(t.slice(0, 120)))
    }
    expect(aprovouErrado.slice(0, 5)).toEqual([])
    // o cliente pode ser mais estrito só no que o relé não olha (a lista de falsos bloqueios tem de ficar vazia aqui)
    expect(deixouPassar.slice(0, 5)).toEqual([])
  })
})

describe.skipIf(tem03)('paridade do texto social com o protocolo 0.3 (desligada)', () => {
  it.skip(`desligada: ${motivo}`, () => {})
})
