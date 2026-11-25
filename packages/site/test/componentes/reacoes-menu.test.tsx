import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { reagirAcao, apagarAcao } = vi.hoisted(() => ({ reagirAcao: vi.fn(async () => ({ ok: true })), apagarAcao: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/app/acoes', () => ({ reagirAcao, apagarAcao }))
vi.mock('@/lib/rover/retrato', () => ({ retrato: vi.fn(async () => 'blob:x') }))

import MenuPostagem from '@/components/MenuPostagem'
import Reacoes, { aplicarToque } from '@/components/Reacoes'

beforeEach(() => {
  vi.clearAllMocks()
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open') })
})

describe('aplicarToque', () => {
  const base = { reacoes: { curtir: 5, util: 2 }, minha: null as 'curtir' | 'util' | null }
  it('marca, troca e tira', () => {
    const a = aplicarToque(base, 'curtir')
    expect(a).toEqual({ reacoes: { curtir: 6, util: 2 }, minha: 'curtir' })
    const b = aplicarToque(a, 'util')
    expect(b).toEqual({ reacoes: { curtir: 5, util: 3 }, minha: 'util' })
    const c = aplicarToque(b, 'util')
    expect(c).toEqual({ reacoes: { curtir: 5, util: 2 }, minha: null })
  })
  it('nunca deixa a contagem negativa e não muda o estado de entrada', () => {
    const e = { reacoes: { curtir: 0, util: 0 }, minha: 'curtir' as const }
    expect(aplicarToque(e, 'util').reacoes).toEqual({ curtir: 0, util: 1 })
    expect(aplicarToque(e, 'curtir').reacoes.curtir).toBe(0)
    expect(e.reacoes).toEqual({ curtir: 0, util: 0 })
  })
})

describe('Reacoes', () => {
  const rotulos = { curtir: 'Curtir', util: 'Útil' }
  it('mostra as contagens, marca na hora e chama a ação do servidor', async () => {
    render(<Reacoes id="ob_x" reacoes={{ curtir: 5, util: 0 }} minha={null} rotulos={rotulos} />)
    let terminar: (v: { ok: boolean }) => void = () => {}
    reagirAcao.mockImplementationOnce(() => new Promise((ok) => { terminar = ok }))
    const curtir = screen.getByRole('button', { name: 'Curtir: 5' })
    expect(curtir).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(curtir)
    expect(reagirAcao).toHaveBeenCalledWith('ob_x', 'curtir')
    // enquanto o servidor não responde, a tela já mostra a reação
    await waitFor(() => expect(screen.getByRole('button', { name: 'Curtir: 6' })).toHaveAttribute('aria-pressed', 'true'))
    await act(async () => terminar({ ok: true }))
  })
  it('a reação da pessoa já vem marcada', () => {
    render(<Reacoes id="ob_x" reacoes={{ curtir: 1, util: 4 }} minha="util" rotulos={rotulos} />)
    expect(screen.getByRole('button', { name: 'Útil: 4' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Curtir: 1' })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('MenuPostagem', () => {
  const rotulos = { menu: 'Abrir o menu', denunciar: 'Denunciar', apagar: 'Apagar postagem', aviso: 'Apagar esta postagem?', texto: 'Explicação.', confirma: 'Apagar', cancelar: 'Cancelar' }
  it('qualquer pessoa pode denunciar; só o dono vê apagar', () => {
    const { rerender } = render(<MenuPostagem id="ob_x" lang="pt" meu={false} rotulos={rotulos} removida={false} />)
    expect(screen.getByRole('link', { name: 'Denunciar' })).toHaveAttribute('href', '/pt/denunciar/ob_x')
    expect(screen.queryByText('Apagar postagem')).toBeNull()
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull()
    rerender(<MenuPostagem id="ob_x" lang="pt" meu rotulos={rotulos} removida={false} />)
    expect(screen.getByText('Apagar postagem')).toBeInTheDocument()
  })
  it('apagar pede confirmação e só chama a ação depois dela', async () => {
    render(<MenuPostagem id="ob_x" lang="pt" meu rotulos={rotulos} removida={false} />)
    await userEvent.click(screen.getByText('Apagar postagem'))
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled()
    expect(apagarAcao).not.toHaveBeenCalled()
    const dialogo = screen.getByRole('dialog', { hidden: true })
    expect(within(dialogo).getByText('Apagar esta postagem?', { exact: false })).toBeInTheDocument()
    await act(async () => { await userEvent.click(within(dialogo).getByText('Cancelar')) })
    expect(apagarAcao).not.toHaveBeenCalled()
    await userEvent.click(screen.getByText('Apagar postagem'))
    await act(async () => { await userEvent.click(within(dialogo).getByText('Apagar')) })
    expect(apagarAcao).toHaveBeenCalledWith('ob_x')
  })
  it('postagem já apagada não tem menu', () => {
    const { container } = render(<MenuPostagem id="ob_x" lang="pt" meu rotulos={rotulos} removida />)
    expect(container).toBeEmptyDOMElement()
  })
  it('fecha o menu com Escape e com clique fora', async () => {
    render(<div><span>fora</span><MenuPostagem id="ob_x" lang="pt" meu={false} rotulos={rotulos} removida={false} /></div>)
    const detalhes = document.querySelector('details')!
    detalhes.open = true
    await userEvent.keyboard('{Escape}')
    expect(detalhes.open).toBe(false)
    detalhes.open = true
    await userEvent.click(screen.getByText('fora'))
    expect(detalhes.open).toBe(false)
  })
})
