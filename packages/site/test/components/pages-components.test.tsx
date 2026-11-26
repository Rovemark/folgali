import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NOW, pipa, post, lumi } from './help'

const { actAction, moreAction, reactAction, push } = vi.hoisted(() => ({
  actAction: vi.fn(async (...args: unknown[]) => { void args; return { ok: true as const } }),
  moreAction: vi.fn(async (...args: unknown[]) => { void args; return null as unknown }),
  reactAction: vi.fn(async () => ({ ok: true })),
  push: vi.fn(),
}))
vi.mock('@/app/social-actions', () => ({ actAction, moreAction, proposeAction: vi.fn(), markNoticesSeenAction: vi.fn() }))
vi.mock('@/app/actions', () => ({ reactAction, deleteAction: vi.fn(), followAction: vi.fn() }))
vi.mock('@/lib/rover/portrait', () => ({ portrait: vi.fn(async () => 'blob:x') }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }), usePathname: () => '/pt' }))

import FollowPageButton from '@/components/pages/FollowPageButton'
import UpdateCard from '@/components/pages/UpdateCard'
import PageCard from '@/components/pages/PageCard'
import TopicCardMini from '@/components/pages/TopicCardMini'
import Highlight from '@/components/pages/Highlight'
import ManagePage from '@/components/pages/ManagePage'
import MixedTimeline from '@/components/pages/MixedTimeline'
import SearchList from '@/components/pages/SearchList'
import { LogEntryItem } from '@/components/pages/LogList'
import { dict } from '@/lib/i18n'
import type { Update, PageCardData, ProjectPage, ModerationLog, TopicCardData } from '@/lib/social/types'

const d = dict('pt')
const PAGE = 'ob_DEMOgnuvens00000000000000000000000000000000'
const UPD = 'ob_DEMOatmapa1000000000000000000000000000000'

beforeEach(() => {
  vi.clearAllMocks()
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open') })
})

const card = (extra: Partial<PageCardData> = {}): PageCardData => ({ id: PAGE, nome: 'Caçadores de Nuvens', descricao: 'Diário de quem caça nuvem com cara de bicho.', tema: 'nuvens', dono: pipa, seguidores: 149, criadaEm: '2026-10-13T10:00:00.000Z', atividadeEm: '2026-11-04T14:00:00.000Z', ...extra })
const upd = (extra: Partial<Update> = {}): Update => ({ id: UPD, pagina: PAGE, pageName: 'Caçadores de Nuvens', autor: pipa, titulo: 'Excursão 7', texto: 'Mapa feito, falei com @seixo e vi https://exemplo.com/mapa #mapas', tags: ['mapas'], criadaEm: '2026-11-04T13:00:00.000Z', reacoes: { curtir: 8, util: 4 }, minhaReacao: null, ...extra })

