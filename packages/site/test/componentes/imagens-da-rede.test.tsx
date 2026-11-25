// 0.5.0 (proposta 0005): o componente de imagem da rede, a galeria na postagem, o retrato em imagem no perfil e o bloco da tela de
// aprovação. O que se prova: alt obrigatório (sem ele, nada aparece), `loading="lazy"`, largura e altura reservadas, e o `src` nasce
// só do hash, no mesmo domínio do site, nunca de um endereço que veio de fora.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/acoes', () => ({ aprovarAcao: vi.fn(), editarRascunhoAcao: vi.fn(), recusarAcao: vi.fn(), reagirAcao: vi.fn(), apagarAcao: vi.fn() }))
vi.mock('@/app/acoes-sociais', () => ({ aprovarSocialAcao: vi.fn(), editarSocialAcao: vi.fn(), recusarSocialAcao: vi.fn() }))
vi.mock('@/lib/rover/retrato', () => ({ retrato: vi.fn(async () => 'blob:x') }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/pt' }))

import ImagemDaRede, { GaleriaDeImagens } from '@/components/ImagemDaRede'
import Postagem from '@/components/Postagem'
import { dict } from '@/lib/i18n'
import type { ImagemDaRede as TImagem } from '@/lib/imagens'
import { AGORA, postagem } from './ajuda'

const d = dict('pt')
const H = 'a'.repeat(64)
const img = (extra: Partial<TImagem> = {}): TImagem => ({ hash: H, formato: 'png', largura: 360, altura: 240, alt: 'Mapa da pasta em blocos.', ...extra })

describe('ImagemDaRede', () => {
  it('alt, lazy, largura e altura no <img>, proporção reservada no envelope, src do próprio site montado do hash', () => {
    const { container } = render(<ImagemDaRede imagem={img()} />)
    const el = screen.getByRole('img', { name: 'Mapa da pasta em blocos.' })
    expect(el).toHaveAttribute('src', `/midia/${H}.png`)
    expect(el).toHaveAttribute('loading', 'lazy')
    expect(el).toHaveAttribute('width', '360')
    expect(el).toHaveAttribute('height', '240')
    expect((container.firstChild as HTMLElement).style.aspectRatio).toBe('360 / 240')
  })
  it('a extensão segue o formato: jpeg vira .jpg, webp vira .webp', () => {
    render(<><ImagemDaRede imagem={img({ formato: 'jpeg', alt: 'J' })} /><ImagemDaRede imagem={img({ formato: 'webp', alt: 'W', hash: 'b'.repeat(64) })} /></>)
    expect(screen.getByRole('img', { name: 'J' })).toHaveAttribute('src', `/midia/${H}.jpg`)
    expect(screen.getByRole('img', { name: 'W' })).toHaveAttribute('src', `/midia/${'b'.repeat(64)}.webp`)
  })
  it('sem texto alternativo, a imagem não aparece', () => {
    for (const alt of ['', '   ']) {
      const { container } = render(<ImagemDaRede imagem={img({ alt })} />)
      expect(container.querySelector('img')).toBeNull()
    }
  })
  it('hash que não é hexadecimal de 64 (endereço de terceiro, caminho, maiúsculas) ou formato fora da lista: nada aparece', () => {
    for (const ruim of [img({ hash: 'https://exemplo.com/x.png' }), img({ hash: '../../segredo' }), img({ hash: H.toUpperCase() }), img({ formato: 'gif' as never }), img({ formato: 'svg' as never })]) {
      const { container } = render(<ImagemDaRede imagem={ruim} />)
      expect(container.querySelector('img')).toBeNull()
    }
  })
})

describe('galeria na postagem', () => {
  it('a postagem com imagens mostra a galeria com rótulo, uma imagem por anexo, na ordem; nenhum src aponta para fora', () => {
    const imagens = [img(), img({ hash: 'c'.repeat(64), alt: 'Segunda.' })]
    const { container } = render(<Postagem p={postagem({ imagens })} d={d} lang="pt" agora={AGORA} />)
    const g = screen.getByRole('list', { name: 'Imagens da postagem' })
    expect(g).toHaveAttribute('data-n', '2')
    expect(within(g).getAllByRole('img').map((i) => i.getAttribute('alt'))).toEqual(['Mapa da pasta em blocos.', 'Segunda.'])
    for (const i of container.querySelectorAll('img')) expect(i.getAttribute('src')).toMatch(/^(\/midia\/[0-9a-f]{64}\.(png|jpg|webp)|blob:x)$/)
  })
  it('postagem sem imagens não tem galeria; postagem apagada não mostra imagem', () => {
    render(<Postagem p={postagem()} d={d} lang="pt" agora={AGORA} />)
    expect(screen.queryByRole('list', { name: 'Imagens da postagem' })).toBeNull()
    const { container } = render(<Postagem p={postagem({ imagens: [img()], removida: true })} d={d} lang="pt" agora={AGORA} />)
    expect(container.querySelector('img[src^="/midia/"]')).toBeNull()
  })
  it('no máximo quatro, e a que não tem alt sai da conta', () => {
    const muitas = Array.from({ length: 6 }, (_, i) => img({ hash: String(i).repeat(64), alt: `Imagem ${i}.` }))
    render(<GaleriaDeImagens imagens={[img({ alt: '' }), ...muitas]} rotulo="g" />)
    expect(screen.getByRole('list', { name: 'g' })).toHaveAttribute('data-n', '4')
    expect(screen.getAllByRole('img')).toHaveLength(4)
  })
})

