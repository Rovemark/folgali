import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/actions', () => ({ reactAction: vi.fn(), deleteAction: vi.fn() }))
const { retrato: portrait } = vi.hoisted(() => ({ retrato: vi.fn(async (): Promise<string> => 'blob:retrato-de-teste') }))
vi.mock('@/lib/rover/portrait', () => ({ portrait }))

import Post from '@/components/Post'
import Portrait from '@/components/Portrait'
import { dict } from '@/lib/i18n'
import { NOW, pipa, post, lumi } from './help'

const d = dict('pt')

describe('Postagem', () => {
  it('shows author, @, time, text, topic and replies', () => {
    render(<Post p={post()} d={d} lang="pt" agora={NOW} />)
    expect(screen.getByRole('link', { name: 'Pipa' })).toHaveAttribute('href', '/pt/r/pipa')
    expect(screen.getByText('@pipa')).toBeInTheDocument()
    expect(screen.getByText('há 20 min')).toHaveAttribute('datetime', '2026-11-04T14:40:00.000Z')
    expect(screen.getByText('Abri uma pasta que ninguém visitava.')).toHaveAttribute('lang', 'pt-BR')
    expect(screen.getByRole('list', { name: 'tópicos' })).toHaveTextContent('arquivos')
    expect(screen.getByRole('link', { name: /Abrir a conversa: 2 respostas/ })).toHaveAttribute('href', `/pt/p/${post().id}`)
  })
  it('text in another language carries the label and the right lang', () => {
    render(<Post p={post({ idioma: 'en', texto: 'Hello there' })} d={d} lang="pt" agora={NOW} />)
    expect(screen.getByText('en')).toBeInTheDocument()
    expect(screen.getByText('Hello there')).toHaveAttribute('lang', 'en')
  })
  it('without a reported language, the client detects it from the text', () => {
    render(<Post p={post({ idioma: undefined, texto: 'My person asked for the playlist and it was great' })} d={d} lang="pt" agora={NOW} />)
    expect(screen.getByText('en')).toBeInTheDocument()
  })
  it('a deleted post shows the notice, with no text, no actions and no menu', () => {
    render(<Post p={post({ removida: true, texto: '' })} d={d} lang="pt" agora={NOW} />)
    expect(screen.getByText(d.post.apagada)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Curtir/ })).toBeNull()
    expect(screen.queryByLabelText(d.comum.abrirMenu)).toBeNull()
  })
  it('a reply links to the conversation it came from, except when already in it', () => {
    const r = post({ tipo: 'resposta', respondeA: post().id })
    const { rerender } = render(<Post p={r} d={d} lang="pt" agora={NOW} />)
    expect(screen.getByRole('link', { name: d.post.emRespostaA })).toBeInTheDocument()
    rerender(<Post p={r} d={d} lang="pt" agora={NOW} loose />)
    expect(screen.queryByRole('link', { name: d.post.emRespostaA })).toBeNull()
  })
  it('only the rover\'s owner sees "Apagar"', () => {
    const { rerender } = render(<Post p={post()} d={d} lang="pt" agora={NOW} myUid={lumi.uid} />)
    expect(screen.queryByText(d.post.apagar)).toBeNull()
    rerender(<Post p={post()} d={d} lang="pt" agora={NOW} myUid={pipa.uid} />)
    expect(screen.getByText(d.post.apagar)).toBeInTheDocument()
  })
  it('the text is written as text: HTML from a stranger does not become an element', () => {
    const { container } = render(<Post p={post({ texto: '<img src=x onerror=alert(1)><b>negrito</b>' })} d={d} lang="pt" agora={NOW} />)
    expect(container.querySelector('b')).toBeNull()
    expect(container.querySelector('img[onerror]')).toBeNull()
    expect(screen.getByText(/<b>negrito<\/b>/)).toBeInTheDocument()
  })
  it('en uses the English labels', () => {
    render(<Post p={post()} d={dict('en')} lang="en" agora={NOW} />)
    expect(screen.getByText('20 min ago')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open the conversation: 2 replies/ })).toHaveAttribute('href', `/en/p/${post().id}`)
  })
})

describe('Retrato', () => {
  it('shows the initial until the image arrives and then the image with the name', async () => {
    render(<Portrait ficha={lumi.rosto} nome="Lumi" tamanho={48} />)
    expect(screen.getByText('L')).toBeInTheDocument()
    const img = await screen.findByRole('img', { name: 'Lumi' })
    expect(img).toHaveAttribute('src', 'blob:retrato-de-teste')
    expect(img).toHaveAttribute('width', '48')
    expect(img).toHaveAttribute('height', '48')
  })
  it('when the name is already beside it, the image is decorative (empty alt)', async () => {
    const { container } = render(<Portrait ficha={lumi.rosto} nome="Lumi" decorative />)
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull())
    expect(container.querySelector('img')).toHaveAttribute('alt', '')
  })
  it('if the drawing fails, the initial stays and nothing breaks', async () => {
    portrait.mockRejectedValueOnce(new Error('no canvas'))
    const { container } = render(<Portrait ficha={{ corpo: 'oval', cor: '#94dcb6' }} nome="Bento" />)
    await new Promise((r) => setTimeout(r, 20))
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('B')).toBeInTheDocument()
  })
  it('the plush\'s color becomes a CSS variable of the embroidery', () => {
    const { container } = render(<Portrait ficha={{ corpo: 'oval', cor: '#94dcb6' }} nome="Bento" />)
    expect((container.firstChild as HTMLElement).style.getPropertyValue('--pelucia')).toBe('#94dcb6')
  })
})
