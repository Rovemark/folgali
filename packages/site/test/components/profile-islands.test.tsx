import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { actAction, moreAction, markNoticesSeenAction, followAction } = vi.hoisted(() => ({
  actAction: vi.fn(async () => ({ ok: true as const })) as ReturnType<typeof vi.fn>,
  moreAction: vi.fn(async () => null),
  markNoticesSeenAction: vi.fn(async () => undefined),
  followAction: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/app/social-actions', () => ({ actAction, moreAction, markNoticesSeenAction }))
vi.mock('@/app/actions', () => ({ followAction }))
vi.mock('@/lib/rover/portrait', () => ({ portrait: vi.fn(async () => 'blob:x') }))

import RelationActions from '@/components/profile/RelationActions'
import NoticeList, { noticePhrase } from '@/components/profile/NoticeList'
import TestimonialList from '@/components/profile/TestimonialList'
import NoteList from '@/components/profile/NoteList'
import Medals from '@/components/profile/Medals'
import { dict } from '@/lib/i18n'
import { demoId } from '@/lib/domain/ids'
import type { Testimonial, Notification, Note } from '@/lib/social/types'
import { NOW, pipa, lumi } from './help'

const d = dict('pt')
const uid = (s: string) => demoId('rvr', s)
const ob = (s: string) => demoId('ob', s)

beforeEach(() => {
  vi.clearAllMocks()
  actAction.mockImplementation(async () => ({ ok: true }))
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open') })
})

describe('Medalhas', () => {
  const badges = { confiavel: 3, caprichoso: 0, rapido: 1, divertido: 2 }
  it('shows the friend count of each badge and, for whoever can, the give button', async () => {
    render(<Medals selos={badges} targetUid={pipa.uid} can="sim" d={d} />)
    expect(screen.getByText('3 amigos')).toBeInTheDocument()
    expect(screen.getByText('1 amigo')).toBeInTheDocument()
    expect(screen.getByText('ninguém ainda')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Dar o selo Rápido/ }))
    expect(actAction).toHaveBeenCalledWith({ tipo: 'selo', alvo: pipa.uid, selo: 'rapido' })
  })
  it('without permission there is no button at all and the reason appears', () => {
    const { rerender } = render(<Medals selos={badges} targetUid={pipa.uid} can="nao-amigo" d={d} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByText(/Selo é entre amigos/)).toBeInTheDocument()
    rerender(<Medals selos={badges} targetUid={pipa.uid} can="sem-tempo" d={d} />)
    expect(screen.getByText(/7 dias ou mais/)).toBeInTheDocument()
    rerender(<Medals selos={badges} targetUid={pipa.uid} can="ninguem" d={d} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
  it('when the relay refuses, the reason appears right there', async () => {
    actAction.mockImplementationOnce(async () => ({ ok: false, codigo: 'ja-existe' }))
    render(<Medals selos={badges} targetUid={pipa.uid} can="sim" d={d} />)
    await userEvent.click(screen.getByRole('button', { name: /Dar o selo Confiável/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Isso já existe.')
  })
})

const dep = (extra: Partial<Testimonial> = {}): Testimonial => ({ id: ob('dep1'), autor: pipa, alvo: lumi.uid, texto: 'Trabalhar com a Lumi é fácil.', estado: 'aceito', criadoEm: '2026-11-01T10:00:00.000Z', aceitoEm: '2026-11-02T10:00:00.000Z', ...extra })

describe('ListaDepoimentos', () => {
  const base = { ownerUid: lumi.uid, ownerHandle: 'lumi', d, lang: 'pt' as const, agora: NOW }
  it('the owner sees the pending ones and decides: accepting goes straight through, refusing asks for confirmation', async () => {
    const pend = dep({ id: ob('pend1'), estado: 'pendente', texto: 'Texto esperando.' })
    render(<TestimonialList {...base} aceitos={{ itens: [dep()] }} pendentes={[pend]} myUid={lumi.uid} />)
    expect(screen.getByText('Esperando a sua decisão')).toBeInTheDocument()
    expect(screen.getByText('Texto esperando.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Aceitar' }))
    expect(actAction).toHaveBeenCalledWith({ tipo: 'depoimento-decisao', depoimento: pend.id, decisao: 'aceitar' })
    actAction.mockClear()
    const declineButtons = screen.getAllByRole('button', { name: 'Recusar' })
    await userEvent.click(declineButtons[0])
    expect(actAction).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { hidden: true })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Recusar', hidden: true }))
    expect(actAction).toHaveBeenCalledWith({ tipo: 'depoimento-decisao', depoimento: pend.id, decisao: 'recusar' })
  })
  it('whoever is not the owner never sees a pending one, even if it arrives by mistake', () => {
    const pend = dep({ id: ob('pend2'), estado: 'pendente', texto: 'Segredo do dono.' })
    render(<TestimonialList {...base} aceitos={{ itens: [dep()] }} pendentes={[pend]} myUid={pipa.uid} />)
    expect(screen.queryByText('Segredo do dono.')).not.toBeInTheDocument()
    expect(screen.queryByText('Esperando a sua decisão')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aceitar' })).not.toBeInTheDocument()
    expect(screen.getByText('Trabalhar com a Lumi é fácil.')).toBeInTheDocument()
  })
  it('the owner can hide a testimonial that was already accepted (with confirmation)', async () => {
    render(<TestimonialList {...base} aceitos={{ itens: [dep()] }} pendentes={[]} myUid={lumi.uid} />)
    await userEvent.click(screen.getByRole('button', { name: 'Esconder do meu perfil' }))
    expect(actAction).not.toHaveBeenCalled()
    await userEvent.click(within(screen.getByRole('dialog', { hidden: true })).getByRole('button', { name: 'Esconder', hidden: true }))
    expect(actAction).toHaveBeenCalledWith({ tipo: 'depoimento-decisao', depoimento: dep().id, decisao: 'recusar' })
  })
})

const note = (extra: Partial<Note> = {}): Note => ({ id: ob('rec1'), autor: pipa, alvo: lumi.uid, texto: 'Oi, @lumi! Passei para deixar um oi. #pastas', criadoEm: '2026-11-04T14:00:00.000Z', ...extra })

describe('ListaRecados', () => {
  const base = { initial: { itens: [note()] }, ownerUid: lumi.uid, ownerHandle: 'lumi', d, lang: 'pt' as const, agora: NOW }
  it('draws mention and tag as links and shows the note', () => {
    render(<NoteList {...base} myUid={null} />)
    expect(screen.getByRole('link', { name: '@lumi' })).toHaveAttribute('href', '/pt/r/lumi')
    expect(screen.getByRole('link', { name: '#pastas' })).toHaveAttribute('href', expect.stringContaining('buscar?q='))
  })
  it('a stranger\'s menu only has report', () => {
    render(<NoteList {...base} myUid={uid('lola')} />)
    expect(screen.getByRole('link', { name: 'Denunciar' })).toHaveAttribute('href', expect.stringContaining('/pt/denunciar/'))
    expect(screen.queryByRole('button', { name: 'Apagar o recado' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tirar do meu mural' })).not.toBeInTheDocument()
  })
  it('the author deletes their own; the wall\'s owner removes with a reason', async () => {
    const { unmount } = render(<NoteList {...base} myUid={pipa.uid} />)
    await userEvent.click(screen.getByRole('button', { name: 'Apagar o recado' }))
    await userEvent.click(within(screen.getByRole('dialog', { hidden: true })).getByRole('button', { name: 'Apagar', hidden: true }))
    expect(actAction).toHaveBeenCalledWith({ tipo: 'remocao-pelo-autor', alvo: note().id })
    unmount()
    actAction.mockClear()
    render(<NoteList {...base} myUid={lumi.uid} />)
    expect(screen.queryByRole('button', { name: 'Apagar o recado' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tirar do meu mural' }))
    const dialog = screen.getByRole('dialog', { hidden: true })
    await userEvent.selectOptions(within(dialog).getByLabelText('Motivo'), 'spam')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tirar do mural', hidden: true }))
    expect(actAction).toHaveBeenCalledWith({ tipo: 'remocao-por-responsavel', alvo: note().id, motivo: 'spam' })
  })
})

describe('AcoesRelacao', () => {
  const you = { amigo: false, pedidoEnviado: false, pedidoRecebido: false, euBloqueei: false, euSilenciei: false, papel: null }
  const props = { uid: pipa.uid, nome: 'Pipa', d }
  it('no relation: follow and ask for friendship', async () => {
    render(<RelationActions {...props} euSigo={false} voce={you} />)
    expect(screen.getByRole('button', { name: 'Seguir' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Pedir amizade' }))
    expect(actAction).toHaveBeenCalledWith({ tipo: 'amizade', alvo: pipa.uid, acao: 'pedir' })
  })
  it('received request: accept and refuse; sent request: cancel', async () => {
    const { unmount } = render(<RelationActions {...props} voce={{ ...you, pedidoRecebido: true }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Aceitar amizade' }))
    expect(actAction).toHaveBeenCalledWith({ tipo: 'amizade', alvo: pipa.uid, acao: 'aceitar' })
    expect(screen.getByRole('button', { name: 'Recusar' })).toBeInTheDocument()
    unmount()
    render(<RelationActions {...props} voce={{ ...you, pedidoEnviado: true }} />)
    expect(screen.getByText('Pedido enviado')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pedir amizade' })).not.toBeInTheDocument()
  })
  it('block and mute sit behind "Mais opções" and ask for confirmation; the other side is not notified', async () => {
    render(<RelationActions {...props} voce={{ ...you, amigo: true }} />)
    expect(screen.queryByRole('button', { name: 'Bloquear' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções' }))
    await userEvent.click(screen.getByRole('button', { name: 'Bloquear' }))
    expect(actAction).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { hidden: true })
    expect(dialog).toHaveTextContent('não recebe aviso nenhum')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Bloquear', hidden: true }))
    expect(actAction).toHaveBeenCalledWith({ tipo: 'relacao', alvo: pipa.uid, acao: 'bloquear' })
  })
  it('when I blocked, only the notice and the unblock appear', async () => {
    render(<RelationActions {...props} euSigo={false} voce={{ ...you, euBloqueei: true }} />)
    expect(screen.getByText('Você bloqueou Pipa')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Seguir' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Desbloquear' }))
    expect(actAction).toHaveBeenCalledWith({ tipo: 'relacao', alvo: pipa.uid, acao: 'desbloquear' })
  })
})

const notice = (extra: Partial<Notification>): Notification => ({ seq: 5, tipo: 'recado', em: '2026-11-04T14:50:00.000Z', origem: pipa, objeto: ob('x'), comunidade: null, pagina: null, ...extra })

describe('avisos', () => {
  it('the sentence never carries content: only who and where, and handles a missing name', () => {
    expect(noticePhrase(notice({}), d)).toBe('Pipa deixou um recado no seu mural')
    expect(noticePhrase(notice({ tipo: 'resposta-no-topico', nomeDoTopico: 'Nomes de backup' }), d)).toBe('Pipa respondeu ao seu tópico Nomes de backup')
    expect(noticePhrase(notice({ tipo: 'selo-recebido', origem: null }), d)).toBe('Um amigo deu um selo ao seu rover')
    expect(noticePhrase(notice({ tipo: 'recado', origem: null }), d)).toBe('Alguém deixou um recado no seu mural')
  })
  it('the new ones are highlighted, the requests have a button right there, and opening marks as seen', async () => {
    const items = [notice({ seq: 9, tipo: 'pedido-de-amizade', objeto: null }), notice({ seq: 3, tipo: 'recado' })]
    render(<NoticeList initial={{ itens: items }} myUid={lumi.uid} myHandle="lumi" visto={5} d={d} lang="pt" agora={NOW} />)
    expect(screen.getByRole('heading', { name: /Novos/ })).toBeInTheDocument()
    await waitFor(() => expect(markNoticesSeenAction).toHaveBeenCalledWith(9))
    await userEvent.click(screen.getByRole('button', { name: 'Aceitar' }))
    expect(actAction).toHaveBeenCalledWith({ tipo: 'amizade', alvo: pipa.uid, acao: 'aceitar' })
    expect(screen.getAllByRole('link', { name: 'Abrir' }).map((a) => a.getAttribute('href'))).toEqual(['/pt/amigos', '/pt/r/lumi?aba=mural'])
  })
  it('0.4.0: a conversation request and acceptance say only who, lead to /mensagens and have no decide button there', () => {
    expect(noticePhrase(notice({ tipo: 'conversa-pedido', objeto: null }), d)).toBe('Pipa pediu para conversar com você por mensagem privada')
    expect(noticePhrase(notice({ tipo: 'conversa-aceita', objeto: null }), d)).toBe('Pipa aceitou conversar com você por mensagem privada')
    expect(noticePhrase(notice({ tipo: 'conversa-pedido', objeto: null }), dict('en'))).toBe('Pipa asked to talk with you by private message')
    expect(noticePhrase(notice({ tipo: 'conversa-aceita', origem: null, objeto: null }), d)).toBe('Alguém aceitou conversar com você por mensagem privada')
    const items = [notice({ seq: 8, tipo: 'conversa-pedido', objeto: null }), notice({ seq: 7, tipo: 'conversa-aceita', objeto: null, origem: null })]
    const { container } = render(<NoticeList initial={{ itens: items }} myUid={lumi.uid} myHandle="lumi" visto={9} d={d} lang="pt" agora={NOW} />)
    expect(screen.getAllByRole('link', { name: 'Abrir' }).map((a) => a.getAttribute('href'))).toEqual(['/pt/mensagens', '/pt/mensagens'])
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    // with an origin, the portrait of whoever asked; without an origin, the padlock icon (never the generic alert icon)
    expect(container.querySelectorAll('[data-tipo="conversa-aceita"] .pf-notice-icon svg')).toHaveLength(1)
    expect(container.querySelector('[data-tipo="conversa-pedido"]')?.textContent).toContain('Pipa pediu para conversar')
  })
  it('when the object is gone, says it is no longer available and offers no link', () => {
    render(<NoticeList initial={{ itens: [notice({ seq: 2, tipo: 'resposta-no-topico', objeto: null })] }} myUid={lumi.uid} myHandle="lumi" visto={9} d={d} lang="pt" agora={NOW} />)
    expect(screen.getByText(/não está mais disponível/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Abrir' })).not.toBeInTheDocument()
    expect(markNoticesSeenAction).not.toHaveBeenCalled()
  })
})
