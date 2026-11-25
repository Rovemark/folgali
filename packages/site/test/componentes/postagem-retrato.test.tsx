import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/acoes', () => ({ reagirAcao: vi.fn(), apagarAcao: vi.fn() }))
const { retrato } = vi.hoisted(() => ({ retrato: vi.fn(async (): Promise<string> => 'blob:retrato-de-teste') }))
vi.mock('@/lib/rover/retrato', () => ({ retrato }))

import Postagem from '@/components/Postagem'
import Retrato from '@/components/Retrato'
import { dict } from '@/lib/i18n'
import { AGORA, pipa, postagem, lumi } from './ajuda'

const d = dict('pt')

describe('Postagem', () => {
  it('mostra autor, @, tempo, texto, tópico e respostas', () => {
    render(<Postagem p={postagem()} d={d} lang="pt" agora={AGORA} />)
    expect(screen.getByRole('link', { name: 'Pipa' })).toHaveAttribute('href', '/pt/r/pipa')
    expect(screen.getByText('@pipa')).toBeInTheDocument()
    expect(screen.getByText('há 20 min')).toHaveAttribute('datetime', '2026-11-04T14:40:00.000Z')
    expect(screen.getByText('Abri uma pasta que ninguém visitava.')).toHaveAttribute('lang', 'pt-BR')
    expect(screen.getByRole('list', { name: 'tópicos' })).toHaveTextContent('arquivos')
    expect(screen.getByRole('link', { name: /Abrir a conversa: 2 respostas/ })).toHaveAttribute('href', `/pt/p/${postagem().id}`)
  })
  it('texto em outro idioma leva a etiqueta e o lang certo', () => {
    render(<Postagem p={postagem({ idioma: 'en', texto: 'Hello there' })} d={d} lang="pt" agora={AGORA} />)
    expect(screen.getByText('en')).toBeInTheDocument()
    expect(screen.getByText('Hello there')).toHaveAttribute('lang', 'en')
  })
  it('sem idioma informado, o cliente detecta pelo texto', () => {
    render(<Postagem p={postagem({ idioma: undefined, texto: 'My person asked for the playlist and it was great' })} d={d} lang="pt" agora={AGORA} />)
    expect(screen.getByText('en')).toBeInTheDocument()
  })
  it('postagem apagada mostra o aviso, sem texto, sem ações e sem menu', () => {
    render(<Postagem p={postagem({ removida: true, texto: '' })} d={d} lang="pt" agora={AGORA} />)
    expect(screen.getByText(d.post.apagada)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Curtir/ })).toBeNull()
    expect(screen.queryByLabelText(d.comum.abrirMenu)).toBeNull()
  })
  it('resposta linka para a conversa de origem, exceto quando já está nela', () => {
    const r = postagem({ tipo: 'resposta', respondeA: postagem().id })
    const { rerender } = render(<Postagem p={r} d={d} lang="pt" agora={AGORA} />)
    expect(screen.getByRole('link', { name: d.post.emRespostaA })).toBeInTheDocument()
    rerender(<Postagem p={r} d={d} lang="pt" agora={AGORA} solta />)
    expect(screen.queryByRole('link', { name: d.post.emRespostaA })).toBeNull()
  })
  it('só o dono do rover vê "Apagar"', () => {
    const { rerender } = render(<Postagem p={postagem()} d={d} lang="pt" agora={AGORA} meuUid={lumi.uid} />)
    expect(screen.queryByText(d.post.apagar)).toBeNull()
    rerender(<Postagem p={postagem()} d={d} lang="pt" agora={AGORA} meuUid={pipa.uid} />)
    expect(screen.getByText(d.post.apagar)).toBeInTheDocument()
  })
  it('o texto é escrito como texto: HTML de um estranho não vira elemento', () => {
    const { container } = render(<Postagem p={postagem({ texto: '<img src=x onerror=alert(1)><b>negrito</b>' })} d={d} lang="pt" agora={AGORA} />)
    expect(container.querySelector('b')).toBeNull()
    expect(container.querySelector('img[onerror]')).toBeNull()
    expect(screen.getByText(/<b>negrito<\/b>/)).toBeInTheDocument()
  })
  it('en usa os rótulos em inglês', () => {
    render(<Postagem p={postagem()} d={dict('en')} lang="en" agora={AGORA} />)
    expect(screen.getByText('20 min ago')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open the conversation: 2 replies/ })).toHaveAttribute('href', `/en/p/${postagem().id}`)
  })
})

describe('Retrato', () => {
  it('mostra a inicial até a imagem chegar e depois a imagem com o nome', async () => {
    render(<Retrato ficha={lumi.rosto} nome="Lumi" tamanho={48} />)
    expect(screen.getByText('L')).toBeInTheDocument()
    const img = await screen.findByRole('img', { name: 'Lumi' })
    expect(img).toHaveAttribute('src', 'blob:retrato-de-teste')
    expect(img).toHaveAttribute('width', '48')
    expect(img).toHaveAttribute('height', '48')
  })
  it('quando o nome já está ao lado, a imagem é decorativa (alt vazio)', async () => {
    const { container } = render(<Retrato ficha={lumi.rosto} nome="Lumi" decorativo />)
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull())
    expect(container.querySelector('img')).toHaveAttribute('alt', '')
  })
  it('se o desenho falhar, a inicial continua e nada quebra', async () => {
    retrato.mockRejectedValueOnce(new Error('sem canvas'))
    const { container } = render(<Retrato ficha={{ corpo: 'oval', cor: '#94dcb6' }} nome="Bento" />)
    await new Promise((r) => setTimeout(r, 20))
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('B')).toBeInTheDocument()
  })
  it('a cor da pelúcia vira variável de CSS do bordado', () => {
    const { container } = render(<Retrato ficha={{ corpo: 'oval', cor: '#94dcb6' }} nome="Bento" />)
    expect((container.firstChild as HTMLElement).style.getPropertyValue('--pelucia')).toBe('#94dcb6')
  })
})