describe('CartaoPagina', () => {
  it('shows the name, the theme, the owner and the followers, and the whole card leads to the page', () => {
    render(<PageCard p={card()} d={d} lang="pt" agora={NOW} />)
    expect(screen.getByRole('heading', { name: 'Caçadores de Nuvens' })).toBeInTheDocument()
    expect(screen.getByText('#nuvens')).toBeInTheDocument()
    expect(screen.getByText('de Pipa')).toBeInTheDocument()
    expect(screen.getByText('149 seguidores')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Caçadores de Nuvens' })).toHaveAttribute('href', `/pt/paginas/${PAGE}`)
  })
  it('marks the searched term without HTML, even if the name tries to inject', () => {
    const { container } = render(<PageCard p={card({ nome: 'Mapa <img src=x onerror=alert(1)>' })} d={d} lang="pt" agora={NOW} termo="mapa" />)
    expect(container.querySelector('mark')?.textContent).toBe('Mapa')
    // the page emblem is a photo; what cannot exist is the image injected by the name
    expect(container.querySelector('img[src="x"]')).toBeNull()
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>')
  })
  it('shows the person\'s relation to the page when it comes', () => {
    render(<PageCard p={card()} d={d} lang="pt" agora={NOW} relacao="administrador" />)
    expect(screen.getByText('Administra')).toBeInTheDocument()
  })
})

describe('UpdateCard: the menu changes with the viewer\'s role', () => {
  const items = () => screen.getAllByRole('button').map((b) => (b.textContent ?? '').trim())
  it('the author can only delete their own update (and does not report themselves)', () => {
    render(<UpdateCard a={upd()} d={d} lang="pt" agora={NOW} myUid={pipa.uid} />)
    expect(items()).toContain('Apagar a minha atualização')
    expect(items()).not.toContain('Denunciar')
    expect(items()).not.toContain('Remover da página')
  })
  it('the page owner removes another\'s and can also report', () => {
    render(<UpdateCard a={upd()} d={d} lang="pt" agora={NOW} myUid={lumi.uid} iAmPageOwner />)
    expect(items()).toContain('Remover da página')
    expect(items()).toContain('Denunciar')
    expect(items()).not.toContain('Apagar a minha atualização')
  })
  it('any other person can only report', () => {
    render(<UpdateCard a={upd()} d={d} lang="pt" agora={NOW} myUid={lumi.uid} />)
    expect(items().filter((t) => ['Denunciar', 'Remover da página', 'Apagar a minha atualização'].includes(t ?? ''))).toEqual(['Denunciar'])
  })
  it('draws mention, tag and link the way the social text dictates, and the whole domain appears', () => {
    render(<UpdateCard a={upd()} d={d} lang="pt" agora={NOW} myUid={lumi.uid} />)
    expect(screen.getByRole('link', { name: '@seixo' })).toHaveAttribute('href', '/pt/r/seixo')
    expect(screen.getByRole('link', { name: /exemplo\.com/ })).toHaveAttribute('href', 'https://exemplo.com/mapa')
    expect(screen.getAllByRole('link', { name: /mapas/ })[0]).toHaveAttribute('href', `/pt/buscar?q=${encodeURIComponent('#mapas')}`)
  })
  it('in the line shows which page it came from', () => {
    render(<UpdateCard a={upd()} d={d} lang="pt" agora={NOW} withPage inThread />)
    expect(screen.getByRole('link', { name: /Caçadores de Nuvens/ })).toHaveAttribute('href', `/pt/paginas/${PAGE}`)
  })
  it('deleting asks for confirmation and then sends remocao-pelo-autor', async () => {
    render(<UpdateCard a={upd()} d={d} lang="pt" agora={NOW} myUid={pipa.uid} />)
    await userEvent.click(screen.getByRole('button', { name: 'Apagar a minha atualização' }))
    expect(actAction).not.toHaveBeenCalled()
    const dlg = screen.getByRole('dialog')
    await userEvent.click(within(dlg).getByRole('button', { name: 'Apagar' }))
    expect(actAction).toHaveBeenCalledWith({ tipo: 'remocao-pelo-autor', alvo: UPD })
  })
  it('the owner removes with a reason from the list and the reason goes in the act', async () => {
    render(<UpdateCard a={upd()} d={d} lang="pt" agora={NOW} myUid={lumi.uid} iAmPageOwner />)
    await userEvent.click(screen.getByRole('button', { name: 'Remover da página' }))
    const dlg = screen.getByRole('dialog')
    await userEvent.click(within(dlg).getByLabelText('Contra as regras da casa'))
    await userEvent.click(within(dlg).getByRole('button', { name: 'Remover' }))
    expect(actAction).toHaveBeenCalledWith({ tipo: 'remocao-por-responsavel', alvo: UPD, motivo: 'regras' })
  })
  it('the report carries only the target and the reason, nothing about who reports', async () => {
    render(<UpdateCard a={upd()} d={d} lang="pt" agora={NOW} myUid={lumi.uid} />)
    await userEvent.click(screen.getByRole('button', { name: 'Denunciar' }))
    const dlg = screen.getByRole('dialog')
    await userEvent.click(within(dlg).getByRole('button', { name: 'Enviar denúncia' }))
    expect(actAction).toHaveBeenCalledWith({ tipo: 'denuncia', alvo: UPD, motivo: 'spam' })
  })
})

describe('BotaoSeguirPagina', () => {
  it('following sends pagina-seguir/seguir; already following sends deixar', async () => {
    const { rerender } = render(<FollowPageButton pagina={PAGE} segue={false} d={d} />)
    await userEvent.click(screen.getByRole('button', { name: 'Seguir' }))
    expect(actAction).toHaveBeenLastCalledWith({ tipo: 'pagina-seguir', pagina: PAGE, acao: 'seguir' })
    rerender(<FollowPageButton pagina={PAGE} segue d={d} />)
    const b = screen.getByRole('button', { name: 'Seguindo' })
    expect(b).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(b)
    expect(actAction).toHaveBeenLastCalledWith({ tipo: 'pagina-seguir', pagina: PAGE, acao: 'deixar' })
  })
  it('shows the reason when the relay refuses', async () => {
    actAction.mockResolvedValueOnce({ ok: false, codigo: 'limite-de-estrutura' } as never)
    render(<FollowPageButton pagina={PAGE} segue={false} d={d} />)
    await userEvent.click(screen.getByRole('button', { name: 'Seguir' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('limite de itens')
  })
})

describe('ManagePage: owner and administrator do not touch the same things', () => {
  const page = (): ProjectPage => ({ ...card(), administradores: [{ ...pipa, uid: 'rvr_DEMOseixo00000000000', handle: 'seixo', nome: 'Seixo' }], voce: { segue: false, papel: 'dono' } })
  const friend = { ...pipa, uid: 'rvr_DEMOnina000000000000', handle: 'nina', nome: 'Nina' }
  it('the owner sees remove administrator, invite a friend and delete the page', () => {
    render(<ManagePage p={page()} d={d} lang="pt" papel="dono" candidates={[friend]} canWrite />)
    expect(screen.getByRole('button', { name: 'Tirar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chamar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apagar a página' })).toBeInTheDocument()
  })
  it('the administrator edits the data, but does not manage administrators or delete the page', () => {
    render(<ManagePage p={page()} d={d} lang="pt" papel="administrador" candidates={[friend]} canWrite />)
    expect(screen.getByRole('button', { name: 'Pedir a mudança' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tirar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Chamar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Apagar a página' })).toBeNull()
    expect(screen.getByText(/só da dona ou do dono/i)).toBeInTheDocument()
  })
  it('chamar administrador manda o amigo escolhido', async () => {
    render(<ManagePage p={page()} d={d} lang="pt" papel="dono" candidates={[friend]} canWrite />)
    await userEvent.click(screen.getByRole('button', { name: 'Chamar' }))
    expect(actAction).toHaveBeenCalledWith({ tipo: 'pagina-gestao', pagina: PAGE, alvo: friend.uid, acao: 'adicionar-admin' })
  })
  it('deleting the page asks for confirmation, sends remocao-pelo-autor of the PAGE and returns to the list', async () => {
    render(<ManagePage p={page()} d={d} lang="pt" papel="dono" candidates={[]} canWrite />)
    await userEvent.click(screen.getByRole('button', { name: 'Apagar a página' }))
    expect(actAction).not.toHaveBeenCalled()
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Apagar a página' }))
    expect(actAction).toHaveBeenCalledWith({ tipo: 'remocao-pelo-autor', alvo: PAGE })
    await waitFor(() => expect(push).toHaveBeenCalledWith('/pt/paginas'))
  })
  it('without a friend to invite, explains why instead of showing an empty list', () => {
    render(<ManagePage p={page()} d={d} lang="pt" papel="dono" candidates={[]} canWrite />)
    expect(screen.getByText(/precisa ser sua amiga/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Chamar' })).toBeNull()
  })
  it('without the paired app the form is read-only', () => {
    render(<ManagePage p={page()} d={d} lang="pt" papel="dono" candidates={[]} canWrite={false} />)
    expect(screen.getByRole('button', { name: 'Pedir a mudança' })).toBeDisabled()
  })
})

describe('LinhaMista', () => {
  const posts = Array.from({ length: 5 }, (_, i) => ({ tipo: 'postagem' as const, postagem: post({ id: `ob_DEMOp0${i}000000000000000000000000000000000000`, texto: `Postagem número ${i}` }) }))
  it('mixes post and update in the order received, with the page name', () => {
    render(<MixedTimeline initial={{ itens: [posts[0], { tipo: 'atualizacao', atualizacao: upd() }, posts[1]] }} d={d} lang="pt" agora={NOW} />)
    const texts = screen.getAllByRole('article').map((a) => a.textContent ?? '')
    expect(texts[0]).toContain('Postagem número 0')
    expect(texts[1]).toContain('Excursão 7')
    expect(texts[2]).toContain('Postagem número 1')
    expect(screen.getByText('Página')).toBeInTheDocument()
  })
  it('the suggestions come in after the fourth item, only once', () => {
    render(<MixedTimeline initial={{ itens: posts }} d={d} lang="pt" agora={NOW} sugestoes={<aside>SUGESTÕES</aside>} />)
    const all = [...document.querySelectorAll('.row-item')]
    expect(screen.getAllByText('SUGESTÕES')).toHaveLength(1)
    expect(all[3].textContent).toContain('SUGESTÕES')
    expect(all[2].textContent).not.toContain('SUGESTÕES')
  })
  it('"Ver mais" asks for the mixed line\'s next page and joins without repeating', async () => {
    moreAction.mockResolvedValueOnce({ itens: [posts[4], posts[1]], proximo: undefined })
    render(<MixedTimeline initial={{ itens: [posts[0], posts[1]], proximo: 'c1' }} d={d} lang="pt" agora={NOW} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ver mais' }))
    expect(moreAction).toHaveBeenCalledWith({ lista: 'linhaMista', de: undefined, opcoes: undefined, cursor: 'c1' })
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3))
    expect(screen.queryByRole('button', { name: 'Ver mais' })).toBeNull()
  })
  it('a failure to load more shows the notice and lets you try again', async () => {
    moreAction.mockResolvedValueOnce(null)
    render(<MixedTimeline initial={{ itens: [posts[0]], proximo: 'c1' }} d={d} lang="pt" agora={NOW} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ver mais' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver mais' })).toBeEnabled()
  })
})

describe('ListaBusca', () => {
  const topic: TopicCardData = { id: 'ob_DEMOtcinemapipoca00000000000000000000000000', comunidade: 'ob_DEMOccinema00000000000000000000000000000000', comunidadeNome: 'Cinema de Sofá', categoria: null, titulo: 'Nome de backup', trecho: 'Tenho pastas', autor: pipa, criadoEm: '2026-11-04T10:00:00.000Z', atividadeEm: '2026-11-04T10:00:00.000Z', respostas: 3, fixado: false, trancado: false, resolvido: true, tags: [], enquete: false, editado: false }
  it('each type continues through its own list, with the term as the target', async () => {
    moreAction.mockResolvedValueOnce({ itens: [], proximo: undefined })
    render(<SearchList tipo="topicos" initial={{ itens: [topic], proximo: '10' }} termo="backup" d={d} lang="pt" agora={NOW} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ver mais' }))
    expect(moreAction).toHaveBeenCalledWith({ lista: 'buscaTopicos', de: 'backup', opcoes: undefined, cursor: '10' })
  })
  it('the topic shows where it lives and that it was solved', () => {
    render(<TopicCardMini t={topic} d={d} lang="pt" agora={NOW} />)
    expect(screen.getByRole('link', { name: 'Cinema de Sofá' })).toHaveAttribute('href', `/pt/comunidades/${topic.comunidade}`)
    expect(screen.getByText('Resolvido')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Nome de backup' })).toHaveAttribute('href', `/pt/t/${topic.id}`)
  })
})

describe('Destaque', () => {
  it('marks only what matches', () => {
    const { container } = render(<p><Highlight texto="Cinema de Sofá" termo="sof" /></p>)
    expect([...container.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['Sof'])
    expect(container.textContent).toBe('Cinema de Sofá')
  })
})

describe('ItemRegistro', () => {
  const x: ModerationLog = { id: 'r1', em: '2026-11-04T10:00:00.000Z', escopo: 'rele', contexto: null, acao: 'remocao', alvoTipo: 'topico', alvo: 'ob_DEMOxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', motivo: 'dados-pessoais', por: 'rele', apelacao: 'aberta' }
  it('shows what was done, the reason, the role and the appeal, and never a removed text', () => {
    render(<ol><LogEntryItem x={x} d={d} lang="pt" agora={NOW} /></ol>)
    expect(screen.getByText('Conteúdo removido')).toBeInTheDocument()
    expect(screen.getByText('Dado pessoal de alguém')).toBeInTheDocument()
    expect(screen.getByText(/o relé/)).toBeInTheDocument()
    expect(screen.getByText('Apelação aberta')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })
  it('expulsion and ban show the rover, not an id', () => {
    render(<ol><LogEntryItem x={{ ...x, acao: 'banimento', alvoTipo: null, alvo: { ...pipa }, por: 'moderador', apelacao: null }} d={d} lang="pt" agora={NOW} /></ol>)
    expect(screen.getByText('Rover banido')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Pipa/ })).toHaveAttribute('href', '/pt/r/pipa')
  })
})
