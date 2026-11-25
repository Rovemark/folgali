import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { agirAcao } = vi.hoisted(() => ({ agirAcao: vi.fn(async (a: unknown) => (void a, ({ ok: true as const, resultado: undefined as string | undefined }))) }))
vi.mock('@/app/acoes-sociais', () => ({ agirAcao, maisAcao: vi.fn(), proporAcao: vi.fn() }))
vi.mock('@/lib/rover/retrato', () => ({ retrato: vi.fn(async () => 'blob:x') }))

import AcoesDeEntrada from '@/components/comunidades/AcoesDeEntrada'
import { dict } from '@/lib/i18n'
import type { VoceNaComunidade } from '@/lib/social/tipos'

const d = dict('pt')
const ID = 'ob_DEMOccinema00000000000000000000000000000000'
const voce = (extra: Partial<VoceNaComunidade> = {}): VoceNaComunidade => ({ papel: null, pedidoPendente: false, convidado: false, banido: false, ...extra })

beforeEach(() => {
  vi.clearAllMocks()
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open') })
})

describe('AcoesDeEntrada: o que aparece por acesso e situação', () => {
  it('aberta, de fora: Entrar, e o toque chama o gesto entrar', async () => {
    render(<AcoesDeEntrada id={ID} acesso="aberta" voce={voce()} d={d} />)
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(agirAcao).toHaveBeenCalledWith({ tipo: 'comunidade-adesao', comunidade: ID, acao: 'entrar' })
  })
  it('moderada, de fora: o botão é "Pedir para entrar" (entrar é um pedido)', () => {
    render(<AcoesDeEntrada id={ID} acesso="moderada" voce={voce()} d={d} />)
    expect(screen.getByRole('button', { name: 'Pedir para entrar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Entrar' })).toBeNull()
  })
  it('fechada, de fora e sem convite: nenhum botão (para quem está fora ela nem existe)', () => {
    const { container } = render(<AcoesDeEntrada id={ID} acesso="fechada" voce={voce()} d={d} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('convidado: aceitar e recusar o convite', async () => {
    render(<AcoesDeEntrada id={ID} acesso="fechada" voce={voce({ convidado: true })} d={d} />)
    await userEvent.click(screen.getByRole('button', { name: 'Recusar' }))
    expect(agirAcao).toHaveBeenCalledWith({ tipo: 'comunidade-adesao', comunidade: ID, acao: 'recusar-convite' })
    await userEvent.click(screen.getByRole('button', { name: 'Aceitar o convite' }))
    expect(agirAcao).toHaveBeenCalledWith({ tipo: 'comunidade-adesao', comunidade: ID, acao: 'aceitar-convite' })
  })
  it('pedido pendente: mostra que espera e deixa cancelar', async () => {
    render(<AcoesDeEntrada id={ID} acesso="moderada" voce={voce({ pedidoPendente: true })} d={d} />)
    expect(screen.getByRole('status')).toHaveTextContent(/ainda não respondeu/)
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar o pedido' }))
    expect(agirAcao).toHaveBeenCalledWith({ tipo: 'comunidade-adesao', comunidade: ID, acao: 'cancelar-pedido' })
  })
  it('banido: nenhum botão de entrada em lugar nenhum', () => {
    const { container } = render(<AcoesDeEntrada id={ID} acesso="aberta" voce={voce({ banido: true })} d={d} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('membro: Sair pede confirmação antes de chamar o gesto', async () => {
    render(<AcoesDeEntrada id={ID} acesso="aberta" voce={voce({ papel: 'membro' })} d={d} />)
    await userEvent.click(screen.getByRole('button', { name: 'Sair' }))
    expect(agirAcao).not.toHaveBeenCalled()
    expect(screen.getByText(/Sair desta comunidade/)).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Sair' }).at(-1)!)
    await waitFor(() => expect(agirAcao).toHaveBeenCalledWith({ tipo: 'comunidade-adesao', comunidade: ID, acao: 'sair' }))
  })
  it('dono: não há Sair (a posse se transfere em Gerir)', () => {
    const { container } = render(<AcoesDeEntrada id={ID} acesso="fechada" voce={voce({ papel: 'dono' })} d={d} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('anti-raid: quando o relé devolve "pendente" a entrada na aberta explica que está em análise', async () => {
    agirAcao.mockResolvedValueOnce({ ok: true, resultado: 'pendente' })
    render(<AcoesDeEntrada id={ID} acesso="aberta" voce={voce()} d={d} />)
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/em análise/))
  })
})
