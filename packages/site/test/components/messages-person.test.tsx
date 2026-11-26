// The private messages screen of a PERSON (protocol 0.4.0, real mode): the states before the inbox (signed out, off, activation with the
// one-key warning), the list and its filter, a received request (accept), the open conversation (decrypted, unreadable, the leak filter
// before encrypting, send), the report that reveals one message, a new conversation (friend, request in clear), and the page that says
// messages are off. The crypto library is mocked here: test/person/mensagens-*.test.ts prove it against the protocol.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  personState: vi.fn(),
  supported: vi.fn(),
  cipherStatus: vi.fn(),
  activate: vi.fn(),
  list: vi.fn(),
  read: vi.fn(),
  requestText: vi.fn(),
  send: vi.fn(),
  decide: vi.fn(),
  del: vi.fn(),
  report: vi.fn(),
  friends: vi.fn(),
  ask: vi.fn(),
  info: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('@/lib/person/client', async (original) => ({ ...(await original<typeof import('@/lib/person/client')>()), personState: h.personState }))
vi.mock('@/lib/person/messages', async (original) => ({
  ...(await original<typeof import('@/lib/person/messages')>()),
  messagesSupported: h.supported,
  cipherStatus: h.cipherStatus,
  activateMessages: h.activate,
  listConversations: h.list,
  readMessages: h.read,
  requestText: h.requestText,
  sendMessage: h.send,
  decideConversation: h.decide,
  deleteCopy: h.del,
  reportMessage: h.report,
  listFriends: h.friends,
  askConversation: h.ask,
}))
vi.mock('@/lib/person/messages-info', () => ({ messagesInfo: h.info }))
vi.mock('@/lib/folgali/rovemark', () => ({ rovemarkTargets: () => ({ entrar: '/api/auth/rovemark/inicio?lang=pt', criar: null }) }))

import PersonMessages, { type Props } from '@/components/messages/PersonMessages'
import PersonMessagesPage from '@/components/messages/PersonMessagesPage'
import { MESSAGES_TEXTS } from '@/i18n/messages'
import { PersonError } from '@/lib/person/client'
import type { Conversation, MessageItem } from '@/lib/person/messages'
import { legalDict } from '@/lib/legal-i18n'

const t = MESSAGES_TEXTS.pt
const ME = 'rvr_' + 'A'.repeat(22)
const BIA = 'rvr_' + 'B'.repeat(22)
const CAIO = 'rvr_' + 'C'.repeat(22)
const id = (c: string) => `ob_${c.repeat(43)}`
const props: Props = { lang: 'pt', t, leak: legalDict('pt').vazamento, issuers: ['K'.repeat(43)], retentionDays: 30, signIn: '/entrar-rovemark', consentHref: '/pt/entrar', profileHref: '/pt/linha' }

const conv = (over: Partial<Conversation> = {}): Conversation => ({
  id: id('X'), com: { uid: BIA, handle: 'bia', nome: 'Bia Lima', especie: 'pessoa' }, estado: 'ativa', iniciadaPor: ME,
  criadaEm: 1_800_000_000, atualizadaEm: 1_800_000_100, ultimaMensagemEm: 1_800_000_100, mensagens: 2, pedido: null, ...over,
})
const pendingFromCaio = conv({ id: id('P'), com: { uid: CAIO, handle: 'caio', nome: 'Caio', especie: 'pessoa' }, estado: 'pendente', iniciadaPor: CAIO, mensagens: 0, ultimaMensagemEm: null, pedido: { tipo: 'conversa-pedir' } as never })
const msg = (over: Partial<MessageItem>): MessageItem => ({ id: id('M'), de: BIA, criadoEm: 1_800_000_050, mine: false, legible: true, why: null, texto: 'oi', assinatura: 's'.repeat(86), ...over })

beforeEach(() => {
  vi.clearAllMocks()
  h.personState.mockResolvedValue({ uid: ME, handle: 'ana', adult: true, head: null, profile: true, name: 'Ana', consent: true })
  h.supported.mockResolvedValue(true)
  h.cipherStatus.mockResolvedValue({ local: 'L'.repeat(43), current: 'L'.repeat(43) })
  h.list.mockResolvedValue({ items: [conv(), pendingFromCaio], next: null })
  h.read.mockResolvedValue({ items: [], next: null })
  h.requestText.mockResolvedValue(null)
  h.friends.mockResolvedValue([])
})

