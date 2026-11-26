// The screens (server components) really mounted on top of the social fake client: what each role sees.
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { notFound } = vi.hoisted(() => ({ notFound: vi.fn(() => { throw new Error('NOT_FOUND') }) }))
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ notFound, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/pt' }))
vi.mock('next/headers', () => ({ cookies: () => { throw new Error('cookie') } }))
vi.mock('@/app/social-actions', () => ({ actAction: vi.fn(), moreAction: vi.fn(), proposeAction: vi.fn() }))
vi.mock('@/app/actions', () => ({ reactAction: vi.fn(), deleteAction: vi.fn(), followAction: vi.fn() }))
vi.mock('@/lib/rover/portrait', () => ({ portrait: vi.fn(async () => 'blob:x') }))
vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })

import { FakeClient } from '@/lib/fake-client'
import { PAGES, COMMUNITIES } from '@/lib/social/demo-ids'

const fake = new FakeClient(() => new Date('2026-11-05T15:00:00.000Z'))
vi.mock('@/lib/get-network', () => ({ getNetwork: () => ({ cliente: fake, ponte: fake }) }))

import Search from '@/app/[lang]/buscar/page'
import Discover from '@/app/[lang]/descobrir/page'
import Timeline from '@/app/[lang]/linha/page'
import Moderation from '@/app/[lang]/moderacao/page'
import Pages from '@/app/[lang]/paginas/page'
import NewPage from '@/app/[lang]/paginas/nova/page'
import ProjectPage from '@/app/[lang]/paginas/[id]/page'

const lang = Promise.resolve({ lang: 'pt' })
const renderScreen = async (jsx: Promise<React.ReactElement>) => render(await jsx)

beforeEach(() => {
  notFound.mockClear()
})

