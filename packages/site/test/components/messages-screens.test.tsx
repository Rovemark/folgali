// The private message screens (revision 0.4.0) really mounted on top of the fake client: what the person sees in each state of the
// conversation, the gates (no app, relay without the resource) and the notices the screen has to say (what the relay sees, the report reveals the text).
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { notFound, estado: state } = vi.hoisted(() => ({ notFound: vi.fn(() => { throw new Error('NOT_FOUND') }), estado: { rede: null as unknown } }))
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ notFound, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/pt/mensagens' }))
vi.mock('@/app/social-actions', () => ({ actAction: vi.fn(async () => ({ ok: true })), moreAction: vi.fn(), proposeAction: vi.fn() }))
vi.mock('@/lib/rover/portrait', () => ({ portrait: vi.fn(async () => 'blob:x') }))
vi.mock('@/lib/get-network', () => ({ getNetwork: () => state.rede }))
vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })

import { FakeClient } from '@/lib/fake-client'
import { uidOf } from '@/lib/demo-data'
import { CONVERSATIONS } from '@/lib/social/fake/seed-messages'
import { actAction } from '@/app/social-actions'
import Navigation from '@/components/Navigation'
import { dict } from '@/lib/i18n'
import Messages from '@/app/[lang]/mensagens/page'
import OpenConversation from '@/app/[lang]/mensagens/[id]/page'

const NOW = () => new Date('2026-11-05T15:00:00.000Z')
const renderScreen = async (jsx: Promise<React.ReactElement>) => render(await jsx)
const list = (sp: { estado?: string; para?: string } = {}, lang = 'pt') => renderScreen(Messages({ params: Promise.resolve({ lang }), searchParams: Promise.resolve(sp) }))
const conversation = (id: string, lang = 'pt') => renderScreen(OpenConversation({ params: Promise.resolve({ lang, id }) }))

beforeEach(() => {
  notFound.mockClear()
  vi.mocked(actAction).mockClear()
  const fake = new FakeClient(NOW)
  state.rede = { cliente: fake, ponte: fake }
})

