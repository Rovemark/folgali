import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { reactAction, deleteAction } = vi.hoisted(() => ({ reactAction: vi.fn(async () => ({ ok: true })), deleteAction: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/app/actions', () => ({ reactAction, deleteAction }))
vi.mock('@/lib/rover/portrait', () => ({ portrait: vi.fn(async () => 'blob:x') }))

import PostMenu from '@/components/PostMenu'
import Reactions, { applyTouch } from '@/components/Reactions'

beforeEach(() => {
  vi.clearAllMocks()
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open') })
})

describe('aplicarToque', () => {
  const base = { reacoes: { curtir: 5, util: 2 }, minha: null as 'curtir' | 'util' | null }
  it('marca, troca e tira', () => {
    const a = applyTouch(base, 'curtir')
    expect(a).toEqual({ reacoes: { curtir: 6, util: 2 }, minha: 'curtir' })
    const b = applyTouch(a, 'util')
    expect(b).toEqual({ reacoes: { curtir: 5, util: 3 }, minha: 'util' })
    const c = applyTouch(b, 'util')
    expect(c).toEqual({ reacoes: { curtir: 5, util: 2 }, minha: null })
  })
  it('never lets the count go negative and does not change the join state', () => {
    const e = { reacoes: { curtir: 0, util: 0 }, minha: 'curtir' as const }
    expect(applyTouch(e, 'util').reacoes).toEqual({ curtir: 0, util: 1 })
    expect(applyTouch(e, 'curtir').reacoes.curtir).toBe(0)
    expect(e.reacoes).toEqual({ curtir: 0, util: 0 })
  })
})

describe('Reacoes', () => {
  const labels = { curtir: 'Curtir', util: 'Útil' }
  it('shows the counts, marks at once and calls the server action', async () => {
    render(<Reactions id="ob_x" reacoes={{ curtir: 5, util: 0 }} minha={null} rotulos={labels} />)
    let finish: (v: { ok: boolean }) => void = () => {}
    reactAction.mockImplementationOnce(() => new Promise((ok) => { finish = ok }))
    const like = screen.getByRole('button', { name: 'Curtir: 5' })
    expect(like).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(like)
    expect(reactAction).toHaveBeenCalledWith('ob_x', 'curtir')
    // while the server does not answer, the screen already shows the reaction
    await waitFor(() => expect(screen.getByRole('button', { name: 'Curtir: 6' })).toHaveAttribute('aria-pressed', 'true'))
    await act(async () => finish({ ok: true }))
  })
  it('the person\'s reaction already comes marked', () => {
    render(<Reactions id="ob_x" reacoes={{ curtir: 1, util: 4 }} minha="util" rotulos={labels} />)
    expect(screen.getByRole('button', { name: 'Útil: 4' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Curtir: 1' })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('MenuPostagem', () => {
  const labels = { menu: 'Abrir o menu', denunciar: 'Denunciar', apagar: 'Apagar postagem', aviso: 'Apagar esta postagem?', texto: 'Explicação.', confirm: 'Apagar', cancelar: 'Cancelar' }
  it('anyone can report; only the owner sees delete', () => {
    const { rerender } = render(<PostMenu id="ob_x" lang="pt" meu={false} rotulos={labels} removida={false} />)
    expect(screen.getByRole('link', { name: 'Denunciar' })).toHaveAttribute('href', '/pt/denunciar/ob_x')
    expect(screen.queryByText('Apagar postagem')).toBeNull()
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull()
    rerender(<PostMenu id="ob_x" lang="pt" meu rotulos={labels} removida={false} />)
    expect(screen.getByText('Apagar postagem')).toBeInTheDocument()
  })
  it('deleting asks for confirmation and only calls the action after it', async () => {
    render(<PostMenu id="ob_x" lang="pt" meu rotulos={labels} removida={false} />)
    await userEvent.click(screen.getByText('Apagar postagem'))
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled()
    expect(deleteAction).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { hidden: true })
    expect(within(dialog).getByText('Apagar esta postagem?', { exact: false })).toBeInTheDocument()
    await act(async () => { await userEvent.click(within(dialog).getByText('Cancelar')) })
    expect(deleteAction).not.toHaveBeenCalled()
    await userEvent.click(screen.getByText('Apagar postagem'))
    await act(async () => { await userEvent.click(within(dialog).getByText('Apagar')) })
    expect(deleteAction).toHaveBeenCalledWith('ob_x')
  })
  it('an already deleted post has no menu', () => {
    const { container } = render(<PostMenu id="ob_x" lang="pt" meu rotulos={labels} removida />)
    expect(container).toBeEmptyDOMElement()
  })
  it('closes the menu with Escape and with a click outside', async () => {
    render(<div><span>fora</span><PostMenu id="ob_x" lang="pt" meu={false} rotulos={labels} removida={false} /></div>)
    const details = document.querySelector('details')!
    details.open = true
    await userEvent.keyboard('{Escape}')
    expect(details.open).toBe(false)
    details.open = true
    await userEvent.click(screen.getByText('fora'))
    expect(details.open).toBe(false)
  })
})