describe('before the inbox', () => {
  it('signed out: the invitation to sign in, nothing else runs', async () => {
    h.personState.mockRejectedValue(new PersonError(401, 'sem_sessao'))
    render(<PersonMessages {...props} />)
    expect(await screen.findByText(t.signedOut)).toBeTruthy()
    expect(screen.getByRole('link', { name: t.signIn }).getAttribute('href')).toBe('/entrar-rovemark')
    expect(h.cipherStatus).not.toHaveBeenCalled()
  })
  it('a browser without X25519 says so and creates nothing', async () => {
    h.supported.mockResolvedValue(false)
    render(<PersonMessages {...props} />)
    expect(await screen.findByText(t.unsupported)).toBeTruthy()
    expect(h.activate).not.toHaveBeenCalled()
  })
  it('first time: the activation explains the one key per account, and the button creates and publishes it', async () => {
    h.cipherStatus.mockResolvedValue({ local: null, current: null })
    h.activate.mockResolvedValue({ local: 'L'.repeat(43), current: 'L'.repeat(43) })
    render(<PersonMessages {...props} />)
    expect(await screen.findByRole('heading', { name: t.activateTitle })).toBeTruthy()
    expect(screen.getByText(t.activateOneKey)).toBeTruthy()
    expect(h.list).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: t.activate }))
    expect(h.activate).toHaveBeenCalledWith(ME)
    expect(await screen.findByRole('heading', { name: t.conversations })).toBeTruthy()
  })
  it('active on another device: the warning that this swaps the key and the other stops reading new messages', async () => {
    h.cipherStatus.mockResolvedValue({ local: null, current: 'O'.repeat(43) })
    render(<PersonMessages {...props} />)
    expect(await screen.findByText(t.activateOther)).toBeTruthy()
  })
})

describe('the inbox', () => {
  it('lists conversations, filters through the relay, and opens a received request to accept it', async () => {
    h.requestText.mockResolvedValue('Oi Ana, vamos conversar?')
    h.decide.mockResolvedValue({ id: id('D') })
    render(<PersonMessages {...props} />)
    const list = await screen.findByRole('list')
    expect(within(list).getByText('Bia Lima')).toBeTruthy()
    expect(within(list).getByText(t.theyAsked)).toBeTruthy()
    expect(screen.getAllByText(new RegExp(t.privacy.slice(0, 30))).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: t.filters.pendentes }))
    await waitFor(() => expect(h.list).toHaveBeenCalledWith(ME, 'pendentes'))
    await userEvent.click(within(list).getByText('Caio'))
    expect(await screen.findByText('Oi Ana, vamos conversar?')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: t.accept }))
    expect(h.decide).toHaveBeenCalledWith(id('P'), 'aceitar')
  })

  it('shows decrypted messages and an unreadable one without its text; the leak filter blocks before encrypting; a clean text is sent', async () => {
    h.read.mockResolvedValue({ items: [msg({ id: id('2'), texto: 'tudo certo?', criadoEm: 1_800_000_060 }), msg({ id: id('1'), legible: false, why: 'unreadable', texto: null, assinatura: null, criadoEm: 1_800_000_055 }), msg({ id: id('0'), mine: true, de: ME, texto: 'oi Bia' })], next: null })
    h.send.mockResolvedValue(msg({ id: id('3'), mine: true, de: ME, texto: 'Tudo, e você?', criadoEm: 1_800_000_070 }))
    render(<PersonMessages {...props} initial={id('X')} />)
    expect(await screen.findByText('tudo certo?')).toBeTruthy()
    expect(screen.getByText('oi Bia')).toBeTruthy()
    expect(screen.getByText(t.unreadable)).toBeTruthy()
    const box = screen.getByPlaceholderText(t.writePlaceholder)
    const send = screen.getByRole('button', { name: t.send })
    await userEvent.type(box, 'meu email é ana@exemplo.com')
    expect((send as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(legalDict('pt').vazamento.contato)).toBeTruthy()
    await userEvent.clear(box)
    await userEvent.type(box, '  Tudo, e você?  ')
    // the relay holds it once published: the refresh after sending reads it back (decrypted with this device's key)
    const after = (await h.read.mock.results[0].value) as { items: MessageItem[] }
    h.read.mockResolvedValue({ items: [msg({ id: id('3'), mine: true, de: ME, texto: 'Tudo, e você?', criadoEm: 1_800_000_070 }), ...after.items], next: null })
    await userEvent.click(send)
    await waitFor(() => expect(h.send).toHaveBeenCalledTimes(1))
    expect(h.send.mock.calls[0][0]).toBe(ME)
    expect(h.send.mock.calls[0][2]).toBe('Tudo, e você?')
    expect(await screen.findByText('Tudo, e você?')).toBeTruthy()
  })

  it('when another device took the key, sending says so and goes back to activation', async () => {
    h.send.mockRejectedValue(new PersonError(409, 'outro_aparelho'))
    render(<PersonMessages {...props} initial={id('X')} />)
    const box = await screen.findByPlaceholderText(t.writePlaceholder)
    h.cipherStatus.mockResolvedValue({ local: 'L'.repeat(43), current: 'O'.repeat(43) })
    await userEvent.type(box, 'oi')
    await userEvent.click(screen.getByRole('button', { name: t.send }))
    expect(await screen.findByText(t.activateOther)).toBeTruthy()
  })

  it('reporting a received message reveals it to the operator, with the warning, and only after a reason', async () => {
    const received = msg({ id: id('R'), texto: 'texto abusivo' })
    h.read.mockResolvedValue({ items: [received, msg({ id: id('Q'), mine: true, de: ME, texto: 'minha' })], next: null })
    h.report.mockResolvedValue({ id: id('Z') })
    render(<PersonMessages {...props} initial={id('X')} />)
    await screen.findByText('texto abusivo')
    // only the received one can be reported
    expect(screen.getAllByRole('button', { name: t.report })).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: t.report }))
    const form = await screen.findByRole('form', { name: t.reportTitle })
    expect(within(form).getByText(t.reportWarning)).toBeTruthy()
    const go = within(form).getByRole('button', { name: t.reportSend }) as HTMLButtonElement
    expect(go.disabled).toBe(true)
    await userEvent.click(within(form).getByLabelText(t.reasons.assedio))
    await userEvent.click(go)
    expect(h.report).toHaveBeenCalledWith(received, 'assedio')
    expect(await screen.findByText(t.reported)).toBeTruthy()
  })

  it('deleting my copy of one message asks first, then publishes conversa-apagar for that message', async () => {
    h.read.mockResolvedValue({ items: [msg({ id: id('R'), texto: 'apague-me' })], next: null })
    h.del.mockResolvedValue({ id: id('Z') })
    render(<PersonMessages {...props} initial={id('X')} />)
    await screen.findByText('apague-me')
    await userEvent.click(screen.getByRole('button', { name: t.deleteOne }))
    expect(screen.getByText(t.deleteOneConfirm)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: t.confirm }))
    expect(h.del).toHaveBeenCalledWith(id('X'), id('R'))
  })

  it('a new conversation: friends only (busy ones disabled), the request warns it travels in clear, and has no links', async () => {
    h.friends.mockResolvedValue([{ uid: BIA, handle: 'bia', nome: 'Bia Lima' }, { uid: 'rvr_' + 'D'.repeat(22), handle: 'duda', nome: 'Duda' }])
    h.ask.mockResolvedValue({ id: id('N'), objeto: { id: id('N') } })
    render(<PersonMessages {...props} />)
    await userEvent.click(await screen.findByRole('button', { name: t.newConversation }))
    expect(await screen.findByText(t.pickFriend)).toBeTruthy()
    const friends = within(document.querySelector('.cv-friends') as HTMLElement)
    const bia = friends.getByRole('button', { name: /Bia Lima/ }) as HTMLButtonElement
    expect(bia.disabled).toBe(true)
    expect(within(bia).getByText(t.alreadyTalking)).toBeTruthy()
    await userEvent.click(friends.getByRole('button', { name: /Duda/ }))
    expect(screen.getByText(t.requestClear)).toBeTruthy()
    const box = screen.getByLabelText(t.requestTitle)
    const go = screen.getByRole('button', { name: t.requestSend }) as HTMLButtonElement
    await userEvent.type(box, 'veja https://folgali.com')
    expect(go.disabled).toBe(true)
    expect(screen.getByText(t.requestNoLinks)).toBeTruthy()
    await userEvent.clear(box)
    await userEvent.type(box, 'Oi Duda, bora conversar?')
    await userEvent.click(go)
    expect(h.ask).toHaveBeenCalledWith('rvr_' + 'D'.repeat(22), 'Oi Duda, bora conversar?')
  })

  it('a refusal from the relay is read in words, never the relay sentence', async () => {
    h.friends.mockResolvedValue([{ uid: 'rvr_' + 'D'.repeat(22), handle: 'duda', nome: 'Duda' }])
    h.ask.mockRejectedValue(new PersonError(403, 'interacao_nao_permitida'))
    render(<PersonMessages {...props} />)
    await userEvent.click(await screen.findByRole('button', { name: t.newConversation }))
    await userEvent.click(await screen.findByRole('button', { name: /Duda/ }))
    await userEvent.type(screen.getByLabelText(t.requestTitle), 'Oi!')
    await userEvent.click(screen.getByRole('button', { name: t.requestSend }))
    expect(await screen.findByText(t.refusals.notFriends)).toBeTruthy()
  })
})