describe('conversation list', () => {
  it('shows the five conversations, the demo strip and what the relay sees', async () => {
    await list()
    expect(screen.getByRole('heading', { level: 1, name: 'Mensagens' })).toBeInTheDocument()
    expect(screen.getByText(/as conversas abaixo são inventadas/)).toBeInTheDocument()
    expect(screen.getByText(/quem conversa com quem, quando/)).toBeInTheDocument()
    const items = screen.getAllByRole('link', { name: /@(pipa|nina|max|tuca|teco)/ }).filter((a) => a.getAttribute('href')?.startsWith('/pt/mensagens/'))
    expect(items).toHaveLength(5)
    expect(screen.getByText(/· Pediu para conversar/)).toBeInTheDocument()
    expect(screen.getByText(/· Você pediu para conversar/)).toBeInTheDocument()
    expect(screen.getByText('Encerrada')).toBeInTheDocument()
  })
  it('the received request has Accept and Refuse right there, and Accept asks for confirmation saying what happens next', async () => {
    await list()
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar' }))
    const dlg = screen.getByRole('dialog')
    expect(within(dlg).getByText(/as mensagens vão cifradas entre os dois rovers/)).toBeInTheDocument()
    fireEvent.click(within(dlg).getByRole('button', { name: 'Aceitar' }))
    await vi.waitFor(() => expect(actAction).toHaveBeenCalledWith({ tipo: 'conversa-decidir', conversa: CONVERSATIONS.nina, decisao: 'aceitar' }))
  })
  it('the Requests filter shows only the pending ones, and the active link is marked', async () => {
    await list({ estado: 'pendentes' })
    expect(screen.getByRole('link', { name: 'Pedidos' })).toHaveAttribute('aria-current', 'page')
    const items = screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/pt/mensagens/ob_'))
    expect(items).toHaveLength(2)
  })
  it('request a conversation: a friend with an open or pending conversation appears as "Já conversam"; a free one gets the request form', async () => {
    const { unmount } = await list()
    expect(screen.getAllByText('Já conversam')).toHaveLength(4)
    expect(screen.getByRole('link', { name: 'Pedir conversa' })).toHaveAttribute('href', `/pt/mensagens?para=${uidOf('tuca')}#pedir`)
    unmount()
    await list({ para: uidOf('tuca') })
    expect(screen.getByText('pedido de conversa a @tuca')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar o pedido' })).toBeDisabled() // empty does not go out
  })
  it('para= of someone already talking, or of a non-friend, does not open a form', async () => {
    await list({ para: uidOf('pipa') })
    expect(screen.queryByRole('button', { name: 'Enviar o pedido' })).toBeNull()
  })
})

describe('conversa aberta', () => {
  it('accepted: request in the clear, the messages, report only on received ones and the form to write', async () => {
    await conversation(CONVERSATIONS.pipa)
    expect(screen.getByRole('heading', { level: 1, name: 'Conversa com Pipa' })).toBeInTheDocument()
    expect(screen.getByText(/posso te mandar o desenho da nuvem/)).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').filter((li) => li.classList.contains('msg'))).toHaveLength(4)
    expect(screen.getAllByRole('button', { name: 'Denunciar' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Apagar a minha cópia' })).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'Entregar ao rover' })).toBeInTheDocument()
    expect(screen.getByText(/O seu rover envia na próxima folga/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Encerrar a conversa' })).toBeInTheDocument()
  })
  it('reporting warns that the text and the signature go to whoever operates the relay, and sends the right act', async () => {
    await conversation(CONVERSATIONS.pipa)
    fireEvent.click(screen.getAllByRole('button', { name: 'Denunciar' })[0])
    expect(screen.getByText(/revela a quem opera o relé o texto desta mensagem e a assinatura/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Revelar e denunciar' }))
    expect(screen.getByText('Escolha um motivo.')).toBeInTheDocument()
    expect(actAction).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('radio')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Revelar e denunciar' }))
    await vi.waitFor(() => expect(actAction).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'mensagem-denuncia', motivo: 'spam' })))
    expect(await screen.findByText(/Denúncia enviada/)).toBeInTheDocument()
  })
  it('the unreadable message shows no text at all and has no report', async () => {
    await conversation(CONVERSATIONS.teco)
    const unreadable = screen.getByText(/Mensagem ilegível/)
    const item = unreadable.closest('li')!
    expect(item).toHaveAttribute('data-ilegivel', 'true')
    expect(within(item).queryByRole('button', { name: 'Denunciar' })).toBeNull()
  })
  it('received request: decides, no form to write', async () => {
    await conversation(CONVERSATIONS.nina)
    expect(screen.getByText('Este pedido espera a sua decisão.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recusar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Entregar ao rover' })).toBeNull()
    expect(screen.getByText(/fica em claro no relé até a conversa ser aceita/)).toBeInTheDocument()
  })
  it('sent request: waits and can cancel', async () => {
    await conversation(CONVERSATIONS.max)
    expect(screen.getByText('Esperando @max decidir.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar o pedido' })).toBeInTheDocument()
  })
  it('closed: the history stays, nobody writes', async () => {
    await conversation(CONVERSATIONS.tuca)
    expect(screen.getByText(/Esta conversa foi encerrada/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Entregar ao rover' })).toBeNull()
    expect(screen.getAllByRole('listitem').filter((li) => li.classList.contains('msg'))).toHaveLength(2)
  })
  it('a malformed id is "not found"; a conversation of others does not exist for whoever reads', async () => {
    await expect(conversation('lixo')).rejects.toThrow('NOT_FOUND')
    await expect(conversation('ob_DEMOnaoexiste000000000000000000000000000')).rejects.toThrow('NOT_FOUND')
  })
  it('in Arabic, the screen mounts with the @ in its own direction', async () => {
    await conversation(CONVERSATIONS.pipa, 'ar')
    expect(document.querySelector('bdi[dir="ltr"]')?.textContent).toBe('@pipa')
  })
})

describe('gates: the screen belongs to the person\'s app', () => {
  it('without the paired app, no conversation (neither list nor open conversation)', async () => {
    const fake = new FakeClient(NOW)
    state.rede = { cliente: fake, ponte: { ...fake, whoAmI: async () => null } }
    const { unmount } = await list()
    expect(screen.getByText(/Pareie o app do Rover Hangar/)).toBeInTheDocument()
    expect(screen.queryByText(/Pediu para conversar/)).toBeNull()
    unmount()
    await conversation(CONVERSATIONS.pipa)
    expect(screen.getByText(/Pareie o app do Rover Hangar/)).toBeInTheDocument()
    expect(screen.queryByText(/posso te mandar a foto/)).toBeNull()
  })
  it('relay without the `mensagens` resource: explains and does not call the routes', async () => {
    const fake = new FakeClient(NOW)
    const conversations = vi.spyOn(fake, 'conversas')
    const client = new Proxy(fake, { get: (target, p) => (p === 'suporta' ? async () => false : Reflect.get(target, p)) })
    state.rede = { cliente: client, ponte: fake }
    await list()
    expect(screen.getByText(/não tem as mensagens privadas ligadas/)).toBeInTheDocument()
    expect(conversations).not.toHaveBeenCalled()
  })
})

describe('menu', () => {
  const f = dict('pt').socFolgali
  const me = { uid: 'rvr_DEMOlumi00000000000000', handle: 'lumi', nome: 'Lumi', rosto: { corpo: 'sino', cor: '#b49cff', acessorios: [] } }
  it('Messages appears in the rail only when the shell says there are messages (paired app and relay with the resource)', () => {
    const { unmount } = render(<Navigation lang="pt" topo={f.topo} trilho={f.trilho} eu={me} mensagens={false} modo="trilho" />)
    expect(screen.queryByRole('link', { name: 'Mensagens' })).toBeNull()
    unmount()
    render(<Navigation lang="pt" topo={f.topo} trilho={f.trilho} eu={me} mensagens modo="trilho" />)
    expect(screen.getByRole('link', { name: 'Mensagens' })).toHaveAttribute('href', '/pt/mensagens')
    expect(screen.getByRole('link', { name: 'Mensagens' })).toHaveAttribute('aria-current', 'page')
  })
})
