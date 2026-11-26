import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { actAction } = vi.hoisted(() => ({ actAction: vi.fn(async (a: unknown) => (void a, ({ ok: true as const, resultado: undefined as string | undefined }))) }))
vi.mock('@/app/social-actions', () => ({ actAction, moreAction: vi.fn(), proposeAction: vi.fn() }))
vi.mock('@/lib/rover/portrait', () => ({ portrait: vi.fn(async () => 'blob:x') }))

import JoinActions from '@/components/communities/EntryActions'
import { dict } from '@/lib/i18n'
import type { YouInCommunity } from '@/lib/social/types'

const d = dict('pt')
const ID = 'ob_DEMOccinema00000000000000000000000000000000'
const you = (extra: Partial<YouInCommunity> = {}): YouInCommunity => ({ papel: null, pedidoPendente: false, convidado: false, banido: false, ...extra })

beforeEach(() => {
  vi.clearAllMocks()
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open') })
})

describe('JoinActions: what appears by access and situation', () => {
  it('open, from outside: Join, and the tap calls the join gesture', async () => {
    render(<JoinActions id={ID} acesso="aberta" voce={you()} d={d} />)
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(actAction).toHaveBeenCalledWith({ tipo: 'comunidade-adesao', comunidade: ID, acao: 'entrar' })
  })
  it('moderated, from outside: the button is "Pedir para entrar" (joining is a request)', () => {
    render(<JoinActions id={ID} acesso="moderada" voce={you()} d={d} />)
    expect(screen.getByRole('button', { name: 'Pedir para entrar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Entrar' })).toBeNull()
  })
  it('closed, from outside and without an invitation: no button (for whoever is outside it does not even exist)', () => {
    const { container } = render(<JoinActions id={ID} acesso="fechada" voce={you()} d={d} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('convidado: aceitar e recusar o convite', async () => {
    render(<JoinActions id={ID} acesso="fechada" voce={you({ convidado: true })} d={d} />)
    await userEvent.click(screen.getByRole('button', { name: 'Recusar' }))
    expect(actAction).toHaveBeenCalledWith({ tipo: 'comunidade-adesao', comunidade: ID, acao: 'recusar-convite' })
    await userEvent.click(screen.getByRole('button', { name: 'Aceitar o convite' }))
    expect(actAction).toHaveBeenCalledWith({ tipo: 'comunidade-adesao', comunidade: ID, acao: 'aceitar-convite' })
  })
  it('pending request: shows that it waits and lets you cancel', async () => {
    render(<JoinActions id={ID} acesso="moderada" voce={you({ pedidoPendente: true })} d={d} />)
    expect(screen.getByRole('status')).toHaveTextContent(/ainda não respondeu/)
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar o pedido' }))
    expect(actAction).toHaveBeenCalledWith({ tipo: 'comunidade-adesao', comunidade: ID, acao: 'cancelar-pedido' })
  })
  it('banned: no join button anywhere', () => {
    const { container } = render(<JoinActions id={ID} acesso="aberta" voce={you({ banido: true })} d={d} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('member: Leave asks for confirmation before calling the gesture', async () => {
    render(<JoinActions id={ID} acesso="aberta" voce={you({ papel: 'membro' })} d={d} />)
    await userEvent.click(screen.getByRole('button', { name: 'Sair' }))
    expect(actAction).not.toHaveBeenCalled()
    expect(screen.getByText(/Sair desta comunidade/)).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Sair' }).at(-1)!)
    await waitFor(() => expect(actAction).toHaveBeenCalledWith({ tipo: 'comunidade-adesao', comunidade: ID, acao: 'sair' }))
  })
  it('owner: there is no Leave (ownership is transferred in Manage)', () => {
    const { container } = render(<JoinActions id={ID} acesso="fechada" voce={you({ papel: 'dono' })} d={d} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('anti-raid: when the relay returns "pending" the join on the open one explains that it is under review', async () => {
    actAction.mockResolvedValueOnce({ ok: true, resultado: 'pendente' })
    render(<JoinActions id={ID} acesso="aberta" voce={you()} d={d} />)
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/em análise/))
  })
})
