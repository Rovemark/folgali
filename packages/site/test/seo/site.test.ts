import { describe, expect, it } from 'vitest'
import { alternativas, ENTIDADE, indexavel, URL_BASE_PADRAO, urlAbsoluta, urlBase } from '@/lib/site'

describe('indexavel', () => {
  it('é falso sem a variável e com qualquer valor que não seja "sim"', () => {
    expect(indexavel({})).toBe(false)
    for (const v of ['', 'nao', 'true', '1', 'SIM', 'sim ']) expect(indexavel({ ROVER_NETWORK_INDEXAVEL: v }), v).toBe(false)
  })
  it('é verdadeiro só com "sim"', () => {
    expect(indexavel({ ROVER_NETWORK_INDEXAVEL: 'sim' })).toBe(true)
  })
})

describe('urlBase', () => {
  it('usa o padrão sem variável, e tira a barra e o caminho do que vier', () => {
    expect(urlBase({})).toBe(URL_BASE_PADRAO)
    expect(urlBase({ ROVER_NETWORK_URL_BASE: 'https://exemplo.org/' })).toBe('https://exemplo.org')
    expect(urlBase({ ROVER_NETWORK_URL_BASE: 'https://exemplo.org/a/b?c=1' })).toBe('https://exemplo.org')
  })
  it('só aceita https, ou http em localhost; o resto cai no padrão', () => {
    expect(urlBase({ ROVER_NETWORK_URL_BASE: 'http://exemplo.org' })).toBe(URL_BASE_PADRAO)
    expect(urlBase({ ROVER_NETWORK_URL_BASE: 'javascript:alert(1)' })).toBe(URL_BASE_PADRAO)
    expect(urlBase({ ROVER_NETWORK_URL_BASE: 'lixo' })).toBe(URL_BASE_PADRAO)
    expect(urlBase({ ROVER_NETWORK_URL_BASE: 'http://localhost:3961' })).toBe('http://localhost:3961')
    expect(urlBase({ ROVER_NETWORK_URL_BASE: 'http://127.0.0.1:3961' })).toBe('http://127.0.0.1:3961')
  })
})

describe('urlAbsoluta e alternativas', () => {
  it('monta base, idioma e caminho', () => {
    expect(urlAbsoluta('https://x.test', 'pt', '')).toBe('https://x.test/pt')
    expect(urlAbsoluta('https://x.test', 'en', '/ajuda')).toBe('https://x.test/en/ajuda')
  })
  it('hreflang por idioma, mais x-default no idioma padrão', () => {
    const l = alternativas('https://x.test', '/ajuda', [{ lang: 'pt', hreflang: 'pt-BR' }, { lang: 'en', hreflang: 'en' }], 'pt')
    expect(l).toEqual({ 'pt-BR': 'https://x.test/pt/ajuda', en: 'https://x.test/en/ajuda', 'x-default': 'https://x.test/pt/ajuda' })
  })
})

describe('a entidade é sempre a mesma', () => {
  it('nome, empresa e licença batem com o que o rodapé e as páginas dizem', () => {
    expect(ENTIDADE.nome).toBe('folgali')
    expect(ENTIDADE.empresa).toBe('Rovemark')
    expect(ENTIDADE.produtoIrmao).toBe('Rover Hangar')
    expect(ENTIDADE.licenca).toBe('AGPL-3.0')
    expect(ENTIDADE.urlEmpresa).toMatch(/^https:\/\//)
  })
})
