// 0.5.0 (proposal 0005): the network's image component, the gallery on the post, the portrait image on the profile and the approval
// screen block. What is proven: alt is required (without it, nothing appears), `loading="lazy"`, reserved width and height, and the `src` is born
// only from the hash, on the same domain as the site, never from an address that came from outside.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/actions', () => ({ approveAction: vi.fn(), editDraftAction: vi.fn(), refuseAction: vi.fn(), reactAction: vi.fn(), deleteAction: vi.fn() }))
vi.mock('@/app/social-actions', () => ({ approveSocialAction: vi.fn(), editSocialAction: vi.fn(), refuseSocialAction: vi.fn() }))
vi.mock('@/lib/rover/portrait', () => ({ portrait: vi.fn(async () => 'blob:x') }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/pt' }))

import NetworkImage, { ImageGallery } from '@/components/NetworkImage'
import Post from '@/components/Post'
import { dict } from '@/lib/i18n'
import type { NetworkImage as TImage } from '@/lib/images'
import { NOW, post } from './help'

const d = dict('pt')
const H = 'a'.repeat(64)
const img = (extra: Partial<TImage> = {}): TImage => ({ hash: H, formato: 'png', largura: 360, altura: 240, alt: 'Mapa da pasta em blocos.', ...extra })

describe('ImagemDaRede', () => {
  it('alt, lazy, width and height on the <img>, reserved ratio in the envelope, the site\'s own src built from the hash', () => {
    const { container } = render(<NetworkImage imagem={img()} />)
    const el = screen.getByRole('img', { name: 'Mapa da pasta em blocos.' })
    expect(el).toHaveAttribute('src', `/midia/${H}.png`)
    expect(el).toHaveAttribute('loading', 'lazy')
    expect(el).toHaveAttribute('width', '360')
    expect(el).toHaveAttribute('height', '240')
    expect((container.firstChild as HTMLElement).style.aspectRatio).toBe('360 / 240')
  })
  it('the extension follows the format: jpeg becomes .jpg, webp becomes .webp', () => {
    render(<><NetworkImage imagem={img({ formato: 'jpeg', alt: 'J' })} /><NetworkImage imagem={img({ formato: 'webp', alt: 'W', hash: 'b'.repeat(64) })} /></>)
    expect(screen.getByRole('img', { name: 'J' })).toHaveAttribute('src', `/midia/${H}.jpg`)
    expect(screen.getByRole('img', { name: 'W' })).toHaveAttribute('src', `/midia/${'b'.repeat(64)}.webp`)
  })
  it('without alt text, the image does not appear', () => {
    for (const alt of ['', '   ']) {
      const { container } = render(<NetworkImage imagem={img({ alt })} />)
      expect(container.querySelector('img')).toBeNull()
    }
  })
  it('a hash that is not 64 hexadecimal characters (a third-party address, a path, uppercase) or a format outside the list: nothing appears', () => {
    for (const bad of [img({ hash: 'https://exemplo.com/x.png' }), img({ hash: '../../segredo' }), img({ hash: H.toUpperCase() }), img({ formato: 'gif' as never }), img({ formato: 'svg' as never })]) {
      const { container } = render(<NetworkImage imagem={bad} />)
      expect(container.querySelector('img')).toBeNull()
    }
  })
})

describe('gallery on the post', () => {
  it('a post with images shows the gallery with a label, one image per attachment, in order; no src points outside', () => {
    const images = [img(), img({ hash: 'c'.repeat(64), alt: 'Segunda.' })]
    const { container } = render(<Post p={post({ imagens: images })} d={d} lang="pt" agora={NOW} />)
    const g = screen.getByRole('list', { name: 'Imagens da postagem' })
    expect(g).toHaveAttribute('data-n', '2')
    expect(within(g).getAllByRole('img').map((i) => i.getAttribute('alt'))).toEqual(['Mapa da pasta em blocos.', 'Segunda.'])
    for (const i of container.querySelectorAll('img')) expect(i.getAttribute('src')).toMatch(/^(\/midia\/[0-9a-f]{64}\.(png|jpg|webp)|blob:x)$/)
  })
  it('a post without images has no gallery; a deleted post shows no image', () => {
    render(<Post p={post()} d={d} lang="pt" agora={NOW} />)
    expect(screen.queryByRole('list', { name: 'Imagens da postagem' })).toBeNull()
    const { container } = render(<Post p={post({ imagens: [img()], removida: true })} d={d} lang="pt" agora={NOW} />)
    expect(container.querySelector('img[src^="/midia/"]')).toBeNull()
  })
  it('at most four, and one without alt is dropped from the count', () => {
    const many_ = Array.from({ length: 6 }, (_, i) => img({ hash: String(i).repeat(64), alt: `Imagem ${i}.` }))
    render(<ImageGallery imagens={[img({ alt: '' }), ...many_]} rotulo="g" />)
    expect(screen.getByRole('list', { name: 'g' })).toHaveAttribute('data-n', '4')
    expect(screen.getAllByRole('img')).toHaveLength(4)
  })
})

