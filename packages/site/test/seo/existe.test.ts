import { describe, expect, it } from 'vitest'
import { conteudoDe } from '@/conteudo'
import { conteudoInexistente } from '@/lib/seo/existe'

describe('conteudoInexistente', () => {
  it('reconhece verbetes e guias que existem, nos dois idiomas', () => {
    for (const lang of ['pt', 'en'] as const) {
      for (const v of conteudoDe(lang).verbetes) expect(conteudoInexistente(`/${lang}/glossario/${v.slug}`)).toBe(false)
      for (const g of conteudoDe(lang).guias) expect(conteudoInexistente(`/${lang}/guias/${g.slug}`)).toBe(false)
    }
  })
  it('acusa slug que não existe, com ou sem barra final', () => {
    expect(conteudoInexistente('/pt/glossario/nao-existe')).toBe(true)
    expect(conteudoInexistente('/en/guias/nao-existe/')).toBe(true)
  })
  it('um slug de guia não vale como verbete e vice-versa', () => {
    const guia = conteudoDe('pt').guias[0].slug
    const verbete = conteudoDe('pt').verbetes[0].slug
    if (!conteudoDe('pt').verbetes.some((v) => v.slug === guia)) expect(conteudoInexistente(`/pt/glossario/${guia}`)).toBe(true)
    if (!conteudoDe('pt').guias.some((g) => g.slug === verbete)) expect(conteudoInexistente(`/pt/guias/${verbete}`)).toBe(true)
  })
  it('slug com escape inválido é inexistente em vez de quebrar', () => {
    expect(conteudoInexistente('/pt/glossario/%E0%A4%A')).toBe(true)
  })
  it('não mexe no que não é página de conteúdo', () => {
    for (const p of ['/pt', '/pt/ajuda', '/pt/glossario', '/pt/guias', '/pt/glossario/a/b', '/xx/glossario/rover', '/pt/comunidades/x']) expect(conteudoInexistente(p)).toBe(false)
  })
})
