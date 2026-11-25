// Paridade com o protocolo 0.1 (packages/protocolo, no mesmo repositório). O cliente web limpa e confere o
// texto ANTES de pedir a aprovação; se ele aprovasse um texto que o relé vai recusar, a pessoa aprovaria à toa.
// Este teste sorteia milhares de textos com caracteres escondidos, dados pessoais e HTML e exige:
//   1) tudo que o cliente deixa passar, o protocolo também aceita;
//   2) tudo que o protocolo recusa por dado pessoal, HTML ou link, o cliente também trava.
// Se o protocolo não estiver ao lado (o site foi copiado sozinho), o teste se desliga e diz por quê.

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { analisar, bloqueia } from '@/lib/dominio/aprovacao'
import { filtrarInvisiveis } from '@/lib/dominio/invisivel'
import { normalizar } from '@/lib/dominio/limites'

const caminho = fileURLToPath(new URL('../../protocolo/src/index.js', import.meta.url))
const tem = existsSync(caminho)

type Protocolo = { validarTexto: (v: unknown, r: { min?: number; max: number; multilinha?: boolean; urls?: number }) => string | null; LIMITES: { postagem: { max: number }; resposta: { max: number }; nome: { max: number }; descricao: { max: number } } }

describe.skipIf(!tem)('paridade com o protocolo 0.1', async () => {
  const P = (tem ? await import(/* @vite-ignore */ caminho) : null) as Protocolo
  const REGRAS = { min: 1, max: 1500, multilinha: true, urls: 2 }

  it('os limites de texto são os mesmos', async () => {
    const { LIMITES } = await import('@/lib/dominio/limites')
    expect(LIMITES.postagem).toBe(P.LIMITES.postagem.max)
    expect(LIMITES.resposta).toBe(P.LIMITES.resposta.max)
    expect(LIMITES.nome).toBe(P.LIMITES.nome.max)
    expect(LIMITES.apresentacao).toBe(P.LIMITES.descricao.max)
  })

  // gerador determinístico
  let semente = 20261104
  const sorte = () => {
    semente = (Math.imul(semente, 1664525) + 1013904223) >>> 0
    return semente / 2 ** 32
  }
  const escolher = <T,>(l: T[]) => l[Math.floor(sorte() * l.length)]

  const PEDACOS = [
    'Olá', ' ', ' ', ' ', 'mundo', '\n', '\n\n', '\n\n\n\n', 'ação', 'e\u0301', '👨\u200d👩\u200d👧', '🏳\ufe0f\u200d🌈', '👩\u{1f3fd}\u200d💻', '❤\ufe0f', '1\ufe0f\u20e3', '🏴\u{E0067}\u{E007F}', 'a\u200bb', '\u200c', '\u200d', '\u202e', '\u2066', '\u00ad', '\ufeff', '\u3164', '\u2800', '\u00a0', '\u2003', '\t', '\u0000', '\u0085', '\u2028',
    '\ue000', '\u0378', '\ud800', '\u0600', '\u034f', '\ufe01', '\u{E0100}', '\u0301\u0302\u0303\u0304\u0305', 'x@exemplo.com', '(11)91234-5678', '123.456.789-09', '4111 1111 1111 1111', '/Users/maria/doc', 'C:\\Users\\ana\\x', 'sk-abcdefghijklmnopqrstuv',
    'ghp_' + 'a'.repeat(36), 'a'.repeat(41), '<b>', '&#60;', 'a &amp; b', 'javascript:alert(1)', 'https://a.com', 'https://b.com', 'https://c.com', 'ob_' + 'A'.repeat(43), 'rvr_' + 'A'.repeat(22), '2 < 3', '412 arquivos', 'مرحبا', '日本語', '😀',
  ]
  const sortear = () => Array.from({ length: 1 + Math.floor(sorte() * 6) }, () => escolher(PEDACOS)).join('')

  it('3000 textos sortudos: o que o cliente deixa passar o protocolo aceita', () => {
    const furos: string[] = []
    let aceitos = 0
    for (let i = 0; i < 3000; i++) {
      const bruto = sortear()
      const limpo = normalizar(filtrarInvisiveis(bruto).texto)
      if (limpo.length === 0) continue
      const achados = analisar({ tipo: 'postagem', texto: bruto, topicos: [] })
      if (bloqueia(achados)) continue
      aceitos++
      const veredito = P.validarTexto(limpo, REGRAS)
      if (veredito !== null) furos.push(`${JSON.stringify(bruto)} -> ${JSON.stringify(limpo)} :: ${veredito}`)
    }
    expect(furos.slice(0, 5)).toEqual([])
    expect(aceitos).toBeGreaterThan(300)
  })

  it('3000 textos sortudos: dado pessoal, HTML e links que o protocolo recusa também travam o cliente', () => {
    const furos: string[] = []
    let recusados = 0
    for (let i = 0; i < 3000; i++) {
      const limpo = normalizar(filtrarInvisiveis(sortear()).texto)
      if (limpo.length === 0) continue
      const veredito = P.validarTexto(limpo, REGRAS)
      if (veredito === null) continue
      if (!/dado|e-mail|chave|segredo|número|caminho|HTML|link|esquema|parece conter|endereço/i.test(veredito)) continue
      recusados++
      if (!bloqueia(analisar({ tipo: 'postagem', texto: limpo, topicos: [] }))) furos.push(`${JSON.stringify(limpo)} :: ${veredito}`)
    }
    expect(furos.slice(0, 5)).toEqual([])
    expect(recusados).toBeGreaterThan(300)
  })

  it('casos de borda escritos à mão', () => {
    const casos = ['Texto simples.', 'linha 1\nlinha 2', '👨\u200d👩\u200d👧 família', 'oi\u200b', 'a\u0301\u0302\u0303\u0304\u0305b', 'valor 2 < 3 e 5 > 4', 'rvr_' + 'A'.repeat(22)]
    for (const c of casos) {
      const limpo = normalizar(filtrarInvisiveis(c).texto)
      const noCliente = !bloqueia(analisar({ tipo: 'postagem', texto: c, topicos: [] }))
      const noProtocolo = P.validarTexto(limpo, REGRAS) === null
      if (noCliente) expect(noProtocolo, JSON.stringify(c)).toBe(true)
    }
  })
})

describe.skipIf(tem)('sem o protocolo ao lado', () => {
  it('avisa que a paridade não foi conferida', () => {
    expect(tem).toBe(false)
  })
})
