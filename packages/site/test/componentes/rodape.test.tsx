// O rodapé: cada coluna do registro de rotas aparece, cada link aponta para um page.tsx de verdade, o aviso de arte e marca está lá,
// e não há cookie, rastreio nem script. (A varredura de "cada link responde 200 no preview" é scripts/varrer-rodape.mjs.)
import { render, screen, within } from '@testing-library/react'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ pathname: { valor: '/pt/ajuda' } }))
vi.mock('next/navigation', () => ({ usePathname: () => h.pathname.valor, useSearchParams: () => new URLSearchParams('') }))

import Rodape from '@/components/Rodape'
import { entidade } from '@/conteudo'
import { dict, PRONTOS } from '@/lib/i18n'
import { rodapeDict, rotuloDe } from '@/lib/i18n-extra'
import { ROTAS, SECOES_DO_RODAPE, rotasDaSecao } from '@/lib/seo/rotas'

const raiz = join(__dirname, '..', '..')

/** `/guias/como-funciona-a-aprovacao-humana` -> a pasta `guias/[slug]`: um segmento dinâmico casa qualquer coisa. */
function paginaExiste(caminho: string): boolean {
  const segs = caminho.split('/').filter(Boolean)
  let dir = join(raiz, 'src/app/[lang]')
  for (const s of segs) {
    const exato = join(dir, s)
    if (existsSync(exato)) {
      dir = exato
      continue
    }
    const dinamico = ['[slug]', '[id]', '[handle]'].map((x) => join(dir, x)).find((x) => existsSync(x))
    if (!dinamico) return false
    dir = dinamico
  }
  return existsSync(join(dir, 'page.tsx'))
}

describe('toda rota do registro tem uma página de verdade', () => {
  it.each(ROTAS.filter((r) => r.externo === undefined).map((r) => [r.id, r.caminho]))('%s (%s)', (_id, caminho) => {
    expect(paginaExiste(caminho as string)).toBe(true)
  })
  it('o verificador não aceita rota inventada', () => {
    expect(paginaExiste('/isto-nao-existe')).toBe(false)
    expect(paginaExiste('/desenvolvedores/nao-existe')).toBe(false)
  })
})

describe.each(['pt', 'en'] as const)('Rodape em %s', (lang) => {
  const r = rodapeDict(lang)
  const renderizar = (demonstracao = true) => render(<Rodape lang={lang} demonstracao={demonstracao} />)

  it('tem as seis colunas, com título, na ordem do registro', () => {
    renderizar()
    const titulos = screen.getAllByRole('heading', { level: 2 }).map((n) => n.textContent)
    expect(titulos).toEqual(SECOES_DO_RODAPE.map((s) => (r.secoes as Record<string, string>)[s]))
  })

  it('cada item de cada coluna é um link, com o rótulo do idioma e o endereço do idioma', () => {
    renderizar()
    for (const s of SECOES_DO_RODAPE) {
      const coluna = screen.getByRole('region', { name: (r.secoes as Record<string, string>)[s] })
      for (const rota of rotasDaSecao(s)) {
        const link = within(coluna).getByRole('link', { name: new RegExp(`^${rotuloDe(lang, rota.id)}`) })
        if (rota.externo !== undefined) {
          expect(link).toHaveAttribute('href', rota.externo)
          expect(link).toHaveAttribute('rel', 'noopener')
          expect(link).toHaveAttribute('target', '_blank')
        } else {
          expect(link).toHaveAttribute('href', `/${lang}${rota.caminho}`)
        }
      }
    }
  })

  it('link externo avisa o leitor de tela que abre outro site', () => {
    renderizar()
    const ext = screen.getByRole('link', { name: new RegExp(`^${rotuloDe(lang, 'rovemark')}`) })
    expect(ext.textContent).toContain(r.abreEmNovaAba)
  })

  it('nenhum link é vazio, "#" ou javascript:', () => {
    const { container } = renderizar()
    for (const a of container.querySelectorAll('a')) {
      const href = a.getAttribute('href') ?? ''
      expect(href, a.textContent ?? '').not.toBe('')
      expect(href).not.toBe('#')
      expect(href).not.toMatch(/^javascript:/i)
    }
  })

  it('leva a descrição da entidade, o aviso de arte e marca, a licença e a versão do protocolo', () => {
    const { container } = renderizar()
    expect(screen.getByText(r.marca.descricao)).toBeInTheDocument()
    expect(screen.getByText(dict(lang).rodape.linha2)).toBeInTheDocument()
    expect(container.textContent).toContain('AGPL-3.0')
    expect(container.textContent).toContain(entidade.revisaoDoRascunho)
    expect(container.textContent).toContain(String(new Date().getFullYear()))
  })

  it('o aviso de demonstração só aparece quando o site está em demonstração', () => {
    const { container, unmount } = renderizar(true)
    expect(container.textContent).toContain(r.demo)
    unmount()
    const dois = renderizar(false)
    expect(dois.container.textContent).not.toContain(r.demo)
  })

  it('o seletor de idiomas liga os idiomas com texto, mantém a página e marca o atual', () => {
    h.pathname.valor = `/${lang}/ajuda`
    renderizar()
    const lista = screen.getByRole('list', { name: r.idioma })
    const links = within(lista).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual(PRONTOS.map((l) => `/${l}/ajuda`))
    expect(links.find((l) => l.getAttribute('aria-current') === 'true')?.getAttribute('href')).toBe(`/${lang}/ajuda`)
  })

  it('é um rodapé de verdade, com navegação rotulada, e sem script, cookie ou imagem de rastreio', () => {
    const { container } = renderizar()
    expect(container.querySelector('footer')).toBeInTheDocument()
    expect(screen.getAllByRole('navigation', { name: r.navegacao }).length).toBeGreaterThan(0)
    expect(container.querySelector('script, iframe, img[src^="http"]')).toBeNull()
  })
})
