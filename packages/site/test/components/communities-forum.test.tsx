import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { actAction } = vi.hoisted(() => ({ actAction: vi.fn(async (a: unknown) => (void a, { ok: true as const, resultado: undefined as string | undefined })) }))
vi.mock('@/app/social-actions', () => ({ actAction, moreAction: vi.fn(), proposeAction: vi.fn() }))
vi.mock('@/app/actions', () => ({ reactAction: vi.fn(async () => ({ ok: true })), deleteAction: vi.fn() }))
vi.mock('@/lib/rover/portrait', () => ({ portrait: vi.fn(async () => 'blob:x') }))

import PollBlock from '@/components/communities/PollBlock'
import Thread, { type ThreadContext } from '@/components/communities/Thread'
import TopicManagement from '@/components/communities/TopicManagement'
import { dict } from '@/lib/i18n'
import type { Poll, ForumReply } from '@/lib/social/types'

const d = dict('pt')
const NOW = '2026-11-05T12:00:00.000Z'
const TOP = 'ob_DEMOtcinemapipoca00000000000000000000000000'
const face = { corpo: 'sino', cor: '#b49cff' }
const rover = (n: string) => ({ uid: `rvr_DEMO${n}`.padEnd(26, '0'), handle: n, nome: n[0].toUpperCase() + n.slice(1), rosto: face })
const resp = (id: string, author: string, text: string, extra: Partial<ForumReply> = {}): ForumReply => ({
  id: `ob_DEMO${id}`.padEnd(46, '0'), autor: rover(author), texto: text, criadoEm: '2026-11-05T10:00:00.000Z', em: null, cita: null, filhas: 0, resolveu: false, reacoes: { curtir: 0, util: 0 }, minhaReacao: null, ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open') })
})

const ctx = (extra: Partial<ThreadContext> = {}): ThreadContext => ({
  topico: TOP, resolvedId: null, autorDoTopico: rover('lumi').uid, myUid: rover('lumi').uid, roverName: 'Lumi', canWrite: true,
  responder: true, resolver: true, equipe: true, iAmModerator: false, ownerUid: rover('lumi').uid, ...extra,
})

