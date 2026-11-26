// The rover's own image portrait on every card (relay card `imagem`, 2026-11-26): the same photo the profile shows, from the site's own
// /midia route, in the round frame with a fixed size; without it, or when it fails to load, the drawn portrait comes back.
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { retrato: portrait } = vi.hoisted(() => ({ retrato: vi.fn(async (): Promise<string> => 'blob:retrato-de-teste') }))
vi.mock('@/lib/rover/portrait', () => ({ portrait }))

import Portrait from '@/components/Portrait'
import type { Spec } from '@/lib/types'

const HASH = 'ab'.repeat(32)
const plush: Spec = { corpo: 'oval', cor: '#94dcb6', acessorios: [] }
const withPhoto = (imagem: unknown): Spec => ({ ...plush, imagem: imagem as Spec['imagem'] })

describe('Portrait with an own image', () => {
  it('shows the photo from /midia, with fixed size, lazy loading and the round frame', () => {
    const { container } = render(<Portrait ficha={withPhoto({ hash: HASH, formato: 'webp' })} nome="Pipa" tamanho={44} />)
    const img = screen.getByRole('img', { name: 'Pipa' })
    expect(img).toHaveAttribute('src', `/midia/${HASH}.webp`)
    expect(img).toHaveAttribute('width', '44')
    expect(img).toHaveAttribute('height', '44')
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img).toHaveClass('portrait-img')
    const frame = container.firstChild as HTMLElement
    expect(frame).toHaveClass('portrait', 'portrait-own')
    expect(frame).not.toHaveClass('portrait-photo')
    expect(frame.style.width).toBe('44px')
    expect(frame.style.height).toBe('44px')
    expect(frame.style.getPropertyValue('--pelucia')).toBe('#94dcb6')
    expect(portrait).not.toHaveBeenCalled()
  })

  it('beside the name it is decorative (empty alt)', () => {
    const { container } = render(<Portrait ficha={withPhoto({ hash: HASH, formato: 'png' })} nome="Pipa" decorative />)
    expect(container.querySelector('img')).toHaveAttribute('alt', '')
    expect(container.querySelector('img')).toHaveAttribute('src', `/midia/${HASH}.png`)
  })

  it('without an image, the plush is drawn as before', async () => {
    const { container } = render(<Portrait ficha={plush} nome="Bento" />)
    const img = await screen.findByRole('img', { name: 'Bento' })
    expect(img).toHaveAttribute('src', 'blob:retrato-de-teste')
    expect(container.firstChild).not.toHaveClass('portrait-own')
  })

  it('when the photo fails to load, the plush comes back', async () => {
    const { container } = render(<Portrait ficha={withPhoto({ hash: HASH, formato: 'jpeg' })} nome="Pipa" />)
    fireEvent.error(screen.getByRole('img', { name: 'Pipa' }))
    const img = await screen.findByRole('img', { name: 'Pipa' })
    expect(img).toHaveAttribute('src', 'blob:retrato-de-teste')
    expect(container.querySelector(`img[src^="/midia/"]`)).toBeNull()
  })

  it('a photo that broke before the page became interactive also falls back (no onError ever arrives)', async () => {
    const complete = vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true)
    const width = vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(0)
    try {
      const { container } = render(<Portrait ficha={withPhoto({ hash: HASH, formato: 'png' })} nome="Pipa" />)
      expect((await screen.findByRole('img', { name: 'Pipa' })).getAttribute('src')).toBe('blob:retrato-de-teste')
      expect(container.querySelector(`img[src^="/midia/"]`)).toBeNull()
    } finally {
      complete.mockRestore()
      width.mockRestore()
    }
  })

  it('a hash or a format that does not check out never becomes an address: the plush is drawn', async () => {
    for (const bad of [
      { hash: 'javascript:alert(1)', formato: 'png' },
      { hash: `../${HASH}`, formato: 'png' },
      { hash: HASH.toUpperCase(), formato: 'png' },
      { hash: HASH, formato: 'svg' },
      { hash: `${HASH}/x`, formato: 'png' },
    ]) {
      const { container, unmount } = render(<Portrait ficha={withPhoto(bad)} nome="Pipa" />)
      await screen.findByRole('img', { name: 'Pipa' })
      expect(container.querySelector('img')!.getAttribute('src'), JSON.stringify(bad)).toBe('blob:retrato-de-teste')
      unmount()
    }
  })

  it('a person with an own photo shows the photo, not the people avatar', () => {
    const { container } = render(<Portrait ficha={{ corpo: 'pessoa', cor: '#ff9fc4', acessorios: [], imagem: { hash: HASH, formato: 'png' } }} nome="Bia" />)
    expect(container.querySelector('svg')).toBeNull()
    expect(screen.getByRole('img', { name: 'Bia' })).toHaveAttribute('src', `/midia/${HASH}.png`)
  })
})
