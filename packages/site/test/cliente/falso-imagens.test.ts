// 0.5.0: as imagens da demonstração são GERADAS em código e passam pela MESMA limpeza do protocolo sem mudar um byte (já nascem
// limpas), com o hash do protocolo; são pequenas; o texto alternativo segue as regras de texto; e o cliente falso as entrega.
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { ClienteFalso } from '@/lib/cliente-falso'
import { idDeDemonstracao } from '@/lib/dominio/ids'
import { sanearImagem, sanearImagens, urlDaImagem } from '@/lib/imagens'
import { todasAsImagensDeDemonstracao } from '@/lib/social/falso/imagens'
import { GET } from '@/app/midia/[arquivo]/route'

// o protocolo é JavaScript puro do mesmo repositório: a demonstração é conferida pela função de verdade
// @ts-expect-error módulo JS sem tipos
import { limparImagem, validarTexto } from '../../../protocolo/src/index.js'

describe('imagens geradas da demonstração', () => {
  const todas = todasAsImagensDeDemonstracao()
  it('existem, são PNG pequenos (até 8 KB) e já limpos: a limpeza do protocolo devolve os mesmos bytes e o mesmo hash', () => {
    expect(todas.length).toBeGreaterThanOrEqual(5)
    for (const i of todas) {
      expect(i.bytes.length).toBeLessThanOrEqual(8192)
      const r = limparImagem(i.bytes)
      expect(r.ok, i.alt).toBe(true)
      expect(r.hash).toBe(i.hash)
      expect(Buffer.compare(r.bytes, i.bytes)).toBe(0)
      expect([r.formato, r.largura, r.altura]).toEqual([i.formato, i.largura, i.altura])
    }
  })
  it('o texto alternativo de cada uma passa nas regras de texto do protocolo (uma linha, até 280, sem link)', () => {
    for (const i of todas) expect(validarTexto(i.alt, { min: 1, max: 280, multilinha: false, urls: 0, v3: true }), i.alt).toBeNull()
  })
  it('o cliente falso entrega as imagens: anexos da Pipa e da Didi, retrato da Pipa, rascunho da Lumi, e os bytes pelo hash', async () => {
    const c = new ClienteFalso()
    const p02 = (await c.obterObjeto(idDeDemonstracao('ob', 'p02'))).postagem
    expect(p02.imagens).toHaveLength(1)
    const p04 = (await c.obterObjeto(idDeDemonstracao('ob', 'p04'))).postagem
    expect(p04.imagens).toHaveLength(2)
    expect((await c.obterObjeto(idDeDemonstracao('ob', 'p01'))).postagem.imagens).toBeUndefined()
    expect((await c.obterRover('pipa')).retratoImagem?.formato).toBe('png')
    expect((await c.paginaDoRover(idDeDemonstracao('rvr', 'pipa'))).rover.retratoImagem?.alt).toMatch(/cesta de piquenique/)
    expect((await c.rascunho('rsc_demo_01'))?.imagens).toHaveLength(1)
    const bytes = await c.imagem(p02.imagens![0].hash)
    expect(bytes?.formato).toBe('png')
    expect(await c.imagem('0'.repeat(64))).toBeNull()
  })
})

describe('rota /midia/<hash>.<ext> do próprio site', () => {
  const chamar = (arquivo: string) => GET(new Request(`http://site/midia/${arquivo}`), { params: Promise.resolve({ arquivo }) })
  it('serve a imagem com os cabeçalhos do relé: tipo fixo, nosniff, CSP sandbox, cache imutável', async () => {
    const i = todasAsImagensDeDemonstracao()[0]
    const r = await chamar(`${i.hash}.png`)
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toBe('image/png')
    expect(r.headers.get('x-content-type-options')).toBe('nosniff')
    expect(r.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox")
    expect(r.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(Buffer.compare(Buffer.from(await r.arrayBuffer()), i.bytes)).toBe(0)
  })
  it('extensão que não bate com o formato, hash desconhecido ou nome fora do formato: 404', async () => {
    const i = todasAsImagensDeDemonstracao()[0]
    for (const ruim of [`${i.hash}.jpg`, `${i.hash}.svg`, `${'0'.repeat(64)}.png`, '..%2F..%2Fetc.png', `${i.hash.toUpperCase()}.png`, i.hash]) {
      expect((await chamar(ruim)).status, ruim).toBe(404)
    }
  })
})

describe('o que vem do relé passa pela conferência', () => {
  const ok = { hash: 'd'.repeat(64), formato: 'webp', largura: 10, altura: 20, alt: ' Um texto. ' }
  it('imagem válida passa, com o alt aparado; urlDaImagem só monta do hash', () => {
    expect(sanearImagem(ok)).toEqual({ ...ok, alt: 'Um texto.' })
    expect(urlDaImagem({ hash: ok.hash, formato: 'webp' })).toBe(`/midia/${ok.hash}.webp`)
  })
  it('o que não confere vira null; a lista guarda no máximo 4 e só as boas', () => {
    for (const ruim of [null, 'x', { ...ok, hash: 'z'.repeat(64) }, { ...ok, formato: 'gif' }, { ...ok, largura: 4097 }, { ...ok, altura: 0 }, { ...ok, alt: '' }, { ...ok, alt: 'a'.repeat(281) }, { ...ok, src: 'https://outro.exemplo/x.png', hash: undefined }]) {
      expect(sanearImagem(ruim)).toBeNull()
    }
    expect(sanearImagens([ok, { ...ok, formato: 'svg' }, ok, ok, ok, ok])).toHaveLength(3)
    expect(sanearImagens('nada')).toEqual([])
  })
})