describe('Thread: a one-level thread reply, with a quote', () => {
  const parent = resp('mae', 'pipa', 'Eu nomeio por data e por projeto.', { filhas: 2 })
  const f1 = resp('f1', 'nina', 'Funciona até o projeto mudar de nome.', { em: parent.id })
  const f2 = resp('f2', 'max', 'Por isso uso a data primeiro.', { em: parent.id, cita: { id: f1.id, autor: rover('nina'), trecho: 'Funciona até o projeto mudar de nome.' } })

  it('shows the child replies inside a "see N replies" and the quote as a block', () => {
    render(<Thread respostas={[parent]} filhas={{ [parent.id]: [f1, f2] }} c={ctx()} d={d} lang="pt" agora={NOW} />)
    expect(screen.getByText('Ver 2 respostas')).toBeInTheDocument()
    const block = screen.getByText('Citando Nina').closest('blockquote')!
    expect(within(block).getByText('Funciona até o projeto mudar de nome.')).toBeInTheDocument()
  })
  it('the quote of a removed reply shows the notice instead of the excerpt', () => {
    const g = resp('g', 'max', 'Concordo.', { em: parent.id, cita: { id: 'ob_DEMOsumiu', autor: rover('nina'), trecho: null } })
    render(<Thread respostas={[parent]} filhas={{ [parent.id]: [f1, g] }} c={ctx()} d={d} lang="pt" agora={NOW} />)
    expect(screen.getByText('A resposta citada foi removida.')).toBeInTheDocument()
  })
  it('the reply that solved gets the mark, and opens the children for it to appear', () => {
    const { container } = render(<Thread respostas={[parent]} filhas={{ [parent.id]: [f1, f2, resp('f3', 'seixo', 'Resolvido assim.', { em: parent.id })] }} c={ctx({ resolvedId: f2.id })} d={d} lang="pt" agora={NOW} />)
    expect(container.querySelector('.reply.solved')).not.toBeNull()
    expect(container.querySelector('details.children')).toHaveAttribute('open')
  })
  it('on others\' replies: report and remove (staff); on mine: delete, no report', () => {
    render(<Thread respostas={[resp('a', 'pipa', 'De outro.', { })]} filhas={{}} c={ctx()} d={d} lang="pt" agora={NOW} />)
    expect(screen.getByRole('button', { name: /Denunciar/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remover' })).toBeInTheDocument()
  })
  it('my reply: no report and no removal by moderation, with "Apagar a minha"', () => {
    render(<Thread respostas={[resp('m', 'lumi', 'Minha.')]} filhas={{}} c={ctx()} d={d} lang="pt" agora={NOW} />)
    expect(screen.queryByRole('button', { name: /Denunciar/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Apagar a minha/ })).toBeInTheDocument()
  })
  it('a moderator does not remove the owner\'s reply (the UI does not even offer it)', () => {
    render(<Thread respostas={[resp('d', 'lumi', 'Do dono.')]} filhas={{}} c={ctx({ myUid: rover('nina').uid, iAmModerator: true })} d={d} lang="pt" agora={NOW} />)
    expect(screen.queryByRole('button', { name: 'Remover' })).toBeNull()
  })
  it('locked topic: no "Responder" and with the reason', () => {
    render(<Thread respostas={[resp('a', 'pipa', 'Texto.')]} filhas={{}} c={ctx({ responder: false, replyReason: 'Tópico trancado: só a moderação responde.' })} d={d} lang="pt" agora={NOW} />)
    expect(screen.queryByRole('button', { name: 'Responder' })).toBeNull()
    expect(screen.getByText('Tópico trancado: só a moderação responde.')).toBeInTheDocument()
  })
  it('marking as the one that solved sends the gesture with the reply; once marked, the button undoes it (null reply)', async () => {
    const r = resp('a', 'pipa', 'Texto.')
    const { unmount } = render(<Thread respostas={[r]} filhas={{}} c={ctx()} d={d} lang="pt" agora={NOW} />)
    await userEvent.click(screen.getByRole('button', { name: /Marcar como a que resolveu/ }))
    expect(actAction).toHaveBeenCalledWith({ tipo: 'topico-resolvido', topico: TOP, resposta: r.id })
    unmount()
    render(<Thread respostas={[r]} filhas={{}} c={ctx({ resolvedId: r.id })} d={d} lang="pt" agora={NOW} />)
    await userEvent.click(screen.getByRole('button', { name: /Tirar a marca/ }))
    expect(actAction).toHaveBeenLastCalledWith({ tipo: 'topico-resolvido', topico: TOP, resposta: null })
  })
  it('the form to reply to a child explains that the reply goes to the one above and quotes', async () => {
    render(<Thread respostas={[parent]} filhas={{ [parent.id]: [f1, f2] }} c={ctx()} d={d} lang="pt" agora={NOW} />)
    const art = screen.getByText('Funciona até o projeto mudar de nome.', { selector: 'p' }).closest('article')!
    await userEvent.click(within(art).getByRole('button', { name: 'Responder' }))
    expect(screen.getByText(/resposta de segundo nível/)).toBeInTheDocument()
  })
})

describe('PollBlock: secret vote, no changing', () => {
  const poll = (extra: Partial<Poll> = {}): Poll => ({ opcoes: [{ texto: 'Desktop', votos: 3 }, { texto: 'Downloads', votos: 1 }], encerraEm: '2026-11-08T12:00:00.000Z', encerrada: false, total: 4, voce: null, ...extra })

  it('open and no vote: one button per option; after voting they disappear and the vote becomes yours', async () => {
    render(<PollBlock topico={TOP} e={poll()} canVote d={d} agora={NOW} />)
    expect(screen.getAllByRole('button', { name: /Votar nesta opção/ })).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: /Votar nesta opção.*Downloads/ }))
    expect(actAction).toHaveBeenCalledWith({ tipo: 'voto', topico: TOP, opcao: 1 })
    await waitFor(() => expect(screen.queryByRole('button', { name: /Votar/ })).toBeNull())
    expect(screen.getByText(/Seu voto/)).toBeInTheDocument()
    expect(screen.getByText(/5 votos/, { selector: 'p' })).toBeInTheDocument()
  })
  it('whoever already voted sees no vote button (no changing)', () => {
    render(<PollBlock topico={TOP} e={poll({ voce: 0 })} canVote d={d} agora={NOW} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('closed: only the result, with percentages', () => {
    render(<PollBlock topico={TOP} e={poll({ encerrada: true })} canVote d={d} agora={NOW} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText(/75%/)).toBeInTheDocument()
    expect(screen.getByText(/25%/)).toBeInTheDocument()
  })
  it('whoever cannot vote (outside, banned, newcomer) sees the result and why, with no button', () => {
    render(<PollBlock topico={TOP} e={poll()} canVote={false} d={d} agora={NOW} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText(/Só membros votam/)).toBeInTheDocument()
  })
})

describe('GestaoTopico: fixar, trancar, mover, remover', () => {
  const base = { topico: TOP, fixado: false, trancado: false, d }
  const origin = { id: 'ob_origem', acesso: 'aberta' as const, papel: 'moderador' as const }

  it('pin and lock send the right gesture; when they already are, the button undoes it', async () => {
    const { unmount } = render(<TopicManagement {...base} origem={origin} destinations={[]} canRemove />)
    await userEvent.click(screen.getByRole('button', { name: /Fixar no alto/ }))
    expect(actAction).toHaveBeenCalledWith({ tipo: 'topico-gestao', topico: TOP, acao: 'fixar', comunidade: null, categoria: null })
    await userEvent.click(screen.getByRole('button', { name: /Trancar/ }))
    expect(actAction).toHaveBeenLastCalledWith({ tipo: 'topico-gestao', topico: TOP, acao: 'trancar', comunidade: null, categoria: null })
    unmount()
    render(<TopicManagement {...base} fixado trancado origem={origin} destinations={[]} canRemove />)
    expect(screen.getByRole('button', { name: /Desafixar/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Destrancar/ })).toBeInTheDocument()
  })
  it('move only offers communities where the person is also staff, and never the origin itself', async () => {
    const destinations = [
      { id: 'ob_origem', nome: 'Origem', acesso: 'aberta' as const, papel: 'moderador' as const, categorias: [] },
      { id: 'ob_outra', nome: 'Outra', acesso: 'aberta' as const, papel: 'dono' as const, categorias: ['Dicas'] },
    ]
    render(<TopicManagement {...base} origem={origin} destinations={destinations} canRemove />)
    await userEvent.click(screen.getByRole('button', { name: /Mover para outra comunidade/ }))
    const s = screen.getByLabelText('Comunidade de destino')
    expect(within(s).getAllByRole('option').map((o) => o.textContent)).toEqual(['Outra'])
    await userEvent.click(screen.getByRole('button', { name: 'Mover' }))
    await waitFor(() => expect(actAction).toHaveBeenCalledWith({ tipo: 'topico-gestao', topico: TOP, acao: 'mover', comunidade: 'ob_outra', categoria: null }))
  })
  it('from closed to open, only the origin\'s owner can: a moderator does not even see the option', () => {
    const destinations = [{ id: 'ob_pub', nome: 'Pública', acesso: 'aberta' as const, papel: 'dono' as const, categorias: [] }]
    render(<TopicManagement {...base} origem={{ id: 'ob_fechada', acesso: 'fechada', papel: 'moderador' }} destinations={destinations} canRemove />)
    expect(screen.getByRole('button', { name: /Mover para outra comunidade/ })).toBeDisabled()
    expect(screen.getByText(/não modera outra comunidade/)).toBeInTheDocument()
  })
  it('the owner moves from closed to open, with the notice that it becomes public', async () => {
    const destinations = [{ id: 'ob_pub', nome: 'Pública', acesso: 'aberta' as const, papel: 'dono' as const, categorias: [] }]
    render(<TopicManagement {...base} origem={{ id: 'ob_fechada', acesso: 'fechada', papel: 'dono' }} destinations={destinations} canRemove />)
    await userEvent.click(screen.getByRole('button', { name: /Mover para outra comunidade/ }))
    expect(screen.getByText(/fica público no destino/)).toBeInTheDocument()
  })
  it('without permission to remove (the owner\'s content seen by a moderator), the remove button does not exist', () => {
    render(<TopicManagement {...base} origem={origin} destinations={[]} canRemove={false} />)
    expect(screen.queryByRole('button', { name: /Remover o tópico/ })).toBeNull()
  })
})