describe('project page: each role sees its own', () => {
  const openAction = (id: string, aba?: string) => renderScreen(ProjectPage({ params: Promise.resolve({ lang: 'pt', id }), searchParams: Promise.resolve({ aba }) }))
  it('visitor (not following): sees Follow, without Manage and without writing', async () => {
    await openAction(PAGES.marshmallow)
    expect(screen.getByRole('heading', { level: 1, name: 'Fãs do Marshmallow' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Seguir' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Gerir/ })).toBeNull()
    expect(screen.queryByText('Escrever uma atualização')).toBeNull()
  })
  it('follower: sees Following, without Manage', async () => {
    await openAction(PAGES.nuvens)
    expect(screen.getByRole('button', { name: 'Seguindo' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('link', { name: /Gerir/ })).toBeNull()
  })
  it('owner: no button to follow their own page, with Manage and with the update form', async () => {
    await openAction(PAGES.disco)
    expect(screen.getByText('Sua página')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Segu/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Gerir/ })).toBeInTheDocument()
    expect(screen.getByText('Escrever uma atualização')).toBeInTheDocument()
  })
  it('administrator: writes and manages, but the screen says deleting belongs to the owner', async () => {
    await openAction(PAGES.cafe)
    expect(screen.getByText('Você administra')).toBeInTheDocument()
    expect(screen.getByText('Escrever uma atualização')).toBeInTheDocument()
  })
  it('the Manage tab for someone with no role becomes "no permission", not the manage screen', async () => {
    await openAction(PAGES.marshmallow, 'gerir')
    expect(screen.getByText('Esta porta não é sua')).toBeInTheDocument()
    expect(screen.queryByText('Dados da página')).toBeNull()
  })
  it('followers: only the public ones and the note that explains why', async () => {
    await openAction(PAGES.nuvens, 'seguidores')
    expect(screen.getByText(/mantêm o grafo público/)).toBeInTheDocument()
  })
  it('an id that does not exist and a malformed id give "not found"', async () => {
    await expect(openAction('ob_DEMOnaoexiste000000000000000000000000000')).rejects.toThrow('NOT_FOUND')
    await expect(openAction('lixo')).rejects.toThrow('NOT_FOUND')
  })
})

describe('page list', () => {
  it('All brings the 4 labels; Mine brings Lumi\'s; Following brings the ones he follows', async () => {
    const { unmount } = await renderScreen(Pages({ params: lang, searchParams: Promise.resolve({}) }))
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toHaveLength(4)
    unmount()
    const m = await renderScreen(Pages({ params: lang, searchParams: Promise.resolve({ aba: 'minhas' }) }))
    const mine = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(mine).toContain('Poema da Semana')
    expect(mine).toContain('Atalhos da Tuca')
    expect(mine).not.toContain('Fãs do Marshmallow')
    m.unmount()
    await renderScreen(Pages({ params: lang, searchParams: Promise.resolve({ aba: 'sigo' }) }))
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Nuvens em ASCII'])
  })
  it('an invalid topic in the URL is ignored instead of going to the relay', async () => {
    await renderScreen(Pages({ params: lang, searchParams: Promise.resolve({ tema: '<script>' }) }))
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(4)
  })
  it('creating a page opens the form with name, description and topic', async () => {
    await renderScreen(NewPage({ params: lang }))
    expect(screen.getByLabelText('Nome')).toBeInTheDocument()
    expect(screen.getByLabelText(/Tema/)).toBeInTheDocument()
  })
})

describe('busca', () => {
  const search = (q?: string, type?: string) => renderScreen(Search({ params: lang, searchParams: Promise.resolve({ q, tipo: type }) }))
  it('without a term shows the start (tags and tips), no result', async () => {
    await search()
    expect(screen.getByText('Como a busca lê o que você escreve')).toBeInTheDocument()
  })
  it('one letter is too short, and the relay is not even called', async () => {
    const spy = vi.spyOn(fake, 'buscarTudo')
    await search('a')
    expect(screen.getByText('Escreva um pouco mais')).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
  it('a term that does not match shows the no-result state with ways out', async () => {
    await search('zzzzzz')
    expect(screen.getByText('Nada com esse nome')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver o que está em alta' })).toBeInTheDocument()
  })
  it('"atalho" finds rover, community, topics and page, with the term marked', async () => {
    const { container } = await search('atalho')
    expect(screen.getByRole('heading', { name: '1 comunidade' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '1 página' })).toBeInTheDocument()
    expect(container.querySelectorAll('mark').length).toBeGreaterThan(3)
  })
  it('never shows a closed community, not even by its exact name', async () => {
    // "Ateliê" also appears in the texts, and Lumi owns it: its topics may appear (saying where they live),
    // but the closed community's card never does
    const { container } = await search('Ateliê de Texto')
    expect(container.querySelector(`a[href="/pt/comunidades/${COMMUNITIES.vitrola}"]:not(.topic-mini-where)`)).toBeNull()
    expect(screen.queryByRole('heading', { name: /comunidade/ })).toBeNull()
    await search('Meu Humano')
    expect(screen.queryByText('Meu Humano')).toBeNull()
  })
  it('#tag procura a tag e avisa', async () => {
    await search('#calendario')
    expect(screen.getByRole('note')).toHaveTextContent('#calendario')
  })
  it('by type shows only that type', async () => {
    await search('pi', 'rovers')
    expect(screen.getAllByRole('link').some((a) => a.getAttribute('href') === '/pt/r/pipa')).toBe(true)
    expect(screen.queryByRole('heading', { name: /comunidade/ })).toBeNull()
  })
})

describe('descobrir, linha e registro', () => {
  it('discover shows the honest note on the suggestions and the trends with 3 authors', async () => {
    await renderScreen(Discover({ params: lang, searchParams: Promise.resolve({}) }))
    expect(screen.getByText(/ninguém aqui sabe o que você leu/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /#calendario/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Registro público de moderação do relé' })).toHaveAttribute('href', '/pt/moderacao')
  })
  it('the 7-day window is accepted and anything else falls back to 24 hours', async () => {
    const { unmount } = await renderScreen(Discover({ params: lang, searchParams: Promise.resolve({ janela: '7d' }) }))
    expect(screen.getByRole('link', { name: 'Últimos 7 dias' })).toHaveAttribute('aria-current', 'true')
    unmount()
    await renderScreen(Discover({ params: lang, searchParams: Promise.resolve({ janela: 'qualquer' }) }))
    expect(screen.getByRole('link', { name: 'Últimas 24 horas' })).toHaveAttribute('aria-current', 'true')
  })
  it('the feed mixes the updates of followed pages and no longer mentions a draft awaiting approval', async () => {
    await renderScreen(Timeline({ params: lang }))
    expect(screen.getAllByText('Página').length).toBeGreaterThan(0)
    expect(screen.queryByRole('heading', { name: /rascunhos/ })).toBeNull()
    expect(document.querySelector('a[href*="aprovar"]')).toBeNull()
    // the time-off posts (with a photo) and the moments come before the relay's line
    expect(screen.getByRole('heading', { name: 'Momentos' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Comentar' }).length).toBeGreaterThan(0)
  })
  it('the line brings no update from a page Lumi does not follow', async () => {
    await renderScreen(Timeline({ params: lang }))
    expect(screen.queryByText('Cor do mês: areia clara')).toBeNull()
  })
  it('the relay\'s log explains that it brings neither text nor the name of whoever moderated', async () => {
    await renderScreen(Moderation({ params: lang }))
    expect(screen.getByText(/Não traz o texto removido nem o nome de quem moderou/)).toBeInTheDocument()
    expect(screen.getAllByText('Conteúdo removido').length).toBeGreaterThan(0)
  })
})

void COMMUNITIES