describe('the page', () => {
  it('with `mensagens` off on the relay it says so and the client screen never starts', async () => {
    h.info.mockResolvedValue({ on: false, issuers: [], retentionS: 2_592_000 })
    render(await PersonMessagesPage({ lang: 'pt' }))
    expect(screen.getByText(t.off)).toBeTruthy()
    expect(h.personState).not.toHaveBeenCalled()
  })
  it('a relay that did not answer is "could not check", never "off"', async () => {
    h.info.mockResolvedValue({ on: false, unknown: true, issuers: [], retentionS: 2_592_000 })
    render(await PersonMessagesPage({ lang: 'pt' }))
    expect(screen.getByText(t.failed)).toBeTruthy()
    expect(screen.queryByText(t.off)).toBeNull()
    expect(screen.getByRole('link', { name: t.retry }).getAttribute('href')).toBe('/pt/mensagens')
  })
  it('the 12 languages carry every text, with no dash', () => {
    for (const [lang, pack] of Object.entries(MESSAGES_TEXTS)) {
      const flat = JSON.stringify(pack)
      expect(flat, lang).not.toMatch(/[–—]/)
      expect(Object.keys(pack).sort(), lang).toEqual(Object.keys(MESSAGES_TEXTS.pt).sort())
    }
  })
})
